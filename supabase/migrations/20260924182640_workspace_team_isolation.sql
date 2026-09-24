create table public.workspaces (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now()
);

alter table public.workspaces enable row level security;

revoke all on table public.workspaces from public, anon, authenticated;

alter table public.users
  add column workspace_id uuid references public.workspaces (id);

create index users_workspace_id_idx on public.users (workspace_id);

alter table private.privacy_secret
  add column workspace_id uuid;

alter table public.dashboard_visibility
  add column workspace_id uuid;

create table private.pending_invites (
  email text primary key,
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  invited_by uuid not null references public.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  constraint pending_invites_email_shape check (position('@' in email) > 1)
);

alter table private.pending_invites enable row level security;

revoke all on table private.pending_invites from public, anon, authenticated;

do $$
declare
  owner_id uuid;
  owner_workspace uuid := gen_random_uuid();
begin
  insert into public.workspaces (id) values (owner_workspace);

  select u.id
  into owner_id
  from public.users u
  where u.is_owner
  order by u.created_at asc, u.id asc
  limit 1;

  if owner_id is null then
    select u.id
    into owner_id
    from public.users u
    order by u.created_at asc, u.id asc
    limit 1;

    if owner_id is not null then
      update public.users
      set is_owner = true
      where id = owner_id;
    end if;
  end if;

  if owner_id is not null then
    update public.users
    set workspace_id = owner_workspace
    where id = owner_id;

    update public.users as member
    set workspace_id = owner_workspace
    from auth.users as account
    where account.id = member.id
      and member.id is distinct from owner_id
      and coalesce(account.raw_user_meta_data ? 'must_change_password', false);
  end if;

  update private.privacy_secret
  set workspace_id = owner_workspace
  where id = 1;

  update public.dashboard_visibility
  set workspace_id = owner_workspace
  where id = 1;
end;
$$;

alter table private.privacy_secret
  drop constraint privacy_secret_singleton;

alter table private.privacy_secret
  drop constraint privacy_secret_pkey;

alter table private.privacy_secret
  drop column id;

alter table private.privacy_secret
  alter column workspace_id set not null;

alter table private.privacy_secret
  add primary key (workspace_id);

alter table private.privacy_secret
  add constraint privacy_secret_workspace_fkey
  foreign key (workspace_id) references public.workspaces (id) on delete cascade;

alter table public.dashboard_visibility
  drop constraint dashboard_visibility_singleton;

alter table public.dashboard_visibility
  drop constraint dashboard_visibility_pkey;

alter table public.dashboard_visibility
  drop column id;

alter table public.dashboard_visibility
  alter column workspace_id set not null;

alter table public.dashboard_visibility
  add primary key (workspace_id);

alter table public.dashboard_visibility
  add constraint dashboard_visibility_workspace_fkey
  foreign key (workspace_id) references public.workspaces (id) on delete cascade;

create or replace function private.create_workspace()
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  workspace uuid := gen_random_uuid();
begin
  insert into public.workspaces (id) values (workspace);

  insert into private.privacy_secret (workspace_id, password_hash, password_enabled)
  values (workspace, extensions.crypt('password', extensions.gen_salt('bf')), true);

  insert into public.dashboard_visibility (
    workspace_id,
    show_hiring,
    show_promotions,
    hidden_salary_positions,
    protected_pages,
    protected_features
  )
  values (
    workspace,
    true,
    true,
    '{}',
    '{}',
    '{board-visibility,location-arrange}'
  );

  return workspace;
end;
$$;

do $$
declare
  stray uuid;
  stray_workspace uuid;
begin
  for stray in
    select id
    from public.users
    where workspace_id is null
  loop
    stray_workspace := private.create_workspace();

    update public.users
    set
      workspace_id = stray_workspace,
      is_owner = true
    where id = stray;
  end loop;
end;
$$;

alter table public.users
  alter column workspace_id set not null;

create or replace function private.actor_workspace()
returns uuid
language sql
security definer
set search_path = ''
stable
as $$
  select workspace_id
  from public.users
  where id = (select auth.uid());
$$;

create or replace function private.member_in_actor_workspace(member_id uuid)
returns boolean
language sql
security definer
set search_path = ''
stable
as $$
  select exists (
    select 1
    from public.users as actor
    join public.users as member on member.workspace_id = actor.workspace_id
    where actor.id = (select auth.uid())
      and member.id = member_id
  );
$$;

create or replace function private.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  account_name text;
  invited_workspace uuid;
  workspace uuid;
  invited boolean;
