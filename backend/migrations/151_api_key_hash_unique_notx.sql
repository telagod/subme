-- 151_api_key_hash_unique_notx.sql
-- Partial unique index on key_hash for active (non-soft-deleted) rows only.
-- CONCURRENTLY avoids write lock. Non-tx migration (_notx).
CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS apikey_key_hash_unique_active
  ON api_keys (key_hash) WHERE deleted_at IS NULL AND key_hash IS NOT NULL;
