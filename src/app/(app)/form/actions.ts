"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { saveFormConfig, type FormConfig } from "@/lib/form-config";

/**
 * Saves the form configuration. Requires an authenticated app session.
 * Called from the Form Builder and Document Sorting tabs.
 */
export async function saveFormConfigAction(
  config: FormConfig,
): Promise<{ ok: boolean; error?: string }> {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  if (typeof data?.claims?.sub !== "string") {
    return { ok: false, error: "Not authorized." };
  }

  const result = await saveFormConfig(config);
  if (result.error) {
    return { ok: false, error: result.error };
  }

  revalidatePath("/form");
  revalidatePath("/onboarding");
  return { ok: true };
}
