-- Forward-only correction of the Task 5 cross-request lifecycle boundaries.
alter table public.import_sessions add column mapping_revision uuid not null default gen_random_uuid();
alter table public.asset_import_runs add column mapping_revision uuid;
create unique index asset_import_runs_one_processing_idx on public.asset_import_runs(import_session_id) where status='PROCESSING';

create table public.asset_import_run_metadata (
  import_run_id uuid primary key,
  import_session_id uuid not null,
  unit_induk_id uuid not null,
  dataset_version_id uuid not null,
  import_sheet_id uuid not null,
  mapping_revision uuid not null,
  layout_hash text not null check(layout_hash ~ '^[0-9a-f]{64}$'),
  diagnostics jsonb not null check(jsonb_typeof(diagnostics)='object'),
  summary jsonb not null check(jsonb_typeof(summary)='object'),
  comparison_base_version_id uuid references public.dataset_versions(id),
  comparison_id uuid,
  comparison_ready boolean not null default false,
  created_at timestamptz not null default now(),
  foreign key(import_run_id,import_session_id,unit_induk_id) references public.asset_import_runs(id,import_session_id,unit_induk_id),
  foreign key(import_run_id,unit_induk_id,dataset_version_id) references public.asset_import_runs(id,unit_induk_id,dataset_version_id),
  foreign key(import_sheet_id,import_session_id,unit_induk_id) references public.import_sheets(id,import_session_id,unit_induk_id),
  foreign key(comparison_id,unit_induk_id) references public.version_comparisons(id,unit_induk_id),
  check(comparison_id is null or comparison_base_version_id is not null)
);
create index asset_import_run_metadata_session_idx on public.asset_import_run_metadata(import_session_id);
create index asset_import_run_metadata_comparison_idx on public.asset_import_run_metadata(comparison_id);
alter table public.asset_import_run_metadata enable row level security;
create policy asset_import_run_metadata_read on public.asset_import_run_metadata for select to authenticated using(private.can_access_unit(unit_induk_id));
revoke all on public.asset_import_run_metadata from public,anon,authenticated,service_role;
grant select on public.asset_import_run_metadata to authenticated,service_role;
create trigger asset_evidence_no_truncate before truncate on public.asset_import_run_metadata for each statement execute function private.reject_asset_truncate();
-- Lifecycle writes use actor-checked RPCs; a late request cannot issue a blind sheet update.
revoke update,delete on public.import_sheets from service_role;
revoke insert,update,delete on public.import_column_mappings from service_role;
revoke update(mapping_revision) on public.import_sessions from service_role;
-- Existing column grants predate mapping_revision; explicitly ensure it is not writable.

create function private.assert_asset_mapping(p_session_id uuid,p_revision uuid,p_layout_hash text,p_rule_version text)
returns public.import_sheets language plpgsql security definer set search_path='' as $$
declare s public.import_sessions; sheet public.import_sheets;
begin
 select * into s from public.import_sessions where id=p_session_id;
 select * into sheet from public.import_sheets where import_session_id=s.id and selected;
 if p_revision is null or p_revision is distinct from s.mapping_revision or sheet.id is null
   or sheet.layout_hash is distinct from p_layout_hash or sheet.diagnostics->>'ruleVersion' is distinct from p_rule_version
   or jsonb_typeof(sheet.diagnostics->'mapping'->'columns') is distinct from 'array'
   or jsonb_array_length(sheet.diagnostics->'mapping'->'columns')=0 then
   raise exception 'Stale or unconfirmed mapping' using errcode='22023';
 end if;
 if (select count(*) from public.import_column_mappings where import_sheet_id=sheet.id)<>jsonb_array_length(sheet.diagnostics->'mapping'->'columns')
   or exists(select 1 from jsonb_array_elements(sheet.diagnostics->'mapping'->'columns') c
     left join public.import_column_mappings m on m.import_sheet_id=sheet.id and m.source_column_index=(c->>'columnIndex')::integer
     where m.id is null or m.confirmed_by is null or m.confirmed_at is null or m.canonical_field is distinct from c->>'field'
       or m.source_header is distinct from c->>'header') then
   raise exception 'Confirmed indexed mapping required' using errcode='22023';
 end if;
 return sheet;
