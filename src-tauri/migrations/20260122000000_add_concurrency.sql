-- Add max_concurrent_downloads to settings
ALTER TABLE settings ADD COLUMN max_concurrent_downloads INTEGER DEFAULT 3;
