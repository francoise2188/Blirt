-- Pretty guest URLs: /ashley-birthday → resolved via guest_slug on events.
-- Run once in Supabase → SQL Editor.

ALTER TABLE events
  ADD COLUMN IF NOT EXISTS guest_slug text;

CREATE UNIQUE INDEX IF NOT EXISTS events_guest_slug_unique
  ON events (guest_slug)
  WHERE guest_slug IS NOT NULL AND guest_slug <> '';

COMMENT ON COLUMN events.guest_slug IS 'URL path for guests, e.g. ashley-birthday. Null = use legacy /guest?event=UUID only.';
