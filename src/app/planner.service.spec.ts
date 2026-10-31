import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DataAccessService } from './data-access.service';
import { PlannerService } from './planner.service';
import { newCycle, newContent } from './planning';
import compatibilityBackup from '../../fixtures/workspace-v2.json';
import { timelinePreview } from './timeline';
import { Backup, SaveInput, Snapshot } from './models';
const valid = () => {
  const c = newCycle();
  c.name = 'Saison';
  c.competitions[0].name = 'Wettkampf';
  return c;
};
describe('serialized autosave', () => {
  let service: PlannerService;
  let access: {
    load: ReturnType<typeof vi.fn>;
    save: ReturnType<typeof vi.fn>;
    backup: ReturnType<typeof vi.fn>;
    exportSessionPdf: ReturnType<typeof vi.fn>;
  };
  beforeEach(async () => {
    vi.useFakeTimers();
    access = {
      load: vi
        .fn()
        .mockResolvedValue({ revision: 1, workspace: { cycles: [valid()], templates: [] } }),
      save: vi.fn().mockImplementation(async (input: SaveInput) => ({
        revision: input.expectedRevision + 1,
        workspace: input.workspace,
      })),
      backup: vi.fn().mockResolvedValue('backup.json'),
      exportSessionPdf: vi.fn().mockResolvedValue(undefined),
    };
    TestBed.configureTestingModule({
      providers: [{ provide: DataAccessService, useValue: access }],
    });
    service = TestBed.inject(PlannerService);
    await service.load();
  });
  afterEach(() => {
    vi.useRealTimers();
    TestBed.resetTestingModule();
  });
  it('loads a new workspace without seeding templates or triggering autosave', async () => {
    access.load.mockResolvedValueOnce({
      revision: 0,
      workspace: { cycles: [], templates: [] },
    });
    await service.load();
    expect(service.workspace().templates).toEqual([]);
    expect(service.ready()).toBe(true);
    expect(service.status()).toBe('saved');
    await vi.advanceTimersByTimeAsync(1000);
    expect(access.save).not.toHaveBeenCalled();
  });

  it('saves a timeline transformation as one aggregate, preserves session objects, and retains failed edits for retry', async () => {
    const cycle = service.workspace().cycles[0];
    service.addPhase(cycle);
    service.addSlot(cycle);
    service.generate(cycle, service.preview(cycle));
    cycle.goals.push({
      id: 'legacy-goal',
      scope: 'macrocycle',
      reference: cycle.id,
      description: 'Stored training goal',
      category: 'SCHIESSTECHNIK',
      targetValue: null,
      unit: '',
      status: 'open',
    });
    cycle.goals[0].scope = 'mesocycle';
    cycle.goals[0].reference = cycle.mesocycles[0].id;
    await service.flush();
    const original = structuredClone(cycle);
    const session = cycle.sessions[0];
    const preview = timelinePreview(cycle, {
      kind: 'split',
      phaseId: cycle.mesocycles[0].id,
      date: '2026-10-05',
    });
    service.applyTimeline(cycle, preview);
    expect(cycle.sessions[0]).toBe(session);
    expect(() => service.applyTimeline(cycle, preview)).toThrow('geändert');
    access.save.mockRejectedValueOnce({ code: 'storage', message: 'Disk full' });
    await service.flush();
    expect(service.status()).toBe('failed');
    expect(cycle.mesocycles).toHaveLength(2);
    expect(original.mesocycles).toHaveLength(1);
    await service.flush();
    expect(service.status()).toBe('saved');
    const saved = structuredClone(access.save.mock.calls.at(-1)![0].workspace);
    expect(saved.cycles[0]).toEqual(cycle);
    access.load.mockResolvedValueOnce({ revision: service.revision, workspace: saved });
    await service.load();
    expect(service.workspace().cycles[0]).toEqual(cycle);
  });
  it('opens a saved snapshot in the viewer and blocks export after autosave failure', async () => {
    const cycle = service.workspace().cycles[0];
    service.addSlot(cycle);
    service.generate(cycle, service.preview(cycle));
    const session = cycle.sessions[0];
    session.name = 'Überprüfung';
    service.sessionChanged(session);
    const before = structuredClone(cycle);
    expect(await service.exportSessionPdf(cycle, session)).toBeUndefined();
    expect(service.status()).toBe('saved');
    expect(access.exportSessionPdf).toHaveBeenCalledWith(
      expect.stringContaining('Überprüfung.pdf'),
      expect.any(Array),
    );
    const bytes = access.exportSessionPdf.mock.calls[0][1] as number[];
    expect(String.fromCharCode(...bytes.slice(0, 5))).toBe('%PDF-');
    expect(cycle).toEqual(before);
    session.name = 'Letzte Änderung';
    service.sessionChanged(session);
    access.save.mockRejectedValueOnce({ code: 'storage', message: 'Speicherfehler' });
    await expect(service.exportSessionPdf(cycle, session)).rejects.toThrow('Speicherfehler');
    expect(access.exportSessionPdf).toHaveBeenCalledTimes(1);
  });
  it('retains newer edits while an older request is in flight', async () => {
    let resolve!: (s: Snapshot) => void;
    access.save.mockImplementationOnce(
      () =>
        new Promise<Snapshot>((r) => {
          resolve = r;
        }),
    );
    service.workspace().cycles[0].name = 'First';
    service.changed();
    const pending = service.flush();
    service.workspace().cycles[0].name = 'Newest';
    service.changed();
    expect(access.save.mock.calls[0][0].workspace.cycles[0].name).toBe('First');
    resolve({ revision: 2, workspace: access.save.mock.calls[0][0].workspace });
    await pending;
    expect(access.save).toHaveBeenCalledTimes(2);
    expect(access.save.mock.calls[1][0].expectedRevision).toBe(2);
    expect(service.workspace().cycles[0].name).toBe('Newest');
    expect(service.status()).toBe('saved');
  });

  it('recalculates consecutive session and template blocks after edits, moves, removal and reload', async () => {
    const cycle = service.workspace().cycles[0];
    service.addSlot(cycle);
    service.generate(cycle, service.preview(cycle));
    const session = cycle.sessions[0];
    session.contents = [
      newContent(20, 30, 'Technik'),
      newContent(90, 10, 'Pause'),
      newContent(5, 20, 'Scoring'),
    ];
    session.contents[1].category = 'Pause';
    session.contents[1].areas = [];
    const template = structuredClone((compatibilityBackup as Backup).workspace.templates[0]);
    template.contents = session.contents.map((b) => ({
      ...structuredClone(b),
      id: crypto.randomUUID(),
    }));
    service.workspace().templates = [template];
    service.sessionChanged(session, true);
    expect(session.contents.map((b) => b.startOffsetMinutes)).toEqual([0, 30, 40]);
    expect(template.contents.map((b) => b.startOffsetMinutes)).toEqual([0, 30, 40]);
    session.contents[0].durationMinutes = 45;
    service.sessionChanged(session, true);
    expect(session.contents.map((b) => b.startOffsetMinutes)).toEqual([0, 45, 55]);
    service.moveContents(session.contents, 2, -1, session);
    expect(session.contents.map((b) => b.startOffsetMinutes)).toEqual([0, 45, 65]);
    service.removeContent(session, 0);
    expect(session.contents.map((b) => b.startOffsetMinutes)).toEqual([0, 20]);
    service.addContent(session);
    expect(session.contents.map((b) => b.startOffsetMinutes)).toEqual([0, 20, 30]);
    template.contents[0].durationMinutes = 15;
    service.changed();
    expect(template.contents.map((b) => b.startOffsetMinutes)).toEqual([0, 15, 25]);
    service.moveContents(template.contents, 1, -1, null);
    expect(template.contents.map((b) => b.startOffsetMinutes)).toEqual([0, 10, 25]);
    service.removeTemplateContent(template, 0);
    service.addTemplateContent(template);
    expect(template.contents.map((b) => b.startOffsetMinutes)).toEqual([0, 15, 35]);
    await service.flush();
    const stored = structuredClone(access.save.mock.calls.at(-1)![0].workspace);
    expect(stored.cycles[0].sessions[0].contents[1].category).toBe('Pause');
    stored.cycles[0].sessions[0].contents[0].startOffsetMinutes = 99;
    stored.templates[0].contents[1].startOffsetMinutes = 99;
    access.load.mockResolvedValue({ revision: service.revision, workspace: stored });
    await service.load();
    expect(
      service.workspace().cycles[0].sessions[0].contents.map((b) => b.startOffsetMinutes),
    ).toEqual([0, 20, 30]);
    expect(service.workspace().templates[0].contents.map((b) => b.startOffsetMinutes)).toEqual([
      0, 15, 35,
    ]);
  });

  it('preserves newer competition and observation edits during an in-flight aggregate save', async () => {
    const c = service.workspace().cycles[0];
    service.addPhase(c);
    service.addSlot(c);
    service.generate(c, service.preview(c));
    const s = c.sessions[0];
    let resolve!: (value: Snapshot) => void;
    access.save.mockImplementationOnce(() => new Promise<Snapshot>((r) => (resolve = r)));
    s.plannedArrowCount = 180;
    service.sessionChanged(s);
    const pending = service.flush();
    s.actualArrowCount = 150;
    s.actualDuration = 100;
    s.status = 'completed';
    service.sessionChanged(s);
    service.addCompetition(c);
    resolve({ revision: 2, workspace: access.save.mock.calls[0][0].workspace });
    await pending;
    expect(access.save).toHaveBeenCalledTimes(2);
    expect(access.save.mock.calls[1][0].workspace.cycles[0].sessions[0].actualArrowCount).toBe(150);
    expect(service.workspace().cycles[0].competitions).toHaveLength(2);
    expect(s.originalPlan?.arrows).toBe(180);
    expect(service.status()).toBe('saved');
  });
  it('retains failed input and supports explicit retry without reporting saved', async () => {
    access.save.mockRejectedValueOnce({ code: 'storage', message: 'Disk full' });
    service.workspace().cycles[0].name = 'Kept';
    service.changed();
    await service.flush();
    expect(service.status()).toBe('failed');
    expect(service.workspace().cycles[0].name).toBe('Kept');
    expect(service.revision).toBe(1);
    await service.flush();
    expect(service.status()).toBe('saved');
  });
  it('does not persist malformed edits and does not export a stale backup', async () => {
    service.workspace().cycles[0].name = '';
    service.changed();
    await expect(service.backup()).rejects.toThrow();
    expect(service.status()).toBe('invalid');
    expect(access.save).not.toHaveBeenCalled();
    expect(access.backup).not.toHaveBeenCalled();
  });
  it('returns native backup cancellation after pending autosave settles', async () => {
    service.workspace().cycles[0].name = 'Gespeicherte Saison';
    service.changed();
    access.backup.mockResolvedValueOnce(null);
    await expect(service.backup()).resolves.toBeNull();
    expect(access.save).toHaveBeenCalledTimes(1);
    expect(access.backup).toHaveBeenCalledTimes(1);
  });
  it('saves a regeneration aggregate once and retains its intended changes on failed persistence', async () => {
    const cycle = service.workspace().cycles[0];
    service.addSlot(cycle);
    service.generate(cycle, service.preview(cycle));
    await service.flush();
    access.save.mockClear();
    cycle.slots[0].startTime = '20:00';
    const preview = service.regenerationPreview(cycle);
    const identities = cycle.sessions.map((s) => s.id);
    service.regenerate(cycle, preview);
    access.save.mockRejectedValueOnce({ code: 'storage', message: 'Disk full' });
    await service.flush();
    expect(service.status()).toBe('failed');
    expect(cycle.sessions.every((s) => s.startTime === '20:00')).toBe(true);
    expect(access.save).toHaveBeenCalledTimes(1);
    const attempted = structuredClone(access.save.mock.calls[0][0]);
    await service.flush();
    expect(service.status()).toBe('saved');
    expect(access.save.mock.calls[1][0]).toEqual(attempted);
    expect(cycle.sessions.map((s) => s.id)).toEqual(identities);
    const saved = access.save.mock.calls[1][0].workspace;
    access.load.mockResolvedValue({ revision: service.revision, workspace: saved });
    await service.load();
    expect(service.workspace().cycles[0].sessions).toEqual(cycle.sessions);
  });
});

