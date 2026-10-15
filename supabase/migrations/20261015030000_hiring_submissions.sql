-- Hiring (job application) form — separate from the staff-intake form.
--
-- Mirrors the staff_intake_* design but for RECRUITMENT applicants, not
-- onboarded staff. Two tables:
--   hiring_submissions  — one row per application (seeded from the previous
--                         maine-forms Supabase `applications` table, 359 rows)
--   hiring_form_config  — single-row JSON definition the Hiring Form Builder
--                         edits and the public hiring form reads.
--
-- Written only by the server (service role, which bypasses RLS). The public
-- hiring form submits via a server route; no anon/authenticated access here.

-- ── Submissions ─────────────────────────────────────────────────────────────
create table if not exists public.hiring_submissions (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),

  -- Workflow status (same vocabulary the old maine-forms dashboard used).
  status text not null default 'new'
    check (status in ('new','reviewed','shortlisted','hired')),

  -- Personal
  full_name text not null,
  first_name text,
  last_name text,
  email text,
  phone text,
  date_of_birth date,
  nationality text,
  current_address text,
  instagram text,

  -- Professional
  position_applied text,
  current_position text,
  experience_years text,
  salary_expectation text,

  -- Documents the Hiring Form collects going forward: CV + Photo only.
  -- Same shape the People app already renders for staff:
  --   [{ label, file_id, file_name, web_view_link }]
  -- For CV/Photo stored in Supabase Storage, file_id = storage path and
  -- web_view_link = public URL.
  documents jsonb not null default '[]'::jsonb,

  -- Everything else (UAE status, languages, references, chef questions,
  -- legacy passport/eid URLs from the migrated rows, etc.) lives here so the
  -- Responses view can show the full application without a wide schema.
  data jsonb not null default '{}'::jsonb,

  updated_at timestamptz
);

alter table public.hiring_submissions enable row level security;
revoke all on table public.hiring_submissions from public, anon, authenticated;

create index if not exists hiring_submissions_created_at_idx
  on public.hiring_submissions (created_at desc);
create index if not exists hiring_submissions_status_idx
  on public.hiring_submissions (status);

-- ── Config (single row, id = true) ──────────────────────────────────────────
create table if not exists public.hiring_form_config (
  id boolean primary key default true,
  config jsonb not null,
  updated_at timestamptz not null default now(),
  constraint hiring_form_config_singleton check (id = true)
);

alter table public.hiring_form_config enable row level security;
revoke all on table public.hiring_form_config from public, anon, authenticated;

-- Seed the hiring form definition. Documents = CV + Photo only (no passport,
-- no Emirates ID). Text fields mirror the public application form.
insert into public.hiring_form_config (id, config)
values (
  true,
  '{"textFields":[{"name":"fullName","label":"Full name","type":"text","required":true,"autoComplete":"name"},{"name":"email","label":"Email","type":"email","required":true,"autoComplete":"email"},{"name":"phone","label":"Phone number","type":"phone","required":true,"help":"Select your country code, then enter your number."},{"name":"dateOfBirth","label":"Date of birth","type":"date","required":true},{"name":"nationality","label":"Nationality","type":"text","required":true,"autoComplete":"country-name"},{"name":"positionApplied","label":"Position applied for","type":"text","required":true},{"name":"experienceYears","label":"Years of experience","type":"text","required":false},{"name":"salaryExpectation","label":"Salary expectation (AED/month)","type":"text","required":false}],"documents":[{"field":"profilePhoto","label":"Profile Photo","required":true,"help":"A clear, recent photo of your face."},{"field":"cv","label":"CV / Resume","required":true,"help":"PDF preferred."}],"naming":{"folderPattern":"{name}","filePattern":"{label}_{name}_{date}"}}'::jsonb
)
on conflict (id) do nothing;
