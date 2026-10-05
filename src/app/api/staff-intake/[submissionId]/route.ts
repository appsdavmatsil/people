import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { getDriveClient, getDriveConfig, moveFolderToArchive } from "@/lib/google-drive";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ submissionId: string }> };

/**
 * Deletes a submission record and moves its Drive folder into ARCHIVE. The
 * folder stays put when another submission still uses it (folders are shared
 * by name, so a resubmission can point at the same one).
 */
export async function DELETE(_request: Request, context: RouteContext) {
  const supabase = createServiceClient();
  if (!supabase) {
    return NextResponse.json({ error: "Database access is not configured." }, { status: 503 });
  }

  const { submissionId } = await context.params;
  const { data: row } = await supabase
    .from("staff_intake_submissions")
    .select("drive_folder_id")
    .eq("id", submissionId)
    .maybeSingle();

  const { error } = await supabase.from("staff_intake_submissions").delete().eq("id", submissionId);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const folderId = (row?.drive_folder_id as string | null | undefined) ?? null;
  if (!folderId) {
    return NextResponse.json({ ok: true, archived: false });
  }

  const { count } = await supabase
    .from("staff_intake_submissions")
    .select("id", { count: "exact", head: true })
    .eq("drive_folder_id", folderId);
  if (count) {
    return NextResponse.json({ ok: true, archived: false, sharedFolder: true });
  }

  try {
    await moveFolderToArchive(getDriveClient(), getDriveConfig(), folderId);
    return NextResponse.json({ ok: true, archived: true });
  } catch (archiveError) {
    console.error("Moving Drive folder to ARCHIVE failed:", archiveError);
    return NextResponse.json({ ok: true, archived: false, archiveError: true });
  }
}
