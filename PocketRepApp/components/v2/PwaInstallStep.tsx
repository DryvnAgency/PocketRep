import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, radius } from '@/constants/theme';

export default function PwaInstallStep({ onContinue }: { onContinue: () => void }) {
  const isIOS = Platform.OS === 'ios';
  const isAndroid = Platform.OS === 'android';
  const isWeb = Platform.OS === 'web';

  return (
    <View style={styles.root}>
      <View style={styles.orb}><Text style={styles.orbText}>P</Text></View>
      <Text style={styles.eyebrow}>QUICK SETUP</Text>
      <Text style={styles.title}>Put PocketRep on your phone.</Text>
      <Text style={styles.body}>
        PocketRep works like an app without an App Store download. Add it to your Home Screen so Rex is one tap away whenever you need him.
      </Text>

      {isWeb && (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>{isIOS ? 'iPhone / iPad' : isAndroid ? 'Android' : 'Phone or computer'}</Text>
          {isIOS ? (
            <>
              <Step n="1" text="Open PocketRep in Safari." />
              <Step n="2" text="Tap the Share button." />
              <Step n="3" text="Tap Add to Home Screen." />
              <Step n="4" text="Tap Add." />
            </>
          ) : isAndroid ? (
            <>
              <Step n="1" text="Open PocketRep in Chrome." />
              <Step n="2" text="Tap the ⋮ menu." />
              <Step n="3" text="Tap Install app or Add to Home screen." />
              <Step n="4" text="Tap Add / Install." />
            </>
          ) : (
            <>
              <Step n="1" text="On your phone, open app.pocketrep.pro in Safari or Chrome." />
              <Step n="2" text="Use your browser menu to choose Add to Home Screen or Install app." />
              <Step n="3" text="Open PocketRep from your Home Screen whenever you want to work." />
            </>
          )}
        </View>
      )}

      {!isWeb && (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>You're already in the app.</Text>
          <Text style={styles.cardBody}>We'll keep your setup focused on learning PocketRep and working your first customers.</Text>
        </View>
      )}

      <View style={styles.tip}>
        <Text style={styles.tipTitle}>WHY THIS MATTERS</Text>
        <Text style={styles.tipText}>Once installed, PocketRep sits on your Home Screen and opens like an app. You can always install it later from the browser.</Text>
      </View>

      <Pressable onPress={onContinue} style={styles.primary} accessibilityRole="button">
        <Text style={styles.primaryText}>I've Got It — Continue</Text>
      </Pressable>
      <Pressable onPress={onContinue} style={styles.skip} accessibilityRole="button">
        <Text style={styles.skipText}>I'll do this later</Text>
      </Pressable>
    </View>
  );
}

function Step({ n, text }: { n: string; text: string }) {
  return <View style={styles.step}><View style={styles.number}><Text style={styles.numberText}>{n}</Text></View><Text style={styles.stepText}>{text}</Text></View>;
}

const styles = StyleSheet.create({
  root: { ...StyleSheet.absoluteFillObject, backgroundColor: colors.ink, zIndex: 96, padding: 24, justifyContent: 'center' } as any,
  orb: { width: 44, height: 44, borderRadius: 22, backgroundColor: colors.gold, alignItems: 'center', justifyContent: 'center', marginBottom: 18 },
  orbText: { color: colors.ink, fontWeight: '900', fontSize: 20 },
  eyebrow: { color: colors.gold, fontSize: 10, fontWeight: '800', letterSpacing: 1.3, marginBottom: 8 },
  title: { color: colors.white, fontSize: 30, lineHeight: 35, fontWeight: '800', letterSpacing: -0.7 },
  body: { color: colors.grey3, fontSize: 15, lineHeight: 22, marginTop: 12 },
  card: { marginTop: 20, padding: 16, borderRadius: radius.xl, borderWidth: 1, borderColor: colors.goldBorder, backgroundColor: colors.ink2, gap: 12 },
  cardTitle: { color: colors.white, fontSize: 16, fontWeight: '800' },
  cardBody: { color: colors.grey3, fontSize: 13, lineHeight: 19 },
  step: { flexDirection: 'row', alignItems: 'center', gap: 11 },
  number: { width: 28, height: 28, borderRadius: 14, backgroundColor: colors.goldBg, borderWidth: 1, borderColor: colors.goldBorder, alignItems: 'center', justifyContent: 'center' },
  numberText: { color: colors.gold, fontWeight: '900', fontSize: 12 },
  stepText: { color: colors.white, flex: 1, fontSize: 13, lineHeight: 18 },
  tip: { marginTop: 16, padding: 12, borderRadius: 12, backgroundColor: colors.surface2 },
  tipTitle: { color: colors.gold, fontSize: 9, fontWeight: '900', letterSpacing: 1.1 },
  tipText: { color: colors.grey2, fontSize: 12, lineHeight: 18, marginTop: 4 },
  primary: { marginTop: 22, backgroundColor: colors.gold, borderRadius: radius.lg, paddingVertical: 15, alignItems: 'center' },
  primaryText: { color: colors.ink, fontWeight: '900', fontSize: 15 },
  skip: { alignItems: 'center', paddingVertical: 12 },
  skipText: { color: colors.grey2, fontSize: 13, fontWeight: '600' },
});
