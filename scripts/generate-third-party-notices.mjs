import { existsSync, readFileSync, readdirSync, realpathSync, writeFileSync } from 'node:fs';
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

function compareText(a, b) {
  return a < b ? -1 : a > b ? 1 : 0;
}

function readTextFiles(directory, names) {
  return readdirSync(directory, { withFileTypes: true })
    .filter((entry) => entry.isFile() && names.test(entry.name))
    .map((entry) => entry.name)
    .sort(compareText)
    .map((name) => ({ name, text: normalize(readFileSync(join(directory, name), 'utf8')) }));
}

function attributionFiles(directory) {
  const licenses = readTextFiles(directory, /^(license|copying)([-_.].*)?$/i);
  if (!licenses.length) throw new Error(`No license text found in ${directory}`);
  return [...licenses, ...readTextFiles(directory, /^notice(\..*)?$/i)];
}

function resolvePackageManifest(name, packageRequire) {
  // Walk Node's lookup paths from the importing package. Reading the manifest
  // directly also works when a package's exports hide package.json.
  for (const directory of packageRequire.resolve.paths(name) ?? []) {
    const manifest = join(directory, name, 'package.json');
    if (existsSync(manifest)) return realpathSync(manifest);
  }
  throw new Error(`Missing production dependency ${name}`);
}

function javascriptComponents() {
  const pending = Object.keys(packageJson.dependencies).map((name) =>
    resolvePackageManifest(name, require),
  );
  const visited = new Set();
  const components = new Map();
  while (pending.length) {
    const manifestPath = pending.pop();
    if (visited.has(manifestPath)) continue;
    visited.add(manifestPath);
    const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
    const { name, version, license } = manifest;
    if (!license || typeof license !== 'string') {
      throw new Error(`${name}: unrecognized or missing SPDX license expression`);
    }
    const packageRequire = createRequire(manifestPath);
    for (const dependency of Object.keys(manifest.dependencies ?? {})) {
      pending.push(resolvePackageManifest(dependency, packageRequire));
    }
    const key = `${name}@${version}`;
    if (!components.has(key)) {
      components.set(key, {
        ecosystem: 'JavaScript production dependency',
        name,
        version,
        license,
        source:
          typeof manifest.repository === 'string' ? manifest.repository : manifest.repository?.url,
        files: attributionFiles(resolve(manifestPath, '..')),
      });
    }
  }
  return [...components.values()];
}

function lockedCargoVersion(name, exactVersion) {
  const block = cargoLock.split('[[package]]').find((candidate) => {
    const [, lockedName, version] =
      candidate.match(/\nname = "([^"]+)"\nversion = "([^"]+)"/) ?? [];
    return lockedName === name && (!exactVersion || version === exactVersion);
  });
  const match = block?.match(/\nversion = "([^"]+)"/);
  if (!match) throw new Error(`${name}: missing from Cargo.lock`);
  return match[1];
}

function cachedCrate(name, version) {
  const registry = join(process.env.CARGO_HOME ?? join(homedir(), '.cargo'), 'registry', 'src');
  const indexes = existsSync(registry) ? readdirSync(registry).sort(compareText) : [];
  for (const index of indexes) {
    const directory = join(registry, index, `${name}-${version}`);
    if (existsSync(join(directory, 'Cargo.toml'))) return directory;
  }
  throw new Error(
    `${name}@${version}: crate source is not cached; run cargo fetch before generating notices`,
  );
}

function rustComponents() {
  const dependencies = cargoToml.match(/\[dependencies\]([\s\S]*?)(?:\n\[|$)/)?.[1] ?? '';
  // Optional exploration tooling is absent from production builds.
  return [...dependencies.matchAll(/^([\w-]+)\s*=([^\n]*)/gm)]
    .filter((match) => !/optional\s*=\s*true/.test(match[2]))
    .map(([, name, specification]) => {
      const version = lockedCargoVersion(name, specification.match(/"=([^"]+)"/)?.[1]);
      const directory = cachedCrate(name, version);
      const manifest = readFileSync(join(directory, 'Cargo.toml'), 'utf8');
      const license = manifest.match(/^license\s*=\s*"([^"]+)"/m)?.[1];
      if (!license) throw new Error(`${name}@${version}: missing SPDX license expression`);
      return {
        ecosystem: 'Rust native dependency',
        name,
        version,
        license,
        source: `https://crates.io/crates/${name}/${version}`,
        files: attributionFiles(directory),
      };
    });
}

function sqliteComponent() {
  const version = lockedCargoVersion('libsqlite3-sys');
  const header = join(cachedCrate('libsqlite3-sys', version), 'sqlite3', 'sqlite3.h');
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
    files: [
      {
        name: 'Public domain notice',
        text: 'The SQLite source code is in the public domain.',
      },
    ],
  };
}

function formatComponent(component) {
  const source = component.source ? `\nSource: ${component.source}` : '';
  const files = component.files
    .map(({ name, text }) => `### ${name}\n\n\`\`\`text\n${text}\n\`\`\``)
    .join('\n\n');
  return `## ${component.name} ${component.version}\n\nType: ${component.ecosystem}<br>\nSPDX: ${component.license}${source}\n\n${files}`;
}

export function generateNotices() {
  const components = [...javascriptComponents(), ...rustComponents(), sqliteComponent()].sort(
    (a, b) =>
      compareText(a.name.toLowerCase(), b.name.toLowerCase()) ||
      compareText(a.name, b.name) ||
      compareText(a.version, b.version),
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
