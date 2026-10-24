import { gameName } from '../games/games';
import { jsPDF } from 'jspdf';
import { Game, MacroCycle, Session } from '../models';
import { NOTO_SANS } from './noto-sans';

const MARGIN = 13;
const BOTTOM = 280;
const LINE = 4.5;
const date = (value: string): string => value.split('-').reverse().join('.');
const offset = (minutes: number): string =>
  `${Math.floor(minutes / 60)
    .toString()
    .padStart(2, '0')}:${(minutes % 60).toString().padStart(2, '0')}`;
function clock(start: string, minutes: number): string {
  const [hour, minute] = start.split(':').map(Number);
  const total = hour * 60 + minute + minutes;
  const days = Math.floor(total / 1440);
  return offset(total % 1440) + (days ? ` (+${days} Tag${days === 1 ? '' : 'e'})` : '');
}
export function sessionPdfFilename(session: Session): string {
  const name = (session.name || 'Trainingseinheit')
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, '-')
    .trim()
    .slice(0, 80)
    .replace(/[. ]+$/, '');
  return `Ankerzug-${session.date}-${name || 'Trainingseinheit'}.pdf`;
}

export function sessionLandscapePdfFilename(session: Session): string {
  return sessionPdfFilename(session).replace(/\.pdf$/, '-A4-Landscape.pdf');
}

function assertSupportedGlyphs(
  doc: jsPDF,
  cycle: MacroCycle,
  session: Session,
  games: Game[],
): void {
  const glyph = doc.getFont().metadata.characterToGlyph as (code: number) => number;
  const values = [
    cycle.name,
    session.name,
    session.notes,
    cycle.mesocycles.find((phase) => phase.id === session.mesoCycleId)?.name || '',
    ...session.contents.flatMap((block) => [
      block.category,
      block.goals,
      block.content,
      block.material,
      block.notes,
      gameName(block, games),
    ]),
  ];
  for (const value of values)
    for (const character of value)
      if (!/\s/.test(character) && !glyph.call(doc.getFont().metadata, character.codePointAt(0)!))
        throw new Error(
          `Das Zeichen „${character}“ wird von der PDF-Schrift nicht unterstützt. Bitte den Text für den Export anpassen.`,
        );
}

export function createSessionPdf(cycle: MacroCycle, session: Session, games: Game[] = []): jsPDF {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4', compress: true });
  doc.addFileToVFS('NotoSans-Regular.ttf', NOTO_SANS);
  doc.addFont('NotoSans-Regular.ttf', 'NotoSans', 'normal');
  doc.setFont('NotoSans');
  doc.setProperties({ title: session.name || 'Trainingseinheit', author: 'Ankerzug' });
  assertSupportedGlyphs(doc, cycle, session, games);
  renderSessionPdf(doc, cycle, session, games);
  return doc;
}

/** Landscape A4 lesson-plan table, following the supplied Word-template structure. */
export function createSessionLandscapePdf(
  cycle: MacroCycle,
  session: Session,
  games: Game[] = [],
): jsPDF {
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4', compress: true });
  doc.addFileToVFS('NotoSans-Regular.ttf', NOTO_SANS);
  doc.addFont('NotoSans-Regular.ttf', 'NotoSans', 'normal');
  doc.setFont('NotoSans');
  doc.setProperties({ title: session.name || 'Trainingseinheit', author: 'Ankerzug' });
  assertSupportedGlyphs(doc, cycle, session, games);
  renderSessionLandscapePdf(doc, cycle, session, games);
  return doc;
}

