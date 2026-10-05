import "server-only";
import { buildFileName, normalizeIsoDate } from "@/lib/staff-intake";
import type { ConfigDocument, ConfigTextField, FormConfig } from "@/lib/form-config";

/**
 * Validation and row-mapping shared by the public staff-details form's create
 * (POST /api/staff-intake) and self-service edit (POST /api/staff-intake/edit/save).
 */

export const MAX_FILE_BYTES = 15 * 1024 * 1024; // 15 MB per file
const ALLOWED_MIME_PREFIXES = ["image/"];
const ALLOWED_MIME_EXACT = ["application/pdf"];

export type FieldValues = Record<string, string>;

export type PendingUpload = {
  doc: ConfigDocument;
  fileName: string;
  mimeType: string;
  buffer: Buffer;
};

export type StoredDocument = {
  label: string;
  file_id: string;
  file_name: string;
  web_view_link: string | null;
};

// Form field name -> submissions table column. Every value is also kept in the
// `data` jsonb column so custom Form Builder fields survive.
export const FIELD_COLUMNS: Record<string, string> = {
  fullName: "full_name",
  email: "email",
  dateOfBirth: "date_of_birth",
  phone: "phone",
  whatsapp: "whatsapp",
  joiningDate: "joining_date",
  nationality: "nationality",
  passportNumber: "passport_number",
  passportExpiry: "passport_expiry",
  emiratesIdNumber: "emirates_id_number",
  emiratesIdExpiry: "emirates_id_expiry",
  visaExpiry: "visa_expiry",
};

function isAllowedMime(mime: string): boolean {
  return (
    ALLOWED_MIME_PREFIXES.some((prefix) => mime.startsWith(prefix)) ||
    ALLOWED_MIME_EXACT.includes(mime)
  );
}

export function collectTextFields(
  form: FormData,
  textFields: ConfigTextField[],
): { values: FieldValues; error?: string } {
  const values: FieldValues = {};

  for (const field of textFields) {
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

/**
 * Validates uploaded files. `requireMissing` lists document labels that must be
 * provided (all required ones for a new submission; on edit, only required
 * documents the person has never uploaded).
 */
export async function collectUploads(
  form: FormData,
  config: FormConfig,
  values: FieldValues,
  uploadDate: string,
  isRequired: (doc: ConfigDocument) => boolean,
): Promise<{ uploads: PendingUpload[]; error?: string }> {
  const uploads: PendingUpload[] = [];
  const fullName = values.fullName ?? "";

  for (const doc of config.documents) {
    const entry = form.get(doc.field);

    if (!(entry instanceof File) || entry.size === 0) {
      if (isRequired(doc)) {
        return { uploads, error: `${doc.label} is required.` };
      }
      continue;
    }

    if (entry.size > MAX_FILE_BYTES) {
      return { uploads, error: `${doc.label} is too large (max 15 MB).` };
    }

    if (!isAllowedMime(entry.type)) {
      return { uploads, error: `${doc.label} must be an image or PDF.` };
    }

    const date = doc.dateField ? values[doc.dateField] : uploadDate;
    const fileName = buildFileName(
      doc.label,
      fullName,
      date,
      entry.name,
      entry.type,
      config.naming.filePattern,
    );
    uploads.push({ doc, fileName, mimeType: entry.type, buffer: Buffer.from(await entry.arrayBuffer()) });
  }

  return { uploads };
}

/** Column values for the submissions table from validated form values. */
export function columnsFromValues(values: FieldValues): Record<string, string | null> {
  const columns: Record<string, string | null> = {};
  for (const [field, column] of Object.entries(FIELD_COLUMNS)) {
    // full_name and email are NOT NULL columns.
    if (field in values) columns[column] = values[field] || (column === "full_name" || column === "email" ? "" : null);
  }
  return columns;
}

/** Form values for a stored submission (data jsonb first, then columns). */
export function valuesFromRow(row: Record<string, unknown>, textFields: ConfigTextField[]): FieldValues {
  const data = (row.data && typeof row.data === "object" ? row.data : {}) as Record<string, unknown>;
  const values: FieldValues = {};
  for (const field of textFields) {
    const fromData = data[field.name];
    const column = FIELD_COLUMNS[field.name];
    const fromColumn = column ? row[column] : undefined;
    const value = typeof fromData === "string" && fromData ? fromData : fromColumn;
    values[field.name] = typeof value === "string" ? value : "";
  }
  return values;
}