describe('aggregate deletion and template target policies', () => {
  let service: PlannerService;
  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [{ provide: DataAccessService, useValue: {} }] });
    service = TestBed.inject(PlannerService);
  });
  afterEach(() => TestBed.resetTestingModule());
  it('phase deletion retains sessions and clears only that phase reference', () => {
    const c = valid();
    service.addPhase(c);
    service.addSlot(c);
    service.generate(c, service.preview(c));
    const count = c.sessions.length;
    service.removePhase(c, c.mesocycles[0]);
    expect(c.sessions).toHaveLength(count);
    expect(c.sessions.every((s) => s.mesoCycleId === null)).toBe(true);
  });
  it('slot deletion optionally removes only untouched sessions and preserves edited origins', () => {
    const c = valid();
    service.addSlot(c);
    const slot = c.slots[0];
    service.generate(c, service.preview(c));
    const edited = c.sessions[0];
    edited.manuallyModified = true;
    service.removeSlot(c, slot.id, true);
    expect(c.sessions).toEqual([edited]);
    expect(edited.sourceTrainingSlotId).toBeNull();
    expect(edited.occurrenceKey).toContain(slot.id);
    const other = valid();
    service.addSlot(other);
    service.generate(other, service.preview(other));
    const count = other.sessions.length;
    service.removeSlot(other, other.slots[0].id, false);
    expect(other.sessions).toHaveLength(count);
    expect(other.sessions.every((s) => s.sourceTrainingSlotId === null)).toBe(true);
  });
  it('all template scopes distinguish unplanned defaults and preserve untargeted sessions', () => {
    const c = valid();
    service.addPhase(c);
    service.addSlot(c);
    service.generate(c, service.preview(c));
    const first = c.sessions[0];
    first.individuallyPlanned = true;
    expect(service.templateTargets(c, 'selected', '', new Set([first.id]))).toEqual([first]);
    expect(service.templateTargets(c, 'slot', c.slots[0].id, new Set())).toHaveLength(
      c.sessions.length,
    );
    expect(service.templateTargets(c, 'mesocycle', c.mesocycles[0].id, new Set())).toHaveLength(
      c.sessions.length,
    );
    expect(service.templateTargets(c, 'unplanned', c.mesocycles[0].id, new Set())).toHaveLength(
      c.sessions.length - 1,
    );
  });
});

