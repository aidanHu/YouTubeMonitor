use crate::models::*;
use tauri::{State, Emitter};
use sqlx::sqlite::SqlitePool;
use sqlx::{Row, SqliteConnection};
use chrono::{DateTime, Utc, Duration};
use futures::stream::{self, StreamExt};
use std::sync::atomic::Ordering;
use crate::modules::common::sanitize_filename;

use crate::youtube_api;
use reqwest::Client;

#[tauri::command(rename_all = "snake_case")]
pub async fn get_channels(
    pool: State<'_, SqlitePool>,
    sort: Option<String>,
) -> Result<Vec<Channel>, String> {
    let sort_column = match sort.as_deref() {
        Some("created_at") => "c.created_at",
        Some("last_upload_at") => "c.last_upload_at",
        Some("view_count") => "c.view_count",
        Some("subscriber_count") => "c.subscriber_count",
        Some("video_count") => "c.video_count",
        _ => "c.created_at",
    };

    let query = format!(
        "SELECT 
        c.id, c.url, c.name, c.thumbnail, c.subscriber_count, c.view_count, c.video_count, 
        c.group_id, c.is_favorite, c.is_pinned, c.created_at, c.last_upload_at,
        g.id as group_id_join, g.name as group_name, g.is_pinned as group_is_pinned
        FROM channels c
        LEFT JOIN groups g ON c.group_id = g.id
        ORDER BY c.is_pinned DESC, {} DESC",
        sort_column
    );

    let rows = sqlx::query(&query)
        .fetch_all(&*pool)
        .await
        .map_err(|e| e.to_string())?;

    let mut channels = Vec::new();
    for row in rows {
        let group_id: Option<i64> = row.try_get("group_id").ok();
        let group = if let Some(gid) = row
            .try_get::<Option<i64>, _>("group_id_join")
            .ok()
            .flatten()
        {
            Some(Group {
                id: gid,
                name: row.try_get("group_name").unwrap_or_default(),
                is_pinned: row.try_get("group_is_pinned").unwrap_or(false),
                created_at: Utc::now(),
                updated_at: Utc::now(),
            })
        } else {
            None
        };

        channels.push(Channel {
            id: row.try_get("id").map_err(|e| e.to_string())?,
            url: row.try_get("url").map_err(|e| e.to_string())?,
            name: row.try_get("name").map_err(|e| e.to_string())?,
            thumbnail: row.try_get("thumbnail").ok(),
            subscriber_count: row.try_get("subscriber_count").unwrap_or(0),
            view_count: row.try_get("view_count").map_err(|e| e.to_string())?,
            video_count: row.try_get("video_count").unwrap_or(0),
            group_id,
            group,
            is_favorite: row.try_get("is_favorite").unwrap_or(false),
            is_pinned: row.try_get("is_pinned").unwrap_or(false),
            created_at: row.try_get("created_at").map_err(|e| e.to_string())?,
            last_upload_at: row.try_get("last_upload_at").ok(),
        });
    }

    Ok(channels)
}

#[tauri::command(rename_all = "snake_case")]
pub async fn cancel_add_channels(flag: State<'_, CancellationFlag>) -> Result<(), String> {
    flag.0.store(true, Ordering::Relaxed);
    Ok(())
}

