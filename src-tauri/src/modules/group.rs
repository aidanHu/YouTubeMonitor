use crate::models::*;
use tauri::State;
use sqlx::sqlite::SqlitePool;
use chrono::Utc;

#[tauri::command(rename_all = "snake_case")]
pub async fn get_groups(pool: State<'_, SqlitePool>) -> Result<Vec<Group>, String> {
    let groups = sqlx::query_as::<_, Group>("SELECT id, name, is_pinned, created_at, updated_at FROM groups ORDER BY is_pinned DESC, name ASC")
        .fetch_all(&*pool)
        .await
        .map_err(|e| e.to_string())?;
    Ok(groups)
}

#[tauri::command(rename_all = "snake_case")]
pub async fn create_group(pool: State<'_, SqlitePool>, name: String) -> Result<Group, String> {
    let mut tx = pool.begin().await.map_err(|e| e.to_string())?;

    let id = sqlx::query(
        "INSERT INTO groups (name, is_pinned, created_at, updated_at) VALUES (?, 0, ?, ?)",
    )
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
pub async fn update_group(
    pool: State<'_, SqlitePool>,
    id: i64,
    name: Option<String>,
    is_pinned: Option<bool>,
) -> Result<(), String> {
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
