"use server";

import { headers } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { env } from "@/lib/env";

export async function signInWithMagicLink(formData: FormData) {
  const email = String(formData.get("email") ?? "").trim();
  const next = String(formData.get("next") ?? "/dashboard");

  if (!email.includes("@")) {
    return { ok: false, error: "Please enter a valid work email." };
  }

  const supabase = await createClient();
  const headerList = await headers();
  const origin =
    headerList.get("origin") ??
    headerList.get("x-forwarded-host") ??
    env.siteUrl;

  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: {
      emailRedirectTo: `${origin}/auth/callback?next=${encodeURIComponent(next)}`,
      shouldCreateUser: true,
    },
  });

  if (error) {
    return { ok: false, error: error.message };
  }
  return { ok: true, email };
}