begin
  account_name := nullif(btrim(new.raw_user_meta_data ->> 'name'), '');

  if account_name is null then
    account_name := nullif(split_part(coalesce(new.email, ''), '@', 1), '');
  end if;

  if account_name is null then
    account_name := 'Account';
  end if;

  select workspace_id
  into invited_workspace
  from private.pending_invites
  where email = lower(coalesce(new.email, ''))
  for update;

  invited := invited_workspace is not null
    and coalesce(new.raw_user_meta_data ->> 'must_change_password', '') = 'true';

  if invited_workspace is not null and not invited then
    delete from private.pending_invites
    where email = lower(coalesce(new.email, ''));
  end if;

  if invited then
    insert into public.users (id, email, name, is_owner, workspace_id)
    values (new.id, new.email, account_name, false, invited_workspace);

    delete from private.pending_invites
    where email = lower(coalesce(new.email, ''));

    return new;
  end if;

  workspace := private.create_workspace();

  insert into public.users (id, email, name, is_owner, workspace_id)
  values (new.id, new.email, account_name, true, workspace);

  return new;
end;
$$;

drop policy if exists "owner can read team" on public.users;

create policy "owner can read workspace team"
  on public.users
  for select
  to authenticated
  using (
    private.current_user_is_owner()
    and workspace_id = private.actor_workspace()
  );

drop policy if exists "owner can read access log" on public.access_log;

create policy "owner can read workspace access log"
  on public.access_log
  for select
  to authenticated
  using (
    private.current_user_is_owner()
    and exists (
      select 1
      from public.users as member
      where member.id = access_log.user_id
        and member.workspace_id = private.actor_workspace()
    )
  );

drop policy if exists "signed in users can read dashboard visibility" on public.dashboard_visibility;

create policy "members can read their workspace visibility"
  on public.dashboard_visibility
  for select
  to authenticated
  using (workspace_id = private.actor_workspace());

create or replace function private.list_team()
returns jsonb
language plpgsql
security definer
set search_path = ''
stable
as $$
declare
  actor uuid := (select auth.uid());
  workspace uuid;
