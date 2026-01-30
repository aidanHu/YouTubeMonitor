ALTER TABLE api_keys ADD COLUMN is_quota_exhausted BOOLEAN DEFAULT 0;
ALTER TABLE api_keys ADD COLUMN last_error TEXT;
