#!/usr/bin/env node
// Vercel build step for the root Pocketrep static site. Copies
// Pocketrep/ into dist/ and substitutes __SUPABASE_URL__ and
// __SUPABASE_ANON_KEY__ placeholders in every *.html file from
// process.env. Keeps real keys out of git — rotate by updating
// Vercel env vars and redeploying, never by editing source.

import { cpSync, readFileSync, writeFileSync, readdirSync, statSync, rmSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const SRC = 'Pocketrep';
const OUT = 'dist';

const SUPABASE_URL = process.env.SUPABASE_URL || '';
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || '';

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  console.error('[build] SUPABASE_URL and SUPABASE_ANON_KEY env vars are required.');
  console.error('[build] Set them in Vercel project settings before deploying.');
  process.exit(1);
}

if (existsSync(OUT)) rmSync(OUT, { recursive: true, force: true });
cpSync(SRC, OUT, { recursive: true });

function walk(dir) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) {
      walk(full);
    } else if (/\.html?$/i.test(entry)) {
      const body = readFileSync(full, 'utf8');
      const replaced = body
        .replaceAll('__SUPABASE_URL__', SUPABASE_URL)
        .replaceAll('__SUPABASE_ANON_KEY__', SUPABASE_ANON_KEY);
      if (replaced !== body) {
        writeFileSync(full, replaced);
        console.log(`[build] injected env: ${full}`);
      }
    }
  }
}

walk(OUT);
console.log(`[build] done -> ${OUT}/`);
