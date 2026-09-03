import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');
let checks = 0;
let failures = 0;
function check(condition, message) {
  checks += 1;
  if (condition) console.log(`  ✓ ${message}`);
  else { failures += 1; console.error(`  ✗ ${message}`); }
}

console.log('PocketRep Batch 3 single-plan / entitlement regression');
const schema = read('sql/schema.sql');
const migration = read('supabase/migrations/20260903120000_pocketrep_current_plan_default.sql');
const adminAiMigration = read('supabase/migrations/20260903221500_admin_ai_role_bypass.sql');
const layout = read('app/_layout.tsx');
const ai = read('supabase/functions/ai-proxy/index.ts');
const appJson = read('app.json');
const contacts = read('app/(tabs)/contacts.tsx');
const more = read('app/(tabs)/more.tsx');
const rex = read('app/(tabs)/rex.tsx');
const sequences = read('app/(tabs)/sequences.tsx');
const home = read('app/(tabs)/index.tsx');
const profile = read('components/v2/ProfileTab.tsx');
const pwa = read('components/v2/PWAInstallPrompt.tsx');
const checkout = read('supabase/functions/checkout-account/index.ts');
const teams = read('../Pocketrep/thankyou-teams.html');
const launch = read('../Pocketrep/thankyou-launch.html');
const vercel = read('../vercel.json');
const types = read('lib/types.ts');

check(types.includes("'pocketrep'"), 'Plan model includes current pocketrep product');
check(schema.includes("default 'pocketrep' check (plan = 'pocketrep')"), 'schema is single-plan pocketrep');
check(!schema.includes("raw_user_meta_data->>'plan'"), 'schema does not accept client-selected plan metadata');
check(schema.includes("set search_path to ''"), 'signup trigger uses empty search_path');
check(schema.includes('insert into public.profiles'), 'signup trigger fully qualifies profiles');
check(schema.includes("_plan := 'pocketrep'"), 'signup trigger hard-sets pocketrep');
check(migration.includes("alter column plan set default 'pocketrep'"), 'migration fixes stale production column default');
check(migration.includes("check (plan = 'pocketrep')"), 'migration preserves single-plan constraint');
check(!migration.includes("raw_user_meta_data->>'plan'"), 'migration rejects client-controlled plan selection');
check(!migration.includes("plan in ('rex_lens','pro','elite')"), 'migration does not widen retired tiers');
check(migration.includes("set search_path to ''"), 'migration preserves hardened signup search_path');
check(migration.includes('perform public.seed_demo_customers_for_user(new.id)'), 'migration preserves current signup demo seed');

check(layout.includes('useAccessGate(ready && signedIn)'), 'legacy V1 root invokes normal access gate');
check(layout.includes("access.status === 'loading'"), 'V1 withholds tabs while entitlement is loading');
check(layout.includes("access.status === 'locked'"), 'V1 handles locked entitlement');
check(layout.includes('<LockoutScreen'), 'V1 renders shared lockout screen');
check(layout.includes("access.status === 'allowed' || access.status === 'pending'"), 'V1 routes to tabs only for allowed/current grace');
check(!layout.includes('if (signedIn && inAuth) router.replace'), 'old auth-only V1 tab bypass is gone');

for (const field of ['subscription_status', 'trial_ends_at', 'entitlement_status', 'entitlement_pending_until']) {
  check(ai.includes(field), `ai-proxy reads ${field}`);
}
check(ai.includes('function aiAccessDecision'), 'ai-proxy has explicit server-side entitlement decision');
check(ai.includes("(profile.role ?? '').toLowerCase() === 'admin'"), 'ai-proxy allows operational admin role without customer billing state');
check(ai.includes(".select('role, plan, unlimited"), 'ai-proxy loads role for server-side admin access');
check(ai.includes('if (profileError || !profile)'), 'ai-proxy fails closed on missing/unverifiable profile');
check(ai.includes("type: 'ACCESS_LOCKED'"), 'ai-proxy denies inactive paid access before model work');
check(ai.includes("type: 'ACCESS_CHECK_FAILED'"), 'AI preflight failure is fail-closed');
check(!ai.includes('catch { /* fail open */ }'), 'AI rate/access preflight no longer fails open');
check(ai.indexOf('aiAccessDecision(profile') < ai.indexOf("supabase.rpc('bump_ai_minute'"), 'billing decision occurs before rate/cost/model preflight');
check(ai.includes('pocketrep: 75'), 'PocketRep has explicit AI daily cap');
check(ai.includes("const plan = profile.plan || 'pocketrep'"), 'AI plan fallback is current product name');

