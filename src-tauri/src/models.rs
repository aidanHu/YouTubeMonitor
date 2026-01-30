use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::sync::{Arc, Mutex};
use tokio::sync::Semaphore;
use std::sync::atomic::AtomicBool;

// --- Serialization Helpers ---
pub mod int_string {
    use serde::{de, Serializer, Deserializer};
    use std::fmt;

    pub fn serialize<S>(value: &i64, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: Serializer,
    {
        serializer.serialize_str(&value.to_string())
    }

    pub fn deserialize<'de, D>(deserializer: D) -> Result<i64, D::Error>
    where
        D: Deserializer<'de>,
    {
        struct Visitor;

        impl<'de> de::Visitor<'de> for Visitor {
            type Value = i64;

            fn expecting(&self, formatter: &mut fmt::Formatter) -> fmt::Result {
                formatter.write_str("a string or integer")
            }

            fn visit_i64<E>(self, v: i64) -> Result<Self::Value, E> {
                Ok(v)
            }

            fn visit_u64<E>(self, v: u64) -> Result<Self::Value, E> {
                Ok(v as i64)
            }

            fn visit_f64<E>(self, v: f64) -> Result<Self::Value, E> {
                Ok(v as i64)
            }

            fn visit_str<E>(self, v: &str) -> Result<Self::Value, E>
            where
                E: de::Error,
            {
                v.parse::<i64>().map_err(de::Error::custom)
            }
        }

        deserializer.deserialize_any(Visitor)
    }
}

pub mod opt_int_string {
    use serde::{de, Serializer, Deserializer};
    use std::fmt;

