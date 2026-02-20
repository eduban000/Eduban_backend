-- UP
-- Indexes backing the real aggregation pipeline added in Issue #26
-- (bucket queries on activity_logs by (type, timestamp), per-user lookups
-- for anonymized stats, and per-course detail queries).
--
-- These keep the large date-range perf budget (<2s) demanded by the issue DoD.

CREATE INDEX IF NOT EXISTS idx_activity_logs_type_timestamp
  ON activity_logs (type, timestamp);

CREATE INDEX IF NOT EXISTS idx_activity_logs_source_type
  ON activity_logs (source_account, type);

CREATE INDEX IF NOT EXISTS idx_activity_logs_details_type
  ON activity_logs (details, type)
  WHERE details IS NOT NULL;

-- @undo
DROP INDEX IF EXISTS idx_activity_logs_details_type;
DROP INDEX IF EXISTS idx_activity_logs_source_type;
DROP INDEX IF EXISTS idx_activity_logs_type_timestamp;
