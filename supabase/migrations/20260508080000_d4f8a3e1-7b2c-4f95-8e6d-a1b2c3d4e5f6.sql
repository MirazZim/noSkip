
-- AI Insights table
-- Caches AI-generated analysis per user. Regenerated when context_hash changes or expires_at passes.
CREATE TABLE public.ai_insights (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  insight_type TEXT        NOT NULL,
  content      TEXT        NOT NULL,
  context_hash TEXT,
  generated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at   TIMESTAMPTZ,
  was_useful   BOOLEAN
);

ALTER TABLE public.ai_insights ENABLE ROW LEVEL SECURITY;

-- Users read their own insights
CREATE POLICY "Users can view own insights"
  ON public.ai_insights FOR SELECT
  USING (auth.uid() = user_id);

-- Users can rate an insight (was_useful) but cannot insert or delete
CREATE POLICY "Users can update own insights"
  ON public.ai_insights FOR UPDATE
  USING (auth.uid() = user_id);

-- INSERT / DELETE is handled exclusively by Edge Functions via service role (bypasses RLS)


-- AI Memories table
-- Persists facts the AI has learned about the user across sessions.
-- Keyed by memory_key so values are upsertable without duplicates.
CREATE TABLE public.ai_memories (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  memory_key   TEXT        NOT NULL,
  memory_value TEXT        NOT NULL,
  confidence   FLOAT       NOT NULL DEFAULT 1.0,
  last_updated TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, memory_key)
);

ALTER TABLE public.ai_memories ENABLE ROW LEVEL SECURITY;

-- Users can read their own memories (transparency: they can see what AI knows about them)
CREATE POLICY "Users can view own memories"
  ON public.ai_memories FOR SELECT
  USING (auth.uid() = user_id);

-- INSERT / UPDATE / DELETE handled exclusively by Edge Functions via service role (bypasses RLS)


-- Indexes
CREATE INDEX idx_ai_insights_user_type    ON public.ai_insights(user_id, insight_type);
CREATE INDEX idx_ai_insights_user_expires ON public.ai_insights(user_id, expires_at);
CREATE INDEX idx_ai_memories_user_key     ON public.ai_memories(user_id, memory_key);
