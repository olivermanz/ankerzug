use crate::models::*;
use rusqlite::{Connection, OptionalExtension, params};
use serde::Serialize;
use std::{collections::HashSet, path::Path};

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum ErrorCode {
    InvalidInput,
    Conflict,
    Storage,
    InvalidStoredValue,
}
#[derive(Debug, Clone, Serialize)]
pub struct AppError {
    pub code: ErrorCode,
    pub message: String,
}
pub type Result<T> = std::result::Result<T, AppError>;
fn invalid(message: &str) -> AppError {
    AppError {
        code: ErrorCode::InvalidInput,
        message: message.into(),
    }
}
fn stored(message: &str) -> AppError {
    AppError {
        code: ErrorCode::InvalidStoredValue,
        message: message.into(),
    }
}
impl From<rusqlite::Error> for AppError {
    fn from(error: rusqlite::Error) -> Self {
        Self {
            code: ErrorCode::Storage,
            message: format!("Lokale Datenbank: {error}"),
        }
    }
}
impl From<std::io::Error> for AppError {
    fn from(error: std::io::Error) -> Self {
        Self {
            code: ErrorCode::Storage,
            message: format!("Lokale Datei: {error}"),
        }
    }
}

/// Private persistence model. The schema version is never exposed as a domain field.
struct StoredDocument {
    schema_version: u32,
    revision: i64,
    payload: String,
}
fn from_document(document: StoredDocument) -> Result<Snapshot> {
    if document.schema_version != 2 {
        return Err(stored("Nicht unterstützte Datenbankversion."));
    }
    let payload = normalize_payload(&document.payload)?;
    let workspace: Workspace = serde_json::from_str(&payload)
        .map_err(|e| stored(&format!("Ungültige gespeicherte Daten: {e}")))?;
    validate(&workspace).map_err(|e| stored(&e.message))?;
    Ok(Snapshot {
        revision: u64::try_from(document.revision)
            .ok()
            .filter(|r| *r <= 9_007_199_254_740_991)
            .ok_or_else(|| stored("Ungültige gespeicherte Revision."))
            .map_err(|_| stored("Ungültige gespeicherte Revision."))?,
        workspace,
    })
}
/// Upgrades the former fixed VP1/VP2/WP/UWV/UEP records before strict serde validation.
fn normalize_payload(payload: &str) -> Result<String> {
    let mut value: serde_json::Value = serde_json::from_str(payload)
        .map_err(|e| stored(&format!("Ungültige gespeicherte Daten: {e}")))?;
    normalize_workspace_value(&mut value);
    serde_json::to_string(&value).map_err(|e| stored(&e.to_string()))
}
pub(crate) fn normalize_workspace_value(value: &mut serde_json::Value) {
    // Retire the exclusive game kind: existing games support both forms.
    if let Some(games) = value
        .get_mut("games")
        .and_then(serde_json::Value::as_array_mut)
    {
        for game in games {
            if let Some(game) = game.as_object_mut()
                && game.remove("kind").is_some()
            {
                game.insert("single".into(), true.into());
                game.insert("team".into(), true.into());
            }
        }
    }
    if value.get("cycles").is_some()
        && let Some(workspace) = value.as_object_mut()
        && !workspace.contains_key("sessionTypeColors")
    {
        workspace.insert(
            "sessionTypeColors".into(),
            serde_json::to_value(default_session_type_colors()).unwrap(),
        );
    }
    normalize_session_types(value);
    if let Some(cycles) = value
        .get_mut("cycles")
        .and_then(serde_json::Value::as_array_mut)
    {
        for cycle in cycles {
            if let Some(cycle) = cycle.as_object_mut() {
                cycle.remove("materialChanges");
            }
            let Some(planning) = cycle
                .get_mut("planning")
                .and_then(serde_json::Value::as_object_mut)
            else {
                continue;
            };
            planning.remove("materialLookbackDays");
            if planning.contains_key("phases") {
                if let Some(phases) = planning
                    .get_mut("phases")
                    .and_then(serde_json::Value::as_array_mut)
                {
                    for phase in phases {
                        if let Some(entry) = phase.as_object_mut() {
                            entry.remove("simulationPercent");
                            if let Some(capabilities) = entry
                                .get_mut("capabilities")
                                .and_then(serde_json::Value::as_object_mut)
                            {
                                capabilities.remove("simulationWarning");
                                capabilities.remove("materialWarning");
                            }
                        }
                    }
                }
                continue;
            }
            let weights = planning.remove("weights").unwrap_or_default();
            let profiles = planning.remove("profiles").unwrap_or_default();
            let uwv_days = planning.remove("uwvDays").unwrap_or(serde_json::json!(14));
            planning.remove("vp1SimulationPercent");
            let mut phases = Vec::new();
            for (code, label, display_order, proposal_order, role, weight, caps, max_days) in [
                (
                    "VP1",
                    "VP1 · Vorbereitungsphase 1",
                    1,
                    1,
                    "preparation",
                    2,
                    serde_json::json!({"proposal":true,"targetCompetition":false,"specificContentWarning":false,"volumeDeclineWarning":false}),
                    serde_json::Value::Null,
                ),
                (
                    "VP2",
                    "VP2 · Vorbereitungsphase 2",
                    2,
                    2,
                    "preparation",
                    3,
                    serde_json::json!({"proposal":true,"targetCompetition":false,"specificContentWarning":false,"volumeDeclineWarning":false}),
                    serde_json::Value::Null,
                ),
                (
                    "WP",
                    "WP · Wettkampfphase",
                    3,
                    3,
                    "work",
                    2,
                    serde_json::json!({"proposal":true,"targetCompetition":false,"specificContentWarning":true,"volumeDeclineWarning":false}),
                    serde_json::Value::Null,
                ),
                (
                    "UWV",
                    "UWV · Unmittelbare Wettkampfvorbereitung",
                    4,
                    4,
                    "peak",
                    1,
                    serde_json::json!({"proposal":true,"targetCompetition":true,"specificContentWarning":true,"volumeDeclineWarning":true}),
                    uwv_days.clone(),
                ),
                (
                    "UEP",
                    "UEP · Übergangsphase",
                    5,
                    5,
                    "transition",
                    1,
                    serde_json::json!({"proposal":true,"targetCompetition":false,"specificContentWarning":false,"volumeDeclineWarning":false}),
                    serde_json::Value::Null,
                ),
            ] {
                let profile = profiles.get(code).cloned().unwrap_or_else(
                    || serde_json::json!({"volume":1,"intensity":1,"competitionSpecificity":1}),
                );
                let proposal_weight = weights
                    .get(code)
                    .cloned()
                    .unwrap_or(serde_json::json!(weight));
                phases.push(serde_json::json!({"code":code,"label":label,"displayOrder":display_order,"proposalOrder":proposal_order,"role":role,"proposalWeight":proposal_weight,"profile":profile,"capabilities":caps,"maxDays":max_days}));
            }
            planning.insert("phases".into(), serde_json::Value::Array(phases));
        }
    }
    if let Some(planning) = value
        .get_mut("planningTemplate")
        .and_then(serde_json::Value::as_object_mut)
    {
        planning.remove("materialLookbackDays");
        if let Some(phases) = planning
            .get_mut("phases")
            .and_then(serde_json::Value::as_array_mut)
        {
            for phase in phases {
                if let Some(capabilities) = phase
                    .get_mut("capabilities")
                    .and_then(serde_json::Value::as_object_mut)
                {
                    capabilities.remove("materialWarning");
                }
            }
        }
    }
    if value.get("planningTemplate").is_none()
        && let Some(template) = value
            .get("cycles")
            .and_then(serde_json::Value::as_array)
            .and_then(|cycles| cycles.first())
            .and_then(|cycle| cycle.get("planning"))
            .cloned()
    {
        value["planningTemplate"] = template;
    }
}

