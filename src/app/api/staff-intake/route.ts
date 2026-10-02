import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import {
  buildFileName,
  buildFolderName,
  INTAKE_DOCUMENTS,
  INTAKE_TEXT_FIELDS,
  normalizeIsoDate,
  todayIso,
} from "@/lib/staff-intake";
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

const MAX_FILE_BYTES = 15 * 1024 * 1024; // 15 MB per file
const ALLOWED_MIME_PREFIXES = ["image/"];
const ALLOWED_MIME_EXACT = ["application/pdf"];

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


type FieldValues = Record<string, string>;

function isAllowedMime(mime: string): boolean {
  return (
    ALLOWED_MIME_PREFIXES.some((prefix) => mime.startsWith(prefix)) ||
    ALLOWED_MIME_EXACT.includes(mime)
  );
}

function collectTextFields(form: FormData): { values: FieldValues; error?: string } {
  const values: FieldValues = {};

  for (const field of INTAKE_TEXT_FIELDS) {
    const raw = form.get(field.name);
    const value = typeof raw === "string" ? raw.trim() : "";

    if (field.required && !value) {
      return { values, error: `${field.label} is required.` };
    }

    if (value && field.type === "date") {
      const normalized = normalizeIsoDate(value);
      if (!normalized) {
        return { values, error: `${field.label} is not a valid date.` };
      }
      values[field.name] = normalized;
      continue;
    }

    if (value && field.type === "email" && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
      return { values, error: "Enter a valid email address." };
    }

    values[field.name] = value;
  }

  return { values };
}

export async function POST(request: Request): Promise<NextResponse> {
  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json({ error: "Invalid form submission." }, { status: 400 });
  }

  const { values, error } = collectTextFields(form);
  if (error) {
    return NextResponse.json({ error }, { status: 400 });
  }

  const fullName = values.fullName;
  const uploadDate = todayIso();

  // Validate files before touching Google Drive.
  type PendingUpload = {
    label: string;
    fileName: string;
    mimeType: string;
    buffer: Buffer;
  };
  const pending: PendingUpload[] = [];

  for (const doc of INTAKE_DOCUMENTS) {
    const entry = form.get(doc.field);

    if (!(entry instanceof File) || entry.size === 0) {
      if (doc.required) {
        return NextResponse.json({ error: `${doc.label} is required.` }, { status: 400 });
      }
      continue;
    }

    if (entry.size > MAX_FILE_BYTES) {
      return NextResponse.json(
        { error: `${doc.label} is too large (max 15 MB).` },
        { status: 400 },
      );
    }

    if (!isAllowedMime(entry.type)) {
      return NextResponse.json(
        { error: `${doc.label} must be an image or PDF.` },
        { status: 400 },
      );
    }

    const date = doc.dateField ? values[doc.dateField] : uploadDate;
    const fileName = buildFileName(doc.label, fullName, date, entry.name, entry.type);
    const buffer = Buffer.from(await entry.arrayBuffer());
    pending.push({ label: doc.label, fileName, mimeType: entry.type, buffer });
  }

  // Upload to Google Drive.
  let uploaded: Array<UploadedFile & { label: string }>;
  let folderId: string;
  try {
    const drive = getDriveClient();
    const config = getDriveConfig();
    folderId = await findOrCreateFolder(
      drive,
      config,
      buildFolderName(fullName),
      config.rootFolderId,
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
      uploaded.push({ ...result, label: item.label });
    }
  } catch (uploadError) {
    console.error("Staff intake Drive upload failed:", uploadError);
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
      await supabase.from("staff_intake_submissions").insert({
        full_name: fullName,
        email: values.email,
        date_of_birth: values.dateOfBirth,
        phone: values.phone,
        whatsapp: values.whatsapp,
        joining_date: values.joiningDate,
        nationality: values.nationality,
        passport_number: values.passportNumber,
        passport_expiry: values.passportExpiry,
        emirates_id_number: values.emiratesIdNumber,
        emirates_id_expiry: values.emiratesIdExpiry,
        visa_number: values.visaNumber,
        visa_expiry: values.visaExpiry,
        drive_folder_id: folderId,
        documents: uploaded.map((file) => ({
          label: file.label,
          file_id: file.id,
          file_name: file.name,
          web_view_link: file.webViewLink,
        })),
      });
    }
  } catch (recordError) {
    console.error("Staff intake record write failed:", recordError);
  }

  return NextResponse.json({ ok: true });
}
