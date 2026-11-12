import { By } from '@angular/platform-browser';
import { GamesComponent } from './games.component';
import { GamePdfValidationService } from './attachment-validation';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AppComponent } from '../app.component';
import { DataAccessService } from '../data-access.service';
import { PlannerService } from '../planner.service';
import { SaveInput, Snapshot } from '../models';
import gameFixture from '../../../fixtures/games-package-v1.json';
const mock = { validate: vi.fn().mockResolvedValue(undefined) };
describe('training game UI and persistence orchestration', () => {
  let fixture: ComponentFixture<AppComponent>,
    stored: Snapshot,
    access: Record<string, ReturnType<typeof vi.fn>>;
  const render = async () => {
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
  };
  const click = async (label: string) => {
    await render();
    const button = Array.from(
      fixture.nativeElement.querySelectorAll('button') as NodeListOf<HTMLButtonElement>,
    ).find((b) => b.textContent?.trim() === label);
    expect(button, label).toBeDefined();
    expect(button!.disabled).toBe(false);
    button!.click();
    await render();
    await vi.waitFor(() => {
      fixture.detectChanges();
      const games = fixture.debugElement.query(By.directive(GamesComponent))?.componentInstance as
        GamesComponent | undefined;
      expect(games?.busy() ?? false).toBe(false);
    });
    await render();
  };
  const fill = async (label: string, value: string) => {
    const input = Array.from(
      fixture.nativeElement.querySelectorAll('label') as NodeListOf<HTMLLabelElement>,
    )
      .find((l) => l.firstChild?.textContent?.trim() === label)
      ?.querySelector('input,textarea') as HTMLInputElement;
    expect(input, label).toBeDefined();
    input.value = value;
    input.dispatchEvent(new Event('input', { bubbles: true }));
    await render();
  };
  beforeEach(async () => {
    Object.defineProperty(HTMLDialogElement.prototype, 'showModal', {
      configurable: true,
      value: function (this: HTMLDialogElement) {
        this.open = true;
      },
    });
    Object.defineProperty(HTMLDialogElement.prototype, 'close', {
      configurable: true,
      value: function (this: HTMLDialogElement) {
        if (this.open) {
          this.open = false;
          this.dispatchEvent(new Event('close'));
        }
      },
    });
    stored = { revision: 1, workspace: { cycles: [], templates: [] } };
    access = {
      loadWelcomeModalVersion: vi.fn().mockResolvedValue(1),
      load: vi.fn().mockImplementation(async () => structuredClone(stored)),
      save: vi.fn().mockImplementation(async (input: SaveInput) => {
        stored = {
          revision: input.expectedRevision + 1,
          workspace: structuredClone(input.workspace),
        };
        return structuredClone(stored);
      }),
      pickGamePdfs: vi.fn().mockResolvedValue([gameFixture.games[0].attachments[0]]),
      readGamePackage: vi.fn().mockResolvedValue(structuredClone(gameFixture)),
      readGameAttachments: vi
        .fn()
        .mockImplementation(async (ids: string[]) =>
          ids.map((id) => ({ id, bytes: gameFixture.games[0].attachments[0].bytes })),
        ),
      exportSessionPdf: vi.fn().mockResolvedValue(undefined),
      exportPlanFile: vi.fn().mockResolvedValue('spiele.json'),
    };
    TestBed.configureTestingModule({
      imports: [AppComponent],
      providers: [
        { provide: DataAccessService, useValue: access },
        { provide: GamePdfValidationService, useValue: mock },
      ],
    });
    fixture = TestBed.createComponent(AppComponent);
    await render();
    await click('Trainingsspiele');
  });
  afterEach(() => {
    fixture.destroy();
    TestBed.resetTestingModule();
    Reflect.deleteProperty(HTMLDialogElement.prototype, 'showModal');
    Reflect.deleteProperty(HTMLDialogElement.prototype, 'close');
    vi.clearAllMocks();
  });
  const selectionBoxes = () =>
    Array.from(
      fixture.nativeElement.querySelectorAll(
        '.game-row input[type=checkbox]',
      ) as NodeListOf<HTMLInputElement>,
    );
  const deleteButton = () =>
    Array.from(
      fixture.nativeElement.querySelectorAll('button') as NodeListOf<HTMLButtonElement>,
    ).find((button) => button.textContent?.trim() === 'Löschen')!;
  const importGames = async () => {
    for (let i = 0; i < 3; i++) {
      await click('Spiele importieren');
      await click('Spiele importieren bestätigen');
    }
  };
  it('toggles selection, confirms only checked games and persists deletion on reload', async () => {
    await importGames();
    const original = structuredClone(stored.workspace.games!);
    expect(selectionBoxes()).toHaveLength(0);
    expect(deleteButton().disabled).toBe(true);
    await click('Auswahl');
    expect(selectionBoxes()).toHaveLength(3);
    selectionBoxes()[0].click();
    selectionBoxes()[1].click();
    selectionBoxes()[0].click();
    selectionBoxes()[2].click();
    await render();
    expect(deleteButton().disabled).toBe(false);
    // An editor for a deleted game must close as well.
    (fixture.nativeElement.querySelectorAll('.game-item')[1] as HTMLButtonElement).click();
    await render();
    await click('Löschen');
    expect(fixture.nativeElement.querySelector('app-games dialog').open).toBe(true);
    expect(fixture.nativeElement.querySelector('app-games dialog').textContent).toContain(
      '2 Spiele',
    );
    await click('Okay');
    expect(stored.workspace.games).toEqual([original[0]]);
    expect(selectionBoxes()).toHaveLength(0);
    expect(deleteButton().disabled).toBe(true);
    expect(fixture.nativeElement.querySelector('[aria-label="Spielbearbeitung"]')).toBeNull();
    await TestBed.inject(PlannerService).load();
    await render();
    expect(fixture.nativeElement.querySelectorAll('.game-item')).toHaveLength(1);
  });
  it('resets selection on toggle, cancel, Escape and dialog close without saving', async () => {
    await importGames();
    const before = structuredClone(stored);
    access['save'].mockClear();
    await click('Auswahl');
    selectionBoxes()[0].click();
    await click('Auswahl');
    expect(selectionBoxes()).toHaveLength(0);
    expect(deleteButton().disabled).toBe(true);
    for (const dismissal of ['button', 'escape', 'close']) {
      await click('Auswahl');
      expect(selectionBoxes().every((box) => !box.checked)).toBe(true);
      selectionBoxes()[0].click();
      await render();
      await click('Löschen');
      const dialog = fixture.nativeElement.querySelector('app-games dialog') as HTMLDialogElement;
      if (dismissal === 'button') await click('Abbrechen');
      else if (dismissal === 'escape')
        dialog.dispatchEvent(new Event('cancel', { cancelable: true }));
      else dialog.close();
      await render();
      expect(dialog.open).toBe(false);
      expect(selectionBoxes()).toHaveLength(0);
      expect(deleteButton().disabled).toBe(true);
    }
    expect(stored).toEqual(before);
    expect(access['save']).not.toHaveBeenCalled();
  });
  it('retains a failed deletion for retry and does not report success', async () => {
    await importGames();
    const keep = structuredClone(stored.workspace.games!.slice(1));
    await click('Auswahl');
    selectionBoxes()[0].click();
    await render();
    await click('Löschen');
    access['save'].mockRejectedValueOnce({ code: 'storage', message: 'Disk full' });
    await click('Okay');
    expect(stored.workspace.games).toHaveLength(3);
    expect(TestBed.inject(PlannerService).workspace().games).toEqual(keep);
    expect(fixture.nativeElement.textContent).not.toContain('1 Spiele gelöscht.');
    expect(selectionBoxes()).toHaveLength(0);
    await click('Erneut versuchen');
    await TestBed.inject(PlannerService).settled();
    expect(stored.workspace.games).toEqual(keep);
  });
  it('creates games without a macrocycle, attaches/prints PDFs, exports instructions and keeps edits on reload', async () => {
    await click('＋ Spiel anlegen');
    await fill('Name', 'Ringjagd');
    await fill('Beschreibung', 'Regeln für die Gruppe');
    await click('Spiel speichern');
    expect(stored.workspace.games![0].name).toBe('Ringjagd');
    expect(stored.workspace.cycles).toHaveLength(0);
    await click('PDF-Anhänge hinzufügen');
    expect(stored.workspace.games![0].attachments).toHaveLength(1);
    const bytes = gameFixture.games[0].attachments[0].bytes;
    await click('Öffnen / Drucken');
    expect(access['exportSessionPdf']).toHaveBeenLastCalledWith('Ringjagd.pdf', bytes);
    await click('Spielanleitung als PDF');
    expect(access['exportSessionPdf'].mock.lastCall![1].slice(0, 5)).toEqual([37, 80, 68, 70, 45]);
    await click('Spiel exportieren');
    const args = access['exportPlanFile'].mock.lastCall!;
    expect(args[0]).toBe('games');
    expect(
      JSON.parse(new TextDecoder().decode(new Uint8Array(args[2]))).games[0].attachments[0].bytes,
    ).toEqual(bytes);
    await fill('Name', 'Ringjagd neu');
    await TestBed.inject(PlannerService).settled();
    await TestBed.inject(PlannerService).load();
    await render();
    expect(fixture.nativeElement.textContent).toContain('Ringjagd neu');
    await click('Anhang entfernen');
    expect(stored.workspace.games![0].attachments).toHaveLength(0);
  });
  it('persists each checkbox combination, rejects neither form and retains choices on reload', async () => {
    await click('＋ Spiel anlegen');
    await fill('Name', 'Spielformen');
    await fill('Beschreibung', 'Spielregeln');
    const checkbox = (label: string) =>
      Array.from(fixture.nativeElement.querySelectorAll('label') as NodeListOf<HTMLLabelElement>)
        .find((l) => l.textContent?.trim() === label)!
        .querySelector('input')!;
    expect(checkbox('Einzelspiel').checked).toBe(true);
    expect(checkbox('Teamspiel').checked).toBe(true);
    checkbox('Einzelspiel').click();
    await render();
    checkbox('Teamspiel').click();
    await render();
    await click('Spiel speichern');
    expect(access['save']).not.toHaveBeenCalled();
    expect(fixture.nativeElement.textContent).toContain('mindestens eine Spielform');
    checkbox('Einzelspiel').click();
    await render();
    await click('Spiel speichern');
    const planner = TestBed.inject(PlannerService);
    expect(stored.workspace.games![0]).toMatchObject({ single: true, team: false });
    checkbox('Teamspiel').click();
    await render();
    await planner.settled();
    expect(stored.workspace.games![0]).toMatchObject({ single: true, team: true });
    checkbox('Einzelspiel').click();
    await render();
    await planner.settled();
    await planner.load();
    await render();
    expect(checkbox('Einzelspiel').checked).toBe(false);
    expect(checkbox('Teamspiel').checked).toBe(true);
    expect(stored.workspace.games![0]).not.toHaveProperty('kind');
  });
  it('previews imports, cancels without writes and retains exactly one copy after failed persistence and retry', async () => {
    await click('Spiele importieren');
    expect(fixture.nativeElement.textContent).toContain('Spielimport prüfen');
    await click('Import abbrechen');
    expect(access['save']).not.toHaveBeenCalled();
    await click('Spiele importieren');
    access['save'].mockRejectedValueOnce({ code: 'storage', message: 'Disk full' });
    await click('Spiele importieren bestätigen');
    expect(stored.workspace.games).toBeUndefined();
    const planner = TestBed.inject(PlannerService);
    expect(planner.workspace().games).toHaveLength(1);
    expect(planner.status()).toBe('failed');
    await click('Erneut versuchen');
    await planner.settled();
    expect(stored.workspace.games).toHaveLength(1);
    await click('Spiele importieren');
    await click('Spiele importieren bestätigen');
    expect(stored.workspace.games).toHaveLength(2);
    expect(new Set(stored.workspace.games!.map((g) => g.id)).size).toBe(2);
  });
  it('adds nothing when PDF usability validation fails or the native selection is cancelled', async () => {
    await click('Spiele importieren');
    await click('Spiele importieren bestätigen');
    const planner = TestBed.inject(PlannerService),
      game = planner.workspace().games![0];
    mock.validate.mockRejectedValueOnce(new Error('PDF unreadable'));
    await expect(planner.attachGamePdfs(game)).rejects.toThrow('unreadable');
    expect(game.attachments).toHaveLength(1);
    access['pickGamePdfs'].mockResolvedValueOnce(null);
    await planner.attachGamePdfs(game);
    expect(game.attachments).toHaveLength(1);
  });
});
