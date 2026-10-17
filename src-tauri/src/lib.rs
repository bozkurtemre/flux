mod background;
mod cache;
mod island;
mod local;
mod mcp;
mod secrets;
mod splash;
mod terminal;
mod usage;
mod workspace;

use tauri::menu::{Menu, MenuItem, MenuItemKind, PredefinedMenuItem, Submenu};
use tauri::{Emitter, Manager};

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_http::init())
        .plugin(tauri_plugin_store::Builder::new().build())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .plugin(
            // the main window's size and place come back, but not its visibility: it starts
            // hidden behind the splash and is shown once it knows what to draw
            tauri_plugin_window_state::Builder::default()
                .with_denylist(&[island::LABEL, splash::LABEL])
                .with_state_flags(
                    tauri_plugin_window_state::StateFlags::all()
                        - tauri_plugin_window_state::StateFlags::VISIBLE,
                )
                .build(),
        )
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_deep_link::init())
        .manage(terminal::Terminals::default())
        .manage(mcp::Mcp::default())
        .invoke_handler(tauri::generate_handler![
            cache::cache_read,
            cache::cache_write,
            cache::cache_clear,
            cache::cache_location,
            secrets::secret_get,
            secrets::secret_set,
            secrets::secret_delete,
            terminal::terminal_open,
            terminal::terminal_write,
            terminal::terminal_resize,
            terminal::terminal_close,
            terminal::terminal_run,
            workspace::workspace_read,
            workspace::workspace_write,
            workspace::workspace_exists,
            workspace::save_file,
            mcp::mcp_start,
            mcp::mcp_stop,
            mcp::mcp_status,
            mcp::mcp_set_tools,
            mcp::mcp_respond,
            island::island_present,
            splash::splash_done,
            island::island_open,
            local::local_list,
            local::local_read,
            usage::usage_read,
            background::background_enter,
            background::background_leave,
        ])
        .setup(|app| {
            // The system's About panel draws the bundle's icon, which a development build does
            // not have, and it cannot hold a link. Ours opens a window we draw ourselves.
            let menu = Menu::default(app.handle())?;
            if let Some(MenuItemKind::Submenu(app_menu)) = menu.items()?.into_iter().next() {
                app_menu.remove_at(0)?;
                let about =
                    MenuItem::with_id(app.handle(), "about", "About Flux", true, None::<&str>)?;
                let updates = MenuItem::with_id(
                    app.handle(),
                    "check-updates",
                    "Check for Updates…",
                    true,
                    None::<&str>,
                )?;
                let settings = MenuItem::with_id(
                    app.handle(),
                    "settings",
                    "Settings…",
                    true,
                    Some("CmdOrCtrl+,"),
                )?;
                let divider = PredefinedMenuItem::separator(app.handle())?;
                app_menu.insert_items(&[&about, &updates, &divider, &settings], 0)?;
            }
            // The Help menu the IDE has, with the parts that mean something here. macOS puts
            // its own search field at the top of whichever menu is marked as Help, which is
            // how actions and settings can be found by typing.
            let help = menu.items()?.into_iter().find_map(|item| match item {
                MenuItemKind::Submenu(s) if s.text().ok().as_deref() == Some("Help") => Some(s),
                _ => None,
            });
            let help = match help {
                Some(h) => h,
                None => {
                    let h = Submenu::new(app.handle(), "Help", true)?;
                    menu.append(&h)?;
                    h
                }
            };
            let item = |id: &str, label: &str, key: Option<&str>| {
                MenuItem::with_id(app.handle(), id, label, true, key)
            };
            let line = || PredefinedMenuItem::separator(app.handle());
            help.append_items(&[
                &item(
                    "help:find-action",
                    "Find Action…",
                    Some("CmdOrCtrl+Shift+A"),
                )?,
                &line()?,
                &item("help:start", "Getting Started", None)?,
                &item("help:query", "Query Language", None)?,
                &item("help:shortcuts", "Keyboard Shortcuts", None)?,
                &item("help:whats-new", "What's New in Flux", None)?,
                &item("help:tour", "Show the Tour Again", None)?,
                &line()?,
                &item("help:report", "Report a Problem…", None)?,
                &item("help:diagnostics", "Copy Diagnostic Info", None)?,
                &line()?,
                &item(
                    "help:settings-folder",
                    "Show Settings Folder in Finder",
                    None,
                )?,
                &item("help:cache-folder", "Show Cache Folder in Finder", None)?,
            ])?;
            #[cfg(target_os = "macos")]
            help.set_as_help_menu_for_nsapp()?;

            app.set_menu(menu)?;
            // first, so it is on screen before the main window has loaded anything
            splash::create(app.handle())?;
            island::create(app.handle())?;
            Ok(())
        })
        .on_menu_event(|app, event| {
            // both items are answered in the webview, which is where the windows are drawn
            let id = event.id().0.as_str();
            let Some(window) = app.get_webview_window("main") else {
                return;
            };
            // the Help items go out as one event, named by what was chosen
            if let Some(what) = id.strip_prefix("help:") {
                let _ = window.emit("help", what);
                return;
            }
            let name = match id {
                "about" => "about",
                "check-updates" => "check-updates",
                "settings" => "settings",
                _ => return,
            };
            let _ = window.emit(name, ());
        })
        // Closing the main window is quitting: the island's window is always there, hidden or
        // not, and would otherwise keep the app running with nothing to show for it. The front
        // end has already had its say — the terminals' question — by the time it is destroyed.
        .on_window_event(|window, event| {
            if window.label() == "main" && matches!(event, tauri::WindowEvent::Destroyed) {
                window.app_handle().exit(0);
            }
        })
        .build(tauri::generate_context!())
        .expect("error while running tauri application")
        .run(|_app, _event| {
            // opening Flux again while it watches from the menu bar brings its window back
            #[cfg(target_os = "macos")]
            if let tauri::RunEvent::Reopen { .. } = _event {
                background::leave(_app);
            }
        });
}
