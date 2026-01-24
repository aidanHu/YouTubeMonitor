-- Add download tracking columns to videos table
ALTER TABLE videos ADD COLUMN download_status TEXT NOT NULL DEFAULT 'idle';
ALTER TABLE videos ADD COLUMN download_error TEXT;
ALTER TABLE videos ADD COLUMN downloaded_at DATETIME;

-- Create index for filtering by download status (e.g. for "Downloading" tab or "Failed" retry)
CREATE INDEX IF NOT EXISTS idx_videos_download_status ON videos(download_status);
