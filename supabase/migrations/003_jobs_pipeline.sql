-- 003_jobs_pipeline.sql
-- Add extracted_skills to jobs table (populated by scraper at insert time)
ALTER TABLE jobs
  ADD COLUMN IF NOT EXISTS extracted_skills TEXT[] DEFAULT '{}';

-- Add Phase 2 AI refinement columns to job_matches
ALTER TABLE job_matches
  ADD COLUMN IF NOT EXISTS refined_score    INT,
  ADD COLUMN IF NOT EXISTS ai_refined       BOOL DEFAULT false,
  ADD COLUMN IF NOT EXISTS refined_at       TIMESTAMPTZ;

-- Add rate-limit tracker for POST /jobs/refresh
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS last_refresh_at  TIMESTAMPTZ;
