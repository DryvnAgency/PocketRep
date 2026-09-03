// Mock-data verification for PocketRep auth routing and password recovery.
// Runs with plain `node` — no test runner, no network, no real credentials.

import fs from 'node:fs';

let failures = 0;
const ok = (name, cond) => { console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}`); if (!cond) failures++; };

// --- mirrored decision logic ---------------------------------------------
function decideFromInitialSession(session) {
  if (session?.user) return { needsAuth: false, bootShouldRun: true };
  return { needsAuth: true, bootShouldRun: false };
}

function decideFromAuthEvent(event, session) {
  if (event === 'SIGNED_IN' && session?.user) {
    return { needsAuth: false, authReady: undefined, bootShouldRun: true, forcesWebReload: false };
  }
  if (event === 'SIGNED_OUT') {
    return { needsAuth: true, authReady: false, bootShouldRun: false, forcesWebReload: true };
  }
  return { needsAuth: undefined, authReady: undefined, bootShouldRun: false, forcesWebReload: false };
}

async function tryDemo(onTryDemo) {
  try {
    await onTryDemo();
    return { error: null };
  } catch (e) {
    return { error: e?.message ?? 'Could not start the demo. Try again.' };
  }
}

function shouldRunBootForSignIn(lastUserId, newUserId) {
  return lastUserId !== newUserId;
}

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

// --- SIGNED_IN dedup guard ----------------------------------------------
ok('same user re-signals SIGNED_IN (tab refocus) -> boot does NOT re-run',
  shouldRunBootForSignIn('u1', 'u1') === false);
ok('a genuinely different user signs in -> boot DOES run',
  shouldRunBootForSignIn('u1', 'u2') === true);
ok('first sign-in ever (no prior user) -> boot DOES run',
  shouldRunBootForSignIn(null, 'u1') === true);

// --- sign-out localStorage sweep -----------------------------------------
const ALL_KNOWN_KEYS = [
  'pocketrep:v2:hey-rex-always-on',
  'pocketrep:v2:hey-rex-disclosure-seen',
  'pocketrep:v2:onboarding-complete',
  'pocketrep:v2:coach-log',
  'pocketrep:v2:coach-summary',
  'pocketrep:v2:rep-settings',
  'pocketrep:v2:notif-read',
  'pocketrep:v2:notif-dismissed',
];
const cleared = keysToClear([...ALL_KNOWN_KEYS, 'some-other-app-key', 'pocketrep_mass_text_v1']);
ok('sweep clears every known pocketrep:v2:* key', ALL_KNOWN_KEYS.every(k => cleared.includes(k)));
ok('sweep does NOT touch an unrelated key', !cleared.includes('some-other-app-key'));
ok('sweep does NOT touch the legacy v1 key', !cleared.includes('pocketrep_mass_text_v1'));
ok('sweep automatically covers a FUTURE pocketrep:v2:* key',
  keysToClear(['pocketrep:v2:some-brand-new-feature']).length === 1);

// --- password recovery source guards -------------------------------------
const recoverySource = fs.readFileSync(new URL('../app/(auth)/reset-password.tsx', import.meta.url), 'utf8');
ok('password reset uses exact production redirect URL',
  recoverySource.includes("const RESET_REDIRECT_URL = 'https://app.pocketrep.pro/reset-password'"));
ok('password reset requires PASSWORD_RECOVERY auth event',
  recoverySource.includes("event === 'PASSWORD_RECOVERY'"));
ok('password reset does not grant update permission from any ordinary session',
  !recoverySource.includes('setCanSetPassword(!!data.session)') && !recoverySource.includes('setCanSetPassword(!!session)'));
ok('recovery fallback requires recovery-token evidence and verifies user with Auth server',
  recoverySource.includes('hasRecoveryToken') && recoverySource.includes('supabase.auth.getUser()'));
ok('successful password update uses Supabase Auth updateUser',
  recoverySource.includes("supabase.auth.updateUser({ password: newPassword })"));
ok('successful password update signs recovery session out',
  recoverySource.includes('await supabase.auth.signOut()'));
ok('expired/invalid recovery URL has explicit user-facing recovery handling',
  recoverySource.includes('This reset link is invalid or has expired'));
ok('recovery screen keeps mismatch validation',
  recoverySource.includes("if (newPassword !== confirm)"));

// The web root layout intercepts /reset-password and renders ResetPasswordWeb,
// so guard the actually-reachable production web surface too.
const recoveryWeb = fs.readFileSync(new URL('../components/ResetPasswordWeb.tsx', import.meta.url), 'utf8');
ok('web recovery requires PASSWORD_RECOVERY auth event', recoveryWeb.includes("event === 'PASSWORD_RECOVERY'"));
ok('web recovery requires URL recovery evidence', recoveryWeb.includes('hasRecoveryEvidence'));
ok('web recovery does not unlock from any ordinary existing session', !recoveryWeb.includes('if (active && data.session) setReady(true)'));
ok('web recovery verifies recovery user with Supabase Auth', recoveryWeb.includes('supabase.auth.getUser()'));
ok('web recovery signs temporary recovery session out after password update', recoveryWeb.includes('await supabase.auth.signOut()'));

// --- demo failure surfaces as a real error -------------------------------
const demoOk = () => Promise.resolve();
const demoFails = () => Promise.reject(new Error('Invalid login credentials'));
const demoFailsNoMessage = () => Promise.reject({});

(async () => {
  const r1 = await tryDemo(demoOk);
  ok('demo success -> no error', r1.error === null);
  const r2 = await tryDemo(demoFails);
  ok('demo failure -> real error message surfaces', r2.error === 'Invalid login credentials');
  const r3 = await tryDemo(demoFailsNoMessage);
  ok('demo failure with no message -> falls back to a friendly string', r3.error === 'Could not start the demo. Try again.');

  console.log(failures === 0 ? '\nAll auth-flow checks passed.' : `\n${failures} check(s) FAILED.`);
  process.exit(failures === 0 ? 0 : 1);
})();
