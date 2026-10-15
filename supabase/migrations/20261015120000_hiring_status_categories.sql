-- Replace the maine-forms workflow statuses with the People hiring categories.
alter table public.hiring_submissions
  drop constraint if exists hiring_submissions_status_check;

update public.hiring_submissions
set status = case status
  when 'reviewed' then 'stand_by'
  when 'shortlisted' then 'need_interview'
  when 'hired' then 'selected'
  else status
end
where status in ('reviewed', 'shortlisted', 'hired');

alter table public.hiring_submissions
  add constraint hiring_submissions_status_check
  check (status in ('new', 'not_selected', 'stand_by', 'need_interview', 'interviewed', 'selected'));
