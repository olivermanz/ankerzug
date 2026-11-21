import { ContentAttachmentComponent } from '../attachments/content-attachment.component';
import { Component, computed, inject, signal, viewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { gameForms } from '../games/games';
import {
  CATEGORIES,
  Content,
  contentTypeLabel,
  SELECTABLE_SESSION_TYPES,
  SESSION_TYPE_LABELS,
  Template,
} from '../models';
import { PlannerService } from '../planner.service';
import { formatOffset, newTemplate } from '../planning';
import { LibraryViewDirective } from '../shared/library-view.directive';

@Component({
  selector: 'app-templates',
  imports: [FormsModule, LibraryViewDirective, ContentAttachmentComponent],
  templateUrl: './templates.component.html',
})
export class TemplatesComponent {
  readonly planner = inject(PlannerService);
  readonly draft = signal<Template | null>(null);
  readonly error = signal('');
  private readonly selectedId = signal<string | null>(null);
  private readonly view = viewChild.required(LibraryViewDirective);
  readonly selected = computed(
    () =>
      this.draft() ??
      this.planner.workspace().templates.find((t) => t.id === this.selectedId()) ??
      null,
  );
  readonly categories = CATEGORIES;
  readonly contentTypeLabel = contentTypeLabel;
  readonly sessionTypes = SELECTABLE_SESSION_TYPES;
  readonly sessionTypeLabels = SESSION_TYPE_LABELS;
  readonly gameForms = gameForms;
  readonly offset = formatOffset;

  create(trigger: HTMLButtonElement): void {
    this.view().open(trigger);
    this.draft.set(newTemplate());
    this.error.set('');
  }

  open(template: Template, trigger: HTMLButtonElement): void {
    this.view().open(trigger);
    this.selectedId.set(template.id);
  }

  close(): void {
    this.view().back();
    this.draft.set(null);
    this.selectedId.set(null);
    this.error.set('');
  }

  async saveDraft(): Promise<void> {
    const template = this.draft();
    if (!template) return;
    this.error.set('');
    try {
      this.planner.createTemplate(template);
    } catch (error) {
      this.error.set((error as Error).message);
      return;
    }
    this.selectedId.set(template.id);
    this.draft.set(null);
    // A failed write is surfaced by the global save status and retains the same template for retry.
    await this.planner.flush();
  }

  deleteTemplate(template: Template): void {
    if (confirm('Vorlage löschen? Geplante Einheiten bleiben erhalten.')) {
      this.planner.deleteTemplate(template);
    }
  }

  changeBlockType(template: Template, block: Content): void {
    if (block.category !== 'Spiel') delete block.gameId;
    this.planner.templateChanged(template);
  }
}
