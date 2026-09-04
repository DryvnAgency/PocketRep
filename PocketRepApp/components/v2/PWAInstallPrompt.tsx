import { useCallback, useEffect, useRef, useState } from 'react';
import { View, Text, Pressable, StyleSheet, Platform } from 'react-native';
import { colors, radius } from '@/constants/theme';
import { Label } from './atoms';

const DISMISSED_KEY = 'pocketrep:v2:pwa-install-dismissed';
const INSTALL_EVENT_KEY = 'pocketrep:v2:pwa-install-event-seen';

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

let deferredPromptEvent: any = null;
if (Platform.OS === 'web' && typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredPromptEvent = e;
    try { localStorage.setItem(INSTALL_EVENT_KEY, '1'); } catch { /* noop */ }
  });
}

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
        if (result?.outcome === 'accepted') markDismissed();
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

  if (isInAppBrowser()) {
    return (
      <View style={StyleSheet.absoluteFillObject as any}>
        <Pressable style={styles.scrim} onPress={handleDismiss} />
        <View style={styles.card}>
          <Text style={styles.appIcon}>📱</Text>
          <Label color={colors.gold}>PUT POCKETREP ON YOUR HOME SCREEN</Label>
          <Text style={styles.title}>Keep Rex one tap away</Text>
          <Text style={styles.body}>
            This built-in browser cannot install PocketRep. Open this page in
            {ios ? ' Safari' : ' Chrome'} first, then add PocketRep to your home screen like an app.
          </Text>
          <View style={styles.steps}>
            <Step n={1} text={'Tap the ••• or ⋮ menu (usually top-right)'} />
            <Step n={2} text={ios ? 'Choose "Open in Safari"' : 'Choose "Open in Chrome" or "Open in Browser"'} />
            <Step n={3} text={'Then use Add to Home Screen / Install app from the browser'} />
          </View>
          <Text style={styles.nextMission}>NEXT: load the last 2 months of customers you sold. Rex will turn them into your first personalized Text Queue.</Text>
          <Pressable onPress={handleDismiss} style={styles.gotItBtn}>
            <Text style={styles.gotItText}>Got it · build my 60-day book</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  if (deferredPromptEvent && !ios) {
    return (
      <View style={StyleSheet.absoluteFillObject as any}>
        <Pressable style={styles.scrim} onPress={handleDismiss} />
        <View style={styles.card}>
          <Text style={styles.appIcon}>📱</Text>
          <Label color={colors.gold}>PUT POCKETREP ON YOUR HOME SCREEN</Label>
          <Text style={styles.title}>Keep Rex one tap away</Text>
          <Text style={styles.body}>
            Install PocketRep for instant access, full-screen mode, and notifications. No app store needed.
          </Text>
          <Text style={styles.nextMission}>NEXT: load the last 2 months of customers you sold. Rex will turn them into your first personalized Text Queue.</Text>
          <View style={styles.actions}>
            <Pressable onPress={handleDismiss} style={styles.laterBtn}>
              <Text style={styles.laterText}>Later</Text>
            </Pressable>
            <Pressable onPress={handleInstall} style={[styles.installBtn, installing && styles.installBtnDisabled]} disabled={installing}>
              <Text style={styles.installText}>{installing ? 'Installing…' : 'Install PocketRep'}</Text>
            </Pressable>
          </View>
        </View>
      </View>
    );
  }

  if (ios) {
    return (
      <View style={StyleSheet.absoluteFillObject as any}>
        <Pressable style={styles.scrim} onPress={handleDismiss} />
        <View style={styles.card}>
          <Text style={styles.appIcon}>📱</Text>
          <Label color={colors.gold}>PUT POCKETREP ON YOUR HOME SCREEN</Label>
          <Text style={styles.title}>Install PocketRep like an iPhone app</Text>
          <Text style={styles.body}>
            No App Store yet. Safari can put PocketRep directly on your home screen so it opens full-screen and stays one tap away during the workday.
          </Text>
          <View style={styles.steps}>
            <Step n={1} text={'Tap the Share button  ⬆  at the bottom of Safari'} />
            <Step n={2} text={'Scroll down and tap "Add to Home Screen"'} />
            <Step n={3} text={'Tap "Add" in the top right'} />
          </View>
          <Text style={styles.nextMission}>NEXT: load the last 2 months of customers you sold. Start with last month, then the month before. Rex will build a different text for each customer and you control every send.</Text>
          <Pressable onPress={handleDismiss} style={styles.gotItBtn}>
            <Text style={styles.gotItText}>Got it · build my 60-day book</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  if (android) {
    return (
      <View style={StyleSheet.absoluteFillObject as any}>
        <Pressable style={styles.scrim} onPress={handleDismiss} />
        <View style={styles.card}>
          <Text style={styles.appIcon}>📱</Text>
          <Label color={colors.gold}>PUT POCKETREP ON YOUR HOME SCREEN</Label>
          <Text style={styles.title}>Install PocketRep like an Android app</Text>
          <Text style={styles.body}>Add PocketRep to your home screen for instant access and full-screen mode.</Text>
          <View style={styles.steps}>
            <Step n={1} text={'Tap the ⋮ menu in the top right of Chrome'} />
            <Step n={2} text={'Tap "Add to Home screen" or "Install app"'} />
            <Step n={3} text={'Tap "Install" to confirm'} />
          </View>
          <Text style={styles.nextMission}>NEXT: load the last 2 months of customers you sold. Rex will build your first personalized Text Queue and you control every send.</Text>
          <Pressable onPress={handleDismiss} style={styles.gotItBtn}>
            <Text style={styles.gotItText}>Got it · build my 60-day book</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  return (
    <View style={StyleSheet.absoluteFillObject as any}>
      <Pressable style={styles.scrim} onPress={handleDismiss} />
      <View style={styles.card}>
        <Text style={styles.appIcon}>💻</Text>
        <Label color={colors.gold}>INSTALL POCKETREP</Label>
        <Text style={styles.title}>Keep PocketRep in your dock or taskbar</Text>
        <Text style={styles.body}>Install PocketRep as a desktop app for a dedicated window and quick access.</Text>
        <View style={styles.steps}>
          <Step n={1} text={'Click the install icon in your browser\'s address bar'} />
          <Step n={2} text={'Click "Install" to confirm'} />
        </View>
        <Text style={styles.nextMission}>NEXT: load the last 2 months of customers you sold. Rex will build your first personalized Text Queue.</Text>
        <Pressable onPress={handleDismiss} style={styles.gotItBtn}>
          <Text style={styles.gotItText}>Got it · build my 60-day book</Text>
        </Pressable>
      </View>
    </View>
  );
}

export function shouldShowInstallRow(): boolean {
  if (Platform.OS !== 'web' || typeof window === 'undefined') return false;
  return !isStandalone();
}

export function shouldAutoPrompt(): boolean {
  if (Platform.OS !== 'web' || typeof window === 'undefined') return false;
  if (isStandalone()) return false;
  if (wasDismissed()) return false;
  return true;
}

function Step({ n, text }: { n: number; text: string }) {
  return (
    <View style={styles.step}>
      <View style={styles.stepBadge}><Text style={styles.stepNum}>{n}</Text></View>
      <Text style={styles.stepText}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  scrim: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(5,5,8,0.85)' } as any,
  card: { position: 'absolute', left: 24, right: 24, top: '12%', backgroundColor: colors.ink2, borderWidth: 1, borderColor: colors.goldBorder, borderRadius: radius.xl, padding: 22 } as any,
  appIcon: { fontSize: 36, textAlign: 'center', marginBottom: 10 },
  title: { fontSize: 18, fontWeight: '700', color: colors.white, marginTop: 8, letterSpacing: -0.3 },
  body: { fontSize: 13, color: colors.grey3, marginTop: 8, lineHeight: 19 },
  steps: { marginTop: 16, gap: 10 },
  step: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  stepBadge: { width: 24, height: 24, borderRadius: 12, backgroundColor: colors.gold, alignItems: 'center', justifyContent: 'center' },
  stepNum: { fontSize: 12, fontWeight: '800', color: colors.ink },
  stepText: { fontSize: 13, color: colors.grey3, flex: 1, lineHeight: 18 },
  nextMission: { marginTop: 16, padding: 12, borderRadius: radius.md, borderWidth: 1, borderColor: colors.goldBorder, backgroundColor: colors.goldBg, color: colors.white, fontSize: 12, lineHeight: 18, fontWeight: '700' },
  actions: { flexDirection: 'row', gap: 8, marginTop: 20 },
  laterBtn: { flex: 1, paddingVertical: 12, backgroundColor: colors.surface2, borderWidth: 1, borderColor: colors.ink4, borderRadius: radius.md, alignItems: 'center' },
  laterText: { fontSize: 13, fontWeight: '700', color: colors.grey2 },
  installBtn: { flex: 1.2, paddingVertical: 12, backgroundColor: colors.gold, borderRadius: radius.md, alignItems: 'center' },
  installBtnDisabled: { opacity: 0.6 },
  installText: { fontSize: 13, fontWeight: '800', color: colors.ink, letterSpacing: 0.2 },
  gotItBtn: { marginTop: 20, paddingVertical: 12, backgroundColor: colors.gold, borderRadius: radius.md, alignItems: 'center' },
  gotItText: { fontSize: 13, fontWeight: '800', color: colors.ink, letterSpacing: 0.2 },
});
