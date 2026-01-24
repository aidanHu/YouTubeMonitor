use crate::models::*;
use tauri::State;
use sqlx::sqlite::SqlitePool;
use chrono::{DateTime, Utc, Duration};


#[tauri::command(rename_all = "snake_case")]
pub async fn get_viral_videos(
    pool: State<'_, SqlitePool>,
    group_id: Option<i64>,
    date_range: String,  // "3d", "7d", "30d"
    filter_type: String, // "all", "video", "short"
    sort_order: String,  // "view_count", "vph", "viral", "er", "z_score"
    limit: Option<i64>,
) -> Result<Vec<AnalysisVideo>, String> {
    let now = Utc::now();
    let start_date = match date_range.as_str() {
        "7d" => now - Duration::days(7),
        "30d" => now - Duration::days(30),
        _ => now - Duration::days(3),
    };

    let mut sql = "SELECT v.id, v.title, v.url, v.thumbnail, v.published_at, v.view_count, 
                          v.is_short, v.is_favorite, v.is_downloaded AS is_downloaded, v.channel_id, v.created_at, v.updated_at,
                          v.download_status, v.download_error, v.downloaded_at,
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

    let mut analyzed: Vec<AnalysisVideo> = videos
        .into_iter()
        .map(|v| {
            let view_count = v.view_count as f64;
            // let sub_count = v.subscriber_count as f64; // No longer used for ratio
            let hours_since = (now - v.published_at).num_hours() as f64;

            let vph = if hours_since > 0.0 {
                view_count / hours_since
            } else {
                view_count
            };
            let channel_avg = v.avg_views;
            let channel_std_dev = v.std_dev;

            // Multiplier (Viral Ratio)
            let ratio = if channel_avg > 0.0 {
                view_count / channel_avg
            } else {
                0.0
            };

            // Z-Score
            let z_score = if channel_std_dev > 0.0 {
                (view_count - channel_avg) / channel_std_dev
            } else {
                0.0
            };

            let likes = v.like_count.unwrap_or(0) as f64;
            let comments = v.comment_count.unwrap_or(0) as f64;
            let engagement_rate = if view_count > 0.0 {
                (likes + comments) / view_count
            } else {
                0.0
            };

            AnalysisVideo {
                video: v,
                vph,
                ratio,
                engagement_rate,
                z_score,
            }
        })
        .collect();

    // Sort
    match sort_order.as_str() {
        "vph" => analyzed.sort_by(|a, b| {
            b.vph
                .partial_cmp(&a.vph)
                .unwrap_or(std::cmp::Ordering::Equal)
        }),
        "viral" => analyzed.sort_by(|a, b| {
            b.ratio
                .partial_cmp(&a.ratio)
                .unwrap_or(std::cmp::Ordering::Equal)
        }),
        "er" => analyzed.sort_by(|a, b| {
            b.engagement_rate
                .partial_cmp(&a.engagement_rate)
                .unwrap_or(std::cmp::Ordering::Equal)
        }),
        "z_score" => analyzed.sort_by(|a, b| {
            b.z_score
                .partial_cmp(&a.z_score)
                .unwrap_or(std::cmp::Ordering::Equal)
        }),
        _ => analyzed.sort_by(|a, b| {
            b.video
                .view_count
                .partial_cmp(&a.video.view_count)
                .unwrap_or(std::cmp::Ordering::Equal)
        }),
    }

    let take_n = limit.unwrap_or(10) as usize;
    Ok(analyzed.into_iter().take(take_n).collect())
}

#[tauri::command(rename_all = "snake_case")]
pub async fn get_group_stats(
    pool: State<'_, SqlitePool>,
    date_range: String,
    filter_type: String,
) -> Result<Vec<GroupStat>, String> {
    // Logic: Find all videos in range, aggregate by group
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
    filter_type: String,
) -> Result<Vec<ChannelStat>, String> {
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

    // Query: channel.*, SUM(views), COUNT, AVG
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
        id: String,
        url: String,
        name: String,
        thumbnail: Option<String>,
        subscriber_count: i64,
        view_count: i64,
        video_count: i64,
        group_id: Option<i64>,
        is_favorite: bool,
        is_pinned: bool,
        created_at: DateTime<Utc>,
        last_upload_at: Option<DateTime<Utc>>,
        // Stats
        range_total_views: i64,
        range_count: i64,
        range_avg_views: f64,
    }

    let raw = sqlx::query_as::<_, RawChanStat>(&sql)
        .bind(start_date)
        .fetch_all(&*pool)
        .await
        .map_err(|e| e.to_string())?;

    let result = raw
        .into_iter()
        .map(|r| ChannelStat {
            channel: Channel {
                id: r.id,
                url: r.url,
                name: r.name,
                thumbnail: r.thumbnail,
                subscriber_count: r.subscriber_count,
                view_count: r.view_count,
                video_count: r.video_count,
                group_id: r.group_id,
                group: None,
                is_favorite: r.is_favorite,
                is_pinned: r.is_pinned,
                created_at: r.created_at,
                last_upload_at: r.last_upload_at,
            },
            total_views: r.range_total_views,
            count: r.range_count,
            avg_views: r.range_avg_views,
        })
        .collect();

    Ok(result)
}

#[tauri::command(rename_all = "snake_case")]
pub async fn recalculate_all_stats(pool: State<'_, SqlitePool>) -> Result<String, String> {
    let channels: Vec<String> = sqlx::query_scalar("SELECT id FROM channels")
        .fetch_all(&*pool)
        .await
        .map_err(|e| e.to_string())?;

    let mut tx = pool.begin().await.map_err(|e| e.to_string())?;
    // We need connection inside tx
    // But update_channel_stats take &mut SqliteConnection.
    // tx IS a connection.
    let mut count = 0;
    for id in channels {
        // Use crate::modules::channel::update_channel_stats
        if let Err(_e) = crate::modules::channel::update_channel_stats(&mut *tx, &id).await {
            // Stats update failed for this channel, continue with others
        } else {
            count += 1;
        }
    }
    tx.commit().await.map_err(|e| e.to_string())?;
    Ok(format!("Recalculated stats for {} channels", count))
}
