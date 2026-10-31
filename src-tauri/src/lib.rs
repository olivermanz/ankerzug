#[cfg(feature = "exploration")]
mod exploration;
mod games;
mod help;
mod legacy;
mod models;
mod pdf_export;
mod plan_exchange;
mod storage;
use models::{SaveInput, Snapshot};
use std::{path::Path, sync::Mutex};
use storage::{AppError, ErrorCode, Result, Store};
use tauri::{Manager, State};
use tauri_plugin_dialog::DialogExt;
struct Backend {
    store: Mutex<Store>,
}
fn lock(state: &Backend) -> Result<std::sync::MutexGuard<'_, Store>> {
    state.store.lock().map_err(|_| AppError {
        code: ErrorCode::Storage,
        message: "Der lokale Speicher ist vorübergehend nicht verfügbar.".into(),
    })
}
#[tauri::command]
fn load_workspace(state: State<Backend>) -> Result<Snapshot> {
    lock(&state)?.load()
}
#[tauri::command]
fn load_welcome_modal_version(state: State<Backend>) -> Result<Option<u32>> {
    lock(&state)?.load_welcome_modal_version()
}
#[tauri::command]
fn acknowledge_welcome_modal(version: u32, state: State<Backend>) -> Result<u32> {
    lock(&state)?.acknowledge_welcome_modal(version)
}
#[tauri::command]
fn save_workspace(input: SaveInput, state: State<Backend>) -> Result<Snapshot> {
    lock(&state)?.save(input)
}
#[tauri::command]
fn read_game_attachments(
    ids: Vec<String>,
    state: State<Backend>,
) -> Result<Vec<models::AttachmentBytes>> {
    lock(&state)?.attachment_bytes(&ids)
}
#[tauri::command]
async fn create_backup(app: tauri::AppHandle, state: State<'_, Backend>) -> Result<Option<String>> {
    let contents = lock(&state)?.backup()?;
    let filename = backup_filename()?;
    tauri::async_runtime::spawn_blocking(move || {
        let selected = app
            .dialog()
            .file()
            .set_title("Backup speichern unter")
            .add_filter("Ankerzug-Backup", &["json"])
            .set_file_name(&filename)
            .blocking_save_file();
        let path = selected
            .map(|selected| {
                selected.into_path().map_err(|error| AppError {
                    code: ErrorCode::Storage,
                    message: format!("Backup-Zieldatei ist nicht erreichbar: {error}"),
                })
            })
            .transpose()?;
        save_backup(path.as_deref(), &contents)
    })
    .await
    .map_err(|error| AppError {
        code: ErrorCode::Storage,
        message: format!("Backup-Erstellung fehlgeschlagen: {error}"),
    })?
}

fn backup_filename() -> Result<String> {
    let stamp = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map_err(|e| AppError {
            code: ErrorCode::Storage,
            message: e.to_string(),
        })?
        .as_nanos();
    Ok(format!("ankerzug-{stamp}.json"))
}

fn save_backup(path: Option<&Path>, contents: &str) -> Result<Option<String>> {
    let Some(path) = path else {
        return Ok(None);
    };
    if !path
        .extension()
        .is_some_and(|extension| extension.eq_ignore_ascii_case("json"))
    {
        return Err(AppError {
            code: ErrorCode::InvalidInput,
            message: "Bitte eine Zieldatei mit der Endung .json wählen.".into(),
        });
    }
    if contents.len() > 200 * 1024 * 1024 {
        return Err(AppError {
            code: ErrorCode::InvalidInput,
            message: "Backup ist größer als 200 MiB.".into(),
        });
    }
    pdf_export::write_export(path, contents.as_bytes())?;
    Ok(Some(path.to_string_lossy().into_owned()))
}
#[tauri::command]
fn restore_backup(
    contents: String,
    expected_revision: u64,
    state: State<Backend>,
) -> Result<Snapshot> {
    lock(&state)?.restore(&contents, expected_revision)
}
#[tauri::command]
fn recover_previous(expected_revision: u64, state: State<Backend>) -> Result<Snapshot> {
    lock(&state)?.recover(expected_revision)
}
#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let builder = tauri::Builder::default();
    #[cfg(feature = "exploration")]
    let builder = builder
        .plugin(
            tauri::plugin::Builder::<_, ()>::new("exploration-diagnostics")
                .js_init_script(include_str!("exploration-init.js").to_string())
                .build(),
        )
        .plugin(tauri_plugin_wdio_webdriver::init_with_port(
            exploration::port().expect("Exploration requires a valid ANKERZUG_EXPLORATION_PORT"),
        ));
    builder
        .plugin(tauri_plugin_dialog::init())
        .manage(pdf_export::PdfViewers::default())
        .setup(|app| {
            #[cfg(feature = "exploration")]
            let directory = exploration::directory()?;
            #[cfg(not(feature = "exploration"))]
            let directory = app.path().app_data_dir()?;
            std::fs::create_dir_all(&directory)?;
            let store = Store::open(&directory.join("ankerzug.sqlite3"))
                .map_err(|e| std::io::Error::other(e.message))?;
            app.manage(Backend {
                store: Mutex::new(store),
            });
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            help::open_help,
            games::read_game_package,
            games::pick_game_pdfs,
            load_workspace,
            load_welcome_modal_version,
            acknowledge_welcome_modal,
            save_workspace,
            read_game_attachments,
            create_backup,
            restore_backup,
            recover_previous,
            pdf_export::export_session_pdf,
            pdf_export::read_pdf_viewer,
            pdf_export::print_pdf_viewer,
            pdf_export::save_pdf_viewer,
            plan_exchange::validate_macrocycle_package,
            plan_exchange::read_macrocycle_package,
            plan_exchange::read_template_package,
            plan_exchange::export_plan_file
        ])
        .run(tauri::generate_context!())
        .expect("Ankerzug konnte nicht gestartet werden");
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn optional_backup_save_preserves_cancellation_rejects_other_extensions_and_writes_exact_json()
    {
        assert!(
            save_backup(None, "{\"formatVersion\":2}")
                .unwrap()
                .is_none()
        );
        let folder = std::env::temp_dir().join(format!(
            "ankerzug-backup-save-{}-{}",
            std::process::id(),
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        std::fs::create_dir_all(&folder).unwrap();
        let invalid = folder.join("backup.txt");
        assert!(save_backup(Some(&invalid), "{\"formatVersion\":2}").is_err());
        assert!(!invalid.exists());
        let destination = folder.join("ankerzug-backup.json");
        let contents = "{\n  \"formatVersion\": 2\n}";
        assert_eq!(
            save_backup(Some(&destination), contents).unwrap(),
            Some(destination.to_string_lossy().into_owned())
        );
        assert_eq!(std::fs::read_to_string(&destination).unwrap(), contents);
        std::fs::remove_dir_all(folder).unwrap();
    }
}
