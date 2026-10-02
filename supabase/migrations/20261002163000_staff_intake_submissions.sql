-- Public staff-details intake submissions.
--
-- Rows are written by the server-side /api/staff-intake route using the
-- service-role key, which bypasses RLS. The form itself is unauthenticated, so
-- no direct anon/authenticated access is granted to this table — it holds
-- personal data (passport, Emirates ID, visa) and must stay server-only.

create table public.staff_intake_submissions (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  full_name text not null,
  email text not null,
  date_of_birth date,
  phone text,
  whatsapp text,
  joining_date date,
  nationality text,
  passport_number text,
  passport_expiry date,
  emirates_id_number text,
  emirates_id_expiry date,
  visa_number text,
  visa_expiry date,
  drive_folder_id text,
  -- Array of uploaded document metadata:
  --   [{ label, file_id, file_name, web_view_link }]
  documents jsonb not null default '[]'::jsonb
);

alter table public.staff_intake_submissions enable row level security;

-- No policies and no grants: only the service role (which bypasses RLS) may
-- read or write. anon and authenticated clients have no access.
revoke all on table public.staff_intake_submissions from public, anon, authenticated;

create index staff_intake_submissions_created_at_idx
  on public.staff_intake_submissions (created_at desc);