    pub fn serialize<S>(value: &Option<i64>, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: Serializer,
    {
        match value {
            Some(v) => serializer.serialize_str(&v.to_string()),
            None => serializer.serialize_none(),
        }
    }

    pub fn deserialize<'de, D>(deserializer: D) -> Result<Option<i64>, D::Error>
    where
        D: Deserializer<'de>,
    {
        struct Visitor;

        impl<'de> de::Visitor<'de> for Visitor {
            type Value = Option<i64>;

            fn expecting(&self, formatter: &mut fmt::Formatter) -> fmt::Result {
                formatter.write_str("a string, integer, float or null")
            }

            fn visit_none<E>(self) -> Result<Self::Value, E> {
                Ok(None)
            }

            fn visit_unit<E>(self) -> Result<Self::Value, E> {
                Ok(None)
            }

            fn visit_i64<E>(self, v: i64) -> Result<Self::Value, E> {
                Ok(Some(v))
            }

            fn visit_u64<E>(self, v: u64) -> Result<Self::Value, E> {
                Ok(Some(v as i64))
            }

            fn visit_f64<E>(self, v: f64) -> Result<Self::Value, E> {
                Ok(Some(v as i64))
            }

            fn visit_str<E>(self, v: &str) -> Result<Self::Value, E>
            where
                E: de::Error,
            {
                if v.is_empty() {
                    return Ok(None);
                }
                v.parse::<i64>().map(Some).map_err(de::Error::custom)
            }
        }

        deserializer.deserialize_option(Visitor)
    }
}

// --- Structs ---

#[derive(Debug, Serialize, Deserialize, sqlx::FromRow)]
pub struct Video {
    pub id: String,
    pub title: String,
    pub url: String,
    pub thumbnail: Option<String>,
    pub published_at: DateTime<Utc>,
    #[serde(with = "int_string")]
    pub view_count: i64,
    #[serde(default, with = "opt_int_string")]
    pub like_count: Option<i64>,
    #[serde(default, with = "opt_int_string")]
    pub comment_count: Option<i64>,
    pub is_short: bool,
    pub is_favorite: bool,
    #[serde(default)]
    pub is_downloaded: bool,
    #[serde(default)]
    pub local_path: Option<String>,
    pub channel_id: String,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
    #[serde(default = "default_download_status")]
    pub download_status: String,
    pub download_error: Option<String>,
    pub downloaded_at: Option<DateTime<Utc>>,
}

fn default_download_status() -> String {
    "idle".to_string()
}

pub struct CancellationFlag(pub Arc<AtomicBool>);

#[derive(Clone, Serialize)]
pub struct AddChannelProgress {
    pub current: usize,
    pub total: usize,
    pub url: String,
    pub status: String,
    pub message: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct AddChannelResult {
    pub url: String,
    pub status: String,
    pub message: String,
    pub channel_name: Option<String>,
}

#[derive(serde::Serialize)]
pub struct MoveChannelResult {
    pub moved: bool,
    pub message: String,
}

#[derive(serde::Serialize)]
pub struct MigrationStats {
    pub moved_folders: i32,
    pub updated_videos: i32,
    pub errors: i32,
}

#[derive(serde::Serialize)]
pub struct ChannelDetails {
    #[serde(flatten)]
    pub channel: ChannelDb,
    pub videos: Vec<Video>,
    pub group: Option<Group>,
}

#[derive(serde::Serialize, serde::Deserialize)]
pub struct BackupData {
    pub channels: Vec<ChannelDb>,
    #[serde(default)]
    pub groups: Option<Vec<Group>>,
    #[serde(default)]
    pub videos: Option<Vec<Video>>,
    pub settings: Option<AppSettings>,
}

#[derive(Debug, Serialize, Deserialize, sqlx::FromRow)]
pub struct Group {
    pub id: i64,
    pub name: String,
    pub is_pinned: bool,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

#[derive(Debug, Serialize, Deserialize, sqlx::FromRow)]
pub struct Channel {
    pub id: String,
    pub url: String,
    pub name: String,
    pub thumbnail: Option<String>,
    #[serde(with = "int_string")]
    pub subscriber_count: i64,
    #[serde(with = "int_string")]
    pub view_count: i64,
    #[serde(with = "int_string")]
    pub video_count: i64,
    pub group_id: Option<i64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub group: Option<Group>,
    pub is_favorite: bool,
    pub is_pinned: bool,
    pub created_at: DateTime<Utc>,
    pub last_upload_at: Option<DateTime<Utc>>,
}

#[derive(Debug, Serialize, Deserialize, sqlx::FromRow)]
pub struct ChannelDb {
    pub id: String,
    pub url: String,
    pub name: String,
    pub thumbnail: Option<String>,
    #[serde(with = "int_string", default)]
    pub subscriber_count: i64,
    #[serde(with = "int_string", default)]
    pub view_count: i64,
    #[serde(with = "int_string", default)]
    pub video_count: i64,
    pub group_id: Option<i64>,
    #[serde(default)]
    pub is_favorite: bool,
    #[serde(default)]
    pub is_pinned: bool,
    #[serde(default = "default_created_at")]
    pub created_at: DateTime<Utc>,
    pub last_upload_at: Option<DateTime<Utc>>,
}

fn default_created_at() -> DateTime<Utc> {
    Utc::now()
}

#[derive(Debug, Serialize, Deserialize, sqlx::FromRow)]
pub struct VideoWithChannel {
    pub id: String,
    pub title: String,
    pub url: String,
    pub thumbnail: Option<String>,
    pub published_at: DateTime<Utc>,
    #[serde(with = "int_string")]
    pub view_count: i64,
    pub is_short: bool,
    pub is_favorite: bool,
    pub is_downloaded: bool,
    pub local_path: Option<String>,
    pub channel_id: String,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
    pub download_status: String,
    pub download_error: Option<String>,
    pub downloaded_at: Option<DateTime<Utc>>,
    pub channel_name: String,
    pub channel_thumbnail: Option<String>,
    #[serde(with = "int_string")]
    pub subscriber_count: i64,
    #[serde(default, with = "opt_int_string")]
    pub like_count: Option<i64>,
    #[serde(default, with = "opt_int_string")]
    pub comment_count: Option<i64>,
    pub avg_views: f64,
    pub std_dev: f64,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct AnalysisVideo {
    #[serde(flatten)]
    pub video: VideoWithChannel,
    pub vph: f64,
    pub ratio: f64,
    pub engagement_rate: f64,
    pub z_score: f64,
}

#[derive(Debug, Serialize, Deserialize, sqlx::FromRow)]
pub struct GroupStat {
    pub id: Option<i64>,
    pub name: String,
    pub total_views: i64,
    pub video_count: i64,
    pub avg_view_count: f64,
}

#[derive(Debug, Serialize, Deserialize, sqlx::FromRow)]
pub struct ChannelStat {
    pub channel: Channel,
    pub total_views: i64,
    pub count: i64,
    pub avg_views: f64,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct VideoResponse {
    pub videos: Vec<VideoWithChannel>,
    pub has_more: bool,
    pub total: i64,
}

#[derive(Debug, Serialize, Deserialize, sqlx::FromRow)]
pub struct AppSettings {
    pub id: i64,
    pub proxy_url: Option<String>,
    pub theme: Option<String>,
    pub cookie_source: Option<String>,
    pub download_path: Option<String>,
    pub max_concurrent_downloads: Option<i64>,
    pub activation_code: Option<String>,
    pub activated_at: Option<DateTime<Utc>>,
    pub license_days: Option<i64>,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

#[derive(Debug, Serialize, Deserialize, sqlx::FromRow)]
pub struct ApiKey {
    pub id: i64,
    pub key: String,
    pub name: Option<String>,
    pub is_active: bool,
    pub is_quota_exhausted: bool,
    pub last_error: Option<String>,
    pub usage_today: i64,
    pub last_used: DateTime<Utc>,
    pub created_at: DateTime<Utc>,
}

pub struct DownloadState {
    pub tasks: Arc<Mutex<HashMap<String, u32>>>,
    pub semaphore: Arc<Mutex<Arc<Semaphore>>>,
    pub current_limit: Arc<Mutex<usize>>,
}

impl Default for DownloadState {
    fn default() -> Self {
        Self {
            tasks: Arc::new(Mutex::new(HashMap::new())),
            semaphore: Arc::new(Mutex::new(Arc::new(Semaphore::new(3)))),
            current_limit: Arc::new(Mutex::new(3)),
        }
    }
}