export function renderSessionLandscapePdf(
  doc: jsPDF,
  cycle: MacroCycle,
  session: Session,
  games: Game[] = [],
): void {
  const margin = 12;
  const right = 285;
  const top = 14;
  const bottom = 194;
  const line = 3.6;
  const green = [38, 76, 61] as const;
  const ink = [42, 49, 46] as const;
  const columns = [26, 23, 46, 98, 45, 35] as const;
  const headings = ['PHASE', 'ZEIT', 'ZIEL', 'INHALT', 'MATERIAL /\nGERÄTE', 'ANMERKUNGEN'];
  let y = top;
  const x = columns.reduce<number[]>(
    (values, width) => [...values, values.at(-1)! + width],
    [margin],
  );
  const wrap = (value: string, width: number): string[] => {
    doc.setFontSize(8);
    return doc.splitTextToSize(
      value.trim().replace(/\r\n?/g, '\n').replace(/\t/g, '    ') || '–',
      width - 3,
    ) as string[];
  };
  const drawCell = (
    left: number,
    rowTop: number,
    width: number,
    height: number,
    lines: string[],
  ) => {
    doc.rect(left, rowTop, width, height);
    doc.setFontSize(8);
    doc.setTextColor(...ink);
    for (const [index, value] of lines.entries())
      doc.text(value, left + 1.5, rowTop + 4 + index * line);
  };
  const drawHeader = () => {
    doc.setFontSize(16);
    doc.setTextColor(...green);
    doc.text(session.name || 'Trainingseinheit', margin, y);
    doc.setFontSize(9);
    doc.setTextColor(...ink);
    const phase = cycle.mesocycles.find((item) => item.id === session.mesoCycleId)?.name;
    doc.text(
      `${date(session.date)} · ${session.startTime} Uhr · ${session.plannedDuration} min${phase ? ` · ${phase}` : ''}`,
      margin,
      y + 6,
    );
    y += 12;
    doc.setFillColor(217, 217, 217);
    doc.rect(margin, y, right - margin, 10, 'F');
    doc.setDrawColor(90);
    doc.setTextColor(...ink);
    doc.setFontSize(7);
    for (const [index, heading] of headings.entries()) {
      doc.rect(x[index], y, columns[index], 10);
      for (const [lineIndex, value] of heading.split('\n').entries())
        doc.text(value, x[index] + 1.5, y + 4 + lineIndex * 3);
    }
    y += 10;
  };
  const nextPage = () => {
    doc.addPage();
    y = top;
    drawHeader();
  };
  drawHeader();
  let elapsed = 0;
  for (const block of session.contents) {
    const values = [
      block.category || '–',
      `${block.durationMinutes} (${elapsed + block.durationMinutes}) min`,
      block.goals,
      [gameName(block, games) ? `Spiel: ${gameName(block, games)}` : '', block.content]
        .filter(Boolean)
        .join('\n\n'),
      block.material,
      block.notes,
    ];
    const cells = values.map((value, index) => wrap(value, columns[index]));
    let position = 0;
    while (position < Math.max(...cells.map((cell) => cell.length))) {
      if (y + 10 > bottom) nextPage();
      const availableLines = Math.max(1, Math.floor((bottom - y - 4) / line));
      const count = Math.min(
        availableLines,
        Math.max(...cells.map((cell) => cell.length)) - position,
      );
      const height = Math.max(10, count * line + 4);
      for (const [index, cell] of cells.entries())
        drawCell(x[index], y, columns[index], height, cell.slice(position, position + count));
      y += height;
      position += count;
      if (position < Math.max(...cells.map((cell) => cell.length))) nextPage();
    }
    elapsed += block.durationMinutes;
  }
  if (!session.contents.length) {
    const height = 12;
    for (const [index, width] of columns.entries())
      drawCell(
        x[index],
        y,
        width,
        height,
        index === 3 ? ['Noch keine Trainingsinhalte geplant.'] : ['–'],
      );
  }
  const pages = doc.getNumberOfPages();
  for (let page = 1; page <= pages; page++) {
    doc.setPage(page);
    doc.setDrawColor(160);
    doc.line(margin, 199, right, 199);
    doc.setFontSize(7);
    doc.setTextColor(100);
    doc.text('ANKERZUG  /  Trainingsplan', margin, 204);
    doc.text(`Seite ${page} / ${pages}`, right, 204, { align: 'right' });
  }
}

