import { beforeEach, describe, expect, it, vi } from 'vitest';
import { loadPdfPages, PdfPreviewBudgetExceeded } from './pdf-viewer';

const pdfJs = vi.hoisted(() => ({ getDocument: vi.fn() }));
vi.mock('pdfjs-dist/legacy/build/pdf.mjs', () => ({
  ...pdfJs,
  GlobalWorkerOptions: {},
}));

describe('PDF rendering limits', () => {
  const viewport = { width: 1241, height: 1754 };
  const sheet = {
    getViewport: () => viewport,
    render: () => ({ promise: Promise.resolve() }),
    cleanup: vi.fn(),
  };
  beforeEach(() => {
    viewport.width = 1241;
    viewport.height = 1754;
    pdfJs.getDocument.mockReturnValue({
      promise: Promise.resolve({ numPages: 50, getPage: async () => sheet }),
      destroy: vi.fn(),
    });
  });

  it('renders a 50-page A4 attachment one sheet at a time while capping a retained print preview', async () => {
    const bytes = new Uint8Array(8);
    const canvas = document.createElement('canvas');
    const single = await loadPdfPages(bytes, 'single-page');
    for (let i = 1; i <= 50; i++) await single.render(i, canvas);
    await single.destroy();
    const retained = await loadPdfPages(bytes);
    for (let i = 1; i <= 45; i++) await retained.render(i, document.createElement('canvas'));
    await expect(retained.render(46, document.createElement('canvas'))).rejects.toBeInstanceOf(
      PdfPreviewBudgetExceeded,
    );
    await retained.destroy();
  });

  it('still rejects oversized pages when only one canvas is used', async () => {
    viewport.width = 5001;
    viewport.height = 5000;
    const pdf = await loadPdfPages(new Uint8Array(8), 'single-page');
    await expect(pdf.render(1, document.createElement('canvas'))).rejects.toThrow('25 Millionen');
    await pdf.destroy();
  });
});
