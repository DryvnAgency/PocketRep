import { supabase } from '@/lib/supabase';

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

export async function insertDeal(draft: DealDraft, payPlan: PayPlan = DEFAULT_PAY_PLAN): Promise<void> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('not signed in');

  const amount = calcCommission(draft, payPlan);

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
}
