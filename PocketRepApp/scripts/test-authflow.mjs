// Mock-data verification for the P0-1 real sign-in routing added to
// AppShell.tsx (the mount effect's session check + onAuthStateChange listener),
// AuthScreen.tsx's tryDemo wrapper, and lib/v2/localSessionClear.ts. Runs with
// plain `node` — no test runner, no network, no real credentials.
//
//   npm run test:authflow    (from PocketRepApp/)
//
// AppShell pulls in react-native/expo-router/supabase, so this mirrors the
// pure DECISION logic verbatim: given a session-check result or an auth event,
// what should needsAuth/authReady become, does a demo failure surface as a
// real error instead of a silent no-op, does a redundant same-user SIGNED_IN
// re-fire (tab-refocus) get deduped instead of re-running boot, and does the
// sign-out localStorage sweep clear exactly the per-user keys and nothing
// else. Keep in sync with the source files if those bodies change.

let failures = 0;
const ok = (name, cond) => { console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}`); if (!cond) failures++; };

// --- mirrored decision logic ---------------------------------------------

// mirrors the .then() callback on supabase.auth.getSession() in AppShell.tsx
function decideFromInitialSession(session) {
  if (session?.user) return { needsAuth: false, bootShouldRun: true };
  return { needsAuth: true, bootShouldRun: false };
}

// mirrors the onAuthStateChange callback in AppShell.tsx
function decideFromAuthEvent(event, session) {
  if (event === 'SIGNED_IN' && session?.user) {
    return { needsAuth: false, authReady: undefined, bootShouldRun: true, forcesWebReload: false }; // finishBoot() sets authReady=true itself
  }
  if (event === 'SIGNED_OUT') {
    // forcesWebReload: audit finding (HIGH) — AppShell never unmounts across a
    // sign-out/sign-in transition, so every data hook (contacts/tags/pay
    // plan/deals/notifications) keeps the PREVIOUS rep's data in memory until
    // it independently refetches. A shared/kiosk device makes this a real
    // cross-account leak: rep A signs out, rep B signs in on the same tab and
    // briefly sees rep A's book. A full reload on web is the fix — must NEVER
    // regress to a no-op on this event.
    return { needsAuth: true, authReady: false, bootShouldRun: false, forcesWebReload: true };
  }
  return { needsAuth: undefined, authReady: undefined, bootShouldRun: false, forcesWebReload: false }; // e.g. TOKEN_REFRESHED — no-op
}

// mirrors AuthScreen.tsx's tryDemo(): wraps onTryDemo, surfaces a thrown error
// as a string instead of swallowing it (the demoAuth.ts change this PR makes).
async function tryDemo(onTryDemo) {
  try {
    await onTryDemo();
    return { error: null };
  } catch (e) {
    return { error: e?.message ?? 'Could not start the demo. Try again.' };
  }
}

// mirrors the lastUserIdRef guard in AppShell.tsx's onAuthStateChange handler
// (audit finding, MED): Supabase re-fires SIGNED_IN for the SAME user on every
// tab-visibility-change recovery, not just on a real sign-in. Without this
// guard, finishBoot()'s network calls (profile sync, warmBrain, timezone
// capture) would redundantly re-run on every alt-tab.
function shouldRunBootForSignIn(lastUserId, newUserId) {
  return lastUserId !== newUserId;
}

// mirrors lib/v2/localSessionClear.ts's clearLocalSessionState() (audit
// finding, HIGH): the sign-out reload wipes in-memory state but NOT
// localStorage, where always-listen mic consent / disclosure-seen /
// onboarding-seen / the coach chat log / rep settings / notification
// read-state all persist per-device. This is the prefix-filter that decides
// which keys get removed — swept by PREFIX (not a hand-maintained list) so a
// future pocketrep:v2:* key is covered automatically.
function keysToClear(allKeys, prefix = 'pocketrep:v2:') {
  return allKeys.filter(k => k.startsWith(prefix));
}

// --- initial session check ----------------------------------------------
ok('existing real session -> needsAuth false, boot runs',
  JSON.stringify(decideFromInitialSession({ user: { id: 'u1' } })) === JSON.stringify({ needsAuth: false, bootShouldRun: true }));
ok('no session -> needsAuth true, boot does not run',
  JSON.stringify(decideFromInitialSession(null)) === JSON.stringify({ needsAuth: true, bootShouldRun: false }));
ok('session with no user -> treated as no session',
  decideFromInitialSession({ user: null }).needsAuth === true);

// --- auth state change events --------------------------------------------
ok('SIGNED_IN with user -> clears needsAuth, boot runs',
  decideFromAuthEvent('SIGNED_IN', { user: { id: 'u1' } }).needsAuth === false);
ok('SIGNED_IN with no user (malformed) -> no-op, does not clear needsAuth',
  decideFromAuthEvent('SIGNED_IN', null).needsAuth === undefined);
ok('SIGNED_OUT -> sets needsAuth true and authReady false',
  decideFromAuthEvent('SIGNED_OUT', null).needsAuth === true && decideFromAuthEvent('SIGNED_OUT', null).authReady === false);
ok('SIGNED_OUT -> forces a web reload (cross-account leak guard, must never regress)',
  decideFromAuthEvent('SIGNED_OUT', null).forcesWebReload === true);
ok('SIGNED_IN does not force a reload (only sign-out needs the hard reset)',
  decideFromAuthEvent('SIGNED_IN', { user: { id: 'u1' } }).forcesWebReload === false);
ok('unrelated event (e.g. TOKEN_REFRESHED) -> no-op',
  decideFromAuthEvent('TOKEN_REFRESHED', { user: { id: 'u1' } }).needsAuth === undefined
  && decideFromAuthEvent('TOKEN_REFRESHED', { user: { id: 'u1' } }).forcesWebReload === false);

// --- SIGNED_IN dedup guard (tab-refocus re-fire must not re-run boot) -----
ok('same user re-signals SIGNED_IN (tab refocus) -> boot does NOT re-run',
  shouldRunBootForSignIn('u1', 'u1') === false);
ok('a genuinely different user signs in -> boot DOES run',
  shouldRunBootForSignIn('u1', 'u2') === true);
ok('first sign-in ever (no prior user) -> boot DOES run',
  shouldRunBootForSignIn(null, 'u1') === true);

// --- sign-out localStorage sweep (must clear per-user keys, nothing else) --
const ALL_KNOWN_KEYS = [
  'pocketrep:v2:hey-rex-always-on',      // mic-consent bypass risk if leaked
  'pocketrep:v2:hey-rex-disclosure-seen',
  'pocketrep:v2:onboarding-complete',
  'pocketrep:v2:coach-log',
  'pocketrep:v2:coach-summary',
  'pocketrep:v2:rep-settings',
  'pocketrep:v2:notif-read',
  'pocketrep:v2:notif-dismissed',
];
const cleared = keysToClear([...ALL_KNOWN_KEYS, 'some-other-app-key', 'pocketrep_mass_text_v1']);
ok('sweep clears every known pocketrep:v2:* key',
  ALL_KNOWN_KEYS.every(k => cleared.includes(k)));
ok('sweep does NOT touch an unrelated key',
  !cleared.includes('some-other-app-key'));
ok('sweep does NOT touch the legacy v1 key (different prefix, "pocketrep_" not "pocketrep:v2:")',
  !cleared.includes('pocketrep_mass_text_v1'));
ok('sweep automatically covers a FUTURE pocketrep:v2:* key with no code change',
  keysToClear(['pocketrep:v2:some-brand-new-feature']).length === 1);

// --- demo failure surfaces as a real error, not a silent no-op ------------
const demoOk = () => Promise.resolve();
const demoFails = () => Promise.reject(new Error('Invalid login credentials'));
const demoFailsNoMessage = () => Promise.reject({});

let r1, r2, r3;
(async () => {
  r1 = await tryDemo(demoOk);
  ok('demo success -> no error', r1.error === null);
  r2 = await tryDemo(demoFails);
  ok('demo failure -> real error message surfaces', r2.error === 'Invalid login credentials');
  r3 = await tryDemo(demoFailsNoMessage);
  ok('demo failure with no message -> falls back to a friendly string', r3.error === 'Could not start the demo. Try again.');

  console.log(failures === 0 ? '\nAll auth-flow checks passed.' : `\n${failures} check(s) FAILED.`);
  process.exit(failures === 0 ? 0 : 1);
})();
