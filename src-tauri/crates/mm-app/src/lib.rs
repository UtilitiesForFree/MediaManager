use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex};
use mm_core::{AppError, FolderNode, MediaListResult, SortBy, SortDir, Library, AppConfig, ConflictPolicy, OpResult, OpFailure, ExifData, SearchFilters, ImmichSyncResult};
use mm_fs::{self, WatcherSet};
use mm_cache::ThumbCache;
use mm_thumbs::ThumbGen;
use mm_libraries::LibraryStore;
use tauri::{AppHandle, State, Manager, Emitter};
use uuid::Uuid;
use serde::{Serialize, Deserialize};

use std::collections::HashMap;
use std::sync::atomic::{AtomicBool, Ordering};
use std::time::{Instant, Duration};

pub struct AppState {
    pub cache: Arc<ThumbCache>,
    pub thumbs: Arc<ThumbGen>,
    pub libraries: Arc<LibraryStore>,
    pub cancellations: Arc<Mutex<HashMap<String, Arc<AtomicBool>>>>,
    pub undo: Arc<Mutex<UndoLog>>,
    pub watchers: Arc<WatcherSet>,
    pub searches: Arc<Mutex<HashMap<String, Arc<AtomicBool>>>>,
}

pub struct UndoLog {
    pub last_move: Option<MoveRecord>,
}

pub struct MoveRecord {
    pub mappings: Vec<(PathBuf, PathBuf)>, // (now at, was at)
    pub at: Instant,
}

impl UndoLog {
    pub fn new() -> Self {
        Self { last_move: None }
    }
    pub fn record(&mut self, mappings: Vec<(PathBuf, PathBuf)>) {
        self.last_move = Some(MoveRecord {
            mappings,
            at: Instant::now(),
        });
    }
    pub fn take_within(&mut self, window: Duration) -> Option<MoveRecord> {
        if let Some(record) = self.last_move.take() {
            if record.at.elapsed() <= window {
                return Some(record);
            }
        }
        None
    }
}

#[derive(Deserialize, Debug)]
#[serde(tag = "op", rename_all = "camelCase")]
pub enum ImageEditOp {
    Rotate { degrees: u32 },
    FlipHorizontal,
    FlipVertical,
    Crop { x: u32, y: u32, width: u32, height: u32 },
    Brightness { value: i32 },
    Contrast { value: f32 },
}

pub fn register_handlers(
    builder: tauri::Builder<tauri::Wry>,
) -> tauri::Builder<tauri::Wry> {
    builder.invoke_handler(tauri::generate_handler![
        commands::ping,
        commands::list_directory,
        commands::list_roots,
        commands::get_home_directory,
        commands::list_media,
        commands::get_thumbnail,
        commands::generate_thumbnails_batch,
        commands::list_libraries,
        commands::list_libraries_under,
        commands::create_library,
        commands::rename_library,
        commands::update_library_meta,
        commands::delete_library,
        commands::get_config,
        commands::update_config,
        commands::move_to_library,
        commands::copy_to_library,
        commands::trash_items,
        commands::cancel_operation,
        commands::undo_last_move,
        commands::get_exif,
        commands::get_media_dimensions,
        commands::watch_directory,
        commands::unwatch_directory,
        commands::search_media,
        commands::cancel_search,
        commands::reveal_in_finder,
        commands::sync_library_to_immich,
        commands::rename_directory,
        commands::delete_directory,
        commands::edit_image,
        commands::load_image_preview,
    ])
}

pub mod commands {
    use super::*;