/// Converts import-only legacy session type values before strict deserialization.
/// Unknown strings are deliberately left in place so the typed contract rejects them.
pub(crate) fn normalize_session_types(value: &mut serde_json::Value) {
    fn normalize_type(value: &mut serde_json::Value) {
        let Some(session_type) = value.as_str() else {
            return;
        };
        let canonical = match session_type {
            "technique" => "BAT",
            "volume" => "GT",
            "bowStrength" => "KAT",
            "specificCoordination" => "KT",
            "specificConditioning" => "KNT",
            "competitionTraining" => "BAT-WE",
            "simulation" | "diagnostic" | "competition" => "LK",
            "athletic" | "recovery" => "AT",
            "mental" => "MT",
            "material" => "M-T",
            _ => return,
        };
        *value = serde_json::Value::String(canonical.into());
    }

    let normalize_session = |session: &mut serde_json::Value| {
        if let Some(session) = session.as_object_mut() {
            if let Some(value) = session.get_mut("sessionType") {
                normalize_type(value);
            }
            if let Some(baseline) = session.get_mut("generationBaseline")
                && let Some(value) = baseline.get_mut("sessionType")
            {
                normalize_type(value);
            }
        }
    };

    if let Some(cycles) = value
        .get_mut("cycles")
        .and_then(serde_json::Value::as_array_mut)
    {
        for cycle in cycles {
            let Some(cycle) = cycle.as_object_mut() else {
                continue;
            };
            if let Some(slots) = cycle
                .get_mut("slots")
                .and_then(serde_json::Value::as_array_mut)
            {
                for slot in slots {
                    if let Some(value) = slot.get_mut("sessionType") {
                        normalize_type(value);
                    }
                }
            }
            if let Some(sessions) = cycle
                .get_mut("sessions")
                .and_then(serde_json::Value::as_array_mut)
            {
                for session in sessions {
                    normalize_session(session);
                }
            }
        }
    }
    if let Some(templates) = value
        .get_mut("templates")
        .and_then(serde_json::Value::as_array_mut)
    {
        for template in templates {
            if let Some(value) = template.get_mut("sessionType") {
                normalize_type(value);
            }
        }
    }
}
fn to_payload(workspace: &Workspace) -> Result<String> {
    validate(workspace)?;
    let payload = serde_json::to_string(workspace).map_err(|e| invalid(&e.to_string()))?;
    if payload.len() > 200 * 1024 * 1024 {
        return Err(invalid(
            "Der lokale Datenbestand darf maximal 200 MiB umfassen.",
        ));
    }
    Ok(payload)
}
fn without_attachment_bytes(workspace: &Workspace) -> (Workspace, Vec<AttachmentBytes>) {
    let mut workspace = workspace.clone();
    let mut attachments = Vec::new();
    for game in &mut workspace.games {
        for attachment in &mut game.attachments {
            if let Some(bytes) = attachment.bytes.take() {
                attachments.push(AttachmentBytes {
                    id: attachment.id.clone(),
                    bytes,
                });
            }
        }
    }
    (workspace, attachments)
}
pub fn valid_date(value: &str) -> bool {
    let b = value.as_bytes();
    if b.len() != 10
        || b[4] != b'-'
        || b[7] != b'-'
        || !b
            .iter()
            .enumerate()
            .all(|(i, c)| i == 4 || i == 7 || c.is_ascii_digit())
    {
        return false;
    }
    let year: u32 = value[0..4].parse().unwrap_or(0);
    let month: u32 = value[5..7].parse().unwrap_or(0);
    let day: u32 = value[8..10].parse().unwrap_or(0);
    let leap = year.is_multiple_of(4) && (!year.is_multiple_of(100) || year.is_multiple_of(400));
    let max = match month {
        2 => {
            if leap {
                29
            } else {
                28
            }
        }
        4 | 6 | 9 | 11 => 30,
        1 | 3 | 5 | 7 | 8 | 10 | 12 => 31,
        _ => 0,
    };
    year > 0 && day > 0 && day <= max
}
fn monday(date: &str) -> bool {
    let mut year: i32 = date[..4].parse().unwrap();
    let month: usize = date[5..7].parse().unwrap();
    let day: i32 = date[8..].parse().unwrap();
    if month < 3 {
        year -= 1;
    }
    (year + year / 4 - year / 100
        + year / 400
        + [0, 3, 2, 5, 0, 3, 5, 1, 4, 6, 2, 4][month - 1]
        + day)
        % 7
        == 1
}
fn valid_time(value: &str) -> bool {
    let b = value.as_bytes();
    b.len() == 5
        && b[2] == b':'
        && [b[0], b[1], b[3], b[4]].iter().all(u8::is_ascii_digit)
        && value[..2].parse::<u32>().unwrap_or(99) < 24
        && value[3..].parse::<u32>().unwrap_or(99) < 60
}
fn require(ok: bool, message: &str) -> Result<()> {
    if ok { Ok(()) } else { Err(invalid(message)) }
}
fn identifier<'a>(value: &'a str, ids: &mut HashSet<&'a str>) -> Result<()> {
    require(
        !value.is_empty() && value.len() <= 128 && ids.insert(value),
        "Leere oder doppelte Kennung.",
    )
}
fn scale(value: Option<u32>) -> bool {
    value.is_none_or(|v| (1..=5).contains(&v))
}
fn valid_session_type_colors(colors: &std::collections::BTreeMap<SessionType, String>) -> bool {
    colors.len() == 12
        && default_session_type_colors()
            .keys()
            .all(|kind| colors.contains_key(kind))
        && colors.values().all(|value| {
            value.len() == 7
                && value.starts_with('#')
                && value.as_bytes()[1..].iter().all(u8::is_ascii_hexdigit)
        })
}
fn contents<'a>(blocks: &'a [Content], ids: &mut HashSet<&'a str>) -> Result<()> {
    const CATEGORIES: &[&str] = &[
        "Pause",
        "Spiel",
        "Aufwärmen",
        "Einschießen",
        "Technik",
        "Volumentraining",
        "Kraft / spezifische Kraft",
        "Koordination",
        "Scoring",
        "Wettkampfsimulation",
        "Matchplay / Duelle",
        "Mentaltraining",
        "Blank Bale / Scheibe ohne Wertung",
        "Material / Tuning",
        "Cool-down",
        "Regeneration",
        "Sonstiges",
    ];
    for block in blocks {
        identifier(&block.id, ids)?;
        require(
            scale(block.planned_load)
                && scale(block.actual_load)
                && block.areas.iter().collect::<HashSet<_>>().len() == block.areas.len(),
            "Ungültiges Inhaltsprofil.",
        )?;
        require(
            block.duration_minutes > 0
                && block
                    .start_offset_minutes
                    .checked_add(block.duration_minutes)
                    .is_some()
                && block.goals.chars().count() <= 300
                && block.notes.chars().count() <= 400
                && (!block.content.trim().is_empty() || block.category == "Spiel"),
            "Ungültiger Inhaltsblock.",
        )?;
        require(
            block.category.is_empty() || CATEGORIES.contains(&block.category.as_str()),
            "Unbekannte Inhaltskategorie.",
        )?;
    }
    Ok(())
}
/// Structural validation only: interval placement, training warnings and calculations live in Angular.
pub fn validate(workspace: &Workspace) -> Result<()> {
    require(
        valid_session_type_colors(&workspace.session_type_colors),
        "Ungültige Farben der Einheitentypen.",
    )?;
    let mut ids = HashSet::new();
    let game_ids: HashSet<_> = workspace.games.iter().map(|g| &g.id).collect();
    for game in &workspace.games {
        identifier(&game.id, &mut ids)?;
        require(
            !game.name.trim().is_empty()
                && !game.description.trim().is_empty()
                && (game.single || game.team)
                && [
                    game.effort,
                    game.fun,
                    game.duration,
                    game.competition_proximity,
                ]
                .iter()
                .all(|v| (1..=5).contains(v)),
            "Ungültige Spielstammdaten oder Kennzahlen (1–5).",
        )?;
        for attachment in &game.attachments {
            identifier(&attachment.id, &mut ids)?;
            if let Some(bytes) = &attachment.bytes {
                crate::games::validate_attachment(&attachment.filename, bytes)?;
            } else {
                crate::games::validate_attachment_name(&attachment.filename)?;
            }
        }
    }
    let blocks = workspace.templates.iter().flat_map(|t| &t.contents).chain(
        workspace
            .cycles
            .iter()
            .flat_map(|c| &c.sessions)
            .flat_map(|s| {
                s.contents
                    .iter()
                    .chain(s.generation_baseline.iter().flat_map(|b| &b.contents))
            }),
    );
    for block in blocks {
        if let Some(game_id) = &block.game_id {
            require(
                block.category == "Spiel" && game_ids.contains(game_id),
                "Ungültiger Spielbezug.",
            )?;
        }
    }
    let template_ids: HashSet<_> = workspace.templates.iter().map(|t| &t.id).collect();
    for cycle in &workspace.cycles {
        identifier(&cycle.id, &mut ids)?;
        require(
            !cycle.name.trim().is_empty()
                && valid_date(&cycle.start_date)
                && valid_date(&cycle.end_date),
            "Ungültige Makrozyklus-Stammdaten.",
        )?;
        let competition_ids: HashSet<_> = cycle.competitions.iter().map(|c| &c.id).collect();
        require(
            cycle
                .competitions
                .iter()
                .any(|c| c.id == cycle.main_competition_id && c.priority == Priority::A),
            "Hauptwettkampf muss ein vorhandener A-Wettkampf sein.",
        )?;
        for competition in &cycle.competitions {
            identifier(&competition.id, &mut ids)?;
            require(
                !competition.name.trim().is_empty() && valid_date(&competition.date),
                "Ungültiger Wettkampf.",
            )?;
        }
        let config = &cycle.planning;
        require(
            !config.phases.is_empty()
                && [
                    config.short_cycle_days,
                    config.close_peak_days,
                    config.recovery_lookback_days,
                    config.long_season_days,
                ]
                .iter()
                .all(|v| *v > 0 && *v <= 3660)
                && (1..=5).contains(&config.hard_intensity)
                && config.consecutive_hard_sessions > 0
                && config.load_rise_weeks > 0
                && {
                    let mut codes = HashSet::new();
                    let mut display_orders = HashSet::new();
                    let mut proposal_orders = HashSet::new();
                    config.phases.iter().all(|phase| {
                        !phase.code.trim().is_empty()
                            && !phase.label.trim().is_empty()
                            && phase.display_order > 0
                            && phase.proposal_order > 0
                            && phase.proposal_weight > 0
                            && phase.proposal_weight <= 3660
                            && codes.insert(&phase.code)
                            && display_orders.insert(phase.display_order)
                            && proposal_orders.insert(phase.proposal_order)
                            && scale(phase.profile.volume)
                            && scale(phase.profile.intensity)
                            && scale(phase.profile.competition_specificity)
                            && phase.max_days.is_none_or(|v| v > 0 && v <= 3660)
                    }) && config.phases.iter().any(|phase| {
                        phase.role == PhaseRole::Peak && phase.capabilities.target_competition
                    })
                },
            "Ungültige Planungskonfiguration.",
        )?;
        let phase_codes: HashSet<_> = config.phases.iter().map(|phase| &phase.code).collect();
        require(
            cycle
                .mesocycles
                .iter()
                .all(|mesocycle| phase_codes.contains(&mesocycle.r#type)),
            "Mesozyklus verweist auf eine unbekannte Phase.",
        )?;
        let mut mondays = HashSet::new();
        for week in &cycle.weeks {
            require(
                valid_date(&week.monday) && monday(&week.monday) && mondays.insert(&week.monday),
                "Ungültige oder doppelte Montagwoche.",
            )?;
        }
        for goal in &cycle.goals {
            identifier(&goal.id, &mut ids)?;
            let valid_reference = match goal.scope {
                GoalScope::Macrocycle => goal.reference == cycle.id,
                GoalScope::Mesocycle => cycle.mesocycles.iter().any(|m| m.id == goal.reference),
                GoalScope::Session => cycle.sessions.iter().any(|s| s.id == goal.reference),
                GoalScope::Week => cycle.weeks.iter().any(|w| w.monday == goal.reference),
            };
            require(
                valid_reference
                    && !goal.description.trim().is_empty()
                    && goal.target_value.is_none_or(f64::is_finite),
                "Ungültiges Trainingsziel oder Verweis.",
            )?;
        }
        let phase_ids: HashSet<_> = cycle.mesocycles.iter().map(|m| &m.id).collect();
        let slot_ids: HashSet<_> = cycle.slots.iter().map(|s| &s.id).collect();
        for phase in &cycle.mesocycles {
            identifier(&phase.id, &mut ids)?;
            require(
                phase
                    .default_template_id
                    .as_ref()
                    .is_none_or(|id| template_ids.contains(id))
                    && !phase.name.trim().is_empty()
                    && valid_date(&phase.start_date)
                    && valid_date(&phase.end_date)
                    && phase.legacy_arrow_count.is_none_or(|v| v <= 100)
                    && scale(phase.competition_specificity)
                    && scale(phase.volume)
                    && scale(phase.intensity)
                    && phase.sequence_number.is_none_or(|v| v > 0)
                    && phase
                        .target_competition_id
                        .as_ref()
                        .is_none_or(|id| competition_ids.contains(id)),
                "Ungültiger Mesozyklus.",
            )?;
        }
        for period in &cycle.periods {
            identifier(&period.id, &mut ids)?;
            require(
                !period.name.trim().is_empty()
                    && valid_date(&period.start_date)
                    && valid_date(&period.end_date),
                "Ungültiger Sonderzeitraum.",
            )?;
        }
        for slot in &cycle.slots {
            identifier(&slot.id, &mut ids)?;
            require(
                slot.weekday <= 6
                    && valid_time(&slot.start_time)
                    && slot.default_duration > 0
                    && (slot.valid_from.is_empty() || valid_date(&slot.valid_from))
                    && (slot.valid_until.is_empty() || valid_date(&slot.valid_until)),
                "Ungültiger Trainingsslot.",
            )?;
        }
        for period in &cycle.periods {
            require(
                period
                    .duration_percent
                    .is_none_or(|v| (1..=100).contains(&v))
                    && period.retained_slot_ids.as_ref().is_none_or(|values| {
                        values.iter().all(|id| slot_ids.contains(id))
                            && values.iter().collect::<HashSet<_>>().len() == values.len()
                    }),
                "Ungültige Ferienreduktion.",
            )?;
        }
        let mut origins = HashSet::new();
        for session in &cycle.sessions {
            if let Some(baseline) = &session.generation_baseline {
                require(
                    valid_date(&baseline.date)
                        && valid_time(&baseline.start_time)
                        && baseline.planned_duration > 0
                        && scale(baseline.volume)
                        && scale(baseline.intensity)
                        && scale(baseline.competition_specificity),
                    "Ungültiger Generierungsstand.",
                )?;
                // Snapshot IDs and former phase references are historical metadata,
                // not additional live entities or foreign keys.
                contents(&baseline.contents, &mut HashSet::new())?;
            }
            identifier(&session.id, &mut ids)?;
            require(
                valid_date(&session.date)
                    && valid_time(&session.start_time)
                    && session.planned_duration > 0
                    && scale(session.volume)
                    && scale(session.intensity)
                    && scale(session.competition_specificity)
                    && session.subjective_load.is_none_or(|v| v <= 10)
                    && session.areas.iter().collect::<HashSet<_>>().len() == session.areas.len()
                    && session
                        .original_plan
                        .as_ref()
                        .is_none_or(|p| p.duration > 0),
                "Ungültige Trainingseinheit.",
            )?;
            require(
                session
                    .meso_cycle_id
                    .as_ref()
                    .is_none_or(|id| phase_ids.contains(id))
                    && session
                        .source_training_slot_id
                        .as_ref()
                        .is_none_or(|id| slot_ids.contains(id)),
                "Einheit verweist auf eine nicht vorhandene Phase oder einen Slot.",
            )?;
            require(
                !session.occurrence_key.is_empty() && origins.insert(&session.occurrence_key),
                "Doppelter oder fehlender Generierungsursprung.",
            )?;
            contents(&session.contents, &mut ids)?;
        }
        let mut exclusions = HashSet::new();
        for exclusion in &cycle.exclusions {
            require(
                !exclusion.is_empty()
                    && exclusions.insert(exclusion)
                    && !origins.contains(exclusion),
                "Doppelte oder widersprüchliche Generierungsausschlüsse.",
            )?;
        }
    }
    for template in &workspace.templates {
        identifier(&template.id, &mut ids)?;
        require(
            !template.name.trim().is_empty()
                && template.default_duration > 0
                && scale(template.volume)
                && scale(template.intensity)
                && scale(template.competition_specificity)
                && template.areas.iter().collect::<HashSet<_>>().len() == template.areas.len(),
            "Ungültige Vorlage.",
        )?;
        contents(&template.contents, &mut ids)?;
    }
    Ok(())
}

pub struct Store {
    connection: Connection,
}
impl Store {
    pub fn open(path: &Path) -> Result<Self> {
        let connection = Connection::open(path)?;
        Self::from_connection(connection)
    }
    fn from_connection(mut connection: Connection) -> Result<Self> {
        connection.busy_timeout(std::time::Duration::from_secs(5))?;
        let mut version: u32 = connection.query_row("PRAGMA user_version", [], |r| r.get(0))?;
        if version > 5 {
            return Err(stored(
                "Die Datenbank stammt aus einer neueren Ankerzug-Version.",
            ));
        }
        if version == 0 {
            connection.execute_batch("BEGIN IMMEDIATE; CREATE TABLE documents (id INTEGER PRIMARY KEY CHECK(id=1), schema_version INTEGER NOT NULL CHECK(schema_version=2), revision INTEGER NOT NULL CHECK(revision >= 0), payload TEXT NOT NULL); CREATE TABLE recovery (id INTEGER PRIMARY KEY, schema_version INTEGER NOT NULL CHECK(schema_version=2), revision INTEGER NOT NULL, payload TEXT NOT NULL); CREATE TABLE game_attachments (id TEXT PRIMARY KEY, bytes BLOB NOT NULL); PRAGMA user_version=5; COMMIT;")?;
            version = 5;
        }
        if version == 1 {
            let transaction =
                connection.transaction_with_behavior(rusqlite::TransactionBehavior::Immediate)?;
            let mut rows = Vec::new();
            {
                let mut statement = transaction
                    .prepare("SELECT id, schema_version, revision, payload FROM documents")?;
                for row in statement.query_map([], |r| {
                    Ok((
                        r.get::<_, i64>(0)?,
                        r.get::<_, u32>(1)?,
                        r.get::<_, i64>(2)?,
                        r.get::<_, String>(3)?,
                    ))
                })? {
                    let (id, schema, revision, payload) = row?;
                    require(
                        schema == 1 && (0..=9_007_199_254_740_991).contains(&revision),
                        "Ungültige alte Dokumentversion.",
                    )
                    .map_err(|e| stored(&e.message))?;
                    let workspace =
                        crate::legacy::convert(&payload).map_err(|e| stored(&e.message))?;
                    rows.push((
                        id,
                        revision,
                        to_payload(&workspace).map_err(|e| stored(&e.message))?,
                    ));
                }
            }
            let mut recovery = Vec::new();
            {
                let mut statement =
                    transaction.prepare("SELECT id, revision, payload FROM recovery")?;
                for row in statement.query_map([], |r| {
                    Ok((
                        r.get::<_, i64>(0)?,
                        r.get::<_, i64>(1)?,
                        r.get::<_, String>(2)?,
                    ))
                })? {
                    let (id, revision, payload) = row?;
                    require(
                        (0..=9_007_199_254_740_991).contains(&revision),
                        "Ungültige Wiederherstellungsrevision.",
                    )
                    .map_err(|e| stored(&e.message))?;
                    let workspace =
                        crate::legacy::convert(&payload).map_err(|e| stored(&e.message))?;
                    recovery.push((
                        id,
                        revision,
                        to_payload(&workspace).map_err(|e| stored(&e.message))?,
                    ));
                }
            }
            transaction.execute_batch("ALTER TABLE documents RENAME TO documents_v1; ALTER TABLE recovery RENAME TO recovery_v1; CREATE TABLE documents (id INTEGER PRIMARY KEY CHECK(id=1), schema_version INTEGER NOT NULL CHECK(schema_version=2), revision INTEGER NOT NULL CHECK(revision>=0), payload TEXT NOT NULL); CREATE TABLE recovery (id INTEGER PRIMARY KEY, schema_version INTEGER NOT NULL CHECK(schema_version=2), revision INTEGER NOT NULL, payload TEXT NOT NULL);")?;
            for (id, revision, payload) in rows {
                transaction.execute(
                    "INSERT INTO documents VALUES (?1,2,?2,?3)",
                    params![id, revision, payload],
                )?;
            }
            for (id, revision, payload) in recovery {
                transaction.execute(
                    "INSERT INTO recovery VALUES (?1,2,?2,?3)",
                    params![id, revision, payload],
                )?;
            }
            transaction.execute_batch(
                "DROP TABLE documents_v1; DROP TABLE recovery_v1; PRAGMA user_version=2;",
            )?;
            transaction.commit()?;
            version = 2;
        }
        if version == 2 {
            let transaction =
                connection.transaction_with_behavior(rusqlite::TransactionBehavior::Immediate)?;
            transaction.execute_batch(
                "CREATE TABLE game_attachments (id TEXT PRIMARY KEY, bytes BLOB NOT NULL);",
            )?;
            if let Some(payload) = transaction
                .query_row("SELECT payload FROM documents WHERE id=1", [], |row| {
                    row.get::<_, String>(0)
                })
                .optional()?
            {
                let payload = normalize_payload(&payload)?;
                let workspace: Workspace = serde_json::from_str(&payload)
                    .map_err(|e| stored(&format!("Ungültige gespeicherte Daten: {e}")))?;
                validate(&workspace).map_err(|e| stored(&e.message))?;
                let (metadata, attachments) = without_attachment_bytes(&workspace);
                let payload = to_payload(&metadata).map_err(|e| stored(&e.message))?;
                for attachment in attachments {
                    transaction.execute(
                        "INSERT INTO game_attachments (id, bytes) VALUES (?1, ?2)",
                        params![attachment.id, attachment.bytes],
                    )?;
                }
                transaction.execute(
                    "UPDATE documents SET payload=?1 WHERE id=1",
                    params![payload],
                )?;
            }
            transaction.execute_batch("PRAGMA user_version=3;")?;
            transaction.commit()?;
            version = 3;
        }
        if version == 3 {
            let transaction =
                connection.transaction_with_behavior(rusqlite::TransactionBehavior::Immediate)?;
            for table in ["documents", "recovery"] {
                let mut rows = Vec::new();
                {
                    let mut statement =
                        transaction.prepare(&format!("SELECT id, payload FROM {table}"))?;
                    for row in statement.query_map([], |row| {
                        Ok((row.get::<_, i64>(0)?, row.get::<_, String>(1)?))
                    })? {
                        let (id, payload) = row?;
                        let payload = normalize_payload(&payload)?;
                        let workspace: Workspace = serde_json::from_str(&payload)
                            .map_err(|e| stored(&format!("Ungültige gespeicherte Daten: {e}")))?;
                        validate(&workspace).map_err(|e| stored(&e.message))?;
                        rows.push((id, to_payload(&workspace).map_err(|e| stored(&e.message))?));
                    }
                }
                for (id, payload) in rows {
                    transaction.execute(
                        &format!("UPDATE {table} SET payload=?1 WHERE id=?2"),
                        params![payload, id],
                    )?;
                }
            }
            transaction.execute_batch("PRAGMA user_version=4;")?;
            transaction.commit()?;
        }

        if version == 4 {
            let transaction =
                connection.transaction_with_behavior(rusqlite::TransactionBehavior::Immediate)?;
            for table in ["documents", "recovery"] {
                let mut rows = Vec::new();
                {
                    let mut statement =
                        transaction.prepare(&format!("SELECT id, payload FROM {table}"))?;
                    for row in statement.query_map([], |row| {
                        Ok((row.get::<_, i64>(0)?, row.get::<_, String>(1)?))
                    })? {
                        let (id, payload) = row?;
                        let payload = normalize_payload(&payload)?;
                        let workspace: Workspace = serde_json::from_str(&payload)
                            .map_err(|e| stored(&format!("Ungültige gespeicherte Daten: {e}")))?;
                        validate(&workspace).map_err(|e| stored(&e.message))?;
                        rows.push((id, to_payload(&workspace).map_err(|e| stored(&e.message))?));
                    }
                }
                for (id, payload) in rows {
                    transaction.execute(
                        &format!("UPDATE {table} SET payload=?1 WHERE id=?2"),
                        params![payload, id],
                    )?;
                }
            }
            transaction.execute_batch("PRAGMA user_version=5;")?;
            transaction.commit()?;
            version = 5;
        }
        if version != 5 {
            return Err(stored(
                "Diese Entwicklungsversion unterstützt nur eine neu angelegte Datenbank. Bitte Backup wiederherstellen.",
            ));
        }
        Ok(Self { connection })
    }
    fn document(&self) -> Result<Option<StoredDocument>> {
        Ok(self
            .connection
            .query_row(
                "SELECT schema_version, revision, payload FROM documents WHERE id=1",
                [],
                |row| {
                    Ok(StoredDocument {
                        schema_version: row.get(0)?,
                        revision: row.get(1)?,
                        payload: row.get(2)?,
                    })
                },
            )
            .optional()?)
    }
    pub fn load(&self) -> Result<Snapshot> {
        match self.document()? {
            Some(document) => from_document(document),
            None => Ok(Snapshot {
                revision: 0,
                workspace: Workspace::default(),
            }),
        }
    }
    pub fn save(&mut self, input: SaveInput) -> Result<Snapshot> {
        self.write(input, false)
    }
    fn write(&mut self, input: SaveInput, recovery: bool) -> Result<Snapshot> {
        let SaveInput {
            expected_revision,
            workspace,
            attachments,
        } = input;
        let (workspace, mut attachment_bytes) = without_attachment_bytes(&workspace);
        attachment_bytes.extend(attachments);
        validate(&workspace)?;
        let attachment_ids: HashSet<_> = workspace
            .games
            .iter()
            .flat_map(|game| {
                game.attachments
                    .iter()
                    .map(|attachment| attachment.id.as_str())
            })
            .collect();
        for attachment in &attachment_bytes {
            require(
                attachment_ids.contains(attachment.id.as_str()),
                "Ungültiger PDF-Anhang.",
            )?;
            let filename = workspace
                .games
                .iter()
                .flat_map(|game| game.attachments.iter())
                .find(|stored| stored.id == attachment.id)
                .map(|stored| stored.filename.as_str())
                .ok_or_else(|| invalid("Ungültiger PDF-Anhang."))?;
            crate::games::validate_attachment(filename, &attachment.bytes)?;
        }
        let payload = to_payload(&workspace)?;
        let transaction = self
            .connection
            .transaction_with_behavior(rusqlite::TransactionBehavior::Immediate)?;
        let previous: Option<(i64, String)> = transaction
            .query_row(
                "SELECT revision, payload FROM documents WHERE id=1",
                [],
                |row| Ok((row.get(0)?, row.get(1)?)),
            )
            .optional()?;
        let current = u64::try_from(previous.as_ref().map_or(0, |(revision, _)| *revision))
            .map_err(|_| stored("Ungültige gespeicherte Revision."))?;
        if current != expected_revision {
            return Err(AppError { code: ErrorCode::Conflict, message: "Der gespeicherte Stand wurde geändert. Bitte den aktuellen Stand laden, bevor Änderungen übernommen werden.".into() });
        }
        let revision = current
            .checked_add(1)
            .filter(|r| *r <= 9_007_199_254_740_991)
            .ok_or_else(|| stored("Ungültige Datenversion."))?;
        if recovery && let Some((old_revision, old_payload)) = previous {
            let normalized = normalize_payload(&old_payload)?;
            let mut old_workspace: Workspace = serde_json::from_str(&normalized)
                .map_err(|e| stored(&format!("Ungültige gespeicherte Daten: {e}")))?;
            for attachment in old_workspace
                .games
                .iter_mut()
                .flat_map(|game| game.attachments.iter_mut())
            {
                attachment.bytes = Some(transaction.query_row(
                    "SELECT bytes FROM game_attachments WHERE id=?1",
                    [&attachment.id],
                    |row| row.get(0),
                )?);
            }
            transaction.execute(
                "INSERT INTO recovery (schema_version, revision, payload) VALUES (2, ?1, ?2)",
                params![
                    old_revision,
                    serde_json::to_string(&old_workspace).map_err(|e| stored(&e.to_string()))?
                ],
            )?;
        }
        for attachment in &attachment_bytes {
            transaction.execute(
                "INSERT INTO game_attachments (id, bytes) VALUES (?1, ?2) ON CONFLICT(id) DO UPDATE SET bytes=excluded.bytes",
                params![attachment.id, attachment.bytes],
            )?;
        }
        for attachment_id in &attachment_ids {
            let exists: bool = transaction.query_row(
                "SELECT EXISTS(SELECT 1 FROM game_attachments WHERE id=?1)",
                [*attachment_id],
                |row| row.get(0),
            )?;
            require(exists, "PDF-Anhang fehlt im lokalen Speicher.")?;
        }
        let existing: Vec<String> = {
            let mut statement = transaction.prepare("SELECT id FROM game_attachments")?;
            statement
                .query_map([], |row| row.get(0))?
                .collect::<std::result::Result<Vec<_>, _>>()?
        };
        for attachment_id in existing {
            if !attachment_ids.contains(attachment_id.as_str()) {
                transaction.execute("DELETE FROM game_attachments WHERE id=?1", [attachment_id])?;
            }
        }
        transaction.execute("INSERT INTO documents (id, schema_version, revision, payload) VALUES (1, 2, ?1, ?2) ON CONFLICT(id) DO UPDATE SET revision=excluded.revision, payload=excluded.payload", params![revision as i64, payload])?;
        transaction.commit()?;
        Ok(Snapshot {
            revision,
            workspace,
        })
    }
    pub fn backup(&self) -> Result<String> {
        let workspace = self.workspace_with_attachment_bytes(self.load()?.workspace)?;
        serde_json::to_string_pretty(&Backup {
            format_version: 2,
            workspace,
        })
        .map_err(|e| stored(&e.to_string()))
    }
    pub fn recover(&mut self, expected_revision: u64) -> Result<Snapshot> {
        let payload: Option<String> = self
            .connection
            .query_row(
                "SELECT payload FROM recovery ORDER BY id DESC LIMIT 1",
                [],
                |row| row.get(0),
            )
            .optional()?;
        let payload = payload
            .ok_or_else(|| invalid("Es gibt noch keinen Stand vor einer Wiederherstellung."))?;
        let snapshot = from_document(StoredDocument {
            schema_version: 2,
            revision: 0,
            payload,
        })?;
        let (workspace, attachments) = without_attachment_bytes(&snapshot.workspace);
        self.write(
            SaveInput {
                expected_revision,
                workspace,
                attachments,
            },
            true,
        )
    }
    pub fn restore(&mut self, contents: &str, expected_revision: u64) -> Result<Snapshot> {
        require(
            contents.len() <= 200 * 1024 * 1024,
            "Backup ist größer als 200 MiB.",
        )?;
        #[derive(serde::Deserialize)]
        #[serde(rename_all = "camelCase", deny_unknown_fields)]
        struct Envelope {
            format_version: u32,
            workspace: serde_json::Value,
        }
        let envelope: Envelope = serde_json::from_str(contents)
            .map_err(|e| invalid(&format!("Ungültiges Backup: {e}")))?;
        let workspace = match envelope.format_version {
            1 => crate::legacy::convert(&envelope.workspace.to_string())?,
            2 => {
                let mut value = envelope.workspace;
                normalize_workspace_value(&mut value);
                serde_json::from_value(value)
                    .map_err(|e| invalid(&format!("Ungültiges Backup: {e}")))?
            }
            _ => return Err(invalid("Nicht unterstützte Backupversion.")),
        };
        let (workspace, attachments) = without_attachment_bytes(&workspace);
        self.write(
            SaveInput {
                expected_revision,
                workspace,
                attachments,
            },
            true,
        )
    }
    fn workspace_with_attachment_bytes(&self, mut workspace: Workspace) -> Result<Workspace> {
        for attachment in workspace
            .games
            .iter_mut()
            .flat_map(|game| game.attachments.iter_mut())
        {
            attachment.bytes = Some(self.connection.query_row(
                "SELECT bytes FROM game_attachments WHERE id=?1",
                [&attachment.id],
                |row| row.get(0),
            )?);
        }
        Ok(workspace)
    }
    pub fn attachment_bytes(&self, ids: &[String]) -> Result<Vec<AttachmentBytes>> {
        ids.iter()
            .map(|id| {
                self.connection
                    .query_row(
                        "SELECT bytes FROM game_attachments WHERE id=?1",
                        [id],
                        |row| {
                            Ok(AttachmentBytes {
                                id: id.clone(),
                                bytes: row.get(0)?,
                            })
                        },
                    )
                    .optional()?
                    .ok_or_else(|| invalid("PDF-Anhang fehlt im lokalen Speicher."))
            })
            .collect()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    const FIXTURE: &str = include_str!("../../fixtures/workspace-v2.json");
    #[test]
    fn retired_game_kind_is_reset_to_both_forms_without_resetting_new_choices() {
        let packet: serde_json::Value =
            serde_json::from_str(include_str!("../../fixtures/games-package-v1.json")).unwrap();
        for kind in ["single", "group"] {
            let mut value =
                serde_json::json!({"cycles":[], "templates":[], "games": packet["games"]});
            let game = value["games"][0].as_object_mut().unwrap();
            game.remove("single");
            game.remove("team");
            game.insert("kind".into(), kind.into());
            let snapshot = from_document(StoredDocument {
                schema_version: 2,
                revision: 1,
                payload: value.to_string(),
            })
            .unwrap();
            assert!(snapshot.workspace.games[0].single);
            assert!(snapshot.workspace.games[0].team);
            let serialized = serde_json::to_value(&snapshot.workspace).unwrap();
            assert!(serialized["games"][0].get("kind").is_none());
            let mut store = Store::from_connection(Connection::open_in_memory().unwrap()).unwrap();
            let backup = serde_json::json!({"formatVersion":2, "workspace":value});
            store.restore(&backup.to_string(), 0).unwrap();
            assert!(store.load().unwrap().workspace.games[0].single);
            assert!(store.load().unwrap().workspace.games[0].team);
        }
        let mut value = serde_json::json!({"cycles":[], "templates":[], "games": packet["games"]});
        value["games"][0]["single"] = false.into();
        normalize_workspace_value(&mut value);
        assert_eq!(value["games"][0]["single"], false);
    }
    fn workspace() -> Workspace {
        serde_json::from_str::<Backup>(FIXTURE).unwrap().workspace
    }
    fn store() -> Store {
        Store::from_connection(Connection::open_in_memory().unwrap()).unwrap()
    }
    fn save(store: &mut Store, workspace: Workspace, revision: u64) -> Result<Snapshot> {
        store.save(SaveInput {
            expected_revision: revision,
            workspace,
            attachments: vec![],
        })
    }
    #[test]
    fn mesocycle_defaults_round_trip_and_dangling_references_roll_back() {
        let mut data = serde_json::from_str::<serde_json::Value>(FIXTURE).unwrap();
        let template_id = data["workspace"]["templates"][0]["id"].clone();
        data["workspace"]["cycles"][0]["mesocycles"][0]["defaultTemplateId"] = template_id.clone();
        let mut store = store();
        let saved = store.restore(&data.to_string(), 0).unwrap();
        assert_eq!(
            saved.workspace.cycles[0].mesocycles[0]
                .default_template_id
                .as_deref(),
            template_id.as_str()
        );
        let backup = store.backup().unwrap();
        store.restore(&backup, 1).unwrap();
        assert_eq!(store.backup().unwrap(), backup);
        let mut invalid = store.load().unwrap().workspace;
        invalid.cycles[0].mesocycles[0].default_template_id = Some("missing".into());
        assert!(save(&mut store, invalid, 2).is_err());
        assert_eq!(store.load().unwrap().revision, 2);
        assert_eq!(store.backup().unwrap(), backup);
        data["workspace"]["cycles"][0]["mesocycles"][0]
            .as_object_mut()
            .unwrap()
            .remove("defaultTemplateId");
        let old = store.restore(&data.to_string(), 2).unwrap();
        assert!(
            old.workspace.cycles[0].mesocycles[0]
                .default_template_id
                .is_none()
        );
    }

    #[test]
    fn mesocycle_colors_persist_and_restore_with_compatible_defaults() {
        for color in ["grey", "lightGreen", "darkGreen", "blue", "orange", "red"] {
            let mut data = serde_json::from_str::<serde_json::Value>(FIXTURE).unwrap();
            data["workspace"]["cycles"][0]["mesocycles"][0]["color"] = color.into();
            let mut store = store();
            store.restore(&data.to_string(), 0).unwrap();
            let saved =
                serde_json::from_str::<serde_json::Value>(&store.backup().unwrap()).unwrap();
            assert_eq!(
                saved["workspace"]["cycles"][0]["mesocycles"][0]["color"],
                color
            );
            let backup = store.backup().unwrap();
            store.restore(&backup, 1).unwrap();
            assert_eq!(store.backup().unwrap(), backup);
        }
        let mut old = serde_json::from_str::<serde_json::Value>(FIXTURE).unwrap();
        for phase in old["workspace"]["cycles"][0]["mesocycles"]
            .as_array_mut()
            .unwrap()
        {
            phase.as_object_mut().unwrap().remove("color");
        }
        let mut store = store();
        let restored = store.restore(&old.to_string(), 0).unwrap();
        assert!(
            restored.workspace.cycles[0]
                .mesocycles
                .iter()
                .all(|m| m.color == MesoCycleColor::Grey)
        );
        for invalid_color in [serde_json::json!("purple"), serde_json::Value::Null] {
            old["workspace"]["cycles"][0]["mesocycles"][0]["color"] = invalid_color;
            assert!(store.restore(&old.to_string(), 1).is_err());
            assert_eq!(store.load().unwrap().revision, 1);
        }
    }

    #[test]
    fn session_type_colors_default_for_old_data_and_reject_invalid_maps_atomically() {
        let mut old = serde_json::from_str::<serde_json::Value>(FIXTURE).unwrap();
        old["workspace"]
            .as_object_mut()
            .unwrap()
            .remove("sessionTypeColors");
        let mut store = store();
        let restored = store.restore(&old.to_string(), 0).unwrap();
        assert_eq!(
            restored.workspace.session_type_colors,
            default_session_type_colors()
        );
        let backup = store.backup().unwrap();
        store.restore(&backup, 1).unwrap();
        assert_eq!(store.backup().unwrap(), backup);

        for invalid in [
            serde_json::json!({"BAT": "#155fa0"}),
            serde_json::json!({
                "BAT": "#155fa0", "ET": "#2f80c3", "LK": "#c62828", "BAT-WE": "#5c6bc0",
                "ZPT": "#d04a76", "KNT": "#d98928", "KT": "#4f9c55", "AT": "#6aa84f",
                "MT": "#7b61a8", "M-T": "#777d84", "GT": "#7cb9e8", "KAT": "not-a-colour"
            }),
            serde_json::json!({"unknown": "#ffffff"}),
        ] {
            old["workspace"]["sessionTypeColors"] = invalid;
            assert!(store.restore(&old.to_string(), 2).is_err());
            assert_eq!(store.load().unwrap().revision, 2);
            assert_eq!(store.backup().unwrap(), backup);
        }
    }

    #[test]
    fn additional_session_types_survive_storage_and_backup_restore() {
        for session_type in ["KAT", "KT", "KNT"] {
            let mut backup = serde_json::from_str::<serde_json::Value>(FIXTURE).unwrap();
            backup["workspace"]["cycles"][0]["slots"][0]["sessionType"] = session_type.into();
            backup["workspace"]["cycles"][0]["sessions"][0]["sessionType"] = session_type.into();
            backup["workspace"]["templates"][0]["sessionType"] = session_type.into();
            let mut original = store();
            original.restore(&backup.to_string(), 0).unwrap();
            let workspace = serde_json::to_value(original.load().unwrap().workspace).unwrap();
            assert_eq!(workspace, backup["workspace"]);
            let mut restored = store();
            restored.restore(&original.backup().unwrap(), 0).unwrap();
            assert_eq!(
                serde_json::to_value(restored.load().unwrap().workspace).unwrap(),
                workspace
            );
        }
    }

    #[test]
    fn block_material_defaults_for_old_backups_and_rejects_invalid_values() {
        let mut backup = serde_json::from_str::<serde_json::Value>(FIXTURE).unwrap();
        let block = &mut backup["workspace"]["cycles"][0]["sessions"][0]["contents"][0];
        block.as_object_mut().unwrap().remove("material");
        let mut original = store();
        let restored = original.restore(&backup.to_string(), 0).unwrap();
        assert_eq!(
            restored.workspace.cycles[0].sessions[0].contents[0].material,
            ""
        );
        for invalid_material in [serde_json::Value::Null, serde_json::json!(42)] {
            backup["workspace"]["cycles"][0]["sessions"][0]["contents"][0]["material"] =
                invalid_material;
            assert!(original.restore(&backup.to_string(), 1).is_err());
            assert_eq!(original.load().unwrap().revision, 1);
        }
    }

    #[test]
    fn block_goals_default_for_old_backups_and_reject_overlong_values() {
        let mut backup = serde_json::from_str::<serde_json::Value>(FIXTURE).unwrap();
        let block = &mut backup["workspace"]["cycles"][0]["sessions"][0]["contents"][0];
        block.as_object_mut().unwrap().remove("goals");
        let mut original = store();
        let restored = original.restore(&backup.to_string(), 0).unwrap();
        assert_eq!(
            restored.workspace.cycles[0].sessions[0].contents[0].goals,
            ""
        );
        backup["workspace"]["cycles"][0]["sessions"][0]["contents"][0]["goals"] =
            "a".repeat(301).into();
        assert!(original.restore(&backup.to_string(), 1).is_err());
        assert_eq!(original.load().unwrap().revision, 1);
    }

    #[test]
    fn block_notes_accept_400_unicode_characters_and_reject_401_without_mutating() {
        let mut backup = serde_json::from_str::<serde_json::Value>(FIXTURE).unwrap();
        let notes = "ä".repeat(400);
        backup["workspace"]["cycles"][0]["sessions"][0]["contents"][0]["notes"] =
            notes.clone().into();
        let mut original = store();
        let restored = original.restore(&backup.to_string(), 0).unwrap();
        assert_eq!(
            restored.workspace.cycles[0].sessions[0].contents[0].notes,
            notes
        );

        backup["workspace"]["cycles"][0]["sessions"][0]["contents"][0]["notes"] =
            "ä".repeat(401).into();
        assert!(original.restore(&backup.to_string(), 1).is_err());
        assert_eq!(original.load().unwrap().revision, 1);
        assert_eq!(
            original.load().unwrap().workspace.cycles[0].sessions[0].contents[0].notes,
            "ä".repeat(400)
        );
    }

    #[test]
    fn pause_blocks_survive_storage_backup_and_restore() {
        let mut data = workspace();
        data.cycles[0].sessions[0].contents[0].category = "Pause".into();
        data.cycles[0].sessions[0].contents[0].content = "Trinkpause".into();
        data.cycles[0].sessions[0].contents[0].areas.clear();
        data.templates[0].contents[0].category = "Pause".into();
        let mut original = store();
        save(&mut original, data, 0).unwrap();
        let mut restored = store();
        let snapshot = restored.restore(&original.backup().unwrap(), 0).unwrap();
        assert_eq!(
            snapshot.workspace.cycles[0].sessions[0].contents[0].category,
            "Pause"
        );
        assert_eq!(
            snapshot.workspace.templates[0].contents[0].category,
            "Pause"
        );
        assert_eq!(original.backup().unwrap(), restored.backup().unwrap());
    }

    #[test]
    fn shared_contract_round_trip_is_exact() {
        for fixture in [
            FIXTURE,
            include_str!("../../fixtures/workspace-regeneration.json"),
        ] {
            let backup: Backup = serde_json::from_str(fixture).unwrap();
            validate(&backup.workspace).unwrap();
            assert_eq!(
                serde_json::to_value(backup).unwrap(),
                serde_json::from_str::<serde_json::Value>(fixture).unwrap()
            );
        }
    }
    #[test]
    fn generation_baselines_round_trip_reopen_and_restore_without_fabricating_history() {
        let mut data = serde_json::from_str::<serde_json::Value>(FIXTURE).unwrap();
        let session = &mut data["workspace"]["cycles"][0]["sessions"][0];
        let mut baseline = serde_json::Map::new();
        for key in [
            "date",
            "startTime",
            "plannedDuration",
            "name",
            "mesoCycleId",
            "sessionType",
            "reduced",
            "volume",
            "intensity",
            "competitionSpecificity",
            "contents",
        ] {
            baseline.insert(key.into(), session[key].clone());
        }
        // Former phase references are historical, and snapshot content IDs are not live entities.
        baseline.insert("mesoCycleId".into(), "former-phase".into());
        session["generationBaseline"] = baseline.into();
        let directory =
            std::env::temp_dir().join(format!("ankerzug-regeneration-{}", std::process::id()));
        std::fs::create_dir_all(&directory).unwrap();
        let database = directory.join("plan.db");
        let original;
        {
            let mut store = Store::open(&database).unwrap();
            store.restore(&data.to_string(), 0).unwrap();
            original = store.backup().unwrap();
            assert_eq!(
                serde_json::from_str::<serde_json::Value>(&original).unwrap(),
                data
            );
        }
        {
            let mut store = Store::open(&database).unwrap();
            assert_eq!(store.backup().unwrap(), original);
            store.restore(FIXTURE, 1).unwrap();
            assert!(
                store.load().unwrap().workspace.cycles[0].sessions[0]
                    .generation_baseline
                    .is_none()
            );
            store.recover(2).unwrap();
            assert_eq!(store.backup().unwrap(), original);
            let revision = store.load().unwrap().revision;
            for (key, value) in [
                ("date", serde_json::json!("2026-02-30")),
                ("startTime", serde_json::json!("25:00")),
                ("volume", serde_json::json!(6)),
                ("plannedDuration", serde_json::json!(0)),
            ] {
                let mut invalid = data.clone();
                invalid["workspace"]["cycles"][0]["sessions"][0]["generationBaseline"][key] = value;
                assert!(store.restore(&invalid.to_string(), revision).is_err());
                assert_eq!(store.load().unwrap().revision, revision);
                assert_eq!(store.backup().unwrap(), original);
            }
            let mut stale = store.load().unwrap().workspace;
            stale.cycles[0].sessions[0].name = "Stale regeneration".into();
            assert!(matches!(
                save(&mut store, stale, revision - 1).unwrap_err().code,
                ErrorCode::Conflict
            ));
            assert_eq!(store.backup().unwrap(), original);
        }
        std::fs::remove_dir_all(directory).unwrap();
    }
    #[test]
    fn renamed_arrow_count_keeps_optional_integer_bounds() {
        for value in [None, Some(0), Some(80), Some(100)] {
            let mut data = workspace();
            data.cycles[0].mesocycles[0].legacy_arrow_count = value;
            validate(&data).unwrap();
        }
        let mut data = workspace();
        data.cycles[0].mesocycles[0].legacy_arrow_count = Some(101);
        assert!(validate(&data).is_err());
        for value in ["-1", "0.5"] {
            assert!(
                serde_json::from_str::<Backup>(&FIXTURE.replace(
                    "\"legacyArrowCount\": 80",
                    &format!("\"arrowCount\": {value}")
                ))
                .is_err()
            );
        }
    }
    #[test]
    fn creation_update_and_owned_deletion_are_atomic() {
        let mut store = store();
        assert_eq!(store.load().unwrap().revision, 0);
        save(&mut store, workspace(), 0).unwrap();
        let mut state = store.load().unwrap();
        state.workspace.cycles[0].name = "Changed".into();
        state.workspace.cycles[0].sessions[0].name = "Technik und Scoring".into();
        state.workspace.cycles[0].mesocycles[0].legacy_arrow_count = Some(100);
        save(&mut store, state.workspace, 1).unwrap();
        let saved = store.load().unwrap();
        assert_eq!(saved.workspace.cycles[0].name, "Changed");
        assert_eq!(
            saved.workspace.cycles[0].sessions[0].name,
            "Technik und Scoring"
        );
        assert_eq!(
            saved.workspace.cycles[0].mesocycles[0].legacy_arrow_count,
            Some(100)
        );
        let mut state = store.load().unwrap();
        state.workspace.cycles.clear();
        save(&mut store, state.workspace, 2).unwrap();
        let state = store.load().unwrap();
        assert!(state.workspace.cycles.is_empty());
        assert_eq!(state.workspace.templates.len(), 1);
    }
    #[test]
    fn invalid_references_and_duplicate_origins_do_not_modify_storage() {
        let mut store = store();
        save(&mut store, workspace(), 0).unwrap();
        let mut data = workspace();
        data.cycles[0].sessions[0].meso_cycle_id = Some("missing".into());
        assert!(save(&mut store, data, 1).is_err());
        let mut data = workspace();
        let mut duplicate = data.cycles[0].sessions[0].clone();
        duplicate.id = "different".into();
        duplicate.contents.clear();
        data.cycles[0].sessions.push(duplicate);
        assert!(save(&mut store, data, 1).is_err());
        assert_eq!(store.load().unwrap().revision, 1);
    }
    #[test]
    fn stale_writes_are_conflicts() {
        let mut store = store();
        save(&mut store, workspace(), 0).unwrap();
        assert!(matches!(
            save(&mut store, workspace(), 0).unwrap_err().code,
            ErrorCode::Conflict
        ));
        assert_eq!(store.load().unwrap().revision, 1);
    }
    #[test]
    fn backup_restore_preserves_complete_data_and_retains_previous_document() {
        let mut store = store();
        save(&mut store, workspace(), 0).unwrap();
        let backup = store.backup().unwrap();
        save(&mut store, Workspace::default(), 1).unwrap();
        let restored = store.restore(&backup, 2).unwrap();
        assert_eq!(restored.workspace.cycles.len(), 1);
        assert_eq!(
            store
                .connection
                .query_row("SELECT count(*) FROM recovery", [], |r| r.get::<_, u32>(0))
                .unwrap(),
            1
        );
        assert_eq!(
            serde_json::from_str::<serde_json::Value>(&store.backup().unwrap()).unwrap(),
            serde_json::from_str::<serde_json::Value>(FIXTURE).unwrap()
        );
    }

    #[test]
    fn recovery_is_accessible_and_preserves_current_state_in_turn() {
        let mut store = store();
        assert!(store.recover(0).is_err());
        save(&mut store, workspace(), 0).unwrap();
        let empty = serde_json::to_string(&Backup {
            format_version: 2,
            workspace: Workspace::default(),
        })
        .unwrap();
        store.restore(&empty, 1).unwrap();
        assert!(store.load().unwrap().workspace.cycles.is_empty());
        store.recover(2).unwrap();
        assert_eq!(store.load().unwrap().workspace.cycles.len(), 1);
        store.recover(3).unwrap();
        assert!(store.load().unwrap().workspace.cycles.is_empty());
    }

    #[test]
    fn malformed_backups_leave_existing_data_unchanged() {
        let mut store = store();
        save(&mut store, workspace(), 0).unwrap();
        for data in [
            "{}".to_string(),
            FIXTURE.replace("\"legacyArrowCount\": 80", "\"arrowCount\": 101"),
            FIXTURE.replace("\"type\": \"VP2\"", "\"type\": \"unknown\""),
            FIXTURE.replace("2026-09-29", "2026-02-30"),
        ] {
            assert!(store.restore(&data, 1).is_err());
        }
        assert_eq!(store.load().unwrap().revision, 1);
    }
    #[test]
    fn failed_restore_rolls_back_recovery_and_document_together() {
        let mut store = store();
        save(&mut store, workspace(), 0).unwrap();
        store.connection.execute_batch("CREATE TRIGGER fail_write BEFORE UPDATE ON documents BEGIN SELECT RAISE(ABORT, 'simulated disk failure'); END;").unwrap();
        assert!(store.restore(FIXTURE, 1).is_err());
        assert_eq!(store.load().unwrap().revision, 1);
        assert_eq!(
            store
                .connection
                .query_row("SELECT count(*) FROM recovery", [], |r| r.get::<_, u32>(0))
                .unwrap(),
            0
        );
    }
    #[test]
    fn corrupt_stored_values_produce_mapping_errors() {
        let mut store = store();
        save(&mut store, workspace(), 0).unwrap();
        store
            .connection
            .execute("UPDATE documents SET payload='{}'", [])
            .unwrap();
        assert!(matches!(
            store.load().unwrap_err().code,
            ErrorCode::InvalidStoredValue
        ));
    }
    #[test]
    fn disk_reopen_and_schema_version_preserve_edits() {
        let path = std::env::temp_dir().join(format!(
            "ankerzug-test-{}-{}.sqlite3",
            std::process::id(),
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        {
            let mut store = Store::open(&path).unwrap();
            let mut data = workspace();
            data.cycles[0].sessions[0].contents[0].material = "Bogen, Theraband".into();
            data.cycles[0].sessions[0].contents[0].content =
                "Technik\nAnkerpunkt stabilisieren".into();
            data.templates[0].contents[0].material = "Scheibe".into();
            save(&mut store, data, 0).unwrap();
        }
        {
            let store = Store::open(&path).unwrap();
            let data = store.load().unwrap().workspace;
            assert_eq!(
                data.cycles[0].sessions[0].contents[0].material,
                "Bogen, Theraband"
            );
            assert_eq!(
                data.cycles[0].sessions[0].contents[0].content,
                "Technik\nAnkerpunkt stabilisieren"
            );
            assert_eq!(data.templates[0].contents[0].material, "Scheibe");
            let mut restored = self::store();
            restored.restore(&store.backup().unwrap(), 0).unwrap();
            assert_eq!(restored.backup().unwrap(), store.backup().unwrap());
            assert_eq!(
                store.load().unwrap().workspace.cycles[0].name,
                "Hallensaison 2026"
            );
            assert_eq!(
                store
                    .connection
                    .query_row("PRAGMA user_version", [], |r| r.get::<_, u32>(0))
                    .unwrap(),
                5
            );
        }
        std::fs::remove_file(path).unwrap();
    }

    #[test]
    fn backup_restores_after_database_reset_and_rejects_unknown_format_version() {
        let path = std::env::temp_dir().join(format!(
            "ankerzug-reset-{}-{}.sqlite3",
            std::process::id(),
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        let expected = workspace();
        let (backup, unsupported_backup) = {
            let mut store = Store::open(&path).unwrap();
            save(&mut store, expected.clone(), 0).unwrap();
            let backup = store.backup().unwrap();
            let unsupported = backup.replace("\"formatVersion\": 2", "\"formatVersion\": 999");
            (backup, unsupported)
        };

        std::fs::remove_file(&path).unwrap();

        let mut restored = Store::open(&path).unwrap();
        assert_eq!(
            restored
                .connection
                .query_row("PRAGMA user_version", [], |row| row.get::<_, u32>(0))
                .unwrap(),
            5
        );
        let snapshot = restored.restore(&backup, 0).unwrap();
        assert_eq!(
            to_payload(&snapshot.workspace).unwrap(),
            to_payload(&expected).unwrap()
        );
        assert_eq!(snapshot.revision, 1);
        assert!(restored.restore(&unsupported_backup, 1).is_err());
        drop(restored);
        std::fs::remove_file(path).unwrap();
    }

    #[test]
    fn unknown_future_schema_is_not_reset() {
        let connection = Connection::open_in_memory().unwrap();
        connection.execute_batch("PRAGMA user_version=6").unwrap();
        assert!(Store::from_connection(connection).is_err());
    }
    #[test]
    fn date_time_and_integer_boundaries_are_structural() {
        assert!(valid_date("2024-02-29"));
        for date in [
            "2026-02-29",
            "2026-02-30",
            "0000-01-01",
            "2026-13-01",
            "６６６６-01-01",
        ] {
            assert!(!valid_date(date));
        }
        assert!(valid_time("23:59"));
        for time in ["24:00", "18:60", "6:00", "１８:00"] {
            assert!(!valid_time(time));
        }
        assert!(
            serde_json::from_str::<Backup>(
                &FIXTURE.replace("\"durationMinutes\": 30", "\"durationMinutes\": -1")
            )
            .is_err()
        );
    }
}
