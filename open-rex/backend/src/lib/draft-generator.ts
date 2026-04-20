import { generateText } from './gemini';
import { getServerSupabase } from './supabase';
import {
  OUTREACH_ANGLES,
  buildMassOutreachPrompt,
  buildReplyPrompt,
  openerFingerprint,
  stripAppointmentSignal,
  validateDraft,
} from '@shared/prompts';
import type { Conversation, OutreachAngle } from '@shared/types';

const MAX_REGEN_ATTEMPTS = 2;
const ANGLE_ROTATION = Object.keys(OUTREACH_ANGLES) as OutreachAngle[];

// Rich customer row shape pulled from Supabase for the mass generator.
interface CustomerRow {
  id: string;
  first_name: string;
  vehicle: string | null;
  last_contacted_at: string | null;
  notes: string | null;
  interaction_history: string | null;
  trade_in_vehicle: string | null;
  purchased_vehicle: string | null;
  purchase_date: string | null;
  last_contact_date: string | null;
  status: string | null;
  source: string | null;
}

export async function generateMassOutreachDrafts(
  customerIds: string[],
): Promise<{ generated: number; failed: Array<{ id: string; reason: string }> }> {
  if (customerIds.length === 0) return { generated: 0, failed: [] };
  const supabase = getServerSupabase();

  const { data: rows, error } = await supabase
    .from('customers')
    .select(
      'id, first_name, vehicle, last_contacted_at, notes, interaction_history, trade_in_vehicle, purchased_vehicle, purchase_date, last_contact_date, status, source',
    )
    .in('id', customerIds);

  if (error) throw new Error(`fetch customers failed: ${error.message}`);
  const customers = (rows ?? []) as CustomerRow[];

  const failed: Array<{ id: string; reason: string }> = [];
  const generated: Array<{ customerId: string; body: string; angle: OutreachAngle; fingerprint: string }> = [];

  // First pass: round-robin angles by batch index.
  for (let i = 0; i < customers.length; i++) {
    const c = customers[i];
    const angle = ANGLE_ROTATION[i % ANGLE_ROTATION.length];
    try {
      const body = await generateOne(c, angle);
      generated.push({ customerId: c.id, body, angle, fingerprint: openerFingerprint(body) });
    } catch (e) {
      failed.push({ id: c.id, reason: e instanceof Error ? e.message : 'generation failed' });
    }
  }

  // Second pass: if two drafts share the same 6-word opener fingerprint,
  // regenerate the later one with the next angle in the rotation.
  const seen = new Map<string, number>();
  for (let i = 0; i < generated.length; i++) {
    const g = generated[i];
    const prior = seen.get(g.fingerprint);
    if (prior !== undefined && prior !== i) {
      const angleIdx = ANGLE_ROTATION.indexOf(g.angle);
      const nextAngle = ANGLE_ROTATION[(angleIdx + 1) % ANGLE_ROTATION.length];
      const c = customers.find((x) => x.id === g.customerId)!;
      try {
        const retry = await generateOne(c, nextAngle);
        generated[i] = {
          customerId: g.customerId,
          body: retry,
          angle: nextAngle,
          fingerprint: openerFingerprint(retry),
        };
        seen.set(generated[i].fingerprint, i);
      } catch {
        // Keep the original; deduping is best-effort.
      }
    } else {
      seen.set(g.fingerprint, i);
    }
  }

  // Persist.
  if (generated.length > 0) {
    const rowsToInsert = generated.map((g) => ({
      customer_id: g.customerId,
      body: g.body,
      angle: g.angle,
      status: 'pending',
      generated_at: new Date().toISOString(),
    }));
    const { error: insertErr } = await supabase.from('drafts').insert(rowsToInsert);
    if (insertErr) throw new Error(`draft insert failed: ${insertErr.message}`);
  }

  return { generated: generated.length, failed };
}

// Back-compat single-customer wrapper — routes to the mass generator.
export async function generateFirstOutreachDraft(customerId: string): Promise<{ draftId: string }> {
  const { generated, failed } = await generateMassOutreachDrafts([customerId]);
  if (generated === 0) {
    const reason = failed[0]?.reason ?? 'unknown';
    throw new Error(`first outreach draft failed: ${reason}`);
  }
  // Callers of the legacy API just want any non-throwing completion; look up
  // the freshly-inserted row to preserve the old return shape.
  const supabase = getServerSupabase();
  const { data } = await supabase
    .from('drafts')
    .select('id')
    .eq('customer_id', customerId)
    .order('generated_at', { ascending: false })
    .limit(1)
    .single();
  return { draftId: data?.id ?? '' };
}

export async function generateReplyDraft(customerId: string): Promise<{ draftId: string; appointment: boolean }> {
  const supabase = getServerSupabase();

  const [{ data: customer }, { data: messages }] = await Promise.all([
    supabase.from('customers').select('id, first_name, last_name, vehicle').eq('id', customerId).single(),
    supabase
      .from('messages')
      .select('direction, body, created_at')
      .eq('customer_id', customerId)
      .order('created_at', { ascending: true })
      .limit(20),
  ]);

  if (!customer) throw new Error(`customer ${customerId} not found`);

  const conversation: Conversation = {
    customerId,
    customerName: `${customer.first_name} ${customer.last_name}`,
    vehicle: customer.vehicle,
    messages: (messages ?? []).map((m: any) => ({
      direction: m.direction,
      body: m.body,
      timestamp: m.created_at,
    })),
  };

  const { system, user } = buildReplyPrompt(conversation);
  const raw = await generateWithValidation(system, user, 0.7);
  const { body, isAppointment } = stripAppointmentSignal(raw);

  const { data: inserted, error: insertErr } = await supabase
    .from('drafts')
    .insert({
      customer_id: customerId,
      body,
      status: 'pending',
      generated_at: new Date().toISOString(),
      is_appointment_signal: isAppointment,
    })
    .select('id')
    .single();

  if (insertErr || !inserted) throw new Error(`draft insert failed: ${insertErr?.message}`);
  return { draftId: inserted.id, appointment: isAppointment };
}

async function generateOne(customer: CustomerRow, angle: OutreachAngle): Promise<string> {
  const { system, user } = buildMassOutreachPrompt(
    {
      firstName: customer.first_name,
      vehicle: customer.vehicle,
      lastContactedAt: customer.last_contacted_at,
      notes: customer.notes,
      interactionHistory: customer.interaction_history,
      tradeInVehicle: customer.trade_in_vehicle,
      purchasedVehicle: customer.purchased_vehicle,
      purchaseDate: customer.purchase_date,
      lastContactDate: customer.last_contact_date,
      status: customer.status,
      source: customer.source,
    },
    angle,
  );
  return generateWithValidation(system, user, 0.85);
}

async function generateWithValidation(
  system: string,
  user: string,
  temperature: number,
): Promise<string> {
  let lastViolations: string[] = [];
  for (let attempt = 0; attempt <= MAX_REGEN_ATTEMPTS; attempt++) {
    const userWithFeedback =
      attempt === 0
        ? user
        : `${user}\n\nPrevious attempt violated these rules: ${lastViolations.join('; ')}. Fix them.`;
    const text = await generateText({ system, user: userWithFeedback, temperature });
    const stripped = text.replace(/APPOINTMENT_SIGNAL\s*$/i, '').trim();
    const { ok, violations } = validateDraft(stripped);
    if (ok) return text;
    lastViolations = violations;
  }
  throw new Error(`draft failed validation after ${MAX_REGEN_ATTEMPTS + 1} attempts: ${lastViolations.join('; ')}`);
}
