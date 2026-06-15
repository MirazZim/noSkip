-- ============================================================
-- Persona Shift
--
-- Identity-based rules ("Stay in control when provoked") tracked
-- with the EXISTING habit engine. Rather than a parallel table,
-- persona rules are habit rows discriminated by `category`, so the
-- habit_completions table, streak logic, check-off, and reorder
-- (sort_order) are all shared with zero duplication.
--
-- Streaks are intentionally NOT stored — they are derived from
-- habit_completions, exactly like habits.
-- ============================================================


-- ─── 1. Discriminator + AI coach-reaction columns ─────────────────────────────
-- category   : 'habit' (existing rows, via DEFAULT) | 'persona_shift'
-- coach_note : the AI's one-line reaction, persisted so it survives reloads
-- flag_level : result of the creation/edit-time check

ALTER TABLE public.habits
  ADD COLUMN category   TEXT NOT NULL DEFAULT 'habit',
  ADD COLUMN coach_note TEXT,
  ADD COLUMN flag_level TEXT NOT NULL DEFAULT 'none';

-- Guard the small enums at the DB layer
ALTER TABLE public.habits
  ADD CONSTRAINT habits_category_check
    CHECK (category IN ('habit', 'persona_shift')),
  ADD CONSTRAINT habits_flag_level_check
    CHECK (flag_level IN ('healthy', 'caution', 'none'));

-- Fast per-user lookups split by section (Habits page vs Persona page)
CREATE INDEX idx_habits_user_category ON public.habits(user_id, category);


-- ─── 2. Keep persona rules out of the habit-analytics view ────────────────────
-- Restated verbatim from 20260508090000 with ONE change: habits_active now
-- also requires category = 'habit', so persona rules never leak into the
-- AI habit-coaching insights (persona analytics are out of scope for now).

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
    AND category  = 'habit'
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
rn_completions AS (
  SELECT
    habit_id,
    date,
    ROW_NUMBER() OVER (PARTITION BY habit_id ORDER BY date) AS rn
  FROM completions_30d
),
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
