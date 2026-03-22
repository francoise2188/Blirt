-- =============================================================================
-- RUN THIS IN SUPABASE → SQL EDITOR (fixes two common production issues)
--
-- 1) Host inbox stuck on "Loading…" for video/audio — Storage RLS only checked
--    events.owner_id; older rows may only have user_id, so signed URLs were denied.
-- 2) Guests see "new row violates row-level security policy" on upload —
--    Storage bucket needs an INSERT policy for anonymous uploads into event folders.
--
-- "Object not found" in the host inbox means the DB row exists but no file was stored (upload
-- failed while the old app still inserted the row first). Those clips cannot be recovered from
-- Storage. New submissions use upload-then-insert so this does not repeat.
-- =============================================================================

-- A) Link owner_id from user_id where missing (safe if both columns exist)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'events' AND column_name = 'user_id'
  ) AND EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'events' AND column_name = 'owner_id'
  ) THEN
    UPDATE events SET owner_id = user_id WHERE owner_id IS NULL AND user_id IS NOT NULL;
  END IF;
END $$;

-- B) Host can read signed URLs for media under events they own (owner_id OR user_id)
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

-- C) Host can delete media for their events
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

-- D) Guests (anon) may upload files only into folders named after a real event id
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

-- E) Allow replace/upsert on the same path (retry uploads)
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

-- F) Guests can delete objects under an event folder (cleanup if DB insert fails after upload)
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
