-- Durable resumable protocol. Indices and ordinals are zero-based; leases are
-- database-clock bounded. Historical runs retain the legacy lifecycle contract.
alter table public.asset_import_runs
 add column processing_protocol_version text not null default 'legacy-v1' check(processing_protocol_version in('legacy-v1','resumable-v1')),
 add column processing_lease_token uuid,
 add column processing_lease_expires_at timestamptz,
 add column last_progress_at timestamptz,
 add column processing_attempts integer not null default 0 check(processing_attempts>=0),
 add constraint asset_import_runs_lease_pair check((processing_lease_token is null)=(processing_lease_expires_at is null)),
 add constraint asset_import_runs_id_unit_key unique(id,unit_induk_id);

create table public.asset_import_chunks (
 import_run_id uuid not null,
 unit_induk_id uuid not null,
 chunk_index integer not null check(chunk_index>=0),
 start_ordinal integer not null check(start_ordinal>=0 and start_ordinal::bigint=chunk_index::bigint*2000),
 row_count integer not null check(row_count between 1 and 2000),
 rows_hash text not null check(rows_hash ~ '^[0-9a-f]{64}$'),
 valuations_hash text not null check(valuations_hash ~ '^[0-9a-f]{64}$'),
 completed_at timestamptz not null default clock_timestamp(),
 completed_by uuid not null references public.profiles(id),
 primary key(import_run_id,chunk_index),
 unique(import_run_id,start_ordinal),
 foreign key(import_run_id,unit_induk_id) references public.asset_import_runs(id,unit_induk_id)
);
create index asset_import_chunks_unit_idx on public.asset_import_chunks(unit_induk_id);
create index asset_import_chunks_actor_idx on public.asset_import_chunks(completed_by);
alter table public.asset_import_chunks enable row level security;
create policy asset_import_chunks_read on public.asset_import_chunks for select to authenticated using(private.can_access_unit(unit_induk_id));
revoke all on public.asset_import_chunks from public,anon,authenticated,service_role;
grant select on public.asset_import_chunks to authenticated,service_role;
-- Lease and paired data writes must go through actor-checked RPCs. Existing
-- controlled DELETE cleanup and review approval paths retain their grants.
revoke insert,update on public.asset_import_runs from service_role;
grant insert(id,import_session_id,unit_induk_id,dataset_version_id,status,expected_row_count,expected_valuation_count,source_hash,mapping_hash,rule_version,expected_rows_hash,expected_valuations_hash,finalized_rows_hash,finalized_valuations_hash,failure_code,created_by,created_at,completed_at,mapping_revision) on public.asset_import_runs to service_role;
revoke insert on public.asset_snapshot_rows,public.asset_valuations from service_role;
-- A table-level SELECT grant would automatically expose the new bearer token.
revoke select on public.asset_import_runs from authenticated;
grant select(id,import_session_id,unit_induk_id,dataset_version_id,status,expected_row_count,expected_valuation_count,source_hash,mapping_hash,rule_version,expected_rows_hash,expected_valuations_hash,finalized_rows_hash,finalized_valuations_hash,failure_code,created_by,created_at,completed_at,mapping_revision,processing_protocol_version,processing_lease_expires_at,last_progress_at,processing_attempts) on public.asset_import_runs to authenticated;

create function private.guard_asset_import_chunk() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 if tg_op='UPDATE' then raise exception 'Completed chunk is immutable' using errcode='22023'; end if;
 -- DELETE is reserved for owner/admin cleanup (no API role has the privilege).
 if tg_op='DELETE' then return old; end if;
 if not exists(select 1 from public.asset_import_runs r where r.id=new.import_run_id and r.unit_induk_id=new.unit_induk_id
   and r.status='PROCESSING' and r.processing_protocol_version='resumable-v1'
   and new.start_ordinal<r.expected_row_count and new.row_count=least(2000,r.expected_row_count-new.start_ordinal)) then
  raise exception 'Chunk does not match processing run' using errcode='22023';
 end if;
 perform private.assert_asset_actor(new.completed_by,new.unit_induk_id,false);
 return new;
end$$;
create trigger guard_asset_import_chunk before insert or update or delete on public.asset_import_chunks for each row execute function private.guard_asset_import_chunk();
create trigger asset_evidence_no_truncate before truncate on public.asset_import_chunks for each statement execute function private.reject_asset_truncate();

