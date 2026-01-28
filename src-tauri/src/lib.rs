mod commands;
mod db;
mod path_utils;
mod youtube_api;
mod models;
mod modules;

use std::sync::{atomic::AtomicBool, Arc};
use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(
            tauri_plugin_log::Builder::default()
                .level(log::LevelFilter::Info)
                .filter(|metadata| {
                    // Filter out noisy crates
                    !metadata.target().starts_with("sqlx") && 
                    !metadata.target().starts_with("tao") &&
                    !metadata.target().starts_with("tiny_http") &&
                    !metadata.target().starts_with("h2") &&
                    !metadata.target().starts_with("hyper")
                })
                .build(),
        )
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_localhost::Builder::new(1430).build())
        .setup(|app| {
            use tauri::webview::WebviewWindowBuilder;

            // Define window config
            let builder;
            
            #[cfg(debug_assertions)]
            {
                // Dev mode: use App url (will map to devUrl)
                builder = WebviewWindowBuilder::new(app, "main", tauri::WebviewUrl::App("index.html".into()));
            }

            #[cfg(not(debug_assertions))]
            {
                // Prod mode: use standard v2 App protocol for stable IPC.
                // The localhost plugin will serve the proxy player at http://localhost:1430/
                builder = WebviewWindowBuilder::new(app, "main", tauri::WebviewUrl::App("index.html".into()));
            }

            // Common window settings
            let mut builder = builder
                .title("YouTube Monitor")
                .inner_size(1280.0, 832.0)
                .min_inner_size(1280.0, 832.0)
                .resizable(true)
                .fullscreen(false);

            #[cfg(target_os = "macos")]
            {
                builder = builder
                    .title_bar_style(tauri::TitleBarStyle::Overlay)
                    .hidden_title(true);
            }
            
            builder.build()?;

            let handle = app.handle().clone();
            tauri::async_runtime::block_on(async move {
                let pool = db::init(&handle)
                    .await
                    .expect("Failed to initialize database");
                handle.manage(pool.clone());

                // Fetch proxy from settings to configure global client
                let proxy_url: Option<String> = sqlx::query_scalar("SELECT proxy_url FROM settings LIMIT 1")
                    .fetch_optional(&pool)
                    .await
                    .unwrap_or(None);

                let mut client_builder = reqwest::Client::builder();
                if let Some(url) = proxy_url {
                    if !url.is_empty() {
                       if let Ok(proxy) = reqwest::Proxy::all(&url) {
                           client_builder = client_builder.proxy(proxy);
                       }
                    }
                }
                
                let client = client_builder.build().expect("Failed to create HTTP client");
                handle.manage(client);
                
                // Background sync removed
            });

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::get_videos,
            commands::get_channels,
            commands::get_groups,
            commands::add_channels,
            commands::refresh_channel,
            commands::refresh_all_channels,
            commands::create_group,
            commands::update_group,
            commands::delete_group,
            commands::delete_channel,
            commands::move_channel,
            commands::toggle_channel_pin,
            commands::toggle_channel_favorite,
            commands::get_settings,
            commands::save_settings,
            commands::download_video,
            commands::cancel_download,
            commands::check_cookie_status,
            commands::refresh_cookies,
            commands::open_video_folder,
            commands::open_url,
            commands::migrate_files,
            commands::get_viral_videos,
            commands::get_group_stats,
            commands::get_channel_stats,
            commands::clear_all_data,
            commands::clear_download_history,
            commands::resolve_video_info,
            commands::export_backup,
            commands::export_backup_to_file,
            commands::import_backup,
            commands::get_channel_details,
            commands::get_video,
            commands::toggle_video_favorite,
            commands::get_machine_id,
            commands::get_api_keys,
            commands::add_api_key,
            commands::delete_api_key,
            commands::update_api_key,
            commands::recalculate_all_stats,
            commands::activate_software,
            commands::cancel_add_channels,
            commands::check_dependencies
        ])
        .manage(commands::DownloadState::default())
        .manage(commands::CancellationFlag(Arc::new(AtomicBool::new(false))))
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
