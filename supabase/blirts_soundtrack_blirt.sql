-- Soundtrack Blirt (Stage 1) — add Spotify track fields + message type
-- Run in Supabase → SQL Editor.
--
-- Notes:
-- - This script is defensive: it creates/extends enums only if needed, and adds columns with IF NOT EXISTS.
-- - Your existing app currently uses blirts.type ('video' | 'audio' | 'text'). This script extends the enum
--   behind it if it is already an enum named blirt_type, or creates a compatible enum for soundtrack_message_type.

-- 1) Add 'soundtrack' to blirt_type enum (if it exists)
DO $do$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_type WHERE typname = 'blirt_type') THEN
    BEGIN
      -- No IF NOT EXISTS here for maximum compatibility; we catch duplicates below.
      EXECUTE 'ALTER TYPE blirt_type ADD VALUE ''soundtrack''';
    EXCEPTION
      WHEN duplicate_object THEN
        -- already exists
        NULL;
    END;
  END IF;
END $do$;

-- 2) Create enum for the accompanying memory type (video/audio/text)
DO $do$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'soundtrack_message_type') THEN
    CREATE TYPE soundtrack_message_type AS ENUM ('video', 'audio', 'text');
  END IF;
END $do$;

-- 3) Columns on blirts for the Spotify track snapshot
ALTER TABLE blirts
  ADD COLUMN IF NOT EXISTS spotify_track_id text,
  ADD COLUMN IF NOT EXISTS spotify_track_name text,
  ADD COLUMN IF NOT EXISTS spotify_artist_name text,
  ADD COLUMN IF NOT EXISTS spotify_album_name text,
  ADD COLUMN IF NOT EXISTS spotify_album_art_url text,
  ADD COLUMN IF NOT EXISTS spotify_preview_url text;

-- 4) Column for accompanying memory type (video/audio/text)
ALTER TABLE blirts
  ADD COLUMN IF NOT EXISTS soundtrack_message_type soundtrack_message_type;

COMMENT ON COLUMN blirts.spotify_track_id IS 'Spotify track ID for Soundtrack Blirts.';
COMMENT ON COLUMN blirts.spotify_track_name IS 'Track name snapshot (so the UI still shows it if Spotify changes).';
COMMENT ON COLUMN blirts.spotify_artist_name IS 'Artist name snapshot.';
COMMENT ON COLUMN blirts.spotify_album_name IS 'Album name snapshot.';
COMMENT ON COLUMN blirts.spotify_album_art_url IS 'Album art URL (prefer 640px image).';
COMMENT ON COLUMN blirts.spotify_preview_url IS '30s preview mp3 URL (nullable; many tracks have no preview).';
COMMENT ON COLUMN blirts.soundtrack_message_type IS 'For soundtrack blirts: the accompanying memory type (video/audio/text).';

