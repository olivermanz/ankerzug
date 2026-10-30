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
    stored = { revision: 1, workspace: { cycles: [], templates: [] } };
    access = {
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
    vi.clearAllMocks();
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
