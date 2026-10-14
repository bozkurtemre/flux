// The island's window: the system's, not the app's. It is made here so it exists before the
// main window starts sending it anything, and it is shown here because showing it the usual way
// would put it under the menu bar and take the focus from whatever was being typed into.
use tauri::{AppHandle, Emitter, Manager, WebviewUrl, WebviewWindowBuilder};

pub const LABEL: &str = "island";

pub fn create(app: &AppHandle) -> tauri::Result<()> {
    WebviewWindowBuilder::new(app, LABEL, WebviewUrl::App("index.html#island".into()))
        .title("Flux Island")
        .inner_size(300.0, 37.0)
        .transparent(true)
        .decorations(false)
        .shadow(false)
        .resizable(false)
        .always_on_top(true)
        .skip_taskbar(true)
        .visible_on_all_workspaces(true)
        .accept_first_mouse(true)
        .focused(false)
        .visible(false)
        .build()?;
    Ok(())
}

/// Shows the island over the menu bar, on every space, without making Flux the active app; or
/// takes it off the screen.
#[tauri::command]
pub fn island_present(app: AppHandle, visible: bool) -> Result<(), String> {
    let window = app.get_webview_window(LABEL).ok_or("no island window")?;
    #[cfg(target_os = "macos")]
    {
        let ns = window.ns_window().map_err(|e| e.to_string())? as usize;
        window
            .run_on_main_thread(move || {
                use objc2_app_kit::{NSWindow, NSWindowCollectionBehavior, NSWindowSharingType};
                // SAFETY: Tauri hands over the window's own NSWindow, and this runs on the main
                // thread, the only one AppKit takes calls on.
                let ns = unsafe { &*(ns as *const NSWindow) };
                if visible {
                    // NSStatusWindowLevel: above the menu bar, which is where the notch is
                    ns.setLevel(25);
                    ns.setCollectionBehavior(
                        NSWindowCollectionBehavior::CanJoinAllSpaces
                            | NSWindowCollectionBehavior::Stationary
                            | NSWindowCollectionBehavior::FullScreenAuxiliary,
                    );
                    // left out of screenshots and of what a screen share sends, as far as the
                    // capturing app honours it: the island names queries and what they found
                    ns.setSharingType(NSWindowSharingType::None);
                    ns.orderFrontRegardless();
                } else {
                    ns.orderOut(None);
                }
            })
            .map_err(|e| e.to_string())
    }
    #[cfg(not(target_os = "macos"))]
    if visible {
        window.show().map_err(|e| e.to_string())
    } else {
        window.hide().map_err(|e| e.to_string())
    }
}

/// A row on the island was clicked: Flux comes back, out of the Dock if it was minimized, and the
/// main window is told what to open. Done here, since a minimized webview may not run for a while.
#[tauri::command]
pub fn island_open(app: AppHandle, key: String) -> Result<(), String> {
    let main = app.get_webview_window("main").ok_or("no main window")?;
    main.unminimize().map_err(|e| e.to_string())?;
    main.show().map_err(|e| e.to_string())?;
    main.set_focus().map_err(|e| e.to_string())?;
    main.emit("island-open", key).map_err(|e| e.to_string())
}
