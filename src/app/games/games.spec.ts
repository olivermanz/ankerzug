import { describe, expect, it, vi } from 'vitest';
import { Game, Workspace } from '../models';
import fixture from '../../../fixtures/workspace-v2.json';
import { newContent, applyTemplate, validateWorkspace } from '../planning';
import { gameErrors, gameImportPreview, gamePackage, projectedGameImport } from './games';
import {
  macroCyclePackage,
  importPreview,
  projectedImport,
  templatePackage,
  templateImportPreview,
  projectedTemplateImport,
} from '../exports/exchange';
import { createGamePdf } from '../pdf/game-pdf';
import { createSessionPdf, renderSessionPdf } from '../pdf/session-pdf';
import { planSections } from '../exports/readable';
import { createPlanPdf, renderPlanPdf } from '../pdf/plan-pdf';
import gameFixture from '../../../fixtures/games-package-v1.json';
export const gameSample = (): Game => structuredClone(gameFixture.games[0]) as Game;
const sample = () => {
  const w = structuredClone(fixture.workspace) as Workspace;
  w.games = [gameSample()];
  const c = w.cycles[0],
    t = w.templates[0];
  c.mesocycles[0].defaultTemplateId = t.id;
  for (const b of [c.sessions[0].contents[0], t.contents[0]]) {
    b.category = 'Spiel';
    b.gameId = w.games[0].id;
    b.content = '';
  }
  return w;
};
describe('training games domain and exchange', () => {
  it('validates mandatory data, integer ratings, attachments and references independently of storage', () => {
    expect(gameErrors([gameSample()])).toEqual([]);
    for (const field of ['effort', 'fun', 'duration', 'competitionProximity'] as const)
      for (const value of [0, 6, 2.5, NaN])
        expect(gameErrors([{ ...gameSample(), [field]: value }])).not.toEqual([]);
    for (const value of [
      { name: ' ' },
      { description: '' },
      { single: false, team: false },
      { single: 'true' },
      { team: undefined },
    ])
      expect(gameErrors([{ ...gameSample(), ...value } as Game])).not.toEqual([]);
    const game = gameSample();
    game.attachments[0].bytes = [37, 80, 68, 70];
    expect(gameErrors([game])).not.toEqual([]);
    const w = sample();
    expect(validateWorkspace(w)).toEqual([]);
    w.cycles[0].sessions[0].contents[0].gameId = 'missing';
    expect(validateWorkspace(w)).toContain(
      'Spielbezug fehlt oder gehört zu einem anderen Blocktyp.',
    );
  });
  it('accepts each form separately and both together through exchange', () => {
    for (const [single, team] of [
      [true, false],
      [false, true],
      [true, true],
    ]) {
      const game = { ...gameSample(), single, team };
      expect(gameErrors([game])).toEqual([]);
      expect(gamePackage([game]).games[0]).toEqual(game);
    }
  });
  it('previews name/ID collisions, copies bytes, rejects stale previews and never mutates existing games', () => {
    const w = sample(),
      original = structuredClone(w);
    let n = 0;
    const p = gameImportPreview(w, gamePackage(w.games!), () => `game-copy-${++n}`);
    expect(p.collisions[0]).toMatchObject({ sameName: true, sameId: true });
    const next = projectedGameImport(w, p);
    expect(next.games).toHaveLength(2);
    expect(next.games![1].attachments[0].bytes).toEqual(w.games![0].attachments[0].bytes);
    expect(next.games![1].id).not.toBe(w.games![0].id);
    expect(w).toEqual(original);
    w.games![0].name += '!';
    expect(() => projectedGameImport(w, p)).toThrow('geändert');
    expect(() => gameImportPreview(w, gamePackage(w.games!), () => w.games![0].id)).toThrow(
      'eindeutig',
    );
  });
  it('closes cycle/template exports and remaps shared game and attachment references', () => {
    const w = sample();
    let n = 0;
    const packet = macroCyclePackage(w.cycles[0], w.templates, w.games);
    expect(packet.formatVersion).toBe(2);
    expect(packet.games).toHaveLength(1);
    const p = importPreview(w, packet, () => `cycle-copy-${++n}`),
      next = projectedImport(w, p);
    const game = next.games!.at(-1)!;
    expect(next.cycles.at(-1)!.sessions[0].contents[0].gameId).toBe(game.id);
    expect(next.templates.at(-1)!.contents[0].gameId).toBe(game.id);
    expect(game.attachments[0].id).not.toBe(w.games![0].attachments[0].id);
    const tp = templatePackage(w.templates, w.games);
    const ti = templateImportPreview(w, tp, () => `template-copy-${++n}`);
    const tn = projectedTemplateImport(w, ti);
    expect(tn.templates.at(-1)!.contents[0].gameId).toBe(tn.games!.at(-1)!.id);
    expect(() => templatePackage(w.templates)).toThrow('Spiel fehlt');
  });
  it('keeps optional game blocks, text/material/minutes and references through template copying', () => {
    const w = sample(),
      s = w.cycles[0].sessions[0],
      t = w.templates[0];
    t.contents[0].material = 'Bögen';
    t.contents[0].durationMinutes = 37;
    applyTemplate([s], t, 'replace');
    expect(s.contents[0].gameId).toBe(w.games![0].id);
    expect(s.contents[0].material).toBe('Bögen');
    expect(s.contents[0].durationMinutes).toBe(37);
    expect(s.contents[0].id).not.toBe(t.contents[0].id);
    const block = newContent();
    block.category = 'Spiel';
    s.contents = [block];
    expect(validateWorkspace(w)).toEqual([]);
  });
  it('renders selected game names in session PDFs, plan PDFs and print sections even without block text', () => {
    const w = sample(),
      c = w.cycles[0],
      s = c.sessions[0];
    const pdf = createSessionPdf(c, s, w.games);
    const spy = vi.spyOn(pdf, 'text');
    renderSessionPdf(pdf, c, s, w.games);
    expect(spy.mock.calls.flat().join(' ')).toContain('Spiel: Ringjagd');
    expect(
      planSections(c, w.games)
        .flatMap((s) => s.lines)
        .join(' '),
    ).toContain('Spiel: Ringjagd');
    const plan = createPlanPdf(c, w.games),
      planText = vi.spyOn(plan, 'text');
    renderPlanPdf(plan, c, w.games);
    expect(planText.mock.calls.flat().join(' ')).toContain('Spiel: Ringjagd');
  });
  it('creates real A4 instructions with Unicode font and preserves a long description through pagination', () => {
    const game = gameSample();
    game.description = 'Grüße für Jörg\n'.repeat(300) + 'Letzte Spielregel';
    const doc = createGamePdf(game);
    expect(doc.getNumberOfPages()).toBeGreaterThan(3);
    expect(doc.output()).toContain('/FontFile2');
    expect(doc.internal.pageSize.getWidth()).toBeCloseTo(210, 1);
    expect(() => createGamePdf({ ...game, description: '🎯' })).toThrow('Zeichen');
  });
});
