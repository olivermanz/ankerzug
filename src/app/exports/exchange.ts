import { workspaceBlocks } from '../games/games';
import { Content, Game, MacroCycle, Template, Workspace, id } from '../models';
import { validateWorkspace } from '../planning';

export interface MacroCyclePackage {
  kind: 'ankerzug-macrocycle';
  formatVersion: 1 | 2;
  dataVersion: 2;
  cycle: MacroCycle;
  templates: Template[];
  games?: Game[];
}
export interface ImportPreview {
  source: string;
  cycle: MacroCycle;
  templates: Template[];
  games?: Game[];
  mappings: { before: string; after: string; collision: boolean }[];
}
export function macroCyclePackage(
  cycle: MacroCycle,
  templates: Template[],
  games: Game[] = [],
): MacroCyclePackage {
  const used = new Set(cycle.mesocycles.map((phase) => phase.defaultTemplateId));
  const selected = templates.filter((template) => used.has(template.id));
  const closedGames = gameClosure({ cycles: [cycle], templates: selected }, games);
  return structuredClone({
    ...(closedGames.length ? { games: closedGames } : {}),
    kind: 'ankerzug-macrocycle',
    formatVersion: closedGames.length ? 2 : 1,
    dataVersion: 2,
    cycle,
    templates: selected,
  });
}
function gameClosure(workspace: Workspace, games: Game[]): Game[] {
  const ids = new Set(
    workspaceBlocks(workspace)
      .map((b) => b.gameId)
      .filter(Boolean),
  );
  const selected = games.filter((g) => ids.has(g.id));
  if (selected.length !== ids.size) throw new Error('Referenziertes Spiel fehlt im Paket.');
  return selected;
}
function remapGames(games: Game[], map: Map<string, string>): void {
  games.forEach((g) => {
    g.id = map.get(g.id)!;
    g.attachments.forEach((a) => (a.id = map.get(a.id)!));
  });
}
function identifiers(value: unknown): string[] {
  if (Array.isArray(value)) return value.flatMap(identifiers);
  if (!value || typeof value !== 'object') return [];
  return Object.entries(value).flatMap(([key, item]) =>
    key === 'id' && typeof item === 'string' ? [item] : key === 'bytes' ? [] : identifiers(item),
  );
}
function allocateIdentifiers(workspace: Workspace, packet: unknown, makeId: () => string) {
  const existing = new Set(identifiers(workspace));
  const mappings: ImportPreview['mappings'] = [];
  const map = new Map<string, string>();
  const allocated = new Set(existing);
  for (const before of new Set(identifiers(packet))) {
    const after = makeId();
    if (!after || allocated.has(after))
      throw new Error('Neue Importkennung ist nicht eindeutig. Vorschau erneut erstellen.');
    allocated.add(after);
    map.set(before, after);
    mappings.push({ before, after, collision: existing.has(before) });
  }
  return { map, mappings };
}
export function importPreview(
  workspace: Workspace,
  source: MacroCyclePackage,
  makeId = id,
): ImportPreview {
  if (
    source.kind !== 'ankerzug-macrocycle' ||
    ![1, 2].includes(source.formatVersion) ||
    (source.formatVersion === 1 && !!source.games?.length) ||
    source.dataVersion !== 2
  )
    throw new Error('Nicht unterstütztes Makrozyklus-Paket.');
  const errors = validateWorkspace({
    cycles: [source.cycle],
    templates: source.templates,
    games: source.games,
  });
  if (errors.length) throw new Error(errors[0]);
  const packet = structuredClone(source);
  const { map, mappings } = allocateIdentifiers(workspace, packet, makeId);
  const ref = (value: string | null): string | null =>
    value === null ? null : (map.get(value) ?? value);
  const blocks = (items: Content[]) =>
    items.forEach((block) => {
      block.id = ref(block.id)!;
      if (block.gameId) block.gameId = ref(block.gameId);
    });
  const c = packet.cycle;
  // Match full slot IDs: identifiers may themselves contain @.
  const slots = [...c.slots].sort((a, b) => b.id.length - a.id.length);
  const origin = (key: string) => {
    const slot = slots.find((slot) => key.startsWith(slot.id + '@'));
    return slot ? ref(slot.id)! + key.slice(slot.id.length) : key;
  };
  c.sessions.forEach((session) => {
    session.occurrenceKey = origin(session.occurrenceKey);
  });
  c.exclusions = c.exclusions.map(origin);
  c.id = ref(c.id)!;
  c.mainCompetitionId = ref(c.mainCompetitionId)!;
  c.competitions.forEach((item) => {
    item.id = ref(item.id)!;
  });
  c.mesocycles.forEach((item) => {
    item.id = ref(item.id)!;
    item.targetCompetitionId = ref(item.targetCompetitionId);
    if (item.defaultTemplateId) item.defaultTemplateId = ref(item.defaultTemplateId);
  });
  c.periods.forEach((item) => {
    item.id = ref(item.id)!;
    item.retainedSlotIds = item.retainedSlotIds?.map((value) => ref(value)!) ?? null;
  });
  c.slots.forEach((item) => {
    item.id = ref(item.id)!;
  });
  c.goals.forEach((item) => {
    item.id = ref(item.id)!;
    if (item.scope !== 'week') item.reference = ref(item.reference)!;
  });
  c.sessions.forEach((item) => {
    item.id = ref(item.id)!;
    item.mesoCycleId = ref(item.mesoCycleId);
    item.sourceTrainingSlotId = ref(item.sourceTrainingSlotId);
    blocks(item.contents);
    if (item.generationBaseline) {
      item.generationBaseline.mesoCycleId = ref(item.generationBaseline.mesoCycleId);
      blocks(item.generationBaseline.contents);
    }
  });
  packet.templates.forEach((item) => {
    item.id = ref(item.id)!;
    blocks(item.contents);
  });
  remapGames(packet.games ?? [], map);
  const preview = {
    source: JSON.stringify(workspace),
    cycle: c,
    templates: packet.templates,
    ...(packet.games?.length ? { games: packet.games } : {}),
    mappings,
  };
  projectedImport(workspace, preview);
  return preview;
}
export function projectedImport(workspace: Workspace, preview: ImportPreview): Workspace {
  if (JSON.stringify(workspace) !== preview.source)
    throw new Error('Plan seit der Vorschau geändert. Import erneut öffnen.');
  const projected = structuredClone({
    ...workspace,
    ...(workspace.games?.length || preview.games?.length
      ? { games: [...(workspace.games ?? []), ...(preview.games ?? [])] }
      : {}),
    cycles: [...workspace.cycles, preview.cycle],
    templates: [...workspace.templates, ...preview.templates],
  });
  const errors = validateWorkspace(projected);
  if (errors.length) throw new Error(errors[0]);
  return projected;
}

