mod backup;
#[cfg(feature = "exploration")]
mod exploration;
mod games;
mod help;
mod legacy;
mod mcp;
mod models;
mod pdf_export;
mod plan_exchange;
mod storage;
use models::{SaveInput, Snapshot};
use std::sync::Mutex;
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
async fn create_backup(app: tauri::AppHandle) -> Result<Option<String>> {
    backup_task(move || {
        let stamp = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map_err(backup_error)?
            .as_nanos();
        let Some(selected) = app
            .dialog()
            .file()
            .set_title("Backup speichern unter")
            .add_filter("Ankerzug-Backup", &["zip"])
            .set_file_name(format!("ankerzug-{stamp}.ankerzug.zip"))
            .blocking_save_file()
        else {
            return Ok(None);
        };
        let path = selected.into_path().map_err(backup_error)?;
        lock(&app.state::<Backend>())?.export_backup(&path)?;
        Ok(Some(path.to_string_lossy().into_owned()))
    })
    .await
}

#[derive(Default)]
struct RestoreSession {
    token: u64,
    prepared: Option<Box<backup::PreparedZip>>,
}
impl RestoreSession {
    fn require_token(&self, token: u64) -> Result<()> {
        if self.token != token || self.prepared.is_none() {
            return Err(storage::invalid(
                "Das ausgewählte Backup ist nicht mehr verfügbar.",
            ));
        }
        Ok(())
    }
}

fn backup_error(error: impl std::fmt::Display) -> AppError {
    AppError {
        code: ErrorCode::Storage,
        message: format!("Backup-Datei: {error}"),
    }
}

async fn backup_task<T: Send + 'static>(
    task: impl FnOnce() -> Result<T> + Send + 'static,
) -> Result<T> {
    tauri::async_runtime::spawn_blocking(task)
        .await
        .map_err(backup_error)?
}

#[tauri::command]
async fn select_backup(app: tauri::AppHandle) -> Result<Option<backup::BackupSelection>> {
    backup_task(move || {
        let Some(selected) = app
            .dialog()
            .file()
            .set_title("Backup wiederherstellen")
            .add_filter("Ankerzug-Backups", &["zip", "json"])
            .blocking_pick_file()
        else {
            return Ok(None);
        };
        let path = selected.into_path().map_err(backup_error)?;
        let selection = backup::open_backup(&path)?;
        let state = app.state::<Mutex<RestoreSession>>();
        let mut session = state.lock().map_err(backup_error)?;
        session.prepared = None;
        match selection {
            backup::SelectedBackup::Legacy(contents) => {
                Ok(Some(backup::BackupSelection::Legacy { contents }))
            }
            backup::SelectedBackup::Zip(prepared) => {
                session.token += 1;
                let preview = prepared.preview(session.token);
                session.prepared = Some(prepared);
                Ok(Some(preview))
            }
        }
    })
    .await
}

#[tauri::command]
async fn read_backup_pdf(app: tauri::AppHandle, token: u64, id: String) -> Result<Vec<u8>> {
    backup_task(move || {
        let state = app.state::<Mutex<RestoreSession>>();
        let mut session = state.lock().map_err(backup_error)?;
        session.require_token(token)?;
        session.prepared.as_mut().unwrap().stage_pdf(&id)
    })
    .await
}

#[tauri::command]
async fn apply_zip_backup(
    app: tauri::AppHandle,
    token: u64,
    expected_revision: u64,
) -> Result<Snapshot> {
    backup_task(move || {
        let state = app.state::<Mutex<RestoreSession>>();
        let prepared = {
            let mut session = state.lock().map_err(backup_error)?;
            session.require_token(token)?;
            session.prepared.take().unwrap()
        };
        let backend = app.state::<Backend>();
        prepared.restore(&mut *lock(&backend)?, expected_revision)
    })
    .await
}

#[tauri::command]
fn discard_zip_backup(token: u64, state: State<Mutex<RestoreSession>>) -> Result<()> {
    let mut session = state.lock().map_err(backup_error)?;
    if session.token == token {
        session.prepared = None;
    }
    Ok(())
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
        .plugin(tauri_plugin_clipboard_manager::init())
        .manage(pdf_export::PdfViewers::default())
        .manage(Mutex::new(RestoreSession::default()))
        .setup(|app| {
            #[cfg(feature = "exploration")]
            let directory = exploration::directory()?;
            #[cfg(not(feature = "exploration"))]
            let directory = app.path().app_data_dir()?;
            std::fs::create_dir_all(&directory)?;
            let store = Store::open(&directory.join("ankerzug.sqlite3"))
                .map_err(|e| std::io::Error::other(e.message))?;
            app.manage(mcp::Mcp::load(directory.join("mcp-settings.json")));
            app.manage(Backend {
                store: Mutex::new(store),
            });
            Ok(())
        })
        .on_window_event(|window, event| {
            if window.label() == "main" && matches!(event, tauri::WindowEvent::Destroyed) {
                window.state::<mcp::Mcp>().detach_webview();
            }
        })
        .invoke_handler(tauri::generate_handler![
            help::open_help,
            mcp::mcp_attach,
            mcp::mcp_save,
            mcp::mcp_rotate,
            mcp::mcp_copy,
            mcp::mcp_reply,
            games::read_game_package,
            games::pick_game_pdfs,
            load_workspace,
            load_welcome_modal_version,
            acknowledge_welcome_modal,
            save_workspace,
            read_game_attachments,
            create_backup,
            select_backup,
            read_backup_pdf,
            apply_zip_backup,
            discard_zip_backup,
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
        .build(tauri::generate_context!())
        .expect("Ankerzug konnte nicht gestartet werden")
        .run(|app, event| {
            if matches!(event, tauri::RunEvent::Exit) {
                tauri::async_runtime::block_on(app.state::<mcp::Mcp>().stop());
            }
        });
}
