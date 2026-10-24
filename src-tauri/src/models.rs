use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;

pub type PhaseType = String;

#[derive(Debug, Default, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub enum MesoCycleColor {
    #[default]
    Grey,
    LightGreen,
    DarkGreen,
    Blue,
    Orange,
    Red,
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
    B,
    C,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub enum SessionStatus {
    #[serde(rename = "planned")]
    Planned,
    #[serde(rename = "completed")]
    Completed,
    #[serde(rename = "cancelled")]
    Cancelled,
    #[serde(rename = "moved")]
    Moved,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Competition {
    pub id: String,
    pub name: String,
    pub date: String,
    pub priority: Priority,
    pub location: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Content {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub game_id: Option<String>,
    pub id: String,
    pub start_offset_minutes: u32,
    pub duration_minutes: u32,
    #[serde(default)]
    pub goals: String,
    pub content: String,
    #[serde(default)]
    pub material: String,
    pub category: String,
    pub areas: Vec<Area>,
    pub subcategory: String,
    pub planned_arrow_count: Option<u32>,
    pub actual_arrow_count: Option<u32>,
    pub actual_duration: Option<u32>,
    pub planned_load: Option<u32>,
    pub actual_load: Option<u32>,
    pub exercise_reference: String,
    pub notes: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct MesoCycle {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub default_template_id: Option<String>,
    pub id: String,
    pub name: String,
    pub start_date: String,
    pub end_date: String,
    pub r#type: PhaseType,
    #[serde(default)]
    pub color: MesoCycleColor,
    pub legacy_arrow_count: Option<u32>,
    pub sequence_number: Option<u32>,
    pub target_competition_id: Option<String>,
    pub volume: Option<u32>,
    pub intensity: Option<u32>,
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
    pub retained_slot_ids: Option<Vec<String>>,
    pub duration_percent: Option<u32>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct TrainingSlot {
    pub id: String,
    pub name: String,
    pub session_type: SessionType,
    pub camp_only: bool,
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
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub generation_baseline: Option<GenerationBaseline>,
    pub id: String,
    pub name: String,
    pub meso_cycle_id: Option<String>,
    pub source_training_slot_id: Option<String>,
    pub occurrence_key: String,
    pub date: String,
    pub start_time: String,
    pub planned_duration: u32,
    #[serde(default, skip_serializing, rename = "focus")]
    pub _focus: String,
    pub notes: String,
    pub status: SessionStatus,
    pub session_type: SessionType,
    pub areas: Vec<Area>,
    pub volume: Option<u32>,
    pub intensity: Option<u32>,
    pub competition_specificity: Option<u32>,
    pub planned_arrow_count: Option<u32>,
    pub actual_arrow_count: Option<u32>,
    pub actual_duration: Option<u32>,
    pub subjective_load: Option<u32>,
    pub original_plan: Option<OriginalPlan>,
    #[serde(default, skip_serializing, rename = "successCriteria")]
    pub _success_criteria: String,
    pub suggestion_decision: Option<SuggestionDecision>,
    pub manually_modified: bool,
    pub individually_planned: bool,
    pub reduced: bool,
    pub contents: Vec<Content>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct GenerationBaseline {
    pub date: String,
    pub start_time: String,
    pub planned_duration: u32,
    pub name: String,
    pub meso_cycle_id: Option<String>,
    pub session_type: SessionType,
    pub reduced: bool,
    #[serde(default, skip_serializing, rename = "focus")]
    pub _focus: String,
    pub volume: Option<u32>,
    pub intensity: Option<u32>,
    pub competition_specificity: Option<u32>,
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
    #[serde(default, skip_serializing, rename = "defaultSessionDuration")]
    pub _default_session_duration: u32,
    pub end_date: String,
    pub main_competition_id: String,
    pub competitions: Vec<Competition>,
    pub planning: PlanningConfiguration,
    pub weeks: Vec<WeeklyRecord>,
    pub goals: Vec<TrainingGoal>,
    pub warning_decisions: Vec<String>,
    pub migration_notes: Vec<String>,
    pub mesocycles: Vec<MesoCycle>,
    pub periods: Vec<SpecialPeriod>,
    pub slots: Vec<TrainingSlot>,
    pub sessions: Vec<Session>,
    pub exclusions: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Template {
    pub session_type: SessionType,
    pub areas: Vec<Area>,
    pub volume: Option<u32>,
    pub intensity: Option<u32>,
    pub competition_specificity: Option<u32>,
    pub id: String,
    pub name: String,
    pub description: String,
    pub default_duration: u32,
    pub contents: Vec<Content>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct GameAttachment {
    pub id: String,
    pub filename: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub bytes: Option<Vec<u8>>,
}
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Game {
    pub id: String,
    pub name: String,
    pub single: bool,
    pub team: bool,
    pub effort: u32,
    pub fun: u32,
    pub duration: u32,
    pub competition_proximity: u32,
    pub description: String,
    pub attachments: Vec<GameAttachment>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Workspace {
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub games: Vec<Game>,
    pub cycles: Vec<MacroCycle>,
    pub templates: Vec<Template>,
    #[serde(default = "default_session_type_colors")]
    pub session_type_colors: BTreeMap<SessionType, String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub planning_template: Option<PlanningConfiguration>,
}
impl Default for Workspace {
    fn default() -> Self {
        Self {
            games: vec![],
            cycles: vec![],
            templates: vec![],
            session_type_colors: default_session_type_colors(),
            planning_template: None,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Snapshot {
    pub revision: u64,
    pub workspace: Workspace,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct SaveInput {
    pub expected_revision: u64,
    pub workspace: Workspace,
    #[serde(default)]
    pub attachments: Vec<AttachmentBytes>,
}
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct AttachmentBytes {
    pub id: String,
    pub bytes: Vec<u8>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Backup {
    pub format_version: u32,
    pub workspace: Workspace,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, Hash)]
#[allow(clippy::upper_case_acronyms)]
pub enum Area {
    SCHIESSTECHNIK,
    ATHLETIK,
    WETTKAMPFMANAGEMENT,
    MENTAL,
    MATERIAL,
    REGENERATION,
    DIAGNOSTIK,
}
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, PartialOrd, Ord)]
pub enum SessionType {
    #[serde(rename = "BAT")]
    Bat,
    #[serde(rename = "ET")]
    Et,
    #[serde(rename = "LK")]
    Lk,
    #[serde(rename = "BAT-WE")]
    BatWe,
    #[serde(rename = "ZPT")]
    Zpt,
    #[serde(rename = "KNT")]
    Knt,
    #[serde(rename = "KT")]
    Kt,
    #[serde(rename = "AT")]
    At,
    #[serde(rename = "MT")]
    Mt,
    #[serde(rename = "M-T")]
    MaterialTraining,
    #[serde(rename = "GT")]
    Gt,
    #[serde(rename = "KAT")]
    Kat,
}
pub fn default_session_type_colors() -> BTreeMap<SessionType, String> {
    [
        (SessionType::Bat, "#155fa0"),
        (SessionType::Et, "#2f80c3"),
        (SessionType::Lk, "#c62828"),
        (SessionType::BatWe, "#5c6bc0"),
        (SessionType::Zpt, "#d04a76"),
        (SessionType::Knt, "#d98928"),
        (SessionType::Kt, "#4f9c55"),
        (SessionType::At, "#6aa84f"),
        (SessionType::Mt, "#7b61a8"),
        (SessionType::MaterialTraining, "#777d84"),
        (SessionType::Gt, "#7cb9e8"),
        (SessionType::Kat, "#c65b32"),
    ]
    .into_iter()
    .map(|(kind, color)| (kind, color.into()))
    .collect()
}
#[derive(Debug, Clone, Serialize, Deserialize)]
#[allow(clippy::upper_case_acronyms)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum WeekProfile {
    Build,
    Load,
    PeakLoad,
    Recovery,
    Taper,
    Competition,
    Transition,
}
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct WeeklyRecord {
    pub monday: String,
    pub profile: Option<WeekProfile>,
}
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum DecisionState {
    Applied,
    Dismissed,
}
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct SuggestionDecision {
    pub context: String,
    pub state: DecisionState,
}
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct PhaseProfile {
    pub volume: Option<u32>,
    pub intensity: Option<u32>,
    pub competition_specificity: Option<u32>,
}
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub enum PhaseRole {
    Preparation,
    Work,
    Peak,
    Transition,
}
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct PhaseCapabilities {
    pub proposal: bool,
    pub target_competition: bool,
    pub specific_content_warning: bool,
    pub volume_decline_warning: bool,
}
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct PhaseDefinition {
    pub code: String,
    pub label: String,
    pub display_order: u32,
    pub proposal_order: u32,
    pub role: PhaseRole,
    pub proposal_weight: u32,
    pub profile: PhaseProfile,
    pub capabilities: PhaseCapabilities,
    pub max_days: Option<u32>,
}
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct PlanningConfiguration {
    pub phases: Vec<PhaseDefinition>,
    pub short_cycle_days: u32,
    pub close_peak_days: u32,
    pub hard_intensity: u32,
    pub consecutive_hard_sessions: u32,
    pub load_rise_percent: u32,
    pub load_rise_weeks: u32,
    pub recovery_lookback_days: u32,
    pub long_season_days: u32,
}
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum GoalScope {
    Macrocycle,
    Mesocycle,
    Week,
    Session,
}
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum GoalStatus {
    Open,
    Achieved,
    Abandoned,
}
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct TrainingGoal {
    pub id: String,
    pub scope: GoalScope,
    pub reference: String,
    pub description: String,
    pub category: Area,
    pub target_value: Option<f64>,
    pub unit: String,
    pub status: GoalStatus,
}
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct OriginalPlan {
    pub duration: u32,
    pub partial_arrows: u32,
    pub arrows: Option<u32>,
}
