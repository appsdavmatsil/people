create table public.access_log (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users (id) on delete cascade,
  occurred_at timestamptz not null default now(),
  kind text not null,
  summary text not null,
  constraint access_log_kind_check check (kind in ('access', 'edit')),
  constraint access_log_summary_not_blank check (char_length(btrim(summary)) > 0),
  constraint access_log_summary_length check (char_length(summary) <= 240)
);

create index access_log_user_occurred_idx
  on public.access_log (user_id, occurred_at desc);

alter table public.access_log enable row level security;

revoke all on table public.access_log from anon, authenticated;
grant select on table public.access_log to authenticated;

create policy "owner can read access log"
  on public.access_log
  for select
  to authenticated
  using (private.current_user_is_owner());

create policy "owner can read team"
  on public.users
  for select
  to authenticated
  using (private.current_user_is_owner());

create or replace function private.team_member_json(member_id uuid)
returns jsonb
language sql
security definer
set search_path = ''
stable
as $$
  select jsonb_build_object(
    'id', u.id,
    'name', u.name,
    'email', coalesce(u.email, a.email, ''),
    'blocked', coalesce(a.banned_until > now(), false),
    'mustChangePassword', coalesce(a.raw_user_meta_data ->> 'must_change_password' = 'true', false),
    'lastSignInAt', a.last_sign_in_at,
    'isSelf', u.id = (select auth.uid()),
    'isOwner', u.is_owner
  )
  from public.users u
  join auth.users a on a.id = u.id
  where u.id = member_id;
$$;

create or replace function private.list_team()
returns jsonb
language plpgsql
security definer
set search_path = ''
stable
as $$
declare
  actor uuid := (select auth.uid());
begin
  if actor is null then
    return '[]'::jsonb;
  end if;

  if private.current_user_is_owner() then
    return coalesce(
      (
        select jsonb_agg(private.team_member_json(u.id) order by u.name)
        from public.users u
      ),
      '[]'::jsonb
    );
  end if;

  return coalesce(
    (
      select jsonb_agg(private.team_member_json(u.id))
      from public.users u
      where u.id = actor
    ),
    '[]'::jsonb
  );
end;
$$;

