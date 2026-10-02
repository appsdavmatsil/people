# Staff Intake — Google Drive setup

The public staff-details form (`/onboarding`) uploads documents to a **Google
Shared Drive** owned by the Maine Google Workspace
(`culinarytraining@themaine.ae`).

Files land in:

```
<Shared Drive>/
  └── {Full Name}/
       ├── Profile Photo_{Full Name}_{upload date}.jpg
       ├── Passport_{Full Name}_{passport expiry}.jpg
       ├── Emirates ID Front_{Full Name}_{EID expiry}.jpg
       ├── Emirates ID Back_{Full Name}_{EID expiry}.jpg
       └── Residence Visa_{Full Name}_{visa expiry}.jpg
```

Dates use `yyyy-MM-dd`. Passport / Emirates ID / Residence Visa use the
**expiry date** entered on the form; the profile photo uses the **upload date**.

## One-time setup

### 1. Create a Shared Drive

In Google Drive, signed in as `culinarytraining@themaine.ae`:

1. Left sidebar → **Shared drives** → **New** → name it e.g. `Maine Staff Documents`.
2. Open the Shared Drive. The ID is the last segment of the URL:
   `https://drive.google.com/drive/folders/<THIS_IS_STAFF_DRIVE_ID>`
3. Set this as `STAFF_DRIVE_ID`.

> Optional: create a subfolder inside the Shared Drive and set its folder ID as
> `STAFF_DRIVE_ROOT_FOLDER` if you want employee folders nested rather than at
> the drive root.

### 2. Create a service account + key

In the Google Cloud console (you can reuse an existing project):

1. **APIs & Services → Library →** enable **Google Drive API**.
2. **APIs & Services → Credentials → Create credentials → Service account.**
   Give it a name (e.g. `staff-intake-uploader`). No roles needed.
3. Open the service account → **Keys → Add key → Create new key → JSON.**
   Download the JSON file.
4. Put the JSON into `GOOGLE_SERVICE_ACCOUNT_JSON` (raw one-line JSON, or
   base64-encode it: `base64 -i key.json`).

### 3. Give the service account access to the Shared Drive

1. Copy the service account email (looks like
   `staff-intake-uploader@<project>.iam.gserviceaccount.com`).
2. In the Shared Drive → **Manage members** → add that email as
   **Content manager**.

This is what lets the service account write using the workspace's storage
quota (service accounts have no storage of their own).

### 4. Supabase

Run the migration (`supabase db push`) to create
`staff_intake_submissions`, then set `SUPABASE_SERVICE_ROLE_KEY`
(Supabase → Project settings → API → `service_role` key). The intake route
records submission metadata; the row write is best-effort and never blocks a
successful upload.

## Environment variables

| Variable | Where |
| --- | --- |
| `GOOGLE_SERVICE_ACCOUNT_JSON` | Service-account JSON key (raw or base64) |
| `STAFF_DRIVE_ID` | Shared Drive ID |
| `STAFF_DRIVE_ROOT_FOLDER` | Optional parent folder ID inside the Shared Drive |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase service-role key (server-only) |

Set these in Vercel (Production/Preview/Development) and in `.env.local` for
local testing.

## Sharing the form

The form is public at `/onboarding` (e.g.
`https://people-lyart.vercel.app/onboarding`). Share that link with staff; no
login required.
