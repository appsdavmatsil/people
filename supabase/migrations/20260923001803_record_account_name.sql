create schema if not exists private;

create table public.users (
  id uuid primary key references auth.users (id) on delete cascade,
  email text,
  name text not null,
  created_at timestamptz not null default now(),
  constraint users_name_not_blank check (char_length(btrim(name)) > 0)
);

alter table public.users enable row level security;

revoke all on table public.users from anon, authenticated;
grant select on table public.users to authenticated;
grant update (name) on table public.users to authenticated;

create policy "users can read their own row"
  on public.users
  for select
  to authenticated
  using ((select auth.uid()) = id);

create policy "users can update their own name"
  on public.users
  for update
  to authenticated
  using ((select auth.uid()) = id)
  with check ((select auth.uid()) = id);

create or replace function private.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  account_name text;
begin
  account_name := nullif(btrim(new.raw_user_meta_data ->> 'name'), '');

  if account_name is null then
    account_name := nullif(split_part(coalesce(new.email, ''), '@', 1), '');
  end if;

  if account_name is null then
    account_name := 'Account';
  end if;

  insert into public.users (id, email, name)
  values (new.id, new.email, account_name);

  return new;
end;
$$;

revoke all on function private.handle_new_user() from public, anon, authenticated;
grant usage on schema private to supabase_auth_admin;
grant execute on function private.handle_new_user() to supabase_auth_admin;

create trigger on_auth_user_created
  after insert on auth.users
  for each row
  execute function private.handle_new_user();
