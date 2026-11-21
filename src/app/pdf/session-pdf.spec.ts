import { describe, expect, it, vi } from 'vitest';
import {
  appendSessionAttachments,
  createSessionLandscapePdf,
  createSessionPdf,
  renderSessionLandscapePdf,
  renderSessionPdf,
  sessionLandscapePdfFilename,
  sessionPdfFilename,
} from './session-pdf';
import fixture from '../../../fixtures/workspace-v2.json';
import { Workspace } from '../models';
import { newContent } from '../planning';

const sample = () => {
  const cycle = structuredClone(fixture.workspace as Workspace).cycles[0];
  const session = cycle.sessions[0];
  session.name = 'Technik – Grüße für Jörg';
  session.startTime = '23:30';
  session.contents = [
    newContent(999, 45, 'Aufwärmen\nSchießen: ruhig & präzise.'),
    newContent(0, 10, 'Pause'),
  ];
  session.contents[0].material = 'Bögen, Pfeile & Scheibe';
  session.contents[0].notes = 'In Paaren arbeiten';
  session.contents[1].category = 'Pause';
  session.contents[1].areas = [];
  return { cycle, session };
};
describe('A4 training session PDF', () => {
  it('creates a real portrait A4 PDF with an embedded Unicode font', () => {
    const { cycle, session } = sample();
    const before = structuredClone(session);
    const doc = createSessionPdf(cycle, session);
    expect(doc.internal.pageSize.getWidth()).toBeCloseTo(210, 1);
    expect(doc.internal.pageSize.getHeight()).toBeCloseTo(297, 1);
    expect(doc.getNumberOfPages()).toBe(1);
    expect(doc.output()).toContain('/FontFile2');
    expect(doc.output()).toContain('/ToUnicode');
    expect(session).toEqual(before);
  });
  it('creates a landscape A4 lesson-plan table with block notes', () => {
    const { cycle, session } = sample();
    session.contents[0].subcategory = 'Vormachen, nachmachen';
    session.contents[0].notes = 'In Paaren arbeiten';
    const doc = createSessionLandscapePdf(cycle, session);
    const text = vi.spyOn(doc, 'text');
    renderSessionLandscapePdf(doc, cycle, session);
    const values = text.mock.calls.map((call) => call[0]).join('\n');
    expect(doc.internal.pageSize.getWidth()).toBeCloseTo(297, 1);
    expect(doc.internal.pageSize.getHeight()).toBeCloseTo(210, 1);
    for (const heading of [
      'PHASE',
      'ZEIT',
      'ZIEL',
      'INHALT',
      'MATERIAL /',
      'GERÄTE',
      'ANMERKUNGEN',
    ])
      expect(values).toContain(heading);
    for (const omitted of ['UNTERRICHTS-', 'METHODE', 'BESONDERES', 'Vormachen,', 'nachmachen'])
      expect(values).not.toContain(omitted);
    expect(values).toContain('In Paaren');
    expect(values).toContain('arbeiten');
    expect(sessionLandscapePdfFilename(session)).toContain('-A4-Landscape.pdf');
  });
  it('uses ordered durations rather than stale offsets and keeps all plan text', () => {
    const { cycle, session } = sample();
    const doc = createSessionPdf(cycle, session);
    const text = vi.spyOn(doc, 'text');
    renderSessionPdf(doc, cycle, session);
    const values = text.mock.calls.map((call) => call[0]).join('\n');
    expect(values).toContain('23:30');
    expect(values).toContain('00:15 (+1 Tag)');
    expect(values).toContain('00:25 (+1 Tag)');
    expect(values).toContain('+00:45');
    expect(values).toContain('Schießen: ruhig & präzise.');
    expect(values).toContain('Material: Bögen, Pfeile & Scheibe');
    expect(values).toContain('Anmerkungen: In Paaren arbeiten');
    expect(values).toContain('2. Pause');
    expect(values).toContain('Inhaltsdauer: 55 min');
    expect(values).not.toContain('999');
  });
  it('omits type, status and training areas from the exported plan', () => {
    const { cycle, session } = sample();
    session.areas = ['SCHIESSTECHNIK'];
    session.status = 'planned';
    const doc = createSessionPdf(cycle, session);
    const text = vi.spyOn(doc, 'text');
    renderSessionPdf(doc, cycle, session);
    const values = text.mock.calls.map((call) => call[0]).join('\n');
    for (const omitted of ['Typ:', 'Status:', 'TRAININGSBEREICHE', 'SCHIESSTECHNIK'])
      expect(values).not.toContain(omitted);
  });
  it('paginates long notes and blocks without clipping text or losing the last line', () => {
    const { cycle, session } = sample();
    session.notes = 'Lange Notiz mit Umlauten äöüß.\n'.repeat(80) + 'Notizende';
    session.contents[0].content =
      'Sehr lange Trainingsanweisung äöüß.\n'.repeat(140) + 'Letzte Anweisung';
    session.contents[0].notes = 'Lange Blockanmerkung äöüß.\n'.repeat(140) + 'Blockanmerkungsende';
    const doc = createSessionPdf(cycle, session);
    // Re-render with a spy to inspect actual placement and complete page footers.
    const text = vi.spyOn(doc, 'text');
    renderSessionPdf(doc, cycle, session);
    expect(doc.getNumberOfPages()).toBeGreaterThan(3);
    const values = text.mock.calls.map((call) => call[0]).join('\n');
    expect(values).toContain('Notizende');
    expect(values).toContain('Letzte Anweisung');
    expect(values).toContain('Blockanmerkungsende');
    expect(values).toContain('2. Pause');
    for (const call of text.mock.calls) {
      const y = call[2] as number;
      expect(y).toBeGreaterThanOrEqual(16);
      expect(y).toBeLessThanOrEqual(287);
    }
    for (let page = 1; page <= doc.getNumberOfPages(); page++) {
      expect(values).toContain(`Seite ${page} / ${doc.getNumberOfPages()}`);
      doc.setPage(page);
      expect(doc.internal.pageSize.getWidth()).toBeCloseTo(210, 1);
      expect(doc.internal.pageSize.getHeight()).toBeCloseTo(297, 1);
    }
  });
  it('omits blank block notes and refuses unsupported note glyphs', () => {
    const { cycle, session } = sample();
    session.contents[0].notes = '   ';
    const doc = createSessionPdf(cycle, session);
    const text = vi.spyOn(doc, 'text');
    renderSessionPdf(doc, cycle, session);
    expect(text.mock.calls.map((call) => call[0]).join('\n')).not.toContain('Anmerkungen:');
    session.contents[0].notes = '🎯';
    expect(() => createSessionPdf(cycle, session)).toThrow('nicht unterstützt');
    session.contents = [];
    expect(createSessionPdf(cycle, session).getNumberOfPages()).toBe(1);
  });
  it('suggests a portable dated PDF filename', () => {
    const { session } = sample();
    session.name = 'Technik: Halle / Bögen?';
    const name = sessionPdfFilename(session);
    expect(name).toContain(session.date);
    expect(name).toContain('Bögen-');
    expect(name).not.toMatch(/[<>:"/\\|?*]/);
    expect(name).toMatch(/\.pdf$/);
  });
});

describe('training content attachments in the session PDF', () => {
  for (const [orientation, create, render] of [
    ['portrait', createSessionPdf, renderSessionPdf],
    ['landscape', createSessionLandscapePdf, renderSessionLandscapePdf],
  ] as const) {
    it(`numbers only attached blocks and fits all pages in the ${orientation} export`, async () => {
      const { cycle, session } = sample();
      const [first, last] = session.contents;
      first.attachment = { id: 'a', filename: 'erstes.pdf' };
      last.attachment = { id: 'b', filename: 'letztes.pdf' };
      session.contents = [last, newContent(0, 1, 'Ohne Anlage'), first];
      const doc = create(cycle, session);
      const text = vi.spyOn(doc, 'text');
      render(doc, cycle, session);
      expect(
        text.mock.calls
          .map(([value]) => value)
          .filter((value) => String(value).startsWith('siehe Anlage')),
      ).toEqual(['siehe Anlage 1', 'siehe Anlage 2']);
      const originalPages = doc.getNumberOfPages();
      const images = vi.spyOn(doc, 'addImage').mockReturnValue(doc);
      const dataUrl = vi.spyOn(HTMLCanvasElement.prototype, 'toDataURL').mockReturnValue('image');
      const read = vi.fn(async (block: typeof first) => [block.attachment!.id === 'b' ? 2 : 1]);
      const paint = vi.fn(
        async (_page: number, canvas: HTMLCanvasElement, layout?: 'portrait' | 'landscape') => {
          expect(layout).toBe(orientation);
          canvas.width = layout === 'landscape' ? 1400 : 1000;
          canvas.height = layout === 'landscape' ? 1000 : 1400;
        },
      );
      const destroy = vi.fn(async () => {});
      try {
        await appendSessionAttachments(doc, session, read, async ([count]) => ({
          count,
          render: paint,
          destroy,
        }));
      } finally {
        dataUrl.mockRestore();
      }
      expect(read.mock.calls.map(([block]) => block.attachment!.id)).toEqual(['b', 'a']);
      expect(paint.mock.calls.map(([page]) => page)).toEqual([1, 2, 1]);
      expect(
        text.mock.calls
          .map(([value]) => value)
          .filter((value) => String(value).startsWith('Anlage ')),
      ).toEqual(['Anlage 1', 'Anlage 1', 'Anlage 2']);
      expect(doc.getNumberOfPages()).toBe(originalPages + 3);
      expect(destroy).toHaveBeenCalledTimes(2);
      expect(images).toHaveBeenCalledTimes(3);
      for (const args of images.mock.calls) {
        const [, , x, y, w, h] = args as unknown as [
          string,
          string,
          number,
          number,
          number,
          number,
        ];
        expect(y).toBeGreaterThan(10);
        expect(x + w).toBeLessThanOrEqual(doc.internal.pageSize.getWidth());
        expect(y + h).toBeLessThanOrEqual(doc.internal.pageSize.getHeight());
      }
    });
  }
  it('propagates an unreadable page and releases its document', async () => {
    const { cycle, session } = sample();
    session.contents[1].attachment = { id: 'a', filename: 'Anlage.pdf' };
    const destroy = vi.fn(async () => {});
    await expect(
      appendSessionAttachments(
        createSessionPdf(cycle, session),
        session,
        async () => [1],
        async () => ({
          count: 1,
          render: async () => {
            throw new Error('Seite unlesbar');
          },
          destroy,
        }),
      ),
    ).rejects.toThrow('Seite unlesbar');
    expect(destroy).toHaveBeenCalledOnce();
  });
});
