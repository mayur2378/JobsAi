-- Enable Supabase Realtime on job_matches so the browser client
-- can receive live Phase 2 score updates via postgres_changes.
ALTER PUBLICATION supabase_realtime ADD TABLE job_matches;
