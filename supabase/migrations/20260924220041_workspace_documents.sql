-- Workspace copies of the board, directory, and related records.
-- The app used to keep these in each browser's localStorage.

alter table public.users
  add column avatar text;

alter table public.users
  add constraint users_avatar_size check (
    avatar is null
    or char_length(avatar) <= 3500000
  );

grant update (avatar) on table public.users to authenticated;

create table public.workspace_documents (
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  doc_key text not null,
  payload text not null,
  updated_at timestamptz not null default now(),
  primary key (workspace_id, doc_key),
  constraint workspace_documents_key_allowed check (
    doc_key in (
      'people.staff-directory',
      'people.outsourced',
      'people.promotions',
      'people.hiring',
      'people.board-labels',
      'people.event-board-labels',
      'people.card-labels',
      'people.event-card-labels',
      'people.board-order',
      'people.event-board-order',
      'people.staff-placements',
      'people.event-placements',
      'people.directory-lookups',
      'people.events',
      'people.event-board',
      'people.locations',
      'people.location-board',
      'people.payroll-view'
    )
  ),
  constraint workspace_documents_payload_size check (
    char_length(payload) between 1 and 12000000
  )
);

alter table public.workspace_documents enable row level security;

revoke all on table public.workspace_documents from public, anon, authenticated;

create policy "members can read workspace documents"
  on public.workspace_documents
  for select
  to authenticated
  using (workspace_id = (select private.actor_workspace()));

create policy "members can insert workspace documents"
  on public.workspace_documents
  for insert
  to authenticated
  with check (workspace_id = (select private.actor_workspace()));

create policy "members can update workspace documents"
  on public.workspace_documents
  for update
  to authenticated
  using (workspace_id = (select private.actor_workspace()))
  with check (workspace_id = (select private.actor_workspace()));

grant select, insert, update on table public.workspace_documents to authenticated;

create or replace function private.touch_workspace_document()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

revoke all on function private.touch_workspace_document() from public, anon, authenticated;

create trigger workspace_documents_touch
  before update on public.workspace_documents
  for each row
  execute function private.touch_workspace_document();

do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'workspace_documents'
  ) then
    alter publication supabase_realtime add table public.workspace_documents;
  end if;
end;
$$;
