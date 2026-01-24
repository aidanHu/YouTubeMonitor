-- Create index on view_count to optimize viral video analysis and sorting
CREATE INDEX IF NOT EXISTS idx_videos_view_count ON videos(view_count DESC);
