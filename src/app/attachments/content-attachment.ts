import { attachmentError } from '../games/games';
import { loadPdfPages } from '../pdf/pdf-viewer';

export const CONTENT_ATTACHMENT_LIMIT = 1_000_000;

export function checkAttachmentSize(size: number): void {
  if (size > CONTENT_ATTACHMENT_LIMIT) throw new Error('Die Anlage darf höchstens 1 MB groß sein.');
  if (!size) throw new Error('Die ausgewählte PDF-Datei ist leer.');
}

// Account for rounding when PDF points are converted back to millimetres.
function withinTolerance(mm: number, target: number): boolean {
  return Math.abs(mm - target) <= 5.000001;
}

export async function validateContentAttachment(
  file: { filename: string; bytes: number[] },
  load = loadPdfPages,
): Promise<void> {
  checkAttachmentSize(file.bytes.length);
  const error = attachmentError(file);
  if (error) throw new Error(error);

  const pdf = await load(new Uint8Array(file.bytes), 'single-page');
  const canvas = document.createElement('canvas');
  try {
    for (let page = 1; page <= pdf.count; page++) {
      await pdf.render(page, canvas);
      const width = Number(canvas.dataset['widthMm']);
      const height = Number(canvas.dataset['heightMm']);
      if (
        !withinTolerance(Math.min(width, height), 210) ||
        !withinTolerance(Math.max(width, height), 297)
      ) {
        throw new Error(`Seite ${page} entspricht nicht DIN A4 (Toleranz ±5 mm).`);
      }
    }
  } finally {
    canvas.width = canvas.height = 0;
    await pdf.destroy();
  }
}
