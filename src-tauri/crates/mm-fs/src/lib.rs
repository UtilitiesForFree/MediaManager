use std::path::{Path, PathBuf};
use std::sync::Arc;
use std::sync::atomic::{AtomicBool, Ordering};
use mm_core::{AppError, FolderNode, MediaItem, MediaKind, MediaListResult, SortBy, SortDir, ConflictPolicy, OpResult, OpFailure, SearchFilters};
use walkdir::WalkDir;
use tracing::warn;
use std::collections::HashMap;
use std::sync::Mutex;
use tauri::{AppHandle, Emitter};
use tokio::sync::mpsc;

pub mod watching;
pub mod search;

use crate::watching::{WatchHandle, watch_path};

pub trait ProgressEmitter: Send + Sync {
    fn emit(&self, completed: usize, total: usize, current: &str);
}

pub struct NoopProgress;
impl ProgressEmitter for NoopProgress {
    fn emit(&self, _: usize, _: usize, _: &str) {}
}

pub struct WatcherSet {
    handles: Mutex<HashMap<PathBuf, WatchHandle>>,
}

impl WatcherSet {
    pub fn new() -> Self {
        Self { handles: Mutex::new(HashMap::new()) }
    }

    pub fn watch(&self, path: PathBuf, app: AppHandle) -> Result<(), AppError> {
        let mut handles = self.handles.lock().unwrap();
        if handles.contains_key(&path) {
            return Ok(());
        }

        let (tx, mut rx) = mpsc::channel(100);
        let handle = watch_path(path.clone(), tx)?;
        handles.insert(path, handle);

        tokio::spawn(async move {
            while let Some(event) = rx.recv().await {
                app.emit("fs-changed", event).ok();
            }
        });

        Ok(())
    }

    pub fn unwatch(&self, path: &Path) {
        let mut handles = self.handles.lock().unwrap();
        handles.remove(path);
    }

    pub fn watch_only(&self, paths: Vec<PathBuf>, app: AppHandle) {
        let mut handles = self.handles.lock().unwrap();
        
        // Remove those not in the new set
        handles.retain(|p, _| paths.contains(p));

        // Add those not already in the set
        for path in paths {
            if !handles.contains_key(&path) {
                let (tx, mut rx) = mpsc::channel(100);
                if let Ok(handle) = watch_path(path.clone(), tx) {
                    handles.insert(path, handle);
                    let app_clone = app.clone();
                    tokio::spawn(async move {
                        while let Some(event) = rx.recv().await {
                            app_clone.emit("fs-changed", event).ok();
                        }
                    });
                }
            }
        }
    }
}

pub fn list_directory(path: &Path) -> Result<Vec<FolderNode>, AppError> {
    if !path.exists() {
        return Err(AppError::NotFound(path.to_string_lossy().into()));
    }

    let entries = std::fs::read_dir(path)?;
    let mut nodes = Vec::new();

    for entry in entries {
        let entry = entry?;
        let file_type = entry.file_type()?;

        if file_type.is_dir() {
            let name = entry.file_name().to_string_lossy().into_owned();
            
            if name.starts_with('.') || EXCLUDED_DIRS.contains(&name.as_str()) {
                continue;
            }

            let path = entry.path();
            let has_children = has_directory_children(&path);

            nodes.push(FolderNode {
                path: path.to_string_lossy().into_owned(),
                name,
                has_children,
                is_library: false,
            });
        }
    }

    nodes.sort_by(|a, b| a.name.to_lowercase().cmp(&b.name.to_lowercase()));
    Ok(nodes)
}

fn has_directory_children(path: &Path) -> bool {
    if let Ok(entries) = std::fs::read_dir(path) {
        for entry in entries {
            if let Ok(entry) = entry {
                if let Ok(file_type) = entry.file_type() {
                    if file_type.is_dir() {
                        let name = entry.file_name();
                        let name_str = name.to_string_lossy();
                        if !name_str.starts_with('.') && !EXCLUDED_DIRS.contains(&name_str.as_ref()) {
                            return true;
                        }
                    }
                }
            }
        }
    }
    false
}

pub fn list_roots() -> Result<Vec<FolderNode>, AppError> {
    #[cfg(not(windows))]
    {
        let mut roots = Vec::new();
        roots.push(FolderNode {
            path: "/".into(),
            name: "Root".into(),
            has_children: true,
            is_library: false,
        });

        if let Some(home) = dirs_home_dir() {
            roots.push(FolderNode {
                path: home.to_string_lossy().into_owned(),
                name: "Home".into(),
                has_children: true,
                is_library: false,
            });
        }
        Ok(roots)
    }

    #[cfg(windows)]
    {
        let mut roots = Vec::new();
        for drive in b'A'..=b'Z' {
            let drive_str = format!("{}:\\", drive as char);
            let path = Path::new(&drive_str);
            if path.exists() {
                roots.push(FolderNode {
                    path: drive_str.clone(),
                    name: drive_str,
                    has_children: true,
                    is_library: false,
                });
            }
        }
        Ok(roots)
    }
}

