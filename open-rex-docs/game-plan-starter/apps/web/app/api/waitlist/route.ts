import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { live } from "@/lib/env";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function POST(req: NextRequest) {
  let body: { email?: string; dealership?: string; source?: string; referrer?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const email = String(body.email ?? "").trim().toLowerCase();
  if (!EMAIL_RE.test(email) || email.length > 320) {
    return NextResponse.json({ error: "Enter a valid email." }, { status: 400 });
  }

  if (!live.supabase) {
    // Dev fallback: accept the signup but log to console so the form works
    // pre-secrets-paste. Reads stay sealed; no fake row written.
    console.warn("[waitlist] Supabase env not wired — signup not persisted");
    return NextResponse.json({ ok: true, persisted: false });
  }

  const supabase = await createClient();
  const userAgent = req.headers.get("user-agent") ?? null;

  const { error } = await supabase.from("waitlist").insert({
    email,
    dealership: body.dealership ?? null,
    source: body.source ?? "landing",
    referrer: body.referrer ?? null,
    user_agent: userAgent,
  });

  if (error) {
    if (error.code === "23505") {
      return NextResponse.json({ ok: true, alreadyOnList: true });
    }
    return NextResponse.json({ error: "Could not save your email." }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
