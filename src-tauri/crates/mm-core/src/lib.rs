use serde::{Deserialize, Serialize};

pub mod config;

#[derive(Serialize, Deserialize, Debug, Clone, Copy, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum MediaKind {
    Image,
    Video,
    Raw,
    Unknown,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
#[serde(rename_all = "camelCase")]
pub struct MediaItem {
    pub path: String,
    pub name: String,
    pub size: u64,
    pub modified: i64,
    pub kind: MediaKind,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub width: Option<u32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub height: Option<u32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub duration: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub hash: Option<String>,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
#[serde(rename_all = "camelCase")]
pub struct FolderNode {
    pub path: String,
    pub name: String,
    pub has_children: bool,
    pub is_library: bool,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
#[serde(rename_all = "camelCase")]
pub struct MediaListResult {
    pub items: Vec<MediaItem>,
    pub truncated: bool,
    pub total_scanned: usize,
}

#[derive(Serialize, Deserialize, Debug, Clone, Copy, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum SortBy {
    Name,
    DateTaken,
    Modified,
    Size,
    Type,
}

#[derive(Serialize, Deserialize, Debug, Clone, Copy, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum SortDir {
    Asc,
    Desc,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
#[serde(rename_all = "camelCase")]
pub struct AppConfig {
    pub libraries_root: String,
    pub language: String,
    pub theme: String,
    pub thumb_cache_size_mb: u64,
    pub thumb_workers: String, // "auto" or number as string
    pub check_updates_on_launch: bool,
    pub schema_version: u32,
    #[serde(default)]
    pub immich_url: String,
    #[serde(default)]
    pub immich_api_key: String,
}

impl Default for AppConfig {
    fn default() -> Self {
        Self {
            libraries_root: "".into(), // Needs to be set on first load
            language: "en".into(),
            theme: "dark".into(),
            thumb_cache_size_mb: 2048,
            thumb_workers: "auto".into(),
            check_updates_on_launch: true,
            schema_version: 1,
            immich_url: "".into(),
            immich_api_key: "".into(),
        }
    }
}

#[derive(Serialize, Deserialize, Debug, Clone)]
#[serde(rename_all = "camelCase")]
pub struct ImmichSyncResult {
    pub album_id: String,
    pub album_name: String,
    pub uploaded: usize,
    pub skipped: usize,
    pub failed: usize,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
#[serde(rename_all = "camelCase")]
pub struct Library {
    pub id: String,
    pub name: String,
    pub path: String,
    pub icon: Option<String>,
    pub color: Option<String>,
    pub created_at: i64,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct LibraryMarker {
    pub id: String,
    pub name: String,
    pub icon: Option<String>,
    pub color: Option<String>,
    pub created_at: i64,
}

#[derive(Serialize, Deserialize, Debug, Clone, Copy, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum ConflictPolicy {
    Skip,
    Overwrite,
    Rename,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
#[serde(rename_all = "camelCase")]
pub struct OpResult {
    pub op_id: String,
    pub successes: Vec<String>,
    pub failures: Vec<OpFailure>,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct OpFailure {
    pub path: String,
    pub reason: String,
}

#[derive(Serialize, Deserialize, Debug, Clone, Default)]
#[serde(rename_all = "camelCase")]
pub struct ExifData {
    pub camera_make: Option<String>,
    pub camera_model: Option<String>,
    pub lens: Option<String>,
    pub iso: Option<u32>,
    pub shutter_speed: Option<String>,
    pub aperture: Option<f32>,
    pub focal_length: Option<f32>,
    pub date_taken: Option<i64>,
    pub gps: Option<GpsCoords>,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct GpsCoords {
    pub lat: f64,
    pub lon: f64,
}

#[derive(Serialize, Deserialize, Debug, Clone, Default)]
#[serde(rename_all = "camelCase")]
pub struct SearchFilters {
    pub kinds: Option<Vec<MediaKind>>,
    pub date_from: Option<i64>,
    pub date_to: Option<i64>,
    pub size_min: Option<u64>,
    pub size_max: Option<u64>,
    pub has_gps: Option<bool>,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
#[serde(rename_all = "camelCase")]
pub struct FsEvent {
    pub root: String,
    pub created: Vec<String>,
    pub modified: Vec<String>,
    pub removed: Vec<String>,
    pub renamed: Vec<(String, String)>,
}

#[derive(thiserror::Error, Debug)]
pub enum AppError {
    #[error("path not found: {0}")]
    NotFound(String),

    #[error("path outside allowed root: {0}")]
    PathOutsideRoot(String),

    #[error("invalid name: {0}")]
    InvalidName(String),

    #[error("library exists: {0}")]
    LibraryExists(String),

    #[error("io error: {0}")]
    Io(#[from] std::io::Error),

    #[error("database: {0}")]
    Db(#[from] rusqlite::Error),

    #[error("decode failed: {0}")]
    Decode(String),

    #[error("operation cancelled")]
    Cancelled,

    #[error("timeout")]
    Timeout,

    #[error("internal: {0}")]
    Internal(String),
}

impl serde::Serialize for AppError {
    fn serialize<S: serde::Serializer>(&self, ser: S) -> Result<S::Ok, S::Error> {
        use serde::ser::SerializeStruct;
        let mut s = ser.serialize_struct("AppError", 2)?;
        s.serialize_field("code", self.code())?;
        s.serialize_field("message", &self.to_string())?;
        s.end()
    }
}

impl AppError {
    pub fn code(&self) -> &'static str {
        match self {
            Self::NotFound(_)        => "NOT_FOUND",
            Self::PathOutsideRoot(_) => "PATH_OUTSIDE_ROOT",
            Self::InvalidName(_)     => "INVALID_NAME",
            Self::LibraryExists(_)   => "LIBRARY_EXISTS",
            Self::Io(_)              => "IO",
            Self::Db(_)              => "DB",
            Self::Decode(_)          => "DECODE",
            Self::Cancelled          => "CANCELLED",
            Self::Timeout            => "TIMEOUT",
            Self::Internal(_)        => "INTERNAL",
        }
    }
}
