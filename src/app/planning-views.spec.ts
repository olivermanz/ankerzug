import { describe, expect, it } from 'vitest';
import fixture from '../../fixtures/workspace-v2.json';
import { MacroCycle } from './models';
import { newContent } from './planning';
import {
  calendarDates,
  calendarWeeks,
  emptySessionFilters,
  filterSessions,
  mesocycleCompositions,
  plannedPhaseSummary,
  shiftCalendar,
} from './planning-views';

const cycle = () => structuredClone(fixture.workspace.cycles[0]) as MacroCycle;
describe('planning views independent of persistence', () => {
  it('spans mesocycle ribbons across inclusive dates, splits weeks and separates overlaps', () => {
    const c = cycle(),
      base = c.mesocycles[0];
    c.mesocycles = [
      { ...base, id: 'main', startDate: '2026-12-30', endDate: '2027-01-12' },
      { ...base, id: 'overlap', startDate: '2027-01-06', endDate: '2027-01-08' },
      { ...base, id: 'shared-boundary', startDate: '2027-01-08', endDate: '2027-01-10' },
      { ...base, id: 'adjacent', startDate: '2027-01-09', endDate: '2027-01-10' },
      { ...base, id: 'outside', startDate: '2028-01-01', endDate: '2028-01-31' },
    ];
    const before = structuredClone(c);
    const weeks = calendarWeeks(c, '2027-01-01', 'month');
    const main = weeks.flatMap((w) => w.ribbons).filter((r) => r.phase.id === 'main');
    expect(main.map((r) => [r.column, r.span, r.continuesBefore, r.continuesAfter])).toEqual([
      [3, 5, false, true],
      [1, 7, true, true],
      [1, 2, true, false],
    ]);
    const middle = weeks[1].ribbons;
    expect(middle.map((r) => [r.phase.id, r.column, r.span, r.lane])).toEqual([
      ['main', 1, 7, 0],
      ['overlap', 3, 3, 1],
      ['shared-boundary', 5, 3, 2],
      ['adjacent', 6, 2, 1],
    ]);
    expect(calendarWeeks(c, '2027-01-08', 'week')[0].ribbons).toEqual(middle);
    expect(weeks.flatMap((w) => w.ribbons).some((r) => r.phase.id === 'outside')).toBe(false);
    expect(calendarWeeks(c, '', 'month')).toEqual([]);
    expect(c).toEqual(before);
  });

  it('combines inclusive date, phase, slot, status and content filters without changing records', () => {
    const c = cycle();
    const base = c.sessions[0];
    c.sessions = [
      {
        ...structuredClone(base),
        id: 'later',
        date: '2026-10-31',
        startTime: '19:00',
        individuallyPlanned: false,
        status: 'planned',
      },
      {
        ...structuredClone(base),
        id: 'early',
        date: '2026-10-31',
        startTime: '09:00',
        individuallyPlanned: false,
        status: 'planned',
      },
      {
        ...structuredClone(base),
        id: 'done',
        date: '2026-10-31',
        individuallyPlanned: true,
        status: 'completed',
      },
      { ...structuredClone(base), id: 'outside', date: '2026-11-01' },
      {
        ...structuredClone(base),
        id: 'manual',
        date: '2026-10-31',
        sourceTrainingSlotId: null,
        mesoCycleId: null,
      },
    ];
    const before = structuredClone(c);
    expect(
      filterSessions(c, {
        phase: base.mesoCycleId!,
        slot: base.sourceTrainingSlotId!,
        from: '2026-10-31',
        until: '2026-10-31',
        status: 'planned',
        content: 'unplanned',
      }).map((s) => s.id),
    ).toEqual(['early', 'later']);
    expect(
      filterSessions(c, { ...emptySessionFilters(), phase: 'none', slot: 'none' }).map((s) => s.id),
    ).toEqual(['manual']);
    expect(
      filterSessions(c, { ...emptySessionFilters(), status: 'completed', content: 'planned' }).map(
        (s) => s.id,
      ),
    ).toEqual(['done']);
    expect(
      filterSessions(c, { ...emptySessionFilters(), from: '2026-11-01', until: '2026-10-31' }),
    ).toEqual([]);
    for (const status of ['cancelled', 'moved'] as const) {
      c.sessions[0].status = status;
      expect(filterSessions(c, { ...emptySessionFilters(), status }).map((s) => s.id)).toEqual([
        'later',
      ]);
    }
    c.sessions[0].status = 'planned';
    expect(c).toEqual(before);
  });
  it('uses complete Monday weeks across month/year, leap-day and daylight-saving boundaries', () => {
    expect(calendarDates('2027-01-01', 'week')).toEqual([
      '2026-12-28',
      '2026-12-29',
      '2026-12-30',
      '2026-12-31',
      '2027-01-01',
      '2027-01-02',
      '2027-01-03',
    ]);
    const leap = calendarDates('2028-02-29', 'month');
    expect(leap[0]).toBe('2028-01-31');
    expect(leap.at(-1)).toBe('2028-03-05');
    expect(leap).toHaveLength(35);
    expect(calendarDates('2026-10-25', 'week')).toContain('2026-10-25');
    expect(calendarDates('2026-03-29', 'week')).toHaveLength(7);
    expect(calendarDates('2026-02-30', 'month')).toEqual([]);
    expect(calendarDates('', 'week')).toEqual([]);
    expect(shiftCalendar('2026-12-31', 'month', 1)).toBe('2027-01-01');
    expect(shiftCalendar('2027-01-01', 'month', -1)).toBe('2026-12-01');
    expect(shiftCalendar('2026-12-31', 'week', 1)).toBe('2027-01-07');
    expect(shiftCalendar('0099-12-31', 'month', 1)).toBe('0100-01-01');
  });
  it('summarizes only current planned data, retaining partial quantities without double counting', () => {
    const c = cycle(),
      p = c.mesocycles[0],
      base = c.sessions[0];
    const b = { ...newContent(), plannedArrowCount: 20 };
    c.sessions = [
      {
        ...structuredClone(base),
        id: 'explicit',
        mesoCycleId: p.id,
        plannedDuration: 60,
        plannedArrowCount: 100,
        actualArrowCount: 999,
        originalPlan: { duration: 999, arrows: 999, partialArrows: 999 },
        contents: [b],
        status: 'completed',
      },
      {
        ...structuredClone(base),
        id: 'partial',
        mesoCycleId: p.id,
        plannedDuration: 90,
        plannedArrowCount: null,
        contents: [b, newContent()],
        status: 'cancelled',
      },
      {
        ...structuredClone(base),
        id: 'moved',
        mesoCycleId: p.id,
        plannedDuration: 999,
        plannedArrowCount: 999,
        status: 'moved',
      },
    ];
    c.periods = [
      {
        id: 'period',
        name: 'Ferien',
        startDate: p.endDate,
        endDate: '2027-01-01',
        type: 'school',
        trainingPolicy: 'reduced',
        retainedSlotIds: null,
        durationPercent: null,
      },
    ];
    const result = plannedPhaseSummary(c, p);
    expect(result.count).toBe(2);
    expect(result.minutes).toBe(150);
    expect(result.arrows).toEqual({ total: null, partial: 120, recorded: 1, expected: 2 });
    expect(result.sessions).toHaveLength(3);
    expect(result.periods.map((p) => p.id)).toEqual(['period']);
    c.sessions[1].contents.pop();
    expect(plannedPhaseSummary(c, p).arrows.total).toBe(120);
    c.sessions[0].plannedArrowCount = 0;
    expect(plannedPhaseSummary(c, p).arrows.total).toBe(20);
    c.sessions = [];
    expect(plannedPhaseSummary(c, p).arrows).toEqual({
      total: null,
      partial: 0,
      recorded: 0,
      expected: 0,
    });
  });
  it('derives ordered mesocycle type shares without counting moved sessions', () => {
    const c = cycle();
    const [first] = c.mesocycles;
    const second = { ...first, id: 'later', startDate: '2027-01-01', endDate: '2027-01-01' };
    c.mesocycles = [second, { ...first, id: 'first', endDate: '2026-09-28' }];
    const base = c.sessions[0];
    c.sessions = [
      { ...base, id: 'bat-1', mesoCycleId: 'first', sessionType: 'BAT', status: 'planned' },
      { ...base, id: 'bat-2', mesoCycleId: 'first', sessionType: 'BAT', status: 'completed' },
      { ...base, id: 'et', mesoCycleId: 'first', sessionType: 'ET', status: 'cancelled' },
      { ...base, id: 'mt', mesoCycleId: 'first', sessionType: 'MT', status: 'planned' },
      { ...base, id: 'moved', mesoCycleId: 'first', sessionType: 'LK', status: 'moved' },
    ];
    const before = structuredClone(c);
    const summaries = mesocycleCompositions(c);
    expect(summaries.map((summary) => summary.phase.id)).toEqual(['first', 'later']);
    expect(summaries[0].days).toBe(1);
    expect(summaries[0].segments).toEqual([
      { sessionType: 'BAT', count: 2, share: 0.5 },
      { sessionType: 'ET', count: 1, share: 0.25 },
      { sessionType: 'MT', count: 1, share: 0.25 },
    ]);
    expect(summaries[1].segments).toEqual([]);
    expect(c).toEqual(before);
  });
});
