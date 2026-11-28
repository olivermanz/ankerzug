import { describe, expect, it } from 'vitest';
import { dispatchMcp, type McpAccessMode } from './mcp-transport';

const headers = {
  'content-type': 'application/json',
  accept: 'application/json, text/event-stream',
};

function rpc(method: string, params?: object, mode: McpAccessMode = 'read', id: number | null = 1) {
  return dispatchMcp({
    id: 'ipc',
    mode,
    headers,
    body: JSON.stringify({ jsonrpc: '2.0', ...(id !== null && { id }), method, params }),
  });
}

function message(response: Awaited<ReturnType<typeof rpc>>) {
  expect(response.status).toBe(200);
  const payload = response.contentType?.startsWith('text/event-stream')
    ? response.body
        .split('\n')
        .reverse()
        .find((line) => line.startsWith('data: '))
        ?.slice(6)
    : response.body;
  return JSON.parse(payload!);
}

describe('MCP webview dispatcher', () => {
  it('initializes and discovers the technical tools using stateless Streamable HTTP', async () => {
    const initialize = await rpc('initialize', {
      protocolVersion: '2025-11-25',
      capabilities: {},
      clientInfo: { name: 'test', version: '1' },
    });
    expect(message(initialize).result.serverInfo.name).toBe('ankerzug-mcp-poc');
    expect((await rpc('notifications/initialized', {}, 'read', null)).status).toBe(202);
    expect(
      message(await rpc('tools/list')).result.tools.map((tool: { name: string }) => tool.name),
    ).toEqual(['echo', 'write_probe']);
  });

  it('supports per-request discovery with the 2026-07-28 envelope', async () => {
    const revision = '2026-07-28';
    const response = await dispatchMcp({
      id: 'ipc',
      mode: 'read',
      headers: { ...headers, 'mcp-protocol-version': revision, 'mcp-method': 'server/discover' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'server/discover',
        params: {
          _meta: {
            'io.modelcontextprotocol/protocolVersion': revision,
            'io.modelcontextprotocol/clientCapabilities': {},
            'io.modelcontextprotocol/clientInfo': { name: 'test', version: '1' },
          },
        },
      }),
    });
    expect(message(response).result.supportedVersions).toContain(revision);
  });

  it('echoes independent unicode values and checks write permissions', async () => {
    const operations = ['Grüße 🎯', 'zweiter Aufruf'].map(async (value, id) => {
      const reply = message(
        await rpc('tools/call', { name: 'echo', arguments: { value } }, 'read', id),
      );
      expect(reply).toMatchObject({ id, result: { content: [{ type: 'text', text: value }] } });
    });
    await Promise.all(operations);
    expect(message(await rpc('tools/call', { name: 'write_probe' })).result.isError).toBe(true);
    expect(
      message(await rpc('tools/call', { name: 'write_probe' }, 'readWrite')).result.content,
    ).toEqual([{ type: 'text', text: 'Write probe accepted.' }]);
  });

  it('returns defined protocol errors for malformed requests', async () => {
    const result = await dispatchMcp({ id: 'ipc', mode: 'read', headers, body: '{' });
    expect(result.status).toBe(400);
    expect(JSON.parse(result.body).error.code).toBe(-32700);
  });
});
