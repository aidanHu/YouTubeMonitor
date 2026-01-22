mod db;
mod commands;
mod path_utils;
mod youtube_api;

use tauri::Manager;
use std::sync::{Arc, atomic::AtomicBool};

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  tauri::Builder::default()
    .setup(|app| {
      if cfg!(debug_assertions) {
        app.handle().plugin(
          tauri_plugin_log::Builder::default()
            .level(log::LevelFilter::Info)
            .build(),
        )?;
      }
      
      app.handle().plugin(tauri_plugin_dialog::init())?;
      
      let handle = app.handle().clone();
      tauri::async_runtime::block_on(async move {
          let pool = db::init(&handle).await.expect("Failed to initialize database");
          handle.manage(pool);
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

        commands::refresh_cookies,
        commands::open_video_folder,
        commands::open_url,
        commands::migrate_files,
        commands::get_viral_videos,
        commands::get_group_stats,
        commands::get_channel_stats,
        commands::clear_all_data,
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
        commands::cancel_add_channels
    ])
    .manage(commands::DownloadState::default())
    .manage(commands::CancellationFlag(Arc::new(AtomicBool::new(false))))
    .run(tauri::generate_context!())
    .expect("error while running tauri application");
}
