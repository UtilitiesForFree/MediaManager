use std::path::{Path, PathBuf};
use std::sync::Mutex;
use rusqlite::{params, Connection};
use mm_core::AppError;
use tracing::debug;
use std::time::{SystemTime, UNIX_EPOCH};

pub struct ThumbCache {
    conn: Mutex<Connection>,
    cache_dir: PathBuf,
}

impl ThumbCache {
    pub fn open(app_dir: &Path) -> Result<Self, AppError> {
        let cache_root = app_dir.join("cache");
        let thumbs_dir = cache_root.join("thumbs");
        let db_path = cache_root.join("cache.db");

        std::fs::create_dir_all(&thumbs_dir).ok();

        let conn = Connection::open(db_path)?;
        
        // Init schema
        conn.execute_batch(
            "CREATE TABLE IF NOT EXISTS thumbs (
                key         TEXT PRIMARY KEY,
                thumb_path  TEXT NOT NULL,
                bytes       INTEGER NOT NULL,
                created_at  INTEGER NOT NULL,
                accessed_at INTEGER NOT NULL
            );
            CREATE INDEX IF NOT EXISTS idx_thumbs_accessed ON thumbs(accessed_at);
            
            CREATE TABLE IF NOT EXISTS thumb_failures (
                key          TEXT PRIMARY KEY,
                reason       TEXT NOT NULL,
                failed_at    INTEGER NOT NULL,
                retry_after  INTEGER NOT NULL
            );
            
            CREATE TABLE IF NOT EXISTS schema_version (
                version INTEGER PRIMARY KEY
            );
            INSERT OR IGNORE INTO schema_version VALUES (1);"
        )?;

        Ok(Self {
            conn: Mutex::new(conn),
            cache_dir: thumbs_dir,
        })
    }

    pub fn get(&self, key: &str) -> Result<Option<PathBuf>, AppError> {
        let conn = self.conn.lock().unwrap();
        let mut stmt = conn.prepare("SELECT thumb_path FROM thumbs WHERE key = ?")?;
        let mut rows = stmt.query(params![key])?;

        if let Some(row) = rows.next()? {
            let relative_path: String = row.get(0)?;
            let full_path = self.cache_dir.join(relative_path);
            if full_path.exists() {
                return Ok(Some(full_path));
            } else {
                // Cleanup stale DB entry
                debug!("Stale cache entry for key: {}", key);
                conn.execute("DELETE FROM thumbs WHERE key = ?", params![key]).ok();
            }
        }
        Ok(None)
    }

    pub fn put(&self, key: &str, thumb_file_name: &str, bytes: &[u8]) -> Result<PathBuf, AppError> {
        let now = SystemTime::now().duration_since(UNIX_EPOCH).unwrap().as_secs() as i64;
        let full_path = self.cache_dir.join(thumb_file_name);
        
        std::fs::write(&full_path, bytes)?;

        let conn = self.conn.lock().unwrap();
        conn.execute(
            "INSERT OR REPLACE INTO thumbs (key, thumb_path, bytes, created_at, accessed_at) 
             VALUES (?, ?, ?, ?, ?)",
            params![key, thumb_file_name, bytes.len() as i64, now, now],
        )?;

        Ok(full_path)
    }

    pub fn get_cache_dir(&self) -> PathBuf {
        self.cache_dir.clone()
    }

    pub fn touch(&self, key: &str) -> Result<(), AppError> {
        let now = SystemTime::now().duration_since(UNIX_EPOCH).unwrap().as_secs() as i64;
        let conn = self.conn.lock().unwrap();
        conn.execute("UPDATE thumbs SET accessed_at = ? WHERE key = ?", params![now, key])?;
        Ok(())
    }

    pub fn evict_until(&self, target_bytes: u64) -> Result<u64, AppError> {
        let conn = self.conn.lock().unwrap();
        
        let mut total_bytes: u64 = conn.query_row("SELECT IFNULL(SUM(bytes), 0) FROM thumbs", [], |r| r.get(0))?;
        let mut evicted_count = 0;

        if total_bytes <= target_bytes {
            return Ok(0);
        }

        let mut stmt = conn.prepare("SELECT key, thumb_path, bytes FROM thumbs ORDER BY accessed_at ASC")?;
        let rows = stmt.query_map([], |row| {
            Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?, row.get::<_, u64>(2)?))
        })?;

        for row in rows {
            let (key, thumb_path, bytes) = row?;
            let full_path = self.cache_dir.join(thumb_path);
            
            std::fs::remove_file(full_path).ok();
            conn.execute("DELETE FROM thumbs WHERE key = ?", params![key])?;
            
            evicted_count += 1;
            total_bytes -= bytes;
            
            if total_bytes <= target_bytes {
                break;
            }
        }

        Ok(evicted_count)
    }

    pub fn mark_failed(&self, key: &str, reason: &str, retry_after_secs: u64) {
        let now = SystemTime::now().duration_since(UNIX_EPOCH).unwrap().as_secs() as u64;
        let retry_after = now + retry_after_secs;
        
        let conn = self.conn.lock().unwrap();
        conn.execute(
            "INSERT OR REPLACE INTO thumb_failures (key, reason, failed_at, retry_after) VALUES (?, ?, ?, ?)",
            params![key, reason, now as i64, retry_after as i64],
        ).ok();
    }

    pub fn clear_failures(&self) {
        let conn = self.conn.lock().unwrap();
        conn.execute("DELETE FROM thumb_failures", []).ok();
    }

    pub fn is_failed(&self, key: &str) -> bool {
        let now = SystemTime::now().duration_since(UNIX_EPOCH).unwrap().as_secs() as i64;
        let conn = self.conn.lock().unwrap();
        
        let res: Result<i64, _> = conn.query_row(
            "SELECT retry_after FROM thumb_failures WHERE key = ?",
            params![key],
            |r| r.get(0),
        );

        match res {
            Ok(retry_after) => now < retry_after,
            Err(_) => false,
        }
    }
}
