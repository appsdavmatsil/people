create or replace function private.allowed_privacy_pages()
returns text[]
language sql
immutable
set search_path = ''
as $$
  select array[
    '/dashboard',
    '/staffdirectory',
    '/staffdirectory/outsourced',
    '/staffdirectory/hiring',
    '/staffdirectory/promotions',
    '/staffdeployment',
    '/events',
    '/settings',
    '/profile'
  ];
$$;

update public.dashboard_visibility
set protected_pages = (
  select coalesce(array_agg(distinct mapped), '{}')
  from (
    select case page
      when '/' then '/dashboard'
      when '/staff' then '/staffdirectory'
      when '/staff/outsourced' then '/staffdirectory/outsourced'
      when '/staff/hiring' then '/staffdirectory/hiring'
      when '/staff/promotions' then '/staffdirectory/promotions'
      when '/schedule' then '/staffdeployment'
      else page
    end as mapped
    from unnest(protected_pages) as page
  ) renamed
);