export interface TemplatePackage {
  kind: 'ankerzug-templates';
  formatVersion: 1 | 2;
  dataVersion: 2;
  templates: Template[];
  games?: Game[];
}
export type TemplateImportPreview = Omit<ImportPreview, 'cycle'>;
export function templatePackage(templates: Template[], games: Game[] = []): TemplatePackage {
  if (!templates.length) throw new Error('Mindestens eine Vorlage auswählen.');
  const ids = identifiers(templates);
  if (new Set(ids).size !== ids.length) throw new Error('Doppelte Kennung im Vorlagen-Paket.');
  const closedGames = gameClosure({ cycles: [], templates }, games);
  const errors = validateWorkspace({ cycles: [], templates, games: closedGames });
  if (errors.length) throw new Error(errors[0]);
  return structuredClone({
    ...(closedGames.length ? { games: closedGames } : {}),
    kind: 'ankerzug-templates',
    formatVersion: closedGames.length ? 2 : 1,
    dataVersion: 2,
    templates,
  });
}
export function templateImportPreview(
  workspace: Workspace,
  source: TemplatePackage,
  makeId = id,
): TemplateImportPreview {
  if (
    source.kind !== 'ankerzug-templates' ||
    ![1, 2].includes(source.formatVersion) ||
    (source.formatVersion === 1 && !!source.games?.length) ||
    source.dataVersion !== 2
  )
    throw new Error('Nicht unterstütztes Vorlagen-Paket.');
  const packet = templatePackage(source.templates, source.games ?? []);
  const { map, mappings } = allocateIdentifiers(workspace, packet, makeId);
  for (const template of packet.templates) {
    template.id = map.get(template.id)!;
    for (const block of template.contents) {
      block.id = map.get(block.id)!;
      if (block.gameId) block.gameId = map.get(block.gameId)!;
    }
  }
  remapGames(packet.games ?? [], map);
  const preview = {
    source: JSON.stringify(workspace),
    templates: packet.templates,
    ...(packet.games?.length ? { games: packet.games } : {}),
    mappings,
  };
  projectedTemplateImport(workspace, preview);
  return preview;
}
export function projectedTemplateImport(
  workspace: Workspace,
  preview: TemplateImportPreview,
): Workspace {
  if (JSON.stringify(workspace) !== preview.source)
    throw new Error('Plan seit der Vorschau geändert. Import erneut öffnen.');
  const projected = structuredClone({
    ...workspace,
    ...(workspace.games?.length || preview.games?.length
      ? { games: [...(workspace.games ?? []), ...(preview.games ?? [])] }
      : {}),
    cycles: workspace.cycles,
    templates: [...workspace.templates, ...preview.templates],
  });
  const errors = validateWorkspace(projected);
  if (errors.length) throw new Error(errors[0]);
  return projected;
}
