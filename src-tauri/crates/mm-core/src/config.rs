use std::path::{Path, PathBuf};
use crate::{AppConfig, AppError};

pub fn config_path() -> PathBuf {
    dirs_home_dir().map(|h| h.join(".medialib").join("config.json"))
        .expect("could not determine home directory")
}

pub fn load() -> Result<AppConfig, AppError> {
    let path = config_path();
    if !path.exists() {
        let mut cfg = AppConfig::default();
        cfg.libraries_root = default_libraries_root().to_string_lossy().into_owned();
        ensure_libraries_root(&cfg)?;
        save(&cfg)?;
        return Ok(cfg);
    }

    let content = std::fs::read_to_string(path)?;
    let cfg: AppConfig = serde_json::from_str(&content)
        .map_err(|e| AppError::Decode(e.to_string()))?;
    Ok(cfg)
}

pub fn save(cfg: &AppConfig) -> Result<(), AppError> {
    let path = config_path();
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent).ok();
    }
    let content = serde_json::to_string_pretty(cfg)
        .map_err(|e| AppError::Internal(e.to_string()))?;
    std::fs::write(path, content)?;
    Ok(())
}

pub fn ensure_libraries_root(cfg: &AppConfig) -> Result<(), AppError> {
    let path = Path::new(&cfg.libraries_root);
    std::fs::create_dir_all(path)?;
    Ok(())
}

fn default_libraries_root() -> PathBuf {
    dirs_home_dir().map(|h| h.join("MediaManager").join("Libraries"))
        .expect("could not determine home directory")
}

fn dirs_home_dir() -> Option<PathBuf> {
    #[cfg(target_os = "windows")]
    { std::env::var_os("USERPROFILE").map(PathBuf::from) }
    #[cfg(not(target_os = "windows"))]
    { std::env::var_os("HOME").map(PathBuf::from) }
}
