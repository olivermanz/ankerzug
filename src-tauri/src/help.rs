use std::process::Command;

const HELP_URL: &str = "https://www.ankerzug.net/help";

// The destination is fixed: IPC callers cannot supply arbitrary URLs or commands.
#[tauri::command]
pub async fn open_help() -> std::result::Result<(), String> {
    tauri::async_runtime::spawn_blocking(|| {
        #[cfg(target_os = "windows")]
        let mut command = {
            use std::os::windows::process::CommandExt;
            let mut command = Command::new("cmd.exe");
            command.args(["/D", "/C", "start", "", HELP_URL]);
            command.creation_flags(0x08000000); // CREATE_NO_WINDOW
            command
        };
        #[cfg(target_os = "macos")]
        let mut command = {
            let mut command = Command::new("open");
            command.arg(HELP_URL);
            command
        };
        #[cfg(target_os = "linux")]
        let mut command = {
            let mut command = Command::new("xdg-open");
            command.arg(HELP_URL);
            command
        };
        let status = command.status().map_err(|error| {
            format!("Hilfe konnte nicht im Systembrowser geöffnet werden: {error}")
        })?;
        if !status.success() {
            return Err("Hilfe konnte nicht im Systembrowser geöffnet werden.".into());
        }
        Ok(())
    })
    .await
    .map_err(|error| format!("Hilfe konnte nicht geöffnet werden: {error}"))?
}
