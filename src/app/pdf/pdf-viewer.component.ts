import {
  Component,
  ElementRef,
  HostListener,
  inject,
  OnDestroy,
  OnInit,
  signal,
  ViewChild,
} from '@angular/core';
import { DataAccessService } from '../data-access.service';
import { PdfPages, PdfRendererService } from './pdf-viewer';

@Component({
  selector: 'app-root',
  standalone: true,
  template: `
    <header class="pdf-toolbar">
      <strong>{{ filename() || 'PDF-Viewer' }}</strong>
      <span>{{ count() }} Seite{{ count() === 1 ? '' : 'n' }}</span>
      <button (click)="save()" [disabled]="!ready() || saving()">Speichern unter …</button>
      <button class="primary" (click)="print()" [disabled]="!ready() || printing()">Drucken</button>
    </header>
    @if (error()) {
      <p role="alert">{{ error() }}</p>
    } @else if (!ready()) {
      <p role="status">PDF wird geladen …</p>
    }
    <div #pages class="pdf-pages" aria-label="PDF-Seiten"></div>
    @if (message()) {
      <p role="status">{{ message() }}</p>
    }
  `,
  styleUrl: './pdf-viewer.component.css',
})
export class PdfViewerComponent implements OnInit, OnDestroy {
  private readonly access = inject(DataAccessService);
  private readonly renderer = inject(PdfRendererService);
  @ViewChild('pages', { static: true }) private pages!: ElementRef<HTMLDivElement>;
  readonly filename = signal('');
  readonly count = signal(0);
  readonly ready = signal(false);
  readonly error = signal('');
  readonly saving = signal(false);
  readonly printing = signal(false);
  readonly message = signal('');
  private document?: PdfPages;
  private destroyed = false;
  private printSizes?: HTMLStyleElement;

  async ngOnInit(): Promise<void> {
    try {
      const pdf = await this.access.readPdfViewer();
      if (this.destroyed) return;
      this.filename.set(pdf.filename);
      window.document.title = pdf.filename + ' – Ankerzug PDF-Viewer';
      const document = await this.renderer.load(new Uint8Array(pdf.bytes));
      if (this.destroyed) {
        await document.destroy();
        return;
      }
      this.document = document;
      this.count.set(document.count);
      // Render every page before enabling printing so Ctrl+P also prints the
      // complete PDF. The viewer prints the actual export, not a second layout.
      this.printSizes = window.document.createElement('style');
      window.document.head.append(this.printSizes);
      for (let page = 1; page <= document.count; page++) {
        if (this.destroyed) return;
        const canvas = window.document.createElement('canvas');
        canvas.setAttribute('role', 'img');
        canvas.setAttribute('aria-label', `PDF-Seite ${page} von ${document.count}`);
        const sheet = window.document.createElement('section');
        sheet.className = 'pdf-page';
        sheet.append(canvas);
        this.pages.nativeElement.append(sheet);
        await document.render(page, canvas);
        const width = Number(canvas.dataset['widthMm']) || (canvas.width * 25.4) / 150;
        const height = Number(canvas.dataset['heightMm']) || (canvas.height * 25.4) / 150;
        sheet.style.setProperty('--page-width', `${width}mm`);
        sheet.style.setProperty('--page-height', `${height}mm`);
        sheet.style.page = `pdfSheet${page}`;
        this.printSizes.textContent += `@page pdfSheet${page} { size: ${width}mm ${height}mm; margin: 0; }`;
      }
      if (!this.destroyed) this.ready.set(true);
    } catch (error) {
      if (this.destroyed) return;
      this.pages.nativeElement.replaceChildren();
      this.error.set(
        'PDF konnte nicht angezeigt werden. Bitte den PDF-Export erneut starten. ' +
          ((error as Error).message || ''),
      );
    }
  }

  @HostListener('window:keydown', ['$event'])
  keydown(event: KeyboardEvent): void {
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'p') {
      event.preventDefault();
      this.print();
    }
  }

  async print(): Promise<void> {
    if (!this.ready() || this.printing()) return;
    this.printing.set(true);
    try {
      await this.access.printPdfViewer();
    } catch (error) {
      this.error.set(
        'Druckdialog konnte nicht geöffnet werden. ' + ((error as Error).message || ''),
      );
    } finally {
      this.printing.set(false);
    }
  }

  async save(): Promise<void> {
    if (!this.ready() || this.saving()) return;
    this.saving.set(true);
    try {
      const path = await this.access.savePdfViewer();
      this.message.set(path ? 'PDF gespeichert: ' + path : 'Speichern abgebrochen.');
    } catch (error) {
      this.message.set((error as Error).message || 'PDF konnte nicht gespeichert werden.');
    } finally {
      this.saving.set(false);
    }
  }

  ngOnDestroy(): void {
    this.destroyed = true;
    this.printSizes?.remove();
    void this.document?.destroy();
  }
}
