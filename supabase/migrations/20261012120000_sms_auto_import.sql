-- ============================================================
-- SMS Auto-Import
--
-- Bank / MFS SMS are forwarded by the phone to the `ingest-sms`
-- edge function, which parses them into `sms_messages` and files
-- debits as `expenses` rows (origin = 'sms'). Each new merchant
-- starts as review_status = 'pending'; confirming teaches
-- `merchant_rules`, and after enough confirmations the merchant
-- is auto-filed as 'confirmed'.
--
-- The edge function writes with the service role. Users read and
-- review their own rows through RLS.
-- ============================================================


-- ─── 1. Raw + parsed SMS ──────────────────────────────────────────────────────
-- status: 'expense' — an expense row was created (see expense_id)
--         'review'  — needs a decision (credit, unclear, foreign currency)
--         'income'  — logged as income from the review inbox
--         'ignored' — dismissed (not an expense / own transfer)

CREATE TABLE public.sms_messages (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  raw_text      TEXT NOT NULL,
  sender        TEXT,
  provider      TEXT NOT NULL DEFAULT 'unknown',
  kind          TEXT NOT NULL DEFAULT 'unknown',
  direction     TEXT NOT NULL DEFAULT 'unknown',
  amount        NUMERIC,
  currency      TEXT NOT NULL DEFAULT 'BDT',
  fee           NUMERIC NOT NULL DEFAULT 0,
  merchant      TEXT,
  merchant_key  TEXT,
  is_person     BOOLEAN NOT NULL DEFAULT false,
  trx_id        TEXT,
  balance       NUMERIC,
  txn_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  dedup_hash    TEXT NOT NULL,
  status        TEXT NOT NULL DEFAULT 'review',
  expense_id    UUID REFERENCES public.expenses(id) ON DELETE SET NULL,
  income_id     UUID REFERENCES public.incomes(id)  ON DELETE SET NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT sms_messages_status_check
    CHECK (status IN ('expense', 'review', 'income', 'ignored')),
  CONSTRAINT sms_messages_direction_check
    CHECK (direction IN ('debit', 'credit', 'unknown'))
);

-- One SMS can trigger several phone automations — these two indexes are the
-- duplicate guard. TrxID when the SMS has one, a hash of the text otherwise.
CREATE UNIQUE INDEX sms_messages_user_trx_uidx
  ON public.sms_messages(user_id, trx_id) WHERE trx_id IS NOT NULL;
CREATE UNIQUE INDEX sms_messages_user_hash_uidx
  ON public.sms_messages(user_id, dedup_hash);
CREATE INDEX idx_sms_messages_user_status ON public.sms_messages(user_id, status);

ALTER TABLE public.sms_messages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view own sms" ON public.sms_messages FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can update own sms" ON public.sms_messages FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own sms" ON public.sms_messages FOR DELETE USING (auth.uid() = user_id);


-- ─── 2. Learned merchant → category rules ─────────────────────────────────────
-- pattern       : lower-case substring matched against the parsed merchant_key
-- action        : 'categorize' (file as expense) | 'ignore' (own transfers etc.)
-- confirm_count : consecutive confirmations of the same category
-- auto_confirm  : true once confirm_count reaches the threshold
-- always_ask    : never auto-confirm (people, shops that sell everything)

CREATE TABLE public.merchant_rules (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  pattern        TEXT NOT NULL,
  label          TEXT,
  category       TEXT NOT NULL DEFAULT 'other',
  action         TEXT NOT NULL DEFAULT 'categorize',
  confirm_count  INTEGER NOT NULL DEFAULT 0,
  auto_confirm   BOOLEAN NOT NULL DEFAULT false,
  always_ask     BOOLEAN NOT NULL DEFAULT false,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT merchant_rules_action_check CHECK (action IN ('categorize', 'ignore')),
  CONSTRAINT merchant_rules_pattern_check CHECK (length(trim(pattern)) > 0),
  UNIQUE (user_id, pattern)
);

