-- Blirt marketing blog — public read via anon key; edit posts in Supabase Table Editor or SQL.
-- Run in Supabase → SQL Editor (once).

CREATE TABLE IF NOT EXISTS blog_posts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  excerpt text NOT NULL,
  body text,
  published_at timestamptz NOT NULL DEFAULT now(),
  is_published boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS blog_posts_published_at_idx ON blog_posts (published_at DESC);

COMMENT ON TABLE blog_posts IS 'Public marketing blog posts for blirt-it.com/blog';

ALTER TABLE blog_posts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "blog_posts_select_published" ON blog_posts;
CREATE POLICY "blog_posts_select_published"
  ON blog_posts
  FOR SELECT
  TO anon, authenticated
  USING (is_published = true);

-- No INSERT/UPDATE/DELETE for anon — manage posts in the dashboard or with the service role.

-- Seed (idempotent — skips if a post with the same title already exists)
INSERT INTO blog_posts (title, excerpt, published_at, is_published)
SELECT
  'Why we built Blirt',
  'Photo booths are fun, but they are not where your grandmother says the thing you will remember forever. We wanted a place for those moments — quiet, private, and from the heart.',
  '2026-03-01T15:00:00Z',
  true
WHERE NOT EXISTS (SELECT 1 FROM blog_posts WHERE title = 'Why we built Blirt');

INSERT INTO blog_posts (title, excerpt, published_at, is_published)
SELECT
  'Guests first: no app required',
  'Your friends should not have to download something new to tell you they love you. Every Blirt guest flow works in the browser — one link, any phone.',
  '2026-03-15T15:00:00Z',
  true
WHERE NOT EXISTS (SELECT 1 FROM blog_posts WHERE title = 'Guests first: no app required');
