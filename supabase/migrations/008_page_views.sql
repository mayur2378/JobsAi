-- supabase/migrations/008_page_views.sql
CREATE TABLE IF NOT EXISTS page_views (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  path       TEXT        NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE page_views ENABLE ROW LEVEL SECURITY;

-- Users can log their own views; admin reads all via service role key
CREATE POLICY "users insert own page views"
  ON page_views FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE INDEX page_views_created_at_idx     ON page_views (created_at DESC);
CREATE INDEX page_views_user_created_at_idx ON page_views (user_id, created_at DESC);
