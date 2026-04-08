// ─────────────────────────────────────────────────────────────────────────────
// PocketRep — Supabase Edge Function  v4 — Rex + Rate Limiting
// File: supabase/functions/ai-closer/index.ts
// ─────────────────────────────────────────────────────────────────────────────

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY");
const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Plan limits — Pro: 100/day, Elite: unlimited (-1)
const PLAN_LIMITS: Record<string, number> = {
  pro: 100,
  elite: -1, // unlimited
};

// ─── REX PERSONA ─────────────────────────────────────────────────────────────
const REX_SYSTEM_PROMPT = `You are Rex — the AI sales closer built into PocketRep.

You are not a chatbot. You are not an assistant. You are the best closer the rep has ever had access to — and you talk like it.

BACKGROUND:
You think like a 30-year-old who has been closing high-ticket deals since he was 22. You have seen every objection, every walk, every "I need to think about it" and every deal that looked dead come back to life. You have closed in automotive, mortgage, real estate, insurance, solar, and B2B. You do not panic. You do not fold. You find the angle and you work it.

PERSONALITY:
- Confident without being arrogant
- Direct without being rude
- Sharp, fast, and tactical
- You believe every deal is closeable until proven otherwise

HOW YOU TALK:
- Short sentences. Real words. No corporate filler.
- You talk like a mentor pulling a rep aside between ups — not a consultant presenting a deck
- You NEVER say "certainly", "absolutely", "great question", or "I understand your concern"
- You give the actual words — not the concept, not the framework
- You end every response with one forward-moving question or a specific next action

CRITICAL — CONTEXT AWARENESS:
- You ALWAYS read the full conversation history before responding
- You NEVER repeat the same advice, phrasing, or structure from a previous message in the same conversation
- Build on what was already said — conversations should feel like back-and-forth with a real coach
- If the rep gives you more detail, incorporate it. Do not start over.

WHAT YOU BELIEVE:
- The money is in the follow-up, always
- Price is never the real objection — find what is underneath it
- Every "no" is either a real no or a question in disguise

WHAT YOU NEVER DO:
- Give vague advice like "build rapport"
- Repeat yourself from earlier in the conversation
- Let a rep leave without a specific next step

FORMAT:
- Under 120 words unless a full script is needed
- Scripts are labeled and copy-paste ready
- Always end with one question or one clear next action`;

// ─── HELPERS ─────────────────────────────────────────────────────────────────
function buildContactContext(contact: any): string {
  if (!contact) return "";
  const parts: string[] = [];
  parts.push(`Name: ${contact.first_name} ${contact.last_name || ""}`);
  if (contact.product) parts.push(`Product: ${contact.product}`);
  if (contact.stage) parts.push(`Stage: ${contact.stage}`);
  if (contact.last_contact_date) parts.push(`Last contacted: ${contact.last_contact_date}`);
  if (contact.tags?.length > 0) parts.push(`Tags: ${contact.tags.join(", ")}`);
  if (contact.notes) parts.push(`Notes: ${contact.notes}`);
  if (contact.purchase_date) {
    const months = Math.floor(
      (Date.now() - new Date(contact.purchase_date).getTime()) / (1000 * 60 * 60 * 24 * 30)
    );
    parts.push(`Purchased: ${contact.purchase_date} (${months} months ago)`);
  }
  return parts.join("\n");
}

async function callClaude(system: string, userMsg: string, maxTokens = 400): Promise<string> {
  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": ANTHROPIC_API_KEY!,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: "claude-sonnet-4-5",
      max_tokens: maxTokens,
      system,
      messages: [{ role: "user", content: userMsg }],
    }),
  });
  if (!response.ok) throw new Error(`Claude error: ${response.status}`);
  const data = await response.json();
  return data.content[0].text;
}

