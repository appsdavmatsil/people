import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { buildFolderName, todayIso } from "@/lib/staff-intake";
import { loadFormConfig } from "@/lib/form-config";
import { collectTextFields, collectUploads, columnsFromValues } from "@/lib/staff-intake-submit";
import {
  findOrCreateFolder,
  getDriveClient,
  getDriveConfig,
  uploadFile,
  type UploadedFile,
} from "@/lib/google-drive";

// Allow large multipart uploads and ensure Node runtime (googleapis needs it).
export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * Diagnostic endpoint. Reports which env vars are configured and whether the
 * service account can reach the Shared Drive. Does NOT expose any secret
 * values — only booleans and the (non-secret) service-account email / drive
 * name. Safe to call in production to debug setup.
 */
export async function GET(): Promise<NextResponse> {
  const checks: Record<string, unknown> = {
    hasGoogleKey: Boolean(process.env.GOOGLE_SERVICE_ACCOUNT_JSON),
    hasDriveId: Boolean(process.env.STAFF_DRIVE_ID),
    hasSupabaseServiceKey: Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY),
  };

  try {
    const drive = getDriveClient();
    const config = getDriveConfig();
    const info = await drive.drives.get({ driveId: config.driveId, fields: "id, name" });
    checks.driveReachable = true;
    checks.driveName = info.data.name ?? null;
  } catch (error) {
    checks.driveReachable = false;
    checks.driveError = error instanceof Error ? error.message : String(error);
  }

  return NextResponse.json(checks);
}


export async function POST(request: Request): Promise<NextResponse> {
  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json({ error: "Invalid form submission." }, { status: 400 });
  }

  const config = await loadFormConfig();

  const { values, error } = collectTextFields(form, config.textFields);
  if (error) {
    return NextResponse.json({ error }, { status: 400 });
  }

  const fullName = values.fullName ?? "";
  if (!fullName) {
    return NextResponse.json({ error: "Full name is required." }, { status: 400 });
  }
  const uploadDate = todayIso();

  // Validate files before touching Google Drive.
  const { uploads: pending, error: uploadError } = await collectUploads(
    form,
    config,
    values,
    uploadDate,
    (doc) => doc.required,
  );
  if (uploadError) {
    return NextResponse.json({ error: uploadError }, { status: 400 });
  }

  // Upload to Google Drive.
  let uploaded: Array<UploadedFile & { label: string }>;
  let folderId: string;
  try {
    const drive = getDriveClient();
    const driveConfig = getDriveConfig();
    folderId = await findOrCreateFolder(
      drive,
      driveConfig,
      buildFolderName(fullName, config.naming.folderPattern),
      driveConfig.rootFolderId,
    );

    uploaded = [];
    for (const item of pending) {
      const result = await uploadFile(
        drive,
        folderId,
        item.fileName,
        item.mimeType,
        item.buffer,
      );
      uploaded.push({ ...result, label: item.doc.label });
    }
  } catch (driveError) {
    console.error("Staff intake Drive upload failed:", driveError);
    return NextResponse.json(
      { error: "Could not upload your documents. Please try again or contact HR." },
      { status: 502 },
    );
  }

  // Record the submission in Supabase (best effort — do not fail the user if
  // the record write fails after a successful upload).
  try {
    const supabase = createServiceClient();
    if (supabase) {
      const { error: insertError } = await supabase.from("staff_intake_submissions").insert({
        ...columnsFromValues(values),
        full_name: fullName,
        drive_folder_id: folderId,
        data: values,
        documents: uploaded.map((file) => ({
          label: file.label,
          file_id: file.id,
          file_name: file.name,
          web_view_link: file.webViewLink,
        })),
      });
      if (insertError) throw insertError;
    }
  } catch (recordError) {
    console.error("Staff intake record write failed:", recordError);
  }

  return NextResponse.json({ ok: true });
}
