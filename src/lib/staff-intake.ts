/**
 * Shared definitions for the public staff-details intake form.
 *
 * File naming replicates the SS_OPS_HUB WorkDrive convention:
 *   {doc label}_{full name}_{yyyy-MM-dd}.{ext}
 *
 * The date segment is:
 *   - the document's EXPIRY date for passport, Emirates ID and residence visa
 *   - the UPLOAD date for the profile photo
 */

export type IntakeTextField = {
  name: string;
  label: string;
  type: "text" | "email" | "tel" | "date";
  required: boolean;
  autoComplete?: string;
};

export type IntakeDocument = {
  /** Form field name for the file input. */
  field: string;
  /** Label used as the filename prefix, e.g. "Passport". */
  label: string;
  /** When set, the filename date comes from this date field; otherwise today. */
  dateField?: string;
  required: boolean;
};

export const INTAKE_TEXT_FIELDS: IntakeTextField[] = [
  { name: "fullName", label: "Full name", type: "text", required: true, autoComplete: "name" },
  { name: "email", label: "Email", type: "email", required: true, autoComplete: "email" },
  { name: "dateOfBirth", label: "Date of birth", type: "date", required: true },
  { name: "phone", label: "Phone number", type: "tel", required: true, autoComplete: "tel" },
  { name: "whatsapp", label: "WhatsApp phone number", type: "tel", required: true },
  { name: "joiningDate", label: "Joining date", type: "date", required: true },
  { name: "nationality", label: "Nationality", type: "text", required: true, autoComplete: "country-name" },
  { name: "passportNumber", label: "Passport number", type: "text", required: true },
  { name: "passportExpiry", label: "Passport expiry date", type: "date", required: true },
  { name: "emiratesIdNumber", label: "Emirates ID number", type: "text", required: true },
  { name: "emiratesIdExpiry", label: "Emirates ID expiry date", type: "date", required: true },
  { name: "visaExpiry", label: "Residence visa expiry date", type: "date", required: true },
];

export const INTAKE_DOCUMENTS: IntakeDocument[] = [
  { field: "profilePhoto", label: "Profile Photo", required: true },
  { field: "passportImage", label: "Passport", dateField: "passportExpiry", required: true },
  { field: "emiratesIdFront", label: "Emirates ID Front", dateField: "emiratesIdExpiry", required: true },
  { field: "emiratesIdBack", label: "Emirates ID Back", dateField: "emiratesIdExpiry", required: true },
  { field: "visaImage", label: "Residence Visa", dateField: "visaExpiry", required: true },
];

/** Removes characters that are invalid or awkward in Drive file/folder names. */
export function sanitizeNameSegment(value: string): string {
  return value
    .replace(/[\\/:*?"<>|]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Validates and normalises a yyyy-MM-dd date string; returns null if invalid. */
export function normalizeIsoDate(value: string): string | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim());
  if (!match) {
    return null;
  }
  const [, year, month, day] = match;
  const date = new Date(Number(year), Number(month) - 1, Number(day));
  if (
    date.getFullYear() !== Number(year) ||
    date.getMonth() !== Number(month) - 1 ||
    date.getDate() !== Number(day)
  ) {
    return null;
  }
  return `${year}-${month}-${day}`;
}

export function todayIso(now: Date = new Date()): string {
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${now.getFullYear()}-${month}-${day}`;
}

/** Returns a lowercase file extension (with no dot) from a filename or mime. */
export function fileExtension(originalName: string, mimeType: string): string {
  const dot = originalName.lastIndexOf(".");
  if (dot !== -1 && dot < originalName.length - 1) {
    return originalName.slice(dot + 1).toLowerCase().replace(/[^a-z0-9]/g, "");
  }
  const mimeExt: Record<string, string> = {
    "image/jpeg": "jpg",
    "image/jpg": "jpg",
    "image/png": "png",
    "image/heic": "heic",
    "image/heif": "heif",
    "image/webp": "webp",
    "application/pdf": "pdf",
  };
  return mimeExt[mimeType] ?? "bin";
}

/**
 * Builds the Drive file name:  {label}_{name}_{date}.{ext}
 * `date` is the expiry date for ID documents or the upload date for photos.
 */
export function buildFileName(
  label: string,
  fullName: string,
  date: string,
  originalName: string,
  mimeType: string,
): string {
  const safeName = sanitizeNameSegment(fullName);
  const ext = fileExtension(originalName, mimeType);
  return `${label}_${safeName}_${date}.${ext}`;
}

/** The per-employee folder name is simply the sanitized full name. */
export function buildFolderName(fullName: string): string {
  return sanitizeNameSegment(fullName);
}
