// NQ-MTF v3.4 — MAIN world content script
// WebSocket interception + data store + postMessage bridge
// No chrome.* API calls in this file (MAIN world has no access)

(() => {
  'use strict';

  const VERSION = '3.4';
  const MAX_RAW = 200;
  const MAX_CANDLES = 100;

  const TARGET_URLS = [
    'wss://wspush.wealthcharts.com',
    'wss://datawarehouseapis.wealthcharts.com',
  ];

  // ─── Data Store ────────────────────────────────────────────
  const WS_DATA = {
    nq: {
      price: null,
      bid: null,
      ask: null,
      volume: null,
      timestamp: null,
    },
    candles: {
      '1m': [],
      '5m': [],
      '15m': [],
      '1h': [],
      '4h': [],
      '1d': [],
    },
    raw: [],
  };

  // Expose for console debugging
  window.__NQ_MTF_DATA = WS_DATA;

  const KNOWN_EVENTS = new Set();

  // ─── Bridge: MAIN → ISOLATED world ────────────────────────
  function postUpdate(type, payload) {
    window.postMessage({ source: 'NQ_MTF', type, payload }, '*');
  }

  // ─── Symbol Matching ──────────────────────────────────────
  function isNQ(symbol) {
    const s = (symbol || '').toUpperCase();
    return s.includes('NQ') || s.includes('NASDAQ') || s.includes('MNQ') || s.startsWith('/NQ');
  }

  // ─── Timeframe Normalization ──────────────────────────────
  function normalizeTimeframe(tf) {
    const map = {
      '1': '1m', '1m': '1m', '1min': '1m',
      '5': '5m', '5m': '5m', '5min': '5m',
      '15': '15m', '15m': '15m', '15min': '15m',
      '60': '1h', '1h': '1h', '60m': '1h', '60min': '1h',
      '240': '4h', '4h': '4h', '240m': '4h',
      'D': '1d', '1d': '1d', '1D': '1d', 'daily': '1d',
    };
    return map[tf] || '1m';
  }

  // ─── Message Routing ──────────────────────────────────────
  function routeMessage(msg, eventType) {
    // NQ Price/Quote updates
    if (eventType === 'quote' || eventType === 'trade' || eventType === 'tick'
        || eventType === 'last' || eventType === 'price') {
      const symbol = msg.symbol || msg.s || msg.sym || msg.Symbol || '';
      if (isNQ(symbol)) {
        WS_DATA.nq.price = msg.price || msg.p || msg.last || msg.Last || msg.Price || WS_DATA.nq.price;
        WS_DATA.nq.bid = msg.bid || msg.b || msg.Bid || WS_DATA.nq.bid;
        WS_DATA.nq.ask = msg.ask || msg.a || msg.Ask || WS_DATA.nq.ask;
        WS_DATA.nq.volume = msg.volume || msg.v || msg.Volume || WS_DATA.nq.volume;
        WS_DATA.nq.timestamp = msg.timestamp || msg.t || msg.Time || Date.now();
        postUpdate('NQ_PRICE', { ...WS_DATA.nq });
      }
    }

    // Candle/Bar updates
    if (eventType === 'candle' || eventType === 'bar' || eventType === 'ohlc'
        || eventType === 'kline' || eventType === 'chart') {
      const symbol = msg.symbol || msg.s || msg.Symbol || '';
      if (isNQ(symbol)) {
        const tf = normalizeTimeframe(msg.timeframe || msg.tf || msg.interval || msg.Interval || '1m');
        if (WS_DATA.candles[tf]) {
          const candle = {
            o: msg.open || msg.o || msg.Open,
            h: msg.high || msg.h || msg.High,
            l: msg.low || msg.l || msg.Low,
            c: msg.close || msg.c || msg.Close,
            v: msg.volume || msg.v || msg.Volume,
            t: msg.time || msg.t || msg.Time || Date.now(),
          };
          WS_DATA.candles[tf].push(candle);
          if (WS_DATA.candles[tf].length > MAX_CANDLES) {
            WS_DATA.candles[tf].shift();
          }
          postUpdate('NQ_CANDLE', { tf, candle });
        }
      }
    }

    // Forward all events for potential future use
    postUpdate('WS_EVENT', { eventType, data: msg });
  }

  // ─── Message Processing ───────────────────────────────────
  function processMessage(data, sourceUrl) {
    let parsed;
    try {
      parsed = typeof data === 'string' ? JSON.parse(data) : data;
    } catch {
      return; // Binary or unparseable — skip
    }

    // Store raw for debugging
    WS_DATA.raw.push({ t: Date.now(), url: sourceUrl, data: parsed });
    if (WS_DATA.raw.length > MAX_RAW) WS_DATA.raw.shift();

    // Event discovery — log unknown types
    const eventType = parsed.type || parsed.event || parsed.msg || parsed.e
                   || parsed.Type || parsed.Event || parsed.action || 'unknown';
    if (!KNOWN_EVENTS.has(eventType)) {
      KNOWN_EVENTS.add(eventType);
      console.log(`[NQ-MTF] \u2605 NEW EVENT TYPE: ${eventType} \u2192`, parsed);
    }

    routeMessage(parsed, eventType);
  }

  // ─── WebSocket Patching ───────────────────────────────────
  function isTargetUrl(url) {
    return TARGET_URLS.some(t => url.startsWith(t));
  }

  function patchWebSocket(ws, url) {
    // Intercept addEventListener("message", ...)
    const origAddEventListener = ws.addEventListener.bind(ws);
    ws.addEventListener = function(type, listener, options) {
      if (type === 'message') {
        const wrapped = function(event) {
          processMessage(event.data, url);
          return listener.call(this, event);
        };
        return origAddEventListener(type, wrapped, options);
      }
      return origAddEventListener(type, listener, options);
    };

    // Intercept onmessage setter
    let _onmessage = null;
    Object.defineProperty(ws, 'onmessage', {
      get() { return _onmessage; },
      set(fn) {
        _onmessage = function(event) {
          processMessage(event.data, url);
          return fn.call(ws, event);
        };
        origAddEventListener('message', _onmessage);
      },
    });
  }

  // ─── WebSocket Constructor Monkey-Patch ───────────────────
  const OriginalWebSocket = window.WebSocket;

  window.WebSocket = function(url, protocols) {
    const ws = protocols
      ? new OriginalWebSocket(url, protocols)
      : new OriginalWebSocket(url);

    if (isTargetUrl(url)) {
      console.log(`[NQ-MTF] WS: ${url}`);
      patchWebSocket(ws, url);
    }

    return ws;
  };

  // Preserve prototype chain and static constants
  window.WebSocket.prototype = OriginalWebSocket.prototype;
  window.WebSocket.CONNECTING = OriginalWebSocket.CONNECTING;
  window.WebSocket.OPEN = OriginalWebSocket.OPEN;
  window.WebSocket.CLOSING = OriginalWebSocket.CLOSING;
  window.WebSocket.CLOSED = OriginalWebSocket.CLOSED;

  console.log(`[NQ-MTF] v${VERSION} loaded \u2014 context guard active`);
})();
