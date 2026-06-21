-- Migration: add_member_session_indexes
-- Dibuat manual karena shadow DB Supabase free tier tidak support supabase_realtime publication

-- Index untuk Member table: mempercepat lookup by userId
-- (dipakai di auth-utils, tasks, activity, dashboard)
CREATE INDEX IF NOT EXISTS "member_userId_idx"
  ON "member"("userId");

CREATE INDEX IF NOT EXISTS "member_userId_status_idx"
  ON "member"("userId", "status");

CREATE INDEX IF NOT EXISTS "member_organizationId_status_idx"
  ON "member"("organizationId", "status");

-- Index untuk Session table: mempercepat Better Auth session lookup by userId
CREATE INDEX IF NOT EXISTS "session_userId_idx"
  ON "session"("userId");

CREATE INDEX IF NOT EXISTS "session_userId_expiresAt_idx"
  ON "session"("userId", "expiresAt");
