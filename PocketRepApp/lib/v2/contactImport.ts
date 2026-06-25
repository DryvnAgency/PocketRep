// "Upload contacts from phone" — parsing + dedupe + import core for the Contacts
// tab import flow. Deliberately dependency-free and web-first: the device picker
// uses the browser Contacts Picker API (navigator.contacts) where available, and
// the universal fallback is vCard / CSV text (from a file or pasted), so nothing
// new is added to the native bundle and the parsers are unit-testable in Node.

import { bulkCreateContacts, type ImportContactRow } from './updateContact';
import type { V2Contact } from './useContacts';

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
function parseCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"') {
        if (line[i + 1] === '"') { cur += '"'; i++; } else inQuotes = false;
      } else cur += ch;
    } else if (ch === '"') inQuotes = true;
    else if (ch === ',') { out.push(cur); cur = ''; }
    else cur += ch;
  }
  out.push(cur);
  return out;
}

const CSV_HEADER_ALIASES: Record<string, keyof ImportContactRow> = {
  'first name': 'firstName', 'firstname': 'firstName', 'first': 'firstName', 'given name': 'firstName',
  'last name': 'lastName', 'lastname': 'lastName', 'last': 'lastName', 'surname': 'lastName', 'family name': 'lastName',
  'phone': 'phone', 'phone number': 'phone', 'mobile': 'phone', 'mobile phone': 'phone', 'cell': 'phone', 'cell phone': 'phone', 'telephone': 'phone',
  'email': 'email', 'email address': 'email', 'e-mail': 'email',
  'notes': 'notes', 'note': 'notes',
};

export function parseCsv(text: string): ParsedImportContact[] {
  const lines = text.split(/\r\n|\n|\r/).filter(l => l.trim().length > 0);
  if (lines.length < 2) return [];
  const header = parseCsvLine(lines[0]).map(h => h.trim().toLowerCase());
  const hasFirst = header.some(h => CSV_HEADER_ALIASES[h] === 'firstName');
  const fullNameIdx = header.findIndex(h => h === 'name' || h === 'full name' || h === 'display name' || h === 'contact');

  const out: ParsedImportContact[] = [];
  let idx = 0;
  for (let r = 1; r < lines.length; r++) {
    const cells = parseCsvLine(lines[r]);
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
// Dedupe — normalized phone wins; otherwise normalized full name. Name matches
// are flagged (not blocked) so the rep makes the final call before importing.
// ---------------------------------------------------------------------------
export function normalizePhone(p?: string | null): string {
  const d = (p ?? '').replace(/\D/g, '');
  return d.length === 11 && d.startsWith('1') ? d.slice(1) : d;
}

function normalizeName(n?: string | null): string {
  return (n ?? '').trim().toLowerCase().replace(/\s+/g, ' ');
}

export function isDuplicate(c: ParsedImportContact, existing: V2Contact[]): boolean {
  const cPhone = normalizePhone(c.phone);
  const cName = normalizeName([c.firstName, c.lastName].filter(Boolean).join(' '));
  return existing.some(e => {
    const ePhone = normalizePhone(e.phone);
    if (cPhone && ePhone && cPhone === ePhone) return true;
    if (cName && normalizeName(e.name) === cName) return true;
    return false;
  });
}

// Persist the chosen rows. Thin pass-through to the bulk inserter; returns count.
export async function importSelected(rows: ParsedImportContact[]): Promise<number> {
  return bulkCreateContacts(rows);
}
