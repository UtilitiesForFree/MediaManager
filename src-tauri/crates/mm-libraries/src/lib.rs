use std::path::{Path, PathBuf};
use mm_core::{AppError, Library, LibraryMarker};
use uuid::Uuid;
use chrono::Utc;
use std::fs;
use tracing::{info, warn};

pub struct LibraryStore {
    root: PathBuf,
}

impl LibraryStore {
    pub fn new(root: PathBuf) -> Self {
        Self { root }
    }

    pub fn list(&self) -> Result<Vec<Library>, AppError> {
        if !self.root.exists() {
            return Ok(Vec::new());
        }

        let mut libraries = Vec::new();
        for entry in fs::read_dir(&self.root)? {
            let entry = entry?;
            if entry.file_type()?.is_dir() {
                if let Some(lib) = self.load_marker(&entry.path()) {
                    libraries.push(Library {
                        id: lib.id,
                        name: lib.name,
                        path: entry.path().to_string_lossy().into_owned(),
                        icon: lib.icon,
                        color: lib.color,
                        created_at: lib.created_at,
                    });
                }
            }
        }

        libraries.sort_by(|a, b| a.name.to_lowercase().cmp(&b.name.to_lowercase()));
        Ok(libraries)
    }

    pub fn list_under(&self, parent_id: &str) -> Result<Vec<Library>, AppError> {
        let parent_path = self.resolve(parent_id)?;
        let mut libraries = Vec::new();
        for entry in fs::read_dir(parent_path)? {
            let entry = entry?;
            if entry.file_type()?.is_dir() {
                if let Some(lib) = self.load_marker(&entry.path()) {
                    libraries.push(Library {
                        id: lib.id,
                        name: lib.name,
                        path: entry.path().to_string_lossy().into_owned(),
                        icon: lib.icon,
                        color: lib.color,
                        created_at: lib.created_at,
                    });
                }
            }
        }
        libraries.sort_by(|a, b| a.name.to_lowercase().cmp(&b.name.to_lowercase()));
        Ok(libraries)
    }

    pub fn create(&self, name: &str, parent_id: Option<&str>, icon: Option<&str>, color: Option<&str>) -> Result<Library, AppError> {
        self.validate_name(name)?;

        let parent_path = if let Some(pid) = parent_id {
            self.resolve(pid)?
        } else {
            self.root.clone()
        };

        let lib_path = parent_path.join(name);
        if lib_path.exists() {
            return Err(AppError::LibraryExists(name.into()));
        }

        fs::create_dir_all(&lib_path)?;

        let marker = LibraryMarker {
            id: Uuid::new_v4().to_string(),
            name: name.into(),
            icon: icon.map(|s| s.into()),
            color: color.map(|s| s.into()),
            created_at: Utc::now().timestamp_millis(),
        };

        self.save_marker(&lib_path, &marker)?;

        Ok(Library {
            id: marker.id,
            name: marker.name,
            path: lib_path.to_string_lossy().into_owned(),
            icon: marker.icon,
            color: marker.color,
            created_at: marker.created_at,
        })
    }

    pub fn rename(&self, id: &str, new_name: &str) -> Result<Library, AppError> {
        self.validate_name(new_name)?;
        let old_path = self.resolve(id)?;
        let new_path = old_path.parent().unwrap().join(new_name);

        if new_path.exists() {
            return Err(AppError::LibraryExists(new_name.into()));
        }

        fs::rename(&old_path, &new_path)?;

        let mut marker = self.load_marker(&new_path)
            .ok_or_else(|| AppError::NotFound(id.into()))?;
        marker.name = new_name.into();
        self.save_marker(&new_path, &marker)?;

        Ok(Library {
            id: marker.id,
            name: marker.name,
            path: new_path.to_string_lossy().into_owned(),
            icon: marker.icon,
            color: marker.color,
            created_at: marker.created_at,
        })
    }

    pub fn update_meta(&self, id: &str, icon: Option<&str>, color: Option<&str>) -> Result<Library, AppError> {
        let path = self.resolve(id)?;
        let mut marker = self.load_marker(&path)
            .ok_or_else(|| AppError::NotFound(id.into()))?;
        
        if let Some(i) = icon { marker.icon = Some(i.into()); }
        if let Some(c) = color { marker.color = Some(c.into()); }

        self.save_marker(&path, &marker)?;

        Ok(Library {
            id: marker.id,
            name: marker.name,
            path: path.to_string_lossy().into_owned(),
            icon: marker.icon,
            color: marker.color,
            created_at: marker.created_at,
        })
    }

    pub fn delete(&self, id: &str, delete_files: bool) -> Result<(), AppError> {
        let path = self.resolve(id)?;
        if delete_files {
            trash::delete(&path).map_err(|e| AppError::Internal(e.to_string()))?;
        } else {
            let marker_path = path.join(".medialib.json");
            fs::remove_file(marker_path)?;
        }
        Ok(())
    }

    pub fn resolve(&self, id: &str) -> Result<PathBuf, AppError> {
        // Simple linear scan for now. If many libraries, we'd need a cache.
        for entry in fs::read_dir(&self.root)? {
            let entry = entry?;
            if entry.file_type()?.is_dir() {
                if let Some(marker) = self.load_marker(&entry.path()) {
                    if marker.id == id {
                        return Ok(entry.path());
                    }
                }
            }
        }
        Err(AppError::NotFound(id.into()))
    }

    pub fn is_library_path(&self, p: &Path) -> bool {
        if !p.starts_with(&self.root) {
            return false;
        }
        p.join(".medialib.json").exists()
    }

    fn load_marker(&self, path: &Path) -> Option<LibraryMarker> {
        let marker_path = path.join(".medialib.json");
        if !marker_path.exists() {
            return None;
        }
        let content = fs::read_to_string(marker_path).ok()?;
        serde_json::from_str(&content).ok()
    }

    fn save_marker(&self, path: &Path, marker: &LibraryMarker) -> Result<(), AppError> {
        let marker_path = path.join(".medialib.json");
        let content = serde_json::to_string_pretty(marker)
            .map_err(|e| AppError::Internal(e.to_string()))?;
        fs::write(marker_path, content)?;
        Ok(())
    }

    fn validate_name(&self, name: &str) -> Result<(), AppError> {
        if name.is_empty() || name.len() > 80 || name.starts_with('.') {
            return Err(AppError::InvalidName(name.into()));
        }
        let invalid_chars = ['/', '\\', ':', '*', '?', '"', '<', '>', '|'];
        if name.chars().any(|c| invalid_chars.contains(&c)) {
            return Err(AppError::InvalidName(name.into()));
        }
        Ok(())
    }
}
