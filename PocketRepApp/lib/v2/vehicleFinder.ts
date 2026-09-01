// Vehicle Finder — client orchestration (impure companion to vehicleMatch.ts).
//
// Ties the three moving parts together: AI requirement extraction (reuses the
// deployed ai-proxy /brain — auth + throttle + daily cap for free), the
// inventory-search edge function (COMMITTED, NOT DEPLOYED — 404s until the owner
// deploys, which the modal handles), and the pure scoring engine. Behind
// EXPO_PUBLIC_VEHICLE_FINDER; nothing here runs until the modal/Rex action
// (both flag-gated) call it.

import { Platform } from 'react-native';
import { supabase } from '@/lib/supabase';
import { callBrain } from './aiProxy';
import { frameUntrusted } from './promptSafety';
import { getRepSetting } from './repSettings';
import {
  extractRequirementsRegex,
  mergeRequirements,
  scoreVehicles,
  pickAlternatives,
  TOP_MATCH_MIN_PCT,
  MAX_TOP_MATCHES,
  type VehicleRequirements,
  type VehicleListing,
  type ScoredVehicle,
  type AlternativePick,
} from './vehicleMatch';

const FUNCTIONS_BASE = 'https://fwvrauqdoevwmwwqlfav.supabase.co/functions/v1';

const CACHE_KEY = 'pocketrep:v2:inventory-cache';
const CACHE_TTL_MS = 3_600_000; // 1h
const CACHE_MAX_URLS = 3;
const CACHE_MAX_BYTES = 400_000;

export type VehicleSearchResult = {
  requirements: VehicleRequirements;
  matches: ScoredVehicle[];
  alternatives: AlternativePick[];
  source_url: string;
  parser: string;
  from_cache: boolean;
  total_parsed: number;
};

// Coded errors the modal maps to specific copy.
export class VehicleFinderError extends Error {
  constructor(public code: 'no_url' | 'bad_url' | 'unreachable' | 'failed', message: string) {
    super(message);
    this.name = 'VehicleFinderError';
  }
}

// ---------------------------------------------------------------------------
// Requirement extraction — AI merged over the deterministic regex fallback.
// Never throws: any failure (offline, 401, bad JSON) degrades to regex-only.
// ---------------------------------------------------------------------------

const EXTRACT_SYSTEM = [
  "You extract vehicle-shopping requirements from a car sales rep's shorthand note about a customer.",
  'Reply with ONLY one ```json fenced code block and no prose before or after it.',
  'Omit any field the note does not mention — never invent values. Use plain numbers (no "$" or ",").',
  '"500month" or "500/mo" means monthly_budget 500. "3k down" means down_payment 3000. "under 20k" with no /mo is max_price.',
  'Schema (all fields optional):',
  '{',
  '  "monthly_budget": number, "down_payment": number, "credit_score": number,',
  '  "vehicle_type": "suv"|"truck"|"sedan"|"minivan"|"coupe"|"hatchback"|"convertible"|"wagon",',
  '  "min_seats": number,',
  '  "features": string[] using ONLY: remote_start, heated_seats, sunroof, leather, awd, third_row, backup_camera, carplay, android_auto, navigation, tow_package, blind_spot,',
  '  "color_pref": "dark"|"light", "colors": string[], "max_mileage": number, "max_price": number, "condition": "new"|"used"',
  '}',
].join('\n');

function parseFencedJson(reply: string): unknown {
  const fenced = reply.match(/```json\s*([\s\S]*?)```/i) ?? reply.match(/```\s*([\s\S]*?)```/);
  const body = fenced ? fenced[1] : reply;
  return JSON.parse(body.trim());
}

export async function extractRequirements(
  notes: string,
  opts?: { signal?: AbortSignal },
): Promise<VehicleRequirements> {
  const regex = extractRequirementsRegex(notes);
  try {
    const reply = await callBrain({
      tier: 'flash',
      maxTokens: 300,
      signal: opts?.signal,
      messages: [
        { role: 'system', content: EXTRACT_SYSTEM },
        { role: 'user', content: `${frameUntrusted('CUSTOMER NOTE', notes)}\n\nExtract now — the fenced json block only.` },
      ],
    });
    const parsed = parseFencedJson(reply);
    if (parsed && typeof parsed === 'object') {
      return mergeRequirements(regex, parsed as VehicleRequirements);
    }
  } catch {
    // Offline / 401 / bad reply — regex fallback below is the honest floor.
  }
  return regex;
}

// ---------------------------------------------------------------------------
// Saved dealership URL (repSettings 'inventoryFeed' key — shared with Profile)
// ---------------------------------------------------------------------------

