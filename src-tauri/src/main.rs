#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::sync::{Arc, Mutex};
use std::collections::HashMap;
use mm_app::{AppState, UndoLog, register_handlers};
use mm_cache::ThumbCache;
use mm_thumbs::ThumbGen;
use mm_libraries::LibraryStore;
use mm_fs::WatcherSet;
use mm_core::config;
use tauri::Manager;

fn main() {
    init_tracing();
    
    let builder = tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_shell::init())
        .setup(|app| {
            let app_handle = app.handle();
            
            // Load config
            let cfg = config::load().expect("failed to load config");
            let libraries_root = std::path::PathBuf::from(&cfg.libraries_root);
            
            let app_dir = app_handle.path().app_data_dir()
                .unwrap_or_else(|_| dirs_home_dir().unwrap().join(".medialib"));
            
            std::fs::create_dir_all(&app_dir).ok();

            let cache = Arc::new(ThumbCache::open(&app_dir).expect("failed to open cache"));
            cache.clear_failures(); // retry all previously-failed thumbnails on fresh launch
            let thumbs = Arc::new(ThumbGen::new(cache.clone(), 4));
            let libraries = Arc::new(LibraryStore::new(libraries_root));
            
            app.manage(AppState { 
                cache, 
                thumbs, 
                libraries,
                cancellations: Arc::new(Mutex::new(HashMap::new())),
                undo: Arc::new(Mutex::new(UndoLog::new())),
                watchers: Arc::new(WatcherSet::new()),
                searches: Arc::new(Mutex::new(HashMap::new())),
            });
            Ok(())
        });
    
    let builder = register_handlers(builder);
    builder.run(tauri::generate_context!())
        .expect("error while running tauri application");
}

fn init_tracing() {
    use tracing_subscriber::{layer::SubscriberExt, util::SubscriberInitExt, EnvFilter};
    let log_dir = dirs_home_dir().map(|h| h.join(".medialib").join("logs"));
    
    if let Some(log_dir) = log_dir {
        std::fs::create_dir_all(&log_dir).ok();
        let file = tracing_appender::rolling::daily(&log_dir, "app.log");
        tracing_subscriber::registry()
            .with(EnvFilter::try_from_default_env().unwrap_or_else(|_| EnvFilter::new("info")))
            .with(tracing_subscriber::fmt::layer().with_writer(std::io::stderr))
            .with(tracing_subscriber::fmt::layer().with_writer(file).with_ansi(false))
            .init();
    } else {
        tracing_subscriber::fmt::init();
    }
}

fn dirs_home_dir() -> Option<std::path::PathBuf> {
    #[cfg(target_os = "windows")]
    { std::env::var_os("USERPROFILE").map(std::path::PathBuf::from) }
    #[cfg(not(target_os = "windows"))]
    { std::env::var_os("HOME").map(std::path::PathBuf::from) }
}
