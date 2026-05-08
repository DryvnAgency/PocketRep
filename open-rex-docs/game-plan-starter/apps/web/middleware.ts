import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { env } from "@/lib/env";

export async function middleware(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    env.supabaseUrl,
    env.supabasePublishableKey,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value),
          );
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  const { data } = await supabase.auth.getUser();
  const path = request.nextUrl.pathname;
  const inApp = path.startsWith("/dashboard") || path.startsWith("/heat-sheet")
    || path.startsWith("/game-plans") || path.startsWith("/lens")
    || path.startsWith("/coach") || path.startsWith("/audit")
    || path.startsWith("/rep");

  if (inApp && !data.user) {
    const url = request.nextUrl.clone();
    url.pathname = "/sign-in";
    url.searchParams.set("next", path);
    return NextResponse.redirect(url);
  }

  return response;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|api/waitlist|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