begin
  if actor is null then
    return '[]'::jsonb;
  end if;

  workspace := private.actor_workspace();

  if workspace is null then
    return '[]'::jsonb;
  end if;

  return coalesce(
    (
      select jsonb_agg(
        private.team_member_json(u.id)
        order by u.is_owner desc, u.name
      )
      from public.users u
      where u.workspace_id = workspace
        and (
          private.current_user_is_owner()
          or u.id = actor
        )
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

  if not private.member_in_actor_workspace(member_id) then
    raise exception 'That team member was not found.';
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

  if not private.member_in_actor_workspace(target) then
    raise exception 'That team member was not found.';
  end if;

  if target is distinct from actor and not private.current_user_is_owner() then
    raise exception 'Only the account owner can record this';
  end if;

  if kind not in ('access', 'edit') or cleaned = '' then
    raise exception 'That activity could not be recorded';
  end if;

  insert into public.access_log (id, user_id, kind, summary)
  values (coalesce(entry_id, gen_random_uuid()), target, kind, cleaned)
  on conflict (id) do nothing;
end;
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

  if not private.member_in_actor_workspace(member_id) then
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

  if not private.member_in_actor_workspace(member_id) then
    raise exception 'That team member was not found.';
  end if;

  if member_id = actor or exists (
    select 1
    from public.users
    where id = member_id
      and is_owner
      and workspace_id = private.actor_workspace()
  ) then
    raise exception 'The account owner cannot be blocked.';
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

  if not private.member_in_actor_workspace(member_id) then
    raise exception 'That team member was not found.';
  end if;

  if member_id = actor or exists (
    select 1
    from public.users
    where id = member_id
      and is_owner
      and workspace_id = private.actor_workspace()
  ) then
    raise exception 'The account owner cannot be removed.';
  end if;

  delete from auth.users
  where id = member_id;
end;
$$;

create or replace function private.prepare_team_invite(invite_email text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid;
  workspace uuid;
  cleaned text := nullif(lower(btrim(coalesce(invite_email, ''))), '');
begin
  actor := private.assert_team_owner();
  workspace := private.actor_workspace();

  if workspace is null then
    raise exception 'Sign in again, then try this.';
  end if;

  if cleaned is null or position('@' in cleaned) < 2 then
    raise exception 'Enter an email address.';
  end if;

  if exists (select 1 from public.users where lower(email) = cleaned)
     or exists (select 1 from auth.users where lower(email) = cleaned) then
    raise exception 'An account with that email already exists.';
  end if;

  if exists (
    select 1
    from private.pending_invites
    where email = cleaned
      and workspace_id is distinct from workspace
  ) then
    raise exception 'An account with that email already exists.';
  end if;

  insert into private.pending_invites (email, workspace_id, invited_by)
  values (cleaned, workspace, actor)
  on conflict (email) do update
  set
    workspace_id = excluded.workspace_id,
    invited_by = excluded.invited_by,
    created_at = now();
end;
$$;

create or replace function private.cancel_team_invite(invite_email text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid;
  cleaned text := nullif(lower(btrim(coalesce(invite_email, ''))), '');
begin
  actor := private.assert_team_owner();

  if cleaned is null then
    return;
  end if;

  delete from private.pending_invites
  where email = cleaned
    and invited_by = actor;
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
  workspace uuid := private.actor_workspace();
  secret private.privacy_secret%rowtype;
  board public.dashboard_visibility%rowtype;
begin
  if workspace is not null then
    select * into secret from private.privacy_secret where workspace_id = workspace;
    select * into board from public.dashboard_visibility where workspace_id = workspace;
  end if;

  return jsonb_build_object(
    'passwordEnabled', coalesce(secret.password_enabled, false) and secret.password_hash is not null,
    'stamp', coalesce(secret.updated_at, now()),
    'isOwner', private.current_user_is_owner(),
    'showHiring', coalesce(board.show_hiring, true),
    'showPromotions', coalesce(board.show_promotions, true),
    'hiddenSalaryPositions', coalesce(to_jsonb(board.hidden_salary_positions), '[]'::jsonb),
    'protectedPages', coalesce(to_jsonb(board.protected_pages), '[]'::jsonb),
    'protectedFeatures', coalesce(to_jsonb(board.protected_features), '[]'::jsonb)
  );
end;
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
  board public.dashboard_visibility%rowtype;
  workspace uuid := private.actor_workspace();
begin
  select * into board
  from public.dashboard_visibility
  where workspace_id = workspace;

  if 'board-visibility' = any (coalesce(board.protected_features, '{}'))
     and not private.privacy_password_ok(candidate) then
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
  where workspace_id = workspace;

  return private.privacy_snapshot();
end;
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
  select * into secret
  from private.privacy_secret
  where workspace_id = private.actor_workspace();

  if not found or not secret.password_enabled or secret.password_hash is null then
    return true;
  end if;

  if candidate is null or candidate = '' then
    return false;
  end if;

  return secret.password_hash = extensions.crypt(candidate, secret.password_hash);
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
  where workspace_id = private.actor_workspace();

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

  select * into secret
  from private.privacy_secret
  where workspace_id = private.actor_workspace();

  if enabled and secret.password_hash is null then
    raise exception 'Set a password before turning protection on';
  end if;

  update private.privacy_secret
  set
    password_enabled = enabled,
    updated_at = now()
  where workspace_id = private.actor_workspace();

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
  where workspace_id = private.actor_workspace();

  return private.privacy_snapshot();
end;
$$;

create or replace function private.set_protected_features(features text[])
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
    from unnest(coalesce(features, '{}')) as feature
    where feature <> all (private.allowed_privacy_features())
  ) then
    raise exception 'Unknown feature';
  end if;

  select coalesce(array_agg(distinct feature), '{}')
  into cleaned
  from unnest(coalesce(features, '{}')) as feature
  where feature = any (private.allowed_privacy_features());

  update public.dashboard_visibility
  set
    protected_features = cleaned,
    updated_at = now()
  where workspace_id = private.actor_workspace();

  return private.privacy_snapshot();
end;
$$;

create or replace function public.prepare_team_invite(invite_email text)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
begin
  perform private.prepare_team_invite(invite_email);
end;
$$;

create or replace function public.cancel_team_invite(invite_email text)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
begin
  perform private.cancel_team_invite(invite_email);
end;
$$;

revoke all on function private.create_workspace() from public, anon, authenticated;
revoke all on function private.actor_workspace() from public, anon, authenticated;
revoke all on function private.member_in_actor_workspace(uuid) from public, anon, authenticated;
revoke all on function private.prepare_team_invite(text) from public, anon, authenticated;
revoke all on function private.cancel_team_invite(text) from public, anon, authenticated;
revoke all on function public.prepare_team_invite(text) from public, anon;
revoke all on function public.cancel_team_invite(text) from public, anon;

-- Needed by RLS policies evaluated as the authenticated invoker.
grant execute on function private.actor_workspace() to authenticated;
grant execute on function private.current_user_is_owner() to authenticated;
grant execute on function private.prepare_team_invite(text) to authenticated;
grant execute on function private.cancel_team_invite(text) to authenticated;
grant execute on function public.prepare_team_invite(text) to authenticated;
grant execute on function public.cancel_team_invite(text) to authenticated;
