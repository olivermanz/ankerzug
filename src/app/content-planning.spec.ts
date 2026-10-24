import { describe, expect, it } from 'vitest';
import fixture from '../../fixtures/workspace-v2.json';
import { Workspace } from './models';
import { previousPreview, previousSession } from './content-planning';
import { newContent, validateWorkspace } from './planning';

function workspace(): Workspace {
  const w = structuredClone(fixture.workspace) as Workspace;
  const c = w.cycles[0];
  const s = c.sessions[0];
  s.manuallyModified = false;
  s.individuallyPlanned = false;
  s.status = 'planned';
  s.actualArrowCount = null;
  s.actualDuration = null;
  s.subjectiveLoad = null;
  s.contents.forEach((b) => {
    b.actualArrowCount = null;
    b.actualDuration = null;
    b.actualLoad = null;
  });
  return w;
}

describe('previous contents', () => {
  it('finds the preceding appointment chronologically, skips moved/cancelled origins and copies only planned contents', () => {
    const w = workspace(),
      c = w.cycles[0],
      s = c.sessions[0];
    const previous = structuredClone(s);
    previous.id = 'previous';
    previous.date = s.date;
    previous.startTime = '08:00';
    s.startTime = '18:00';
    previous.contents = [newContent(0, 20, 'Technik'), newContent(20, 10, 'Mental')];
    previous.contents[0].actualDuration = 0;
    previous.contents[0].actualArrowCount = 0;
    previous.volume = 5;
    const cancelled = {
      ...structuredClone(previous),
      id: 'cancelled',
      startTime: '17:00',
      status: 'cancelled' as const,
    };
    c.sessions = [s, cancelled, previous];
    expect(previousSession(c, s)).toBe(previous);
    const before = structuredClone(c);
    const next = previousPreview(c, s, w.templates).projected[0];
    expect(c).toEqual(before);
    expect(next.volume).toBe(s.volume);
    expect(next.plannedDuration).toBe(s.plannedDuration);
    expect(next.startTime).toBe(s.startTime);
    expect(next.contents.map((b) => b.startOffsetMinutes)).toEqual([0, 20]);
    expect(next.contents[0].actualDuration).toBeNull();
    expect(next.contents[0].actualArrowCount).toBeNull();
    expect(next.contents[0].id).not.toBe(previous.contents[0].id);
    s.individuallyPlanned = true;
    expect(() => previousPreview(c, s, w.templates)).toThrow('ungeplante');
    c.sessions = [s];
    expect(previousSession(c, s)).toBeNull();
  });

  it('rejects dangling template references and accepts old documents without defaults', () => {
    const w = workspace();
    expect(validateWorkspace(w)).toEqual([]);
    w.cycles[0].mesocycles[0].defaultTemplateId = 'missing';
    expect(validateWorkspace(w)).toContain('Mesozyklus-Standardvorlage fehlt.');
    delete w.cycles[0].mesocycles[0].defaultTemplateId;
    expect(validateWorkspace(w)).toEqual([]);
  });
});
