use chrono::{DateTime, Utc};
use reqwest::Client;
use serde::Deserialize;
use std::error::Error;

// --- API Models ---

#[derive(Debug, Deserialize)]
pub struct ChannelListResponse {
    pub items: Option<Vec<ChannelResource>>,
}

#[derive(Debug, Deserialize)]
pub struct ChannelResource {
    pub id: String,
    pub snippet: ChannelSnippet,
    pub statistics: Option<ChannelStatistics>,
    #[serde(rename = "contentDetails")]
    pub content_details: Option<ChannelContentDetails>,
}

#[derive(Debug, Deserialize)]
pub struct ChannelSnippet {
    pub title: String,
    #[allow(dead_code)]
    pub description: String,
    pub thumbnails: Thumbnails,
}

#[derive(Debug, Deserialize)]
pub struct Thumbnails {
    pub default: Option<Thumbnail>,
    pub medium: Option<Thumbnail>,
    pub high: Option<Thumbnail>,
}

impl Thumbnails {
    pub fn get_best_url(&self) -> String {
        self.high
            .as_ref()
            .or(self.medium.as_ref())
            .or(self.default.as_ref())
            .map(|t| t.url.clone())
            .unwrap_or_default()
    }
}

#[derive(Debug, Deserialize)]
pub struct Thumbnail {
    pub url: String,
}

