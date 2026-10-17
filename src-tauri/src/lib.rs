use phosphor_store::{Backup, BackupInfo, Note, SearchHit, SearchOptions, Store, Workspace};
use std::sync::{Arc, Mutex};
use tauri::Manager;

#[derive(Clone)]
struct Database(Arc<Mutex<Store>>);
async fn database_task<T: Send + 'static>(
    database: &Database,
    work: impl FnOnce(&mut Store) -> Result<T, String> + Send + 'static,
) -> Result<T, String> {
    let database = database.clone();
    tauri::async_runtime::spawn_blocking(move || {
        work(&mut *database.0.lock().map_err(|e| e.to_string())?)
    })
    .await
    .map_err(|e| e.to_string())?
}
#[tauri::command]
async fn list_notes(database: tauri::State<'_, Database>) -> Result<Vec<Note>, String> {
    database_task(&database, |store| store.list()).await
}
#[tauri::command]
async fn load_workspace(database: tauri::State<'_, Database>) -> Result<Workspace, String> {
    database_task(&database, |store| store.workspace()).await
}
#[tauri::command]
async fn save_note(database: tauri::State<'_, Database>, note: Note) -> Result<(), String> {
    database_task(&database, move |store| store.save(&note)).await
}
#[tauri::command]
async fn search_notes(
    database: tauri::State<'_, Database>,
    options: SearchOptions,
) -> Result<Vec<SearchHit>, String> {
    database_task(&database, move |store| store.search(&options)).await
}
#[tauri::command]
async fn create_notebook(
    database: tauri::State<'_, Database>,
    name: String,
) -> Result<Workspace, String> {
    database_task(&database, move |store| {
        store.create_notebook(&name)?;
        store.workspace()
    })
    .await
}
#[tauri::command]
async fn change_notebook(
    database: tauri::State<'_, Database>,
    old: String,
    replacement: Option<String>,
) -> Result<Workspace, String> {
    database_task(&database, move |store| {
        store.change_notebook(&old, replacement.as_deref())?;
        store.workspace()
    })
    .await
}
#[tauri::command]
async fn change_tag(
    database: tauri::State<'_, Database>,
    old: String,
    replacement: Option<String>,
) -> Result<Workspace, String> {
    database_task(&database, move |store| {
        store.change_tag(&old, replacement.as_deref())?;
        store.workspace()
    })
    .await
}
#[tauri::command]
async fn list_backups(database: tauri::State<'_, Database>) -> Result<Vec<BackupInfo>, String> {
    database_task(&database, |store| store.list_backups()).await
}
#[tauri::command]
async fn create_backup(database: tauri::State<'_, Database>) -> Result<BackupInfo, String> {
    database_task(&database, |store| store.snapshot("manual")).await
}
#[tauri::command]
async fn auto_backup(database: tauri::State<'_, Database>) -> Result<(), String> {
    database_task(&database, |store| store.auto_backup()).await
}
#[tauri::command]
async fn restore_backup(
    database: tauri::State<'_, Database>,
    id: String,
) -> Result<Workspace, String> {
    database_task(&database, move |store| store.restore_backup(&id)).await
}
#[tauri::command]
async fn restore_backup_file(
    database: tauri::State<'_, Database>,
    backup: Backup,
) -> Result<Workspace, String> {
    database_task(&database, move |store| store.restore_data(backup)).await
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
            app.manage(Database(Arc::new(Mutex::new(store))));
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            list_notes,
            load_workspace,
            save_note,
            search_notes,
            create_notebook,
            change_notebook,
            change_tag,
            list_backups,
            create_backup,
            auto_backup,
            restore_backup,
            restore_backup_file
        ])
        .run(tauri::generate_context!())
        .expect("Could not start Phosphor");
}
