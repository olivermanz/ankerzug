import { jsPDF } from 'jspdf';
import { Game, MacroCycle } from '../models';
import { planSections } from '../exports/readable';
import { NOTO_SANS } from './noto-sans';

export function createPlanPdf(cycle: MacroCycle, games: Game[] = []): jsPDF {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4', compress: true });
  doc.addFileToVFS('NotoSans-Regular.ttf', NOTO_SANS);
  doc.addFont('NotoSans-Regular.ttf', 'NotoSans', 'normal');
  doc.setFont('NotoSans');
  doc.setProperties({ title: cycle.name, author: 'Ankerzug' });
  const font = doc.getFont().metadata;
  const glyph = font.characterToGlyph as (code: number) => number;
  const sections = planSections(cycle, games);
  for (const s of sections)
    for (const value of [s.title, ...s.lines])
      for (const char of value)
        if (!/\s/.test(char) && !glyph.call(font, char.codePointAt(0)!))
          throw new Error(`Das Zeichen „${char}“ wird von der PDF-Schrift nicht unterstützt.`);
  renderPlanPdf(doc, cycle, games);
  return doc;
}

export function renderPlanPdf(doc: jsPDF, cycle: MacroCycle, games: Game[] = []): void {
  const sections = planSections(cycle, games);
  let y = 30;
  const header = () => {
    doc.setFontSize(9);
    doc.setTextColor(38, 76, 61);
    doc.text('ANKERZUG / TRAININGSPLAN', 16, 18);
    doc.setDrawColor(213, 222, 216);
    doc.line(16, 23, 194, 23);
  };
  header();
  const room = (height: number) => {
    if (y + height > 276) {
      doc.addPage();
      header();
      y = 30;
    }
  };
  for (const section of sections) {
    room(25);
    for (const [value, size, step] of [
      [section.title, 14, 7],
      ...section.lines.map((line) => [line, 10, 5] as const),
    ] as readonly (readonly [string, number, number])[]) {
      doc.setFontSize(size);
      const rows = doc.splitTextToSize(
        value.replace(/\r\n?/g, '\n').replace(/\t/g, '    '),
        178,
      ) as string[];
      for (const row of rows) {
        room(step);
        doc.setFontSize(size);
        doc.setTextColor(42, 49, 46);
        doc.text(row, 16, y);
        y += step;
      }
      y += 2;
    }
    y += 6;
  }
  const pages = doc.getNumberOfPages();
  for (let page = 1; page <= pages; page++) {
    doc.setPage(page);
    doc.setFontSize(8);
    doc.setTextColor(100);
    doc.text(`Seite ${page} / ${pages}`, 194, 287, { align: 'right' });
  }
}
