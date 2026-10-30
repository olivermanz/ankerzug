import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { basename, join, resolve } from 'node:path';
import { createRequire } from 'node:module';

const root = resolve(import.meta.dirname, '..');
const require = createRequire(import.meta.url);
const output = join(root, 'THIRD_PARTY_NOTICES.md');
const packageJson = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
const cargoToml = readFileSync(join(root, 'src-tauri', 'Cargo.toml'), 'utf8');
const cargoLock = readFileSync(join(root, 'src-tauri', 'Cargo.lock'), 'utf8');
const normalize = (value) => value.replace(/\r\n?/g, '\n').trimEnd();

function findTextFile(directory, names) {
  const entries = readdirSync(directory, { withFileTypes: true });
  const match = entries.find((entry) => entry.isFile() && names.test(entry.name));
  if (!match) throw new Error(`No license text found in ${directory}`);
  return { name: match.name, text: normalize(readFileSync(join(directory, match.name), 'utf8')) };
}

function resolvePackageManifest(name, packageRequire = require) {
  try {
    return packageRequire.resolve(`${name}/package.json`);
  } catch {
    const prefix = `${name.replace('/', '+')}@`;
    const pnpmStore = join(root, 'node_modules', '.pnpm');
    const candidate = readdirSync(pnpmStore).find((entry) => entry.startsWith(prefix));
    const manifestPath =
      candidate && join(pnpmStore, candidate, 'node_modules', name, 'package.json');
    if (!manifestPath || !existsSync(manifestPath)) throw new Error(`missing package ${name}`);
    return manifestPath;
  }
}

function javascriptComponents() {
  const pending = Object.keys(packageJson.dependencies).sort((a, b) => a.localeCompare(b));
  const visited = new Set();
  const components = [];
  while (pending.length) {
    const name = pending.shift();
    if (visited.has(name)) continue;
    visited.add(name);
    const manifestPath = resolvePackageManifest(name);
    const directory = resolve(manifestPath, '..');
    const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
    const license = manifest.license;
    if (!license || typeof license !== 'string') {
      throw new Error(`${name}: unrecognized or missing SPDX license expression`);
    }
    const licenseFile = findTextFile(directory, /^(license|copying)([-_.].*)?$/i);
    const notice = readdirSync(directory, { withFileTypes: true }).find(
      (entry) => entry.isFile() && /^notice(\..*)?$/i.test(entry.name),
    );
    const packageRequire = createRequire(manifestPath);
    for (const dependency of Object.keys(manifest.dependencies ?? {}).sort((a, b) =>
      a.localeCompare(b),
    )) {
      try {
        resolvePackageManifest(dependency, packageRequire);
        pending.push(dependency);
      } catch {
        throw new Error(`${name}@${manifest.version}: missing production dependency ${dependency}`);
      }
    }
    components.push({
      ecosystem: 'JavaScript production dependency',
      name,
      version: manifest.version,
      license,
      source:
        typeof manifest.repository === 'string' ? manifest.repository : manifest.repository?.url,
      licenseFile,
      notice: notice && {
        name: notice.name,
        text: normalize(readFileSync(join(directory, notice.name), 'utf8')),
      },
    });
  }
  return components.sort((a, b) => a.name.localeCompare(b.name));
}

function lockedCargoVersion(name) {
  const block = cargoLock
    .split('[[package]]')
    .find((candidate) => new RegExp(`^\\s*name = "${name}"`, 'm').test(candidate));
  const match = block?.match(/\nversion = "([^"]+)"/);
  if (!match) throw new Error(`${name}: missing from Cargo.lock`);
  return match[1];
}

