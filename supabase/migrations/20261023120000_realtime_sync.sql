-- Push every user-owned table to the open app so edits made on another device
-- appear instantly (see useRealtimeSync). Realtime postgres_changes honours each
-- table's SELECT RLS policy, so a client only ever receives its own rows.
DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'incomes', 'habits', 'habit_completions', 'budgets',
    'loans', 'savings', 'custom_categories', 'profiles'
  ] LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_publication_tables
      WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = t
    ) THEN
      EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I', t);
    END IF;
  END LOOP;
END $$;
