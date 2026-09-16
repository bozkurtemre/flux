//! Regenerable cache, kept in the OS cache directory rather than the config directory.
//! Everything here can be deleted at any time and rebuilt from Graylog, which is what
//! makes "Invalidate Caches" a safe operation.

use std::path::PathBuf;
use tauri::Manager;

fn cache_dir(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    let dir = app
        .path()
        .app_cache_dir()
        .map_err(|e| e.to_string())?
        .join("introspection");
    std::fs::create_dir_all(&dir).map_err(|e| format!("{}: {e}", dir.display()))?;
    Ok(dir)
}

/// Refuse anything that could escape the cache directory.
fn entry(app: &tauri::AppHandle, key: &str) -> Result<PathBuf, String> {
    if key.is_empty()
        || !key
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '_')
    {
        return Err(format!("invalid cache key `{key}`"));
    }
    Ok(cache_dir(app)?.join(format!("{key}.json")))
}

#[tauri::command]
pub async fn cache_read(app: tauri::AppHandle, key: String) -> Result<Option<String>, String> {
    let path = entry(&app, &key)?;
    match std::fs::read_to_string(&path) {
        Ok(s) => Ok(Some(s)),
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(None),
        Err(e) => Err(format!("{}: {e}", path.display())),
    }
}

#[tauri::command]
pub async fn cache_write(app: tauri::AppHandle, key: String, value: String) -> Result<(), String> {
    let path = entry(&app, &key)?;
    // write beside the target and rename, so a crash never leaves a half-written cache
    let tmp = path.with_extension("json.tmp");
    std::fs::write(&tmp, value).map_err(|e| format!("{}: {e}", tmp.display()))?;
    std::fs::rename(&tmp, &path).map_err(|e| format!("{}: {e}", path.display()))
}

/// Drop every cached entry. Returns how many files were removed.
#[tauri::command]
pub async fn cache_clear(app: tauri::AppHandle) -> Result<usize, String> {
    let dir = cache_dir(&app)?;
    let mut removed = 0;
    for item in std::fs::read_dir(&dir).map_err(|e| format!("{}: {e}", dir.display()))? {
        let path = item.map_err(|e| e.to_string())?.path();
        if path.extension().is_some_and(|e| e == "json") {
            std::fs::remove_file(&path).map_err(|e| format!("{}: {e}", path.display()))?;
            removed += 1;
        }
    }
    Ok(removed)
}

/// Where the cache lives, so Settings can show it and the user can delete it by hand.
#[tauri::command]
pub async fn cache_location(app: tauri::AppHandle) -> Result<String, String> {
    Ok(cache_dir(&app)?.display().to_string())
}
