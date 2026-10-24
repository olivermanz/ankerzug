use crate::models::{Game, Workspace};
use crate::storage::{AppError, ErrorCode, Result, validate};
use serde::{Deserialize, Serialize};
use std::io::Read;
use tauri_plugin_dialog::DialogExt;

pub const PACKAGE_LIMIT: usize = 100 * 1024 * 1024;
const ATTACHMENT_LIMIT: usize = 5 * 1024 * 1024;
fn invalid(message: &str) -> AppError {
    AppError {
        code: ErrorCode::InvalidInput,
        message: message.into(),
    }
}
pub fn validate_attachment_name(filename: &str) -> Result<()> {
    if filename.is_empty()
        || filename.chars().count() > 200
        || !filename.to_lowercase().ends_with(".pdf")
        || filename
            .chars()
            .any(|c| c.is_control() || "<>:\"/\\|?*".contains(c))
    {
        return Err(invalid("Ungültiger PDF-Dateiname (maximal 200 Zeichen)."));
    }
    Ok(())
}
pub fn validate_attachment(filename: &str, bytes: &[u8]) -> Result<()> {
    validate_attachment_name(filename)?;
    if bytes.is_empty() || bytes.len() > ATTACHMENT_LIMIT {
        return Err(invalid("PDF-Anhänge dürfen höchstens 5 MiB groß sein."));
    }
    let trimmed = bytes.trim_ascii_end();
    if !bytes.starts_with(b"%PDF-") || !trimmed.ends_with(b"%%EOF") {
        return Err(invalid("Anhang enthält keine gültigen PDF-Daten."));
    }
    Ok(())
}
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct GamePackage {
    pub kind: String,
    pub format_version: u32,
    pub data_version: u32,
    pub games: Vec<Game>,
}
pub fn parse_package(contents: &str) -> Result<GamePackage> {
    if contents.len() > PACKAGE_LIMIT {
        return Err(invalid("Spielpaket überschreitet 100 MiB."));
    }
    let package: GamePackage = serde_json::from_str(contents)
        .map_err(|e| invalid(&format!("Ungültiges Spielpaket: {e}")))?;
    if package.kind != "ankerzug-games"
        || package.format_version != 1
        || package.data_version != 2
        || package.games.is_empty()
    {
        return Err(invalid("Nicht unterstütztes oder leeres Spielpaket."));
    }
    validate(&Workspace {
        games: package.games.clone(),
        ..Workspace::default()
    })?;
    Ok(package)
}
#[tauri::command]
pub async fn read_game_package(app: tauri::AppHandle) -> Result<Option<GamePackage>> {
    tauri::async_runtime::spawn_blocking(move || {
        crate::plan_exchange::pick_package_contents(&app, "Spielpaket importieren", PACKAGE_LIMIT)?
            .map(|s| parse_package(&s))
            .transpose()
    })
    .await
    .map_err(|e| invalid(&format!("Import fehlgeschlagen: {e}")))?
}
#[derive(Serialize)]
pub struct SelectedPdf {
    filename: String,
    bytes: Vec<u8>,
}
#[tauri::command]
pub async fn pick_game_pdfs(app: tauri::AppHandle) -> Result<Option<Vec<SelectedPdf>>> {
    tauri::async_runtime::spawn_blocking(move || {
        let Some(files) = app
            .dialog()
            .file()
            .set_title("PDF-Anhänge hinzufügen")
            .add_filter("PDF", &["pdf"])
            .blocking_pick_files()
        else {
            return Ok(None);
        };
        let mut selected = Vec::new();
        for file in files {
            let path = file.into_path().map_err(|e| invalid(&e.to_string()))?;
            let filename = path
                .file_name()
                .and_then(|n| n.to_str())
                .ok_or_else(|| invalid("Dateiname ist nicht lesbar."))?
                .to_owned();
            let mut bytes = Vec::new();
            std::fs::File::open(path)?
                .take((ATTACHMENT_LIMIT + 1) as u64)
                .read_to_end(&mut bytes)?;
            validate_attachment(&filename, &bytes)?;
            selected.push(SelectedPdf { filename, bytes });
        }
        Ok(Some(selected))
    })
    .await
    .map_err(|e| invalid(&format!("Dateiauswahl fehlgeschlagen: {e}")))?
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::models::SaveInput;
    use crate::storage::Store;
    const FIXTURE: &str = include_str!("../../fixtures/games-package-v1.json");
    #[test]
    fn skill_reference_example_is_a_valid_game_package() {
        let reference =
            include_str!("../../skills/ankerzug-game-import/references/GAME_IMPORT_FORMAT.md")
                .replace("\r\n", "\n");
        let example = reference
            .split_once("```json\n")
            .unwrap()
            .1
            .split_once("```")
            .unwrap()
            .0;
        let parsed = parse_package(example).unwrap();
        assert_eq!(
            serde_json::to_value(parsed).unwrap(),
            serde_json::from_str::<serde_json::Value>(example).unwrap()
        );
    }
    #[test]
    fn shared_game_contract_is_exact_and_rejects_invalid_inputs() {
        let value: serde_json::Value = serde_json::from_str(FIXTURE).unwrap();
        assert_eq!(
            serde_json::to_value(parse_package(FIXTURE).unwrap()).unwrap(),
            value
        );
        for field in ["effort", "fun", "duration", "competitionProximity"] {
            for rating in [
                serde_json::json!(0),
                serde_json::json!(6),
                serde_json::json!(2.5),
                serde_json::Value::Null,
            ] {
                let mut bad = value.clone();
                bad["games"][0][field] = rating;
                assert!(parse_package(&bad.to_string()).is_err());
            }
        }
        for (field, item) in [
            ("name", serde_json::json!(" ")),
            ("description", serde_json::json!("")),
            ("kind", serde_json::json!("future")),
        ] {
            let mut bad = value.clone();
            bad["games"][0][field] = item;
            assert!(parse_package(&bad.to_string()).is_err());
        }
        for field in ["kind", "formatVersion", "dataVersion", "unknown"] {
            let mut bad = value.clone();
            bad[field] = serde_json::json!(99);
            assert!(parse_package(&bad.to_string()).is_err());
        }
        let mut bad = value.clone();
        bad["games"][0]["attachments"][0]["bytes"] = serde_json::json!([37, 80, 68, 70, 45, 255]);
        assert!(parse_package(&bad.to_string()).is_err());
        assert!(validate_attachment("../x.pdf", b"%PDF-1.7\n%%EOF").is_err());
        assert!(validate_attachment("x.pdf", &vec![0; ATTACHMENT_LIMIT + 1]).is_err());
    }
    #[test]
    fn game_forms_round_trip_and_require_at_least_one_boolean() {
        let original: serde_json::Value = serde_json::from_str(FIXTURE).unwrap();
        for (single, team) in [(true, false), (false, true), (true, true), (false, false)] {
            let mut value = original.clone();
            value["games"][0]["single"] = single.into();
            value["games"][0]["team"] = team.into();
            let parsed = parse_package(&value.to_string());
            if single || team {
                assert_eq!(serde_json::to_value(parsed.unwrap()).unwrap(), value);
            } else {
                assert!(parsed.is_err());
            }
        }
        for field in ["single", "team"] {
            for invalid in [
                serde_json::Value::Null,
                serde_json::json!("true"),
                serde_json::json!(1),
            ] {
                let mut value = original.clone();
                value["games"][0][field] = invalid;
                assert!(parse_package(&value.to_string()).is_err());
            }
            let mut value = original.clone();
            value["games"][0].as_object_mut().unwrap().remove(field);
            assert!(parse_package(&value.to_string()).is_err());
        }
    }
    #[test]
    fn games_and_pdf_bytes_survive_disk_restart_backup_recovery_and_failed_write() {
        let path =
            std::env::temp_dir().join(format!("ankerzug-games-{}.sqlite", std::process::id()));
        let _ = std::fs::remove_file(&path);
        let workspace = Workspace {
            games: parse_package(FIXTURE).unwrap().games,
            ..Workspace::default()
        };
        let mut store = Store::open(&path).unwrap();
        store
            .save(SaveInput {
                expected_revision: 0,
                workspace: workspace.clone(),
                attachments: vec![],
            })
            .unwrap();
        let backup = store.backup().unwrap();
        let mut bad = workspace.clone();
        bad.games[0].attachments[0].id = bad.games[0].id.clone();
        assert!(
            store
                .save(SaveInput {
                    expected_revision: 1,
                    workspace: bad,
                    attachments: vec![]
                })
                .is_err()
        );
        assert_eq!(store.backup().unwrap(), backup);
        drop(store);
        let mut store = Store::open(&path).unwrap();
        assert_eq!(store.backup().unwrap(), backup);
        store
            .save(SaveInput {
                expected_revision: 1,
                workspace: Workspace::default(),
                attachments: vec![],
            })
            .unwrap();
        store.restore(&backup, 2).unwrap();
        assert_eq!(store.backup().unwrap(), backup);
        store.recover(3).unwrap();
        assert!(store.load().unwrap().workspace.games.is_empty());
        store.recover(4).unwrap();
        assert_eq!(store.backup().unwrap(), backup);
        drop(store);
        std::fs::remove_file(path).unwrap();
    }
    #[test]
    fn game_references_are_structural_and_legacy_missing_fields_default_safely() {
        let mut value: serde_json::Value =
            serde_json::from_str(include_str!("../../fixtures/workspace-v2.json")).unwrap();
        let old: Workspace = serde_json::from_value(value["workspace"].clone()).unwrap();
        assert!(old.games.is_empty());
        assert!(old.cycles[0].sessions[0].contents[0].game_id.is_none());
        value["workspace"]["games"] =
            serde_json::from_str::<serde_json::Value>(FIXTURE).unwrap()["games"].clone();
        value["workspace"]["cycles"][0]["sessions"][0]["contents"][0]["category"] =
            serde_json::json!("Spiel");
        value["workspace"]["cycles"][0]["sessions"][0]["contents"][0]["content"] =
            serde_json::json!("");
        value["workspace"]["cycles"][0]["sessions"][0]["contents"][0]["gameId"] =
            serde_json::json!("game-ringjagd");
        let valid: Workspace = serde_json::from_value(value["workspace"].clone()).unwrap();
        validate(&valid).unwrap();
        let mut invalid = valid.clone();
        invalid.cycles[0].sessions[0].contents[0].game_id = Some("missing".into());
        assert!(validate(&invalid).is_err());
        invalid = valid.clone();
        invalid.cycles[0].sessions[0].contents[0].category = "Technik".into();
        assert!(validate(&invalid).is_err());
        invalid = valid.clone();
        invalid.games[0].id = invalid.cycles[0].id.clone();
        assert!(validate(&invalid).is_err());
    }
}
