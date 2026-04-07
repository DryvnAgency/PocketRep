import { useState, useRef, useEffect } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, Modal,
  Dimensions, Animated, Platform,
} from 'react-native';
import { useRouter } from 'expo-router';
import { colors, radius, spacing } from '@/constants/theme';

let AsyncStorage: any = null;
try { AsyncStorage = require('@react-native-async-storage/async-storage').default; } catch {}

const STORAGE_KEY = 'pocketrep_onboarded_v1';
const { width: W } = Dimensions.get('window');

const STEPS = [
  {
    icon: '⚡',
    title: 'Welcome to PocketRep',
    body: 'Your AI-powered rep book. Rex learns your customers, scores your book, and tells you exactly who to call — before they go cold.',
    cta: 'Let\'s go →',
  },
  {
    icon: '🔥',
    title: 'Your Heat Sheet',
    body: 'Every contact gets a live score based on lease dates, mileage, purchase history, and buying signals Rex picks up from your voice notes. Hot = call today.',
    cta: 'Got it →',
  },
  {
    icon: '🎙',
    title: 'Hey Rex',
    body: 'Walk out of a meeting, tap the gold orb, and talk. "Marcus Webb, interested in the F-150, lease ends in April, call Friday." Rex logs it, sets the follow-up, and builds a sequence.',
    cta: 'Nice →',
  },
  {
    icon: '📖',
    title: 'Build Your Book',
    body: 'Add contacts one by one, import from your phone, or upload a CSV. The more Rex knows about your book, the sharper his calls get.',
    cta: 'Add my first contact →',
    final: true,
  },
];

export default function Onboarding() {
  const [visible, setVisible] = useState(false);
  const [step, setStep] = useState(0);
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(30)).current;
  const router = useRouter();

  useEffect(() => {
    async function check() {
      try {
        const storage = AsyncStorage ?? (typeof localStorage !== 'undefined' ? {
          getItem: (k: string) => Promise.resolve(localStorage.getItem(k)),
          setItem: (k: string, v: string) => { localStorage.setItem(k, v); return Promise.resolve(); },
        } : null);
        if (!storage) { return; }
        const done = await storage.getItem(STORAGE_KEY);
        if (!done) setVisible(true);
      } catch {}
    }
    check();
  }, []);

  useEffect(() => {
    if (!visible) return;
    fadeAnim.setValue(0);
    slideAnim.setValue(24);
    Animated.parallel([
      Animated.timing(fadeAnim, { toValue: 1, duration: 280, useNativeDriver: true }),
      Animated.timing(slideAnim, { toValue: 0, duration: 280, useNativeDriver: true }),
    ]).start();
  }, [step, visible]);

  async function complete(goToContacts = false) {
    try {
      const storage = AsyncStorage ?? (typeof localStorage !== 'undefined' ? {
        setItem: (k: string, v: string) => { localStorage.setItem(k, v); return Promise.resolve(); },
      } : null);
      await storage?.setItem(STORAGE_KEY, '1');
    } catch {}
    setVisible(false);
    if (goToContacts) router.push('/(tabs)/contacts');
  }

  function next() {
    const current = STEPS[step];
    if (current.final) { complete(true); return; }
    setStep(s => s + 1);
  }

  if (!visible) return null;

  const current = STEPS[step];

  return (
    <Modal visible={visible} transparent animationType="fade">
      <View style={s.overlay}>
        <Animated.View style={[s.card, { opacity: fadeAnim, transform: [{ translateY: slideAnim }] }]}>

          {/* Skip */}
          <TouchableOpacity style={s.skipBtn} onPress={() => complete(false)}>
            <Text style={s.skipText}>Skip</Text>
          </TouchableOpacity>

          {/* Icon */}
          <Text style={s.icon}>{current.icon}</Text>

          {/* Title */}
          <Text style={s.title}>{current.title}</Text>

          {/* Body */}
          <Text style={s.body}>{current.body}</Text>

          {/* Progress dots */}
          <View style={s.dots}>
            {STEPS.map((_, i) => (
              <View key={i} style={[s.dot, i === step && s.dotActive]} />
            ))}
          </View>

          {/* CTA */}
          <TouchableOpacity style={s.cta} onPress={next} activeOpacity={0.85}>
            <Text style={s.ctaText}>{current.cta}</Text>
          </TouchableOpacity>

        </Animated.View>
      </View>
    </Modal>
  );
}

const s = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.82)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xl,
  },
  card: {
    backgroundColor: colors.ink2,
    borderRadius: 24,
    padding: spacing.xl,
    width: '100%',
    maxWidth: 380,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.07)',
  },
  skipBtn: {
    alignSelf: 'flex-end',
    marginBottom: spacing.md,
    padding: 4,
  },
  skipText: { color: colors.grey2, fontSize: 13, fontWeight: '600' },
  icon: { fontSize: 52, marginBottom: spacing.md },
  title: {
    fontSize: 22, fontWeight: '800', color: colors.white,
    textAlign: 'center', letterSpacing: -0.4, marginBottom: spacing.md,
  },
  body: {
    fontSize: 15, color: colors.grey3, textAlign: 'center', lineHeight: 22,
    marginBottom: spacing.xl,
  },
  dots: {
    flexDirection: 'row', gap: 6, marginBottom: spacing.xl,
  },
  dot: {
    width: 6, height: 6, borderRadius: 3, backgroundColor: colors.ink4,
  },
  dotActive: {
    backgroundColor: colors.gold, width: 18,
  },
  cta: {
    backgroundColor: colors.gold, borderRadius: radius.lg,
    paddingHorizontal: spacing.xl, paddingVertical: spacing.md + 2,
    width: '100%', alignItems: 'center',
  },
  ctaText: { color: colors.ink, fontWeight: '800', fontSize: 15 },
});
