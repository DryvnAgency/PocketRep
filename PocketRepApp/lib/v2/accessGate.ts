// Client-side access gate. Server/database billing state remains authoritative.
// A newly provisioned checkout can be pending briefly while Stripe/webhook
// synchronization completes. Pending access is intentionally time-limited.

import { useEffect, useRef, useState } from 'react';
import { AppState, Platform } from 'react-native';
import { supabase } from '@/lib/supabase';

export type LockReason = 'trial_expired' | 'subscription_canceled' | 'payment_failed' | 'no_subscription' | 'invalid_account' | 'entitlement_unverified';
export type AccessState =
  | { status: 'loading' }
  | { status: 'pending'; until: string | null }
  | { status: 'allowed' }
  | { status: 'locked'; reason: LockReason };

export function decideAccess(input: {
  subscriptionStatus?: string | null;
  trialEndsAt?: string | null;
  entitlementStatus?: string | null;
  pendingUntil?: string | null;
  now?: Date;
}): AccessState {
  const now = input.now ?? new Date();
  const entitlement = (input.entitlementStatus ?? '').toLowerCase();
  const status = (input.subscriptionStatus ?? '').toLowerCase();

  if (entitlement === 'pending') {
    const until = input.pendingUntil ? new Date(input.pendingUntil).getTime() : NaN;
    if (Number.isFinite(until) && until > now.getTime()) return { status: 'pending', until: input.pendingUntil! };
    return { status: 'locked', reason: 'entitlement_unverified' };
  }

  if (entitlement === 'locked') return { status: 'locked', reason: 'entitlement_unverified' };
  if (status === 'active' || entitlement === 'active') return { status: 'allowed' };

  if (status === 'trialing' || entitlement === 'trialing') {
    if (!input.trialEndsAt) return { status: 'allowed' };
    const ends = new Date(input.trialEndsAt).getTime();
    return Number.isFinite(ends) && ends > now.getTime()
      ? { status: 'allowed' }
      : { status: 'locked', reason: 'trial_expired' };
  }

  if (status === 'canceled' || status === 'cancelled') return { status: 'locked', reason: 'subscription_canceled' };
  if (status === 'past_due' || status === 'unpaid' || status === 'incomplete_expired') return { status: 'locked', reason: 'payment_failed' };

  if (input.trialEndsAt) {
    const ends = new Date(input.trialEndsAt).getTime();
    if (Number.isFinite(ends) && ends > now.getTime()) return { status: 'allowed' };
    return { status: 'locked', reason: 'trial_expired' };
  }

  return { status: 'locked', reason: 'no_subscription' };
}

const RECHECK_INTERVAL_MS = 60_000;

export function useAccessGate(enabled = true): AccessState {
  const [state, setState] = useState<AccessState>({ status: 'loading' });
  const cancelledRef = useRef(false);

  useEffect(() => {
    cancelledRef.current = false;

    if (!enabled) {
      setState(prev => (prev.status === 'loading' ? prev : { status: 'loading' }));
      return () => { cancelledRef.current = true; };
    }

    const load = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { if (!cancelledRef.current) setState({ status: 'locked', reason: 'invalid_account' }); return; }

      const { data, error } = await supabase
        .from('profiles')
        .select('role, subscription_status, trial_ends_at, entitlement_status, entitlement_pending_until')
        .eq('id', user.id)
        .maybeSingle();
      if (cancelledRef.current) return;
      if (error || !data) { setState({ status: 'locked', reason: 'no_subscription' }); return; }

      // Admin is an operational role, not a customer subscription. Admin access
      // must never depend on Stripe/trial state or pretend to be an active plan.
      if ((data.role ?? '').toLowerCase() === 'admin') {
        setState({ status: 'allowed' });
        return;
      }

      setState(decideAccess({
        subscriptionStatus: data.subscription_status,
        trialEndsAt: data.trial_ends_at,
        entitlementStatus: data.entitlement_status,
        pendingUntil: data.entitlement_pending_until,
      }));
    };
    const safeLoad = () => load().catch(() => { if (!cancelledRef.current) setState({ status: 'locked', reason: 'no_subscription' }); });

    safeLoad();

    let removeVisibility: (() => void) | undefined;
    if (Platform.OS === 'web' && typeof document !== 'undefined') {
      const onVisible = () => { if (document.visibilityState === 'visible') safeLoad(); };
      document.addEventListener('visibilitychange', onVisible);
      removeVisibility = () => document.removeEventListener('visibilitychange', onVisible);
    } else {
      const sub = AppState.addEventListener('change', (next) => { if (next === 'active') safeLoad(); });
      removeVisibility = () => sub.remove();
    }
    const interval = setInterval(safeLoad, RECHECK_INTERVAL_MS);

    return () => {
      cancelledRef.current = true;
      removeVisibility?.();
      clearInterval(interval);
    };
  }, [enabled]);

  return state;
}
