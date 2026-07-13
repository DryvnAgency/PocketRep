/**
 * PocketRep — post-export web patcher. Runs as part of `npm run build:web`
 * (see package.json) right after `expo export --platform web`.
 *
 * Injects the PWA head tags (manifest, theme color, apple-* metas,
 * apple-touch-icon, viewport-fit=cover) into dist/index.html so the site is
 * installable ("Add to Home Screen") on iPhone Safari and Android Chrome.
 *
 * Why not app/+html.tsx: Expo Router only renders that shell when app.json has
 * web.output "static". This app exports "single-page" (SPA + the vercel.json
 * rewrite), where Expo emits a fixed template — so the tags are patched in
 * here, deterministically, at build time. Idempotent; fails the build loudly
 * if dist/index.html is missing.
 */

const fs = require('fs');
const path = require('path');

const file = path.join(__dirname, '..', 'dist', 'index.html');
let html = fs.readFileSync(file, 'utf8');

if (html.includes('rel="manifest"')) {
  console.log('postexport-web: PWA tags already present — nothing to do');
  process.exit(0);
}

const TAGS = [
  '<link rel="manifest" href="/manifest.json" />',
  '<meta name="theme-color" content="#0c0c0e" />',
  '<meta name="mobile-web-app-capable" content="yes" />',
  '<meta name="apple-mobile-web-app-capable" content="yes" />',
  '<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />',
  '<meta name="apple-mobile-web-app-title" content="PocketRep" />',
  '<link rel="apple-touch-icon" href="/apple-touch-icon.png" />',
  // Match the app's ink background before the bundle paints (no white flash).
  '<style>html,body{background:#0c0c0e}</style>',
].join('\n    ');

// Standalone mode should paint behind the iPhone notch.
html = html.replace('shrink-to-fit=no', 'shrink-to-fit=no, viewport-fit=cover');
html = html.replace('</head>', `    ${TAGS}\n  </head>`);

fs.writeFileSync(file, html);
console.log('postexport-web: PWA head tags injected into dist/index.html');
