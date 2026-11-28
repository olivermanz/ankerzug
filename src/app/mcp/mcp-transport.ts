import { createMcpHandler, McpServer } from '@modelcontextprotocol/server';
import { z } from 'zod';

export type McpAccessMode = 'read' | 'readWrite';

export interface McpRequest {
  id: string;
  mode: McpAccessMode;
  headers: Record<string, string>;
  body: string;
}

export interface McpResponse {
  status: number;
  contentType: string | null;
  body: string;
}

function createServer(mode: McpAccessMode): McpServer {
  const server = new McpServer({ name: 'ankerzug-mcp-poc', version: '1.0.0' });
  server.registerTool(
    'echo',
    {
      description: 'Returns the supplied value from the Ankerzug webview.',
      annotations: { readOnlyHint: true },
      inputSchema: z.object({ value: z.string() }),
    },
    ({ value }) => ({ content: [{ type: 'text', text: value }] }),
  );
  server.registerTool(
    'write_probe',
    {
      description: 'Tests write permission without modifying any data.',
      inputSchema: z.object({}),
    },
    () => {
      if (mode !== 'readWrite') {
        return {
          isError: true,
          content: [{ type: 'text', text: 'MCP access mode is read-only.' }],
        };
      }
      return { content: [{ type: 'text', text: 'Write probe accepted.' }] };
    },
  );
  return server;
}

export async function dispatchMcp(request: McpRequest): Promise<McpResponse> {
  // Rust authenticates the caller and selects the access mode for each request.
  const transport = createMcpHandler(() => createServer(request.mode));
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 4_000);
  try {
    const response = await transport.fetch(
      new Request('http://localhost/mcp', {
        method: 'POST',
        headers: request.headers,
        body: new TextEncoder().encode(request.body),
        signal: controller.signal,
      }),
    );
    const body = await response.text();
    if (controller.signal.aborted) {
      return { status: 504, contentType: null, body: 'MCP webview timed out' };
    }
    return { status: response.status, contentType: response.headers.get('content-type'), body };
  } catch {
    return controller.signal.aborted
      ? { status: 504, contentType: null, body: 'MCP webview timed out' }
      : { status: 502, contentType: null, body: 'MCP webview request failed' };
  } finally {
    clearTimeout(timer);
    await transport.close();
  }
}
