// The splash: a small window of its own, up from the first moment, while the main window
// loads behind it and asks whether there is an update to take first. The main window starts
// hidden and is shown by the front end once it knows what to draw, which is also when the
// splash goes.
use tauri::{AppHandle, Manager, WebviewUrl, WebviewWindowBuilder};

pub const LABEL: &str = "splash";

const SIZE: (f64, f64) = (560.0, 340.0);

pub fn create(app: &AppHandle) -> tauri::Result<()> {
    let mut splash =
        WebviewWindowBuilder::new(app, LABEL, WebviewUrl::App("index.html#splash".into()))
            .title("Flux")
            .inner_size(SIZE.0, SIZE.1)
            .decorations(false)
            .transparent(true)
            .shadow(true)
            .resizable(false)
            .skip_taskbar(true);
    // in the middle of the screen the main window will open on — its place was put back from
    // last time by now — rather than of the primary one
    match app
        .get_webview_window("main")
        .and_then(|main| main.current_monitor().ok().flatten())
    {
        Some(monitor) => {
            let scale = monitor.scale_factor();
            let area = monitor.work_area();
            let x =
                area.position.x as f64 / scale + (area.size.width as f64 / scale - SIZE.0) / 2.0;
            let y =
                area.position.y as f64 / scale + (area.size.height as f64 / scale - SIZE.1) / 2.0;
            splash = splash.position(x, y);
        }
        None => splash = splash.center(),
    }
    splash.build()?;
    // the front end says when it is ready; should it never — a script that failed before it
    // could — the main window is shown anyway, rather than the splash staying for good
    let handle = app.clone();
    std::thread::spawn(move || {
        std::thread::sleep(std::time::Duration::from_secs(15));
        let _ = take_over(&handle);
    });
    Ok(())
}

/// The main window takes over: shown, focused, and the splash closed behind it.
#[tauri::command]
pub fn splash_done(app: AppHandle) -> Result<(), String> {
    take_over(&app)
}

fn take_over(app: &AppHandle) -> Result<(), String> {
    if let Some(main) = app.get_webview_window("main") {
        if !main.is_visible().unwrap_or(true) {
            main.show().map_err(|e| e.to_string())?;
            main.set_focus().map_err(|e| e.to_string())?;
        }
    }
    if let Some(splash) = app.get_webview_window(LABEL) {
        splash.close().map_err(|e| e.to_string())?;
    }
    Ok(())
}
