alter table public.dashboard_visibility
  add column protected_features text[] not null default '{board-visibility,location-arrange}';

create or replace function private.allowed_privacy_features()
returns text[]
language sql
immutable
set search_path = ''
as $$
  select array['board-visibility', 'location-arrange'];
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
begin
  select * into board from public.dashboard_visibility where id = 1;

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
  where id = 1;

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
  where id = 1;

  return private.privacy_snapshot();
end;
$$;

revoke all on function private.allowed_privacy_features() from public, anon, authenticated;
revoke all on function private.set_protected_features(text[]) from public, anon, authenticated;

grant execute on function private.set_protected_features(text[]) to authenticated;

create or replace function public.set_protected_features(features text[])
returns jsonb
language sql
security invoker
set search_path = ''
as $$
  select private.set_protected_features(features);
$$;

revoke all on function public.set_protected_features(text[]) from public, anon;
grant execute on function public.set_protected_features(text[]) to authenticated;
