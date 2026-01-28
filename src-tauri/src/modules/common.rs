use crate::models::*;
use tauri::{State, Emitter};
use sqlx::sqlite::SqlitePool;

// Helper function to sanitize filenames for safe filesystem operations
pub fn sanitize_filename(name: &str) -> String {
    // 1. Remove dangerous chars
    let mut safe = name.replace(
        &['<', '>', ':', '"', '/', '\\', '|', '?', '*', '`', '$'][..],
        "",
    );
    // 2. Remove control chars (0x00-0x1f, 0x7f)
    safe.retain(|c| !c.is_control());
    
    // 3. Remove ".." sequences (iteratively to handle .... -> ..)
    while safe.contains("..") {
        safe = safe.replace("..", "");
    }

    // 4. Trim leading/trailing dots and whitespace
    let final_name = safe.trim().trim_matches('.').to_string();

    if final_name.is_empty() {
        "downloaded_file".to_string()
    } else {
        final_name
    }
}

pub fn get_fixed_path() -> Option<String> {
    #[cfg(target_os = "macos")]
    {
        if let Ok(path) = std::env::var("PATH") {
            if !path.contains("/usr/local/bin") {
                return Some(format!("{}:/usr/local/bin:/opt/homebrew/bin", path));
            }
        } else {
             return Some("/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin:/opt/homebrew/bin".to_string());
        }
    }
    std::env::var("PATH").ok()
}



#[tauri::command(rename_all = "snake_case")]
pub async fn check_dependencies() -> Result<serde_json::Value, String> {
    let check_bin = |name: &str| -> bool {
        let mut cmd = std::process::Command::new(name);
        
        // Fix PATH for macOS
        if let Some(path) = get_fixed_path() {
            cmd.env("PATH", path);
        }
        
        // No windows creation flags needed for simple check
        #[cfg(target_os = "windows")]
        {
            use std::os::windows::process::CommandExt;
            const CREATE_NO_WINDOW: u32 = 0x08000000;
            cmd.creation_flags(CREATE_NO_WINDOW);
        }

        cmd.arg("--version")
           .output()
           .map(|o| o.status.success())
           .unwrap_or(false)
    };

    let ytdlp = check_bin("yt-dlp");
    let ffmpeg = check_bin("ffmpeg");

    Ok(serde_json::json!({
        "yt_dlp": ytdlp,
        "ffmpeg": ffmpeg,
        "ok": ytdlp && ffmpeg
    }))
}

#[tauri::command(rename_all = "snake_case")]
pub async fn open_video_folder(app: tauri::AppHandle, pool: State<'_, SqlitePool>, path: String) -> Result<(), String> {
    if path.is_empty() {
        return Err("Path is empty".to_string());
    }

    // Security Check: Ensure path is within download directory
    let download_path: Option<String> = sqlx::query_scalar("SELECT download_path FROM settings LIMIT 1")
        .fetch_optional(&*pool)
        .await
        .map_err(|e| e.to_string())?;

    let base = download_path.ok_or("Download path not configured")?;
    let base_path = std::fs::canonicalize(&base).map_err(|_| "Invalid download path configuration".to_string())?;
    let target_path = std::fs::canonicalize(&path).map_err(|e| format!("Invalid target path: {}", e))?;

    if !target_path.starts_with(&base_path) {
        return Err("Access denied: Path is outside download directory".to_string());
    }

    if !std::path::Path::new(&path).exists() {
        return Err(format!("ERR_FILE_NOT_FOUND: {}", path));
    }

    // Enhanced open logic: if it's a file, reveal it; if folder, open it.
    
    #[cfg(target_os = "macos")]
    {
        if std::path::Path::new(&path).is_file() {
            // open -R <path> reveals the file in Finder
             let _ = std::process::Command::new("open")
                .arg("-R")
                .arg(&path)
                .spawn()
                .map_err(|e| e.to_string())?;
            return Ok(());
        }
    }

    #[cfg(target_os = "windows")]
    {
        if std::path::Path::new(&path).is_file() {
            // explorer /select,<path>
             let _ = std::process::Command::new("explorer")
                .arg("/select,")
                .arg(&path)
                .spawn()
                .map_err(|e| e.to_string())?;
             return Ok(());
        }
    }

     #[cfg(target_os = "linux")]
    {
         if std::path::Path::new(&path).is_file() {
             if let Some(parent) = std::path::Path::new(&path).parent() {
                 use tauri_plugin_opener::OpenerExt;
                 app.opener().open_path(parent.to_string_lossy().to_string(), None::<&str>).map_err(|e| e.to_string())?;
                 return Ok(());
             }
         }
    }

    // Fallback or Folder
    use tauri_plugin_opener::OpenerExt;
    app.opener().open_path(path, None::<&str>).map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command(rename_all = "snake_case")]