#[tauri::command(rename_all = "snake_case")]
pub async fn add_channels(
    app: tauri::AppHandle,
    pool: State<'_, SqlitePool>,
    client: State<'_, Client>,
    cancel_flag: State<'_, CancellationFlag>,
    urls: Vec<String>,
    group_id: Option<i64>,
) -> Result<Vec<AddChannelResult>, String> {
    // Reset cancellation flag
    cancel_flag.0.store(false, Ordering::Relaxed);

    let total = urls.len();
    let processed_count = std::sync::Arc::new(std::sync::atomic::AtomicUsize::new(0));

    let stream = stream::iter(urls.into_iter())
        .map(|url| {
            let pool = pool.clone();
            let app = app.clone();
            let client = client.inner().clone();
            let cancel_flag = cancel_flag.0.clone();
            let processed_count = processed_count.clone();
            let group_id = group_id;

            async move {
                if cancel_flag.load(Ordering::Relaxed) {
                    return AddChannelResult {
                        url: url.clone(),
                        status: "cancelled".to_string(),
                        message: "Operation cancelled".to_string(),
                        channel_name: None,
                    };
                }

                let result = match add_single_channel(&pool, &client, &url, group_id).await {
                    Ok((name, _id)) => AddChannelResult {
                        url: url.clone(),
                        status: "success".to_string(),
                        message: "添加成功".to_string(),
                        channel_name: Some(name),
                    },
                    Err(e) => AddChannelResult {
                        url: url.clone(),
                        status: "error".to_string(),
                        message: e.to_string(),
                        channel_name: None,
                    },
                };

                let current = processed_count.fetch_add(1, Ordering::Relaxed) + 1;

                // Emit progress event
                let _ = app.emit(
                    "add-channel-progress",
                    AddChannelProgress {
                        current,
                        total,
                        url: url.clone(),
                        status: result.status.clone(),
                        message: result.message.clone(),
                    },
                );

                result
            }
        })
        .buffer_unordered(5);

    let results: Vec<AddChannelResult> = stream.collect().await;

    Ok(results)
}

fn extract_channel_identifier(url: &str) -> String {
    let url = url.trim();
    
    if url.starts_with("http") {
        if let Some(pos) = url.find("youtube.com/") {
            let path = &url[pos + 12..]; // after youtube.com/
            
            // Case: /channel/ID
            if path.starts_with("channel/") {
                let rest = &path[8..];
                return rest.split(|c| c == '/' || c == '?').next().unwrap_or(rest).to_string();
            }
            
            // Case: /@handle
            if path.starts_with('@') {
                 let rest = path;
                 return rest.split(|c| c == '/' || c == '?').next().unwrap_or(rest).to_string();
            }
            
            if let Some(at_pos) = path.find('@') {
                 let rest = &path[at_pos..];
                 return rest.split(|c| c == '/' || c == '?').next().unwrap_or(rest).to_string();
            }
        }
    }

    if url.starts_with('@') {
        return url.to_string();
    }
    
    url.to_string()
}

async fn add_single_channel(
    pool: &SqlitePool,
    client: &Client,
    url: &str,
    group_id: Option<i64>,
) -> Result<(String, String), Box<dyn std::error::Error>> {
    
    // 1. Get API Key from settings module
    let api_key = crate::modules::settings::get_active_api_key(pool).await.map_err(|e| e)?;

    // 2. Resolve Channel Info via API
    let identifier = extract_channel_identifier(url);

    // Optimization: Check if channel exists in DB first if we have a Channel ID (UC...)
    if identifier.starts_with("UC") {
        let exists: Option<(String,)> = sqlx::query_as("SELECT id FROM channels WHERE id = ?")
            .bind(&identifier)
            .fetch_optional(pool)
            .await?;

        if exists.is_some() {
            return Err("Channel already exists (Found locally)".into());
        }
    }

    let channel_res = youtube_api::get_channel_by_id_or_handle(&client, &api_key, &identifier)
        .await
        .map_err(|e| format!("API Error: {}", e))?;

    let channel_id = channel_res.id;
    let name = channel_res.snippet.title;
    let thumbnail = channel_res.snippet.thumbnails.get_best_url();

    // Parse stats
    let sub_count = channel_res
        .statistics.as_ref().and_then(|s| s.subscriber_count.as_ref()).and_then(|v| v.parse::<i64>().ok()).unwrap_or(0);
    let view_count = channel_res
        .statistics.as_ref().and_then(|s| s.view_count.as_ref()).and_then(|v| v.parse::<i64>().ok()).unwrap_or(0);
    let video_count = channel_res
        .statistics.as_ref().and_then(|s| s.video_count.as_ref()).and_then(|v| v.parse::<i64>().ok()).unwrap_or(0);

    // 3. Insert into DB
    let now = Utc::now();

    // Check exist
    let exists: Option<(String,)> = sqlx::query_as("SELECT id FROM channels WHERE id = ?")
        .bind(&channel_id)
        .fetch_optional(pool)
        .await?;

    if exists.is_some() {
        return Err("Channel already exists".into());
    }

    let _ = sqlx::query("INSERT INTO channels (id, url, name, thumbnail, subscriber_count, view_count, video_count, group_id, is_favorite, is_pinned, created_at, last_upload_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)")
        .bind(&channel_id)
        .bind(format!("https://www.youtube.com/channel/{}", channel_id))
        .bind(&name)
        .bind(thumbnail)
        .bind(sub_count)
        .bind(view_count)
        .bind(video_count)
        .bind(group_id)
        .bind(false)
        .bind(false)
        .bind(now)
        .bind(Option::<DateTime<Utc>>::None)
        .execute(pool)
        .await?;

    // 4. Sync recent videos
    if let Err(_e) = sync_channel_videos(pool, client, &channel_id, Some("now-30days".to_string())).await
    {
        // Ignore error
    }

    Ok((name, channel_id))
}

