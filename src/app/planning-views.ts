import { MacroCycle, MesoCycle, Session, SESSION_TYPES, SessionType } from './models';
import { dateAt, dayCount, dayNumber, mondayOf, validDate, Measure } from './planning';

export const SESSION_STATUS_LABELS: Record<Session['status'], string> = {
  planned: 'Geplant',
  completed: 'Durchgeführt',
  cancelled: 'Ausgefallen',
  moved: 'Verschoben',
};
export interface SessionFilters {
  phase: string;
  slot: string;
  from: string;
  until: string;
  status: '' | Session['status'];
  content: '' | 'planned' | 'unplanned';
}
export const emptySessionFilters = (): SessionFilters => ({
  phase: '',
  slot: '',
  from: '',
  until: '',
  status: '',
  content: '',
});
export function filterSessions(cycle: MacroCycle, filters: SessionFilters): Session[] {
  return cycle.sessions
    .filter(
      (s) =>
        (!filters.phase ||
          (filters.phase === 'none' ? s.mesoCycleId === null : s.mesoCycleId === filters.phase)) &&
        (!filters.slot ||
          (filters.slot === 'none'
            ? s.sourceTrainingSlotId === null
            : s.sourceTrainingSlotId === filters.slot)) &&
        (!filters.from || s.date >= filters.from) &&
        (!filters.until || s.date <= filters.until) &&
        (!filters.status || s.status === filters.status) &&
        (!filters.content || s.individuallyPlanned === (filters.content === 'planned')),
    )
    .sort(
      (a, b) =>
        a.date.localeCompare(b.date) ||
        a.startTime.localeCompare(b.startTime) ||
        a.id.localeCompare(b.id),
    );
}
export function overlaps(start: string, end: string, from: string, until: string): boolean {
  return start <= until && end >= from;
}
export function calendarDates(anchor: string, mode: 'month' | 'week'): string[] {
  if (!validDate(anchor)) return [];
  const first = mode === 'week' ? mondayOf(anchor) : mondayOf(anchor.slice(0, 7) + '-01');
  const monthEnd = dateAt(dayNumber(shiftCalendar(anchor.slice(0, 7) + '-01', 'month', 1)) - 1);
  const last = mode === 'week' ? dayNumber(first) + 6 : dayNumber(mondayOf(monthEnd)) + 6;
  return Array.from({ length: last - dayNumber(first) + 1 }, (_, i) =>
    dateAt(dayNumber(first) + i),
  );
}
export function shiftCalendar(anchor: string, mode: 'month' | 'week', step: number): string {
  if (!validDate(anchor)) return anchor;
  if (mode === 'week') return dateAt(dayNumber(anchor) + step * 7);
  const first = new Date(anchor.slice(0, 7) + '-01T00:00:00Z');
  first.setUTCMonth(first.getUTCMonth() + step);
  const shifted = first.toISOString().slice(0, 10);
  return validDate(shifted) ? shifted : anchor;
}
// Read the current shared plan, never compatibility measurements or original-plan snapshots.
export function plannedPhaseSummary(cycle: MacroCycle, phase: MesoCycle) {
  const sessions = filterSessions(cycle, { ...emptySessionFilters(), phase: phase.id });
  const planned = sessions.filter((s) => s.status !== 'moved');
  const values = planned.map(
    (s) =>
      s.plannedArrowCount ??
      (s.contents.length && s.contents.every((b) => b.plannedArrowCount !== null)
        ? s.contents.reduce((sum, b) => sum + b.plannedArrowCount!, 0)
        : null),
  );
  const recorded = values.filter((value): value is number => value !== null).length;
  const partial = planned.reduce(
    (sum, s, i) =>
      sum + (values[i] ?? s.contents.reduce((n, b) => n + (b.plannedArrowCount ?? 0), 0)),
    0,
  );
  const arrows: Measure = {
    total: planned.length && recorded === planned.length ? partial : null,
    partial,
    recorded,
    expected: planned.length,
  };
  return {
    sessions,
    count: planned.length,
    minutes: planned.reduce((sum, s) => sum + s.plannedDuration, 0),
    arrows,
    periods: cycle.periods.filter((p) =>
      overlaps(p.startDate, p.endDate, phase.startDate, phase.endDate),
    ),
    competitions: cycle.competitions.filter(
      (c) => c.date >= phase.startDate && c.date <= phase.endDate,
    ),
  };
}

export interface MesocycleCompositionSegment {
  sessionType: SessionType;
  count: number;
  share: number;
}
export interface MesocycleComposition {
  phase: MesoCycle;
  days: number;
  segments: MesocycleCompositionSegment[];
}
/** Static planned-unit composition; moved occurrences are intentionally excluded. */
export function mesocycleCompositions(cycle: MacroCycle): MesocycleComposition[] {
  return [...cycle.mesocycles]
    .sort((a, b) => a.startDate.localeCompare(b.startDate) || a.id.localeCompare(b.id))
    .map((phase) => {
      const sessions = cycle.sessions.filter(
        (session) => session.mesoCycleId === phase.id && session.status !== 'moved',
      );
      const total = sessions.length;
      return {
        phase,
        days: dayCount(phase.startDate, phase.endDate),
        segments: SESSION_TYPES.flatMap((sessionType) => {
          const count = sessions.filter((session) => session.sessionType === sessionType).length;
          return count ? [{ sessionType, count, share: count / total }] : [];
        }),
      };
    });
}

export interface CalendarPhaseRibbon {
  phase: MesoCycle;
  column: number;
  span: number;
  lane: number;
  continuesBefore: boolean;
  continuesAfter: boolean;
}
export function calendarWeeks(cycle: MacroCycle, anchor: string, mode: 'month' | 'week') {
  const dates = calendarDates(anchor, mode);
  const weeks: Array<{ days: string[]; ribbons: CalendarPhaseRibbon[] }> = [];
  for (let i = 0; i < dates.length; i += 7) {
    const days = dates.slice(i, i + 7);
    const laneEnds: number[] = [];
    const ribbons = cycle.mesocycles
      .filter((p) => overlaps(p.startDate, p.endDate, days[0], days[6]))
      .sort((a, b) => a.startDate.localeCompare(b.startDate) || a.id.localeCompare(b.id))
      .map((phase) => {
        const start = phase.startDate < days[0] ? days[0] : phase.startDate;
        const end = phase.endDate > days[6] ? days[6] : phase.endDate;
        const column = dayNumber(start) - dayNumber(days[0]) + 1;
        const span = dayCount(start, end);
        let lane = laneEnds.findIndex((last) => last < column);
        if (lane === -1) lane = laneEnds.length;
        laneEnds[lane] = column + span - 1;
        return {
          phase,
          column,
          span,
          lane,
          continuesBefore: phase.startDate < days[0],
          continuesAfter: phase.endDate > days[6],
        };
      });
    weeks.push({ days, ribbons });
  }
  return weeks;
}
