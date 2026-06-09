import { supabase } from '@/lib/supabase';
import { loadPayPlan, calcCommissionWithPlan, type PayPlan as RealPayPlan } from './payPlan';
import { getReferralAsksEnabled, getReferralAskDelayDays } from './repSettings';

// Kept for back-compat with existing imports — re-exported from lib/v2/payPlan.ts.
// Use loadPayPlan() to get the user's actual saved plan.
export const DEFAULT_PAY_PLAN = {
  frontPct: 25,
  backPct: 5,
  flatMini: 200,
  manuBonus: 250,
  csiBonus: 400,
};

export type PayPlan = typeof DEFAULT_PAY_PLAN;

export type DealDraft = {
  name: string;
  stock: string;
  vehicle: string;
  date: string;
  type: 'NEW' | 'CPO' | 'USED';
  funding: 'finance' | 'lease' | 'cash';
  frontGross: number;
  backGross: number;
  split: boolean;
  splitWith: string;
  contactId: string | null;
};

export function calcCommission(d: Pick<DealDraft, 'frontGross' | 'backGross' | 'split'>, plan: PayPlan): number {
  if (!d.frontGross && !d.backGross) return 0;
  const front = (d.frontGross * plan.frontPct) / 100;
  const back = (d.backGross * plan.backPct) / 100;
  const base = Math.max(front + back, plan.flatMini);
  const splitMult = d.split ? 0.5 : 1;
  return Math.round((base + plan.manuBonus + plan.csiBonus) * splitMult);
}

function mapLegacyPlan(p: PayPlan): Partial<RealPayPlan> {
  return {
    frontPct: p.frontPct,
    backPct: p.backPct,
    flatMini: p.flatMini,
    manuBonus: p.manuBonus,
    csiBonus: p.csiBonus,
  };
}

export async function deleteDeal(id: string): Promise<void> {
  const { error } = await supabase.from('deals').delete().eq('id', id);
  if (error) throw error;
}

export async function insertDeal(draft: DealDraft, payPlan?: PayPlan): Promise<void> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('not signed in');

  // Use the rep's saved pay plan unless an explicit one is passed in.
  const real: RealPayPlan = payPlan
    ? { ...await loadPayPlan(), ...mapLegacyPlan(payPlan) }
    : await loadPayPlan();
  const amount = calcCommissionWithPlan(
    { frontGross: draft.frontGross, backGross: draft.backGross, split: draft.split },
    real,
  );

  const { error } = await supabase.from('deals').insert({
    user_id: user.id,
    contact_id: draft.contactId,
    title: draft.name,
    stock: draft.stock,
    vehicle: draft.vehicle,
    closed_at: draft.date,
    deal_type: draft.type,
    funding: draft.funding,
    split: draft.split,
    split_with: draft.split ? draft.splitWith : null,
    front_gross: draft.frontGross,
    back_gross: draft.backGross,
    amount,
  });
  if (error) throw error;

  // Referral ask: a logged deal is the sale signal (there's no "delivered"
  // status). Queue a reminder so the nurture-scheduler / referralAsks helper can
  // draft a post-sale referral ask later. Best-effort — a referral-ask hiccup
  // must never fail the deal log, which has already committed above.
  try {
    if (draft.contactId && getReferralAsksEnabled()) {
      const dueAt = new Date();
      dueAt.setDate(dueAt.getDate() + getReferralAskDelayDays());
      const who = draft.name?.trim() || 'this customer';
      await supabase.from('reminders').insert({
        user_id: user.id,
        contact_id: draft.contactId,
        title: `Ask ${who} for a referral`,
        body: 'They just bought. Rex will draft a friendly referral ask for you to review.',
        due_at: dueAt.toISOString(),
        status: 'pending',
        source: 'referral_ask',
      });
    }
  } catch (e) {
    console.warn('referral ask reminder skipped', e);
  }
}
