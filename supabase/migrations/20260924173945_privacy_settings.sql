alter table public.users
  add column is_owner boolean not null default false;

update public.users
set is_owner = true
where id = (
  select id
  from public.users
  order by created_at asc, id asc
  limit 1
);

create or replace function private.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  account_name text;
  owner_exists boolean;
begin
  account_name := nullif(btrim(new.raw_user_meta_data ->> 'name'), '');

  if account_name is null then
    account_name := nullif(split_part(coalesce(new.email, ''), '@', 1), '');
  end if;

  if account_name is null then
    account_name := 'Account';
  end if;

  select exists (select 1 from public.users where is_owner)
  into owner_exists;

  insert into public.users (id, email, name, is_owner)
  values (new.id, new.email, account_name, not owner_exists);

  return new;
end;
$$;

create table private.privacy_secret (
  id smallint primary key default 1,
  password_hash text,
  password_enabled boolean not null default true,
  updated_at timestamptz not null default now(),
  constraint privacy_secret_singleton check (id = 1)
);

alter table private.privacy_secret enable row level security;

revoke all on table private.privacy_secret from public, anon, authenticated;

insert into private.privacy_secret (id, password_hash, password_enabled)
values (1, extensions.crypt('password', extensions.gen_salt('bf')), true);

create table public.dashboard_visibility (
  id smallint primary key default 1,
  show_hiring boolean not null default true,
  show_promotions boolean not null default true,
  hidden_salary_positions text[] not null default '{}',
  protected_pages text[] not null default '{}',
  updated_at timestamptz not null default now(),
  constraint dashboard_visibility_singleton check (id = 1)
);

alter table public.dashboard_visibility enable row level security;

revoke all on table public.dashboard_visibility from public, anon, authenticated;
grant select on table public.dashboard_visibility to authenticated;

create policy "signed in users can read dashboard visibility"
  on public.dashboard_visibility
  for select
  to authenticated
  using (true);

insert into public.dashboard_visibility (id) values (1);

create or replace function private.current_user_is_owner()
returns boolean
language sql
security definer
set search_path = ''
stable
as $$
  select exists (
    select 1
    from public.users
    where id = (select auth.uid())
      and is_owner
  );
$$;

