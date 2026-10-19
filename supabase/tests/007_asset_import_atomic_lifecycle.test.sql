begin;
create extension if not exists pgtap with schema extensions;
set local search_path=public,extensions;
select no_plan();

select has_function('public','replace_asset_import_mapping',array['uuid','uuid','uuid','uuid','jsonb','text','text','text','text'],'Mapping replacement is transactional');
select has_function('public','reserve_asset_import_run',array['uuid','uuid','uuid','jsonb'],'Reservation is transactional');
select has_function('public','fail_asset_import_run',array['uuid','uuid'],'Failure can release a stale reservation');
select has_function('public','complete_asset_import_comparison',array['uuid','uuid','uuid','uuid'],'Comparison sealing is current-run conditional');
select has_function('public','submit_asset_version',array['uuid','uuid','uuid','uuid','text','uuid','uuid'],'Submission requires expected state');
select ok(to_regprocedure('public.submit_asset_version(uuid,uuid)') is null,'No stale two-argument submission bypass');

create function pg_temp.uid(k integer,n integer) returns uuid language sql immutable as $$select ('a5160000-'||lpad(k::text,4,'0')||'-4000-8000-'||lpad(n::text,12,'0'))::uuid$$;
create function pg_temp.mapping() returns jsonb language sql immutable as $$select '{"sheetName":"Assets","headerRow":1,"columns":[{"columnIndex":1,"columnLetter":"A","header":"NO_ASET","normalizedHeader":"NO ASET","field":"noAset","confidence":1}],"confidence":1,"score":1,"missingRequiredFields":[],"ambiguousFields":[]}'::jsonb$$;
insert into auth.users(id,email) values(pg_temp.uid(1,1),'atomic.operator@pln.co.id'),(pg_temp.uid(1,2),'atomic.reviewer@pln.co.id');
update public.profiles set status='ACTIVE' where id in(pg_temp.uid(1,1),pg_temp.uid(1,2));
insert into public.user_role_assignments(user_id,role) values(pg_temp.uid(1,1),'UNIT_OPERATOR'),(pg_temp.uid(1,2),'RST_REVIEWER');
insert into public.unit_induk(id,code,name) values(pg_temp.uid(2,1),'ATOMIC_TEST','Atomic synthetic');
insert into public.user_unit_assignments(user_id,unit_induk_id) values(pg_temp.uid(1,1),pg_temp.uid(2,1));
insert into public.datasets(id,unit_induk_id,type) values(pg_temp.uid(3,1),pg_temp.uid(2,1),'ASSET');
insert into public.dataset_versions(id,dataset_id,version_number) select pg_temp.uid(4,n),pg_temp.uid(3,1),n from generate_series(1,3)n;
insert into public.source_files(id,unit_induk_id,object_path,original_name,byte_size,sha256,uploaded_by) select pg_temp.uid(5,n),pg_temp.uid(2,1),'unit/'||pg_temp.uid(2,1)||'/dataset/'||pg_temp.uid(3,1)||'/version/'||pg_temp.uid(4,n)||'/'||pg_temp.uid(5,n)||'.xlsx','synthetic.xlsx',1,repeat('a',64),pg_temp.uid(1,1) from generate_series(1,3)n;
insert into public.import_sessions(id,unit_induk_id,dataset_id,dataset_version_id,source_file_id,created_by) select pg_temp.uid(6,n),pg_temp.uid(2,1),pg_temp.uid(3,1),pg_temp.uid(4,n),pg_temp.uid(5,n),pg_temp.uid(1,1) from generate_series(1,3)n;
insert into public.import_sheets(id,import_session_id,unit_induk_id,sheet_name,header_row,diagnostics) select pg_temp.uid(7,n),pg_temp.uid(6,n),pg_temp.uid(2,1),'Assets',1,jsonb_build_object('uploadVerified',repeat('a',64)) from generate_series(1,3)n;
create function pg_temp.replace_mapping(n integer,h text default repeat('b',64)) returns uuid language sql as $$select public.replace_asset_import_mapping(pg_temp.uid(1,1),pg_temp.uid(6,n),pg_temp.uid(7,n),(select mapping_revision from public.import_sessions where id=pg_temp.uid(6,n)),pg_temp.mapping(),h,repeat('e',64),'test',repeat('a',64))$$;
create function pg_temp.payload(n integer,h text default repeat('b',64)) returns jsonb language sql as $$select jsonb_build_object('id',pg_temp.uid(8,n),'expected_row_count',1,'expected_valuation_count',1,'source_hash',repeat('a',64),'mapping_hash',h,'rule_version','test','expected_rows_hash',repeat('c',64),'expected_valuations_hash',repeat('d',64))$$;
create function pg_temp.reserve(s integer,r integer,h text default repeat('b',64)) returns uuid language sql as $$select public.reserve_asset_import_run(pg_temp.uid(1,1),pg_temp.uid(6,s),(select mapping_revision from public.import_sessions where id=pg_temp.uid(6,s)),pg_temp.payload(r,h))$$;
create function pg_temp.finalize(s integer,r integer) returns uuid language plpgsql as $$begin
 perform public.insert_asset_import_batch(
  pg_temp.uid(1,1),pg_temp.uid(8,r),
  jsonb_build_array(jsonb_build_array(
   pg_temp.uid(9,r),pg_temp.uid(8,r),pg_temp.uid(2,1),pg_temp.uid(4,s),pg_temp.uid(7,s),2,
   null,null,null,null,null,'SYNTHETIC',null,null,null,null,'P2',null,null,null,null,null,
   0,null,null,null,null,null,'{}'::jsonb,'[]'::jsonb,'[]'::jsonb,now()
  )),
  jsonb_build_array(jsonb_build_array(
   pg_temp.uid(9,r),pg_temp.uid(8,r),pg_temp.uid(2,1),pg_temp.uid(4,s),0,null,
   'SAP_BOOK_VALUE','DIRECT_BOOK_VALUE','PROVIDED_AGE',null,null,null,'test','2026-10-16',false,
   null,null,null,'[]'::jsonb,'{}'::jsonb,'{}'::jsonb,'[]'::jsonb,now()
  ))
 );
 update public.asset_import_runs r0 set expected_rows_hash=h.rows_hash,expected_valuations_hash=h.valuations_hash from private.asset_run_hashes(pg_temp.uid(8,r))h where r0.id=pg_temp.uid(8,r);
 return public.finalize_asset_import_run(pg_temp.uid(1,1),pg_temp.uid(8,r));
