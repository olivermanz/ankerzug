import { jsPDF } from 'jspdf';
import { Game } from '../models';
import { gameForms, GAME_RATINGS } from '../games/games';
import { NOTO_SANS } from './noto-sans';
export function createGamePdf(game: Game): jsPDF {
  const doc = new jsPDF({ unit: 'mm', format: 'a4', compress: true });
  doc.addFileToVFS('NotoSans-Regular.ttf', NOTO_SANS);
  doc.addFont('NotoSans-Regular.ttf', 'NotoSans', 'normal');
  doc.setFont('NotoSans');
  doc.setProperties({ title: game.name, author: 'Ankerzug' });
  const fields = [
    game.name,
    gameForms(game),
    ...GAME_RATINGS.map(([key, label]) => `${label}: ${game[key]} / 5`),
    'Beschreibung',
    game.description,
    ...(game.attachments.length
      ? ['PDF-Anhänge (separat öffnen und drucken)', ...game.attachments.map((a) => a.filename)]
      : []),
  ];
  const font = doc.getFont().metadata;
  const glyph = font.characterToGlyph as (code: number) => number;
  for (const value of fields)
    for (const char of value)
      if (!/\s/.test(char) && !glyph.call(font, char.codePointAt(0)!))
        throw new Error(`Das Zeichen „${char}“ wird von der PDF-Schrift nicht unterstützt.`);
  let y = 30;
  const header = () => {
    doc.setFontSize(9);
    doc.setTextColor(38, 76, 61);
    doc.text('ANKERZUG / SPIELANLEITUNG', 16, 18);
  };
  header();
  for (const [index, field] of fields.entries()) {
    const size = index === 0 ? 20 : 10;
    const step = index === 0 ? 9 : 5;
    doc.setFontSize(size);
    const rows = doc.splitTextToSize(
      field.replace(/\r\n?/g, '\n').replace(/\t/g, '    '),
      178,
    ) as string[];
    for (const row of rows) {
      if (y + step > 276) {
        doc.addPage();
        header();
        y = 30;
      }
      doc.setFontSize(size);
      doc.setTextColor(42, 49, 46);
      doc.text(row, 16, y);
      y += step;
    }
    y += 5;
  }
  const pages = doc.getNumberOfPages();
  for (let page = 1; page <= pages; page++) {
    doc.setPage(page);
    doc.setFontSize(8);
    doc.text(`Seite ${page} / ${pages}`, 194, 287, { align: 'right' });
  }
  return doc;
}
