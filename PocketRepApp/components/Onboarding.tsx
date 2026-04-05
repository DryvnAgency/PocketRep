/**
 * PocketRep — Onboarding Modal
 * Shows once on first launch. Walks new reps through 4 key features.
 * Completion stored in AsyncStorage / localStorage so it only shows once.
 */

import { useState, useEffect, useRef } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, Modal,
  Animated, Dimensions, Platform,
} from 'react-native';
import { useRouter } from 'expo-router';
import { colors, radius, spacing } from '@/constants/theme';

const ONBOARDED_KEY = 'pocketrep_onboarded_v1';
const { width: W } = Dimensions.get('window');

// ── Cross-platform storage ─────────────────────────────────────────────────
let AsyncStorage: any = null;
try { AsyncStorage = require('@react-native-async-storage/async-storage').default; } catch {}

async function storageGet(key: string): Promise<string | null> {
  if (AsyncStorage) return AsyncStorage.getItem(key);
  if (typeof localStorage !== 'undefined') return localStorage.getItem(key);
  return null;
}
async function storageSet(key: string, value: string): Promise<void> {
  if (AsyncStorage) return AsyncStorage.setItem(key, value);
  if (typeof localStorage !== 'undefined') localStorage.setItem(key, value);
}

// ── Steps ─────────────────────────────────────────────────────────────────
const STEPS = [
  {
    icon: '👋',
    title: 'Welcome to PocketRep',
    body: "Your personal CRM built for sales reps — not managers. Add contacts, track follow-ups, and let Rex do the heavy lifting.",
  },
  {
    icon: '🔥',
    title: 'Your Heat Sheet',
    body: "Every contact gets a heat score. Hot contacts are ready to buy. Warm ones need nurturing. Rex updates scores automatically after every voice note.",
  },
  {
    icon: '🎙️',
    title: 'Say "Hey Rex"',
    body: 'After every customer interaction, tap the mic and talk. Rex transcribes your notes, extracts follow-up dates, and builds a personalized message sequence automatically.',
  },
  {
    icon: '📲',
    title: 'Build Your Book',
    body: "Import contacts from a CSV or your phone, or add them one by one. The more contacts you add, the smarter your pipeline gets.",
  },
];

export default function Onboarding() {
  const [visible, setVisible] = useState(false);
  const [step, setStep] = useState(0);
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(30)).current;
  const router = useRouter();

  useEffect(() => {
    storageGet(ONBOARDED_KEY).then(val => {
      if (!val) setVisible(true);
    });
  }, []);

  useEffect(() => {
    if (!visible) return;
    fadeAnim.setValue(0);
    slideAnim.setValue(20);
    Animated.parallel([
      Animated.timing(fadeAnim, { toValue: 1, duration: 280, useNativeDriver: true }),
      Animated.timing(slideAnim, { toValue: 0, duration: 280, useNativeDriver: true }),
    ]).start();
  }, [step, visible]);

  async function complete() {
    await storageSet(ONBOARDED_KEY, '1');
    setVisible(false);
    router.push('/(tabs)/contacts');
  }

  async function skip() {
    await storageSet(ONBOARDED_KEY, '1');
    setVisible(false);
  }

  if (!visible) return null;

  const current = STEPS[step];
  const isLast = step === STEPS.length - 1;

  return (
    <Modal visible={visible} transparent animationType="fade">
      <View style={s.overlay}>
        <View style={s.card}>
          {/* Skip */}
          {!isLast && (
            <TouchableOpacity style={s.skipBtn} onPress={skip} activeOpacity={0.7}>
              <Text style={s.skipText}>Skip</Text>
            </TouchableOpacity>
          )}

          {/* Content */}
          <Animated.View style={{ opacity: fadeAnim, transform: [{ translateY: slideAnim }], alignItems: 'center' }}>
            <Text style={s.icon}>{current.icon}</Text>
            <Text style={s.title}>{current.title}</Text>
            <Text style={s.body}>{current.body}</Text>
          </Animated.View>

          {/* Progress dots */}
          <View style={s.dots}>
            {STEPS.map((_, i) => (
              <View
                key={i}
                style={[s.dot, i === step && s.dotActive, i === step && { width: 18 }]}
              />
            ))}
          </View>

          {/* CTA */}
          <TouchableOpacity
            style={s.cta}
            onPress={isLast ? complete : () => setStep(s => s + 1)}
            activeOpacity={0.85}
          >
            <Text style={s.ctaText}>{isLast ? "Let's Go →" : 'Next'}</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const s = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.72)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: spacing.xl,
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: colors.ink4,
    padding: spacing.xl,
    width: Math.min(W - spacing.xl * 2, 400),
    alignItems: 'center',
  },
  skipBtn: {
    alignSelf: 'flex-end',
    paddingVertical: 4,
    paddingHorizontal: spacing.sm,
    marginBottom: spacing.md,
  },
  skipText: { color: colors.grey, fontSize: 13 },
  icon: { fontSize: 52, marginBottom: spacing.md },
  title: {
    fontSize: 22,
    fontWeight: '800',
    color: colors.white,
    textAlign: 'center',
    marginBottom: spacing.sm,
  },
  body: {
    fontSize: 15,
    color: colors.grey2,
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: spacing.xl,
  },
  dots: {
    flexDirection: 'row',
    gap: 6,
    marginBottom: spacing.xl,
    alignItems: 'center',
  },
  dot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: colors.ink4,
  },
  dotActive: {
    backgroundColor: colors.gold,
    borderRadius: 4,
    height: 7,
  },
  cta: {
    backgroundColor: colors.gold,
    borderRadius: radius.lg,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.xl * 1.5,
    alignItems: 'center',
    width: '100%',
  },
  ctaText: {
    color: colors.ink,
    fontWeight: '800',
    fontSize: 16,
  },
});
