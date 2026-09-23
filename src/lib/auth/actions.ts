"use server";

import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import {
  REMEMBER_COOKIE,
  rememberCookieOptions,
} from "@/lib/supabase/cookies";
import { passwordError } from "@/lib/auth/password";
import { createClient } from "@/lib/supabase/server";

export type AuthState = {
  error?: string;
  message?: string;
} | null;

function text(formData: FormData, name: string) {
  const value = formData.get(name);
  return typeof value === "string" ? value.trim() : "";
}

async function origin() {
  const headerStore = await headers();
  const fromHeader = headerStore.get("origin");

  if (fromHeader) {
    return fromHeader;
  }

  const host = headerStore.get("x-forwarded-host") ?? headerStore.get("host");
  const proto = headerStore.get("x-forwarded-proto") ?? "http";
  return `${proto}://${host}`;
}

export async function signInAction(
  _state: AuthState,
  formData: FormData,
): Promise<AuthState> {
  const email = text(formData, "email");
  const password = text(formData, "password");
  const remember = formData.get("remember") === "on";

  if (!email || !password) {
    return { error: "Enter your email and password." };
  }

  const supabase = await createClient({ remember });
  const { error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) {
    return { error: signInMessage(error.message) };
  }

  const cookieStore = await cookies();
  cookieStore.set(REMEMBER_COOKIE, remember ? "1" : "0", rememberCookieOptions(remember));
  redirect("/");
}

export async function signUpAction(
  _state: AuthState,
  formData: FormData,
): Promise<AuthState> {
  const name = text(formData, "name");
  const email = text(formData, "email");
  const password = text(formData, "password");
  const confirmation = text(formData, "confirmation");
  const invalid = passwordError(password, confirmation);

  if (!name) {
    return { error: "Enter your name." };
  }

  if (!email) {
    return { error: "Enter an email address." };
  }

  if (invalid) {
    return { error: invalid };
  }

  const supabase = await createClient({ remember: true });
  const redirectTo = new URL("/auth/callback", await origin());
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      emailRedirectTo: redirectTo.toString(),
      data: { name },
    },
  });

  if (error) {
    return { error: signUpMessage(error.message) };
  }

  if (!data.session) {
    return {
      message: "Account created. Check your email to confirm it, then sign in.",
    };
  }

  const cookieStore = await cookies();
  cookieStore.set(REMEMBER_COOKIE, "1", rememberCookieOptions(true));
  redirect("/");
}

export async function recoverPasswordAction(
  _state: AuthState,
  formData: FormData,
): Promise<AuthState> {
  const email = text(formData, "email");

  if (!email) {
    return { error: "Enter the email on the account." };
  }

  const supabase = await createClient();
  const redirectTo = new URL("/auth/callback", await origin());
  redirectTo.searchParams.set("next", "/login?setPassword=1");

  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: redirectTo.toString(),
  });

  if (error) {
    return { error: error.message };
  }

  return {
    message: "Recovery email sent. Use the link to choose a new password.",
  };
}

export async function setPasswordAction(
  _state: AuthState,
  formData: FormData,
): Promise<AuthState> {
  const password = text(formData, "password");
  const confirmation = text(formData, "confirmation");
  const invalid = passwordError(password, confirmation);

  if (invalid) {
    return { error: invalid };
  }

  const supabase = await createClient({ remember: true });
  const { data } = await supabase.auth.getClaims();

  if (!data?.claims?.sub) {
    return {
      error: "Open the recovery link from your email, then set a new password.",
    };
  }

  const { error } = await supabase.auth.updateUser({ password });

  if (error) {
    return { error: error.message };
  }

  const cookieStore = await cookies();
  cookieStore.set(REMEMBER_COOKIE, "1", rememberCookieOptions(true));
  redirect("/");
}

export async function signOutAction() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  const cookieStore = await cookies();
  cookieStore.delete(REMEMBER_COOKIE);
  redirect("/login");
}

function signInMessage(message: string) {
  const normalized = message.toLowerCase();

  if (normalized.includes("invalid login")) {
    return "Email or password is incorrect.";
  }

  if (normalized.includes("email not confirmed")) {
    return "Confirm your email before signing in.";
  }

  return message;
}

function signUpMessage(message: string) {
  const normalized = message.toLowerCase();

  if (normalized.includes("already")) {
    return "An account with that email already exists.";
  }

  if (normalized.includes("rate limit")) {
    return "Too many emails were sent. Wait a little while, then try again.";
  }

  return message;
}
