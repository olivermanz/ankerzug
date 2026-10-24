import { spawn, spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { access, appendFile, mkdir, open, readFile, rm, writeFile } from 'node:fs/promises';
import { createServer } from 'node:net';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Explorer, request } from './exploration/client.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const home = join(root, '.exploration');
const stateFile = join(home, 'session.json');
const target = join(root, 'src-tauri', 'target', 'exploration');
const binary = join(target, 'debug', process.platform === 'win32' ? 'ankerzug.exe' : 'ankerzug');
const pnpm = process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm';
const [command = 'help', json = '{}'] = process.argv.slice(2);

async function portAvailable(port) {
  await new Promise((resolve, reject) => {
    const server = createServer();
    server.once('error', reject);
    server.listen(port, '127.0.0.1', () => server.close(resolve));
  });
}
async function launch(previous, options = {}) {
  const port = previous?.port ?? options.port ?? 4445;
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Invalid port');
  await portAvailable(port);
  await access(binary);
  if (process.platform === 'linux' && !process.env.DISPLAY && !process.env.WAYLAND_DISPLAY) {
    throw new Error('A graphical desktop or Xvfb display is required');
  }
  const runDir = previous?.runDir ?? join(home, 'runs', randomUUID());
  const dataDir = join(runDir, 'data');
  await mkdir(dataDir, { recursive: true });
  const log = await open(join(runDir, 'native.log'), 'a');
  const child = spawn(binary, [], {
    cwd: root,
    detached: true,
    stdio: ['ignore', log.fd, log.fd],
    env: {
      ...process.env,
      ...(process.platform === 'linux' ? { GDK_BACKEND: 'x11' } : {}),
      ANKERZUG_EXPLORATION_DIR: dataDir,
      ANKERZUG_EXPLORATION_PORT: String(port),
    },
  });
  let spawnError;
  child.on('error', (error) => {
    spawnError = error;
  });
  child.unref();
  await log.close();
  const endpoint = `http://127.0.0.1:${port}`;
  try {
    const deadline = Date.now() + 30000;
    let ready = false;
    while (Date.now() < deadline) {
      if (spawnError) throw spawnError;
      if (child.exitCode !== null || child.signalCode !== null)
        throw new Error('App exited; inspect native.log');
      try {
        await request(endpoint, 'GET', '/status', undefined, 1000);
        ready = true;
        break;
      } catch {
        await new Promise((resolve) => setTimeout(resolve, 200));
      }
    }
    if (!ready) throw new Error('WebDriver did not start within 30 seconds; inspect native.log');
    const session = await request(endpoint, 'POST', '/session', {
      capabilities: { alwaysMatch: {} },
    });
    const state = {
      runDir,
      dataDir,
      binary,
      port,
      endpoint,
      pid: child.pid,
      sessionId: session.sessionId,
      capabilities: session.capabilities,
      started: new Date().toISOString(),
    };
    await writeFile(stateFile, JSON.stringify(state, null, 2));
    await writeFile(join(runDir, 'session.json'), JSON.stringify(state, null, 2));
    const explorer = new Explorer(state);
    await explorer.log({ event: previous ? 'restart' : 'start', ...state });
    await explorer.call('POST', '/timeouts', { script: 10000 });
    // Wait until embedded assets have replaced the webview's initial blank document.
    const uiDeadline = Date.now() + 20000;
    let rendered = false;
    while (Date.now() < uiDeadline) {
      const source = await explorer.call('GET', '/source');
      if (source.includes('class="app-shell"')) {
        rendered = true;
        break;
      }
      await new Promise((resolve) => setTimeout(resolve, 150));
    }
    if (!rendered) throw new Error('Angular UI did not render; inspect native.log');
    await explorer.waitSaved(15000);
    return state;
  } catch (error) {
    child.kill();
    await rm(stateFile, { force: true });
    throw new Error(`${error.message}; artifacts: ${runDir}`, { cause: error });
  }
}
async function stop(state) {
  const explorer = new Explorer(state);
  try {
    await request(state.endpoint, 'GET', '/status', undefined, 1000);
  } catch {
    let alive = true;
    try {
      process.kill(state.pid, 0);
    } catch (error) {
      if (error.code === 'ESRCH') alive = false;
      else throw error;
    }
    if (alive)
      throw new Error(
        'Driver is unavailable but app process is still alive; inspect native.log and native windows',
      );
    await rm(stateFile, { force: true });
    return { stopped: true, runDir: state.runDir };
  }
  // WebDriver destroys windows, so flush completion must be observed before shutdown.
  await explorer.call('POST', '/window', { handle: 'main' });
  await explorer.waitSaved();
  const handles = await explorer.call('GET', '/window/handles');
  for (const handle of handles.filter((h) => h !== 'main')) {
    await explorer.call('POST', '/window', { handle });
    await explorer.call('DELETE', '/window');
  }
  await explorer.call('POST', '/window', { handle: 'main' });
  try {
    await explorer.call('DELETE', '/window');
  } catch (error) {
    // Closing the final window can terminate the HTTP server before it replies.
    if (error.cause?.code !== 'ECONNRESET' && !/fetch failed|terminated/.test(error.message))
      throw error;
  }
  const deadline = Date.now() + 5000;
  while (Date.now() < deadline) {
    try {
      await request(state.endpoint, 'GET', '/status', undefined, 500);
    } catch {
      await rm(stateFile, { force: true });
      return { stopped: true, runDir: state.runDir };
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error('Application is still running; inspect it before retrying');
}

async function main() {
  if (command === 'help')
    return {
      usage: 'pnpm explore <command> [JSON object]',
      commands: {
        build: 'Build the instrumented desktop binary with embedded production frontend assets',
        start: '{"port":4445} optional; create a fresh isolated SQLite workspace',
        info: 'Current session, native log, artifacts and data paths',
        snapshot: 'Visible text, labelled controls with CSS selectors, save state and diagnostics',
        click: '{"selector":"CSS"}',
        fill: '{"selector":"CSS","text":"value"}',
        select: '{"selector":"CSS","value":"option value or text"}',
        keys: '{"keys":["Control","a"]}',
        native:
          '{"action":"windows|focus|keys|type|screenshot|close","window":"0x...","keys":"ctrl+l","text":"..."} Linux X11 adapter',
        screenshot: 'Save a webview PNG',
        windows: 'List webview handles',
        switch: '{"handle":"main"}',
        saved: 'Wait up to 10 seconds for Lokal gespeichert',
        eval: '{"script":"return document.title;","args":[]} diagnostics; not workflow evidence',
        request:
          '{"method":"GET","path":"/window/rect","body":{}} session-relative WebDriver endpoint',
        restart:
          'Wait for saved state, destroy windows, relaunch with the same real SQLite database',
        stop: 'Wait for saved state, close app; preserve all artifacts and database',
      },
    };
  if (command === 'build') {
    const result = spawnSync(
      pnpm,
      ['desktop:build', '--debug', '--no-bundle', '--features', 'exploration', '--', '--locked'],
      {
        cwd: root,
        stdio: 'inherit',
        shell: process.platform === 'win32',
        env: { ...process.env, CARGO_TARGET_DIR: target },
      },
    );
    if (result.error) throw result.error;
    if (result.status !== 0) throw new Error(`Build failed (${result.status})`);
    return { binary };
  }
  const options = JSON.parse(json);
  if (!options || typeof options !== 'object' || Array.isArray(options))
    throw new Error('Expected a JSON object');
  await mkdir(home, { recursive: true });
  // Avoid overlapping actions, conflicting starts, or shutdown while another command is running.
  const lockPath = join(home, 'command.lock');
  const lock = await open(lockPath, 'wx').catch(() => {
    throw new Error('Another exploration command is running (command.lock)');
  });
  try {
    let state;
    try {
      state = JSON.parse(await readFile(stateFile, 'utf8'));
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }
    if (command === 'start') {
      if (state) throw new Error('A session already exists; use stop or restart');
      return await launch(undefined, options);
    }
    if (!state) throw new Error('No active session; run pnpm explore start');
    const explorer = new Explorer(state);
    await explorer.log({ command, options, time: new Date().toISOString() });
    switch (command) {
      case 'info':
        return state;
      case 'snapshot':
        return await explorer.snapshot();
      case 'screenshot':
        return await explorer.screenshot();
      case 'click':
        return await explorer.click(options.selector);
      case 'fill':
        return await explorer.fill(options.selector, options.text);
      case 'select':
        return await explorer.select(options.selector, options.value);
      case 'keys':
        return await explorer.keys(options.keys);
      case 'saved':
        return await explorer.waitSaved();
      case 'windows':
        return await explorer.call('GET', '/window/handles');
      case 'switch':
        return await explorer.call('POST', '/window', { handle: options.handle });
      case 'native': {
        if (process.platform !== 'linux')
          throw new Error(
            'The bundled native adapter requires Linux X11; see EXPLORATORY_TESTING.md',
          );
        const artifact = join(state.runDir, `native-${Date.now()}.png`);
        const result = spawnSync(
          'python3',
          [join(root, 'scripts', 'exploration', 'desktop-linux.py')],
          {
            input: JSON.stringify({ ...options, pid: state.pid, artifact }),
            encoding: 'utf8',
            timeout: 20000,
          },
        );
        if (result.error) throw result.error;
        if (result.status !== 0) throw new Error(result.stderr);
        return JSON.parse(result.stdout);
      }
      case 'eval':
        return await explorer.evaluate(options.script, options.args ?? []);
      case 'request': {
        if (!/^\/[a-zA-Z0-9_/-]*$/.test(options.path))
          throw new Error('Expected a session-relative WebDriver path');
        return await explorer.call(options.method, options.path, options.body);
      }
      case 'stop':
        return await stop(state);
      case 'restart':
        await stop(state);
        return await launch(state);
      default:
        throw new Error(`Unknown command: ${command}`);
    }
  } finally {
    await lock.close();
    await rm(lockPath, { force: true });
  }
}
try {
  console.log(JSON.stringify(await main(), null, 2));
} catch (error) {
  await appendFile(
    join(home, 'cli-errors.log'),
    `${new Date().toISOString()} ${error.stack}\n`,
  ).catch(() => {});
  console.error(error.message);
  process.exitCode = 1;
}