create function private.assert_asset_import_manifest(r public.asset_import_runs) returns void
language plpgsql security definer set search_path='' as $$
begin
 if r.processing_protocol_version='resumable-v1' and (
   r.expected_row_count<>r.expected_valuation_count
   or (select count(*) from public.asset_import_chunks where import_run_id=r.id)<>(r.expected_row_count::bigint+1999)/2000
   or (select coalesce(sum(row_count),0) from public.asset_import_chunks where import_run_id=r.id)<>r.expected_row_count
   or exists(select 1 from generate_series(0,((r.expected_row_count::bigint+1999)/2000)::integer-1)i
      left join public.asset_import_chunks c on c.import_run_id=r.id and c.chunk_index=i
      where c.import_run_id is null or c.start_ordinal::bigint<>i::bigint*2000 or c.row_count<>least(2000,r.expected_row_count-i*2000))
 ) then raise exception 'Incomplete import chunk manifest' using errcode='22023'; end if;
end$$;

-- Preserve the existing immutable evidence/source/global-hash checks. The only
-- permitted terminal mutation is clearing both lease fields after processing.
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

create function public.claim_asset_import_processing(p_actor_id uuid,p_import_id uuid,p_expected_revision uuid,p_run jsonb,p_lease_token uuid default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare s public.import_sessions; r public.asset_import_runs; claimed_token uuid;
begin
 select * into s from public.import_sessions where id=p_import_id;
 if not found then raise exception 'Import not found' using errcode='22023'; end if;
 perform private.lock_asset_version_for_workflow(s.dataset_version_id);
 select * into s from public.import_sessions where id=p_import_id;
 perform private.assert_asset_actor(p_actor_id,s.unit_induk_id,false);
 if jsonb_typeof(p_run) is distinct from 'object'
  or exists(select 1 from jsonb_object_keys(p_run)k where k not in('id','expected_row_count','expected_valuation_count','source_hash','mapping_hash','rule_version','expected_rows_hash','expected_valuations_hash'))
  or not (p_run ?& array['id','expected_row_count','expected_valuation_count','source_hash','mapping_hash','rule_version','expected_rows_hash','expected_valuations_hash'])
  or (p_run->>'id') is null or (p_run->>'expected_row_count')::integer<=0
  or (p_run->>'expected_row_count')::integer is distinct from (p_run->>'expected_valuation_count')::integer then
  raise exception 'Invalid reservation evidence' using errcode='22023'; end if;
 perform private.assert_asset_mapping(s.id,p_expected_revision,p_run->>'mapping_hash',p_run->>'rule_version');
 if not exists(select 1 from public.source_files where id=s.source_file_id and sha256=p_run->>'source_hash')
  or not exists(select 1 from public.dataset_versions where id=s.dataset_version_id and status in('DRAFT','NEEDS_FIX','READY_TO_SUBMIT')) then
  raise exception 'Changed source or version' using errcode='22023'; end if;
 select * into r from public.asset_import_runs where import_session_id=s.id and status='PROCESSING';
 if r.id is null then
  if p_lease_token is not null then raise exception 'Cannot renew missing lease' using errcode='22023'; end if;
  perform public.reserve_asset_import_run(p_actor_id,p_import_id,p_expected_revision,p_run);
  select * into r from public.asset_import_runs where id=(p_run->>'id')::uuid;
  update public.asset_import_runs set processing_protocol_version='resumable-v1' where id=r.id returning * into r;
 end if;
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(r.id::text,0));
 select * into r from public.asset_import_runs where id=r.id for update;
 if r.processing_protocol_version<>'resumable-v1' or
  (r.id,r.mapping_revision,r.expected_row_count,r.expected_valuation_count,r.source_hash,r.mapping_hash,r.rule_version,r.expected_rows_hash,r.expected_valuations_hash)
  is distinct from ((p_run->>'id')::uuid,p_expected_revision,(p_run->>'expected_row_count')::integer,(p_run->>'expected_valuation_count')::integer,p_run->>'source_hash',p_run->>'mapping_hash',p_run->>'rule_version',p_run->>'expected_rows_hash',p_run->>'expected_valuations_hash') then
  raise exception 'Processing expectations changed' using errcode='22023'; end if;
 if p_lease_token is not null then
  if r.processing_lease_token is distinct from p_lease_token or r.processing_lease_expires_at is null or r.processing_lease_expires_at<=clock_timestamp() then
   raise exception 'Cannot renew stale lease' using errcode='22023'; end if;
  claimed_token:=p_lease_token;
 else
  if r.processing_lease_expires_at>clock_timestamp() then raise exception 'Processing lease conflict' using errcode='22023'; end if;
  claimed_token:=gen_random_uuid();
 end if;
 update public.asset_import_runs set processing_lease_token=claimed_token,processing_lease_expires_at=clock_timestamp()+interval '240 seconds',
  last_progress_at=clock_timestamp(),processing_attempts=processing_attempts+1 where id=r.id returning * into r;
 return to_jsonb(r)||jsonb_build_object('completed_chunks',coalesce((select jsonb_agg(to_jsonb(c) order by c.chunk_index) from public.asset_import_chunks c where c.import_run_id=r.id),'[]'::jsonb));
