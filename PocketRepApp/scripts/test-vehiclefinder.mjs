// Mock-data verification for Vehicle Finder (EXPO_PUBLIC_VEHICLE_FINDER): the
// pure matching engine in lib/v2/vehicleMatch.ts and the two pure edge-function
// pieces (validateInventoryUrl SSRF guard + jsonLdToListing) in
// supabase/functions/inventory-search/index.ts. Runs with plain `node` — no
// test runner, no network, no real PII.
//
//   npm run test:vehiclefinder    (from PocketRepApp/)
//
// Those modules pull in react-native / Deno, so this MIRRORS the pure pieces
// verbatim (types stripped for plain JS) and asserts their STABLE contracts:
// the ported APR table + PMT math, regex extraction, scoring weights/curves,
// near-miss selection + tradeoff labels, the SSRF accept/reject table, and
// JSON-LD normalization. Keep in sync with the source files if those bodies
// change — the hardcoded expectations here are the behavioral contract.

let failures = 0;
const ok = (name, cond) => { console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}`); if (!cond) failures++; };
const eq = (name, a, b) => ok(`${name} (got ${JSON.stringify(a)})`, JSON.stringify(a) === JSON.stringify(b));

// ===========================================================================
// mirrored from lib/v2/vehicleMatch.ts (keep in sync)
// ===========================================================================

const SCORE_WEIGHTS = { budget: 0.25, type: 0.2, seats: 0.15, features: 0.2, color: 0.1, mileage: 0.05, age: 0.05 };
const APR_TIERS = [
  { min: 750, apr: 0.07 }, { min: 700, apr: 0.09 }, { min: 650, apr: 0.11 },
  { min: 600, apr: 0.13 }, { min: 550, apr: 0.15 }, { min: 0, apr: 0.17 },
];
const DEFAULT_CREDIT_SCORE = 700;
const DEFAULT_TERM_MONTHS = 72;
const DARK_COLORS = ['black', 'charcoal', 'graphite', 'midnight', 'navy', 'dark blue', 'dark gray', 'dark grey', 'gray', 'grey', 'brown', 'maroon', 'burgundy', 'dark green', 'bronze', 'ebony', 'onyx', 'obsidian', 'magnetic'];
const LIGHT_COLORS = ['white', 'silver', 'pearl', 'ivory', 'cream', 'beige', 'champagne', 'gold', 'light blue', 'platinum'];
const FEATURE_ALIASES = {
  remote_start: ['remote start', 'remote-start', 'remote starter', 'auto start', 'autostart', 'remote engine start'],
  heated_seats: ['heated seat', 'heated front seat', 'seat heater', 'htd seats', 'seat warmer'],
  sunroof: ['sunroof', 'sun roof', 'moonroof', 'moon roof', 'panoramic roof', 'pano roof'],
  leather: ['leather'],
  awd: ['awd', '4wd', '4x4', 'all wheel', 'all-wheel', 'four wheel', 'four-wheel'],
  third_row: ['third row', '3rd row', 'three rows', '7 passenger', '7-passenger', '8 passenger', '8-passenger'],
  backup_camera: ['backup camera', 'backup cam', 'rear camera', 'reverse camera', 'rearview camera', 'rear-view camera'],
  carplay: ['carplay', 'apple carplay', 'apple car play'],
  android_auto: ['android auto'],
  navigation: ['navigation', 'nav system', 'gps'],
  tow_package: ['tow package', 'towing', 'trailer hitch', 'tow hitch'],
  blind_spot: ['blind spot', 'blind-spot', 'bsm'],
};
const TYPE_KEYWORDS = {
  suv: ['suv', 'crossover', 'cuv', 'sport utility'],
  truck: ['truck', 'pickup', 'pick-up', 'pick up', 'crew cab'],
  sedan: ['sedan', 'saloon', '4-door', '4 door'],
  minivan: ['minivan', 'mini-van', 'mini van', 'van'],
  coupe: ['coupe', '2-door', '2 door'],
  hatchback: ['hatchback', 'hatch'],
  convertible: ['convertible', 'cabriolet', 'drop top'],
  wagon: ['wagon', 'estate'],
};
const SEATS_BY_TYPE = { suv: 5, truck: 3, sedan: 5, coupe: 4, convertible: 4, minivan: 7, wagon: 5, hatchback: 5 };
const TOP_MATCH_MIN_PCT = 55;
const MAX_TOP_MATCHES = 5;
const ALT_PASS_AT = 0.7;
const ALT_FLOOR_PCT = 40;

function aprFor(score) {
  const s = typeof score === 'number' && score >= 300 && score <= 850 ? score : DEFAULT_CREDIT_SCORE;
  for (const tier of APR_TIERS) if (s >= tier.min) return tier.apr;
  return APR_TIERS[APR_TIERS.length - 1].apr;
}

function estimateMonthlyPayment(price, down, apr, termMonths = DEFAULT_TERM_MONTHS) {
  const principal = price - down;
  if (principal <= 0 || termMonths <= 0) return 0;
  const r = apr / 12;
  if (r === 0) return Math.round(principal / termMonths);
  const f = Math.pow(1 + r, termMonths);
  return Math.round((principal * r * f) / (f - 1));
}

function extractRequirementsRegex(notes) {
  const req = {};
  const text = String(notes ?? '').toLowerCase();
  if (!text.trim()) return req;

  const monthly = text.match(/\$?\s*(\d{2,4})\s*(?:\/|per\s+|a\s+)?month(?:ly)?\b/) ?? text.match(/\$?\s*(\d{2,4})\s*\/?\s*mo\b/);
  if (monthly) { const v = parseInt(monthly[1], 10); if (v >= 50 && v <= 5000) req.monthly_budget = v; }

  const down = text.match(/\$?\s*(\d{1,3}(?:,\d{3})*|\d+)(k)?\s*(?:down|dp\b|down\s*payment)/) ?? text.match(/down\s*(?:payment\s*)?(?:of\s*)?\$?\s*(\d{1,3}(?:,\d{3})*|\d+)(k)?/);
  if (down) { let v = parseInt(down[1].replace(/,/g, ''), 10); if (down[2]) v *= 1000; if (v >= 0 && v <= 100000) req.down_payment = v; }

  const credit = text.match(/(\d{3})\s*(?:credit|fico)/) ?? text.match(/credit\s*(?:score\s*)?(?:of\s*)?(\d{3})/) ?? text.match(/score\s*(?:of\s*)?(\d{3})/);
  if (credit) { const v = parseInt(credit[1], 10); if (v >= 300 && v <= 850) req.credit_score = v; }

  for (const t of Object.keys(TYPE_KEYWORDS)) { if (TYPE_KEYWORDS[t].some(k => text.includes(k))) { req.vehicle_type = t; break; } }

  const seats = text.match(/(\d)\s*seater/) ?? text.match(/(?:minimum|min|at\s+least)\s*(\d)\s*seats?/) ?? text.match(/(\d)\s*seats?\s*(?:minimum|min|or\s+more|\+)?/);
  if (seats) { const v = parseInt(seats[1], 10); if (v >= 2 && v <= 9) req.min_seats = v; }

  const feats = [];
  for (const [key, aliases] of Object.entries(FEATURE_ALIASES)) if (aliases.some(a => text.includes(a))) feats.push(key);
  if (feats.length) req.features = feats;
  if (feats.includes('third_row') && !req.min_seats) req.min_seats = 7;

  if (/dark(?:er)?\s*colou?rs?/.test(text)) req.color_pref = 'dark';
  else if (/(?:light(?:er)?|bright(?:er)?)\s*colou?rs?/.test(text)) req.color_pref = 'light';
  else {
    const explicit = [...DARK_COLORS, ...LIGHT_COLORS].filter(c => new RegExp(`\\b${c.replace(/ /g, '\\s+')}\\b`).test(text));
    if (explicit.length) req.colors = explicit;
  }

  const miles = text.match(/(?:under|below|less\s+than|max(?:imum)?)\s*\$?\s*(\d{1,3}(?:,\d{3})*|\d+)(k)?\s*(?:mi|miles)\b/);
  if (miles) { let v = parseInt(miles[1].replace(/,/g, ''), 10); if (miles[2]) v *= 1000; if (v >= 1000 && v <= 300000) req.max_mileage = v; }

  const price = text.match(/(?:under|below|less\s+than|max(?:imum)?)\s*\$?\s*(\d{1,3}(?:,\d{3})*|\d+)(k)?\b(?!\s*(?:\/|per\s+|a\s+)?mo)(?!\s*(?:mi|miles))(?!\s*(?:credit|fico|score))/);
  if (price) { let v = parseInt(price[1].replace(/,/g, ''), 10); if (price[2]) v *= 1000; if (v >= 3000 && v <= 300000) req.max_price = v; }

  return req;
}

function mergeRequirements(base, overlay) {
  const out = { ...base };
  const num = (v, lo, hi) => typeof v === 'number' && isFinite(v) && v >= lo && v <= hi ? v : null;
  const mb = num(overlay.monthly_budget, 50, 5000); if (mb !== null) out.monthly_budget = mb;
  const dp = num(overlay.down_payment, 0, 100000); if (dp !== null) out.down_payment = dp;
  const cs = num(overlay.credit_score, 300, 850); if (cs !== null) out.credit_score = cs;
  const ms = num(overlay.min_seats, 2, 9); if (ms !== null) out.min_seats = ms;
  const mm = num(overlay.max_mileage, 1000, 300000); if (mm !== null) out.max_mileage = mm;
  const mp = num(overlay.max_price, 3000, 300000); if (mp !== null) out.max_price = mp;
  const tm = num(overlay.term_months, 12, 96); if (tm !== null) out.term_months = tm;
  if (overlay.vehicle_type && Object.keys(TYPE_KEYWORDS).includes(overlay.vehicle_type)) out.vehicle_type = overlay.vehicle_type;
  if (Array.isArray(overlay.features)) { const valid = overlay.features.filter(f => typeof f === 'string' && f in FEATURE_ALIASES); if (valid.length) out.features = [...new Set([...(base.features ?? []), ...valid])]; }
  if (overlay.color_pref === 'dark' || overlay.color_pref === 'light') out.color_pref = overlay.color_pref;
  if (Array.isArray(overlay.colors)) { const valid = overlay.colors.filter(c => typeof c === 'string' && c.trim()).map(c => c.trim().toLowerCase()).slice(0, 6); if (valid.length) out.colors = valid; }
  if (overlay.condition === 'new' || overlay.condition === 'used') out.condition = overlay.condition;
  return out;
}

function listingText(v) { return [v.make, v.model, v.trim, v.body_type, ...(v.features ?? [])].filter(Boolean).join(' ').toLowerCase(); }
function listingTypeOf(v) {
  const text = [v.body_type, v.model, v.trim].filter(Boolean).join(' ').toLowerCase();
  if (!text) return null;
  for (const t of Object.keys(TYPE_KEYWORDS)) if (TYPE_KEYWORDS[t].some(k => text.includes(k))) return t;
  return null;
}
function matchedFeatures(v, wanted) { const text = listingText(v); return wanted.filter(key => (FEATURE_ALIASES[key] ?? [key]).some(a => text.includes(a))); }
function humanizeFeature(key) { return key.replace(/_/g, ' '); }
const fmtMiles = (m) => m >= 1000 ? `${Math.round(m / 1000)}k miles` : `${m} miles`;

function scoreVehicle(v, req) {
  const dims = [];
  const currentYear = 2026;
  const apr = req.monthly_budget != null || req.credit_score != null || req.down_payment != null
    ? aprFor(req.credit_score) : (v.price != null ? aprFor(req.credit_score) : null);
  const est = v.price != null && apr != null
    ? estimateMonthlyPayment(v.price, req.down_payment ?? 0, apr, req.term_months ?? DEFAULT_TERM_MONTHS) : null;

  if (req.monthly_budget != null) {
    let score, reason;
    if (est == null) { score = 0.5; reason = 'price unknown — payment not estimated'; }
    else if (est <= req.monthly_budget) { score = 0.7 + 0.3 * (1 - est / req.monthly_budget); reason = `$${est}/mo est — under your $${req.monthly_budget} target`; }
    else { score = Math.max(0, Math.pow(req.monthly_budget / est, 3)); reason = `$${est}/mo est — $${est - req.monthly_budget} over your $${req.monthly_budget} target`; }
    dims.push({ key: 'budget', weight: SCORE_WEIGHTS.budget, score, specified: true, reason });
  } else if (req.max_price != null) {
    let score, reason;
    if (v.price == null) { score = 0.5; reason = 'price unknown'; }
    else if (v.price <= req.max_price) { score = 1; reason = `$${v.price.toLocaleString()} — under your cap`; }
    else { score = Math.max(0, Math.pow(req.max_price / v.price, 3)); reason = `$${v.price.toLocaleString()} — over your $${req.max_price.toLocaleString()} cap`; }
    dims.push({ key: 'budget', weight: SCORE_WEIGHTS.budget, score, specified: true, reason });
  } else dims.push({ key: 'budget', weight: SCORE_WEIGHTS.budget, score: 0, specified: false, reason: '' });

  if (req.vehicle_type) {
    const lt = listingTypeOf(v);
    let score, reason;
    if (lt === req.vehicle_type) { score = 1; reason = `${req.vehicle_type.toUpperCase()} as asked`; }
    else if (lt == null) { score = 0.5; reason = 'body style unknown'; }
    else { score = 0; reason = `${lt} — not the ${req.vehicle_type} they want`; }
    dims.push({ key: 'type', weight: SCORE_WEIGHTS.type, score, specified: true, reason });
  } else dims.push({ key: 'type', weight: SCORE_WEIGHTS.type, score: 0, specified: false, reason: '' });

  if (req.min_seats != null) {
    const lt = listingTypeOf(v);
    const known = v.seats != null;
    const seats = v.seats ?? (lt ? SEATS_BY_TYPE[lt] : null);
    let score, reason;
    if (seats == null) { score = 0.5; reason = 'seating unknown'; }
    else if (seats >= req.min_seats) { const excess = seats - req.min_seats; score = excess <= 2 ? 1 : Math.max(0.7, 1 - (excess - 2) * 0.05); reason = known ? `${seats} seats` : `likely ${seats} seats`; }
    else { score = Math.max(0, seats / req.min_seats); reason = known ? `${seats} seats (wanted ${req.min_seats})` : `likely ${seats} seats (wanted ${req.min_seats})`; }
    dims.push({ key: 'seats', weight: SCORE_WEIGHTS.seats, score, specified: true, reason });
  } else dims.push({ key: 'seats', weight: SCORE_WEIGHTS.seats, score: 0, specified: false, reason: '' });

  if (req.features?.length) {
    const hits = matchedFeatures(v, req.features);
    const noData = !(v.features?.length) && hits.length === 0;
    let score, reason;
    if (noData) { score = 0.5; reason = 'features not listed'; }
    else { score = hits.length / req.features.length; const missing = req.features.filter(f => !hits.includes(f)); reason = hits.length ? `has ${hits.map(humanizeFeature).join(' + ')}${missing.length ? `; no ${missing.map(humanizeFeature).join(', ')}` : ''}` : `no ${missing.map(humanizeFeature).join(', ')}`; }
    dims.push({ key: 'features', weight: SCORE_WEIGHTS.features, score, specified: true, reason });
  } else dims.push({ key: 'features', weight: SCORE_WEIGHTS.features, score: 0, specified: false, reason: '' });

  if (req.color_pref || req.colors?.length) {
    const c = (v.color ?? '').toLowerCase();
    let score, reason;
    if (!c) { score = 0.5; reason = 'color unknown'; }
    else if (req.colors?.length) { const hit = req.colors.some(want => c.includes(want)); score = hit ? 1 : 0.3; reason = hit ? `color: ${v.color} (as asked)` : `only in ${v.color}`; }
    else if (req.color_pref === 'dark') { const hit = DARK_COLORS.some(d => c.includes(d)); score = hit ? 0.9 : 0.3; reason = hit ? `color: ${v.color} (dark, as asked)` : `only in ${v.color}`; }
    else { const hit = LIGHT_COLORS.some(l => c.includes(l)); score = hit ? 0.8 : 0.3; reason = hit ? `color: ${v.color} (light, as asked)` : `only in ${v.color}`; }
    dims.push({ key: 'color', weight: SCORE_WEIGHTS.color, score, specified: true, reason });
  } else dims.push({ key: 'color', weight: SCORE_WEIGHTS.color, score: 0, specified: false, reason: '' });

  {
    const m = v.mileage;
    const specified = req.max_mileage != null || m != null;
    let score = 0, reason = '';
    if (!specified) { /* not counted */ }
    else if (m == null) { score = 0.5; reason = 'mileage unknown'; }
    else if (req.max_mileage != null) { if (m <= req.max_mileage) { score = 1; reason = `${fmtMiles(m)} — under your cap`; } else { score = Math.max(0, 1 - (m - req.max_mileage) / req.max_mileage); reason = `${fmtMiles(m)} — over your ${fmtMiles(req.max_mileage)} cap`; } }
    else { score = m <= 30000 ? 1 : m <= 60000 ? 0.8 : m <= 100000 ? 0.6 : m <= 150000 ? 0.4 : 0.2; if (m <= 30000) reason = `low miles (${fmtMiles(m)})`; }
    dims.push({ key: 'mileage', weight: SCORE_WEIGHTS.mileage, score, specified, reason });
  }
  {
    const specified = v.year != null;
    let score = 0, reason = '';
    if (specified) { const age = currentYear - v.year; score = age <= 2 ? 1 : age <= 5 ? 0.8 : age <= 10 ? 0.5 : 0.3; if (age <= 2) reason = `${v.year} — recent model year`; }
    dims.push({ key: 'age', weight: SCORE_WEIGHTS.age, score, specified, reason });
  }

  const counted = dims.filter(d => d.specified);
  const wSum = counted.reduce((s, d) => s + d.weight, 0);
  const raw = wSum > 0 ? counted.reduce((s, d) => s + d.weight * d.score, 0) / wSum : 0;
  const match_pct = Math.round(100 * Math.max(0, Math.min(1, raw)));
  const reasons = counted.map(d => d.reason).filter(Boolean).slice(0, 4);
  return { vehicle: v, match_pct, est_monthly: est, apr, dimensions: dims, reasons };
}

function scoreVehicles(vehicles, req) {
  return vehicles.map(v => scoreVehicle(v, req)).sort((a, b) => b.match_pct - a.match_pct || (a.vehicle.price ?? Infinity) - (b.vehicle.price ?? Infinity));
}

function nearMissDims(s, req) {
  const relevant = s.dimensions.filter(d => {
    if (!d.specified) return false;
    if (d.key === 'age') return false;
    if (d.key === 'mileage' && req.max_mileage == null) return false;
    return true;
  });
  return { weak: relevant.filter(d => d.score < ALT_PASS_AT), others: relevant.filter(d => d.score >= ALT_PASS_AT) };
}

function tradeoffLabel(s, req) {
  const { weak, others } = nearMissDims(s, req);
  const worst = [...weak].sort((a, b) => a.score - b.score)[0];
  let weakClause;
  if (!worst) weakClause = 'A little off the brief';
  else switch (worst.key) {
    case 'budget': weakClause = s.est_monthly != null && req.monthly_budget != null ? `$${s.est_monthly - req.monthly_budget}/mo over budget` : 'Over budget'; break;
    case 'features': { const missing = (req.features ?? []).filter(f => !matchedFeatures(s.vehicle, req.features ?? []).includes(f)); weakClause = missing.length ? `No ${humanizeFeature(missing[0])}` : 'Missing a feature'; break; }
    case 'seats': { const lt = listingTypeOf(s.vehicle); const seats = s.vehicle.seats ?? (lt ? SEATS_BY_TYPE[lt] : null); weakClause = seats != null && req.min_seats != null ? `${seats} seats (wanted ${req.min_seats})` : 'Fewer seats than asked'; break; }
    case 'color': weakClause = s.vehicle.color ? `Only in ${s.vehicle.color.toLowerCase()}` : 'Color is off the ask'; break;
    case 'mileage': weakClause = s.vehicle.mileage != null ? `${fmtMiles(s.vehicle.mileage)}, over your cap` : 'Higher miles'; break;
    case 'type': { const lt = listingTypeOf(s.vehicle); weakClause = lt && req.vehicle_type ? `${lt.charAt(0).toUpperCase() + lt.slice(1)}, not ${req.vehicle_type.toUpperCase()}` : 'Different body style'; break; }
    default: weakClause = s.vehicle.year != null ? `Older (${s.vehicle.year})` : 'A little off the brief';
  }
  let positive;
  if (worst?.key !== 'budget' && s.est_monthly != null && req.monthly_budget != null && s.est_monthly < req.monthly_budget) positive = `but $${req.monthly_budget - s.est_monthly}/mo under budget`;
  else if (weak.length <= 1 && others.length > 0) positive = 'has everything else';
  else positive = 'closest on everything else';
  return `${weakClause}, ${positive}`;
}

function pickAlternatives(scored, req, topIds, max = 3) {
  const shown = new Set(topIds);
  const candidates = scored.filter(s => !shown.has(s.vehicle.id) && s.match_pct >= ALT_FLOOR_PCT);
  if (!candidates.length) return [];
  const tier1 = candidates.filter(s => nearMissDims(s, req).weak.length === 1);
  const picks = [...tier1].sort((a, b) => b.match_pct - a.match_pct).slice(0, max);
  if (picks.length < max) {
    const rest = candidates.filter(s => !picks.includes(s)).filter(s => nearMissDims(s, req).weak.length >= 1).sort((a, b) => nearMissDims(a, req).weak.length - nearMissDims(b, req).weak.length || b.match_pct - a.match_pct);
    picks.push(...rest.slice(0, max - picks.length));
  }
  return picks.map(s => ({ scored: s, tradeoff: tradeoffLabel(s, req) }));
}

// ===========================================================================
// mirrored from supabase/functions/inventory-search/index.ts (keep in sync)
// ===========================================================================

function validateInventoryUrl(raw) {
  let url;
  try { url = new URL(String(raw ?? '').trim()); } catch { return { ok: false, reason: 'not a valid url' }; }
  if (url.protocol !== 'https:') return { ok: false, reason: 'must be https' };
  if (url.username || url.password) return { ok: false, reason: 'url must not contain credentials' };
  if (url.port && url.port !== '443') return { ok: false, reason: 'only port 443 allowed' };
  const host = url.hostname.toLowerCase().replace(/\.$/, '');
  if (host.includes(':') || raw.includes('[')) return { ok: false, reason: 'ip-literal host not allowed' };
  if (/^\d+$/.test(host)) return { ok: false, reason: 'ip-literal host not allowed' };
  if (/^0x[0-9a-f]+$/i.test(host)) return { ok: false, reason: 'ip-literal host not allowed' };
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(host)) return { ok: false, reason: 'ip-literal host not allowed' };
  if (/^\d+(\.\d+){1,3}$/.test(host)) return { ok: false, reason: 'ip-literal host not allowed' };
  if (host === 'localhost') return { ok: false, reason: 'localhost not allowed' };
  if (/\.(localhost|local|internal|lan|home\.arpa)$/.test(host)) return { ok: false, reason: 'internal hostname not allowed' };
  if (!host.includes('.')) return { ok: false, reason: 'hostname must be a public domain' };
  return { ok: true, url };
}

const num2 = (v) => { if (typeof v === 'number' && isFinite(v)) return v; if (typeof v === 'string') { const n = parseFloat(v.replace(/[^0-9.]/g, '')); return isFinite(n) ? n : null; } return null; };
const str2 = (v) => { if (typeof v === 'string' && v.trim()) return v.trim(); if (typeof v === 'number') return String(v); return null; };
const abs2 = (v, base) => { const s = str2(v); if (!s) return null; try { return new URL(s, base).href; } catch { return null; } };

function jsonLdToListing(node, baseUrl) {
  if (!node || typeof node !== 'object') return null;
  const n = node;
  const type = [].concat(n['@type'] ?? []).join(' ').toLowerCase();
  const isVehicle = /vehicle|car/.test(type);
  const vin = str2(n.vehicleIdentificationNumber) ?? str2(n.vin);
  const brand = str2(n.brand?.name) ?? str2(n.brand) ?? str2(n.manufacturer?.name);
  const model = str2(n.model) ?? str2(n.vehicleModel) ?? str2(n.model?.name);
  const isProductWithHints = /product/.test(type) && (!!vin || (!!brand && !!model));
  if (!isVehicle && !isProductWithHints) return null;
  const offers = Array.isArray(n.offers) ? n.offers[0] : n.offers;
  const price = num2(offers?.price) ?? num2(n.price) ?? num2(n.priceSpecification?.price);
  const odo = n.mileageFromOdometer;
  const mileage = num2(typeof odo === 'object' && odo ? odo.value : odo);
  const image = Array.isArray(n.image) ? n.image[0] : n.image;
  const photo_url = abs2(typeof image === 'object' && image ? image.url : image, baseUrl);
  const listing_url = abs2(str2(n.url) ?? str2(offers?.url) ?? str2(n['@id']), baseUrl);
  let make = brand, mdl = model, year = num2(n.vehicleModelDate) ?? num2(n.productionDate) ?? num2(n.modelDate);
  if ((!make || !mdl || !year)) { const name = str2(n.name); const m = name?.match(/((?:19|20)\d{2})\s+([A-Za-z][\w-]+)\s+([\w-]+)/); if (m) { year = year ?? parseInt(m[1], 10); make = make ?? m[2]; mdl = mdl ?? m[3]; } }
  if (!make && !mdl && !vin) return null;
  const cond = str2(n.itemCondition)?.toLowerCase() ?? '';
  const condition = /new/.test(cond) ? 'new' : /used|cpo|certified/.test(cond) ? 'used' : null;
  const id = vin ?? (str2(n.sku) ? `${str2(n.sku)}` : null) ?? listing_url ?? `${year ?? ''}|${make ?? ''}|${mdl ?? ''}`;
  return { id, vin: vin ?? null, stock: str2(n.sku), year: year ?? null, make: make ?? null, model: mdl ?? null, trim: str2(n.vehicleConfiguration), price, mileage, color: str2(n.color), body_type: str2(n.bodyType), seats: num2(n.vehicleSeatingCapacity), features: [], photo_url, listing_url, condition };
}

// ===========================================================================
// assertions
// ===========================================================================

const dim = (s, key) => s.dimensions.find(d => d.key === key);

// --- golden note (owner's exact example) ------------------------------------
eq('extract: golden note', extractRequirementsRegex('500month SUV, 6 seater minimum, open to darker colors, 3000 down, 600 credit score, remote start, heated seats'),
  { monthly_budget: 500, down_payment: 3000, credit_score: 600, vehicle_type: 'suv', min_seats: 6, features: ['remote_start', 'heated_seats'], color_pref: 'dark' });

// --- extractor variants ------------------------------------------------------
eq('extract: $450/mo', extractRequirementsRegex('$450/mo sedan').monthly_budget, 450);
eq('extract: 450 a month', extractRequirementsRegex('450 a month').monthly_budget, 450);
eq('extract: 450month', extractRequirementsRegex('450month').monthly_budget, 450);
eq('extract: 3k down', extractRequirementsRegex('3k down').down_payment, 3000);
eq('extract: score 600', extractRequirementsRegex('score 600').credit_score, 600);
eq('extract: 600 credit', extractRequirementsRegex('600 credit').credit_score, 600);
eq('extract: 7 seater', extractRequirementsRegex('7 seater').min_seats, 7);
ok('extract: third row -> feature + 7 seats', (() => { const r = extractRequirementsRegex('needs third row'); return r.features?.includes('third_row') && r.min_seats === 7; })());
eq('extract: crossover -> suv', extractRequirementsRegex('a crossover').vehicle_type, 'suv');
eq('extract: pickup -> truck', extractRequirementsRegex('a pickup').vehicle_type, 'truck');
eq('extract: white or silver -> colors', extractRequirementsRegex('white or silver please').colors, ['white', 'silver']);
eq('extract: under 60k miles -> mileage (not price)', (() => { const r = extractRequirementsRegex('under 60k miles'); return [r.max_mileage, r.max_price]; })(), [60000, undefined]);
eq('extract: under 20k -> max_price', extractRequirementsRegex('under 20k').max_price, 20000);
eq('extract: 500/mo never max_price', extractRequirementsRegex('500/mo').max_price, undefined);
eq('extract: empty note -> {}', extractRequirementsRegex('   '), {});

// --- credit tiers + APR ------------------------------------------------------
eq('apr: 850 -> .07', aprFor(850), 0.07);
eq('apr: 750 -> .07', aprFor(750), 0.07);
eq('apr: 749 -> .09', aprFor(749), 0.09);
eq('apr: 700 -> .09', aprFor(700), 0.09);
eq('apr: 699 -> .11', aprFor(699), 0.11);
eq('apr: 650 -> .11', aprFor(650), 0.11);
eq('apr: 649 -> .13', aprFor(649), 0.13);
eq('apr: 600 -> .13', aprFor(600), 0.13);
eq('apr: 599 -> .15', aprFor(599), 0.15);
eq('apr: 550 -> .15', aprFor(550), 0.15);
eq('apr: 549 -> .17', aprFor(549), 0.17);
eq('apr: 300 -> .17', aprFor(300), 0.17);
eq('apr: null -> 700 default (.09)', aprFor(null), 0.09);
eq('apr: undefined -> 700 default (.09)', aprFor(undefined), 0.09);

// --- PMT ---------------------------------------------------------------------
eq('pmt: 30000/3000/600cr/72mo', estimateMonthlyPayment(30000, 3000, aprFor(600), 72), 542);
eq('pmt: zero apr -> principal/term', estimateMonthlyPayment(24000, 0, 0, 72), 333);
eq('pmt: down == price -> 0', estimateMonthlyPayment(20000, 20000, 0.13), 0);
eq('pmt: down > price -> 0', estimateMonthlyPayment(20000, 25000, 0.13), 0);

// --- weights -----------------------------------------------------------------
eq('weights: keys', Object.keys(SCORE_WEIGHTS).sort(), ['age', 'budget', 'color', 'features', 'mileage', 'seats', 'type']);
ok('weights: sum to 1.0', Math.abs(Object.values(SCORE_WEIGHTS).reduce((a, b) => a + b, 0) - 1) < 1e-9);

// --- mergeRequirements -------------------------------------------------------
eq('merge: valid overlay wins', mergeRequirements({ monthly_budget: 500 }, { monthly_budget: 450, credit_score: 700 }), { monthly_budget: 450, credit_score: 700 });
eq('merge: invalid credit rejected, regex survives', mergeRequirements({ credit_score: 600 }, { credit_score: 9999 }), { credit_score: 600 });
eq('merge: unknown feature filtered', mergeRequirements({}, { features: ['remote_start', 'teleporter'] }), { features: ['remote_start'] });
eq('merge: bad vehicle_type ignored', mergeRequirements({ vehicle_type: 'suv' }, { vehicle_type: 'spaceship' }), { vehicle_type: 'suv' });

// --- scoring: order + curves -------------------------------------------------
const REQ = { monthly_budget: 500, down_payment: 3000, credit_score: 700, vehicle_type: 'suv', min_seats: 6 };
const V_PERFECT = { id: 'perfect', make: 'Kia', model: 'Telluride', body_type: 'SUV', price: 22000, seats: 7, mileage: 18000, year: 2024, features: [] };
const V_OVER = { id: 'over', make: 'GMC', model: 'Yukon', body_type: 'SUV', price: 62000, seats: 7, mileage: 15000, year: 2025, features: [] };
const V_SEDAN = { id: 'sedan', make: 'Honda', model: 'Accord', body_type: 'Sedan', price: 22000, seats: 5, mileage: 20000, year: 2024, features: [] };
const ranked = scoreVehicles([V_OVER, V_SEDAN, V_PERFECT], REQ);
eq('score: perfect SUV ranks first', ranked[0].vehicle.id, 'perfect');
ok('score: match_pct sorted desc', ranked[0].match_pct >= ranked[1].match_pct && ranked[1].match_pct >= ranked[2].match_pct);
ok('score: over-budget budget dim is cubic-penalized (<0.5)', dim(scoreVehicle(V_OVER, REQ), 'budget').score < 0.5);
ok('score: perfect budget dim strong (>0.7)', dim(scoreVehicle(V_PERFECT, REQ), 'budget').score > 0.7);
eq('score: sedan type dim = 0', dim(scoreVehicle(V_SEDAN, REQ), 'type').score, 0);
ok('score: est_monthly computed for priced vehicle', scoreVehicle(V_PERFECT, REQ).est_monthly != null);

// unknown price -> budget 0.5, est null, honest reason
const V_NOPRICE = { id: 'np', make: 'Kia', model: 'Telluride', body_type: 'SUV', price: null, seats: 7, year: 2024 };
eq('score: unknown price -> budget 0.5', dim(scoreVehicle(V_NOPRICE, REQ), 'budget').score, 0.5);
eq('score: unknown price -> est null', scoreVehicle(V_NOPRICE, REQ).est_monthly, null);

// --- renormalization: unspecified dims (color/seats/features) don't drag ------
const REQ_MIN = { monthly_budget: 500, down_payment: 3000, credit_score: 700, vehicle_type: 'suv' };
const sMin = scoreVehicle(V_PERFECT, REQ_MIN);
eq('renorm: color unspecified -> not counted', dim(sMin, 'color').specified, false);
eq('renorm: seats unspecified -> not counted', dim(sMin, 'seats').specified, false);
eq('renorm: features unspecified -> not counted', dim(sMin, 'features').specified, false);
ok('renorm: budget+type+known miles/year => strong pct', sMin.match_pct >= 90);
// a vehicle with unknown miles/year and no cap: those quality dims also drop out
const V_BARE = { id: 'bare', make: 'Kia', model: 'Telluride', body_type: 'SUV', price: 22000 };
const sBare = scoreVehicle(V_BARE, REQ_MIN);
eq('renorm: unknown mileage + no cap -> not counted', dim(sBare, 'mileage').specified, false);
eq('renorm: unknown year -> age not counted', dim(sBare, 'age').specified, false);

// --- feature alias matching --------------------------------------------------
const V_FEAT = { id: 'f', make: 'Ford', model: 'Escape', body_type: 'SUV', price: 20000, seats: 5, year: 2023, features: ['Remote Engine Start', 'Heated Front Seats'] };
eq('features: alias match 2 of 3 -> 0.667', Number(dim(scoreVehicle(V_FEAT, { features: ['remote_start', 'heated_seats', 'sunroof'] }), 'features').score.toFixed(3)), 0.667);

// --- color -------------------------------------------------------------------
eq('color: black passes dark (.9)', dim(scoreVehicle({ id: 'c1', make: 'X', model: 'Y', color: 'Black', price: 20000 }, { color_pref: 'dark' }), 'color').score, 0.9);
eq('color: white fails dark (.3)', dim(scoreVehicle({ id: 'c2', make: 'X', model: 'Y', color: 'White', price: 20000 }, { color_pref: 'dark' }), 'color').score, 0.3);
eq('color: unknown -> 0.5', dim(scoreVehicle({ id: 'c3', make: 'X', model: 'Y', color: null, price: 20000 }, { color_pref: 'dark' }), 'color').score, 0.5);

// --- near-miss "you might like" ----------------------------------------------
// Base vehicle passes everything; alt A misses one feature; alt B slightly over budget.
const REQ_ALT = { monthly_budget: 500, down_payment: 3000, credit_score: 700, vehicle_type: 'suv', min_seats: 6, features: ['remote_start', 'heated_seats'] };
const TOP = { id: 'top', make: 'Kia', model: 'Telluride', body_type: 'SUV', price: 22000, seats: 7, mileage: 18000, year: 2024, features: ['remote start', 'heated seats'] };
// missing remote_start only; still under budget -> "No remote start, but $NN/mo under budget"
const ALT_FEAT = { id: 'altfeat', make: 'Hyundai', model: 'Palisade', body_type: 'SUV', price: 23000, seats: 7, mileage: 20000, year: 2024, features: ['heated seats'] };
const scoredAlt = scoreVehicles([TOP, ALT_FEAT], REQ_ALT);
const topIds = [scoredAlt.find(s => s.vehicle.id === 'top').vehicle.id];
const altsFeat = pickAlternatives(scoredAlt, REQ_ALT, topIds);
ok('alt: near-miss feature vehicle is picked', altsFeat.some(a => a.scored.vehicle.id === 'altfeat'));
ok('alt: excludes top ids', !altsFeat.some(a => a.scored.vehicle.id === 'top'));
ok('alt: tradeoff names missing remote start + under budget', (() => { const a = altsFeat.find(x => x.scored.vehicle.id === 'altfeat'); return a && /No remote start/.test(a.tradeoff) && /under budget/.test(a.tradeoff); })());

// over-budget-only alt -> "$NN/mo over budget, has everything else"
const REQ_ALT2 = { monthly_budget: 400, down_payment: 3000, credit_score: 700, vehicle_type: 'suv', min_seats: 6 };
const TOP2 = { id: 'top2', make: 'Kia', model: 'Sorento', body_type: 'SUV', price: 20000, seats: 7, mileage: 15000, year: 2024 };
const ALT_BUD = { id: 'altbud', make: 'Toyota', model: 'Highlander', body_type: 'SUV', price: 34000, seats: 7, mileage: 22000, year: 2024 };
const scoredAlt2 = scoreVehicles([TOP2, ALT_BUD], REQ_ALT2);
const alts2 = pickAlternatives(scoredAlt2, REQ_ALT2, [TOP2.id]);
ok('alt: over-budget tradeoff phrasing', (() => { const a = alts2.find(x => x.scored.vehicle.id === 'altbud'); return a && /over budget/.test(a.tradeoff) && /has everything else/.test(a.tradeoff); })());

// floor filter -> nothing qualifies -> []
const REQ_STRICT = { monthly_budget: 300, down_payment: 0, credit_score: 500, vehicle_type: 'truck', min_seats: 8, features: ['sunroof', 'leather', 'navigation'] };
const junk = [{ id: 'j1', make: 'Mini', model: 'Cooper', body_type: 'hatchback', price: 45000, seats: 4, mileage: 90000, year: 2014 }];
eq('alt: nothing above floor -> [] (section omitted)', pickAlternatives(scoreVehicles(junk, REQ_STRICT), REQ_STRICT, []), []);

// cap at 3
const many = Array.from({ length: 8 }, (_, i) => ({ id: `m${i}`, make: 'Kia', model: 'Telluride', body_type: 'SUV', price: 24000 + i * 100, seats: 7, mileage: 20000, year: 2024, features: ['heated seats'] }));
ok('alt: capped at 3', pickAlternatives(scoreVehicles(many, REQ_ALT), REQ_ALT, []).length <= 3);

// --- SSRF validator ----------------------------------------------------------
ok('ssrf: accept https dealer + path', validateInventoryUrl('https://www.dealer.com/inventory').ok === true);
ok('ssrf: accept bare https dealer', validateInventoryUrl('https://dealer.com').ok === true);
ok('ssrf: reject http', validateInventoryUrl('http://dealer.com').ok === false);
ok('ssrf: reject credentials', validateInventoryUrl('https://user:pass@dealer.com').ok === false);
ok('ssrf: reject dotted ipv4', validateInventoryUrl('https://192.168.1.1').ok === false);
ok('ssrf: reject 10.x ipv4', validateInventoryUrl('https://10.0.0.1/x').ok === false);
ok('ssrf: reject ipv6 loopback', validateInventoryUrl('https://[::1]/').ok === false);
ok('ssrf: reject hex ip', validateInventoryUrl('https://0x7f000001/').ok === false);
ok('ssrf: reject decimal ip', validateInventoryUrl('https://2130706433/').ok === false);
ok('ssrf: reject localhost', validateInventoryUrl('https://localhost').ok === false);
ok('ssrf: reject .local', validateInventoryUrl('https://foo.local').ok === false);
ok('ssrf: reject .internal', validateInventoryUrl('https://box.internal').ok === false);
ok('ssrf: reject non-443 port', validateInventoryUrl('https://dealer.com:8443').ok === false);
ok('ssrf: reject ftp', validateInventoryUrl('ftp://x.com').ok === false);
ok('ssrf: reject dotless host', validateInventoryUrl('https://intranet').ok === false);
ok('ssrf: reject garbage', validateInventoryUrl('not a url at all').ok === false);

// --- jsonLdToListing ---------------------------------------------------------
const ld = jsonLdToListing({
  '@type': 'Vehicle', vehicleIdentificationNumber: '1FADP3',
  brand: { name: 'Ford' }, model: 'Escape', vehicleModelDate: '2022',
  offers: { price: '24995', url: '/vdp/escape' }, mileageFromOdometer: { value: 31000 },
  color: 'Magnetic', bodyType: 'SUV', vehicleSeatingCapacity: 5, image: ['/img/1.jpg', '/img/2.jpg'],
  itemCondition: 'https://schema.org/UsedCondition',
}, 'https://dealer.com/');
eq('jsonld: vin', ld.vin, '1FADP3');
eq('jsonld: make/model/year', [ld.make, ld.model, ld.year], ['Ford', 'Escape', 2022]);
eq('jsonld: price parsed', ld.price, 24995);
eq('jsonld: mileage from odometer.value', ld.mileage, 31000);
eq('jsonld: image[0] absolutized', ld.photo_url, 'https://dealer.com/img/1.jpg');
eq('jsonld: url absolutized', ld.listing_url, 'https://dealer.com/vdp/escape');
eq('jsonld: condition used', ld.condition, 'used');
eq('jsonld: Product without vehicle hints -> null', jsonLdToListing({ '@type': 'Product', name: 'Floor Mats', offers: { price: '49' } }, 'https://dealer.com/'), null);
ok('jsonld: name-string fallback parses year/make/model', (() => { const x = jsonLdToListing({ '@type': 'Car', name: '2021 Toyota Camry SE' }, 'https://d.com/'); return x && x.year === 2021 && x.make === 'Toyota' && x.model === 'Camry'; })());

console.log(failures === 0 ? '\nAll Vehicle Finder checks passed.' : `\n${failures} check(s) FAILED.`);
process.exit(failures === 0 ? 0 : 1);
