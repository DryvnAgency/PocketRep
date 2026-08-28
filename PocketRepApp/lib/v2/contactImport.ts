// "Upload contacts from phone" — parsing + dedupe + import core for the Contacts
// tab import flow. Deliberately dependency-free and web-first: the device picker
// uses the browser Contacts Picker API (navigator.contacts) where available, and
// the universal fallback is vCard / CSV text (from a file or pasted), so nothing
// new is added to the native bundle and the parsers are unit-testable in Node.

import { bulkCreateContacts, type ImportContactRow } from './updateContact';

// A parsed candidate. `id` is a client-only key for the review list (not a DB id).
export type ParsedImportContact = ImportContactRow & { id: string };

// ---------------------------------------------------------------------------
// vCard (.vcf) — minimal reader covering vCard 2.1 / 3.0 / 4.0.
// ---------------------------------------------------------------------------
function unescapeVCard(v: string): string {
  return v
    .replace(/\\n/gi, '\n')
    .replace(/\\,/g, ',')
    .replace(/\\;/g, ';')
    .replace(/\\\\/g, '\\');
}

export function parseVCard(text: string): ParsedImportContact[] {
  const out: ParsedImportContact[] = [];
  const blocks = text.split(/BEGIN:VCARD/i).slice(1);
  let idx = 0;
  for (const block of blocks) {
    const body = block.split(/END:VCARD/i)[0] ?? '';
    // RFC line-folding: a CRLF/LF followed by a space or tab continues the line.
    const unfolded = body.replace(/\r\n[ \t]/g, '').replace(/\n[ \t]/g, '');
    const lines = unfolded.split(/\r\n|\n|\r/).map(l => l.trim()).filter(Boolean);

    let fn = '', given = '', family = '', tel = '', email = '', note = '';
    for (const line of lines) {
      const ci = line.indexOf(':');
      if (ci < 0) continue;
      const key = line.slice(0, ci).split(';')[0].toUpperCase();
      const value = line.slice(ci + 1).trim();
      if (key === 'FN' && !fn) fn = unescapeVCard(value);
      else if (key === 'N' && !given && !family) {
        const parts = value.split(';');
        family = unescapeVCard((parts[0] ?? '').trim());
        given = unescapeVCard((parts[1] ?? '').trim());
      } else if (key === 'TEL' && !tel) tel = value.replace(/^tel:/i, '').trim();
      else if (key === 'EMAIL' && !email) email = value.replace(/^mailto:/i, '').trim();
      else if (key === 'NOTE' && !note) note = unescapeVCard(value);
    }

    let firstName = given;
    let lastName = family;
    if (!firstName && fn) {
      const toks = fn.split(/\s+/);
      firstName = toks[0] ?? '';
      if (!lastName) lastName = toks.slice(1).join(' ');
    }
    if (!firstName && !lastName) continue; // empty / nameless card
    out.push({
      id: `vcf-${idx++}`,
      firstName: firstName || 'Unknown',
      lastName: lastName || undefined,
      phone: tel || undefined,
      email: email || undefined,
      notes: note || undefined,
    });
  }
  return out;
}

// ---------------------------------------------------------------------------
// CSV — header-mapped reader (ported from the legacy V1 import screen).
// ---------------------------------------------------------------------------
// Quote-aware scan over the WHOLE text (RFC 4180): a newline inside a quoted
// field is field content, not a record break — so a multi-line Notes/address
// column doesn't get torn into phantom rows. Strips a leading UTF-8 BOM.
function parseCsvRecords(text: string): string[][] {
  const src = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
  const records: string[][] = [];
  let row: string[] = [];
  let cur = '';
  let inQuotes = false;
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (inQuotes) {
      if (ch === '"') {
        if (src[i + 1] === '"') { cur += '"'; i++; } else inQuotes = false;
      } else cur += ch;
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ',') {
      row.push(cur); cur = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && src[i + 1] === '\n') i++; // CRLF = one break
      row.push(cur); cur = '';
      records.push(row); row = [];
    } else {
      cur += ch;
    }
  }
  if (cur.length > 0 || row.length > 0) { row.push(cur); records.push(row); }
  // Drop fully-empty records (blank lines between rows).
  return records.filter(r => !(r.length === 1 && r[0].trim() === ''));
}

const CSV_HEADER_ALIASES: Record<string, keyof ImportContactRow> = {
  'first name': 'firstName', 'firstname': 'firstName', 'first': 'firstName', 'given name': 'firstName',
  'last name': 'lastName', 'lastname': 'lastName', 'last': 'lastName', 'surname': 'lastName', 'family name': 'lastName',
  'phone': 'phone', 'phone number': 'phone', 'mobile': 'phone', 'mobile phone': 'phone', 'cell': 'phone', 'cell phone': 'phone', 'telephone': 'phone',
  'email': 'email', 'email address': 'email', 'e-mail': 'email',
  'notes': 'notes', 'note': 'notes',
};

