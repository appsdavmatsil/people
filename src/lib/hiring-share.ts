import { randomBytes, timingSafeEqual } from "node:crypto";
import { createServiceClient } from "@/lib/supabase/service";

/** The secret part of the team link to Form Responses, or null when the link is turned off. */
export async function loadHiringShareToken(): Promise<string | null> {
  const supabase = createServiceClient();
  if (!supabase) return null;
  const { data } = await supabase.from("hiring_form_config").select("share_token").eq("id", true).maybeSingle();
  return data?.share_token || null;
}

export async function isValidHiringShareToken(token: string): Promise<boolean> {
  const current = await loadHiringShareToken();
  if (!current || !token) return false;
  const a = Buffer.from(token);
  const b = Buffer.from(current);
  return a.length === b.length && timingSafeEqual(a, b);
}

/** Creates a new team link (the old one stops working), or turns it off. */
export async function setHiringShareToken(enabled: boolean): Promise<{ token: string | null; error?: string }> {
  const supabase = createServiceClient();
  if (!supabase) return { token: null, error: "Server not configured." };
  const token = enabled ? randomBytes(24).toString("base64url") : null;
  const { error } = await supabase.from("hiring_form_config").update({ share_token: token }).eq("id", true);
  if (error) return { token: null, error: error.message };
  return { token };
}
