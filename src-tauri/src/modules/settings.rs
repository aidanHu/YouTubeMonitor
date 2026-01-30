use crate::models::*;
use tauri::State;
use sqlx::sqlite::SqlitePool;
use chrono::Utc;
use tokio::sync::Semaphore;
use std::sync::Arc;

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
    max_concurrent_downloads: Option<i64>,
) -> Result<(), String> {
    // Update Semaphore if limit changed
    if let Some(limit) = max_concurrent_downloads {
        let new_limit = if limit < 1 { 1 } else { limit as usize };
        let mut current_sem = state
            .semaphore
            .lock()
            .map_err(|e| format!("Failed to lock semaphore: {}", e))?;
        // Replacing the semaphore
        *current_sem = Arc::new(Semaphore::new(new_limit));

        // Update current limit value
        let mut limit_guard = state
            .current_limit
            .lock()
            .map_err(|e| format!("Failed to lock current_limit: {}", e))?;
        *limit_guard = new_limit;
    }

    // Upsert (assume id=1, or check exist)
    // We just ensure one row exists
    let count: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM settings")
        .fetch_one(&*pool)
        .await
        .map_err(|e| e.to_string())?;

    // Handle download_path NOT NULL constraint
    let dl_path = download_path.unwrap_or_default();

    let now = Utc::now();
    let max_dl = max_concurrent_downloads.unwrap_or(3);

    if count == 0 {
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
    Ok(())
}

#[tauri::command(rename_all = "snake_case")]
pub fn get_machine_id() -> String {
    // 1. Try machine_uid crate
    if let Ok(id) = machine_uid::get() {
        if !id.is_empty() { return id; }
    }

    // 2. Direct fallback for macOS using common absolute paths
    #[cfg(target_os = "macos")]
    {
        use std::process::Command;
        let bins = ["/usr/sbin/ioreg", "ioreg"];
        for bin in bins {
            if let Ok(output) = Command::new(bin)
                .args(["-rd1", "-c", "IOPlatformExpertDevice"])
                .output()
            {
                let s = String::from_utf8_lossy(&output.stdout);
                if let Some(uuid_line) = s.lines().find(|l| l.contains("IOPlatformUUID")) {
                    if let Some(uuid) = uuid_line.split('"').nth(3) {
                         return uuid.to_string();
                    }
                }
            }
        }
    }

    "UNKNOWN_MACHINE_ID".to_string()
}

#[tauri::command(rename_all = "snake_case")]
pub async fn get_api_keys(pool: State<'_, SqlitePool>) -> Result<Vec<ApiKey>, String> {
    let mut keys = sqlx::query_as::<_, ApiKey>("SELECT * FROM api_keys ORDER BY created_at DESC")
        .fetch_all(&*pool)
        .await
        .map_err(|e| e.to_string())?;

    // Check for "New Day" logic (Pacific Time Midnight = UTC-8 00:00 -> 08:00 UTC)
    // We want to visually reset usage to 0 if the day has rolled over, 
    // even if we haven't written to the DB yet.
    use chrono::Duration;
    let now_utc = Utc::now();
    // Shift to roughly Pacific Time (Standard). Accuracy isn't critical, just consistency.
    let now_pst = now_utc - Duration::hours(8); 

    for key in &mut keys {
        let last_used_pst = key.last_used - Duration::hours(8);
        if last_used_pst.date_naive() != now_pst.date_naive() {
            key.usage_today = 0;
            key.is_quota_exhausted = false; // Also visually reset quota status
        }
    }

    Ok(keys)
}

#[tauri::command(rename_all = "snake_case")]
pub async fn add_api_key(
    pool: State<'_, SqlitePool>,
    key: String,
    name: Option<String>,
) -> Result<ApiKey, String> {
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
pub async fn update_api_key(
    pool: State<'_, SqlitePool>,
    id: i64,
    name: Option<String>,
    is_active: Option<bool>,
) -> Result<(), String> {
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

#[tauri::command(rename_all = "snake_case")]
pub async fn activate_software(pool: State<'_, SqlitePool>, code: String) -> Result<bool, String> {
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
    let salt = option_env!("ACTIVATION_SALT").unwrap_or("DEV_SALT_PLACEHOLDER");

    use hex;
    use hmac::{Hmac, Mac};
    use sha2::Sha256;

    type HmacSha256 = Hmac<Sha256>;

    let mut mac =
        HmacSha256::new_from_slice(salt.as_bytes()).map_err(|_| "HMAC init failed".to_string())?;

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

pub async fn get_active_api_key(pool: &SqlitePool, excluded_keys: &[String]) -> Result<String, String> {
    
    let query = if excluded_keys.is_empty() {
        "SELECT * FROM api_keys WHERE is_active = 1 ORDER BY last_used ASC LIMIT 1".to_string()
    } else {
        let placeholders: Vec<String> = excluded_keys.iter().map(|_| "?".to_string()).collect();
        format!(
            "SELECT * FROM api_keys WHERE is_active = 1 AND key NOT IN ({}) ORDER BY last_used ASC LIMIT 1",
            placeholders.join(",")
        )
    };

    let mut query_builder = sqlx::query_as::<_, ApiKey>(&query);
    
    for key in excluded_keys {
        query_builder = query_builder.bind(key);
    }

    let key_row: Option<ApiKey> = query_builder
            .fetch_optional(pool)
            .await
            .map_err(|e| e.to_string())?;

    if let Some(api_key) = key_row {
        // Just update last_used time to keep rotation logic working roughly, 
        // but DO NOT increment usage here. Usage must be incremented by the caller 
        // based on actual API cost.
        let now = Utc::now();
        sqlx::query("UPDATE api_keys SET last_used = ? WHERE id = ?")
            .bind(now)
            .bind(api_key.id)
            .execute(pool)
            .await
            .map_err(|e| e.to_string())?;

        Ok(api_key.key)
    } else {
        if !excluded_keys.is_empty() {
             Err("All available API keys checked and failed (Quota Exceeded including backup keys).".to_string())
        } else {
             Err("No active API key found. Please add a key in settings.".to_string())
        }
    }
}

pub async fn increment_api_usage(pool: &SqlitePool, key: &str, units: i64) -> Result<(), String> {
    let api_key: Option<ApiKey> = sqlx::query_as("SELECT * FROM api_keys WHERE key = ?")
        .bind(key)
        .fetch_optional(pool)
        .await
        .map_err(|e| e.to_string())?;

    if let Some(api_key) = api_key {
        let now = Utc::now();
        let last_used = api_key.last_used;

        // Reset if it's a new day (Align with Pacific Time midnight)
        // Shift both times by -8 hours (approx PST) to check date change
        use chrono::Duration;
        let now_pst = now - Duration::hours(8);
        let last_used_pst = last_used - Duration::hours(8);

        let is_new_day = last_used_pst.date_naive() != now_pst.date_naive();
        let new_usage = if is_new_day {
            units // Reset to just the current increment
        } else {
            api_key.usage_today + units
        };

        // Also reset quota exhausted status since it's working now/new day
        sqlx::query("UPDATE api_keys SET usage_today = ?, last_used = ?, is_quota_exhausted = 0, last_error = NULL WHERE id = ?")
            .bind(new_usage)
            .bind(now)
            .bind(api_key.id)
            .execute(pool)
            .await
            .map_err(|e| e.to_string())?;
    }
    Ok(())
}

pub async fn mark_api_key_exhausted(pool: &SqlitePool, key: &str, error: &str) -> Result<(), String> {
    sqlx::query("UPDATE api_keys SET is_quota_exhausted = 1, last_error = ? WHERE key = ?")
        .bind(error)
        .bind(key)
        .execute(pool)
        .await
        .map_err(|e| e.to_string())?;
    Ok(())
}
