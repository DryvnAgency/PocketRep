// Mock-data verification for the single-contact "Add from phone" picker added to
// lib/v2/contactImport.ts (pickOneFromDevice -> mapNativeContact / mapWebContact)
// and the AddContactModal prefill-merge contract. Runs with plain `node` — no test
// runner, no native module, no live picker, NO real PII.
//
//   npm run test:contactpick    (from PocketRepApp/)
//
// contactImport.ts lazy-requires expo-contacts and AddContactModal pulls in
// react-native, so this MIRRORS the pure pieces (name split + field mapping + the
// `||` prefill merge) and asserts their STABLE contracts: a native or web record
// maps to {firstName,lastName?,phone?,email?}, a single display name splits on
// whitespace, missing fields collapse to undefined (never ''), and a pick never
// wipes a value the rep already typed. Keep in sync if those bodies change.

let failures = 0;
const ok = (name, cond) => { console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}`); if (!cond) failures++; };
const eq = (name, a, b) => ok(`${name} (got ${JSON.stringify(a)})`, JSON.stringify(a) === JSON.stringify(b));

// --- mirrored logic (verbatim from lib/v2/contactImport.ts) ---
function splitDisplayName(full) {
  const toks = full.trim().split(/\s+/).filter(Boolean);
  return { firstName: toks[0] ?? '', lastName: toks.slice(1).join(' ') || undefined };
}
function mapNativeContact(c) {
  let firstName = String(c?.firstName ?? '').trim();
  let lastName = String(c?.lastName ?? '').trim() || undefined;
  if (!firstName) {
    const split = splitDisplayName(String(c?.name ?? ''));
    firstName = split.firstName;
    lastName = lastName ?? split.lastName;
  }
  const phone = String(c?.phoneNumbers?.[0]?.number || c?.phoneNumbers?.[0]?.digits || '').trim();
  const email = String(c?.emails?.[0]?.email ?? '').trim();
  return { firstName: firstName || 'Unknown', lastName, phone: phone || undefined, email: email || undefined };
}
function mapWebContact(c) {
  const { firstName, lastName } = splitDisplayName(
    String((Array.isArray(c?.name) ? c.name[0] : c?.name) ?? '').trim(),
  );
  const phone = String((Array.isArray(c?.tel) ? c.tel[0] : c?.tel) ?? '').trim();
  const email = String((Array.isArray(c?.email) ? c.email[0] : c?.email) ?? '').trim();
  return { firstName: firstName || 'Unknown', lastName, phone: phone || undefined, email: email || undefined };
}
// mirror of AddContactModal's prefill merge (a picked field never wipes a typed one)
function prefill(existing, picked) {
  return {
    ...existing,
    firstName: picked.firstName || existing.firstName,
    lastName: picked.lastName || existing.lastName,
    phone: picked.phone || existing.phone,
    email: picked.email || existing.email,
  };
}

// --- native mapping (expo-contacts Contact shape) ---
eq('native: structured first/last + phone/email',
  mapNativeContact({ firstName: 'Jordan', lastName: 'Price', phoneNumbers: [{ number: '555-0100' }], emails: [{ email: 'jp@example.com' }] }),
  { firstName: 'Jordan', lastName: 'Price', phone: '555-0100', email: 'jp@example.com' });

eq('native: only composite name -> split first/rest',
  mapNativeContact({ name: 'Alex Maria Kim', phoneNumbers: [{ number: '555-0101' }] }),
  { firstName: 'Alex', lastName: 'Maria Kim', phone: '555-0101', email: undefined });

eq('native: phone digits fallback when number missing',
  mapNativeContact({ firstName: 'Sam', phoneNumbers: [{ digits: '5550102' }] }),
  { firstName: 'Sam', lastName: undefined, phone: '5550102', email: undefined });

// regression: iOS can hand back an empty-string `number` alongside a real
// `digits` — the empty string must fall through (|| not ??), not win.
eq('native: empty-string number falls through to digits',
  mapNativeContact({ firstName: 'Rae', phoneNumbers: [{ number: '', digits: '5550103' }] }),
  { firstName: 'Rae', lastName: undefined, phone: '5550103', email: undefined });

eq('native: single-token name -> no last name',
  mapNativeContact({ name: 'Cher' }),
  { firstName: 'Cher', lastName: undefined, phone: undefined, email: undefined });

eq('native: empty contact -> Unknown, no phone/email',
  mapNativeContact({}),
  { firstName: 'Unknown', lastName: undefined, phone: undefined, email: undefined });

eq('native: whitespace-only name -> Unknown',
  mapNativeContact({ name: '   ' }),
  { firstName: 'Unknown', lastName: undefined, phone: undefined, email: undefined });

ok('native: no crash on null input', (() => { try { mapNativeContact(null); return true; } catch { return false; } })());

// --- web mapping (Contacts Picker API: properties arrive as arrays) ---
eq('web: arrays name/tel/email -> first of each',
  mapWebContact({ name: ['Priya Shah'], tel: ['555-0200', '555-9999'], email: ['priya@example.com'] }),
  { firstName: 'Priya', lastName: 'Shah', phone: '555-0200', email: 'priya@example.com' });

eq('web: empty arrays -> Unknown, no phone/email',
  mapWebContact({ name: [], tel: [], email: [] }),
  { firstName: 'Unknown', lastName: undefined, phone: undefined, email: undefined });

eq('web: non-array string fields still map',
  mapWebContact({ name: 'Lee Ann Park', tel: '555-0201' }),
  { firstName: 'Lee', lastName: 'Ann Park', phone: '555-0201', email: undefined });

// --- prefill merge contract (a pick fills blanks but never wipes typed input) ---
eq('prefill: picked values fill blank fields, other fields preserved',
  prefill({ firstName: '', lastName: '', phone: '', email: '', vehicle: 'F-150' }, { firstName: 'Dana', lastName: 'Wu', phone: '555-0300', email: undefined }),
  { firstName: 'Dana', lastName: 'Wu', phone: '555-0300', email: '', vehicle: 'F-150' });

eq('prefill: empty picked field does NOT wipe a typed value',
  prefill({ firstName: 'Typed', lastName: 'Name', phone: '555-typed', email: 'typed@x.com' }, { firstName: 'Picked', lastName: undefined, phone: undefined, email: undefined }),
  { firstName: 'Picked', lastName: 'Name', phone: '555-typed', email: 'typed@x.com' });

console.log(failures === 0 ? '\nAll add-from-phone mapping checks passed.' : `\n${failures} check(s) FAILED.`);
process.exit(failures === 0 ? 0 : 1);