end$$;

-- Shared decoder, callable only by owner-executed RPCs. Validate ownership and
-- one-to-one identities before inserting either half of the pair.
create function private.insert_asset_packed_pairs(p_actor_id uuid,p_run_id uuid,p_rows jsonb,p_valuations jsonb) returns integer
language plpgsql security definer set search_path='' as $$
declare r public.asset_import_runs; row_count integer;
begin
 if jsonb_typeof(p_rows) is distinct from 'array' or jsonb_typeof(p_valuations) is distinct from 'array' then raise exception 'Invalid packed import payload' using errcode='22023'; end if;
 row_count:=jsonb_array_length(p_rows);
 if row_count not between 1 and 2000 or jsonb_array_length(p_valuations)<>row_count then raise exception 'Invalid packed import batch size' using errcode='22023'; end if;
 if exists(select 1 from jsonb_array_elements(p_rows)x where case when jsonb_typeof(x)='array' then jsonb_array_length(x)<>32 else true end)
  or exists(select 1 from jsonb_array_elements(p_valuations)x where case when jsonb_typeof(x)='array' then jsonb_array_length(x)<>23 else true end) then raise exception 'Invalid packed import shape' using errcode='22023'; end if;
 perform pg_catalog.pg_advisory_xact_lock_shared(pg_catalog.hashtextextended(p_run_id::text,0));
 select * into r from public.asset_import_runs where id=p_run_id;
 if not found or r.status<>'PROCESSING' then raise exception 'Run is not processing' using errcode='22023'; end if;
 perform private.assert_asset_actor(p_actor_id,r.unit_induk_id,false);
 if exists(select 1 from jsonb_array_elements(p_rows)x where ((x->>1)::uuid,(x->>2)::uuid,(x->>3)::uuid) is distinct from (r.id,r.unit_induk_id,r.dataset_version_id))
  or exists(select 1 from jsonb_array_elements(p_valuations)x where ((x->>1)::uuid,(x->>2)::uuid,(x->>3)::uuid,x->>12) is distinct from (r.id,r.unit_induk_id,r.dataset_version_id,r.rule_version))
  or (select count(distinct x->>0) from jsonb_array_elements(p_rows)x)<>row_count
  or (select count(distinct x->>0) from jsonb_array_elements(p_valuations)x)<>row_count
  or exists(select 1 from jsonb_array_elements(p_rows)x full join jsonb_array_elements(p_valuations)y on x->>0=y->>0 where x is null or y is null) then
  raise exception 'Packed import ownership or pairing mismatch' using errcode='22023'; end if;
 insert into public.asset_snapshot_rows(id,import_run_id,unit_induk_id,dataset_version_id,import_sheet_id,source_row_number,
  unit_induk,upt,nama_gi,bay_penghantar,tid,no_aset,nama_peralatan,spesifikasi_mara,jumlah,satuan,kondisi_aset,tanggal_operasi,usia_aset_tahun,kode_class_asset,kode_jenis,kode_subjenis,
  nilai_buku_sap,harga_pengadaan_saat_ini,tanggal_referensi_harga,nilai_abc_input,kode_material,keterangan,provenance,error_codes,warning_codes,created_at)
 select (x->>0)::uuid,(x->>1)::uuid,(x->>2)::uuid,(x->>3)::uuid,(x->>4)::uuid,(x->>5)::integer,
  x->>6,x->>7,x->>8,x->>9,x->>10,x->>11,x->>12,x->>13,(x->>14)::numeric,x->>15,x->>16,(x->>17)::date,(x->>18)::numeric,x->>19,x->>20,x->>21,
  (x->>22)::numeric,(x->>23)::numeric,(x->>24)::date,(x->>25)::numeric,x->>26,x->>27,x->28,array(select jsonb_array_elements_text(x->29)),array(select jsonb_array_elements_text(x->30)),(x->>31)::timestamptz
 from jsonb_array_elements(p_rows)x;
 insert into public.asset_valuations(asset_row_id,import_run_id,unit_induk_id,dataset_version_id,nilai_abc,harga_pengadaan_saat_ini,value_source,calculation_method,age_status,age_years,useful_life_years,useful_life_rule_id,
  rule_version,as_of,manual_approval_required,approved_by,approved_at,approval_notes,selected_donor_ids,donor_evidence,calculation_evidence,warning_codes,created_at)
 select (x->>0)::uuid,(x->>1)::uuid,(x->>2)::uuid,(x->>3)::uuid,(x->>4)::numeric,(x->>5)::numeric,(x->>6)::public.asset_valuation_source,(x->>7)::public.asset_calculation_method,(x->>8)::public.asset_age_status,
  (x->>9)::numeric,(x->>10)::numeric,(x->>11)::uuid,x->>12,(x->>13)::date,(x->>14)::boolean,(x->>15)::uuid,(x->>16)::timestamptz,x->>17,array(select value::uuid from jsonb_array_elements_text(x->18)value),
  x->19,x->20,array(select jsonb_array_elements_text(x->21)),(x->>22)::timestamptz from jsonb_array_elements(p_valuations)x;
 return row_count;
