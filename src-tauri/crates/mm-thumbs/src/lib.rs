use std::path::{Path, PathBuf};
use std::sync::Arc;
use tokio::sync::Semaphore;
use mm_core::{AppError, MediaKind};
use mm_cache::ThumbCache;
use image::codecs::webp::WebPEncoder;
use tauri::{AppHandle, Emitter};
use serde::Serialize;
use blake3;
use hex;
use base64::Engine;
use tokio::time::{timeout, Duration};

pub struct ThumbGen {
    cache: Arc<ThumbCache>,
    sem: Arc<Semaphore>,
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
struct ThumbReadyPayload {
    path: String,
    url: String,
    size: u32,
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
struct ThumbFailedPayload {
    path: String,
    reason: String,
}

impl ThumbGen {
    pub fn new(cache: Arc<ThumbCache>, workers: usize) -> Self {
        Self {
            cache,
            sem: Arc::new(Semaphore::new(workers)),
        }
    }

    pub async fn get_or_generate(&self, _app: AppHandle, path: PathBuf, size: u32) -> Result<PathBuf, AppError> {
        let metadata = std::fs::metadata(&path)?;
        let mtime = metadata.modified()?.duration_since(std::time::UNIX_EPOCH).unwrap().as_millis();
        let file_size = metadata.len();

        let key = self.derive_key(&path, mtime as u64, file_size, size);

        if let Some(thumb_path) = self.cache.get(&key)? {
            self.cache.touch(&key).ok();
            return Ok(thumb_path);
        }

        if self.cache.is_failed(&key) {
            return Err(AppError::Decode("Cached failure".into()));
        }

        let _permit = self.sem.acquire().await.map_err(|_| AppError::Internal("Semaphore closed".into()))?;
        
        let cache_clone = self.cache.clone();
        let path_clone = path.clone();
        let key_clone = key.clone();

        let result = timeout(Duration::from_secs(30), tokio::task::spawn_blocking(move || {
            match generate_dispatch(&path_clone, size) {
                Ok((thumb_file_name, bytes)) => {
                    cache_clone.put(&key_clone, &thumb_file_name, &bytes)
                }
                Err(e) => {
                    cache_clone.mark_failed(&key_clone, &e.to_string(), 86400);
                    Err(e)
                }
            }
        })).await;

        match result {
            Ok(Ok(res)) => res,
            Ok(Err(e)) => Err(AppError::Internal(e.to_string())),
            Err(_) => Err(AppError::Timeout),
        }
    }

    pub fn enqueue(&self, app: AppHandle, paths: Vec<PathBuf>, size: u32) {
        let self_arc = Arc::new(self.clone_internal());
        
        tokio::spawn(async move {
            for path in paths {
                let app_handle = app.clone();
                let self_clone = self_arc.clone();
                let path_str = path.to_string_lossy().into_owned();

                match self_clone.get_or_generate(app_handle.clone(), path, size).await {
                    Ok(thumb_path) => {
                        let data_url = tokio::fs::read(&thumb_path).await
                            .map(|bytes| format!("data:image/webp;base64,{}", base64::engine::general_purpose::STANDARD.encode(&bytes)))
                            .unwrap_or_default();
                        app_handle.emit("thumbnail-ready", ThumbReadyPayload {
                            path: path_str,
                            url: data_url,
                            size,
                        }).ok();
                    }
                    Err(e) => {
                        app_handle.emit("thumbnail-failed", ThumbFailedPayload {
                            path: path_str,
                            reason: e.to_string(),
                        }).ok();
                    }
                }
            }
        });
    }

    fn clone_internal(&self) -> Self {
        Self {
            cache: self.cache.clone(),
            sem: self.sem.clone(),
        }
    }

