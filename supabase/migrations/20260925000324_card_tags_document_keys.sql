alter table public.workspace_documents
  drop constraint workspace_documents_key_allowed;

alter table public.workspace_documents
  add constraint workspace_documents_key_allowed check (
    doc_key in (
      'people.staff-directory',
      'people.outsourced',
      'people.promotions',
      'people.hiring',
      'people.board-labels',
      'people.event-board-labels',
      'people.card-labels',
      'people.event-card-labels',
      'people.card-tags',
      'people.event-card-tags',
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
  );
