"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { loadHiringConfig, saveHiringConfig } from "@/lib/hiring-config";
import type { ConfigTextField } from "@/lib/form-config";
import type { FormConfig } from "@/lib/form-config";
import { listHiringSubmissions, setHiringInterview, updateHiringStatuses, type HiringSubmission } from "@/lib/hiring-records";
import { setHiringShareToken } from "@/lib/hiring-share";
import { runWorkplaceSearch, type WorkplaceSearchResult } from "@/lib/workplace-search";

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
  const result = await updateHiringStatuses(ids, status);
  if (result.ok) revalidatePath("/hiringform");
  return result;
}

/** Applications and form fields for opening an application outside Form Responses. Requires an app session. */
export async function loadHiringApplicationsAction(): Promise<
  { ok: true; submissions: HiringSubmission[]; fields: ConfigTextField[] } | { ok: false; error: string }
> {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  if (typeof data?.claims?.sub !== "string") {
    return { ok: false, error: "Not authorized." };
  }
  const [submissions, config] = await Promise.all([listHiringSubmissions(), loadHiringConfig()]);
  return { ok: true, submissions, fields: config.textFields };
}

/** Books or clears an interview slot. Requires an app session. */
export async function scheduleInterviewAction(id: string, slot: string | null): Promise<{ ok: boolean; error?: string }> {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  if (typeof data?.claims?.sub !== "string") {
    return { ok: false, error: "Not authorized." };
  }
  const result = await setHiringInterview(id, slot);
  if (result.ok) revalidatePath("/hiringform");
  return result;
}

/** Web results for a candidate's workplace. Requires an app session. */
export async function searchWorkplaceAction(query: string): Promise<WorkplaceSearchResult> {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  if (typeof data?.claims?.sub !== "string") {
    return { ok: false, error: "Not authorized." };
  }
  return runWorkplaceSearch(query);
}

/** Creates a new team link to Form Responses (replacing any old one), or turns it off. */
export async function setHiringShareLinkAction(enabled: boolean): Promise<{ ok: boolean; token?: string | null; error?: string }> {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  if (typeof data?.claims?.sub !== "string") {
    return { ok: false, error: "Not authorized." };
  }
  const result = await setHiringShareToken(enabled);
  if (result.error) return { ok: false, error: result.error };
  return { ok: true, token: result.token };
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