describe('revised use cases preserve trainer decisions', () => {
  let service: PlannerService;
  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [{ provide: DataAccessService, useValue: {} }] });
    service = TestBed.inject(PlannerService);
  });
  afterEach(() => TestBed.resetTestingModule());
  it('requires deliberate phase replacement and retains manual references, identities, contents and observations', () => {
    const c = valid();
    service.acceptPhases(c, service.proposal(c));
    service.addSlot(c);
    service.generate(c, service.preview(c));
    const s = c.sessions[0];
    s.manuallyModified = true;
    s.actualDuration = 100;
    s.actualArrowCount = 150;
    s.status = 'completed';
    c.goals.push({
      id: 'legacy-goal',
      scope: 'macrocycle',
      reference: c.id,
      description: 'Stored training goal',
      category: 'SCHIESSTECHNIK',
      targetValue: null,
      unit: '',
      status: 'open',
    });
    const goal = c.goals[0];
    goal.scope = 'mesocycle';
    goal.reference = c.mesocycles[0].id;
    const previous = structuredClone(s);
    const phases = service.proposal(c);
    expect(() => service.acceptPhases(c, phases)).toThrow('Bestätigung');
    const preview = service.phaseAssignmentPreview(c, phases);
    expect(preview.retained.map((m) => m.id)).toContain(s.mesoCycleId);
    service.acceptPhases(c, phases, true);
    expect(s).toEqual(previous);
    expect(c.goals[0].reference).toBe(previous.mesoCycleId);
  });
  it('rejects deleting the main competition and clears a removed secondary target without losing a phase', () => {
    const c = valid();
    service.addCompetition(c);
    service.addPhase(c);
    c.mesocycles[0].type = 'UWV';
    c.mesocycles[0].targetCompetitionId = c.competitions[1].id;
    expect(() => service.removeCompetition(c, c.competitions[0])).toThrow();
    service.removeCompetition(c, c.competitions[1]);
    expect(c.mesocycles[0].targetCompetitionId).toBeNull();
  });
  it('captures the original plan on observation entry, clears observations in templates and preserves actuals on application', () => {
    const c = valid();
    service.addPhase(c);
    service.addSlot(c);
    service.generate(c, service.preview(c));
    const s = c.sessions[0];
    s.plannedArrowCount = 180;
    s.actualDuration = 100;
    s.actualArrowCount = 150;
    s.status = 'completed';
    service.sessionChanged(s);
    expect(s.originalPlan).toEqual({ duration: 120, arrows: 180, partialArrows: 180 });
    s.contents[0].actualArrowCount = 40;
    s.contents[0].actualDuration = 25;
    service.saveTemplate(s, 'Kopie');
    const t = service.workspace().templates[0];
    expect(t.contents[0].actualArrowCount).toBeNull();
    expect(t.contents[0].id).not.toBe(s.contents[0].id);
    expect(t.contents[0].areas).not.toBe(s.contents[0].areas);
    expect(() => service.applyTemplate([s], t, 'replace')).toThrow('Durchführungsdaten');
    service.applyTemplate([s], t, 'append');
    expect(s.actualArrowCount).toBe(150);
    expect(s.originalPlan).toEqual({ duration: 120, arrows: 180, partialArrows: 180 });
    expect(s.contents[0].actualArrowCount).toBe(40);
  });
});
