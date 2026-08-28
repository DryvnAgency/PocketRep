// Mock-data verification for the P2-R3 + P2-R4 chain disambiguation guard added to
// rexInterpret (lib/v2/rexActions.ts). Runs with plain `node` — no test runner, no
// live model calls, no real PII.
//
//   npm run test:chainguard    (from PocketRepApp/)
//
// The repo has no TS test runner and rexActions.ts pulls in supabase/react-native,
// so this mirrors the two pure pieces of logic — matchContactsByName and the new
// chain-step guard loop — and asserts their STABLE contracts: an ambiguous-name
// step makes the whole chain clarify, while exact-full-name / single-match / no-name
// / non-contact-ref steps pass through, and nothing crashes on malformed input.
// Keep in sync with rexActions.ts if those bodies change.

let failures = 0;
const ok = (name, cond) => { console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}`); if (!cond) failures++; };

// --- mirrored logic (verbatim from rexActions.ts) ---
function matchContactsByName(name, contacts) {
  const q = name.trim().toLowerCase();
  if (!q) return [];
  const exact = contacts.filter(c => (c.name ?? '').trim().toLowerCase() === q);
  if (exact.length > 0) return exact; // exact full-name match short-circuits the fuzzy fallback
  const firstTok = q.split(/\s+/)[0];
  return contacts.filter(c => {
    const full = (c.name ?? '').trim().toLowerCase();
    return full.startsWith(q) || full.split(/\s+/)[0] === firstTok;
  });
}

const CONTACT_REF_ACTIONS = new Set(['update_notes', 'delete_contact', 'schedule_followup', 'show_contact', 'retier_contact']);

// mirror of the chain block in rexInterpret (returns a clarify, or the action unchanged)
function chainDisambiguate(action, contacts) {
  if (action.type !== 'chain') return action;
  for (const step of action.payload.steps ?? []) {
    if (!CONTACT_REF_ACTIONS.has(step.type)) continue;
    const nm = String(step.payload?.contact_name ?? '').trim();
    if (!nm) continue;
    const matches = matchContactsByName(nm, contacts);
    if (matches.length > 1) {
      const first = nm.split(/\s+/)[0];
      return {
        type: 'clarify',
        payload: {
          question: `I've got ${matches.length} matches for ${nm}. Which one?`,
          candidates: matches.slice(0, 6).map(c => ({ id: c.id, label: c.name })),
        },
        say: `I've got a few people named ${first}. Which one do you mean before I run that?`,
      };
    }
  }
  return action;
}

// --- mock book (no real PII): two "Maria"s create a genuine collision ---
const book = [
  { id: 'c1', name: 'Marcus Bell' },
  { id: 'c2', name: 'Maria Lopez' },
  { id: 'c3', name: 'Maria Gonzalez' },
  { id: 'c5', name: 'Priya Shah' },
];
const chain = (...steps) => ({ type: 'chain', payload: { steps } });
const step = (type, contact_name) => ({ type, payload: contact_name === undefined ? {} : { contact_name } });

// 1) ambiguous step ("Maria" → 2) makes the whole chain clarify
const r1 = chainDisambiguate(chain(step('delete_contact', 'Maria'), step('retier_contact', 'Marcus')), book);
ok('ambiguous "Maria" step -> clarify', r1.type === 'clarify');
ok('clarify carries both Maria candidates', r1.payload.candidates.length === 2 && r1.payload.candidates.every(c => c.label.startsWith('Maria')));
ok('clarify say is the chain-specific line', r1.say.includes('before I run that'));

// 2) ambiguous step in ANY position is caught (Maria is the 2nd step here)
ok('ambiguous step in 2nd position -> clarify', chainDisambiguate(chain(step('retier_contact', 'Marcus'), step('update_notes', 'Maria')), book).type === 'clarify');

// 3) exact full-name does NOT trigger (short-circuit), even though "Maria Gonzalez" also exists
ok('exact full-name "Maria Lopez" -> passes through', chainDisambiguate(chain(step('delete_contact', 'Maria Lopez')), book).type === 'chain');

// 4) single unambiguous match passes through
ok('single-match "Marcus" -> passes through', chainDisambiguate(chain(step('retier_contact', 'Marcus'), step('schedule_followup', 'Priya')), book).type === 'chain');

// 5) non-contact-ref steps are skipped (log_deal uses customer_name; add_contact/batch_action/create_reminder aren't contact-ref)
ok('non-contact-ref-only chain -> passes through', chainDisambiguate(chain(
  { type: 'log_deal', payload: { customer_name: 'Maria' } },
  { type: 'add_contact', payload: { first_name: 'Maria' } },
  { type: 'create_reminder', payload: { title: 'call Maria' } },
), book).type === 'chain');

// 6) empty / missing contact_name is skipped, no crash
ok('empty contact_name -> skipped', chainDisambiguate(chain(step('update_notes', '   '), step('delete_contact', undefined)), book).type === 'chain');

// 7) malformed step (non-string contact_name) is coerced safely, no throw
let threw = false;
try {
  const r = chainDisambiguate(chain({ type: 'delete_contact', payload: { contact_name: 12345 } }, { type: 'update_notes', payload: null }), book);
  ok('malformed step -> no clarify (12345 matches nobody)', r.type === 'chain');
} catch { threw = true; }
ok('malformed step does not throw', threw === false);

// 8) non-chain action is returned untouched
ok('non-chain action -> untouched', chainDisambiguate({ type: 'say', payload: {} }, book).type === 'say');

// 9) chain with no/undefined steps does not crash
ok('chain with no steps -> passes through', chainDisambiguate({ type: 'chain', payload: {} }, book).type === 'chain');

console.log(failures === 0 ? '\nAll chain-guard checks passed.' : `\n${failures} check(s) FAILED.`);
process.exit(failures === 0 ? 0 : 1);
