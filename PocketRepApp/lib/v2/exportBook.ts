// Export the rep's whole book to a CSV file — "your data, always."
//
// One row per contact, with notes, tags, and a per-contact deal-history
// summary folded in (§26 item: "query public.contacts + notes/tags/deal
// history, build CSV"). Reads are RLS-scoped to the signed-in rep (auth.uid()),
// so we never have to pass user_id by hand — same as useContacts / useDeals.
//
// Platform split:
//   web    -> Blob + <a download> click
//   native -> expo-file-system write + expo-sharing share sheet
// The native modules are lazy-required (string-literal, try/catch) so Metro can
// still bundle web without choking, matching contactPhoto.ts / pushNotifications.ts.

import { Platform } from 'react-native';
import { supabase } from '@/lib/supabase';

// ── Row shapes (only the columns we actually export; all verified live) ──────

type ContactRow = {
  id: string;
  first_name: string | null;
  last_name: string | null;
  phone: string | null;
  email: string | null;
  heat_score: number | null;
  tier_override: string | null;
  stage: string | null;
  rep_decision: string | null;
  preferred_language: string | null;
  vehicle_year: number | null;
  vehicle_make: string | null;
  vehicle_model: string | null;
  trim: string | null;
  vehicle: string | null;
  current_mileage: number | null;
  lease_end_date: string | null;
  budget: string | null;
  trade_in: string | null;
  plan_label: string | null;
  tags: string[] | null;
  next_step: string | null;
  last_contact_date: string | null;
  last_contact_method: string | null;
  next_followup_date: string | null;
  birthday: string | null;
  purchase_date: string | null;
  is_past_customer: boolean | null;
  do_not_contact: boolean | null;
  referred_by_name: string | null;
  notes: string | null;
  created_at: string | null;
};

type DealRow = {
  contact_id: string | null;
  title: string | null;
  vehicle: string | null;
  amount: number | null;
  front_gross: number | null;
  back_gross: number | null;
  closed_at: string | null;
  deal_type: string | null;
  funding: string | null;
  split: boolean | null;
  split_with: string | null;
};

const CONTACT_COLUMNS =
  'id,first_name,last_name,phone,email,heat_score,tier_override,stage,rep_decision,' +
  'preferred_language,vehicle_year,vehicle_make,vehicle_model,trim,vehicle,current_mileage,' +
  'lease_end_date,budget,trade_in,plan_label,tags,next_step,last_contact_date,' +
  'last_contact_method,next_followup_date,birthday,purchase_date,is_past_customer,' +
  'do_not_contact,referred_by_name,notes,created_at';

const DEAL_COLUMNS =
  'contact_id,title,vehicle,amount,front_gross,back_gross,closed_at,deal_type,funding,split,split_with';

export type ExportResult =
  | { ok: true; contactCount: number; dealCount: number; filename: string }
  | { ok: false; reason: string };

// ── Formatting helpers ───────────────────────────────────────────────────────

// RFC-4180 cell: always quote, double up embedded quotes. Quoting every cell
// keeps commas, newlines, and quotes inside notes from shifting columns.
function csvCell(value: unknown): string {
  const s = value === null || value === undefined ? '' : String(value);
  return `"${s.replace(/"/g, '""')}"`;
}

// Free-text cells (notes, deal history) can hold arbitrary text a rep typed.
// Neutralize spreadsheet formula injection (=, +, -, @, leading tab/CR) by
// prefixing a single quote before quoting, so Excel/Sheets treat it as text.
function csvTextCell(value: unknown): string {
  let s = value === null || value === undefined ? '' : String(value);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return csvCell(s);
}

function tierLabel(c: ContactRow): string {
  const override = c.tier_override?.trim();
  if (override) {
    // Map the stored key to a friendly label; pass through anything custom.
    const map: Record<string, string> = { hot: 'Hot', warm: 'Warm', cold: 'Watch', watch: 'Watch' };
    return map[override.toLowerCase()] ?? override;
  }
  const score = Number(c.heat_score ?? 0);
  if (score >= 80) return 'Hot';
  if (score >= 50) return 'Warm';
  return 'Watch';
}

function yesNo(v: boolean | null | undefined): string {
  return v ? 'Yes' : 'No';
}

function round0(n: number): number {
  return Math.round(n);
}

