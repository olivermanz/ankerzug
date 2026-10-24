use crate::models::{Game, MacroCycle, Template, Workspace};
use crate::storage::{AppError, ErrorCode, Result, validate};
use serde::{Deserialize, Serialize};
use std::io::Read;
use tauri_plugin_dialog::DialogExt;

const LIMIT: usize = 20 * 1024 * 1024;
fn storage_error(message: String) -> AppError {
    AppError {
        code: ErrorCode::Storage,
        message,
    }
}
fn invalid(message: &str) -> AppError {
    AppError {
        code: ErrorCode::InvalidInput,
        message: message.into(),
    }
}
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct MacroCyclePackage {
    kind: String,
    format_version: u32,
    data_version: u32,
    cycle: MacroCycle,
    templates: Vec<Template>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    games: Vec<Game>,
}
pub fn parse_package(contents: &str) -> Result<MacroCyclePackage> {
    if contents.len() > crate::games::PACKAGE_LIMIT {
        return Err(invalid(
            "Makrozyklus-Paket überschreitet die erlaubte Größe.",
        ));
    }
    let mut value: serde_json::Value = serde_json::from_str(contents)
        .map_err(|e| invalid(&format!("Ungültiges Makrozyklus-Paket: {e}")))?;
    let templates = value
        .get("templates")
        .cloned()
        .unwrap_or_else(|| serde_json::json!([]));
    if let Some(cycle) = value.get_mut("cycle") {
        let mut workspace = serde_json::json!({"cycles": [cycle.take()], "templates": templates});
        crate::storage::normalize_workspace_value(&mut workspace);
        value["cycle"] = workspace["cycles"][0].take();
        value["templates"] = workspace["templates"].take();
    }
    let package: MacroCyclePackage = serde_json::from_value(value)
        .map_err(|e| invalid(&format!("Ungültiges Makrozyklus-Paket: {e}")))?;
    if package.kind != "ankerzug-macrocycle"
        || ![1, 2].contains(&package.format_version)
        || package.data_version != 2
    {
        return Err(invalid("Nicht unterstützte Makrozyklus-Paketversion."));
    }
    if package.format_version == 1 && !package.games.is_empty() {
        return Err(invalid("Spieldaten erfordern Paketformat 2."));
    }
    validate(&Workspace {
        games: package.games.clone(),
        cycles: vec![package.cycle.clone()],
        templates: package.templates.clone(),
        session_type_colors: crate::models::default_session_type_colors(),
        planning_template: None,
    })?;
    Ok(package)
}
#[tauri::command]
pub fn validate_macrocycle_package(contents: String) -> Result<MacroCyclePackage> {
    parse_package(&contents)
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct TemplatePackage {
    kind: String,
    format_version: u32,
    data_version: u32,
    templates: Vec<Template>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    games: Vec<Game>,
}
fn parse_template_package(contents: &str) -> Result<TemplatePackage> {
    if contents.len() > crate::games::PACKAGE_LIMIT {
        return Err(invalid("Vorlagen-Paket überschreitet die erlaubte Größe."));
    }
    let mut value: serde_json::Value = serde_json::from_str(contents)
        .map_err(|e| invalid(&format!("Ungültiges Vorlagen-Paket: {e}")))?;
    crate::storage::normalize_workspace_value(&mut value);
    let package: TemplatePackage = serde_json::from_value(value)
        .map_err(|e| invalid(&format!("Ungültiges Vorlagen-Paket: {e}")))?;
    if package.kind != "ankerzug-templates"
        || ![1, 2].contains(&package.format_version)
        || package.data_version != 2
    {
        return Err(invalid("Nicht unterstützte Vorlagen-Paketversion."));
    }
    if package.templates.is_empty() {
        return Err(invalid("Vorlagen-Paket enthält keine Vorlagen."));
    }
    if package.format_version == 1 && !package.games.is_empty() {
        return Err(invalid("Spieldaten erfordern Paketformat 2."));
    }
    validate(&Workspace {
        games: package.games.clone(),
        cycles: vec![],
        templates: package.templates.clone(),
        session_type_colors: crate::models::default_session_type_colors(),
        planning_template: None,
    })?;
    Ok(package)
}
pub(crate) fn pick_package_contents(
    app: &tauri::AppHandle,
    title: &str,
    limit: usize,
) -> Result<Option<String>> {
    let Some(selected) = app
        .dialog()
        .file()
        .set_title(title)
        .add_filter("Ankerzug-Paket", &["json"])
        .blocking_pick_file()
    else {
        return Ok(None);
    };
    let path = selected
        .into_path()
        .map_err(|e| storage_error(format!("Datei nicht erreichbar: {e}")))?;
    let file = std::fs::File::open(path)?;
    let mut bytes = Vec::new();
    file.take((limit + 1) as u64).read_to_end(&mut bytes)?;
    if bytes.len() > limit {
        return Err(invalid("Paket überschreitet die erlaubte Größe."));
    }
    String::from_utf8(bytes)
        .map(Some)
        .map_err(|_| invalid("Paket muss UTF-8 enthalten."))
}
#[tauri::command]
pub async fn read_macrocycle_package(app: tauri::AppHandle) -> Result<Option<MacroCyclePackage>> {
    tauri::async_runtime::spawn_blocking(move || {
        pick_package_contents(
            &app,
            "Makrozyklus-Paket importieren",
            crate::games::PACKAGE_LIMIT,
        )?
        .map(|contents| parse_package(&contents))
        .transpose()
    })
    .await
    .map_err(|e| storage_error(format!("Import konnte nicht geöffnet werden: {e}")))?
}
#[tauri::command]
pub async fn read_template_package(app: tauri::AppHandle) -> Result<Option<TemplatePackage>> {
    tauri::async_runtime::spawn_blocking(move || {
        pick_package_contents(
            &app,
            "Vorlagen-Paket importieren",
            crate::games::PACKAGE_LIMIT,
        )?
        .map(|contents| parse_template_package(&contents))
        .transpose()
    })
    .await
    .map_err(|e| storage_error(format!("Import konnte nicht geöffnet werden: {e}")))?
}
#[derive(Debug, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum ExportFormat {
    Games,
    Templates,
    Package,
    Markdown,
    Csv,
    Ics,
    Pdf,
}
impl ExportFormat {
    fn extension(&self) -> &'static str {
        match self {
            Self::Games | Self::Templates | Self::Package => "json",
            Self::Markdown => "md",
            Self::Csv => "csv",
            Self::Ics => "ics",
            Self::Pdf => "pdf",
        }
    }
}
fn validate_export(format: &ExportFormat, filename: &str, bytes: &[u8]) -> Result<()> {
    if filename.is_empty()
        || filename.len() > 400
        || !filename.ends_with(&format!(".{}", format.extension()))
        || filename
            .chars()
            .any(|c| c.is_control() || "<>:\"/\\|?*".contains(c))
    {
        return Err(invalid("Ungültiger Export-Dateiname."));
    }
    let limit = if matches!(
        format,
        ExportFormat::Games | ExportFormat::Templates | ExportFormat::Package
    ) {
        crate::games::PACKAGE_LIMIT
    } else {
        LIMIT
    };
    if bytes.is_empty() || bytes.len() > limit {
        return Err(invalid(
            "Export überschreitet die erlaubte Größe oder ist leer.",
        ));
    }
    match format {
        ExportFormat::Games => {
            crate::games::parse_package(
                std::str::from_utf8(bytes).map_err(|_| invalid("Paket muss UTF-8 enthalten."))?,
            )?;
        }
        ExportFormat::Templates => {
            parse_template_package(
                std::str::from_utf8(bytes).map_err(|_| invalid("Paket muss UTF-8 enthalten."))?,
            )?;
        }
        ExportFormat::Pdf => crate::pdf_export::validate(filename, bytes)?,
        ExportFormat::Package => {
            parse_package(
                std::str::from_utf8(bytes).map_err(|_| invalid("Paket muss UTF-8 enthalten."))?,
            )?;
        }
        ExportFormat::Markdown | ExportFormat::Csv | ExportFormat::Ics => {
            let text = std::str::from_utf8(bytes)
                .map_err(|_| invalid("Text-Export muss UTF-8 enthalten."))?;
            if matches!(format, ExportFormat::Ics)
                && (!text.starts_with("BEGIN:VCALENDAR\r\n")
                    || !text.ends_with("END:VCALENDAR\r\n"))
            {
                return Err(invalid("Ungültiger Kalenderexport."));
            }
        }
    }
    Ok(())
}
#[tauri::command]
pub async fn export_plan_file(
    app: tauri::AppHandle,
    format: ExportFormat,
    filename: String,
    bytes: Vec<u8>,
) -> Result<Option<String>> {
    validate_export(&format, &filename, &bytes)?;
    if matches!(format, ExportFormat::Pdf) {
        crate::pdf_export::export_pdf(app, filename, bytes).await?;
        return Ok(None);
    }
    tauri::async_runtime::spawn_blocking(move || {
        let Some(selected) = app
            .dialog()
            .file()
            .set_title(if matches!(format, ExportFormat::Games) {
                "Trainingsspiele exportieren"
            } else if matches!(format, ExportFormat::Templates) {
                "Trainingseinheit-Vorlagen exportieren"
            } else {
                "Trainingsplan exportieren"
            })
            .add_filter("Trainingsplan", &[format.extension()])
            .set_file_name(filename)
            .blocking_save_file()
        else {
            return Ok(None);
        };
        let path = selected
            .into_path()
            .map_err(|e| storage_error(format!("Exportziel nicht erreichbar: {e}")))?;
        crate::pdf_export::write_export(&path, &bytes)?;
        Ok(Some(path.to_string_lossy().into_owned()))
    })
    .await
    .map_err(|e| AppError {
        code: ErrorCode::Storage,
        message: format!("Export fehlgeschlagen: {e}"),
    })?
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::models::SaveInput;
    use crate::storage::Store;
    fn package() -> serde_json::Value {
        let backup: serde_json::Value =
            serde_json::from_str(include_str!("../../fixtures/workspace-v2.json")).unwrap();
        serde_json::json!({"kind":"ankerzug-macrocycle","formatVersion":1,"dataVersion":2,"cycle":backup["workspace"]["cycles"][0],"templates":backup["workspace"]["templates"]})
    }
    #[test]
    fn template_contract_is_lossless_strict_and_rejects_wrong_package_kinds() {
        let contents = include_str!("../../fixtures/templates-package-v1.json");
        let value: serde_json::Value = serde_json::from_str(contents).unwrap();
        let result = serde_json::to_value(parse_template_package(contents).unwrap()).unwrap();
        assert_eq!(result, value);
        assert!(
            validate_export(
                &ExportFormat::Templates,
                "plan.vorlagen.json",
                contents.as_bytes()
            )
            .is_ok()
        );
        assert!(parse_template_package(&package().to_string()).is_err());
        assert!(parse_package(contents).is_err());
        for key in ["kind", "formatVersion", "dataVersion", "unknown"] {
            let mut invalid = value.clone();
            invalid[key] = serde_json::json!(99);
            assert!(parse_template_package(&invalid.to_string()).is_err());
        }
        let mut invalid = value.clone();
        invalid["templates"] = serde_json::json!([]);
        assert!(parse_template_package(&invalid.to_string()).is_err());
        invalid = value.clone();
        invalid["templates"][0]["contents"][0]["durationMinutes"] = serde_json::json!(0);
        assert!(parse_template_package(&invalid.to_string()).is_err());
        invalid = value.clone();
        invalid["templates"][0]["sessionType"] = serde_json::json!("future");
        assert!(parse_template_package(&invalid.to_string()).is_err());
        invalid = value.clone();
        invalid["templates"]
            .as_array_mut()
            .unwrap()
            .push(value["templates"][0].clone());
        assert!(parse_template_package(&invalid.to_string()).is_err());
    }
    #[test]
    fn imported_template_copies_persist_and_duplicate_ids_roll_back() {
        let packet = parse_package(&package().to_string()).unwrap();
        let path = std::env::temp_dir().join(format!(
            "ankerzug-template-exchange-{}.sqlite",
            std::process::id()
        ));
        let mut store = Store::open(&path).unwrap();
        let original = Workspace {
            games: vec![],
            session_type_colors: crate::models::default_session_type_colors(),
            planning_template: Some(packet.cycle.planning.clone()),
            cycles: vec![packet.cycle],
            templates: packet.templates,
        };
        let saved = store
            .save(SaveInput {
                expected_revision: 0,
                workspace: original.clone(),
                attachments: vec![],
            })
            .unwrap();
        let mut imported =
            parse_template_package(include_str!("../../fixtures/templates-package-v1.json"))
                .unwrap()
                .templates;
        for template in &mut imported {
            template.id = format!("imported-{}", template.id);
            for block in &mut template.contents {
                block.id = format!("imported-{}", block.id);
            }
        }
        let mut merged = original.clone();
        merged.templates.extend(imported);
        let next = store
            .save(SaveInput {
                expected_revision: saved.revision,
                workspace: merged.clone(),
                attachments: vec![],
            })
            .unwrap();
        let mut invalid = merged.clone();
        invalid
            .templates
            .push(merged.templates.last().unwrap().clone());
        assert!(
            store
                .save(SaveInput {
                    expected_revision: next.revision,
                    workspace: invalid,
                    attachments: vec![]
                })
                .is_err()
        );
        drop(store);
        let reopened = Store::open(&path).unwrap().load().unwrap();
        assert_eq!(reopened.revision, next.revision);
        assert_eq!(
            serde_json::to_value(reopened.workspace).unwrap(),
            serde_json::to_value(merged).unwrap()
        );
        std::fs::remove_file(path).unwrap();
    }
    #[test]
    fn package_round_trip_strict_versions_references_and_compatibility() {
        let value = package();
        let parsed = parse_package(&value.to_string()).unwrap();
        let result = serde_json::to_value(parsed).unwrap();
        // Additive default fields may serialize; every existing compatibility value survives.
        assert_eq!(result["cycle"]["weeks"], value["cycle"]["weeks"]);
        assert_eq!(result["cycle"]["goals"], value["cycle"]["goals"]);
        assert_eq!(result["cycle"]["sessions"], value["cycle"]["sessions"]);
        for key in ["kind", "formatVersion", "dataVersion", "unknown"] {
            let mut invalid = value.clone();
            invalid[key] = serde_json::json!(99);
            assert!(parse_package(&invalid.to_string()).is_err());
        }
        let mut invalid = value.clone();
        invalid["cycle"]["mainCompetitionId"] = serde_json::json!("missing");
        assert!(parse_package(&invalid.to_string()).is_err());
        assert!(parse_package("{bad").is_err());
    }
    #[test]
    fn legacy_package_discards_retired_material_fields_but_keeps_block_material() {
        let mut value = package();
        value["cycle"]["materialChanges"] = serde_json::json!([{
            "id": "retired-change",
            "date": "2026-12-01",
            "major": true,
            "component": "Sehne",
            "description": "Neues Setup",
            "oldValue": "A",
            "newValue": "B",
            "notes": ""
        }]);
        value["cycle"]["planning"]["materialLookbackDays"] = serde_json::json!(14);
        value["cycle"]["planning"]["phases"][0]["capabilities"]["materialWarning"] =
            serde_json::json!(false);
        value["cycle"]["sessions"][0]["contents"][0]["material"] =
            serde_json::json!("Bogen, Theraband");
        let parsed = parse_package(&value.to_string()).unwrap();
        let cycle = serde_json::to_value(parsed.cycle).unwrap();
        assert!(cycle.get("materialChanges").is_none());
        assert!(cycle["planning"].get("materialLookbackDays").is_none());
        assert!(
            cycle["planning"]["phases"][0]["capabilities"]
                .get("materialWarning")
                .is_none()
        );
        assert_eq!(
            cycle["sessions"][0]["contents"][0]["material"],
            "Bogen, Theraband"
        );
    }
    #[test]
    fn import_aggregate_is_atomic_on_collision_and_stale_revision() {
        let packet = parse_package(&package().to_string()).unwrap();
        let path =
            std::env::temp_dir().join(format!("ankerzug-exchange-{}.sqlite", std::process::id()));
        let mut store = Store::open(&path).unwrap();
        let workspace = Workspace {
            games: vec![],
            cycles: vec![packet.cycle.clone()],
            templates: packet.templates.clone(),
            session_type_colors: crate::models::default_session_type_colors(),
            planning_template: None,
        };
        let saved = store
            .save(SaveInput {
                expected_revision: 0,
                workspace: workspace.clone(),
                attachments: vec![],
            })
            .unwrap();
        let mut duplicate = workspace.clone();
        duplicate.cycles.push(packet.cycle);
        assert!(
            store
                .save(SaveInput {
                    expected_revision: saved.revision,
                    workspace: duplicate,
                    attachments: vec![]
                })
                .is_err()
        );
        assert!(
            store
                .save(SaveInput {
                    expected_revision: 0,
                    workspace: Workspace {
                        games: vec![],
                        cycles: vec![],
                        templates: vec![],
                        session_type_colors: crate::models::default_session_type_colors(),
                        planning_template: None,
                    },
                    attachments: vec![]
                })
                .is_err()
        );
        assert_eq!(store.load().unwrap().revision, saved.revision);
        drop(store);
        assert_eq!(
            Store::open(&path)
                .unwrap()
                .load()
                .unwrap()
                .workspace
                .cycles
                .len(),
            1
        );
        std::fs::remove_file(path).unwrap();
    }
    #[test]
    fn export_rejects_paths_wrong_extensions_invalid_utf8_and_oversized_payloads() {
        assert!(validate_export(&ExportFormat::Markdown, "plan.md", "Bögen".as_bytes()).is_ok());
        assert!(validate_export(&ExportFormat::Markdown, "../plan.md", b"text").is_err());
        assert!(validate_export(&ExportFormat::Markdown, "plan.pdf", b"text").is_err());
        assert!(validate_export(&ExportFormat::Csv, "plan.csv", &[255]).is_err());
        assert!(validate_export(&ExportFormat::Ics, "plan.ics", b"not a calendar").is_err());
        assert!(validate_export(&ExportFormat::Markdown, "plan.md", &vec![0; LIMIT + 1]).is_err());
    }
}
