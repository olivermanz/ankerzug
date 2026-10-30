import { Component, inject, signal, ChangeDetectionStrategy } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Game } from '../models';
import { PlannerService } from '../planner.service';
import { gameForms, GAME_RATINGS, GameImportPreview, gameErrors, newGame } from './games';
@Component({
  selector: 'app-games',
  standalone: true,
  imports: [FormsModule],
  templateUrl: './games.component.html',
  changeDetection: ChangeDetectionStrategy.Eager,
  styleUrl: './games.component.css',
})
export class GamesComponent {
  readonly planner = inject(PlannerService);
  readonly selectedId = signal<string | null>(null);
  readonly draft = signal<Game | null>(null);
  readonly busy = signal(false);
  readonly message = signal('');
  readonly preview = signal<GameImportPreview | null>(null);
  readonly gameForms = gameForms;
  readonly ratings = GAME_RATINGS;
  readonly values = [1, 2, 3, 4, 5];
  selected(): Game | null {
    return (
      this.draft() ??
      this.planner.workspace().games?.find((g) => g.id === this.selectedId()) ??
      null
    );
  }
  create(): void {
    this.selectedId.set(null);
    this.draft.set(newGame());
    this.message.set('');
  }
  open(game: Game): void {
    this.draft.set(null);
    this.selectedId.set(game.id);
    this.message.set('');
  }
  close(): void {
    this.draft.set(null);
    this.selectedId.set(null);
  }
  changed(): void {
    if (!this.draft()) this.planner.changed();
  }
  private async run(action: () => Promise<void>): Promise<void> {
    if (this.busy()) return;
    this.busy.set(true);
    this.message.set('');
    try {
      await action();
    } catch (e) {
      this.message.set((e as Error).message || 'Spiel konnte nicht gespeichert werden.');
    } finally {
      this.busy.set(false);
    }
  }
  async saveDraft(): Promise<void> {
    const game = this.draft();
    if (!game) return;
    await this.run(async () => {
      const errors = gameErrors([game]);
      if (errors.length) throw new Error(errors[0]);
      this.planner.createGame(game);
      this.draft.set(null);
      this.selectedId.set(game.id);
      await this.planner.settled();
      this.message.set('Spiel lokal gespeichert.');
    });
  }
  async attach(game: Game): Promise<void> {
    await this.run(async () => {
      await this.planner.attachGamePdfs(game);
    });
  }
  async openAttachment(game: Game, index: number): Promise<void> {
    await this.run(async () => {
      await this.planner.openGameAttachment(game, game.attachments[index]);
    });
  }
  async removeAttachment(game: Game, index: number): Promise<void> {
    await this.run(async () => {
      await this.planner.settled();
      game.attachments.splice(index, 1);
      this.planner.changed();
      await this.planner.settled();
    });
  }
  async pdf(game: Game): Promise<void> {
    await this.run(async () => {
      await this.planner.exportGamePdf(game);
      this.message.set('Spielanleitung im PDF-Viewer geöffnet.');
    });
  }
  async export(ids: string[]): Promise<void> {
    await this.run(async () => {
      const path = await this.planner.exportGames(ids);
      this.message.set(path ? 'Spielpaket gespeichert: ' + path : 'Export abgebrochen.');
    });
  }
  allIds(): string[] {
    return (this.planner.workspace().games ?? []).map((g) => g.id);
  }
  async openImport(): Promise<void> {
    await this.run(async () => {
      this.preview.set(null);
      const preview = await this.planner.previewGameImport();
      this.preview.set(preview);
      if (!preview) this.message.set('Import abgebrochen.');
    });
  }
  async acceptImport(preview: GameImportPreview): Promise<void> {
    await this.run(async () => {
      // Consume the preview once; failed persistence retains the same aggregate for Retry.
      this.preview.set(null);
      await this.planner.importGames(preview);
      this.message.set(`${preview.games.length} Spiele importiert.`);
    });
  }
}
