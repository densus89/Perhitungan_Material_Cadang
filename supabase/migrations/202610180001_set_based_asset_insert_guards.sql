-- Validate imported rows once per INSERT statement. The former row trigger
-- selected and locked the same parent run and sheet for every row, causing a
-- 1,000-row hosted insert to hit PostgreSQL's statement timeout.
create function private.guard_asset_insert_statement() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  -- Lock every referenced run exactly once and in deterministic order. This
  -- keeps finalization mutually exclusive with the complete insert statement.
  perform 1 from public.asset_import_runs r
    join (select distinct import_run_id from new_rows) n on n.import_run_id=r.id
    order by r.id for update of r;

  -- Composite foreign keys independently enforce run/unit/version ownership;
  -- this guard additionally enforces the mutable PROCESSING lifecycle state.
  if exists(
    select 1 from new_rows n
    left join public.asset_import_runs r on r.id=n.import_run_id
    where r.id is null or r.status<>'PROCESSING'
  ) then
    raise exception 'Only processing batch records are writable' using errcode='22023';
  end if;

  -- Snapshot rows must use a sheet from the same import session and unit. The
  -- sheet/unit join plus the run composite FK closes cross-session injection.
  if tg_table_name='asset_snapshot_rows' and exists(
    select 1 from new_rows n
    join public.asset_import_runs r on r.id=n.import_run_id
    left join public.import_sheets s on s.id=n.import_sheet_id and s.unit_induk_id=n.unit_induk_id
    where s.import_session_id is distinct from r.import_session_id
  ) then
    raise exception 'Sheet does not belong to run session' using errcode='22023';
  end if;

  -- Approval remains append-only through the dedicated review workflow.
  if tg_table_name='asset_valuations' and exists(select 1 from new_rows where approved_by is not null) then
    raise exception 'Approval is appended during pending review only' using errcode='22023';
  end if;
  return null;
end;
$$;

drop trigger guard_asset_rows on public.asset_snapshot_rows;
drop trigger guard_asset_valuations on public.asset_valuations;

-- Updates/deletes retain the existing row-level freeze and approval checks.
create trigger guard_asset_rows before update or delete on public.asset_snapshot_rows
  for each row execute function private.guard_asset_batch();
create trigger guard_asset_valuations before update or delete on public.asset_valuations
  for each row execute function private.guard_asset_batch();

create trigger guard_asset_rows_insert after insert on public.asset_snapshot_rows
  referencing new table as new_rows for each statement execute function private.guard_asset_insert_statement();
create trigger guard_asset_valuations_insert after insert on public.asset_valuations
  referencing new table as new_rows for each statement execute function private.guard_asset_insert_statement();

revoke all on function private.guard_asset_insert_statement() from public,anon,authenticated,service_role;
