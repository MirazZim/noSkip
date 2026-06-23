-- Add optional description field to persona rules.
-- Stored on the habits row (persona rules are habit rows with category = 'persona_shift').
-- Null means no description — existing rows are unaffected.

ALTER TABLE public.habits
  ADD COLUMN description TEXT;
