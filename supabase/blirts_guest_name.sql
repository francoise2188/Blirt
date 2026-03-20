-- Run in Supabase → SQL Editor if guest names are not saving.

ALTER TABLE blirts ADD COLUMN IF NOT EXISTS guest_name text;

COMMENT ON COLUMN blirts.guest_name IS 'Optional name the guest typed (e.g. "This message is from…").';
