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
    let builder = builder.register_uri_scheme_protocol("mediafile", |_app, req| {
        serve_local_video(req)
    });
    builder.run(tauri::generate_context!())
        .expect("error while running tauri application");
}

/// Serves a local video file for the `mediafile://` custom scheme.
/// Supports HTTP Range requests so the <video> element can seek.
fn serve_local_video(req: tauri::http::Request<Vec<u8>>) -> tauri::http::Response<Vec<u8>> {
    use std::io::{Read, Seek, SeekFrom};

    let raw_path = req.uri().path();
    let decoded = percent_decode(raw_path);
    let path = std::path::Path::new(&decoded);

    let mut file = match std::fs::File::open(path) {
        Ok(f) => f,
        Err(_) => {
            return tauri::http::Response::builder()
                .status(404)
                .body(b"Not Found".to_vec())
                .unwrap();
        }
    };

    let file_size = match file.metadata() {
        Ok(m) => m.len(),
        Err(_) => {
            return tauri::http::Response::builder()
                .status(500)
                .body(b"Error reading metadata".to_vec())
                .unwrap();
        }
    };

    let content_type = video_content_type(path);

    // Handle Range header (required for video seeking)
    if let Some(range_val) = req.headers().get("range") {
        if let Ok(range_str) = range_val.to_str() {
            if let Some(bytes_part) = range_str.strip_prefix("bytes=") {
                let parts: Vec<&str> = bytes_part.splitn(2, '-').collect();
                if parts.len() == 2 {
                    let start = parts[0].parse::<u64>().unwrap_or(0).min(file_size);
                    let end = if parts[1].is_empty() {
                        // "bytes=X-" → return up to 1 MB chunk to keep memory bounded
                        (start + 1024 * 1024).min(file_size).saturating_sub(1)
                    } else {
                        parts[1].parse::<u64>().unwrap_or(file_size - 1).min(file_size - 1)
                    };

                    if start <= end {
                        let length = end - start + 1;
                        let mut buf = vec![0u8; length as usize];
                        if file.seek(SeekFrom::Start(start)).is_ok() {
                            let _ = file.read(&mut buf);
                        }

                        return tauri::http::Response::builder()
                            .status(206)
                            .header("Content-Type", content_type)
                            .header("Content-Range", format!("bytes {}-{}/{}", start, end, file_size))
                            .header("Content-Length", length.to_string())
                            .header("Accept-Ranges", "bytes")
                            .body(buf)
                            .unwrap();
                    }
                }
            }
        }
    }

    // Non-range request: return full file (the <video> element will switch to
    // range requests for buffering once it sees Accept-Ranges: bytes)
    let mut buf = Vec::with_capacity(file_size as usize);
    let _ = file.read_to_end(&mut buf);

    tauri::http::Response::builder()
        .status(200)
        .header("Content-Type", content_type)
        .header("Content-Length", file_size.to_string())
        .header("Accept-Ranges", "bytes")
        .body(buf)
        .unwrap()
}

fn video_content_type(path: &std::path::Path) -> &'static str {
    match path.extension().and_then(|s| s.to_str()).map(|s| s.to_lowercase()).as_deref() {
        Some("mp4") | Some("m4v") => "video/mp4",
        Some("mov") => "video/quicktime",
        Some("mkv") => "video/x-matroska",
        Some("avi") => "video/x-msvideo",
        Some("webm") => "video/webm",
        Some("mts") | Some("m2ts") => "video/mp2t",
        _ => "application/octet-stream",
    }
}

fn percent_decode(s: &str) -> String {
    let mut result = Vec::<u8>::new();
    let bytes = s.as_bytes();
    let mut i = 0;
    while i < bytes.len() {
        if bytes[i] == b'%' && i + 2 < bytes.len() {
            if let (Some(h), Some(l)) = (hex_nibble(bytes[i + 1]), hex_nibble(bytes[i + 2])) {
                result.push((h << 4) | l);
                i += 3;
                continue;
            }
        }
        result.push(bytes[i]);
        i += 1;
    }
    String::from_utf8_lossy(&result).into_owned()
}

fn hex_nibble(b: u8) -> Option<u8> {
    match b {
        b'0'..=b'9' => Some(b - b'0'),
        b'a'..=b'f' => Some(b - b'a' + 10),
        b'A'..=b'F' => Some(b - b'A' + 10),
        _ => None,
    }
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