    #[tauri::command]
    pub fn ping() -> &'static str {
        "pong"
    }

    #[tauri::command]
    pub async fn list_directory(state: State<'_, AppState>, path: String) -> Result<Vec<FolderNode>, AppError> {
        let libraries = state.libraries.clone();
        tokio::task::spawn_blocking(move || {
            let mut nodes = mm_fs::list_directory(Path::new(&path))?;
            for node in &mut nodes {
                if libraries.is_library_path(Path::new(&node.path)) {
                    node.is_library = true;
                }
            }
            Ok(nodes)
        }).await.map_err(|e| AppError::Internal(e.to_string()))?
    }

    #[tauri::command]
    pub async fn list_roots() -> Result<Vec<FolderNode>, AppError> {
        tokio::task::spawn_blocking(move || {
            mm_fs::list_roots()
        }).await.map_err(|e| AppError::Internal(e.to_string()))?
    }

    #[tauri::command]
    pub async fn get_home_directory() -> Result<String, AppError> {
        tokio::task::spawn_blocking(move || {
            mm_fs::get_home_directory()
        }).await.map_err(|e| AppError::Internal(e.to_string()))?
    }

    #[tauri::command]
    pub async fn list_media(
        path: String,
        recursive: bool,
        sort_by: SortBy,
        sort_dir: SortDir,
    ) -> Result<MediaListResult, AppError> {
        tokio::task::spawn_blocking(move || {
            mm_fs::list_media(Path::new(&path), recursive, sort_by, sort_dir)
        }).await.map_err(|e| AppError::Internal(e.to_string()))?
    }

    #[tauri::command]
    pub async fn get_thumbnail(
        state: State<'_, AppState>,
        app: AppHandle,
        path: String,
        size: u32,
    ) -> Result<String, AppError> {
        use base64::Engine;
        let thumb_path = state.thumbs.get_or_generate(app, PathBuf::from(path), size).await?;
        let bytes = tokio::fs::read(&thumb_path).await?;
        let b64 = base64::engine::general_purpose::STANDARD.encode(&bytes);
        Ok(format!("data:image/webp;base64,{}", b64))
    }

    #[tauri::command]
    pub async fn generate_thumbnails_batch(
        state: State<'_, AppState>,
        app: AppHandle,
        paths: Vec<String>,
        size: u32,
    ) -> Result<(), AppError> {
        let path_bufs: Vec<PathBuf> = paths.into_iter().map(PathBuf::from).collect();
        state.thumbs.enqueue(app, path_bufs, size);
        Ok(())
    }

    #[tauri::command]
    pub async fn list_libraries(state: State<'_, AppState>) -> Result<Vec<Library>, AppError> {
        let libraries = state.libraries.clone();
        tokio::task::spawn_blocking(move || {
            libraries.list()
        }).await.map_err(|e| AppError::Internal(e.to_string()))?
    }

    #[tauri::command]
    pub async fn list_libraries_under(state: State<'_, AppState>, parent_id: String) -> Result<Vec<Library>, AppError> {
        let libraries = state.libraries.clone();
        tokio::task::spawn_blocking(move || {
            libraries.list_under(&parent_id)
        }).await.map_err(|e| AppError::Internal(e.to_string()))?
    }

    #[tauri::command]
    pub async fn create_library(
        state: State<'_, AppState>,
        app: AppHandle,
        name: String,
        parent_id: Option<String>,
        icon: Option<String>,
        color: Option<String>,
    ) -> Result<Library, AppError> {
        let libraries = state.libraries.clone();
        let res = tokio::task::spawn_blocking(move || {
            libraries.create(&name, parent_id.as_deref(), icon.as_deref(), color.as_deref())
        }).await.map_err(|e| AppError::Internal(e.to_string()))??;
        
        app.emit("library-changed", "created").ok();
        Ok(res)
    }

    #[tauri::command]
    pub async fn rename_library(
        state: State<'_, AppState>,
        app: AppHandle,
        id: String,
        new_name: String,
    ) -> Result<Library, AppError> {
        let libraries = state.libraries.clone();
        let res = tokio::task::spawn_blocking(move || {
            libraries.rename(&id, &new_name)
        }).await.map_err(|e| AppError::Internal(e.to_string()))??;
        
        app.emit("library-changed", "renamed").ok();
        Ok(res)
    }

    #[tauri::command]
    pub async fn update_library_meta(
        state: State<'_, AppState>,
        app: AppHandle,
        id: String,
        icon: Option<String>,
        color: Option<String>,
    ) -> Result<Library, AppError> {
        let libraries = state.libraries.clone();
        let res = tokio::task::spawn_blocking(move || {
            libraries.update_meta(&id, icon.as_deref(), color.as_deref())
        }).await.map_err(|e| AppError::Internal(e.to_string()))??;
        
        app.emit("library-changed", "updated").ok();
        Ok(res)
    }

    #[tauri::command]
    pub async fn delete_library(
        state: State<'_, AppState>,
        app: AppHandle,
        id: String,
        delete_files: bool,
    ) -> Result<(), AppError> {
        let libraries = state.libraries.clone();
        let res = tokio::task::spawn_blocking(move || {
            libraries.delete(&id, delete_files)
        }).await.map_err(|e| AppError::Internal(e.to_string()))??;
        
        app.emit("library-changed", "deleted").ok();
        Ok(())
    }

    #[tauri::command]
    pub fn get_config() -> Result<AppConfig, AppError> {
        mm_core::config::load()
    }

    #[tauri::command]
    pub fn update_config(app: AppHandle, config: AppConfig) -> Result<AppConfig, AppError> {
        mm_core::config::save(&config)?;
        app.emit("config-changed", &config).ok();
        Ok(config)
    }

    #[tauri::command]
    pub async fn move_to_library(
        state: State<'_, AppState>,
        app: AppHandle,
        items: Vec<String>,
        library_id: String,
        policy: ConflictPolicy,
    ) -> Result<OpResult, AppError> {
        let op_id = Uuid::new_v4().to_string();
        let cancel = Arc::new(AtomicBool::new(false));
        
        {
            let mut cancellations = state.cancellations.lock().unwrap();
            cancellations.insert(op_id.clone(), cancel.clone());
        }

        let target_dir = state.libraries.resolve(&library_id)?;
        let item_paths: Vec<PathBuf> = items.iter().map(PathBuf::from).collect();
        
        let progress = Arc::new(TauriProgress { app: app.clone(), op_id: op_id.clone() });
        let cancellations_ptr = Arc::clone(&state.cancellations);
        let undo_ptr = Arc::clone(&state.undo);

        let res = mm_fs::move_items(item_paths.clone(), &target_dir, policy, &op_id, progress, cancel).await?;
        
        {
            let mut cancellations = cancellations_ptr.lock().unwrap();
            cancellations.remove(&op_id);
        }

        // Record for undo
        let mut undo_mappings = Vec::new();
        for (src, dst) in items.iter().zip(res.successes.iter()) {
            undo_mappings.push((PathBuf::from(dst), PathBuf::from(src)));
        }
        if !undo_mappings.is_empty() {
            undo_ptr.lock().unwrap().record(undo_mappings);
        }

        app.emit("fileop-done", &res).ok();
        Ok(res)
    }

    #[tauri::command]
    pub async fn copy_to_library(
        state: State<'_, AppState>,
        app: AppHandle,
        items: Vec<String>,
        library_id: String,
        policy: ConflictPolicy,
    ) -> Result<OpResult, AppError> {
        let op_id = Uuid::new_v4().to_string();
        let cancel = Arc::new(AtomicBool::new(false));
        
        {
            let mut cancellations = state.cancellations.lock().unwrap();
            cancellations.insert(op_id.clone(), cancel.clone());
        }

        let target_dir = state.libraries.resolve(&library_id)?;
        let item_paths: Vec<PathBuf> = items.iter().map(PathBuf::from).collect();
        
        let progress = Arc::new(TauriProgress { app: app.clone(), op_id: op_id.clone() });
        let cancellations_ptr = Arc::clone(&state.cancellations);

        let res = mm_fs::copy_items(item_paths, &target_dir, policy, &op_id, progress, cancel).await?;
        
        {
            let mut cancellations = cancellations_ptr.lock().unwrap();
            cancellations.remove(&op_id);
        }

        app.emit("fileop-done", &res).ok();
        Ok(res)
    }

    #[tauri::command]
    pub async fn trash_items(items: Vec<String>) -> Result<OpResult, AppError> {
        let item_paths: Vec<PathBuf> = items.into_iter().map(PathBuf::from).collect();
        mm_fs::trash_items(item_paths).await
    }

    #[tauri::command]
    pub async fn cancel_operation(state: State<'_, AppState>, op_id: String) -> Result<(), AppError> {
        let cancellations = state.cancellations.lock().unwrap();
        if let Some(cancel) = cancellations.get(&op_id) {
            cancel.store(true, Ordering::Relaxed);
        }
        Ok(())
    }

    #[tauri::command]
    pub async fn undo_last_move(state: State<'_, AppState>) -> Result<OpResult, AppError> {
        let record = {
            let mut undo = state.undo.lock().unwrap();
            undo.take_within(Duration::from_secs(10))
        };

        if let Some(record) = record {
            let mut successes = Vec::new();
            let mut failures = Vec::new();

            for (src, dst) in record.mappings {
                if let Err(e) = tokio::fs::rename(&src, &dst).await {
                    failures.push(OpFailure { path: src.to_string_lossy().into(), reason: e.to_string() });
                } else {
                    successes.push(dst.to_string_lossy().into());
                }
            }

            Ok(OpResult {
                op_id: "undo".into(),
                successes,
                failures,
            })
        } else {
            Err(AppError::NotFound("No move to undo within window".into()))
        }
    }

    #[tauri::command]
    pub async fn get_exif(path: String) -> Result<ExifData, AppError> {
        tokio::task::spawn_blocking(move || {
            mm_exif::read(Path::new(&path))
        }).await.map_err(|e| AppError::Internal(e.to_string()))?
    }

    #[tauri::command]
    pub async fn get_media_dimensions(path: String) -> Result<(u32, u32), AppError> {
        tokio::task::spawn_blocking(move || {
            let p = Path::new(&path);
            let ext = p.extension().and_then(|s| s.to_str()).map(|s| s.to_lowercase());
            
            if matches!(ext.as_deref(), Some("mp4") | Some("mov") | Some("m4v")) {
                return Ok((0, 0));
            }

            let (w, h) = image::image_dimensions(p).map_err(|e| AppError::Decode(e.to_string()))?;
            Ok((w, h))
        }).await.map_err(|e| AppError::Internal(e.to_string()))?
    }

    #[tauri::command]
    pub async fn watch_directory(state: State<'_, AppState>, app: AppHandle, path: String) -> Result<(), AppError> {
        state.watchers.watch(PathBuf::from(path), app)
    }

    #[tauri::command]
    pub async fn unwatch_directory(state: State<'_, AppState>, path: String) -> Result<(), AppError> {
        state.watchers.unwatch(Path::new(&path));
        Ok(())
    }

    #[tauri::command]
    pub async fn search_media(
        state: State<'_, AppState>,
        app: AppHandle,
        root: String,
        query: String,
        filters: SearchFilters,
    ) -> Result<String, AppError> {
        let search_id = Uuid::new_v4().to_string();
        let cancel = Arc::new(AtomicBool::new(false));
        
        {
            let mut searches = state.searches.lock().unwrap();
            searches.insert(search_id.clone(), cancel.clone());
        }

        let search_id_clone = search_id.clone();
        let searches_ptr = Arc::clone(&state.searches);
        
        tokio::spawn(async move {
            let app_handle = app.clone();
            let search_id_batch = search_id_clone.clone();
            let res = tokio::task::spawn_blocking(move || {
                mm_fs::search::search(Path::new(&root), &query, filters, cancel, |batch| {
                    app_handle.emit("search-result", (&search_id_batch, batch)).ok();
                })
            }).await;

            match res {
                Ok(Ok(_)) => app.emit("search-done", &search_id_clone).ok(),
                Ok(Err(e)) => app.emit("search-error", (&search_id_clone, e.to_string())).ok(),
                Err(e) => app.emit("search-error", (&search_id_clone, e.to_string())).ok(),
            };

            let mut searches = searches_ptr.lock().unwrap();
            searches.remove(&search_id_clone);
        });

        Ok(search_id)
    }

    #[tauri::command]
    pub async fn cancel_search(state: State<'_, AppState>, search_id: String) -> Result<(), AppError> {
        let mut searches = state.searches.lock().unwrap();
        if let Some(cancel) = searches.remove(&search_id) {
            cancel.store(true, Ordering::Relaxed);
        }
        Ok(())
    }

    #[tauri::command]
    pub async fn reveal_in_finder(path: String) -> Result<(), AppError> {
        #[cfg(target_os = "macos")]
        std::process::Command::new("open")
            .args(["-R", &path])
            .spawn()
            .map_err(AppError::Io)?;
        #[cfg(target_os = "windows")]
        std::process::Command::new("explorer")
            .args(["/select,", &path])
            .spawn()
            .map_err(AppError::Io)?;
        #[cfg(target_os = "linux")]
        {
            let parent = std::path::Path::new(&path)
                .parent()
                .map(|p| p.to_string_lossy().into_owned())
                .unwrap_or(path);
            std::process::Command::new("xdg-open")
                .arg(&parent)
                .spawn()
                .map_err(AppError::Io)?;
        }
        Ok(())
    }

    #[tauri::command]
    pub async fn rename_directory(old_path: String, new_name: String) -> Result<String, AppError> {
        let old = PathBuf::from(&old_path);
        let parent = old.parent()
            .ok_or_else(|| AppError::Internal("path has no parent".into()))?;
        if new_name.is_empty() || new_name.contains('/') || new_name.contains('\\') {
            return Err(AppError::InvalidName(new_name));
        }
        let new_path = parent.join(&new_name);
        tokio::fs::rename(&old, &new_path).await.map_err(AppError::Io)?;
        Ok(new_path.to_string_lossy().into_owned())
    }

    #[tauri::command]
    pub async fn delete_directory(path: String) -> Result<(), AppError> {
        let p = PathBuf::from(&path);
        tokio::task::spawn_blocking(move || {
            trash::delete(&p).map_err(|e| AppError::Internal(e.to_string()))
        }).await.map_err(|e| AppError::Internal(e.to_string()))?
    }

    #[tauri::command]
    pub async fn edit_image(path: String, operation: crate::ImageEditOp) -> Result<(), AppError> {
        tokio::task::spawn_blocking(move || {
            let p = Path::new(&path);
            let reader = image::ImageReader::open(p)
                .map_err(|e| AppError::Internal(e.to_string()))?
                .with_guessed_format()
                .map_err(|e| AppError::Internal(e.to_string()))?;
            let format = reader.format()
                .ok_or_else(|| AppError::Decode("Cannot detect image format".into()))?;
            let img = reader.decode().map_err(|e| AppError::Decode(e.to_string()))?;

            let result = match operation {
                crate::ImageEditOp::Rotate { degrees } => match degrees {
                    90  => img.rotate90(),
                    180 => img.rotate180(),
                    270 => img.rotate270(),
                    _   => return Err(AppError::Internal("Invalid rotation degrees".into())),
                },
                crate::ImageEditOp::FlipHorizontal => img.fliph(),
                crate::ImageEditOp::FlipVertical   => img.flipv(),
                crate::ImageEditOp::Crop { x, y, width, height } => {
                    let w = width.min(img.width().saturating_sub(x));
                    let h = height.min(img.height().saturating_sub(y));
                    if w == 0 || h == 0 {
                        return Err(AppError::Internal("Crop region is empty".into()));
                    }
                    img.crop_imm(x, y, w, h)
                },
                crate::ImageEditOp::Brightness { value } => img.brighten(value),
                crate::ImageEditOp::Contrast { value }   => img.adjust_contrast(value),
            };

            let mut file = std::io::BufWriter::new(
                std::fs::File::create(p).map_err(AppError::Io)?
            );
            result.write_to(&mut file, format).map_err(|e| AppError::Decode(e.to_string()))
        }).await.map_err(|e| AppError::Internal(e.to_string()))?
    }

    #[tauri::command]
    pub async fn load_image_preview(path: String) -> Result<String, AppError> {
        tokio::task::spawn_blocking(move || {
            use base64::Engine;
            use std::io::Cursor;

            let p = Path::new(&path);
            let reader = image::ImageReader::open(p)
                .map_err(|e| AppError::Internal(e.to_string()))?
                .with_guessed_format()
                .map_err(|e| AppError::Internal(e.to_string()))?;
            let img = reader.decode().map_err(|e| AppError::Decode(e.to_string()))?;

            let img = if img.width() > 1400 || img.height() > 1400 {
                img.thumbnail(1400, 1400)
            } else {
                img
            };

            let mut buf = Vec::new();
            img.write_to(&mut Cursor::new(&mut buf), image::ImageFormat::Jpeg)
                .map_err(|e| AppError::Decode(e.to_string()))?;

            let b64 = base64::engine::general_purpose::STANDARD.encode(&buf);
            Ok(format!("data:image/jpeg;base64,{}", b64))
        }).await.map_err(|e| AppError::Internal(e.to_string()))?
    }

    #[tauri::command]
    pub async fn sync_library_to_immich(
        state: State<'_, AppState>,
        app: AppHandle,
        library_id: String,
    ) -> Result<ImmichSyncResult, AppError> {
        let cfg = mm_core::config::load()?;
        let url = cfg.immich_url.trim_end_matches('/').to_string();
        let api_key = cfg.immich_api_key.clone();

        if url.is_empty() || api_key.is_empty() {
            return Err(AppError::Internal(
                "Immich URL and API key must be configured in Settings → Integrations".into()
            ));
        }

        let library = state.libraries.list()?
            .into_iter()
            .find(|l| l.id == library_id)
            .ok_or_else(|| AppError::NotFound(library_id.clone()))?;

        let album_name = format!("mm-{}", library.name);
        let client = reqwest::Client::new();

        let items = {
            let path = library.path.clone();
            tokio::task::spawn_blocking(move || {
                mm_fs::list_media(std::path::Path::new(&path), true, SortBy::Modified, SortDir::Asc)
            }).await.map_err(|e| AppError::Internal(e.to_string()))??
        };

        let total = items.items.len();
        let album_id = immich_find_or_create_album(&client, &url, &api_key, &album_name).await?;

        let mut uploaded = 0usize;
        let mut skipped = 0usize;
        let mut failed = 0usize;
        let mut asset_ids: Vec<String> = Vec::new();

        for (idx, item) in items.items.iter().enumerate() {
            let fname = std::path::Path::new(&item.path)
                .file_name().unwrap_or_default()
                .to_string_lossy().into_owned();

            app.emit("immich-sync-progress", serde_json::json!({
                "libraryId": library_id,
                "current": idx,
                "total": total,
                "currentFile": fname,
            })).ok();

            match immich_upload_asset(&client, &url, &api_key, &item.path).await {
                Ok((id, duplicate)) => {
                    asset_ids.push(id);
                    if duplicate { skipped += 1; } else { uploaded += 1; }
                }
                Err(_) => { failed += 1; }
            }
        }

        if !asset_ids.is_empty() {
            immich_add_to_album(&client, &url, &api_key, &album_id, &asset_ids).await.ok();
        }

        app.emit("immich-sync-progress", serde_json::json!({
            "libraryId": library_id,
            "current": total,
            "total": total,
            "currentFile": "",
        })).ok();

        Ok(ImmichSyncResult { album_id, album_name, uploaded, skipped, failed })
    }
}