async function callClaudeMultiTurn(
  system: string,
  messages: { role: "user" | "assistant"; content: string }[],
  maxTokens = 500
): Promise<string> {
  // Enforce strict user/assistant alternation
  const cleaned: { role: "user" | "assistant"; content: string }[] = [];
  for (const m of messages) {
    if (cleaned.length === 0 && m.role !== "user") continue;
    if (cleaned.length > 0 && cleaned[cleaned.length - 1].role === m.role) {
      cleaned[cleaned.length - 1].content += "\n" + m.content;
    } else {
      cleaned.push({ role: m.role, content: m.content });
    }
  }
  if (!cleaned.length || cleaned[cleaned.length - 1].role !== "user") {
    throw new Error("Invalid message structure");
  }
  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": ANTHROPIC_API_KEY!,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: "claude-sonnet-4-5",
      max_tokens: maxTokens,
      system,
      messages: cleaned,
    }),
  });
  if (!response.ok) {
    const err = await response.text();
    throw new Error(`Claude error: ${response.status} — ${err}`);
  }
  const data = await response.json();
  return data.content[0].text;
}

// ─── RATE LIMIT CHECK + INCREMENT ────────────────────────────────────────────
async function checkAndIncrementUsage(
  supabase: any,
  userId: string,
  plan: string
): Promise<{ allowed: boolean; count: number; limit: number }> {
  const limit = PLAN_LIMITS[plan] ?? PLAN_LIMITS.pro; // default to pro limits

  if (limit === -1) {
    // Unlimited — just increment for tracking, always allow
    await supabase.rpc("increment_rex_usage", {
      p_user_id: userId,
      p_limit: -1,
    });
    const { data } = await supabase
      .from("rex_usage")
      .select("message_count")
      .eq("user_id", userId)
      .eq("date", new Date().toISOString().split("T")[0])
      .maybeSingle();
    return { allowed: true, count: data?.message_count ?? 0, limit: -1 };
  }

  const { data, error } = await supabase.rpc("increment_rex_usage", {
    p_user_id: userId,
    p_limit: limit,
  });

  if (error) {
    console.error("Usage check error:", error);
    return { allowed: true, count: 0, limit }; // fail open on DB error
  }

  const row = Array.isArray(data) ? data[0] : data;
  return {
    allowed: row?.allowed ?? true,
    count: row?.count ?? 0,
    limit,
  };
}

// ─── ACTION HANDLERS ──────────────────────────────────────────────────────────
async function handleRebuttal(contact: any, objection: string, repName: string): Promise<string> {
  const ctx = buildContactContext(contact);
  const msg = `The rep (${repName}) is working a deal. Customer said: "${objection}"${ctx ? `\n\nCONTACT:\n${ctx}` : ""}
Write the exact rebuttal ${repName} can say right now. One sentence to acknowledge, pivot using their situation, end with the question that moves them forward. Under 100 words.`;
  return await callClaude(REX_SYSTEM_PROMPT, msg, 300);
}

async function handleBrief(contact: any, repName: string): Promise<string> {
  const ctx = buildContactContext(contact);
  const msg = `${repName} is about to call this contact. Give a pre-call brief.\nCONTACT:\n${ctx}
Cover: who they are, the ONE thing most likely on their mind, the exact opening line to use, one thing NOT to step on. 30-second read.`;
  return await callClaude(REX_SYSTEM_PROMPT, msg, 350);
}

async function handleFollowUpKing(contact: any, repName: string): Promise<string> {
  const ctx = buildContactContext(contact);
  const msg = `${repName} needs the perfect outreach opener for this contact RIGHT NOW.\nCONTACT:\n${ctx}
Script the exact message — copy-paste ready. Why this angle works for this specific person. One follow-up question to keep the conversation alive.`;
  return await callClaude(REX_SYSTEM_PROMPT, msg, 400);
}

async function handleNextStep(
  contact: any, type: string, outcome: string, notes: string, repName: string
): Promise<string> {
  const ctx = buildContactContext(contact);
  const msg = `${repName} just logged: Type: ${type} | Outcome: ${outcome || "not noted"} | Notes: ${notes || "none"}\nCONTACT:\n${ctx}
Best next move — specific day, channel, exact words. Under 80 words.`;
  return await callClaude(REX_SYSTEM_PROMPT, msg, 250);
}

