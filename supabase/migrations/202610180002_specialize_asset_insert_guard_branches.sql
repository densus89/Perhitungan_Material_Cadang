-- Transition relations have the row type of the firing table. Keep
-- table-specific column references in lazily compiled PL/pgSQL branches so
-- snapshot inserts never resolve valuation columns (and vice versa).
create or replace function private.guard_asset_insert_statement() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  perform 1 from public.asset_import_runs r
    join (select distinct import_run_id from new_rows) n on n.import_run_id=r.id
    order by r.id for update of r;

  if exists(
    select 1 from new_rows n
    left join public.asset_import_runs r on r.id=n.import_run_id
    where r.id is null or r.status<>'PROCESSING'
  ) then
    raise exception 'Only processing batch records are writable' using errcode='22023';
  end if;

  if tg_table_name='asset_snapshot_rows' then
    if exists(
      select 1 from new_rows n
      join public.asset_import_runs r on r.id=n.import_run_id
      left join public.import_sheets s on s.id=n.import_sheet_id and s.unit_induk_id=n.unit_induk_id
      where s.import_session_id is distinct from r.import_session_id
    ) then
      raise exception 'Sheet does not belong to run session' using errcode='22023';
    end if;
  elsif tg_table_name='asset_valuations' then
    if exists(select 1 from new_rows where approved_by is not null) then
      raise exception 'Approval is appended during pending review only' using errcode='22023';
    end if;
  end if;
  return null;
end;
$$;
