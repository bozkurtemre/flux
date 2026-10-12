//! Log files on this machine, as a source. A local connection names a folder (or one file), and
//! these two commands are the only way the window reaches it: one lists the logs under it, the
//! other reads the end of one. Neither can reach anything outside the folder it was given — the
//! webview is allowed to run commands (docs/adr/0002), so a general filesystem API would be a
//! poor trade, as it was for workspaces.
use std::fs::{self, File};
use std::io::{Read, Seek, SeekFrom};
use std::path::{Path, PathBuf};
use std::time::UNIX_EPOCH;

/// Directories that hold dependencies or history rather than logs.
const SKIP: &[&str] = &["node_modules", "vendor", ".git", ".idea", "target", "dist"];
const DEPTH: usize = 4;
const FILES: usize = 500;

#[derive(serde::Serialize)]
pub struct LogFile {
    /// Relative to the folder, with `/` between the parts: the stream's id and its name.
    name: String,
    size: u64,
    /// Milliseconds since the epoch, so the front end can tell a file that changed.
    modified: u64,
}

/// A file that holds logs: by its extension, or a rotated one like `app.log.1`.
fn is_log(path: &Path) -> bool {
    let name = path
        .file_name()
        .and_then(|n| n.to_str())
        .unwrap_or("")
        .to_lowercase();
    let ext = path
        .extension()
        .and_then(|e| e.to_str())
        .unwrap_or("")
        .to_lowercase();
    matches!(ext.as_str(), "log" | "jsonl" | "ndjson" | "out" | "err") || name.contains(".log.")
}

fn entry(root: &Path, path: &Path) -> Option<LogFile> {
    let meta = fs::metadata(path).ok()?;
    let modified = meta
        .modified()
        .ok()?
        .duration_since(UNIX_EPOCH)
        .ok()?
        .as_millis() as u64;
    let name = if root.is_file() {
        path.file_name()?.to_string_lossy().into_owned()
    } else {
        path.strip_prefix(root)
            .ok()?
            .to_string_lossy()
            .replace('\\', "/")
    };
    Some(LogFile {
        name,
        size: meta.len(),
        modified,
    })
}

fn walk(root: &Path, dir: &Path, depth: usize, out: &mut Vec<LogFile>) {
    let Ok(entries) = fs::read_dir(dir) else {
        return;
    };
    for e in entries.flatten() {
        if out.len() >= FILES {
            return;
        }
        let path = e.path();
        let name = e.file_name().to_string_lossy().into_owned();
        if name.starts_with('.') || SKIP.contains(&name.as_str()) {
            continue;
        }
        // a link could point anywhere; only what is really under the folder is listed
        let Ok(kind) = e.file_type() else { continue };
        if kind.is_symlink() {
            continue;
        }
        if kind.is_dir() && depth > 0 {
            walk(root, &path, depth - 1, out);
        } else if kind.is_file() && is_log(&path) {
            out.extend(entry(root, &path));
        }
    }
}

/// The folder as given: absolute, and there.
fn root_of(root: &str) -> Result<PathBuf, String> {
    let root = Path::new(root.trim());
    if !root.is_absolute() {
        return Err("a local source must be an absolute path".into());
    }
    root.canonicalize()
        .map_err(|_| format!("no such file or folder: {}", root.display()))
}

/// The log files under a folder, newest first, or the one file it names.
#[tauri::command]
pub async fn local_list(root: String) -> Result<Vec<LogFile>, String> {
    let root = root_of(&root)?;
    let mut out = Vec::new();
    if root.is_file() {
        out.extend(entry(&root, &root));
    } else {
        walk(&root, &root, DEPTH, &mut out);
    }
    out.sort_by_key(|f| std::cmp::Reverse(f.modified));
    Ok(out)
}

/// The path a stream names, if and only if it is a file inside the folder.
fn inside(root: &Path, name: &str) -> Result<PathBuf, String> {
    let path = if root.is_file() {
        root.to_path_buf()
    } else {
        root.join(name)
    };
    let path = path
        .canonicalize()
        .map_err(|_| format!("no such log: {name}"))?;
    if !path.starts_with(root) || !path.is_file() {
        return Err(format!("not a log under this source: {name}"));
    }
    Ok(path)
}

/// The last `max_bytes` of a log, from the first whole line in them.
#[tauri::command]
pub async fn local_read(root: String, name: String, max_bytes: u64) -> Result<String, String> {
    let root = root_of(&root)?;
    let path = inside(&root, &name)?;
    let mut file = File::open(&path).map_err(|e| e.to_string())?;
    let len = file.metadata().map_err(|e| e.to_string())?.len();
    let start = len.saturating_sub(max_bytes);
    file.seek(SeekFrom::Start(start))
        .map_err(|e| e.to_string())?;
    let mut bytes = Vec::with_capacity((len - start) as usize);
    file.read_to_end(&mut bytes).map_err(|e| e.to_string())?;
    // a read that starts mid-file starts mid-line; that half line is not a message
    let from = if start > 0 {
        bytes
            .iter()
            .position(|b| *b == b'\n')
            .map_or(bytes.len(), |i| i + 1)
    } else {
        0
    };
    Ok(String::from_utf8_lossy(&bytes[from..]).into_owned())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn folder() -> PathBuf {
        let dir = std::env::temp_dir().join(format!("flux-local-{}", std::process::id()));
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(dir.join("api")).unwrap();
        fs::create_dir_all(dir.join("node_modules/x")).unwrap();
        fs::write(dir.join("api/app.log"), "one\ntwo\nthree\n").unwrap();
        fs::write(dir.join("api/app.log.1"), "old\n").unwrap();
        fs::write(dir.join("notes.txt"), "not a log").unwrap();
        fs::write(dir.join("node_modules/x/dep.log"), "nope").unwrap();
        dir
    }

    #[test]
    fn lists_logs_and_leaves_the_rest_out() {
        let dir = folder();
        let mut names: Vec<String> =
            tauri::async_runtime::block_on(local_list(dir.to_string_lossy().into()))
                .unwrap()
                .into_iter()
                .map(|f| f.name)
                .collect();
        names.sort();
        assert_eq!(names, vec!["api/app.log", "api/app.log.1"]);
    }

    #[test]
    fn reads_the_end_from_a_whole_line() {
        let dir = folder();
        let root = dir.to_string_lossy().to_string();
        let tail =
            tauri::async_runtime::block_on(local_read(root.clone(), "api/app.log".into(), 9))
                .unwrap();
        assert_eq!(tail, "three\n");
        let all = tauri::async_runtime::block_on(local_read(root, "api/app.log".into(), 1 << 20))
            .unwrap();
        assert_eq!(all, "one\ntwo\nthree\n");
    }

    #[test]
    fn refuses_anything_outside_the_folder() {
        let dir = folder();
        let root = dir.join("api").to_string_lossy().to_string();
        assert!(tauri::async_runtime::block_on(local_read(
            root.clone(),
            "../notes.txt".into(),
            100
        ))
        .is_err());
        assert!(
            tauri::async_runtime::block_on(local_read(root, "/etc/hosts".into(), 100)).is_err()
        );
        assert!(tauri::async_runtime::block_on(local_list("relative/path".into())).is_err());
    }
}
