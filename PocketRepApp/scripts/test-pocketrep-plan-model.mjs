// Regression coverage for hostile-audit Batch 3: PocketRep's app-wide Plan
// type/model, DB defaults, and several customer-facing surfaces still only
// recognized the retired 3-tier 'rex_lens'/'pro'/'elite' model, while every
// current paying customer's profiles.plan is actually 'pocketrep' (written
// by supabase/functions/checkout-account and stripe-webhook). Net effects
// before this fix: raw plan strings ("POCKETREP", "PRO PLAN") rendered to
// customers; dead "Upgrade to Elite" CTAs and an ELITE badge with no
// purchasable tier behind them; Rex Memory and the Weekly Digest — both
// complete, production-safe features — permanently unreachable because
// they were gated on plan === 'elite', a value no current signup path ever
// assigns; a live RexLens promo card and an RexLens-branded iOS permission
// string inside PocketRep; a stale Team thank-you page claiming "Payment
// confirmed" with concrete $49/seat pricing while the homepage says Team is
// waitlist-only; a launch thank-you page pointing at pocketrep.pro instead
// of app.pocketrep.pro with no noindex/footer; and no in-app-browser
// (Instagram/Facebook/TikTok) handling in the PWA install prompt.
//
// Source-grep guardrails against the real files, matching this repo's
// established test convention. Covers all 8 items in the Batch 3
// verification list.
//
//   npm run test:pocketrepplan    (from PocketRepApp/)

import fs from 'node:fs';
import path from 'node:path';