end$$;

create function public.replace_asset_import_mapping(p_actor_id uuid,p_import_id uuid,p_sheet_id uuid,p_expected_revision uuid,p_mapping jsonb,p_layout_hash text,p_canonical_hash text,p_rule_version text,p_source_hash text)
returns uuid language plpgsql security definer set search_path='' as $$
declare s public.import_sessions; revision uuid:=gen_random_uuid();
begin
 select * into s from public.import_sessions where id=p_import_id;
 if not found then raise exception 'Import not found' using errcode='22023'; end if;
 perform private.lock_asset_version_for_workflow(s.dataset_version_id);
 select * into s from public.import_sessions where id=p_import_id;
 perform private.assert_asset_actor(p_actor_id,s.unit_induk_id,false);
 if s.mapping_revision is distinct from p_expected_revision
   or not exists(select 1 from public.dataset_versions where id=s.dataset_version_id and status in('DRAFT','NEEDS_FIX','READY_TO_SUBMIT'))
   or exists(select 1 from public.asset_import_runs where import_session_id=s.id and status='PROCESSING') then
   raise exception 'Mapping replacement conflicts with workflow' using errcode='22023';
 end if;
 if p_layout_hash is null or p_layout_hash !~ '^[0-9a-f]{64}$' or p_canonical_hash is null or p_canonical_hash !~ '^[0-9a-f]{64}$'
   or nullif(btrim(p_rule_version),'') is null or jsonb_typeof(p_mapping) is distinct from 'object'
   or jsonb_typeof(p_mapping->'columns') is distinct from 'array' or jsonb_array_length(p_mapping->'columns') not between 1 and 16384
   or (p_mapping->>'headerRow')::integer not between 1 and 50
   or not exists(select 1 from public.source_files where id=s.source_file_id and sha256=p_source_hash)
   or not exists(select 1 from public.import_sheets where id=p_sheet_id and import_session_id=s.id and unit_induk_id=s.unit_induk_id and sheet_name=p_mapping->>'sheetName') then
   raise exception 'Invalid confirmed mapping evidence' using errcode='22023';
 end if;
 update public.import_sheets set selected=false where import_session_id=s.id;
 delete from public.import_column_mappings where import_session_id=s.id;
 insert into public.import_column_mappings(import_sheet_id,import_session_id,unit_induk_id,source_column_index,source_header,canonical_field,confidence,confirmed_by,confirmed_at)
   select p_sheet_id,s.id,s.unit_induk_id,(c->>'columnIndex')::integer,c->>'header',c->>'field',(c->>'confidence')::numeric,p_actor_id,now()
   from jsonb_array_elements(p_mapping->'columns')c;
 update public.import_sheets set selected=true,header_row=(p_mapping->>'headerRow')::integer,layout_hash=p_layout_hash,
   diagnostics=jsonb_build_object('uploadVerified',p_source_hash,'mapping',p_mapping,'layoutHash',p_layout_hash,'canonicalHash',p_canonical_hash,'ruleVersion',p_rule_version)
   where id=p_sheet_id;
 update public.import_sessions set mapping_revision=revision,updated_at=now() where id=s.id;
 perform private.assert_asset_mapping(s.id,revision,p_layout_hash,p_rule_version);
 return revision;
end$$;

