// Vehicle Finder — pure matching engine (EXPO_PUBLIC_VEHICLE_FINDER).
// Ports the owner's Python prototype: same scoring weights, same per-dimension
// curves, owner-corrected APR table (7% at 750+, 2-point steps down), standard
// PMT payment math. ZERO imports on purpose: every function here is pure and
// mirrored verbatim into scripts/test-vehiclefinder.mjs — keep them in sync.
//
// Data flow: the inventory-search edge function returns VehicleListing[] (its
// local type mirrors this one — edge fns can't import client code), the rep's
// note becomes VehicleRequirements (AI extraction merged over the regex
// fallback below), and scoreVehicles + pickAlternatives turn the two into the
// ranked cards VehicleFinderModal renders.

export type VehicleType =
  | 'suv' | 'truck' | 'sedan' | 'minivan'
  | 'coupe' | 'hatchback' | 'convertible' | 'wagon';

export type VehicleListing = {
  id: string; // vin || stock|year|model || listing_url — assigned by the edge fn normalizer
  vin?: string | null;
  stock?: string | null;
  year?: number | null;
  make?: string | null;
  model?: string | null;
  trim?: string | null;
  price?: number | null;
  mileage?: number | null;
  color?: string | null;
  body_type?: string | null;
  seats?: number | null;
  features?: string[];
  photo_url?: string | null;
  listing_url?: string | null;
  condition?: 'new' | 'used' | 'cpo' | null;
};

export type VehicleRequirements = {
  monthly_budget?: number | null;
  down_payment?: number | null;
  credit_score?: number | null;
  vehicle_type?: VehicleType | null;
  min_seats?: number | null;
  features?: string[];
  color_pref?: 'dark' | 'light' | null;
  colors?: string[];
  max_mileage?: number | null;
  max_price?: number | null;
  condition?: 'new' | 'used' | null;
  term_months?: number | null;
};

// ---------------------------------------------------------------------------
// Ported constants (prototype values; APR owner-corrected 2026-07-23)
// ---------------------------------------------------------------------------

export const SCORE_WEIGHTS = {
  budget: 0.25,
  type: 0.2,
  seats: 0.15,
  features: 0.2,
  color: 0.1,
  mileage: 0.05,
  age: 0.05,
} as const;

export type DimensionKey = keyof typeof SCORE_WEIGHTS;

// Effective APR by credit tier — 7% at 750+, then 2-point steps down to 17%.
export const APR_TIERS: readonly { min: number; apr: number }[] = [
  { min: 750, apr: 0.07 },
  { min: 700, apr: 0.09 },
  { min: 650, apr: 0.11 },
  { min: 600, apr: 0.13 },
  { min: 550, apr: 0.15 },
  { min: 0, apr: 0.17 },
];

export const DEFAULT_CREDIT_SCORE = 700;
export const DEFAULT_TERM_MONTHS = 72;

export const DARK_COLORS = [
  'black', 'charcoal', 'graphite', 'midnight', 'navy', 'dark blue', 'dark gray',
  'dark grey', 'gray', 'grey', 'brown', 'maroon', 'burgundy', 'dark green',
  'bronze', 'ebony', 'onyx', 'obsidian', 'magnetic',
];

export const LIGHT_COLORS = [
  'white', 'silver', 'pearl', 'ivory', 'cream', 'beige', 'champagne', 'gold',
  'light blue', 'platinum',
];

