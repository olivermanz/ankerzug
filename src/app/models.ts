export const MESOCYCLE_COLORS = {
  grey: 'Grau',
  lightGreen: 'Hellgrün',
  darkGreen: 'Dunkelgrün',
  blue: 'Blau',
  orange: 'Orange',
  red: 'Rot',
} as const;
export type MesoCycleColor = keyof typeof MESOCYCLE_COLORS;

/** A persisted phase code. Codes are deliberately open so clubs can add VP3 or WP2. */
export type PhaseType = string;
export type PhaseRole = 'preparation' | 'work' | 'peak' | 'transition';
export interface PhaseCapabilities {
  proposal: boolean;
  targetCompetition: boolean;
  specificContentWarning: boolean;
  volumeDeclineWarning: boolean;
}
export type Policy = 'normal' | 'reduced' | 'suspended' | 'camp' | 'unchanged';
export type PeriodType = 'school' | 'holiday' | 'camp' | 'unavailable' | 'reduced' | 'other';
export interface Competition {
  id: string;
  name: string;
  date: string;
  priority: 'A' | 'B' | 'C';
  location: string;
}
export interface Content {
  gameId?: string | null;
  id: string;
  startOffsetMinutes: number;
  durationMinutes: number;
  goals: string;
  content: string;
  material: string;
  category: string;
  areas: Area[];
  subcategory: string;
  plannedArrowCount: number | null;
  actualArrowCount: number | null;
  actualDuration: number | null;
  plannedLoad: number | null;
  actualLoad: number | null;
  exerciseReference: string;
  notes: string;
}
export interface MesoCycle {
  defaultTemplateId?: string | null;
  id: string;
  name: string;
  startDate: string;
  endDate: string;
  type: PhaseType;
  color: MesoCycleColor;
  legacyArrowCount: number | null;
  sequenceNumber: number | null;
  targetCompetitionId: string | null;
  volume: number | null;
  intensity: number | null;
  competitionSpecificity: number | null;
  description: string;
  technicalPriority: string;
  physicalPriority: string;
  mentalPriority: string;
}
export interface SpecialPeriod {
  id: string;
  name: string;
  startDate: string;
  endDate: string;
  type: PeriodType;
  trainingPolicy: Policy;
  retainedSlotIds: string[] | null;
  durationPercent: number | null;
}
export interface TrainingSlot {
  id: string;
  name: string;
  sessionType: SessionType;
  campOnly: boolean;
  weekday: number;
  startTime: string;
  defaultDuration: number;
  location: string;
  validFrom: string;
  validUntil: string;
}
export interface Session {
  generationBaseline?: GenerationBaseline | null;
  id: string;
  name: string;
  mesoCycleId: string | null;
  sourceTrainingSlotId: string | null;
  occurrenceKey: string;
  date: string;
  startTime: string;
  plannedDuration: number;
  notes: string;
  status: 'planned' | 'completed' | 'cancelled' | 'moved';
  sessionType: SessionType;
  areas: Area[];
  volume: number | null;
  intensity: number | null;
  competitionSpecificity: number | null;
  plannedArrowCount: number | null;
  actualArrowCount: number | null;
  actualDuration: number | null;
  subjectiveLoad: number | null;
  originalPlan: { duration: number; arrows: number | null; partialArrows: number } | null;
  suggestionDecision: SuggestionDecision | null;
  manuallyModified: boolean;
  individuallyPlanned: boolean;
  reduced: boolean;
  contents: Content[];
}
export interface GenerationBaseline {
  date: string;
  startTime: string;
  plannedDuration: number;
  name: string;
  mesoCycleId: string | null;
  sessionType: SessionType;
  reduced: boolean;
  volume: number | null;
  intensity: number | null;
  competitionSpecificity: number | null;
  contents: Content[];
}
export interface RegenerationRow {
  key: string;
  kind: 'add' | 'update' | 'remove' | 'unchanged' | 'excluded' | 'conflict';
  before: Session | null;
  after: Session | null;
  reason: string;
  choice: 'keep' | 'apply' | 'remove' | 'unresolved';
  canApply: boolean;
}
export interface RegenerationPreview {
  source: string;
  rows: RegenerationRow[];
}
export interface MacroCycle {
  id: string;
  name: string;
  startDate: string;
  athlete: string;
  discipline: string;
  ageClass: string;
  goal: string;
  endDate: string;
  mainCompetitionId: string;
  competitions: Competition[];
  planning: PlanningConfiguration;
  // Retired editor records retained for storage, backup and planning compatibility.
  weeks: WeeklyRecord[];
  // Retired structured goals retain their references through existing plan operations.
  goals: TrainingGoal[];
  warningDecisions: string[];
  migrationNotes: string[];
  mesocycles: MesoCycle[];
  periods: SpecialPeriod[];
  slots: TrainingSlot[];
  sessions: Session[];
  exclusions: string[];
}
export interface Template {
  sessionType: SessionType;
  areas: Area[];
  volume: number | null;
  intensity: number | null;
  competitionSpecificity: number | null;
  id: string;
  name: string;
  description: string;
  defaultDuration: number;
  contents: Content[];
}
export interface GameAttachment {
  id: string;
  filename: string;
  bytes?: number[];
}
export interface Game {
  id: string;
  name: string;
  single: boolean;
  team: boolean;
  effort: number;
  fun: number;
  duration: number;
  competitionProximity: number;
  description: string;
  attachments: GameAttachment[];
}
export interface Workspace {
  games?: Game[];
  cycles: MacroCycle[];
  templates: Template[];
  planningTemplate?: PlanningConfiguration;
  sessionTypeColors?: SessionTypeColors;
}
export interface Snapshot {
  revision: number;
  workspace: Workspace;
}
export interface SaveInput {
  expectedRevision: number;
  workspace: Workspace;
  attachments?: Array<{ id: string; bytes: number[] }>;
}
export interface Backup {
  formatVersion: 2;
  workspace: Workspace;
}
export interface AppError {
  code: 'invalidInput' | 'conflict' | 'storage' | 'invalidStoredValue';
  message: string;
}
export interface Occurrence {
  key: string;
  slotId: string;
  date: string;
  startTime: string;
  duration: number;
  location: string;
  slotName: string;
  mesoCycleId: string | null;
  ambiguous: boolean;
  periods: SpecialPeriod[];
  selected: boolean;
  reduced: boolean;
  sessionType: SessionType;
  applyProfile: boolean;
  profile: PhaseProfile;
}
export const PHASES: Record<string, string> = {
  VP1: 'VP1 · Vorbereitungsphase 1',
  VP2: 'VP2 · Vorbereitungsphase 2',
  WP: 'WP · Wettkampfphase',
  UWV: 'UWV · Unmittelbare Wettkampfvorbereitung',
  UEP: 'UEP · Übergangsphase',
};
export const POLICIES: Record<Policy, string> = {
  normal: 'Training normal',
  reduced: 'Training reduzieren',
  suspended: 'Training aussetzen',
  camp: 'Trainingslager / mehr Training',
  unchanged: 'Keine automatische Änderung',
};
export const PERIOD_TYPES: Record<PeriodType, string> = {
  school: 'Schulferien',
  holiday: 'Urlaub',
  camp: 'Trainingslager',
  unavailable: 'Kein Training möglich',
  reduced: 'Reduziertes Training',
  other: 'Sonderzeitraum',
};
export const CATEGORIES = [
  'Spiel',
  'Pause',
  'Aufwärmen',
  'Einschießen',
  'Technik',
  'Volumentraining',
  'Kraft / spezifische Kraft',
  'Koordination',
  'Scoring',
  'Wettkampfsimulation',
  'Matchplay / Duelle',
  'Mentaltraining',
  'Blank Bale / Scheibe ohne Wertung',
  'Material / Tuning',
  'Cool-down',
  'Regeneration',
  'Sonstiges',
];
export const WEEKDAYS = [
  'Sonntag',
  'Montag',
  'Dienstag',
  'Mittwoch',
  'Donnerstag',
  'Freitag',
  'Samstag',
];
export const id = (): string => crypto.randomUUID();

