// One-off: move Drive folders left behind by deleted submissions into ARCHIVE.
//
//   node scripts/archive-drive-folder.mjs "kuldip"           # preview
//   node scripts/archive-drive-folder.mjs "kuldip" --apply   # move
//
// Only folders under the staff root whose name contains the search text and
// that no remaining submission points at are moved. Needs the same env vars as
// the app (GOOGLE_SERVICE_ACCOUNT_JSON, STAFF_DRIVE_ID, Supabase service key).
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { google } from "googleapis";
import { createClient } from "@supabase/supabase-js";

// Load the repo's env files wherever the script is run from.
for (const name of [".env.local", ".env.development.local"]) {
  const file = fileURLToPath(new URL(`../${name}`, import.meta.url));
  if (existsSync(file)) process.loadEnvFile(file);
}

const search = process.argv[2];
const apply = process.argv.includes("--apply");
if (!search) {
  console.error('Usage: node scripts/archive-drive-folder.mjs "<name>" [--apply]');
  process.exit(1);
}

for (const key of ["GOOGLE_SERVICE_ACCOUNT_JSON", "STAFF_DRIVE_ID", "NEXT_PUBLIC_SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"]) {
  if (!process.env[key]) {
    console.error(`Missing ${key}.`);
    process.exit(1);
  }
}

const raw = process.env.GOOGLE_SERVICE_ACCOUNT_JSON.trim();
const credentials = JSON.parse(raw.startsWith("{") ? raw : Buffer.from(raw, "base64").toString("utf8"));
const drive = google.drive({
  version: "v3",
  auth: new google.auth.GoogleAuth({ credentials, scopes: ["https://www.googleapis.com/auth/drive"] }),
});
const driveId = process.env.STAFF_DRIVE_ID;
const rootId = process.env.STAFF_DRIVE_ROOT_FOLDER || driveId;
const FOLDER = "application/vnd.google-apps.folder";
const listOptions = { corpora: "drive", driveId, includeItemsFromAllDrives: true, supportsAllDrives: true };

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const { data: rows, error } = await supabase.from("staff_intake_submissions").select("drive_folder_id");
if (error) throw error;
const inUse = new Set(rows.map((r) => r.drive_folder_id).filter(Boolean));

const escaped = search.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
const { data } = await drive.files.list({
  ...listOptions,
  q: `name contains '${escaped}' and mimeType = '${FOLDER}' and '${rootId}' in parents and trashed = false`,
  fields: "files(id, name)",
});
const folders = data.files ?? [];
if (!folders.length) {
  console.log(`No folders under the staff root contain "${search}".`);
  process.exit(0);
}

let archiveId = null;
for (const folder of folders) {
  if (inUse.has(folder.id)) {
    console.log(`Keep    ${folder.name} (${folder.id}) — still used by a submission`);
    continue;
  }
  if (!apply) {
    console.log(`Would move  ${folder.name} (${folder.id}) to ARCHIVE`);
    continue;
  }
  if (!archiveId) {
    const existing = await drive.files.list({
      ...listOptions,
      q: `name = 'ARCHIVE' and mimeType = '${FOLDER}' and '${rootId}' in parents and trashed = false`,
      fields: "files(id)",
      pageSize: 1,
    });
    archiveId =
      existing.data.files?.[0]?.id ??
      (await drive.files.create({
        requestBody: { name: "ARCHIVE", mimeType: FOLDER, parents: [rootId] },
        fields: "id",
        supportsAllDrives: true,
      })).data.id;
  }
  await drive.files.update({
    fileId: folder.id,
    addParents: archiveId,
    removeParents: rootId,
    fields: "id",
    supportsAllDrives: true,
  });
  console.log(`Moved   ${folder.name} (${folder.id}) to ARCHIVE`);
}
if (!apply) console.log("\nPreview only. Re-run with --apply to move.");
