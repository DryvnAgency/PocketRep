// Vehicle Finder — dealership inventory reader.
//
// COMMITTED — NOT DEPLOYED. The owner deploys manually when ready:
//   supabase functions deploy inventory-search
// Until then the client's fetch 404s and VehicleFinderModal shows its honest
// error state, so the feature is inert even with EXPO_PUBLIC_VEHICLE_FINDER on.
//
// POST { url } + a caller JWT (verify_jwt=true, send-push pattern). We fetch the
// rep's dealership site FROM SUPABASE'S EGRESS and parse public inventory pages
// into normalized vehicles. Parse cascade per page: JSON-LD schema.org Vehicle
// -> embedded JSON (vin-bearing <script> blocks / known SPA globals) -> coarse
// HTML card heuristics. Stateless: no DB reads/writes, no secrets beyond the
// standard service-role auth check, no outbound auth headers. No paid scraping
// or inventory vendor — built-in best-effort parser only (a vendor API for
// JS-only dealer sites is a documented future owner option).
//
// SECURITY: validateInventoryUrl() is the SSRF guard and is re-run on every
// redirect hop. It is a PURE function, mirrored verbatim in
// scripts/test-vehiclefinder.mjs. Residual risk: DNS rebinding — the Deno edge
// runtime resolves the hostname at fetch time and we can't pin the IP we
// validated, so a hostile DNS answer could flip a public-looking hostname to an
// internal address between validation and connect. What this guard DOES cover:
// literal-IP / localhost / interior-hostname targets and redirect smuggling
// into them. What it does NOT: a rebinding DNS record. Accepted because the
// fetch runs from Supabase's network (not the rep's LAN), sends no credentials,
// writes nothing, and caps the response at MAX_BYTES — so the worst case is a
// 2MB read of an attacker-chosen internal page returned to the authenticated
// caller who requested it, with no state change.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, content-type, x-client-info, apikey',
};

const FETCH_TIMEOUT_MS = 10_000;
const MAX_REDIRECTS = 3;
const MAX_BYTES = 2_000_000;
const MAX_PAGES = 4;
const MAX_VEHICLES = 60;
const COMMON_PATHS = ['/inventory', '/used-vehicles', '/used-cars', '/inventory/used', '/cars-for-sale', '/vehicles'];

// Mirror of lib/v2/vehicleMatch.ts VehicleListing (edge fns can't import client
// code). Keep the shared fields in sync if that type changes.
type VehicleListing = {
  id: string;
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

// ---------------------------------------------------------------------------
// SSRF guard (PURE — mirrored in the test)
// ---------------------------------------------------------------------------

export function validateInventoryUrl(raw: string): { ok: true; url: URL } | { ok: false; reason: string } {
  let url: URL;
  try { url = new URL(String(raw ?? '').trim()); } catch { return { ok: false, reason: 'not a valid url' }; }

  if (url.protocol !== 'https:') return { ok: false, reason: 'must be https' };
  if (url.username || url.password) return { ok: false, reason: 'url must not contain credentials' };
  if (url.port && url.port !== '443') return { ok: false, reason: 'only port 443 allowed' };

  const host = url.hostname.toLowerCase().replace(/\.$/, ''); // drop one trailing dot

  // Bracketed or colon-bearing host => IPv6 literal.
  if (host.includes(':') || raw.includes('[')) return { ok: false, reason: 'ip-literal host not allowed' };
  // IPv4 dotted / bare decimal / hex / octal integer forms.
  if (/^\d+$/.test(host)) return { ok: false, reason: 'ip-literal host not allowed' };
  if (/^0x[0-9a-f]+$/i.test(host)) return { ok: false, reason: 'ip-literal host not allowed' };
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(host)) return { ok: false, reason: 'ip-literal host not allowed' };
  if (/^\d+(\.\d+){1,3}$/.test(host)) return { ok: false, reason: 'ip-literal host not allowed' }; // dotted with <4 octets / big ints

  if (host === 'localhost') return { ok: false, reason: 'localhost not allowed' };
  if (/\.(localhost|local|internal|lan|home\.arpa)$/.test(host)) return { ok: false, reason: 'internal hostname not allowed' };
  if (!host.includes('.')) return { ok: false, reason: 'hostname must be a public domain' };

  return { ok: true, url };
}