end$$;

create or replace function public.insert_asset_import_batch(p_actor_id uuid,p_run_id uuid,p_rows jsonb,p_valuations jsonb) returns integer
language plpgsql security definer set search_path='' set statement_timeout to '60s' as $$
declare row_count integer;
begin
 if jsonb_typeof(p_rows) is distinct from 'array' then raise exception 'Invalid packed import payload' using errcode='22023'; end if;
 row_count:=jsonb_array_length(p_rows);
 if row_count<1 or row_count>2000 or exists(select 1 from jsonb_array_elements(p_rows)x where jsonb_typeof(x)<>'array') then raise exception 'Invalid packed import batch size' using errcode='22023'; end if;
 if not exists(select 1 from public.asset_import_runs where id=p_run_id and processing_protocol_version='legacy-v1') then raise exception 'Legacy batch requires legacy protocol' using errcode='22023'; end if;
 return private.insert_asset_packed_pairs(p_actor_id,p_run_id,p_rows,p_valuations);
end$$;

create function public.commit_asset_import_chunk(p_actor_id uuid,p_run_id uuid,p_lease_token uuid,p_chunk_index integer,p_start_ordinal integer,p_rows jsonb,p_valuations jsonb,p_rows_hash text,p_valuations_hash text) returns integer
language plpgsql security definer set search_path='' set statement_timeout to '60s' as $$
declare r public.asset_import_runs; c public.asset_import_chunks; n integer;
begin
 -- Batches take the established shared advisory lock before the run row; they
 -- never acquire workflow locks afterward, avoiding inversion with finalization.
 perform pg_catalog.pg_advisory_xact_lock_shared(pg_catalog.hashtextextended(p_run_id::text,0));
 select * into r from public.asset_import_runs where id=p_run_id for update;
 if not found then raise exception 'Run not found' using errcode='22023'; end if;
 perform private.assert_asset_actor(p_actor_id,r.unit_induk_id,false);
 if r.status<>'PROCESSING' or r.processing_protocol_version<>'resumable-v1' or p_lease_token is null or r.processing_lease_token is distinct from p_lease_token
  or r.processing_lease_expires_at is null or r.processing_lease_expires_at<=clock_timestamp() then raise exception 'Invalid processing lease' using errcode='22023'; end if;
 perform private.assert_asset_mapping(r.import_session_id,r.mapping_revision,r.mapping_hash,r.rule_version);
 if not exists(select 1 from public.import_sessions s join public.source_files f on f.id=s.source_file_id where s.id=r.import_session_id and f.sha256=r.source_hash) then raise exception 'Changed import source' using errcode='22023'; end if;
 if jsonb_typeof(p_rows) is distinct from 'array' or jsonb_typeof(p_valuations) is distinct from 'array' then raise exception 'Invalid packed import payload' using errcode='22023'; end if;
 n:=jsonb_array_length(p_rows);
 if p_chunk_index is null or p_chunk_index<0 or p_start_ordinal is null or p_start_ordinal::bigint<>p_chunk_index::bigint*2000
  or p_start_ordinal>=r.expected_row_count or n<>least(2000,r.expected_row_count-p_start_ordinal) or n not between 1 and 2000
  or jsonb_array_length(p_valuations)<>n or p_rows_hash is null or p_rows_hash !~ '^[0-9a-f]{64}$' or p_valuations_hash is null or p_valuations_hash !~ '^[0-9a-f]{64}$' then
  raise exception 'Invalid chunk bounds or hashes' using errcode='22023'; end if;
 -- Replays validate the packed contract too; matching marker hashes alone must
 -- not make malformed or cross-run payloads an accepted API call.
 if exists(select 1 from jsonb_array_elements(p_rows)x where case when jsonb_typeof(x)='array' then jsonb_array_length(x)<>32 else true end)
  or exists(select 1 from jsonb_array_elements(p_valuations)x where case when jsonb_typeof(x)='array' then jsonb_array_length(x)<>23 else true end) then raise exception 'Invalid packed import shape' using errcode='22023'; end if;
 if exists(select 1 from jsonb_array_elements(p_rows)x where ((x->>1)::uuid,(x->>2)::uuid,(x->>3)::uuid) is distinct from (r.id,r.unit_induk_id,r.dataset_version_id))
  or exists(select 1 from jsonb_array_elements(p_valuations)x where ((x->>1)::uuid,(x->>2)::uuid,(x->>3)::uuid,x->>12) is distinct from (r.id,r.unit_induk_id,r.dataset_version_id,r.rule_version))
  or (select count(distinct x->>0) from jsonb_array_elements(p_rows)x)<>n
  or (select count(distinct x->>0) from jsonb_array_elements(p_valuations)x)<>n
  or exists(select 1 from jsonb_array_elements(p_rows)x full join jsonb_array_elements(p_valuations)y on x->>0=y->>0 where x is null or y is null) then
  raise exception 'Packed import ownership or pairing mismatch' using errcode='22023'; end if;
 select * into c from public.asset_import_chunks where import_run_id=p_run_id and chunk_index=p_chunk_index;
 if found then
  if (c.start_ordinal,c.row_count,c.rows_hash,c.valuations_hash) is distinct from (p_start_ordinal,n,p_rows_hash,p_valuations_hash) then raise exception 'Chunk replay mismatch' using errcode='22023'; end if;
  return c.row_count;
 end if;
 perform private.insert_asset_packed_pairs(p_actor_id,p_run_id,p_rows,p_valuations);
 insert into public.asset_import_chunks(import_run_id,unit_induk_id,chunk_index,start_ordinal,row_count,rows_hash,valuations_hash,completed_by)
  values(r.id,r.unit_induk_id,p_chunk_index,p_start_ordinal,n,p_rows_hash,p_valuations_hash,p_actor_id);
 update public.asset_import_runs set last_progress_at=clock_timestamp() where id=r.id;
 return n;