end$$;

select lives_ok($$select pg_temp.replace_mapping(1)$$,'Initial mapping is confirmed atomically');
create temporary table stale_mapping as select mapping_revision from public.import_sessions where id=pg_temp.uid(6,1);
select lives_ok($$select pg_temp.replace_mapping(1)$$,'Mapping wins first ordering');
select throws_ok($$select public.reserve_asset_import_run(pg_temp.uid(1,1),pg_temp.uid(6,1),(select mapping_revision from stale_mapping),pg_temp.payload(1))$$,'22023',null,'A stale processor cannot reserve after mapping changes');
select lives_ok($$select pg_temp.reserve(1,1)$$,'Processor wins second ordering');
select throws_ok($$select pg_temp.replace_mapping(1)$$,'22023',null,'Mapping cannot replace a PROCESSING reservation');
select throws_ok($$select pg_temp.reserve(1,2)$$,'22023',null,'Second reservation conflicts deterministically');
select throws_ok($$insert into public.asset_import_runs(id,import_session_id,unit_induk_id,dataset_version_id,created_by,expected_row_count,expected_valuation_count,source_hash,mapping_hash,rule_version,expected_rows_hash,expected_valuations_hash) values(pg_temp.uid(8,2),pg_temp.uid(6,1),pg_temp.uid(2,1),pg_temp.uid(4,1),pg_temp.uid(1,1),1,1,repeat('a',64),repeat('b',64),'test',repeat('c',64),repeat('d',64))$$,'23505',null,'Partial uniqueness prevents a bypassed duplicate PROCESSING insert');
update public.import_sheets set layout_hash=repeat('f',64) where id=pg_temp.uid(7,1);
select lives_ok($$select public.fail_asset_import_run(pg_temp.uid(1,1),pg_temp.uid(8,1))$$,'Stale mapping cannot wedge PROCESSING to FAILED');
select is((select status::text from public.asset_import_runs where id=pg_temp.uid(8,1)),'FAILED','Failure releases the reservation');
select lives_ok($$select pg_temp.replace_mapping(1)$$,'Mapping can change after FAILED');
select lives_ok($$select pg_temp.reserve(1,2)$$,'Retry reserves a new run');
select throws_ok($$
 insert into public.asset_snapshot_rows(id,import_run_id,unit_induk_id,dataset_version_id,import_sheet_id,source_row_number,no_aset,kondisi_aset)
 values(pg_temp.uid(9,89),pg_temp.uid(8,2),pg_temp.uid(2,1),pg_temp.uid(4,1),pg_temp.uid(7,2),89,'CROSS-SESSION','P2')
$$,'22023',null,'Statement guard rejects a sheet from another import session');
select lives_ok($$
 insert into public.asset_snapshot_rows(id,import_run_id,unit_induk_id,dataset_version_id,import_sheet_id,source_row_number,no_aset,kondisi_aset)
 select pg_temp.uid(9,n),pg_temp.uid(8,2),pg_temp.uid(2,1),pg_temp.uid(4,1),pg_temp.uid(7,1),n,'BATCH-'||n,'P2'
 from generate_series(90,91)n
$$,'Statement guard accepts a valid multi-row batch');
delete from public.asset_snapshot_rows where id in(pg_temp.uid(9,90),pg_temp.uid(9,91));
insert into public.asset_snapshot_rows(id,import_run_id,unit_induk_id,dataset_version_id,import_sheet_id,source_row_number,no_aset,kondisi_aset)
values(pg_temp.uid(9,92),pg_temp.uid(8,2),pg_temp.uid(2,1),pg_temp.uid(4,1),pg_temp.uid(7,1),92,'APPROVAL-GUARD','P2');
select throws_ok($$
 insert into public.asset_valuations(asset_row_id,import_run_id,unit_induk_id,dataset_version_id,value_source,nilai_abc,calculation_method,age_status,rule_version,as_of,approved_by,approved_at,approval_notes)
 values(pg_temp.uid(9,92),pg_temp.uid(8,2),pg_temp.uid(2,1),pg_temp.uid(4,1),'SAP_BOOK_VALUE',0,'DIRECT_BOOK_VALUE','PROVIDED_AGE','test','2026-10-16',pg_temp.uid(1,2),now(),'bypass')
$$,'22023',null,'Statement guard rejects pre-approved valuation inserts');
delete from public.asset_snapshot_rows where id=pg_temp.uid(9,92);
select lives_ok($$select pg_temp.finalize(1,2)$$,'Finalization creates run-specific summary atomically');
select throws_ok($$
 insert into public.asset_snapshot_rows(id,import_run_id,unit_induk_id,dataset_version_id,import_sheet_id,source_row_number,no_aset,kondisi_aset)
 values(pg_temp.uid(9,93),pg_temp.uid(8,2),pg_temp.uid(2,1),pg_temp.uid(4,1),pg_temp.uid(7,1),93,'LATE-WRITE','P2')
$$,'22023',null,'Statement guard freezes inserts after finalization');
select is((select import_run_id from public.asset_import_run_metadata where import_run_id=pg_temp.uid(8,2)),(select current_run_id from public.import_sessions where id=pg_temp.uid(6,1)),'Summary belongs to the finalized current run');
select is((select summary->>'rowCount' from public.asset_import_run_metadata where import_run_id=pg_temp.uid(8,2)),'1','Summary is derived from persisted rows');
select lives_ok($$select public.complete_asset_import_comparison(pg_temp.uid(1,1),pg_temp.uid(8,2),null,null)$$,'Explicit no-active base is sealed');
select throws_ok($$select public.submit_asset_version(pg_temp.uid(1,1),pg_temp.uid(4,1),pg_temp.uid(8,2),pg_temp.uid(99,1),repeat('b',64),null,null)$$,'22023',null,'Submission rejects a stale expected mapping revision');
select throws_ok($$select public.submit_asset_version(pg_temp.uid(1,1),pg_temp.uid(4,1),pg_temp.uid(8,1),(select mapping_revision from public.import_sessions where id=pg_temp.uid(6,1)),repeat('b',64),null,null)$$,'22023',null,'Submission rejects a stale current-run token');
select lives_ok($$select public.submit_asset_version(pg_temp.uid(1,1),pg_temp.uid(4,1),pg_temp.uid(8,2),(select mapping_revision from public.import_sessions where id=pg_temp.uid(6,1)),repeat('b',64),null,null)$$,'Matching explicit no-active submission succeeds');
select lives_ok($$select public.activate_asset_version(pg_temp.uid(1,2),pg_temp.uid(4,1),'Synthetic active base')$$,'Reviewer activates the tested base');

