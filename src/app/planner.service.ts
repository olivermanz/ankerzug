import { Game, GameAttachment } from './models';
import {
  GameImportPreview,
  newGame,
  gamePackage,
  gameImportPreview,
  projectedGameImport,
} from './games/games';
import { GamePdfValidationService } from './games/attachment-validation';
import {
  TemplateImportPreview,
  templatePackage,
  templateImportPreview,
  projectedTemplateImport,
} from './exports/exchange';
import {
  ImportPreview,
  importPreview,
  projectedImport,
  macroCyclePackage,
} from './exports/exchange';
import { calendarPlan, csvPlan, markdownPlan, exportFilename } from './exports/readable';
import { inject, Injectable, signal } from '@angular/core';
import {
  AppError,
  mainCompetition,
  Competition,
  Area,
  Content,
  id,
  MacroCycle,
  MesoCycle,
  Occurrence,
  RegenerationPreview,
  Session,
  Template,
  Workspace,
  normalizePlanning,
  defaultPlanning,
  defaultSessionTypeColors,
  normalizeSessionTypeColors,
} from './models';
import {
  contextKey,
  acceptPreview,
  captureOriginalPlan,
  applyTemplate,
  basisTemplates,
  generatePreview,
  newContent,
  nextOffset,
  sequenceWorkspace,
  phaseProposal,
  validateCycle,
  validateWorkspace,
} from './planning';
import { ContentPreview } from './content-planning';
import { DataAccessService } from './data-access.service';
import { projectedTimeline, TimelinePreview } from './timeline';
import { applyRegeneration, regenerationPreview } from './regeneration';
@Injectable({ providedIn: 'root' })
export class PlannerService {
  private readonly access = inject(DataAccessService);
  private readonly pdfValidator = inject(GamePdfValidationService);
  readonly workspace = signal<Workspace>({
    cycles: [],
    templates: [],
    planningTemplate: defaultPlanning(),
    sessionTypeColors: defaultSessionTypeColors(),
  });
  readonly ready = signal(false);
  readonly status = signal<'loading' | 'pending' | 'saving' | 'saved' | 'failed' | 'invalid'>(
    'loading',
  );
  readonly error = signal('');
  revision = 0;
  private changeVersion = 0;
  private savedVersion = 0;
  private writing = false;
  private timer?: ReturnType<typeof setTimeout>;
  private waiters: Array<{ resolve: () => void; reject: (error: Error) => void }> = [];
  private pendingAttachmentBytes = new Map<string, number[]>();

