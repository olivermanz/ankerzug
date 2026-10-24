import { MacroCycle, RegenerationPreview, RegenerationRow, Session } from './models';
import { acceptPreview, generatePreview, generationBaseline, validateCycle } from './planning';

const same = (a: unknown, b: unknown): boolean => JSON.stringify(a) === JSON.stringify(b);

function recorded(session: Session): boolean {
  return (
    session.status !== 'planned' ||
    session.originalPlan !== null ||
    session.actualDuration !== null ||
    session.actualArrowCount !== null ||
    session.subjectiveLoad !== null ||
    session.contents.some(
      (b) => b.actualDuration !== null || b.actualArrowCount !== null || b.actualLoad !== null,
    )
  );
}

function protectedSession(cycle: MacroCycle, session: Session): boolean {
  const baseline = session.generationBaseline && structuredClone(session.generationBaseline);
  // Phase deletion clears the live reference; historical baseline references remain metadata.
  if (baseline?.mesoCycleId && !cycle.mesocycles.some((m) => m.id === baseline.mesoCycleId))
    baseline.mesoCycleId = null;
  return (
    !session.generationBaseline ||
    session.manuallyModified ||
    session.individuallyPlanned ||
    recorded(session) ||
    !!session.notes ||
    session.areas.length > 0 ||
    session.plannedArrowCount !== null ||
    cycle.goals.some((g) => g.scope === 'session' && g.reference === session.id) ||
    !same(generationBaseline(session), baseline)
  );
}

/** Only scheduling fields are offered for an explicitly approved manual conflict. */
function scheduling(before: Session, source: Session): Session {
  return {
    ...structuredClone(before),
    date: source.date,
    startTime: source.startTime,
    plannedDuration: source.plannedDuration,
    name: source.name,
    mesoCycleId: source.mesoCycleId,
    reduced: source.reduced,
  };
}

export function regenerationPreview(cycle: MacroCycle): RegenerationPreview {
  const source = JSON.stringify(cycle);
  const occurrences = generatePreview(cycle, true);
  const existing = new Map(cycle.sessions.map((s) => [s.occurrenceKey, s]));
  const exclusions = new Set(cycle.exclusions);
  const rows: RegenerationRow[] = [];
  for (const occurrence of occurrences) {
    const before = existing.get(occurrence.key) ?? null;
    existing.delete(occurrence.key);
    if (exclusions.has(occurrence.key)) {
      rows.push({
        key: occurrence.key,
        kind: 'excluded',
        before: null,
        after: null,
        reason: 'Bewusst entfernter oder abgewählter Termin bleibt ausgeschlossen.',
        choice: 'keep',
        canApply: false,
      });
      exclusions.delete(occurrence.key);
      continue;
    }
    // Ambiguous phases require an explicit assignment in the preview.
    const draft: MacroCycle = { ...cycle, sessions: [], exclusions: [] };
    acceptPreview(draft, [{ ...occurrence, selected: true, applyProfile: false }]);
    const generated = draft.sessions[0];
    if (!before) {
      rows.push({
        key: occurrence.key,
        kind: occurrence.selected ? 'add' : 'excluded',
        before: null,
        after: generated,
        reason: occurrence.selected
          ? occurrence.ambiguous
            ? 'Mehrere Mesozyklen: Zuordnung auswählen oder unzugeordnet lassen.'
            : 'Neuer Termin.'
          : 'Durch Sonderzeitraum deaktiviert; kein dauerhafter Lösch-Ausschluss.',
        choice: occurrence.selected ? 'apply' : 'keep',
        canApply: true,
      });
      continue;
    }
    const protectedValue = protectedSession(cycle, before);
    if (!occurrence.selected) {
      rows.push({
        key: occurrence.key,
        kind: protectedValue ? 'conflict' : 'remove',
        before: structuredClone(before),
        after: null,
        reason:
          'Sonderzeitraum deaktiviert diesen Termin.' +
          (protectedValue ? ' Bestehende Planung bleibt geschützt.' : ''),
        choice: protectedValue ? 'unresolved' : 'remove',
        canApply: false,
      });
      continue;
    }
    let after: Session;
    if (protectedValue) after = scheduling(before, generated);
    else {
      after = { ...structuredClone(before), ...generationBaseline(generated) };
      // Retain content IDs unless changing to/from a non-archery default.
      if (before.contents.length === generated.contents.length)
        after.contents = structuredClone(before.contents);
    }
    const changed = !same(generationBaseline(before), generationBaseline(after));
    const typeConflict = protectedValue && before.sessionType !== generated.sessionType;
    after.generationBaseline = generationBaseline(after);
    rows.push({
      key: occurrence.key,
      kind: changed || typeConflict ? (protectedValue ? 'conflict' : 'update') : 'unchanged',
      before: structuredClone(before),
      after,
      reason:
        changed || typeConflict
          ? protectedValue
            ? 'Trainerentscheidung, Durchführungsdaten, Ziel oder fehlender Generierungsstand: bewusst beibehalten. Nur Termin und Zuordnung können übernommen werden; Inhalte und Einheitentyp bleiben erhalten.'
            : 'Automatisch erzeugte Planung wird an die Quellen angepasst.'
          : 'Bestehende Einheit bleibt unverändert.',
      choice: changed || typeConflict ? (protectedValue ? 'unresolved' : 'apply') : 'keep',
      canApply: !recorded(before),
    });
  }
  for (const before of existing.values()) {
    const detached = before.sourceTrainingSlotId === null;
    const protectedValue = protectedSession(cycle, before);
    rows.push({
      key: before.occurrenceKey,
      kind: detached ? 'unchanged' : protectedValue ? 'conflict' : 'remove',
      before: structuredClone(before),
      after: null,
      reason: detached
        ? 'Ohne Quellslot: Einheit bleibt erhalten.'
        : 'Termin entfällt durch Wochentag, Gültigkeit, Planungsgrenze oder Trainingslager.' +
          (protectedValue ? ' Bestehende Planung bleibt geschützt.' : ''),
      choice: detached ? 'keep' : protectedValue ? 'unresolved' : 'remove',
      canApply: false,
    });
  }
  for (const key of exclusions)
    rows.push({
      key,
      kind: 'excluded',
      before: null,
      after: null,
      reason: 'Gespeicherter Lösch-Ausschluss bleibt erhalten.',
      choice: 'keep',
      canApply: false,
    });
  return { source, rows };
}