#[derive(Debug, Deserialize)]
pub struct ChannelStatistics {
    #[serde(rename = "viewCount")]
    pub view_count: Option<String>,
    #[serde(rename = "subscriberCount")]
    pub subscriber_count: Option<String>,
    #[serde(rename = "videoCount")]
    pub video_count: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct ChannelContentDetails {
    #[serde(rename = "relatedPlaylists")]
    pub related_playlists: RelatedPlaylists,
}

#[derive(Debug, Deserialize)]
pub struct RelatedPlaylists {
    pub uploads: String,
}

// Playlist Items
#[derive(Debug, Deserialize)]
pub struct PlaylistItemListResponse {
    pub items: Option<Vec<PlaylistItemResource>>,
    #[serde(rename = "nextPageToken")]
    #[allow(dead_code)]
    pub next_page_token: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct PlaylistItemResource {
    pub snippet: PlaylistItemSnippet,
}

#[derive(Debug, Deserialize)]
pub struct PlaylistItemSnippet {
    #[serde(rename = "resourceId")]
    pub resource_id: ResourceId,
    #[serde(rename = "publishedAt")]
    pub published_at: Option<DateTime<Utc>>,
}

#[derive(Debug, Deserialize)]
pub struct ResourceId {
    #[serde(rename = "videoId")]
    pub video_id: String,
}

// Videos
#[derive(Debug, Deserialize)]
pub struct VideoListResponse {
    pub items: Option<Vec<VideoResource>>,
}

#[derive(Debug, Deserialize)]
pub struct VideoResource {
    pub id: String,
    pub snippet: VideoSnippet,
    pub statistics: Option<VideoStatistics>,
    #[serde(rename = "contentDetails")]
    pub content_details: Option<VideoContentDetails>,
}

#[derive(Debug, Deserialize)]
pub struct VideoSnippet {
    pub title: String,
    #[serde(rename = "publishedAt")]
    pub published_at: DateTime<Utc>,
    pub thumbnails: Thumbnails,
    #[serde(rename = "channelId")]
    pub channel_id: String,
}

#[derive(Debug, Deserialize)]
pub struct VideoStatistics {
    #[serde(rename = "viewCount")]
    pub view_count: Option<String>,
    #[serde(rename = "likeCount")]
    pub like_count: Option<String>,
    #[serde(rename = "commentCount")]
    pub comment_count: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct VideoContentDetails {
    pub duration: String, // ISO 8601, e.g. PT1M30S
}

// --- Functions ---

// --- Functions ---

// --- Functions ---

pub async fn get_channel_by_id_or_handle(
    client: &Client,
    api_key: &str,
    input: &str,
) -> Result<ChannelResource, Box<dyn Error>> {
    // Rudimentary heuristic: if starts with @, it's a handle.
    // If it's 24 chars starting with UC, it's an ID.
    // If user passed full URL, we assume caller parsed it.

    let is_handle = input.starts_with('@');

    let url = if is_handle {
        format!("https://www.googleapis.com/youtube/v3/channels?part=snippet,contentDetails,statistics&forHandle={}&key={}", input, api_key)
    } else {
        format!("https://www.googleapis.com/youtube/v3/channels?part=snippet,contentDetails,statistics&id={}&key={}", input, api_key)
    };

    let resp = client.get(&url).send().await?;

    if !resp.status().is_success() {
        let status = resp.status();
        let text = resp.text().await.unwrap_or_default();
        return Err(format!("YouTube API Error {}: {}", status, text).into());
    }

    let text = resp.text().await?;
    let param: ChannelListResponse = serde_json::from_str(&text).map_err(|e| {
        format!(
            "Failed to parse ChannelListResponse: {}. Response: {}",
            e, text
        )
    })?;

    if let Some(items) = param.items {
        if let Some(item) = items.into_iter().next() {
            return Ok(item);
        }
    }

    Err("Channel not found".into())
}

pub async fn get_upload_playlist_items(
    client: &Client,
    api_key: &str,
    playlist_id: &str,
    max_results: u32,
    after: Option<DateTime<Utc>>,
) -> Result<Vec<String>, Box<dyn Error>> {
    let mut video_ids = Vec::new();
    let mut next_page_token: Option<String> = None;
    let mut has_more = true;
    let mut total_fetched = 0;
    // Safety limit to prevent infinite loops or huge quota usage
    let safeguard_limit = 500; 

    while has_more && total_fetched < safeguard_limit {
        let mut url = format!(
            "https://www.googleapis.com/youtube/v3/playlistItems?part=snippet&playlistId={}&maxResults={}&key={}",
            playlist_id, 
            std::cmp::min(max_results, 50), // API max is 50 per page
            api_key
        );

        if let Some(token) = &next_page_token {
            url.push_str(&format!("&pageToken={}", token));
        }

        let resp = client.get(&url).send().await?;
        if !resp.status().is_success() {
            let text = resp.text().await.unwrap_or_default();
            return Err(format!("API Error: {}", text).into());
        }

        let text = resp.text().await?;
        let list: PlaylistItemListResponse = serde_json::from_str(&text).map_err(|e| {
            format!(
                "Failed to parse PlaylistItemListResponse: {}. Response: {}",
                e, text
            )
        })?;

        if let Some(items) = list.items {
            if items.is_empty() {
                has_more = false;
            }

            for item in items {
                // Check date if provided
                if let Some(threshold) = after {
                    if let Some(published) = item.snippet.published_at {
                        if published < threshold {
                            has_more = false;
                            break; 
                        }
                    }
                }

                video_ids.push(item.snippet.resource_id.video_id);
                total_fetched += 1;
            }
        } else {
            has_more = false;
        }

        if has_more {
            next_page_token = list.next_page_token;
            if next_page_token.is_none() {
                has_more = false;
            }
        }
    }

    Ok(video_ids)
}

pub async fn get_video_details(
    client: &Client,
    api_key: &str,
    video_ids: &[String],
) -> Result<Vec<VideoResource>, Box<dyn Error>> {
    if video_ids.is_empty() {
        return Ok(Vec::new());
    }
    let ids_str = video_ids.join(",");
    let url = format!("https://www.googleapis.com/youtube/v3/videos?part=snippet,contentDetails,statistics&id={}&key={}", ids_str, api_key);

    let resp = client.get(&url).send().await?;
    let text = resp.text().await?;
    let list: VideoListResponse = serde_json::from_str(&text).map_err(|e| {
        format!(
            "Failed to parse VideoListResponse: {}. Response: {}",
            e, text
        )
    })?;

    Ok(list.items.unwrap_or_default())
}

pub fn parse_duration_to_seconds(iso_duration: &str) -> i64 {
    // Simple parser for PT#M#S, PT#H, etc.
    // Format is PT[n]H[n]M[n]S.
    let mut duration_str = iso_duration.to_string();
    if duration_str.starts_with("PT") {
        duration_str = duration_str[2..].to_string();
    }

    let mut total_seconds = 0;
    let mut current_num = String::new();

    for c in duration_str.chars() {
        if c.is_numeric() {
            current_num.push(c);
        } else {
            let val = current_num.parse::<i64>().unwrap_or(0);
            match c {
                'H' => total_seconds += val * 3600,
                'M' => total_seconds += val * 60,
                'S' => total_seconds += val,
                _ => {} // W, D, Y not commonly used in video duration but possible
            }
            current_num.clear();
        }
    }

    total_seconds
}
