import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { env } from "@/lib/env";

export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient(env.supabaseUrl, env.supabasePublishableKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options),
          );
        } catch {
          // Called from a Server Component — ignore. Middleware refreshes the session.
        }
      },
    },
  });
}

export function createServiceClient() {
  return createServerClient(env.supabaseUrl, env.supabaseServiceRole, {
    cookies: { getAll: () => [], setAll: () => {} },
  });
}
