import { Injectable } from '@angular/core';

export interface PdfPages {
  count: number;
  render(
    page: number,
    canvas: HTMLCanvasElement,
    orientation?: 'portrait' | 'landscape',
  ): Promise<void>;
  destroy(): Promise<void>;
}

// The print viewer retains every canvas. Content previews and appendix rendering
// discard each sheet before advancing and only need the per-page allocation cap.
type PageRetention = 'all-pages' | 'single-page';

export class PdfPreviewBudgetExceeded extends Error {
  constructor() {
    super('Die vollständige PDF-Vorschau überschreitet 100 Millionen Pixel bei 150 dpi.');
  }
}

export async function loadPdfPages(
  bytes: Uint8Array,
  retention: PageRetention = 'all-pages',
): Promise<PdfPages> {
  const { getDocument, GlobalWorkerOptions } = await import('pdfjs-dist/legacy/build/pdf.mjs');
  GlobalWorkerOptions.workerSrc = new URL('pdfjs/pdf.worker.min.mjs', document.baseURI).href;
  const task = getDocument({ data: bytes });
  try {
    const pdf = await task.promise;
    if (pdf.numPages < 1 || pdf.numPages > 200)
      throw new Error('PDF muss zwischen 1 und 200 Seiten enthalten.');
    const renderedPixels = new Map<number, number>();
    return {
      count: pdf.numPages,
      async render(page, canvas, orientation) {
        const sheet = await pdf.getPage(page);
        let viewport = sheet.getViewport({ scale: 150 / 72 });
        if (orientation && (orientation === 'landscape') !== viewport.width > viewport.height) {
          viewport = sheet.getViewport({ scale: 150 / 72, rotation: (sheet.rotate + 90) % 360 });
        }
        if (viewport.width * viewport.height > 25_000_000)
          throw new Error('PDF-Seite überschreitet 25 Millionen Pixel bei 150 dpi.');
        if (retention === 'all-pages') {
          renderedPixels.set(page, viewport.width * viewport.height);
          if ([...renderedPixels.values()].reduce((sum, value) => sum + value, 0) > 100_000_000)
            throw new PdfPreviewBudgetExceeded();
        }
        canvas.dataset['widthMm'] = String((viewport.width * 25.4) / 150);
        canvas.dataset['heightMm'] = String((viewport.height * 25.4) / 150);
        canvas.width = Math.ceil(viewport.width);
        canvas.height = Math.ceil(viewport.height);
        await sheet.render({ canvas, viewport, intent: 'print' }).promise;
        sheet.cleanup();
      },
      destroy: () => task.destroy(),
    };
  } catch (error) {
    await task.destroy();
    throw error;
  }
}
@Injectable({ providedIn: 'root' })
export class PdfRendererService {
  load(bytes: Uint8Array, retention: PageRetention = 'all-pages'): Promise<PdfPages> {
    return loadPdfPages(bytes, retention);
  }
}
