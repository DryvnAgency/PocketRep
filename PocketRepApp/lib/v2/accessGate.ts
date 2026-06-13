// Client-side access gate — HARD LOCKOUT model (Eduardo's P0 decisions #2 & #3).
//
// A signed-in user may use the app ONLY while they have an active subscription
// or a still-valid trial. A cancelled subscription, an expired trial, or a
// failed payment → hard lockout (see components/v2/LockoutScreen) until they
// re-subscribe. There is NO free tier.
//
// ⚠️ SCAFFOLDING. The authoritative subscription/trial read is GATED work that
// Eduardo owns — it depends on the Stripe webhook writing a subscription-state
// field onto profiles (see docs/MASTER_PLAN.md §"Gated P0 — Eduardo only").
// Until that exists, `useAccessGate()` fails OPEN (returns 'allowed') so current
// behavior is unchanged. The single attach point is the TODO inside the effect.
//
// `decideAccess()` below is the pure lockout POLICY (no Stripe/billing code) — it
// already encodes the hard-lockout rule so the policy lives in one place and is
// unit-testable; Eduardo just feeds it the real fields.

import { useEffect, useState } from 'react';

export type LockReason =
  | 'trial_expired'
  | 'subscription_canceled'
  | 'payment_failed'
  | 'no_subscription';

export type AccessState =
  | { status: 'loading' }
  | { status: 'allowed' }
  | { status: 'locked'; reason: LockReason };

/**
 * Pure policy: given the gating inputs, decide whether access is allowed or the
 * user is hard-locked out. No Stripe/billing calls — Eduardo wires the inputs
 * from profiles once the webhook populates them.
 */
export function decideAccess(input: {
  subscriptionStatus?: string | null; // Stripe subscription status mirrored to profiles
  trialEndsAt?: string | null;        // ISO timestamp; null once they've paid
  now?: Date;
}): AccessState {
  const now = input.now ?? new Date();
  const status = (input.subscriptionStatus ?? '').toLowerCase();

  if (status === 'active' || status === 'trialing') return { status: 'allowed' };
  if (status === 'canceled' || status === 'cancelled') return { status: 'locked', reason: 'subscription_canceled' };
  if (status === 'past_due' || status === 'unpaid' || status === 'incomplete_expired') {
    return { status: 'locked', reason: 'payment_failed' };
  }

  // No active subscription on record — fall back to the trial window.
  if (input.trialEndsAt) {
    const ends = new Date(input.trialEndsAt).getTime();
    if (Number.isFinite(ends) && ends > now.getTime()) return { status: 'allowed' };
    return { status: 'locked', reason: 'trial_expired' };
  }
  return { status: 'locked', reason: 'no_subscription' };
}

export function useAccessGate(): AccessState {
  const [state, setState] = useState<AccessState>({ status: 'loading' });

  useEffect(() => {
    let cancelled = false;
    (async () => {
      // TODO(Eduardo — billing/auth gate, see MASTER_PLAN §"Gated P0"):
      //   const { data: { user } } = await supabase.auth.getUser();
      //   if (!user) { /* unauthenticated → AuthScreen, handled at the call site */ }
      //   const { data } = await supabase.from('profiles')
      //     .select('subscription_status, trial_ends_at').eq('id', user.id).maybeSingle();
      //   setState(decideAccess({
      //     subscriptionStatus: data?.subscription_status,
      //     trialEndsAt: data?.trial_ends_at,
      //   }));
      // Until that field + webhook exist, fail OPEN so nothing breaks today:
      if (!cancelled) setState({ status: 'allowed' });
    })();
    return () => { cancelled = true; };
  }, []);

  return state;
}
