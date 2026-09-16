mod cache;
mod secrets;
mod terminal;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_http::init())
        .plugin(tauri_plugin_store::Builder::new().build())
        .plugin(tauri_plugin_dialog::init())
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
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