pub async fn open_url(app: tauri::AppHandle, url: String) -> Result<(), String> {
    use tauri_plugin_opener::OpenerExt;
    
    if url.is_empty() {
        return Err("URL is empty".to_string());
    }

    app.opener().open_url(&url, None::<&str>).map_err(|e| e.to_string())?;
    Ok(())
}

pub fn create_ytdlp_command(proxy_url: Option<String>) -> tokio::process::Command {
    let mut command = tokio::process::Command::new("yt-dlp");
    
    // Fix PATH for macOS
    if let Some(path_str) = get_fixed_path() {
        command.env("PATH", path_str);
    }

    // Windows no-window creation flag
    #[cfg(target_os = "windows")]
    {
        use std::os::windows::process::CommandExt;
        const CREATE_NO_WINDOW: u32 = 0x08000000;
        command.creation_flags(CREATE_NO_WINDOW);
    }

    if let Some(p) = proxy_url {
        if !p.is_empty() {
             command.arg("--proxy");
             command.arg(p);
        }
    }
    
    command
}

pub fn add_cookie_args(command: &mut tokio::process::Command, source: &str) {
    if source.starts_with("browser:") {
        let browser_name = source.trim_start_matches("browser:");
        if !browser_name.is_empty() {
             command.arg("--cookies-from-browser");
             command.arg(browser_name);
        }
    } else if std::path::Path::new(source).exists() {
        command.arg("--cookies");
        command.arg(source);
    }
}

#[tauri::command(rename_all = "snake_case")]
pub async fn check_cookie_status(_app: tauri::AppHandle, pool: State<'_, SqlitePool>, path: String) -> Result<bool, String> {
    
    if path.is_empty() || path == "none" {
        return Ok(false);
    }
    
    // Validate path if it's a file
    if !path.starts_with("browser:") && !std::path::Path::new(&path).exists() {
        return Ok(false);
    }

    // Fetch Proxy from DB
    let proxy_url: Option<String> = sqlx::query_scalar("SELECT proxy_url FROM settings LIMIT 1")
        .fetch_optional(&*pool)
        .await
        .map_err(|e| e.to_string())?
        .flatten();

    let mut command = create_ytdlp_command(proxy_url);
    
    // Use helper to add cookies
    add_cookie_args(&mut command, &path);
    
    let args = vec![
        "--dump-json".to_string(),
        "--no-playlist".to_string(),
        "https://www.youtube.com/watch?v=dQw4w9WgXcQ".to_string()
    ];
    
    // Clear cache to avoid stale bot detection states
    command.arg("--rm-cache-dir");
    
    let result = command
        .args(args)
        .output()
        .await;

    match result {
        Ok(output) => {
             let stderr = String::from_utf8_lossy(&output.stderr);
             let stdout = String::from_utf8_lossy(&output.stdout);
             
             if output.status.success() {
                 // Double check for soft indicators of failure in stderr/stdout
                 if stderr.contains("Sign in to confirm") || stdout.contains("Sign in to confirm") || stderr.contains("bot") {
                     Ok(false)
                 } else {
                     Ok(true)
                 }
             } else {
                 Ok(false)
             }
        },
        Err(_) => {
             Ok(false)
        }
    }
}

