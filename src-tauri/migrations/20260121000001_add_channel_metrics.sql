-- Add status calculation columns to channels
ALTER TABLE channels ADD COLUMN avg_views REAL NOT NULL DEFAULT 0;
ALTER TABLE channels ADD COLUMN std_dev REAL NOT NULL DEFAULT 0;
