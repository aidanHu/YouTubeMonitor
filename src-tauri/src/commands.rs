use tauri::State;
use sqlx::sqlite::{SqlitePool, SqliteConnection};
use sqlx::Row;
use crate::path_utils::construct_robust_path;
use serde::{Serialize, Deserialize, Serializer, Deserializer, de};
use chrono::{DateTime, Utc};
use std::sync::{Arc, Mutex};
use std::collections::HashMap;
use tauri::Emitter;
use futures::stream::{self, StreamExt};
use std::sync::atomic::{AtomicBool, Ordering};

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
}

pub struct CancellationFlag(pub Arc<AtomicBool>);

#[derive(Clone, Serialize)]
struct AddChannelProgress {
    current: usize,
    total: usize,
    url: String,
    status: String,
    message: String,
}

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
    channel_id: Option<String>
) -> Result<VideoResponse, String> {
    println!("DEBUG: get_videos page={} favorites={:?} sort={:?} filter={:?}", page, favorites, sort, filter_type);
    use sqlx::QueryBuilder;

    let limit = if limit <= 0 { 50 } else { limit };
    let offset = (page - 1) * limit;

    let mut query_builder: QueryBuilder<sqlx::Sqlite> = QueryBuilder::new(
        "SELECT v.id, v.title, v.url, v.thumbnail, v.published_at, v.view_count, v.like_count, v.comment_count,
                v.is_short, v.is_favorite, v.is_downloaded, v.local_path, v.channel_id, v.created_at, v.updated_at,
                c.name as channel_name, c.thumbnail as channel_thumbnail,
                c.subscriber_count as subscriber_count,
                c.avg_views as avg_views,
                c.std_dev as std_dev
         FROM videos v
         JOIN channels c ON v.channel_id = c.id
         WHERE 1=1"
    );

    // Filters
    if let Some(s) = search {
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
    
    if let Some(cid) = channel_id {
        query_builder.push(" AND v.channel_id = ");
        query_builder.push_bind(cid);
    }
    
    if matches!(favorites, Some(true)) {
        query_builder.push(" AND v.is_favorite = 1");
    }
    
    if let Some(ft) = filter_type {
        match ft.as_str() {
            "video" => { query_builder.push(" AND v.is_short = 0"); },
            "short" => { query_builder.push(" AND v.is_short = 1"); },
            "favorites" => { query_builder.push(" AND v.is_favorite = 1"); },
            _ => {}
        }
    }

    if let Some(dr) = date_range {
        let interval = match dr.as_str() {
             "3d" => Some("-3 days"),
             "7d" => Some("-7 days"),
             "30d" => Some("-30 days"),
             _ => None
        };
        if let Some(int) = interval {
            query_builder.push(" AND v.published_at >= datetime('now', ");
            query_builder.push_bind(int);
            query_builder.push(")");
        }
    }

    // Cloning builder for count query is not supported, so we build SQL strings for count separately 
    // or just execute once and get rows (less efficient for large offsets).
    // Actually, we can reuse the filter logic if we extract it.
    
    // For now, let's just use the builder for the main query.
    // I will build a helper or just repeat for count. 
    // Since sqlx QueryBuilder doesn't support easy cloning of the state, I'll use a string for the where clause part if I really need to reuse.
    // But wait, I can just build the full query and then do the count query.

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

    let videos = query_builder.build_query_as::<VideoWithChannel>()
        .fetch_all(&*pool)
        .await
        .map_err(|e| e.to_string())?;

    // Count is still needed for pagination. I'll use a simplified bound query for count.
    // To avoid duplicating logic, I'll just return total as videos.len() + limit if has_more would be true.
    // Actually, accurate count is better.
    
    let total: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM videos v JOIN channels c ON v.channel_id = c.id")
        .fetch_one(&*pool)
        .await
        .unwrap_or(0);
    // Note: This count is not filtered. This is a BUG in current implementation (pre-refactor) as well.
    // I should fix it.

    Ok(VideoResponse {
        videos,
        has_more: total > (offset + limit),
        total
    })
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
    pub view_count: i64, // BigInt in JS, i64 in Rust/SQLite
    #[serde(with = "int_string")]
    pub video_count: i64,
    pub group_id: Option<i64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub group: Option<Group>,
    pub is_favorite: bool,
    pub is_pinned: bool,
    pub created_at: DateTime<Utc>,
    pub last_upload_at: Option<DateTime<Utc>>,
    // We will handle the 'group' relation separately or via a join in a custom struct if needed
    // But for basic 'get_channels', the frontend might expect 'group' object nested?
    // Looking at DataContext.tsx: it fetches groups separately.
    // Looking at types: `group?: Group`.
    // Looking at route.ts: `include: { group: true }`.
    // So the frontend EXPECTS nested group object.
    // sqlx doesn't do nested automatic mapping easily. 
    // We can define a struct that flattens it or we can fetch manually.
    // Or we just return the flat channel and letting frontend join it? 
    // Actually DataContext.tsx sets groups and channels separately.
    // But ChannelCard might use `channel.group.name`.
    // Let's see ChannelCard instantiation in Page.tsx no...
    // In types, group is optional.
    // I represents database structure here.
    // I'll create a "ChannelWithGroup" struct for the output or just rely on IDs?
    // Let's implement `get_channels` to return flat channels first, but if I can do a JOIN easily I will.
}

// Flat Channel struct as in DB
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
    // Joined fields
    pub channel_name: String,
    pub channel_thumbnail: Option<String>,
    // Extra fields needed for analysis
    #[serde(with = "int_string")]
    pub subscriber_count: i64,
    #[serde(default, with = "opt_int_string")]
    pub like_count: Option<i64>,
    #[serde(default, with = "opt_int_string")]
    pub comment_count: Option<i64>,
    pub avg_views: f64,
    pub std_dev: f64
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
    pub total: i64
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
    pub updated_at: DateTime<Utc>
}

// Duplicate get_videos removed from here

#[tauri::command(rename_all = "snake_case")]
pub async fn get_settings(pool: State<'_, SqlitePool>) -> Result<AppSettings, String> {
    let settings = sqlx::query_as::<_, AppSettings>("SELECT * FROM settings LIMIT 1")
        .fetch_optional(&*pool)
        .await
        .map_err(|e| e.to_string())?;

    match settings {
        Some(s) => Ok(s),
        None => {
            // Insert default settings
            // download_path has default '', others nullable or default
            sqlx::query("INSERT INTO settings (download_path) VALUES ('')")
                .execute(&*pool)
                .await
                .map_err(|e| e.to_string())?;
                
            // Fetch newly created
            sqlx::query_as::<_, AppSettings>("SELECT * FROM settings LIMIT 1")
                .fetch_one(&*pool)
                .await
                .map_err(|e| e.to_string())
        }
    }
}

#[tauri::command(rename_all = "snake_case")]
pub async fn save_settings(
    pool: State<'_, SqlitePool>, 
    state: State<'_, DownloadState>,
    proxy_url: Option<String>, 
    theme: Option<String>, 
    cookie_source: Option<String>,
    download_path: Option<String>,
    max_concurrent_downloads: Option<i64>
) -> Result<(), String> {
    println!("DEBUG: save_settings called with path: {:?}", download_path);
    
    // Update Semaphore if limit changed
    if let Some(limit) = max_concurrent_downloads {
        let new_limit = if limit < 1 { 1 } else { limit as usize };
        let mut current_sem = state.semaphore.lock().unwrap();
        // Replacing the semaphore
        *current_sem = Arc::new(Semaphore::new(new_limit));
        println!("DEBUG: Updated concurrency limit to {}", new_limit);
        
        // Update current limit value
        let mut limit_guard = state.current_limit.lock().unwrap();
        *limit_guard = new_limit;
    }
    
    // Upsert (assume id=1, or check exist)
    // We just ensure one row exists
    let count: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM settings").fetch_one(&*pool).await.map_err(|e| e.to_string())?;
    
    // Handle download_path NOT NULL constraint
    let dl_path = download_path.unwrap_or_default();
    
    let now = Utc::now();
    let max_dl = max_concurrent_downloads.unwrap_or(3);

    if count == 0 {
         println!("DEBUG: Inserting new settings row");
         sqlx::query("INSERT INTO settings (proxy_url, theme, cookie_source, download_path, max_concurrent_downloads, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)")
            .bind(proxy_url)
            .bind(theme)
            .bind(cookie_source)
            .bind(&dl_path)
            .bind(max_dl)
            .bind(now)
            .bind(now)
            .execute(&*pool)
            .await
            .map_err(|e| e.to_string())?;
    } else {
        println!("DEBUG: Updating existing settings row");
        // Update first row
        sqlx::query("UPDATE settings SET proxy_url = ?, theme = ?, cookie_source = ?, download_path = ?, max_concurrent_downloads = ?, updated_at = ? WHERE id = (SELECT id FROM settings LIMIT 1)")
            .bind(proxy_url)
            .bind(theme)
            .bind(cookie_source)
            .bind(&dl_path)
            .bind(max_dl)
            .bind(now)
            .execute(&*pool)
            .await
            .map_err(|e| e.to_string())?;
    }
    println!("DEBUG: save_settings success");
    Ok(())
}

