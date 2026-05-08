
-- ============================================================
-- Step 3 — AI Aggregation Views
--
-- security_invoker = true: the calling role's RLS policies
-- apply to every underlying table access.
--   • Authenticated users  → see only their own rows
--   • Edge Functions (service_role) → bypass RLS, see all rows
-- ============================================================


-- ─── View 1: ai_expense_summary ───────────────────────────────────────────────
-- Monthly spending totals per user per category.
-- Full history (no date cutoff) so the AI can compare months.

CREATE OR REPLACE VIEW public.ai_expense_summary
WITH (security_invoker = true) AS
SELECT
  user_id,
  DATE_TRUNC('month', date)::DATE    AS month,
  category,
  SUM(amount)                         AS total_amount,
  COUNT(*)                            AS transaction_count,
  ROUND(AVG(amount)::NUMERIC, 2)      AS avg_per_transaction
FROM public.expenses
GROUP BY user_id, DATE_TRUNC('month', date), category;

GRANT SELECT ON public.ai_expense_summary TO authenticated, service_role;


-- ─── View 2: ai_habit_summary ─────────────────────────────────────────────────
-- Per-habit consistency and streak metrics, last 30 days.
--
-- custom_days stores 3-letter abbreviations: 'Mon','Tue','Wed','Thu','Fri','Sat','Sun'
-- (set by AddHabitDialog / EditHabitDialog; matched here via TO_CHAR(date, 'Dy')).
--
-- Streak algorithm: gaps-and-islands.
--   For consecutive dates, (date - ROW_NUMBER()) is constant → same group.
--   Grouping by that constant gives one row per streak island.

CREATE OR REPLACE VIEW public.ai_habit_summary
WITH (security_invoker = true) AS
WITH
habits_active AS (
  SELECT
    id             AS habit_id,
    user_id,
    name           AS habit_name,
    frequency_type AS frequency,
    custom_days,
    start_date
  FROM public.habits
  WHERE is_active = true
),
-- How many days in the last 30 was the habit *expected* to be done?
possible_count AS (
  SELECT
    ha.habit_id,
    CASE
      WHEN ha.frequency = 'daily' THEN
        GREATEST(0, LEAST(30, CURRENT_DATE - ha.start_date + 1))::integer
      ELSE
        -- 'custom': count days in window whose 3-letter name is in custom_days
        COALESCE((
          SELECT COUNT(*)::integer
          FROM generate_series(
            GREATEST(CURRENT_DATE - 29, ha.start_date),
            CURRENT_DATE,
            '1 day'::interval
          ) AS gs(day)
          WHERE TO_CHAR(gs.day, 'Dy') = ANY(ha.custom_days)
        ), 0)
    END AS total_possible_completions
  FROM habits_active ha
),
completions_30d AS (
  SELECT habit_id, date
  FROM   public.habit_completions
  WHERE  date >= CURRENT_DATE - 29
    AND  date <= CURRENT_DATE
),
actual_count AS (
  SELECT habit_id, COUNT(*) AS actual_completions
  FROM   completions_30d
  GROUP  BY habit_id
),
-- Assign a row number per habit ordered by date (ASC) for the islands formula
rn_completions AS (
  SELECT
    habit_id,
    date,
    ROW_NUMBER() OVER (PARTITION BY habit_id ORDER BY date) AS rn
  FROM completions_30d
),
-- date - rn is the same value for every row in a consecutive run → the "island key"
streak_groups AS (
  SELECT
    habit_id,
    date - CAST(rn AS integer) AS grp,
    date
  FROM rn_completions
),
streaks AS (
  SELECT
    habit_id,
    MIN(date)  AS streak_start,
    MAX(date)  AS streak_end,
    COUNT(*)   AS streak_length
  FROM streak_groups
  GROUP BY habit_id, grp
),
-- Current streak: the most recent island that ended today or yesterday
-- (yesterday allowed so a habit not yet done today still shows its streak)
current_streak_cte AS (
  SELECT DISTINCT ON (habit_id)
    habit_id,
    streak_length AS current_streak
  FROM   streaks
  WHERE  streak_end >= CURRENT_DATE - 1
  ORDER  BY habit_id, streak_end DESC
),
longest_streak_cte AS (
  SELECT habit_id, MAX(streak_length) AS longest_streak_last_30_days
  FROM   streaks
  GROUP  BY habit_id
)
SELECT
  ha.user_id,
  ha.habit_id,
  ha.habit_name,
  ha.frequency,
  pc.total_possible_completions,
  COALESCE(ac.actual_completions,                0)  AS actual_completions,
  CASE
    WHEN COALESCE(pc.total_possible_completions, 0) = 0 THEN 0::NUMERIC
    ELSE ROUND(
           COALESCE(ac.actual_completions, 0)::NUMERIC
           / pc.total_possible_completions * 100,
           1)
  END                                                AS consistency_score,
  COALESCE(cs.current_streak,                    0)  AS current_streak,
  COALESCE(ls.longest_streak_last_30_days,       0)  AS longest_streak_last_30_days
FROM habits_active             ha
LEFT JOIN possible_count       pc  ON pc.habit_id = ha.habit_id
LEFT JOIN actual_count         ac  ON ac.habit_id = ha.habit_id
LEFT JOIN current_streak_cte   cs  ON cs.habit_id = ha.habit_id
LEFT JOIN longest_streak_cte   ls  ON ls.habit_id = ha.habit_id;

GRANT SELECT ON public.ai_habit_summary TO authenticated, service_role;


