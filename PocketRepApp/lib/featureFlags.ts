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
