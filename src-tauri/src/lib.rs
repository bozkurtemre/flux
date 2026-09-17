mod cache;
mod secrets;
mod terminal;

use tauri::menu::{Menu, MenuItem, MenuItemKind};
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
        .manage(terminal::Terminals::default())
        .invoke_handler(tauri::generate_handler![
            cache::cache_read,
            cache::cache_write,
            cache::cache_clear,
            cache::cache_location,
            secrets::secret_set,
            secrets::secret_get,
            secrets::secret_delete,
            terminal::terminal_open,
            terminal::terminal_write,
            terminal::terminal_resize,
            terminal::terminal_close,
            terminal::terminal_run,
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
                app_menu.insert_items(&[&about, &updates], 0)?;
            }
            app.set_menu(menu)?;
            Ok(())
        })
        .on_menu_event(|app, event| {
            // both items are answered in the webview, which is where the windows are drawn
            let name = match event.id().0.as_str() {
                "about" => "about",
                "check-updates" => "check-updates",
                _ => return,
            };
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.emit(name, ());
            }
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
