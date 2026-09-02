import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const promptsPath = resolve(here, '../src/shared/prompts.ts');
const source = readFileSync(promptsPath, 'utf8');

const bannedUnsafePatterns = [
  /repairs start stacking/i,
  /that Civic Sport holds its value/i,
  /Manufacturer incentives are expiring/i,
  /managers are more flexible on pricing, and inventory is moving/i,
  /New incentives just dropped, fresh inventory just landed/i,
  /loyalty pricing about to reset/i,
];

for (const pattern of bannedUnsafePatterns) {
  if (pattern.test(source)) {
    throw new Error(`RexLens truth rail regression: unsupported prompt pattern reintroduced: ${pattern}`);
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
