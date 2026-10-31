import { gameErrors, gameReferenceErrors } from './games/games';
import {
  GenerationBaseline,
  CATEGORIES,
  MESOCYCLE_COLORS,
  AREAS,
  SESSION_TYPES,
  WEEK_PROFILES,
  MAX_INTEGER,
  mainCompetition,
  defaultPlanning,
  PhaseType,
  PhaseProfile,
  PhaseDefinition,
  phaseFor,
  normalizePlanning,
  Area,
  Content,
  id,
  MacroCycle,
  MesoCycle,
  Occurrence,
  Session,
  SessionType,
  Template,
  Workspace,
} from './models';
const DAY = 86400000;
export function validDate(date: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || date < '0001-01-01') return false;
  const time = Date.parse(date + 'T00:00:00Z');
  return Number.isFinite(time) && new Date(time).toISOString().slice(0, 10) === date;
}
export const dayNumber = (date: string): number => Date.parse(date + 'T00:00:00Z') / DAY;
export const dateAt = (day: number): string => new Date(day * DAY).toISOString().slice(0, 10);
export const dayCount = (start: string, end: string): number =>
  dayNumber(end) - dayNumber(start) + 1;
export function newCycle(planning = defaultPlanning()): MacroCycle {
  const competitionId = id();
  return {
    id: id(),
    name: '',
    startDate: '2026-09-28',
    athlete: '',
    discipline: 'Halle',
    ageClass: '',
    goal: '',
    endDate: '2026-12-06',
    mainCompetitionId: competitionId,
    planning: structuredClone(planning),
    weeks: [],
    goals: [],
    warningDecisions: [],
    migrationNotes: [],
    competitions: [
      {
        id: competitionId,
        name: '',
        date: '2026-12-06',
        priority: 'A',
        location: '',
      },
    ],
    mesocycles: [],
    periods: [],
    slots: [],
    sessions: [],
    exclusions: [],
  };
}
export function newContent(start = 0, duration = 30, text = ''): Content {
  return {
    id: id(),
    startOffsetMinutes: start,
    durationMinutes: duration,
    goals: '',
    content: text,
    material: '',
    category: '',
    areas: ['SCHIESSTECHNIK'],
    subcategory: '',
    plannedArrowCount: null,
    actualArrowCount: null,
    actualDuration: null,
    plannedLoad: null,
    actualLoad: null,
    exerciseReference: '',
    notes: '',
  };
}
export function phaseProposal(cycle: MacroCycle): MesoCycle[] {
  const errors = validateCycle(cycle);
  if (errors.length) throw new Error(errors[0]);
  const config = normalizePlanning(cycle.planning);
  const result: MesoCycle[] = [];
  const peaks = cycle.competitions
    .filter((c) => c.priority === 'A' && c.date >= cycle.startDate && c.date <= cycle.endDate)
    .sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id));
  let cursor = dayNumber(cycle.startDate);
  const append = (
    phase: PhaseDefinition,
    days: number,
    target: string | null,
    reason: string,
  ): void => {
    if (days < 1) return;
    result.push({
      id: id(),
      name: phase.label,
      startDate: dateAt(cursor),
      endDate: dateAt(cursor + days - 1),
      type: phase.code,
      color: 'grey',
      legacyArrowCount: null,
      sequenceNumber: null,
      targetCompetitionId: target,
      ...phase.profile,
      description: reason,
      technicalPriority: '',
      physicalPriority: '',
      mentalPriority: '',
    });
    cursor += days;
  };
  for (let peakIndex = 0; peakIndex < peaks.length; peakIndex++) {
    const peak = peaks[peakIndex];
    const days = dayNumber(peak.date) - cursor + 1;
    if (days <= 0) {
      // Two A events on the same day share the interval; retain both target references visibly.
      const target = [...result]
        .reverse()
        .find((m) => phaseFor(config, m.type)?.capabilities.targetCompetition);
      if (target)
        target.description += ` Gleichzeitiger A-Wettkampf: ${peak.name}; gemeinsamer Höhepunkt, Zielreferenz ${target.targetCompetitionId}.`;
      continue;
    }
    const continuation = peakIndex > 0 && days <= config.closePeakDays;
    const proposal = (config.phases ?? [])
      .filter((p) => p.capabilities.proposal)
      .sort((a, b) => a.proposalOrder - b.proposalOrder || a.displayOrder - b.displayOrder);
    const peakPhase = proposal.find((p) => p.capabilities.targetCompetition || p.role === 'peak');
    if (!peakPhase) throw new Error('Planungskonfiguration benötigt eine Höhepunktphase.');
    let phases = continuation
      ? proposal.filter((p) => p.role === 'work' || p === peakPhase)
      : proposal.filter((p) => p.role !== 'transition');
    if (days < config.shortCycleDays && !continuation)
      phases = phases.filter(
        (p) =>
          p.role !== 'preparation' ||
          p.proposalOrder >
            Math.min(
              ...proposal.filter((x) => x.role === 'preparation').map((x) => x.proposalOrder),
            ),
      );
    while (phases.length > days) phases.shift();
    const omitted = proposal
      .filter((p) => !phases.includes(p) && p.role !== 'transition')
      .map((p) => p.code);
    const reason = `Editierbare Startvorlage, keine DSB-Vorgabe. Ziel: ${peak.name}. ${continuation ? 'Nahe A-Höhepunkte: WP/UWV fortsetzen.' : 'Rückwärtsplanung mit gewählten Gewichten.'} ${omitted.length ? 'Ausgelassen: ' + omitted.join(', ') + '.' : ''} Individuelles Trainingsalter/Leistungsniveau unbekannt. Sonderzeiträume werden bei Terminen berücksichtigt.`;
    const weightSum = phases.reduce((n, p) => n + p.proposalWeight, 0);
    const peakDays = Math.min(
      peakPhase.maxDays ?? days,
      days - phases.length + 1,
      Math.max(1, Math.round((days * peakPhase.proposalWeight) / weightSum)),
    );
    const preparation = phases.filter((p) => p !== peakPhase);
    const available = days - peakDays;
    const totalWeight = preparation.reduce((n, p) => n + p.proposalWeight, 0);
    const raw = preparation.map(
      (p) => ((available - preparation.length) * p.proposalWeight) / totalWeight,
    );
    const lengths = raw.map((n) => Math.floor(n) + 1);
    let extra = available - lengths.reduce((a, b) => a + b, 0);
    const order = raw
      .map((n, i) => ({ i, fraction: n - Math.floor(n) }))
      .sort((a, b) => b.fraction - a.fraction || a.i - b.i);
    for (let i = 0; extra > 0; i++, extra--) lengths[order[i % order.length].i]++;
    preparation.forEach((phase, i) => append(phase, lengths[i], null, reason));
    append(peakPhase, peakDays, peak.id, reason);
  }
  const transition = config.phases?.find((p) => p.role === 'transition');
  if (transition)
    append(
      transition,
      dayNumber(cycle.endDate) - cursor + 1,
      null,
      'Bewusst verlängertes Planungsende: editierbare Übergangsphase.',
    );
  for (const phase of (config.phases ?? []).filter((p) => p.role === 'work' || p.role === 'peak'))
    result.filter((m) => m.type === phase.code).forEach((m, i) => (m.sequenceNumber = i + 1));
  return result;
}
export function generatePreview(cycle: MacroCycle, includeExisting = false): Occurrence[] {
  const result: Occurrence[] = [];
  if (validateCycle(cycle).length) throw new Error(validateCycle(cycle)[0]);
  const existing = new Set(
    includeExisting ? [] : [...cycle.sessions.map((s) => s.occurrenceKey), ...cycle.exclusions],
  );
  for (let day = dayNumber(cycle.startDate); day <= dayNumber(cycle.endDate); day++) {
    const date = dateAt(day);
    const weekday = new Date(day * DAY).getUTCDay();
    for (const slot of cycle.slots) {
      if (
        slot.weekday !== weekday ||
        (slot.validFrom && date < slot.validFrom) ||
        (slot.validUntil && date > slot.validUntil)
      )
        continue;
      const activePeriods = cycle.periods.filter((p) => date >= p.startDate && date <= p.endDate);
      if (slot.campOnly && !activePeriods.some((p) => p.trainingPolicy === 'camp')) continue;
      const key = `${slot.id}@${date}`;
      if (existing.has(key)) continue;
      const phases = cycle.mesocycles.filter((m) => date >= m.startDate && date <= m.endDate);
      const periods = cycle.periods.filter((p) => date >= p.startDate && date <= p.endDate);
      result.push({
        key,
        slotId: slot.id,
        date,
        startTime: slot.startTime,
        duration: Math.max(
          1,
          Math.floor(
            (slot.defaultDuration *
              Math.min(
                100,
                ...periods
                  .filter((p) => p.trainingPolicy === 'reduced' && p.durationPercent !== null)
                  .map((p) => p.durationPercent!),
              )) /
              100,
          ),
        ),
        sessionType:
          phases.length === 1
            ? ((
                { VP1: 'ET', VP2: 'KNT', WP: 'BAT', UWV: 'ZPT' } as Partial<
                  Record<PhaseType, SessionType>
                >
              )[phases[0].type] ?? slot.sessionType)
            : slot.sessionType,
        applyProfile: false,
        profile:
          phases.length === 1
            ? suggestedProfile(cycle, phases[0], date)
            : { volume: null, intensity: null, competitionSpecificity: null },
        location: slot.location,
        slotName: slot.name,
        mesoCycleId: phases.length === 1 ? phases[0].id : null,
        ambiguous: phases.length > 1,
        periods,
        selected: !periods.some(
          (p) =>
            p.trainingPolicy === 'suspended' ||
            (p.trainingPolicy === 'reduced' &&
              p.retainedSlotIds !== null &&
              !p.retainedSlotIds.includes(slot.id)),
        ),
        reduced: periods.some((p) => p.trainingPolicy === 'reduced'),
      });
    }
  }
  return result.sort(
    (a, b) => a.date.localeCompare(b.date) || a.startTime.localeCompare(b.startTime),
  );
}
export function acceptPreview(cycle: MacroCycle, rows: Occurrence[]): void {
  const existing = new Set([...cycle.sessions.map((s) => s.occurrenceKey), ...cycle.exclusions]);
  for (const row of rows) {
    if (existing.has(row.key)) continue;
    if (!row.selected) {
      cycle.exclusions.push(row.key);
      continue;
    }
    const session: Session = {
      id: id(),
      mesoCycleId: row.mesoCycleId,
      sourceTrainingSlotId: row.slotId,
      occurrenceKey: row.key,
      date: row.date,
      startTime: row.startTime,
      plannedDuration: row.duration,
      name: row.slotName,
      notes: '',
      status: 'planned',
      sessionType: row.sessionType,
      areas: [],
      volume: row.applyProfile ? row.profile.volume : null,
      intensity: row.applyProfile ? row.profile.intensity : null,
      competitionSpecificity: row.applyProfile ? row.profile.competitionSpecificity : null,
      plannedArrowCount: null,
      actualArrowCount: null,
      actualDuration: null,
      subjectiveLoad: null,
      originalPlan: null,
      suggestionDecision: null,
      manuallyModified: false,
      individuallyPlanned: false,
      reduced: row.reduced,
      contents: ['AT', 'MT', 'M-T'].includes(row.sessionType)
        ? []
        : [
            Object.assign(newContent(0, 30, 'Aufwärmen und Einschießen'), {
              areas: ['SCHIESSTECHNIK', 'ATHLETIK'] as Area[],
            }),
          ],
    };
    session.generationBaseline = generationBaseline(session);
    cycle.sessions.push(session);
    existing.add(row.key);
  }
  cycle.sessions.sort(
    (a, b) => a.date.localeCompare(b.date) || a.startTime.localeCompare(b.startTime),
  );
}
export function generationBaseline(session: Session): GenerationBaseline {
  const {
    date,
    startTime,
    plannedDuration,
    name,
    mesoCycleId,
    sessionType,
    reduced,
    volume,
    intensity,
    competitionSpecificity,
    contents,
  } = session;
  return structuredClone({
    date,
    startTime,
    plannedDuration,
    name,
    mesoCycleId,
    sessionType,
    reduced,
    volume,
    intensity,
    competitionSpecificity,
    contents,
  });
}
export function nextOffset(contents: Content[]): number {
  return contents.reduce((total, block) => total + block.durationMinutes, 0);
}
export function sequenceContents(contents: Content[]): void {
  let offset = 0;
  for (const block of contents) {
    block.startOffsetMinutes = offset;
    offset += block.durationMinutes;
  }
}
export function sequenceWorkspace(workspace: Workspace): void {
  for (const cycle of workspace.cycles)
    for (const session of cycle.sessions) {
      sequenceContents(session.contents);
      if (session.generationBaseline) sequenceContents(session.generationBaseline.contents);
    }
  for (const template of workspace.templates) sequenceContents(template.contents);
}
export function applyTemplate(
  sessions: Session[],
  template: Template,
  mode: 'replace' | 'empty' | 'append',
): void {
  if (
    mode === 'replace' &&
    sessions.some((s) =>
      s.contents.some(
        (b) => b.actualArrowCount !== null || b.actualDuration !== null || b.actualLoad !== null,
      ),
    )
  )
    throw new Error(
      'Blöcke mit Durchführungsdaten bleiben erhalten. Vorlage ergänzen oder eine neue Einheit planen.',
    );
  for (const session of sessions) {
    if (mode === 'empty' && session.contents.length) continue;
    captureOriginalPlan(session);
    const offset = mode === 'append' ? nextOffset(session.contents) : 0;
    const contents = template.contents.map((c) => ({
      ...structuredClone(c),
      actualArrowCount: null,
      actualDuration: null,
      actualLoad: null,
      id: id(),
      startOffsetMinutes: c.startOffsetMinutes + offset,
    }));
    session.sessionType = template.sessionType;
    session.areas = [...template.areas];
    session.volume = template.volume;
    session.intensity = template.intensity;
    session.competitionSpecificity = template.competitionSpecificity;
    session.contents = mode === 'append' ? [...session.contents, ...contents] : contents;
    sequenceContents(session.contents);
    session.plannedDuration =
      mode === 'append'
        ? Math.max(session.plannedDuration, offset + template.defaultDuration)
        : template.defaultDuration;
    session.manuallyModified = true;
    session.individuallyPlanned = true;
  }
}
export function validateCycle(c: MacroCycle): string[] {
  const errors: string[] = [];
  if (!c.competitions.some((x) => x.id === c.mainCompetitionId && x.priority === 'A'))
    return ['Hauptwettkampf muss ein vorhandener A-Wettkampf sein.'];
  for (const x of c.competitions)
    if (!x.name.trim() || !validDate(x.date) || !['A', 'B', 'C'].includes(x.priority))
      errors.push('Wettkampf: Name, Datum und Priorität prüfen.');
  const config = normalizePlanning(c.planning);
  if (
    ![
      config.shortCycleDays,
      config.closePeakDays,
      config.recoveryLookbackDays,
      config.longSeasonDays,
    ].every((n) => Number.isInteger(n) && n >= 1 && n <= 3660) ||
    !nullableInteger(config.hardIntensity, 1, 5) ||
    !integer(config.consecutiveHardSessions, 1) ||
    !integer(config.loadRisePercent, 0) ||
    !integer(config.loadRiseWeeks, 1) ||
    !config.phases?.length ||
    new Set((config.phases ?? []).map((p) => p.code)).size !== config.phases!.length ||
    (config.phases ?? []).some(
      (p) =>
        !p.code.trim() ||
        !p.label.trim() ||
        !Number.isInteger(p.displayOrder) ||
        !Number.isInteger(p.proposalOrder) ||
        !['preparation', 'work', 'peak', 'transition'].includes(p.role) ||
        !integer(p.proposalWeight, 1) ||
        !Object.values(p.profile).every((n) => nullableInteger(n, 1, 5)) ||
        (p.maxDays !== null && !integer(p.maxDays, 1)),
    ) ||
    !(config.phases ?? []).some((p) => p.role === 'peak' && p.capabilities.targetCompetition) ||
    c.mesocycles.some((m) => !phaseFor(config, m.type))
  )
    errors.push('Planungskonfiguration prüfen.');
  const mondays = new Set<string>();
  for (const w of c.weeks) {
    if (
      !validDate(w.monday) ||
      mondayOf(w.monday) !== w.monday ||
      mondays.has(w.monday) ||
      (w.profile !== null && !WEEK_PROFILES.includes(w.profile))
    )
      errors.push('Montagwoche prüfen.');
    mondays.add(w.monday);
  }
  for (const g of c.goals) {
    const refs = {
      macrocycle: [c.id],
      mesocycle: c.mesocycles.map((m) => m.id),
      week: c.weeks.map((w) => w.monday),
      session: c.sessions.map((s) => s.id),
    };
    if (
      !g.description.trim() ||
      !AREAS.includes(g.category) ||
      !['open', 'achieved', 'abandoned'].includes(g.status) ||
      !refs[g.scope]?.includes(g.reference) ||
      (g.targetValue !== null && !Number.isFinite(g.targetValue))
    )
      errors.push('Trainingsziel oder Verweis prüfen.');
  }
  for (const p of c.periods)
    if (
      !nullableInteger(p.durationPercent, 1, 100) ||
      (p.retainedSlotIds !== null &&
        (new Set(p.retainedSlotIds).size !== p.retainedSlotIds.length ||
          p.retainedSlotIds.some((id) => !c.slots.some((s) => s.id === id))))
    )
      errors.push('Ferienreduktion prüfen.');
  if (!c.name.trim() || !mainCompetition(c).name.trim())
    errors.push('Makrozyklus und Hauptwettkampf benötigen einen Namen.');
  if (
    !validDate(c.startDate) ||
    !validDate(mainCompetition(c).date) ||
    !validDate(c.endDate) ||
    c.endDate < mainCompetition(c).date ||
    c.startDate > mainCompetition(c).date ||
    dayCount(c.startDate, c.endDate) > 3660
  )
    errors.push('Der Hauptwettkampf muss am oder nach dem Start liegen (maximal zehn Jahre).');
  for (const m of c.mesocycles) {
    if (!Object.hasOwn(MESOCYCLE_COLORS, m.color)) errors.push('Ungültige Mesozyklusfarbe.');
    if (
      !m.name.trim() ||
      !validDate(m.startDate) ||
      !validDate(m.endDate) ||
      m.startDate > m.endDate
    )
      errors.push('Mesozyklen benötigen einen Namen und gültige Datumsgrenzen.');
    if (
      !nullableInteger(m.legacyArrowCount, 0, 100) ||
      ![m.volume, m.intensity, m.competitionSpecificity].every((v) => nullableInteger(v, 1, 5))
    )
      errors.push('Belastungsdimensionen: 1–5; Legacy-Pfeilwert: 0–100.');
    if (
      !nullableInteger(m.sequenceNumber, 1) ||
      (m.targetCompetitionId !== null &&
        !c.competitions.some((x) => x.id === m.targetCompetitionId))
    )
      errors.push('Ungültige Phasenfolge oder Zielreferenz.');
  }
  for (const p of c.periods)
    if (
      !p.name.trim() ||
      !validDate(p.startDate) ||
      !validDate(p.endDate) ||
      p.startDate > p.endDate
    )
      errors.push('Sonderzeiträume benötigen Namen und gültige Datumsgrenzen.');
  for (const s of c.slots)
    if (
      !SESSION_TYPES.includes(s.sessionType) ||
      !/^([01]\d|2[0-3]):[0-5]\d$/.test(s.startTime) ||
      !integer(s.defaultDuration, 1) ||
      !Number.isInteger(s.weekday) ||
      s.weekday < 0 ||
      s.weekday > 6 ||
      (s.validFrom && !validDate(s.validFrom)) ||
      (s.validUntil && !validDate(s.validUntil)) ||
      (s.validFrom && s.validUntil && s.validFrom > s.validUntil)
    )
      errors.push('Trainingsslots benötigen gültige Uhrzeit, Dauer und Gültigkeitsdaten.');
  for (const s of c.sessions) {
    const baseline = s.generationBaseline;
    if (baseline) {
      if (
        !validDate(baseline.date) ||
        !/^([01]\d|2[0-3]):[0-5]\d$/.test(baseline.startTime) ||
        !integer(baseline.plannedDuration, 1) ||
        !SESSION_TYPES.includes(baseline.sessionType) ||
        typeof baseline.name !== 'string' ||
        typeof baseline.reduced !== 'boolean' ||
        (baseline.mesoCycleId !== null && typeof baseline.mesoCycleId !== 'string') ||
        ![baseline.volume, baseline.intensity, baseline.competitionSpecificity].every((v) =>
          nullableInteger(v, 1, 5),
        )
      )
        errors.push('Ungültiger Generierungsstand.');
      errors.push(...validateContents(baseline.contents));
    }
    if (
      !SESSION_TYPES.includes(s.sessionType) ||
      !['planned', 'completed', 'cancelled', 'moved'].includes(s.status) ||
      !validAreas(s.areas) ||
      ![s.volume, s.intensity, s.competitionSpecificity].every((v) => nullableInteger(v, 1, 5)) ||
      ![s.plannedArrowCount, s.actualArrowCount, s.actualDuration].every((v) =>
        nullableInteger(v, 0),
      ) ||
      !nullableInteger(s.subjectiveLoad, 0, 10) ||
      (s.originalPlan !== null &&
        (!integer(s.originalPlan.duration, 1) ||
          !nullableInteger(s.originalPlan.arrows, 0) ||
          !integer(s.originalPlan.partialArrows))) ||
      !validDate(s.date) ||
      !/^([01]\d|2[0-3]):[0-5]\d$/.test(s.startTime) ||
      !integer(s.plannedDuration, 1)
    )
      errors.push('Trainingseinheit: Datum, Uhrzeit und Dauer prüfen.');
    if (
      (s.mesoCycleId !== null && !c.mesocycles.some((m) => m.id === s.mesoCycleId)) ||
      (s.sourceTrainingSlotId !== null &&
        !c.slots.some((slot) => slot.id === s.sourceTrainingSlotId))
    )
      errors.push('Einheit verweist auf fehlende Phase oder Slot.');
    errors.push(...validateContents(s.contents));
  }
  return errors;
}
export function validateContents(contents: Content[]): string[] {
  return contents.flatMap((b) =>
    !integer(b.startOffsetMinutes, 0) ||
    !integer(b.durationMinutes, 1) ||
    b.startOffsetMinutes + b.durationMinutes > MAX_INTEGER ||
    typeof b.goals !== 'string' ||
    b.goals.length > 300 ||
    (!b.content.trim() && b.category !== 'Spiel') ||
    !validAreas(b.areas) ||
    ![b.plannedArrowCount, b.actualArrowCount, b.actualDuration].every((v) =>
      nullableInteger(v, 0),
    ) ||
    ![b.plannedLoad, b.actualLoad].every((v) => nullableInteger(v, 1, 5)) ||
    (b.category && !CATEGORIES.includes(b.category))
      ? ['Inhaltsblöcke benötigen Text, einen ganzzahligen Start ab 0 und eine positive Dauer.']
      : [],
  );
}
export function validateWorkspace(w: Workspace): string[] {
  return [
    ...gameErrors(w.games ?? []),
    ...gameReferenceErrors(w),
    ...w.cycles.flatMap(validateCycle),
    ...w.cycles.flatMap((c) =>
      c.mesocycles.flatMap((m) =>
        m.defaultTemplateId != null && !w.templates.some((t) => t.id === m.defaultTemplateId)
          ? ['Mesozyklus-Standardvorlage fehlt.']
          : [],
      ),
    ),
    ...w.templates.flatMap((t) =>
      !t.name.trim() ||
      !integer(t.defaultDuration, 1) ||
      !SESSION_TYPES.includes(t.sessionType) ||
      !validAreas(t.areas) ||
      ![t.volume, t.intensity, t.competitionSpecificity].every((v) => nullableInteger(v, 1, 5))
        ? ['Vorlage benötigt Namen und positive Dauer.']
        : validateContents(t.contents),
    ),
  ];
}
export function cycleWarnings(c: MacroCycle): string[] {
  const messages: string[] = [];
  const phases = [...c.mesocycles].sort((a, b) => a.startDate.localeCompare(b.startDate));
  let covered = dayNumber(c.startDate) - 1;
  for (const m of phases) {
    if (m.startDate < c.startDate || m.endDate > c.endDate)
      messages.push(`${m.name}: außerhalb des Makrozyklus.`);
    if (dayNumber(m.startDate) <= covered) messages.push(`${m.name}: überlappende Mesozyklen.`);
    if (dayNumber(m.startDate) > covered + 1) messages.push(`Ungeplante Lücke vor ${m.name}.`);
    covered = Math.max(covered, dayNumber(m.endDate));
  }
  if (covered < dayNumber(c.endDate)) messages.push('Der Plan enthält noch Tage ohne Mesozyklus.');
  for (const competition of c.competitions)
    if (competition.date < c.startDate || competition.date > c.endDate)
      messages.push(`${competition.name}: Wettkampf außerhalb des Makrozyklus.`);
  for (const p of c.periods)
    if (p.startDate < c.startDate || p.endDate > c.endDate)
      messages.push(`${p.name}: außerhalb des Makrozyklus.`);
  for (let i = 0; i < c.periods.length; i++)
    for (const p of c.periods.slice(i + 1)) {
      const q = c.periods[i];
      if (p.startDate <= q.endDate && q.startDate <= p.endDate)
        messages.push(
          `${q.name} / ${p.name}: überlappende Sonderzeiträume; Aussetzen hat in der Vorschau Vorrang, Reduktion bleibt markiert. Auswahl ist überschreibbar.`,
        );
    }
  for (const session of c.sessions)
    if (session.date < c.startDate || session.date > c.endDate)
      messages.push(`Einheit am ${session.date}: außerhalb des Makrozyklus.`);
  return messages;
}
export function contentWarnings(s: { contents: Content[]; plannedDuration: number }): string[] {
  const warnings: string[] = [];
  let end = 0;
  for (const b of s.contents) {
    if (!b.areas.length && b.category !== 'Pause')
      warnings.push(`${b.content}: Bestandskategorie ohne eindeutigen Bereich; bitte zuordnen.`);
    if (b.startOffsetMinutes < end) warnings.push(`${b.content}: zeitliche Überschneidung.`);
    if (b.startOffsetMinutes > end) warnings.push(`${b.content}: ungeplante Lücke.`);
    end = Math.max(end, b.startOffsetMinutes + b.durationMinutes);
    if (end > s.plannedDuration) warnings.push(`${b.content}: außerhalb der geplanten Dauer.`);
  }
  return warnings;
}

