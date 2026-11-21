import {
  Component,
  ElementRef,
  inject,
  input,
  OnDestroy,
  output,
  signal,
  viewChild,
} from '@angular/core';
import { Content } from '../models';
import { PlannerService } from '../planner.service';
import { PdfPages, PdfRendererService } from '../pdf/pdf-viewer';
import { checkAttachmentSize, validateContentAttachment } from './content-attachment';

@Component({
  selector: 'app-content-attachment',
  templateUrl: './content-attachment.component.html',
  styleUrl: './content-attachment.component.css',
})
export class ContentAttachmentComponent implements OnDestroy {
  readonly content = input.required<Content>();
  readonly changed = output<void>();
  private readonly planner = inject(PlannerService);
  private readonly renderer = inject(PdfRendererService);
  private readonly dialog = viewChild.required<ElementRef<HTMLDialogElement>>('dialog');
  private readonly preview = viewChild.required<ElementRef<HTMLElement>>('preview');
  readonly page = signal(0);
  readonly count = signal(0);
  readonly busy = signal(false);
  readonly error = signal('');
  private pdf?: PdfPages;
  private revision = 0;

  async open(): Promise<void> {
    this.dialog().nativeElement.showModal();
    if (!this.content().attachment) return;
    await this.run(async (current) => {
      const bytes = await this.planner.contentAttachmentBytes(this.content());
      if (current()) await this.showPdf(bytes, current);
    });
  }

  async select(input: HTMLInputElement): Promise<void> {
    const file = input.files?.[0];
    input.value = '';
    if (!file || !this.dialog().nativeElement.open) return;
    await this.run(async (current) => {
      checkAttachmentSize(file.size);
      const attachment = {
        filename: file.name,
        bytes: Array.from(new Uint8Array(await file.arrayBuffer())),
      };
      if (!current()) return;
      await validateContentAttachment(attachment, (bytes, retention) =>
        this.renderer.load(bytes, retention),
      );
      if (!current()) return;
      await this.showPdf(attachment.bytes, current);
      if (!current()) return;
      this.planner.setContentAttachment(this.content(), attachment);
      this.changed.emit();
    });
  }

  remove(): void {
    this.planner.setContentAttachment(this.content(), null);
    this.reset();
    this.changed.emit();
  }

  async turn(page: number): Promise<void> {
    const pdf = this.pdf;
    if (!pdf || page < 1 || page > pdf.count) return;
    await this.run(async (current) => {
      const canvas = await this.render(pdf, page);
      if (current()) {
        this.preview().nativeElement.replaceChildren(canvas);
        this.page.set(page);
      }
    });
  }

  close(): void {
    this.reset();
    this.dialog().nativeElement.close();
  }

  ngOnDestroy(): void {
    this.revision++;
    void this.pdf?.destroy();
  }

  private async run(work: (current: () => boolean) => Promise<void>): Promise<void> {
    const revision = ++this.revision;
    const current = () => revision === this.revision;
    this.busy.set(true);
    this.error.set('');
    try {
      await work(current);
    } catch (error) {
      if (current())
        this.error.set('Anlage konnte nicht geöffnet werden. ' + (error as Error).message);
    } finally {
      if (current()) this.busy.set(false);
    }
  }

  private async showPdf(bytes: number[], current: () => boolean): Promise<void> {
    const pdf = await this.renderer.load(new Uint8Array(bytes), 'single-page');
    try {
      if (!current()) return;
      const canvas = await this.render(pdf, 1);
      if (!current()) return;
      this.preview().nativeElement.replaceChildren(canvas);
      void this.pdf?.destroy();
      this.pdf = pdf;
      this.page.set(1);
      this.count.set(pdf.count);
    } finally {
      if (this.pdf !== pdf) await pdf.destroy();
    }
  }

  private async render(pdf: PdfPages, page: number): Promise<HTMLCanvasElement> {
    const canvas = document.createElement('canvas');
    canvas.style.cssText = 'display:block;max-width:100%;height:auto;margin:auto';
    canvas.setAttribute('role', 'img');
    canvas.setAttribute('aria-label', `PDF-Seite ${page} von ${pdf.count}`);
    await pdf.render(page, canvas);
    return canvas;
  }

  private reset(): void {
    this.revision++;
    void this.pdf?.destroy();
    this.pdf = undefined;
    this.preview().nativeElement.replaceChildren();
    this.count.set(0);
    this.page.set(0);
    this.busy.set(false);
    this.error.set('');
  }
}
