import { createServiceClient } from "@/lib/supabase/service";

export type IntakeDocumentRecord = {
  label: string;
  file_id: string;
  file_name: string;
  web_view_link: string | null;
};

export type IntakeSubmission = {
  id: string;
  created_at: string;
  full_name: string;
  email: string;
  date_of_birth: string | null;
  phone: string | null;
  whatsapp: string | null;
  joining_date: string | null;
  nationality: string | null;
  passport_number: string | null;
  passport_expiry: string | null;
  emirates_id_number: string | null;
  emirates_id_expiry: string | null;
  visa_expiry: string | null;
  drive_folder_id: string | null;
  documents: IntakeDocumentRecord[];
};

/**
 * Loads all staff-intake submissions, newest first. Uses the service-role
 * client (the table is server-only). Returns an empty list when the service
 * key is not configured.
 */
export async function listIntakeSubmissions(): Promise<IntakeSubmission[]> {
  const supabase = createServiceClient();
  if (!supabase) {
    return [];
  }

  const { data, error } = await supabase
    .from("staff_intake_submissions")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) {
    console.error("Failed to load staff intake submissions:", error.message);
    return [];
  }

  return (data ?? []) as IntakeSubmission[];
}
