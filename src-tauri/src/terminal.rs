//! Pseudo-terminals, and nothing else. What to run, where, and under which tmux session is
//! decided in the front end (see `docs/adr/0002`); this file allocates the terminal, carries
//! bytes in both directions and cleans up after itself.
use std::collections::HashMap;
use std::io::{Read, Write};
use std::sync::{Arc, Mutex};

use portable_pty::{native_pty_system, Child, CommandBuilder, MasterPty, PtySize};
use tauri::ipc::Channel;
use tauri::State;

pub struct Session {
    /// Behind its own lock, so a blocked write holds nothing but its own terminal.
    writer: Arc<Mutex<Box<dyn Write + Send>>>,
    master: Box<dyn MasterPty + Send>,
    child: Box<dyn Child + Send + Sync>,
}

#[derive(Default)]
pub struct Terminals(Arc<Mutex<HashMap<String, Session>>>);

/// An empty program means "whatever login shell this machine gives me".
fn shell(program: &str) -> String {
    if !program.trim().is_empty() {
        return program.trim().to_string();
    }
    std::env::var("SHELL").unwrap_or_else(|_| "/bin/zsh".into())
}

/// Everything a tab needs to start, as the front end worked it out.
#[derive(serde::Deserialize)]
pub struct Spawn {
    id: String,
    program: String,
    args: Vec<String>,
    cwd: String,
    cols: u16,
    rows: u16,
}

#[tauri::command]
pub async fn terminal_open(
    spawn: Spawn,
    on_data: Channel<String>,
    terminals: State<'_, Terminals>,
) -> Result<(), String> {
    let Spawn {
        id,
        program,
        args,
        cwd,
        cols,
        rows,
    } = spawn;
    let pair = native_pty_system()
        .openpty(PtySize {
            rows,
            cols,
            pixel_width: 0,
            pixel_height: 0,
        })
        .map_err(|e| e.to_string())?;

    let mut cmd = CommandBuilder::new(shell(&program));
    for a in &args {
        cmd.arg(a);
    }
    if !cwd.is_empty() {
        cmd.cwd(&cwd);
    }
    // tmux and every curses program refuse to run without knowing what they are drawing on
    cmd.env("TERM", "xterm-256color");

    let child = pair.slave.spawn_command(cmd).map_err(|e| e.to_string())?;
    let writer = Arc::new(Mutex::new(
        pair.master.take_writer().map_err(|e| e.to_string())?,
    ));
    let mut reader = pair.master.try_clone_reader().map_err(|e| e.to_string())?;

    // registered before the reader starts: a child that dies at once would otherwise have the
    // thread remove a key that is only inserted afterwards, leaving a dead session behind
    let previous = terminals.0.lock().unwrap().insert(
        id.clone(),
        Session {
            writer,
            master: pair.master,
            child,
        },
    );
    if let Some(mut stale) = previous {
        let _ = stale.child.kill();
        let _ = stale.child.wait();
    }

    let map = Arc::clone(&terminals.0);
    let key = id.clone();
    std::thread::spawn(move || {
        let mut buf = [0u8; 4096];
        // a read can split a multi-byte character, so the tail waits for the rest of it
        let mut pending: Vec<u8> = Vec::new();
        loop {
            match reader.read(&mut buf) {
                Ok(0) | Err(_) => break,
                Ok(n) => {
                    pending.extend_from_slice(&buf[..n]);
                    let text = match std::str::from_utf8(&pending) {
                        Ok(s) => {
                            let s = s.to_string();
                            pending.clear();
                            s
                        }
                        Err(e) => {
                            let good = e.valid_up_to();
                            let s = String::from_utf8_lossy(&pending[..good]).into_owned();
                            pending.drain(..good);
                            s
                        }
                    };
                    if !text.is_empty() && on_data.send(text).is_err() {
                        break;
                    }
                }
            }
        }
        // the shell ended on its own: forget the session so a reopen starts clean
        map.lock().unwrap().remove(&key);
    });

    Ok(())
}

#[tauri::command]
pub async fn terminal_write(
    id: String,
    data: String,
    terminals: State<'_, Terminals>,
) -> Result<(), String> {
    // a program that has stopped draining its terminal blocks this write; holding the map's
    // lock across it would freeze every other terminal, including closing them all on quit
    let writer = {
        let map = terminals.0.lock().unwrap();
        Arc::clone(&map.get(&id).ok_or("no such terminal")?.writer)
    };
    let mut writer = writer.lock().unwrap();
    writer
        .write_all(data.as_bytes())
        .map_err(|e| e.to_string())?;
    writer.flush().map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn terminal_resize(
    id: String,
    cols: u16,
    rows: u16,
    terminals: State<'_, Terminals>,
) -> Result<(), String> {
    let map = terminals.0.lock().unwrap();
    let session = map.get(&id).ok_or("no such terminal")?;
    session
        .master
        .resize(PtySize {
            rows,
            cols,
            pixel_width: 0,
            pixel_height: 0,
        })
        .map_err(|e| e.to_string())
}

/// Ends the pseudo-terminal. Whether the tmux session behind it also dies is a separate
/// decision, made in the front end and carried out with `terminal_run`.
#[tauri::command]
pub async fn terminal_close(id: String, terminals: State<'_, Terminals>) -> Result<(), String> {
    let Some(mut session) = terminals.0.lock().unwrap().remove(&id) else {
        return Ok(());
    };
    let _ = session.child.kill();
    let _ = session.child.wait();
    Ok(())
}

/// One-shot, no terminal attached: killing a tmux window, and nothing more interactive.
#[tauri::command]
pub async fn terminal_run(program: String, args: Vec<String>) -> Result<String, String> {
    let out = std::process::Command::new(shell(&program))
        .args(&args)
        .output()
        .map_err(|e| e.to_string())?;
    if out.status.success() {
        Ok(String::from_utf8_lossy(&out.stdout).into_owned())
    } else {
        Err(String::from_utf8_lossy(&out.stderr).into_owned())
    }
}
