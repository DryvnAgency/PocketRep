// Full-screen HARD LOCKOUT (Eduardo's P0 decision #2). Shown when useAccessGate
// returns 'locked' — a cancelled subscription, expired trial, or failed payment
// blocks the app entirely until the rep re-subscribes. No free tier, no bypass.
//
// `onResubscribe` is intentionally a prop: the actual Stripe checkout link/flow
// is GATED billing work Eduardo owns (see docs/MASTER_PLAN.md). This component
// only renders the blocking UI and surfaces the CTA.

import { View, Text, Pressable, StyleSheet } from 'react-native';
import { colors, radius } from '@/constants/theme';
import type { LockReason } from '@/lib/v2/accessGate';

const REASON_COPY: Record<LockReason, { title: string; body: string }> = {
  trial_expired: {
    title: 'Your trial has ended',
    body: 'Your free trial is up. Subscribe to get back into your book and keep Rex working for you.',
  },
  subscription_canceled: {
    title: 'Subscription canceled',
    body: 'Your subscription was canceled, so your book is locked. Re-subscribe to pick up right where you left off.',
  },
  payment_failed: {
    title: 'Payment needs attention',
    body: 'We couldn’t process your last payment. Update your billing to restore access to your book.',
  },
  no_subscription: {
    title: 'Subscription required',
    body: 'PocketRep needs an active subscription. Subscribe to unlock your book.',
  },
};

export default function LockoutScreen({
  reason = 'no_subscription',
  email,
  onResubscribe,
  onSignOut,
}: {
  reason?: LockReason;
  email?: string | null;
  onResubscribe?: () => void;
  onSignOut?: () => void;
}) {
  const copy = REASON_COPY[reason] ?? REASON_COPY.no_subscription;
  return (
    <View style={styles.root}>
      <View style={styles.card}>
        <View style={styles.lockBadge}>
          <Text style={styles.lockIcon}>🔒</Text>
        </View>
        <Text style={styles.title}>{copy.title}</Text>
        <Text style={styles.body}>{copy.body}</Text>

        <Pressable
          style={styles.primaryBtn}
          onPress={onResubscribe}
          accessibilityRole="button"
          accessibilityLabel="Re-subscribe"
        >
          <Text style={styles.primaryText}>Re-subscribe</Text>
        </Pressable>

        <Pressable
          style={styles.secondaryBtn}
          onPress={onSignOut}
          accessibilityRole="button"
          accessibilityLabel="Sign out"
        >
          <Text style={styles.secondaryText}>Sign out</Text>
        </Pressable>

        {email ? <Text style={styles.email}>Signed in as {email}</Text> : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.ink, alignItems: 'center', justifyContent: 'center', padding: 24 },
  card: { width: '100%', maxWidth: 380, alignItems: 'center' },
  lockBadge: {
    width: 64, height: 64, borderRadius: 20,
    backgroundColor: colors.goldBg,
    borderWidth: 1, borderColor: colors.goldBorder,
    alignItems: 'center', justifyContent: 'center',
    marginBottom: 20,
  },
  lockIcon: { fontSize: 28 },
  title: { fontSize: 22, fontWeight: '800', color: colors.white, letterSpacing: -0.4, textAlign: 'center' },
  body: { fontSize: 14, color: colors.grey2, lineHeight: 20, textAlign: 'center', marginTop: 10, marginBottom: 24 },
  primaryBtn: {
    width: '100%',
    backgroundColor: colors.gold,
    borderRadius: radius.lg,
    paddingVertical: 15,
    alignItems: 'center',
  },
  primaryText: { color: colors.ink, fontWeight: '800', fontSize: 15, letterSpacing: -0.1 },
  secondaryBtn: { width: '100%', paddingVertical: 13, alignItems: 'center', marginTop: 10 },
  secondaryText: { color: colors.grey2, fontWeight: '600', fontSize: 14 },
  email: { color: colors.grey, fontSize: 12, marginTop: 18 },
});
