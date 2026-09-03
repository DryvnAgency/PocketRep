import { useCallback, useEffect, useRef, useState } from 'react';
import { View, Text, Pressable, StyleSheet, Platform } from 'react-native';
import { colors, radius, spacing } from '@/constants/theme';
import { Label } from './atoms';

// ── localStorage keys ──────────────────────────────────────────────────────────
const DISMISSED_KEY = 'pocketrep:v2:pwa-install-dismissed';
const INSTALL_EVENT_KEY = 'pocketrep:v2:pwa-install-event-seen';

// ── Platform detection ─────────────────────────────────────────────────────────
function isStandalone(): boolean {
  if (Platform.OS !== 'web' || typeof window === 'undefined') return true;
  return (
    (window.matchMedia?.('(display-mode: standalone)')?.matches ?? false) ||
    (window.navigator as any)?.standalone === true
  );
}

function isIOS(): boolean {
  if (typeof navigator === 'undefined') return false;
  return /iPad|iPhone|iPod/.test(navigator.userAgent) && !(window as any).MSStream;
}

function isAndroid(): boolean {
  if (typeof navigator === 'undefined') return false;
  return /Android/i.test(navigator.userAgent);
}

// In-app browsers (Instagram, Facebook, TikTok, etc.) keep the host OS's
// iOS/Android user agent, so isIOS()/isAndroid() above still match — but
// beforeinstallprompt never fires inside them and there is no real Safari
// share sheet or Chrome menu to tap, so the normal instructions below don't
// apply. Detect the common in-app webview signatures and send these users
// out to a real browser first instead.
function isInAppBrowser(): boolean {
  if (typeof navigator === 'undefined') return false;
  return /Instagram|FBAN|FBAV|TikTok|BytedanceWebview|Line\//i.test(navigator.userAgent);
}

function wasDismissed(): boolean {
  try { return localStorage.getItem(DISMISSED_KEY) === '1'; } catch { return false; }
}

function markDismissed(): void {
  try { localStorage.setItem(DISMISSED_KEY, '1'); } catch { /* noop */ }
}

// ── beforeinstallprompt hook (Chrome/Edge/Samsung) ─────────────────────────────
// Stores the deferred event so we can trigger it from our own UI.
let deferredPromptEvent: any = null;
if (Platform.OS === 'web' && typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredPromptEvent = e;
    try { localStorage.setItem(INSTALL_EVENT_KEY, '1'); } catch { /* noop */ }
  });
}

