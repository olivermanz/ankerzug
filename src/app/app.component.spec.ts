import { ComponentFixture, TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AppComponent } from './app.component';
import { DataAccessService } from './data-access.service';
import { Backup, SaveInput, Snapshot, Template } from './models';
import compatibilityBackup from '../../fixtures/workspace-v2.json';
import { PlannerService } from './planner.service';

describe('MVP UI acceptance', () => {
  let fixture: ComponentFixture<AppComponent>;
  let stored: Snapshot;
  let access: {
    load: ReturnType<typeof vi.fn>;
    save: ReturnType<typeof vi.fn>;
    backup: ReturnType<typeof vi.fn>;
  };
  async function render(): Promise<void> {
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
  }
  async function click(text: string): Promise<void> {
    await render();
    const button = [
      ...(fixture.nativeElement.querySelectorAll('button') as NodeListOf<HTMLButtonElement>),
    ].find((b) => b.textContent?.trim() === text);
    expect(button, `Button ${text}`).toBeDefined();
    button!.click();
    await render();
  }
  async function fill(label: string, value: string, index = 0): Promise<void> {
    await render();
    const labels = [
      ...(fixture.nativeElement.querySelectorAll('label') as NodeListOf<HTMLLabelElement>),
    ].filter((l) => l.firstChild?.textContent?.trim() === label);
    const input = labels[index]?.querySelector('input,textarea,select') as HTMLInputElement;
    expect(input, `Input ${label}`).toBeTruthy();
    input.value =
      input.tagName === 'SELECT'
        ? ([...(input as unknown as HTMLSelectElement).options].find(
            (o) => o.text.trim() === value || o.value === value,
          )?.value ?? value)
        : value;
    input.dispatchEvent(
      new Event(input.tagName === 'SELECT' ? 'change' : 'input', { bubbles: true }),
    );
    await render();
  }
  beforeEach(async () => {
    stored = { revision: 0, workspace: { cycles: [], templates: [] } };
    access = {
      load: vi.fn().mockImplementation(async () => structuredClone(stored)),
      save: vi.fn().mockImplementation(async (input: SaveInput) => {
        stored = {
          revision: input.expectedRevision + 1,
          workspace: structuredClone(input.workspace),
        };
        return structuredClone(stored);
      }),
      backup: vi.fn().mockResolvedValue('/chosen/ankerzug.json'),
    };
    TestBed.configureTestingModule({
      imports: [AppComponent],
      providers: [{ provide: DataAccessService, useValue: access }],
    });
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    fixture = TestBed.createComponent(AppComponent);
    await render();
  });
  afterEach(() => {
    fixture.destroy();
    vi.restoreAllMocks();
    TestBed.resetTestingModule();
  });
  it('calculates content block times from the session start time', () => {
    expect(fixture.componentInstance.timeAt('18:00', 45)).toBe('18:45');
    expect(fixture.componentInstance.timeAt('23:30', 45)).toBe('00:15 (+1 Tag)');
  });
  it('offers exactly the canonical session types', () => {
    expect(fixture.componentInstance.sessionTypes).toEqual([
      'BAT',
      'ET',
      'LK',
      'BAT-WE',
      'ZPT',
      'KNT',
      'KT',
      'AT',
      'MT',
      'M-T',
      'GT',
      'KAT',
    ]);
  });
  it('shows the welcome section only on the overview, not below settings', async () => {
    const root = fixture.nativeElement as HTMLElement;
    expect(root.textContent).toContain('VOM ERSTEN TRAINING BIS ZUM WETTKAMPF');
    fixture.componentInstance.tab.set('planning-template');
    await render();
    expect(root.textContent).toContain('Einstellungen');
    expect(root.textContent).not.toContain('VOM ERSTEN TRAINING BIS ZUM WETTKAMPF');
  });
  it('opens and edits global templates without a selected or existing macrocycle', async () => {
    const planner = TestBed.inject(PlannerService);
    stored.workspace.templates = structuredClone(
      compatibilityBackup.workspace.templates,
    ) as Template[];
    await planner.load();
    await render();
    expect(fixture.componentInstance.cycle()).toBeUndefined();
    await click('Vorlagen');
    const root = fixture.nativeElement as HTMLElement;
    expect(root.textContent).toContain('Gute Einheiten wiederverwenden');
    expect(root.textContent).not.toContain('VOM ERSTEN TRAINING BIS ZUM WETTKAMPF');
    expect(root.querySelector('[aria-label="Makrozyklus-Navigation"]')).toBeNull();
    await click('Bearbeiten');
    await fill('Name', 'Globale Testvorlage');
    await planner.settled();
    await planner.load();
    fixture.componentInstance.selectedTemplate.set(null);
    await render();
    expect(root.textContent).toContain('Globale Testvorlage');
    expect(stored.workspace.cycles).toHaveLength(0);
    const templateCount = stored.workspace.templates.length;
    await click('Kopieren');
    await planner.settled();
    expect(stored.workspace.templates).toHaveLength(templateCount + 1);
    await click('Löschen');
    await planner.settled();
    expect(stored.workspace.templates).toHaveLength(templateCount);
  });
  it('edits persisted global session-type colors in settings', async () => {
    fixture.componentInstance.tab.set('planning-template');
    await render();
    const colors = fixture.nativeElement.querySelectorAll(
      'input[type="color"]',
    ) as NodeListOf<HTMLInputElement>;
    expect(colors).toHaveLength(12);
    colors[0].value = '#123456';
    colors[0].dispatchEvent(new Event('input', { bubbles: true }));
    await render();
    expect(fixture.componentInstance.planner.workspace().sessionTypeColors?.BAT).toBe('#123456');
    await fixture.componentInstance.planner.flush();
    await fixture.componentInstance.planner.load();
    expect(fixture.componentInstance.planner.workspace().sessionTypeColors?.BAT).toBe('#123456');
  });
  it('keeps planning settings editable and exposes read-only legal information on the main Info page', async () => {
    fixture.componentInstance.tab.set('planning-template');
    await render();
    expect(fixture.nativeElement.querySelectorAll('input[type="color"]')).toHaveLength(12);

    fixture.componentInstance.tab.set('info');
    await render();
    const root = fixture.nativeElement as HTMLElement;
    expect(root.textContent).toContain('Ankerzug');
    expect(root.textContent).toContain('Version');
    expect(root.textContent).toContain('Copyright Oliver Manz');
    expect(root.textContent).toContain('Apache License 2.0');
    expect(root.textContent).toContain('fachliche, medizinische oder sicherheitsbezogene');
    expect(root.textContent).toContain('Drittanbieter-Lizenzen');
    expect(
      root.querySelector('.settings-info')?.querySelectorAll('input, select, textarea'),
    ).toHaveLength(0);
    const links = [...root.querySelectorAll('a')].map((link) => link.getAttribute('href'));
    expect(links).toContain('/licenses/ankerzug/LICENSE');
    expect(links).toContain('/licenses/THIRD_PARTY_NOTICES.md');
    expect(root.textContent).toContain('Browser-Vorschau nicht verfügbar');

    fixture.componentInstance.tab.set('planning-template');
    await render();
    expect(fixture.nativeElement.querySelectorAll('input[type="color"]')).toHaveLength(12);
  });
  it('renders distinct backup feedback for saved, cancelled and failed native saves', async () => {
    fixture.componentInstance.planner.ready.set(true);
    await click('Backup erstellen');
    await Promise.resolve();
    await render();
    expect(fixture.componentInstance.message()).toBe('Backup gespeichert: /chosen/ankerzug.json');
    access.backup.mockResolvedValueOnce(null);
    await click('Backup erstellen');
    await Promise.resolve();
    await render();
    expect(fixture.componentInstance.message()).toBe('Backup-Erstellung abgebrochen.');
    access.backup.mockRejectedValueOnce(new Error('Kein Schreibzugriff'));
    await click('Backup erstellen');
    await Promise.resolve();
    await render();
    expect(fixture.componentInstance.message()).toBe('Kein Schreibzugriff');
  });
  it('shows a spinner and prevents duplicate backup requests while the native dialog is open', async () => {
    let finish!: (value: string | null) => void;
    access.backup.mockImplementationOnce(
      () => new Promise<string | null>((resolve) => (finish = resolve)),
    );
    fixture.componentInstance.planner.ready.set(true);
    const button = [...fixture.nativeElement.querySelectorAll('button')].find(
      (element: HTMLButtonElement) => element.textContent?.trim() === 'Backup erstellen',
    ) as HTMLButtonElement;
    button.click();
    await Promise.resolve();
    await render();
    expect(fixture.componentInstance.creatingBackup()).toBe(true);
    expect(button.disabled).toBe(true);
    expect(button.querySelector('.spinner')).toBeTruthy();
    expect(access.backup).toHaveBeenCalledTimes(1);
    finish(null);
    await Promise.resolve();
    await render();
    expect(fixture.componentInstance.creatingBackup()).toBe(false);
  });
  it('retires weekly comparisons and structured goals while preserving existing records through save and reload', async () => {
    stored.workspace = structuredClone(compatibilityBackup as Backup).workspace;
    const planner = fixture.componentInstance.planner;
    await planner.load();
    const cycle = planner.workspace().cycles[0];
    fixture.componentInstance.selectedId.set(cycle.id);
    const weeks = structuredClone(cycle.weeks);
    const goals = structuredClone(cycle.goals);
    expect(weeks.length).toBeGreaterThan(0);
    expect(goals.length).toBeGreaterThan(0);
    await render();
    const root = fixture.nativeElement as HTMLElement;
    expect(root.textContent).not.toContain('Wochen & Soll/Ist');
    expect(root.textContent).not.toContain('Trainingsziele');
    // Obsolete tab values cannot render the retired editors either.
    for (const tab of ['weeks', 'goals']) {
      fixture.componentInstance.tab.set(tab);
      await render();
      expect(root.textContent).not.toContain('Wochenprofil');
      expect(root.textContent).not.toContain('Zielstatus');
      expect(root.textContent).not.toContain('Soll/Ist');
    }
    await click('Mesozyklen');
    await click('Mesozyklus-Ansicht öffnen');
    expect(root.textContent).toContain('geplante Minuten');
    expect(root.textContent).not.toContain('Trainingsziele');
    for (const goal of goals) expect(root.textContent).not.toContain(goal.description);
    cycle.name = 'Updated plan';
    planner.changed();
    await planner.flush();
    await planner.load();
    expect(planner.workspace().cycles[0].name).toBe('Updated plan');
    expect(planner.workspace().cycles[0].weeks).toEqual(weeks);
    expect(planner.workspace().cycles[0].goals).toEqual(goals);
  });
  it('preserves edited plans and offers previous contents through rendered controls', async () => {
    const planner = TestBed.inject(PlannerService);
    await click('Ersten Makrozyklus erstellen →');
    await fill('Name des Makrozyklus *', 'Inhaltshilfen');
    await fill('Name des Wettkampfs *', 'Meisterschaft');
    await click('Makrozyklus anlegen →');
    const c = planner.workspace().cycles[0];
    planner.addPhase(c);
    planner.addSlot(c);
    planner.generate(c, planner.preview(c));
    const edited = c.sessions[0];
    planner.addContent(edited);
    const before = structuredClone(edited);
    fixture.componentInstance.tab.set('phases');
    expect(fixture.nativeElement.textContent).not.toContain('Standardvorlage');
    fixture.componentInstance.openSessionEditor(c.sessions[1]);
    await render();
    await click('Vorherige Inhalte vorschauen');
    await click('Inhalte übernehmen');
    expect(c.sessions[1].individuallyPlanned).toBe(true);
    expect(c.sessions[1].contents.map((b) => b.content)).toEqual(
      edited.contents.map((b) => b.content),
    );
    expect(c.sessions[1].contents[0].id).not.toBe(edited.contents[0].id);
    expect(edited).toEqual(before);
    fixture.componentInstance.selectedSession.set(null);
    expect(c.sessions[1].individuallyPlanned).toBe(true);
    expect(edited).toEqual(before);
    await planner.flush();
    const saved = structuredClone(stored.workspace);
    fixture.destroy();
    fixture = TestBed.createComponent(AppComponent);
    await render();
    expect(planner.workspace()).toEqual(saved);
  });
  it('keeps the overview free of the timeline and uses the same sessions in calendar, table and phase detail', async () => {
    const planner = TestBed.inject(PlannerService);
    await click('Ersten Makrozyklus erstellen →');
    await fill('Name des Makrozyklus *', 'Ansichten');
    await fill('Name des Wettkampfs *', 'Meisterschaft');
    await click('Makrozyklus anlegen →');
    const c = planner.workspace().cycles[0];
    c.endDate = '2026-10-04';
    c.competitions[0].date = c.endDate;
    planner.addPhase(c);
    const p = c.mesocycles[0];
    p.color = 'blue';
    planner.addSlot(c);
    planner.addSlot(c);
    c.slots[0].name = 'Dienstaggruppe';
    c.slots[1].name = 'Donnerstaggruppe';
    c.slots[1].weekday = 4;
    c.periods = [
      {
        id: 'ferien',
        name: 'Herbstferien',
        startDate: '2026-10-01',
        endDate: '2026-10-04',
        type: 'school',
        trainingPolicy: 'normal',
        retainedSlotIds: null,
        durationPercent: null,
      },
    ];
    planner.generate(c, planner.preview(c));
    expect(c.sessions).toHaveLength(2);
    const first = c.sessions[0],
      second = c.sessions[1];
    first.sessionType = 'BAT';
    second.sessionType = 'BAT';
    first.plannedArrowCount = 80;
    second.plannedArrowCount = null;
    c.goals.push({
      id: 'legacy-goal',
      scope: 'macrocycle',
      reference: c.id,
      description: 'Stored training goal',
      category: 'SCHIESSTECHNIK',
      targetValue: null,
      unit: '',
      status: 'open',
    });
    c.goals[0].scope = 'mesocycle';
    c.goals[0].reference = p.id;
    c.goals[0].description = 'Gemeinsame Schussroutine';
    planner.changed();
    fixture.changeDetectorRef.markForCheck();
    await click('Übersicht');
    const root = fixture.nativeElement as HTMLElement;
    expect(root.textContent).not.toContain('Makrozyklus-Timeline');
    expect(root.querySelector('app-planning-views')).toBeNull();
    expect(root.querySelector('.stats-grid')?.textContent).toContain('2 geplant');
    const legend = root.querySelector('.session-type-legend')!;
    expect(legend.textContent).toContain('Legende');
    expect(legend.querySelectorAll('li')).toHaveLength(12);
    expect(legend.textContent).toContain('BAT · Bewegungsablauftraining');
    expect(
      (legend.querySelector('.session-type-legend-swatch') as HTMLElement).style.backgroundColor,
    ).toBe('rgb(21, 95, 160)');
    const batLegend = legend.querySelector('li') as HTMLElement;
    const batSegment = root.querySelector('.mesocycle-composition-segment') as HTMLElement;
    batLegend.dispatchEvent(new MouseEvent('mouseenter'));
    await render();
    expect(batLegend.classList).toContain('is-session-type-highlighted');
    expect(batSegment.classList).toContain('is-session-type-highlighted');
    batLegend.dispatchEvent(new MouseEvent('mouseleave'));
    batSegment.dispatchEvent(new MouseEvent('mouseenter'));
    await render();
    expect(batLegend.classList).toContain('is-session-type-highlighted');
    expect(batSegment.classList).toContain('is-session-type-highlighted');
    batSegment.dispatchEvent(new MouseEvent('mouseleave'));
    await render();
    expect(root.querySelector('.is-session-type-highlighted')).toBeNull();
    await click('Kalender');
    await click('Woche');
    await click('→');
    expect(root.textContent).toContain('05.10.2026 – 11.10.2026');
    await click('←');
    expect(root.querySelectorAll('.calendar-session')).toHaveLength(2);
    expect(root.querySelector('.calendar-session')?.getAttribute('data-color')).toBe('blue');
    const ribbon = root.querySelector('.calendar-phase-ribbon') as HTMLButtonElement;
    expect(root.querySelectorAll('.calendar-phase-ribbon')).toHaveLength(1);
    expect(ribbon.getAttribute('data-color')).toBe('blue');
    expect(ribbon.style.gridColumn).toBe('1 / span 7');
    expect(root.querySelectorAll('.calendar-day button:not(.calendar-session)')).toHaveLength(0);
    expect(root.querySelector('.calendar')?.textContent).toContain('Herbstferien');
    expect(root.querySelector('.calendar')?.textContent).toContain('Hauptwettkampf');
    (root.querySelector('.calendar-session') as HTMLButtonElement).click();
    await render();
    expect(fixture.componentInstance.selectedSession()).toBe(first);
    expect(root.querySelector('app-planning-views')?.hasAttribute('hidden')).toBe(true);
    await fill('Dauer (Minuten)', '75');
    await fill('Inhalte', 'Schussroutine gemeinsam üben');
    await click('← Zur Ansicht');
    expect(root.textContent).toContain('28.09.2026 – 04.10.2026');
    expect(root.querySelector('.calendar-session')?.textContent).toContain('75 min');
    await click('Trainingseinheiten');
    for (const column of [
      'Datum / Tag',
      'Beginn',
      'Dauer',
      'Mesozyklus',
      'Name der Einheit',
      'Einheitentyp',
      'Status',
      'Inhalt geplant',
    ]) {
      expect([...root.querySelectorAll('th')].map((e) => e.textContent?.trim())).toContain(column);
    }
    const filterPanel = root.querySelector<HTMLDivElement>('#training-session-filters')!;
    expect(filterPanel.hidden).toBe(true);
    expect(
      root
        .querySelector('[aria-controls="training-session-filters"]')
        ?.getAttribute('aria-expanded'),
    ).toBe('false');
    await click('Filter ausklappen');
    expect(filterPanel.hidden).toBe(false);
    await fill('Mesozyklusfilter', p.name);
    await fill('Trainingsslotfilter', 'Dienstaggruppe · Dienstag 18:00');
    await fill('Filter von', '2026-09-29');
    await fill('Filter bis', '2026-09-29');
    await fill('Statusfilter', 'Geplant');
    await fill('Inhaltsplanung', 'Geplant');
    expect(root.querySelectorAll('tbody tr')).toHaveLength(1);
    expect(root.querySelector('tbody')?.textContent).toContain('Bewegungsablauftraining');
    await fill('Inhaltsplanung', 'Ungeplant');
    expect(root.textContent).toContain('0 von 2 Einheiten sichtbar');
    await click('Filter einklappen');
    expect(filterPanel.hidden).toBe(true);
    expect(root.textContent).toContain('0 von 2 Einheiten sichtbar');
    await click('Filter ausklappen');
    expect(fixture.componentInstance.filters.content).toBe('unplanned');
    await click('Filter zurücksetzen');
    await fill('Inhaltsplanung', 'Ungeplant');
    expect(root.querySelector('tbody')?.textContent).toContain('Donnerstaggruppe');
    expect(root.querySelector('tbody')?.textContent).not.toContain('Dienstaggruppe');
    await click('Öffnen →');
    expect(fixture.componentInstance.selectedSession()).toBe(second);
    await click('← Zur Tabelle');
    expect(root.textContent).toContain('1 von 2 Einheiten sichtbar');
    await click('Mesozyklen');
    await click('Mesozyklus-Ansicht öffnen');
    expect(root.textContent).not.toContain('Gemeinsame Schussroutine');
    expect(root.textContent).not.toContain('Trainingsziele');
    expect(root.textContent).toContain('2 geplante Einheiten · 195 geplante Minuten');
    expect(root.textContent).toContain('80 Pfeile erfasst · unvollständig (1/2');
    expect(root.querySelectorAll('.detail-session')).toHaveLength(2);
    (root.querySelector('.detail-session') as HTMLButtonElement).click();
    await render();
    await click('Trainingseinheit löschen');
    expect(root.textContent).toContain('1 geplante Einheiten · 120 geplante Minuten');
    await click('Übersicht');
    const competitionSummary = root.querySelector('.competition-summary-list')!;
    expect(competitionSummary.querySelectorAll('.competition-summary-row')).toHaveLength(1);
    expect(competitionSummary.textContent).toContain('Meisterschaft');
    expect(competitionSummary.textContent).toContain('Priorität A');
    expect(competitionSummary.textContent).toContain('04.10.2026');
    expect(competitionSummary.querySelector('input, select, button')).toBeNull();
    await click('Wettkämpfe');
    expect(root.textContent).toContain('Hauptwettkampf');
    await planner.settled();
    const expected = structuredClone(c);
    fixture.destroy();
    fixture = TestBed.createComponent(AppComponent);
    await render();
    expect(planner.workspace().cycles[0]).toEqual(expected);
    fixture.componentInstance.open(planner.workspace().cycles[0]);
    await click('Kalender');
    expect(fixture.nativeElement.querySelectorAll('.calendar-session')).toHaveLength(1);
    expect(fixture.nativeElement.textContent).toContain('Donnerstaggruppe');
    (fixture.nativeElement.querySelector('.calendar-phase-ribbon') as HTMLButtonElement).click();
    await render();
    expect(fixture.componentInstance.tab()).toBe('phase-detail');
    expect(fixture.nativeElement.textContent).not.toContain('Gemeinsame Schussroutine');
  });
  it('previews, cancels and applies split, merge, boundary, insertion and deletion through rendered controls', async () => {
    const planner = TestBed.inject(PlannerService);
    await click('Ersten Makrozyklus erstellen →');
    await fill('Name des Makrozyklus *', 'Timeline');
    await fill('Name des Wettkampfs *', 'Hauptwettkampf');
    await click('Makrozyklus anlegen →');
    const c = planner.workspace().cycles[0];
    planner.addPhase(c);
    planner.addSlot(c);
    planner.generate(c, planner.preview(c));
    c.goals.push({
      id: 'legacy-goal',
      scope: 'macrocycle',
      reference: c.id,
      description: 'Stored training goal',
      category: 'SCHIESSTECHNIK',
      targetValue: null,
      unit: '',
      status: 'open',
    });
    c.goals[0].scope = 'mesocycle';
    c.goals[0].reference = c.mesocycles[0].id;
    const before = structuredClone(c);
    fixture.changeDetectorRef.markForCheck();
    await click('Mesozyklen');
    await click('Teilen');
    await fill('Beginn des zweiten Teils', '2026-10-05');
    await click('Timeline-Vorschau erstellen');
    expect(fixture.nativeElement.textContent).toContain('Timeline-Vorschau');
    expect(c).toEqual(before);
    await click('Vorschau verwerfen');
    expect(c).toEqual(before);
    await click('Teilen');
    await fill('Beginn des zweiten Teils', '2026-10-05');
    await click('Timeline-Vorschau erstellen');
    await click('Timeline übernehmen');
    expect(c.mesocycles).toHaveLength(2);
    expect(c.mesocycles[0].endDate).toBe('2026-10-04');
    expect(c.sessions).toHaveLength(before.sessions.length);
    await click('Mit nächster Phase zusammenführen');
    expect(fixture.nativeElement.textContent).toContain('Einstellungen des zweiten entfallen');
    await click('Timeline übernehmen');
    expect(c.mesocycles).toHaveLength(1);
    await click('Teilen');
    await fill('Beginn des zweiten Teils', '2026-10-12');
    await click('Timeline-Vorschau erstellen');
    await click('Timeline übernehmen');
    await fill('Bis', '2026-10-04');
    expect(c.mesocycles[0].endDate).toBe('2026-10-11');
    expect(fixture.nativeElement.textContent).toContain('Ungeplante Lücke');
    await click('Timeline übernehmen');
    await fill('Bis', '2026-10-03');
    await click('Vorschau verwerfen');
    const endLabel = [
      ...(fixture.nativeElement.querySelectorAll('label') as NodeListOf<HTMLLabelElement>),
    ].find((l) => l.firstChild?.textContent?.trim() === 'Bis');
    expect(endLabel?.querySelector('input')?.value).toBe('04.10.2026');
    await click('Danach einfügen');
    await click('Timeline-Vorschau erstellen');
    await click('Timeline übernehmen');
    expect(c.mesocycles).toHaveLength(3);
    expect(c.mesocycles[1].startDate).toBe('2026-10-05');
    expect(c.mesocycles[1].endDate).toBe('2026-10-11');
    await click('Phase löschen');
    expect(c.mesocycles).toHaveLength(3);
    expect(fixture.nativeElement.textContent).not.toContain('Ziel „');
    await click('Timeline übernehmen');
    expect(c.mesocycles).toHaveLength(2);
    expect(c.goals[0].scope).toBe('macrocycle');
    expect(c.sessions).toHaveLength(before.sessions.length);
    await planner.settled();
    const expected = structuredClone(c);
    fixture.destroy();
    fixture = TestBed.createComponent(AppComponent);
    await render();
    expect(planner.workspace().cycles[0]).toEqual(expected);
    fixture.componentInstance.open(planner.workspace().cycles[0]);
    await click('Mesozyklen');
    expect(fixture.nativeElement.textContent).toContain('2026');
  });
  it('opens split and insertion controls and their previews or errors inside the selected phase card', async () => {
    const planner = TestBed.inject(PlannerService);
    await click('Ersten Makrozyklus erstellen →');
    await fill('Name des Makrozyklus *', 'Mehrere Phasen');
    await fill('Name des Wettkampfs *', 'Hauptwettkampf');
    await click('Makrozyklus anlegen →');
    const cycle = planner.workspace().cycles[0];
    for (let i = 0; i < 3; i++) planner.addPhase(cycle);
    Object.assign(cycle.mesocycles[0], { startDate: '2026-09-28', endDate: '2026-10-11' });
    Object.assign(cycle.mesocycles[1], { startDate: '2026-10-12', endDate: '2026-11-01' });
    Object.assign(cycle.mesocycles[2], { startDate: '2026-11-02', endDate: '2026-12-06' });
    fixture.changeDetectorRef.markForCheck();
    await click('Mesozyklen');
    const card = () => fixture.nativeElement.querySelectorAll('.phase-card')[0] as HTMLElement;
    const before = structuredClone(cycle);
    await click('Teilen');
    expect(card().textContent).toContain('Beginn des zweiten Teils');
    expect(card().textContent).toContain('Timeline-Vorschau erstellen');
    await fill('Beginn des zweiten Teils', '2026-10-05');
    await click('Timeline-Vorschau erstellen');
    expect(card().textContent).toContain('Timeline übernehmen');
    expect(cycle).toEqual(before);
    await click('Vorschau verwerfen');
    expect(card().textContent).not.toContain('Timeline übernehmen');
    await click('Danach einfügen');
    expect(card().textContent).toContain('Beginn der neuen Phase');
    expect(card().textContent).toContain('Ende der neuen Phase');
    await click('Timeline-Vorschau erstellen');
    expect(card().querySelector('[role="alert"]')?.textContent).toContain('Lücke');
    expect(cycle).toEqual(before);
    await click('Abbrechen');
    expect(card().querySelector('[role="alert"]')).toBeNull();
  });
  it('confirms selected session deletion and persists exclusions without deleting slots', async () => {
    const planner = TestBed.inject(PlannerService);
    await click('Ersten Makrozyklus erstellen →');
    await fill('Name des Makrozyklus *', 'Mehrfachlöschung');
    await fill('Name des Wettkampfs *', 'Hauptwettkampf');
    await click('Makrozyklus anlegen →');
    await click('Trainingsslots');
    await click('＋ Trainingsslot');
    expect(fixture.nativeElement.textContent).not.toContain('Nur im Trainingslager');
    expect(fixture.nativeElement.textContent).not.toContain('Einheitentyp');
    await click('Terminvorschau erstellen →');
    expect(fixture.nativeElement.textContent).toContain(
      'Einheitentyp kann später geändert werden.',
    );
    await click('Auswahl erzeugen');
    const c = planner.workspace().cycles[0];
    const before = structuredClone(c);
    const selected = c.sessions.slice(0, 2);
    const checkboxes = fixture.nativeElement.querySelectorAll(
      'tbody input[type="checkbox"]',
    ) as NodeListOf<HTMLInputElement>;
    checkboxes[0].click();
    await render();
    checkboxes[1].click();
    await render();
    vi.mocked(window.confirm).mockReturnValueOnce(false);
    await click('Ausgewählte Einheiten löschen');
    expect(c).toEqual(before);
    expect(fixture.componentInstance.selectedSessions.size).toBe(2);
    await click('Ausgewählte Einheiten löschen');
    expect(window.confirm).toHaveBeenLastCalledWith(
      '2 ausgewählte Trainingseinheiten löschen? Die Trainingsslots bleiben erhalten.',
    );
    expect(c.sessions).toEqual(before.sessions.slice(2));
    expect(c.slots).toEqual(before.slots);
    expect(c.exclusions).toEqual(expect.arrayContaining(selected.map((s) => s.occurrenceKey)));
    expect(planner.preview(c)).toEqual([]);
    expect(fixture.componentInstance.selectedSessions.size).toBe(0);
    await planner.flush();
    expect(stored.workspace.cycles[0]).toEqual(c);
  });
  it('opens the A4 viewer from the session editor and reports errors', async () => {
    const planner = TestBed.inject(PlannerService);
    await click('Ersten Makrozyklus erstellen →');
    await fill('Name des Makrozyklus *', 'PDF-Saison');
    await fill('Name des Wettkampfs *', 'Wettkampf');
    await click('Makrozyklus anlegen →');
    await click('Trainingsslots');
    await click('＋ Trainingsslot');
    await click('Terminvorschau erstellen →');
    await click('Auswahl erzeugen');
    const cycle = planner.workspace().cycles[0];
    const session = cycle.sessions[0];
    await click('Trainingseinheiten');
    await click('Öffnen →');
    const exported = vi.spyOn(planner, 'exportSessionPdf').mockResolvedValue(undefined);
    const landscape = vi.spyOn(planner, 'exportSessionLandscapePdf').mockResolvedValue(undefined);
    await click('PDF A4 Portrait');
    expect(exported).toHaveBeenCalledWith(cycle, session);
    expect(fixture.nativeElement.textContent).toContain('PDF im Viewer geöffnet.');
    await click('PDF A4 Landscape');
    expect(landscape).toHaveBeenCalledWith(cycle, session);
    exported.mockRejectedValueOnce(new Error('Kein Schreibzugriff'));
    await click('PDF A4 Portrait');
    expect(fixture.nativeElement.textContent).toContain('Kein Schreibzugriff');
    expect(fixture.componentInstance.exportingPdf()).toBe(false);
  });
  it('previews regeneration, resolves trainer conflicts, confirms removals, and reloads the saved aggregate', async () => {
    const planner = TestBed.inject(PlannerService);
    await click('Ersten Makrozyklus erstellen →');
    await fill('Name des Makrozyklus *', 'Regenerierung');
    await fill('Name des Wettkampfs *', 'Hauptwettkampf');
    await click('Makrozyklus anlegen →');
    await click('Trainingsslots');
    await click('＋ Trainingsslot');
    await click('Terminvorschau erstellen →');
    await click('Auswahl erzeugen');
    const cycle = planner.workspace().cycles[0];
    const manual = cycle.sessions[0];
    manual.contents[0].content = 'Trainerinhalt';
    planner.sessionChanged(manual, true);
    const removed = cycle.sessions[1];
    planner.removeSession(cycle, removed);
    fixture.componentInstance.open(cycle);
    await fixture.whenStable();
    await click('Trainingsslots');
    await fill('Startzeit', '20:00');
    await click('Regenerierung prüfen');
    expect(fixture.nativeElement.textContent).toContain('Regenerierungsvorschau');
    expect(fixture.nativeElement.textContent).toContain('Konflikt');
    await click('Regenerierung übernehmen');
    expect(fixture.nativeElement.textContent).toContain('Alle Konflikte zuerst');
    await fill(`Entscheidung für ${manual.date}`, 'Bestehende Einheit behalten');
    await click('Regenerierung übernehmen');
    await planner.settled();
    expect(cycle.sessions.find((s) => s.id === manual.id)).toEqual(manual);
    expect(
      cycle.sessions.filter((s) => s.id !== manual.id).every((s) => s.startTime === '20:00'),
    ).toBe(true);
    expect(stored.workspace.cycles[0].exclusions).toContain(removed.occurrenceKey);
    expect(stored.workspace.cycles[0].sessions.some((s) => s.id === removed.id)).toBe(false);
    expect(stored.workspace.cycles[0].sessions[0].contents[0].content).toBe('Trainerinhalt');
    const persisted = structuredClone(stored.workspace);
    await planner.load();
    expect(planner.workspace()).toEqual(persisted);
    const reloaded = planner.workspace().cycles[0];
    fixture.componentInstance.open(reloaded);
    await fixture.whenStable();
    await click('Trainingsslots');
    await fill('Gültig ab · optional', '2026-10-20');
    await click('Regenerierung prüfen');
    for (const row of fixture.componentInstance.regeneration()!.rows)
      if (row.kind === 'conflict')
        await fill(`Entscheidung für ${row.before!.date}`, 'Bestehende Einheit behalten');
    const before = structuredClone(reloaded);
    vi.mocked(window.confirm).mockReturnValueOnce(false);
    await click('Regenerierung übernehmen');
    expect(reloaded).toEqual(before);
    await click('Regenerierung übernehmen');
    expect(reloaded.sessions.some((s) => s.id === manual.id)).toBe(true);
    await planner.settled();
    expect(stored.workspace.cycles[0].sessions).toEqual(reloaded.sessions);
  });
  it('supports the section 32 workflow through rendered controls and retains all changes on reload', async () => {
    await click('Ersten Makrozyklus erstellen →');
    for (const removed of [
      'Bogenklasse',
      'Leistungsniveau',
      'Wettkampftyp',
      'Distanz',
      'Auflage / Format',
    ]) {
      expect(fixture.nativeElement.textContent).not.toContain(removed);
    }
    expect(fixture.nativeElement.querySelector('textarea')).toBeNull();
    await fill('Name des Makrozyklus *', 'Hallensaison 2026');
    await fill('Name des Wettkampfs *', 'Landesmeisterschaft Halle');
    await click('Makrozyklus anlegen →');
    await click('Ferien & Sonderzeiträume');
    await click('＋ Zeitraum');
    await fill('Von', '2026-10-12');
    await fill('Bis', '2026-10-25');
    await fill('Training im Zeitraum', 'suspended');
    await click('Mesozyklen');
    await click('Phasen vorschlagen');
    expect(fixture.nativeElement.textContent).not.toContain('Intensität');
    expect(fixture.nativeElement.textContent).not.toContain('Ziel-Trainingsumfang');
    await fill('Umfang (1–5)', '2', 0);
    await fill('Bis', '2026-10-10', 0);
    await fill('Von', '2026-10-11', 1);
    await click('Vorschlag übernehmen');
    await click('Trainingsslots');
    for (const [weekday, time] of [
      ['Dienstag', '18:00'],
      ['Donnerstag', '18:00'],
      ['Samstag', '10:00'],
    ]) {
      await click('＋ Trainingsslot');
      const index = fixture.componentInstance.cycle()!.slots.length - 1;
      const selects = [
        ...(fixture.nativeElement.querySelectorAll('select') as NodeListOf<HTMLSelectElement>),
      ];
      const select = selects[index];
      select.value = [...select.options].find((o) => o.text === weekday)!.value;
      select.dispatchEvent(new Event('change', { bubbles: true }));
      await render();
      await fill('Startzeit', time, index);
    }
    await click('Terminvorschau erstellen →');
    expect(fixture.componentInstance.preview()).toHaveLength(30);
    expect(fixture.nativeElement.textContent).toContain('Schulferien');
    const checks = [
      ...(fixture.nativeElement.querySelectorAll(
        'table input[aria-label^=Termin]',
      ) as NodeListOf<HTMLInputElement>),
    ];
    checks[0].click();
    await render();
    await click('Auswahl erzeugen');
    expect(fixture.componentInstance.cycle()!.sessions).toHaveLength(23);
    await click('Öffnen →');
    const contentTextareas = fixture.nativeElement.querySelectorAll(
      '.content-block textarea',
    ) as NodeListOf<HTMLTextAreaElement>;
    expect(contentTextareas[1].value).toBe('Aufwärmen und Einschießen');
    expect(contentTextareas[0].maxLength).toBe(300);
    expect(fixture.nativeElement.querySelector('.content-block')!.textContent).toMatch(
      /Ziele[\s\S]*Inhalte/,
    );
    expect(fixture.componentInstance.selectedSession()!.name).toBe('Vereinstraining');
    for (const removed of [
      'Erwarteter Umfang',
      'Start (Minuten)',
      'Geplante Pfeilzahl',
      'Tatsächliche Pfeilzahl',
      'Tatsächliche Dauer',
      'Subjektive Belastung',
      'Umfang (1–5)',
      'Intensität (1–5)',
      'Spezifität (1–5)',
      'Unterkategorie',
      'Übungsreferenz',
      'Blockpfeile',
      'Blockdauer',
      'Blockbelastung',
    ]) {
      expect(fixture.nativeElement.textContent).not.toContain(removed);
    }
    expect(contentTextareas[1].rows).toBe(8);
    expect(fixture.nativeElement.querySelector('.content-block')!.textContent).not.toContain(
      'Notiz',
    );
    const labels = [...fixture.nativeElement.querySelectorAll('label')] as HTMLLabelElement[];
    expect(labels.some((label) => label.firstChild?.textContent?.trim() === 'Ort')).toBe(false);
    await fill('Name der Einheit', 'Technik und Scoring');
    await click('Inhalt entfernen');
    await click('＋ Trainingsinhalt');
    await fill('Inhalte', 'Technik\nDrei Serien mit Fokus auf den Ankerpunkt.');
    await fill('Material', 'Bogen, Theraband');
    await fill('Dauer (Minuten)', '45', 1);
    await click('＋ Trainingsinhalt');
    await fill('Inhalte', 'Scoring', 1);
    await fill('Typ', 'Pause', 1);
    expect(fixture.componentInstance.selectedSession()!.contents[1].category).toBe('Pause');
    await fill('Dauer (Minuten)', '50', 1);
    expect(fixture.componentInstance.selectedSession()!.contents[1].startOffsetMinutes).toBe(50);
    await fill('Dauer (Minuten)', '45', 1);
    expect(fixture.componentInstance.selectedSession()!.contents[1].startOffsetMinutes).toBe(45);
    await fill('Als eigene Vorlage speichern', 'Meine Technikeinheit');
    await click('Vorlage erstellen');
    await click('← Zur Tabelle');
    const selections = [
      ...(fixture.nativeElement.querySelectorAll(
        'input[type=checkbox]',
      ) as NodeListOf<HTMLInputElement>),
    ];
    selections[1].click();
    selections[2].click();
    await render();
    const templateSelect = fixture.nativeElement.querySelector(
      '.template-toolbar select',
    ) as HTMLSelectElement;
    templateSelect.value = [...templateSelect.options].find(
      (o) => o.text === 'Meine Technikeinheit',
    )!.value;
    templateSelect.dispatchEvent(new Event('change', { bubbles: true }));
    await render();
    await click('Auf 2 Einheiten anwenden');
    expect(fixture.nativeElement.textContent).toContain('Vorlagenvorschau');
    await click('Vorlage übernehmen');
    const planner = TestBed.inject(PlannerService);
    await planner.settled();
    const beforeRestart = structuredClone(planner.workspace());
    expect(beforeRestart.cycles[0].sessions[1].contents[0].content).toBe(
      'Technik\nDrei Serien mit Fokus auf den Ankerpunkt.',
    );
    expect(beforeRestart.cycles[0].sessions[1].contents[0].material).toBe('Bogen, Theraband');
    expect(beforeRestart.cycles[0].sessions[0].name).toBe('Technik und Scoring');
    expect(beforeRestart.cycles[0].sessions[0].manuallyModified).toBe(true);
    expect(beforeRestart.cycles[0].mesocycles[0].volume).toBe(2);
    await planner.load();
    expect(planner.workspace()).toEqual(beforeRestart);
    expect(planner.status()).toBe('saved');
  });
  it('offers all six colors, updates the marker and saves the selection across reload', async () => {
    await click('Ersten Makrozyklus erstellen →');
    await fill('Name des Makrozyklus *', 'Saison');
    await fill('Name des Wettkampfs *', 'Finale');
    await click('Makrozyklus anlegen →');
    await click('Mesozyklen');
    await click('Phasen vorschlagen');
    expect(fixture.nativeElement.textContent).not.toContain('Instanznummer');
    expect(fixture.componentInstance.proposal()![0].color).toBe('grey');
    await fill('Farbe', 'Hellgrün');
    await click('Vorschlag übernehmen');
    expect(fixture.componentInstance.cycle()!.mesocycles[0].color).toBe('lightGreen');
    const colorSelect = [...fixture.nativeElement.querySelectorAll('label')]
      .find((label: Element) => label.firstChild?.textContent?.trim() === 'Farbe')!
      .querySelector('select') as HTMLSelectElement;
    expect([...colorSelect.options].map((option) => option.text)).toEqual([
      'Grau',
      'Hellgrün',
      'Dunkelgrün',
      'Blau',
      'Orange',
      'Rot',
    ]);
    for (const [label, value] of [
      ['Grau', 'grey'],
      ['Hellgrün', 'lightGreen'],
      ['Dunkelgrün', 'darkGreen'],
      ['Blau', 'blue'],
      ['Orange', 'orange'],
      ['Rot', 'red'],
    ]) {
      await fill('Farbe', label);
      expect(fixture.nativeElement.querySelector('.phase-card').getAttribute('data-color')).toBe(
        value,
      );
    }
    const planner = fixture.componentInstance.planner;
    await planner.flush();
    expect(stored.workspace.cycles[0].mesocycles[0].color).toBe('red');
    await planner.load();
    await render();
    expect(fixture.componentInstance.cycle()!.mesocycles[0].color).toBe('red');
    planner.addPhase(fixture.componentInstance.cycle()!);
    expect(fixture.componentInstance.cycle()!.mesocycles.at(-1)!.color).toBe('grey');
  });
  it('requires confirmation before cycle deletion and retains units on declined deletion', async () => {
    await click('Ersten Makrozyklus erstellen →');
    await fill('Name des Makrozyklus *', 'Saison');
    await fill('Name des Wettkampfs *', 'Finale');
    await click('Makrozyklus anlegen →');
    vi.mocked(window.confirm).mockReturnValue(false);
    await click('Makrozyklus löschen');
    expect(fixture.componentInstance.planner.workspace().cycles).toHaveLength(1);
    vi.mocked(window.confirm).mockReturnValue(true);
    await click('Makrozyklus löschen');
    expect(fixture.componentInstance.planner.workspace().cycles).toHaveLength(0);
  });
  it('edits and reloads two A peaks and post-main compatibility observations without material navigation', async () => {
    await click('Ersten Makrozyklus erstellen →');
    await fill('Name des Makrozyklus *', 'Zwei Höhepunkte');
    await fill('Name des Wettkampfs *', 'Erstes Ziel');
    await fill('Planungsende *', '2026-12-27');
    await click('Makrozyklus anlegen →');
    await click('Wettkämpfe');
    await click('＋ Wettkampf');
    await fill('Wettkampfname', 'Zweites Ziel');
    await fill('Wettkampfdatum', '2026-12-20');
    await fill('Priorität', 'A');
    await click('Mesozyklen');
    await click('Phasen vorschlagen');
    await fill('Umfang (1–5)', '2');
    await click('Vorschlag übernehmen');
    expect(fixture.componentInstance.cycle()!.mesocycles.map((m) => m.type)).toEqual([
      'VP1',
      'VP2',
      'WP',
      'UWV',
      'WP',
      'UWV',
      'UEP',
    ]);
    await click('Trainingsslots');
    await click('＋ Trainingsslot');
    await click('Terminvorschau erstellen →');
    await click('Auswahl erzeugen');
    await click('Öffnen →');
    const session = fixture.componentInstance.selectedSession()!;
    // Stored observations remain compatibility data with no comparison screen.
    session.plannedArrowCount = 180;
    session.actualDuration = 100;
    session.actualArrowCount = 150;
    session.subjectiveLoad = 6;
    await fill('Status', 'completed');
    expect(fixture.componentInstance.nav.some(([key]) => key === 'material')).toBe(false);
    expect(fixture.nativeElement.textContent).not.toContain('Materialänderungen');
    const planner = fixture.componentInstance.planner;
    await planner.settled();
    const saved = structuredClone(planner.workspace());
    expect(saved.cycles[0].sessions.some((s) => s.date > '2026-12-06')).toBe(true);
    expect(saved.cycles[0].goals).toHaveLength(0);
    expect(saved.cycles[0].warningDecisions).toHaveLength(0);
    await planner.load();
    expect(planner.workspace()).toEqual(saved);
    await render();
    expect(saved.cycles[0].sessions[0].originalPlan).toEqual({
      duration: 120,
      arrows: 180,
      partialArrows: 180,
    });
  });
  it.each([1, 2])(
    'prechecks backup version %i without converting its workspace in Angular',
    async (version) => {
      const planner = fixture.componentInstance.planner;
      const restore = vi.spyOn(planner, 'restore').mockResolvedValue();
      const text = JSON.stringify({
        formatVersion: version,
        workspace: { cycles: [], templates: [] },
      });
      const input = { files: [{ size: text.length, text: async () => text }], value: 'selected' };
      await fixture.componentInstance.restore({ target: input } as unknown as Event);
      expect(restore).toHaveBeenCalledWith(text);
      expect(input.value).toBe('');
    },
  );
});
