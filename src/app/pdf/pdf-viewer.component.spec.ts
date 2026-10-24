import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DataAccessService } from '../data-access.service';
import { PdfViewerComponent } from './pdf-viewer.component';
import { PdfRendererService } from './pdf-viewer';

const mocks = { load: vi.fn() };

describe('PDF viewer printing', () => {
  const read = vi.fn();
  const save = vi.fn();
  const printPdfViewer = vi.fn();
  const render = vi.fn();
  const destroy = vi.fn();
  beforeEach(() => {
    vi.clearAllMocks();
    save.mockResolvedValue(null);
    printPdfViewer.mockResolvedValue(undefined);
    read.mockResolvedValue({ filename: 'Training.pdf', bytes: [37, 80, 68, 70] });
    render.mockResolvedValue(undefined);
    destroy.mockResolvedValue(undefined);
    mocks.load.mockResolvedValue({ count: 2, render, destroy });
    TestBed.configureTestingModule({
      imports: [PdfViewerComponent],
      providers: [
        {
          provide: DataAccessService,
          useValue: { readPdfViewer: read, savePdfViewer: save, printPdfViewer },
        },
        { provide: PdfRendererService, useValue: mocks },
      ],
    });
  });

  it('prints every rendered page through the native viewer command and Ctrl/Cmd+P, only after loading completes', async () => {
    let finish!: () => void;
    render.mockImplementationOnce(() => new Promise<void>((resolve) => (finish = resolve)));
    const fixture = TestBed.createComponent(PdfViewerComponent);
    fixture.detectChanges();
    await vi.waitFor(() => expect(render).toHaveBeenCalledTimes(1));
    const button: HTMLButtonElement = fixture.nativeElement.querySelector('button.primary');
    expect(button.disabled).toBe(true);
    await fixture.componentInstance.print();
    expect(printPdfViewer).not.toHaveBeenCalled();
    finish();
    await vi.waitFor(() => expect(fixture.componentInstance.ready()).toBe(true));
    fixture.detectChanges();
    expect(mocks.load).toHaveBeenCalledWith(new Uint8Array([37, 80, 68, 70]));
    expect(render.mock.calls.map(([page]) => page)).toEqual([1, 2]);
    expect(fixture.nativeElement.querySelectorAll('.pdf-page canvas')).toHaveLength(2);
    expect(fixture.nativeElement.textContent).toContain('2 Seiten');
    button.click();
    await vi.waitFor(() => expect(printPdfViewer).toHaveBeenCalledTimes(1));
    for (const [index, modifier] of ['ctrlKey', 'metaKey'].entries()) {
      const event = new KeyboardEvent('keydown', { key: 'p', [modifier]: true, cancelable: true });
      window.dispatchEvent(event);
      expect(event.defaultPrevented).toBe(true);
      await vi.waitFor(() => expect(printPdfViewer).toHaveBeenCalledTimes(index + 2));
    }
    fixture.destroy();
    expect(destroy).toHaveBeenCalledTimes(1);
  });

  it('disables printing and removes partial pages after a rendering failure', async () => {
    render.mockRejectedValueOnce(new Error('Ungültige PDF-Seite'));
    const fixture = TestBed.createComponent(PdfViewerComponent);
    fixture.detectChanges();
    await vi.waitFor(() =>
      expect(fixture.componentInstance.error()).toContain('Ungültige PDF-Seite'),
    );
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('button.primary').disabled).toBe(true);
    expect(fixture.nativeElement.querySelectorAll('canvas')).toHaveLength(0);
    expect(fixture.nativeElement.querySelector('[role="alert"]').textContent).toContain(
      'PDF-Export erneut starten',
    );
    fixture.destroy();
    expect(destroy).toHaveBeenCalledTimes(1);
  });

  it('surfaces transport errors without loading a document', async () => {
    read.mockRejectedValueOnce({ code: 'invalidInput', message: 'Kein PDF für dieses Fenster' });
    const fixture = TestBed.createComponent(PdfViewerComponent);
    fixture.detectChanges();
    await vi.waitFor(() => expect(fixture.componentInstance.error()).toContain('Kein PDF'));
    expect(mocks.load).not.toHaveBeenCalled();
    expect(fixture.componentInstance.ready()).toBe(false);
    fixture.destroy();
  });

  it('saves only on request and keeps the viewer printable after cancellation or failure', async () => {
    const fixture = TestBed.createComponent(PdfViewerComponent);
    fixture.detectChanges();
    await vi.waitFor(() => expect(fixture.componentInstance.ready()).toBe(true));
    expect(save).not.toHaveBeenCalled();
    await fixture.componentInstance.save();
    expect(fixture.componentInstance.message()).toBe('Speichern abgebrochen.');
    save.mockResolvedValueOnce('Training.pdf');
    await fixture.componentInstance.save();
    expect(fixture.componentInstance.message()).toBe('PDF gespeichert: Training.pdf');
    save.mockRejectedValueOnce({ code: 'storage', message: 'Kein Schreibzugriff' });
    await fixture.componentInstance.save();
    expect(fixture.componentInstance.message()).toBe('Kein Schreibzugriff');
    expect(fixture.componentInstance.ready()).toBe(true);
    expect(fixture.componentInstance.saving()).toBe(false);
    expect(fixture.nativeElement.querySelectorAll('canvas')).toHaveLength(2);
    fixture.destroy();
  });
});
