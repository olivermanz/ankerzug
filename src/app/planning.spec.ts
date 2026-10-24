import { describe, it, expect } from 'vitest';
import fixture from '../../fixtures/workspace-v2.json';
import { Backup, id, MacroCycle, MESOCYCLE_COLORS } from './models';
import {
  acceptPreview,
  captureOriginalPlan,
  summarize,
  mondayOf,
  sessionArrows,
  detailedWarnings,
  dateAt,
  dayNumber,
  applyTemplate,
  basisTemplates,
  contentWarnings,
  cycleWarnings,
  dayCount,
  generatePreview,
  newContent,
  newCycle,
  nextOffset,
  sequenceContents,
  phaseProposal,
  validDate,
  validateContents,
  validateWorkspace,
} from './planning';
function cycle(): MacroCycle {
  const c = newCycle();
  c.name = 'Hallensaison 2026';
  c.competitions[0].name = 'Landesmeisterschaft Halle';
  return c;
}
function withSlots(): MacroCycle {
  const c = cycle();
  c.mesocycles = phaseProposal(c);
  c.slots = [2, 4, 6].map((weekday) => ({
    id: id(),
    name: 'Training',
    sessionType: 'BAT',
    campOnly: false,
    weekday,
    startTime: weekday === 6 ? '10:00' : '18:00',
    defaultDuration: 120,
    location: '',
    validFrom: '',
    validUntil: '',
  }));
  return c;
}
describe('periodization', () => {
  it('limits free-text goals on training contents to 300 characters', () => {
    const content = newContent();
    content.goals = 'a'.repeat(301);
    expect(validateContents([content])).toContain(
      'Inhaltsblöcke benötigen Text, einen ganzzahligen Start ab 0 und eine positive Dauer.',
    );
  });

  it.each(['KAT', 'KT', 'KNT'] as const)(
    'generates and validates %s sessions from slots without assigning load or arrow counts',
    (sessionType) => {
      const c = withSlots();
      c.mesocycles = [];
      c.slots.forEach((slot) => (slot.sessionType = sessionType));
      const preview = generatePreview(c);
      expect(preview.length).toBeGreaterThan(0);
      expect(preview.every((row) => row.sessionType === sessionType)).toBe(true);
      acceptPreview(c, preview);
      expect(c.sessions.every((session) => session.sessionType === sessionType)).toBe(true);
      expect(c.sessions[0].contents[0].content).toBe('Aufwärmen und Einschießen');
      expect(c.sessions[0].plannedArrowCount).toBeNull();
      expect(c.sessions[0].volume).toBeNull();
      expect(validateWorkspace({ cycles: [c], templates: [] })).toEqual([]);
    },
  );
  it.each([
    ['VP1', 'ET'],
    ['VP2', 'KNT'],
    ['WP', 'BAT'],
    ['UWV', 'ZPT'],
  ] as const)('prefills %s with %s while keeping preview edits', (phase, type) => {
    const c = withSlots();
    c.mesocycles = [
      { ...c.mesocycles[0], type: phase, startDate: c.startDate, endDate: c.endDate },
    ];
    c.slots.forEach((s) => (s.sessionType = 'MT'));
    const preview = generatePreview(c);
    expect(preview.length).toBeGreaterThan(0);
    expect(preview.every((r) => r.sessionType === type)).toBe(true);
    preview[0].sessionType = 'KT';
    acceptPreview(c, preview);
    expect(c.sessions[0].sessionType).toBe('KT');
    expect(c.sessions.slice(1).every((s) => s.sessionType === type)).toBe(true);
    expect(c.slots.every((s) => s.sessionType === 'MT')).toBe(true);
  });
  it('defaults proposals to grey and validates the six mesocycle colors', () => {
    const c = withSlots();
    expect(c.mesocycles.every((m) => m.color === 'grey')).toBe(true);
    for (const color of Object.keys(MESOCYCLE_COLORS)) {
      Object.assign(c.mesocycles[0], { color });
      expect(validateWorkspace({ cycles: [c], templates: [] })).toEqual([]);
    }
    Object.assign(c.mesocycles[0], { color: 'purple' });
    expect(validateWorkspace({ cycles: [c], templates: [] })).toContain(
      'Ungültige Mesozyklusfarbe.',
    );
  });

  it.each([null, 0, 80, 100])('accepts the renamed arrow count %s', (value) => {
    const c = withSlots();
    c.mesocycles[0].legacyArrowCount = value;
    expect(validateWorkspace({ cycles: [c], templates: [] })).toEqual([]);
  });
  it.each([-1, 0.5, 101, NaN])('rejects arrow count %s', (value) => {
    const c = withSlots();
    c.mesocycles[0].legacyArrowCount = value;
    expect(validateWorkspace({ cycles: [c], templates: [] })).toContain(
      'Belastungsdimensionen: 1–5; Legacy-Pfeilwert: 0–100.',
    );
  });
  it('matches the complete section 31 fixture', () => {
    expect(
      phaseProposal(
        (() => {
          const c = cycle();
          c.planning.phases!.find((phase) => phase.code === 'WP')!.proposalWeight = 3;
          c.planning.phases!.find((phase) => phase.code === 'UWV')!.proposalWeight = 2;
          return c;
        })(),
      ).map((m) => [m.startDate, m.endDate, m.legacyArrowCount, m.competitionSpecificity]),
    ).toEqual([
      ['2026-09-28', '2026-10-11', null, 1],
      ['2026-10-12', '2026-11-01', null, 3],
      ['2026-11-02', '2026-11-22', null, 4],
      ['2026-11-23', '2026-12-06', null, 5],
    ]);
  });
  it('orders an inserted catalog preparation phase without a planner branch', () => {
    const c = cycle();
    const vp3 = structuredClone(c.planning.phases!.find((phase) => phase.code === 'VP2')!);
    Object.assign(vp3, { code: 'VP3', label: 'VP3', displayOrder: 3, proposalOrder: 3 });
    c.planning.phases!.find((phase) => phase.code === 'WP')!.displayOrder = 4;
    c.planning.phases!.find((phase) => phase.code === 'WP')!.proposalOrder = 4;
    c.planning.phases!.find((phase) => phase.code === 'UWV')!.displayOrder = 5;
    c.planning.phases!.find((phase) => phase.code === 'UWV')!.proposalOrder = 5;
    c.planning.phases!.find((phase) => phase.code === 'UEP')!.displayOrder = 6;
    c.planning.phases!.find((phase) => phase.code === 'UEP')!.proposalOrder = 6;
    c.planning.phases!.push(vp3);
    expect(phaseProposal(c).map((phase) => phase.type)).toContain('VP3');
  });
  it.each([1, 3, 7, 35, 41, 42, 57, 83, 120, 365, 1000])(
    'covers %i inclusive days without gaps or overlap',
    (days) => {
      const c = cycle();
      c.startDate = '2024-02-20';
      c.competitions[0].date = new Date(Date.parse(c.startDate) + (days - 1) * 86400000)
        .toISOString()
        .slice(0, 10);
      c.endDate = c.competitions[0].date;
      const phases = phaseProposal(c);
      expect(phases[0].startDate).toBe(c.startDate);
      expect(phases.at(-1)?.endDate).toBe(c.competitions[0].date);
      expect(phases.reduce((sum, m) => sum + dayCount(m.startDate, m.endDate), 0)).toBe(days);
      for (let i = 1; i < phases.length; i++)
        expect(dayCount(phases[i - 1].endDate, phases[i].startDate)).toBe(2);
      expect(phases.at(-1)?.type).toBe('UWV');
      if (days < 42) expect(phases.length).toBeLessThan(5);
    },
  );
  it('rejects impossible calendar dates', () => {
    expect(validDate('2024-02-29')).toBe(true);
    for (const date of ['2026-02-29', '2026-02-30', '2026-13-01', '0000-01-01', '6.12.2026'])
      expect(validDate(date)).toBe(false);
  });
  it('keeps arrow count independent of specificity and emits ignorable placement warnings', () => {
    const c = withSlots();
    const specificity = c.mesocycles[0].competitionSpecificity;
    c.mesocycles[0].legacyArrowCount = 80;
    expect(c.mesocycles[0].competitionSpecificity).toBe(specificity);
    c.mesocycles[0].endDate = c.mesocycles[1].startDate;
    expect(cycleWarnings(c).some((w) => w.includes('überlappende'))).toBe(true);
    expect(validateWorkspace({ cycles: [c], templates: [] })).toEqual([]);
  });
});
describe('generation and section 32 acceptance', () => {
  it('supports holidays, overrides, exclusions, default removal and applying independent template copies', () => {
    const c = withSlots();
    c.periods.push({
      id: id(),
      name: 'Schulferien',
      startDate: '2026-10-12',
      endDate: '2026-10-25',
      type: 'school',
      trainingPolicy: 'suspended',
      retainedSlotIds: null,
      durationPercent: null,
    });
    const preview = generatePreview(c);
    expect(preview).toHaveLength(30);
    expect(preview.filter((p) => !p.selected)).toHaveLength(6);
    expect(preview.every((p) => p.mesoCycleId !== null)).toBe(true);
    preview.find((p) => p.date === '2026-10-13')!.selected = true;
    preview[0].selected = false;
    acceptPreview(c, preview);
    expect(c.sessions).toHaveLength(24);
    expect(generatePreview(c)).toEqual([]);
    const s = c.sessions[0];
    expect(s.contents[0].content).toBe('Aufwärmen und Einschießen');
    expect(s.individuallyPlanned).toBe(false);
    s.contents = [];
    expect(nextOffset(s.contents)).toBe(0);
    s.contents.push(newContent(nextOffset(s.contents), 45, 'Technik'));
    s.contents.push(newContent(nextOffset(s.contents), 30, 'Scoring'));
    expect(s.contents[1].startOffsetMinutes).toBe(45);
    const t = {
      id: id(),
      name: 'Eigene Einheit',
      sessionType: 'BAT' as const,
      areas: [],
      volume: null,
      intensity: null,
      competitionSpecificity: null,
      description: '',
      defaultDuration: 90,
      contents: s.contents.map((b) => ({ ...b, id: id() })),
    };
    applyTemplate(c.sessions.slice(1, 3), t, 'replace');
    expect(c.sessions[1].individuallyPlanned).toBe(true);
    expect(c.sessions[2].contents[1].startOffsetMinutes).toBe(45);
    c.sessions[1].contents[0].content = 'Bearbeitet';
    expect(c.sessions[2].contents[0].content).toBe('Technik');
    expect(t.contents[0].content).toBe('Technik');
    expect(validateWorkspace({ cycles: [c], templates: [t] })).toEqual([]);
  });
  it('preserves local time over daylight savings and honors validity boundaries', () => {
    const c = withSlots();
    c.slots = [c.slots[0]];
    c.slots[0].validFrom = '2026-10-20';
    c.slots[0].validUntil = '2026-10-27';
    expect(generatePreview(c).map((p) => [p.date, p.startTime])).toEqual([
      ['2026-10-20', '18:00'],
      ['2026-10-27', '18:00'],
    ]);
  });
  it('leaves ambiguous assignment explicit and reports conflicting special periods', () => {
    const c = withSlots();
    c.mesocycles.push({ ...c.mesocycles[0], id: id() });
    c.periods = [
      {
        id: id(),
        name: 'Ferien',
        startDate: c.startDate,
        endDate: c.competitions[0].date,
        type: 'school',
        trainingPolicy: 'suspended',
        retainedSlotIds: null,
        durationPercent: null,
      },
      {
        id: id(),
        name: 'Lager',
        startDate: c.startDate,
        endDate: c.competitions[0].date,
        type: 'camp',
        trainingPolicy: 'reduced',
        retainedSlotIds: null,
        durationPercent: null,
      },
    ];
    const p = generatePreview(c)[0];
    expect(p.ambiguous).toBe(true);
    expect(p.mesoCycleId).toBeNull();
    expect(p.selected).toBe(false);
    expect(p.reduced).toBe(true);
    expect(cycleWarnings(c).some((w) => w.includes('überlappende Sonderzeiträume'))).toBe(true);
  });
  it('derives timing from durations and includes pauses when applying a template', () => {
    const c = withSlots();
    acceptPreview(c, generatePreview(c));
    const session = c.sessions[0];
    const template = basisTemplates()[0];
    template.contents = [newContent(80, 15, 'Technik'), newContent(5, 10, 'Pause')];
    template.contents[1].category = 'Pause';
    template.contents[1].areas = [];
    expect(nextOffset(template.contents)).toBe(25);
    applyTemplate([session], template, 'append');
    expect(session.contents.map((b) => b.startOffsetMinutes)).toEqual([0, 30, 45]);
    expect(validateWorkspace({ cycles: [c], templates: [template] })).toEqual([]);
    expect(contentWarnings(session)).toEqual([]);
    sequenceContents(template.contents);
    expect(template.contents.map((b) => b.startOffsetMinutes)).toEqual([0, 15]);
  });

  it('append shifts offsets; empty mode protects existing warm-up and changed content', () => {
    const c = withSlots();
    acceptPreview(c, generatePreview(c));
    const s = c.sessions[0];
    const t = basisTemplates()[0];
    applyTemplate([s], t, 'empty');
    expect(s.contents).toHaveLength(1);
    expect(s.individuallyPlanned).toBe(false);
    applyTemplate([s], t, 'append');
    expect(s.contents[1].startOffsetMinutes).toBe(30);
    expect(s.plannedDuration).toBe(120);
    expect(
      contentWarnings({
        plannedDuration: 30,
        contents: [newContent(10, 30, 'A'), newContent(20, 20, 'B')],
      }),
    ).toHaveLength(4);
  });
  it('reads the shared Rust/TypeScript serialization fixture without defaults', () => {
    const backup = fixture as Backup;
    expect(backup.formatVersion).toBe(2);
    expect(validateWorkspace(backup.workspace)).toEqual([]);
    expect(backup.workspace.cycles[0].mesocycles[0].legacyArrowCount).toBe(80);
    expect(backup.workspace.cycles[0].sessions[0].name).toBe('Vereinstraining');
    expect(backup.workspace.cycles[0].competitions[0].priority).toBe('A');
    expect(JSON.parse(JSON.stringify(backup))).toEqual(fixture);
  });
});

