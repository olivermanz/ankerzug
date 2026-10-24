import { Content, Game, GameAttachment, Workspace, id } from '../models';

export const ATTACHMENT_LIMIT = 5 * 1024 * 1024;
export function gameForms(game: Game): string {
  return [game.single ? 'Einzelspiel' : '', game.team ? 'Teamspiel' : '']
    .filter(Boolean)
    .join(' / ');
}
export const GAME_RATINGS = [
  ['effort', 'Aufwand'],
  ['fun', 'Spaß'],
  ['duration', 'Dauer'],
  ['competitionProximity', 'Wettkampfnähe'],
] as const;
export function newGame(): Game {
  return {
    id: id(),
    name: '',
    single: true,
    team: true,
    effort: 3,
    fun: 3,
    duration: 3,
    competitionProximity: 3,
    description: '',
    attachments: [],
  };
}
export function gameErrors(games: Game[]): string[] {
  const ids = new Set<string>();
  for (const game of games) {
    if (!game.id || ids.has(game.id)) return ['Spielkennungen müssen eindeutig sein.'];
    ids.add(game.id);
    if (
      !game.name.trim() ||
      !game.description.trim() ||
      typeof game.single !== 'boolean' ||
      typeof game.team !== 'boolean' ||
      (!game.single && !game.team) ||
      GAME_RATINGS.some(([key]) => !Number.isInteger(game[key]) || game[key] < 1 || game[key] > 5)
    )
      return [
        'Spiele benötigen Name, Beschreibung, mindestens eine Spielform und vier ganze Kennzahlen von 1 bis 5.',
      ];
    for (const attachment of game.attachments) {
      if (!attachment.id || ids.has(attachment.id))
        return ['Anhangkennungen müssen eindeutig sein.'];
      ids.add(attachment.id);
      if (attachmentError(attachment)) return [attachmentError(attachment)!];
    }
  }
  return [];
}
export function attachmentError(
  attachment: Pick<GameAttachment, 'filename' | 'bytes'>,
): string | null {
  const { filename, bytes } = attachment;
  if (
    !filename ||
    filename.length > 200 ||
    !/\.pdf$/i.test(filename) ||
    /[<>:"/\\|?*\u0000-\u001f\u007f]/.test(filename)
  )
    return 'Ungültiger PDF-Dateiname (maximal 200 Zeichen).';
  if (!bytes) return null;
  if (!bytes.length || bytes.length > ATTACHMENT_LIMIT)
    return 'PDF-Anhänge dürfen höchstens 5 MiB groß sein.';
  if (
    bytes.some((b) => !Number.isInteger(b) || b < 0 || b > 255) ||
    String.fromCharCode(...bytes.slice(0, 5)) !== '%PDF-' ||
    !String.fromCharCode(...bytes.slice(-1024))
      .trimEnd()
      .endsWith('%%EOF')
  )
    return 'Anhang enthält keine gültigen PDF-Daten.';
  return null;
}
export function workspaceBlocks(workspace: Workspace): Content[] {
  return [
    ...workspace.templates.flatMap((t) => t.contents),
    ...workspace.cycles.flatMap((c) =>
      c.sessions.flatMap((s) => [...s.contents, ...(s.generationBaseline?.contents ?? [])]),
    ),
  ];
}
export function gameReferenceErrors(workspace: Workspace): string[] {
  const games = workspace.games ?? [];
  const otherIds = new Set<string>();
  const collect = (value: unknown): void => {
    if (!value || typeof value !== 'object') return;
    if (Array.isArray(value)) {
      value.forEach(collect);
      return;
    }
    for (const [key, item] of Object.entries(value)) {
      if (key === 'id' && typeof item === 'string') otherIds.add(item);
      else collect(item);
    }
  };
  collect(workspace.cycles);
  collect(workspace.templates);
  if (games.some((g) => otherIds.has(g.id) || g.attachments.some((a) => otherIds.has(a.id))))
    return ['Spiel- und Anhangkennungen kollidieren mit bestehenden Planungsdaten.'];
  return workspaceBlocks(workspace).some(
    (b) => b.gameId != null && (b.category !== 'Spiel' || !games.some((g) => g.id === b.gameId)),
  )
    ? ['Spielbezug fehlt oder gehört zu einem anderen Blocktyp.']
    : [];
}
export function gameName(block: Content, games: Game[]): string {
  if (!block.gameId) return '';
  const game = games.find((g) => g.id === block.gameId);
  if (!game) throw new Error('Das ausgewählte Spiel fehlt.');
  return game.name;
}
export interface GamePackage {
  kind: 'ankerzug-games';
  formatVersion: 1;
  dataVersion: 2;
  games: Game[];
}
export function gamePackage(games: Game[]): GamePackage {
  const errors = gameErrors(games);
  if (!games.length || errors.length)
    throw new Error(errors[0] ?? 'Mindestens ein Spiel auswählen.');
  return structuredClone({ kind: 'ankerzug-games', formatVersion: 1, dataVersion: 2, games });
}
export interface GameImportPreview {
  source: string;
  games: Game[];
  collisions: { name: string; sameName: boolean; sameId: boolean }[];
}
export function gameImportPreview(
  workspace: Workspace,
  packet: GamePackage,
  makeId = id,
): GameImportPreview {
  if (packet.kind !== 'ankerzug-games' || packet.formatVersion !== 1 || packet.dataVersion !== 2)
    throw new Error('Nicht unterstütztes Spielpaket.');
  const games = gamePackage(packet.games).games;
  const occupied = new Set<string>();
  const collect = (v: unknown): void => {
    if (!v || typeof v !== 'object') return;
    if (Array.isArray(v)) {
      v.forEach(collect);
      return;
    }
    for (const [key, value] of Object.entries(v)) {
      if (key === 'id' && typeof value === 'string') occupied.add(value);
      else if (key !== 'bytes') collect(value);
    }
  };
  collect(workspace);
  const collisions = games.map((g) => ({
    name: g.name,
    sameName: (workspace.games ?? []).some((x) => x.name === g.name),
    sameId: occupied.has(g.id) || g.attachments.some((a) => occupied.has(a.id)),
  }));
  const allocate = () => {
    const value = makeId();
    if (!value || occupied.has(value)) throw new Error('Neue Importkennung ist nicht eindeutig.');
    occupied.add(value);
    return value;
  };
  for (const game of games) {
    game.id = allocate();
    game.attachments.forEach((a) => (a.id = allocate()));
  }
  return { source: JSON.stringify(workspace), games, collisions };
}
export function projectedGameImport(workspace: Workspace, preview: GameImportPreview): Workspace {
  if (JSON.stringify(workspace) !== preview.source)
    throw new Error('Daten seit der Vorschau geändert. Import erneut öffnen.');
  return structuredClone({ ...workspace, games: [...(workspace.games ?? []), ...preview.games] });
}
