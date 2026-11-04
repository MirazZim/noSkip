-- ============================================================
-- AI Analyst notes + per-insight feedback
--
-- ai_memories gains three kinds of row:
--   source = 'computed'  facts generate-insights derives in code (unchanged)
--   source = 'ai'        a pattern the AI noticed ("overspends after payday").
--                        Expires unless later analyses keep confirming it.
--   source = 'feedback'  the last rated insight of each type, with its text,
--                        so the next analysis learns from what was actually said
--
-- A user can dismiss an AI note they think is wrong. Dismissed notes are kept
-- (until they expire) so the AI is told not to write them again.
-- ============================================================

ALTER TABLE public.ai_memories
  ADD COLUMN source       TEXT NOT NULL DEFAULT 'computed',
  ADD COLUMN expires_at   TIMESTAMPTZ,
  ADD COLUMN dismissed_at TIMESTAMPTZ,
  ADD CONSTRAINT ai_memories_source_check CHECK (source IN ('computed', 'ai', 'feedback'));

CREATE INDEX idx_ai_memories_user_source ON public.ai_memories(user_id, source);


-- Writes stay service-role only; dismissing goes through this function so a
-- user can flag their own AI notes without being able to edit any memory.
CREATE OR REPLACE FUNCTION public.dismiss_ai_note(p_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.ai_memories
     SET dismissed_at = now(),
         expires_at   = now() + interval '90 days'
   WHERE id = p_id
     AND user_id = auth.uid()
     AND source = 'ai';
END;
$$;

REVOKE EXECUTE ON FUNCTION public.dismiss_ai_note(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.dismiss_ai_note(UUID) TO authenticated;
