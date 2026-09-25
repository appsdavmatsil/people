import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { mustChangePassword } from "@/lib/auth/claims";
import { REMEMBER_COOKIE, withRemember } from "@/lib/supabase/cookies";
import { getSupabaseEnv } from "@/lib/supabase/env";

export async function proxy(request: NextRequest) {
  const env = getSupabaseEnv();

  if (!env) {
    return NextResponse.next({ request });
  }

  const remember = request.cookies.get(REMEMBER_COOKIE)?.value !== "0";
  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(env.url, env.key, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet, headers) {
        cookiesToSet.forEach(({ name, value }) =>
          request.cookies.set(name, value),
        );
        supabaseResponse = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) =>
          supabaseResponse.cookies.set(
            name,
            value,
            withRemember(options, remember),
          ),
        );
        Object.entries(headers).forEach(([key, value]) => {
          supabaseResponse.headers.set(key, value);
        });
      },
    },
  });

  let userId: string | null = null;
  let mustChange = false;

  try {
    const { data, error } = await supabase.auth.getClaims();
    if (!error && typeof data?.claims?.sub === "string") {
      userId = data.claims.sub;
      mustChange = mustChangePassword(data.claims);
    }
  } catch {
    userId = null;
  }

  const path = request.nextUrl.pathname;
  const isPublic =
    path.startsWith("/login") ||
    path.startsWith("/auth") ||
    path === "/install" ||
    path === "/manifest.webmanifest" ||
    path === "/sw.js";
  const settingPassword =
    path.startsWith("/login") &&
    request.nextUrl.searchParams.get("setPassword") === "1";

  if (!userId && !isPublic) {
    return redirectTo(request, supabaseResponse, "/login");
  }

  if (userId && mustChange && !settingPassword) {
    return redirectTo(request, supabaseResponse, "/login", "?setPassword=1");
  }

  if (userId && path.startsWith("/login") && !settingPassword) {
    return redirectTo(request, supabaseResponse, "/dashboard");
  }

  return supabaseResponse;
}

function redirectTo(
  request: NextRequest,
  supabaseResponse: NextResponse,
  pathname: string,
  search = "",
) {
  const url = request.nextUrl.clone();
  url.pathname = pathname;
  url.search = search;
  const redirectResponse = NextResponse.redirect(url);
  supabaseResponse.cookies.getAll().forEach((cookie) => {
    redirectResponse.cookies.set(cookie);
  });
  return redirectResponse;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|manifest.webmanifest|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
