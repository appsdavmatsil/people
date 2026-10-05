-- Self-service edits of staff-details submissions.
--
-- Each submission gets a unique 6-digit edit code that HR hands to the
-- employee (shown on the Missing Responses page). To edit, the employee enters
-- their email + code and answers a security question drawn from their own
-- earlier answers. Failed attempts are counted per submission and lock further
-- tries for a while to stop guessing. Server-only, like the rest of the table.

alter table public.staff_intake_submissions
  add column if not exists edit_code text,
  add column if not exists updated_at timestamptz,
  add column if not exists edit_failed_attempts integer not null default 0,
  add column if not exists edit_locked_until timestamptz;

-- Returns a 6-digit code not used by any submission yet.
create or replace function public.staff_intake_new_edit_code()
returns text
language plpgsql
volatile
set search_path = ''
as $$
declare
  candidate text;
begin
  loop
    candidate := lpad(floor(random() * 1000000)::int::text, 6, '0');
    exit when not exists (
      select 1 from public.staff_intake_submissions where edit_code = candidate
    );
  end loop;
  return candidate;
end;
$$;

revoke all on function public.staff_intake_new_edit_code() from public, anon, authenticated;

-- Give existing submissions a code, one row at a time so codes stay unique.
do $$
declare
  row_id uuid;
begin
  for row_id in
    select id from public.staff_intake_submissions where edit_code is null order by created_at
  loop
    update public.staff_intake_submissions
      set edit_code = public.staff_intake_new_edit_code()
      where id = row_id;
  end loop;
end;
$$;

alter table public.staff_intake_submissions
  alter column edit_code set default public.staff_intake_new_edit_code();

create unique index if not exists staff_intake_submissions_edit_code_key
  on public.staff_intake_submissions (edit_code);

create index if not exists staff_intake_submissions_email_idx
  on public.staff_intake_submissions (lower(email));
