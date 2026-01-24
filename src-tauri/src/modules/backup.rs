use crate::models::*;
use tauri::State;
use sqlx::sqlite::SqlitePool;

async fn get_backup_data_internal(pool: &SqlitePool) -> Result<BackupData, String> {
    let channels = sqlx::query_as::<_, ChannelDb>("SELECT * FROM channels")
        .fetch_all(pool)
        .await
        .map_err(|e| e.to_string())?;
    let groups = sqlx::query_as::<_, Group>("SELECT * FROM groups")
        .fetch_all(pool)
        .await
        .map_err(|e| e.to_string())?;
    let videos = sqlx::query_as::<_, Video>(
        "SELECT 
        id, title, url, thumbnail, published_at, view_count, like_count, comment_count,
        is_short, is_favorite, is_downloaded, local_path, channel_id, created_at, updated_at,
        download_status, download_error, downloaded_at
        FROM videos",
    )
    .fetch_all(pool)
    .await
    .map_err(|e| e.to_string())?;
    let settings = sqlx::query_as::<_, AppSettings>("SELECT * FROM settings LIMIT 1")
        .fetch_optional(pool)
        .await
        .map_err(|e| e.to_string())?;

    Ok(BackupData {
        channels,
        groups: Some(groups),
        videos: Some(videos),
        settings,
    })
}

#[tauri::command(rename_all = "snake_case")]
pub async fn export_backup(pool: State<'_, SqlitePool>) -> Result<BackupData, String> {
    get_backup_data_internal(&*pool).await
}

#[tauri::command(rename_all = "snake_case")]
pub async fn export_backup_to_file(
    pool: State<'_, SqlitePool>,
    path: String,
) -> Result<(), String> {
    let data = get_backup_data_internal(&*pool).await?;
    let json = serde_json::to_string_pretty(&data).map_err(|e| e.to_string())?;
    std::fs::write(&path, json).map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command(rename_all = "snake_case")]
pub async fn import_backup(pool: State<'_, SqlitePool>, data: BackupData) -> Result<(), String> {
    let mut tx = pool.begin().await.map_err(|e| e.to_string())?;

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
    sqlx::query("DELETE FROM settings")
        .execute(&mut *tx)
        .await
        .map_err(|e| e.to_string())?;

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
