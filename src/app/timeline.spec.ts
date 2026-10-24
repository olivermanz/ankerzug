import { describe, expect, it } from 'vitest';
import fixture from '../../fixtures/workspace-regeneration.json';
import { MacroCycle } from './models';
import { cycleWarnings } from './planning';
import { projectedTimeline, timelinePreview } from './timeline';

function cycle(): MacroCycle {
  const c = structuredClone(fixture.workspace.cycles[0]) as MacroCycle;
  const original = c.mesocycles[0];
  const duplicate = structuredClone(c.sessions[0]);
  duplicate.id = crypto.randomUUID();
  duplicate.occurrenceKey = 'timeline-copy';
  duplicate.contents.forEach((b) => (b.id = crypto.randomUUID()));
  c.sessions.push(duplicate);
  c.mesocycles = [
    { ...original, startDate: c.startDate, endDate: '2026-10-11', legacyArrowCount: 80 },
    {
      ...original,
      id: crypto.randomUUID(),
      name: 'Zweite Phase',
      startDate: '2026-10-12',
      endDate: c.endDate,
      volume: 5,
    },
  ];
  c.sessions.forEach((s) => {
    s.mesoCycleId = c.mesocycles[0].id;
    s.manuallyModified = false;
  });
  c.goals = [
    {
      id: crypto.randomUUID(),
      scope: 'mesocycle',
      reference: original.id,
      description: 'Technik',
      category: 'SCHIESSTECHNIK',
      targetValue: null,
      unit: '',
      status: 'open',
    },
  ];
  return c;
}

describe('mesocycle timeline transformations', () => {
  it('splits inclusive dates without mutation and preserves metadata, observations and manual decisions', () => {
    const c = cycle();
    c.sessions[0].date = '2026-10-06';
    c.sessions[0].manuallyModified = true;
    c.sessions[1].date = '2026-10-07';
    const before = structuredClone(c);
    const preview = timelinePreview(c, {
      kind: 'split',
      phaseId: c.mesocycles[0].id,
      date: '2026-10-05',
    });
    expect(c).toEqual(before);
    expect(preview.phases[0].endDate).toBe('2026-10-04');
    expect(preview.phases[1].startDate).toBe('2026-10-05');
    expect(preview.phases[1].legacyArrowCount).toBe(80);
    expect(preview.assignments[0].next).toBe(c.mesocycles[0].id);
    expect(preview.assignments[1].next).toBe(preview.phases[1].id);
    const next = projectedTimeline(c, preview);
    expect(next.goals).toEqual(c.goals);
    next.sessions.forEach((s, i) =>
      expect({
        ...s,
        mesoCycleId: c.sessions[i].mesoCycleId,
        manuallyModified: c.sessions[i].manuallyModified,
      }).toEqual(c.sessions[i]),
    );
    expect(next.sessions[1].manuallyModified).toBe(true);
  });
  it('protects an explicit choice to retain an unchanged automatic assignment against regeneration', () => {
    const c = cycle();
    c.sessions[0].date = '2026-10-06';
    const p = timelinePreview(c, {
      kind: 'split',
      phaseId: c.mesocycles[0].id,
      date: '2026-10-05',
    });
    expect(p.assignments[0].suggested).not.toBe(c.sessions[0].mesoCycleId);
    p.assignments[0].next = c.sessions[0].mesoCycleId;
    const next = projectedTimeline(c, p);
    expect(next.sessions[0].mesoCycleId).toBe(c.sessions[0].mesoCycleId);
    expect(next.sessions[0].manuallyModified).toBe(true);
  });
  it.each(['2026-09-28', '2026-10-12', '2026-02-30', ''])(
    'rejects invalid split %s without changing the cycle',
    (date) => {
      const c = cycle();
      const before = structuredClone(c);
      expect(() =>
        timelinePreview(c, { kind: 'split', phaseId: c.mesocycles[0].id, date }),
      ).toThrow();
      expect(c).toEqual(before);
    },
  );
  it('allows a one-day second part and merges contiguous phases with goal transfer and first settings', () => {
    const c = cycle();
    expect(
      timelinePreview(c, { kind: 'split', phaseId: c.mesocycles[0].id, date: '2026-10-11' })
        .phases[1].endDate,
    ).toBe('2026-10-11');
    c.goals[0].reference = c.mesocycles[1].id;
    c.sessions[0].mesoCycleId = c.mesocycles[1].id;
    c.sessions[0].manuallyModified = true;
    const p = timelinePreview(c, {
      kind: 'merge',
      phaseId: c.mesocycles[0].id,
      otherId: c.mesocycles[1].id,
    });
    const next = projectedTimeline(c, p);
    expect(next.mesocycles).toEqual([{ ...c.mesocycles[0], endDate: c.endDate }]);
    expect(next.goals[0].reference).toBe(c.mesocycles[0].id);
    expect(next.sessions[0].mesoCycleId).toBe(c.mesocycles[0].id);
    c.mesocycles[1].startDate = '2026-10-13';
    expect(() =>
      timelinePreview(c, {
        kind: 'merge',
        phaseId: c.mesocycles[0].id,
        otherId: c.mesocycles[1].id,
      }),
    ).toThrow('lückenlose');
  });
  it('inserts in a gap, assigns unassigned sessions, and rejects an overlapping insertion', () => {
    const c = cycle();
    c.mesocycles[0].endDate = '2026-10-04';
    c.sessions[0].date = '2026-10-06';
    c.sessions[0].mesoCycleId = null;
    const p = timelinePreview(c, {
      kind: 'insert',
      phaseId: c.mesocycles[0].id,
      startDate: '2026-10-05',
      endDate: '2026-10-11',
    });
    expect(p.phases[1].legacyArrowCount).toBeNull();
    expect(p.assignments[0].next).toBe(p.phases[1].id);
    expect(() =>
      timelinePreview(c, {
        kind: 'insert',
        phaseId: c.mesocycles[0].id,
        startDate: '2026-10-04',
        endDate: '2026-10-12',
      }),
    ).toThrow('Lücke');
  });
  it('previews deletion without dropping sessions or goals and permits explicit reassignment', () => {
    const c = cycle();
    const p = timelinePreview(c, { kind: 'delete', phaseId: c.mesocycles[0].id });
    expect(p.assignments.every((a) => a.next === null)).toBe(true);
    p.assignments[0].next = c.mesocycles[1].id;
    const next = projectedTimeline(c, p);
    expect(next.sessions).toHaveLength(c.sessions.length);
    expect(next.goals[0]).toEqual({ ...c.goals[0], scope: 'macrocycle', reference: c.id });
    expect(next.sessions[0].mesoCycleId).toBe(c.mesocycles[1].id);
  });
  it('keeps spatial warnings ignorable while rejecting invalid, stale and broken assignment previews', () => {
    const c = cycle();
    const p = timelinePreview(c, {
      kind: 'boundary',
      phaseId: c.mesocycles[0].id,
      field: 'endDate',
      date: '2026-10-15',
    });
    expect(cycleWarnings(projectedTimeline(c, p)).some((w) => w.includes('überlappende'))).toBe(
      true,
    );
    expect(() =>
      timelinePreview(c, {
        kind: 'boundary',
        phaseId: c.mesocycles[0].id,
        field: 'endDate',
        date: '2026-09-27',
      }),
    ).toThrow();
    p.assignments[0].next = 'missing';
    expect(() => projectedTimeline(c, p)).toThrow();
    c.name += ' edit';
    expect(() => projectedTimeline(c, p)).toThrow('geändert');
  });
});
