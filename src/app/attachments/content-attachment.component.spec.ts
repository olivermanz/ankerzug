import { ComponentFixture, TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import gameFixture from '../../../fixtures/games-package-v1.json';
import { Content } from '../models';
import { PdfRendererService } from '../pdf/pdf-viewer';
import { PlannerService } from '../planner.service';
import { newContent } from '../planning';
import { ContentAttachmentComponent } from './content-attachment.component';

describe('training content attachment dialog', () => {
  const file = gameFixture.games[0].attachments[0];
  const planner = {
    contentAttachmentBytes: vi.fn(async () => file.bytes),
    setContentAttachment: vi.fn((content: Content, selection: typeof file | null) => {
      if (selection) content.attachment = { id: 'new', filename: selection.filename };
      else delete content.attachment;
    }),
  };
  const load = vi.fn(async () => ({
    count: 2,
    render: async (_page: number, canvas: HTMLCanvasElement) => {
      canvas.dataset['widthMm'] = '210';
      canvas.dataset['heightMm'] = '297';
    },
    destroy: async () => {},
  }));
  let fixture: ComponentFixture<ContentAttachmentComponent>, content: Content;
  const host = () => fixture.nativeElement as HTMLElement;
  const button = (text: string) =>
    Array.from(host().querySelectorAll('button')).find((b) => b.textContent?.trim() === text)!;
  const settle = async () => {
    await vi.waitFor(() => expect(fixture.componentInstance.busy()).toBe(false));
    fixture.detectChanges();
  };

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [ContentAttachmentComponent],
      providers: [
        { provide: PlannerService, useValue: planner },
        { provide: PdfRendererService, useValue: { load } },
      ],
    });
    fixture = TestBed.createComponent(ContentAttachmentComponent);
    content = newContent();
    fixture.componentRef.setInput('content', content);
    fixture.detectChanges();
    const dialog = host().querySelector('dialog')!;
    dialog.showModal = () => {
      dialog.open = true;
    };
    dialog.close = () => {
      dialog.open = false;
    };
  });
  afterEach(() => {
    fixture.destroy();
    TestBed.resetTestingModule();
    vi.clearAllMocks();
  });

  function select(name: string, bytes: number[]) {
    const picker = host().querySelector('input')!;
    const data = new Uint8Array(bytes);
    Object.defineProperty(picker, 'files', {
      configurable: true,
      value: [{ name, size: data.byteLength, arrayBuffer: async () => data.buffer }],
    });
    picker.dispatchEvent(new Event('change'));
  }

  it('adds, previews, replaces and removes a PDF, retaining the original after a bad replacement', async () => {
    button('Anlage').click();
    fixture.detectChanges();
    expect(button('Anlage hinzufügen')).toBeDefined();
    expect(host().querySelector('[aria-label="Anlage vorhanden"]')).toBeNull();
    expect(planner.contentAttachmentBytes).not.toHaveBeenCalled();
    select('Anlage.pdf', file.bytes);
    await settle();
    expect(host().querySelector('[aria-label="Anlage vorhanden"]')).toBeTruthy();
    expect(button('Anlage ersetzen')).toBeDefined();
    button('Nächste Seite').click();
    await settle();
    expect(host().querySelector('canvas')?.getAttribute('aria-label')).toContain('Seite 2');
    select('defekt.pdf', [0]);
    await settle();
    expect(host().querySelector('[role=alert]')?.textContent).toContain('PDF');
    expect(content.attachment?.filename).toBe('Anlage.pdf');
    expect(host().querySelector('canvas')?.getAttribute('aria-label')).toContain('Seite 2');
    select('Ersatz.pdf', file.bytes);
    await settle();
    expect(content.attachment?.filename).toBe('Ersatz.pdf');
    button('Anlage löschen').click();
    fixture.detectChanges();
    expect(content.attachment).toBeUndefined();
    expect(host().querySelector('[aria-label="Anlage vorhanden"]')).toBeNull();
    expect(host().querySelector('canvas')).toBeNull();
  });

  it('loads only on opening and lets Escape dismiss a pending preview', async () => {
    content.attachment = { id: 'stored', filename: 'Datei.pdf' };
    fixture.detectChanges();
    let resume!: (bytes: number[]) => void;
    planner.contentAttachmentBytes.mockReturnValueOnce(
      new Promise((resolve) => {
        resume = resolve;
      }),
    );
    expect(planner.contentAttachmentBytes).not.toHaveBeenCalled();
    button('Anlage').click();
    fixture.detectChanges();
    expect(button('Schließen').disabled).toBe(false);
    host()
      .querySelector('dialog')!
      .dispatchEvent(new Event('cancel', { cancelable: true }));
    resume(file.bytes);
    await settle();
    expect(host().querySelector('dialog')!.open).toBe(false);
    expect(load).not.toHaveBeenCalled();
    expect(content.attachment.id).toBe('stored');
  });
});