pub fn get_home_directory() -> Result<String, AppError> {
    dirs_home_dir()
        .map(|p| p.to_string_lossy().into_owned())
        .ok_or_else(|| AppError::Internal("Could not find home directory".into()))
}

pub fn list_media(
    path: &Path,
    recursive: bool,
    sort_by: SortBy,
    sort_dir: SortDir,
) -> Result<MediaListResult, AppError> {
    let mut items = Vec::new();
    let mut total_scanned = 0;
    let mut truncated = false;

    let mut walker = WalkDir::new(path)
        .max_depth(if recursive { usize::MAX } else { 1 })
        .into_iter()
        .filter_entry(|e| {
            let name = e.file_name().to_string_lossy();
            !name.starts_with('.') && !EXCLUDED_DIRS.contains(&name.as_ref())
        });

    while let Some(entry) = walker.next() {
        let entry = match entry {
            Ok(e) => e,
            Err(err) => {
                warn!("Skip entry: {}", err);
                continue;
            }
        };

        if entry.file_type().is_file() {
            total_scanned += 1;
            
            if items.len() >= MAX_MEDIA_ITEMS {
                truncated = true;
                break;
            }

            let path_buf = entry.path().to_path_buf();
            let kind = detect_media_kind(&path_buf);

            if matches!(kind, MediaKind::Unknown) {
                continue;
            }

            if let Ok(metadata) = entry.metadata() {
                items.push(MediaItem {
                    path: path_buf.to_string_lossy().into_owned(),
                    name: entry.file_name().to_string_lossy().into_owned(),
                    size: metadata.len(),
                    modified: metadata.modified().ok()
                        .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
                        .map(|d| d.as_millis() as i64)
                        .unwrap_or(0),
                    kind,
                    width: None,
                    height: None,
                    duration: None,
                    hash: None,
                });
            }
        }
    }

    apply_sort(&mut items, sort_by, sort_dir);

    Ok(MediaListResult {
        items,
        truncated,
        total_scanned,
    })
}

pub async fn move_items(
    items: Vec<PathBuf>,
    target_dir: &Path,
    policy: ConflictPolicy,
    op_id: &str,
    progress: Arc<dyn ProgressEmitter>,
    cancel: Arc<AtomicBool>,
) -> Result<OpResult, AppError> {
    let mut result = OpResult {
        op_id: op_id.into(),
        successes: Vec::new(),
        failures: Vec::new(),
    };

    let total = items.len();
    for (idx, source) in items.into_iter().enumerate() {
        if cancel.load(Ordering::Relaxed) {
            return Err(AppError::Cancelled);
        }

        let name = match source.file_name() {
            Some(n) => n.to_string_lossy().into_owned(),
            None => {
                result.failures.push(OpFailure { path: source.to_string_lossy().into(), reason: "Invalid filename".into() });
                continue;
            }
        };

        progress.emit(idx, total, &name);

        let mut target = target_dir.join(&name);
        if target.exists() {
            match policy {
                ConflictPolicy::Skip => {
                    result.failures.push(OpFailure { path: source.to_string_lossy().into(), reason: "Target exists".into() });
                    continue;
                }
                ConflictPolicy::Overwrite => { /* Continue */ }
                ConflictPolicy::Rename => {
                    target = resolve_target(target_dir, &name);
                }
            }
        }

        if let Err(e) = move_file(&source, &target).await {
            result.failures.push(OpFailure { path: source.to_string_lossy().into(), reason: e.to_string() });
        } else {
            result.successes.push(target.to_string_lossy().into());
        }
    }

    Ok(result)
}

pub async fn copy_items(
    items: Vec<PathBuf>,
    target_dir: &Path,
    policy: ConflictPolicy,
    op_id: &str,
    progress: Arc<dyn ProgressEmitter>,
    cancel: Arc<AtomicBool>,
) -> Result<OpResult, AppError> {
    let mut result = OpResult {
        op_id: op_id.into(),
        successes: Vec::new(),
        failures: Vec::new(),
    };

    let total = items.len();
    for (idx, source) in items.into_iter().enumerate() {
        if cancel.load(Ordering::Relaxed) {
            return Err(AppError::Cancelled);
        }

        let name = match source.file_name() {
            Some(n) => n.to_string_lossy().into_owned(),
            None => {
                result.failures.push(OpFailure { path: source.to_string_lossy().into(), reason: "Invalid filename".into() });
                continue;
            }
        };

        progress.emit(idx, total, &name);

        let mut target = target_dir.join(&name);
        if target.exists() {
            match policy {
                ConflictPolicy::Skip => {
                    result.failures.push(OpFailure { path: source.to_string_lossy().into(), reason: "Target exists".into() });
                    continue;
                }
                ConflictPolicy::Overwrite => { /* Continue */ }
                ConflictPolicy::Rename => {
                    target = resolve_target(target_dir, &name);
                }
            }
        }

        if let Err(e) = tokio::fs::copy(&source, &target).await {
            result.failures.push(OpFailure { path: source.to_string_lossy().into(), reason: e.to_string() });
        } else {
            result.successes.push(target.to_string_lossy().into());
        }
    }

    Ok(result)
}