// ── Component ──────────────────────────────────────────────────────────────────
export default function PWAInstallPrompt({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const [installing, setInstalling] = useState(false);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  const handleDismiss = useCallback(() => {
    markDismissed();
    onClose();
  }, [onClose]);

  const handleInstall = useCallback(async () => {
    if (deferredPromptEvent) {
      setInstalling(true);
      try {
        deferredPromptEvent.prompt();
        const result = await deferredPromptEvent.userChoice;
        if (result?.outcome === 'accepted') {
          markDismissed();  // don't re-prompt after successful install
        }
      } catch { /* user cancelled or unsupported */ }
      deferredPromptEvent = null;
      if (mountedRef.current) {
        setInstalling(false);
        onClose();
      }
    }
  }, [onClose]);

  if (!open || Platform.OS !== 'web') return null;

  const ios = isIOS();
  const android = isAndroid();

  // In-app browsers first — they'd otherwise fall into the iOS/Android
  // branches below and show Safari/Chrome steps that don't apply inside
  // their webview chrome.
  if (isInAppBrowser()) {
    return (
      <View style={StyleSheet.absoluteFillObject as any}>
        <Pressable style={styles.scrim} onPress={handleDismiss} />
        <View style={styles.card}>
          <Text style={styles.appIcon}>📱</Text>
          <Label color={colors.gold}>OPEN IN YOUR BROWSER</Label>
          <Text style={styles.title}>Almost there</Text>
          <Text style={styles.body}>
            This app's built-in browser can't install PocketRep. Open this page in
            {ios ? ' Safari' : ' Chrome'} first, then add it to your home screen.
          </Text>
          <View style={styles.steps}>
            <Step n={1} text={'Tap the ••• or ⋮ menu (usually top-right)'} />
            <Step n={2} text={ios ? 'Choose "Open in Safari"' : 'Choose "Open in Chrome" or "Open in Browser"'} />
            <Step n={3} text={'Then use the install steps from your browser'} />
          </View>
          <Pressable onPress={handleDismiss} style={styles.gotItBtn}>
            <Text style={styles.gotItText}>Got it</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  // Chrome/Edge/Samsung with native install prompt available
  if (deferredPromptEvent && !ios) {
    return (
      <View style={StyleSheet.absoluteFillObject as any}>
        <Pressable style={styles.scrim} onPress={handleDismiss} />
        <View style={styles.card}>
          <Text style={styles.appIcon}>📱</Text>
          <Label color={colors.gold}>ADD TO HOME SCREEN</Label>
          <Text style={styles.title}>Get the full app experience</Text>
          <Text style={styles.body}>
            Install PocketRep on your home screen for instant access, full-screen mode,
            and push notifications. No app store needed.
          </Text>
          <View style={styles.actions}>
            <Pressable onPress={handleDismiss} style={styles.laterBtn}>
              <Text style={styles.laterText}>Later</Text>
            </Pressable>
            <Pressable
              onPress={handleInstall}
              style={[styles.installBtn, installing && styles.installBtnDisabled]}
              disabled={installing}
            >
              <Text style={styles.installText}>
                {installing ? 'Installing…' : 'Install App'}
              </Text>
            </Pressable>
          </View>
        </View>
      </View>
    );
  }

  // iOS — manual instructions (no beforeinstallprompt support)
  if (ios) {
    return (
      <View style={StyleSheet.absoluteFillObject as any}>
        <Pressable style={styles.scrim} onPress={handleDismiss} />
        <View style={styles.card}>
          <Text style={styles.appIcon}>📱</Text>
          <Label color={colors.gold}>ADD TO HOME SCREEN</Label>
          <Text style={styles.title}>Install PocketRep</Text>
          <Text style={styles.body}>
            Add PocketRep to your home screen for the full app experience — instant launch,
            full screen, and notifications.
          </Text>
          <View style={styles.steps}>
            <Step n={1} text={'Tap the share button  ⬆  at the bottom of Safari'} />
            <Step n={2} text={'Scroll down and tap "Add to Home Screen"'} />
            <Step n={3} text={'Tap "Add" in the top right'} />
          </View>
          <Pressable onPress={handleDismiss} style={styles.gotItBtn}>
            <Text style={styles.gotItText}>Got it</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  // Android fallback (no beforeinstallprompt fired — older browser or already handled)
  if (android) {
    return (
      <View style={StyleSheet.absoluteFillObject as any}>
        <Pressable style={styles.scrim} onPress={handleDismiss} />
        <View style={styles.card}>
          <Text style={styles.appIcon}>📱</Text>
          <Label color={colors.gold}>ADD TO HOME SCREEN</Label>
          <Text style={styles.title}>Install PocketRep</Text>
          <Text style={styles.body}>
            Add PocketRep to your home screen for instant access and full-screen mode.
          </Text>
          <View style={styles.steps}>
            <Step n={1} text={'Tap the ⋮ menu in the top right of Chrome'} />
            <Step n={2} text={'Tap "Add to Home screen" or "Install app"'} />
            <Step n={3} text={'Tap "Install" to confirm'} />
          </View>
          <Pressable onPress={handleDismiss} style={styles.gotItBtn}>
            <Text style={styles.gotItText}>Got it</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  // Desktop fallback
  return (
    <View style={StyleSheet.absoluteFillObject as any}>
      <Pressable style={styles.scrim} onPress={handleDismiss} />
      <View style={styles.card}>
        <Text style={styles.appIcon}>💻</Text>
        <Label color={colors.gold}>INSTALL APP</Label>
        <Text style={styles.title}>Add PocketRep to your desktop</Text>
        <Text style={styles.body}>
          Install PocketRep as a desktop app for a dedicated window and quick access from your dock or taskbar.
        </Text>
        <View style={styles.steps}>
          <Step n={1} text={'Click the install icon in your browser\'s address bar'} />
          <Step n={2} text={'Click "Install" to confirm'} />
        </View>
        <Pressable onPress={handleDismiss} style={styles.gotItBtn}>
          <Text style={styles.gotItText}>Got it</Text>
        </Pressable>
      </View>
    </View>
  );
}

// ── Helpers for ProfileTab ─────────────────────────────────────────────────────

/**
 * Returns true if the user is in a browser (not installed PWA) and hasn't
 * permanently dismissed the prompt. Use this to show/hide the "Install App"
 * row in ProfileTab.
 */
export function shouldShowInstallRow(): boolean {
  if (Platform.OS !== 'web' || typeof window === 'undefined') return false;
  return !isStandalone();
}

/**
 * Returns true if the auto-prompt (post-onboarding) should fire.
 * Only once per device, only in browser mode.
 */
export function shouldAutoPrompt(): boolean {
  if (Platform.OS !== 'web' || typeof window === 'undefined') return false;
  if (isStandalone()) return false;
  if (wasDismissed()) return false;
  return true;
}

// ── Step bullet ────────────────────────────────────────────────────────────────
function Step({ n, text }: { n: number; text: string }) {
  return (
    <View style={styles.step}>
      <View style={styles.stepBadge}>
        <Text style={styles.stepNum}>{n}</Text>
      </View>
      <Text style={styles.stepText}>{text}</Text>
    </View>
  );
}

// ── Styles ─────────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  scrim: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(5,5,8,0.85)',
  } as any,
  card: {
    position: 'absolute',
    left: 24, right: 24, top: '18%',
    backgroundColor: colors.ink2,
    borderWidth: 1,
    borderColor: colors.goldBorder,
    borderRadius: radius.xl,
    padding: 22,
  } as any,
  appIcon: {
    fontSize: 36,
    textAlign: 'center',
    marginBottom: 10,
  },
  title: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.white,
    marginTop: 8,
    letterSpacing: -0.3,
  },
  body: {
    fontSize: 13,
    color: colors.grey3,
    marginTop: 8,
    lineHeight: 19,
  },
  steps: {
    marginTop: 16,
    gap: 10,
  },
  step: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  stepBadge: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: colors.gold,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepNum: {
    fontSize: 12,
    fontWeight: '800',
    color: colors.ink,
  },
  stepText: {
    fontSize: 13,
    color: colors.grey3,
    flex: 1,
    lineHeight: 18,
  },
  actions: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 20,
  },
  laterBtn: {
    flex: 1,
    paddingVertical: 12,
    backgroundColor: colors.surface2,
    borderWidth: 1,
    borderColor: colors.ink4,
    borderRadius: radius.md,
    alignItems: 'center',
  },
  laterText: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.grey2,
  },
  installBtn: {
    flex: 1.2,
    paddingVertical: 12,
    backgroundColor: colors.gold,
    borderRadius: radius.md,
    alignItems: 'center',
  },
  installBtnDisabled: {
    opacity: 0.6,
  },
  installText: {
    fontSize: 13,
    fontWeight: '800',
    color: colors.ink,
    letterSpacing: 0.2,
  },
  gotItBtn: {
    marginTop: 20,
    paddingVertical: 12,
    backgroundColor: colors.gold,
    borderRadius: radius.md,
    alignItems: 'center',
  },
  gotItText: {
    fontSize: 13,
    fontWeight: '800',
    color: colors.ink,
    letterSpacing: 0.2,
  },
});
