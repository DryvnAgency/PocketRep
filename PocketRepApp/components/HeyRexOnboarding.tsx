import { useState, useRef, useEffect } from 'react';
import {
  View, Text, Modal, TouchableOpacity, StyleSheet,
  Animated, Pressable, Platform,
} from 'react-native';
import { colors, radius, spacing } from '@/constants/theme';

// ── HeyRexOnboarding ─────────────────────────────────────────────────────────
// 4-screen modal shown the first time a rep enables Hey Rex voice activation.
// Screens:
//   0 — What is Hey Rex
//   1 — Try it (demo trigger)
//   2 — Success / what else you can say
//   3 — All set / indicator explanation

interface Props {
  visible: boolean;
  onDone: () => void;
}

const SCREENS = [
  {
    emoji: '🎙',
    title: 'Meet Hey Rex',
    body: "Hey Rex lets you talk to PocketRep hands-free.\n\nPerfect for walking back from the lot, parking the car, or grabbing a key fob — when your hands are full and the deal is still fresh.",
    cta: 'Next →',
  },
  {
    emoji: '👂',
    title: 'Try it now.',
    body: 'Say "Hey Rex" or tap the button below to test.\n\nOnce Rex hears you, he starts listening for your customer notes — just like tapping the gold orb.',
    cta: 'Simulate Hey Rex →',
    ctaAlt: 'Skip for now',
  },
  {
    emoji: '✅',
    title: 'Nice. Rex heard you.',
    body: "You can also say things like:\n\n"Hey Rex, log a customer"\n"Hey Rex, who should I call next?"\n"Hey Rex, what do I say about the trade-in?"\n\nRex knows everything in your book.",
    cta: 'Got it →',
  },
  {
    emoji: '🟢',
    title: "Rex is listening.",
    body: "The green dot on the orb means Rex is actively watching for your wake word.\n\nTap the orb anytime to pause. Go to More → Hey Rex to adjust sensitivity or turn it off.",
    cta: "Let's go →",
  },
];

export default function HeyRexOnboarding({ visible, onDone }: Props) {
  const [screen, setScreen] = useState(0);
  const fadeAnim = useRef(new Animated.Value(1)).current;
  const pulseAnim = useRef(new Animated.Value(1)).current;

  // Reset to screen 0 when modal opens
  useEffect(() => {
    if (visible) setScreen(0);
  }, [visible]);

  // Pulse animation for the emoji on screen 1
  useEffect(() => {
    if (screen === 1) {
      Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, { toValue: 1.15, duration: 700, useNativeDriver: true }),
          Animated.timing(pulseAnim, { toValue: 1, duration: 700, useNativeDriver: true }),
        ])
      ).start();
    } else {
      pulseAnim.stopAnimation();
      pulseAnim.setValue(1);
    }
  }, [screen]);

  function advance(toScreen?: number) {
    Animated.timing(fadeAnim, { toValue: 0, duration: 120, useNativeDriver: true }).start(() => {
      setScreen(s => toScreen ?? s + 1);
      Animated.timing(fadeAnim, { toValue: 1, duration: 180, useNativeDriver: true }).start();
    });
  }

  function handleCta() {
    if (screen === 1) {
      // "Simulate Hey Rex" — jump to success screen
      advance(2);
    } else if (screen < SCREENS.length - 1) {
      advance();
    } else {
      onDone();
    }
  }

  const data = SCREENS[screen];
  const isLastScreen = screen === SCREENS.length - 1;

  return (
    <Modal visible={visible} animationType="fade" transparent statusBarTranslucent>
      <Pressable style={s.overlay} onPress={isLastScreen ? onDone : undefined}>
        <Pressable style={s.sheet} onPress={e => e.stopPropagation()}>

          {/* Progress dots */}
          <View style={s.dots}>
            {SCREENS.map((_, i) => (
              <View key={i} style={[s.dot, screen === i && s.dotActive]} />
            ))}
          </View>

          <Animated.View style={{ opacity: fadeAnim, alignItems: 'center' }}>
            {/* Emoji */}
            <Animated.Text
              style={[s.emoji, screen === 1 && { transform: [{ scale: pulseAnim }] }]}
            >
              {data.emoji}
            </Animated.Text>

            {/* Title */}
            <Text style={s.title}>{data.title}</Text>

            {/* Body */}
            <Text style={s.body}>{data.body}</Text>

            {/* Green dot indicator on last screen */}
            {screen === 3 && (
              <View style={s.dotPreview}>
                <View style={s.dotPreviewOrb}>
                  <Text style={s.dotPreviewOrbIcon}>🎙</Text>
                  <View style={s.dotPreviewDot} />
                </View>
                <Text style={s.dotPreviewLabel}>Green dot = Rex is listening</Text>
              </View>
            )}
          </Animated.View>

          {/* CTA button */}
          <TouchableOpacity style={s.cta} onPress={handleCta} activeOpacity={0.85}>
            <Text style={s.ctaText}>{data.cta}</Text>
          </TouchableOpacity>

          {/* Alt action (screen 1 only) */}
          {screen === 1 && (
            <TouchableOpacity style={s.altCta} onPress={() => advance(3)} activeOpacity={0.8}>
              <Text style={s.altCtaText}>Skip for now</Text>
            </TouchableOpacity>
          )}

          {/* Skip all (screens 0-2) */}
          {!isLastScreen && screen !== 1 && (
            <TouchableOpacity style={s.altCta} onPress={onDone} activeOpacity={0.8}>
              <Text style={s.altCtaText}>Skip</Text>
            </TouchableOpacity>
          )}

        </Pressable>
      </Pressable>
    </Modal>
  );
}

const s = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.75)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: colors.ink2,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    paddingBottom: Platform.OS === 'ios' ? 40 : 28,
    alignItems: 'center',
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.07)',
  },
  dots: {
    flexDirection: 'row',
    gap: 6,
    marginBottom: spacing.lg,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.ink4,
  },
  dotActive: {
    backgroundColor: colors.gold,
    width: 18,
  },
  emoji: {
    fontSize: 52,
    marginBottom: spacing.md,
  },
  title: {
    fontSize: 22,
    fontWeight: '800',
    color: colors.white,
    letterSpacing: -0.4,
    textAlign: 'center',
    marginBottom: spacing.md,
    fontFamily: 'Bricolage Grotesque',
  },
  body: {
    fontSize: 14,
    color: colors.grey2,
    lineHeight: 22,
    textAlign: 'center',
    marginBottom: spacing.lg,
    paddingHorizontal: 4,
  },
  // Green dot preview (screen 3)
  dotPreview: {
    alignItems: 'center',
    marginBottom: spacing.lg,
    gap: 8,
  },
  dotPreviewOrb: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: colors.gold,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  dotPreviewOrbIcon: { fontSize: 22 },
  dotPreviewDot: {
    position: 'absolute',
    top: 4,
    right: 4,
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: colors.green,
    borderWidth: 1.5,
    borderColor: colors.ink,
  },
  dotPreviewLabel: {
    fontSize: 12,
    color: colors.grey2,
    fontWeight: '500',
  },
  cta: {
    width: '100%',
    backgroundColor: colors.gold,
    borderRadius: radius.md,
    padding: spacing.md,
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  ctaText: {
    color: colors.ink,
    fontWeight: '800',
    fontSize: 15,
    letterSpacing: 0.1,
  },
  altCta: {
    padding: spacing.sm,
    alignItems: 'center',
  },
  altCtaText: {
    color: colors.grey2,
    fontSize: 13,
    fontWeight: '500',
  },
});
