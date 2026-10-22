-- Supabase's Data API caps each database statement at 60 seconds. Large asset
-- imports therefore prepare immutable hash/summary evidence in three bounded,
-- retry-safe calls before the short atomic status transition.
alter table public.asset_import_runs
 add column prepared_rows_hash text check(prepared_rows_hash is null or prepared_rows_hash ~ '^[0-9a-f]{64}$'),
 add column prepared_valuations_hash text check(prepared_valuations_hash is null or prepared_valuations_hash ~ '^[0-9a-f]{64}$'),
 add column prepared_summary jsonb check(prepared_summary is null or jsonb_typeof(prepared_summary)='object');

create function private.asset_run_rows_hash(p_run_id uuid) returns text
language sql stable set search_path='' as $$
 select encode(extensions.digest(coalesce(string_agg(encode(extensions.digest(
   (to_jsonb(r)-'created_at')::text,'sha256'),'hex'),'' order by r.import_sheet_id,r.source_row_number),''),'sha256'),'hex')
 from public.asset_snapshot_rows r where r.import_run_id=p_run_id
$$;

create function private.asset_run_valuations_hash(p_run_id uuid) returns text
language sql stable set search_path='' as $$
 select encode(extensions.digest(coalesce(string_agg(encode(extensions.digest(
   (to_jsonb(v)-array['created_at','approved_by','approved_at','approval_notes'])::text,'sha256'),'hex'),'' order by v.asset_row_id),''),'sha256'),'hex')
 from public.asset_valuations v where v.import_run_id=p_run_id
$$;

create or replace function private.asset_run_hashes(p_run_id uuid)
returns table(rows_hash text,valuations_hash text)
language sql stable set search_path='' as $$
 select private.asset_run_rows_hash(p_run_id),private.asset_run_valuations_hash(p_run_id)
$$;

create function public.prepare_asset_import_finalization(p_actor_id uuid,p_run_id uuid,p_lease_token uuid,p_part text) returns uuid
language plpgsql security definer set search_path='' set statement_timeout to '60s' as $$
declare r public.asset_import_runs; calculated_hash text; calculated_summary jsonb;
begin
 select * into r from public.asset_import_runs where id=p_run_id;
 if not found then raise exception 'Import run not found' using errcode='22023'; end if;
 perform private.assert_asset_actor(p_actor_id,r.unit_induk_id,false);
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_run_id::text,0));
 select * into r from public.asset_import_runs where id=p_run_id for update;
 if r.status<>'PROCESSING' or r.processing_protocol_version<>'resumable-v1' then raise exception 'Run is not resumable processing' using errcode='22023'; end if;
 if p_lease_token is null or r.processing_lease_token is distinct from p_lease_token
  or r.processing_lease_expires_at is null or r.processing_lease_expires_at<=clock_timestamp() then raise exception 'Invalid processing lease' using errcode='22023'; end if;
 perform private.assert_asset_import_manifest(r);
 perform private.assert_asset_mapping(r.import_session_id,r.mapping_revision,r.mapping_hash,r.rule_version);
 if p_part='ROWS_HASH' then
  if r.prepared_rows_hash is null then
   calculated_hash:=private.asset_run_rows_hash(r.id);
   if calculated_hash is distinct from r.expected_rows_hash then raise exception 'Prepared rows hash mismatch' using errcode='22023'; end if;
   update public.asset_import_runs set prepared_rows_hash=calculated_hash,
    processing_lease_expires_at=clock_timestamp()+interval '240 seconds',last_progress_at=clock_timestamp() where id=r.id;
  elsif r.prepared_rows_hash is distinct from r.expected_rows_hash then raise exception 'Prepared rows hash mismatch' using errcode='22023';
  else update public.asset_import_runs set processing_lease_expires_at=clock_timestamp()+interval '240 seconds',last_progress_at=clock_timestamp() where id=r.id;
  end if;
 elsif p_part='VALUATIONS_HASH' then
  if r.prepared_valuations_hash is null then
   calculated_hash:=private.asset_run_valuations_hash(r.id);
   if calculated_hash is distinct from r.expected_valuations_hash then raise exception 'Prepared valuations hash mismatch' using errcode='22023'; end if;
   update public.asset_import_runs set prepared_valuations_hash=calculated_hash,
    processing_lease_expires_at=clock_timestamp()+interval '240 seconds',last_progress_at=clock_timestamp() where id=r.id;
  elsif r.prepared_valuations_hash is distinct from r.expected_valuations_hash then raise exception 'Prepared valuations hash mismatch' using errcode='22023';
  else update public.asset_import_runs set processing_lease_expires_at=clock_timestamp()+interval '240 seconds',last_progress_at=clock_timestamp() where id=r.id;
  end if;
 elsif p_part='SUMMARY' then
  if r.prepared_summary is null then
   calculated_summary:=private.asset_import_summary(r.id);
   if (calculated_summary->>'rowCount')::bigint<>r.expected_row_count then raise exception 'Prepared summary count mismatch' using errcode='22023'; end if;
   update public.asset_import_runs set prepared_summary=calculated_summary,
    processing_lease_expires_at=clock_timestamp()+interval '240 seconds',last_progress_at=clock_timestamp() where id=r.id;
  else update public.asset_import_runs set processing_lease_expires_at=clock_timestamp()+interval '240 seconds',last_progress_at=clock_timestamp() where id=r.id;
  end if;
 else raise exception 'Invalid finalization part' using errcode='22023';
 end if;
 return p_run_id;