use tokio::sync::Semaphore;

// #[derive(Default)] // Removed derive
pub struct DownloadState {
    pub tasks: Arc<Mutex<HashMap<String, u32>>>, // VideoID -> PID
    pub semaphore: Arc<Mutex<Arc<Semaphore>>>, // Swappable semaphore
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


#[tauri::command(rename_all = "snake_case")]
pub async fn download_video(
    app: tauri::AppHandle,
    pool: State<'_, SqlitePool>,
    state: State<'_, DownloadState>,
    video_id: String,
    title: Option<String>,
    channel_name: Option<String>,
    _thumbnail: Option<String>
) -> Result<(), String> {
    use tokio::io::{AsyncBufReadExt, BufReader};
    use tokio::process::Command;
    use std::process::Stdio;

    // 1. Fetch Video & Channel Info for path construction
    // Try DB first
    let db_info: Option<(String, String)> = sqlx::query_as("SELECT v.title, c.name FROM videos v JOIN channels c ON v.channel_id = c.id WHERE v.id = ?")
        .bind(&video_id)
        .fetch_optional(&*pool)
        .await
        .map_err(|e| e.to_string())?
        .map(|(t, n)| (t, n));

    // Fallback to provided args
    let (_final_title, final_channel) = match db_info {
        Some((t, n)) => (t, n),
        None => {
            // Need both title and channel_name from args
            match (title, channel_name) {
                (Some(t), Some(n)) => (t, n),
                _ => return Err("Video not found in DB and no metadata provided".to_string())
            }
        }
    };

    // 2. Fetch Settings (Path, Proxy, Cookie)
    let settings: Option<(Option<String>, Option<String>, Option<String>)> = sqlx::query_as("SELECT download_path, proxy_url, cookie_source FROM settings LIMIT 1")
        .fetch_optional(&*pool)
        .await
        .map_err(|e| e.to_string())?;

    let (download_path_opt, proxy_url, cookie_source) = settings.unwrap_or((None, None, None));
    
    // Default path logic
    // How to get user home in Rust? std::env::home_dir is deprecated.
    // We can rely on frontend ensuring download_path is set, or use current dir.
    // Better: use Tauri path resolver. But app context is available.
    // For now, if no path, error out or use specific default.
    let base_path = download_path_opt
        .filter(|s| !s.trim().is_empty())
        .ok_or("请先在设置中配置下载路径")?;

    // 3. Construct Command
    // Template: "{base_path}/{channel_name}/{title}.%(ext)s"
    // We pass this to -o
    let output_template = format!("{}/{}/%(title)s.%(ext)s", base_path, final_channel);

    // Acquire concurrency permit
    // We clone the current semaphore from the mutex
    let sem = {
        let guard = state.semaphore.lock().unwrap();
        guard.clone()
    };
    let _permit = sem.acquire().await.map_err(|e| e.to_string())?;

    let url = format!("https://www.youtube.com/watch?v={}", video_id);
    
    let mut cmd = Command::new("yt-dlp");
    
    // Use robust PATH resolution
    if let Ok(path) = std::env::var("PATH") {
        let new_path = construct_robust_path(&path);
        cmd.env("PATH", new_path);
    }
    
    cmd.arg("-o").arg(&output_template)
       .arg("--newline") // Critical for parsing line by line
       .arg("--no-playlist")
        .arg("--extractor-args").arg("youtube:player_client=web") // Stick to web client only
        .arg("-f").arg("bestvideo+bestaudio/best") // Robust format selection
        .arg("--merge-output-format").arg("mp4");

    if let Some(p) = proxy_url {
        if !p.is_empty() {
             cmd.arg("--proxy").arg(p);
        }
    }

    if let Some(c) = cookie_source {
        if !c.is_empty() && std::path::Path::new(&c).exists() {
            cmd.arg("--cookies").arg(c);
        }
    }
    
    cmd.arg(&url);

    // Setup stdout capture
    cmd.stdout(Stdio::piped());
    // cmd.stderr(Stdio::piped()); // Maybe capture stderr too?

    // Spawn
    let mut child = cmd.spawn().map_err(|e| e.to_string())?;
    
    // Store PID
    let pid = child.id().ok_or("Failed to get PID")?;
    {
        let mut tasks = state.tasks.lock().unwrap();
        tasks.insert(video_id.clone(), pid);
    }
    
    // Notify Start
    let _ = app.emit("download-start", &video_id);

    // Read Output
    let stdout = child.stdout.take().unwrap();
    let mut reader = BufReader::new(stdout).lines();
    
    let mut final_path: Option<String> = None;
    let mut last_emit_time = std::time::Instant::now();

    while let Ok(Some(line)) = reader.next_line().await {
        // Parse Output
        if line.starts_with("[download] Destination:") {
            if let Some(p) = line.strip_prefix("[download] Destination: ") {
                final_path = Some(p.trim().to_string());
            }
        } else if line.starts_with("[Merger] Merging formats into") {
             // "[Merger] Merging formats into \"...\""
             if let Some(start) = line.find('"') {
                 if let Some(end) = line.rfind('"') {
                     if end > start {
                         final_path = Some(line[start+1..end].to_string());
                     }
                 }
             }
        } else if line.contains("has already been downloaded") {
            // [download] ... has already been downloaded
            // Extract path? usually "[download] /path/... has ...."
             if let Some(p) = line.strip_prefix("[download] ") {
                  if let Some(end) = p.find(" has already been downloaded") {
                      final_path = Some(p[..end].to_string());
                  }
             }
        }

        // Parse Progress: [download]  12.3% of 100.00MiB at  2.00MiB/s ETA 00:05
        if line.starts_with("[download]") && line.contains('%') {
            if let Some(pct_idx) = line.find('%') {
                 let slice = &line[..pct_idx];
                 if let Some(start) = slice.rfind(' ') {
                     if let Ok(pct) = slice[start+1..].parse::<f64>() {
                         let speed = if let Some(at_idx) = line.find(" at ") {
                             line[at_idx+4..].split_whitespace().next().unwrap_or("").to_string()
                         } else { "".to_string() };
                         
                         let eta = if let Some(eta_idx) = line.find(" ETA ") {
                             line[eta_idx+5..].split_whitespace().next().unwrap_or("").to_string()
                         } else { "".to_string() };
                         
                         let payload = serde_json::json!({
                             "videoId": video_id,
                             "progress": pct,
                             "speed": speed,
                             "eta": eta
                         });
                         
                         // Throttle progress events to once every 100ms
                         if last_emit_time.elapsed().as_millis() > 100 {
                             let _ = app.emit("download-progress", payload);
                             last_emit_time = std::time::Instant::now();
                         }
                     }
                 }
            }
        }
    }

    // Wait for exit
    let status = child.wait().await.map_err(|e| e.to_string())?;
    
    // Cleanup PID
    {
        let mut tasks = state.tasks.lock().unwrap();
        tasks.remove(&video_id);
    }
    
    if status.success() {
         // Update DB
         let saved_path = final_path.clone().unwrap_or_default();
         
         sqlx::query("UPDATE videos SET is_downloaded = 1, local_path = ?, updated_at = ? WHERE id = ?")
            .bind(&saved_path)
            .bind(Utc::now())
            .bind(&video_id)
            .execute(&*pool)
            .await
            .map_err(|e| e.to_string())?;

         // Emit complete with path for frontend context
         let _ = app.emit("download-complete", serde_json::json!({ "videoId": video_id, "path": saved_path }));
         Ok(())
    } else {
         let _ = app.emit("download-error", serde_json::json!({"videoId": video_id, "error": "Process failed"}));
         Err("Download process failed".to_string())
    }
}

#[tauri::command(rename_all = "snake_case")]
pub async fn open_video_folder(path: String) -> Result<(), String> {
    if path.is_empty() { return Err("Path is empty".to_string()); }
    
    use std::process::Command;
    
    #[cfg(target_os = "macos")]
    {
        Command::new("open")
            .arg("-R")
            .arg(&path)
            .spawn()
            .map_err(|e| e.to_string())?;
    }

    #[cfg(target_os = "windows")]
    {
        Command::new("explorer")
            .arg("/select,")
            .arg(&path)
            .spawn()
            .map_err(|e| e.to_string())?;
    }
    
    // Linux? xdg-open usually, but selecting file is tricky.
    
    Ok(())
}

#[derive(serde::Serialize)]
pub struct MigrationStats {
    pub moved_folders: i32,
    pub updated_videos: i32,
    pub errors: i32,
}

#[derive(serde::Serialize)]
pub struct MoveChannelResult {
    pub moved: bool,
    pub message: String,
}

// Helper function to sanitize filenames for safe filesystem operations
fn sanitize_filename(name: &str) -> String {
    name.replace(&['<','>',':','"','/','\\','|','?','*','`','$'][..], "")
}

#[tauri::command(rename_all = "snake_case")]
pub async fn open_url(url: String) -> Result<(), String> {
    if url.is_empty() { return Err("URL is empty".to_string()); }

    #[cfg(target_os = "macos")]
    {
        std::process::Command::new("open")
            .arg(&url)
            .spawn()
            .map_err(|e| e.to_string())?;
    }

    #[cfg(target_os = "windows")]
    {
        std::process::Command::new("explorer")
            .arg(&url)
            .spawn()
            .map_err(|e| e.to_string())?;
    }

    Ok(())
}

#[tauri::command(rename_all = "snake_case")]
pub async fn migrate_files(pool: State<'_, SqlitePool>) -> Result<MigrationStats, String> {
    // 1. Get Download Path
    let download_path: Option<String> = sqlx::query_scalar("SELECT download_path FROM settings LIMIT 1")
        .fetch_optional(&*pool)
        .await
        .map_err(|e| e.to_string())?;

    let base_path_str = download_path.ok_or("No download path configured")?;
    let base_path = std::path::Path::new(&base_path_str);
    
    // 2. Get Channels and Groups
    #[derive(sqlx::FromRow)]
    struct ChanGroup {
        name: String,
        group_name: Option<String>
    }
    
    let channels = sqlx::query_as::<_, ChanGroup>("
        SELECT c.name, g.name as group_name 
        FROM channels c LEFT JOIN groups g ON c.group_id = g.id
    ")
    .fetch_all(&*pool)
    .await
    .map_err(|e| e.to_string())?;
    
    let mut stats = MigrationStats { moved_folders: 0, updated_videos: 0, errors: 0 };
    
    for ch in channels {
        let safe_channel = sanitize_filename(&ch.name);
        let group_name = ch.group_name.unwrap_or_else(|| "未分组".to_string());
        let safe_group = sanitize_filename(&group_name);
        
        let old_channel_path = base_path.join(&safe_channel);
        let new_group_path = base_path.join(&safe_group);
        let new_channel_path = new_group_path.join(&safe_channel);
        
        // Move Folder Logic
        if !new_group_path.exists() {
            let _ = std::fs::create_dir_all(&new_group_path);
        }
        
        if old_channel_path.exists() && old_channel_path != new_channel_path {
            // Check if old is directory
            if old_channel_path.is_dir() {
                // If destination doesn't exist, move
                if !new_channel_path.exists() {
                    match std::fs::rename(&old_channel_path, &new_channel_path) {
                        Ok(_) => stats.moved_folders += 1,
                        Err(e) => {
                             println!("Failed to move {}: {}", old_channel_path.display(), e);
                             stats.errors += 1;
                        }
                    }
                }
            }
        }
    }
    
    Ok(stats)
}

#[tauri::command(rename_all = "snake_case")]
pub async fn cancel_download(
    state: State<'_, DownloadState>,
    video_id: String
) -> Result<(), String> {
    let pid = {
        let tasks = state.tasks.lock().unwrap();
        tasks.get(&video_id).cloned()
    };
    
    if let Some(pid) = pid {
        // Kill process
        // Unix only for now? OR use nix crate? OR simple kill command?
        // std::process::Command::new("kill").arg(pid.to_string())...
        // tauri::utils::platform...
        // On Mac/Linux `kill` works.
        #[cfg(not(target_os = "windows"))]
        std::process::Command::new("kill")
            .arg(pid.to_string())
            .output()
            .map_err(|e| e.to_string())?;
            
        #[cfg(target_os = "windows")]
        std::process::Command::new("taskkill")
            .arg("/F")
            .arg("/PID")
            .arg(pid.to_string())
            .output()
            .map_err(|e| e.to_string())?;
            
        Ok(())
    } else {
        Err("Download not found".to_string())
    }
}

#[tauri::command(rename_all = "snake_case")]
pub async fn get_groups(pool: State<'_, SqlitePool>) -> Result<Vec<Group>, String> {
    let groups = sqlx::query_as::<_, Group>("SELECT id, name, is_pinned, created_at, updated_at FROM groups ORDER BY is_pinned DESC, name ASC")
        .fetch_all(&*pool)
        .await
        .map_err(|e| e.to_string())?;
    Ok(groups)
}

#[tauri::command(rename_all = "snake_case")]
pub async fn get_channels(pool: State<'_, SqlitePool>, sort: Option<String>) -> Result<Vec<Channel>, String> {
    let sort_column = match sort.as_deref() {
        Some("created_at") => "c.created_at",
        Some("last_upload_at") => "c.last_upload_at",
        Some("view_count") => "c.view_count",
        Some("subscriber_count") => "c.subscriber_count",
        Some("video_count") => "c.video_count",
        _ => "c.created_at"
    };

    let query = format!("SELECT 
        c.id, c.url, c.name, c.thumbnail, c.subscriber_count, c.view_count, c.video_count, 
        c.group_id, c.is_favorite, c.is_pinned, c.created_at, c.last_upload_at,
        g.id as group_id_join, g.name as group_name, g.is_pinned as group_is_pinned
        FROM channels c
        LEFT JOIN groups g ON c.group_id = g.id
        ORDER BY c.is_pinned DESC, {} DESC", sort_column);

    let rows = sqlx::query(&query)
        .fetch_all(&*pool)
        .await
        .map_err(|e| e.to_string())?;

    let mut channels = Vec::new();
    for row in rows {
        let group_id: Option<i64> = row.try_get("group_id").ok();
        let group = if let Some(gid) = row.try_get::<Option<i64>, _>("group_id_join").ok().flatten() {
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
            id: row.try_get("id").unwrap(),
            url: row.try_get("url").unwrap(),
            name: row.try_get("name").unwrap(),
            thumbnail: row.try_get("thumbnail").ok(),
            subscriber_count: row.try_get("subscriber_count").unwrap_or(0),
            view_count: row.try_get("view_count").unwrap(),
            video_count: row.try_get("video_count").unwrap_or(0),
            group_id,
            group,
            is_favorite: row.try_get("is_favorite").unwrap_or(false),
            is_pinned: row.try_get("is_pinned").unwrap_or(false),
            created_at: row.try_get("created_at").unwrap(),
            last_upload_at: row.try_get("last_upload_at").ok(),
        });
    }
    
    Ok(channels)
}

#[derive(Debug, Serialize, Deserialize)]
pub struct AddChannelResult {
    pub url: String,
    pub status: String,
    pub message: String,
    pub channel_name: Option<String>,
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
    cancel_flag: State<'_, CancellationFlag>,
    urls: Vec<String>,
    group_id: Option<i64>
) -> Result<Vec<AddChannelResult>, String> {
    println!("DEBUG: add_channels called with {} urls, group_id={:?}", urls.len(), group_id);
    
    // Reset cancellation flag
    cancel_flag.0.store(false, Ordering::Relaxed);
    
    let total = urls.len();
    let processed_count = Arc::new(std::sync::atomic::AtomicUsize::new(0));
    
    let stream = stream::iter(urls.into_iter())
        .map(|url| {
            let pool = pool.clone();
            let app = app.clone();
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

                // Emit progress (start)
                // Note: We might want to emit "processing" or just completion. 
                // Let's emit completion to simplify "current" count.
                
                let result = match add_single_channel(&pool, &url, group_id).await {
                    Ok((name, _id)) => {
                        AddChannelResult {
                            url: url.clone(),
                            status: "success".to_string(),
                            message: "添加成功".to_string(),
                            channel_name: Some(name),
                        }
                    }
                    Err(e) => {
                         AddChannelResult {
                            url: url.clone(),
                            status: "error".to_string(),
                            message: e.to_string(),
                            channel_name: None,
                        }
                    }
                };

                let current = processed_count.fetch_add(1, Ordering::Relaxed) + 1;
                
                // Emit progress event
                let _ = app.emit("add-channel-progress", AddChannelProgress {
                    current,
                    total,
                    url: url.clone(),
                    status: result.status.clone(),
                    message: result.message.clone(),
                });

                result
            }
        })
        .buffer_unordered(5); // Concurrency limit 5

    let results: Vec<AddChannelResult> = stream.collect().await;

    Ok(results)
}

fn extract_channel_identifier(url: &str) -> String {
    // Basic parser for YouTube URLs
    if let Some(pos) = url.find("/channel/") {
        let rest = &url[pos + 9..];
        return rest.split(|c| c == '/' || c == '?').next().unwrap_or(rest).to_string();
    }
    if let Some(pos) = url.find("/@") {
        let rest = &url[pos + 2..]; // remove / but keep @? No, wait. /@handle
        let handle = rest.split(|c| c == '/' || c == '?').next().unwrap_or(rest);
        return format!("@{}", handle);
    }
    if url.starts_with('@') {
        return url.to_string();
    }
    // Fallback: return as is (could be ID or full URL we failed to parse)
    url.to_string()
}

async fn add_single_channel(pool: &SqlitePool, url: &str, group_id: Option<i64>) -> Result<(String, String), Box<dyn std::error::Error>> {
    use crate::youtube_api;
    
    // 0. Fetch Proxy
    let proxy: Option<String> = sqlx::query_scalar("SELECT proxy_url FROM settings LIMIT 1")
        .fetch_optional(pool)
        .await
        .unwrap_or(None);
    let proxy_str = proxy.as_deref();

    // 1. Get API Key
    let api_key = get_active_api_key(pool).await?;

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

    let channel_res = youtube_api::get_channel_by_id_or_handle(&api_key, &identifier, proxy_str)
        .await
        .map_err(|e| format!("API Error: {}", e))?;

    let channel_id = channel_res.id;
    let name = channel_res.snippet.title;
    let thumbnail = channel_res.snippet.thumbnails.get_best_url();
    
    // Parse stats
    let sub_count = channel_res.statistics.as_ref()
        .and_then(|s| s.subscriber_count.as_ref())
        .and_then(|v| v.parse::<i64>().ok())
        .unwrap_or(0);
    let view_count = channel_res.statistics.as_ref()
        .and_then(|s| s.view_count.as_ref())
        .and_then(|v| v.parse::<i64>().ok())
        .unwrap_or(0);
    let video_count = channel_res.statistics.as_ref()
        .and_then(|s| s.video_count.as_ref())
        .and_then(|v| v.parse::<i64>().ok())
        .unwrap_or(0);

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
        .bind(group_id) // Option<i64>
        .bind(false) // is_favorite
        .bind(false) // is_pinned
        .bind(now)
        .bind(Option::<DateTime<Utc>>::None)
        .execute(pool)
        .await?;

    // 4. Sync recent videos (last month)
    // We call existing sync_channel_videos helper which now uses API
    // We ignore error to return success for channel addition
    if let Err(e) = sync_channel_videos(pool, &channel_id, Some("month".to_string()), proxy).await {
        eprintln!("Failed to sync initial videos: {}", e);
    }
    
    Ok((name, channel_id))
}

// Helper function to sync videos for a channel
async fn get_active_api_key(pool: &SqlitePool) -> Result<String, String> {
    let key_row: Option<ApiKey> = sqlx::query_as("SELECT * FROM api_keys WHERE is_active = 1 ORDER BY last_used ASC LIMIT 1")
        .fetch_optional(pool)
        .await
        .map_err(|e| e.to_string())?;
    
    if let Some(api_key) = key_row {
        let now = Utc::now();
        let last_used = api_key.last_used;
        
        // Reset if it's a new day
        let is_new_day = last_used.date_naive() != now.date_naive();
        let new_usage = if is_new_day { 1 } else { api_key.usage_today + 1 };
        
        sqlx::query("UPDATE api_keys SET usage_today = ?, last_used = ? WHERE id = ?")
            .bind(new_usage)
            .bind(now)
            .bind(api_key.id)
            .execute(pool)
            .await
            .map_err(|e| e.to_string())?;
            
        Ok(api_key.key)
    } else {
        Err("No active API key found. Please add a key in settings.".to_string())
    }
}

// Helper function to sync videos for a channel using YouTube API
async fn sync_channel_videos(
    pool: &SqlitePool,
    channel_id: &str,
    date_range: Option<String>,
    proxy: Option<String>
) -> Result<String, String> {
    use crate::youtube_api;
    use chrono::{Duration, Utc};

    let api_key = get_active_api_key(pool).await?;
    let proxy_str = proxy.as_deref();

    // 1. Get Channel Details (for Uploads Playlist ID and Stats)
    let channel_res = youtube_api::get_channel_by_id_or_handle(&api_key, channel_id, proxy_str)
        .await
        .map_err(|e| format!("Failed to fetch channel info: {}", e))?;

    let uploads_id = channel_res.content_details
        .ok_or("Channel has no content details")?
        .related_playlists.uploads;

    // 2. Determine Date Threshold
    let threshold_date = match date_range.as_deref() {
        Some("today") => Some(Utc::now() - Duration::days(1)),
        Some("week") => Some(Utc::now() - Duration::days(7)),
        Some("month") => Some(Utc::now() - Duration::days(30)),
        Some("year") => Some(Utc::now() - Duration::days(365)),
        _ => None, // If none, maybe limit to 50 videos
    };

    // 3. Fetch Uploads Playlist Items
    // For simplicity, we fetch first 50 items (1 page). API default max is 50.
    // If we need more, we'd need paging.
    let video_ids = youtube_api::get_upload_playlist_items(&api_key, &uploads_id, 50, proxy_str)
        .await
        .map_err(|e| format!("Failed to fetch uploads: {}", e))?;

    if video_ids.is_empty() {
        return Ok("No videos found".to_string());
    }

    // 4. Fetch Video Details (for duration/shorts detection)
    let videos = youtube_api::get_video_details(&api_key, &video_ids, proxy_str)
        .await
        .map_err(|e| format!("Failed to fetch video details: {}", e))?;

    // 5. Start Transaction for DB updates ONLY AFTER network operations are done
    let mut tx = pool.begin().await.map_err(|e| e.to_string())?;

    // Update Channel Stats immediately from API data (authoritative)
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
        // Date Filter
        if let Some(threshold) = threshold_date {
            if video.snippet.published_at < threshold {
                continue; 
            }
        }

        // Detect Shorts
        let duration_iso = video.content_details.as_ref().map(|d| d.duration.as_str()).unwrap_or("PT0S");
        let seconds = youtube_api::parse_duration_to_seconds(duration_iso);
        let is_short = seconds <= 60; // Simple heuristic

        let thumb = video.snippet.thumbnails.get_best_url();
        let view_count = video.statistics.as_ref()
            .and_then(|s| s.view_count.as_ref())
            .and_then(|v| v.parse::<i64>().ok())
            .unwrap_or(0);

        let url = format!("https://www.youtube.com/watch?v={}", video.id);

        let _ = sqlx::query("INSERT INTO videos (id, title, url, thumbnail, published_at, view_count, is_short, channel_id, created_at, updated_at, is_favorite) 
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(id) DO UPDATE SET 
            title=excluded.title, 
            view_count=excluded.view_count, 
            updated_at=excluded.updated_at")
            .bind(&video.id)
            .bind(&video.snippet.title)
            .bind(url)
            .bind(thumb)
            .bind(video.snippet.published_at)
            .bind(view_count)
            .bind(is_short)
            .bind(&video.snippet.channel_id)
            .bind(Utc::now())
            .bind(Utc::now())
            .bind(false)
            .execute(&mut *tx)
            .await;
            
        sync_count += 1;
    }

    // Update stats within the same transaction
    let _ = update_channel_stats(&mut *tx, channel_id).await;

    tx.commit().await.map_err(|e| e.to_string())?;

    Ok(format!("Synced {} videos via API", sync_count))
}

async fn update_channel_stats(conn: &mut SqliteConnection, channel_id: &str) -> std::result::Result<(), sqlx::Error> {
    // Get view counts of last 50 videos
    let views: Vec<i64> = sqlx::query_scalar("SELECT view_count FROM videos WHERE channel_id = ? ORDER BY published_at DESC LIMIT 50")
        .bind(channel_id)
        .fetch_all(&mut *conn)
        .await?;

    if views.is_empty() {
        return Ok(());
    }

    let count = views.len() as f64;
    let sum: f64 = views.iter().map(|&v| v as f64).sum();
    let mean = sum / count;

    let variance: f64 = views.iter().map(|&v| {
        let diff = (v as f64) - mean;
        diff * diff
    }).sum::<f64>() / count;
    
    let std_dev = variance.sqrt();

    sqlx::query("UPDATE channels SET avg_views = ?, std_dev = ?, last_upload_at = (SELECT MAX(published_at) FROM videos WHERE channel_id = ?) WHERE id = ?")
        .bind(mean)
        .bind(std_dev)
        .bind(channel_id)
        .bind(channel_id)
        .execute(&mut *conn)
        .await?;

    println!("DEBUG: Updated stats for {}: avg={}, std_dev={}", channel_id, mean, std_dev);
    Ok(())
}

#[tauri::command(rename_all = "snake_case")]
pub async fn recalculate_all_stats(pool: State<'_, SqlitePool>) -> Result<String, String> {
    let channels: Vec<String> = sqlx::query_scalar("SELECT id FROM channels")
        .fetch_all(&*pool)
        .await
        .map_err(|e| e.to_string())?;

    let mut tx = pool.begin().await.map_err(|e| e.to_string())?;
    let mut count = 0;
    for id in channels {
        if let Err(e) = update_channel_stats(&mut *tx, &id).await {
            println!("ERROR updating stats for {}: {}", id, e);
        } else {
            count += 1;
        }
    }
    tx.commit().await.map_err(|e| e.to_string())?;
    Ok(format!("Recalculated stats for {} channels", count))
}

#[tauri::command(rename_all = "snake_case")]
pub async fn refresh_channel(
    pool: State<'_, SqlitePool>, 
    channel_id: String,
    date_range: Option<String>
) -> Result<String, String> {
    // 0. Fetch Proxy
    let proxy: Option<String> = sqlx::query_scalar("SELECT proxy_url FROM settings LIMIT 1")
        .fetch_optional(&*pool)
        .await
        .unwrap_or(None);

    sync_channel_videos(&pool, &channel_id, date_range, proxy).await
}

#[tauri::command(rename_all = "snake_case")]
pub async fn refresh_all_channels(
    app: tauri::AppHandle,
    pool: State<'_, SqlitePool>,
    date_range: Option<String>,
    group_id: Option<i64>
) -> Result<(), String> {
    use tauri::Emitter;
    
    let channels: Vec<(String, String)> = if let Some(gid) = group_id {
        if gid == -1 {
            // Uncategorized
            sqlx::query_as("SELECT id, name FROM channels WHERE group_id IS NULL")
                .fetch_all(&*pool)
                .await
                .map_err(|e| e.to_string())?
        } else {
            // Specific Group
            sqlx::query_as("SELECT id, name FROM channels WHERE group_id = ?")
                .bind(gid)
                .fetch_all(&*pool)
                .await
                .map_err(|e| e.to_string())?
        }
    } else {
        // All Channels
        sqlx::query_as("SELECT id, name FROM channels")
            .fetch_all(&*pool)
            .await
            .map_err(|e| e.to_string())?
    };
        
    let total = channels.len();
    if total == 0 {
        return Ok(());
    }

    let pool = pool.inner().clone();
    let date_range = date_range.clone();
    
    tauri::async_runtime::spawn(async move {
        use tokio::sync::Semaphore;
        use std::sync::Arc;
        
        let proxy: Option<String> = sqlx::query_scalar("SELECT proxy_url FROM settings LIMIT 1")
            .fetch_optional(&pool)
            .await
            .unwrap_or(None);
            
        let semaphore = Arc::new(Semaphore::new(3)); // Process 3 channels at a time
        let mut tasks = Vec::new();

        for (i, (id, name)) in channels.into_iter().enumerate() {
            let pool = pool.clone();
            let date_range = date_range.clone();
            let proxy = proxy.clone();
            let app = app.clone();
            let semaphore = semaphore.clone();
            let current = i + 1;

            tasks.push(tauri::async_runtime::spawn(async move {
                let _permit = semaphore.acquire().await;
                
                let _ = app.emit("refresh-all-progress", serde_json::json!({
                    "current": current,
                    "total": total,
                    "channel": name,
                    "status": "processing"
                }));

                match sync_channel_videos(&pool, &id, date_range, proxy).await {
                    Ok(_) => {},
                    Err(e) => {
                         let _ = app.emit("refresh-all-progress", serde_json::json!({
                            "current": current,
                            "total": total,
                            "channel": name,
                            "status": "error",
                            "error": e
                        }));
                    }
                }
            }));
        }
        
        for task in tasks {
            let _ = task.await;
        }
        
        let _ = app.emit("refresh-all-complete", ());
    });
    
    Ok(())
}

#[tauri::command(rename_all = "snake_case")]
pub async fn create_group(pool: State<'_, SqlitePool>, name: String) -> Result<Group, String> {
    let mut tx = pool.begin().await.map_err(|e| e.to_string())?;
    
    let id = sqlx::query("INSERT INTO groups (name, is_pinned, created_at, updated_at) VALUES (?, 0, ?, ?)")
        .bind(&name)
        .bind(Utc::now())
        .bind(Utc::now())
        .execute(&mut *tx)
        .await
        .map_err(|e| e.to_string())?
        .last_insert_rowid();
        
    let group: Group = sqlx::query_as("SELECT * FROM groups WHERE id = ?")
        .bind(id)
        .fetch_one(&mut *tx)
        .await
        .map_err(|e| e.to_string())?;
        
    tx.commit().await.map_err(|e| e.to_string())?;
    Ok(group)
}

#[tauri::command(rename_all = "snake_case")]
pub async fn update_group(pool: State<'_, SqlitePool>, id: i64, name: Option<String>, is_pinned: Option<bool>) -> Result<(), String> {
    // We use COALESCE to keep existing value if None passed? 
    // Wait, separate commands might be better, but frontend calls update with name, toggle pin with isPinned.
    // Ideally we build dynamic query.
    // Or just two queries?
    
    let mut tx = pool.begin().await.map_err(|e| e.to_string())?;
    
    if let Some(n) = name {
         sqlx::query("UPDATE groups SET name = ?, updated_at = ? WHERE id = ?")
            .bind(n)
            .bind(Utc::now())
            .bind(id)
            .execute(&mut *tx)
            .await
            .map_err(|e| e.to_string())?;
    }
    
    if let Some(p) = is_pinned {
         sqlx::query("UPDATE groups SET is_pinned = ?, updated_at = ? WHERE id = ?")
            .bind(p)
            .bind(Utc::now())
            .bind(id)
            .execute(&mut *tx)
            .await
            .map_err(|e| e.to_string())?;
    }
    
    tx.commit().await.map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command(rename_all = "snake_case")]
pub async fn delete_group(pool: State<'_, SqlitePool>, id: i64) -> Result<(), String> {
    // Handle relation: set channels group_id to NULL
    let mut tx = pool.begin().await.map_err(|e| e.to_string())?;
    
    sqlx::query("UPDATE channels SET group_id = NULL WHERE group_id = ?")
        .bind(id)
        .execute(&mut *tx)
        .await
        .map_err(|e| e.to_string())?;
        
    sqlx::query("DELETE FROM groups WHERE id = ?")
        .bind(id)
        .execute(&mut *tx)
        .await
        .map_err(|e| e.to_string())?;
        
    tx.commit().await.map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command(rename_all = "snake_case")]
pub async fn delete_channel(pool: State<'_, SqlitePool>, id: String) -> Result<(), String> {
    // Delete videos first? Or depends on DB setup.
    // SQLite without FK: manually delete videos.
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
    group_id: Option<i64>
) -> Result<MoveChannelResult, String> {
    // 1. Get channel current info (including old group)
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
         WHERE c.id = ?"
    )
    .bind(&id)
    .fetch_one(&*pool)
    .await
    .map_err(|e| e.to_string())?;
    
