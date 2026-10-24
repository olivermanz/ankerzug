// Infrastructure acceptance: exercise real UI -> IPC -> SQLite -> process restart.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
const native = process.argv.includes('--native');
if (native && process.platform !== 'linux')
  throw new Error('--native requires the Linux desktop adapter');
const cli = fileURLToPath(new URL('../explore.mjs', import.meta.url));
function run(command, options = {}) {
  const result = spawnSync(process.execPath, [cli, command, JSON.stringify(options)], {
    encoding: 'utf8',
  });
  if (result.status !== 0) throw new Error(result.stderr || result.stdout);
  return JSON.parse(result.stdout);
}
const find = (snapshot, tag, label) => {
  const controls = snapshot.controls.filter((c) => c.tag === tag && c.label?.trim() === label);
  assert.equal(controls.length, 1, `Expected one ${tag} with label ${label}`);
  return controls[0].selector;
};
try {
  const session = run('start');
  let snapshot = run('snapshot');
  assert.equal(snapshot.diagnostics.length, 0);
  run('click', { selector: find(snapshot, 'button', '＋ Makrozyklus erstellen') });
  snapshot = run('snapshot');
  const name = `AI exploration smoke ${new Date().toISOString()}`;
  const nameSelector = find(snapshot, 'input', 'Name des Makrozyklus *');
  run('fill', { selector: nameSelector, text: name });
  run('fill', {
    selector: find(snapshot, 'input', 'Name des Wettkampfs *'),
    text: 'AI smoke Hauptwettkampf',
  });
  run('keys', { keys: 'Tab' });
  snapshot = run('snapshot');
  run('click', { selector: find(snapshot, 'button', 'Makrozyklus anlegen →') });
  run('saved');
  const before = run('snapshot');
  assert.ok(before.text.includes(name));
  assert.ok(
    !before.controls.some((c) => c.label?.trim() === 'Makrozyklus anlegen →'),
    'Draft must be committed',
  );
  run('screenshot');
  run('restart');
  snapshot = run('snapshot');
  assert.ok(snapshot.text.includes(name), 'Macrocycle must survive a native process restart');
  assert.equal(snapshot.diagnostics.length, 0);
  run('screenshot');
  if (native) {
    const backupButton = find(snapshot, 'button', 'Backup erstellen');
    async function dialog() {
      const deadline = Date.now() + 10000;
      while (Date.now() < deadline) {
        const found = run('native', { action: 'windows' }).windows.find((w) =>
          w.title.includes('Backup speichern unter'),
        );
        if (found) return found.id;
        await new Promise((resolve) => setTimeout(resolve, 150));
      }
      throw new Error('Native backup dialog did not appear');
    }
    run('click', { selector: backupButton });
    let window = await dialog();
    run('native', { action: 'screenshot', window });
    run('native', { action: 'keys', window, keys: 'Escape' });
    assert.ok(
      !run('native', { action: 'windows' }).windows.some((w) =>
        w.title.includes('Backup speichern unter'),
      ),
    );
    run('click', { selector: backupButton });
    window = await dialog();
    const path = join(session.runDir, 'smoke-backup.json');
    run('native', { action: 'keys', window, keys: 'ctrl+a' });
    run('native', { action: 'type', window, text: path });
    run('native', { action: 'screenshot', window });
    run('native', { action: 'keys', window, keys: 'Return' });
    let backup;
    const deadline = Date.now() + 5000;
    while (Date.now() < deadline) {
      try {
        backup = JSON.parse(await readFile(path, 'utf8'));
        break;
      } catch {
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
    }
    assert.equal(backup?.formatVersion, 2);
    assert.ok(backup.workspace.cycles.some((c) => c.name === name));
    const main = run('native', { action: 'windows' }).windows.find((w) =>
      w.title.includes('Trainingsplanung'),
    );
    run('native', { action: 'close', window: main.id });
    await new Promise((resolve) => setTimeout(resolve, 500));
    run('restart');
    assert.ok(
      run('snapshot').text.includes(name),
      'Cycle must survive real window-manager closure',
    );
  }
  run('stop');
  console.log(
    JSON.stringify({ passed: true, nativeDialogs: native, evidence: session.runDir }, null, 2),
  );
} catch (error) {
  console.error(
    'Native smoke failed; evidence is retained. Use explore info to inspect an active session.',
  );
  console.error(error.message);
  process.exitCode = 1;
}