end$$;

create or replace function private.guard_asset_run() returns trigger
language plpgsql security definer set search_path='' as $$
declare version_status public.dataset_status; file_hash text; hashes record; revision uuid;
begin
 if tg_op='UPDATE' and old.processing_lease_token is not null
   and new.processing_lease_token is null and new.processing_lease_expires_at is null
   and (to_jsonb(new)-array['processing_lease_token','processing_lease_expires_at'])=(to_jsonb(old)-array['processing_lease_token','processing_lease_expires_at']) then return new; end if;
 if tg_op<>'INSERT' and old.status<>'PROCESSING' then raise exception 'Terminal import run is immutable' using errcode='22023'; end if;
 if tg_op='DELETE' then return old; end if;
 if tg_op='INSERT' and new.status<>'PROCESSING' then raise exception 'New import run must be processing' using errcode='22023'; end if;
 if tg_op='INSERT' then perform private.lock_asset_version_for_workflow(new.dataset_version_id); end if;
 if tg_op='UPDATE' and (new.id,new.import_session_id,new.unit_induk_id,new.dataset_version_id,new.mapping_revision)
   is distinct from (old.id,old.import_session_id,old.unit_induk_id,old.dataset_version_id,old.mapping_revision) then
  raise exception 'Import run ownership and revision are immutable' using errcode='22023'; end if;
 if tg_op='UPDATE' and new.status='FAILED' then
  if (to_jsonb(new)-array['status','failure_code']) is distinct from (to_jsonb(old)-array['status','failure_code']) then
   raise exception 'Failure cannot rewrite run evidence' using errcode='22023'; end if;
  return new;
 end if;
 select v.status,f.sha256,s.mapping_revision into version_status,file_hash,revision from public.import_sessions s
  join public.dataset_versions v on v.id=s.dataset_version_id join public.source_files f on f.id=s.source_file_id
  join public.datasets d on d.id=s.dataset_id where s.id=new.import_session_id and d.type='ASSET';
 if tg_op='INSERT' then
  if new.mapping_revision is not null and new.mapping_revision<>revision then raise exception 'Stale run mapping revision' using errcode='22023'; end if;
  new.mapping_revision:=revision;
 end if;
 if version_status is null or version_status not in('DRAFT','NEEDS_FIX','READY_TO_SUBMIT') or file_hash<>new.source_hash
  or new.mapping_revision is distinct from revision then raise exception 'Run requires an editable version and matching source/revision' using errcode='22023'; end if;
 if not exists(select 1 from public.import_sheets where import_session_id=new.import_session_id and selected and layout_hash=new.mapping_hash) then
  raise exception 'Run requires the confirmed selected layout hash' using errcode='22023'; end if;
 if new.status='COMPLETE' then
  perform private.assert_asset_import_manifest(new);
  if new.processing_protocol_version='resumable-v1' then
   if new.prepared_rows_hash is null or new.prepared_valuations_hash is null or new.prepared_summary is null then
    raise exception 'Prepared finalization evidence required' using errcode='22023'; end if;
   select new.prepared_rows_hash rows_hash,new.prepared_valuations_hash valuations_hash into hashes;
  else select * into hashes from private.asset_run_hashes(new.id);
  end if;
  if (select count(*) from public.asset_snapshot_rows where import_run_id=new.id)<>new.expected_row_count
   or (select count(*) from public.asset_valuations where import_run_id=new.id)<>new.expected_valuation_count
   or hashes.rows_hash<>new.expected_rows_hash or hashes.valuations_hash<>new.expected_valuations_hash
   or exists(select 1 from public.asset_valuations where import_run_id=new.id and rule_version<>new.rule_version) then
   raise exception 'Complete run counts, hashes and rules must match persisted batches' using errcode='22023'; end if;
  new.finalized_rows_hash:=hashes.rows_hash; new.finalized_valuations_hash:=hashes.valuations_hash; new.completed_at:=now();
 end if;
 return new;