export function applyRegeneration(cycle: MacroCycle, preview: RegenerationPreview): MacroCycle {
  if (preview.source !== JSON.stringify(cycle))
    throw new Error('Planung wurde verändert. Regenerierungsvorschau erneut erstellen.');
  const candidate = structuredClone(cycle);
  for (const row of preview.rows) {
    if (row.choice === 'unresolved')
      throw new Error('Alle Konflikte zuerst ausdrücklich entscheiden.');
    if (row.choice === 'keep') {
      if (row.before && (row.kind === 'update' || row.kind === 'remove')) {
        const retained = candidate.sessions.find((s) => s.id === row.before!.id)!;
        retained.manuallyModified = true;
      }
      // Declining a new occurrence is a deliberate exclusion; source exclusions are not.
      if (row.kind === 'add' && !candidate.exclusions.includes(row.key))
        candidate.exclusions.push(row.key);
      continue;
    }
    if (row.choice === 'remove') {
      if (row.kind !== 'remove')
        throw new Error('Geschützte Einheit darf nicht durch Regenerierung gelöscht werden.');
      candidate.sessions = candidate.sessions.filter((s) => s.occurrenceKey !== row.key);
      continue;
    }
    if (!row.canApply || !row.after)
      throw new Error('Diese Änderung kann nicht übernommen werden.');
    const next = structuredClone(row.after);
    if (
      row.kind === 'conflict' ||
      row.kind === 'excluded' ||
      !same(generationBaseline(next), next.generationBaseline)
    )
      next.manuallyModified = true;
    next.generationBaseline = generationBaseline(next);
    if (row.before) {
      const index = candidate.sessions.findIndex((s) => s.id === row.before!.id);
      candidate.sessions[index] = next;
    } else candidate.sessions.push(next);
  }
  candidate.sessions.sort(
    (a, b) => a.date.localeCompare(b.date) || a.startTime.localeCompare(b.startTime),
  );
  const errors = validateCycle(candidate);
  if (errors.length) throw new Error(errors[0]);
  return candidate;
}
