import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { generateNotices } from './generate-third-party-notices.mjs';

const root = resolve(import.meta.dirname, '..');
const committed = readFileSync(resolve(root, 'THIRD_PARTY_NOTICES.md'), 'utf8');
const generated = generateNotices();
if (committed !== generated) {
  throw new Error(
    'THIRD_PARTY_NOTICES.md is stale or incomplete. Run pnpm licenses:generate and review the result.',
  );
}
process.stdout.write('Third-party notices match the locked production dependency roots.\n');