async fn immich_find_or_create_album(
    client: &reqwest::Client, url: &str, api_key: &str, name: &str,
) -> Result<String, AppError> {
    let albums: serde_json::Value = client
        .get(format!("{}/api/albums", url))
        .header("x-api-key", api_key)
        .send().await.map_err(|e| AppError::Internal(e.to_string()))?
        .json().await.map_err(|e| AppError::Internal(e.to_string()))?;

    if let Some(arr) = albums.as_array() {
        for a in arr {
            if a["albumName"].as_str() == Some(name) {
                if let Some(id) = a["id"].as_str() {
                    return Ok(id.to_string());
                }
            }
        }
    }

    let res: serde_json::Value = client
        .post(format!("{}/api/albums", url))
        .header("x-api-key", api_key)
        .json(&serde_json::json!({ "albumName": name }))
        .send().await.map_err(|e| AppError::Internal(e.to_string()))?
        .json().await.map_err(|e| AppError::Internal(e.to_string()))?;

    res["id"].as_str()
        .map(|s| s.to_string())
        .ok_or_else(|| AppError::Internal(format!("Immich album create failed: {}", res)))
}

async fn immich_upload_asset(
    client: &reqwest::Client, url: &str, api_key: &str, path: &str,
) -> Result<(String, bool), AppError> {
    let file_path = std::path::PathBuf::from(path);
    let file_name = file_path.file_name()
        .unwrap_or_default().to_string_lossy().into_owned();
    let mtime_secs = std::fs::metadata(&file_path)
        .and_then(|m| m.modified())
        .ok()
        .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
        .map(|d| d.as_secs())
        .unwrap_or(0);
    let ts = chrono::DateTime::<chrono::Utc>::from_timestamp(mtime_secs as i64, 0)
        .unwrap_or_default()
        .to_rfc3339();

    let bytes = tokio::fs::read(&file_path).await.map_err(AppError::Io)?;
    let mime = immich_mime(&file_path);
    let part = reqwest::multipart::Part::bytes(bytes)
        .file_name(file_name.clone())
        .mime_str(&mime).map_err(|e| AppError::Internal(e.to_string()))?;

    let form = reqwest::multipart::Form::new()
        .part("assetData", part)
        .text("deviceAssetId", format!("mm-{}-{}", file_name, mtime_secs))
        .text("deviceId", "MediaManager")
        .text("fileCreatedAt", ts.clone())
        .text("fileModifiedAt", ts)
        .text("isFavorite", "false");

    let body: serde_json::Value = client
        .post(format!("{}/api/assets", url))
        .header("x-api-key", api_key)
        .multipart(form)
        .send().await.map_err(|e| AppError::Internal(e.to_string()))?
        .json().await.map_err(|e| AppError::Internal(e.to_string()))?;

    let id = body["id"].as_str()
        .ok_or_else(|| AppError::Internal(format!("no asset id: {}", body)))?
        .to_string();
    let duplicate = body["status"].as_str() == Some("duplicate");
    Ok((id, duplicate))
}