function money(n: number): string {
  return `$${round0(n).toLocaleString('en-US')}`;
}

// Per-deal vehicle label for the Deal History cell: prefer the deal title,
// fall back to the vehicle field.
function dealVehicle(d: DealRow): string {
  return d.title?.trim() || d.vehicle?.trim() || '';
}

type DealSummary = {
  count: number;
  totalFront: number;
  totalBack: number;
  totalCommission: number;
  lastDealDate: string;
  history: string;
};

function summarizeDeals(deals: DealRow[]): DealSummary {
  let totalFront = 0;
  let totalBack = 0;
  let totalCommission = 0;
  let lastDealDate = '';
  // newest first for the history text + last-deal-date
  const sorted = [...deals].sort((a, b) => (b.closed_at ?? '').localeCompare(a.closed_at ?? ''));
  for (const d of sorted) {
    totalFront += Number(d.front_gross ?? 0);
    totalBack += Number(d.back_gross ?? 0);
    totalCommission += Number(d.amount ?? 0);
    if (d.closed_at && d.closed_at > lastDealDate) lastDealDate = d.closed_at;
  }
  const history = sorted
    .map(d => {
      const bits: string[] = [];
      if (d.closed_at) bits.push(d.closed_at);
      if (d.deal_type) bits.push(d.deal_type);
      const veh = dealVehicle(d);
      if (veh) bits.push(veh);
      if (d.funding) bits.push(d.funding);
      const gross: string[] = [];
      if (d.front_gross != null) gross.push(`front ${money(Number(d.front_gross))}`);
      if (d.back_gross != null) gross.push(`back ${money(Number(d.back_gross))}`);
      if (d.amount != null) gross.push(`comm ${money(Number(d.amount))}`);
      if (gross.length) bits.push(gross.join(', '));
      if (d.split) bits.push(d.split_with ? `split w/ ${d.split_with}` : 'split');
      return bits.join(' · ');
    })
    .join('  |  ');
  return {
    count: deals.length,
    totalFront: round0(totalFront),
    totalBack: round0(totalBack),
    totalCommission: round0(totalCommission),
    lastDealDate,
    history,
  };
}

// ── CSV builder (pure) ───────────────────────────────────────────────────────

const HEADERS = [
  'First Name', 'Last Name', 'Phone', 'Email',
  'Tier', 'Heat Score', 'Stage', 'Rep Decision', 'Preferred Language',
  'Vehicle Year', 'Vehicle Make', 'Vehicle Model', 'Trim', 'Vehicle (free text)',
  'Current Mileage', 'Lease End Date', 'Budget', 'Trade-In', 'Plan Label',
  'Tags', 'Next Step', 'Last Contact Date', 'Last Contact Method',
  'Next Follow-Up Date', 'Birthday', 'Purchase Date',
  'Past Customer', 'Do Not Contact', 'Referred By',
  'Notes',
  'Deals Count', 'Total Front Gross', 'Total Back Gross', 'Total Commission',
  'Last Deal Date', 'Deal History',
  'Added On',
];

export function buildBookCsv(contacts: ContactRow[], deals: DealRow[]): string {
  const dealsByContact = new Map<string, DealRow[]>();
  for (const d of deals) {
    if (!d.contact_id) continue; // orphan deals (no linked contact) are out of a contact-book export
    const arr = dealsByContact.get(d.contact_id);
    if (arr) arr.push(d);
    else dealsByContact.set(d.contact_id, [d]);
  }

  const lines: string[] = [HEADERS.map(csvCell).join(',')];

  for (const c of contacts) {
    const ds = summarizeDeals(dealsByContact.get(c.id) ?? []);
    const tags = Array.isArray(c.tags) ? c.tags.join('; ') : '';
    const row = [
      csvCell(c.first_name),
      csvCell(c.last_name),
      csvTextCell(c.phone), // phone can have a leading "+"
      csvCell(c.email),
      csvCell(tierLabel(c)),
      csvCell(c.heat_score == null ? '' : round0(Number(c.heat_score))),
      csvCell(c.stage),
      csvCell(c.rep_decision),
      csvCell(c.preferred_language),
      csvCell(c.vehicle_year ?? ''),
      csvCell(c.vehicle_make),
      csvCell(c.vehicle_model),
      csvCell(c.trim),
      csvTextCell(c.vehicle),
      csvCell(c.current_mileage ?? ''),
      csvCell(c.lease_end_date),
      csvTextCell(c.budget),
      csvTextCell(c.trade_in),
      csvCell(c.plan_label),
      csvCell(tags),
      csvTextCell(c.next_step),
      csvCell(c.last_contact_date),
      csvCell(c.last_contact_method),
      csvCell(c.next_followup_date),
      csvCell(c.birthday),
      csvCell(c.purchase_date),
      csvCell(yesNo(c.is_past_customer)),
      csvCell(yesNo(c.do_not_contact)),
      csvCell(c.referred_by_name),
      csvTextCell(c.notes),
      csvCell(ds.count),                 // plain numbers stay spreadsheet-summable
      csvCell(ds.totalFront),
      csvCell(ds.totalBack),
      csvCell(ds.totalCommission),
      csvCell(ds.lastDealDate),
      csvTextCell(ds.history),
      csvCell(c.created_at ? c.created_at.slice(0, 10) : ''),
    ];
    lines.push(row.join(','));
  }

  // CRLF line endings + UTF-8 BOM so Excel opens accented names correctly.
  return '﻿' + lines.join('\r\n');
}