export function normalizeInventoryUrl(raw: string): string | null {
  let s = String(raw ?? '').trim();
  if (!s) return null;
  if (!/^[a-z]+:\/\//i.test(s)) s = `https://${s}`;
  let url: URL;
  try { url = new URL(s); } catch { return null; }
  if (url.protocol !== 'https:') return null;
  const host = url.hostname.toLowerCase();
  if (!host.includes('.')) return null;
  if (/^\d+(\.\d+)*$/.test(host) || host === 'localhost') return null; // obvious ip/localhost — server re-checks fully
  return url.href;
}

export function getSavedInventoryUrl(): string {
  return normalizeInventoryUrl(getRepSetting('inventoryFeed')) ?? '';
}

// ---------------------------------------------------------------------------
// Inventory fetch + cache (client-side; edge fn is stateless)
// ---------------------------------------------------------------------------

type CacheEntry = { at: number; vehicles: VehicleListing[]; parser: string; source_url: string };
const memCache = new Map<string, CacheEntry>();

export function resetInventoryCache(): void {
  memCache.clear();
}

function readDiskCache(): Record<string, CacheEntry> {
  if (Platform.OS !== 'web' || typeof localStorage === 'undefined') return {};
  try {
    const v = JSON.parse(localStorage.getItem(CACHE_KEY) ?? '{}');
    return v && typeof v === 'object' ? v : {};
  } catch { return {}; }
}

function writeDiskCache(map: Record<string, CacheEntry>): void {
  if (Platform.OS !== 'web' || typeof localStorage === 'undefined') return;
  // Keep only the freshest CACHE_MAX_URLS, and skip the write if oversized.
  const trimmed = Object.entries(map)
    .sort((a, b) => b[1].at - a[1].at)
    .slice(0, CACHE_MAX_URLS);
  const obj = Object.fromEntries(trimmed);
  try {
    const serialized = JSON.stringify(obj);
    if (serialized.length > CACHE_MAX_BYTES) return;
    localStorage.setItem(CACHE_KEY, serialized);
  } catch { /* quota — skip */ }
}

function cacheGet(url: string): CacheEntry | null {
  const mem = memCache.get(url);
  const fresh = (e: CacheEntry | undefined): e is CacheEntry => !!e && Date.now() - e.at < CACHE_TTL_MS;
  if (fresh(mem)) return mem;
  const disk = readDiskCache()[url];
  if (fresh(disk)) { memCache.set(url, disk); return disk; }
  return null;
}

function cacheSet(url: string, entry: CacheEntry): void {
  memCache.set(url, entry);
  const disk = readDiskCache();
  disk[url] = entry;
  writeDiskCache(disk);
}

export async function fetchInventory(
  dealerUrl: string,
  opts?: { signal?: AbortSignal; force?: boolean },
): Promise<{ vehicles: VehicleListing[]; parser: string; source_url: string; from_cache: boolean }> {
  if (!opts?.force) {
    const cached = cacheGet(dealerUrl);
    if (cached) return { vehicles: cached.vehicles, parser: cached.parser, source_url: cached.source_url, from_cache: true };
  }

  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.access_token) throw new VehicleFinderError('failed', 'not signed in');

  let res: Response;
  try {
    res = await fetch(`${FUNCTIONS_BASE}/inventory-search`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
      body: JSON.stringify({ url: dealerUrl }),
      signal: opts?.signal,
    });
  } catch {
    throw new VehicleFinderError('unreachable', 'could not reach the inventory service');
  }

  if (res.status === 400) {
    const body = await res.json().catch(() => ({}));
    throw new VehicleFinderError('bad_url', body?.error ?? 'that URL was rejected');
  }
  if (!res.ok) {
    // 404 = function not deployed yet (expected pre-deploy); 5xx = fetch/parse failure.
    throw new VehicleFinderError('unreachable', `inventory-search ${res.status}`);
  }

  const body = await res.json().catch(() => null);
  if (!body?.ok) throw new VehicleFinderError('failed', body?.error ?? 'inventory search failed');

  const vehicles: VehicleListing[] = Array.isArray(body.vehicles) ? body.vehicles : [];
  const parser: string = body.parser ?? 'none';
  const source_url: string = body.source_url ?? dealerUrl;
  cacheSet(dealerUrl, { at: Date.now(), vehicles, parser, source_url });
  return { vehicles, parser, source_url, from_cache: false };
}

// ---------------------------------------------------------------------------
// Top-level: requirements -> ranked matches + near-miss alternatives
// ---------------------------------------------------------------------------

export async function findVehicles(input: {
  requirements: VehicleRequirements;
  signal?: AbortSignal;
  force?: boolean;
}): Promise<VehicleSearchResult> {
  const url = getSavedInventoryUrl();
  if (!url) throw new VehicleFinderError('no_url', 'no dealership website saved');

  const { vehicles, parser, source_url, from_cache } = await fetchInventory(url, { signal: input.signal, force: input.force });
  const scored = scoreVehicles(vehicles, input.requirements);

  let matches = scored.filter(s => s.match_pct >= TOP_MATCH_MIN_PCT).slice(0, MAX_TOP_MATCHES);
  // Vehicles parsed but none clear the cutoff: show the best 3 honestly (their
  // real low %), rather than an empty screen implying zero inventory.
  if (matches.length === 0 && scored.length > 0) matches = scored.slice(0, 3);

  const alternatives = pickAlternatives(scored, input.requirements, matches.map(m => m.vehicle.id));

  return {
    requirements: input.requirements,
    matches,
    alternatives,
    source_url,
    parser,
    from_cache,
    total_parsed: vehicles.length,
  };
}
