import { createServiceClient } from "@/lib/supabase/service";
import { HIRING_STATUSES, normalizeHiringStatus, type HiringStatus } from "@/lib/hiring-status";

export type HiringDocumentRecord = {
  label: string;
  file_id: string;
  file_name: string;
  web_view_link: string | null;
};

export type HiringSubmission = {
  id: string;
  created_at: string;
  status: HiringStatus;
  full_name: string;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  phone: string | null;
  date_of_birth: string | null;
  nationality: string | null;
  current_address: string | null;
  instagram: string | null;
  position_applied: string | null;
  current_position: string | null;
  experience_years: string | null;
  salary_expectation: string | null;
  documents: HiringDocumentRecord[];
  /** Extra fields: UAE status, languages, references, chef questions, legacy docs. */
  data: Record<string, unknown>;
  updated_at: string | null;
};

/**
 * Loads all hiring submissions, newest first. Service-role only
 * (table is server-only, RLS blocks anon/authenticated).
 */
export async function listHiringSubmissions(): Promise<HiringSubmission[]> {
  const supabase = createServiceClient();
  if (!supabase) {
    return [];
  }

  const { data, error } = await supabase
    .from("hiring_submissions")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) {
    console.error("Failed to load hiring submissions:", error.message);
    return [];
  }

  return ((data ?? []) as HiringSubmission[]).map((row) => ({ ...row, status: normalizeHiringStatus(row.status) }));
}

/** Sets the status of one or more submissions. Callers must check access first. */
export async function updateHiringStatuses(ids: string | string[], status: string): Promise<{ ok: boolean; error?: string }> {
  if (!HIRING_STATUSES.includes(status as HiringStatus)) {
    return { ok: false, error: "Invalid status." };
  }
  const idList = Array.isArray(ids) ? ids : [ids];
  if (idList.length === 0) return { ok: true };

  const supabase = createServiceClient();
  if (!supabase) return { ok: false, error: "Server not configured." };

  const { error } = await supabase
    .from("hiring_submissions")
    .update({ status, updated_at: new Date().toISOString() })
    .in("id", idList);
  return error ? { ok: false, error: error.message } : { ok: true };
}