create or replace function private.guard_asset_run() returns trigger
language plpgsql security definer set search_path='' as $$
declare version_status public.dataset_status; file_hash text; hashes record; revision uuid;
begin
 if tg_op<>'INSERT' and old.status<>'PROCESSING' then raise exception 'Terminal import run is immutable' using errcode='22023'; end if;
 if tg_op='DELETE' then return old; end if;
 if tg_op='INSERT' and new.status<>'PROCESSING' then raise exception 'New import run must be processing' using errcode='22023'; end if;
 if tg_op='INSERT' then perform private.lock_asset_version_for_workflow(new.dataset_version_id); end if;
 if tg_op='UPDATE' and (new.id,new.import_session_id,new.unit_induk_id,new.dataset_version_id,new.mapping_revision)
   is distinct from (old.id,old.import_session_id,old.unit_induk_id,old.dataset_version_id,old.mapping_revision) then
   raise exception 'Import run ownership and revision are immutable' using errcode='22023';
 end if;
 -- Releasing a failed reservation must not depend on a still-current mapping.
 if tg_op='UPDATE' and new.status='FAILED' then
   if (to_jsonb(new)-array['status','failure_code']) is distinct from (to_jsonb(old)-array['status','failure_code']) then
     raise exception 'Failure cannot rewrite run evidence' using errcode='22023';
   end if;
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
   select * into hashes from private.asset_run_hashes(new.id);
   if (select count(*) from public.asset_snapshot_rows where import_run_id=new.id)<>new.expected_row_count
     or (select count(*) from public.asset_valuations where import_run_id=new.id)<>new.expected_valuation_count
     or hashes.rows_hash<>new.expected_rows_hash or hashes.valuations_hash<>new.expected_valuations_hash
     or exists(select 1 from public.asset_valuations where import_run_id=new.id and rule_version<>new.rule_version) then
     raise exception 'Complete run counts, hashes and rules must match persisted batches' using errcode='22023'; end if;
   new.finalized_rows_hash:=hashes.rows_hash; new.finalized_valuations_hash:=hashes.valuations_hash; new.completed_at:=now();
 end if;
 return new;
end$$;

create function public.reserve_asset_import_run(p_actor_id uuid,p_import_id uuid,p_expected_revision uuid,p_run jsonb)
returns uuid language plpgsql security definer set search_path='' as $$
declare s public.import_sessions; run_id uuid;
begin
 select * into s from public.import_sessions where id=p_import_id;
 if not found then raise exception 'Import not found' using errcode='22023'; end if;
 perform private.lock_asset_version_for_workflow(s.dataset_version_id);
 select * into s from public.import_sessions where id=p_import_id;
 perform private.assert_asset_actor(p_actor_id,s.unit_induk_id,false);
 if not exists(select 1 from public.dataset_versions where id=s.dataset_version_id and status in('DRAFT','NEEDS_FIX','READY_TO_SUBMIT'))
   or exists(select 1 from public.asset_import_runs where import_session_id=s.id and status='PROCESSING') then
   raise exception 'Processing reservation conflicts' using errcode='22023'; end if;
 if jsonb_typeof(p_run) is distinct from 'object' or exists(select 1 from jsonb_object_keys(p_run)k where k not in('id','expected_row_count','expected_valuation_count','source_hash','mapping_hash','rule_version','expected_rows_hash','expected_valuations_hash')) then
   raise exception 'Invalid reservation evidence' using errcode='22023'; end if;
 perform private.assert_asset_mapping(s.id,p_expected_revision,p_run->>'mapping_hash',p_run->>'rule_version');
 insert into public.asset_import_runs(id,import_session_id,unit_induk_id,dataset_version_id,created_by,mapping_revision,expected_row_count,expected_valuation_count,source_hash,mapping_hash,rule_version,expected_rows_hash,expected_valuations_hash)
   values((p_run->>'id')::uuid,s.id,s.unit_induk_id,s.dataset_version_id,p_actor_id,p_expected_revision,(p_run->>'expected_row_count')::integer,(p_run->>'expected_valuation_count')::integer,p_run->>'source_hash',p_run->>'mapping_hash',p_run->>'rule_version',p_run->>'expected_rows_hash',p_run->>'expected_valuations_hash') returning id into run_id;
 return run_id;
end$$;