pub async fn sync_channel_videos(
    pool: &SqlitePool,
    client: &Client,
    channel_id: &str,
    date_range: Option<String>,
) -> Result<String, String> {
    let api_key = crate::modules::settings::get_active_api_key(pool).await?;

    // 1. Get Channel Details
    let channel_res = youtube_api::get_channel_by_id_or_handle(&client, &api_key, channel_id)
        .await
        .map_err(|e| format!("Failed to fetch channel info: {}", e))?;

    let uploads_id = channel_res
        .content_details
        .ok_or("Channel has no content details")?
        .related_playlists
        .uploads;

    // 2. Determine Date Threshold
    let threshold_date = match date_range.as_deref() {
        Some("all") => None,
        Some(s) if s.starts_with("now-") => {
            let part = &s[4..]; // remove "now-"
            let now = Utc::now();
            if part.ends_with("days") {
                 let num = part.trim_end_matches("days").parse::<i64>().unwrap_or(7);
                 Some(now - Duration::days(num))
            } else if part.ends_with("months") {
                 let num = part.trim_end_matches("months").parse::<i64>().unwrap_or(1);
                 Some(now - Duration::days(num * 30))
            } else if part.ends_with("year") {
                 let num = part.trim_end_matches("year").parse::<i64>().unwrap_or(1);
                 Some(now - Duration::days(num * 365))
            } else {
                 Some(now - Duration::days(7))
            }
        },
        _ => Some(Utc::now() - Duration::days(7)), // Default fallback
    };

    // 3. Fetch Uploads Playlist Items
    // Pass 50 as page size, but loop internally
    let video_ids = youtube_api::get_upload_playlist_items(&client, &api_key, &uploads_id, 50, threshold_date)
        .await
        .map_err(|e| format!("Failed to fetch uploads: {}", e))?;

    if video_ids.is_empty() {
        return Ok("No videos found".to_string());
    }

    // 4. Fetch Video Details
    let videos = youtube_api::get_video_details(&client, &api_key, &video_ids)
        .await
        .map_err(|e| format!("Failed to fetch video details: {}", e))?;

    // 5. Start Transaction for DB updates
    let mut tx = pool.begin().await.map_err(|e| e.to_string())?;

    // Update Channel Stats
    if let Some(stats) = channel_res.statistics {
        let sub_count = stats.subscriber_count.unwrap_or_default().parse::<i64>().unwrap_or(0);
        let view_count = stats.view_count.unwrap_or_default().parse::<i64>().unwrap_or(0);
        let video_count = stats.video_count.unwrap_or_default().parse::<i64>().unwrap_or(0);

        let _ = sqlx::query("UPDATE channels SET subscriber_count = ?, view_count = ?, video_count = ? WHERE id = ?")
            .bind(sub_count)
            .bind(view_count)
            .bind(video_count)
            .bind(channel_id)
            .execute(&mut *tx)
            .await;
    }

    let mut sync_count = 0;

    for video in videos {
        if let Some(threshold) = threshold_date {
            if video.snippet.published_at < threshold {
                continue;
            }
        }

        let duration_iso = video.content_details.as_ref().map(|d| d.duration.as_str()).unwrap_or("PT0S");
        let seconds = youtube_api::parse_duration_to_seconds(duration_iso);
        let is_short = seconds <= 60; 

        let thumb = video.snippet.thumbnails.get_best_url();
        let view_count = video.statistics.as_ref().and_then(|s| s.view_count.as_ref()).and_then(|v| v.parse::<i64>().ok()).unwrap_or(0);
        let like_count = video.statistics.as_ref().and_then(|s| s.like_count.as_ref()).and_then(|v| v.parse::<i64>().ok());
        let comment_count = video.statistics.as_ref().and_then(|s| s.comment_count.as_ref()).and_then(|v| v.parse::<i64>().ok());

        let url = format!("https://www.youtube.com/watch?v={}", video.id);

        let _ = sqlx::query("INSERT INTO videos (id, title, url, thumbnail, published_at, view_count, like_count, comment_count, is_short, channel_id, created_at, updated_at, is_favorite) 
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(id) DO UPDATE SET 
            title=excluded.title, 
            view_count=excluded.view_count, 
            like_count=excluded.like_count,
            comment_count=excluded.comment_count,
            updated_at=excluded.updated_at")
            .bind(&video.id)
            .bind(&video.snippet.title)
            .bind(url)
            .bind(thumb)
            .bind(video.snippet.published_at)
            .bind(view_count)
            .bind(like_count)
            .bind(comment_count)
            .bind(is_short)
            .bind(&video.snippet.channel_id)
            .bind(Utc::now())
            .bind(Utc::now())
            .bind(false)
            .execute(&mut *tx)
            .await;

        sync_count += 1;
    }

    let _ = update_channel_stats(&mut *tx, channel_id).await;

    tx.commit().await.map_err(|e| e.to_string())?;

    Ok(format!("Synced {} videos via API", sync_count))
}

pub async fn update_channel_stats(
    conn: &mut SqliteConnection,
    channel_id: &str,
) -> std::result::Result<(), sqlx::Error> {
    let views: Vec<i64> = sqlx::query_scalar(
        "SELECT view_count FROM videos WHERE channel_id = ? ORDER BY published_at DESC LIMIT 50",
    )
    .bind(channel_id)
    .fetch_all(&mut *conn)
    .await?;

    if views.is_empty() {
        return Ok(());
    }

    let count = views.len() as f64;
    let sum: f64 = views.iter().map(|&v| v as f64).sum();
    let mean = sum / count;

    let variance: f64 = views
        .iter()
        .map(|&v| {
            let diff = (v as f64) - mean;
            diff * diff
        })
        .sum::<f64>()
        / count;

    let std_dev = variance.sqrt();

    sqlx::query("UPDATE channels SET avg_views = ?, std_dev = ?, last_upload_at = (SELECT MAX(published_at) FROM videos WHERE channel_id = ?) WHERE id = ?")
        .bind(mean)
        .bind(std_dev)
        .bind(channel_id)
        .bind(channel_id)
        .execute(&mut *conn)
        .await?;

    Ok(())
}

#[tauri::command(rename_all = "snake_case")]
pub async fn refresh_channel(
    pool: State<'_, SqlitePool>,
    client: State<'_, Client>,
    channel_id: String,
    date_range: Option<String>,
) -> Result<String, String> {
    sync_channel_videos(&pool, &client, &channel_id, date_range).await
}

#[tauri::command(rename_all = "snake_case")]
pub async fn refresh_all_channels(
    app: tauri::AppHandle,
    pool: State<'_, SqlitePool>,
    client: State<'_, Client>,
    date_range: Option<String>,
    group_id: Option<i64>,
) -> Result<(), String> {
    sync_all_channels_inner(app, pool.inner().clone(), client.inner().clone(), date_range, group_id).await
}

pub async fn sync_all_channels_inner(
    app: tauri::AppHandle,
    pool: SqlitePool,
    client: Client,
    date_range: Option<String>,
    group_id: Option<i64>,
) -> Result<(), String> {
    
    let channels: Vec<(String, String)> = if let Some(gid) = group_id {
        if gid == -1 {
            sqlx::query_as("SELECT id, name FROM channels WHERE group_id IS NULL")
                .fetch_all(&pool)
                .await
                .map_err(|e| e.to_string())?
        } else {
            sqlx::query_as("SELECT id, name FROM channels WHERE group_id = ?")
                .bind(gid)
                .fetch_all(&pool)
                .await
                .map_err(|e| e.to_string())?
        }
    } else {
        sqlx::query_as("SELECT id, name FROM channels")
            .fetch_all(&pool)
            .await
            .map_err(|e| e.to_string())?
    };

    let total = channels.len();
    if total == 0 {
        return Ok(());
    }

    let date_range = date_range.clone();

    tauri::async_runtime::spawn(async move {
        use std::sync::Arc;
        use std::sync::atomic::{AtomicBool, Ordering, AtomicUsize};

        let fatal_error = Arc::new(AtomicBool::new(false));
        let processed_count = Arc::new(AtomicUsize::new(0));

        let stream = stream::iter(channels.into_iter())
            .map(|(id, name)| {
                let pool = pool.clone();
                let client = client.clone();
                let date_range = date_range.clone();
                let app = app.clone();
                let fatal_error = fatal_error.clone();
                let processed_count = processed_count.clone();

                async move {
                    if fatal_error.load(Ordering::Relaxed) {
                        return;
                    }

                    // Calculate current index for UI
                    let current = processed_count.fetch_add(1, Ordering::Relaxed) + 1;

                    let _ = app.emit(
                        "refresh-all-progress",
                        serde_json::json!({
                            "current": current,
                            "total": total,
                            "channel": name,
                            "status": "processing"
                        }),
                    );

                    match sync_channel_videos(&pool, &client, &id, date_range).await {
                        Ok(_) => {}
                        Err(e) => {
                            // Circuit Breaker for Quota Errors
                            if e.contains("quota") || e.contains("403") {
                                fatal_error.store(true, Ordering::Relaxed);
                            }

                            let _ = app.emit(
                                "refresh-all-progress",
                                serde_json::json!({
                                    "current": current,
                                    "total": total,
                                    "channel": name,
                                    "status": "error",
                                    "error": e
                                }),
                            );
                        }
                    }
                }
            })
            // This is the Magic: Bounds the number of concurrent futures!
            .buffer_unordered(5); 

        // Drive the stream to completion
        stream.collect::<Vec<_>>().await;

        let _ = app.emit("refresh-all-complete", ());
    });

    Ok(())
}

pub fn init_background_sync(app: tauri::AppHandle) {
    let app_handle = app.clone();
    tauri::async_runtime::spawn(async move {
        loop {
            tokio::time::sleep(tokio::time::Duration::from_secs(60 * 60)).await; // 1 hour

            use tauri::Manager;
            if let Some(pool) = app_handle.try_state::<SqlitePool>() {
                if let Some(client) = app_handle.try_state::<reqwest::Client>() {
                     let _ = sync_all_channels_inner(app_handle.clone(), pool.inner().clone(), client.inner().clone(), Some("7d".to_string()), None).await;
                }
            }
        }
    });
}

#[tauri::command(rename_all = "snake_case")]
pub async fn delete_channel(pool: State<'_, SqlitePool>, id: String) -> Result<(), String> {
    let mut tx = pool.begin().await.map_err(|e| e.to_string())?;

    sqlx::query("DELETE FROM videos WHERE channel_id = ?")
        .bind(&id)
        .execute(&mut *tx)
        .await
        .map_err(|e| e.to_string())?;

    sqlx::query("DELETE FROM channels WHERE id = ?")
        .bind(&id)
        .execute(&mut *tx)
        .await
        .map_err(|e| e.to_string())?;

    tx.commit().await.map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command(rename_all = "snake_case")]
pub async fn move_channel(
    pool: State<'_, SqlitePool>,
    id: String,
    group_id: Option<i64>,
) -> Result<MoveChannelResult, String> {
    #[derive(sqlx::FromRow)]
    struct ChannelInfo {
        name: String,
        group_id: Option<i64>,
        old_group_name: Option<String>,
    }

    let channel: ChannelInfo = sqlx::query_as(
        "SELECT c.name, c.group_id, g.name as old_group_name 
         FROM channels c 
         LEFT JOIN groups g ON c.group_id = g.id 
         WHERE c.id = ?",
    )
    .bind(&id)
    .fetch_one(&*pool)
    .await
    .map_err(|e| e.to_string())?;

    if channel.group_id == group_id {
        return Ok(MoveChannelResult {
            moved: false,
            message: "分组未变化".to_string(),
        });
    }

    let new_group_name = if let Some(gid) = group_id {
        sqlx::query_scalar::<_, String>("SELECT name FROM groups WHERE id = ?")
            .bind(gid)
            .fetch_one(&*pool)
            .await
            .map_err(|e| e.to_string())?
    } else {
        "未分组".to_string()
    };

    let download_path: Option<String> =
        sqlx::query_scalar("SELECT download_path FROM settings LIMIT 1")
            .fetch_optional(&*pool)
            .await
            .map_err(|e| e.to_string())?;

    let mut file_moved = false;
    let mut move_message = String::new();

    if let Some(base_path_str) = download_path {
        if !base_path_str.is_empty() {
            let base_path = std::path::Path::new(&base_path_str);

            let safe_channel = sanitize_filename(&channel.name);
            let old_group = channel
                .old_group_name
                .unwrap_or_else(|| "未分组".to_string());
            let safe_old_group = sanitize_filename(&old_group);
            let safe_new_group = sanitize_filename(&new_group_name);

            let old_path = base_path.join(&safe_old_group).join(&safe_channel);
            let new_group_path = base_path.join(&safe_new_group);
            let new_path = new_group_path.join(&safe_channel);

            if !new_group_path.exists() {
                let _ = std::fs::create_dir_all(&new_group_path);
            }

            if old_path.exists() && old_path != new_path {
                if old_path.is_dir() {
                    if !new_path.exists() {
                        match std::fs::rename(&old_path, &new_path) {
                            Ok(_) => {
                                file_moved = true;
                                move_message = format!("已将文件夹移动到: {}", new_group_name);
                            }
                            Err(e) => {
                                move_message = format!("文件夹移动失败: {}", e);
                            }
                        }
                    } else {
                        move_message = "目标文件夹已存在,跳过移动".to_string();
                    }
                }
            }
        }
    }

    sqlx::query("UPDATE channels SET group_id = ? WHERE id = ?")
        .bind(group_id)
        .bind(&id)
        .execute(&*pool)
        .await
        .map_err(|e| e.to_string())?;

    let final_message = if file_moved {
        move_message
    } else if !move_message.is_empty() {
        format!("分组已更新 ({})", move_message)
    } else {
        "分组已更新".to_string()
    };

    Ok(MoveChannelResult {
        moved: file_moved,
        message: final_message,
    })
}

#[tauri::command(rename_all = "snake_case")]
pub async fn toggle_channel_pin(
    pool: State<'_, SqlitePool>,
    id: String,
    is_pinned: bool,
) -> Result<(), String> {
    sqlx::query("UPDATE channels SET is_pinned = ? WHERE id = ?")
        .bind(is_pinned)
        .bind(id)
        .execute(&*pool)
        .await
        .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command(rename_all = "snake_case")]
pub async fn toggle_channel_favorite(
    pool: State<'_, SqlitePool>,
    id: String,
    is_favorite: bool,
) -> Result<(), String> {
    sqlx::query("UPDATE channels SET is_favorite = ? WHERE id = ?")
        .bind(is_favorite)
        .bind(id)
        .execute(&*pool)
        .await
        .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command(rename_all = "snake_case")]
pub async fn get_channel_details(
    pool: State<'_, SqlitePool>,
    id: String,
) -> Result<ChannelDetails, String> {
    let channel = sqlx::query_as::<_, ChannelDb>("SELECT * FROM channels WHERE id = ?")
        .bind(&id)
        .fetch_optional(&*pool)
        .await
        .map_err(|e| e.to_string())?
        .ok_or("Channel not found")?;

    let videos = sqlx::query_as::<_, Video>(
        "SELECT 
        id, title, url, thumbnail, published_at, view_count, like_count, comment_count,
        is_short, is_favorite, is_downloaded, local_path, channel_id, created_at, updated_at,
        download_status, download_error, downloaded_at
        FROM videos WHERE channel_id = ? ORDER BY published_at DESC",
    )
    .bind(&id)
    .fetch_all(&*pool)
    .await
    .map_err(|e| e.to_string())?;

    let group = if let Some(gid) = channel.group_id {
        sqlx::query_as::<_, Group>("SELECT * FROM groups WHERE id = ?")
            .bind(gid)
            .fetch_optional(&*pool)
            .await
            .map_err(|e| e.to_string())?
    } else {
        None
    };

    Ok(ChannelDetails {
        channel,
        videos,
        group,
    })
}
