use std::path::Path;
use mm_core::{AppError, MediaItem, MediaKind, SearchFilters};
use walkdir::WalkDir;
use std::sync::Arc;
use std::sync::atomic::{AtomicBool, Ordering};
use unicase::UniCase;

pub fn search(
    root: &Path,
    query: &str,
    filters: SearchFilters,
    cancel: Arc<AtomicBool>,
    mut on_batch: impl FnMut(Vec<MediaItem>),
) -> Result<(), AppError> {
    let mut batch = Vec::new();
    let query_uc = UniCase::new(query);

    let walker = WalkDir::new(root)
        .into_iter()
        .filter_entry(|e| {
            let name = e.file_name().to_string_lossy();
            !name.starts_with('.')
        });

    for entry in walker {
        if cancel.load(Ordering::Relaxed) {
            return Err(AppError::Cancelled);
        }

        let entry = match entry {
            Ok(e) => e,
            Err(_) => continue,
        };

        if entry.file_type().is_file() {
            let name = entry.file_name().to_string_lossy();
            if !query.is_empty() && !name.to_lowercase().contains(&query.to_lowercase()) {
                continue;
            }

            let path = entry.path().to_path_buf();
            let kind = detect_media_kind(&path);

            if matches!(kind, MediaKind::Unknown) {
                continue;
            }

            // Apply filters
            if let Some(ref kinds) = filters.kinds {
                if !kinds.contains(&kind) { continue; }
            }

            if let Ok(metadata) = entry.metadata() {
                let size = metadata.len();
                if let Some(min) = filters.size_min { if size < min { continue; } }
                if let Some(max) = filters.size_max { if size > max { continue; } }

                let modified = metadata.modified().ok()
                    .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
                    .map(|d| d.as_millis() as i64)
                    .unwrap_or(0);
                
                if let Some(from) = filters.date_from { if modified < from { continue; } }
                if let Some(to) = filters.date_to { if modified > to { continue; } }

                batch.push(MediaItem {
                    path: path.to_string_lossy().into_owned(),
                    name: name.into_owned(),
                    size,
                    modified,
                    kind,
                    width: None,
                    height: None,
                    duration: None,
                    hash: None,
                });

                if batch.len() >= 100 {
                    on_batch(std::mem::take(&mut batch));
                }
            }
        }
    }

    if !batch.is_empty() {
        on_batch(batch);
    }

    Ok(())
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