export function parseCsv(text: string): ParsedImportContact[] {
  const records = parseCsvRecords(text);
  if (records.length < 2) return [];
  const header = records[0].map(h => h.trim().toLowerCase());
  const hasFirst = header.some(h => CSV_HEADER_ALIASES[h] === 'firstName');
  const fullNameIdx = header.findIndex(h => h === 'name' || h === 'full name' || h === 'display name' || h === 'contact');

  const out: ParsedImportContact[] = [];
  let idx = 0;
  for (let r = 1; r < records.length; r++) {
    const cells = records[r];
    const row: ImportContactRow = { firstName: '' };
    let fullName = '';
    cells.forEach((cell, i) => {
      const v = cell.trim();
      if (!v) return;
      if (i === fullNameIdx && !hasFirst) { fullName = v; return; }
      const field = CSV_HEADER_ALIASES[header[i]];
      if (field) (row as Record<string, string>)[field] = v;
    });
    if (!row.firstName && fullName) {
      const toks = fullName.split(/\s+/);
      row.firstName = toks[0];
      row.lastName = toks.slice(1).join(' ') || undefined;
    }
    if (!row.firstName) continue; // a contact with no name is unusable — skip
    out.push({ id: `csv-${idx++}`, ...row });
  }
  return out;
}

// Auto-detect vCard vs CSV from the filename or content.
export function parseContactsText(text: string, filename = ''): ParsedImportContact[] {
  const looksVcf = /\.vcf$/i.test(filename) || /BEGIN:VCARD/i.test(text);
  return looksVcf ? parseVCard(text) : parseCsv(text);
}

// ---------------------------------------------------------------------------
// Device picker — browser Contacts Picker API (no dependency). Chromium-mobile
// only; callers must feature-detect and fall back to file/paste otherwise.
// ---------------------------------------------------------------------------
export function isDevicePickerSupported(): boolean {
  return typeof navigator !== 'undefined'
    && !!(navigator as any).contacts
    && typeof (navigator as any).contacts.select === 'function';
}

export async function pickFromDevice(): Promise<ParsedImportContact[]> {
  if (!isDevicePickerSupported()) throw new Error('Contact picker is not supported on this device');
  const selected: any[] = await (navigator as any).contacts.select(['name', 'tel', 'email'], { multiple: true });
  return selected.map((c, idx) => {
    const fullName = String((Array.isArray(c.name) ? c.name[0] : c.name) ?? '').trim();
    const toks = fullName.split(/\s+/);
    const tel = String((Array.isArray(c.tel) ? c.tel[0] : c.tel) ?? '').trim();
    const email = String((Array.isArray(c.email) ? c.email[0] : c.email) ?? '').trim();
    return {
      id: `dev-${idx}`,
      firstName: toks[0] || 'Unknown',
      lastName: toks.slice(1).join(' ') || undefined,
      phone: tel || undefined,
      email: email || undefined,
    };
  });
}

// ---------------------------------------------------------------------------
// Single-contact picker for the Add-Contact card ("Add from phone"). Unlike the
// bulk importer above, this returns ONE contact's core fields to prefill the
// new-contact form, and it prefers a TRUE NATIVE picker:
//   • Native build (iOS/Android): expo-contacts presentContactPickerAsync() — the
//     OS contact sheet. Lazy-required so web / Expo Go / Node tests (where the
//     native module isn't bundled) never crash; absence => caller hides the button.
//   • Web: the browser Contacts Picker API (navigator.contacts), single-select, so
//     the web demo on Android Chrome still works.
// Field mapping mirrors the bulk path (first phone / first email; a single display
// name split into first + last on whitespace).
// ---------------------------------------------------------------------------

// The subset of NewContactDraft fields the Add-Contact form prefills from a pick.
export type DeviceContactDraft = {
  firstName: string;
  lastName?: string;
  phone?: string;
  email?: string;
};

// `document` exists in a browser / react-native-web runtime but not on native RN,
// so it cleanly separates the web build from a native build — the same signal the
// import modal uses for its <input type=file> fallback.
function isWebRuntime(): boolean {
  return typeof document !== 'undefined';
}

// Lazy require: the native module is absent on web / Expo Go / in Node. tsc never
// module-resolves require() calls, so this stays green even with no native build.
function loadExpoContacts(): any | null {
  try { return require('expo-contacts'); } catch { return null; }
}