const now = Date.parse('2026-09-03T12:00:00Z');
function allowed({ subscription = '', entitlement = '', trial = null, pending = null } = {}) {
  subscription = subscription.toLowerCase();
  entitlement = entitlement.toLowerCase();
  const trialMs = trial ? Date.parse(trial) : Number.NaN;
  const pendingMs = pending ? Date.parse(pending) : Number.NaN;
  if (entitlement === 'pending') return Number.isFinite(pendingMs) && pendingMs > now;
  if (entitlement === 'locked') return false;
  if (subscription === 'active' || entitlement === 'active') return true;
  if (subscription === 'trialing' || entitlement === 'trialing') {
    if (!trial) return true;
    return Number.isFinite(trialMs) && trialMs > now;
  }
  if (['canceled','cancelled','past_due','unpaid','incomplete_expired'].includes(subscription)) return false;
  if (Number.isFinite(trialMs) && trialMs > now) return true;
  return false;
}
check(allowed({ subscription: 'active' }), 'active subscription allows AI');
check(allowed({ entitlement: 'active' }), 'active entitlement allows AI');
check(allowed({ subscription: 'trialing', trial: '2026-09-04T00:00:00Z' }), 'valid trial allows AI');
check(allowed({ entitlement: 'trialing' }), 'trialing entitlement without end remains allowed per accessGate semantics');
check(allowed({ entitlement: 'pending', pending: '2026-09-03T13:00:00Z' }), 'current pending grace allows AI');
check(!allowed({ entitlement: 'pending', pending: '2026-09-03T11:00:00Z' }), 'expired pending grace denies AI');
check(!allowed({ entitlement: 'locked' }), 'locked entitlement denies AI');
check(!allowed({ subscription: 'canceled' }), 'canceled subscription denies AI');
check(!allowed({ subscription: 'cancelled' }), 'cancelled spelling denies AI');
check(!allowed({ subscription: 'past_due' }), 'past_due denies AI');
check(!allowed({ subscription: 'unpaid' }), 'unpaid denies AI');
check(!allowed({ subscription: 'incomplete_expired' }), 'incomplete_expired denies AI');
check(!allowed({ subscription: 'trialing', trial: '2026-09-03T11:00:00Z' }), 'expired trial denies AI');
check(!allowed({}), 'missing billing state denies AI');

check(migration.includes('create or replace function public.bump_ai_minute'), 'DB AI preflight is entitlement-aware defense in depth');
check(migration.includes('return 2147483647'), 'DB AI preflight returns denied sentinel on invalid/unverifiable access');
check(migration.includes('revoke all on function public.bump_ai_minute(uuid) from authenticated'), 'AI preflight RPC is not client-callable');
check(migration.includes('grant execute on function public.bump_ai_minute(uuid) to service_role'), 'AI preflight remains callable by server');
check(adminAiMigration.includes("v_role = 'admin'"), 'DB AI preflight allows admin role');
check(adminAiMigration.includes('revoke all on function public.bump_ai_minute(uuid) from public, anon, authenticated'), 'admin AI migration preserves client execute lockdown');
check(adminAiMigration.includes('grant execute on function public.bump_ai_minute(uuid) to postgres, service_role'), 'admin AI migration preserves server-only execution');
check(!appJson.includes('Rex Lens'), 'native photo permission no longer mentions Rex Lens');
check(appJson.includes('share screenshots and photos with Rex'), 'photo permission states verified Rex image-sharing use');
check(contacts.includes('Limit: {MASS_TEXT_LIMIT}'), 'native mass-text UI no longer advertises Pro/Elite plan name');
check(!contacts.includes('// Plan limits: Pro=50, Elite=100'), 'native contacts plan comment is current');
check(!more.includes('Upgrade to Elite'), 'dead Upgrade to Elite CTA removed');
check(!more.includes('PRO PLAN'), 'settings no longer shows stale PRO PLAN badge');
check(!/if\s*\(\s*profile\?\.plan\s*===\s*['\"]elite['\"]\s*\)/.test(rex) && !/const\s+isElite\s*=/.test(rex), 'Rex Memory is not dead-gated on Elite');
check(!/if\s*\(\s*profile\?\.plan\s*===\s*['\"]elite['\"]\s*\)/.test(more) && !/const\s+isElite\s*=/.test(more), 'Weekly Digest is not dead-gated on Elite');
check(!sequences.includes('ELITE'), 'native sequences no longer shows stale ELITE lock copy');
check(!home.includes('toUpperCase()} PLAN'), 'native home no longer renders raw plan as customer-facing tier');
check(!profile.includes('toUpperCase()}'), 'V2 profile no longer renders raw plan as customer-facing tier');
check(checkout.includes('STRIPE_POCKETREP_PRICE_ID'), 'checkout has canonical PocketRep price env name');
check(checkout.includes('STRIPE_ELITE_PRICE_ID'), 'checkout preserves legacy env fallback');
check(pwa.includes('Instagram') && pwa.includes('TikTok') && pwa.includes('Facebook'), 'PWA prompt handles major in-app browsers');
check(teams.toLowerCase().includes('not for sale yet'), 'Team orphan page no longer claims payment confirmation');
check(launch.includes('noindex'), 'launch thank-you page is noindex');
check(launch.includes('app.pocketrep.pro'), 'launch thank-you links directly to app subdomain');
check((JSON.parse(vercel).headers ?? []).some((rule) => { try { const re = new RegExp(rule.source); return re.test('/brand.css') && re.test('/seo-pages.css'); } catch { return false; } }), 'stable CSS files have explicit cache rule');
check(vercel.includes('must-revalidate'), 'stable CSS revalidates instead of immutable one-year caching');

console.log(`\n${checks - failures}/${checks} checks passed`);
if (failures) process.exit(1);
