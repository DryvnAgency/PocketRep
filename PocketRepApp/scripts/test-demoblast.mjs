// Mock-data verification for the demo-blast simulation (lib/v2/demoBlastSim.ts):
// the 15/30/60s stagger, the once-only "responded" dedup gate, and idempotent
// registration. Runs with plain `node` — no test runner, no network, no PII.
//
//   npm run test:demoblast    (from PocketRepApp/)
//
// demoBlastSim.ts imports react-native + supabase helpers, so this MIRRORS the
// pure pieces verbatim (OFFSETS_MS + index clamp, registerDemoSend dedup, and
// dueEntries) and asserts their stable contracts. Keep in sync with the source.

let failures = 0;
const ok = (name, cond) => { console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}`); if (!cond) failures++; };

// --- mirrored from lib/v2/demoBlastSim.ts (keep in sync) ---------------------
const OFFSETS_MS = [15_000, 30_000, 60_000];
const REPLIES = ['r0', 'r1', 'r2']; // real copy differs; only indexing matters here

function registerDemoSend(store, contactId, nurtureMessageId, index, now) {
  if (!nurtureMessageId) return store;
  if (store.entries.some(e => e.nurtureMessageId === nurtureMessageId)) return store; // dedup
  const i = Math.min(Math.max(index, 0), OFFSETS_MS.length - 1);
  store.entries.push({
    contactId, nurtureMessageId, sentAt: now, offsetMs: OFFSETS_MS[i],
    replyText: REPLIES[i % REPLIES.length], responded: false,
  });
  return store;
}

function dueEntries(store, now) {
  return store.entries.filter(e => !e.responded && now - e.sentAt >= e.offsetMs);
}

// --- stagger: 3 demo sends get 15/30/60s -------------------------------------
const t0 = 1_000_000;
let store = { entries: [] };
registerDemoSend(store, 'c1', 'm1', 0, t0);
registerDemoSend(store, 'c2', 'm2', 1, t0);
registerDemoSend(store, 'c3', 'm3', 2, t0);
ok('stagger: 3 entries registered', store.entries.length === 3);
ok('stagger: offsets are 15/30/60s', store.entries.map(e => e.offsetMs).join(',') === '15000,30000,60000');

// --- index clamp: 4th recipient clamps to the last offset --------------------
registerDemoSend(store, 'c4', 'm4', 3, t0);
ok('clamp: index 3 → 60000', store.entries.find(e => e.nurtureMessageId === 'm4').offsetMs === 60_000);

// --- dedup: same nurtureMessageId never double-registers ----------------------
registerDemoSend(store, 'c1', 'm1', 0, t0);
ok('dedup: m1 registered once', store.entries.filter(e => e.nurtureMessageId === 'm1').length === 1);

// --- registration ignores empty id ------------------------------------------
const before = store.entries.length;
registerDemoSend(store, 'c9', '', 0, t0);
ok('empty id: ignored', store.entries.length === before);

// --- due timing: nothing due before 15s, #1 due at 15s -----------------------
ok('due: none at +14.9s', dueEntries(store, t0 + 14_900).length === 0);
ok('due: only #1 at +15s', dueEntries(store, t0 + 15_000).map(e => e.nurtureMessageId).join() === 'm1');
ok('due: #1+#2 at +30s', dueEntries(store, t0 + 30_000).map(e => e.nurtureMessageId).sort().join() === 'm1,m2');
ok('due: #1+#2+#3+#4 at +60s', dueEntries(store, t0 + 60_000).map(e => e.nurtureMessageId).sort().join() === 'm1,m2,m3,m4');

// --- responded gate: a fired reply is never due again (no dupes on reload) ----
store.entries.find(e => e.nurtureMessageId === 'm1').responded = true;
ok('responded gate: m1 no longer due', !dueEntries(store, t0 + 60_000).some(e => e.nurtureMessageId === 'm1'));

console.log(failures === 0 ? '\nAll demo-blast sim checks passed.' : `\n${failures} check(s) FAILED.`);
process.exit(failures === 0 ? 0 : 1);
