import { WelcomeComponent } from './welcome/welcome.component';
import { gameForms } from './games/games';
import { GamesComponent } from './games/games.component';
import { ExportsComponent } from './exports/exports.component';
import {
  Component,
  HostListener,
  inject,
  OnInit,
  signal,
  ChangeDetectionStrategy,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { DateFieldComponent } from './shared/date-field.component';
import {
  CATEGORIES,
  MESOCYCLE_COLORS,
  AREAS,
  SELECTABLE_SESSION_TYPES,
  SESSION_TYPE_LABELS,
  mainCompetition,
  SpecialPeriod,
  Content,
  MacroCycle,
  MesoCycle,
  Occurrence,
  RegenerationPreview,
  PERIOD_TYPES,
  POLICIES,
  Session,
  SessionType,
  Template,
  WEEKDAYS,
} from './models';
import { contentWarnings, cycleWarnings, dayCount, newCycle, detailedWarnings } from './planning';
import {
  timelinePreview,
  projectedTimeline,
  TimelinePreview,
  TimelineOperation,
  orderedPhases,
  timelineDefaults,
} from './timeline';
import { ContentPreview, previousPreview, previousSession } from './content-planning';
import { PlannerService } from './planner.service';
import { PlanningViewsComponent } from './planning-views.component';
import {
  emptySessionFilters,
  filterSessions,
  mesocycleCompositions,
  SESSION_STATUS_LABELS,
} from './planning-views';
@Component({
  selector: 'app-root',
  standalone: true,
  imports: [
    WelcomeComponent,
    GamesComponent,
    FormsModule,
    DateFieldComponent,
    PlanningViewsComponent,
    ExportsComponent,
  ],
  changeDetection: ChangeDetectionStrategy.Eager,
  templateUrl: './app.component.html',
})
export class AppComponent implements OnInit {
  readonly gameForms = gameForms;
  readonly planner = inject(PlannerService);
  readonly appVersion = signal('In der Browser-Vorschau nicht verfügbar');
  readonly projectLicenseUrl = '/licenses/ankerzug/LICENSE';
  readonly thirdPartyNoticesUrl = '/licenses/THIRD_PARTY_NOTICES.md';
  readonly exportingPdf = signal(false);
  readonly creatingBackup = signal(false);
  async exportSessionPdf(cycle: MacroCycle, session: Session): Promise<void> {
    if (this.exportingPdf()) return;
    this.exportingPdf.set(true);
    this.message.set('');
    try {
      await this.planner.exportSessionPdf(cycle, session);
      this.message.set('PDF im Viewer geöffnet.');
    } catch (error) {
      this.message.set((error as Error).message || 'PDF konnte nicht exportiert werden.');
    } finally {
      this.exportingPdf.set(false);
    }
  }
  async exportSessionLandscapePdf(cycle: MacroCycle, session: Session): Promise<void> {
    if (this.exportingPdf()) return;
    this.exportingPdf.set(true);
    this.message.set('');
    try {
      await this.planner.exportSessionLandscapePdf(cycle, session);
      this.message.set('PDF im Viewer geöffnet.');
    } catch (error) {
      this.message.set((error as Error).message || 'PDF konnte nicht exportiert werden.');
    } finally {
      this.exportingPdf.set(false);
    }
  }
  changeBlockType(block: Content, session?: Session): void {
    if (block.category !== 'Spiel') delete block.gameId;
    if (session) this.contentChanged(session);
    else this.planner.changed();
  }
  readonly mesocycleColors = Object.entries(MESOCYCLE_COLORS);
  phaseOptions(c: MacroCycle): Array<[string, string]> {
    return [...(c.planning.phases ?? [])]
      .sort((a, b) => a.displayOrder - b.displayOrder || a.code.localeCompare(b.code))
      .map((phase) => [phase.code, phase.label]);
  }
  readonly policies = Object.entries(POLICIES);
  readonly periodTypes = Object.entries(PERIOD_TYPES);
  readonly categories = CATEGORIES;
  readonly detailedWarnings = detailedWarnings;
  readonly sessionTypeLabels = SESSION_TYPE_LABELS;
  readonly mesocycleCompositions = mesocycleCompositions;
  readonly highlightedSessionType = signal<SessionType | null>(null);
  configureReduction(c: MacroCycle, p: SpecialPeriod, enabled: boolean): void {
    p.retainedSlotIds = enabled ? c.slots.map((s) => s.id) : null;
    this.changed();
  }
  toggleRetainedSlot(p: SpecialPeriod, slotId: string): void {
    if (!p.retainedSlotIds) return;
    const i = p.retainedSlotIds.indexOf(slotId);
    if (i < 0) p.retainedSlotIds.push(slotId);
    else p.retainedSlotIds.splice(i, 1);
    this.changed();
  }
  changeMainDate(c: MacroCycle, value: string): void {
    const previous = mainCompetition(c).date;
    mainCompetition(c).date = value;
    this.targetDateChanged(c, previous);
  }
  readonly areas = AREAS;
  readonly sessionTypes = SELECTABLE_SESSION_TYPES;
  readonly mainCompetition = mainCompetition;
  readonly previousSession = previousSession;
  contentPreview = signal<ContentPreview | null>(null);
  previewPrevious(session: Session): void {
    const cycle = this.cycle();
    if (!cycle) return;
    try {
      this.contentPreview.set(previousPreview(cycle, session, this.planner.workspace().templates));
    } catch (e) {
      this.message.set((e as Error).message);
    }
  }
  acceptContent(): void {
    const cycle = this.cycle(),
      preview = this.contentPreview();
    if (!cycle || !preview) return;
    try {
      this.planner.applyContentPreview(cycle, preview);
      this.contentPreview.set(null);
    } catch (e) {
      this.message.set((e as Error).message);
      this.contentPreview.set(null);
    }
  }
  tryAction(action: () => void): void {
    try {
      action();
      this.message.set('');
    } catch (e) {
      this.message.set((e as Error).message);
    }
  }
  removeCompetition(c: MacroCycle, index: number): void {
    this.tryAction(() => this.planner.removeCompetition(c, c.competitions[index]));
  }
  setMainCompetition(c: MacroCycle, id: string): void {
    this.tryAction(() => this.planner.setMainCompetition(c, id));
  }
  targetDateChanged(c: MacroCycle, previousDate: string): void {
    if (c.endDate === previousDate) c.endDate = mainCompetition(c).date;
    this.changed();
  }
  readonly weekdays = WEEKDAYS;
  readonly statusLabels = {
    loading: 'Daten werden geladen …',
    pending: 'Änderungen ausstehend',
    saving: 'Wird gespeichert …',
    saved: 'Lokal gespeichert',
    failed: 'Nicht gespeichert',
    invalid: 'Eingaben prüfen',
  };
  selectedId = signal<string | null>(null);
  tab = signal('overview');
  selectedPhaseId = signal('');
  filters = emptySessionFilters();
  readonly sessionFiltersExpanded = signal(false);
  readonly sessionStatuses = Object.entries(SESSION_STATUS_LABELS);
  readonly sessionStatusLabels = SESSION_STATUS_LABELS;
  filteredSessions(c: MacroCycle): Session[] {
    return filterSessions(c, this.filters);
  }
  openPhaseDetail(phase: MesoCycle): void {
    this.selectedPhaseId.set(phase.id);
    this.selectedSession.set(null);
    this.tab.set('phase-detail');
  }
  openSessionEditor(session: Session): void {
    this.selectedSession.set(session);
  }
  resetFilters(): void {
    this.filters = emptySessionFilters();
  }
  draft = signal<MacroCycle | null>(null);
  proposal = signal<MesoCycle[] | null>(null);
  preview = signal<Occurrence[] | null>(null);
  regeneration = signal<RegenerationPreview | null>(null);
  readonly regenerationLabels = {
    add: 'Hinzufügen',
    update: 'Aktualisieren',
    remove: 'Entfernen',
    unchanged: 'Unverändert',
    excluded: 'Ausgeschlossen',
    conflict: 'Konflikt',
  };
  showRegeneration(): void {
    const cycle = this.cycle();
    if (!cycle) return;
    try {
      this.regeneration.set(this.planner.regenerationPreview(cycle));
      this.preview.set(null);
      this.message.set('');
    } catch (error) {
      this.message.set((error as Error).message);
    }
  }
  regenerate(): void {
    const cycle = this.cycle();
    const preview = this.regeneration();
    if (!cycle || !preview) return;
    if (preview.rows.some((row) => row.choice === 'unresolved')) {
      this.message.set('Alle Konflikte zuerst ausdrücklich entscheiden.');
      return;
    }
    if (
      preview.rows.some((row) => row.choice === 'remove') &&
      !confirm('Die in der Vorschau ausgewählten unveränderten Einheiten entfernen?')
    )
      return;
    try {
      this.planner.regenerate(cycle, preview);
      this.selectedSession.set(null);
      this.selectedSessions.clear();
      this.regeneration.set(null);
      this.message.set('Regenerierung übernommen. Speicherstatus beachten.');
      this.tab.set('sessions');
    } catch (error) {
      this.message.set((error as Error).message);
    }
  }
  selectedSession = signal<Session | null>(null);
  selectedTemplate = signal<Template | null>(null);
  selectedSessions = new Set<string>();
  templatePreview = signal<{
    template: Template;
    targets: Session[];
    projected: Session[];
    mode: 'replace' | 'empty' | 'append';
  } | null>(null);
  templateId = '';
  applyMode: 'replace' | 'empty' | 'append' = 'replace';
  applyScope: 'selected' | 'slot' | 'mesocycle' | 'unplanned' = 'selected';
  targetId = '';
  templateName = '';
  message = signal('');
  readonly nav = [
    ['overview', 'Übersicht'],
    ['calendar', 'Kalender'],
    ['competitions', 'Wettkämpfe'],
    ['phases', 'Mesozyklen'],
    ['periods', 'Ferien & Sonderzeiträume'],
    ['slots', 'Trainingsslots'],
    ['sessions', 'Trainingseinheiten'],
  ];
  ngOnInit(): void {
    void this.planner.load();
    void this.protectNativeClose();
    void this.loadNativeVersion();
  }
  private async loadNativeVersion(): Promise<void> {
    if (!('__TAURI_INTERNALS__' in window)) return;
    try {
      const { isTauri } = await import('@tauri-apps/api/core');
      if (!isTauri()) return;
      const { getVersion } = await import('@tauri-apps/api/app');
      this.appVersion.set(await getVersion());
    } catch {
      this.appVersion.set('In dieser Anwendung nicht verfügbar');
    }
  }
  private async protectNativeClose(): Promise<void> {
    const { isTauri } = await import('@tauri-apps/api/core');
    if (!isTauri()) return;
    const { getCurrentWindow } = await import('@tauri-apps/api/window');
    const appWindow = getCurrentWindow();
    await appWindow.onCloseRequested(async (event) => {
      event.preventDefault();
      try {
        await this.planner.settled();
        await appWindow.destroy();
      } catch {
        if (
          confirm(
            'Änderungen konnten nicht gespeichert werden. Anwendung schließen und ungespeicherte Änderungen verwerfen?',
          )
        )
          await appWindow.destroy();
      }
    });
  }
  @HostListener('window:beforeunload', ['$event']) beforeUnload(event: BeforeUnloadEvent): void {
    if (this.planner.ready() && this.planner.status() !== 'saved') {
      event.preventDefault();
      event.returnValue = '';
    }
  }
  cycle(): MacroCycle | undefined {
    return this.planner.workspace().cycles.find((c) => c.id === this.selectedId());
  }
  edit(): MacroCycle | undefined {
    return this.draft() ?? this.cycle();
  }
  changed(): void {
    if (!this.draft()) this.planner.changed();
    this.preview.set(null);
    this.templatePreview.set(null);
  }
  open(c: MacroCycle): void {
    this.contentPreview.set(null);
    this.regeneration.set(null);
    this.timeline.set(null);
    this.timelinePhaseId = '';
    this.selectedId.set(c.id);
    this.resetFilters();
    this.selectedPhaseId.set('');
    this.draft.set(null);
    this.proposal.set(null);
    this.preview.set(null);
    this.selectedSession.set(null);
    this.tab.set('overview');
    this.selectedSessions.clear();
    this.templatePreview.set(null);
  }
  create(): void {
    this.timeline.set(null);
    this.timelinePhaseId = '';
    this.regeneration.set(null);
    this.draft.set(newCycle(this.planner.workspace().planningTemplate));
    this.selectedId.set(null);
    this.tab.set('overview');
    this.message.set('');
  }
  commitDraft(): void {
    const c = this.draft();
    if (!c) return;
    try {
      this.planner.createCycle(c);
      this.draft.set(null);
      this.selectedId.set(c.id);
      this.message.set('');
    } catch (e) {
      this.message.set((e as Error).message);
    }
  }
  deleteCycle(): void {
    const c = this.cycle();
    if (!c || !confirm(`„${c.name}“ mit allen zugehörigen Phasen, Slots und Einheiten löschen?`))
      return;
    this.planner.deleteCycle(c);
    this.selectedId.set(null);
    this.planner.changed();
  }
  suggest(): void {
    const c = this.cycle();
    if (!c) return;
    try {
      this.proposal.set(this.planner.proposal(c));
      this.timeline.set(null);
      this.timelinePhaseId = '';
    } catch (e) {
      this.message.set((e as Error).message);
    }
  }
  acceptPhases(): void {
    const c = this.cycle();
    const proposal = this.proposal();
    if (!c || !proposal) return;
    if (
      c.mesocycles.length &&
      !confirm(
        'Vorhandene Mesozyklen durch diesen Vorschlag ersetzen? Einheiten bleiben erhalten und werden neu zugeordnet; bei Überlappung bleibt die Zuordnung offen.',
      )
    )
      return;
    try {
      this.planner.acceptPhases(c, proposal, true);
    } catch (e) {
      this.message.set((e as Error).message);
      return;
    }
    this.proposal.set(null);
    this.changed();
  }
  timeline = signal<TimelinePreview | null>(null);
  readonly timelineError = signal('');
  cancelTimeline(): void {
    this.timeline.set(null);
    this.timelinePhaseId = '';
    this.timelineError.set('');
  }
  timelineDate = '';
  timelineEnd = '';
  timelinePhaseId = '';
  timelineKind: TimelineOperation['kind'] = 'split';
  readonly orderedPhases = orderedPhases;
  timelinePhaseDate(phase: MesoCycle, field: 'startDate' | 'endDate'): string {
    return this.timeline()?.phases.find((p) => p.id === phase.id)?.[field] ?? phase[field];
  }
  startTimeline(m: MesoCycle, kind: 'split' | 'insert' | 'merge'): void {
    this.timelineError.set('');
    this.timeline.set(null);
    this.timelinePhaseId = m.id;
    this.timelineKind = kind;
    const defaults = timelineDefaults(this.cycle()!, m, kind);
    this.timelineDate = defaults.date;
    this.timelineEnd = defaults.end;
    if (kind === 'merge') this.prepareTimeline();
  }
  prepareTimeline(): void {
    const c = this.cycle();
    if (!c) return;
    const phases = this.orderedPhases(c);
    const other = phases[phases.findIndex((p) => p.id === this.timelinePhaseId) + 1];
    const operation: TimelineOperation =
      this.timelineKind === 'merge'
        ? { kind: 'merge', phaseId: this.timelinePhaseId, otherId: other?.id ?? '' }
        : this.timelineKind === 'split'
          ? { kind: 'split', phaseId: this.timelinePhaseId, date: this.timelineDate }
          : {
              kind: 'insert',
              phaseId: this.timelinePhaseId,
              startDate: this.timelineDate,
              endDate: this.timelineEnd,
            };
    this.showTimeline(operation);
  }
  showTimeline(operation: TimelineOperation): void {
    this.timeline.set(null);
    this.timelinePhaseId = operation.phaseId;
    this.timelineKind = operation.kind;
    this.timelineError.set('');
    try {
      this.timeline.set(timelinePreview(this.cycle()!, operation));
      this.message.set('');
    } catch (error) {
      this.timelineError.set((error as Error).message);
    }
  }
  phaseBoundary(m: MesoCycle, field: 'startDate' | 'endDate', date: string): void {
    if (this.proposal()) m[field] = date;
    else this.showTimeline({ kind: 'boundary', phaseId: m.id, field, date });
  }
  timelineSession(sessionId: string): string {
    const session = this.cycle()?.sessions.find((s) => s.id === sessionId);
    return session ? session.date + ' ' + session.name : sessionId;
  }
  timelineWarnings(): string[] {
    try {
      const projected = projectedTimeline(this.cycle()!, this.timeline()!);
      return [
        ...cycleWarnings(projected),
        ...projected.sessions.flatMap((s) => {
          const phase = projected.mesocycles.find((p) => p.id === s.mesoCycleId);
          return phase && (s.date < phase.startDate || s.date > phase.endDate)
            ? [`${s.date} ${s.name}: Zuordnung liegt außerhalb von ${phase.name}.`]
            : [];
        }),
      ];
    } catch (error) {
      return [(error as Error).message];
    }
  }
  applyTimeline(): void {
    this.tryAction(() => {
      this.planner.applyTimeline(this.cycle()!, this.timeline()!);
      this.timeline.set(null);
      this.timelinePhaseId = '';
      this.preview.set(null);
      this.regeneration.set(null);
    });
  }
  addPhase(): void {
    const c = this.cycle();
    if (c) this.planner.addPhase(c);
    this.preview.set(null);
  }
  removePhase(m: MesoCycle): void {
    const c = this.cycle();
    if (c) this.showTimeline({ kind: 'delete', phaseId: m.id });
  }
  addPeriod(): void {
    const c = this.cycle();
    if (c) this.planner.addPeriod(c);
    this.preview.set(null);
  }
  removePeriod(index: number): void {
    const c = this.cycle();
    if (c) this.planner.removePeriod(c, index);
    this.preview.set(null);
  }
  addSlot(): void {
    const c = this.cycle();
    if (c) this.planner.addSlot(c);
    this.preview.set(null);
  }
  removeSlot(slotId: string, removeUntouched: boolean): void {
    const c = this.cycle();
    if (
      !c ||
      !confirm(
        removeUntouched
          ? 'Slot und unveränderte generierte Einheiten löschen? Bearbeitete Einheiten bleiben erhalten.'
          : 'Nur den Slot löschen? Alle Einheiten bleiben erhalten.',
      )
    )
      return;
    this.planner.removeSlot(c, slotId, removeUntouched);
    this.changed();
  }
  showPreview(): void {
    const c = this.cycle();
    if (!c) return;
    try {
      this.regeneration.set(null);
      this.preview.set(this.planner.preview(c));
      this.message.set('');
    } catch (e) {
      this.message.set((e as Error).message);
    }
  }
  generate(): void {
    const c = this.cycle();
    const preview = this.preview();
    if (!c || !preview) return;
    this.planner.generate(c, preview);
    this.preview.set(null);
    this.planner.changed();
    this.tab.set('sessions');
  }
  removeSession(s: Session): void {
    const c = this.cycle();
    if (!c || !confirm('Nur diese Trainingseinheit löschen? Ihr Slot bleibt erhalten.')) return;
    this.planner.removeSession(c, s);
    this.selectedSession.set(null);
    this.selectedSessions.delete(s.id);
    this.changed();
  }
  removeSelectedSessions(): void {
    const c = this.cycle();
    if (!c) return;
    const sessions = c.sessions.filter((s) => this.selectedSessions.has(s.id));
    if (
      !sessions.length ||
      !confirm(
        `${sessions.length} ausgewählte Trainingseinheiten löschen? Die Trainingsslots bleiben erhalten.`,
      )
    )
      return;
    for (const session of sessions) this.planner.removeSession(c, session);
    this.selectedSessions.clear();
    this.selectedSession.set(null);
    this.changed();
  }
  sessionChanged(s: Session): void {
    this.planner.sessionChanged(s);
    this.preview.set(null);
  }
  contentChanged(s: Session): void {
    this.planner.sessionChanged(s, true);
    this.preview.set(null);
  }
  addContent(s: Session): void {
    this.planner.addContent(s);
  }
  removeContent(s: Session, index: number): void {
    this.tryAction(() => this.planner.removeContent(s, index));
  }
  move(contents: Content[], index: number, direction: number): void {
    this.planner.moveContents(contents, index, direction, this.selectedSession());
  }
  saveTemplate(s: Session): void {
    try {
      this.planner.saveTemplate(s, this.templateName);
      this.templateName = '';
      this.message.set('Vorlage erstellt.');
    } catch (e) {
      this.message.set((e as Error).message);
    }
  }
  templateTargets(): Session[] {
    const c = this.cycle();
    return c
      ? this.planner.templateTargets(c, this.applyScope, this.targetId, this.selectedSessions)
      : [];
  }
  apply(): void {
    const template = this.planner.workspace().templates.find((t) => t.id === this.templateId);
    const targets = this.templateTargets();
    if (!template || !targets.length) {
      this.message.set('Bitte eine Vorlage und mindestens eine Zieleinheit auswählen.');
      return;
    }
    const projected = this.planner.templateProjection(targets, template, this.applyMode);
    this.templatePreview.set({
      template: structuredClone(template),
      targets: structuredClone(targets),
      projected,
      mode: this.applyMode,
    });
  }
  acceptTemplate(): void {
    const preview = this.templatePreview();
    const c = this.cycle();
    if (!preview || !c) return;
    const targets = preview.targets.map((before) => c.sessions.find((s) => s.id === before.id));
    if (
      targets.some(
        (target, i) => !target || JSON.stringify(target) !== JSON.stringify(preview.targets[i]),
      )
    ) {
      this.message.set('Die Zieleinheiten wurden geändert. Bitte eine neue Vorschau erstellen.');
      this.templatePreview.set(null);
      return;
    }
    if (
      preview.mode === 'replace' &&
      !confirm(`Inhalte von ${targets.length} Einheiten durch „${preview.template.name}“ ersetzen?`)
    )
      return;
    try {
      this.planner.applyTemplate(targets as Session[], preview.template, preview.mode);
    } catch (e) {
      this.message.set((e as Error).message);
      return;
    }
    this.templatePreview.set(null);
    this.message.set('Vorlage angewendet.');
  }
  toggleSession(s: Session, checked: boolean): void {
    if (checked) this.selectedSessions.add(s.id);
    else this.selectedSessions.delete(s.id);
  }
  duplicateTemplate(t: Template): void {
    this.planner.duplicateTemplate(t);
  }
  deleteTemplate(t: Template): void {
    if (!confirm('Vorlage löschen? Geplante Einheiten bleiben erhalten.')) return;
    this.planner.deleteTemplate(t);
    this.selectedTemplate.set(null);
    this.planner.changed();
  }
  addTemplateContent(t: Template): void {
    this.planner.addTemplateContent(t);
  }
  removeTemplateContent(t: Template, index: number): void {
    this.planner.removeTemplateContent(t, index);
  }
  async backup(): Promise<void> {
    if (this.creatingBackup()) return;
    this.creatingBackup.set(true);
    try {
      const path = await this.planner.backup();
      this.message.set(path ? 'Backup gespeichert: ' + path : 'Backup-Erstellung abgebrochen.');
    } catch (e) {
      this.message.set((e as Error).message);
    } finally {
      this.creatingBackup.set(false);
    }
  }
  async restore(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    try {
      if (file.size > 200 * 1024 * 1024) throw new Error('Backup ist größer als 200 MiB.');
      const text = await file.text();
      const parsed = JSON.parse(text);
      if (
        ![1, 2].includes(parsed.formatVersion) ||
        !Array.isArray(parsed.workspace?.cycles) ||
        !Array.isArray(parsed.workspace?.templates)
      )
        throw new Error('Ungültiges oder inkompatibles Backup.');
      if (
        !confirm(
          `Alle aktuellen Pläne, Vorlagen und Spiele durch ${parsed.workspace.cycles.length} Makrozyklen und ${parsed.workspace.templates.length} Vorlagen sowie ${parsed.workspace.games?.length ?? 0} Spiele aus dem Backup ersetzen? Der bisherige Stand wird als Wiederherstellungskopie gesichert.`,
        )
      )
        return;
      await this.planner.restore(text);
      this.selectedId.set(null);
      this.selectedSession.set(null);
      this.selectedTemplate.set(null);
      this.proposal.set(null);
      this.preview.set(null);
      this.message.set('Backup wiederhergestellt.');
    } catch (e) {
      this.message.set((e as Error).message);
    } finally {
      input.value = '';
    }
  }
  async recover(): Promise<void> {
    if (
      !confirm(
        'Den Stand vor der letzten Backup-Wiederherstellung wiederherstellen? Der aktuelle Stand wird als Wiederherstellungskopie gesichert.',
      )
    )
      return;
    try {
      await this.planner.recover();
      this.selectedId.set(null);
      this.selectedSession.set(null);
      this.selectedTemplate.set(null);
      this.proposal.set(null);
      this.preview.set(null);
      this.message.set('Vorheriger Stand wiederhergestellt.');
    } catch (e) {
      this.message.set((e as Error).message);
    }
  }
  async reload(): Promise<void> {
    if (
      this.planner.ready() &&
      !confirm('Ungespeicherte Eingaben verwerfen und den gespeicherten Stand neu laden?')
    )
      return;
    location.reload();
  }
  warnings = cycleWarnings;
  contentWarnings = contentWarnings;
  phaseName(value: string | null): string {
    return this.cycle()?.mesocycles.find((m) => m.id === value)?.name ?? 'Ohne Mesozyklus';
  }
  days(c: MacroCycle): number {
    return dayCount(c.startDate, c.endDate);
  }
  date(value: string): string {
    if (!value) return '—';
    return new Date(value + 'T12:00:00Z').toLocaleDateString('de-DE', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      timeZone: 'UTC',
    });
  }
  weekday(value: string): string {
    return WEEKDAYS[new Date(value + 'T12:00:00Z').getUTCDay()];
  }
  offset(value: number): string {
    return (
      Math.floor(value / 60)
        .toString()
        .padStart(2, '0') +
      ':' +
      (value % 60).toString().padStart(2, '0')
    );
  }
  timeAt(startTime: string, offsetMinutes: number): string {
    const [hours, minutes] = startTime.split(':').map(Number);
    const total = hours * 60 + minutes + offsetMinutes;
    const days = Math.floor(total / (24 * 60));
    return this.offset(total % (24 * 60)) + (days ? ` (+${days} Tag${days === 1 ? '' : 'e'})` : '');
  }
}
