import templateFixture from '../../../fixtures/templates-package-v1.json';
import {
  TemplatePackage,
  templatePackage,
  templateImportPreview,
  projectedTemplateImport,
} from './exchange';
import { describe, expect, it } from 'vitest';
import fixture from '../../../fixtures/workspace-v2.json';
import { Workspace } from '../models';
import { macroCyclePackage, importPreview, projectedImport } from './exchange';
import { generatePreview } from '../planning';

const workspace = () => structuredClone(fixture.workspace) as Workspace;
describe('macrocycle exchange', () => {
  it('exports a detached complete cycle and only referenced templates', () => {
    const w = workspace(),
      c = w.cycles[0];
    c.mesocycles[0].defaultTemplateId = w.templates[0].id;
    const p = macroCyclePackage(c, w.templates);
    expect(p.templates).toHaveLength(1);
    expect(p.cycle).toEqual(c);
    expect(JSON.stringify(p)).not.toContain('materialChanges');
    p.cycle.name = 'Changed';
    expect(c.name).not.toBe('Changed');
  });
  it('previews colliding IDs, remaps relationships/origins and preserves compatibility values', () => {
    const w = workspace(),
      c = w.cycles[0];
    c.mesocycles[0].defaultTemplateId = w.templates[0].id;
    c.periods[0].retainedSlotIds = [c.slots[0].id];
    const session = c.sessions[0];
    session.generationBaseline = {
      date: session.date,
      startTime: session.startTime,
      plannedDuration: session.plannedDuration,
      name: session.name,
      mesoCycleId: session.mesoCycleId,
      sessionType: session.sessionType,
      reduced: session.reduced,
      volume: session.volume,
      intensity: session.intensity,
      competitionSpecificity: session.competitionSpecificity,
      contents: structuredClone(session.contents),
    };
    const before = structuredClone(w);
    let n = 0;
    const preview = importPreview(w, macroCyclePackage(c, w.templates), () => `import-${++n}`);
    expect(w).toEqual(before);
    expect(preview.mappings.some((m) => m.collision)).toBe(true);
    const result = projectedImport(w, preview),
      copy = result.cycles.at(-1)!;
    expect(result.cycles[0]).toEqual(c);
    expect(copy.id).not.toBe(c.id);
    expect(copy.mainCompetitionId).toBe(
      copy.competitions.find((x) => x.name === c.competitions[0].name)!.id,
    );
    expect(copy.mesocycles[0].defaultTemplateId).toBe(result.templates.at(-1)!.id);
    expect(copy.periods[0].retainedSlotIds).toEqual([copy.slots[0].id]);
    expect(copy.weeks).toEqual(c.weeks);
    expect(copy.sessions[0].generationBaseline!.mesoCycleId).toBe(copy.sessions[0].mesoCycleId);
    expect(copy.sessions[0].generationBaseline!.contents[0].id).toBe(
      copy.sessions[0].contents[0].id,
    );
    expect(copy.goals.map((x) => ({ ...x, id: '', reference: '' }))).toEqual(
      c.goals.map((x) => ({ ...x, id: '', reference: '' })),
    );
    for (let i = 0; i < copy.sessions.length; i++) {
      const s = copy.sessions[i],
        original = c.sessions[i];
      expect(s.actualArrowCount).toBe(original.actualArrowCount);
      expect(s.actualDuration).toBe(original.actualDuration);
      expect(s.originalPlan).toEqual(original.originalPlan);
      expect(s.contents.map((b) => ({ ...b, id: '' }))).toEqual(
        original.contents.map((b) => ({ ...b, id: '' })),
      );
      if (original.sourceTrainingSlotId) expect(s.occurrenceKey).toContain(s.sourceTrainingSlotId);
    }
    // An excluded generated occurrence stays excluded after slot-ID remapping.
    c.exclusions.push(`${c.slots[0].id}@2026-10-15`);
    const excluded = importPreview(
      w,
      macroCyclePackage(c, w.templates),
      () => `second-${++n}`,
    ).cycle;
    expect(excluded.exclusions.at(-1)).toBe(`${excluded.slots[0].id}@2026-10-15`);
    expect(generatePreview(excluded).some((x) => x.key === excluded.exclusions.at(-1))).toBe(false);
  });
  it('rejects stale previews, incomplete reference closure and colliding generated IDs', () => {
    const w = workspace(),
      c = w.cycles[0];
    let n = 0;
    const preview = importPreview(w, macroCyclePackage(c, w.templates), () => `import-${++n}`);
    w.cycles[0].name += ' edited';
    expect(() => projectedImport(w, preview)).toThrow('geändert');
    c.mesocycles[0].defaultTemplateId = 'missing';
    expect(() => importPreview(w, macroCyclePackage(c, w.templates))).toThrow();
    c.mesocycles[0].defaultTemplateId = null;
    expect(() => importPreview(w, macroCyclePackage(c, w.templates), () => c.id)).toThrow(
      'eindeutig',
    );
    const p = macroCyclePackage(c, w.templates);
    p.formatVersion = 99 as 1;
    expect(() => importPreview(w, p)).toThrow('Nicht unterstütztes');
  });
});

