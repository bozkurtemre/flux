mod cache;
mod mcp;
mod secrets;
mod terminal;
mod workspace;

use tauri::menu::{Menu, MenuItem, MenuItemKind, PredefinedMenuItem};
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
        .plugin(tauri_plugin_window_state::Builder::default().build())
        .manage(terminal::Terminals::default())
        .manage(mcp::Mcp::default())
        .invoke_handler(tauri::generate_handler![
            cache::cache_read,
            cache::cache_write,
            cache::cache_clear,
            cache::cache_location,
            secrets::secret_get,
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
            app.set_menu(menu)?;
            Ok(())
        })
        .on_menu_event(|app, event| {
            // both items are answered in the webview, which is where the windows are drawn
            let name = match event.id().0.as_str() {
                "about" => "about",
                "check-updates" => "check-updates",
                "settings" => "settings",
                _ => return,
            };
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.emit(name, ());
            }
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
