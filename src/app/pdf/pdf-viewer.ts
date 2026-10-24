import { Injectable } from '@angular/core';

export interface PdfPages {
  count: number;
  render(page: number, canvas: HTMLCanvasElement): Promise<void>;
  destroy(): Promise<void>;
}

export async function loadPdfPages(bytes: Uint8Array): Promise<PdfPages> {
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
      async render(page, canvas) {
        const sheet = await pdf.getPage(page);
        const viewport = sheet.getViewport({ scale: 150 / 72 });
        if (viewport.width * viewport.height > 25_000_000)
          throw new Error('PDF-Seite überschreitet 25 Millionen Pixel bei 150 dpi.');
        renderedPixels.set(page, viewport.width * viewport.height);
        if ([...renderedPixels.values()].reduce((sum, value) => sum + value, 0) > 100_000_000)
          throw new Error('PDF überschreitet insgesamt 100 Millionen Pixel bei 150 dpi.');
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
  load(bytes: Uint8Array): Promise<PdfPages> {
    return loadPdfPages(bytes);
  }
}