end$$;

create function public.release_asset_import_processing(p_actor_id uuid,p_run_id uuid,p_lease_token uuid) returns uuid
language plpgsql security definer set search_path='' as $$
declare r public.asset_import_runs;
begin
 select * into r from public.asset_import_runs where id=p_run_id;
 if not found then raise exception 'Run not found' using errcode='22023'; end if;
 perform private.lock_asset_version_for_workflow(r.dataset_version_id);
 perform private.assert_asset_actor(p_actor_id,r.unit_induk_id,false);
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_run_id::text,0));
 select * into r from public.asset_import_runs where id=p_run_id for update;
 if r.processing_protocol_version<>'resumable-v1' or p_lease_token is null or r.processing_lease_token is distinct from p_lease_token
  or r.processing_lease_expires_at is null or r.processing_lease_expires_at<=clock_timestamp() then raise exception 'Invalid processing lease' using errcode='22023'; end if;
 update public.asset_import_runs set processing_lease_token=null,processing_lease_expires_at=null where id=p_run_id;
 return p_run_id;
end$$;

create function public.fail_asset_import_run(p_actor_id uuid,p_run_id uuid,p_lease_token uuid) returns uuid
language plpgsql security definer set search_path='' as $$
declare r public.asset_import_runs;
begin
 select * into r from public.asset_import_runs where id=p_run_id;
 if not found then raise exception 'Run not found' using errcode='22023'; end if;
 perform private.lock_asset_version_for_workflow(r.dataset_version_id);
 perform private.assert_asset_actor(p_actor_id,r.unit_induk_id,false);
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_run_id::text,0));
 select * into r from public.asset_import_runs where id=p_run_id for update;
 if r.processing_protocol_version='resumable-v1' and r.processing_lease_expires_at>clock_timestamp()
  and (p_lease_token is null or r.processing_lease_token is distinct from p_lease_token) then raise exception 'Invalid processing lease' using errcode='22023'; end if;
 update public.asset_import_runs set status='FAILED',failure_code='PROCESS_FAILED' where id=p_run_id and status='PROCESSING';
 return p_run_id;
