import { createServiceClient } from "@/lib/supabase/service";

export type HiringDocumentRecord = {
  label: string;
  file_id: string;
  file_name: string;
  web_view_link: string | null;
};

export type HiringSubmission = {
  id: string;
  created_at: string;
  status: "new" | "reviewed" | "shortlisted" | "hired";
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

  return (data ?? []) as HiringSubmission[];
}
