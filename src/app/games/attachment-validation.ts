import { inject, Injectable } from '@angular/core';
import { Game } from '../models';
import { attachmentError } from './games';
import { loadPdfPages, PdfRendererService } from '../pdf/pdf-viewer';

export async function validateGamePdfs(games: Game[], load = loadPdfPages): Promise<void> {
  for (const game of games) {
    for (const attachment of game.attachments) {
      if (!attachment.bytes) continue;
      await validateGamePdf({ filename: attachment.filename, bytes: attachment.bytes }, load);
    }
  }
}

export async function validateGamePdf(
  attachment: { filename: string; bytes: number[] },
  load = loadPdfPages,
): Promise<void> {
  const error = attachmentError(attachment);
  if (error) throw new Error(error);
  try {
    const pdf = await load(new Uint8Array(attachment.bytes));
    try {
      const canvas = document.createElement('canvas');
      for (let page = 1; page <= pdf.count; page++) await pdf.render(page, canvas);
      canvas.width = canvas.height = 0;
    } finally {
      await pdf.destroy();
    }
  } catch (error) {
    throw new Error(
      `PDF „${attachment.filename}“ kann nicht vollständig geöffnet und gedruckt werden. ${(error as Error).message || ''}`,
    );
  }
}

@Injectable({ providedIn: 'root' })
export class GamePdfValidationService {
  private readonly renderer = inject(PdfRendererService);
  validateAttachment(attachment: { filename: string; bytes: number[] }): Promise<void> {
    return validateGamePdf(attachment, (bytes) => this.renderer.load(bytes));
  }
  validate(games: Game[]): Promise<void> {
    return validateGamePdfs(games, (bytes) => this.renderer.load(bytes));
  }
}
