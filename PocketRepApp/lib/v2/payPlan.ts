import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';

export type UnitBonusTier = { units: number; bonus: number };

export type PayPlan = {
  frontPct: number;
  backPct: number;
  flatMini: number;
  baseSalary: number;
  manuBonus: number;   // public.pay_plans.spiff_per_unit
  csiBonus: number;    // public.pay_plans.unit_bonus
  unitBonuses: UnitBonusTier[];  // public.pay_plans.unit_bonus_tiers
};

export const DEFAULT_PAY_PLAN: PayPlan = {
  frontPct: 25,
  backPct: 5,
  flatMini: 200,
  baseSalary: 2000,
  manuBonus: 250,
  csiBonus: 400,
  unitBonuses: [
    { units: 10, bonus: 500 },
    { units: 15, bonus: 1000 },
    { units: 20, bonus: 1500 },
  ],
};

function rowToPlan(r: any): PayPlan {
  return {
    frontPct: Number(r.front_pct ?? DEFAULT_PAY_PLAN.frontPct),
    backPct: Number(r.back_pct ?? DEFAULT_PAY_PLAN.backPct),
    flatMini: Number(r.flat_mini ?? DEFAULT_PAY_PLAN.flatMini),
    baseSalary: Number(r.base_salary ?? DEFAULT_PAY_PLAN.baseSalary),
    manuBonus: Number(r.spiff_per_unit ?? DEFAULT_PAY_PLAN.manuBonus),
    csiBonus: Number(r.unit_bonus ?? DEFAULT_PAY_PLAN.csiBonus),
    unitBonuses: Array.isArray(r.unit_bonus_tiers)
      ? (r.unit_bonus_tiers as any[]).map(t => ({
          units: Number(t.units ?? 0),
          bonus: Number(t.bonus ?? 0),
        }))
      : DEFAULT_PAY_PLAN.unitBonuses,
  };
}

export async function loadPayPlan(): Promise<PayPlan> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return DEFAULT_PAY_PLAN;
  const { data } = await supabase
    .from('pay_plans')
    .select('front_pct,back_pct,flat_mini,base_salary,spiff_per_unit,unit_bonus,unit_bonus_tiers')
    .eq('user_id', user.id)
    .maybeSingle();
  if (!data) return DEFAULT_PAY_PLAN;
  return rowToPlan(data);
}

export async function savePayPlan(plan: PayPlan): Promise<void> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('not signed in');
  const { error } = await supabase
    .from('pay_plans')
    .upsert({
      user_id: user.id,
      front_pct: plan.frontPct,
      back_pct: plan.backPct,
      flat_mini: plan.flatMini,
      base_salary: plan.baseSalary,
      spiff_per_unit: plan.manuBonus,
      unit_bonus: plan.csiBonus,
      unit_bonus_tiers: plan.unitBonuses,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'user_id' });
  if (error) throw error;
}

export function usePayPlan(refetchKey: number = 0) {
  const [plan, setPlan] = useState<PayPlan | null>(null);

  useEffect(() => {
    let cancelled = false;
    loadPayPlan().then(p => { if (!cancelled) setPlan(p); });
    return () => { cancelled = true; };
  }, [refetchKey]);

  return plan;
}

export function calcCommissionWithPlan(
  d: { frontGross: number; backGross: number; split: boolean },
  plan: PayPlan,
): number {
  if (!d.frontGross && !d.backGross) return 0;
  const front = (d.frontGross * plan.frontPct) / 100;
  const back = (d.backGross * plan.backPct) / 100;
  const base = Math.max(front + back, plan.flatMini);
  const splitMult = d.split ? 0.5 : 1;
  return Math.round((base + plan.manuBonus + plan.csiBonus) * splitMult);
}

// Unit-bonus tiers are a MONTHLY volume bonus (hit N units in a month → a flat
// bonus), NOT a per-deal amount — so they are applied when units are tallied
// (Metrics), never inside calcCommissionWithPlan (which is per-deal). Until now
// the tier config was loaded/saved/edited but never actually applied anywhere.
//
// The earned bonus is the single highest tier whose unit threshold is met (it is
// NOT cumulative): 12 units against [10→$500, 15→$1000, 20→$1500] earns $500.
export function unitBonusFor(units: number, tiers: UnitBonusTier[]): number {
  let bonus = 0;
  for (const t of tiers) {
    if (units >= t.units && t.bonus > bonus) bonus = t.bonus;
  }
  return bonus;
}

// The next tier the rep hasn't reached yet (lowest threshold strictly above
// `units`), for a "3 more units → $1,000" nudge. Null at/above the top tier.
export function nextUnitBonusTier(units: number, tiers: UnitBonusTier[]): UnitBonusTier | null {
  let next: UnitBonusTier | null = null;
  for (const t of tiers) {
    if (t.units > units && (next === null || t.units < next.units)) next = t;
  }
  return next;
}