// ---------------------------------------------------------------------------
// Fetch with manual redirects (re-validate every hop) + byte cap
// ---------------------------------------------------------------------------

async function safeFetch(startUrl: string): Promise<{ html: string; finalUrl: string; truncated: boolean }> {
  let current = startUrl;
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    const check = validateInventoryUrl(current);
    if (!check.ok) throw new Error(`blocked url: ${check.reason}`);

    const res = await fetch(current, {
      method: 'GET',
      redirect: 'manual',
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      headers: { accept: 'text/html', 'user-agent': 'Mozilla/5.0 (compatible; PocketRep inventory preview)' },
    });

    if (res.status >= 300 && res.status < 400) {
      const loc = res.headers.get('location');
      if (!loc) throw new Error('redirect without location');
      current = new URL(loc, current).href; // resolve relative redirects, re-validated next loop
      await res.body?.cancel();
      continue;
    }
    if (!res.ok) throw new Error(`http ${res.status}`);

    const ctype = (res.headers.get('content-type') ?? '').toLowerCase();
    if (!ctype.includes('text/html') && !ctype.includes('application/xhtml')) throw new Error('not html');

    const { text, truncated } = await readCapped(res);
    return { html: text, finalUrl: current, truncated };
  }
  throw new Error('too many redirects');
}

async function readCapped(res: Response): Promise<{ text: string; truncated: boolean }> {
  if (!res.body) return { text: await res.text(), truncated: false };
  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  let truncated = false;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    if (value) {
      chunks.push(value);
      total += value.length;
      if (total >= MAX_BYTES) { truncated = true; await reader.cancel(); break; }
    }
  }
  const merged = new Uint8Array(total);
  let off = 0;
  for (const c of chunks) { merged.set(c, off); off += c.length; }
  return { text: new TextDecoder().decode(merged), truncated };
}

// ---------------------------------------------------------------------------
// Parsers
// ---------------------------------------------------------------------------

const num = (v: unknown): number | null => {
  if (typeof v === 'number' && isFinite(v)) return v;
  if (typeof v === 'string') {
    const n = parseFloat(v.replace(/[^0-9.]/g, ''));
    return isFinite(n) ? n : null;
  }
  return null;
};
const str = (v: unknown): string | null => {
  if (typeof v === 'string' && v.trim()) return v.trim();
  if (typeof v === 'number') return String(v);
  return null;
};
const abs = (v: unknown, base: string): string | null => {
  const s = str(v);
  if (!s) return null;
  try { return new URL(s, base).href; } catch { return null; }
};

