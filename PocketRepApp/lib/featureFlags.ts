import { Platform } from 'react-native';

/**
 * v2 UI — the design-mockup port (PR #25+).
 *
 * Native (iOS/Android): gated by build-time env EXPO_PUBLIC_NEW_UI=1.
 *   EAS native builds leave this unset, so production users see the existing
 *   v1 UI until cutover.
 *
 * Web:
 *   - Auto-on for app.pocketrep.pro (the canonical v2 surface; dormant until
 *     the domain is pointed at project-t90u1).
 *   - Build-time EXPO_PUBLIC_NEW_UI=1 (set on the project-t90u1 Vercel project
 *     once cutover happens — this also covers any custom preview alias).
 *   - Runtime ?v=2 — preview URLs can opt in without an env var.
 */
const V2_HOSTNAMES = new Set(['app.pocketrep.pro']);

export function shouldUseNewUi(): boolean {
  if (process.env.EXPO_PUBLIC_NEW_UI === '1') return true;
  if (Platform.OS === 'web' && typeof window !== 'undefined') {
    try {
      const host = window.location.hostname ?? '';
      if (V2_HOSTNAMES.has(host)) return true;
      const params = new URLSearchParams(window.location.search);
      if (params.get('v') === '2') return true;
    } catch {
      // ignore — fall through to false
    }
  }
  return false;
}

/**
 * Anthropic / Claude backend — DORMANT (reversible kill-switch).
 *
 * All Claude usage — the Rex Lens screenshot scan (Chrome extension) and the
 * legacy native Heat Sheet brief / weekly digest / Rex screenshot+action paths
 * — is gated behind this flag and is currently OFF. The live AI surface is the
 * OpenRouter brain (Grok 4.3 -> Kimi K2.6) via /ai-proxy/brain only.
 *
 * To restore Claude: set EXPO_PUBLIC_ANTHROPIC_ENABLED=1 for the app build and
 * ANTHROPIC_ENABLED=1 on the ai-proxy edge function. No code is deleted.
 */
export const ANTHROPIC_ENABLED = process.env.EXPO_PUBLIC_ANTHROPIC_ENABLED === '1';
