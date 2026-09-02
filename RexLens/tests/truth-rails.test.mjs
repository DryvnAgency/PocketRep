import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const promptsPath = resolve(here, '../src/shared/prompts.ts');
const source = readFileSync(promptsPath, 'utf8');

const bannedUnconditionalClaims = [
  'repairs start stacking',
  'holds its value',
  'incentives are expiring',
  'managers are more flexible on pricing',
  'fresh incentives just dropped',
  'fresh inventory just landed',
  'inventory is moving',
  'loyalty pricing about to reset',
];

for (const phrase of bannedUnconditionalClaims) {
  if (source.toLowerCase().includes(phrase.toLowerCase())) {
    throw new Error(`RexLens truth rail regression: unsupported claim reintroduced: ${phrase}`);
  }
}

const requiredRails = [
  'Specific incentives, sales, inventory movement, pricing flexibility, loyalty offers, rebates, expiration dates, repair predictions, and resale-value claims require explicit CRM or rep-provided evidence.',
  'Do not claim incentives are expiring, managers are more flexible, or inventory is moving unless the task context explicitly says so.',
  'Call it a sale or event only when the CRM or rep-provided context confirms one.',
];

for (const rail of requiredRails) {
  if (!source.includes(rail)) {
    throw new Error(`RexLens truth rail missing: ${rail}`);
  }
}

console.log('RexLens truth rails OK');