create or replace function private.list_access_log(member_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
stable
as $$
declare
  actor uuid := (select auth.uid());
begin
  if actor is null then
    return '[]'::jsonb;
  end if;

  if member_id is distinct from actor and not private.current_user_is_owner() then
    raise exception 'Only the account owner can open this access log';
  end if;

  return coalesce(
    (
      select jsonb_agg(
        jsonb_build_object(
          'id', entry.id,
          'occurredAt', entry.occurred_at,
          'kind', entry.kind,
          'summary', entry.summary
        )
        order by entry.occurred_at desc
      )
      from (
        select id, occurred_at, kind, summary
        from public.access_log
        where user_id = member_id
        order by occurred_at desc
        limit 100
      ) as entry
    ),
    '[]'::jsonb
  );
end;
$$;

create or replace function private.record_activity(
  target uuid,
  kind text,
  summary text,
  entry_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid := (select auth.uid());
  cleaned text := left(btrim(summary), 240);
begin
  if actor is null then
    raise exception 'Sign in again, then try this.';
  end if;

  if target is null then
    target := actor;
  end if;

  if target is distinct from actor and not private.current_user_is_owner() then
    raise exception 'Only the account owner can record this';
  end if;

  if kind not in ('access', 'edit') or cleaned = '' then
    raise exception 'That activity could not be recorded';
  end if;

  if not exists (select 1 from public.users where id = target) then
    return;
  end if;

  insert into public.access_log (id, user_id, kind, summary)
  values (coalesce(entry_id, gen_random_uuid()), target, kind, cleaned)
  on conflict (id) do nothing;
end;
$$;

create or replace function private.assert_team_owner()
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid := (select auth.uid());
begin
  if actor is null then
    raise exception 'Sign in again, then try this.';
  end if;

  if not private.current_user_is_owner() then
    raise exception 'Only the account owner can manage team access';
  end if;

  return actor;
end;
$$;

create or replace function private.password_is_strong(candidate text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select candidate is not null
    and char_length(candidate) >= 8
    and candidate ~ '[A-Z]'
    and candidate ~ '[a-z]'
    and candidate ~ '[0-9]'
    and candidate ~ '[^A-Za-z0-9]';
$$;

create or replace function private.update_team_member(
  member_id uuid,
  next_name text,
  next_email text,
  next_password text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  cleaned_name text := nullif(regexp_replace(btrim(coalesce(next_name, '')), '\s+', ' ', 'g'), '');
  cleaned_email text := nullif(lower(btrim(coalesce(next_email, ''))), '');
  cleaned_password text := nullif(next_password, '');
begin
  perform private.assert_team_owner();

  if cleaned_name is null then
    raise exception 'Enter a name.';
  end if;

  if cleaned_email is null or position('@' in cleaned_email) < 2 then
    raise exception 'Enter an email address.';
  end if;

  if cleaned_password is not null and not private.password_is_strong(cleaned_password) then
    raise exception 'Password needs 8 characters, with upper and lower case, a number, and a symbol.';
  end if;

  if not exists (select 1 from public.users where id = member_id) then
    raise exception 'That team member was not found.';
  end if;

  update public.users
  set name = cleaned_name,
      email = cleaned_email
  where id = member_id;

  update auth.users
  set
    email = cleaned_email,
    email_confirmed_at = coalesce(email_confirmed_at, now()),
    raw_user_meta_data = jsonb_set(
      coalesce(raw_user_meta_data, '{}'::jsonb),
      '{name}',
      to_jsonb(cleaned_name),
      true
    ),
    updated_at = now()
  where id = member_id;

  if cleaned_password is not null then
    update auth.users
    set
      encrypted_password = extensions.crypt(cleaned_password, extensions.gen_salt('bf')),
      raw_user_meta_data = jsonb_set(
        coalesce(raw_user_meta_data, '{}'::jsonb),
        '{must_change_password}',
        'true'::jsonb,
        true
      ),
      updated_at = now()
    where id = member_id;

    perform private.record_activity(member_id, 'access', 'Temporary password set', null);
  end if;

  perform private.record_activity(member_id, 'edit', 'Account details updated', null);

  return private.team_member_json(member_id);
exception
  when unique_violation then
    raise exception 'An account with that email already exists.';
end;
$$;

create or replace function private.set_team_access(member_id uuid, blocked boolean)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid;
begin
  actor := private.assert_team_owner();

  if member_id = actor or exists (select 1 from public.users where id = member_id and is_owner) then
    raise exception 'The account owner cannot be blocked.';
  end if;

  if not exists (select 1 from public.users where id = member_id) then
    raise exception 'That team member was not found.';
  end if;

  update auth.users
  set
    banned_until = case when blocked then 'infinity'::timestamptz else null end,
    updated_at = now()
  where id = member_id;

  perform private.record_activity(
    member_id,
    'access',
    case when blocked then 'Access blocked' else 'Access restored' end,
    null
  );

  return private.team_member_json(member_id);
end;
$$;

create or replace function private.remove_team_member(member_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid;
begin
  actor := private.assert_team_owner();

  if member_id = actor or exists (select 1 from public.users where id = member_id and is_owner) then
    raise exception 'The account owner cannot be removed.';
  end if;

  delete from auth.users
  where id = member_id;
end;
$$;

revoke all on function private.team_member_json(uuid) from public, anon, authenticated;
revoke all on function private.list_team() from public, anon, authenticated;
revoke all on function private.list_access_log(uuid) from public, anon, authenticated;
revoke all on function private.record_activity(uuid, text, text, uuid) from public, anon, authenticated;
revoke all on function private.assert_team_owner() from public, anon, authenticated;
revoke all on function private.password_is_strong(text) from public, anon, authenticated;
revoke all on function private.update_team_member(uuid, text, text, text) from public, anon, authenticated;
revoke all on function private.set_team_access(uuid, boolean) from public, anon, authenticated;
revoke all on function private.remove_team_member(uuid) from public, anon, authenticated;

grant execute on function private.list_team() to authenticated;
grant execute on function private.list_access_log(uuid) to authenticated;
grant execute on function private.record_activity(uuid, text, text, uuid) to authenticated;
grant execute on function private.update_team_member(uuid, text, text, text) to authenticated;
grant execute on function private.set_team_access(uuid, boolean) to authenticated;
grant execute on function private.remove_team_member(uuid) to authenticated;

create or replace function public.list_team()
returns jsonb
language sql
security invoker
set search_path = ''
stable
as $$
  select private.list_team();
$$;

create or replace function public.list_access_log(member_id uuid)
returns jsonb
language sql
security invoker
set search_path = ''
stable
as $$
  select private.list_access_log(member_id);
$$;

create or replace function public.record_activity(kind text, summary text, entry_id uuid)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
begin
  perform private.record_activity(null, kind, summary, entry_id);
end;
$$;

create or replace function public.update_team_member(
  member_id uuid,
  next_name text,
  next_email text,
  next_password text
)
returns jsonb
language sql
security invoker
set search_path = ''
as $$
  select private.update_team_member(member_id, next_name, next_email, next_password);
$$;

create or replace function public.set_team_access(member_id uuid, blocked boolean)
returns jsonb
language sql
security invoker
set search_path = ''
as $$
  select private.set_team_access(member_id, blocked);
$$;

create or replace function public.remove_team_member(member_id uuid)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
begin
  perform private.remove_team_member(member_id);
end;
$$;

revoke all on function public.list_team() from public, anon;
revoke all on function public.list_access_log(uuid) from public, anon;
revoke all on function public.record_activity(text, text, uuid) from public, anon;
revoke all on function public.update_team_member(uuid, text, text, text) from public, anon;
revoke all on function public.set_team_access(uuid, boolean) from public, anon;
revoke all on function public.remove_team_member(uuid) from public, anon;

grant execute on function public.list_team() to authenticated;
grant execute on function public.list_access_log(uuid) to authenticated;
grant execute on function public.record_activity(text, text, uuid) to authenticated;
grant execute on function public.update_team_member(uuid, text, text, text) to authenticated;
grant execute on function public.set_team_access(uuid, boolean) to authenticated;
grant execute on function public.remove_team_member(uuid) to authenticated;
