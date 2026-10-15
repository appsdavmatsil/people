"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { saveHiringConfig } from "@/lib/hiring-config";
import type { FormConfig } from "@/lib/form-config";
import { HIRING_STATUSES, type HiringStatus } from "@/lib/hiring-status";

/**
 * Saves the hiring form configuration. Requires an authenticated app session.
 * Called from the Hiring Form Builder tab.
 */
export async function saveHiringConfigAction(
  config: FormConfig,
  expectedVersion?: string | null,
): Promise<{ ok: boolean; error?: string; version?: string }> {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  if (typeof data?.claims?.sub !== "string") {
    return { ok: false, error: "Not authorized." };
  }

  const result = await saveHiringConfig(config, expectedVersion);
  if (result.error) {
    return { ok: false, error: result.error };
  }

  revalidatePath("/hiringform");
  return { ok: true, version: result.version };
}

/** Updates the status of one or more hiring submissions. Requires an app session. */
export async function updateHiringStatusAction(
  ids: string | string[],
  status: string,
): Promise<{ ok: boolean; error?: string }> {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  if (typeof data?.claims?.sub !== "string") {
    return { ok: false, error: "Not authorized." };
  }
  if (!HIRING_STATUSES.includes(status as HiringStatus)) {
    return { ok: false, error: "Invalid status." };
  }
  const idList = Array.isArray(ids) ? ids : [ids];
  if (idList.length === 0) return { ok: true };

  const { createServiceClient } = await import("@/lib/supabase/service");
  const service = createServiceClient();
  if (!service) return { ok: false, error: "Server not configured." };

  const { error } = await service
    .from("hiring_submissions")
    .update({ status, updated_at: new Date().toISOString() })
    .in("id", idList);
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