    fn derive_key(&self, path: &Path, mtime: u64, size: u64, thumb_size: u32) -> String {
        let hash = blake3::hash(path.to_string_lossy().as_bytes());
        let hash_hex = hex::encode(&hash.as_bytes()[..16]);
        format!("{}:{}:{}:{}", hash_hex, mtime, size, thumb_size)
    }
}

fn generate_dispatch(path: &Path, size: u32) -> Result<(String, Vec<u8>), AppError> {
    let kind = detect_media_kind(path);
    
    match kind {
        MediaKind::Image => {
            generate_image(path, size)
        }
        MediaKind::Video => {
            generate_video(path, size)
        }
        MediaKind::Raw => {
            generate_raw(path, size)
        }
        _ => Err(AppError::Decode("Unsupported format".into())),
    }
}

fn generate_image(path: &Path, size: u32) -> Result<(String, Vec<u8>), AppError> {
    // Use with_guessed_format() so magic bytes determine the decoder, not the extension.
    // This handles files like PNG data saved with a .jpg extension.
    let img = image::ImageReader::open(path)
        .map_err(|e| AppError::Decode(e.to_string()))?
        .with_guessed_format()
        .map_err(|e| AppError::Decode(e.to_string()))?
        .decode()
        .map_err(|e| AppError::Decode(e.to_string()))?;
    let thumb = img.resize(size, size, image::imageops::FilterType::Lanczos3);
    
    let hash = blake3::hash(path.to_string_lossy().as_bytes());
    let thumb_file_name = format!("{}_{}.webp", hex::encode(&hash.as_bytes()[..8]), size);
    
    let mut buffer = Vec::new();
    let encoder = WebPEncoder::new_lossless(&mut buffer);
    thumb.write_with_encoder(encoder).map_err(|e| AppError::Decode(e.to_string()))?;
    
    Ok((thumb_file_name, buffer))
}

fn generate_video(path: &Path, size: u32) -> Result<(String, Vec<u8>), AppError> {
    generate_video_ffmpeg(path, size)
        .or_else(|_| generate_video_qlmanage(path, size))
}

fn generate_video_ffmpeg(path: &Path, size: u32) -> Result<(String, Vec<u8>), AppError> {
    use std::process::Command;

    let tmp_path = std::env::temp_dir().join(format!(
        "mm_thumb_{}_{}.png",
        std::process::id(),
        hex::encode(&blake3::hash(path.to_string_lossy().as_bytes()).as_bytes()[..8])
    ));

    // Try seeking to 1s; for very short clips fall back to frame 0
    let output = Command::new("ffmpeg")
        .args(["-ss", "00:00:01", "-i"])
        .arg(path)
        .args([
            "-vframes", "1",
            "-vf", &format!("scale={}:{}:force_original_aspect_ratio=decrease", size, size),
            "-q:v", "2", "-y",
        ])
        .arg(&tmp_path)
        .output()
        .map_err(|e| AppError::Decode(format!("ffmpeg not available: {}", e)))?;

    let output = if !output.status.success() || !tmp_path.exists() {
        let _ = std::fs::remove_file(&tmp_path);
        Command::new("ffmpeg")
            .args(["-i"])
            .arg(path)
            .args([
                "-vframes", "1",
                "-vf", &format!("scale={}:{}:force_original_aspect_ratio=decrease", size, size),
                "-q:v", "2", "-y",
            ])
            .arg(&tmp_path)
            .output()
            .map_err(|e| AppError::Decode(format!("ffmpeg not available: {}", e)))?
    } else {
        output
    };

    if !output.status.success() {
        let _ = std::fs::remove_file(&tmp_path);
        return Err(AppError::Decode("ffmpeg failed".into()));
    }

    let img_bytes = std::fs::read(&tmp_path)
        .map_err(|_| AppError::Decode("ffmpeg produced no output".into()))?;
    let _ = std::fs::remove_file(&tmp_path);

    encode_to_webp(&img_bytes, path, size)
}

fn generate_video_qlmanage(path: &Path, size: u32) -> Result<(String, Vec<u8>), AppError> {
    use std::process::Command;

    let tmp_dir = std::env::temp_dir().join(format!("mm_thumb_{}", std::process::id()));
    std::fs::create_dir_all(&tmp_dir).map_err(|e| AppError::Decode(e.to_string()))?;

    let status = Command::new("qlmanage")
        .args(["-t", "-s", &size.to_string(), "-o"])
        .arg(&tmp_dir)
        .arg(path)
        .output()
        .map_err(|e| AppError::Decode(format!("qlmanage: {}", e)))?;

    if !status.status.success() {
        let _ = std::fs::remove_dir_all(&tmp_dir);
        return Err(AppError::Decode("qlmanage failed".into()));
    }

    let file_name = path.file_name()
        .and_then(|n| n.to_str())
        .unwrap_or("video");
    let preview = tmp_dir.join(format!("{}.png", file_name));

    let img_bytes = std::fs::read(&preview)
        .map_err(|_| AppError::Decode("qlmanage produced no output".into()))?;
    let _ = std::fs::remove_dir_all(&tmp_dir);

    encode_to_webp(&img_bytes, path, size)
}

fn encode_to_webp(img_bytes: &[u8], path: &Path, size: u32) -> Result<(String, Vec<u8>), AppError> {
    let img = image::load_from_memory(img_bytes)
        .map_err(|e| AppError::Decode(e.to_string()))?;
    let thumb = img.resize(size, size, image::imageops::FilterType::Lanczos3);

    let hash = blake3::hash(path.to_string_lossy().as_bytes());
    let thumb_file_name = format!("{}_{}.webp", hex::encode(&hash.as_bytes()[..8]), size);
    let mut buffer = Vec::new();
    let encoder = WebPEncoder::new_lossless(&mut buffer);
    thumb.write_with_encoder(encoder).map_err(|e| AppError::Decode(e.to_string()))?;

    Ok((thumb_file_name, buffer))
}

fn generate_raw(path: &Path, _size: u32) -> Result<(String, Vec<u8>), AppError> {
    let _raw = rawloader::decode_file(path).map_err(|e| AppError::Decode(e.to_string()))?;
    Err(AppError::Decode("RAW not implemented yet".into()))
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
