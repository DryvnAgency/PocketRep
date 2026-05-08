"use server";

import { createClient as createSupabase } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { generateOutboundMessage } from "@/lib/anthropic";
import { env, live } from "@/lib/env";
import { customers, dealer } from "@/lib/mock";

const POOL_CAP = 6;
const BRAND_VOICE = "Direct, friendly, sports-metaphor heavy, never pushy.";
const MANAGER_FIRST_NAME = "Eddie";

export type RunInput = {
  offer: string;
  sendMode: "instant" | "batch_15min" | "drip_multiday";
  cadence: { h24: boolean; h72: boolean; d7: boolean };
  handoff: "auto_assign" | "queue_to_me";
  attestationName: string;
  attested: boolean;
};

export type RunResult =
  | { ok: true; runId: string; generated: number; failed: number }
  | { ok: false; error: string };

export async function runGamePlan(input: RunInput): Promise<RunResult> {
  if (!input.attested || !input.attestationName.trim()) {
    return { ok: false, error: "Attestation required." };
  }
  if (!input.offer.trim()) {
    return { ok: false, error: "Offer copy required." };
  }
  if (!live.supabase || !live.supabaseServer || !live.anthropic) {
    return {
      ok: false,
      error: "Server keys missing — set SUPABASE_SERVICE_ROLE and ANTHROPIC_API_KEY.",
    };
  }

  const userClient = await createClient();
  const { data: userData } = await userClient.auth.getUser();
  const user = userData.user;
  if (!user) return { ok: false, error: "Not signed in." };

  const admin = createSupabase(env.supabaseUrl, env.supabaseServiceRole, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // ── Tenant bootstrap ─────────────────────────────────────────────
  const { data: existingMembership } = await admin
    .from("memberships")
    .select("tenant_id")
    .eq("user_id", user.id)
    .maybeSingle();

  let tenantId: string;
  if (existingMembership?.tenant_id) {
    tenantId = existingMembership.tenant_id;
  } else {
    const tenantName = user.email?.split("@")[1] ?? dealer.name;
    const { data: tenant, error: tenantErr } = await admin
      .from("tenants")
      .insert({
        name: tenantName,
        brand_voice: BRAND_VOICE,
        timezone: "America/Chicago",
      })
      .select("id")
      .single();
    if (tenantErr || !tenant) {
      return { ok: false, error: `Tenant create failed: ${tenantErr?.message}` };
    }
    tenantId = tenant.id;
    const { error: memErr } = await admin.from("memberships").insert({
      tenant_id: tenantId,
      user_id: user.id,
      role: "owner",
    });
    if (memErr) return { ok: false, error: `Membership create failed: ${memErr.message}` };
  }

  // ── Game plan + run ──────────────────────────────────────────────
  const cadenceArr: { offset_hours: number; kind: string }[] = [];
  if (input.cadence.h24) cadenceArr.push({ offset_hours: 24, kind: "nudge" });
  if (input.cadence.h72) cadenceArr.push({ offset_hours: 72, kind: "nudge" });
  if (input.cadence.d7) cadenceArr.push({ offset_hours: 168, kind: "nudge" });

  const sendModeDb =
    input.sendMode === "instant"
      ? "all_at_once"
      : input.sendMode === "drip_multiday"
        ? "drip"
        : "batch_15min";

  const handoffDb =
    input.handoff === "auto_assign" ? "auto_assign_to_rep" : "queue_to_manager";

  const { data: plan, error: planErr } = await admin
    .from("game_plans")
    .insert({
      tenant_id: tenantId,
      name: input.offer.slice(0, 60).trim() || "Untitled Game Plan",
      offer_copy: input.offer,
      send_mode: sendModeDb,
      cadence: cadenceArr,
      handoff_rule: handoffDb,
      created_by: user.id,
    })
    .select("id")
    .single();
  if (planErr || !plan) return { ok: false, error: `Game plan create failed: ${planErr?.message}` };

  const pool = customers.slice(0, POOL_CAP);
  const poolHash = simpleHash(pool.map((c) => c.id).join(",")).slice(0, 8);

  const { data: run, error: runErr } = await admin
    .from("campaign_runs")
    .insert({
      tenant_id: tenantId,
      game_plan_id: plan.id,
      status: "generating",
      pool_size: pool.length,
      consent_attestation_by: user.id,
      consent_attestation_at: new Date().toISOString(),
      started_at: new Date().toISOString(),
    })
    .select("id")
    .single();
  if (runErr || !run) return { ok: false, error: `Campaign run create failed: ${runErr?.message}` };

  await admin.from("audit_log").insert({
    tenant_id: tenantId,
    actor: user.id,
    action: "manager_attestation",
    target_type: "campaign_runs",
    target_id: run.id,
    payload: {
      attestation_name: input.attestationName,
      pool_size: pool.length,
      pool_hash: poolHash,
    },
  });

  // ── Per-customer generation loop ─────────────────────────────────
  let generated = 0;
  let failed = 0;
  for (const c of pool) {
    try {
      // Manual upsert — partial unique index (phone is not null) doesn't
      // play cleanly with Supabase's onConflict shorthand, so check first.
      const { data: existingContact } = await admin
        .from("contacts")
        .select("id")
        .eq("tenant_id", tenantId)
        .eq("phone", c.phone)
        .maybeSingle();

      let contactId: string;
      if (existingContact?.id) {
        contactId = existingContact.id;
      } else {
        const { data: newContact, error: contactErr } = await admin
          .from("contacts")
          .insert({
            tenant_id: tenantId,
            phone: c.phone,
            first_name: c.first,
            last_name: c.last,
            vehicle_owned: c.vehicle,
            consent_status: "granted",
            source: "mock_seed",
          })
          .select("id")
          .single();
        if (contactErr || !newContact) throw new Error(contactErr?.message ?? "contact insert failed");
        contactId = newContact.id;
      }

      const { data: cc, error: ccErr } = await admin
        .from("campaign_contacts")
        .insert({
          tenant_id: tenantId,
          campaign_run_id: run.id,
          contact_id: contactId,
          status: "pending_draft",
        })
        .select("id")
        .single();
      if (ccErr || !cc) throw new Error(ccErr?.message ?? "campaign_contact insert failed");

      const gen = await generateOutboundMessage({
        customer: {
          first_name: c.first,
          vehicle_owned: c.vehicle,
          months_in_vehicle: c.months,
          equity: c.equity,
        },
        offer: input.offer,
        brandVoice: BRAND_VOICE,
        dealerName: dealer.name,
        managerFirstName: MANAGER_FIRST_NAME,
      });

      const { error: msgErr } = await admin.from("messages").insert({
        tenant_id: tenantId,
        campaign_contact_id: cc.id,
        contact_id: contactId,
        direction: "outbound",
        body: gen.text,
        status: "sent_mock",
        sent_by: "rex",
        approval_state: "not_required",
        sent_at: new Date().toISOString(),
      });
      if (msgErr) throw new Error(msgErr.message);

      await admin
        .from("campaign_contacts")
        .update({ status: "sent_mock", sent_at: new Date().toISOString() })
        .eq("id", cc.id);

      generated++;
    } catch (err) {
      failed++;
      console.error("[runGamePlan] customer failed:", c.id, err);
    }
  }

  await admin
    .from("campaign_runs")
    .update({
      status: generated > 0 ? "completed" : "failed",
      completed_at: new Date().toISOString(),
    })
    .eq("id", run.id);

  return { ok: true, runId: run.id, generated, failed };
}

function simpleHash(s: string): string {
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = (h << 5) - h + s.charCodeAt(i);
    h |= 0;
  }
  return Math.abs(h).toString(16).padStart(8, "0");
}
