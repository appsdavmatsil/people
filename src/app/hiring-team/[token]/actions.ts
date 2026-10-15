"use server";

import { revalidatePath } from "next/cache";
import { updateHiringStatuses } from "@/lib/hiring-records";
import { isValidHiringShareToken } from "@/lib/hiring-share";

/** Status change from the team link. The link's token is the only access check. */
export async function updateHiringStatusSharedAction(
  token: string,
  ids: string | string[],
  status: string,
): Promise<{ ok: boolean; error?: string }> {
  if (!(await isValidHiringShareToken(token))) {
    return { ok: false, error: "This link is no longer active. Ask HR for a new one." };
  }
  const result = await updateHiringStatuses(ids, status);
  if (result.ok) revalidatePath("/hiringform");
  return result;
}
