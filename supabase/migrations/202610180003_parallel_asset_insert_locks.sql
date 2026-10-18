-- Allow independent insert batches for the same run to overlap while keeping
-- terminal lifecycle transitions mutually exclusive with every batch.
create or replace function private.guard_asset_insert_statement() returns trigger
language plpgsql security definer set search_path='' as $$
declare run_id uuid;
begin
  for run_id in select distinct import_run_id from new_rows order by import_run_id loop
    perform pg_catalog.pg_advisory_xact_lock_shared(pg_catalog.hashtextextended(run_id::text,0));
  end loop;

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

create or replace function public.fail_asset_import_run(p_actor_id uuid,p_run_id uuid)
returns uuid language plpgsql security definer set search_path='' as $$
declare r public.asset_import_runs;
begin
 select * into r from public.asset_import_runs where id=p_run_id;
 if not found then raise exception 'Run not found' using errcode='22023'; end if;
 perform private.lock_asset_version_for_workflow(r.dataset_version_id);
 perform private.assert_asset_actor(p_actor_id,r.unit_induk_id,false);
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_run_id::text,0));
 update public.asset_import_runs set status='FAILED',failure_code='PROCESS_FAILED' where id=p_run_id and status='PROCESSING';
 return p_run_id;
end$$;

create or replace function public.finalize_asset_import_run(p_actor_id uuid,p_run_id uuid)
returns uuid language plpgsql security definer set search_path='' as $$
declare r public.asset_import_runs; sheet public.import_sheets;
begin
 select * into r from public.asset_import_runs where id=p_run_id;
 if not found then raise exception 'Import run not found' using errcode='22023'; end if;
 perform private.lock_asset_version_for_workflow(r.dataset_version_id);
 perform private.assert_asset_actor(p_actor_id,r.unit_induk_id,false);
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_run_id::text,0));
 select * into r from public.asset_import_runs where id=p_run_id for update;
 if r.status<>'PROCESSING' then raise exception 'Run is not processing' using errcode='22023'; end if;
 sheet:=private.assert_asset_mapping(r.import_session_id,r.mapping_revision,r.mapping_hash,r.rule_version);
 update public.asset_import_runs set status='COMPLETE' where id=p_run_id returning * into r;
 insert into public.asset_import_run_metadata(import_run_id,import_session_id,unit_induk_id,dataset_version_id,import_sheet_id,mapping_revision,layout_hash,diagnostics,summary)
   values(r.id,r.import_session_id,r.unit_induk_id,r.dataset_version_id,sheet.id,r.mapping_revision,r.mapping_hash,sheet.diagnostics,private.asset_import_summary(r.id));
 update public.import_sessions set current_run_id=p_run_id,updated_at=now() where id=r.import_session_id;
 insert into public.audit_events(actor_id,action,target_type,target_id,details) values(p_actor_id,'ASSET_IMPORT_FINALIZED','dataset_version',r.dataset_version_id,jsonb_build_object('import_run_id',r.id,'row_count',r.expected_row_count,'rows_hash',r.finalized_rows_hash,'valuations_hash',r.finalized_valuations_hash));
 return p_run_id;
end$$;
