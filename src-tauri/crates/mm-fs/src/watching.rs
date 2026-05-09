use std::path::PathBuf;
use mm_core::{AppError, FsEvent};
use notify::{Watcher, RecursiveMode, RecommendedWatcher, Event, EventKind};
use std::collections::HashMap;
use tokio::sync::mpsc;
use std::time::Duration;
use tokio::sync::oneshot;

pub struct WatchHandle {
    _watcher: RecommendedWatcher,
    stop_tx: oneshot::Sender<()>,
}

pub fn watch_path(
    path: PathBuf,
    event_tx: mpsc::Sender<FsEvent>,
) -> Result<WatchHandle, AppError> {
    let (stop_tx, mut stop_rx) = oneshot::channel();
    let (raw_tx, mut raw_rx) = mpsc::channel(100);

    let path_clone = path.clone();
    let mut watcher = RecommendedWatcher::new(move |res: notify::Result<Event>| {
        if let Ok(event) = res {
            let _ = raw_tx.blocking_send(event);
        }
    }, notify::Config::default()).map_err(|e| AppError::Internal(e.to_string()))?;

    watcher.watch(&path, RecursiveMode::NonRecursive).map_err(|e| AppError::Internal(e.to_string()))?;

    tokio::spawn(async move {
        let mut debouncer: HashMap<PathBuf, EventKind> = HashMap::new();
        let root = path_clone;

        loop {
            tokio::select! {
                _ = &mut stop_rx => break,
                Some(event) = raw_rx.recv() => {
                    for p in event.paths {
                        debouncer.insert(p, event.kind);
                    }
                }
                _ = tokio::time::sleep(Duration::from_millis(250)), if !debouncer.is_empty() => {
                    let mut fs_event = FsEvent {
                        root: root.to_string_lossy().into(),
                        created: Vec::new(),
                        modified: Vec::new(),
                        removed: Vec::new(),
                        renamed: Vec::new(),
                    };

                    for (p, kind) in debouncer.drain() {
                        let p_str = p.to_string_lossy().into();
                        match kind {
                            EventKind::Create(_) => fs_event.created.push(p_str),
                            EventKind::Modify(_) => fs_event.modified.push(p_str),
                            EventKind::Remove(_) => fs_event.removed.push(p_str),
                            _ => {}
                        }
                    }

                    if !fs_event.created.is_empty() || !fs_event.modified.is_empty() || !fs_event.removed.is_empty() {
                        let _ = event_tx.send(fs_event).await;
                    }
                }
            }
        }
    });

    Ok(WatchHandle { _watcher: watcher, stop_tx })
}
