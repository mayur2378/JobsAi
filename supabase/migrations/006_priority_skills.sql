ALTER TABLE profiles ADD COLUMN IF NOT EXISTS priority_skills TEXT[] DEFAULT '{}';
