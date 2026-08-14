// Client-side access gate — hard lockout model.
// Access is allowed only during the 7-day trial or while Stripe reports an active subscription.

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';

export type LockReason = 'trial_expired' | 'subscription_canceled' | 'payment_failed' | 'no_subscription';
export type AccessState =
  | { status: 'loading' }
  | { status: 'allowed' }
  | { status: 'locked'; reason: LockReason };

export function decideAccess(input: {
  subscriptionStatus?: string | null;
  trialEndsAt?: string | null;
  now?: Date;
}): AccessState {
  const now = input.now ?? new Date();
  const status = (input.subscriptionStatus ?? '').toLowerCase();

  if (status === 'active') return { status: 'allowed' };

  if (status === 'trialing') {
    if (!input.trialEndsAt) return { status: 'allowed' };
    const ends = new Date(input.trialEndsAt).getTime();
    return Number.isFinite(ends) && ends > now.getTime()
      ? { status: 'allowed' }
      : { status: 'locked', reason: 'trial_expired' };
  }

  if (status === 'canceled' || status === 'cancelled') {
    return { status: 'locked', reason: 'subscription_canceled' };
  }

  if (status === 'past_due' || status === 'unpaid' || status === 'incomplete_expired') {
    return { status: 'locked', reason: 'payment_failed' };
  }

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

    const load = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        if (!cancelled) setState({ status: 'locked', reason: 'no_subscription' });
        return;
      }

      const { data, error } = await supabase
        .from('profiles')
        .select('subscription_status, trial_ends_at')
        .eq('id', user.id)
        .maybeSingle();

      if (cancelled) return;

      // Fail closed if the authoritative billing state cannot be read.
      if (error || !data) {
        setState({ status: 'locked', reason: 'no_subscription' });
        return;
      }

      setState(decideAccess({
        subscriptionStatus: data.subscription_status,
        trialEndsAt: data.trial_ends_at,
      }));
    };

    load().catch(() => {
      if (!cancelled) setState({ status: 'locked', reason: 'no_subscription' });
    });

    return () => { cancelled = true; };
  }, []);

  return state;
}