// schema.org Vehicle/Car/Product node -> listing (PURE — mirrored in the test).
export function jsonLdToListing(node: unknown, baseUrl: string): VehicleListing | null {
  if (!node || typeof node !== 'object') return null;
  const n = node as Record<string, unknown>;
  const type = ([] as string[]).concat((n['@type'] as string) ?? []).join(' ').toLowerCase();
  const isVehicle = /vehicle|car/.test(type);
  const vin = str(n.vehicleIdentificationNumber) ?? str(n.vin);
  const brand = str((n.brand as Record<string, unknown>)?.name) ?? str(n.brand) ?? str((n.manufacturer as Record<string, unknown>)?.name);
  const model = str(n.model) ?? str(n.vehicleModel) ?? str((n.model as Record<string, unknown>)?.name);
  const isProductWithHints = /product/.test(type) && (!!vin || (!!brand && !!model));
  if (!isVehicle && !isProductWithHints) return null;

  const offers = (Array.isArray(n.offers) ? n.offers[0] : n.offers) as Record<string, unknown> | undefined;
  const price = num(offers?.price) ?? num(n.price) ?? num((n.priceSpecification as Record<string, unknown>)?.price);
  const odo = n.mileageFromOdometer as Record<string, unknown> | number | string | undefined;
  const mileage = num(typeof odo === 'object' && odo ? (odo as Record<string, unknown>).value : odo);
  const image = Array.isArray(n.image) ? n.image[0] : n.image;
  const photo_url = abs(typeof image === 'object' && image ? (image as Record<string, unknown>).url : image, baseUrl);
  const listing_url = abs(str(n.url) ?? str(offers?.url) ?? str(n['@id']), baseUrl);

  let make = brand;
  let mdl = model;
  let year = num(n.vehicleModelDate) ?? num(n.productionDate) ?? num(n.modelDate);
  if ((!make || !mdl || !year)) {
    const name = str(n.name);
    const m = name?.match(/((?:19|20)\d{2})\s+([A-Za-z][\w-]+)\s+([\w-]+)/);
    if (m) { year = year ?? parseInt(m[1], 10); make = make ?? m[2]; mdl = mdl ?? m[3]; }
  }
  if (!make && !mdl && !vin) return null;

  const cond = str(n.itemCondition)?.toLowerCase() ?? '';
  const condition = /new/.test(cond) ? 'new' : /used|cpo|certified/.test(cond) ? 'used' : null;

  const id = vin ?? (str(n.sku) ? `${str(n.sku)}` : null) ?? listing_url ?? `${year ?? ''}|${make ?? ''}|${mdl ?? ''}`;

  return {
    id, vin: vin ?? null, stock: str(n.sku), year: year ?? null,
    make: make ?? null, model: mdl ?? null, trim: str(n.vehicleConfiguration),
    price, mileage, color: str(n.color), body_type: str(n.bodyType),
    seats: num(n.vehicleSeatingCapacity), features: [],
    photo_url, listing_url, condition,
  };
}

function parseJsonLd(html: string, baseUrl: string): VehicleListing[] {
  const out: VehicleListing[] = [];
  const re = /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) {
    let data: unknown;
    try { data = JSON.parse(m[1].trim()); } catch { continue; }
    const nodes: unknown[] = [];
    const visit = (d: unknown) => {
      if (Array.isArray(d)) d.forEach(visit);
      else if (d && typeof d === 'object') {
        nodes.push(d);
        const graph = (d as Record<string, unknown>)['@graph'];
        if (Array.isArray(graph)) graph.forEach(visit);
      }
    };
    visit(data);
    for (const node of nodes) {
      const listing = jsonLdToListing(node, baseUrl);
      if (listing) out.push(listing);
    }
  }
  return out;
}

const PRICE_KEYS = ['price', 'listprice', 'sellingprice', 'internetprice', 'saleprice', 'askingprice', 'msrp'];
const MILE_KEYS = ['mileage', 'miles', 'odometer'];
const COLOR_KEYS = ['exteriorcolor', 'extcolor', 'exterior_color', 'colour', 'color'];
const BODY_KEYS = ['bodystyle', 'body_style', 'bodytype', 'body'];
const PHOTO_KEYS = ['imageurl', 'image', 'photourl', 'thumbnail', 'primaryimage'];
const LINK_KEYS = ['vdpurl', 'detailurl', 'link', 'url', 'href'];
const pick = (o: Record<string, unknown>, keys: string[]): unknown => {
  const lower: Record<string, unknown> = {};
  for (const k of Object.keys(o)) lower[k.toLowerCase()] = o[k];
  for (const k of keys) if (lower[k] != null) return lower[k];
  return undefined;
};

