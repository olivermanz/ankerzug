import { createMcpHandler, McpServer, type CallToolResult } from '@modelcontextprotocol/server';
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

export async function runMcpTool(
  mode: McpAccessMode,
  access: 'read' | 'write',
  run: () => Promise<CallToolResult>,
): Promise<CallToolResult> {
  if (access === 'write' && mode !== 'readWrite') {
    return {
      isError: true,
      content: [{ type: 'text', text: 'MCP access mode is read-only.' }],
    };
  }
  return run();
}

function createServer(mode: McpAccessMode, readAppVersion: () => Promise<string>): McpServer {
  const server = new McpServer({ name: 'ankerzug-mcp-poc', version: '1.0.0' });
  server.registerTool(
    'get_version',
    {
      description: 'Returns the version of the running Ankerzug desktop application.',
      annotations: { readOnlyHint: true },
      inputSchema: z.strictObject({}),
      outputSchema: z.strictObject({ version: z.string() }),
    },
    () =>
      runMcpTool(mode, 'read', async () => ({
        content: [],
        structuredContent: { version: await readAppVersion() },
      })),
  );
  return server;
}

export async function dispatchMcp(
  request: McpRequest,
  readAppVersion: () => Promise<string>,
): Promise<McpResponse> {
  // Rust authenticates the caller and selects the access mode for each request.
  const transport = createMcpHandler(() => createServer(request.mode, readAppVersion));
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
