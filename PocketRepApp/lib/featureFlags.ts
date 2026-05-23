import { Platform } from 'react-native';

/**
 * v2 UI — the design-mockup port (PR #25+).
 *
 * Native (iOS/Android): gated by build-time env EXPO_PUBLIC_NEW_UI=1.
 *   EAS native builds leave this unset, so production users see the existing
 *   v1 UI until cutover.
 *
 * Web: same env var (set on the Vercel project that serves
 *   app.pocketrep.pro's eventual replacement), OR runtime URL param `?v=2`
 *   so PR previews can be QA'd without redeploying.
 */
export function shouldUseNewUi(): boolean {
  if (process.env.EXPO_PUBLIC_NEW_UI === '1') return true;
  if (Platform.OS === 'web' && typeof window !== 'undefined') {
    try {
      const params = new URLSearchParams(window.location.search);
      if (params.get('v') === '2') return true;
    } catch {
      // ignore — fall through to false
    }
  }
  return false;
}