export const AREAS = [
  'SCHIESSTECHNIK',
  'ATHLETIK',
  'WETTKAMPFMANAGEMENT',
  'MENTAL',
  'MATERIAL',
  'REGENERATION',
  'DIAGNOSTIK',
] as const;
export type Area = (typeof AREAS)[number];
export const SESSION_TYPES = [
  'BAT',
  'ET',
  'LK',
  'BAT-WE',
  'ZPT',
  'KNT',
  'KT',
  'AT',
  'MT',
  'M-T',
  'GT',
  'KAT',
] as const;
export type SessionType = (typeof SESSION_TYPES)[number];
export const SELECTABLE_SESSION_TYPES = SESSION_TYPES;
export type SessionTypeColors = Record<SessionType, string>;
export const DEFAULT_SESSION_TYPE_COLORS: SessionTypeColors = {
  BAT: '#155fa0',
  ET: '#2f80c3',
  LK: '#c62828',
  'BAT-WE': '#5c6bc0',
  ZPT: '#d04a76',
  KNT: '#d98928',
  KT: '#4f9c55',
  AT: '#6aa84f',
  MT: '#7b61a8',
  'M-T': '#777d84',
  GT: '#7cb9e8',
  KAT: '#c65b32',
};
export function defaultSessionTypeColors(): SessionTypeColors {
  return { ...DEFAULT_SESSION_TYPE_COLORS };
}
/** Supplies compatibility defaults only when the complete persisted map is absent. */
export function normalizeSessionTypeColors(value: unknown): SessionTypeColors {
  return value && typeof value === 'object'
    ? (value as SessionTypeColors)
    : defaultSessionTypeColors();
}
export const WEEK_PROFILES = [
  'BUILD',
  'LOAD',
  'PEAK_LOAD',
  'RECOVERY',
  'TAPER',
  'COMPETITION',
  'TRANSITION',
] as const;
export type WeekProfile = (typeof WEEK_PROFILES)[number];
export interface WeeklyRecord {
  monday: string;
  profile: WeekProfile | null;
}
export interface SuggestionDecision {
  context: string;
  state: 'applied' | 'dismissed';
}
export interface PhaseProfile {
  volume: number | null;
  intensity: number | null;
  competitionSpecificity: number | null;
}
export interface PhaseDefinition {
  code: PhaseType;
  label: string;
  displayOrder: number;
  proposalOrder: number;
  role: PhaseRole;
  proposalWeight: number;
  profile: PhaseProfile;
  capabilities: PhaseCapabilities;
  maxDays: number | null;
}
export interface PlanningConfiguration {
  phases?: PhaseDefinition[];
  /** Read-only compatibility fields accepted before normalization. */
  weights?: { VP1: number; VP2: number; WP: number; UWV: number };
  uwvDays?: number;
  profiles?: Record<string, PhaseProfile>;
  shortCycleDays: number;
  closePeakDays: number;
  hardIntensity: number;
  consecutiveHardSessions: number;
  loadRisePercent: number;
  loadRiseWeeks: number;
  recoveryLookbackDays: number;
  longSeasonDays: number;
}
export interface TrainingGoal {
  id: string;
  scope: 'macrocycle' | 'mesocycle' | 'week' | 'session';
  reference: string;
  description: string;
  category: Area;
  targetValue: number | null;
  unit: string;
  status: 'open' | 'achieved' | 'abandoned';
}
export const MAX_INTEGER = 4294967295;
export const mainCompetition = (cycle: MacroCycle): Competition => {
  const competition = cycle.competitions.find((c) => c.id === cycle.mainCompetitionId);
  if (!competition) throw new Error('Hauptwettkampf fehlt.');
  return competition;
};
export function defaultPlanning(): PlanningConfiguration {
  return {
    phases: defaultPhaseCatalog(),
    shortCycleDays: 42,
    closePeakDays: 42,
    hardIntensity: 4,
    consecutiveHardSessions: 3,
    loadRisePercent: 20,
    loadRiseWeeks: 3,
    recoveryLookbackDays: 21,
    longSeasonDays: 180,
  };
}
export function defaultPhaseCatalog(): PhaseDefinition[] {
  const capabilities = (overrides: Partial<PhaseCapabilities> = {}): PhaseCapabilities => ({
    proposal: true,
    targetCompetition: false,
    specificContentWarning: false,
    volumeDeclineWarning: false,
    ...overrides,
  });
  return [
    {
      code: 'VP1',
      label: PHASES.VP1,
      displayOrder: 1,
      proposalOrder: 1,
      role: 'preparation',
      proposalWeight: 2,
      profile: { volume: 3, intensity: 2, competitionSpecificity: 1 },
      capabilities: capabilities(),
      maxDays: null,
    },
    {
      code: 'VP2',
      label: PHASES.VP2,
      displayOrder: 2,
      proposalOrder: 2,
      role: 'preparation',
      proposalWeight: 3,
      profile: { volume: 4, intensity: 4, competitionSpecificity: 3 },
      capabilities: capabilities(),
      maxDays: null,
    },
    {
      code: 'WP',
      label: PHASES.WP,
      displayOrder: 3,
      proposalOrder: 3,
      role: 'work',
      proposalWeight: 2,
      profile: { volume: 3, intensity: 3, competitionSpecificity: 4 },
      capabilities: capabilities({ specificContentWarning: true }),
      maxDays: null,
    },
    {
      code: 'UWV',
      label: PHASES.UWV,
      displayOrder: 4,
      proposalOrder: 4,
      role: 'peak',
      proposalWeight: 1,
      profile: { volume: 1, intensity: 2, competitionSpecificity: 5 },
      capabilities: capabilities({
        targetCompetition: true,
        specificContentWarning: true,
        volumeDeclineWarning: true,
      }),
      maxDays: 14,
    },
    {
      code: 'UEP',
      label: PHASES.UEP,
      displayOrder: 5,
      proposalOrder: 5,
      role: 'transition',
      proposalWeight: 1,
      profile: { volume: 1, intensity: 1, competitionSpecificity: 1 },
      capabilities: capabilities(),
      maxDays: null,
    },
  ];
}
export function phaseFor(
  config: PlanningConfiguration,
  code: PhaseType,
): PhaseDefinition | undefined {
  return config.phases?.find((phase) => phase.code === code);
}
/** Converts the v2 fixed-record contract before validation or persistence. */
export function normalizePlanning(value: unknown): PlanningConfiguration {
  const input = value as Record<string, unknown>;
  if (Array.isArray(input?.['phases'])) {
    const planning = value as PlanningConfiguration;
    planning.phases?.forEach((phase) => {
      delete (phase.capabilities as unknown as Record<string, unknown>)['simulationWarning'];
      delete (phase as unknown as Record<string, unknown>)['simulationPercent'];
    });
    return planning;
  }
  const legacy = input ?? {};
  const profiles = (legacy['profiles'] ?? {}) as Record<string, PhaseProfile>;
  const weights = (legacy['weights'] ?? {}) as Record<string, number>;
  const planning = defaultPlanning();
  planning.phases!.forEach((phase) => {
    phase.profile = profiles[phase.code] ?? phase.profile;
    if (phase.code !== 'UEP') phase.proposalWeight = weights[phase.code] ?? phase.proposalWeight;
    if (phase.code === 'UWV') phase.maxDays = (legacy['uwvDays'] as number) ?? phase.maxDays;
  });
  for (const key of [
    'shortCycleDays',
    'closePeakDays',
    'hardIntensity',
    'consecutiveHardSessions',
    'loadRisePercent',
    'loadRiseWeeks',
    'recoveryLookbackDays',
    'longSeasonDays',
  ] as const)
    if (typeof legacy[key] === 'number') planning[key] = legacy[key] as never;
  return planning;
}

export const SESSION_TYPE_LABELS: Record<SessionType, string> = {
  BAT: 'BAT · Bewegungsablauftraining',
  ET: 'ET · Elementetraining',
  LK: 'LK · Leistungskontrolle',
  'BAT-WE': 'BAT-WE · Bewegungsablauftraining Wettkampfentfernung',
  ZPT: 'ZPT · Zielpunkttraining',
  KNT: 'KNT · Spezifische Kondition',
  KT: 'KT · Koordinationstraining',
  AT: 'AT · Athletiktraining',
  MT: 'MT · Mentaltraining',
  'M-T': 'M-T · Material/Tuning',
  GT: 'GT · Grundlagentraining',
  KAT: 'KAT · Kraftausdauertraining',
};
