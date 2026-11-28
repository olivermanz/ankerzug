import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { McpService, mcpError, type McpSettings } from './mcp.service';

@Component({
  selector: 'app-mcp-settings',
  imports: [FormsModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './mcp-settings.component.html',
  styles: [
    `
      .mcp-warning {
        color: #b91c1c;
        font-weight: 700;
      }
      .mcp-check {
        flex-direction: row;
        align-items: center;
        gap: 8px;
      }
      .actions {
        margin-top: 12px;
      }
    `,
  ],
})
export class McpSettingsComponent {
  protected readonly mcp = inject(McpService);
  private readonly edits = signal<Partial<McpSettings>>({});
  protected readonly draft = computed(() => {
    const status = this.mcp.status();
    return status ? { ...status.settings, ...this.edits() } : null;
  });
  protected readonly busy = signal(false);
  protected readonly error = signal('');
  protected readonly notice = signal('');

  protected edit<K extends keyof McpSettings>(key: K, value: McpSettings[K]): void {
    this.edits.update((edits) => ({ ...edits, [key]: value }));
    this.error.set('');
    this.notice.set('');
  }

  protected async save(settings: McpSettings): Promise<void> {
    await this.perform(async () => {
      await this.mcp.save(settings);
      this.edits.set({});
      if (!this.mcp.status()?.error) this.notice.set('MCP-Einstellungen gespeichert.');
    });
  }

  protected async rotate(): Promise<void> {
    await this.perform(async () => {
      await this.mcp.rotate();
      this.edits.update(({ token: _token, ...edits }) => edits);
      this.notice.set('Neuer MCP-Token gespeichert.');
    });
  }

  protected async copyToken(): Promise<void> {
    await this.perform(async () => {
      await this.mcp.copyToken();
      this.notice.set('Aktueller MCP-Token kopiert.');
    });
  }

  private async perform(action: () => Promise<void>): Promise<void> {
    if (this.busy()) return;
    this.busy.set(true);
    this.error.set('');
    this.notice.set('');
    try {
      await action();
    } catch (error) {
      this.error.set(mcpError(error));
    } finally {
      this.busy.set(false);
    }
  }
}
