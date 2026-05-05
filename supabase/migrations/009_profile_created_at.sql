-- Add created_at to profiles, backfilled from auth.users
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS created_at timestamptz;

UPDATE profiles p
SET    created_at = u.created_at
FROM   auth.users u
WHERE  p.id = u.id;

ALTER TABLE profiles
  ALTER COLUMN created_at SET DEFAULT now();

CREATE INDEX IF NOT EXISTS idx_profiles_created_at ON profiles (created_at);
