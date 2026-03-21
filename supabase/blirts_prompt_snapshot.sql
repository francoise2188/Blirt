-- Run in Supabase → SQL Editor (once per project)
-- Stores the prompt text the guest saw when they submitted (for host inbox + exports).

ALTER TABLE blirts ADD COLUMN IF NOT EXISTS prompt_snapshot text;

COMMENT ON COLUMN blirts.prompt_snapshot IS 'Prompt shown to the guest at submit time (filled message, not raw template).';
