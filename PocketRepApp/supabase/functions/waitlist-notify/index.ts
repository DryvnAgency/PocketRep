import "jsr:@supabase/functions-js/edge-runtime.d.ts";

// PocketRep — waitlist-notify
// Fired by a DB trigger (pg_net) on each new public.waitlist row. Emails the
// owner via Resend with the signup details. Reads everything from Edge Function
// secrets the owner sets: RESEND_API_KEY, WAITLIST_NOTIFY_TO, WAITLIST_NOTIFY_FROM.
// If any are unset it logs and returns 200 (no crash) so the insert path is never
// affected. Optional WAITLIST_WEBHOOK_SECRET enables a shared-secret header check.

function esc(v: unknown): string {
  return String(v ?? "").replace(/[&<>"]/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c] as string));
}

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method === "GET") {
    return new Response("waitlist-notify OK", { status: 200 });
  }

  // Optional hardening: only enforced if WAITLIST_WEBHOOK_SECRET is set.
  const wantSecret = Deno.env.get("WAITLIST_WEBHOOK_SECRET");
  if (wantSecret && req.headers.get("x-waitlist-secret") !== wantSecret) {
    return new Response("forbidden", { status: 403 });
  }

  let payload: any = {};
  try { payload = await req.json(); } catch (_e) { payload = {}; }
  const rec = (payload && payload.record) ? payload.record : (payload || {});

  const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
  const TO = Deno.env.get("WAITLIST_NOTIFY_TO");
  const FROM = Deno.env.get("WAITLIST_NOTIFY_FROM");

  // Fail-safe: if any secret is missing, skip the email (do not crash).
  if (!RESEND_API_KEY || !TO || !FROM) {
    const missing = [
      !RESEND_API_KEY ? "RESEND_API_KEY" : null,
      !TO ? "WAITLIST_NOTIFY_TO" : null,
      !FROM ? "WAITLIST_NOTIFY_FROM" : null,
    ].filter(Boolean).join(", ");
    console.log(`[waitlist-notify] Resend secrets not set yet (${missing}); recorded signup, skipped email.`);
    return new Response(JSON.stringify({ ok: true, emailed: false, reason: "secrets_not_set", missing }),
      { status: 200, headers: { "Content-Type": "application/json" } });
  }

  const name = rec.name ?? "";
  const email = rec.email ?? "";
  const phone = rec.phone ?? "";
  const dealership = rec.dealership ?? "";
  const seats = rec.seats ?? "";
  const source = rec.source ?? "";

  const subject = `New PocketRep Team waitlist signup: ${dealership || name || email || "unknown"}`;
  const text =
    `New PocketRep Team waitlist signup\n\n` +
    `Name: ${name}\n` +
    `Dealership: ${dealership}\n` +
    `Seats: ${seats}\n` +
    `Email: ${email}\n` +
    `Phone: ${phone}\n` +
    `Source: ${source}\n`;
  const html =
    `<h2 style="font-family:sans-serif">New PocketRep Team waitlist signup</h2>` +
    `<table cellpadding="6" style="border-collapse:collapse;font-family:sans-serif;font-size:14px">` +
    `<tr><td><b>Name</b></td><td>${esc(name)}</td></tr>` +
    `<tr><td><b>Dealership</b></td><td>${esc(dealership)}</td></tr>` +
    `<tr><td><b>Seats</b></td><td>${esc(String(seats))}</td></tr>` +
    `<tr><td><b>Email</b></td><td>${esc(email)}</td></tr>` +
    `<tr><td><b>Phone</b></td><td>${esc(phone)}</td></tr>` +
    `<tr><td><b>Source</b></td><td>${esc(source)}</td></tr>` +
    `</table>`;

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: FROM,
        to: [TO],
        subject,
        text,
        html,
        ...(email ? { reply_to: email } : {}),
      }),
    });
    if (!res.ok) {
      const body = await res.text();
      console.error(`[waitlist-notify] Resend error ${res.status}: ${body}`);
      return new Response(JSON.stringify({ ok: false, emailed: false, status: res.status }),
        { status: 200, headers: { "Content-Type": "application/json" } });
    }
    console.log(`[waitlist-notify] owner emailed for signup ${email}`);
    return new Response(JSON.stringify({ ok: true, emailed: true }),
      { status: 200, headers: { "Content-Type": "application/json" } });
  } catch (err) {
    console.error("[waitlist-notify] send failed:", err);
    return new Response(JSON.stringify({ ok: false, emailed: false }),
      { status: 200, headers: { "Content-Type": "application/json" } });
  }
});