// ── Data fetch (RLS-scoped) ──────────────────────────────────────────────────

async function fetchBook(): Promise<
  { ok: true; contacts: ContactRow[]; deals: DealRow[] } | { ok: false; reason: string }
> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, reason: 'not signed in' };

  const [{ data: contacts, error: cErr }, { data: deals, error: dErr }] = await Promise.all([
    supabase
      .from('contacts')
      .select(CONTACT_COLUMNS)
      .eq('is_deleted', false)
      .order('last_name', { ascending: true })
      .order('first_name', { ascending: true }),
    supabase
      .from('deals')
      .select(DEAL_COLUMNS),
  ]);

  if (cErr) return { ok: false, reason: cErr.message };
  if (dErr) return { ok: false, reason: dErr.message };

  return {
    ok: true,
    contacts: (contacts ?? []) as unknown as ContactRow[],
    deals: (deals ?? []) as unknown as DealRow[],
  };
}

// ── Platform-specific save ────────────────────────────────────────────────────

function downloadCsvWeb(csv: string, filename: string): void {
  // text/csv + BOM already in `csv`; Blob keeps it as a file download.
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.style.display = 'none';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  // give the click a tick before revoking on slower browsers
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

async function saveAndShareNative(csv: string, filename: string): Promise<void> {
  // string-literal requires for Metro; guarded so web never resolves these at runtime
  let FileSystem: any = null;
  let Sharing: any = null;
  try { FileSystem = require('expo-file-system'); } catch { /* noop */ }
  try { Sharing = require('expo-sharing'); } catch { /* noop */ }
  if (!FileSystem) throw new Error('file system unavailable');

  const dir = FileSystem.cacheDirectory ?? FileSystem.documentDirectory;
  const uri = `${dir}${filename}`;
  await FileSystem.writeAsStringAsync(uri, csv, { encoding: FileSystem.EncodingType.UTF8 });

  if (Sharing && (await Sharing.isAvailableAsync())) {
    await Sharing.shareAsync(uri, {
      mimeType: 'text/csv',
      dialogTitle: 'Export your book',
      UTI: 'public.comma-separated-values-text',
    });
  }
}

function makeFilename(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `pocketrep-book-${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}.csv`;
}

// ── Public entry point ────────────────────────────────────────────────────────

export async function exportBook(): Promise<ExportResult> {
  const fetched = await fetchBook();
  if (!fetched.ok) return { ok: false, reason: fetched.reason };

  const { contacts, deals } = fetched;
  if (contacts.length === 0) {
    return { ok: false, reason: 'Your book is empty — add a contact first.' };
  }

  const csv = buildBookCsv(contacts, deals);
  const filename = makeFilename();

  try {
    if (Platform.OS === 'web' && typeof document !== 'undefined') {
      downloadCsvWeb(csv, filename);
    } else {
      await saveAndShareNative(csv, filename);
    }
  } catch (e: any) {
    return { ok: false, reason: e?.message ?? 'export failed' };
  }

  const dealCount = deals.filter(d => !!d.contact_id).length;
  return { ok: true, contactCount: contacts.length, dealCount, filename };
}