create function public.fail_asset_import_run(p_actor_id uuid,p_run_id uuid)
returns uuid language plpgsql security definer set search_path='' as $$
declare r public.asset_import_runs;
begin
 select * into r from public.asset_import_runs where id=p_run_id;
 if not found then raise exception 'Run not found' using errcode='22023'; end if;
 perform private.lock_asset_version_for_workflow(r.dataset_version_id);
 perform private.assert_asset_actor(p_actor_id,r.unit_induk_id,false);
 update public.asset_import_runs set status='FAILED',failure_code='PROCESS_FAILED' where id=p_run_id and status='PROCESSING';
 return p_run_id;
end$$;

create function private.asset_import_summary(p_run_id uuid) returns jsonb
language sql stable set search_path='' as $$
 select jsonb_build_object('rowCount',(select count(*) from public.asset_snapshot_rows where import_run_id=p_run_id),
 'blockingErrors',(select coalesce(sum(cardinality(error_codes)),0) from public.asset_snapshot_rows where import_run_id=p_run_id),
 'warningCount',(select coalesce(sum(cardinality(warning_codes)),0) from public.asset_snapshot_rows where import_run_id=p_run_id),
 'conditions',coalesce((select jsonb_object_agg(k,n) from(select coalesce(kondisi_aset,'MISSING')k,count(*)n from public.asset_snapshot_rows where import_run_id=p_run_id group by 1)t),'{}'),
 'valueSources',coalesce((select jsonb_object_agg(k,n) from(select value_source::text k,count(*)n from public.asset_valuations where import_run_id=p_run_id group by 1)t),'{}'),
 'issueCounts',coalesce((select jsonb_object_agg(k,n) from(select code k,count(*)n from public.asset_snapshot_rows cross join lateral unnest(error_codes||warning_codes)code where import_run_id=p_run_id group by 1)t),'{}'),
 'totalNilaiABC',(select coalesce(sum(nilai_abc),0) from public.asset_valuations where import_run_id=p_run_id))
$$;

create or replace function public.finalize_asset_import_run(p_actor_id uuid,p_run_id uuid)
returns uuid language plpgsql security definer set search_path='' as $$
declare r public.asset_import_runs; sheet public.import_sheets;
begin
 select * into r from public.asset_import_runs where id=p_run_id;
 if not found then raise exception 'Import run not found' using errcode='22023'; end if;
 perform private.lock_asset_version_for_workflow(r.dataset_version_id);
 perform private.assert_asset_actor(p_actor_id,r.unit_induk_id,false);
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

create function private.asset_row_identity(r public.asset_snapshot_rows) returns text
language sql immutable set search_path='' as $$
 select case when nullif(btrim(r.no_aset),'') is not null then 'ASSET:'||upper(regexp_replace(btrim(normalize(r.no_aset,NFKC)),'[[:space:]]+',' ','g'))
 else 'COMPOSITE:'||encode(extensions.digest(array_to_json(array(select upper(regexp_replace(btrim(normalize(coalesce(x,''),NFKC)),'[[:space:]]+',' ','g')) from unnest(array[r.unit_induk,r.upt,r.nama_gi,r.bay_penghantar,r.tid,r.nama_peralatan,r.spesifikasi_mara,r.satuan])x))::text,'sha256'),'hex') end
