import { Injectable, inject, signal } from '@angular/core';
import { getVersion } from '@tauri-apps/api/app';
import { Channel, isTauri } from '@tauri-apps/api/core';
import { DataAccessService } from '../data-access.service';
import type { McpAccessMode, McpRequest } from './mcp-transport';

export interface McpSettings {
  enabled: boolean;
  mode: McpAccessMode;
  authentication: boolean;
  token: string;
}

interface McpStatus {
  settings: McpSettings;
  endpoint: string | null;
  error: string | null;
}

export function mcpError(error: unknown): string {
  return typeof error === 'object' &&
    error !== null &&
    'message' in error &&
    typeof error.message === 'string'
    ? error.message
    : 'Die MCP-Einstellungen sind nicht verfügbar.';
}

@Injectable({ providedIn: 'root' })
export class McpService {
  private readonly data = inject(DataAccessService);
  private readonly current = signal<McpStatus | null>(null);
  readonly status = this.current.asReadonly();
  private readonly startupError = signal('');
  readonly error = this.startupError.asReadonly();

  async attach(): Promise<void> {
    this.startupError.set('');
    if (!isTauri()) {
      this.startupError.set('MCP ist in der Desktop-Anwendung verfügbar.');
      return;
    }
    try {
      const { dispatchMcp } = await import('./mcp-transport');
      const channel = new Channel<McpRequest>((request) => {
        void this.respond(request, dispatchMcp);
      });
      this.current.set(await this.data.call<McpStatus>('mcp_attach', { channel }));
    } catch (error) {
      this.startupError.set(mcpError(error));
    }
  }

  private async respond(
    request: McpRequest,
    dispatch: typeof import('./mcp-transport').dispatchMcp,
  ): Promise<void> {
    const response = await dispatch(request, getVersion).catch(() => ({
      status: 502,
      contentType: null,
      body: 'MCP webview request failed',
    }));
    // A lost IPC reply is reported to the HTTP caller by the native timeout.
    await this.data.call('mcp_reply', { id: request.id, response }).catch(() => undefined);
  }

  async save(settings: McpSettings): Promise<void> {
    this.current.set(await this.data.call<McpStatus>('mcp_save', { settings }));
  }

  async rotate(): Promise<void> {
    this.current.set(await this.data.call<McpStatus>('mcp_rotate'));
  }

  copyToken(): Promise<void> {
    return this.data.call('mcp_copy');
  }
}
