import { gameName } from '../games/games';
import { Game, MacroCycle, PHASES, POLICIES, WEEKDAYS } from '../models';
import { SESSION_STATUS_LABELS } from '../planning-views';

export const chronologicalSessions = (cycle: MacroCycle) =>
  [...cycle.sessions].sort(
    (a, b) =>
      a.date.localeCompare(b.date) ||
      a.startTime.localeCompare(b.startTime) ||
      a.id.localeCompare(b.id),
  );
export function exportFilename(cycle: Pick<MacroCycle, 'name'>, extension: string): string {
  const name = cycle.name
    .replace(/[<>:"/\\|?*\u0000-\u001f\u007f]/g, '-')
    .trim()
    .slice(0, 80)
    .replace(/[. ]+$/, '');
  return `Ankerzug-${name || 'Trainingsplan'}.${extension}`;
}
export interface PlanSection {
  title: string;
  lines: string[];
}
export function planSections(c: MacroCycle, games: Game[] = []): PlanSection[] {
  const text = (label: string, value: string) => (value ? [`${label}: ${value}`] : []);
  return [
    {
      title: c.name,
      lines: [
        `${c.startDate} – ${c.endDate}`,
        ...text('Sportler / Gruppe', c.athlete),
        ...text('Disziplin', c.discipline),
        ...text('Altersklasse', c.ageClass),
        ...text('Beschreibung', c.goal),
      ],
    },
    {
      title: 'Wettkämpfe',
      lines: [...c.competitions]
        .sort((a, b) => a.date.localeCompare(b.date))
        .map(
          (x) =>
            `${x.date} · ${x.priority} · ${x.name}${x.id === c.mainCompetitionId ? ' · Hauptwettkampf' : ''}${x.location ? ' · ' + x.location : ''}`,
        ),
    },
    ...[...c.mesocycles]
      .sort((a, b) => a.startDate.localeCompare(b.startDate))
      .map((x) => ({
        title: `Mesozyklus: ${x.name}`,
        lines: [
          `${x.startDate} – ${x.endDate} · ${PHASES[x.type]}`,
          `Umfang ${x.volume ?? 'offen'} · Spezifität ${x.competitionSpecificity ?? 'offen'} (1–5)`,
          ...text('Beschreibung', x.description),
          ...text('Technik', x.technicalPriority),
          ...text('Körperlich', x.physicalPriority),
          ...text('Mental', x.mentalPriority),
        ],
      })),
    {
      title: 'Ferien & Sonderzeiträume',
      lines: c.periods.map(
        (x) => `${x.startDate} – ${x.endDate} · ${x.name} · ${POLICIES[x.trainingPolicy]}`,
      ),
    },
    ...chronologicalSessions(c).map((s) => ({
      title: `${s.date} · ${s.startTime} · ${s.name}`,
      lines: [
        `Geplant: ${s.plannedDuration} min · ${SESSION_STATUS_LABELS[s.status]}`,
        `Mesozyklus: ${c.mesocycles.find((x) => x.id === s.mesoCycleId)?.name ?? 'Ohne Mesozyklus'}`,
        `Pfeile: ${s.plannedArrowCount ?? 'offen'}`,
        `Umfang ${s.volume ?? 'offen'} · Intensität ${s.intensity ?? 'offen'} · Spezifität ${s.competitionSpecificity ?? 'offen'} (1–5)`,
        ...text('Notiz', s.notes),
        ...s.contents.flatMap((b, i) => [
          `${i + 1}. +${b.startOffsetMinutes} min · ${b.durationMinutes} min · ${b.category}`,
          ...text('Spiel', gameName(b, games)),
          ...text('Ziele', b.goals),
          b.content,
          ...text('Material', b.material),
          ...(b.plannedArrowCount !== null ? [`Geplante Pfeile: ${b.plannedArrowCount}`] : []),
          ...text('Notiz', b.notes),
        ]),
      ],
    })),
  ];
}
function markdown(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/([\\`*_{}\[\]()#+.!|~-])/g, '\\$1');
}
export function markdownPlan(c: MacroCycle, games: Game[] = []): string {
  return (
    planSections(c, games)
      .map(
        (s, i) =>
          `${i ? '##' : '#'} ${markdown(s.title)}\n\n${s.lines.map(markdown).join('\n\n') || 'Keine Einträge.'}`,
      )
      .join('\n\n') + '\n'
  );
}
function csvCell(value: string | number | null): string {
  let text = value === null ? '' : String(value);
  if (typeof value === 'string' && /^[\s\u0000-\u001f]*[=+\-@]/.test(text)) text = "'" + text;
  return '"' + text.replace(/"/g, '""') + '"';
}
export function csvPlan(c: MacroCycle): string {
  const columns = [
    'Typ',
    'Makrozyklus',
    'Datum',
    'Enddatum',
    'Uhrzeit',
    'Name',
    'Status / Priorität',
    'Dauer (min)',
    'Mesozyklus',
    'Blockstart (min)',
    'Kategorie',
    'Ziele',
    'Inhalte',
    'Material',
    'Geplante Pfeile',
    'Notiz',
    'Ort',
    'Umfang (1–5)',
    'Intensität (1–5)',
    'Spezifität (1–5)',
  ];
  const rows: Record<string, string | number | null>[] = [];
  rows.push({
    Typ: 'Makrozyklus',
    Datum: c.startDate,
    Enddatum: c.endDate,
    Name: c.name,
    Inhalte: c.goal,
    Notiz: [c.athlete, c.discipline, c.ageClass].filter(Boolean).join(' · '),
  });
  for (const x of c.competitions)
    rows.push({
      Typ: 'Wettkampf',
      Datum: x.date,
      Name: x.name,
      'Status / Priorität': x.priority,
      Ort: x.location,
    });
  for (const x of c.mesocycles)
    rows.push({
      Typ: 'Mesozyklus',
      Datum: x.startDate,
      Enddatum: x.endDate,
      Name: x.name,
      Kategorie: PHASES[x.type],
      Inhalte: x.description,
      Notiz: [x.technicalPriority, x.physicalPriority, x.mentalPriority]
        .filter(Boolean)
        .join(' · '),
      'Umfang (1–5)': x.volume,
      'Spezifität (1–5)': x.competitionSpecificity,
    });
  for (const x of c.periods)
    rows.push({
      Typ: 'Sonderzeitraum',
      Datum: x.startDate,
      Enddatum: x.endDate,
      Name: x.name,
      Inhalte: POLICIES[x.trainingPolicy],
    });
  for (const x of c.slots)
    rows.push({
      Typ: 'Trainingsslot',
      Datum: x.validFrom,
      Enddatum: x.validUntil,
      Uhrzeit: x.startTime,
      Name: x.name,
      Kategorie: WEEKDAYS[x.weekday],
      'Dauer (min)': x.defaultDuration,
      Ort: x.location,
    });
  for (const s of chronologicalSessions(c)) {
    const phase = c.mesocycles.find((x) => x.id === s.mesoCycleId)?.name ?? '';
    rows.push({
      Typ: 'Einheit',
      Datum: s.date,
      Uhrzeit: s.startTime,
      Name: s.name,
      'Status / Priorität': SESSION_STATUS_LABELS[s.status],
      'Dauer (min)': s.plannedDuration,
      Mesozyklus: phase,
      'Geplante Pfeile': s.plannedArrowCount,
      Notiz: s.notes,
      'Umfang (1–5)': s.volume,
      'Intensität (1–5)': s.intensity,
      'Spezifität (1–5)': s.competitionSpecificity,
    });
    for (const b of s.contents)
      rows.push({
        Typ: 'Inhalt',
        Datum: s.date,
        Uhrzeit: s.startTime,
        Name: s.name,
        'Dauer (min)': b.durationMinutes,
        Mesozyklus: phase,
        'Blockstart (min)': b.startOffsetMinutes,
        Kategorie: b.category,
        Ziele: b.goals,
        Inhalte: b.content,
        Material: b.material,
        'Geplante Pfeile': b.plannedArrowCount,
        Notiz: b.notes,
      });
  }
  return (
    '\ufeff' +
    [
      columns,
      ...rows.map((row) =>
        columns.map((column) => (column === 'Makrozyklus' ? c.name : (row[column] ?? null))),
      ),
    ]
      .map((row) => row.map(csvCell).join(';'))
      .join('\r\n') +
    '\r\n'
  );
}
const icsText = (value: string) =>
  value
    .replace(/\r\n?/g, '\n')
    .replace(/\\/g, '\\\\')
    .replace(/\n/g, '\\n')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '');
function fold(line: string): string {
  const encoder = new TextEncoder();
  let result = '',
    length = 0;
  for (const char of line) {
    const bytes = encoder.encode(char).length;
    if (length + bytes > 75) {
      result += '\r\n ';
      length = 1;
    }
    result += char;
    length += bytes;
  }
  return result;
}
export function calendarPlan(c: MacroCycle, stamp = new Date()): string {
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Ankerzug//Shared Training Plan//DE',
    'CALSCALE:GREGORIAN',
  ];
  const dtstamp = stamp
    .toISOString()
    .replace(/[-:]/g, '')
    .replace(/\.\d{3}/, '');
  const event = (
    id: string,
    start: string,
    name: string,
    description: string,
    status: string,
    extra: string[],
  ) => {
    lines.push(
      'BEGIN:VEVENT',
      `UID:${encodeURIComponent(c.id)}.${encodeURIComponent(id)}@ankerzug.local`,
      `DTSTAMP:${dtstamp}`,
      start,
      `SUMMARY:${icsText(name)}`,
      `DESCRIPTION:${icsText(description)}`,
      `STATUS:${status}`,
      ...extra,
      'END:VEVENT',
    );
  };
  for (const s of chronologicalSessions(c))
    event(
      s.id,
      `DTSTART:${s.date.replace(/-/g, '')}T${s.startTime.replace(':', '')}00`,
      s.name,
      [
        c.name,
        s.notes,
        ...s.contents.map(
          (b) =>
            `${b.durationMinutes} min · ${b.content}${b.goals ? '\nZiele: ' + b.goals : ''}${b.material ? '\nMaterial: ' + b.material : ''}`,
        ),
      ]
        .filter(Boolean)
        .join('\n'),
      ['cancelled', 'moved'].includes(s.status) ? 'CANCELLED' : 'CONFIRMED',
      [`DURATION:PT${s.plannedDuration}M`],
    );
  for (const x of c.competitions)
    event(
      x.id,
      `DTSTART;VALUE=DATE:${x.date.replace(/-/g, '')}`,
      x.name,
      `${c.name}\nPriorität ${x.priority}`,
      'CONFIRMED',
      x.location ? [`LOCATION:${icsText(x.location)}`] : [],
    );
  lines.push('END:VCALENDAR');
  return lines.map(fold).join('\r\n') + '\r\n';
}