let failures = 0;
let checks = 0;
const ok = (name, cond) => { checks++; console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}`); if (!cond) failures++; };

const root = path.resolve(new URL('..', import.meta.url).pathname);
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');

// --- 1. 'pocketrep' is recognized as the current plan -----------------------
console.log('\n--- "pocketrep" is a first-class current plan (item 1/6) ---');
const typesSrc = read('lib/types.ts');
ok('the Plan type includes pocketrep', /export type Plan = [^;]*'pocketrep'/.test(typesSrc));
ok('the Plan type still preserves the historical values (backward compat)',
  /'rex_lens'/.test(typesSrc) && /'pro'/.test(typesSrc) && /'elite'/.test(typesSrc));

const migrationFiles = fs.readdirSync(path.join(root, 'supabase/migrations'));
const planMigrationFile = migrationFiles.find(f => /pocketrep_current_plan/.test(f));
ok('a new migration exists widening the plan model to pocketrep', !!planMigrationFile);
const migrationSrc = planMigrationFile ? read(`supabase/migrations/${planMigrationFile}`) : '';
ok('the migration widens the plan CHECK constraint to include pocketrep',
  /CHECK \(plan IN \([^)]*'pocketrep'[^)]*\)\)/i.test(migrationSrc));
ok('the migration keeps the historical values valid too (no existing row is invalidated)',
  /'pocketrep'[^)]*'rex_lens'[^)]*'pro'[^)]*'elite'/.test(migrationSrc.replace(/\s+/g, ' ')));
ok('the migration redefines handle_new_user() to default to pocketrep, not the legacy pro',
  /_plan := coalesce\(new\.raw_user_meta_data->>'plan', 'pocketrep'\)/.test(migrationSrc));
ok('handle_new_user() still falls back to pocketrep (not pro) for any unrecognized plan string',
  /IF _plan NOT IN \([^)]*\) THEN _plan := 'pocketrep'; END IF;/.test(migrationSrc));

// --- 4. Stripe/entitlement status remains the sole billing authority --------
console.log('\n--- profile.plan never becomes a billing authority (item 1, item 4 of the 8) ---');
const accessGateSrc = read('lib/v2/accessGate.ts');
const selectMatch = accessGateSrc.match(/\.from\('profiles'\)\s*\.select\('([^']*)'\)/);
ok("accessGate.ts's profile select is present", !!selectMatch);
ok('accessGate.ts does NOT select plan — Stripe subscription/entitlement status stays authoritative',
  !!selectMatch && !/\bplan\b/.test(selectMatch[1]));
ok('accessGate.ts branches only on subscription/entitlement state, never on plan',
  !/profile\??\.plan/.test(accessGateSrc) && !/\bplan\s*===/.test(accessGateSrc));

const aiProxySrc = read('supabase/functions/ai-proxy/index.ts');
ok('ai-proxy has an explicit pocketrep entry in its daily cap map (not an accidental fallback)',
  /DAILY_CAP_CENTS[^;]*pocketrep\s*:\s*\d+/.test(aiProxySrc));
ok("a pocketrep customer's cap is not silently rejected/blank",
  (() => {
    const m = aiProxySrc.match(/DAILY_CAP_CENTS:\s*Record<string,\s*number>\s*=\s*\{([^}]*)\}/);
    if (!m) return false;
    const map = Function(`return {${m[1]}}`)();
    return typeof map.pocketrep === 'number' && map.pocketrep > 0;
  })());

// --- 2/3. No raw plan labels, no dead Upgrade-to-Elite flow on live surfaces -
console.log('\n--- no raw POCKETREP/PRO/ELITE labels on audited live surfaces (item 2) ---');
const indexTsxSrc = read('app/(tabs)/index.tsx');
ok('native Heat Sheet plan badge no longer renders the raw plan value',
  !/\{.*profile\?\.plan.*toUpperCase\(\).*\}/.test(indexTsxSrc));
ok('native Heat Sheet plan badge shows polished PocketRep copy',
  /planBadgeText[^>]*>PocketRep</.test(indexTsxSrc) || /planBadgeText\}>\s*PocketRep\s*</.test(indexTsxSrc));

const profileTabSrc = read('components/v2/ProfileTab.tsx');
ok('V2 ProfileTab plan label no longer derives from the raw plan value',
  !/const planLabel = \(profile\?\.plan/.test(profileTabSrc));
ok('V2 ProfileTab plan label is polished PocketRep copy',
  /const planLabel = 'PocketRep'/.test(profileTabSrc));

const moreTsxSrc = read('app/(tabs)/more.tsx');
ok('native More screen no longer computes a Pro/Elite planLabel',
  !/const planLabel = isElite/.test(moreTsxSrc));
ok('native More screen plan badge shows polished PocketRep copy, not PRO PLAN/ELITE PLAN',
  /planBadgeText\}>PocketRep Plan</.test(moreTsxSrc));
ok('native More screen no longer references isElite at all (dead once the gates below are removed)',
  !/isElite/.test(moreTsxSrc));

console.log('\n--- no current user-facing "Upgrade to Elite" flow remains (item 3) ---');
ok('More screen has no Upgrade-to-Elite CTA', !/Upgrade to Elite/.test(moreTsxSrc));
ok('More screen has no dead /upgrade link', !/pocketrep\.pro\/upgrade/.test(moreTsxSrc));
ok('More screen has no ELITE lock badge', !/eliteBadgeText\}>ELITE</.test(moreTsxSrc));
const sequencesSrc = read('app/(tabs)/sequences.tsx');
ok('sequences.tsx has no Upgrade-to-Elite copy', !/Upgrade to Elite/.test(sequencesSrc));
ok('sequences.tsx mass-text modal no longer shows a raw ELITE/PRO plan badge',
  !/planBadgeText\}>\{userPlan === 'elite' \? 'ELITE' : 'PRO'\}/.test(sequencesSrc));
const contactsSrc = read('app/(tabs)/contacts.tsx');
ok("contacts.tsx mass-text sheet no longer labels the limit Elite/Pro",
  !/\{userPlan === 'elite' \? 'Elite' : 'Pro'\} limit/.test(contactsSrc));

// --- 5. Rex Memory / Weekly Digest cannot silently disappear ----------------
console.log('\n--- Rex Memory / Weekly Digest ungated — available to every current member (item 4, item 5 of the 8) ---');
const rexTsxSrc = read('app/(tabs)/rex.tsx');
ok('rex.tsx no longer gates the memory-build throttle behind plan === elite',
  !/if \(profile\?\.plan === 'elite'\) \{\s*\n\s*const totalMsgs/.test(rexTsxSrc));
ok('rex.tsx still runs the every-5-messages memory throttle (cost control preserved, just not plan-gated)',
  /const totalMsgs = \(memory\?\.message_count \?\? 0\) \+ 2;/.test(rexTsxSrc));
ok('rex.tsx no longer computes an isElite flag', !/const isElite = profile\?\.plan/.test(rexTsxSrc));
ok('rex.tsx shows the memory banner whenever a summary exists, not only for isElite',
  /\{memory\?\.summary \? \(/.test(rexTsxSrc) && !/isElite && memory\?\.summary/.test(rexTsxSrc));

ok('More screen no longer branches Weekly Digest on isElite',
  !/\{isElite \? \(/.test(moreTsxSrc));
ok('More screen unconditionally renders "Generate Digest Now"',
  /Generate Digest Now/.test(moreTsxSrc) && !/Weekly Digest<\/Text>\s*\n\s*<Text style=\{s\.rowSub\}>Rex reviews your week<\/Text>/.test(moreTsxSrc));
ok('More screen still schedules the Sunday Digest reminder (feature body unchanged, just ungated)',
  /Sunday Digest/.test(moreTsxSrc) && /scheduleWeeklyDigest|setShowDigestPicker/.test(moreTsxSrc));

// --- 6. RexLens strings gone from PocketRep customer-facing surfaces --------
console.log('\n--- RexLens branding removed from live PocketRep surfaces (item 8) ---');
ok('native More screen no longer promotes the Rex Lens Chrome Extension', !/Rex Lens/.test(moreTsxSrc));
ok('native More screen no longer links to /rex-lens', !/pocketrep\.pro\/rex-lens/.test(moreTsxSrc));
const appJsonSrc = read('app.json');
ok("the iOS/Android photo-permission string no longer names Rex Lens", !/for Rex Lens/.test(appJsonSrc));
ok('the photo-permission string still accurately describes real PocketRep photo use',
  /photosPermission[^}]*Rex[^}]*contacts/.test(appJsonSrc.replace(/\s+/g, ' ')));

// --- 7. Stale Team confirmation/pricing not publicly presented --------------
console.log('\n--- Team thank-you page no longer falsely confirms payment or shows stale pricing (item 9, item 7 of the 8) ---');
const marketingRoot = path.resolve(root, '..', 'Pocketrep');
const readMarketing = (p) => fs.readFileSync(path.join(marketingRoot, p), 'utf8');
const teamsSrc = readMarketing('thankyou-teams.html');
ok('thankyou-teams.html still carries noindex', /<meta name="robots" content="noindex">/.test(teamsSrc));
ok('thankyou-teams.html no longer claims a payment was confirmed', !/Payment confirmed/.test(teamsSrc));
ok('thankyou-teams.html no longer shows concrete purchasable Team pricing',
  !/\$49\/seat\/mo/.test(teamsSrc) && !/\$249/.test(teamsSrc));
ok('thankyou-teams.html now points to the real, live Team waitlist section instead',
  /href="\/#teams"/.test(teamsSrc));

// --- 8. Install flow points to app.pocketrep.pro + in-app browser handling -
console.log('\n--- install/launch flow: app.pocketrep.pro + in-app browser handling (item 10, item 8 of the 8) ---');
const launchSrc = readMarketing('thankyou-launch.html');
ok('thankyou-launch.html points directly at app.pocketrep.pro, not pocketrep.pro/app',
  /href="https:\/\/app\.pocketrep\.pro"/.test(launchSrc) && !/href="https:\/\/pocketrep\.pro\/app"/.test(launchSrc));
ok('thankyou-launch.html now carries noindex', /<meta name="robots" content="noindex">/.test(launchSrc));
ok('thankyou-launch.html now has footer legal links',
  /footer-links[^]*privacy\.html[^]*terms\.html[^]*cancel\.html/.test(launchSrc));

const pwaSrc = read('components/v2/PWAInstallPrompt.tsx');
ok('PWAInstallPrompt detects common in-app browsers (Instagram/Facebook/TikTok)',
  /function isInAppBrowser[^{]*\{[^}]*Instagram[^}]*FBAN[^}]*TikTok/.test(pwaSrc.replace(/\s+/g, ' ')));
ok('PWAInstallPrompt checks isInAppBrowser() before falling into the iOS/Android branches',
  (() => {
    const inAppIdx = pwaSrc.indexOf('if (isInAppBrowser())');
    const iosIdx = pwaSrc.indexOf("if (ios) {");
    return inAppIdx !== -1 && iosIdx !== -1 && inAppIdx < iosIdx;
  })());
ok('the in-app-browser message tells the visitor to open a real browser, not Safari share-sheet steps',
  /OPEN IN YOUR BROWSER/.test(pwaSrc));

console.log(`\n${failures === 0 ? '✅ ALL PASSED' : `❌ ${failures} FAILED`} (${checks} checks)`);
process.exit(failures ? 1 : 0);
