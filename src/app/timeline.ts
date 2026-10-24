import { id, MacroCycle, MesoCycle } from './models';
import { dateAt, dayNumber, validDate, validateCycle } from './planning';

export type TimelineOperation =
  | { kind: 'split'; phaseId: string; date: string }
  | { kind: 'merge'; phaseId: string; otherId: string }
  | { kind: 'insert'; phaseId: string; startDate: string; endDate: string }
  | { kind: 'boundary'; phaseId: string; field: 'startDate' | 'endDate'; date: string }
  | { kind: 'delete'; phaseId: string };
export interface TimelinePreview {
  source: string;
  cycleId: string;
  phases: MesoCycle[];
  assignments: Array<{
    sessionId: string;
    previous: string | null;
    suggested: string | null;
    next: string | null;
  }>;
  goals: MacroCycle['goals'];
  explanation: string;
}

export function orderedPhases(cycle: MacroCycle): MesoCycle[] {
  return [...cycle.mesocycles].sort(
    (a, b) => a.startDate.localeCompare(b.startDate) || a.id.localeCompare(b.id),
  );
}

export function timelineDefaults(
  cycle: MacroCycle,
  phase: MesoCycle,
  kind: 'split' | 'insert' | 'merge',
) {
  const phases = orderedPhases(cycle);
  const next = phases[phases.findIndex((p) => p.id === phase.id) + 1];
  return {
    date: dateAt(dayNumber(kind === 'insert' ? phase.endDate : phase.startDate) + 1),
    end: dateAt(dayNumber(next?.startDate ?? phase.endDate) - 1),
    otherId: next?.id ?? '',
  };
}

export function timelinePreview(cycle: MacroCycle, operation: TimelineOperation): TimelinePreview {
  const phases = structuredClone(orderedPhases(cycle));
  const index = phases.findIndex((p) => p.id === operation.phaseId);
  if (index < 0) throw new Error('Mesozyklus nicht mehr vorhanden.');
  const phase = phases[index];
  let replacement: string | null = null;
  let removed: string | null = null;
  let explanation = '';
  switch (operation.kind) {
    case 'split': {
      if (
        !validDate(operation.date) ||
        operation.date <= phase.startDate ||
        operation.date > phase.endDate
      )
        throw new Error('Der zweite Teil muss nach dem Beginn und spätestens am Ende starten.');
      const second = {
        ...phase,
        id: id(),
        name: phase.name + ' – Teil 2',
        startDate: operation.date,
      };
      phase.endDate = dateAt(dayNumber(operation.date) - 1);
      phases.splice(index + 1, 0, second);
      explanation =
        'Beide Teile behalten das Profil und die Beschreibung. Manuelle Zuordnungen bleiben vorbelegt und sind hier änderbar.';
      break;
    }
    case 'merge': {
      const other = phases[index + 1];
      if (
        !other ||
        other.id !== operation.otherId ||
        dateAt(dayNumber(phase.endDate) + 1) !== other.startDate
      )
        throw new Error(
          'Nur direkt aufeinanderfolgende, lückenlose Mesozyklen können zusammengeführt werden.',
        );
      phase.endDate = other.endDate;
      removed = other.id;
      replacement = phase.id;
      phases.splice(index + 1, 1);
      explanation =
        'Der erste Mesozyklus behält Kennung, Name, Farbe, Profil, Zielwettkampf, Beschreibung und Prioritäten. Die Einstellungen des zweiten entfallen; seine Zuordnungen wechseln zum ersten. Inhalte und Vorlagen bleiben erhalten.';
      break;
    }
    case 'insert': {
      const next = phases[index + 1];
      if (
        !next ||
        !validDate(operation.startDate) ||
        !validDate(operation.endDate) ||
        operation.startDate > operation.endDate ||
        operation.startDate <= phase.endDate ||
        operation.endDate >= next.startDate
      )
        throw new Error(
          'Der neue Mesozyklus muss in die Lücke vor dem nächsten Mesozyklus passen. Zuerst Zeitgrenzen anpassen.',
        );
      phases.splice(index + 1, 0, {
        ...phase,
        id: id(),
        name: 'Neuer Mesozyklus',
        startDate: operation.startDate,
        endDate: operation.endDate,
        type: 'VP1',
        color: 'grey',
        legacyArrowCount: null,
        sequenceNumber: null,
        targetCompetitionId: null,
        volume: null,
        intensity: null,
        competitionSpecificity: null,
        description: '',
        technicalPriority: '',
        physicalPriority: '',
        mentalPriority: '',
      });
      explanation =
        'Der neue Mesozyklus füllt die gewählten Tage der Lücke mit einem editierbaren VP1-Profil. Bestehende Phasen und Vorlagen bleiben erhalten.';
      break;
    }
    case 'boundary':
      phase[operation.field] = operation.date;
      explanation =
        'Nur die gewählte Zeitgrenze ändert sich. Manuelle Zuordnungen bleiben vorbelegt; alle Zuordnungen sind hier änderbar.';
      break;
    case 'delete':
      removed = phase.id;
      phases.splice(index, 1);
      explanation =
        'Einheiten bleiben erhalten. Zugeordnete Einheiten werden zunächst unzugeordnet. Inhalte und Vorlagen bleiben erhalten.';
  }
  const assignments = cycle.sessions.map((session) => {
    const matches = phases.filter((p) => session.date >= p.startDate && session.date <= p.endDate);
    const next =
      removed !== null && session.mesoCycleId === removed
        ? replacement
        : session.manuallyModified
          ? session.mesoCycleId
          : matches.length === 1
            ? matches[0].id
            : null;
    return { sessionId: session.id, previous: session.mesoCycleId, suggested: next, next };
  });
  const goals = structuredClone(cycle.goals).map((goal) => {
    if (goal.scope === 'mesocycle' && goal.reference === removed) {
      goal.scope = replacement ? 'mesocycle' : 'macrocycle';
      goal.reference = replacement ?? cycle.id;
    }
    return goal;
  });
  const preview = {
    source: JSON.stringify(cycle),
    cycleId: cycle.id,
    phases,
    assignments,
    goals,
    explanation,
  };
  projectedTimeline(cycle, preview);
  return preview;
}

export function projectedTimeline(cycle: MacroCycle, preview: TimelinePreview): MacroCycle {
  if (cycle.id !== preview.cycleId || JSON.stringify(cycle) !== preview.source)
    throw new Error('Der Plan wurde geändert. Bitte die Timeline-Vorschau neu erstellen.');
  if (
    preview.assignments.length !== cycle.sessions.length ||
    new Set(preview.assignments.map((a) => a.sessionId)).size !== cycle.sessions.length
  )
    throw new Error('Ungültige Zuordnungsvorschau.');
  const projected = structuredClone(cycle);
  projected.mesocycles = structuredClone(preview.phases);
  projected.goals = structuredClone(preview.goals);
  for (const session of projected.sessions) {
    const assignment = preview.assignments.find((a) => a.sessionId === session.id);
    if (!assignment) throw new Error('Ungültige Zuordnungsvorschau.');
    if (session.mesoCycleId !== assignment.next || assignment.next !== assignment.suggested)
      session.manuallyModified = true;
    session.mesoCycleId = assignment.next;
  }
  const errors = validateCycle(projected);
  if (errors.length) throw new Error(errors[0]);
  return projected;
}