async fn immich_add_to_album(
    client: &reqwest::Client, url: &str, api_key: &str, album_id: &str, ids: &[String],
) -> Result<(), AppError> {
    client
        .put(format!("{}/api/albums/{}/assets", url, album_id))
        .header("x-api-key", api_key)
        .json(&serde_json::json!({ "ids": ids }))
        .send().await.map_err(|e| AppError::Internal(e.to_string()))?;
    Ok(())
}

fn immich_mime(path: &std::path::Path) -> String {
    match path.extension().and_then(|s| s.to_str()).map(|s| s.to_lowercase()).as_deref() {
        Some("jpg") | Some("jpeg") => "image/jpeg",
        Some("png")  => "image/png",
        Some("gif")  => "image/gif",
        Some("webp") => "image/webp",
        Some("heic") | Some("heif") => "image/heic",
        Some("tiff") | Some("tif")  => "image/tiff",
        Some("mp4")  => "video/mp4",
        Some("mov")  => "video/quicktime",
        Some("mkv")  => "video/x-matroska",
        Some("avi")  => "video/x-msvideo",
        Some("webm") => "video/webm",
        _ => "application/octet-stream",
    }.to_string()
}

struct TauriProgress {
    app: AppHandle,
    op_id: String,
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
struct ProgressPayload {
    op_id: String,
    completed: usize,
    total: usize,
    current: String,
}

impl mm_fs::ProgressEmitter for TauriProgress {
    fn emit(&self, completed: usize, total: usize, current: &str) {
        self.app.emit("fileop-progress", ProgressPayload {
            op_id: self.op_id.clone(),
            completed,
            total,
            current: current.into(),
        }).ok();
    }
}
