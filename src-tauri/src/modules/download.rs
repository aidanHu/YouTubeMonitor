use crate::models::*;
use tauri::{State, Emitter};
use sqlx::sqlite::SqlitePool;
use crate::modules::common::sanitize_filename;
use chrono::Utc;
use tokio::io::AsyncBufReadExt;

#[tauri::command(rename_all = "snake_case")]
pub async fn download_video(
    app: tauri::AppHandle,
    state: State<'_, DownloadState>,
    pool: State<'_, SqlitePool>,
    video_id: String,
    title: Option<String>,
    channel_name: Option<String>,
    _thumbnail: Option<String>,
) -> Result<(), String> {

    // 1. Fetch Video & Channel Info for path construction
    // Try DB first
    let db_info: Option<(String, String, Option<String>)> = sqlx::query_as("SELECT v.title, c.name, g.name FROM videos v JOIN channels c ON v.channel_id = c.id LEFT JOIN groups g ON c.group_id = g.id WHERE v.id = ?")
        .bind(&video_id)
        .fetch_optional(&*pool)
        .await
        .map_err(|e| e.to_string())?;

    // Fallback to provided args
    let (_final_title, db_channel_name, db_group_name) = match db_info {
        Some((t, n, g)) => (t, n, g),
        None => {
            // Need both title and channel_name from args
            match (title, channel_name) {
                (Some(t), Some(n)) => (t, n, None), // No group info in args unfortunately
                _ => return Err("Video not found in DB and no metadata provided".to_string()),
            }
        }
    };

    // ... (settings fetch lines 41-54 remain same, but context here is safer)
    
     // 2. Fetch Settings (Path, Proxy, Cookie)
    let settings: Option<AppSettings> =
        sqlx::query_as("SELECT * FROM settings LIMIT 1")
            .fetch_optional(&*pool)
            .await
            .map_err(|e| e.to_string())?;

    let download_path_opt = settings.as_ref().and_then(|s| s.download_path.clone());
    let proxy_url = settings.as_ref().and_then(|s| s.proxy_url.clone());
    let cookie_source = settings.as_ref().and_then(|s| s.cookie_source.clone());

    let base_path = download_path_opt
        .filter(|s| !s.trim().is_empty())
        .ok_or("请先在设置中配置下载路径")?;

    // 3. Resolve Path
    // Simplify names
    let safe_channel_name = sanitize_filename(&db_channel_name);
    let final_channel = if safe_channel_name.is_empty() {
        "Uncategorized".to_string()
    } else {
        safe_channel_name
    };

    let safe_group_name = db_group_name.map(|n| sanitize_filename(&n)).unwrap_or_default();
    let final_group = if safe_group_name.is_empty() {
        "未分组".to_string()
    } else {
        safe_group_name
    };

    // Template: "{base_path}/{group_name}/{channel_name}/{title} [%(id)s].%(ext)s"
    let mut template_path = std::path::PathBuf::from(&base_path);
    template_path.push(&final_group);
    template_path.push(final_channel.clone());
    template_path.push("%(title)s [%(id)s].%(ext)s");
    let output_template = template_path.to_string_lossy().to_string();

    // Acquire concurrency permit
    let sem = {
        let guard = state
            .semaphore
            .lock()
            .map_err(|e| format!("Failed to lock semaphore: {}", e))?;
        guard.clone()
    };
    let _permit = sem.acquire().await.map_err(|e| e.to_string())?;

    let url = format!("https://www.youtube.com/watch?v={}", video_id);

    // 4. Construct System Command
    // Use shared builder to handle PATH, Windows flags, and Proxy
    let mut command = crate::modules::common::create_ytdlp_command(proxy_url);

    let mut cmd_args = vec![
        // Force H.264 (avc*) video and AAC audio for max compatibility
        "-f".to_string(), "bestvideo[ext=mp4][vcodec^=avc]+bestaudio[ext=m4a]/best[ext=mp4]/best".to_string(),
        // Ensure final container is MP4 even if re-muxing is needed
        "--recode-video".to_string(), "mp4".to_string(),
        "-o".to_string(), output_template,
        "--no-playlist".to_string(),
        "--newline".to_string(),
        "--progress".to_string(),
        "--progress-template".to_string(), "%(progress)j".to_string(), 
    ];

    // Proxy is handled by helper

    if let Some(c) = cookie_source {
        if !c.is_empty() && c != "none" {
             crate::modules::common::add_cookie_args(&mut command, &c);
        }
    }

    cmd_args.push(url);
    
    // Clear cache to avoid stale bot detection states
    cmd_args.push("--rm-cache-dir".to_string());

    command.stdout(std::process::Stdio::piped());
    command.stderr(std::process::Stdio::piped());

    // Update Status to Downloading
    sqlx::query("UPDATE videos SET download_status = 'downloading', download_error = NULL, updated_at = CURRENT_TIMESTAMP WHERE id = ?")
        .bind(&video_id)
        .execute(&*pool)
        .await
        .map_err(|e| e.to_string())?;

    // Spawn async process
    let mut child = command
        .args(cmd_args)
        .spawn()
        .map_err(|e| format!("Failed to spawn yt-dlp: {}. Make sure it is installed and in PATH.", e))?;

    let pid = child.id().unwrap_or(0);

    let stdout = child.stdout.take().expect("Failed to open stdout");
    let stderr = child.stderr.take().expect("Failed to open stderr");

    let (tx, mut rx) = tokio::sync::mpsc::channel::<(bool, String)>(100);

    // Stream Stdout
    let tx_out = tx.clone();
    tokio::spawn(async move {
        let mut reader = tokio::io::BufReader::new(stdout).lines();
        while let Ok(Some(line)) = reader.next_line().await {
            let _ = tx_out.send((false, line)).await;
        }
    });

    // Stream Stderr
    let tx_err = tx.clone();
    tokio::spawn(async move {
        let mut reader = tokio::io::BufReader::new(stderr).lines();
        while let Ok(Some(line)) = reader.next_line().await {
             let _ = tx_err.send((true, line)).await;
        }
    });
    
    // Monitor exit
    let (exit_tx, exit_rx) = tokio::sync::oneshot::channel();
    tokio::spawn(async move {
        let status = child.wait().await;
        let _ = exit_tx.send(status);
    });
    // Drop original tx to ensure channel closes when producers finish
    drop(tx);
    
    // Store PID
    {
        let mut tasks = state.tasks.lock().unwrap();
        tasks.insert(video_id.clone(), pid);
    }

    let _ = app.emit("download-start", &video_id);

    let mut final_path: Option<String> = None;
    let mut last_emit_time = std::time::Instant::now();
    let mut download_failed = false;
    let mut error_buffer = String::new();

    while let Some((is_stderr, line)) = rx.recv().await {
        if is_stderr {
            if !line.trim().is_empty() {
                if error_buffer.len() < 1000 {
                    error_buffer.push_str(&line);
                    error_buffer.push('\n');
                }
            }
            if line.contains("ERROR:") {
                download_failed = true;
            }
        } else {
            // Stdout Parsing
            if line.contains("[download] Destination:") {
                 if let Some(idx) = line.find("[download] Destination: ") {
                     let path = line[idx + 24..].trim().to_string();
                     if path.ends_with(".part") {
                         final_path = Some(path.trim_end_matches(".part").to_string());
                     } else {
                         final_path = Some(path);
                     }
                 }
            } else if line.contains("[Merger] Merging formats into") {
                 if let Some(start) = line.find('"') {
                     if let Some(end) = line.rfind('"') {
                         if end > start {
                             final_path = Some(line[start + 1..end].to_string());
                         }
                     }
                 }
            } else if line.contains("has already been downloaded") {
                 if let Some(idx) = line.find("[download] ") {
                     if let Some(end) = line.find(" has already been downloaded") {
                         final_path = Some(line[idx + 11..end].to_string());
                     }
                 }
            } else if line.contains("[Fixup") && line.contains("Correcting container of") {
                 if let Some(start) = line.find('"') {
                     if let Some(end) = line.rfind('"') {
                         if end > start {
                             final_path = Some(line[start + 1..end].to_string());
                         }
                     }
                 }
            }

            // Progress
            if line.contains("[download]") && line.contains('%') {
                 if let Some(pct_idx) = line.find('%') {
                     let mut start = pct_idx;
                     while start > 0 {
                         let c = line.as_bytes()[start - 1] as char;
                         if c.is_ascii_digit() || c == '.' || c == ' ' {
                             start -= 1;
                             if c == ' ' { break; }
                         } else {
                             break; 
                         }
                     }
                     
                     let fragment = &line[start..pct_idx];
                     if let Ok(pct) = fragment.trim().parse::<f64>() {
                         let speed = if let Some(idx) = line.find(" at ") {
                             line[idx+4..].split_whitespace().next().unwrap_or("").to_string()
                         } else { "".to_string() };
                         
                         let eta = if let Some(idx) = line.find(" ETA ") {
                             line[idx+5..].split_whitespace().next().unwrap_or("").to_string()
                         } else { "".to_string() };

                         let payload = serde_json::json!({
                             "videoId": video_id,
                             "progress": pct,
                             "speed": speed,
                             "eta": eta
                         });

                         if last_emit_time.elapsed().as_millis() > 100 {
                             let _ = app.emit("download-progress", payload);
                             last_emit_time = std::time::Instant::now();
                         }
                     }
                 }
            }
        }
    }

    // Check process exit status (Critical fix for cancellation)
    if let Ok(Ok(status)) = exit_rx.await {
        if !status.success() {
             download_failed = true;
             if error_buffer.is_empty() {
                 error_buffer = "Download cancelled or failed unexpectedly".to_string();
             }
        }
    }
    
    // Cleanup PID
    {
        let mut tasks = state.tasks.lock().unwrap();
        tasks.remove(&video_id);
    }

    // Fallback: search file by ID if parsing failed
    if !download_failed && final_path.is_none() {
        let dir = std::path::Path::new(&base_path).join(&final_group).join(&final_channel);
        if let Ok(entries) = std::fs::read_dir(&dir) {
             for entry in entries.flatten() {
                 let path = entry.path();
                 if let Some(name) = path.file_name().and_then(|n| n.to_str()) {
                     // Since we added ID to template, this is reliable.
                     if name.contains(&video_id) && name.ends_with(".mp4") {
                         final_path = Some(path.to_string_lossy().to_string());
                         break;
                     }
                 }
             }
        }
    }

    if !download_failed {
        // Even if final_path is None, we mark it as completed to unblock UI.
        // We'll use a placeholder or best effort path if None.
        let saved_path = final_path.clone().unwrap_or_else(|| "Unknown Path".to_string());
        
        sqlx::query(
            "UPDATE videos SET is_downloaded = 1, local_path = ?, download_status = 'completed', downloaded_at = ?, updated_at = ? WHERE id = ?",
        )
        .bind(&saved_path)
        .bind(Utc::now())
        .bind(Utc::now())
        .bind(&video_id)
        .execute(&*pool)
        .await
        .map_err(|e| e.to_string())?;

        let _ = app.emit(
            "download-complete",
            serde_json::json!({ "videoId": video_id, "path": saved_path }),
        );

        Ok(())
    } else {
        let error_msg = if error_buffer.is_empty() { "Unknown error".to_string() } else { error_buffer.chars().take(200).collect() };
        
        let _ = sqlx::query("UPDATE videos SET download_status = 'error', download_error = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?")
            .bind(&error_msg)
            .bind(&video_id)
            .execute(&*pool)
            .await;

        let _ = app.emit(
            "download-error",
            serde_json::json!({"videoId": video_id, "error": error_msg}),
        );
        Err(format!("Download failed: {}", error_msg))
    }
}

#[tauri::command(rename_all = "snake_case")]
pub async fn cancel_download(
    app: tauri::AppHandle,
    state: State<'_, DownloadState>,
    video_id: String,
) -> Result<(), String> {
    use tauri_plugin_shell::ShellExt;
    
    let pid = {
        let tasks = state
            .tasks
            .lock()
            .map_err(|e| format!("Failed to lock tasks: {}", e))?;
        tasks.get(&video_id).cloned()
    };

    if let Some(pid) = pid {
        // Kill process logic
        // We use system command
        #[cfg(not(target_os = "windows"))]
        {
             let _ = app.shell().command("kill")
                .args(&[pid.to_string()])
                .output()
                .await
                .map_err(|e| e.to_string())?;
        }

        #[cfg(target_os = "windows")]
        {
             let _ = app.shell().command("taskkill")
                .args(&["/F", "/PID", &pid.to_string()])
                .output()
                .await
                .map_err(|e| e.to_string())?;
        }

        Ok(())
    } else {
        Err("Download not found".to_string())
    }
}
