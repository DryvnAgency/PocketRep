// Client-only Rex feature flags, read from EXPO_PUBLIC_* build-time env (the same
// mechanism as demoAuth / supabase config). This is intentionally NOT
// lib/featureFlags.ts (that file is the gated v1/v2 switch). Every flag defaults
// OFF, so production behaviour is byte-identical until the env var is set.

function envOn(v: string | undefined): boolean {
  return ['1', 'true', 'yes', 'on'].includes((v ?? '').trim().toLowerCase());
}

// P2-R3: let Rex bundle several distinct write actions from one utterance into a
// single confirmable chain. Off by default → Rex returns one action per utterance
// exactly as before (the chain instruction is omitted from the prompt entirely).
export function isRexMultistepEnabled(): boolean {
  if (typeof process === 'undefined') return false;
  return envOn(process.env.EXPO_PUBLIC_REX_MULTISTEP);
}

// P2-R8: when on, a failed Rex action gets an honest SPOKEN recovery line — Rex
// verbally corrects its optimistic pre-execution "done" instead of leaving a
// fabricated success as the last thing the rep heard, and the on-screen error
// becomes a specific, plain recovery message. Off by default → the failure UX is
// byte-identical to before (raw error text, no extra speech). The richer failure
// logging to rex_action_log is always on (it never alters spoken/visible output).
export function isRexFailureHonestyEnabled(): boolean {
  if (typeof process === 'undefined') return false;
  return envOn(process.env.EXPO_PUBLIC_REX_FAILURE_HONESTY);
}

// P2 demo feature: new-contact -> Rex recap draft -> rep-sent 14-day follow-up
// sequence. Off by default; also inert until the rex_followups migration is applied.
// When on, ContactDetail shows a follow-up card and AddContact auto-drafts a recap.
export function isRexFollowupEnabled(): boolean {
  if (typeof process === 'undefined') return false;
  return envOn(process.env.EXPO_PUBLIC_REX_FOLLOWUP);
}

// "Upload contacts from phone": the Contacts-tab import entry point. The Contacts
// tab is a core flow, so the entry point is gated — off by default → no import
// button renders and nothing about the tab changes. Turn on per environment.
export function isContactImportEnabled(): boolean {
  if (typeof process === 'undefined') return false;
  return envOn(process.env.EXPO_PUBLIC_CONTACT_IMPORT);
}

// P2-R1: replace the static first-run carousel with a short Rex interview that
// captures the rep's real, consumed profile fields (name, dealership, title, Rex
// tone) conversationally. Off by default → first-run shows the existing 8-slide
// carousel exactly as before; the interview only appears when this is set, so the
// owner can review/tune the script before it greets a real rep.
export function isRexOnboardingEnabled(): boolean {
  if (typeof process === 'undefined') return false;
  return envOn(process.env.EXPO_PUBLIC_REX_ONBOARDING);
}