describe('revised planning acceptance', () => {
  it('plans close A peaks with repeated targeted UWV, B/C events and a post-main UEP', () => {
    const c = cycle();
    c.competitions.push(
      { id: id(), name: 'Zweiter Höhepunkt', date: '2026-12-20', priority: 'A', location: '' },
      { id: id(), name: 'Test', date: '2026-10-10', priority: 'C', location: '' },
    );
    c.endDate = '2026-12-27';
    const phases = phaseProposal(c);
    expect(phases.map((m) => m.type)).toEqual(['VP1', 'VP2', 'WP', 'UWV', 'WP', 'UWV', 'UEP']);
    expect(
      phases.filter((m) => m.type === 'UWV').map((m) => [m.targetCompetitionId, m.sequenceNumber]),
    ).toEqual([
      [c.mainCompetitionId, 1],
      [c.competitions[1].id, 2],
    ]);
    expect(phases.at(-1)?.endDate).toBe(c.endDate);
    expect(phases[4].description).toContain('fortsetzen');
    expect(phaseProposal(c).map(({ id: _, ...m }) => m)).toEqual(
      phases.map(({ id: _, ...m }) => m),
    );
    c.mesocycles = phases;
    expect(validateWorkspace({ cycles: [c], templates: [] })).toEqual([]);
  });
  it('explains omitted phases and treats same-day A peaks as a single interval', () => {
    const c = cycle();
    c.startDate = c.endDate;
    c.competitions.push({ ...c.competitions[0], id: id(), name: 'Gleichzeitig' });
    const phases = phaseProposal(c);
    expect(phases).toHaveLength(1);
    expect(phases[0].type).toBe('UWV');
    expect(phases[0].description).toContain('Ausgelassen');
    expect(phases[0].description).toContain('Gleichzeitiger');
    c.mesocycles = phases;
    expect(detailedWarnings(c).some((w) => w.message.includes('ohne UWV'))).toBe(false);
  });
  it('uses deliberately selected holiday slots/durations, camps and type-aware warm-up through endDate', () => {
    const c = withSlots();
    c.endDate = '2026-12-13';
    const period = {
      id: id(),
      name: 'Ferien',
      startDate: c.startDate,
      endDate: c.endDate,
      type: 'school' as const,
      trainingPolicy: 'reduced' as const,
      retainedSlotIds: [c.slots[0].id],
      durationPercent: 50,
    };
    c.periods.push(period);
    const preview = generatePreview(c);
    expect(
      preview
        .filter((r) => r.selected)
        .every((r) => r.slotId === c.slots[0].id && r.duration === 60),
    ).toBe(true);
    expect(preview.some((r) => r.date > '2026-12-06')).toBe(true);
    preview[0].sessionType = 'MT';
    preview[0].applyProfile = true;
    preview[0].profile.volume = 2;
    acceptPreview(c, preview);
    expect(c.sessions[0].contents).toEqual([]);
    expect(c.sessions[0].volume).toBe(2);
    expect(generatePreview(c)).toEqual([]);
    const camp = withSlots();
    camp.slots[0].campOnly = true;
    expect(generatePreview(camp).some((r) => r.slotId === camp.slots[0].id)).toBe(false);
    camp.periods.push({
      ...period,
      id: id(),
      trainingPolicy: 'camp',
      retainedSlotIds: null,
      durationPercent: null,
    });
    expect(generatePreview(camp).some((r) => r.slotId === camp.slots[0].id)).toBe(true);
    for (const policy of ['normal', 'unchanged', 'suspended', 'reduced'] as const) {
      const x = withSlots();
      x.periods.push({
        ...period,
        trainingPolicy: policy,
        retainedSlotIds: null,
        durationPercent: null,
      });
      expect(generatePreview(x).every((r) => r.selected)).toBe(policy !== 'suspended');
    }
  });
  it('counts session totals once and preserves zero, partial data, missing actuals and Monday boundaries', () => {
    const c = withSlots();
    acceptPreview(c, generatePreview(c));
    const s = c.sessions[0];
    Object.assign(s, {
      status: 'completed',
      plannedArrowCount: 180,
      actualArrowCount: 150,
      actualDuration: 100,
    });
    Object.assign(s.contents[0], { plannedArrowCount: 999, actualArrowCount: 999 });
    const totals = summarize([s]);
    expect(totals.durationDelta.total).toBe(-20);
    expect(totals.arrowDelta.total).toBe(-30);
    expect(totals.plannedArrows.total).toBe(180);
    expect(totals.actualArrows.total).toBe(150);
    s.plannedArrowCount = null;
    s.actualArrowCount = null;
    s.contents.push(newContent(30, 30, 'B'));
    expect(sessionArrows(s)).toBeNull();
    expect(summarize([s]).actualArrows).toMatchObject({
      total: null,
      partial: 999,
      recorded: 0,
      expected: 1,
    });
    s.actualArrowCount = 0;
    expect(summarize([s]).actualArrows.total).toBe(0);
    s.actualArrowCount = null;
    s.actualDuration = null;
    s.contents.forEach((b) => (b.actualArrowCount = null));
    expect(summarize([s]).actualArrows.total).toBeNull();
    const cancelled = { ...s, id: id(), status: 'cancelled' as const };
    const moved = { ...s, id: id(), status: 'moved' as const };
    expect(summarize([s, cancelled, moved])).toMatchObject({
      count: 2,
      completed: 1,
      cancelled: 1,
    });
    expect(mondayOf('2026-10-25')).toBe('2026-10-19');
    expect(mondayOf('2026-10-26')).toBe('2026-10-26');
  });
  it('warns about null UWV targets and rejects dangling targets', () => {
    const c = withSlots();
    const uwv = c.mesocycles.find((m) => m.type === 'UWV')!;
    uwv.targetCompetitionId = null;
    expect(validateWorkspace({ cycles: [c], templates: [] })).toEqual([]);
    expect(detailedWarnings(c).some((w) => w.message.includes('ohne Zielwettkampf'))).toBe(true);
    uwv.targetCompetitionId = 'missing';
    expect(validateWorkspace({ cycles: [c], templates: [] })).not.toEqual([]);
    uwv.targetCompetitionId = c.mainCompetitionId;
  });
  it.each([0, 180, null])('accepts absolute arrows %s independently of load', (value) => {
    const c = withSlots();
    acceptPreview(c, generatePreview(c));
    c.sessions[0].plannedArrowCount = value;
    c.sessions[0].actualArrowCount = value;
    expect(validateWorkspace({ cycles: [c], templates: [] })).toEqual([]);
    c.sessions[0].plannedArrowCount = 4294967296;
    expect(validateWorkspace({ cycles: [c], templates: [] })).not.toEqual([]);
  });
});

