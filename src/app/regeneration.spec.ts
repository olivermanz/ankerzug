import { describe, expect, it } from 'vitest';
import { id, MacroCycle } from './models';
import { acceptPreview, generatePreview, newCycle, phaseProposal, validateCycle } from './planning';
import { applyRegeneration, regenerationPreview } from './regeneration';
import fixture from '../../fixtures/workspace-regeneration.json';
import { Backup } from './models';
import { validateWorkspace } from './planning';

function planned(): MacroCycle {
  const cycle = newCycle();
  cycle.name = 'Saison';
  cycle.competitions[0].name = 'Wettkampf';
  cycle.mesocycles = phaseProposal(cycle);
  cycle.slots.push({
    id: id(),
    name: 'Training',
    sessionType: 'BAT',
    campOnly: false,
    weekday: 2,
    startTime: '18:00',
    defaultDuration: 120,
    location: '',
    validFrom: '',
    validUntil: '',
  });
  acceptPreview(cycle, generatePreview(cycle));
  return cycle;
}

describe('safe regeneration', () => {
  it('reads the shared Rust/TypeScript baseline contract and preserves independent snapshots', () => {
    const backup = structuredClone(fixture) as Backup;
    expect(validateWorkspace(backup.workspace)).toEqual([]);
    const session = backup.workspace.cycles[0].sessions[0];
    session.contents[0].content = 'Trainer edit';
    expect(session.generationBaseline!.contents[0].content).not.toBe('Trainer edit');
  });
  it('protects explicit keep and assignment decisions on subsequent regeneration', () => {
    const cycle = planned();
    cycle.slots[0].startTime = '20:00';
    const preview = regenerationPreview(cycle);
    preview.rows[0].choice = 'keep';
    preview.rows[1].after!.mesoCycleId = null;
    const next = applyRegeneration(cycle, preview);
    expect(next.sessions[0].manuallyModified).toBe(true);
    expect(next.sessions[1].manuallyModified).toBe(true);
    const again = regenerationPreview(next);
    expect(again.rows.find((r) => r.before?.id === next.sessions[0].id)?.kind).toBe('conflict');
    expect(again.rows.find((r) => r.before?.id === next.sessions[1].id)?.kind).toBe('conflict');
  });
  it('is idempotent and keeps session and content identities for unchanged and updated occurrences', () => {
    const cycle = planned();
    expect(regenerationPreview(cycle).rows.every((r) => r.kind === 'unchanged')).toBe(true);
    expect(applyRegeneration(cycle, regenerationPreview(cycle))).toEqual(cycle);
    const ids = cycle.sessions.map((s) => [s.id, s.contents[0].id]);
    cycle.slots[0].startTime = '19:00';
    cycle.slots[0].defaultDuration = 90;
    const result = applyRegeneration(cycle, regenerationPreview(cycle));
    expect(result.sessions.every((s) => s.startTime === '19:00' && s.plannedDuration === 90)).toBe(
      true,
    );
    expect(result.sessions.map((s) => [s.id, s.contents[0].id])).toEqual(ids);
    expect(applyRegeneration(result, regenerationPreview(result))).toEqual(result);
    expect(cycle.sessions[0].startTime).toBe('18:00');
  });

  it('requires explicit conflict choices, preserves moved/content decisions, and never resurrects deletions', () => {
    const cycle = planned();
    const moved = cycle.sessions[0];
    moved.date = '2026-10-01';
    moved.manuallyModified = true;
    moved.contents[0].content = 'Trainerentscheidung';
    const deleted = cycle.sessions.splice(1, 1)[0];
    cycle.exclusions.push(deleted.occurrenceKey);
    cycle.slots[0].startTime = '20:00';
    const preview = regenerationPreview(cycle);
    expect(preview.rows.find((r) => r.key === moved.occurrenceKey)?.kind).toBe('conflict');
    expect(preview.rows.find((r) => r.key === deleted.occurrenceKey)?.canApply).toBe(false);
    expect(() => applyRegeneration(cycle, preview)).toThrow('Konflikte');
    preview.rows.find((r) => r.key === moved.occurrenceKey)!.choice = 'keep';
    const result = applyRegeneration(cycle, preview);
    expect(result.sessions.find((s) => s.id === moved.id)).toEqual(moved);
    expect(result.sessions.some((s) => s.occurrenceKey === deleted.occurrenceKey)).toBe(false);
    expect(result.exclusions).toEqual(cycle.exclusions);
  });

  it('detects content deviations even without a manual flag and only applies scheduling after approval', () => {
    const cycle = planned();
    const edited = cycle.sessions[0];
    edited.contents[0].content = 'Nicht markierte Trainerentscheidung';
    cycle.slots[0].startTime = '20:00';
    const preview = regenerationPreview(cycle);
    const row = preview.rows.find((r) => r.before?.id === edited.id)!;
    expect(row.kind).toBe('conflict');
    row.choice = 'apply';
    const result = applyRegeneration(cycle, preview).sessions.find((s) => s.id === edited.id)!;
    expect(result.startTime).toBe('20:00');
    expect(result.contents).toEqual(edited.contents);
    expect(result.manuallyModified).toBe(true);
  });

  it.each(['completed', 'cancelled', 'moved'] as const)(
    'protects %s sessions from schedule changes',
    (status) => {
      const cycle = planned();
      cycle.sessions[0].status = status;
      cycle.slots[0].startTime = '20:00';
      const preview = regenerationPreview(cycle);
      const row = preview.rows.find((r) => r.before?.id === cycle.sessions[0].id)!;
      expect(row.canApply).toBe(false);
      row.choice = 'apply';
      expect(() => applyRegeneration(cycle, preview)).toThrow('nicht übernommen');
      row.choice = 'keep';
      expect(applyRegeneration(cycle, preview).sessions[0]).toEqual(cycle.sessions[0]);
    },
  );

  it('protects actual records and session goals when source dates disappear', () => {
    const cycle = planned();
    const actual = cycle.sessions[0];
    actual.contents[0].actualArrowCount = 0;
    actual.actualDuration = 0;
    const goalSession = cycle.sessions[1];
    cycle.goals.push({
      id: id(),
      scope: 'session',
      reference: goalSession.id,
      description: 'Ziel',
      category: 'MENTAL',
      targetValue: null,
      unit: '',
      status: 'open',
    });
    cycle.slots[0].validFrom = '2026-10-20';
    const preview = regenerationPreview(cycle);
    for (const session of [actual, goalSession]) {
      const row = preview.rows.find((r) => r.before?.id === session.id)!;
      expect(row.kind).toBe('conflict');
      expect(row.canApply).toBe(false);
      row.choice = 'keep';
    }
    const result = applyRegeneration(cycle, preview);
    expect(result.sessions.find((s) => s.id === actual.id)).toEqual(actual);
    expect(result.goals).toEqual(cycle.goals);
    expect(validateCycle(result)).toEqual([]);
  });

  it('reconciles weekday, validity, and cycle boundaries and can restore source-removed dates', () => {
    const cycle = planned();
    cycle.slots[0].weekday = 4;
    cycle.endDate = '2026-10-15';
    cycle.competitions[0].date = cycle.endDate;
    const preview = regenerationPreview(cycle);
    expect(preview.rows.some((r) => r.kind === 'remove')).toBe(true);
    expect(preview.rows.some((r) => r.kind === 'add')).toBe(true);
    const result = applyRegeneration(cycle, preview);
    expect(result.sessions.map((s) => s.date)).toEqual(['2026-10-01', '2026-10-08', '2026-10-15']);
    expect(result.exclusions).toEqual([]);
    result.slots[0].weekday = 2;
    expect(
      applyRegeneration(result, regenerationPreview(result)).sessions.map((s) => s.date),
    ).toEqual(['2026-09-29', '2026-10-06', '2026-10-13']);
  });

  it('reassigns surviving identities after phase deletion and leaves overlapping phases unassigned', () => {
    const cycle = planned();
    const first = cycle.sessions[0];
    const removedId = first.mesoCycleId;
    cycle.mesocycles = cycle.mesocycles.filter((m) => m.id !== removedId);
    cycle.mesocycles[0].startDate = cycle.startDate;
    for (const session of cycle.sessions)
      if (session.mesoCycleId === removedId) session.mesoCycleId = null;
    const next = applyRegeneration(cycle, regenerationPreview(cycle));
    expect(next.sessions[0].id).toBe(first.id);
    expect(next.sessions[0].mesoCycleId).toBe(cycle.mesocycles[0].id);
    next.mesocycles.push({ ...next.mesocycles[0], id: id() });
    expect(applyRegeneration(next, regenerationPreview(next)).sessions[0].mesoCycleId).toBeNull();
  });

  it('handles reduction, suspension, camp slots, and explicit overrides without inventing deletion exclusions', () => {
    const cycle = planned();
    cycle.periods.push({
      id: id(),
      name: 'Ferien',
      startDate: cycle.startDate,
      endDate: cycle.endDate,
      type: 'holiday',
      trainingPolicy: 'reduced',
      durationPercent: 50,
      retainedSlotIds: null,
    });
    const reduced = applyRegeneration(cycle, regenerationPreview(cycle));
    expect(reduced.sessions.every((s) => s.reduced && s.plannedDuration === 60)).toBe(true);
    reduced.periods[0].trainingPolicy = 'suspended';
    const suspended = applyRegeneration(reduced, regenerationPreview(reduced));
    expect(suspended.sessions).toEqual([]);
    const preview = regenerationPreview(suspended);
    preview.rows[0].choice = 'apply';
    const overridden = applyRegeneration(suspended, preview);
    expect(overridden.sessions).toHaveLength(1);
    expect(overridden.exclusions).toEqual([]);
    suspended.slots[0].campOnly = true;
    expect(regenerationPreview(suspended).rows).toEqual([]);
    suspended.periods[0].trainingPolicy = 'camp';
    expect(regenerationPreview(suspended).rows.every((r) => r.kind === 'add')).toBe(true);
  });

  it('conservatively preserves old sessions with no baseline and detached sessions', () => {
    const cycle = planned();
    for (const session of cycle.sessions) delete session.generationBaseline;
    cycle.slots[0].startTime = '20:00';
    const preview = regenerationPreview(cycle);
    expect(preview.rows.every((r) => r.kind === 'conflict')).toBe(true);
    for (const row of preview.rows) row.choice = 'keep';
    expect(applyRegeneration(cycle, preview)).toEqual(cycle);
    cycle.slots = [];
    for (const session of cycle.sessions) session.sourceTrainingSlotId = null;
    expect(applyRegeneration(cycle, regenerationPreview(cycle))).toEqual(cycle);
  });

  it('rejects stale and invalid previews without changing the aggregate', () => {
    const cycle = planned();
    const stale = regenerationPreview(cycle);
    cycle.sessions[0].notes = 'Spätere Änderung';
    expect(() => applyRegeneration(cycle, stale)).toThrow('erneut erstellen');
    cycle.sessions[0].notes = '';
    cycle.slots[0].startTime = '20:00';
    const preview = regenerationPreview(cycle);
    preview.rows[0].after!.mesoCycleId = 'missing';
    const before = structuredClone(cycle);
    expect(() => applyRegeneration(cycle, preview)).toThrow('fehlende Phase');
    expect(cycle).toEqual(before);
  });

  it('updates untouched phase type defaults and persists declined new dates', () => {
    const cycle = planned();
    cycle.mesocycles.forEach((phase) => (phase.type = 'UWV'));
    const result = applyRegeneration(cycle, regenerationPreview(cycle));
    expect(
      result.sessions.every(
        (s) => s.sessionType === 'ZPT' && s.contents[0].content === 'Aufwärmen und Einschießen',
      ),
    ).toBe(true);
    result.slots[0].weekday = 4;
    const preview = regenerationPreview(result);
    const declined = preview.rows.find((r) => r.kind === 'add')!;
    declined.choice = 'keep';
    const next = applyRegeneration(result, preview);
    expect(next.exclusions).toContain(declined.key);
    expect(regenerationPreview(next).rows.find((r) => r.key === declined.key)?.kind).toBe(
      'excluded',
    );
  });
});