pub async fn trash_items(items: Vec<PathBuf>) -> Result<OpResult, AppError> {
    let mut result = OpResult {
        op_id: "trash".into(),
        successes: Vec::new(),
        failures: Vec::new(),
    };

    for path in items {
        match trash::delete(&path) {
            Ok(_) => result.successes.push(path.to_string_lossy().into()),
            Err(e) => result.failures.push(OpFailure { path: path.to_string_lossy().into(), reason: e.to_string() }),
        }
    }

    Ok(result)
}

async fn move_file(source: &Path, target: &Path) -> Result<(), AppError> {
    if let Ok(_) = tokio::fs::rename(source, target).await {
        return Ok(());
    }

    tokio::fs::copy(source, target).await?;
    
    let src_meta = tokio::fs::metadata(source).await?;
    let dst_meta = tokio::fs::metadata(target).await?;

    if src_meta.len() != dst_meta.len() {
        tokio::fs::remove_file(target).await.ok();
        return Err(AppError::Internal("Verify failed: size mismatch".into()));
    }

    tokio::fs::remove_file(source).await?;
    Ok(())
}

fn resolve_target(target_dir: &Path, name: &str) -> PathBuf {
    let p = target_dir.join(name);
    if !p.exists() { return p; }
    
    let path = Path::new(name);
    let stem = path.file_stem().and_then(|s| s.to_str()).unwrap_or(name);
    let ext = path.extension().and_then(|s| s.to_str()).unwrap_or("");

    for n in 2.. {
        let candidate = if ext.is_empty() {
            target_dir.join(format!("{} ({})", stem, n))
        } else {
            target_dir.join(format!("{} ({}).{}", stem, n, ext))
        };
        if !candidate.exists() { return candidate; }
    }
    unreachable!()
}

fn detect_media_kind(path: &Path) -> MediaKind {
    let ext = path.extension()
        .and_then(|s| s.to_str())
        .map(|s| s.to_lowercase());

    match ext.as_deref() {
        Some("jpg") | Some("jpeg") | Some("png") | Some("gif") | Some("bmp") | 
        Some("tiff") | Some("tif") | Some("webp") | Some("heic") | Some("heif") => MediaKind::Image,
        
        Some("cr2") | Some("cr3") | Some("nef") | Some("arw") | Some("dng") | 
        Some("raf") | Some("rw2") | Some("orf") | Some("srw") | Some("pef") => MediaKind::Raw,
        
        Some("mp4") | Some("mov") | Some("mkv") | Some("avi") | Some("webm") | 
        Some("m4v") | Some("mts") | Some("m2ts") => MediaKind::Video,
        
        _ => MediaKind::Unknown,
    }
}

fn apply_sort(items: &mut Vec<MediaItem>, sort_by: SortBy, sort_dir: SortDir) {
    items.sort_by(|a, b| {
        let cmp = match sort_by {
            SortBy::Name => a.name.to_lowercase().cmp(&b.name.to_lowercase()),
            SortBy::Size => a.size.cmp(&b.size),
            SortBy::Modified => a.modified.cmp(&b.modified),
            SortBy::Type => {
                let a_kind = format!("{:?}", a.kind);
                let b_kind = format!("{:?}", b.kind);
                a_kind.cmp(&b_kind)
            },
            SortBy::DateTaken => a.modified.cmp(&b.modified),
        };

        if matches!(sort_dir, SortDir::Desc) {
            cmp.reverse()
        } else {
            cmp
        }
    });
}

fn dirs_home_dir() -> Option<PathBuf> {
    #[cfg(target_os = "windows")]
    { std::env::var_os("USERPROFILE").map(PathBuf::from) }
    #[cfg(not(target_os = "windows"))]
    { std::env::var_os("HOME").map(PathBuf::from) }
}

const EXCLUDED_DIRS: &[&str] = &[
    "node_modules",
    ".git",
    "$RECYCLE.BIN",
    "System Volume Information",
    ".Trashes",
    ".Spotlight-V100",
    "lost+found",
];

const MAX_MEDIA_ITEMS: usize = 50_000;
