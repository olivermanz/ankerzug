import { MacroCycle, Session, Template } from './models';
import { applyTemplate, contextKey, sequenceContents } from './planning';

export interface ContentPreview {
  source: string;
  name: string;
  projected: Session[];
  protectedCount: number;
}

export function previousSession(cycle: MacroCycle, session: Session): Session | null {
  return (
    cycle.sessions
      .filter(
        (s) =>
          s.id !== session.id &&
          (s.date < session.date || (s.date === session.date && s.startTime < session.startTime)) &&
          s.status !== 'cancelled' &&
          s.status !== 'moved',
      )
      .sort(
        (a, b) =>
          b.date.localeCompare(a.date) ||
          b.startTime.localeCompare(a.startTime) ||
          a.id.localeCompare(b.id),
      )[0] ?? null
  );
}

export function previousPreview(
  cycle: MacroCycle,
  session: Session,
  templates: Template[],
): ContentPreview {
  const previous = previousSession(cycle, session);
  if (session.individuallyPlanned || !previous?.contents.length)
    throw new Error('Keine vorherigen Inhalte für diese ungeplante Einheit verfügbar.');
  const projected = structuredClone(session);
  // Copy content only: keep date, duration, profile, type, status and other trainer decisions.
  applyTemplate(
    [projected],
    {
      id: '',
      name: '',
      description: '',
      defaultDuration: session.plannedDuration,
      sessionType: session.sessionType,
      areas: session.areas,
      volume: session.volume,
      intensity: session.intensity,
      competitionSpecificity: session.competitionSpecificity,
      contents: previous.contents,
    },
    'replace',
  );
  sequenceContents(projected.contents);
  return {
    source: contextKey([cycle, templates]),
    name: `Inhalte von ${previous.name} · ${previous.date} ${previous.startTime}`,
    projected: [projected],
    protectedCount: 0,
  };
}
