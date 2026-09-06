import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, View, Text, Pressable, ScrollView, StyleSheet, Platform } from 'react-native';
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

function InstallCard({ children }: { children: React.ReactNode }) {
  return (
    <ScrollView
      style={styles.card}
      contentContainerStyle={styles.cardContent}
      showsVerticalScrollIndicator={false}
      bounces={false}
    >
      {children}
    </ScrollView>
  );
}

function InstallBrandMark() {
  return (
    <View style={styles.installMark} accessibilityElementsHidden>
      <View style={styles.installMarkPhone}>
        <View style={styles.installMarkSpeaker} />
        <View style={styles.installMarkOrb}><View style={styles.installMarkCore} /></View>
        <View style={styles.installMarkHome} />
      </View>
      <View style={styles.installMarkBadge}><Text style={styles.installMarkBadgeText}>+</Text></View>
    </View>
  );
}

function MissionPreview() {
  return (
    <View style={styles.missionPreview} accessibilityLabel="Next activation steps: install PocketRep, load last month, load the month before, then review your Rex Text Queue">
      <View style={styles.missionHeader}>
        <View>
          <Text style={styles.missionEyebrow}>NEXT · ACTIVATE YOUR REAL BOOK</Text>
          <Text style={styles.missionTitle}>Your first 60 days, in order.</Text>
        </View>
        <View style={styles.rexReady}><View style={styles.rexDot} /><Text style={styles.rexReadyText}>REX READY</Text></View>
      </View>
      <View style={styles.missionSteps}>
        <MissionStep n="1" title="Install PocketRep" detail="Keep your book one tap away." />
        <MissionStep n="2" title="Load last month" detail="Start with the freshest sold customers." />
        <MissionStep n="3" title="Load the month before" detail="Complete your 60-day sold book." />
      </View>
      <View style={styles.queuePreview}>
        <Text style={styles.queuePreviewLabel}>TEXT QUEUE</Text>
        <Text style={styles.queuePreviewText}>Rex builds a different reason + draft for each customer. You review every send.</Text>
      </View>
    </View>
  );
}