ALTER TABLE public.merchant_rules ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view own merchant rules" ON public.merchant_rules FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own merchant rules" ON public.merchant_rules FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own merchant rules" ON public.merchant_rules FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own merchant rules" ON public.merchant_rules FOR DELETE USING (auth.uid() = user_id);


-- ─── 3. Provenance + review state on expenses / incomes ───────────────────────

ALTER TABLE public.expenses
  ADD COLUMN origin         TEXT NOT NULL DEFAULT 'manual',
  ADD COLUMN review_status  TEXT NOT NULL DEFAULT 'confirmed',
  ADD COLUMN sms_message_id UUID REFERENCES public.sms_messages(id) ON DELETE SET NULL,
  ADD CONSTRAINT expenses_origin_check CHECK (origin IN ('manual', 'sms')),
  ADD CONSTRAINT expenses_review_status_check CHECK (review_status IN ('pending', 'confirmed'));

CREATE INDEX idx_expenses_user_pending
  ON public.expenses(user_id) WHERE review_status = 'pending';

ALTER TABLE public.incomes
  ADD COLUMN origin         TEXT NOT NULL DEFAULT 'manual',
  ADD COLUMN sms_message_id UUID REFERENCES public.sms_messages(id) ON DELETE SET NULL;


-- ─── 4. Confirm + learn ───────────────────────────────────────────────────────
-- Called when the user confirms a pending SMS expense, and when they change
-- the category of any SMS expense later — so corrections teach it too.
--   same category as the rule  → confirm_count + 1 (auto at 3)
--   different category         → rule switches, confirm_count resets to 1
-- SECURITY INVOKER: RLS scopes every read/write to the caller.

CREATE OR REPLACE FUNCTION public.confirm_sms_expense(
  p_expense_id UUID,
  p_category   TEXT
) RETURNS public.merchant_rules
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  c_threshold CONSTANT INTEGER := 3;
  v_expense   public.expenses;
  v_sms       public.sms_messages;
  v_rule      public.merchant_rules;
BEGIN
  SELECT * INTO v_expense FROM public.expenses WHERE id = p_expense_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Expense not found';
  END IF;

  UPDATE public.expenses
     SET category = p_category, review_status = 'confirmed'
   WHERE id = p_expense_id;

  IF v_expense.sms_message_id IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT * INTO v_sms FROM public.sms_messages WHERE id = v_expense.sms_message_id;
  IF NOT FOUND OR v_sms.merchant_key IS NULL OR v_sms.merchant_key = '' THEN
    RETURN NULL;
  END IF;

  -- Longest matching pattern wins, same as the edge function's lookup
  SELECT * INTO v_rule
    FROM public.merchant_rules
   WHERE user_id = v_expense.user_id
     AND position(pattern IN v_sms.merchant_key) > 0
   ORDER BY length(pattern) DESC
   LIMIT 1;

  IF NOT FOUND THEN
    INSERT INTO public.merchant_rules (user_id, pattern, label, category, confirm_count, always_ask)
    VALUES (v_expense.user_id, v_sms.merchant_key, v_sms.merchant, p_category, 1, v_sms.is_person)
    RETURNING * INTO v_rule;
  ELSIF v_rule.category = p_category AND v_rule.action = 'categorize' THEN
    UPDATE public.merchant_rules
       SET confirm_count = confirm_count + 1,
           auto_confirm  = (confirm_count + 1 >= c_threshold) AND NOT always_ask,
           updated_at    = now()
     WHERE id = v_rule.id
    RETURNING * INTO v_rule;
  ELSE
    UPDATE public.merchant_rules
       SET category      = p_category,
           action        = 'categorize',
           confirm_count = 1,
           auto_confirm  = false,
           updated_at    = now()
     WHERE id = v_rule.id
    RETURNING * INTO v_rule;
  END IF;

  RETURN v_rule;
END;
$$;

GRANT EXECUTE ON FUNCTION public.confirm_sms_expense(UUID, TEXT) TO authenticated;