-- ─── View 3: ai_financial_snapshot ────────────────────────────────────────────
-- Current-month vs prior-month income/expense summary per user.
-- all_users CTE unions across three tables so a user who has data in any
-- of them always appears (even with no expenses this month, etc.).

CREATE OR REPLACE VIEW public.ai_financial_snapshot
WITH (security_invoker = true) AS
WITH
curr_start AS (SELECT DATE_TRUNC('month', CURRENT_DATE)::DATE AS d),
prev_start AS (SELECT (DATE_TRUNC('month', CURRENT_DATE) - INTERVAL '1 month')::DATE AS d),
curr_expenses_by_cat AS (
  SELECT user_id, category, SUM(amount) AS cat_total
  FROM   public.expenses
  WHERE  date >= (SELECT d FROM curr_start)
    AND  date <  (SELECT d FROM curr_start) + INTERVAL '1 month'
  GROUP  BY user_id, category
),
curr_expenses_total AS (
  SELECT user_id, SUM(cat_total) AS total_expenses
  FROM   curr_expenses_by_cat
  GROUP  BY user_id
),
-- Pick the single highest-spend category for the current month
biggest_category AS (
  SELECT DISTINCT ON (user_id)
    user_id,
    category AS biggest_spending_category
  FROM   curr_expenses_by_cat
  ORDER  BY user_id, cat_total DESC
),
prev_expenses_total AS (
  SELECT user_id, SUM(amount) AS total_expenses
  FROM   public.expenses
  WHERE  date >= (SELECT d FROM prev_start)
    AND  date <  (SELECT d FROM curr_start)
  GROUP  BY user_id
),
curr_income_total AS (
  SELECT user_id, SUM(amount) AS total_income
  FROM   public.incomes
  WHERE  date >= (SELECT d FROM curr_start)
    AND  date <  (SELECT d FROM curr_start) + INTERVAL '1 month'
  GROUP  BY user_id
),
active_loans_agg AS (
  SELECT
    user_id,
    COUNT(*)    AS active_loans_count,
    SUM(amount) AS active_loans_total
  FROM  public.loans
  WHERE is_paid = false
  GROUP BY user_id
),
all_users AS (
  SELECT user_id FROM curr_expenses_total
  UNION
  SELECT user_id FROM curr_income_total
  UNION
  SELECT user_id FROM active_loans_agg
)
SELECT
  u.user_id,
  COALESCE(ci.total_income,   0)                          AS total_income,
  COALESCE(ce.total_expenses, 0)                          AS total_expenses,
  COALESCE(ci.total_income, 0)
    - COALESCE(ce.total_expenses, 0)                      AS net_savings,
  bc.biggest_spending_category,
  -- NULL when no prior-month data exists (e.g. first month of use)
  CASE
    WHEN COALESCE(pe.total_expenses, 0) = 0 THEN NULL
    ELSE ROUND(
           ((COALESCE(ce.total_expenses, 0) - pe.total_expenses)
            / pe.total_expenses * 100)::NUMERIC, 1)
  END                                                     AS month_over_month_expense_change,
  COALESCE(al.active_loans_count, 0)                      AS active_loans_count,
  COALESCE(al.active_loans_total, 0)                      AS active_loans_total
FROM all_users             u
LEFT JOIN curr_expenses_total ce  ON ce.user_id = u.user_id
LEFT JOIN prev_expenses_total pe  ON pe.user_id = u.user_id
LEFT JOIN curr_income_total   ci  ON ci.user_id = u.user_id
LEFT JOIN biggest_category    bc  ON bc.user_id = u.user_id
LEFT JOIN active_loans_agg    al  ON al.user_id = u.user_id;

GRANT SELECT ON public.ai_financial_snapshot TO authenticated, service_role;


-- ─── View 4: ai_budget_performance ────────────────────────────────────────────
-- Current-month budget vs actual spending per category, per user.
-- Budget is the anchor: only categories that have a budget row appear.
-- NULLIF guards against division-by-zero on a zero-amount budget row.

CREATE OR REPLACE VIEW public.ai_budget_performance
WITH (security_invoker = true) AS
WITH
curr_start AS (SELECT DATE_TRUNC('month', CURRENT_DATE)::DATE AS d),
curr_expenses_by_cat AS (
  SELECT user_id, category, SUM(amount) AS spent_amount
  FROM   public.expenses
  WHERE  date >= (SELECT d FROM curr_start)
    AND  date <  (SELECT d FROM curr_start) + INTERVAL '1 month'
  GROUP  BY user_id, category
),
curr_budgets AS (
  SELECT user_id, category, amount AS budget_amount
  FROM   public.budgets
  WHERE  month = (SELECT d FROM curr_start)
)
SELECT
  b.user_id,
  b.category,
  b.budget_amount,
  COALESCE(e.spent_amount, 0)                              AS spent_amount,
  b.budget_amount - COALESCE(e.spent_amount, 0)            AS remaining,
  ROUND(
    (COALESCE(e.spent_amount, 0)
     / NULLIF(b.budget_amount, 0) * 100)::NUMERIC, 1
  )                                                        AS utilization_percentage,
  CASE
    WHEN COALESCE(e.spent_amount, 0) >  b.budget_amount        THEN 'exceeded'
    WHEN COALESCE(e.spent_amount, 0) >  b.budget_amount * 0.8  THEN 'warning'
    ELSE 'on_track'
  END                                                      AS status
FROM curr_budgets b
LEFT JOIN curr_expenses_by_cat e
       ON e.user_id  = b.user_id
      AND e.category = b.category;

GRANT SELECT ON public.ai_budget_performance TO authenticated, service_role;