select lives_ok($$select pg_temp.replace_mapping(2)$$);
select lives_ok($$select pg_temp.reserve(2,3)$$);
select lives_ok($$select pg_temp.finalize(2,3)$$);
select throws_ok($$select public.complete_asset_import_comparison(pg_temp.uid(1,1),pg_temp.uid(8,3),null,null)$$,'22023',null,'Concurrent activation invalidates the explicit no-active base');
insert into public.version_comparisons(id,dataset_id,unit_induk_id,from_version_id,to_version_id,from_run_id,to_run_id,summary,created_by) values(pg_temp.uid(10,1),pg_temp.uid(3,1),pg_temp.uid(2,1),pg_temp.uid(4,1),pg_temp.uid(4,2),pg_temp.uid(8,2),pg_temp.uid(8,3),'{"counts":{"UNCHANGED":1}}',pg_temp.uid(1,1));
select throws_ok($$select public.complete_asset_import_comparison(pg_temp.uid(1,1),pg_temp.uid(8,3),pg_temp.uid(4,1),pg_temp.uid(10,1))$$,'22023',null,'An incomplete row-level comparison cannot be sealed');
insert into public.asset_version_changes(comparison_id,unit_induk_id,identity_key,change_kind,from_row_id,to_row_id) values(pg_temp.uid(10,1),pg_temp.uid(2,1),'ASSET:SYNTHETIC','UNCHANGED',pg_temp.uid(9,2),pg_temp.uid(9,3));
select lives_ok($$select public.complete_asset_import_comparison(pg_temp.uid(1,1),pg_temp.uid(8,3),pg_temp.uid(4,1),pg_temp.uid(10,1))$$,'Complete current-base comparison seals');
select throws_ok($$select public.submit_asset_version(pg_temp.uid(1,1),pg_temp.uid(4,2),pg_temp.uid(8,3),(select mapping_revision from public.import_sessions where id=pg_temp.uid(6,2)),repeat('b',64),null,null)$$,'22023',null,'A stale pre-activation submit token fails atomically');
select throws_ok($$select public.submit_asset_version(pg_temp.uid(1,1),pg_temp.uid(4,2),pg_temp.uid(8,3),(select mapping_revision from public.import_sessions where id=pg_temp.uid(6,2)),repeat('f',64),pg_temp.uid(4,1),pg_temp.uid(10,1))$$,'22023',null,'Submission rechecks the selected layout');
select lives_ok($$select pg_temp.reserve(2,4)$$,'A new retry may start after a completed comparison');
select lives_ok($$select pg_temp.finalize(2,4)$$,'New current metadata is finalized together');
select throws_ok($$select public.complete_asset_import_comparison(pg_temp.uid(1,1),pg_temp.uid(8,3),pg_temp.uid(4,1),pg_temp.uid(10,1))$$,'22023',null,'Delayed prior completion cannot bind metadata to another current run');
select is((select comparison_ready from public.asset_import_run_metadata where import_run_id=pg_temp.uid(8,4)),false,'New current metadata is not overwritten by an old completion');
select is((select summary->>'rowCount' from public.asset_import_run_metadata where import_run_id=pg_temp.uid(8,4)),'1','New summary stays tied to its own run');
select throws_ok($$select public.replace_asset_import_mapping(pg_temp.uid(1,2),pg_temp.uid(6,2),pg_temp.uid(7,2),(select mapping_revision from public.import_sessions where id=pg_temp.uid(6,2)),pg_temp.mapping(),repeat('b',64),repeat('e',64),'test',repeat('a',64))$$,'42501',null,'RST cannot impersonate an uploader through the mapping RPC');
set local role service_role;
select throws_ok($$update public.import_sheets set diagnostics='{}' where id=pg_temp.uid(7,2)$$,'42501',null,'No blind service sheet update can overwrite finalized metadata');
select throws_ok($$update public.asset_import_run_metadata set summary='{}' where import_run_id=pg_temp.uid(8,4)$$,'42501',null,'Run metadata has no direct service write path');
reset role;
select ok((select relrowsecurity from pg_class where oid='public.asset_import_run_metadata'::regclass),'Run-specific metadata retains RLS');
insert into auth.users(id,email) values(pg_temp.uid(1,3),'atomic.unassigned.operator@pln.co.id');
update public.profiles set status='ACTIVE' where id=pg_temp.uid(1,3);
insert into public.user_role_assignments(user_id,role) values(pg_temp.uid(1,3),'UNIT_OPERATOR');
select set_config('request.jwt.claim.sub',pg_temp.uid(1,3)::text,true);
set local role authenticated;
select is((select count(*) from public.asset_import_run_metadata),0::bigint,'Unassigned operator cannot read another unit run metadata');
reset role;
select set_config('request.jwt.claim.sub',pg_temp.uid(1,1)::text,true);
set local role authenticated;
select is((select count(*) from public.asset_import_run_metadata),3::bigint,'Assigned operator reads only its finalized run metadata');
reset role;
select ok(not has_function_privilege('authenticated',signature,'EXECUTE') and has_function_privilege('service_role',signature,'EXECUTE'),'Actor-checked service-only RPC: '||signature) from(values
 ('public.insert_asset_import_batch(uuid,uuid,jsonb,jsonb)'),('public.replace_asset_import_mapping(uuid,uuid,uuid,uuid,jsonb,text,text,text,text)'),('public.reserve_asset_import_run(uuid,uuid,uuid,jsonb)'),('public.fail_asset_import_run(uuid,uuid)'),('public.complete_asset_import_comparison(uuid,uuid,uuid,uuid)'),('public.submit_asset_version(uuid,uuid,uuid,uuid,text,uuid,uuid)'))f(signature);
