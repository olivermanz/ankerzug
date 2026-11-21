import { describe, expect, it, vi } from 'vitest';
import fixture from '../../../fixtures/games-package-v1.json';
import {
  checkAttachmentSize,
  CONTENT_ATTACHMENT_LIMIT,
  validateContentAttachment,
} from './content-attachment';

const file = fixture.games[0].attachments[0];

function renderer(sizes: number[][]) {
  return {
    count: sizes.length,
    render: vi.fn(async (page: number, canvas: HTMLCanvasElement) => {
      const [w, h] = sizes[page - 1];
      canvas.dataset['widthMm'] = String(w);
      canvas.dataset['heightMm'] = String(h);
    }),
    destroy: vi.fn(async () => {}),
  };
}

describe('content PDF validation', () => {
  it('accepts rotated pages and both inclusive A4 size boundaries', async () => {
    const pdf = renderer([
      [205, 302],
      [292, 215],
    ]);
    await validateContentAttachment(file, async () => pdf);
    expect(pdf.render).toHaveBeenCalledTimes(2);
    expect(pdf.destroy).toHaveBeenCalledOnce();
  });

  it.each([
    [204.99, 297],
    [210, 302.01],
    [297, 216],
    [210, 210],
  ])('rejects a later non-A4 page measuring %s × %s and releases it', async (w, h) => {
    const pdf = renderer([
      [210, 297],
      [w, h],
    ]);
    await expect(validateContentAttachment(file, async () => pdf)).rejects.toThrow('Seite 2');
    expect(pdf.destroy).toHaveBeenCalledOnce();
  });

  it('rejects empty, oversized and malformed files before invoking the PDF parser', async () => {
    expect(() => checkAttachmentSize(CONTENT_ATTACHMENT_LIMIT)).not.toThrow();
    expect(() => checkAttachmentSize(CONTENT_ATTACHMENT_LIMIT + 1)).toThrow('1 MB');
    expect(() => checkAttachmentSize(0)).toThrow('leer');
    const load = vi.fn();
    await expect(
      validateContentAttachment({ ...file, filename: 'datei.txt' }, load),
    ).rejects.toThrow();
    await expect(validateContentAttachment({ ...file, bytes: [1, 2, 3] }, load)).rejects.toThrow();
    expect(load).not.toHaveBeenCalled();
  });
});
