-- Optimize search and filtering by channel_id and group_id
CREATE INDEX IF NOT EXISTS idx_videos_channel_id ON videos(channel_id);
CREATE INDEX IF NOT EXISTS idx_channels_group_id ON channels(group_id);

-- Optimize time-based queries (e.g., published_at and last_upload_at)
CREATE INDEX IF NOT EXISTS idx_videos_published_at ON videos(published_at DESC);
CREATE INDEX IF NOT EXISTS idx_channels_last_upload_at ON channels(last_upload_at DESC);

-- Optimize favorite lookups
CREATE INDEX IF NOT EXISTS idx_videos_is_favorite ON videos(is_favorite) WHERE is_favorite = 1;
CREATE INDEX IF NOT EXISTS idx_channels_is_favorite ON channels(is_favorite) WHERE is_favorite = 1;
