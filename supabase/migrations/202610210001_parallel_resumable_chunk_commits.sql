-- Chunk RPCs already hold the shared run-scoped advisory lock for their full
-- transaction. Claim, release, fail, and finalize take the matching exclusive
-- advisory lock, so an additional parent-row FOR UPDATE only serializes the
-- two intentionally overlapping chunk requests without adding lifecycle safety.
create or replace function public.commit_asset_import_chunk(p_actor_id uuid,p_run_id uuid,p_lease_token uuid,p_chunk_index integer,p_start_ordinal integer,p_rows jsonb,p_valuations jsonb,p_rows_hash text,p_valuations_hash text) returns integer
language plpgsql security definer set search_path='' set statement_timeout to '60s' as $$
declare r public.asset_import_runs; c public.asset_import_chunks; n integer;
begin
 perform pg_catalog.pg_advisory_xact_lock_shared(pg_catalog.hashtextextended(p_run_id::text,0));
 select * into r from public.asset_import_runs where id=p_run_id;
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

