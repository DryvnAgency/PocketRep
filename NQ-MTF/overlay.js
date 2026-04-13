// NQ-MTF v3.4 — ISOLATED world overlay script
// 3-layer context guard + postMessage bridge + Shadow DOM overlay

(() => {
  'use strict';

  // ═══════════════════════════════════════════════════════════
  // LAYER 1 — CONTEXT_VALID flag
  // Single boolean. Once false, no chrome.* call is ever attempted.
  // ═══════════════════════════════════════════════════════════
  let CONTEXT_VALID = true;

  // ═══════════════════════════════════════════════════════════
  // LAYER 3 — checkContext()
  // Checks chrome.runtime.id (a property access that throws
  // synchronously when the context is dead). Wraps at the CALL
  // SITE — not in callbacks. This is where the fix lives.
  // ═══════════════════════════════════════════════════════════
  function checkContext() {
    if (!CONTEXT_VALID) return false;
    try {
      void chrome.runtime.id;
      return true;
    } catch (e) {
      CONTEXT_VALID = false;
      console.warn('[NQ-MTF] Context invalidated \u2014 going silent.');
      return false;
    }
  }

  // ═══════════════════════════════════════════════════════════
  // LAYER 2 — safeInterval()
  // Replaces all setInterval calls. Checks CONTEXT_VALID before
  // every tick. Auto-clears when context dies. The intervals
  // literally stop running.
  // ═══════════════════════════════════════════════════════════
  const _intervals = [];

  function safeInterval(fn, ms) {
    const id = setInterval(() => {
      if (!CONTEXT_VALID) {
        clearInterval(id);
        return;
      }
      try {
        fn();
      } catch (e) {
        if (String(e).includes('Extension context invalidated')) {
          CONTEXT_VALID = false;
          clearInterval(id);
          console.warn('[NQ-MTF] Context died \u2014 cleared interval.');
        }
      }
    }, ms);
    _intervals.push(id);
    return id;
  }

  // ═══════════════════════════════════════════════════════════
  // safeSend() — Only function that ever calls chrome.runtime
  // ═══════════════════════════════════════════════════════════
  function safeSend(message) {
    if (!checkContext()) return;
    try {
      chrome.runtime.sendMessage(message).catch(() => {
        CONTEXT_VALID = false;
      });
    } catch (e) {
      CONTEXT_VALID = false;
    }
  }

  // ═══════════════════════════════════════════════════════════
  // Data Mirror (ISOLATED world can't see MAIN world globals)
  // Populated exclusively via postMessage from content.js
  // ═══════════════════════════════════════════════════════════
  const overlayData = {
    nq: { price: null, bid: null, ask: null, volume: null, timestamp: null },
    candles: {
      '1m': [], '5m': [], '15m': [],
      '1h': [], '4h': [], '1d': [],
    },
    eventCount: 0,
    lastUpdate: null,
  };

  const MAX_CANDLES = 100;

  // ─── PostMessage Listener ─────────────────────────────────
  window.addEventListener('message', (e) => {
    if (!e.data || e.data.source !== 'NQ_MTF') return;

    const { type, payload } = e.data;

    if (type === 'NQ_PRICE' && payload) {
      overlayData.nq.price = payload.price;
      overlayData.nq.bid = payload.bid;
      overlayData.nq.ask = payload.ask;
      overlayData.nq.volume = payload.volume;
      overlayData.nq.timestamp = payload.timestamp;
      overlayData.lastUpdate = Date.now();
    }

    if (type === 'NQ_CANDLE' && payload) {
      const tf = payload.tf;
      if (overlayData.candles[tf]) {
        overlayData.candles[tf].push(payload.candle);
        if (overlayData.candles[tf].length > MAX_CANDLES) {
          overlayData.candles[tf].shift();
        }
        overlayData.lastUpdate = Date.now();
      }
    }

    if (type === 'WS_EVENT') {
      overlayData.eventCount++;
    }

    // Forward to background
    safeSend({ type: 'WS_DATA', payload: e.data });
  });

  // ═══════════════════════════════════════════════════════════
  // Overlay CSS (embedded for Shadow DOM isolation)
  // ═══════════════════════════════════════════════════════════
  const OVERLAY_CSS = `
    :host {
      all: initial;
    }
    * {
      box-sizing: border-box;
      margin: 0;
      padding: 0;
    }
    #nq-mtf-panel {
      position: fixed;
      top: 20px;
      right: 20px;
      width: 320px;
      background: rgba(13, 17, 23, 0.94);
      border: 1px solid #30363d;
      border-radius: 8px;
      z-index: 2147483646;
      font-family: 'Consolas', 'Monaco', 'Courier New', monospace;
      font-size: 12px;
      color: #e6edf3;
      backdrop-filter: blur(8px);
      box-shadow: 0 8px 32px rgba(0, 0, 0, 0.4);
      user-select: none;
      overflow: hidden;
    }
    #nq-mtf-panel.minimized #nq-body {
      display: none;
    }

    /* Title Bar */
    #nq-title-bar {
      display: flex;
      align-items: center;
      padding: 8px 12px;
      background: rgba(22, 27, 34, 0.9);
      border-bottom: 1px solid #30363d;
      cursor: grab;
    }
    #nq-title-bar:active {
      cursor: grabbing;
    }
    .nq-logo {
      font-weight: bold;
      font-size: 13px;
      color: #58a6ff;
      margin-right: 8px;
    }
    .nq-version {
      font-size: 10px;
      color: #484f58;
      margin-right: auto;
    }
    #nq-status {
      font-size: 10px;
      color: #8b949e;
      margin-right: 8px;
    }
    #nq-status.live {
      color: #3fb950;
    }
    .nq-btn {
      background: none;
      border: none;
      color: #8b949e;
      font-size: 14px;
      cursor: pointer;
      padding: 0 4px;
      line-height: 1;
    }
    .nq-btn:hover {
      color: #e6edf3;
    }

    /* Price Hero */
    #nq-price-hero {
      padding: 12px;
      text-align: center;
      border-bottom: 1px solid #21262d;
    }
    #nq-price {
      font-size: 28px;
      font-weight: bold;
      color: #e6edf3;
      display: block;
      letter-spacing: 1px;
    }
    #nq-change {
      font-size: 13px;
      display: block;
      margin-top: 2px;
    }
    #nq-bid-ask {
      display: flex;
      justify-content: center;
      gap: 16px;
      margin-top: 6px;
      font-size: 11px;
      color: #8b949e;
    }

    /* Timeframe Grid */
    #nq-tf-grid {
      padding: 8px 0;
    }
    .nq-tf-row {
      display: flex;
      align-items: center;
      padding: 4px 12px;
    }
    .nq-tf-row:hover {
      background: rgba(48, 54, 61, 0.4);
    }
    .nq-tf-label {
      width: 32px;
      font-weight: bold;
      color: #58a6ff;
      font-size: 11px;
    }
    .nq-tf-ohlc {
      flex: 1;
      font-size: 11px;
      color: #c9d1d9;
      text-align: center;
    }
    .nq-tf-dir {
      width: 20px;
      text-align: right;
      font-size: 12px;
    }

    /* Direction Colors */
    .up { color: #3fb950; }
    .down { color: #f85149; }
    .neutral { color: #8b949e; }

    /* Footer */
    #nq-footer {
      display: flex;
      justify-content: space-between;
      padding: 6px 12px;
      border-top: 1px solid #21262d;
      font-size: 10px;
      color: #484f58;
    }
  `;

  // ═══════════════════════════════════════════════════════════
  // Overlay DOM
  // ═══════════════════════════════════════════════════════════
  const TIMEFRAMES = ['1m', '5m', '15m', '1h', '4h', '1d'];

  function buildPanelHTML() {
    const tfRows = TIMEFRAMES.map(tf =>
      `<div class="nq-tf-row" data-tf="${tf}">
        <span class="nq-tf-label">${tf}</span>
        <span class="nq-tf-ohlc">-- / -- / -- / --</span>
        <span class="nq-tf-dir neutral">\u25CF</span>
      </div>`
    ).join('');

    return `
      <div id="nq-title-bar">
        <span class="nq-logo">NQ-MTF</span>
        <span class="nq-version">v3.4</span>
        <span id="nq-status">Waiting\u2026</span>
        <button class="nq-btn" id="nq-minimize" title="Minimize">_</button>
        <button class="nq-btn" id="nq-close" title="Close">\u00D7</button>
      </div>
      <div id="nq-body">
        <div id="nq-price-hero">
          <span id="nq-price">--</span>
          <span id="nq-change" class="neutral">0.00</span>
          <div id="nq-bid-ask">
            <span>B: <span id="nq-bid">--</span></span>
            <span>A: <span id="nq-ask">--</span></span>
          </div>
        </div>
        <div id="nq-tf-grid">${tfRows}</div>
        <div id="nq-footer">
          <span id="nq-last-update">Last: --</span>
          <span id="nq-event-count">Events: 0</span>
        </div>
      </div>
    `;
  }

  function createOverlay() {
    const host = document.createElement('div');
    host.id = 'nq-mtf-host';
    document.documentElement.appendChild(host);

    const shadow = host.attachShadow({ mode: 'open' });

    const style = document.createElement('style');
    style.textContent = OVERLAY_CSS;
    shadow.appendChild(style);

    const panel = document.createElement('div');
    panel.id = 'nq-mtf-panel';
    panel.innerHTML = buildPanelHTML();
    shadow.appendChild(panel);

    // ─── Minimize / Close ──────────────────────────────────
    shadow.getElementById('nq-minimize').addEventListener('click', () => {
      panel.classList.toggle('minimized');
    });

    shadow.getElementById('nq-close').addEventListener('click', () => {
      host.style.display = 'none';
    });

    // ─── Draggable ─────────────────────────────────────────
    makeDraggable(panel, shadow);

    return shadow;
  }

  function makeDraggable(panel, shadow) {
    const titleBar = shadow.getElementById('nq-title-bar');
    let isDragging = false;
    let offsetX = 0;
    let offsetY = 0;

    titleBar.addEventListener('mousedown', (e) => {
      if (e.target.classList.contains('nq-btn')) return;
      isDragging = true;
      offsetX = e.clientX - panel.getBoundingClientRect().left;
      offsetY = e.clientY - panel.getBoundingClientRect().top;
      panel.style.transition = 'none';
    });

    document.addEventListener('mousemove', (e) => {
      if (!isDragging) return;
      panel.style.left = (e.clientX - offsetX) + 'px';
      panel.style.top = (e.clientY - offsetY) + 'px';
      panel.style.right = 'auto';
      panel.style.bottom = 'auto';
    });

    document.addEventListener('mouseup', () => {
      isDragging = false;
      panel.style.transition = '';
    });
  }

  // ═══════════════════════════════════════════════════════════
  // Overlay Update Functions
  // ═══════════════════════════════════════════════════════════
  function fmt(n) {
    return n != null ? Number(n).toFixed(2) : '--';
  }

  function updatePriceHero(shadow) {
    const priceEl = shadow.getElementById('nq-price');
    const changeEl = shadow.getElementById('nq-change');
    const bidEl = shadow.getElementById('nq-bid');
    const askEl = shadow.getElementById('nq-ask');
    const statusEl = shadow.getElementById('nq-status');

    if (overlayData.nq.price !== null) {
      priceEl.textContent = fmt(overlayData.nq.price);
      statusEl.textContent = 'Live';
      statusEl.className = 'live';
    }
    if (overlayData.nq.bid !== null) {
      bidEl.textContent = fmt(overlayData.nq.bid);
    }
    if (overlayData.nq.ask !== null) {
      askEl.textContent = fmt(overlayData.nq.ask);
    }

    // Compute daily change from last 1d candle open
    const dailyCandles = overlayData.candles['1d'];
    if (dailyCandles.length > 0 && overlayData.nq.price !== null) {
      const openPrice = dailyCandles[dailyCandles.length - 1].o;
      if (openPrice != null) {
        const change = overlayData.nq.price - openPrice;
        const pct = ((change / openPrice) * 100).toFixed(2);
        changeEl.textContent = `${change >= 0 ? '+' : ''}${change.toFixed(2)} (${pct}%)`;
        changeEl.className = change >= 0 ? 'up' : 'down';
      }
    }
  }

  function updateTimeframeGrid(shadow) {
    for (const tf of TIMEFRAMES) {
      const row = shadow.querySelector(`.nq-tf-row[data-tf="${tf}"]`);
      if (!row) continue;

      const candles = overlayData.candles[tf];
      if (candles.length === 0) continue;

      const latest = candles[candles.length - 1];
      const ohlcEl = row.querySelector('.nq-tf-ohlc');
      const dirEl = row.querySelector('.nq-tf-dir');

      ohlcEl.textContent = `${fmt(latest.o)} / ${fmt(latest.h)} / ${fmt(latest.l)} / ${fmt(latest.c)}`;

      const bullish = latest.c >= latest.o;
      dirEl.textContent = bullish ? '\u25B2' : '\u25BC';
      dirEl.className = `nq-tf-dir ${bullish ? 'up' : 'down'}`;
    }
  }

  function updateFooter(shadow) {
    const lastEl = shadow.getElementById('nq-last-update');
    const countEl = shadow.getElementById('nq-event-count');

    if (overlayData.lastUpdate) {
      const ago = Math.round((Date.now() - overlayData.lastUpdate) / 1000);
      lastEl.textContent = `Last: ${ago}s ago`;
    }
    countEl.textContent = `Events: ${overlayData.eventCount}`;
  }

  // ═══════════════════════════════════════════════════════════
  // Initialization
  // ═══════════════════════════════════════════════════════════
  function init() {
    const shadow = createOverlay();

    // Overlay update loop — uses safeInterval (Layer 2)
    // This is the exact setInterval that was throwing before.
    // Now it auto-clears when context dies.
    safeInterval(() => {
      updatePriceHero(shadow);
      updateTimeframeGrid(shadow);
      updateFooter(shadow);
    }, 500);
  }

  // Wait for body if needed (document_idle should guarantee it)
  if (document.body) {
    init();
  } else {
    document.addEventListener('DOMContentLoaded', init);
  }
})();