describe('warning thresholds', () => {
  it('keeps known partial planning values after observations and later block edits', () => {
    const c = withSlots();
    acceptPreview(c, generatePreview(c));
    const s = c.sessions[0];
    s.contents[0].plannedArrowCount = 40;
    s.contents.push(newContent(30, 30, 'B'));
    s.status = 'completed';
    captureOriginalPlan(s);
    s.contents[0].plannedArrowCount = 90;
    expect(summarize([s]).plannedArrows).toMatchObject({
      total: null,
      partial: 40,
      recorded: 0,
      expected: 1,
    });
  });
  it('uses chosen phase loads in generation independently of the starter profile', () => {
    const c = withSlots();
    c.mesocycles[0].volume = 2;
    c.mesocycles[0].intensity = 5;
    expect(generatePreview(c)[0].profile.volume).toBe(2);
    expect(generatePreview(c)[0].profile.intensity).toBe(
      c.planning.phases!.find((phase) => phase.code === 'VP1')!.profile.intensity,
    );
  });
  it('checks hard-intensity thresholds and keeps missing intensity unknown', () => {
    const c = withSlots();
    acceptPreview(c, generatePreview(c));
    c.sessions = c.sessions.slice(0, 3);
    c.sessions.forEach((s, i) => {
      s.date = dateAt(dayNumber(c.startDate) + i);
      s.intensity = c.planning.hardIntensity;
    });
    expect(detailedWarnings(c).some((w) => w.message.includes('harte Einheiten in Folge'))).toBe(
      true,
    );
    c.sessions[1].intensity = null;
    expect(detailedWarnings(c).some((w) => w.message.includes('harte Einheiten in Folge'))).toBe(
      false,
    );
  });
});
