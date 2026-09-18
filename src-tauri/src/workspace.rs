//! A workspace keeps its files in a `.flux` directory inside the folder you opened, the way
//! an IDE keeps `.idea`. These three commands are the only way the window reaches a folder of
//! yours, and they cannot reach anything but that one directory: the webview is allowed to
//! run commands (docs/adr/0002), so a general filesystem API would be a poor trade.
use std::fs;
use std::path::{Component, Path, PathBuf};

const DIR: &str = ".flux";

/// `<folder>/.flux/<file>`, or an error. The folder must be absolute and must exist, and the
/// file must be a plain name: no separators, no parent hops, nothing that resolves elsewhere.
fn path_in_workspace(folder: &str, file: &str) -> Result<PathBuf, String> {
    let folder = Path::new(folder);
    if !folder.is_absolute() {
        return Err("workspace folder must be an absolute path".into());
    }
    if !folder.is_dir() {
        return Err(format!("no such folder: {}", folder.display()));
    }
    if file.is_empty() || Path::new(file).components().count() != 1 {
        return Err(format!("not a file name: {file}"));
    }
    if Path::new(file)
        .components()
        .any(|c| !matches!(c, Component::Normal(_)))
    {
        return Err(format!("not a file name: {file}"));
    }
    Ok(folder.join(DIR).join(file))
}

/// `None` when the workspace has no such file yet, which is how a folder opened for the
/// first time looks rather than a failure.
#[tauri::command]
pub async fn workspace_read(folder: String, file: String) -> Result<Option<String>, String> {
    let path = path_in_workspace(&folder, &file)?;
    match fs::read_to_string(&path) {
        Ok(text) => Ok(Some(text)),
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(None),
        Err(e) => Err(e.to_string()),
    }
}

#[tauri::command]
pub async fn workspace_write(folder: String, file: String, contents: String) -> Result<(), String> {
    let path = path_in_workspace(&folder, &file)?;
    if let Some(dir) = path.parent() {
        fs::create_dir_all(dir).map_err(|e| e.to_string())?;
    }
    fs::write(&path, contents).map_err(|e| e.to_string())
}

/// A file the person chose themselves, in the save dialog. The path is theirs rather than
/// ours, so there is nothing to restrict it to — but it is still only ever written whole,
/// never appended to or read back.
#[tauri::command]
pub async fn save_file(path: String, contents: String) -> Result<(), String> {
    fs::write(Path::new(&path), contents).map_err(|e| e.to_string())
}

/// Whether this folder has been opened as a workspace before.
#[tauri::command]
pub async fn workspace_exists(folder: String) -> Result<bool, String> {
    let folder = Path::new(&folder);
    Ok(folder.is_dir() && folder.join(DIR).is_dir())
}

#[cfg(test)]
mod tests {
    use super::path_in_workspace;

    #[test]
    fn refuses_anything_that_is_not_a_plain_file_name() {
        let dir = std::env::temp_dir();
        let folder = dir.to_str().unwrap();
        for bad in ["../escape.json", "sub/dir.json", "..", "", "/etc/passwd"] {
            assert!(path_in_workspace(folder, bad).is_err(), "allowed {bad}");
        }
        let ok = path_in_workspace(folder, "session.json").unwrap();
        assert!(ok.ends_with(".flux/session.json"));
    }

    #[test]
    fn refuses_a_relative_folder() {
        assert!(path_in_workspace("relative/folder", "session.json").is_err());
    }
}
