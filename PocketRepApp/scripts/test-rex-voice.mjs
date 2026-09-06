// Regression coverage for the Rex Voice Playbook layer (lib/v2/rexVoice.ts):
// a deterministic Hunter/Coach/Hybrid delivery-energy router laid on top of
// the existing Rex brain. This module never changes WHAT Rex recommends —
// only HOW it's delivered — so most of this file is adversarial proof that
// personality cannot override DNC, appointment truth, manual-send, or
// verified-fact requirements, which stay entirely owned by REX_COPY_RULES
// and the rest of coachBrain.ts / rexTriad.ts / rexActions.ts.
//
// rexVoice.ts pulls in repSettings.ts (react-native/AsyncStorage), so — same
// convention as test-rexchat.mjs / test-rextriad.mjs / test-rex-routing.mjs —
// the pure router is MIRRORED verbatim here and exercised directly; the
// gear/intensity text and its wiring into every consumer are verified as
// real source content and real imports (test-rex-truthfulness-gaps.mjs's
// anti-drift pattern), not just an identifier-name search.
//
//   npm run test:rexvoice    (from PocketRepApp/)

import fs from 'node:fs';
import path from 'node:path';

let failures = 0;
let checks = 0;
const ok = (name, cond) => { checks++; console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}`); if (!cond) failures++; };
const eqArr = (name, a, b) => ok(name, JSON.stringify(a) === JSON.stringify(b));

const root = path.resolve(new URL('..', import.meta.url).pathname);
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');

const voiceSrc = read('lib/v2/rexVoice.ts');
const coachBrainSrc = read('lib/v2/coachBrain.ts');
const rexTriadSrc = read('lib/v2/rexTriad.ts');
const rexCoachSrc = read('components/v2/RexCoach.tsx');
const rexActionsSrc = read('lib/v2/rexActions.ts');
const blastSrc = read('lib/v2/blastSequences.ts');

// ── mirror of chooseRexGear (keep in sync with lib/v2/rexVoice.ts) ──────────
const STOP_SIGNAL = /\bstop (?:texting|contacting|messaging|calling)\b|\bdo not contact\b|\bdon'?t contact\b|\bunsubscribe\b|\btake me off\b|\bremove me from\b|\bopted? out\b/i;
const ANGRY_SIGNAL = /\bangry\b|\bupset\b|\bpissed\b|\bfurious\b|\byelling\b|\bmad at\b|\bcomplain(?:ing|t)?\b|\bthreatening\b|\bfiling a complaint\b/i;
const REPLY_SIGNAL = /\b(?:they|he|she|customer|client)\s+(?:said|replied|responded|texted|wrote|told me)\b|\breplied\b|\bresponded\b|\btext(?:ed)? (?:me )?back\b|\bwrote back\b|\bgot (?:a reply|a response|back to me)\b/i;
const COACH_STRATEGY_SIGNAL = /\bobjection\b|\bwhat (?:should|do) i (?:say|text|tell them)\b|\bhow do i (?:respond|reply|handle|answer)\b|\bwhy (?:is|did|would|does|isn'?t)\b|\bwhat does (?:that|this|it) mean\b|\bhow do i read\b|\bghost(?:ed|ing)?\b|\bnot responding\b|\bwon'?t (?:respond|reply|answer)\b|\bhesitat(?:ing|ion|e)\b|\bdifficult conversation\b/i;
const HUNTER_SIGNAL = /\bwho should i (?:call|text|work)\b|\bwhat'?s (?:my|the) (?:plan|priority|list) (?:today|now)\b|\bwho'?s (?:hot|next|due)\b|\bwhat'?s next\b|\bget me moving\b|\bjust (?:booked|confirmed|closed|sold)\b|\bappointment.?s? (?:confirmed|booked|set)\b|\bthey said yes\b|\bwe closed\b|\bclosed the deal\b|\bwe'?re on (?:a streak|fire)\b|\breferral\b/i;

function chooseRexGear({ text, matchedPlaybookCount = 0 }) {
  const t = (text || '').toLowerCase();
  if (STOP_SIGNAL.test(t) || ANGRY_SIGNAL.test(t)) return 'coach';
  if (REPLY_SIGNAL.test(t)) return 'hybrid';
  if (matchedPlaybookCount > 0 || COACH_STRATEGY_SIGNAL.test(t)) return 'coach';
  if (HUNTER_SIGNAL.test(t)) return 'hunter';
  return 'hunter';
}

console.log('\n--- 1. Ghosted lead -> Coach ---');
ok('bare ghosting language routes Coach', chooseRexGear({ text: "he's ghosting me, not responding to my texts" }) === 'coach');
ok('a matched ghosting playbook (no reply-shaped wording) routes Coach', chooseRexGear({ text: 'lead went quiet on me', matchedPlaybookCount: 1 }) === 'coach');

console.log('\n--- 2. Price objection -> Coach ---');
ok('payment objection wording routes Coach', chooseRexGear({ text: "payment's too high, what should I say" }) === 'coach');
ok('a matched payment playbook alone routes Coach', chooseRexGear({ text: 'not sure what to tell him', matchedPlaybookCount: 1 }) === 'coach');

console.log('\n--- 3. Appointment already scheduled -> Hunter reinforces, never re-books ---');
ok('a confirmed appointment report routes Hunter', chooseRexGear({ text: 'appointment confirmed for Saturday' }) === 'hunter');
ok('REX_COPY_RULES appointment-control block is untouched by the voice layer', rexActionsSrc.includes('There is no appointment calendar or scheduling record in your context') && rexActionsSrc.includes('Do not ask them to come in earlier, offer a second appointment, or reopen scheduling'));
ok('Hunter gear text explicitly forbids manufacturing urgency', voiceSrc.includes('never manufacture urgency, a deadline, or a reason to act that the real context does not support'));

console.log('\n--- 4 & 8. DNC / "stop texting me" -> Coach, never Hunter or Hybrid, even mid-reply ---');
ok('a bare stop-texting request routes Coach', chooseRexGear({ text: 'please stop texting me' }) === 'coach');
ok('"stop contacting" phrasing routes Coach', chooseRexGear({ text: 'do not contact me again' }) === 'coach');
ok('a stop request wrapped in reply language still routes Coach, not Hybrid', chooseRexGear({ text: 'she replied and said stop texting me' }) === 'coach');
ok('DNC/opt-out enforcement itself is untouched (no gear/voice reference near it)', rexActionsSrc.includes('do_not_contact') && !/chooseRexGear|buildRexVoiceBlock|rexVoice/.test(rexActionsSrc));

console.log('\n--- 5. Deleted customer -> voice layer has no path into contact lifecycle code ---');
ok('rexVoice.ts never imports/touches contact deletion, DB, or Supabase at all', !/supabase|is_deleted|delete_contact/i.test(voiceSrc));

console.log('\n--- 6. Sold customer / referral reactivation -> Hunter ---');
ok('a referral/reactivation report routes Hunter', chooseRexGear({ text: 'reached out to a sold customer for ownership check-in, any referrals?' }) === 'hunter');
ok('Hunter gear text explicitly lists sold-book reactivations and referrals', voiceSrc.includes('sold-book reactivations, referrals'));

console.log('\n--- 7. Angry customer -> Coach ---');
ok('an angry/furious customer report routes Coach', chooseRexGear({ text: 'the customer is furious and yelling at me' }) === 'coach');
ok('Coach gear text explicitly covers a difficult/angry customer', voiceSrc.includes('an angry or difficult customer'));

console.log('\n--- 9. Fake urgency temptation with no verified urgency -> forbidden in every gear ---');
ok('Hunter gear forbids inventing a win to celebrate', voiceSrc.includes('never invent one'));
ok('every voice block ends with a context-wins-over-gear-or-tone reminder', voiceSrc.includes('CONTEXT ALWAYS WINS OVER GEAR OR TONE'));

console.log('\n--- 10. Verified legitimate promotion/program -> untouched separate mechanism ---');
ok('the monthly verified-programs table/migration is untouched by this change', fs.existsSync(path.join(root, 'supabase/migrations/20260902_rex_monthly_programs.sql')));
ok('rexVoice.ts does not duplicate or shadow monthly-program logic', !/rex_monthly_programs|monthly.program/i.test(voiceSrc));

console.log('\n--- 11 & 14. Hot customer / inactive rep with real outstanding work -> Hunter ---');
ok('"who\'s hot" routes Hunter', chooseRexGear({ text: "who's hot and needs a call right now" }) === 'hunter');
ok('a daily priority-list ask routes Hunter', chooseRexGear({ text: "what's my priority list today" }) === 'hunter');
ok('Hunter gear challenges behavior, never the person (accountability without insults)',
  voiceSrc.includes('NEVER insult, humiliate, demean, or personally attack them') && voiceSrc.includes('challenge the behavior, not the person'));

console.log('\n--- 12. Appointment booked celebration -> Hunter ---');
ok('"just booked an appointment" routes Hunter', chooseRexGear({ text: 'just booked an appointment with Marcus for Saturday' }) === 'hunter');

console.log('\n--- 13. Sale logged celebration -> Hunter (prompt) + deterministic client-side copy ---');
ok('"closed the deal" routes Hunter', chooseRexGear({ text: 'just closed the deal on the Rogue' }) === 'hunter');
ok('RexCoach has a deterministic, zero-model-call SALE LOGGED celebration for log_deal',
  rexCoachSrc.includes("action.type === 'log_deal'") && rexCoachSrc.includes('SALE LOGGED.'));
{
  // Structural check (not a fragile character-distance regex): inside
  // confirmAction, the actual write (`await executeAction(...)`) must appear
  // textually BEFORE the log_deal celebration branch, so the celebration can
  // never fire ahead of, or instead of, the real save.
  const confirmActionBody = rexCoachSrc.slice(rexCoachSrc.indexOf('const confirmAction ='), rexCoachSrc.indexOf('const cancelAction ='));
  const writeIdx = confirmActionBody.indexOf('await executeAction(action, contacts)');
  const celebrationIdx = confirmActionBody.indexOf("action.type === 'log_deal'");
  ok('the celebration only fires after executeAction already succeeded (no bypass of the write)',
    writeIdx > -1 && celebrationIdx > -1 && writeIdx < celebrationIdx);
}

console.log('\n--- 15. Quick Reply generation: 2-3 genuinely different strategic angles ---');
ok('Coach gear defines Quick Replies', voiceSrc.includes('QUICK REPLIES'));
ok('Quick Replies require 2 to 3 genuinely different strategic angles, not rewrites', voiceSrc.includes('genuinely different strategic angles, not three rewrites of the same message'));
ok('Coach gear also defines the fast READ / MOVE / SAY shape', voiceSrc.includes('QUICK COACH') && voiceSrc.includes('READ') && voiceSrc.includes('MOVE') && voiceSrc.includes('SAY'));

console.log('\n--- 16. Manual-send invariant: personality never sends anything ---');
ok('Quick Replies are explicitly drafts only, sent manually like every other line', voiceSrc.includes('the rep still reviews, edits, and sends manually') && voiceSrc.includes('Never imply one was sent'));
ok('RexCoach still gates every write behind an explicit Confirm press (pending/acting state untouched)',
  rexCoachSrc.includes('PROPOSED · CONFIRM TO SAVE') && rexCoachSrc.includes('onPress={confirmAction}'));
ok('the shared HARD BOUNDARY never-send sentence is untouched', rexActionsSrc.includes('HARD BOUNDARY') || coachBrainSrc.includes('HARD BOUNDARY'));

console.log('\n--- 17. Three different customers, meaningfully different drafts (untouched, already code-enforced) ---');
ok('blastSequences.ts is untouched by the voice layer (no gear/voice reference)', !/chooseRexGear|buildRexVoiceBlock|rexVoice/.test(blastSrc));
ok('code-level uniqueness enforcement across a batch still exists', blastSrc.includes('export function enforceUniqueness'));

console.log('\n--- 18. Existing Rex style/intensity preference maps into gear intensity, not a second system ---');
{
  const toneKeysFrom = (src) => {
    const m = src.match(/(?:TONE_DIRECTIVES|INTENSITY_BY_TONE)\s*:\s*Record<string,\s*string>\s*=\s*\{([\s\S]*?)\n\};/);
    if (!m) return [];
    return [...m[1].matchAll(/^\s*([A-Za-z]+):/gm)].map((x) => x[1]);
  };
  const coachBrainToneKeys = toneKeysFrom(coachBrainSrc);
  const voiceToneKeys = toneKeysFrom(voiceSrc);
  eqArr('voiceTone keys match exactly between coachBrain.ts and rexVoice.ts (one preference, one meaning)', coachBrainToneKeys, voiceToneKeys);
  ok('coachBrain.ts tone keys are the expected Steady/Sharp/Fire preset', JSON.stringify(coachBrainToneKeys) === JSON.stringify(['Steady', 'Sharp', 'Fire']));
}
ok('rexVoice.ts reads the same voiceTone rep setting, not a new preference', voiceSrc.includes("getRepSetting('voiceTone')"));
ok('rexVoice.ts documents this as the same setting, not a second personality system', /rep's existing `?voiceTone`? preference/.test(voiceSrc) || voiceSrc.includes('never two competing personality dials'));

console.log('\n--- 19. Hunter -> Coach transition (Hybrid): a reported reply that is also objection-shaped ---');
ok('a reply reporting hesitation routes Hybrid, not plain Coach', chooseRexGear({ text: 'she replied saying she needs to think about it', matchedPlaybookCount: 1 }) === 'hybrid');
ok('Hybrid gear text matches the short-reaction-then-strategy shape', voiceSrc.includes('Open with one short Hunter-style beat reacting to what just happened, then move straight into Coach reasoning'));
ok('Hybrid explicitly does not force false positivity onto a bad reply', voiceSrc.includes('nothing to celebrate') && voiceSrc.includes('instead of falsely upbeat'));

console.log('\n--- 20. Coach -> Hunter/celebration transition: gear is decided fresh every turn, never sticky ---');
{
  const turn1 = chooseRexGear({ text: 'payment objection, not sure what to say', matchedPlaybookCount: 1 });
  const turn2 = chooseRexGear({ text: 'just closed the deal, huge win' });
  ok('an objection turn routes Coach', turn1 === 'coach');
  ok('the very next turn reporting a win routes Hunter, proving gear selection is stateless per turn', turn2 === 'hunter');
}

console.log('\n--- wiring: real imports into every live consumer, no local redeclaration (anti-drift) ---');
for (const [label, src] of [
  ['coachBrain.ts', coachBrainSrc],
  ['rexTriad.ts', rexTriadSrc],
]) {
  ok(`${label} imports chooseRexGear + buildRexVoiceBlock from ./rexVoice`,
    /import\s*\{[^}]*\bchooseRexGear\b[^}]*\bbuildRexVoiceBlock\b[^}]*\}\s*from\s*['"]\.\/rexVoice['"]/.test(src)
    || /import\s*\{[^}]*\bbuildRexVoiceBlock\b[^}]*\bchooseRexGear\b[^}]*\}\s*from\s*['"]\.\/rexVoice['"]/.test(src));
  ok(`${label} does not locally redeclare chooseRexGear or buildRexVoiceBlock`,
    !/\b(?:export\s+)?(?:function|const)\s+(?:chooseRexGear|buildRexVoiceBlock)\s*[=(]/.test(src));
  ok(`${label} calls buildRexVoiceBlock(chooseRexGear(...)) rather than inventing its own gear text`,
    /buildRexVoiceBlock\(\s*chooseRexGear\(/.test(src));
}
ok('coachBrain.ts reuses the SAME matchPlaybooks() call for both the playbook block and gear selection (no duplicate scoring pass)',
  /const matchedPlaybooks = matchPlaybooks\(text\);/.test(coachBrainSrc) && coachBrainSrc.includes('serializePlaybooks(matchedPlaybooks)') && coachBrainSrc.includes('matchedPlaybookCount: matchedPlaybooks.length'));

console.log('\n--- ORIGINAL CHARACTER REQUIREMENT: no real salesperson/creator named anywhere ---');
const BANNED = ['belfort', 'cardone', 'daniel g', 'straight line', 'sandler', 'spin selling', 'challenger sale', 'zig ziglar', 'grant ', 'andy elliott', 'brad lea', 'jeremy miner'];
const allVoiceRelatedSrc = (voiceSrc + '\n' + coachBrainSrc + '\n' + rexTriadSrc + '\n' + rexCoachSrc).toLowerCase();
for (const name of BANNED) {
  ok(`no guru/celebrity name: "${name.trim()}"`, !allVoiceRelatedSrc.includes(name));
}
ok('rexVoice.ts states the attribution policy explicitly', voiceSrc.includes('ATTRIBUTION POLICY') && voiceSrc.includes('original PocketRep'));

console.log('\n--- architecture: deterministic routing, no extra model call ---');
ok('chooseRexGear is a pure function of text/signals, not an LLM call (no callBrain/callBrainStream in rexVoice.ts)', !/callBrain/.test(voiceSrc));
ok('rexVoice.ts is documented as deterministic, mirroring rexRouting.ts\'s own house style', voiceSrc.includes('chooseRexTier in rexRouting.ts'));

console.log(`\n${failures === 0 ? '✅ ALL PASSED' : `❌ ${failures} FAILED`} (${checks} checks)`);
process.exit(failures ? 1 : 0);