$$;
create function private.assert_asset_comparison(p_run_id uuid,p_base_version_id uuid,p_comparison_id uuid) returns void
language plpgsql security definer set search_path='' as $$
declare r public.asset_import_runs; s public.import_sessions; d public.datasets; c public.version_comparisons; base_run uuid; expected_count bigint;
begin
 select * into r from public.asset_import_runs where id=p_run_id;
 select * into s from public.import_sessions where id=r.import_session_id;
 select * into d from public.datasets where id=s.dataset_id;
 if d.active_version_id is distinct from p_base_version_id then raise exception 'Active comparison base changed' using errcode='22023'; end if;
 if p_base_version_id is null then
   if p_comparison_id is not null then raise exception 'Unexpected comparison for no-active base' using errcode='22023'; end if;
   return;
 end if;
 select bs.current_run_id into base_run from public.import_sessions bs join public.asset_import_runs br on br.id=bs.current_run_id
   join public.dataset_versions bv on bv.id=bs.dataset_version_id where bv.id=p_base_version_id and bv.dataset_id=d.id and bv.status='ACTIVE' and br.status='COMPLETE';
 select * into c from public.version_comparisons where id=p_comparison_id;
 if base_run is null or c.id is null or (c.dataset_id,c.unit_induk_id,c.from_version_id,c.to_version_id,c.from_run_id,c.to_run_id)
   is distinct from (d.id,r.unit_induk_id,p_base_version_id,r.dataset_version_id,base_run,r.id) then
   raise exception 'Comparison is not tied to current and active runs' using errcode='22023'; end if;
 select count(*) into expected_count from(select private.asset_row_identity(a)k from public.asset_snapshot_rows a where import_run_id in(base_run,r.id) group by 1)t;
 if (select count(*) from public.asset_version_changes where comparison_id=c.id)<>expected_count
   or exists(select 1 from public.asset_snapshot_rows a where a.import_run_id in(base_run,r.id) and not exists(select 1 from public.asset_version_changes ch where ch.comparison_id=c.id and ch.identity_key=private.asset_row_identity(a))) then
   raise exception 'Comparison changes are incomplete' using errcode='22023'; end if;
end$$;

create function public.complete_asset_import_comparison(p_actor_id uuid,p_run_id uuid,p_base_version_id uuid,p_comparison_id uuid)
returns uuid language plpgsql security definer set search_path='' as $$
declare r public.asset_import_runs; s public.import_sessions;
begin
 select * into r from public.asset_import_runs where id=p_run_id;
 if not found then raise exception 'Run not found' using errcode='22023'; end if;
 perform private.lock_asset_version_for_workflow(r.dataset_version_id);
 perform private.assert_asset_actor(p_actor_id,r.unit_induk_id,false);
 select * into s from public.import_sessions where id=r.import_session_id;
 if s.current_run_id is distinct from r.id or r.status<>'COMPLETE'
   or not exists(select 1 from public.dataset_versions where id=r.dataset_version_id and status in('DRAFT','NEEDS_FIX','READY_TO_SUBMIT'))
   or exists(select 1 from public.asset_import_runs where import_session_id=s.id and status='PROCESSING') then
   raise exception 'Completion no longer owns current run' using errcode='22023'; end if;
 perform private.assert_asset_mapping(s.id,r.mapping_revision,r.mapping_hash,r.rule_version);
 perform private.assert_asset_comparison(r.id,p_base_version_id,p_comparison_id);
 update public.asset_import_run_metadata set comparison_base_version_id=p_base_version_id,comparison_id=p_comparison_id,comparison_ready=true where import_run_id=r.id;
 if not found then raise exception 'Finalized metadata missing' using errcode='22023'; end if;
 return p_run_id;
end$$;

