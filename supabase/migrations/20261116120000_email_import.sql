-- Bank alert emails join SMS as an import source.
--
-- A Google Apps Script in the user's own Gmail forwards bank alert emails to
-- the ingest-sms edge function every few minutes (see docs/sms-auto-import.md).
-- Email is the reliable copy: it waits in the inbox while the phone is offline,
-- and it carries more (merchant, card, exact time) than some bank SMS.
--
-- The same card payment can arrive twice — once by SMS, once by email. The
-- second one is stored with status 'duplicate' and duplicate_of → the first,
-- and files no expense. If it knows the merchant and the first didn't, the
-- function copies the merchant onto the first row and its pending expense.

ALTER TABLE public.sms_messages
  ADD COLUMN source       TEXT NOT NULL DEFAULT 'sms',
  ADD COLUMN card_last4   TEXT,
  ADD COLUMN duplicate_of UUID REFERENCES public.sms_messages(id) ON DELETE SET NULL,
  ADD CONSTRAINT sms_messages_source_check CHECK (source IN ('sms', 'email')),
  ADD CONSTRAINT sms_messages_card_last4_check CHECK (card_last4 IS NULL OR card_last4 ~ '^\d{4}$');

ALTER TABLE public.sms_messages DROP CONSTRAINT sms_messages_status_check;
ALTER TABLE public.sms_messages
  ADD CONSTRAINT sms_messages_status_check
    CHECK (status IN ('expense', 'review', 'income', 'ignored', 'duplicate'));

-- Twin lookup: same user and amount, other source, around the same time
CREATE INDEX idx_sms_messages_user_amount_txn
  ON public.sms_messages(user_id, amount, txn_at)
  WHERE status <> 'duplicate';

-- Each message can be the twin of at most one other
CREATE UNIQUE INDEX sms_messages_duplicate_of_uidx
  ON public.sms_messages(duplicate_of) WHERE duplicate_of IS NOT NULL;