describe('standalone template exchange', () => {
  it('exports one or several detached templates including hidden and compatibility fields', () => {
    const w = workspace();
    w.templates[0].contents[0].material = 'Bögen und Pfeile';
    w.templates[0].contents[0].actualArrowCount = 13;
    const packet = templatePackage(w.templates);
    expect(packet.templates).toEqual(w.templates);
    packet.templates[0].contents[0].material = 'Changed';
    expect(w.templates[0].contents[0].material).toBe('Bögen und Pfeile');
    expect(() => templatePackage([])).toThrow('Mindestens');
  });
  it('imports multiple templates atomically with independent content arrays', () => {
    const w = workspace();
    const first = w.templates[0],
      second = structuredClone(first);
    second.id = 'second-template';
    second.name = 'Zweite Vorlage';
    second.contents.forEach((block, index) => {
      block.id = `second-block-${index}`;
    });
    const packet = templatePackage([first, second]);
    const preview = templateImportPreview(w, packet);
    const projected = projectedTemplateImport(w, preview);
    expect(projected.templates).toHaveLength(3);
    projected.templates[1].contents[0].content = 'Edited copy';
    expect(projected.templates[0].contents[0].content).toBe(first.contents[0].content);
    expect(projected.templates[2].contents[0].content).toBe(second.contents[0].content);
    expect(w.templates).toHaveLength(1);
  });
  it('reads the shared package contract, remaps all template/block IDs and preserves existing plan/defaults', () => {
    const w = workspace();
    w.cycles[0].mesocycles[0].defaultTemplateId = w.templates[0].id;
    const original = structuredClone(w);
    let n = 0;
    const p = templateImportPreview(
      w,
      templateFixture as TemplatePackage,
      () => `template-import-${++n}`,
    );
    expect(w).toEqual(original);
    expect(p.mappings.every((mapping) => mapping.collision)).toBe(true);
    const merged = projectedTemplateImport(w, p);
    expect(merged.cycles).toEqual(original.cycles);
    expect(merged.templates[0]).toEqual(original.templates[0]);
    const copy = merged.templates.at(-1)!;
    expect(copy.id).not.toBe(original.templates[0].id);
    expect(copy.contents[0].id).not.toBe(original.templates[0].contents[0].id);
    expect({ ...copy, id: '', contents: copy.contents.map((b) => ({ ...b, id: '' })) }).toEqual({
      ...original.templates[0],
      id: '',
      contents: original.templates[0].contents.map((b) => ({ ...b, id: '' })),
    });
  });
  it('rejects stale previews, empty/future packages, duplicate IDs and generated ID collisions', () => {
    const w = workspace();
    const packet = templatePackage(w.templates);
    const p = templateImportPreview(w, packet);
    w.templates[0].name += ' changed';
    expect(() => projectedTemplateImport(w, p)).toThrow('geändert');
    expect(() => templateImportPreview(w, { ...packet, formatVersion: 99 as 1 })).toThrow(
      'Nicht unterstütztes',
    );
    expect(() => templateImportPreview(w, { ...packet, templates: [] })).toThrow('Mindestens');
    expect(() => templatePackage([packet.templates[0], packet.templates[0]])).toThrow();
    expect(() => templateImportPreview(w, packet, () => w.templates[0].id)).toThrow('eindeutig');
  });
});
