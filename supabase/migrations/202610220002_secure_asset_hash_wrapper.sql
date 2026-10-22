-- The compatibility wrapper is intentionally callable by service_role, while
-- its split helpers remain private. Execute it as its owner so the wrapper can
-- call those helpers without widening their direct grants.
create or replace function private.asset_run_hashes(p_run_id uuid)
returns table(rows_hash text, valuations_hash text)
language sql
stable
security definer
set search_path = ''
as $$
  select
    private.asset_run_rows_hash(p_run_id),
    private.asset_run_valuations_hash(p_run_id)
$$;

revoke all on function private.asset_run_hashes(uuid)
  from public, anon, authenticated;
grant execute on function private.asset_run_hashes(uuid)
  to service_role;