function MissionStep({ n, title, detail }: { n: string; title: string; detail: string }) {
  return (
    <View style={styles.missionStep}>
      <View style={styles.missionStepNum}><Text style={styles.missionStepNumText}>{n}</Text></View>
      <View style={styles.missionStepCopy}>
        <Text style={styles.missionStepTitle}>{title}</Text>
        <Text style={styles.missionStepDetail}>{detail}</Text>
      </View>
    </View>
  );
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
        <InstallCard>
          <InstallBrandMark />
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
          <MissionPreview />
          <Pressable onPress={handleDismiss} style={({ pressed }) => [styles.gotItBtn, pressed && styles.pressed]} accessibilityRole="button" accessibilityLabel="Got it, build my 60-day book">
            <Text style={styles.gotItText}>Got it · build my 60-day book</Text>
          </Pressable>
        </InstallCard>
      </View>
    );
  }

  if (deferredPromptEvent && !ios) {
    return (
      <View style={StyleSheet.absoluteFillObject as any}>
        <Pressable style={styles.scrim} onPress={handleDismiss} />
        <InstallCard>
          <InstallBrandMark />
          <Label color={colors.gold}>PUT POCKETREP ON YOUR HOME SCREEN</Label>
          <Text style={styles.title}>Keep Rex one tap away</Text>
          <Text style={styles.body}>
            Install PocketRep for instant access and full-screen mode. No app store needed.
          </Text>
          <MissionPreview />
          <View style={styles.actions}>
            <Pressable onPress={handleDismiss} style={({ pressed }) => [styles.laterBtn, pressed && styles.pressed]} accessibilityRole="button">
              <Text style={styles.laterText}>Later</Text>
            </Pressable>
            <Pressable
              onPress={handleInstall}
              style={({ pressed }) => [styles.installBtn, pressed && !installing && styles.pressed, installing && styles.installBtnDisabled]}
              disabled={installing}
              accessibilityRole="button"
              accessibilityLabel="Install PocketRep"
              accessibilityState={{ disabled: installing, busy: installing }}
            >
              {installing ? <View style={styles.installingRow}><ActivityIndicator size="small" color={colors.ink} /><Text style={styles.installText}>INSTALLING…</Text></View> : <Text style={styles.installText}>Install PocketRep</Text>}
            </Pressable>
          </View>
        </InstallCard>
      </View>
    );
  }

  if (ios) {
    return (
      <View style={StyleSheet.absoluteFillObject as any}>
        <Pressable style={styles.scrim} onPress={handleDismiss} />
        <InstallCard>
          <InstallBrandMark />
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
          <MissionPreview />
          <Pressable onPress={handleDismiss} style={({ pressed }) => [styles.gotItBtn, pressed && styles.pressed]} accessibilityRole="button" accessibilityLabel="Got it, build my 60-day book">
            <Text style={styles.gotItText}>Got it · build my 60-day book</Text>
          </Pressable>
        </InstallCard>
      </View>
    );
  }

  if (android) {
    return (
      <View style={StyleSheet.absoluteFillObject as any}>
        <Pressable style={styles.scrim} onPress={handleDismiss} />
        <InstallCard>
          <InstallBrandMark />
          <Label color={colors.gold}>PUT POCKETREP ON YOUR HOME SCREEN</Label>
          <Text style={styles.title}>Install PocketRep like an Android app</Text>
          <Text style={styles.body}>Add PocketRep to your home screen for instant access and full-screen mode.</Text>
          <View style={styles.steps}>
            <Step n={1} text={'Tap the ⋮ menu in the top right of Chrome'} />
            <Step n={2} text={'Tap "Add to Home screen" or "Install app"'} />
            <Step n={3} text={'Tap "Install" to confirm'} />
          </View>
          <MissionPreview />
          <Pressable onPress={handleDismiss} style={({ pressed }) => [styles.gotItBtn, pressed && styles.pressed]} accessibilityRole="button" accessibilityLabel="Got it, build my 60-day book">
            <Text style={styles.gotItText}>Got it · build my 60-day book</Text>
          </Pressable>
        </InstallCard>
      </View>
    );
  }

  return (
    <View style={StyleSheet.absoluteFillObject as any}>
      <Pressable style={styles.scrim} onPress={handleDismiss} />
      <InstallCard>
        <InstallBrandMark />
        <Label color={colors.gold}>INSTALL POCKETREP</Label>
        <Text style={styles.title}>Keep PocketRep in your dock or taskbar</Text>
        <Text style={styles.body}>Install PocketRep as a desktop app for a dedicated window and quick access.</Text>
        <View style={styles.steps}>
          <Step n={1} text={'Click the install icon in your browser\'s address bar'} />
          <Step n={2} text={'Click "Install" to confirm'} />
        </View>
        <MissionPreview />
        <Pressable onPress={handleDismiss} style={({ pressed }) => [styles.gotItBtn, pressed && styles.pressed]} accessibilityRole="button" accessibilityLabel="Got it, build my 60-day book">
          <Text style={styles.gotItText}>Got it · build my 60-day book</Text>
        </Pressable>
      </InstallCard>
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
  card: {
    position: 'absolute',
    left: 24,
    right: 24,
    top: Platform.OS === 'web' ? ('max(24px, env(safe-area-inset-top))' as any) : 24,
    maxHeight: Platform.OS === 'web' ? ('calc(100dvh - max(48px, env(safe-area-inset-top)) - max(24px, env(safe-area-inset-bottom)))' as any) : '90%',
    backgroundColor: colors.ink2,
    borderWidth: 1,
    borderColor: colors.goldBorder,
    borderRadius: radius.xl,
  } as any,
  cardContent: {
    padding: 22,
    paddingBottom: Platform.OS === 'web' ? ('max(22px, env(safe-area-inset-bottom))' as any) : 22,
  } as any,
  installMark: { alignSelf: 'center', width: 54, height: 58, marginBottom: 14, alignItems: 'center', justifyContent: 'center' },
  installMarkPhone: { width: 36, height: 52, borderRadius: 9, borderWidth: 1, borderColor: colors.goldBorderStrong, backgroundColor: colors.surface2, alignItems: 'center', justifyContent: 'center' },
  installMarkSpeaker: { position: 'absolute', top: 5, width: 9, height: 2, borderRadius: 1, backgroundColor: colors.grey },
  installMarkOrb: { width: 20, height: 20, borderRadius: 10, borderWidth: 1, borderColor: colors.goldBorder, backgroundColor: colors.goldBg, alignItems: 'center', justifyContent: 'center' },
  installMarkCore: { width: 6, height: 6, borderRadius: 3, backgroundColor: colors.gold },
  installMarkHome: { position: 'absolute', bottom: 5, width: 5, height: 5, borderRadius: 3, borderWidth: 1, borderColor: colors.grey },
  installMarkBadge: { position: 'absolute', right: 0, bottom: 3, width: 22, height: 22, borderRadius: 11, backgroundColor: colors.gold, borderWidth: 2, borderColor: colors.ink2, alignItems: 'center', justifyContent: 'center' },
  installMarkBadgeText: { color: colors.ink, fontSize: 15, lineHeight: 17, fontWeight: '900' },
  title: { fontSize: 20, lineHeight: 25, fontWeight: '800', color: colors.white, marginTop: 8, letterSpacing: -0.4 },
  body: { fontSize: 13, color: colors.grey3, marginTop: 8, lineHeight: 19 },
  steps: { marginTop: 16, gap: 10 },
  step: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  stepBadge: { width: 26, height: 26, borderRadius: 13, backgroundColor: colors.gold, alignItems: 'center', justifyContent: 'center' },
  stepNum: { fontSize: 12, fontWeight: '900', color: colors.ink },
  stepText: { fontSize: 13, color: colors.grey3, flex: 1, lineHeight: 18 },
  missionPreview: { marginTop: 18, padding: 14, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.goldBorder, backgroundColor: colors.surface },
  missionHeader: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10 },
  missionEyebrow: { color: colors.gold, fontSize: 8, fontWeight: '900', letterSpacing: 0.9 },
  missionTitle: { color: colors.white, fontSize: 14, lineHeight: 18, fontWeight: '800', marginTop: 4 },
  rexReady: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingTop: 2 },
  rexDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: colors.green },
  rexReadyText: { color: colors.grey2, fontSize: 7, fontWeight: '900', letterSpacing: 0.7 },
  missionSteps: { marginTop: 13, gap: 8 },
  missionStep: { flexDirection: 'row', alignItems: 'center', gap: 9, minHeight: 38, paddingHorizontal: 9, paddingVertical: 7, borderRadius: radius.md, borderWidth: 1, borderColor: colors.ink4, backgroundColor: colors.surface2 },
  missionStepNum: { width: 22, height: 22, borderRadius: 11, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.goldBg, borderWidth: 1, borderColor: colors.goldBorder },
  missionStepNumText: { color: colors.gold, fontSize: 9, fontWeight: '900' },
  missionStepCopy: { flex: 1, minWidth: 0 },
  missionStepTitle: { color: colors.white, fontSize: 11, fontWeight: '800' },
  missionStepDetail: { color: colors.grey2, fontSize: 9, lineHeight: 13, marginTop: 2 },
  queuePreview: { marginTop: 10, padding: 10, borderRadius: radius.md, borderWidth: 1, borderColor: colors.goldBorderStrong, backgroundColor: colors.goldBg },
  queuePreviewLabel: { color: colors.gold, fontSize: 8, fontWeight: '900', letterSpacing: 0.9 },
  queuePreviewText: { color: colors.white, fontSize: 10, lineHeight: 15, fontWeight: '700', marginTop: 4 },
  actions: { flexDirection: 'row', gap: 8, marginTop: 20 },
  laterBtn: { minHeight: 48, flex: 1, paddingHorizontal: 12, backgroundColor: colors.surface2, borderWidth: 1, borderColor: colors.ink4, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center' },
  laterText: { fontSize: 13, fontWeight: '800', color: colors.grey2 },
  installBtn: { minHeight: 48, flex: 1.2, paddingHorizontal: 12, backgroundColor: colors.gold, borderWidth: 1, borderColor: colors.gold2, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center' },
  installBtnDisabled: { opacity: 0.55 },
  installingRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  installText: { fontSize: 13, fontWeight: '900', color: colors.ink, letterSpacing: 0.5 },
  gotItBtn: { minHeight: 50, marginTop: 20, paddingHorizontal: 12, backgroundColor: colors.gold, borderWidth: 1, borderColor: colors.gold2, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center' },
  gotItText: { fontSize: 13, fontWeight: '900', color: colors.ink, letterSpacing: 0.3 },
  pressed: { opacity: 0.72, transform: [{ scale: 0.985 }] },
});