create or replace function private.privacy_password_ok(candidate text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  secret private.privacy_secret%rowtype;
begin
  select * into secret from private.privacy_secret where id = 1;

  if not found or not secret.password_enabled or secret.password_hash is null then
    return true;
  end if;

  if candidate is null or candidate = '' then
    return false;
  end if;

  return secret.password_hash = extensions.crypt(candidate, secret.password_hash);
end;
$$;

create or replace function private.privacy_snapshot()
returns jsonb
language plpgsql
security definer
set search_path = ''
stable
as $$
declare
  secret private.privacy_secret%rowtype;
  board public.dashboard_visibility%rowtype;
begin
  select * into secret from private.privacy_secret where id = 1;
  select * into board from public.dashboard_visibility where id = 1;

  return jsonb_build_object(
    'passwordEnabled', coalesce(secret.password_enabled, false) and secret.password_hash is not null,
    'stamp', coalesce(secret.updated_at, now()),
    'isOwner', private.current_user_is_owner(),
    'showHiring', coalesce(board.show_hiring, true),
    'showPromotions', coalesce(board.show_promotions, true),
    'hiddenSalaryPositions', coalesce(to_jsonb(board.hidden_salary_positions), '[]'::jsonb),
    'protectedPages', coalesce(to_jsonb(board.protected_pages), '[]'::jsonb)
  );
end;
$$;

create or replace function private.require_owner()
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not private.current_user_is_owner() then
    raise exception 'Only the account owner can change this password';
  end if;
end;
$$;

create or replace function private.allowed_privacy_pages()
returns text[]
language sql
immutable
as $$
  select array[
    '/',
    '/staff',
    '/staff/outsourced',
    '/staff/hiring',
    '/staff/promotions',
    '/schedule',
    '/events',
    '/settings',
    '/profile'
  ];
$$;

create or replace function private.save_dashboard_visibility(
  candidate text,
  show_hiring boolean,
  show_promotions boolean,
  hidden_salary_positions text[]
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  cleaned text[];
begin
  if not private.privacy_password_ok(candidate) then
    raise exception 'Incorrect password';
  end if;

  select coalesce(array_agg(distinct item), '{}')
  into cleaned
  from (
    select lower(btrim(item)) as item
    from unnest(coalesce(hidden_salary_positions, '{}')) as item
    where char_length(btrim(item)) > 0
      and char_length(btrim(item)) <= 80
    limit 200
  ) as names;

  update public.dashboard_visibility
  set
    show_hiring = save_dashboard_visibility.show_hiring,
    show_promotions = save_dashboard_visibility.show_promotions,
    hidden_salary_positions = cleaned,
    updated_at = now()
  where id = 1;

  return private.privacy_snapshot();
end;
$$;

create or replace function private.set_privacy_password(next_password text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.require_owner();

  if next_password is null or btrim(next_password) = '' then
    raise exception 'Enter a password';
  end if;

  if char_length(next_password) > 128 then
    raise exception 'Password is too long';
  end if;

  update private.privacy_secret
  set
    password_hash = extensions.crypt(next_password, extensions.gen_salt('bf')),
    password_enabled = true,
    updated_at = now()
  where id = 1;

  return private.privacy_snapshot();
end;
$$;

create or replace function private.set_privacy_password_enabled(enabled boolean)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  secret private.privacy_secret%rowtype;
begin
  perform private.require_owner();

  select * into secret from private.privacy_secret where id = 1;

  if enabled and secret.password_hash is null then
    raise exception 'Set a password before turning protection on';
  end if;

  update private.privacy_secret
  set
    password_enabled = enabled,
    updated_at = now()
  where id = 1;

  return private.privacy_snapshot();
end;
$$;

create or replace function private.set_protected_pages(pages text[])
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  cleaned text[];
begin
  perform private.require_owner();

  if exists (
    select 1
    from unnest(coalesce(pages, '{}')) as page
    where page <> all (private.allowed_privacy_pages())
  ) then
    raise exception 'Unknown page';
  end if;

  select coalesce(array_agg(distinct page), '{}')
  into cleaned
  from unnest(coalesce(pages, '{}')) as page
  where page = any (private.allowed_privacy_pages());

  update public.dashboard_visibility
  set
    protected_pages = cleaned,
    updated_at = now()
  where id = 1;

  return private.privacy_snapshot();
end;
$$;

revoke all on function private.current_user_is_owner() from public, anon, authenticated;
revoke all on function private.privacy_password_ok(text) from public, anon, authenticated;
revoke all on function private.privacy_snapshot() from public, anon, authenticated;
revoke all on function private.require_owner() from public, anon, authenticated;
revoke all on function private.allowed_privacy_pages() from public, anon, authenticated;
revoke all on function private.save_dashboard_visibility(text, boolean, boolean, text[]) from public, anon, authenticated;
revoke all on function private.set_privacy_password(text) from public, anon, authenticated;
revoke all on function private.set_privacy_password_enabled(boolean) from public, anon, authenticated;
revoke all on function private.set_protected_pages(text[]) from public, anon, authenticated;

grant execute on function private.privacy_password_ok(text) to authenticated;
grant execute on function private.privacy_snapshot() to authenticated;
grant execute on function private.save_dashboard_visibility(text, boolean, boolean, text[]) to authenticated;
grant execute on function private.set_privacy_password(text) to authenticated;
grant execute on function private.set_privacy_password_enabled(boolean) to authenticated;
grant execute on function private.set_protected_pages(text[]) to authenticated;

grant usage on schema private to authenticated;

create or replace function public.privacy_status()
returns jsonb
language sql
security invoker
set search_path = ''
stable
as $$
  select private.privacy_snapshot();
$$;

create or replace function public.privacy_unlock(candidate text)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  ok boolean;
begin
  ok := private.privacy_password_ok(candidate);
  return private.privacy_snapshot() || jsonb_build_object('ok', ok);
end;
$$;

create or replace function public.save_dashboard_visibility(
  candidate text,
  show_hiring boolean,
  show_promotions boolean,
  hidden_salary_positions text[]
)
returns jsonb
language sql
security invoker
set search_path = ''
as $$
  select private.save_dashboard_visibility(
    candidate,
    show_hiring,
    show_promotions,
    hidden_salary_positions
  );
$$;

create or replace function public.set_privacy_password(next_password text)
returns jsonb
language sql
security invoker
set search_path = ''
as $$
  select private.set_privacy_password(next_password);
$$;

create or replace function public.set_privacy_password_enabled(enabled boolean)
returns jsonb
language sql
security invoker
set search_path = ''
as $$
  select private.set_privacy_password_enabled(enabled);
$$;

create or replace function public.set_protected_pages(pages text[])
returns jsonb
language sql
security invoker
set search_path = ''
as $$
  select private.set_protected_pages(pages);
$$;

revoke all on function public.privacy_status() from public, anon;
revoke all on function public.privacy_unlock(text) from public, anon;
revoke all on function public.save_dashboard_visibility(text, boolean, boolean, text[]) from public, anon;
revoke all on function public.set_privacy_password(text) from public, anon;
revoke all on function public.set_privacy_password_enabled(boolean) from public, anon;
revoke all on function public.set_protected_pages(text[]) from public, anon;

grant execute on function public.privacy_status() to authenticated;
grant execute on function public.privacy_unlock(text) to authenticated;
grant execute on function public.save_dashboard_visibility(text, boolean, boolean, text[]) to authenticated;
grant execute on function public.set_privacy_password(text) to authenticated;
grant execute on function public.set_privacy_password_enabled(boolean) to authenticated;
grant execute on function public.set_protected_pages(text[]) to authenticated;
