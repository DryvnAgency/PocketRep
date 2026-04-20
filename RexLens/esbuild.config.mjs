import { build, context } from 'esbuild';
import { readFileSync, existsSync } from 'node:fs';

const isWatch = process.argv.includes('--watch');

// Load RexLens/.env into process.env if present. Keep it simple — no
// external dep. Lines like `KEY=value` only; `#` starts a comment.
function loadDotenv(path) {
  if (!existsSync(path)) return;
  const text = readFileSync(path, 'utf8');
  for (const raw of text.split('\n')) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq < 0) continue;
    const key = line.slice(0, eq).trim();
    const value = line.slice(eq + 1).trim().replace(/^['"]|['"]$/g, '');
    if (!(key in process.env)) process.env[key] = value;
  }
}

loadDotenv('.env');

const SUPABASE_URL = process.env.SUPABASE_URL || '';
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || '';

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  console.error(
    'WARNING: SUPABASE_URL / SUPABASE_ANON_KEY not set. Build will ' +
    'produce a bundle that cannot auth. Copy .env.example to .env and ' +
    'fill in values before building for release.'
  );
}

const sharedConfig = {
  bundle: true,
  sourcemap: true,
  target: 'es2020',
  format: 'esm',
  minify: !isWatch,
  define: {
    'process.env.SUPABASE_URL': JSON.stringify(SUPABASE_URL),
    'process.env.SUPABASE_ANON_KEY': JSON.stringify(SUPABASE_ANON_KEY),
  },
};

const entryPoints = [
  {
    entryPoints: ['src/background/service-worker.ts'],
    outfile: 'dist/service-worker.js',
  },
  {
    entryPoints: ['src/content/content-script.ts'],
    outfile: 'dist/content-script.js',
    format: 'iife',
  },
];

async function run() {
  for (const entry of entryPoints) {
    const config = {
      ...sharedConfig,
      ...entry,
      format: entry.format || sharedConfig.format,
    };

    if (isWatch) {
      const ctx = await context(config);
      await ctx.watch();
      console.log(`Watching ${entry.entryPoints[0]}...`);
    } else {
      await build(config);
      console.log(`Built ${entry.outfile}`);
    }
  }
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