async function handleCoaching(
  contact: any,
  chatHistory: { role: string; text?: string; content?: string }[],
  newMessage: string,
  repName: string
): Promise<string> {
  const ctx = buildContactContext(contact);
  const systemWithContext = ctx
    ? `${REX_SYSTEM_PROMPT}\n\n---\nCURRENT DEAL CONTEXT:\n${ctx}\nRep: ${repName}\n---`
    : `${REX_SYSTEM_PROMPT}\n\nRep: ${repName}`;

  const messages: { role: "user" | "assistant"; content: string }[] = [];
  if (chatHistory?.length > 0) {
    for (const m of chatHistory) {
      const text = m.text || m.content || "";
      if (!text.trim()) continue;
      messages.push({
        role: m.role === "user" ? "user" : "assistant",
        content: text,
      });
    }
  }
  messages.push({ role: "user", content: newMessage });
  return await callClaudeMultiTurn(systemWithContext, messages, 500);
}

async function handleMassText(base: string, contact: any, repName: string): Promise<string> {
  const ctx = buildContactContext(contact);
  const msg = `Personalize this for this specific contact.\nBASE: "${base}"${ctx ? `\nCONTACT:\n${ctx}` : ""}
Under 160 chars. Use first name naturally. One specific detail from their file. Casual. Return ONLY the message.`;
  return await callClaude(REX_SYSTEM_PROMPT, msg, 200);
}

// ─── MAIN ─────────────────────────────────────────────────────────────────────
serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) throw new Error("Missing authorization header");

    const supabase = createClient(SUPABASE_URL!, SUPABASE_SERVICE_KEY!);
    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) throw new Error("Unauthorized");

    const { data: profile } = await supabase
      .from("users").select("*").eq("id", user.id).single();

    const repName = profile?.rep_name_for_ai || profile?.full_name?.split(" ")[0] || "Rep";
    const plan = profile?.plan || "pro";

    const body = await req.json();
    const { action, contact_id, objection, interaction_type, outcome, notes,
            base_message, contact_ids, chat_history, message } = body;

    if (!action) throw new Error("Missing action");

    let contact = null;
    if (contact_id) {
      const { data: c } = await supabase
        .from("contacts").select("*")
        .eq("id", contact_id).eq("user_id", user.id).single();
      contact = c;
    }

    // ── Coaching actions are rate-limited ────────────────────────────────────
    const coachingActions = ["coaching", "rex", "rebuttal", "follow-up-king"];
    let usageInfo = { allowed: true, count: 0, limit: PLAN_LIMITS[plan] ?? 100 };

    if (coachingActions.includes(action)) {
      usageInfo = await checkAndIncrementUsage(supabase, user.id, plan);
      if (!usageInfo.allowed) {
        return new Response(
          JSON.stringify({
            error: `Daily limit reached. You've used ${usageInfo.count} of ${usageInfo.limit} Rex messages today. Resets at midnight.`,
            error_code: "RATE_LIMIT",
            usage: usageInfo,
          }),
          {
            status: 429,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          }
        );
      }
    }

    let result = "";

    switch (action) {
      case "rebuttal":
        if (!objection) throw new Error("Missing objection");
        result = await handleRebuttal(contact, objection, repName);
        break;
      case "brief":
        result = await handleBrief(contact, repName);
        break;
      case "follow-up-king":
        result = await handleFollowUpKing(contact, repName);
        break;
      case "next-step":
        result = await handleNextStep(contact, interaction_type, outcome, notes, repName);
        break;
      case "coaching":
      case "rex":
        if (!message) throw new Error("Missing message");
        result = await handleCoaching(contact, chat_history || [], message, repName);
        break;
      case "mass-text": {
        if (!base_message) throw new Error("Missing base_message");
        if (contact_ids?.length > 0) {
          const { data: contacts } = await supabase
            .from("contacts").select("*")
            .in("id", contact_ids).eq("user_id", user.id);
          const personalized = await Promise.all(
            (contacts || []).map(async (c: any) => ({
              contact_id: c.id,
              message: await handleMassText(base_message, c, repName),
            }))
          );
          return new Response(JSON.stringify({ results: personalized }), {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
        result = await handleMassText(base_message, contact, repName);
        break;
      }
      default:
        throw new Error(`Unknown action: ${action}`);
    }

    return new Response(
      JSON.stringify({ result, usage: usageInfo }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error: any) {
    console.error("Edge Function error:", error);
    return new Response(
      JSON.stringify({ error: error.message || "Something went wrong" }),
      {
        status: error.message === "Unauthorized" ? 401 : 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