function parseEmbeddedJson(html: string, baseUrl: string): VehicleListing[] {
  const out: VehicleListing[] = [];
  const scriptRe = /<script\b(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi;
  let m: RegExpExecArray | null;
  let scanned = 0;
  while ((m = scriptRe.exec(html)) && scanned < 40) {
    const body = m[1];
    if (!/["']vin["']/i.test(body) && !/__INITIAL_STATE__|__NEXT_DATA__|dataLayer/.test(body)) continue;
    scanned++;
    for (const jsonStr of extractJsonObjects(body)) {
      let data: unknown;
      try { data = JSON.parse(jsonStr); } catch { continue; }
      collectVehicleObjects(data, baseUrl, out);
      if (out.length >= MAX_VEHICLES) return out;
    }
  }
  return out;
}

// Balanced-brace scan from each top-level "{" (bounded), so we can JSON.parse a
// blob embedded in an assignment like `window.__INITIAL_STATE__ = {...};`.
function extractJsonObjects(body: string): string[] {
  const results: string[] = [];
  const MAX = 500_000;
  for (let i = 0; i < body.length && results.length < 6; i++) {
    if (body[i] !== '{') continue;
    let depth = 0, inStr = false, esc = false;
    let j = i;
    for (; j < body.length && j - i < MAX; j++) {
      const ch = body[j];
      if (inStr) {
        if (esc) esc = false;
        else if (ch === '\\') esc = true;
        else if (ch === '"') inStr = false;
      } else if (ch === '"') inStr = true;
      else if (ch === '{') depth++;
      else if (ch === '}') { depth--; if (depth === 0) { j++; break; } }
    }
    if (depth === 0 && j > i + 1) { results.push(body.slice(i, j)); i = j; }
  }
  return results;
}

function collectVehicleObjects(root: unknown, baseUrl: string, out: VehicleListing[]): void {
  let visited = 0;
  const stack: unknown[] = [root];
  while (stack.length && visited < 20_000 && out.length < MAX_VEHICLES) {
    const node = stack.pop();
    visited++;
    if (Array.isArray(node)) { for (const x of node) stack.push(x); continue; }
    if (!node || typeof node !== 'object') continue;
    const o = node as Record<string, unknown>;
    const lower: Record<string, unknown> = {};
    for (const k of Object.keys(o)) lower[k.toLowerCase()] = o[k];

    const vin = str(lower.vin);
    const stock = str(lower.stocknumber) ?? str(lower.stock_number) ?? str(lower.stock);
    const make = str(lower.make);
    const model = str(lower.model);
    if ((vin || stock) && (make || model)) {
      const listing_url = abs(pick(o, LINK_KEYS), baseUrl);
      const photoRaw = pick(o, PHOTO_KEYS);
      const photo = Array.isArray(photoRaw) ? photoRaw[0] : photoRaw;
      const id = vin ?? `${stock}|${str(lower.year) ?? ''}|${model ?? ''}` ?? listing_url ?? `${make}|${model}`;
      out.push({
        id, vin: vin ?? null, stock: stock ?? null,
        year: num(lower.year), make: make ?? null, model: model ?? null,
        trim: str(lower.trim), price: num(pick(o, PRICE_KEYS)), mileage: num(pick(o, MILE_KEYS)),
        color: str(pick(o, COLOR_KEYS)), body_type: str(pick(o, BODY_KEYS)),
        seats: num(lower.seats ?? lower.seatingcapacity), features: [],
        photo_url: abs(typeof photo === 'object' && photo ? (photo as Record<string, unknown>).url : photo, baseUrl),
        listing_url,
        condition: /new/i.test(str(lower.condition) ?? '') ? 'new' : /used|cpo|certified/i.test(str(lower.condition) ?? '') ? 'used' : null,
      });
      continue; // don't descend into a matched vehicle
    }
    for (const k of Object.keys(o)) { const child = o[k]; if (child && typeof child === 'object') stack.push(child); }
  }
}

function parseHtmlCards(html: string, baseUrl: string): VehicleListing[] {
  const out: VehicleListing[] = [];
  const seen = new Set<string>();
  const anchorRe = /<a\b[^>]*href=["']([^"']*(?:inventory|vehicle|vdp|detail)[^"']*)["'][^>]*>/gi;
  let m: RegExpExecArray | null;
  while ((m = anchorRe.exec(html)) && out.length < MAX_VEHICLES) {
    const href = abs(m[1], baseUrl);
    if (!href || seen.has(href)) continue;
    const window = html.slice(m.index, m.index + 3000);
    const title = window.match(/((?:19|20)\d{2})\s+([A-Z][\w-]+)(?:\s+([\w.-]+(?:\s+[\w.-]+){0,2}))?/);
    if (!title) continue;
    seen.add(href);
    const priceM = window.match(/\$\s?([\d,]{4,9})/);
    const price = priceM ? num(priceM[1]) : null;
    const mileM = window.match(/([\d,]+)\s*mi(?:les)?\b/i);
    const mileage = mileM ? num(mileM[1]) : null;
    const stockM = window.match(/stock\s*#?:?\s*([A-Z0-9-]{3,})/i);
    const imgM = window.match(/<img\b[^>]*\bsrc=["']([^"']+)["']/i);
    if (price != null && (price < 2000 || price > 250000)) continue;
    out.push({
      id: href, vin: null, stock: stockM ? stockM[1] : null,
      year: parseInt(title[1], 10), make: title[2], model: title[3] ?? null, trim: null,
      price, mileage, color: null, body_type: null, seats: null, features: [],
      photo_url: imgM ? abs(imgM[1], baseUrl) : null, listing_url: href, condition: null,
    });
  }
  return out;
}

function normalizeListings(all: VehicleListing[]): VehicleListing[] {
  const byId = new Map<string, VehicleListing>();
  for (const v of all) {
    if (!(v.make || v.model)) continue;
    if (v.price == null && !v.listing_url) continue;
    const id = v.id || v.vin || v.listing_url || `${v.year ?? ''}|${v.make ?? ''}|${v.model ?? ''}`;
    if (!byId.has(id)) byId.set(id, { ...v, id });
  }
  return [...byId.values()].slice(0, MAX_VEHICLES);
}

function parsePage(html: string, baseUrl: string): { vehicles: VehicleListing[]; parser: string } {
  let vehicles = normalizeListings(parseJsonLd(html, baseUrl));
  if (vehicles.length) return { vehicles, parser: 'jsonld' };
  vehicles = normalizeListings(parseEmbeddedJson(html, baseUrl));
  if (vehicles.length) return { vehicles, parser: 'embedded' };
  vehicles = normalizeListings(parseHtmlCards(html, baseUrl));
  if (vehicles.length) return { vehicles, parser: 'html' };
  return { vehicles: [], parser: 'none' };
}

// ---------------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------------

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json({ error: 'method not allowed' }, 405);

  const auth = req.headers.get('Authorization') ?? '';
  const jwt = auth.replace(/^Bearer\s+/i, '');
  if (!jwt) return json({ error: 'no jwt' }, 401);

  const authClient = createClient(SUPABASE_URL, SERVICE_ROLE, { global: { headers: { Authorization: `Bearer ${jwt}` } } });
  const { data: userData, error: userErr } = await authClient.auth.getUser(jwt);
  if (userErr || !userData?.user) return json({ error: 'invalid jwt' }, 401);

  let body: { url?: string };
  try { body = await req.json(); } catch { return json({ error: 'bad json' }, 400); }
  const rawUrl = String(body?.url ?? '').trim();
  if (!rawUrl) return json({ error: 'url required' }, 400);

  const check = validateInventoryUrl(rawUrl);
  if (!check.ok) return json({ error: check.reason }, 400);

  try {
    const origin = check.url.origin;
    const firstPath = check.url.pathname !== '/' ? check.url.href : null;
    const candidates = [firstPath, ...COMMON_PATHS.map(p => origin + p)].filter(Boolean) as string[];
    // De-dupe while preserving order, cap page count.
    const tried: string[] = [];
    let vehicles: VehicleListing[] = [];
    let parser = 'none';
    let truncated = false;
    let sourceUrl = check.url.href;

    for (const cand of [...new Set(candidates)].slice(0, MAX_PAGES)) {
      tried.push(cand);
      try {
        const { html, finalUrl, truncated: t } = await safeFetch(cand);
        const res = parsePage(html, finalUrl);
        if (res.vehicles.length) { vehicles = res.vehicles; parser = res.parser; truncated = t; sourceUrl = finalUrl; break; }
      } catch (_e) {
        // A failed page is skipped, not fatal — try the next candidate.
        continue;
      }
    }

    return json({ ok: true, vehicles, parser, source_url: sourceUrl, pages_tried: tried, truncated });
  } catch (e) {
    return json({ ok: false, error: e instanceof Error ? e.message : 'inventory fetch failed' }, 502);
  }
});

function json(bodyOut: unknown, status = 200): Response {
  return new Response(JSON.stringify(bodyOut), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });
}