export const FEATURE_ALIASES: Record<string, string[]> = {
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

export const TYPE_KEYWORDS: Record<VehicleType, string[]> = {
  suv: ['suv', 'crossover', 'cuv', 'sport utility'],
  truck: ['truck', 'pickup', 'pick-up', 'pick up', 'crew cab'],
  sedan: ['sedan', 'saloon', '4-door', '4 door'],
  minivan: ['minivan', 'mini-van', 'mini van', 'van'],
  coupe: ['coupe', '2-door', '2 door'],
  hatchback: ['hatchback', 'hatch'],
  convertible: ['convertible', 'cabriolet', 'drop top'],
  wagon: ['wagon', 'estate'],
};

// Prototype's seat estimates when a listing doesn't state seating.
export const SEATS_BY_TYPE: Record<VehicleType, number> = {
  suv: 5, truck: 3, sedan: 5, coupe: 4,
  convertible: 4, minivan: 7, wagon: 5, hatchback: 5,
};

export const TOP_MATCH_MIN_PCT = 55;
export const MAX_TOP_MATCHES = 5;

// "You might like" near-miss thresholds. A single pass line: a specified
// preference dimension "passes" at >= ALT_PASS_AT and is otherwise "weak". A
// near-miss is a vehicle weak on exactly one such dimension. (A 1-of-2 feature
// match lands at 0.5 — below the line — so a missing-one-feature vehicle counts.)
export const ALT_PASS_AT = 0.7;
export const ALT_FLOOR_PCT = 40; // never offer anything below this overall

// ---------------------------------------------------------------------------
// Finance
// ---------------------------------------------------------------------------

export function aprFor(score?: number | null): number {
  const s = typeof score === 'number' && score >= 300 && score <= 850 ? score : DEFAULT_CREDIT_SCORE;
  for (const tier of APR_TIERS) {
    if (s >= tier.min) return tier.apr;
  }
  return APR_TIERS[APR_TIERS.length - 1].apr;
}

// Standard PMT. Whole-dollar result; down >= price -> 0.
export function estimateMonthlyPayment(
  price: number,
  down: number,
  apr: number,
  termMonths: number = DEFAULT_TERM_MONTHS,
): number {
  const principal = price - down;
  if (principal <= 0 || termMonths <= 0) return 0;
  const r = apr / 12;
  if (r === 0) return Math.round(principal / termMonths);
  const f = Math.pow(1 + r, termMonths);
  return Math.round((principal * r * f) / (f - 1));
}

// ---------------------------------------------------------------------------
// Requirement extraction — deterministic regex fallback. The AI extraction in
// vehicleFinder.ts merges OVER this (mergeRequirements), so a dead network or
// a bad model reply still yields the obvious fields from the note.
// ---------------------------------------------------------------------------

export function extractRequirementsRegex(notes: string): VehicleRequirements {
  const req: VehicleRequirements = {};
  const text = String(notes ?? '').toLowerCase();
  if (!text.trim()) return req;

  // Monthly budget: "500month", "$450/mo", "450 a month", "500 per month", "450 monthly".
  const monthly =
    text.match(/\$?\s*(\d{2,4})\s*(?:\/|per\s+|a\s+)?month(?:ly)?\b/) ??
    text.match(/\$?\s*(\d{2,4})\s*\/?\s*mo\b/);
  if (monthly) {
    const v = parseInt(monthly[1], 10);
    if (v >= 50 && v <= 5000) req.monthly_budget = v;
  }

  // Down payment: "3000 down", "$3,000 down", "3k down", "down payment of 2500".
  const down =
    text.match(/\$?\s*(\d{1,3}(?:,\d{3})*|\d+)(k)?\s*(?:down|dp\b|down\s*payment)/) ??
    text.match(/down\s*(?:payment\s*)?(?:of\s*)?\$?\s*(\d{1,3}(?:,\d{3})*|\d+)(k)?/);
  if (down) {
    let v = parseInt(down[1].replace(/,/g, ''), 10);
    if (down[2]) v *= 1000;
    if (v >= 0 && v <= 100000) req.down_payment = v;
  }

  // Credit score: "600 credit score", "credit of 640", "640 fico", "score 600".
  const credit =
    text.match(/(\d{3})\s*(?:credit|fico)/) ??
    text.match(/credit\s*(?:score\s*)?(?:of\s*)?(\d{3})/) ??
    text.match(/score\s*(?:of\s*)?(\d{3})/);
  if (credit) {
    const v = parseInt(credit[1], 10);
    if (v >= 300 && v <= 850) req.credit_score = v;
  }

  // Vehicle type: first keyword hit wins (suv before sedan etc. by object order).
  for (const t of Object.keys(TYPE_KEYWORDS) as VehicleType[]) {
    if (TYPE_KEYWORDS[t].some(k => text.includes(k))) { req.vehicle_type = t; break; }
  }

  // Seats: "6 seater", "6 seats minimum", "minimum 6 seats", "at least 7 seats".
  const seats =
    text.match(/(\d)\s*seater/) ??
    text.match(/(?:minimum|min|at\s+least)\s*(\d)\s*seats?/) ??
    text.match(/(\d)\s*seats?\s*(?:minimum|min|or\s+more|\+)?/);
  if (seats) {
    const v = parseInt(seats[1], 10);
    if (v >= 2 && v <= 9) req.min_seats = v;
  }

  // Features via aliases (also catches "third row" -> min_seats bump below).
  const feats: string[] = [];
  for (const [key, aliases] of Object.entries(FEATURE_ALIASES)) {
    if (aliases.some(a => text.includes(a))) feats.push(key);
  }
  if (feats.length) req.features = feats;
  if (feats.includes('third_row') && !req.min_seats) req.min_seats = 7;

  // Color preference: family words, else explicit color names.
  if (/dark(?:er)?\s*colou?rs?/.test(text)) req.color_pref = 'dark';
  else if (/(?:light(?:er)?|bright(?:er)?)\s*colou?rs?/.test(text)) req.color_pref = 'light';
  else {
    const explicit = [...DARK_COLORS, ...LIGHT_COLORS].filter(c =>
      new RegExp(`\\b${c.replace(/ /g, '\\s+')}\\b`).test(text));
    if (explicit.length) req.colors = explicit;
  }

  // Max mileage: "under 60k miles", "less than 40,000 miles", "max 80k mi".
  const miles = text.match(/(?:under|below|less\s+than|max(?:imum)?)\s*\$?\s*(\d{1,3}(?:,\d{3})*|\d+)(k)?\s*(?:mi|miles)\b/);
  if (miles) {
    let v = parseInt(miles[1].replace(/,/g, ''), 10);
    if (miles[2]) v *= 1000;
    if (v >= 1000 && v <= 300000) req.max_mileage = v;
  }

  // Max price: "under 20k", "below $25,000" — only when it can't be a monthly
  // figure or mileage ("under 500/mo" and "under 60k miles" never land here).
  const price = text.match(/(?:under|below|less\s+than|max(?:imum)?)\s*\$?\s*(\d{1,3}(?:,\d{3})*|\d+)(k)?\b(?!\s*(?:\/|per\s+|a\s+)?mo)(?!\s*(?:mi|miles))(?!\s*(?:credit|fico|score))/);
  if (price) {
    let v = parseInt(price[1].replace(/,/g, ''), 10);
    if (price[2]) v *= 1000;
    if (v >= 3000 && v <= 300000) req.max_price = v;
  }

  return req;
}

// AI overlay wins per field ONLY when present and valid; otherwise the regex
// value (base) survives. Never lets a hallucinated field through unvalidated.
export function mergeRequirements(
  base: VehicleRequirements,
  overlay: VehicleRequirements,
): VehicleRequirements {
  const out: VehicleRequirements = { ...base };
  const num = (v: unknown, lo: number, hi: number): number | null =>
    typeof v === 'number' && isFinite(v) && v >= lo && v <= hi ? v : null;

  const mb = num(overlay.monthly_budget, 50, 5000);
  if (mb !== null) out.monthly_budget = mb;
  const dp = num(overlay.down_payment, 0, 100000);
  if (dp !== null) out.down_payment = dp;
  const cs = num(overlay.credit_score, 300, 850);
  if (cs !== null) out.credit_score = cs;
  const ms = num(overlay.min_seats, 2, 9);
  if (ms !== null) out.min_seats = ms;
  const mm = num(overlay.max_mileage, 1000, 300000);
  if (mm !== null) out.max_mileage = mm;
  const mp = num(overlay.max_price, 3000, 300000);
  if (mp !== null) out.max_price = mp;
  const tm = num(overlay.term_months, 12, 96);
  if (tm !== null) out.term_months = tm;

  if (overlay.vehicle_type && (Object.keys(TYPE_KEYWORDS) as string[]).includes(overlay.vehicle_type)) {
    out.vehicle_type = overlay.vehicle_type;
  }
  if (Array.isArray(overlay.features)) {
    const valid = overlay.features.filter(f => typeof f === 'string' && f in FEATURE_ALIASES);
    if (valid.length) out.features = [...new Set([...(base.features ?? []), ...valid])];
  }
  if (overlay.color_pref === 'dark' || overlay.color_pref === 'light') out.color_pref = overlay.color_pref;
  if (Array.isArray(overlay.colors)) {
    const valid = overlay.colors.filter(c => typeof c === 'string' && c.trim()).map(c => c.trim().toLowerCase()).slice(0, 6);
    if (valid.length) out.colors = valid;
  }
  if (overlay.condition === 'new' || overlay.condition === 'used') out.condition = overlay.condition;

  return out;
}

// ---------------------------------------------------------------------------
// Scoring
// ---------------------------------------------------------------------------

export type DimensionScore = {
  key: DimensionKey;
  weight: number;
  score: number;
  specified: boolean; // counted toward the renormalized total?
  reason: string;     // honest, plain line ('' when nothing worth saying)
};

export type ScoredVehicle = {
  vehicle: VehicleListing;
  match_pct: number;
  est_monthly: number | null;
  apr: number | null;
  dimensions: DimensionScore[];
  reasons: string[];
};

function listingText(v: VehicleListing): string {
  return [v.make, v.model, v.trim, v.body_type, ...(v.features ?? [])]
    .filter(Boolean).join(' ').toLowerCase();
}

export function listingTypeOf(v: VehicleListing): VehicleType | null {
  const text = [v.body_type, v.model, v.trim].filter(Boolean).join(' ').toLowerCase();
  if (!text) return null;
  for (const t of Object.keys(TYPE_KEYWORDS) as VehicleType[]) {
    if (TYPE_KEYWORDS[t].some(k => text.includes(k))) return t;
  }
  return null;
}

export function matchedFeatures(v: VehicleListing, wanted: string[]): string[] {
  const text = listingText(v);
  return wanted.filter(key => (FEATURE_ALIASES[key] ?? [key]).some(a => text.includes(a)));
}

export function humanizeFeature(key: string): string {
  return key.replace(/_/g, ' ');
}

const fmtMiles = (m: number): string => m >= 1000 ? `${Math.round(m / 1000)}k miles` : `${m} miles`;

// Preference dims (budget/type/seats/features/color) count only when the rep
// asked; quality dims (mileage/age) always count — the prototype's freshness
// bias — using the cap curve when a cap was given, general bands otherwise.
export function scoreVehicle(v: VehicleListing, req: VehicleRequirements): ScoredVehicle {
  const dims: DimensionScore[] = [];
  const currentYear = 2026; // build-era constant; only feeds the coarse age bands

  const apr = req.monthly_budget != null || req.credit_score != null || req.down_payment != null
    ? aprFor(req.credit_score) : (v.price != null ? aprFor(req.credit_score) : null);
  const est = v.price != null && apr != null
    ? estimateMonthlyPayment(v.price, req.down_payment ?? 0, apr, req.term_months ?? DEFAULT_TERM_MONTHS)
    : null;

  // budget — monthly target first; max_price only when no monthly target given.
  if (req.monthly_budget != null) {
    let score: number; let reason: string;
    if (est == null) {
      score = 0.5; reason = 'price unknown — payment not estimated';
    } else if (est <= req.monthly_budget) {
      score = 0.7 + 0.3 * (1 - est / req.monthly_budget);
      reason = `$${est}/mo est — under your $${req.monthly_budget} target`;
    } else {
      score = Math.max(0, Math.pow(req.monthly_budget / est, 3));
      reason = `$${est}/mo est — $${est - req.monthly_budget} over your $${req.monthly_budget} target`;
    }
    dims.push({ key: 'budget', weight: SCORE_WEIGHTS.budget, score, specified: true, reason });
  } else if (req.max_price != null) {
    let score: number; let reason: string;
    if (v.price == null) { score = 0.5; reason = 'price unknown'; }
    else if (v.price <= req.max_price) { score = 1; reason = `$${v.price.toLocaleString()} — under your cap`; }
    else { score = Math.max(0, Math.pow(req.max_price / v.price, 3)); reason = `$${v.price.toLocaleString()} — over your $${req.max_price.toLocaleString()} cap`; }
    dims.push({ key: 'budget', weight: SCORE_WEIGHTS.budget, score, specified: true, reason });
  } else {
    dims.push({ key: 'budget', weight: SCORE_WEIGHTS.budget, score: 0, specified: false, reason: '' });
  }

  // type
  if (req.vehicle_type) {
    const lt = listingTypeOf(v);
    let score: number; let reason: string;
    if (lt === req.vehicle_type) { score = 1; reason = `${req.vehicle_type.toUpperCase()} as asked`; }
    else if (lt == null) { score = 0.5; reason = 'body style unknown'; }
    else { score = 0; reason = `${lt} — not the ${req.vehicle_type} they want`; }
    dims.push({ key: 'type', weight: SCORE_WEIGHTS.type, score, specified: true, reason });
  } else {
    dims.push({ key: 'type', weight: SCORE_WEIGHTS.type, score: 0, specified: false, reason: '' });
  }

  // seats
  if (req.min_seats != null) {
    const lt = listingTypeOf(v);
    const known = v.seats != null;
    const seats = v.seats ?? (lt ? SEATS_BY_TYPE[lt] : null);
    let score: number; let reason: string;
    if (seats == null) { score = 0.5; reason = 'seating unknown'; }
    else if (seats >= req.min_seats) {
      const excess = seats - req.min_seats;
      score = excess <= 2 ? 1 : Math.max(0.7, 1 - (excess - 2) * 0.05);
      reason = known ? `${seats} seats` : `likely ${seats} seats`;
    } else {
      score = Math.max(0, seats / req.min_seats);
      reason = known ? `${seats} seats (wanted ${req.min_seats})` : `likely ${seats} seats (wanted ${req.min_seats})`;
    }
    dims.push({ key: 'seats', weight: SCORE_WEIGHTS.seats, score, specified: true, reason });
  } else {
    dims.push({ key: 'seats', weight: SCORE_WEIGHTS.seats, score: 0, specified: false, reason: '' });
  }

  // features
  if (req.features?.length) {
    const hits = matchedFeatures(v, req.features);
    const noData = !(v.features?.length) && hits.length === 0;
    let score: number; let reason: string;
    if (noData) { score = 0.5; reason = 'features not listed'; }
    else {
      score = hits.length / req.features.length;
      const missing = req.features.filter(f => !hits.includes(f));
      reason = hits.length
        ? `has ${hits.map(humanizeFeature).join(' + ')}${missing.length ? `; no ${missing.map(humanizeFeature).join(', ')}` : ''}`
        : `no ${missing.map(humanizeFeature).join(', ')}`;
    }
    dims.push({ key: 'features', weight: SCORE_WEIGHTS.features, score, specified: true, reason });
  } else {
    dims.push({ key: 'features', weight: SCORE_WEIGHTS.features, score: 0, specified: false, reason: '' });
  }

  // color
  if (req.color_pref || req.colors?.length) {
    const c = (v.color ?? '').toLowerCase();
    let score: number; let reason: string;
    if (!c) { score = 0.5; reason = 'color unknown'; }
    else if (req.colors?.length) {
      const hit = req.colors.some(want => c.includes(want));
      score = hit ? 1 : 0.3;
      reason = hit ? `color: ${v.color} (as asked)` : `only in ${v.color}`;
    } else if (req.color_pref === 'dark') {
      const hit = DARK_COLORS.some(d => c.includes(d));
      score = hit ? 0.9 : 0.3;
      reason = hit ? `color: ${v.color} (dark, as asked)` : `only in ${v.color}`;
    } else {
      const hit = LIGHT_COLORS.some(l => c.includes(l));
      score = hit ? 0.8 : 0.3;
      reason = hit ? `color: ${v.color} (light, as asked)` : `only in ${v.color}`;
    }
    dims.push({ key: 'color', weight: SCORE_WEIGHTS.color, score, specified: true, reason });
  } else {
    dims.push({ key: 'color', weight: SCORE_WEIGHTS.color, score: 0, specified: false, reason: '' });
  }

  // mileage — a quality dim, counted when the rep set a cap OR the listing
  // states mileage (freshness bias). Unknown AND unrequested → not specified, so
  // it doesn't drag an otherwise-strong match.
  {
    const m = v.mileage;
    const specified = req.max_mileage != null || m != null;
    let score = 0; let reason = '';
    if (!specified) { /* not counted */ }
    else if (m == null) { score = 0.5; reason = 'mileage unknown'; }
    else if (req.max_mileage != null) {
      if (m <= req.max_mileage) { score = 1; reason = `${fmtMiles(m)} — under your cap`; }
      else { score = Math.max(0, 1 - (m - req.max_mileage) / req.max_mileage); reason = `${fmtMiles(m)} — over your ${fmtMiles(req.max_mileage)} cap`; }
    } else {
      score = m <= 30000 ? 1 : m <= 60000 ? 0.8 : m <= 100000 ? 0.6 : m <= 150000 ? 0.4 : 0.2;
      if (m <= 30000) reason = `low miles (${fmtMiles(m)})`;
    }
    dims.push({ key: 'mileage', weight: SCORE_WEIGHTS.mileage, score, specified, reason });
  }

  // age — a quality dim, counted when the listing states a year (freshness bias).
  {
    const specified = v.year != null;
    let score = 0; let reason = '';
    if (specified) {
      const age = currentYear - (v.year as number);
      score = age <= 2 ? 1 : age <= 5 ? 0.8 : age <= 10 ? 0.5 : 0.3;
      if (age <= 2) reason = `${v.year} — recent model year`;
    }
    dims.push({ key: 'age', weight: SCORE_WEIGHTS.age, score, specified, reason });
  }

  const counted = dims.filter(d => d.specified);
  const wSum = counted.reduce((s, d) => s + d.weight, 0);
  const raw = wSum > 0 ? counted.reduce((s, d) => s + d.weight * d.score, 0) / wSum : 0;
  const match_pct = Math.round(100 * Math.max(0, Math.min(1, raw)));

  const reasons = counted.map(d => d.reason).filter(Boolean).slice(0, 4);

  return { vehicle: v, match_pct, est_monthly: est, apr, dimensions: dims, reasons };
}

export function scoreVehicles(vehicles: VehicleListing[], req: VehicleRequirements): ScoredVehicle[] {
  return vehicles
    .map(v => scoreVehicle(v, req))
    .sort((a, b) => b.match_pct - a.match_pct || (a.vehicle.price ?? Infinity) - (b.vehicle.price ?? Infinity));
}

// ---------------------------------------------------------------------------
// "You might like" — near-miss alternatives
// ---------------------------------------------------------------------------

export type AlternativePick = { scored: ScoredVehicle; tradeoff: string };

// Preference dims only — quality dims (uncapped mileage / age) never make a
// vehicle a "near miss"; they just shade the overall score.
function nearMissDims(s: ScoredVehicle, req: VehicleRequirements): { weak: DimensionScore[]; others: DimensionScore[] } {
  const relevant = s.dimensions.filter(d => {
    if (!d.specified) return false;
    if (d.key === 'age') return false;
    if (d.key === 'mileage' && req.max_mileage == null) return false;
    return true;
  });
  return {
    weak: relevant.filter(d => d.score < ALT_PASS_AT),
    others: relevant.filter(d => d.score >= ALT_PASS_AT),
  };
}

export function tradeoffLabel(s: ScoredVehicle, req: VehicleRequirements): string {
  const { weak, others } = nearMissDims(s, req);
  const worst = [...weak].sort((a, b) => a.score - b.score)[0];

  let weakClause: string;
  if (!worst) weakClause = 'A little off the brief';
  else {
    switch (worst.key) {
      case 'budget':
        weakClause = s.est_monthly != null && req.monthly_budget != null
          ? `$${s.est_monthly - req.monthly_budget}/mo over budget`
          : 'Over budget';
        break;
      case 'features': {
        const missing = (req.features ?? []).filter(f => !matchedFeatures(s.vehicle, req.features ?? []).includes(f));
        weakClause = missing.length ? `No ${humanizeFeature(missing[0])}` : 'Missing a feature';
        break;
      }
      case 'seats': {
        const lt = listingTypeOf(s.vehicle);
        const seats = s.vehicle.seats ?? (lt ? SEATS_BY_TYPE[lt] : null);
        weakClause = seats != null && req.min_seats != null
          ? `${seats} seats (wanted ${req.min_seats})` : 'Fewer seats than asked';
        break;
      }
      case 'color':
        weakClause = s.vehicle.color ? `Only in ${s.vehicle.color.toLowerCase()}` : 'Color is off the ask';
        break;
      case 'mileage':
        weakClause = s.vehicle.mileage != null ? `${fmtMiles(s.vehicle.mileage)}, over your cap` : 'Higher miles';
        break;
      case 'type': {
        const lt = listingTypeOf(s.vehicle);
        weakClause = lt && req.vehicle_type
          ? `${lt.charAt(0).toUpperCase() + lt.slice(1)}, not ${req.vehicle_type.toUpperCase()}`
          : 'Different body style';
        break;
      }
      default:
        weakClause = s.vehicle.year != null ? `Older (${s.vehicle.year})` : 'A little off the brief';
    }
  }

  let positive: string;
  if (
    worst?.key !== 'budget' &&
    s.est_monthly != null && req.monthly_budget != null && s.est_monthly < req.monthly_budget
  ) {
    positive = `but $${req.monthly_budget - s.est_monthly}/mo under budget`;
  } else if (weak.length <= 1 && others.length > 0) {
    positive = 'has everything else';
  } else {
    positive = 'closest on everything else';
  }

  return `${weakClause}, ${positive}`;
}

// Tier 1: exactly one specified dim below ALT_WEAK_BELOW while every other
// specified dim clears ALT_OTHERS_PASS_AT — ranked by overall pct. Tier 2
// fallback: fewest weak dims, then pct. Empty result = section omitted;
// never padded with junk.
export function pickAlternatives(
  scored: ScoredVehicle[],
  req: VehicleRequirements,
  topIds: string[],
  max = 3,
): AlternativePick[] {
  const shown = new Set(topIds);
  const candidates = scored.filter(s => !shown.has(s.vehicle.id) && s.match_pct >= ALT_FLOOR_PCT);
  if (!candidates.length) return [];

  // Weak is defined as below the pass line, so "all others pass" is automatic —
  // a Tier-1 near-miss is simply a vehicle short on exactly one requested dim.
  const tier1 = candidates.filter(s => nearMissDims(s, req).weak.length === 1);

  const picks: ScoredVehicle[] = [...tier1].sort((a, b) => b.match_pct - a.match_pct).slice(0, max);

  if (picks.length < max) {
    const rest = candidates
      .filter(s => !picks.includes(s))
      .filter(s => nearMissDims(s, req).weak.length >= 1)
      .sort((a, b) =>
        nearMissDims(a, req).weak.length - nearMissDims(b, req).weak.length ||
        b.match_pct - a.match_pct);
    picks.push(...rest.slice(0, max - picks.length));
  }

  return picks.map(s => ({ scored: s, tradeoff: tradeoffLabel(s, req) }));
}
