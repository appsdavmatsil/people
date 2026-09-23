import type { CookieOptions } from "@supabase/ssr";

export const REMEMBER_COOKIE = "people_remember";

const REMEMBER_MAX_AGE = 60 * 60 * 24 * 400;

export function rememberCookieOptions(remember: boolean) {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    ...(remember ? { maxAge: REMEMBER_MAX_AGE } : {}),
  };
}

export function withRemember(
  options: CookieOptions,
  remember: boolean,
): CookieOptions {
  if (remember || options.maxAge === 0) {
    return options;
  }

  const next = { ...options };
  delete next.maxAge;
  delete next.expires;
  return next;
}
