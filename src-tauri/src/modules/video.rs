use crate::models::*;
use tauri::State;
use sqlx::sqlite::SqlitePool;

use crate::path_utils::construct_robust_path;

#[tauri::command(rename_all = "snake_case")]
pub async fn get_videos(
    pool: State<'_, SqlitePool>,
    page: i64,
    limit: i64,
    sort: Option<String>,
    filter_type: Option<String>,
    group_id: Option<i64>,
    favorites: Option<bool>,
    search: Option<String>,
    date_range: Option<String>,
    channel_id: Option<String>,
) -> Result<VideoResponse, String> {
    use sqlx::QueryBuilder;

    let limit = if limit <= 0 { 50 } else { limit };
    let offset = (page - 1) * limit;

    // 1. Build Count Query
    let mut count_builder: QueryBuilder<sqlx::Sqlite> = QueryBuilder::new(
        "SELECT COUNT(*) FROM videos v JOIN channels c ON v.channel_id = c.id WHERE 1=1"
    );
    
    // Filters for Count Query
    if let Some(s) = &search {
         if !s.is_empty() {
             let pattern = format!("%{}%", s);
             count_builder.push(" AND (v.title LIKE ");
             count_builder.push_bind(pattern.clone());
             count_builder.push(" OR c.name LIKE ");
             count_builder.push_bind(pattern);
             count_builder.push(")");
         }
    }

    if let Some(gid) = group_id {
         if gid == -1 {
            count_builder.push(" AND c.group_id IS NULL");
         } else {
            count_builder.push(" AND c.group_id = ");
            count_builder.push_bind(gid);
         }
    }

    if let Some(cid) = &channel_id {
        count_builder.push(" AND v.channel_id = ");
        count_builder.push_bind(cid.clone());
    }

    if matches!(favorites, Some(true)) {
        count_builder.push(" AND v.is_favorite = 1");
    }

    if let Some(ft) = &filter_type {
         match ft.as_str() {
             "video" => { count_builder.push(" AND v.is_short = 0"); }
             "short" => { count_builder.push(" AND v.is_short = 1"); }
             "favorites" => { count_builder.push(" AND v.is_favorite = 1"); }
             _ => {}
         }
    }

    if let Some(dr) = &date_range {
         let interval = match dr.as_str() {
             "3d" => Some("-3 days"),
             "7d" => Some("-7 days"),
             "30d" => Some("-30 days"),
             _ => None,
         };
         if let Some(int) = interval {
            count_builder.push(" AND v.published_at >= datetime('now', ");
            count_builder.push_bind(int);
            count_builder.push(")");
         }
    }

    let total: i64 = count_builder
        .build_query_scalar()
        .fetch_one(&*pool)
        .await
        .map_err(|e| format!("Count failed: {}", e))?;

    // 2. Build Data Query
    let mut query_builder: QueryBuilder<sqlx::Sqlite> = QueryBuilder::new(
        "SELECT v.id, v.title, v.url, v.thumbnail, v.published_at, v.view_count, v.like_count, v.comment_count,
                v.is_short, v.is_favorite, v.is_downloaded, v.local_path, v.channel_id, v.created_at, v.updated_at,
                v.download_status, v.download_error, v.downloaded_at,
                c.name as channel_name, c.thumbnail as channel_thumbnail,
                c.subscriber_count as subscriber_count,
                c.avg_views as avg_views,
                c.std_dev as std_dev
         FROM videos v
         JOIN channels c ON v.channel_id = c.id
         WHERE 1=1"
    );
    
    // Filters for Data Query (Duplicated logic to satisfy borrow checker)
    if let Some(s) = &search {
        if !s.is_empty() {
            let pattern = format!("%{}%", s);
            query_builder.push(" AND (v.title LIKE ");
            query_builder.push_bind(pattern.clone());
            query_builder.push(" OR c.name LIKE ");
            query_builder.push_bind(pattern);
            query_builder.push(")");
        }
   }

   if let Some(gid) = group_id {
        if gid == -1 {
            query_builder.push(" AND c.group_id IS NULL");
        } else {
            query_builder.push(" AND c.group_id = ");
            query_builder.push_bind(gid);
        }
   }

   if let Some(cid) = &channel_id {
       query_builder.push(" AND v.channel_id = ");
       query_builder.push_bind(cid.clone());
   }

   if matches!(favorites, Some(true)) {
       query_builder.push(" AND v.is_favorite = 1");
   }

   if let Some(ft) = &filter_type {
        match ft.as_str() {
            "video" => { query_builder.push(" AND v.is_short = 0"); }
            "short" => { query_builder.push(" AND v.is_short = 1"); }
            "favorites" => { query_builder.push(" AND v.is_favorite = 1"); }
            _ => {}
        }
   }

   if let Some(dr) = &date_range {
        let interval = match dr.as_str() {
            "3d" => Some("-3 days"),
            "7d" => Some("-7 days"),
            "30d" => Some("-30 days"),
            _ => None,
        };
        if let Some(int) = interval {
            query_builder.push(" AND v.published_at >= datetime('now', ");
            query_builder.push_bind(int);
            query_builder.push(")");
        }
   }

    let sort_sql = match sort.as_deref() {
        Some("view_count") => "v.view_count DESC",
        Some("published_at") => "v.published_at DESC",
        Some("viral") => "CAST(v.view_count AS REAL) / NULLIF(c.avg_views, 0) DESC",
        Some("vph") => "CAST(v.view_count AS REAL) / (MAX(1, (unixepoch('now') - unixepoch(v.published_at)) / 3600)) DESC",
        Some("z_score") => "(CAST(v.view_count AS REAL) - c.avg_views) / NULLIF(c.std_dev, 0) DESC",
        _ => "v.published_at DESC"
    };

    query_builder.push(" ORDER BY ");
    query_builder.push(sort_sql);
    query_builder.push(" LIMIT ");
    query_builder.push_bind(limit);
    query_builder.push(" OFFSET ");
    query_builder.push_bind(offset);

    let videos = query_builder
        .build_query_as::<VideoWithChannel>()
        .fetch_all(&*pool)
        .await
        .map_err(|e| e.to_string())?;

    Ok(VideoResponse {
        videos,
        has_more: total > (offset + limit),
        total,
    })
}

