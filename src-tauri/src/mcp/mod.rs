mod bridge;
mod http;
mod settings;

use bridge::{Bridge, Request, Response};
use serde::Serialize;
use settings::{Settings, new_token};
use std::{
    net::{Ipv4Addr, SocketAddr},
    path::PathBuf,
    sync::{Arc, RwLock},
};
use tauri::{State, Webview, ipc::Channel};
use tauri_plugin_clipboard_manager::ClipboardExt;
use tokio::{
    net::TcpListener,
    sync::{Mutex, oneshot},
    task::JoinHandle,
};

const PORT: u16 = 39227;

pub(crate) struct Mcp {
    path: PathBuf,
    shared: Arc<Shared>,
    listener: Mutex<Listener>,
}

#[derive(Default)]
struct Shared {
    settings: RwLock<Settings>,
    bridge: Bridge,
}

#[derive(Default)]
struct Listener {
    running: Option<Running>,
    error: Option<String>,
}

struct Running {
    shutdown: oneshot::Sender<()>,
    task: JoinHandle<()>,
}

#[derive(Serialize)]
pub(crate) struct Status {
    settings: Settings,
    endpoint: Option<String>,
    error: Option<String>,
}

impl Mcp {
    pub(crate) fn load(path: PathBuf) -> Self {
        let (settings, error) = match Settings::load(&path) {
            Ok(settings) => (settings, None),
            Err(_) => (
                Settings::default(),
                Some("Die lokalen MCP-Einstellungen konnten nicht geladen werden.".into()),
            ),
        };
        Self {
            path,
            shared: Arc::new(Shared {
                settings: RwLock::new(settings),
                ..Shared::default()
            }),
            listener: Mutex::new(Listener {
                running: None,
                error,
            }),
        }
    }

    async fn start(&self, listener: &mut Listener) {
        if listener.running.is_some() || !self.shared.settings.read().unwrap().enabled {
            return;
        }
        match TcpListener::bind(SocketAddr::from((Ipv4Addr::LOCALHOST, PORT))).await {
            Ok(socket) => {
                let (shutdown, stop) = oneshot::channel();
                listener.running = Some(Running {
                    shutdown,
                    task: tokio::spawn(http::serve(socket, self.shared.clone(), stop)),
                });
                listener.error = None;
            }
            Err(error) => {
                listener.error = Some(format!("MCP konnte Port {PORT} nicht öffnen. {error}"));
            }
        }
    }

    pub(crate) fn detach_webview(&self) {
        self.shared.bridge.attach(None);
    }

    pub(crate) async fn stop(&self) {
        self.listener.lock().await.stop().await;
    }

    fn status(&self, listener: &Listener) -> Status {
        Status {
            settings: self.shared.settings.read().unwrap().clone(),
            endpoint: listener
                .running
                .as_ref()
                .map(|_| format!("http://localhost:{PORT}/mcp")),
            error: listener.error.clone(),
        }
    }

    fn persist(&self, settings: Settings) -> Result<(), String> {
        settings
            .validate()
            .map_err(|_| "Der MCP-Token ist ungültig.".to_owned())?;
        settings
            .save(&self.path)
            .map_err(|_| "Die MCP-Einstellungen konnten nicht gespeichert werden.".to_owned())?;
        *self.shared.settings.write().unwrap() = settings;
        Ok(())
    }
}

impl Listener {
    async fn stop(&mut self) {
        if let Some(running) = self.running.take() {
            let _ = running.shutdown.send(());
            let _ = running.task.await;
        }
    }
}

fn require_main(webview: &Webview) -> Result<(), String> {
    if webview.label() == "main" {
        Ok(())
    } else {
        Err("MCP-Einstellungen sind nur im Hauptfenster verfügbar.".into())
    }
}

#[tauri::command]
pub(crate) async fn mcp_attach(
    webview: Webview,
    state: State<'_, Mcp>,
    channel: Channel<Request>,
) -> Result<Status, String> {
    require_main(&webview)?;
    let mut listener = state.listener.lock().await;
    state.shared.bridge.attach(Some(channel));
    state.start(&mut listener).await;
    Ok(state.status(&listener))
}

#[tauri::command]
pub(crate) async fn mcp_save(
    webview: Webview,
    state: State<'_, Mcp>,
    mut settings: Settings,
) -> Result<Status, String> {
    require_main(&webview)?;
    let mut listener = state.listener.lock().await;
    if settings.token.is_empty() {
        let current = state.shared.settings.read().unwrap();
        if settings.enabled && !current.enabled && current.token.is_empty() {
            settings.token = new_token()?;
        } else if settings.authentication && (settings.enabled || !current.token.is_empty()) {
            return Err("Bitte einen MCP-Token eingeben oder den Token rotieren.".into());
        }
    }
    let enabled = settings.enabled;
    state.persist(settings)?;
    listener.error = None;
    if enabled {
        state.start(&mut listener).await;
    } else {
        listener.stop().await;
    }
    Ok(state.status(&listener))
}

#[tauri::command]
pub(crate) async fn mcp_rotate(webview: Webview, state: State<'_, Mcp>) -> Result<Status, String> {
    require_main(&webview)?;
    let listener = state.listener.lock().await;
    let mut settings = state.shared.settings.read().unwrap().clone();
    settings.token = new_token()?;
    state.persist(settings)?;
    Ok(state.status(&listener))
}

#[tauri::command]
pub(crate) async fn mcp_copy(webview: Webview, state: State<'_, Mcp>) -> Result<(), String> {
    require_main(&webview)?;
    let _listener = state.listener.lock().await;
    let token = state.shared.settings.read().unwrap().token.clone();
    if token.is_empty() {
        return Err("Es ist kein MCP-Token gespeichert.".into());
    }
    webview
        .clipboard()
        .write_secret(token)
        .map_err(|_| "Der MCP-Token konnte nicht kopiert werden.".into())
}

#[tauri::command]
pub(crate) fn mcp_reply(
    webview: Webview,
    state: State<'_, Mcp>,
    id: String,
    response: Response,
) -> Result<(), String> {
    require_main(&webview)?;
    state.shared.bridge.reply(&id, response);
    Ok(())
}
