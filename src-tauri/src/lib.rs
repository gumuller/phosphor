use phosphor_store::{Note, Store};
use std::sync::Mutex;
use tauri::Manager;

struct Database(Mutex<Store>);
#[tauri::command]
fn list_notes(database: tauri::State<Database>) -> Result<Vec<Note>, String> {
    database.0.lock().map_err(|e| e.to_string())?.list()
}
#[tauri::command]
fn save_note(database: tauri::State<Database>, note: Note) -> Result<(), String> {
    database.0.lock().map_err(|e| e.to_string())?.save(&note)
}
#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .setup(|app| {
            let directory = app.path().app_data_dir()?;
            std::fs::create_dir_all(&directory)?;
            let store =
                Store::open(directory.join("phosphor.sqlite3")).map_err(std::io::Error::other)?;
            app.manage(Database(Mutex::new(store)));
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![list_notes, save_note])
        .run(tauri::generate_context!())
        .expect("Could not start Phosphor");
}
