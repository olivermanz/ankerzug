import { Component, inject, input, output, signal, ChangeDetectionStrategy } from '@angular/core';
import { MacroCycle } from '../models';
import { PlannerService } from '../planner.service';
import { ImportPreview, TemplateImportPreview } from './exchange';
import { PlanSection, planSections } from './readable';

@Component({
  selector: 'app-exports',
  standalone: true,
  templateUrl: './exports.component.html',
  changeDetection: ChangeDetectionStrategy.Eager,
  styleUrl: './exports.component.css',
})
export class ExportsComponent {
  readonly planner = inject(PlannerService);
  readonly cycle = input<MacroCycle | null>(null);
  readonly imported = output<MacroCycle>();
  readonly busy = signal(false);
  readonly message = signal('');
  readonly preview = signal<ImportPreview | null>(null);
  readonly templatePreview = signal<TemplateImportPreview | null>(null);
  readonly printSections = signal<PlanSection[] | null>(null);
  readonly formats = [
    ['package', 'Makrozyklus-Paket'],
    ['markdown', 'Markdown'],
    ['csv', 'CSV'],
    ['ics', 'Kalender (ICS)'],
    ['pdf', 'Trainingsplan PDF (A4)'],
  ] as const;
  collisionCount(preview: TemplateImportPreview): number {
    return preview.mappings.filter((x) => x.collision).length;
  }
  private async run(action: () => Promise<void>): Promise<void> {
    if (this.busy()) return;
    this.busy.set(true);
    this.message.set('');
    try {
      await action();
    } catch (e) {
      this.message.set((e as Error).message || 'Datenaustausch fehlgeschlagen.');
    } finally {
      this.busy.set(false);
    }
  }
  async export(format: 'package' | 'markdown' | 'csv' | 'ics' | 'pdf'): Promise<void> {
    const cycle = this.cycle();
    if (!cycle) return;
    await this.run(async () => {
      const path = await this.planner.exportPlan(cycle, format);
      this.message.set(
        format === 'pdf'
          ? 'PDF im Viewer geöffnet.'
          : path
            ? 'Export gespeichert: ' + path
            : 'Export abgebrochen.',
      );
    });
  }
  async openImport(): Promise<void> {
    await this.run(async () => {
      this.preview.set(null);
      this.templatePreview.set(null);
      const preview = await this.planner.previewImport();
      this.preview.set(preview);
      if (!preview) this.message.set('Import abgebrochen.');
    });
  }
  async acceptImport(): Promise<void> {
    const preview = this.preview();
    if (!preview) return;
    await this.run(async () => {
      try {
        const cycle = await this.planner.importMacroCycle(preview);
        this.preview.set(null);
        this.message.set('Makrozyklus als separate Kopie importiert.');
        this.imported.emit(cycle);
      } catch (e) {
        if (JSON.stringify(this.planner.workspace()) !== preview.source) this.preview.set(null);
        throw e;
      }
    });
  }
  async exportTemplates(templateId?: string): Promise<void> {
    await this.run(async () => {
      const ids = templateId
        ? [templateId]
        : this.planner.workspace().templates.map((template) => template.id);
      const path = await this.planner.exportTemplates(ids);
      this.message.set(
        path ? 'Vorlagen-Paket gespeichert: ' + path : 'Vorlagen-Export abgebrochen.',
      );
    });
  }
  async openTemplateImport(): Promise<void> {
    await this.run(async () => {
      this.preview.set(null);
      this.templatePreview.set(null);
      const preview = await this.planner.previewTemplateImport();
      this.templatePreview.set(preview);
      if (!preview) this.message.set('Vorlagen-Import abgebrochen.');
    });
  }
  async acceptTemplateImport(): Promise<void> {
    const preview = this.templatePreview();
    if (!preview) return;
    await this.run(async () => {
      try {
        await this.planner.importTemplates(preview);
        this.templatePreview.set(null);
        this.message.set('Vorlagen als separate Kopien importiert.');
      } catch (error) {
        if (JSON.stringify(this.planner.workspace()) !== preview.source)
          this.templatePreview.set(null);
        throw error;
      }
    });
  }
  async showPrint(): Promise<void> {
    const cycle = this.cycle();
    if (!cycle) return;
    await this.run(async () => {
      await this.planner.settled();
      this.printSections.set(
        planSections(structuredClone(cycle), structuredClone(this.planner.workspace().games ?? [])),
      );
    });
  }
  async print(): Promise<void> {
    const cycle = this.cycle();
    if (!cycle) return;
    await this.run(async () => {
      await this.planner.settled();
      this.printSections.set(
        planSections(structuredClone(cycle), structuredClone(this.planner.workspace().games ?? [])),
      );
      // Let Angular render the detached snapshot before the webview prints.
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
      window.print();
    });
  }
}
