"use server";

import { createClient as createAuthClient } from "@supabase/supabase-js";
import { passwordError } from "@/lib/auth/password";
import { parseTeamMembers, type TeamMember } from "@/lib/auth/team-model";
import { createClient } from "@/lib/supabase/server";
import { getSupabaseEnv } from "@/lib/supabase/env";

export type { AccessLogEntry, TeamMember } from "@/lib/auth/team-model";

export type InviteState = {
  error?: string;
  website?: string;
  email?: string;
  password?: string;
  message?: string;
  member?: TeamMember;
} | null;

function text(formData: FormData, name: string) {
  const value = formData.get(name);
  return typeof value === "string" ? value.trim() : "";
}

const productionWebsite = "https://people-lyart.vercel.app";

function appWebsite() {
  const production = process.env.VERCEL_PROJECT_PRODUCTION_URL?.trim();
  if (!production) {
    return productionWebsite;
  }

  return `https://${production.replace(/^https?:\/\//, "")}`;
}

export async function inviteTeamMemberAction(
  _state: InviteState,
  formData: FormData,
): Promise<InviteState> {
  const session = await createClient();
  const { data: claims } = await session.auth.getClaims();
  if (typeof claims?.claims?.sub !== "string") {
    return { error: "Sign in before inviting someone." };
  }

  const name = text(formData, "name").replace(/\s+/g, " ");
  const email = text(formData, "email").toLowerCase();
  const password = text(formData, "password");
  const invalid = passwordError(password, password);

  if (!name) {
    return { error: "Enter a name." };
  }

  if (!email) {
    return { error: "Enter an email address." };
  }

  if (invalid) {
    return { error: invalid };
  }

  const env = getSupabaseEnv();
  if (!env) {
    return { error: "Supabase is not configured." };
  }

  const prepared = await session.rpc("prepare_team_invite", { invite_email: email });
  if (prepared.error) {
    return { error: inviteMessage(prepared.error.message) };
  }

  const auth = createAuthClient(env.url, env.key, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });
  const { data, error } = await auth.auth.signUp({
    email,
    password,
    options: {
      data: {
        name,
        must_change_password: true,
      },
    },
  });

  if (error || (data.user?.identities ?? []).length === 0) {
    await session.rpc("cancel_team_invite", { invite_email: email });
    return {
      error: error ? inviteMessage(error.message) : "An account with that email already exists.",
    };
  }

  const member = {
    id: data.user?.id ?? email,
    name,
    email,
    status: "active" as const,
    mustChangePassword: true,
    lastSignInAt: null,
    isSelf: false,
    isOwner: false,
  };
  const website = appWebsite();

  if (!data.session) {
    return {
      website,
      email,
      password,
      member,
      message:
        "Account created in Supabase. They confirm the email, sign in with this password, then choose a new one.",
    };
  }

  return {
    website,
    email,
    password,
    member,
    message:
      "Account created in Supabase. They sign in with this password, then choose a new one.",
  };
}

export async function listTeamMembers(): Promise<TeamMember[]> {
  const supabase = await createClient();
  const listed = await supabase.rpc("list_team");

  if (listed.error || !listed.data) {
    return [];
  }

  return parseTeamMembers(listed.data);
}

function inviteMessage(message: string) {
  const normalized = message.toLowerCase();

  if (normalized.includes("already")) {
    return "An account with that email already exists.";
  }

  if (normalized.includes("rate limit")) {
    return "Too many accounts were created. Wait a little while, then try again.";
  }

  return message;
}
