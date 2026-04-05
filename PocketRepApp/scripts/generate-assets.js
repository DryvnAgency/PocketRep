/**
 * PocketRep — Asset Generator
 * Generates app icon (1024x1024) and splash screen (2048x2048)
 * Run once: node scripts/generate-assets.js
 */

const { createCanvas } = require('canvas');
const fs = require('fs');
const path = require('path');

const ASSETS_DIR = path.join(__dirname, '..', 'assets');

// ── Brand ─────────────────────────────────────────────────────────────────────
const INK       = '#0c0c0e';
const GOLD      = '#d4a843';
const GOLD_LITE = '#f0c060';
const WHITE     = '#ffffff';
const SURFACE   = '#141418';

// ── Helpers ───────────────────────────────────────────────────────────────────
function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

// ── Icon — 1024 × 1024 ────────────────────────────────────────────────────────
function generateIcon() {
  const SIZE = 1024;
  const canvas = createCanvas(SIZE, SIZE);
  const ctx = canvas.getContext('2d');

  // Background
  ctx.fillStyle = INK;
  ctx.fillRect(0, 0, SIZE, SIZE);

  // Inner card
  const PAD = 80;
  ctx.fillStyle = SURFACE;
  roundRect(ctx, PAD, PAD, SIZE - PAD * 2, SIZE - PAD * 2, 80);
  ctx.fill();

  // Top gold rule
  ctx.fillStyle = GOLD;
  roundRect(ctx, PAD, PAD, SIZE - PAD * 2, 8, 4);
  ctx.fill();

  // "PR" monogram
  const cx = SIZE / 2;
  const cy = SIZE / 2 - 40;

  // Draw P
  ctx.fillStyle = GOLD;
  ctx.font = 'bold 380px Arial';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  // Gold gradient for text
  const grad = ctx.createLinearGradient(cx - 200, cy - 180, cx + 200, cy + 180);
  grad.addColorStop(0, GOLD_LITE);
  grad.addColorStop(1, GOLD);
  ctx.fillStyle = grad;
  ctx.fillText('PR', cx, cy);

  // Wordmark
  ctx.fillStyle = '#6a7080';
  ctx.font = '500 52px Arial';
  ctx.letterSpacing = '8px';
  ctx.fillText('POCKETREP', cx, cy + 230);

  // Bottom gold accent line
  ctx.fillStyle = GOLD;
  const lineW = 180;
  roundRect(ctx, cx - lineW / 2, cy + 300, lineW, 4, 2);
  ctx.fill();

  const buffer = canvas.toBuffer('image/png');
  fs.writeFileSync(path.join(ASSETS_DIR, 'icon.png'), buffer);
  console.log('✅  assets/icon.png  (1024×1024)');
}

// ── Splash — 2048 × 2048 ──────────────────────────────────────────────────────
function generateSplash() {
  const SIZE = 2048;
  const canvas = createCanvas(SIZE, SIZE);
  const ctx = canvas.getContext('2d');
  const cx = SIZE / 2;
  const cy = SIZE / 2;

  // Background
  ctx.fillStyle = INK;
  ctx.fillRect(0, 0, SIZE, SIZE);

  // Subtle radial glow behind logo
  const glow = ctx.createRadialGradient(cx, cy, 0, cx, cy, 600);
  glow.addColorStop(0, 'rgba(212,168,67,0.08)');
  glow.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, SIZE, SIZE);

  // Inner card panel
  const CARD_W = 800;
  const CARD_H = 680;
  ctx.fillStyle = SURFACE;
  roundRect(ctx, cx - CARD_W / 2, cy - CARD_H / 2 - 40, CARD_W, CARD_H, 48);
  ctx.fill();

  // Card top gold bar
  ctx.fillStyle = GOLD;
  roundRect(ctx, cx - CARD_W / 2, cy - CARD_H / 2 - 40, CARD_W, 6, 3);
  ctx.fill();

  // "PR" monogram
  const monoY = cy - 80;
  const grad = ctx.createLinearGradient(cx - 200, monoY - 200, cx + 200, monoY + 200);
  grad.addColorStop(0, GOLD_LITE);
  grad.addColorStop(1, GOLD);
  ctx.fillStyle = grad;
  ctx.font = 'bold 380px Arial';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('PR', cx, monoY);

  // Divider
  ctx.fillStyle = GOLD;
  const divW = 200;
  roundRect(ctx, cx - divW / 2, monoY + 210, divW, 3, 2);
  ctx.fill();

  // "PocketRep" wordmark
  ctx.fillStyle = WHITE;
  ctx.font = '600 72px Arial';
  ctx.fillText('PocketRep', cx, monoY + 290);

  // Tagline
  ctx.fillStyle = GOLD;
  ctx.font = '400 38px Arial';
  ctx.fillText('Your Book. Your Rep.', cx, monoY + 370);

  const buffer = canvas.toBuffer('image/png');
  fs.writeFileSync(path.join(ASSETS_DIR, 'splash.png'), buffer);
  console.log('✅  assets/splash.png  (2048×2048)');
}

// ── Run ───────────────────────────────────────────────────────────────────────
try {
  generateIcon();
  generateSplash();
  console.log('\n🎨  Assets ready in assets/');
} catch (err) {
  console.error('❌  Generation failed:', err.message);
  process.exit(1);
}