// Split a single display name into first + last (mirrors parseVCard's FN split).
function splitDisplayName(full: string): { firstName: string; lastName?: string } {
  const toks = full.trim().split(/\s+/).filter(Boolean);
  return { firstName: toks[0] ?? '', lastName: toks.slice(1).join(' ') || undefined };
}

// Map an expo-contacts Contact into the form draft.
function mapNativeContact(c: any): DeviceContactDraft {
  let firstName = String(c?.firstName ?? '').trim();
  let lastName: string | undefined = String(c?.lastName ?? '').trim() || undefined;
  if (!firstName) {
    const split = splitDisplayName(String(c?.name ?? ''));
    firstName = split.firstName;
    lastName = lastName ?? split.lastName;
  }
  // `||` (not `??`): iOS can return a PhoneNumber whose `number` is an empty
  // string while `digits` holds the real value — an empty `number` must fall
  // through to `digits`, not win the coalesce.
  const phone = String(c?.phoneNumbers?.[0]?.number || c?.phoneNumbers?.[0]?.digits || '').trim();
  const email = String(c?.emails?.[0]?.email ?? '').trim();
  return { firstName: firstName || 'Unknown', lastName, phone: phone || undefined, email: email || undefined };
}

// Map a browser Contacts Picker record (fields arrive as arrays) into the draft.
function mapWebContact(c: any): DeviceContactDraft {
  const { firstName, lastName } = splitDisplayName(
    String((Array.isArray(c?.name) ? c.name[0] : c?.name) ?? '').trim(),
  );
  const phone = String((Array.isArray(c?.tel) ? c.tel[0] : c?.tel) ?? '').trim();
  const email = String((Array.isArray(c?.email) ? c.email[0] : c?.email) ?? '').trim();
  return { firstName: firstName || 'Unknown', lastName, phone: phone || undefined, email: email || undefined };
}

// True when a single-contact picker can actually run in THIS runtime, so callers
// feature-detect and hide the button otherwise (iOS Safari, desktop, Expo Go).
export function isDeviceContactPickerSupported(): boolean {
  if (isWebRuntime()) {
    return typeof navigator !== 'undefined'
      && !!(navigator as any).contacts
      && typeof (navigator as any).contacts.select === 'function';
  }
  const C = loadExpoContacts();
  return !!C && typeof C.presentContactPickerAsync === 'function';
}

// Present the picker and return ONE mapped contact, or null if the user cancels.
// Throws only when no picker exists in this runtime (callers guard with
// isDeviceContactPickerSupported and treat cancel/abort as a silent no-op).
export async function pickOneFromDevice(): Promise<DeviceContactDraft | null> {
  if (isWebRuntime()) {
    const navAny = typeof navigator !== 'undefined' ? (navigator as any) : null;
    if (!navAny?.contacts?.select) throw new Error('Contact picker is not supported on this device');
    const sel = await navAny.contacts.select(['name', 'tel', 'email'], { multiple: false });
    const c = Array.isArray(sel) ? sel[0] : sel;
    return c ? mapWebContact(c) : null; // empty selection = user cancelled
  }
  const C = loadExpoContacts();
  if (!C || typeof C.presentContactPickerAsync !== 'function') {
    throw new Error('Contact picker is not available in this build');
  }
  const c = await C.presentContactPickerAsync(); // resolves to null on cancel
  return c ? mapNativeContact(c) : null;
}

// ---------------------------------------------------------------------------
// Dedupe keys. phoneKey uses the LAST 10 digits so different dialing formats of
// the same number match (+1… / 00 1… / local), instead of only stripping a NANP
// leading 1; nameKey collapses case + whitespace. The review UI uses these to
// flag matches: a phone match is a strong duplicate (pre-unchecked), a name-only
// match against the book is just informational (stays checked — two people can
// share a name), and any repeat WITHIN the imported batch is pre-unchecked.
// ---------------------------------------------------------------------------
export function phoneKey(p?: string | null): string {
  const d = (p ?? '').replace(/\D/g, '');
  return d.length >= 10 ? d.slice(-10) : d;
}

export function nameKey(n?: string | null): string {
  return (n ?? '').trim().toLowerCase().replace(/\s+/g, ' ');
}

export function fullNameOf(c: { firstName?: string; lastName?: string }): string {
  return [c.firstName, c.lastName].filter(Boolean).join(' ');
}

// Persist the chosen rows. Thin pass-through to the bulk inserter; returns count.
export async function importSelected(rows: ParsedImportContact[]): Promise<number> {
  return bulkCreateContacts(rows);
}
