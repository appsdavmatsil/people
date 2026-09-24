"use server";

import { passwordError } from "@/lib/auth/password";
import {
  memberDefaults,
  parseAccessLog,
  parseTeamMembers,
  type AccessLogEntry,
  type TeamMember,
} from "@/lib/auth/team-model";
import { createClient } from "@/lib/supabase/server";

export type TeamActionState = {
  error?: string;
  member?: TeamMember;
  password?: string;
  website?: string;
};

const productionWebsite = "https://people-lyart.vercel.app";

function appWebsite() {
  const production = process.env.VERCEL_PROJECT_PRODUCTION_URL?.trim();
  if (!production) {
    return productionWebsite;
  }

  return `https://${production.replace(/^https?:\/\//, "")}`;
}

function message(error: { message: string } | null) {
  return error?.message || "That change could not be saved.";
}

export async function updateTeamMemberAction(input: {
  id: string;
  name: string;
  email: string;
  password: string;
}): Promise<TeamActionState> {
  const name = input.name.trim().replace(/\s+/g, " ");
  const email = input.email.trim().toLowerCase();
  const password = input.password.trim();

  if (!name) {
    return { error: "Enter a name." };
  }

  if (!email) {
    return { error: "Enter an email address." };
  }

  if (password) {
    const invalid = passwordError(password, password);
    if (invalid) {
      return { error: invalid };
    }
  }

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("update_team_member", {
    member_id: input.id,
    next_name: name,
    next_email: email,
    next_password: password,
  });

  if (error) {
    return { error: message(error) };
  }

  const member = parseTeamMembers([data])[0];
  if (!member) {
    return { error: "That team member was not found." };
  }

  if (!password) {
    return { member };
  }

  return {
    member,
    password,
    website: appWebsite(),
  };
}

export async function setTeamAccessAction(
  id: string,
  blocked: boolean,
): Promise<TeamActionState> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("set_team_access", {
    member_id: id,
    blocked,
  });

  if (error) {
    return { error: message(error) };
  }

  const member = parseTeamMembers([data])[0];
  if (!member) {
    return { error: "That team member was not found." };
  }

  return { member: memberDefaults(member) };
}

export async function removeTeamMemberAction(id: string): Promise<TeamActionState> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("remove_team_member", { member_id: id });

  if (error) {
    return { error: message(error) };
  }

  return {};
}

export async function listAccessLogAction(id: string): Promise<AccessLogEntry[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("list_access_log", { member_id: id });

  if (error || !data) {
    return [];
  }

  return parseAccessLog(data);
}

export async function recordActivityAction(
  kind: "access" | "edit",
  summary: string,
  entryId: string,
) {
  const supabase = await createClient();
  await supabase.rpc("record_activity", {
    kind,
    summary,
    entry_id: entryId,
  });
}
