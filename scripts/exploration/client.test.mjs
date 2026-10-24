import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { Explorer, request } from './client.mjs';

async function harness(t, respond) {
  const runDir = await mkdtemp(join(tmpdir(), 'ankerzug-explorer-'));
  const received = [];
  const server = createServer(async (req, res) => {
    let raw = '';
    for await (const chunk of req) raw += chunk;
    const entry = { method: req.method, path: req.url, body: raw ? JSON.parse(raw) : undefined };
    received.push(entry);
    const reply = /\/(enabled|displayed)$/.test(entry.path) ? { value: true } : respond(entry);
    res.writeHead(reply.status ?? 200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ value: reply.value }));
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(async () => {
    await new Promise((resolve) => server.close(resolve));
    await rm(runDir, { recursive: true, force: true });
  });
  const endpoint = `http://127.0.0.1:${server.address().port}`;
  return {
    explorer: new Explorer({ endpoint, sessionId: 'isolated', runDir }),
    endpoint,
    runDir,
    received,
  };
}

test('ambiguous controls cannot be clicked and failed driver actions retain evidence', async (t) => {
  let count = 2;
  const h = await harness(t, (entry) =>
    entry.path.endsWith('/elements')
      ? {
          value: Array.from({ length: count }, () => ({
            'element-6066-11e4-a52e-4f735466cecf': 'one',
          })),
        }
      : { status: 400, value: { error: 'element not interactable', message: 'disabled' } },
  );
  await assert.rejects(h.explorer.click('button'), /found 2/);
  assert.equal(h.received.length, 1);
  count = 1;
  await assert.rejects(h.explorer.click('button'), /disabled/);
  const entries = (await readFile(join(h.runDir, 'actions.jsonl'), 'utf8'))
    .trim()
    .split('\n')
    .map(JSON.parse);
  assert.equal(entries.at(-1).ok, false);
  assert.match(entries.at(-1).error, /disabled/);
});

test('fill uses real WebDriver element commands and preserves Unicode', async (t) => {
  const h = await harness(t, (entry) => ({
    value: entry.path.endsWith('/elements')
      ? [{ 'element-6066-11e4-a52e-4f735466cecf': 'field' }]
      : null,
  }));
  await h.explorer.fill('input', 'Übung – Spaß');
  assert.deepEqual(
    h.received.map((e) => e.path),
    [
      '/session/isolated/elements',
      '/session/isolated/element/field/enabled',
      '/session/isolated/element/field/displayed',
      '/session/isolated/element/field/clear',
      '/session/isolated/element/field/value',
    ],
  );
  assert.deepEqual(h.received.at(-1).body, { text: 'Übung – Spaß' });
});

test('save-state timeout blocks shutdown when writes are invalid or pending', async (t) => {
  const h = await harness(t, () => ({ value: 'Eingaben prüfen' }));
  await assert.rejects(h.explorer.waitSaved(20), /not saved/);
  assert.ok(h.received.every((e) => e.path.endsWith('/execute/sync')));
});

test('screenshots are decoded into the session artifacts directory', async (t) => {
  const png = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const h = await harness(t, () => ({ value: png.toString('base64') }));
  const result = await h.explorer.screenshot();
  assert.equal(result.artifact.startsWith(h.runDir), true);
  assert.deepEqual(await readFile(result.artifact), png);
});

test('protocol errors are surfaced even when returned with HTTP success', async (t) => {
  const h = await harness(t, () => ({
    value: { error: 'invalid session id', message: 'expired' },
  }));
  await assert.rejects(request(h.endpoint, 'GET', '/status'), /expired/);
});
