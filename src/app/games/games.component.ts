import {
  Component,
  inject,
  signal,
  ChangeDetectionStrategy,
  ElementRef,
  viewChild,
  WritableSignal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { LibraryViewDirective } from '../shared/library-view.directive';
import { Game } from '../models';
import { PlannerService } from '../planner.service';
import { gameForms, GAME_RATINGS, GameImportPreview, gameErrors, newGame } from './games';
@Component({
  selector: 'app-games',
  standalone: true,
  imports: [FormsModule, LibraryViewDirective],
  templateUrl: './games.component.html',
  changeDetection: ChangeDetectionStrategy.Eager,
  styleUrl: './games.component.css',
})
export class GamesComponent {
  readonly planner = inject(PlannerService);
  readonly selectionMode = signal(false);
  readonly deletionIds = signal<string[]>([]);
  private readonly deleteDialog = viewChild<ElementRef<HTMLDialogElement>>('deleteDialog');
  toggleSelection(): void {
    this.selectionMode.update((active) => !active);
    this.deletionIds.set([]);
  }
  toggleGame(id: string): void {
    this.deletionIds.update((ids) =>
      ids.includes(id) ? ids.filter((value) => value !== id) : [...ids, id],
    );
  }
  requestDeletion(): void {
    if (!this.busy() && this.deletionIds().length) this.deleteDialog()?.nativeElement.showModal();
  }
  cancelDeletion(): void {
    this.deleteDialog()?.nativeElement.close();
    this.selectionMode.set(false);
    this.deletionIds.set([]);
  }
  async confirmDeletion(): Promise<void> {
    if (this.busy() || !this.deletionIds().length) return;
    const ids = [...this.deletionIds()];
    this.cancelDeletion();
    await this.run(async (message) => {
      await this.planner.settled();
      this.planner.deleteGames(ids);
      await this.planner.settled();
      message.set(`${ids.length} Spiele gelöscht.`);
    });
  }
  private readonly view = viewChild.required(LibraryViewDirective);
  readonly selectedId = signal<string | null>(null);
  readonly draft = signal<Game | null>(null);
  readonly busy = signal(false);
  readonly overviewMessage = signal('');
  readonly editorMessage = signal('');
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
  create(trigger: HTMLButtonElement): void {
    this.view().open(trigger);
    this.selectedId.set(null);
    this.draft.set(newGame());
    this.editorMessage.set('');
  }
  open(game: Game, trigger: HTMLButtonElement): void {
    this.view().open(trigger);
    this.draft.set(null);
    this.selectedId.set(game.id);
    this.editorMessage.set('');
  }
  close(): void {
    this.view().back();
    this.draft.set(null);
    this.selectedId.set(null);
  }
  changed(): void {
    if (!this.draft()) this.planner.changed();
  }
  private async run(action: (message: WritableSignal<string>) => Promise<void>): Promise<void> {
    if (this.busy()) return;
    this.busy.set(true);
    const message = this.selected() ? this.editorMessage : this.overviewMessage;
    message.set('');
    try {
      await action(message);
    } catch (e) {
      message.set((e as Error).message || 'Spiel konnte nicht gespeichert werden.');
    } finally {
      this.busy.set(false);
    }
  }
  async saveDraft(): Promise<void> {
    const game = this.draft();
    if (!game) return;
    await this.run(async (message) => {
      const errors = gameErrors([game]);
      if (errors.length) throw new Error(errors[0]);
      this.planner.createGame(game);
      this.draft.set(null);
      this.selectedId.set(game.id);
      await this.planner.settled();
      message.set('Spiel lokal gespeichert.');
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
    await this.run(async (message) => {
      await this.planner.exportGamePdf(game);
      message.set('Spielanleitung im PDF-Viewer geöffnet.');
    });
  }
  async export(ids: string[]): Promise<void> {
    await this.run(async (message) => {
      const path = await this.planner.exportGames(ids);
      message.set(path ? 'Spielpaket gespeichert: ' + path : 'Export abgebrochen.');
    });
  }
  allIds(): string[] {
    return (this.planner.workspace().games ?? []).map((g) => g.id);
  }
  async openImport(): Promise<void> {
    await this.run(async (message) => {
      this.preview.set(null);
      const preview = await this.planner.previewGameImport();
      this.preview.set(preview);
      if (!preview) message.set('Import abgebrochen.');
    });
  }
  async acceptImport(preview: GameImportPreview): Promise<void> {
    await this.run(async (message) => {
      // Consume the preview once; failed persistence retains the same aggregate for Retry.
      this.preview.set(null);
      await this.planner.importGames(preview);
      message.set(`${preview.games.length} Spiele importiert.`);
    });
  }
}
