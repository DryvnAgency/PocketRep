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