/** A4 layout with a print-friendly time rail and continued blocks on later pages. */
export function renderSessionPdf(
  doc: jsPDF,
  cycle: MacroCycle,
  session: Session,
  games: Game[] = [],
): void {
  const green = [38, 76, 61] as const;
  const ink = [42, 49, 46] as const;
  let y = 24;
  function label(value: string, x: number, baseline: number, size = 8): void {
    doc.setFontSize(size);
    doc.setTextColor(...green);
    doc.text(value, x, baseline);
  }
  function header(): void {
    label('ANKERZUG  /  TRAININGSPLAN', MARGIN, 16, 8);
    doc.setFontSize(7);
    doc.setTextColor(100);
    doc.text(`${date(session.date)}  ·  ${session.startTime} Uhr`, 197, 16, { align: 'right' });
    doc.setDrawColor(213, 222, 216);
    doc.line(MARGIN, 20, 197, 20);
  }
  function nextPage(): void {
    doc.addPage();
    header();
    y = 27;
  }
  function room(height: number): void {
    if (y + height > BOTTOM) nextPage();
  }
  function wrap(value: string, width: number, size: number): string[] {
    doc.setFontSize(size);
    return doc.splitTextToSize(
      value.replace(/\r\n?/g, '\n').replace(/\t/g, '    '),
      width,
    ) as string[];
  }
  function text(value: string, size = 10, step = LINE): void {
    for (const line of wrap(value, 178, size)) {
      room(step);
      doc.setFontSize(size);
      doc.setTextColor(...ink);
      doc.text(line, MARGIN, y);
      y += step;
    }
  }
  function field(title: string, value: string): void {
    if (!value.trim()) return;
    room(15);
    label(title.toUpperCase(), MARGIN, y);
    y += 6;
    text(value);
    y += 5;
  }
  header();
  label('TRAININGSEINHEIT', MARGIN, y);
  y += 7;
  text(session.name || 'Trainingseinheit', 18, 7);
  y += 2;
  room(25);
  doc.setFillColor(240, 245, 241);
  doc.roundedRect(MARGIN, y, 184, 20, 1.5, 1.5, 'F');
  const summary = [
    { x: 19, title: 'DATUM', value: date(session.date) },
    { x: 92, title: 'BEGINN', value: `${session.startTime} Uhr` },
    { x: 147, title: 'GEPLANTE DAUER', value: `${session.plannedDuration} min` },
  ];
  for (const item of summary) {
    label(item.title, item.x, y + 6, 6);
    doc.setFontSize(12);
    const width = doc.getTextWidth(item.value);
    label(item.value, item.x, y + 15, width > 42 ? (12 * 42) / width : 12);
  }
  y += 26;
  const phaseName =
    cycle.mesocycles.find((phase) => phase.id === session.mesoCycleId)?.name || 'Ohne Mesozyklus';
  const contexts = [
    { title: 'MAKROZYKLUS', value: cycle.name, x: MARGIN },
    { title: 'MESOZYKLUS', value: phaseName, x: 108 },
  ];
  const contextHeight =
    Math.max(...contexts.map((item) => wrap(item.value, 90, 8).length)) * LINE + 9;
  if (contextHeight < BOTTOM - 27) {
    room(contextHeight);
    for (const item of contexts) {
      label(item.title, item.x, y, 6);
      doc.setFontSize(8);
      doc.setTextColor(...ink);
      for (const [index, line] of wrap(item.value, 90, 8).entries())
        doc.text(line, item.x, y + 5 + index * LINE);
    }
    y += contextHeight;
  } else {
    field('Makrozyklus', cycle.name);
    field('Mesozyklus', phaseName);
  }
  field('Notiz', session.notes);
  const duration = session.contents.reduce((sum, block) => sum + block.durationMinutes, 0);
  if (duration !== session.plannedDuration) {
    text(`Inhaltsdauer: ${duration} min · geplant: ${session.plannedDuration} min`, 9);
    text(`Abweichung: ${duration - session.plannedDuration} min`, 9);
    y += 5;
  }
  room(19);
  label('TRAININGSABLAUF', MARGIN, y, 10);
  y += 7;
  if (!session.contents.length) text('Noch keine Trainingsinhalte geplant.');
  let minutes = 0;
  for (const [index, block] of session.contents.entries()) {
    const title = `${index + 1}. ${block.category || 'Trainingsinhalt'}`;
    const titleLines = wrap(title, 133, 11);
    const body = [
      gameName(block, games) ? `Spiel: ${gameName(block, games)}` : '',
      block.goals.trim() ? `Ziele: ${block.goals}` : '',
      block.content,
      block.material.trim() ? `Material: ${block.material}` : '',
      block.notes.trim() ? `Anmerkungen: ${block.notes}` : '',
    ]
      .filter(Boolean)
      .join('\n\n');
    const rows = [
      ...titleLines.map((value) => ({ value, size: 11, color: green })),
      { value: '', size: 10, color: ink },
      ...wrap(body, 133, 9).map((value) => ({ value, size: 9, color: ink })),
    ];
    let position = 0;
    let continued = false;
    while (position < rows.length) {
      const remainingHeight = Math.max(34, (rows.length - position) * LINE + 10);
      room(Math.min(remainingHeight, BOTTOM - 27));
      const continuationHeight = continued ? 6 : 0;
      const count = Math.min(
        rows.length - position,
        Math.floor((BOTTOM - y - 10 - continuationHeight) / LINE),
      );
      const height = Math.max(34, count * LINE + 10 + continuationHeight);
      // A light time panel and a thin rule keep the plan clear in grayscale too.
      doc.setFillColor(240, 245, 241);
      doc.roundedRect(MARGIN, y, 39, height, 1.5, 1.5, 'F');
      doc.setFillColor(...green);
      doc.rect(MARGIN, y + 4, 0.8, height - 8, 'F');
      label('START', 18, y + 6, 6);
      const start = clock(session.startTime, minutes);
      const end = clock(session.startTime, minutes + block.durationMinutes);
      label(start, 18, y + 12, start.length > 8 ? 8 : 12);
      label(`DAUER  ${block.durationMinutes} min`, 18, y + 18, 6);
      label(`ENDE  ${end}`, 18, y + 24, end.length > 15 ? 6 : 7);
      label(`+${offset(minutes)}`, 18, y + 29, 6);
      let baseline = y + 7;
      if (continued) {
        label(`Block ${index + 1} · Fortsetzung`, 57, baseline, 7);
        baseline += 6;
      }
      for (const row of rows.slice(position, position + count)) {
        doc.setFontSize(row.size);
        doc.setTextColor(row.color[0], row.color[1], row.color[2]);
        doc.text(row.value, 57, baseline);
        baseline += LINE;
      }
      doc.setDrawColor(225, 230, 226);
      doc.line(57, y + height, 197, y + height);
      y += height + 4;
      position += count;
      if (position < rows.length) {
        nextPage();
        continued = true;
      }
    }
    minutes += block.durationMinutes;
  }
  const pages = doc.getNumberOfPages();
  for (let page = 1; page <= pages; page++) {
    doc.setPage(page);
    doc.setDrawColor(213, 222, 216);
    doc.line(MARGIN, 281, 197, 281);
    doc.setFontSize(7);
    doc.setTextColor(100);
    doc.text('ANKERZUG  /  Trainingsplan', MARGIN, 287);
    doc.text(`Seite ${page} / ${pages}`, 197, 287, { align: 'right' });
  }
}