end$$;
create or replace function public.fail_asset_import_run(p_actor_id uuid,p_run_id uuid) returns uuid
language plpgsql security definer set search_path='' as $$
begin
 -- Delegate under the same actor-checked lifecycle lock order.
 return public.fail_asset_import_run(p_actor_id,p_run_id,null);
end$$;

create function public.finalize_asset_import_run(p_actor_id uuid,p_run_id uuid,p_lease_token uuid) returns uuid
language plpgsql security definer set search_path='' as $$
declare r public.asset_import_runs; sheet public.import_sheets;
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
 update public.asset_import_runs set status='COMPLETE' where id=p_run_id returning * into r;
 insert into public.asset_import_run_metadata(import_run_id,import_session_id,unit_induk_id,dataset_version_id,import_sheet_id,mapping_revision,layout_hash,diagnostics,summary)
  values(r.id,r.import_session_id,r.unit_induk_id,r.dataset_version_id,sheet.id,r.mapping_revision,r.mapping_hash,sheet.diagnostics,private.asset_import_summary(r.id));
 update public.import_sessions set current_run_id=p_run_id,updated_at=now() where id=r.import_session_id;
 insert into public.audit_events(actor_id,action,target_type,target_id,details) values(p_actor_id,'ASSET_IMPORT_FINALIZED','dataset_version',r.dataset_version_id,jsonb_build_object('import_run_id',r.id,'row_count',r.expected_row_count,'rows_hash',r.finalized_rows_hash,'valuations_hash',r.finalized_valuations_hash));
 return p_run_id;
end$$;
create or replace function public.finalize_asset_import_run(p_actor_id uuid,p_run_id uuid) returns uuid
language plpgsql security definer set search_path='' as $$
begin
 -- Delegate under the same actor-checked lifecycle lock order.
 return public.finalize_asset_import_run(p_actor_id,p_run_id,null);
end$$;

revoke all on function private.guard_asset_import_chunk(),private.assert_asset_import_manifest(public.asset_import_runs),private.insert_asset_packed_pairs(uuid,uuid,jsonb,jsonb) from public,anon,authenticated,service_role;
revoke all on function public.claim_asset_import_processing(uuid,uuid,uuid,jsonb,uuid),public.commit_asset_import_chunk(uuid,uuid,uuid,integer,integer,jsonb,jsonb,text,text),public.release_asset_import_processing(uuid,uuid,uuid),public.finalize_asset_import_run(uuid,uuid,uuid),public.fail_asset_import_run(uuid,uuid,uuid) from public,anon,authenticated;
grant execute on function public.claim_asset_import_processing(uuid,uuid,uuid,jsonb,uuid),public.commit_asset_import_chunk(uuid,uuid,uuid,integer,integer,jsonb,jsonb,text,text),public.release_asset_import_processing(uuid,uuid,uuid),public.finalize_asset_import_run(uuid,uuid,uuid),public.fail_asset_import_run(uuid,uuid,uuid) to service_role;