-- Remove the legacy callable path; every public submit carries expected state.
drop function public.submit_asset_version(uuid,uuid);
create function public.submit_asset_version(p_actor_id uuid,p_version_id uuid,p_expected_run_id uuid,p_expected_mapping_revision uuid,p_expected_layout_hash text,p_expected_base_version_id uuid,p_expected_comparison_id uuid)
returns uuid language plpgsql security definer set search_path='' as $$
declare d public.datasets; s public.import_sessions; r public.asset_import_runs; m public.asset_import_run_metadata;
begin
 perform private.lock_asset_version_for_workflow(p_version_id);
 select d0.* into d from public.datasets d0 join public.dataset_versions v on v.dataset_id=d0.id where v.id=p_version_id;
 perform private.assert_asset_actor(p_actor_id,d.unit_induk_id,false);
 if d.type<>'ASSET' or not exists(select 1 from public.dataset_versions where id=p_version_id and status in('DRAFT','NEEDS_FIX','READY_TO_SUBMIT')) then
   raise exception 'Version is not submittable' using errcode='22023'; end if;
 select * into s from public.import_sessions where dataset_version_id=p_version_id;
 select * into r from public.asset_import_runs where id=s.current_run_id;
 if r.id is null or r.id is distinct from p_expected_run_id or s.mapping_revision is distinct from p_expected_mapping_revision
   or r.mapping_revision is distinct from p_expected_mapping_revision or r.mapping_hash is distinct from p_expected_layout_hash then
   raise exception 'Expected finalized mapping/run changed' using errcode='22023'; end if;
 perform private.assert_asset_mapping(s.id,p_expected_mapping_revision,p_expected_layout_hash,r.rule_version);
 perform private.assert_asset_version_ready(p_version_id,false);
 select * into m from public.asset_import_run_metadata where import_run_id=r.id;
 if m.import_run_id is null or not m.comparison_ready or m.mapping_revision is distinct from s.mapping_revision
   or m.comparison_base_version_id is distinct from p_expected_base_version_id or m.comparison_id is distinct from p_expected_comparison_id then
   raise exception 'Finalized comparison token changed' using errcode='22023'; end if;
 perform private.assert_asset_comparison(r.id,p_expected_base_version_id,p_expected_comparison_id);
 update public.dataset_versions set status='PENDING_RST',updated_at=now() where id=p_version_id;
 insert into public.approval_events(dataset_version_id,actor_id,action) values(p_version_id,p_actor_id,'SUBMITTED');
 insert into public.audit_events(actor_id,action,target_type,target_id,details) values(p_actor_id,'ASSET_VERSION_SUBMITTED','dataset_version',p_version_id,jsonb_build_object('import_run_id',r.id,'comparison_base_version_id',p_expected_base_version_id,'comparison_id',p_expected_comparison_id));
 return p_version_id;
end$$;

create function private.guard_sealed_asset_comparison() returns trigger
language plpgsql security definer set search_path='' as $$
declare target uuid; target_version uuid;
begin
 if tg_table_name='version_comparisons' then target:=old.id; target_version:=old.to_version_id;
 elsif tg_op='DELETE' then target:=old.comparison_id; else target:=new.comparison_id; end if;
 if tg_table_name='asset_version_changes' then
   if tg_op='UPDATE' and old.comparison_id<>new.comparison_id then raise exception 'Cannot move comparison evidence' using errcode='22023'; end if;
   select to_version_id into target_version from public.version_comparisons where id=target;
 end if;
 perform private.lock_asset_version_for_workflow(target_version);
 if exists(select 1 from public.asset_import_run_metadata where comparison_id=target and comparison_ready) then
   raise exception 'Sealed comparison is immutable' using errcode='42501'; end if;
 if tg_op='DELETE' then return old; else return new; end if;
end$$;
create trigger sealed_asset_comparison before update or delete on public.version_comparisons for each row execute function private.guard_sealed_asset_comparison();
create trigger sealed_asset_comparison_changes before insert or update or delete on public.asset_version_changes for each row execute function private.guard_sealed_asset_comparison();

revoke all on function private.assert_asset_mapping(uuid,uuid,text,text),private.asset_import_summary(uuid),private.asset_row_identity(public.asset_snapshot_rows),private.assert_asset_comparison(uuid,uuid,uuid),private.guard_sealed_asset_comparison() from public,anon,authenticated,service_role;
revoke all on function public.replace_asset_import_mapping(uuid,uuid,uuid,uuid,jsonb,text,text,text,text),public.reserve_asset_import_run(uuid,uuid,uuid,jsonb),public.fail_asset_import_run(uuid,uuid),public.complete_asset_import_comparison(uuid,uuid,uuid,uuid),public.submit_asset_version(uuid,uuid,uuid,uuid,text,uuid,uuid) from public,anon,authenticated;
grant execute on function public.replace_asset_import_mapping(uuid,uuid,uuid,uuid,jsonb,text,text,text,text),public.reserve_asset_import_run(uuid,uuid,uuid,jsonb),public.fail_asset_import_run(uuid,uuid),public.complete_asset_import_comparison(uuid,uuid,uuid,uuid),public.submit_asset_version(uuid,uuid,uuid,uuid,text,uuid,uuid) to service_role;