function rustComponents() {
  const dependencies = cargoToml.match(/\[dependencies\]([\s\S]*?)(?:\n\[|$)/)?.[1] ?? '';
  // Optional exploration tooling is absent from production builds.
  return [...dependencies.matchAll(/^([\w-]+)\s*=([^\n]*)/gm)]
    .filter((match) => !/optional\s*=\s*true/.test(match[2]))
    .map((match) => match[1])
    .sort((a, b) => a.localeCompare(b))
    .map((name) => {
      const version = lockedCargoVersion(name);
      const registry = join(homedir(), '.cargo', 'registry', 'src');
      const registryIndex = existsSync(registry) ? readdirSync(registry)[0] : undefined;
      const directory = registryIndex && join(registry, registryIndex, `${name}-${version}`);
      if (!directory || !existsSync(directory)) {
        throw new Error(
          `${name}@${version}: crate source is not cached; run cargo fetch before generating notices`,
        );
      }
      const manifest = readFileSync(join(directory, 'Cargo.toml'), 'utf8');
      const license = manifest.match(/^license\s*=\s*"([^"]+)"/m)?.[1];
      if (!license) throw new Error(`${name}@${version}: missing SPDX license expression`);
      const licenseFile = findTextFile(directory, /^(license|copying)([-_.].*)?$/i);
      const notice = readdirSync(directory, { withFileTypes: true }).find(
        (entry) => entry.isFile() && /^notice(\..*)?$/i.test(entry.name),
      );
      return {
        ecosystem: 'Rust native dependency',
        name,
        version,
        license,
        source: `https://crates.io/crates/${name}/${version}`,
        licenseFile,
        notice: notice && {
          name: notice.name,
          text: normalize(readFileSync(join(directory, notice.name), 'utf8')),
        },
      };
    });
}

function sqliteComponent() {
  const version = lockedCargoVersion('libsqlite3-sys');
  const registry = join(homedir(), '.cargo', 'registry', 'src');
  const registryIndex = existsSync(registry) ? readdirSync(registry)[0] : undefined;
  const header =
    registryIndex &&
    join(registry, registryIndex, `libsqlite3-sys-${version}`, 'sqlite3', 'sqlite3.h');
  if (!header || !existsSync(header)) {
    throw new Error(`libsqlite3-sys@${version}: bundled SQLite source is not cached`);
  }
  const sqliteVersion = readFileSync(header, 'utf8').match(
    /#define SQLITE_VERSION\s+"([^"]+)"/,
  )?.[1];
  if (!sqliteVersion)
    throw new Error(`libsqlite3-sys@${version}: bundled SQLite version is not identifiable`);
  return {
    ecosystem: 'bundled native database engine via libsqlite3-sys',
    name: 'SQLite',
    version: sqliteVersion,
    license: 'LicenseRef-Public-Domain',
    source: 'https://sqlite.org/copyright.html',
    licenseFile: {
      name: 'Public domain notice',
      text: 'The SQLite source code is in the public domain.',
    },
  };
}

function formatComponent(component) {
  const source = component.source ? `\nSource: ${component.source}` : '';
  const notice = component.notice
    ? `\n\n### ${component.notice.name}\n\n\`\`\`text\n${component.notice.text}\n\`\`\``
    : '';
  return `## ${component.name} ${component.version}\n\nType: ${component.ecosystem}<br>\nSPDX: ${component.license}${source}\n\n### ${component.licenseFile.name}\n\n\`\`\`text\n${component.licenseFile.text}\n\`\`\`${notice}`;
}

export function generateNotices() {
  const components = [...javascriptComponents(), ...rustComponents(), sqliteComponent()].sort(
    (a, b) => `${a.name}@${a.version}`.localeCompare(`${b.name}@${b.version}`),
  );
  const noto = normalize(readFileSync(join(root, 'src', 'app', 'pdf', 'OFL.txt'), 'utf8'));
  return `${normalize(`
# Third-party notices

This document is generated from the locked production dependency roots by
\`pnpm licenses:generate\`. It is part of the Ankerzug release.

Ankerzug-owned material is licensed under GNU General Public License v3.0 (GPL-3.0-only).
The third-party components below retain their stated licenses; no third-party
component is licensed under GNU General Public License v3.0 (GPL-3.0-only) by this document.

The list covers production JavaScript bundles, Rust native dependencies, the
PDF.js worker, and the bundled Noto Sans font. Development-only tools are not
included unless an asset is bundled into the application.
`).trim()}\n\n${components.map(formatComponent).join('\n\n')}\n\n## Noto Sans Regular\n\nType: bundled font<br>\nSPDX: OFL-1.1<br>\nSource: https://github.com/notofonts/noto-fonts\n\n\`\`\`text\n${noto}\n\`\`\`\n`;
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(import.meta.filename)) {
  writeFileSync(output, generateNotices(), 'utf8');
  process.stdout.write(`Wrote ${basename(output)}.\n`);
}