  addCompetition(cycle: MacroCycle): void {
    cycle.competitions.push({
      id: id(),
      name: 'Neuer Wettkampf',
      date: mainCompetition(cycle).date,
      priority: 'B',
      location: '',
    });
    this.changed();
  }
  setMainCompetition(cycle: MacroCycle, competitionId: string): void {
    const competition = cycle.competitions.find((c) => c.id === competitionId);
    if (!competition || competition.priority !== 'A')
      throw new Error('Nur ein A-Wettkampf kann Hauptwettkampf sein.');
    cycle.mainCompetitionId = competitionId;
    this.changed();
  }
  removeCompetition(cycle: MacroCycle, competition: Competition): void {
    if (cycle.mainCompetitionId === competition.id)
      throw new Error('Zuerst einen anderen A-Hauptwettkampf auswählen.');
    cycle.competitions = cycle.competitions.filter((c) => c.id !== competition.id);
    for (const phase of cycle.mesocycles)
      if (phase.targetCompetitionId === competition.id) phase.targetCompetitionId = null;
    this.changed();
  }
  toggleArea(areas: Area[], area: Area): void {
    const index = areas.indexOf(area);
    if (index < 0) areas.push(area);
    else areas.splice(index, 1);
    this.changed();
  }
  acknowledgeWarning(cycle: MacroCycle, context: string): void {
    if (!cycle.warningDecisions.includes(context)) cycle.warningDecisions.push(context);
    this.changed();
  }
  createCycle(cycle: MacroCycle): void {
    const errors = validateCycle(cycle);
    if (errors.length) throw new Error(errors[0]);
    this.workspace().cycles.push(cycle);
    this.changed();
  }
  deleteCycle(cycle: MacroCycle): void {
    this.workspace().cycles = this.workspace().cycles.filter((c) => c.id !== cycle.id);
    this.changed();
  }
  proposal(cycle: MacroCycle): MesoCycle[] {
    return phaseProposal(cycle);
  }
  phaseAssignmentPreview(cycle: MacroCycle, phases: MesoCycle[]) {
    const retainedIds = new Set([
      ...cycle.sessions
        .filter((s) => s.manuallyModified && s.mesoCycleId)
        .map((s) => s.mesoCycleId),
      ...cycle.goals.filter((g) => g.scope === 'mesocycle').map((g) => g.reference),
    ]);
    const retained = cycle.mesocycles.filter(
      (m) => retainedIds.has(m.id) && !phases.some((p) => p.id === m.id),
    );
    const next = [...phases, ...retained];
    return {
      phases: next,
      retained,
      assignments: cycle.sessions.map((s) => {
        const matches = next.filter((m) => s.date >= m.startDate && s.date <= m.endDate);
        return {
          session: s,
          previous: s.mesoCycleId,
          next: s.manuallyModified ? s.mesoCycleId : matches.length === 1 ? matches[0].id : null,
          retained: s.manuallyModified,
        };
      }),
    };
  }
  acceptPhases(cycle: MacroCycle, phases: MesoCycle[], replace = false): void {
    if (cycle.mesocycles.length && !replace)
      throw new Error('Vorhandene Phasen nur nach bewusster Bestätigung ersetzen.');
    const preview = this.phaseAssignmentPreview(cycle, phases);
    const errors = validateCycle({
      ...cycle,
      mesocycles: preview.phases,
      sessions: preview.assignments.map((a) => ({ ...a.session, mesoCycleId: a.next })),
    });
    if (errors.length) throw new Error(errors[0]);
    cycle.mesocycles = preview.phases;
    for (const assignment of preview.assignments) assignment.session.mesoCycleId = assignment.next;
    this.changed();
  }
  applyTimeline(cycle: MacroCycle, preview: TimelinePreview): void {
    const projected = projectedTimeline(cycle, preview);
    cycle.mesocycles = projected.mesocycles;
    cycle.goals = projected.goals;
    for (const session of cycle.sessions) {
      const next = projected.sessions.find((s) => s.id === session.id)!;
      session.mesoCycleId = next.mesoCycleId;
      session.manuallyModified = next.manuallyModified;
    }
    this.changed();
  }
  addPhase(cycle: MacroCycle): void {
    cycle.mesocycles.push({
      id: id(),
      name: 'Neuer Mesozyklus',
      startDate: cycle.startDate,
      endDate: cycle.endDate,
      type: 'VP1',
      color: 'grey',
      legacyArrowCount: null,
      sequenceNumber: null,
      targetCompetitionId: null,
      volume: null,
      intensity: null,
      competitionSpecificity: null,
      description: '',
      technicalPriority: '',
      physicalPriority: '',
      mentalPriority: '',
    });
    this.changed();
  }
  removePhase(cycle: MacroCycle, phase: MesoCycle): void {
    cycle.mesocycles = cycle.mesocycles.filter((m) => m.id !== phase.id);
    for (const goal of cycle.goals)
      if (goal.scope === 'mesocycle' && goal.reference === phase.id) {
        goal.scope = 'macrocycle';
        goal.reference = cycle.id;
      }
    for (const session of cycle.sessions)
      if (session.mesoCycleId === phase.id) session.mesoCycleId = null;
    this.changed();
  }
  addPeriod(cycle: MacroCycle): void {
    cycle.periods.push({
      id: id(),
      name: 'Schulferien',
      startDate: cycle.startDate,
      endDate: cycle.startDate,
      type: 'school',
      trainingPolicy: 'normal',
      retainedSlotIds: null,
      durationPercent: null,
    });
    this.changed();
  }
  removePeriod(cycle: MacroCycle, index: number): void {
    cycle.periods.splice(index, 1);
    this.changed();
  }
  addSlot(cycle: MacroCycle): void {
    cycle.slots.push({
      id: id(),
      name: 'Vereinstraining',
      sessionType: 'BAT',
      campOnly: false,
      weekday: 2,
      startTime: '18:00',
      defaultDuration: 120,
      location: '',
      validFrom: '',
      validUntil: '',
    });
    this.changed();
  }
  removeSlot(cycle: MacroCycle, slotId: string, removeUntouched: boolean): void {
    cycle.slots = cycle.slots.filter((s) => s.id !== slotId);
    for (const period of cycle.periods)
      if (period.retainedSlotIds)
        period.retainedSlotIds = period.retainedSlotIds.filter((id) => id !== slotId);
    if (removeUntouched)
      cycle.sessions = cycle.sessions.filter(
        (s) =>
          s.sourceTrainingSlotId !== slotId ||
          s.manuallyModified ||
          s.status !== 'planned' ||
          s.originalPlan !== null ||
          s.actualDuration !== null ||
          s.actualArrowCount !== null ||
          s.subjectiveLoad !== null ||
          s.contents.some(
            (b) =>
              b.actualDuration !== null || b.actualArrowCount !== null || b.actualLoad !== null,
          ),
      );
    cycle.goals = cycle.goals.filter(
      (g) => g.scope !== 'session' || cycle.sessions.some((s) => s.id === g.reference),
    );
    for (const session of cycle.sessions)
      if (session.sourceTrainingSlotId === slotId) session.sourceTrainingSlotId = null;
    this.changed();
  }
  preview(cycle: MacroCycle): Occurrence[] {
    return generatePreview(cycle);
  }
  regenerationPreview(cycle: MacroCycle): RegenerationPreview {
    return regenerationPreview(cycle);
  }
  regenerate(cycle: MacroCycle, preview: RegenerationPreview): void {
    const candidate = applyRegeneration(cycle, preview);
    cycle.sessions = candidate.sessions;
    cycle.exclusions = candidate.exclusions;
    this.changed();
  }
  generate(cycle: MacroCycle, rows: Occurrence[]): void {
    const candidate = structuredClone(cycle);
    acceptPreview(candidate, rows);
    const errors = validateCycle(candidate);
    if (errors.length) throw new Error(errors[0]);
    cycle.sessions = candidate.sessions;
    cycle.exclusions = candidate.exclusions;
    this.changed();
  }
  removeSession(cycle: MacroCycle, session: Session): void {
    cycle.sessions = cycle.sessions.filter((s) => s.id !== session.id);
    cycle.goals = cycle.goals.filter((g) => g.scope !== 'session' || g.reference !== session.id);
    if (!cycle.exclusions.includes(session.occurrenceKey))
      cycle.exclusions.push(session.occurrenceKey);
    this.changed();
  }
  sessionChanged(session: Session, content = false): void {
    captureOriginalPlan(session);
    session.manuallyModified = true;
    if (content) session.individuallyPlanned = true;
    this.changed();
  }
  addContent(session: Session): void {
    session.contents.push(newContent(nextOffset(session.contents), 30, 'Neuer Trainingsinhalt'));
    this.sessionChanged(session, true);
  }
  removeContent(session: Session, index: number): void {
    if (
      session.contents[index].actualArrowCount !== null ||
      session.contents[index].actualDuration !== null ||
      session.contents[index].actualLoad !== null
    )
      throw new Error('Blöcke mit Durchführungsdaten bleiben erhalten.');
    session.contents.splice(index, 1);
    this.sessionChanged(session, true);
  }
  moveContents(
    contents: Content[],
    index: number,
    direction: number,
    session: Session | null,
  ): void {
    const target = index + direction;
    if (target < 0 || target >= contents.length) return;
    [contents[index], contents[target]] = [contents[target], contents[index]];
    if (session) this.sessionChanged(session, true);
    else this.changed();
  }
  saveTemplate(session: Session, name: string): void {
    if (!name.trim()) throw new Error('Bitte einen Vorlagennamen eingeben.');
    this.workspace().templates.push({
      id: id(),
      name,
      description: '',
      sessionType: session.sessionType,
      areas: [...session.areas],
      volume: session.volume,
      intensity: session.intensity,
      competitionSpecificity: session.competitionSpecificity,
      defaultDuration: session.plannedDuration,
      contents: session.contents.map((c) => ({
        ...structuredClone(c),
        actualArrowCount: null,
        actualDuration: null,
        actualLoad: null,
        id: id(),
      })),
    });
    this.changed();
  }
  templateTargets(
    cycle: MacroCycle,
    scope: 'selected' | 'slot' | 'mesocycle' | 'unplanned',
    targetId: string,
    selection: Set<string>,
  ): Session[] {
    return cycle.sessions.filter((s) =>
      scope === 'selected'
        ? selection.has(s.id)
        : scope === 'slot'
          ? s.sourceTrainingSlotId === targetId
          : s.mesoCycleId === targetId && (scope !== 'unplanned' || !s.individuallyPlanned),
    );
  }
  templateProjection(
    targets: Session[],
    template: Template,
    mode: 'replace' | 'empty' | 'append',
  ): Session[] {
    const projected = structuredClone(targets);
    applyTemplate(projected, template, mode);
    return projected;
  }
  applyTemplate(
    targets: Session[],
    template: Template,
    mode: 'replace' | 'empty' | 'append',
  ): void {
    applyTemplate(targets, template, mode);
    this.changed();
  }
  applyContentPreview(cycle: MacroCycle, preview: ContentPreview): void {
    if (preview.source !== contextKey([cycle, this.workspace().templates]))
      throw new Error(
        'Der Plan oder die Vorlagen wurden geändert. Bitte eine neue Vorschau erstellen.',
      );
    const candidate = structuredClone(this.workspace());
    const projectedCycle = candidate.cycles.find((c) => c.id === cycle.id);
    if (!projectedCycle) throw new Error('Makrozyklus fehlt.');
    for (const next of preview.projected) {
      const target = projectedCycle.sessions.find((s) => s.id === next.id);
      if (!target) throw new Error('Zieleinheit fehlt.');
      Object.assign(target, structuredClone(next));
    }
    const errors = validateWorkspace(candidate);
    if (errors.length) throw new Error(errors[0]);
    for (const next of preview.projected)
      Object.assign(cycle.sessions.find((s) => s.id === next.id)!, structuredClone(next));
    this.changed();
  }
  duplicateTemplate(template: Template): void {
    this.workspace().templates.push({
      ...structuredClone(template),
      id: id(),
      name: template.name + ' (Kopie)',
      contents: template.contents.map((c) => ({ ...structuredClone(c), id: id() })),
    });
    this.changed();
  }
  deleteTemplate(template: Template): void {
    this.workspace().templates = this.workspace().templates.filter((t) => t.id !== template.id);
    for (const cycle of this.workspace().cycles)
      for (const phase of cycle.mesocycles)
        if (phase.defaultTemplateId === template.id) phase.defaultTemplateId = null;
    this.changed();
  }
  addTemplateContent(template: Template): void {
    template.contents.push(newContent(nextOffset(template.contents), 30, 'Neuer Trainingsinhalt'));
    this.changed();
  }
  removeTemplateContent(template: Template, index: number): void {
    template.contents.splice(index, 1);
    this.changed();
  }

