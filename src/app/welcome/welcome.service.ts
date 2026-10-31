import { inject, Injectable, signal } from '@angular/core';
import { DataAccessService } from '../data-access.service';

/** Increment when changed welcome content should be shown again. Independent of app/data versions. */
export const WELCOME_MODAL_VERSION = 1;

@Injectable({ providedIn: 'root' })
export class WelcomeService {
  private readonly access = inject(DataAccessService);
  readonly visible = signal(false);
  readonly busy = signal(false);
  readonly error = signal('');
  private initialized = false;
  private pendingAcknowledgement = false;

  async initialize(): Promise<void> {
    if (this.initialized || this.busy()) return;
    this.busy.set(true);
    this.error.set('');
    try {
      const version = await this.access.loadWelcomeModalVersion();
      this.visible.set(version === null || version < WELCOME_MODAL_VERSION);
      this.initialized = true;
    } catch {
      this.error.set('Der Willkommenshinweis konnte nicht geladen werden.');
    } finally {
      this.busy.set(false);
    }
  }

  async dismiss(): Promise<void> {
    this.visible.set(false);
    this.pendingAcknowledgement = true;
    await this.retry();
  }

  async retry(): Promise<void> {
    if (this.busy()) return;
    if (!this.pendingAcknowledgement) return this.initialize();
    this.busy.set(true);
    this.error.set('');
    try {
      await this.access.acknowledgeWelcomeModal(WELCOME_MODAL_VERSION);
      this.pendingAcknowledgement = false;
    } catch {
      this.error.set(
        'Der geschlossene Willkommenshinweis konnte nicht gespeichert werden. Beim nächsten Start kann er erneut erscheinen.',
      );
    } finally {
      this.busy.set(false);
    }
  }
}