-- The third session is isolated from the legacy compatibility cases above.
create function pg_temp.resume_payload() returns jsonb language sql as $$
 select pg_temp.payload(5)||jsonb_build_object('expected_row_count',2001,'expected_valuation_count',2001)
$$;
create function pg_temp.claim(t uuid default null) returns jsonb language sql as $$
 select public.claim_asset_import_processing(pg_temp.uid(1,1),pg_temp.uid(6,3),(select mapping_revision from public.import_sessions where id=pg_temp.uid(6,3)),pg_temp.resume_payload(),t)
$$;
create function pg_temp.rows(first_row integer,n integer) returns jsonb language sql as $$
 select jsonb_agg(jsonb_build_array(pg_temp.uid(11,i),pg_temp.uid(8,5),pg_temp.uid(2,1),pg_temp.uid(4,3),pg_temp.uid(7,3),i+2,
 null,null,null,null,null,'SYNTHETIC-'||i,null,null,null,null,'P2',null,null,null,null,null,0,null,null,null,null,null,'{}'::jsonb,'[]'::jsonb,'[]'::jsonb,'2026-10-19T00:00:00Z'))
 from generate_series(first_row,first_row+n-1)i
$$;
create function pg_temp.vals(first_row integer,n integer) returns jsonb language sql as $$
 select jsonb_agg(jsonb_build_array(pg_temp.uid(11,i),pg_temp.uid(8,5),pg_temp.uid(2,1),pg_temp.uid(4,3),0,null,'SAP_BOOK_VALUE','DIRECT_BOOK_VALUE','PROVIDED_AGE',null,null,null,'test','2026-10-16',false,null,null,null,'[]'::jsonb,'{}'::jsonb,'{}'::jsonb,'[]'::jsonb,'2026-10-19T00:00:00Z'))
 from generate_series(first_row,first_row+n-1)i
