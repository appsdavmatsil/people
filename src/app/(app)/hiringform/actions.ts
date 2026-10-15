"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { saveHiringConfig } from "@/lib/hiring-config";
import type { FormConfig } from "@/lib/form-config";

/**
 * Saves the hiring form configuration. Requires an authenticated app session.
 * Called from the Hiring Form Builder tab.
 */
export async function saveHiringConfigAction(
  config: FormConfig,
): Promise<{ ok: boolean; error?: string }> {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  if (typeof data?.claims?.sub !== "string") {
    return { ok: false, error: "Not authorized." };
  }

  const result = await saveHiringConfig(config);
  if (result.error) {
    return { ok: false, error: result.error };
  }

  revalidatePath("/hiringform");
  return { ok: true };
}

const STATUSES = ["new", "reviewed", "shortlisted", "hired"] as const;
type HiringStatus = (typeof STATUSES)[number];

/** Updates one hiring submission's status. Requires an app session. */
export async function updateHiringStatusAction(
  id: string,
  status: string,
): Promise<{ ok: boolean; error?: string }> {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  if (typeof data?.claims?.sub !== "string") {
    return { ok: false, error: "Not authorized." };
  }
  if (!STATUSES.includes(status as HiringStatus)) {
    return { ok: false, error: "Invalid status." };
  }

  const { createServiceClient } = await import("@/lib/supabase/service");
  const service = createServiceClient();
  if (!service) return { ok: false, error: "Server not configured." };

  const { error } = await service
    .from("hiring_submissions")
    .update({ status, updated_at: new Date().toISOString() })
    .eq("id", id);
  if (error) return { ok: false, error: error.message };

  revalidatePath("/hiringform");
  return { ok: true };
}

/** Deletes one hiring submission. Requires an app session. */
export async function deleteHiringSubmissionAction(
  id: string,
): Promise<{ ok: boolean; error?: string }> {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  if (typeof data?.claims?.sub !== "string") {
    return { ok: false, error: "Not authorized." };
  }

  const { createServiceClient } = await import("@/lib/supabase/service");
  const service = createServiceClient();
  if (!service) return { ok: false, error: "Server not configured." };

  const { error } = await service.from("hiring_submissions").delete().eq("id", id);
  if (error) return { ok: false, error: error.message };

  revalidatePath("/hiringform");
  return { ok: true };
}