#[tauri::command(rename_all = "snake_case")]
pub async fn migrate_files(pool: State<'_, SqlitePool>) -> Result<MigrationStats, String> {
    // 1. Get Download Path
    let download_path: Option<String> =
        sqlx::query_scalar("SELECT download_path FROM settings LIMIT 1")
            .fetch_optional(&*pool)
            .await
            .map_err(|e| e.to_string())?;

    let base_path_str = download_path.ok_or("No download path configured")?;
    let base_path = std::path::Path::new(&base_path_str);

    // 2. Get Channels and Groups
    #[derive(sqlx::FromRow)]
    struct ChanGroup {
        name: String,
        group_name: Option<String>,
    }

    let channels = sqlx::query_as::<_, ChanGroup>(
        "
        SELECT c.name, g.name as group_name 
        FROM channels c LEFT JOIN groups g ON c.group_id = g.id
    ",
    )
    .fetch_all(&*pool)
    .await
    .map_err(|e| e.to_string())?;

    let mut stats = MigrationStats {
        moved_folders: 0,
        updated_videos: 0,
        errors: 0,
    };

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
                        Err(_e) => {
                            // Failed to move folder, continue with others
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
pub async fn clear_all_data(app: tauri::AppHandle, pool: State<'_, SqlitePool>) -> Result<(), String> {
    let mut tx = pool.begin().await.map_err(|e| e.to_string())?;

    // Delete all user data
    sqlx::query("DELETE FROM videos")
        .execute(&mut *tx)
        .await
        .map_err(|e| e.to_string())?;
    sqlx::query("DELETE FROM channels")
        .execute(&mut *tx)
        .await
        .map_err(|e| e.to_string())?;
    sqlx::query("DELETE FROM groups")
        .execute(&mut *tx)
        .await
        .map_err(|e| e.to_string())?;
    sqlx::query("DELETE FROM api_keys")
        .execute(&mut *tx)
        .await
        .map_err(|e| e.to_string())?;

    // Reset settings but PRESERVE activation info
    sqlx::query("UPDATE settings SET download_path = '', proxy_url = NULL, cookie_source = 'none', theme = NULL, max_concurrent_downloads = 3")
        .execute(&mut *tx)
        .await
        .map_err(|e| e.to_string())?;

    tx.commit().await.map_err(|e| e.to_string())?;
    
    let _ = app.emit("download-history-cleared", ());
    let _ = app.emit("data-cleared", ()); // General event for other components if needed
    
    Ok(())
}

#[tauri::command(rename_all = "snake_case")]
pub async fn clear_download_history(app: tauri::AppHandle, pool: State<'_, SqlitePool>) -> Result<(), String> {
    // Reset download status for UI cleanup, but PRESERVE is_downloaded and local_path
    // This allows the "Open Folder" button to persist in the main list
    sqlx::query("UPDATE videos SET download_status = 'idle', download_error = NULL WHERE download_status IN ('completed', 'error', 'cancelled')")
        .execute(&*pool)
        .await
        .map_err(|e| e.to_string())?;
        
    let _ = app.emit("download-history-cleared", ());
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
        return Ok(
            serde_json::json!({ "success": true, "count": 0, "message": "No cookie source configured" }),
        );
    }

    if source.starts_with("browser:") {
         return Ok(serde_json::json!({ "success": true, "count": 1, "message": "Using browser cookies" }));
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
        if line.starts_with('#') || line.trim().is_empty() {
            continue;
        }

        let parts: Vec<&str> = line.split('\t').collect();
        if parts.len() < 7 {
            continue;
        }

        let domain = parts[0];
        if !domain.contains("youtube") && !domain.contains("google") {
            continue;
        }

        count += 1;
    }

    Ok(serde_json::json!({ "success": true, "count": count }))
}

