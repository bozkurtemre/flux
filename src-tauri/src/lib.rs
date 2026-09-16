mod mongo;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_http::init())
        .plugin(tauri_plugin_store::Builder::new().build())
        .manage(mongo::Pool::default())
        .invoke_handler(tauri::generate_handler![
            mongo::mongo_ping,
            mongo::mongo_aggregate,
            mongo::mongo_distinct,
            mongo::read_text_file,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
