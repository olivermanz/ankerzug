import { GamePackage } from './games/games';
import { GameAttachment } from './models';
import { MacroCyclePackage, TemplatePackage } from './exports/exchange';
import { inject, Injectable, InjectionToken } from '@angular/core';
import { invoke } from '@tauri-apps/api/core';
import { AppError, SaveInput, Snapshot } from './models';

export type TauriInvoker = <T>(command: string, args?: Record<string, unknown>) => Promise<T>;

export const TAURI_INVOKER = new InjectionToken<TauriInvoker>('Tauri IPC invoker', {
  providedIn: 'root',
  factory: () => (command, args) => invoke(command, args),
});

@Injectable({ providedIn: 'root' })
export class DataAccessService {
  private readonly invokeTauri = inject(TAURI_INVOKER);

  loadWelcomeModalVersion(): Promise<number | null> {
    return this.call('load_welcome_modal_version');
  }
  acknowledgeWelcomeModal(version: number): Promise<number> {
    return this.call('acknowledge_welcome_modal', { version });
  }

  readGamePackage(): Promise<GamePackage | null> {
    return this.call('read_game_package');
  }
  pickGamePdfs(): Promise<Omit<GameAttachment, 'id'>[] | null> {
    return this.call('pick_game_pdfs');
  }
  savePdfViewer(): Promise<string | null> {
    return this.call('save_pdf_viewer');
  }
  readPdfViewer(): Promise<{ filename: string; bytes: number[] }> {
    return this.call('read_pdf_viewer');
  }
  printPdfViewer(): Promise<void> {
    return this.call('print_pdf_viewer');
  }
  async call<T>(command: string, args?: Record<string, unknown>): Promise<T> {
    try {
      return await this.invokeTauri<T>(command, args);
    } catch (error) {
      if (typeof error === 'object' && error !== null && 'code' in error && 'message' in error)
        throw error;
      throw {
        code: 'storage',
        message:
          typeof error === 'string'
            ? error
            : 'Lokale Speicherung nicht erreichbar. Bitte Ankerzug als Desktop-Anwendung starten.',
      } satisfies AppError;
    }
  }
  readTemplatePackage(): Promise<TemplatePackage | null> {
    return this.call('read_template_package');
  }
  readMacroCyclePackage(): Promise<MacroCyclePackage | null> {
    return this.call('read_macrocycle_package');
  }
  validateMacroCyclePackage(contents: string): Promise<MacroCyclePackage> {
    return this.call('validate_macrocycle_package', { contents });
  }
  exportPlanFile(
    format: 'games' | 'templates' | 'package' | 'markdown' | 'csv' | 'ics' | 'pdf',
    filename: string,
    bytes: number[],
  ): Promise<string | null> {
    return this.call('export_plan_file', { format, filename, bytes });
  }
  exportSessionPdf(filename: string, bytes: number[]): Promise<void> {
    return this.call('export_session_pdf', { filename, bytes });
  }
  readGameAttachments(ids: string[]): Promise<Array<{ id: string; bytes: number[] }>> {
    return this.call('read_game_attachments', { ids });
  }
  load(): Promise<Snapshot> {
    return this.call('load_workspace');
  }
  save(input: SaveInput): Promise<Snapshot> {
    return this.call('save_workspace', { input });
  }
  recover(expectedRevision: number): Promise<Snapshot> {
    return this.call('recover_previous', { expectedRevision });
  }
  backup(): Promise<string | null> {
    return this.call('create_backup');
  }
  restore(contents: string, expectedRevision: number): Promise<Snapshot> {
    return this.call('restore_backup', { contents, expectedRevision });
  }
}