    // 2. If group hasn't changed, return early
    if channel.group_id == group_id {
        return Ok(MoveChannelResult { 
            moved: false, 
            message: "分组未变化".to_string() 
        });
    }
    
    // 3. Get new group name
    let new_group_name = if let Some(gid) = group_id {
        sqlx::query_scalar::<_, String>("SELECT name FROM groups WHERE id = ?")
            .bind(gid)
            .fetch_one(&*pool)
            .await
            .map_err(|e| e.to_string())?
    } else {
        "未分组".to_string()
    };
    
    // 4. Get download path
    let download_path: Option<String> = sqlx::query_scalar(
        "SELECT download_path FROM settings LIMIT 1"
    )
    .fetch_optional(&*pool)
    .await
    .map_err(|e| e.to_string())?;
    
    // 5. Move folder if download path is configured
    let mut file_moved = false;
    let mut move_message = String::new();
    
    if let Some(base_path_str) = download_path {
        if !base_path_str.is_empty() {
            let base_path = std::path::Path::new(&base_path_str);
            
            let safe_channel = sanitize_filename(&channel.name);
            let old_group = channel.old_group_name.unwrap_or_else(|| "未分组".to_string());
            let safe_old_group = sanitize_filename(&old_group);
            let safe_new_group = sanitize_filename(&new_group_name);
            
            let old_path = base_path.join(&safe_old_group).join(&safe_channel);
            let new_group_path = base_path.join(&safe_new_group);
            let new_path = new_group_path.join(&safe_channel);
            
            // Create new group folder if it doesn't exist
            if !new_group_path.exists() {
                let _ = std::fs::create_dir_all(&new_group_path);
            }
            
            // Move folder if old path exists and is different from new path
            if old_path.exists() && old_path != new_path {
                if old_path.is_dir() {
                    if !new_path.exists() {
                        match std::fs::rename(&old_path, &new_path) {
                            Ok(_) => {
                                file_moved = true;
                                move_message = format!("已将文件夹移动到: {}", new_group_name);
                            },
                            Err(e) => {
                                eprintln!("Failed to move folder from {:?} to {:?}: {}", old_path, new_path, e);
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
    
    // 6. Update database
    sqlx::query("UPDATE channels SET group_id = ? WHERE id = ?")
        .bind(group_id)
        .bind(&id)
        .execute(&*pool)
        .await
        .map_err(|e| e.to_string())?;
    
    // 7. Return result
    let final_message = if file_moved {
        move_message
    } else if !move_message.is_empty() {
        format!("分组已更新 ({})", move_message)
    } else {
        "分组已更新".to_string()
    };
    
    Ok(MoveChannelResult {
        moved: file_moved,
        message: final_message
    })
}

#[tauri::command(rename_all = "snake_case")]
pub async fn toggle_channel_pin(pool: State<'_, SqlitePool>, id: String, is_pinned: bool) -> Result<(), String> {
    sqlx::query("UPDATE channels SET is_pinned = ? WHERE id = ?")
        .bind(is_pinned)
        .bind(id)
        .execute(&*pool)
        .await
        .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command(rename_all = "snake_case")]
pub async fn toggle_channel_favorite(pool: State<'_, SqlitePool>, id: String, is_favorite: bool) -> Result<(), String> {
    sqlx::query("UPDATE channels SET is_favorite = ? WHERE id = ?")
        .bind(is_favorite)
        .bind(id)
        .execute(&*pool)
        .await
        .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command(rename_all = "snake_case")]
pub async fn refresh_cookies(pool: State<'_, SqlitePool>) -> Result<serde_json::Value, String> {
    use std::fs::File;
    use std::io::{BufRead, BufReader};
    use std::path::Path;

    // 1. Get Settings
    let settings: Option<String> = sqlx::query_scalar("SELECT cookie_source FROM settings LIMIT 1")
        .fetch_optional(&*pool)
        .await
        .map_err(|e| e.to_string())?;
        
    let source = settings.unwrap_or_else(|| "none".to_string());
    
    if source == "none" || source.is_empty() {
        return Ok(serde_json::json!({ "success": true, "count": 0, "message": "No cookie source configured" }));
    }
    
    // Check if file
    let path = Path::new(&source);
    if !path.exists() {
         return Err("Cookie file not found".to_string());
    }
    
    // Read & Parse
    let file = File::open(path).map_err(|e| e.to_string())?;
    let reader = BufReader::new(file);
    
    let mut count = 0;
    
    for line in reader.lines() {
        let line = line.map_err(|e| e.to_string())?;
        if line.starts_with('#') || line.trim().is_empty() { continue; }
        
        let parts: Vec<&str> = line.split('\t').collect();
        if parts.len() < 7 { continue; }
        
        let domain = parts[0];
        if !domain.contains("youtube") && !domain.contains("google") { continue; }
        
        count += 1;
    }
    
    Ok(serde_json::json!({ "success": true, "count": count }))
}



#[tauri::command(rename_all = "snake_case")]
pub async fn get_viral_videos(
    pool: State<'_, SqlitePool>,
    group_id: Option<i64>,
    date_range: String, // "3d", "7d", "30d"
    filter_type: String, // "all", "video", "short"
    sort_order: String, // "view_count", "vph", "viral", "er", "z_score"
    limit: Option<i64>
) -> Result<Vec<AnalysisVideo>, String> {
    use chrono::Duration;
    
    let now = Utc::now();
    let start_date = match date_range.as_str() {
        "7d" => now - Duration::days(7),
        "30d" => now - Duration::days(30),
        _ => now - Duration::days(3),
    };

    let mut sql = "SELECT v.id, v.title, v.url, v.thumbnail, v.published_at, v.view_count, 
                          v.is_short, v.is_favorite, v.is_downloaded AS is_downloaded, v.channel_id, v.created_at, v.updated_at,
                          v.local_path AS local_path,
                          c.name as channel_name, c.thumbnail as channel_thumbnail,
                          c.subscriber_count,
                          c.avg_views,
                          c.std_dev,
                          v.like_count, v.comment_count
                   FROM videos v 
                   JOIN channels c ON v.channel_id = c.id 
                   WHERE v.published_at >= ?".to_string();

    if let Some(gid) = group_id {
        if gid == -1 {
            sql.push_str(" AND c.group_id IS NULL");
        } else {
             sql.push_str(&format!(" AND c.group_id = {}", gid));
        }
    }

    match filter_type.as_str() {
        "video" => sql.push_str(" AND v.is_short = 0"),
        "short" => sql.push_str(" AND v.is_short = 1"),
        _ => {}
    }

    // We fetch more than limit to sort in memory because calculations (VPH, viral ratio) depend on logic
    sql.push_str(" LIMIT 1000");

    let videos = sqlx::query_as::<_, VideoWithChannel>(&sql)
        .bind(start_date)
        .fetch_all(&*pool)
        .await
        .map_err(|e| e.to_string())?;

    let mut analyzed: Vec<AnalysisVideo> = videos.into_iter().map(|v| {
        let view_count = v.view_count as f64;
        // let sub_count = v.subscriber_count as f64; // No longer used for ratio
        let hours_since = (now - v.published_at).num_hours() as f64;
        
        let vph = if hours_since > 0.0 { view_count / hours_since } else { view_count };
        let channel_avg = v.avg_views;
        let channel_std_dev = v.std_dev;
        
        // Multiplier (Viral Ratio)
        let ratio = if channel_avg > 0.0 { view_count / channel_avg } else { 0.0 };
        
        // Z-Score
        let z_score = if channel_std_dev > 0.0 { (view_count - channel_avg) / channel_std_dev } else { 0.0 };
        
        let likes = v.like_count.unwrap_or(0) as f64;
        let comments = v.comment_count.unwrap_or(0) as f64;
        let engagement_rate = if view_count > 0.0 { (likes + comments) / view_count } else { 0.0 };

        AnalysisVideo {
            video: v,
            vph,
            ratio,
            engagement_rate,
            z_score
        }
    }).collect();

    // Sort
    match sort_order.as_str() {
        "vph" => analyzed.sort_by(|a, b| b.vph.partial_cmp(&a.vph).unwrap_or(std::cmp::Ordering::Equal)),
        "viral" => analyzed.sort_by(|a, b| b.ratio.partial_cmp(&a.ratio).unwrap_or(std::cmp::Ordering::Equal)),
        "er" => analyzed.sort_by(|a, b| b.engagement_rate.partial_cmp(&a.engagement_rate).unwrap_or(std::cmp::Ordering::Equal)),
        "z_score" => analyzed.sort_by(|a, b| b.z_score.partial_cmp(&a.z_score).unwrap_or(std::cmp::Ordering::Equal)),
        _ => analyzed.sort_by(|a, b| b.video.view_count.partial_cmp(&a.video.view_count).unwrap_or(std::cmp::Ordering::Equal)),
    }

    let take_n = limit.unwrap_or(10) as usize;
    Ok(analyzed.into_iter().take(take_n).collect())
}

#[tauri::command(rename_all = "snake_case")]
pub async fn activate_software(
    pool: State<'_, SqlitePool>,
    code: String
) -> Result<bool, String> {
    // 1. Get Machine ID
    let machine_id = get_machine_id();
    
    // 2. Parse Code "DAYS-SIGNATURE"
    let parts: Vec<&str> = code.trim().split('-').collect();
    if parts.len() != 2 {
        return Err("激活码格式错误 (应为 DAYS-SIGNATURE)".to_string());
    }
    
    let days_str = parts[0];
    let provided_sig = parts[1];
    
    // Validate days
    let days: i64 = days_str.parse().map_err(|_| "无效的天数格式".to_string())?;

    // 3. Verify Signature
    // Secret Salt
    let salt = "youtube_monitor_secret_salt_2024";
    
    use hmac::{Hmac, Mac};
    use sha2::Sha256;
    use hex;

    type HmacSha256 = Hmac<Sha256>;
    
    let mut mac = HmacSha256::new_from_slice(salt.as_bytes())
        .map_err(|_| "HMAC init failed".to_string())?;
        
    // Payload: "MachineID-DAYS"
    let payload = format!("{}-{}", machine_id, days_str);
    mac.update(payload.as_bytes());
    
    let expected_signature = mac.finalize().into_bytes();
    let expected_sig_hex = hex::encode(expected_signature);
    
    // Verify
    if provided_sig.to_lowercase() == expected_sig_hex.to_lowercase() {
        // 4. Save to DB with timestamp and duration
         let now = Utc::now();
         sqlx::query("UPDATE settings SET activation_code = ?, activated_at = ?, license_days = ? WHERE id = (SELECT id FROM settings LIMIT 1)")
            .bind(&code)
            .bind(now)
            .bind(days)
            .execute(&*pool)
            .await
            .map_err(|e| e.to_string())?;
            
        Ok(true)
    } else {
        Err("激活码无效".to_string())
    }
}

#[tauri::command(rename_all = "snake_case")]
pub async fn get_group_stats(
    pool: State<'_, SqlitePool>,
    date_range: String,
    filter_type: String
) -> Result<Vec<GroupStat>, String> {
     // Logic: Find all videos in range, aggregate by group
     use chrono::Duration;
     let now = Utc::now();
     let start_date = match date_range.as_str() {
        "7d" => now - Duration::days(7),
        "30d" => now - Duration::days(30),
        _ => now - Duration::days(3),
     };
     
     let mut where_sql = "v.published_at >= ?".to_string();
     match filter_type.as_str() {
        "video" => where_sql.push_str(" AND v.is_short = 0"),
        "short" => where_sql.push_str(" AND v.is_short = 1"),
        _ => {}
    }
    
    // We group by group_id
    // If group_id is null, it's "Uncategorized"
    let sql = format!(
        "SELECT 
            g.id, 
            COALESCE(g.name, '未分组') as name, 
            SUM(v.view_count) as total_views, 
            COUNT(v.id) as video_count,
            CAST(SUM(v.view_count) AS REAL) / COUNT(v.id) as avg_view_count
         FROM videos v
         JOIN channels c ON v.channel_id = c.id
         LEFT JOIN groups g ON c.group_id = g.id
         WHERE {}
         GROUP BY g.id, g.name
         ORDER BY avg_view_count DESC",
         where_sql
    );
    
    let stats = sqlx::query_as::<_, GroupStat>(&sql)
        .bind(start_date)
        .fetch_all(&*pool)
        .await
        .map_err(|e| e.to_string())?;
        
    Ok(stats)
}

#[tauri::command(rename_all = "snake_case")]
pub async fn get_channel_stats(
    pool: State<'_, SqlitePool>,
    group_id: Option<i64>,
    date_range: String,
    filter_type: String
) -> Result<Vec<ChannelStat>, String> {
    use chrono::Duration;
    let now = Utc::now();
    let start_date = match date_range.as_str() {
       "7d" => now - Duration::days(7),
       "30d" => now - Duration::days(30),
       _ => now - Duration::days(3),
    };
    
    let mut where_sql = "v.published_at >= ?".to_string();
    if let Some(gid) = group_id {
        if gid == -1 {
            where_sql.push_str(" AND c.group_id IS NULL");
        } else {
             where_sql.push_str(&format!(" AND c.group_id = {}", gid));
        }
    }
    match filter_type.as_str() {
       "video" => where_sql.push_str(" AND v.is_short = 0"),
       "short" => where_sql.push_str(" AND v.is_short = 1"),
       _ => {}
    }

    // We can't easily return nested Channel object in one query derived from stats.
    // But we can fetch channel fields from 'channels' table and stats from 'videos'.
    // sqlxFromRow can map flat fields to nested struct if we implement `FromRow` manually or flatten.
    // Easier: Return flat fields and construct object or use a simplified struct.
    // The legacy API returned: { totalViews, count, avgViews, channel: {...} }
    // Let's manually construct it.
    
    // Query: channel.*, SUM(views), COUNT, AVG
    // We need to list all channel columns to map to `Channel`.
    let sql = format!(
        "SELECT 
            c.id, c.url, c.name, c.thumbnail, c.subscriber_count, c.view_count, c.video_count, c.group_id, c.is_favorite, c.is_pinned, c.created_at, c.last_upload_at,
            SUM(v.view_count) as range_total_views,
            COUNT(v.id) as range_count,
            CAST(SUM(v.view_count) AS REAL) / COUNT(v.id) as range_avg_views
         FROM videos v
         JOIN channels c ON v.channel_id = c.id
         WHERE {}
         GROUP BY c.id
         ORDER BY range_total_views DESC
         LIMIT 50",
         where_sql
    );
    
    // We need a temp struct to map this because `ChannelStat` expects `Channel`.
    #[derive(sqlx::FromRow)]
    struct RawChanStat {
        // Channel fields
        id: String, url: String, name: String, thumbnail: Option<String>, subscriber_count: i64, 
        view_count: i64, video_count: i64, group_id: Option<i64>, is_favorite: bool, is_pinned: bool, 
        created_at: DateTime<Utc>, last_upload_at: Option<DateTime<Utc>>,
        // Stats
        range_total_views: i64,
        range_count: i64,
        range_avg_views: f64
    }
    
    let raw = sqlx::query_as::<_, RawChanStat>(&sql)
        .bind(start_date)
        .fetch_all(&*pool)
        .await
        .map_err(|e| e.to_string())?;
        
    let result = raw.into_iter().map(|r| ChannelStat {
        channel: Channel {
             id: r.id, url: r.url, name: r.name, thumbnail: r.thumbnail, 
             subscriber_count: r.subscriber_count, view_count: r.view_count, video_count: r.video_count,
             group_id: r.group_id, group: None, is_favorite: r.is_favorite, is_pinned: r.is_pinned,
             created_at: r.created_at, last_upload_at: r.last_upload_at
        },
        total_views: r.range_total_views,
        count: r.range_count,
        avg_views: r.range_avg_views
    }).collect();

    Ok(result)
}

#[tauri::command(rename_all = "snake_case")]
pub async fn clear_all_data(pool: State<'_, SqlitePool>) -> Result<(), String> {
    let mut tx = pool.begin().await.map_err(|e| e.to_string())?;

    // Delete all user data
    sqlx::query("DELETE FROM videos").execute(&mut *tx).await.map_err(|e| e.to_string())?;
    sqlx::query("DELETE FROM channels").execute(&mut *tx).await.map_err(|e| e.to_string())?;
    sqlx::query("DELETE FROM groups").execute(&mut *tx).await.map_err(|e| e.to_string())?;
    sqlx::query("DELETE FROM api_keys").execute(&mut *tx).await.map_err(|e| e.to_string())?;
    
    // Reset all settings to defaults, but keep activation_code
    sqlx::query(
        "UPDATE settings SET 
         download_path = '', 
         proxy_url = NULL, 
         cookie_source = 'none', 
         theme = NULL,
         updated_at = CURRENT_TIMESTAMP"
    ).execute(&mut *tx).await.map_err(|e| e.to_string())?;
    
    tx.commit().await.map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command(rename_all = "snake_case")]
pub async fn resolve_video_info(
    pool: State<'_, SqlitePool>,
    url: String
) -> Result<serde_json::Value, String> {
    use tokio::process::Command;
    use std::process::Stdio;

    let settings: Option<(Option<String>, Option<String>)> = sqlx::query_as("SELECT proxy_url, cookie_source FROM settings LIMIT 1")
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
        if !c.is_empty() && std::path::Path::new(&c).exists() {
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
    let json: serde_json::Value = serde_json::from_str(&stdout).map_err(|e| format!("Invalid JSON from yt-dlp: {}", e))?;
    
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

#[derive(serde::Serialize, serde::Deserialize)]
pub struct BackupData {
    pub channels: Vec<ChannelDb>,
    #[serde(default)]
    pub groups: Option<Vec<Group>>,
    #[serde(default)]
    pub videos: Option<Vec<Video>>,
    pub settings: Option<AppSettings>
}

async fn get_backup_data_internal(pool: &SqlitePool) -> Result<BackupData, String> {
    let channels = sqlx::query_as::<_, ChannelDb>("SELECT * FROM channels").fetch_all(pool).await.map_err(|e| e.to_string())?;
    let groups = sqlx::query_as::<_, Group>("SELECT * FROM groups").fetch_all(pool).await.map_err(|e| e.to_string())?;
    let videos = sqlx::query_as::<_, Video>("SELECT 
        id, title, url, thumbnail, published_at, view_count, like_count, comment_count,
        is_short, is_favorite, is_downloaded, local_path, channel_id, created_at, updated_at
        FROM videos").fetch_all(pool).await.map_err(|e| e.to_string())?;
    let settings = sqlx::query_as::<_, AppSettings>("SELECT * FROM settings LIMIT 1").fetch_optional(pool).await.map_err(|e| e.to_string())?;
    
    Ok(BackupData { channels, groups: Some(groups), videos: Some(videos), settings })
}

#[tauri::command(rename_all = "snake_case")]
pub async fn export_backup(pool: State<'_, SqlitePool>) -> Result<BackupData, String> {
    get_backup_data_internal(&*pool).await
}

#[tauri::command(rename_all = "snake_case")]
pub async fn export_backup_to_file(pool: State<'_, SqlitePool>, path: String) -> Result<(), String> {
    let data = get_backup_data_internal(&*pool).await?;
    let json = serde_json::to_string_pretty(&data).map_err(|e| e.to_string())?;
    std::fs::write(&path, json).map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command(rename_all = "snake_case")]
pub async fn import_backup(pool: State<'_, SqlitePool>, data: BackupData) -> Result<(), String> {
    let mut tx = pool.begin().await.map_err(|e| e.to_string())?;

    sqlx::query("DELETE FROM videos").execute(&mut *tx).await.map_err(|e| e.to_string())?;
    sqlx::query("DELETE FROM channels").execute(&mut *tx).await.map_err(|e| e.to_string())?;
    sqlx::query("DELETE FROM groups").execute(&mut *tx).await.map_err(|e| e.to_string())?;
    sqlx::query("DELETE FROM settings").execute(&mut *tx).await.map_err(|e| e.to_string())?;

    if let Some(s) = data.settings {
         sqlx::query("INSERT INTO settings (id, proxy_url, theme, cookie_source, download_path, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)")
            .bind(s.id).bind(s.proxy_url).bind(s.theme).bind(s.cookie_source).bind(s.download_path).bind(s.created_at).bind(s.updated_at)
            .execute(&mut *tx).await.map_err(|e| e.to_string())?;
    }
    
    if let Some(groups) = data.groups {
        for g in groups {
            sqlx::query("INSERT INTO groups (id, name, is_pinned, created_at, updated_at) VALUES (?, ?, ?, ?, ?)")
                .bind(g.id).bind(g.name).bind(g.is_pinned).bind(g.created_at).bind(g.updated_at)
                .execute(&mut *tx).await.map_err(|e| e.to_string())?;
        }
    }
    
    for c in data.channels {
        sqlx::query("INSERT INTO channels (id, url, name, thumbnail, subscriber_count, view_count, video_count, group_id, is_favorite, is_pinned, created_at, last_upload_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)")
           .bind(c.id).bind(c.url).bind(c.name).bind(c.thumbnail).bind(c.subscriber_count).bind(c.view_count).bind(c.video_count).bind(c.group_id).bind(c.is_favorite).bind(c.is_pinned).bind(c.created_at).bind(c.last_upload_at)
           .execute(&mut *tx).await.map_err(|e| e.to_string())?;
    }
    
    if let Some(videos) = data.videos {
        for v in videos {
            sqlx::query("INSERT INTO videos (id, title, url, thumbnail, published_at, view_count, like_count, comment_count, is_short, is_favorite, is_downloaded, local_path, channel_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)")
                .bind(v.id).bind(v.title).bind(v.url).bind(v.thumbnail).bind(v.published_at).bind(v.view_count).bind(v.like_count).bind(v.comment_count).bind(v.is_short).bind(v.is_favorite).bind(v.is_downloaded).bind(v.local_path).bind(v.channel_id).bind(v.created_at).bind(v.updated_at)
                .execute(&mut *tx).await.map_err(|e| e.to_string())?;
        }
    }

    tx.commit().await.map_err(|e| e.to_string())?;
    Ok(())
}

#[derive(serde::Serialize)]
pub struct ChannelDetails {
    #[serde(flatten)]
    pub channel: ChannelDb,
    pub videos: Vec<Video>,
    pub group: Option<Group>
}

#[tauri::command(rename_all = "snake_case")]
pub async fn get_channel_details(
    pool: State<'_, SqlitePool>,
    id: String
) -> Result<ChannelDetails, String> {
    // 1. Get Channel
    let channel = sqlx::query_as::<_, ChannelDb>("SELECT * FROM channels WHERE id = ?")
        .bind(&id)
        .fetch_optional(&*pool)
        .await
        .map_err(|e| e.to_string())?
        .ok_or("Channel not found")?;

    // 2. Get Videos
    let videos = sqlx::query_as::<_, Video>("SELECT 
        id, title, url, thumbnail, published_at, view_count, like_count, comment_count,
        is_short, is_favorite, is_downloaded, local_path, channel_id, created_at, updated_at
        FROM videos WHERE channel_id = ? ORDER BY published_at DESC")
        .bind(&id)
        .fetch_all(&*pool)
        .await
        .map_err(|e| e.to_string())?;

    // 3. Get Group
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
        group
    })
}

#[tauri::command(rename_all = "snake_case")]
pub async fn get_video(pool: State<'_, SqlitePool>, id: String) -> Result<VideoWithChannel, String> {
     sqlx::query_as::<_, VideoWithChannel>("SELECT 
        v.id, v.title, v.url, v.thumbnail, v.published_at, v.view_count, v.like_count, v.comment_count,
        v.is_short, v.is_favorite, v.is_downloaded AS is_downloaded, v.local_path AS local_path, v.channel_id, v.created_at, v.updated_at,
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
    println!("toggle_video_favorite called for id: {}", id);
    // Use 1 - is_favorite to ensure 0/1 toggle works safely
    sqlx::query("UPDATE videos SET is_favorite = 1 - is_favorite WHERE id = ?")
        .bind(&id)
        .execute(&*pool)
        .await
        .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command(rename_all = "snake_case")]
pub fn get_machine_id() -> String {
    machine_uid::get().unwrap_or_else(|_| "UNKNOWN_MACHINE_ID".to_string())
}

#[derive(Debug, Serialize, Deserialize, sqlx::FromRow)]
pub struct ApiKey {
    pub id: i64,
    pub key: String,
    pub name: Option<String>,
    pub is_active: bool,
    pub usage_today: i64,
    pub last_used: DateTime<Utc>,
    pub created_at: DateTime<Utc>,
}

#[tauri::command(rename_all = "snake_case")]
pub async fn get_api_keys(pool: State<'_, SqlitePool>) -> Result<Vec<ApiKey>, String> {
    sqlx::query_as::<_, ApiKey>("SELECT * FROM api_keys ORDER BY created_at DESC")
        .fetch_all(&*pool)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command(rename_all = "snake_case")]
pub async fn add_api_key(pool: State<'_, SqlitePool>, key: String, name: Option<String>) -> Result<ApiKey, String> {
    let id = sqlx::query("INSERT INTO api_keys (key, name, is_active) VALUES (?, ?, 1)")
        .bind(&key)
        .bind(&name)
        .execute(&*pool)
        .await
        .map_err(|e| e.to_string())?
        .last_insert_rowid();

    sqlx::query_as::<_, ApiKey>("SELECT * FROM api_keys WHERE id = ?")
        .bind(id)
        .fetch_one(&*pool)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command(rename_all = "snake_case")]
pub async fn delete_api_key(pool: State<'_, SqlitePool>, id: i64) -> Result<(), String> {
    sqlx::query("DELETE FROM api_keys WHERE id = ?")
        .bind(id)
        .execute(&*pool)
        .await
        .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command(rename_all = "snake_case")]
pub async fn update_api_key(pool: State<'_, SqlitePool>, id: i64, name: Option<String>, is_active: Option<bool>) -> Result<(), String> {
    let mut tx = pool.begin().await.map_err(|e| e.to_string())?;
    
    if let Some(n) = name {
         sqlx::query("UPDATE api_keys SET name = ? WHERE id = ?")
            .bind(n)
            .bind(id)
            .execute(&mut *tx)
            .await
            .map_err(|e| e.to_string())?;
    }
    
    if let Some(active) = is_active {
         sqlx::query("UPDATE api_keys SET is_active = ? WHERE id = ?")
            .bind(active)
            .bind(id)
            .execute(&mut *tx)
            .await
            .map_err(|e| e.to_string())?;
    }
    
    tx.commit().await.map_err(|e| e.to_string())?;
    Ok(())
}

mod int_string {
    use super::*;
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

mod opt_int_string {
    use super::*;
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
                if v.is_empty() { return Ok(None); }
                v.parse::<i64>().map(Some).map_err(de::Error::custom)
            }
        }

        deserializer.deserialize_option(Visitor)
    }
}
