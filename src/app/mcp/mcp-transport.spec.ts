import { describe, expect, it, vi } from 'vitest';
import { dispatchMcp, runMcpTool, type McpAccessMode } from './mcp-transport';

const headers = {
  'content-type': 'application/json',
  accept: 'application/json, text/event-stream',
};

const readVersion = async () => '7.12.9-test';

function rpc(
  method: string,
  params?: object,
  mode: McpAccessMode = 'read',
  id: number | null = 1,
  readAppVersion = readVersion,
) {
  return dispatchMcp(
    {
      id: 'ipc',
      mode,
      headers,
      body: JSON.stringify({ jsonrpc: '2.0', ...(id !== null && { id }), method, params }),
    },
    readAppVersion,
  );
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
  it('initializes and advertises only the parameterless version tool in both modes', async () => {
    const initialize = await rpc('initialize', {
      protocolVersion: '2025-11-25',
      capabilities: {},
      clientInfo: { name: 'test', version: '1' },
    });
    expect(message(initialize).result.serverInfo.name).toBe('ankerzug-mcp-poc');
    expect((await rpc('notifications/initialized', {}, 'read', null)).status).toBe(202);
    for (const mode of ['read', 'readWrite'] as const) {
      expect(message(await rpc('tools/list', {}, mode)).result.tools).toEqual([
        expect.objectContaining({
          name: 'get_version',
          inputSchema: expect.objectContaining({ properties: {}, additionalProperties: false }),
        }),
      ]);
    }
  });

  it('supports per-request discovery with the 2026-07-28 envelope', async () => {
    const revision = '2026-07-28';
    const response = await dispatchMcp(
      {
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
      },
      readVersion,
    );
    expect(message(response).result.supportedVersions).toContain(revision);
  });

  it('returns only the runtime version for parallel parameterless calls in both modes', async () => {
    const modes = ['read', 'readWrite'] as const;
    await Promise.all(
      modes.map(async (mode, id) => {
        const getVersion = vi.fn(async () => `7.12.${id}-test`);
        const reply = message(
          await rpc('tools/call', { name: 'get_version' }, mode, id, getVersion),
        );
        expect(reply.id).toBe(id);
        expect(reply.result.content).toEqual([]);
        expect(reply.result.structuredContent).toEqual({ version: `7.12.${id}-test` });
        expect(getVersion).toHaveBeenCalledOnce();
      }),
    );
  });

  it('rejects unexpected arguments and calls to unregistered tools', async () => {
    const getVersion = vi.fn(readVersion);
    for (const input of [
      { name: 'get_version', arguments: { unexpected: true } },
      { name: 'echo' },
      { name: 'write_probe' },
    ]) {
      const reply = message(await rpc('tools/call', input, 'readWrite', 1, getVersion));
      expect(reply.result?.isError ?? Boolean(reply.error)).toBe(true);
    }
    expect(getVersion).not.toHaveBeenCalled();
  });

  it('enforces write permissions with an internal handler double', async () => {
    const write = vi.fn(async () => ({ content: [] }));
    expect(await runMcpTool('read', 'write', write)).toMatchObject({ isError: true });
    expect(write).not.toHaveBeenCalled();
    expect(await runMcpTool('readWrite', 'write', write)).toEqual({ content: [] });
    expect(write).toHaveBeenCalledOnce();
  });

  it('returns defined protocol errors for malformed requests', async () => {
    const result = await dispatchMcp({ id: 'ipc', mode: 'read', headers, body: '{' }, readVersion);
    expect(result.status).toBe(400);
    expect(JSON.parse(result.body).error.code).toBe(-32700);
  });
});