  async load(): Promise<void> {
    try {
      const snapshot = await this.access.load();
      snapshot.workspace.cycles.forEach(
        (cycle) => (cycle.planning = normalizePlanning(cycle.planning)),
      );
      snapshot.workspace.planningTemplate = normalizePlanning(
        snapshot.workspace.planningTemplate ??
          snapshot.workspace.cycles[0]?.planning ??
          defaultPlanning(),
      );
      snapshot.workspace.sessionTypeColors = normalizeSessionTypeColors(
        snapshot.workspace.sessionTypeColors,
      );
      sequenceWorkspace(snapshot.workspace);
      this.workspace.set(snapshot.workspace);
      this.revision = snapshot.revision;
      this.ready.set(true);
      this.status.set('saved');
      this.error.set('');
      if (snapshot.revision === 0) {
        this.workspace().templates = basisTemplates();
        this.changed();
      }
    } catch (e) {
      this.fail(e);
    }
  }
  changed(): void {
    sequenceWorkspace(this.workspace());
    this.changeVersion++;
    this.status.set('pending');
    clearTimeout(this.timer);
    this.timer = setTimeout(() => void this.flush(), 450);
  }
  async flush(): Promise<void> {
    clearTimeout(this.timer);
    if (this.writing || !this.ready() || this.savedVersion === this.changeVersion) return;
    const errors = validateWorkspace(this.workspace());
    if (errors.length) {
      this.error.set(errors[0]);
      this.status.set('invalid');
      this.finishWaiters(new Error(errors[0]));
      return;
    }
    const version = this.changeVersion;
    const workspace = structuredClone({
      ...this.workspace(),
      games: this.workspace().games?.map((game) => ({
        ...game,
        attachments: game.attachments.map(({ bytes: _bytes, ...attachment }) => attachment),
      })),
    });
    const attachments = [...this.pendingAttachmentBytes].map(([id, bytes]) => ({ id, bytes }));
    this.writing = true;
    this.status.set('saving');
    this.error.set('');
    try {
      const result = await this.access.save({
        workspace,
        expectedRevision: this.revision,
        attachments,
      });
      this.revision = result.revision;
      this.savedVersion = version;
      for (const attachment of attachments) this.pendingAttachmentBytes.delete(attachment.id);
      this.status.set(this.savedVersion === this.changeVersion ? 'saved' : 'pending');
    } catch (e) {
      this.fail(e);
      this.finishWaiters(new Error(this.error()));
    } finally {
      this.writing = false;
    }
    if (this.status() !== 'failed' && this.savedVersion !== this.changeVersion) await this.flush();
    if (this.savedVersion === this.changeVersion) this.finishWaiters();
  }
  async settled(): Promise<void> {
    if (this.status() === 'failed') throw new Error(this.error());
    if (this.savedVersion === this.changeVersion && !this.writing) return;
    return new Promise((resolve, reject) => {
      this.waiters.push({ resolve, reject });
      void this.flush();
    });
  }
  createGame(game: Game): void {
    const errors = validateWorkspace({
      ...this.workspace(),
      games: [...(this.workspace().games ?? []), game],
    });
    if (errors.length) throw new Error(errors[0]);
    this.workspace().games ??= [];
    this.workspace().games!.push(structuredClone(game));
    this.changed();
  }
  async attachGamePdfs(game: Game): Promise<void> {
    await this.settled();
    const selected = await this.access.pickGamePdfs();
    if (!selected) return;
    const attachments: GameAttachment[] = selected.map((a) => ({ ...a, id: id() }));
    await this.pdfValidator.validate([{ ...game, attachments }]);
    if (!this.workspace().games?.includes(game))
      throw new Error('Spiel seit der Auswahl geändert. Bitte erneut öffnen.');
    for (const attachment of attachments) {
      this.pendingAttachmentBytes.set(attachment.id, attachment.bytes!);
      const { bytes: _bytes, ...metadata } = attachment;
      game.attachments.push(metadata);
    }
    this.changed();
    await this.settled();
  }
  async openGameAttachment(game: Game, attachment: GameAttachment): Promise<void> {
    await this.settled();
    const [stored] = await this.access.readGameAttachments([attachment.id]);
    if (!stored) throw new Error('PDF-Anhang fehlt im lokalen Speicher.');
    await this.access.exportSessionPdf(
      attachment.filename.replace(/\.pdf$/i, '.pdf'),
      stored.bytes,
    );
  }
  async exportGamePdf(game: Game): Promise<void> {
    await this.settled();
    const { createGamePdf } = await import('./pdf/game-pdf');
    const doc = createGamePdf(structuredClone(game));
    await this.access.exportSessionPdf(
      exportFilename(game, 'pdf'),
      Array.from(new Uint8Array(doc.output('arraybuffer'))),
    );
  }
  async exportGames(gameIds: string[]): Promise<string | null> {
    await this.settled();
    const games = gameIds.map((value) => {
      const game = this.workspace().games?.find((g) => g.id === value);
      if (!game) throw new Error('Spiel nicht mehr vorhanden.');
      return game;
    });
    const attachments = await this.access.readGameAttachments(
      games.flatMap((game) => game.attachments.map((attachment) => attachment.id)),
    );
    const bytes = new Map(attachments.map((attachment) => [attachment.id, attachment.bytes]));
    const packet = gamePackage(
      games.map((game) => ({
        ...game,
        attachments: game.attachments.map((attachment) => ({
          ...attachment,
          bytes: bytes.get(attachment.id) ?? [],
        })),
      })),
    );
    return this.access.exportPlanFile(
      'games',
      exportFilename(
        { name: games.length === 1 ? games[0].name : 'Trainingsspiele' },
        'spiele.json',
      ),
      Array.from(new TextEncoder().encode(JSON.stringify(packet))),
    );
  }
  async previewGameImport(): Promise<GameImportPreview | null> {
    await this.settled();
    const packet = await this.access.readGamePackage();
    if (!packet) return null;
    await this.pdfValidator.validate(packet.games);
    return gameImportPreview(this.workspace(), packet);
  }
  async importGames(preview: GameImportPreview): Promise<void> {
    await this.settled();
    const projected = projectedGameImport(this.workspace(), preview);
    for (const game of projected.games ?? [])
      for (const attachment of game.attachments) {
        if (attachment.bytes) {
          this.pendingAttachmentBytes.set(attachment.id, attachment.bytes);
          delete attachment.bytes;
        }
      }
    this.workspace.set(projected);
    this.changed();
    await this.settled();
  }
  async exportSessionPdf(cycle: MacroCycle, session: Session): Promise<void> {
    await this.settled();
    const cycleCopy = structuredClone(cycle);
    const sessionCopy = structuredClone(session);
    const { createSessionPdf, sessionPdfFilename } = await import('./pdf/session-pdf');
    const document = createSessionPdf(
      cycleCopy,
      sessionCopy,
      structuredClone(this.workspace().games ?? []),
    );
    const bytes = Array.from(new Uint8Array(document.output('arraybuffer')));
    return this.access.exportSessionPdf(sessionPdfFilename(sessionCopy), bytes);
  }
  async exportSessionLandscapePdf(cycle: MacroCycle, session: Session): Promise<void> {
    await this.settled();
    const cycleCopy = structuredClone(cycle);
    const sessionCopy = structuredClone(session);
    const { createSessionLandscapePdf, sessionLandscapePdfFilename } = await import(
      './pdf/session-pdf'
    );
    const document = createSessionLandscapePdf(
      cycleCopy,
      sessionCopy,
      structuredClone(this.workspace().games ?? []),
    );
    const bytes = Array.from(new Uint8Array(document.output('arraybuffer')));
    return this.access.exportSessionPdf(sessionLandscapePdfFilename(sessionCopy), bytes);
  }
  async previewTemplateImport(): Promise<TemplateImportPreview | null> {
    await this.settled();
    const packet = await this.access.readTemplatePackage();
    if (packet) await this.pdfValidator.validate(packet.games ?? []);
    return packet ? templateImportPreview(this.workspace(), packet) : null;
  }
  async importTemplates(preview: TemplateImportPreview): Promise<void> {
    await this.settled();
    this.workspace.set(projectedTemplateImport(this.workspace(), preview));
    this.changed();
    await this.settled();
  }
  async exportTemplates(templateIds: string[]): Promise<string | null> {
    await this.settled();
    const templates = templateIds.map((id) => {
      const template = this.workspace().templates.find((value) => value.id === id);
      if (!template) throw new Error('Vorlage nicht mehr vorhanden. Auswahl erneut öffnen.');
      return template;
    });
    const packet = templatePackage(templates, this.workspace().games ?? []);
    const filename = exportFilename(
      { name: templates.length === 1 ? templates[0].name : 'Trainingseinheit-Vorlagen' },
      'vorlagen.json',
    );
    return this.access.exportPlanFile(
      'templates',
      filename,
      Array.from(new TextEncoder().encode(JSON.stringify(packet, null, 2))),
    );
  }
  async previewImport(): Promise<ImportPreview | null> {
    await this.settled();
    const packet = await this.access.readMacroCyclePackage();
    if (packet) await this.pdfValidator.validate(packet.games ?? []);
    return packet ? importPreview(this.workspace(), packet) : null;
  }
  async importMacroCycle(preview: ImportPreview): Promise<MacroCycle> {
    await this.settled();
    const workspace = projectedImport(this.workspace(), preview);
    this.workspace.set(workspace);
    this.changed();
    await this.settled();
    return workspace.cycles[workspace.cycles.length - 1];
  }
  async exportPlan(
    cycle: MacroCycle,
    format: 'package' | 'markdown' | 'csv' | 'ics' | 'pdf',
  ): Promise<string | null> {
    await this.settled();
    const copy = structuredClone(cycle);
    let bytes: number[];
    if (format === 'pdf') {
      const { createPlanPdf } = await import('./pdf/plan-pdf');
      bytes = Array.from(
        new Uint8Array(
          createPlanPdf(copy, structuredClone(this.workspace().games ?? [])).output('arraybuffer'),
        ),
      );
    } else {
      const text =
        format === 'package'
          ? JSON.stringify(
              macroCyclePackage(copy, this.workspace().templates, this.workspace().games ?? []),
              null,
              2,
            )
          : format === 'markdown'
            ? markdownPlan(copy, this.workspace().games ?? [])
            : format === 'csv'
              ? csvPlan(copy)
              : calendarPlan(copy);
      bytes = Array.from(new TextEncoder().encode(text));
    }
    const extension =
      format === 'package' ? 'ankerzug.json' : format === 'markdown' ? 'md' : format;
    return this.access.exportPlanFile(format, exportFilename(copy, extension), bytes);
  }
  async backup(): Promise<string | null> {
    await this.settled();
    return this.access.backup();
  }
  async recover(): Promise<void> {
    await this.settled();
    const snapshot = await this.access.recover(this.revision);
    snapshot.workspace.cycles.forEach(
      (cycle) => (cycle.planning = normalizePlanning(cycle.planning)),
    );
    sequenceWorkspace(snapshot.workspace);
    this.workspace.set(snapshot.workspace);
    this.revision = snapshot.revision;
    this.changeVersion = 0;
    this.savedVersion = 0;
    this.status.set('saved');
    this.error.set('');
  }
  async restore(contents: string): Promise<void> {
    await this.settled();
    const envelope = JSON.parse(contents);
    if (envelope.formatVersion === 2)
      await this.pdfValidator.validate(envelope.workspace.games ?? []);
    const snapshot = await this.access.restore(contents, this.revision);
    snapshot.workspace.cycles.forEach(
      (cycle) => (cycle.planning = normalizePlanning(cycle.planning)),
    );
    sequenceWorkspace(snapshot.workspace);
    this.workspace.set(snapshot.workspace);
    this.revision = snapshot.revision;
    this.changeVersion = 0;
    this.savedVersion = 0;
    this.status.set('saved');
    this.error.set('');
  }
  private finishWaiters(error?: Error): void {
    for (const waiter of this.waiters.splice(0)) {
      if (error) waiter.reject(error);
      else waiter.resolve();
    }
  }
  private fail(error: unknown): void {
    this.status.set('failed');
    this.error.set(
      (error as AppError)?.message ||
        'Lokale Speicherung fehlgeschlagen. Änderungen bleiben für einen erneuten Versuch erhalten.',
    );
  }
}