$$;
create temporary table lease_evidence(name text primary key,token uuid);
create function pg_temp.token(k text default 'current') returns uuid language sql as $$select token from lease_evidence where name=k$$;
create function pg_temp.chunk(i integer,t uuid default null) returns integer language sql as $$
 select public.commit_asset_import_chunk(pg_temp.uid(1,1),pg_temp.uid(8,5),coalesce(t,pg_temp.token()),i,i*2000,pg_temp.rows(i*2000,least(2000,2001-i*2000)),pg_temp.vals(i*2000,least(2000,2001-i*2000)),repeat('c',64),repeat('d',64))
$$;
select lives_ok($$select pg_temp.replace_mapping(3)$$,'Resumable mapping fixture');
select lives_ok($$insert into lease_evidence select 'current',(pg_temp.claim()->>'processing_lease_token')::uuid$$,'Claim creates new resumable run');
select is((select processing_protocol_version from public.asset_import_runs where id=pg_temp.uid(8,5)),'resumable-v1','New claim uses explicit protocol');
select is((select processing_attempts from public.asset_import_runs where id=pg_temp.uid(8,5)),1,'Initial claim counts an attempt');
select throws_ok($$update public.asset_import_runs set processing_attempts=-1 where id=pg_temp.uid(8,5)$$,'23514',null,'Attempts cannot be negative');
select throws_ok($$update public.asset_import_runs set processing_protocol_version='unknown-v1' where id=pg_temp.uid(8,5)$$,'23514',null,'Unknown protocol rejected');
select ok((select processing_lease_expires_at>clock_timestamp() and processing_lease_expires_at<=clock_timestamp()+interval '240 seconds' from public.asset_import_runs where id=pg_temp.uid(8,5)),'Lease bounded at 240 seconds');
select throws_ok($$select pg_temp.claim()$$,'22023',null,'Another claimant conflicts with active lease');
select lives_ok($$select (pg_temp.claim(pg_temp.token())->>'id') is not null$$,'Owner may renew same lease');
select throws_ok($$select public.claim_asset_import_processing(pg_temp.uid(1,3),pg_temp.uid(6,3),(select mapping_revision from public.import_sessions where id=pg_temp.uid(6,3)),pg_temp.resume_payload(),null)$$,'42501',null,'Unassigned operator cannot claim');
select throws_ok($$select public.claim_asset_import_processing(pg_temp.uid(1,1),pg_temp.uid(6,3),(select mapping_revision from public.import_sessions where id=pg_temp.uid(6,3)),pg_temp.resume_payload()||jsonb_build_object('expected_rows_hash',repeat('f',64)),pg_temp.token())$$,'22023',null,'Resume rejects changed expectations');
select throws_ok(format('select public.claim_asset_import_processing(pg_temp.uid(1,1),pg_temp.uid(6,3),(select mapping_revision from public.import_sessions where id=pg_temp.uid(6,3)),pg_temp.resume_payload()||jsonb_build_object(%L,%L),pg_temp.token())',field,value),'22023',null,'Resume rejects changed '||field)
 from(values('source_hash',repeat('f',64)),('mapping_hash',repeat('f',64)),('rule_version','other-rule')) mismatch(field,value);
