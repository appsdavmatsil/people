import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { loadFormConfig } from "@/lib/form-config";
import { buildFolderName, todayIso } from "@/lib/staff-intake";
import {
  collectTextFields,
  collectUploads,
  columnsFromValues,
  type StoredDocument,
} from "@/lib/staff-intake-submit";
import { verifyToken, type SubmissionRow } from "@/lib/staff-intake-edit";
import {
  findOrCreateFolder,
  getDriveClient,
  getDriveConfig,
  replaceFile,
  uploadFile,
} from "@/lib/google-drive";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * Step 3 of a self-service edit: saves the updated form onto the same
 * submission. Re-uploaded documents replace the existing Drive file as a new
 * version (same file id); documents not re-uploaded are kept as they are.
 */
export async function POST(request: Request): Promise<NextResponse> {
  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json({ error: "Invalid form submission." }, { status: 400 });
  }

  const session = verifyToken(form.get("token"), "edit");
  if (!session) {
    return NextResponse.json(
      { error: "Your update session has expired. Please verify again to save your changes." },
      { status: 401 },
    );
  }

  const supabase = createServiceClient();
  if (!supabase) {
    return NextResponse.json({ error: "Updates are not available right now. Please contact HR." }, { status: 503 });
  }

  const { data } = await supabase.from("staff_intake_submissions").select("*").eq("id", session.sid).maybeSingle();
  const row = data as SubmissionRow | null;
  if (!row) {
    return NextResponse.json({ error: "This submission no longer exists. Please contact HR." }, { status: 404 });
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

  const stored = (Array.isArray(row.documents) ? row.documents : []) as StoredDocument[];
  // Only required documents that were never uploaded must be provided now.
  const { uploads, error: uploadError } = await collectUploads(form, config, values, todayIso(), (doc) =>
    doc.required && !stored.some((item) => item.label === doc.label),
  );
  if (uploadError) {
    return NextResponse.json({ error: uploadError }, { status: 400 });
  }

  const documents = [...stored];
  let folderId = typeof row.drive_folder_id === "string" ? row.drive_folder_id : null;
  if (uploads.length) {
    try {
      const drive = getDriveClient();
      for (const item of uploads) {
        const index = documents.findIndex((existing) => existing.label === item.doc.label);
        if (index >= 0) {
          const result = await replaceFile(drive, documents[index].file_id, item.fileName, item.mimeType, item.buffer);
          documents[index] = { ...documents[index], file_name: result.name, web_view_link: result.webViewLink };
        } else {
          if (!folderId) {
            const driveConfig = getDriveConfig();
            folderId = await findOrCreateFolder(
              drive,
              driveConfig,
              buildFolderName(fullName, config.naming.folderPattern),
              driveConfig.rootFolderId,
            );
          }
          const result = await uploadFile(drive, folderId, item.fileName, item.mimeType, item.buffer);
          documents.push({ label: item.doc.label, file_id: result.id, file_name: result.name, web_view_link: result.webViewLink });
        }
      }
    } catch (driveError) {
      console.error("Staff edit Drive upload failed:", driveError);
      return NextResponse.json(
        { error: "Could not upload your documents. Please try again or contact HR." },
        { status: 502 },
      );
    }
  }

  const previousData = (row.data && typeof row.data === "object" ? row.data : {}) as Record<string, unknown>;
  const { error: updateError } = await supabase
    .from("staff_intake_submissions")
    .update({
      ...columnsFromValues(values),
      full_name: fullName,
      drive_folder_id: folderId,
      data: { ...previousData, ...values },
      documents,
      updated_at: new Date().toISOString(),
    })
    .eq("id", row.id);
  if (updateError) {
    console.error("Staff edit record update failed:", updateError);
    return NextResponse.json({ error: "Could not save your changes. Please try again." }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