export const integer = (n: number, min = 0, max = MAX_INTEGER): boolean =>
  Number.isInteger(n) && n >= min && n <= max;
export const nullableInteger = (n: number | null, min = 0, max = MAX_INTEGER): boolean =>
  n === null || integer(n, min, max);
const validAreas = (areas: Area[]): boolean =>
  areas.every((a) => AREAS.includes(a)) && new Set(areas).size === areas.length;
export const mondayOf = (date: string): string =>
  dateAt(dayNumber(date) - ((new Date(date + 'T00:00:00Z').getUTCDay() + 6) % 7));
export function cycleWeeks(c: MacroCycle): string[] {
  const weeks: string[] = [];
  if (!validDate(c.startDate) || !validDate(c.endDate) || dayCount(c.startDate, c.endDate) > 3660)
    return weeks;
  for (let d = dayNumber(mondayOf(c.startDate)); d <= dayNumber(c.endDate); d += 7)
    weeks.push(dateAt(d));
  return weeks;
}
export function sessionArrows(s: Session, actual = false): number | null {
  if (!actual && s.originalPlan !== null) return s.originalPlan.arrows;
  const explicit = actual ? s.actualArrowCount : s.plannedArrowCount;
  if (explicit !== null) return explicit;
  const values = s.contents.map((b) => (actual ? b.actualArrowCount : b.plannedArrowCount));
  return values.length && values.every((n) => n !== null)
    ? values.reduce<number>((sum, n) => sum + n!, 0)
    : null;
}
export function sessionDuration(s: Session, actual = false): number | null {
  if (!actual) return s.originalPlan?.duration ?? s.plannedDuration;
  if (s.actualDuration !== null) return s.actualDuration;
  return s.contents.length && s.contents.every((b) => b.actualDuration !== null)
    ? s.contents.reduce((n, b) => n + b.actualDuration!, 0)
    : null;
}
export interface Measure {
  total: number | null;
  recorded: number;
  expected: number;
  partial: number;
}
export function summarize(sessions: Session[]) {
  // Moved origins are omitted: the replacement session carries the plan. Cancelled plans remain visible; actuals use completed sessions only.
  const planned = sessions.filter((s) => s.status !== 'moved');
  const actual = planned.filter((s) => s.status === 'completed');
  const sum = (
    list: Session[],
    read: (s: Session) => number | null,
    partial: (s: Session) => number = () => 0,
  ): Measure => {
    const values = list.map(read);
    const recorded = values.filter((v) => v !== null);
    return {
      total:
        values.length && recorded.length === values.length
          ? recorded.reduce((a, b) => a + b, 0)
          : null,
      partial: list.reduce((n, s, i) => n + (values[i] ?? partial(s)), 0),
      recorded: recorded.length,
      expected: values.length,
    };
  };
  const paired = (
    readPlan: (s: Session) => number | null,
    readActual: (s: Session) => number | null,
  ): Measure =>
    sum(actual, (s) => {
      const p = readPlan(s),
        a = readActual(s);
      return p === null || a === null ? null : a - p;
    });
  return {
    count: planned.length,
    completed: actual.length,
    cancelled: planned.filter((s) => s.status === 'cancelled').length,
    simulations: planned.filter((s) => s.sessionType === 'LK').length,
    plannedDuration: sum(planned, (s) => sessionDuration(s)),
    actualDuration: sum(
      actual,
      (s) => sessionDuration(s, true),
      (s) => s.contents.reduce((n, b) => n + (b.actualDuration ?? 0), 0),
    ),
    plannedArrows: sum(
      planned,
      (s) => sessionArrows(s),
      (s) =>
        s.originalPlan
          ? s.originalPlan.partialArrows
          : s.contents.reduce((n, b) => n + (b.plannedArrowCount ?? 0), 0),
    ),
    actualArrows: sum(
      actual,
      (s) => sessionArrows(s, true),
      (s) => s.contents.reduce((n, b) => n + (b.actualArrowCount ?? 0), 0),
    ),
    durationDelta: paired(
      (s) => sessionDuration(s),
      (s) => sessionDuration(s, true),
    ),
    arrowDelta: paired(
      (s) => sessionArrows(s),
      (s) => sessionArrows(s, true),
    ),
    areas: AREAS.map((area) => ({
      area,
      count: planned.filter(
        (s) => s.areas.includes(area) || s.contents.some((b) => b.areas.includes(area)),
      ).length,
    })),
  };
}
export interface PlanningWarning {
  context: string;
  message: string;
}
export function detailedWarnings(c: MacroCycle): PlanningWarning[] {
  const result: PlanningWarning[] = [];
  const add = (code: string, message: string, data: unknown): void => {
    const context = contextKey([code, data]);
    if (!c.warningDecisions.includes(context)) result.push({ context, message });
  };
  const config = normalizePlanning(c.planning);
  for (const phase of c.mesocycles) {
    const definition = phaseFor(config, phase.type);
    if (definition?.capabilities.targetCompetition && !phase.targetCompetitionId)
      add('missing-target', `${phase.name}: UWV ohne Zielwettkampf.`, [
        phase.id,
        phase.type,
        phase.startDate,
        phase.endDate,
      ]);
    const sessions = c.sessions.filter(
      (s) => s.mesoCycleId === phase.id && !['cancelled', 'moved'].includes(s.status),
    );
    if (
      definition?.capabilities.specificContentWarning &&
      sessions.length &&
      !sessions.some((s) => ['BAT-WE', 'LK'].includes(s.sessionType))
    )
      add('specific-content', `${phase.name}: keine wettkampfspezifische Einheit.`, [
        phase.id,
        phase.type,
        sessions.map((s) => [s.id, s.sessionType, s.status]),
      ]);
    if (definition?.capabilities.volumeDeclineWarning) {
      const ordered = [...sessions].sort((a, b) => a.date.localeCompare(b.date));
      const first = ordered.find((s) => s.volume !== null),
        last = [...ordered].reverse().find((s) => s.volume !== null);
      if (first && last && first !== last && last.volume! > first.volume!)
        add(
          'uwv-volume',
          `${phase.name}: Umfang steigt von ${first.volume} auf ${last.volume} in UWV.`,
          [phase.id, first.id, first.volume, last.id, last.volume],
        );
    }
  }
  const peaks = c.competitions.filter((x) => x.priority === 'A');
  const peakLookbackDays = c.planning.phases?.find((p) => p.role === 'peak')?.maxDays ?? 14;
  for (const peak of peaks) {
    if (
      !c.mesocycles.some(
        (m) =>
          phaseFor(config, m.type)?.capabilities.targetCompetition &&
          (m.targetCompetitionId === peak.id ||
            c.competitions.find((x) => x.id === m.targetCompetitionId)?.date === peak.date),
      )
    )
      add('missing-uwv', `${peak.name} (${peak.date}): A-Wettkampf ohne UWV.`, [
        peak.id,
        peak.date,
        c.mesocycles
          .filter((m) => phaseFor(config, m.type)?.capabilities.targetCompetition)
          .map((m) => [m.id, m.targetCompetitionId]),
      ]);
    for (const session of c.sessions) {
      const distance = dayNumber(peak.date) - dayNumber(session.date);
      if (
        distance >= 0 &&
        distance <= peakLookbackDays &&
        session.intensity !== null &&
        session.intensity >= config.hardIntensity &&
        !['cancelled', 'moved'].includes(session.status)
      )
        add(
          'pre-peak-load',
          `${session.date}: hohe Intensität ${session.intensity} vor ${peak.name}.`,
          [
            session.id,
            session.date,
            session.intensity,
            peak.id,
            peak.date,
            peakLookbackDays,
            config.hardIntensity,
          ],
        );
    }
  }
  if (
    dayCount(c.startDate, c.endDate) >= config.longSeasonDays &&
    !c.mesocycles.some((m) => phaseFor(config, m.type)?.role === 'transition')
  )
    add('missing-uep', 'Lange Saison ohne UEP.', [c.startDate, c.endDate, config.longSeasonDays]);
  const prep = dayCount(c.startDate, mainCompetition(c).date);
  if (prep >= config.shortCycleDays)
    for (const phase of (config.phases ?? []).filter(
      (p) => p.role === 'preparation' && p.capabilities.proposal,
    ))
      if (!c.mesocycles.some((m) => m.type === phase.code))
        add(
          'missing-preparation',
          `${phase.code} fehlt trotz mindestens ${config.shortCycleDays} Vorbereitungstagen.`,
          [phase.code, c.startDate, mainCompetition(c).date, config.shortCycleDays],
        );
  const ordered = c.sessions
    .filter((s) => !['cancelled', 'moved'].includes(s.status))
    .sort((a, b) => a.date.localeCompare(b.date) || a.startTime.localeCompare(b.startTime));
  let hard: Session[] = [];
  for (const s of ordered) {
    if (
      s.intensity !== null &&
      s.intensity >= config.hardIntensity &&
      (!hard.length || dayNumber(s.date) - dayNumber(hard.at(-1)!.date) <= 1)
    )
      hard.push(s);
    else hard = s.intensity !== null && s.intensity >= config.hardIntensity ? [s] : [];
    if (hard.length === config.consecutiveHardSessions)
      add(
        'consecutive-hard',
        `${hard[0].date}–${s.date}: ${hard.length} harte Einheiten in Folge.`,
        [
          hard.map((s) => [s.id, s.date, s.intensity]),
          config.hardIntensity,
          config.consecutiveHardSessions,
        ],
      );
  }
  const weeks = cycleWeeks(c);
  let rising: string[] = [];
  let previous: number | null = null;
  for (const monday of weeks) {
    const total = summarize(ordered.filter((s) => mondayOf(s.date) === monday)).plannedArrows.total;
    const profile = c.weeks.find((w) => w.monday === monday)?.profile;
    if (
      total !== null &&
      previous !== null &&
      previous > 0 &&
      total > previous * (1 + config.loadRisePercent / 100) &&
      !['RECOVERY', 'TAPER', 'TRANSITION'].includes(profile ?? '')
    )
      rising.push(monday);
    else rising = [];
    if (rising.length === config.loadRiseWeeks)
      add(
        'rising-load',
        `Pfeilumfang steigt über ${config.loadRisePercent} % in ${rising.length} aufeinanderfolgenden Wochen ohne Entlastungsprofil.`,
        [
          rising,
          ordered
            .filter((s) => rising.includes(mondayOf(s.date)))
            .map((s) => [s.id, s.date, sessionArrows(s)]),
          config.loadRisePercent,
          config.loadRiseWeeks,
        ],
      );
    previous = total;
  }
  if (
    ordered.length &&
    dayNumber(ordered.at(-1)!.date) - dayNumber(ordered[0].date) >= config.recoveryLookbackDays
  ) {
    const end = ordered.at(-1)!.date;
    const recent = ordered.filter(
      (s) => dayNumber(end) - dayNumber(s.date) <= config.recoveryLookbackDays,
    );
    for (const area of ['ATHLETIK', 'REGENERATION'] as const)
      if (
        !recent.some(
          (s) =>
            s.areas.includes(area) ||
            s.contents.some((b) => b.areas.includes(area)) ||
            (area === 'ATHLETIK' && s.sessionType === 'AT'),
        )
      )
        add(
          'missing-area',
          `${end}: kein Bereich ${area} in den letzten ${config.recoveryLookbackDays} Tagen.`,
          [
            area,
            end,
            config.recoveryLookbackDays,
            recent.map((s) => [s.id, s.sessionType, s.areas, s.contents.map((b) => b.areas)]),
          ],
        );
  }
  return result;
}

