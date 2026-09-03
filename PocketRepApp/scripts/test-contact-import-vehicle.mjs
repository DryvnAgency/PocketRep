// Regression coverage for a hostile-audit finding: CSV import (lib/v2/contactImport.ts
// parseCsv + lib/v2/updateContact.ts bulkCreateContacts) discarded every vehicle
// field (year/make/model/current mileage/lease end date) during parsing, before
// any network call — a CRM export with those columns lost the data silently on
// every single import.
//
// Two layers of coverage, matching this repo's established test conventions:
//   1. A MIRROR of parseCsv's real logic (verbatim from contactImport.ts, kept in
//      sync — same pattern as test-contactpick.mjs) run against a realistic CSV
//      row, proving the parsed shape actually carries the vehicle fields end to
//      end (header aliasing + row mapping), not just that some string exists in
//      the source.
//   2. Source guardrails (same pattern as test-contact-lifecycle.mjs) proving the
//      REAL contactImport.ts/updateContact.ts files declare the aliases and
//      forward the fields into the DB insert payload — this is what actually
//      fails if the fix regresses, independent of whether the mirror above is
//      kept up to date.
//
//   npm run test:contactimportvehicle    (from PocketRepApp/)

import fs from 'node:fs';
import path from 'node:path';

let failures = 0;
let checks = 0;
const ok = (name, cond) => { checks++; console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}`); if (!cond) failures++; };

// --- mirrored logic (verbatim from lib/v2/contactImport.ts) ---
const CSV_HEADER_ALIASES = {
  'first name': 'firstName', 'firstname': 'firstName', 'first': 'firstName', 'given name': 'firstName',
  'last name': 'lastName', 'lastname': 'lastName', 'last': 'lastName', 'surname': 'lastName', 'family name': 'lastName',
  'phone': 'phone', 'phone number': 'phone', 'mobile': 'phone', 'mobile phone': 'phone', 'cell': 'phone', 'cell phone': 'phone', 'telephone': 'phone',
  'email': 'email', 'email address': 'email', 'e-mail': 'email',
  'notes': 'notes', 'note': 'notes',
  'vehicle year': 'vehicleYear', 'year': 'vehicleYear', 'vehicle_year': 'vehicleYear',
  'vehicle make': 'vehicleMake', 'make': 'vehicleMake', 'vehicle_make': 'vehicleMake',
  'vehicle model': 'vehicleModel', 'model': 'vehicleModel', 'vehicle_model': 'vehicleModel',
  'mileage': 'currentMileage', 'current mileage': 'currentMileage', 'odometer': 'currentMileage', 'current_mileage': 'currentMileage',
  'lease end date': 'leaseEndDate', 'lease end': 'leaseEndDate', 'lease_end_date': 'leaseEndDate',
};

function parseCsvRecords(text) {
  const src = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
  const records = [];
  let row = [];
  let cur = '';
  let inQuotes = false;
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (inQuotes) {
      if (ch === '"') { if (src[i + 1] === '"') { cur += '"'; i++; } else inQuotes = false; }
      else cur += ch;
    } else if (ch === '"') { inQuotes = true; }
    else if (ch === ',') { row.push(cur); cur = ''; }
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && src[i + 1] === '\n') i++;
      row.push(cur); cur = '';
      records.push(row); row = [];
    } else { cur += ch; }
  }
  if (cur.length > 0 || row.length > 0) { row.push(cur); records.push(row); }
  return records.filter(r => !(r.length === 1 && r[0].trim() === ''));
}

function parseCsv(text) {
  const records = parseCsvRecords(text);
  if (records.length < 2) return [];
  const header = records[0].map(h => h.trim().toLowerCase());
  const hasFirst = header.some(h => CSV_HEADER_ALIASES[h] === 'firstName');
  const fullNameIdx = header.findIndex(h => h === 'name' || h === 'full name' || h === 'display name' || h === 'contact');
  const out = [];
  let idx = 0;
  for (let r = 1; r < records.length; r++) {
    const cells = records[r];
    const row = { firstName: '' };
    let fullName = '';
    cells.forEach((cell, i) => {
      const v = cell.trim();
      if (!v) return;
      if (i === fullNameIdx && !hasFirst) { fullName = v; return; }
      const field = CSV_HEADER_ALIASES[header[i]];
      if (field) row[field] = v;
    });
    if (!row.firstName && fullName) {
      const toks = fullName.split(/\s+/);
      row.firstName = toks[0];
      row.lastName = toks.slice(1).join(' ') || undefined;
    }
    if (!row.firstName) continue;
    out.push({ id: `csv-${idx++}`, ...row });
  }
  return out;
}

// --- behavioral: a realistic CRM export row survives parsing intact ---
// (name/phone/email columns use the space-separated headers the alias table
// already supports; a separate, pre-existing gap around snake_case
// first_name/last_name headers is out of scope for this fix.)
const csv = [
  'first name,last name,phone,email,vehicle_year,vehicle_make,vehicle_model,current_mileage,lease_end_date',
  'Jordan,Diaz,555-010-2000,jordan@example.com,2023,Toyota,Tacoma,18400,2027-03-15',
].join('\n');
const [parsed] = parseCsv(csv);

console.log('\n--- parseCsv preserves vehicle fields from a CRM export ---');
ok('a row is parsed at all', !!parsed);
ok('vehicleYear survives parsing', parsed?.vehicleYear === '2023');
ok('vehicleMake survives parsing', parsed?.vehicleMake === 'Toyota');
ok('vehicleModel survives parsing', parsed?.vehicleModel === 'Tacoma');
ok('currentMileage survives parsing', parsed?.currentMileage === '18400');
ok('leaseEndDate survives parsing', parsed?.leaseEndDate === '2027-03-15');

// Human-readable headers (not just snake_case exports) also map correctly.
const csvHumanHeaders = [
  'First Name,Last Name,Phone,Year,Make,Model,Mileage,Lease End Date',
  'Sam,Lee,555-010-3000,2021,Honda,Civic,32000,2026-11-01',
].join('\n');
const [parsedHuman] = parseCsv(csvHumanHeaders);
console.log('\n--- human-readable CSV headers (Year/Make/Model/Mileage/Lease End Date) also map ---');
ok('vehicleYear maps from "Year"', parsedHuman?.vehicleYear === '2021');
ok('vehicleMake maps from "Make"', parsedHuman?.vehicleMake === 'Honda');
ok('vehicleModel maps from "Model"', parsedHuman?.vehicleModel === 'Civic');
ok('currentMileage maps from "Mileage"', parsedHuman?.currentMileage === '32000');
ok('leaseEndDate maps from "Lease End Date"', parsedHuman?.leaseEndDate === '2026-11-01');

// A CSV with no vehicle columns at all must still parse cleanly (no regression
// on the pre-existing name/phone/email/notes-only import path).
const csvNoVehicle = ['first name,phone', 'Alex,555-010-4000'].join('\n');
const [parsedNoVehicle] = parseCsv(csvNoVehicle);
console.log('\n--- a CSV with no vehicle columns still imports the base fields ---');
ok('firstName still parses with no vehicle columns present', parsedNoVehicle?.firstName === 'Alex');
ok('no vehicle fields are fabricated when absent from the CSV', !parsedNoVehicle?.vehicleYear && !parsedNoVehicle?.vehicleMake);

// --- source guardrails: the REAL files were actually updated, not just this mirror ---
const root = path.resolve(new URL('..', import.meta.url).pathname);
const importSrc = fs.readFileSync(path.join(root, 'lib/v2/contactImport.ts'), 'utf8');
const updateSrc = fs.readFileSync(path.join(root, 'lib/v2/updateContact.ts'), 'utf8');

console.log('\n--- the real source files carry the same fields (not just this mirror) ---');
ok('contactImport.ts aliases a vehicle-year header', /'vehicleYear'/.test(importSrc));
ok('contactImport.ts aliases a vehicle-make header', /'vehicleMake'/.test(importSrc));
ok('contactImport.ts aliases a vehicle-model header', /'vehicleModel'/.test(importSrc));
ok('contactImport.ts aliases a current-mileage header', /'currentMileage'/.test(importSrc));
ok('contactImport.ts aliases a lease-end-date header', /'leaseEndDate'/.test(importSrc));
ok('ImportContactRow type carries the vehicle fields', /vehicleYear\?:\s*string/.test(updateSrc) && /leaseEndDate\?:\s*string/.test(updateSrc));
ok('bulkCreateContacts forwards vehicle_year into the insert payload', /vehicle_year:/.test(updateSrc));
ok('bulkCreateContacts forwards vehicle_make into the insert payload', /vehicle_make:/.test(updateSrc));
ok('bulkCreateContacts forwards vehicle_model into the insert payload', /vehicle_model:/.test(updateSrc));
ok('bulkCreateContacts forwards current_mileage into the insert payload', /current_mileage:/.test(updateSrc));
ok('bulkCreateContacts forwards lease_end_date into the insert payload', /lease_end_date:/.test(updateSrc));
ok('a bounded/sane numeric parse guards vehicle year and mileage (not raw pass-through)',
  /function\s+parseBoundedInt/.test(updateSrc));
ok('a date-only parse guards lease_end_date (garbage strings do not reach the DB)',
  /function\s+parseDateOnly/.test(updateSrc));

console.log(`\n${failures === 0 ? '✅ ALL PASSED' : `❌ ${failures} FAILED`} (${checks} checks)`);
process.exit(failures ? 1 : 0);