end$$;

create or replace function public.finalize_asset_import_run(p_actor_id uuid,p_run_id uuid,p_lease_token uuid) returns uuid
language plpgsql security definer set search_path='' set statement_timeout to '60s' as $$
declare r public.asset_import_runs; sheet public.import_sheets; summary jsonb;
begin
 select * into r from public.asset_import_runs where id=p_run_id;
 if not found then raise exception 'Import run not found' using errcode='22023'; end if;
 perform private.lock_asset_version_for_workflow(r.dataset_version_id);
 perform private.assert_asset_actor(p_actor_id,r.unit_induk_id,false);
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_run_id::text,0));
 select * into r from public.asset_import_runs where id=p_run_id for update;
 if r.status<>'PROCESSING' then raise exception 'Run is not processing' using errcode='22023'; end if;
 if r.processing_protocol_version='resumable-v1' and (p_lease_token is null or r.processing_lease_token is distinct from p_lease_token
  or r.processing_lease_expires_at is null or r.processing_lease_expires_at<=clock_timestamp()) then raise exception 'Invalid processing lease' using errcode='22023'; end if;
 perform private.assert_asset_import_manifest(r);
 sheet:=private.assert_asset_mapping(r.import_session_id,r.mapping_revision,r.mapping_hash,r.rule_version);
 if r.processing_protocol_version='resumable-v1' then
  if r.prepared_rows_hash is null or r.prepared_valuations_hash is null or r.prepared_summary is null then raise exception 'Prepared finalization evidence required' using errcode='22023'; end if;
  summary:=r.prepared_summary;
 else summary:=private.asset_import_summary(r.id);
 end if;
 update public.asset_import_runs set status='COMPLETE' where id=p_run_id returning * into r;
 insert into public.asset_import_run_metadata(import_run_id,import_session_id,unit_induk_id,dataset_version_id,import_sheet_id,mapping_revision,layout_hash,diagnostics,summary)
  values(r.id,r.import_session_id,r.unit_induk_id,r.dataset_version_id,sheet.id,r.mapping_revision,r.mapping_hash,sheet.diagnostics,summary);
 update public.import_sessions set current_run_id=p_run_id,updated_at=now() where id=r.import_session_id;
 insert into public.audit_events(actor_id,action,target_type,target_id,details) values(p_actor_id,'ASSET_IMPORT_FINALIZED','dataset_version',r.dataset_version_id,jsonb_build_object('import_run_id',r.id,'row_count',r.expected_row_count,'rows_hash',r.finalized_rows_hash,'valuations_hash',r.finalized_valuations_hash));
 return p_run_id;
end$$;

revoke all on function private.asset_run_rows_hash(uuid),private.asset_run_valuations_hash(uuid) from public,anon,authenticated,service_role;
revoke all on function public.prepare_asset_import_finalization(uuid,uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.prepare_asset_import_finalization(uuid,uuid,uuid,text) to service_role;