export function captureOriginalPlan(session: Session): void {
  if (
    session.originalPlan === null &&
    (session.status === 'completed' ||
      session.actualDuration !== null ||
      session.actualArrowCount !== null ||
      session.subjectiveLoad !== null ||
      session.contents.some(
        (b) => b.actualDuration !== null || b.actualArrowCount !== null || b.actualLoad !== null,
      ))
  )
    session.originalPlan = {
      duration: session.plannedDuration,
      arrows: sessionArrows(session),
      partialArrows:
        session.plannedArrowCount ??
        session.contents.reduce((n, b) => n + (b.plannedArrowCount ?? 0), 0),
    };
}

function suggestedProfile(c: MacroCycle, phase: MesoCycle, date: string): PhaseProfile {
  const config = normalizePlanning(c.planning);
  const defaults = phaseFor(config, phase.type)?.profile;
  if (!defaults) throw new Error(`Unbekannte Phase ${phase.type}.`);
  const profile = {
    volume: phase.volume ?? defaults.volume,
    intensity: defaults.intensity,
    competitionSpecificity: phase.competitionSpecificity ?? defaults.competitionSpecificity,
  };
  const week = c.weeks.find((w) => w.monday === mondayOf(date));
  if (week?.profile === 'RECOVERY' || week?.profile === 'TRANSITION')
    profile.volume =
      config.phases?.find((p) => p.role === 'transition')?.profile.volume ?? profile.volume;
  if (week?.profile === 'TAPER')
    profile.volume =
      config.phases?.find((p) => p.role === 'peak')?.profile.volume ?? profile.volume;
  return profile;
}

// Context decisions survive JSON object-key ordering differences across the Rust boundary.
export function contextKey(value: unknown): string {
  return JSON.stringify(value, (_key, item: unknown) =>
    item && typeof item === 'object' && !Array.isArray(item)
      ? Object.fromEntries(Object.entries(item).sort(([a], [b]) => a.localeCompare(b)))
      : item,
  );
}
