-- RLS policies call these SECURITY DEFINER helpers as the invoking role.
-- Without EXECUTE, updates like saving a profile name fail with:
--   permission denied for function actor_workspace

grant execute on function private.actor_workspace() to authenticated;
grant execute on function private.current_user_is_owner() to authenticated;
