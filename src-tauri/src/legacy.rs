use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub enum PhaseType {
    #[serde(rename = "foundation")]
    Foundation,
    #[serde(rename = "build")]
    Build,
    #[serde(rename = "specific")]
    Specific,
    #[serde(rename = "realization")]
    Realization,
    #[serde(rename = "taper")]
    Taper,
    #[serde(rename = "recovery")]
    Recovery,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub enum Policy {
    #[serde(rename = "normal")]
    Normal,
    #[serde(rename = "reduced")]
    Reduced,
    #[serde(rename = "suspended")]
    Suspended,
    #[serde(rename = "camp")]
    Camp,
    #[serde(rename = "unchanged")]
    Unchanged,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub enum PeriodType {
    #[serde(rename = "school")]
    School,
    #[serde(rename = "holiday")]
    Holiday,
    #[serde(rename = "camp")]
    Camp,
    #[serde(rename = "unavailable")]
    Unavailable,
    #[serde(rename = "reduced")]
    Reduced,
    #[serde(rename = "other")]
    Other,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub enum Priority {
    #[serde(rename = "A")]
    A,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub enum SessionStatus {
    #[serde(rename = "planned")]
    Planned,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Competition {
    pub name: String,
    pub date: String,
    pub priority: Priority,
    pub location: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Content {
    pub id: String,
    pub start_offset_minutes: u32,
    pub duration_minutes: u32,
    pub content: String,
    pub category: String,
    pub notes: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct MesoCycle {
    pub id: String,
    pub name: String,
    pub start_date: String,
    pub end_date: String,
    pub r#type: PhaseType,
    pub arrow_count: Option<u32>,
    pub competition_specificity: Option<u32>,
    pub description: String,
    pub technical_priority: String,
    pub physical_priority: String,
    pub mental_priority: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct SpecialPeriod {
    pub id: String,
    pub name: String,
    pub start_date: String,
    pub end_date: String,
    pub r#type: PeriodType,
    pub training_policy: Policy,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct TrainingSlot {
    pub id: String,
    pub name: String,
    pub weekday: u32,
    pub start_time: String,
    pub default_duration: u32,
    pub location: String,
    pub valid_from: String,
    pub valid_until: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Session {
    pub id: String,
    pub name: String,
    pub meso_cycle_id: Option<String>,
    pub source_training_slot_id: Option<String>,
    pub occurrence_key: String,
    pub date: String,
    pub start_time: String,
    pub planned_duration: u32,
    pub focus: String,
    pub notes: String,
    pub status: SessionStatus,
    pub manually_modified: bool,
    pub individually_planned: bool,
    pub reduced: bool,
    pub contents: Vec<Content>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct MacroCycle {
    pub id: String,
    pub name: String,
    pub start_date: String,
    pub athlete: String,
    pub discipline: String,
    pub age_class: String,
    pub goal: String,
    pub default_session_duration: u32,
    pub competition: Competition,
    pub mesocycles: Vec<MesoCycle>,
    pub periods: Vec<SpecialPeriod>,
    pub slots: Vec<TrainingSlot>,
    pub sessions: Vec<Session>,
    pub exclusions: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Template {
    pub id: String,
    pub name: String,
    pub description: String,
    pub default_duration: u32,
    pub contents: Vec<Content>,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Workspace {
    pub cycles: Vec<MacroCycle>,
    pub templates: Vec<Template>,
}

use crate::storage::{AppError, ErrorCode, Result};
use std::collections::HashSet;
fn invalid(message: &str) -> AppError {
    AppError {
        code: ErrorCode::InvalidInput,
        message: message.into(),
    }
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
fn contents<'a>(blocks: &'a [Content], ids: &mut HashSet<&'a str>) -> Result<()> {
    const CATEGORIES: &[&str] = &[
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
            block.duration_minutes > 0
                && block
                    .start_offset_minutes
                    .checked_add(block.duration_minutes)
                    .is_some()
                && !block.content.trim().is_empty(),
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
    let mut ids = HashSet::new();
    for cycle in &workspace.cycles {
        identifier(&cycle.id, &mut ids)?;
        require(
            !cycle.name.trim().is_empty()
                && !cycle.competition.name.trim().is_empty()
                && valid_date(&cycle.start_date)
                && valid_date(&cycle.competition.date)
                && cycle.default_session_duration > 0,
            "Ungültige Makrozyklus-Stammdaten.",
        )?;
        let phase_ids: HashSet<_> = cycle.mesocycles.iter().map(|m| &m.id).collect();
        let slot_ids: HashSet<_> = cycle.slots.iter().map(|s| &s.id).collect();
        for phase in &cycle.mesocycles {
            identifier(&phase.id, &mut ids)?;
            require(
                !phase.name.trim().is_empty()
                    && valid_date(&phase.start_date)
                    && valid_date(&phase.end_date)
                    && phase.arrow_count.is_none_or(|v| v <= 100)
                    && scale(phase.competition_specificity),
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
        let mut origins = HashSet::new();
        for session in &cycle.sessions {
            identifier(&session.id, &mut ids)?;
            require(
                valid_date(&session.date)
                    && valid_time(&session.start_time)
                    && session.planned_duration > 0,
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
            !template.name.trim().is_empty() && template.default_duration > 0,
            "Ungültige Vorlage.",
        )?;
        contents(&template.contents, &mut ids)?;
    }
    Ok(())
}

/// Strict v1 reader, followed by an explicit compatibility mapping. Sports suggestions stay unset.
pub fn convert(payload: &str) -> Result<crate::models::Workspace> {
    let old: Workspace = serde_json::from_str(payload)
        .map_err(|e| invalid(&format!("Ungültige Version-1-Daten: {e}")))?;
    validate(&old)?;
    let mut value = serde_json::to_value(old).map_err(|e| invalid(&e.to_string()))?;
    let mut used = HashSet::new();
    fn collect(v: &serde_json::Value, ids: &mut HashSet<String>) {
        if let Some(o) = v.as_object() {
            if let Some(id) = o.get("id").and_then(|i| i.as_str()) {
                ids.insert(id.into());
            }
            for item in o.values() {
                collect(item, ids);
            }
        }
        if let Some(a) = v.as_array() {
            for item in a {
                collect(item, ids);
            }
        }
    }
    collect(&value, &mut used);
    for (index, cycle) in value["cycles"]
        .as_array_mut()
        .unwrap()
        .iter_mut()
        .enumerate()
    {
        let mut n = index;
        let competition_id = loop {
            let candidate = format!("migrated-main-{n}");
            if used.insert(candidate.clone()) {
                break candidate;
            }
            n += 1;
        };
        let c = cycle.as_object_mut().unwrap();
        let mut competition = c.remove("competition").unwrap();
        competition["id"] = competition_id.clone().into();
        let main_date = competition["date"].as_str().unwrap().to_string();
        let mut end = main_date.clone();
        for key in ["mesocycles", "periods", "sessions"] {
            for record in c[key].as_array().unwrap() {
                let date = record[if key == "sessions" { "date" } else { "endDate" }]
                    .as_str()
                    .unwrap();
                if date > end.as_str() {
                    end = date.into();
                }
            }
        }
        c.insert("endDate".into(), end.clone().into());
        c.insert("mainCompetitionId".into(), competition_id.clone().into());
        c.insert("competitions".into(), serde_json::json!([competition]));
        c.insert("planning".into(), serde_json::from_str(CONFIG).unwrap());
        for key in ["weeks", "goals", "warningDecisions"] {
            c.insert(key.into(), serde_json::json!([]));
        }
        let mut notes = vec!["Bestandsphasen wurden kompatibel zugeordnet; alte Pfeilwerte sind keine absoluten Ziele. Bitte Profile prüfen.".to_string()];
        if end > main_date {
            notes.push(format!(
                "Planungsende auf {end} erweitert, um Bestandsdaten zu erhalten."
            ));
        }
        c.insert("migrationNotes".into(), serde_json::json!(notes));
        let phases = c.get_mut("mesocycles").unwrap().as_array_mut().unwrap();
        for phase in phases.iter_mut() {
            let p = phase.as_object_mut().unwrap();
            let kind = match p["type"].as_str().unwrap() {
                "foundation" => "VP1",
                "build" => "VP2",
                "specific" => "WP",
                "realization" | "taper" => "UWV",
                "recovery" => "UEP",
                _ => unreachable!(),
            };
            p.insert("type".into(), kind.into());
            let arrows = p.remove("arrowCount").unwrap();
            p.insert("legacyArrowCount".into(), arrows);
            for key in ["volume", "intensity", "sequenceNumber"] {
                p.insert(key.into(), serde_json::Value::Null);
            }
            p.insert(
                "targetCompetitionId".into(),
                if kind == "UWV" {
                    competition_id.clone().into()
                } else {
                    serde_json::Value::Null
                },
            );
        }
        for kind in ["WP", "UWV"] {
            let mut order: Vec<_> = phases
                .iter()
                .enumerate()
                .filter(|(_, p)| p["type"] == kind)
                .map(|(i, p)| (i, p["startDate"].as_str().unwrap().to_string()))
                .collect();
            order.sort_by(|a, b| a.1.cmp(&b.1).then(a.0.cmp(&b.0)));
            for (sequence, (i, _)) in order.iter().enumerate() {
                phases[*i]["sequenceNumber"] = serde_json::json!(sequence + 1);
            }
        }
        for period in c.get_mut("periods").unwrap().as_array_mut().unwrap() {
            period["retainedSlotIds"] = serde_json::Value::Null;
            period["durationPercent"] = serde_json::Value::Null;
        }
        for slot in c.get_mut("slots").unwrap().as_array_mut().unwrap() {
            slot["sessionType"] = "technique".into();
            slot["campOnly"] = false.into();
        }
        for session in c.get_mut("sessions").unwrap().as_array_mut().unwrap() {
            session["sessionType"] = "technique".into();
            session["areas"] = serde_json::json!([]);
            session["successCriteria"] = "".into();
            for key in [
                "volume",
                "intensity",
                "competitionSpecificity",
                "plannedArrowCount",
                "actualArrowCount",
                "actualDuration",
                "subjectiveLoad",
                "suggestionDecision",
                "originalPlan",
            ] {
                session[key] = serde_json::Value::Null;
            }
            blocks(session["contents"].as_array_mut().unwrap());
        }
    }
    for template in value["templates"].as_array_mut().unwrap() {
        template["sessionType"] = "technique".into();
        template["areas"] = serde_json::json!([]);
        for key in ["volume", "intensity", "competitionSpecificity"] {
            template[key] = serde_json::Value::Null;
        }
        blocks(template["contents"].as_array_mut().unwrap());
    }
    crate::storage::normalize_workspace_value(&mut value);
    serde_json::from_value(value).map_err(|e| invalid(&e.to_string()))
}
fn blocks(blocks: &mut [serde_json::Value]) {
    for b in blocks {
        let category = b["category"].as_str().unwrap().to_string();
        let areas: &[&str] = match category.as_str() {
            "Einschießen" | "Technik" | "Volumentraining" | "Blank Bale / Scheibe ohne Wertung" => {
                &["SCHIESSTECHNIK"]
            }
            "Kraft / spezifische Kraft" | "Koordination" => &["ATHLETIK"],
            "Wettkampfsimulation" | "Matchplay / Duelle" => &["WETTKAMPFMANAGEMENT"],
            "Mentaltraining" => &["MENTAL"],
            "Material / Tuning" => &["MATERIAL"],
            "Cool-down" | "Regeneration" => &["REGENERATION"],
            _ => &[],
        };
        b["areas"] = serde_json::json!(areas);
        b["subcategory"] = category.into();
        b["exerciseReference"] = "".into();
        b["goals"] = "".into();
        for key in [
            "plannedArrowCount",
            "actualArrowCount",
            "actualDuration",
            "plannedLoad",
            "actualLoad",
        ] {
            b[key] = serde_json::Value::Null;
        }
    }
}
const CONFIG: &str = r#"{"weights": {"VP1": 2, "VP2": 3, "WP": 2, "UWV": 1}, "uwvDays": 14, "shortCycleDays": 42, "closePeakDays": 42, "profiles": {"VP1": {"volume": 3, "intensity": 2, "competitionSpecificity": 1}, "VP2": {"volume": 4, "intensity": 4, "competitionSpecificity": 3}, "WP": {"volume": 3, "intensity": 3, "competitionSpecificity": 4}, "UWV": {"volume": 1, "intensity": 2, "competitionSpecificity": 5}, "UEP": {"volume": 1, "intensity": 1, "competitionSpecificity": 1}}, "hardIntensity": 4, "consecutiveHardSessions": 3, "loadRisePercent": 20, "loadRiseWeeks": 3, "recoveryLookbackDays": 21, "longSeasonDays": 180, "vp1SimulationPercent":80}"#;
