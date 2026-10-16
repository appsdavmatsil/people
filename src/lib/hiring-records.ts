import { createServiceClient } from "@/lib/supabase/service";
import { HIRING_STATUSES, normalizeHiringStatus, type HiringStatus } from "@/lib/hiring-status";
import { isValidInterviewSlot } from "@/lib/interview-slots";

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

/**
 * Books (or clears, with `slot` null) an interview slot for one submission.
 * Booking marks the applicant "Need to interview", except Stand By and Selected,
 * which keep their status. Refuses a slot another applicant already holds.
 * Callers must check access first.
 */
export async function setHiringInterview(id: string, slot: string | null): Promise<{ ok: boolean; error?: string }> {
  if (slot !== null && !isValidInterviewSlot(slot)) return { ok: false, error: "Invalid interview slot." };

  const supabase = createServiceClient();
  if (!supabase) return { ok: false, error: "Server not configured." };

  if (slot) {
    const { data: taken, error: takenError } = await supabase
      .from("hiring_submissions")
      .select("id, full_name")
      .eq("data->>interview", slot)
      .neq("id", id)
      .limit(1);
    if (takenError) return { ok: false, error: takenError.message };
    if (taken && taken.length > 0) return { ok: false, error: `That slot is already booked for ${taken[0].full_name}.` };
  }

  const { data: row, error: readError } = await supabase.from("hiring_submissions").select("data, status").eq("id", id).maybeSingle();
  if (readError) return { ok: false, error: readError.message };
  if (!row) return { ok: false, error: "Application not found." };

  const data = { ...((row.data as Record<string, unknown>) ?? {}) };
  if (slot) data.interview = slot;
  else delete data.interview;

  const status = normalizeHiringStatus(row.status);
  const keepStatus = status === "stand_by" || status === "selected";
  const { error } = await supabase
    .from("hiring_submissions")
    .update({ data, ...(slot && !keepStatus ? { status: "need_interview" } : {}), updated_at: new Date().toISOString() })
    .eq("id", id);
  return error ? { ok: false, error: error.message } : { ok: true };
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