select throws_ok($$select public.claim_asset_import_processing(pg_temp.uid(1,1),pg_temp.uid(6,3),pg_temp.uid(99,9),pg_temp.resume_payload(),pg_temp.token())$$,'22023',null,'Resume rejects stale mapping revision');
select throws_ok($$select public.finalize_asset_import_run(pg_temp.uid(1,1),pg_temp.uid(8,5),pg_temp.token())$$,'22023',null,'Cannot finalize without manifest');
select throws_ok($$select public.finalize_asset_import_run(pg_temp.uid(1,1),pg_temp.uid(8,5))$$,'22023',null,'Legacy finalize cannot bypass lease');
select throws_ok($$select public.fail_asset_import_run(pg_temp.uid(1,1),pg_temp.uid(8,5))$$,'22023',null,'Legacy fail cannot steal active lease');
select throws_ok($$select public.insert_asset_import_batch(pg_temp.uid(1,1),pg_temp.uid(8,5),pg_temp.rows(0,1),pg_temp.vals(0,1))$$,'22023',null,'Legacy insertion cannot bypass manifest');
insert into lease_evidence select 'stale',pg_temp.token();
update public.asset_import_runs set processing_lease_expires_at=clock_timestamp()-interval '1 second' where id=pg_temp.uid(8,5);
select throws_ok($$select pg_temp.chunk(1)$$,'22023',null,'Expired lease cannot commit');
select throws_ok($$select pg_temp.claim(pg_temp.token())$$,'22023',null,'Expired token cannot renew itself');
select lives_ok($$update lease_evidence set token=(pg_temp.claim()->>'processing_lease_token')::uuid where name='current'$$,'Expired lease can be reclaimed');
select ok(pg_temp.token()<>pg_temp.token('stale'),'Reclaim rotates token');
select throws_ok($$select pg_temp.chunk(1,pg_temp.token('stale'))$$,'22023',null,'Stale owner cannot commit after reclaim');
select throws_ok($$select public.release_asset_import_processing(pg_temp.uid(1,1),pg_temp.uid(8,5),pg_temp.token('stale'))$$,'22023',null,'Stale owner cannot release');
select throws_ok($$select public.fail_asset_import_run(pg_temp.uid(1,1),pg_temp.uid(8,5),pg_temp.token('stale'))$$,'22023',null,'Stale owner cannot fail');
select throws_ok($$select public.finalize_asset_import_run(pg_temp.uid(1,1),pg_temp.uid(8,5),pg_temp.token('stale'))$$,'22023',null,'Stale owner cannot finalize');
select throws_ok($$select public.release_asset_import_processing(pg_temp.uid(1,3),pg_temp.uid(8,5),pg_temp.token())$$,'42501',null,'Unassigned operator cannot release an owned lease');
select throws_ok($$select public.commit_asset_import_chunk(pg_temp.uid(1,3),pg_temp.uid(8,5),pg_temp.token(),1,2000,pg_temp.rows(2000,1),pg_temp.vals(2000,1),repeat('c',64),repeat('d',64))$$,'42501',null,'Unassigned operator cannot commit with a known token');
select throws_ok($$insert into public.asset_import_chunks(import_run_id,unit_induk_id,chunk_index,start_ordinal,row_count,rows_hash,valuations_hash,completed_by) values(pg_temp.uid(8,5),pg_temp.uid(2,1),-1,-2000,2000,repeat('c',64),repeat('d',64),pg_temp.uid(1,1))$$,'23514',null,'Manifest cannot contain a negative chunk index');
select throws_ok($$insert into public.asset_import_chunks(import_run_id,unit_induk_id,chunk_index,start_ordinal,row_count,rows_hash,valuations_hash,completed_by) values(pg_temp.uid(8,5),pg_temp.uid(2,1),1,0,2000,repeat('c',64),repeat('d',64),pg_temp.uid(1,1))$$,'23514',null,'Manifest start ordinal must match chunk index');
select throws_ok($$insert into public.asset_import_chunks(import_run_id,unit_induk_id,chunk_index,start_ordinal,row_count,rows_hash,valuations_hash,completed_by) values(pg_temp.uid(8,5),pg_temp.uid(2,1),1,2000,1,repeat('z',64),repeat('d',64),pg_temp.uid(1,1))$$,'23514',null,'Manifest requires hexadecimal SHA-256 hashes');
select throws_ok($$select public.commit_asset_import_chunk(pg_temp.uid(1,1),pg_temp.uid(8,5),pg_temp.token(),2,4000,pg_temp.rows(2000,1),pg_temp.vals(2000,1),repeat('c',64),repeat('d',64))$$,'22023',null,'Chunk outside expected range rejected');
select throws_ok($$select public.commit_asset_import_chunk(pg_temp.uid(1,1),pg_temp.uid(8,5),pg_temp.token(),1,1999,pg_temp.rows(2000,1),pg_temp.vals(2000,1),repeat('c',64),repeat('d',64))$$,'22023',null,'Wrong start ordinal rejected');
select throws_ok($$select public.commit_asset_import_chunk(pg_temp.uid(1,1),pg_temp.uid(8,5),pg_temp.token(),0,0,pg_temp.rows(0,2001),pg_temp.vals(0,2001),repeat('c',64),repeat('d',64))$$,'22023',null,'Chunk cannot exceed 2000 pairs');
select throws_ok($$select public.commit_asset_import_chunk(pg_temp.uid(1,1),pg_temp.uid(8,5),pg_temp.token(),1,2000,pg_temp.rows(2000,1),pg_temp.vals(1999,1),repeat('c',64),repeat('d',64))$$,'22023',null,'Unpaired row and valuation rejected');
select throws_ok($$select public.commit_asset_import_chunk(pg_temp.uid(1,1),pg_temp.uid(8,5),pg_temp.token(),1,2000,pg_temp.rows(2000,1),jsonb_set(pg_temp.vals(2000,1),'{0,4}','-1'),repeat('c',64),repeat('d',64))$$,'23514',null,'Valuation failure rolls back paired row and marker');
select is((select count(*) from public.asset_snapshot_rows where import_run_id=pg_temp.uid(8,5)),0::bigint,'Failed commit leaves no rows');
select is((select count(*) from public.asset_import_chunks where import_run_id=pg_temp.uid(8,5)),0::bigint,'Failed commit leaves no marker');
select is(pg_temp.chunk(1),1,'Tail chunk commits paired data and marker');
select is((select row_count from public.asset_import_chunks where import_run_id=pg_temp.uid(8,5) and chunk_index=1),1,'Tail marker persisted');
select is((select count(*) from public.asset_valuations where import_run_id=pg_temp.uid(8,5)),1::bigint,'Tail valuation committed atomically');
select is(pg_temp.chunk(1),1,'Response-lost retry is idempotent');
select throws_ok($$select public.commit_asset_import_chunk(pg_temp.uid(1,1),pg_temp.uid(8,5),pg_temp.token(),1,2000,'[[]]',pg_temp.vals(2000,1),repeat('c',64),repeat('d',64))$$,'22023',null,'Replay still validates packed row shape');
select throws_ok($$select public.commit_asset_import_chunk(pg_temp.uid(1,1),pg_temp.uid(8,5),pg_temp.token(),1,2000,pg_temp.rows(2000,1),pg_temp.vals(1999,1),repeat('c',64),repeat('d',64))$$,'22023',null,'Replay still validates row/valuation pairing');
select is((select count(*) from public.asset_valuations where import_run_id=pg_temp.uid(8,5)),1::bigint,'Identical replay does not duplicate valuations');
select throws_ok($$select public.commit_asset_import_chunk(pg_temp.uid(1,1),pg_temp.uid(8,5),pg_temp.token(),1,2000,pg_temp.rows(2000,1),pg_temp.vals(2000,1),repeat('f',64),repeat('d',64))$$,'22023',null,'Changed replay hash rejected');
select throws_ok($$update public.asset_import_chunks set rows_hash=repeat('f',64) where import_run_id=pg_temp.uid(8,5)$$,'22023',null,'Completed marker cannot be rewritten');
select throws_ok($$select public.finalize_asset_import_run(pg_temp.uid(1,1),pg_temp.uid(8,5),pg_temp.token())$$,'22023',null,'Gap in manifest prevents finalization');
select is(pg_temp.chunk(0),2000,'Full 2000-pair chunk commits');
select is((select count(*) from public.asset_snapshot_rows where import_run_id=pg_temp.uid(8,5)),2001::bigint,'Exact paired row total persisted');
select throws_ok($$select public.finalize_asset_import_run(pg_temp.uid(1,1),pg_temp.uid(8,5),pg_temp.token())$$,'22023',null,'Complete manifest cannot bypass global hash check');
select lives_ok($$select public.release_asset_import_processing(pg_temp.uid(1,1),pg_temp.uid(8,5),pg_temp.token())$$,'Current owner releases lease');
select throws_ok($$select pg_temp.chunk(1)$$,'22023',null,'Released token cannot replay');
create temporary table resume_state as select pg_temp.claim() state;
update lease_evidence set token=(select (state->>'processing_lease_token')::uuid from resume_state) where name='current';
select is((select jsonb_array_length(state->'completed_chunks') from resume_state),2,'Resume reports durable completed manifest');
select is(pg_temp.chunk(0),2000,'Committed chunk replay survives lease handoff');
update public.asset_import_runs r set expected_rows_hash=h.rows_hash,expected_valuations_hash=h.valuations_hash from private.asset_run_hashes(pg_temp.uid(8,5))h where r.id=pg_temp.uid(8,5);
select lives_ok($$select public.finalize_asset_import_run(pg_temp.uid(1,1),pg_temp.uid(8,5),pg_temp.token())$$,'Exact manifest counts and hashes finalize');
select is((select status::text from public.asset_import_runs where id=pg_temp.uid(8,5)),'COMPLETE','Resumable run completed');
select is((select summary->>'rowCount' from public.asset_import_run_metadata where import_run_id=pg_temp.uid(8,5)),'2001','Final summary derives from complete persisted data');
select is((select count(*) from public.audit_events where action='ASSET_IMPORT_FINALIZED' and details->>'import_run_id'=pg_temp.uid(8,5)::text),1::bigint,'Finalization audited once');
select lives_ok($$select public.release_asset_import_processing(pg_temp.uid(1,1),pg_temp.uid(8,5),pg_temp.token())$$,'Owner can release after finalization');
select set_config('request.jwt.claim.sub',pg_temp.uid(1,3)::text,true);
set local role authenticated;
select is((select count(*) from public.asset_import_chunks where import_run_id=pg_temp.uid(8,5)),0::bigint,'Unassigned operator cannot read manifest');
reset role;
select set_config('request.jwt.claim.sub',pg_temp.uid(1,1)::text,true);
set local role authenticated;
select is((select count(*) from public.asset_import_chunks where import_run_id=pg_temp.uid(8,5)),2::bigint,'Assigned operator reads durable manifest');
reset role;
select lives_ok($$select public.claim_asset_import_processing(pg_temp.uid(1,1),pg_temp.uid(6,2),(select mapping_revision from public.import_sessions where id=pg_temp.uid(6,2)),pg_temp.payload(6),null)$$,'Separate resumable run for expired failure');
update public.asset_import_runs set processing_lease_expires_at=clock_timestamp()-interval '1 second' where id=pg_temp.uid(8,6);
select lives_ok($$select public.fail_asset_import_run(pg_temp.uid(1,1),pg_temp.uid(8,6),null)$$,'Expired lease can fail with no token');
select is((select status::text from public.asset_import_runs where id=pg_temp.uid(8,6)),'FAILED','Expired failure is persisted');
select * from finish();
rollback;
