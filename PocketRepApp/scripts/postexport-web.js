/**
 * PocketRep — post-export web patcher. Runs as part of `npm run build:web`
 * right after `expo export --platform web`.
 *
 * Injects the PWA head tags and the installed-app viewport shell into
 * dist/index.html. Idempotent; fails loudly if the export template changes in a
 * way that would silently break installability.
 */

const fs = require('fs');
const path = require('path');

const file = path.join(__dirname, '..', 'dist', 'index.html');
let html = fs.readFileSync(file, 'utf8');

if (html.includes('rel="manifest"')) {
  console.log('postexport-web: PWA tags already present — nothing to do');
  process.exit(0);
}

if (!html.includes('</head>')) {
  console.error('postexport-web: FATAL — no </head> in dist/index.html (Expo template changed); refusing to ship without PWA tags.');
  process.exit(1);
}
if (!html.includes('shrink-to-fit=no')) {
  console.warn('postexport-web: warning — viewport marker missing; viewport-fit=cover not applied.');
}

const TAGS = [
  '<link rel="manifest" href="/manifest.json" />',
  '<meta name="theme-color" content="#0c0c0e" />',
  '<meta name="mobile-web-app-capable" content="yes" />',
  '<meta name="apple-mobile-web-app-capable" content="yes" />',
  '<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />',
  '<meta name="apple-mobile-web-app-title" content="PocketRep" />',
  '<link rel="apple-touch-icon" href="/apple-touch-icon.png" />',
  // Fill the real device viewport instead of inventing browser-like top/bottom
  // gutters. Safe-area padding belongs to app chrome components, not body.
  // Inputs stay >=16px to prevent iOS focus zoom; tap flash/overscroll are off.
  '<style>html,body,#root{width:100%;height:100%;min-height:100%;margin:0;padding:0;background:#0c0c0e;overflow:hidden}#root{min-height:100dvh;height:100dvh}body{overscroll-behavior:none}*{box-sizing:border-box;-webkit-tap-highlight-color:transparent}input,textarea{font-size:16px!important}@supports not (height:100dvh){#root{height:100vh;min-height:100vh}}</style>',
  '<script>if("serviceWorker" in navigator){window.addEventListener("load",function(){navigator.serviceWorker.register("/sw.js").catch(function(){})});}</script>',
].join('\n    ');

html = html.replace('shrink-to-fit=no', 'shrink-to-fit=no, viewport-fit=cover');
html = html.replace('</head>', `    ${TAGS}\n  </head>`);

fs.writeFileSync(file, html);
console.log('postexport-web: PWA head tags + dynamic viewport shell injected into dist/index.html');