#[tauri::command(rename_all = "snake_case")]
pub async fn get_video(
    pool: State<'_, SqlitePool>,
    id: String,
) -> Result<VideoWithChannel, String> {

    sqlx::query_as::<_, VideoWithChannel>("SELECT 
        v.id, v.title, v.url, v.thumbnail, v.published_at, v.view_count, v.like_count, v.comment_count,
        v.is_short, v.is_favorite, v.is_downloaded AS is_downloaded, v.local_path AS local_path, v.channel_id, v.created_at, v.updated_at,
        v.download_status, v.download_error, v.downloaded_at,
        c.name as channel_name, c.thumbnail as channel_thumbnail,
        c.subscriber_count as subscriber_count,
        c.avg_views, c.std_dev
        FROM videos v
        JOIN channels c ON v.channel_id = c.id
        WHERE v.id = ?")
        .bind(id)
        .fetch_optional(&*pool)
        .await
        .map_err(|e| e.to_string())?
        .ok_or("Video not found".to_string())
}

#[tauri::command(rename_all = "snake_case")]
pub async fn toggle_video_favorite(pool: State<'_, SqlitePool>, id: String) -> Result<(), String> {
    // Use 1 - is_favorite to ensure 0/1 toggle works safely
    sqlx::query("UPDATE videos SET is_favorite = 1 - is_favorite WHERE id = ?")
        .bind(&id)
        .execute(&*pool)
        .await
        .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command(rename_all = "snake_case")]
pub async fn resolve_video_info(
    pool: State<'_, SqlitePool>,
    url: String,
) -> Result<serde_json::Value, String> {
    use std::process::Stdio;
    use tokio::process::Command;

    let settings: Option<(Option<String>, Option<String>)> =
        sqlx::query_as("SELECT proxy_url, cookie_source FROM settings LIMIT 1")
            .fetch_optional(&*pool)
            .await
            .map_err(|e| e.to_string())?;

    let (proxy_url, cookie_source) = settings.unwrap_or((None, None));

    let mut cmd = Command::new("yt-dlp");

    // Path Augmentation
    if let Ok(path) = std::env::var("PATH") {
        cmd.env("PATH", construct_robust_path(&path));
    }

    cmd.arg("-J").arg("--flat-playlist");

    if let Some(p) = proxy_url {
        if !p.is_empty() {
            cmd.arg("--proxy").arg(p);
        }
    }

    if let Some(c) = cookie_source {
        if !c.is_empty() && c != "none" && std::path::Path::new(&c).exists() {
            cmd.arg("--cookies").arg(c);
        }
    }

    cmd.arg(&url);

    cmd.stdout(Stdio::piped());
    cmd.stderr(Stdio::piped());

    let output = cmd.output().await.map_err(|e| e.to_string())?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!("yt-dlp failed: {}", stderr));
    }

    let stdout = String::from_utf8_lossy(&output.stdout);
    let json: serde_json::Value =
        serde_json::from_str(&stdout).map_err(|e| format!("Invalid JSON from yt-dlp: {}", e))?;

    let id = json["id"].as_str().unwrap_or("").to_string();
    let title = json["title"].as_str().unwrap_or("").to_string();
    let thumbnail = json["thumbnail"].as_str().unwrap_or("").to_string();
    let channel_name = json["uploader"].as_str().unwrap_or("").to_string();
    let channel_id = json["channel_id"].as_str().unwrap_or("").to_string();

    Ok(serde_json::json!({
        "id": id,
        "title": title,
        "thumbnail": thumbnail,
        "channelName": channel_name,
        "channelId": channel_id,
    }))
}
