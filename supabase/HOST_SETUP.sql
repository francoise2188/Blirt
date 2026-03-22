-- Blirt — host auth, prompts, RLS (run in Supabase → SQL Editor)
-- Run sections one at a time if something errors; fix duplicates as noted.

-- 1) Columns on events
ALTER TABLE events
  ADD COLUMN IF NOT EXISTS owner_id uuid REFERENCES auth.users (id) ON DELETE SET NULL;

ALTER TABLE events
  ADD COLUMN IF NOT EXISTS prompt_randomize boolean DEFAULT true;

ALTER TABLE events
  ADD COLUMN IF NOT EXISTS event_type text DEFAULT 'Wedding';

CREATE INDEX IF NOT EXISTS events_owner_id_idx ON events (owner_id);

COMMENT ON COLUMN events.owner_id IS 'Supabase Auth user who manages this event (hosts).';
COMMENT ON COLUMN events.prompt_randomize IS 'If true, guest page picks a random prompt from prompts[]; if false, uses first prompt only.';
COMMENT ON COLUMN events.event_type IS 'Host-selected event category (Wedding, Birthday, etc.).';

-- Single-name events (e.g. birthday): the app saves partner_2 as '' (empty string) if NOT NULL.
-- Optional — only if you want NULL instead of '' in the database:
-- ALTER TABLE events ALTER COLUMN partner_2 DROP NOT NULL;

-- event_date: the app sends this when creating an event (date picker, defaults to today).
-- Optional — only if you want event_date to be optional in the database:
-- ALTER TABLE events ALTER COLUMN event_date DROP NOT NULL;

-- Host identity: the app sets BOTH user_id and owner_id to auth.uid() on create (if your table only has
-- user_id, remove owner_id from the insert in src/app/host/page.tsx).

-- Prompt list length: the app lets hosts save many prompts; guests only see one at a time (with skips).
-- If you added an older CHECK like events_prompts_max_3, drop it:
ALTER TABLE events DROP CONSTRAINT IF EXISTS events_prompts_max_3;

-- 2) Claim an existing event (replace IDs after you create a host account)
-- UPDATE events SET owner_id = 'PASTE-auth.users.id' WHERE id = 'PASTE-event-uuid';

-- 3) Row Level Security — adjust if you already use different policy names.
--    List policies: SELECT * FROM pg_policies WHERE tablename IN ('events','blirts');

ALTER TABLE events ENABLE ROW LEVEL SECURITY;
ALTER TABLE blirts ENABLE ROW LEVEL SECURITY;

-- Events: guests need to read couple names + prompts (anyone with link)
DROP POLICY IF EXISTS "events_select_public" ON events;
CREATE POLICY "events_select_public" ON events
  FOR SELECT USING (true);

-- Only hosts create/update/delete their rows
DROP POLICY IF EXISTS "events_insert_by_owner" ON events;
CREATE POLICY "events_insert_by_owner" ON events
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = owner_id);

DROP POLICY IF EXISTS "events_update_by_owner" ON events;
CREATE POLICY "events_update_by_owner" ON events
  FOR UPDATE TO authenticated
  USING (auth.uid() = owner_id)
  WITH CHECK (auth.uid() = owner_id);

DROP POLICY IF EXISTS "events_delete_by_owner" ON events;
CREATE POLICY "events_delete_by_owner" ON events
  FOR DELETE TO authenticated
  USING (auth.uid() = owner_id);

-- Blirts: anonymous guests can insert if the event exists
DROP POLICY IF EXISTS "blirts_insert_for_existing_event" ON blirts;
CREATE POLICY "blirts_insert_for_existing_event" ON blirts
  FOR INSERT TO anon, authenticated
  WITH CHECK (
    EXISTS (SELECT 1 FROM events e WHERE e.id = blirts.event_id)
  );

-- Hosts can read/update/delete blirts for events they own
DROP POLICY IF EXISTS "blirts_select_by_event_owner" ON blirts;
CREATE POLICY "blirts_select_by_event_owner" ON blirts
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM events e
      WHERE e.id = blirts.event_id AND e.owner_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "blirts_update_by_event_owner" ON blirts;
CREATE POLICY "blirts_update_by_event_owner" ON blirts
  FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM events e
      WHERE e.id = blirts.event_id AND e.owner_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "blirts_delete_by_event_owner" ON blirts;
CREATE POLICY "blirts_delete_by_event_owner" ON blirts
  FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM events e
      WHERE e.id = blirts.event_id AND e.owner_id = auth.uid()
    )
  );

-- 4) Storage (bucket blirts-media) — hosts can read/delete their event folder
--    Skip if you already have policies you prefer.
DROP POLICY IF EXISTS "blirts_media_select_owner" ON storage.objects;
CREATE POLICY "blirts_media_select_owner" ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'blirts-media'
    AND EXISTS (
      SELECT 1 FROM events e
      WHERE (e.owner_id = auth.uid() OR e.user_id = auth.uid())
        AND name LIKE (e.id::text || '/%')
    )
  );

DROP POLICY IF EXISTS "blirts_media_delete_owner" ON storage.objects;
CREATE POLICY "blirts_media_delete_owner" ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'blirts-media'
    AND EXISTS (
      SELECT 1 FROM events e
      WHERE (e.owner_id = auth.uid() OR e.user_id = auth.uid())
        AND name LIKE (e.id::text || '/%')
    )
  );

-- Guests upload into blirts-media/{eventId}/{filename} — required or uploads get RLS errors.
DROP POLICY IF EXISTS "blirts_media_insert_guest" ON storage.objects;
CREATE POLICY "blirts_media_insert_guest" ON storage.objects
  FOR INSERT TO anon, authenticated
  WITH CHECK (
    bucket_id = 'blirts-media'
    AND EXISTS (
      SELECT 1 FROM events e
      WHERE e.id::text = split_part(name, '/', 1)
    )
  );

DROP POLICY IF EXISTS "blirts_media_update_guest" ON storage.objects;
CREATE POLICY "blirts_media_update_guest" ON storage.objects
  FOR UPDATE TO anon, authenticated
  USING (
    bucket_id = 'blirts-media'
    AND EXISTS (
      SELECT 1 FROM events e
      WHERE e.id::text = split_part(name, '/', 1)
    )
  )
  WITH CHECK (
    bucket_id = 'blirts-media'
    AND EXISTS (
      SELECT 1 FROM events e
      WHERE e.id::text = split_part(name, '/', 1)
    )
  );

DROP POLICY IF EXISTS "blirts_media_delete_guest" ON storage.objects;
CREATE POLICY "blirts_media_delete_guest" ON storage.objects
  FOR DELETE TO anon, authenticated
  USING (
    bucket_id = 'blirts-media'
    AND EXISTS (
      SELECT 1 FROM events e
      WHERE e.id::text = split_part(name, '/', 1)
    )
  );

-- 5) Supabase Dashboard → Authentication → URL configuration
--    Add Site URL and Redirect URLs, e.g.:
--    http://localhost:3001/auth/callback
--    http://YOUR-LAN-IP:3011/auth/callback
--    https://your-production-domain.com/auth/callback
