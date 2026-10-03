import { Readable } from "node:stream";
import { google, type drive_v3 } from "googleapis";

/**
 * Google Drive helper for the staff intake form.
 *
 * Files are written into a Google Shared Drive owned by the Maine Google
 * Workspace (culinarytraining@themaine.ae). A service account is added as a
 * member (Content manager) of that Shared Drive, so it can create folders and
 * upload files using the workspace's storage quota.
 *
 * Required environment variables:
 *   GOOGLE_SERVICE_ACCOUNT_JSON  Full service-account JSON key (stringified).
 *                                May be base64-encoded.
 *   STAFF_DRIVE_ID               The Shared Drive ID (the drive itself).
 *   STAFF_DRIVE_ROOT_FOLDER      Optional. Folder ID inside the Shared Drive to
 *                                use as the parent for employee folders. When
 *                                omitted, the Shared Drive root is used.
 */

const DRIVE_SCOPE = "https://www.googleapis.com/auth/drive";
const FOLDER_MIME = "application/vnd.google-apps.folder";

export type DriveConfig = {
  driveId: string;
  rootFolderId: string;
};

export type UploadedFile = {
  id: string;
  name: string;
  webViewLink: string | null;
};

let cachedDrive: drive_v3.Drive | null = null;

function parseServiceAccount(raw: string): Record<string, unknown> {
  const trimmed = raw.trim();

  // Preferred form: base64-encoded JSON. Base64 contains no newlines or quotes,
  // so it survives copy/paste into env UIs without corruption.
  if (!trimmed.startsWith("{")) {
    const decoded = Buffer.from(trimmed, "base64").toString("utf8");
    return JSON.parse(decoded) as Record<string, unknown>;
  }

  // Fallback: raw JSON string.
  return JSON.parse(trimmed) as Record<string, unknown>;
}

export function getDriveConfig(): DriveConfig {
  const driveId = process.env.STAFF_DRIVE_ID;
  if (!driveId) {
    throw new Error("Missing STAFF_DRIVE_ID environment variable.");
  }

  return {
    driveId,
    // When no explicit root folder is set, employee folders are created at the
    // Shared Drive root, whose folder id equals the drive id.
    rootFolderId: process.env.STAFF_DRIVE_ROOT_FOLDER || driveId,
  };
}

export function getDriveClient(): drive_v3.Drive {
  if (cachedDrive) {
    return cachedDrive;
  }

  const raw = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  if (!raw) {
    throw new Error("Missing GOOGLE_SERVICE_ACCOUNT_JSON environment variable.");
  }

  const credentials = parseServiceAccount(raw);
  const auth = new google.auth.GoogleAuth({
    credentials,
    scopes: [DRIVE_SCOPE],
  });

  cachedDrive = google.drive({ version: "v3", auth });
  return cachedDrive;
}

/**
 * Escapes a value for use inside a Drive query string literal.
 */
function escapeQueryValue(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
}

/**
 * Finds a folder by exact name under a parent, creating it if it does not
 * exist. Shared Drive aware.
 */
export async function findOrCreateFolder(
  drive: drive_v3.Drive,
  config: DriveConfig,
  name: string,
  parentId: string,
): Promise<string> {
  const query = [
    `name = '${escapeQueryValue(name)}'`,
    `mimeType = '${FOLDER_MIME}'`,
    `'${parentId}' in parents`,
    "trashed = false",
  ].join(" and ");

  const existing = await drive.files.list({
    q: query,
    fields: "files(id, name)",
    corpora: "drive",
    driveId: config.driveId,
    includeItemsFromAllDrives: true,
    supportsAllDrives: true,
    pageSize: 1,
  });

  const found = existing.data.files?.[0];
  if (found?.id) {
    return found.id;
  }

  const created = await drive.files.create({
    requestBody: {
      name,
      mimeType: FOLDER_MIME,
      parents: [parentId],
    },
    fields: "id",
    supportsAllDrives: true,
  });

  if (!created.data.id) {
    throw new Error(`Failed to create Drive folder "${name}".`);
  }

  return created.data.id;
}

/**
 * Uploads a single file into a Drive folder. Shared Drive aware.
 */
export async function uploadFile(
  drive: drive_v3.Drive,
  folderId: string,
  fileName: string,
  mimeType: string,
  body: Buffer,
): Promise<UploadedFile> {
  const created = await drive.files.create({
    requestBody: {
      name: fileName,
      parents: [folderId],
    },
    media: {
      mimeType,
      body: Readable.from(body),
    },
    fields: "id, name, webViewLink",
    supportsAllDrives: true,
  });

  if (!created.data.id) {
    throw new Error(`Failed to upload file "${fileName}".`);
  }

  return {
    id: created.data.id,
    name: created.data.name ?? fileName,
    webViewLink: created.data.webViewLink ?? null,
  };
}
