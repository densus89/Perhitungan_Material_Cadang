begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select no_plan();
-- Test-only convenience: the public RPC itself always requires expected state.
create function pg_temp.submit_current(a uuid,v uuid) returns uuid language sql as $$
 select public.submit_asset_version(a,v,s.current_run_id,s.mapping_revision,r.mapping_hash,m.comparison_base_version_id,m.comparison_id)
 from public.import_sessions s join public.asset_import_runs r on r.id=s.current_run_id
 left join public.asset_import_run_metadata m on m.import_run_id=r.id where s.dataset_version_id=v
$$;
create function pg_temp.review_current(a uuid,v uuid,action text,note text) returns uuid language sql as $$
 select (public.review_asset_version(a,v,action,jsonb_build_object('runId',s.current_run_id,'mappingRevision',s.mapping_revision,'layoutHash',r.mapping_hash,'baseVersionId',m.comparison_base_version_id,'comparisonId',m.comparison_id),note,'{}','{"offset":0,"filter":"ALL"}',false)->>'versionId')::uuid
 from public.import_sessions s join public.asset_import_runs r on r.id=s.current_run_id
 join public.asset_import_run_metadata m on m.import_run_id=r.id where s.dataset_version_id=v
$$;

insert into auth.users(id,email) values ('60000000-0000-4000-8000-000000000001','workflow.operator@pln.co.id'),('60000000-0000-4000-8000-000000000002','workflow.reviewer@pln.co.id');
update public.profiles set status='ACTIVE' where id::text like '60000000-%';
insert into public.user_role_assignments(user_id,role) values ('60000000-0000-4000-8000-000000000001','UNIT_OPERATOR'),('60000000-0000-4000-8000-000000000002','RST_REVIEWER');
insert into public.unit_induk(id,code,name) values('61000000-0000-4000-8000-000000000001','ASSET_WORKFLOW','Workflow');
insert into public.user_unit_assignments(user_id,unit_induk_id) values('60000000-0000-4000-8000-000000000001','61000000-0000-4000-8000-000000000001');
insert into public.datasets(id,unit_induk_id,type) values('62000000-0000-4000-8000-000000000001','61000000-0000-4000-8000-000000000001','ASSET');
insert into public.dataset_versions(id,dataset_id,version_number,status) values
 ('63000000-0000-4000-8000-000000000001','62000000-0000-4000-8000-000000000001',1,'ACTIVE'),
 ('63000000-0000-4000-8000-000000000002','62000000-0000-4000-8000-000000000001',2,'DRAFT');
update public.datasets set active_version_id='63000000-0000-4000-8000-000000000001' where id='62000000-0000-4000-8000-000000000001';
insert into public.source_files(id,unit_induk_id,object_path,original_name,byte_size,sha256,uploaded_by) values('64000000-0000-4000-8000-000000000001','61000000-0000-4000-8000-000000000001','unit/61000000-0000-4000-8000-000000000001/dataset/62000000-0000-4000-8000-000000000001/version/63000000-0000-4000-8000-000000000002/64000000-0000-4000-8000-000000000001.xlsx','synthetic.xlsx',1,repeat('a',64),'60000000-0000-4000-8000-000000000001');
insert into public.import_sessions(id,unit_induk_id,dataset_id,dataset_version_id,source_file_id,created_by) values('65000000-0000-4000-8000-000000000001','61000000-0000-4000-8000-000000000001','62000000-0000-4000-8000-000000000001','63000000-0000-4000-8000-000000000002','64000000-0000-4000-8000-000000000001','60000000-0000-4000-8000-000000000001');
insert into public.import_sheets(id,import_session_id,unit_induk_id,sheet_name,header_row,selected,layout_hash) values('66000000-0000-4000-8000-000000000001','65000000-0000-4000-8000-000000000001','61000000-0000-4000-8000-000000000001','Assets',1,true,repeat('b',64));
update public.import_sheets set diagnostics='{"ruleVersion":"test","mapping":{"columns":[{"columnIndex":1,"header":"NO_ASET","field":"noAset"}]}}' where id='66000000-0000-4000-8000-000000000001';
insert into public.import_column_mappings(import_sheet_id,import_session_id,unit_induk_id,source_column_index,source_header,canonical_field,confidence,confirmed_by,confirmed_at) values('66000000-0000-4000-8000-000000000001','65000000-0000-4000-8000-000000000001','61000000-0000-4000-8000-000000000001',1,'NO_ASET','noAset',1,'60000000-0000-4000-8000-000000000001',now());
-- The previous active snapshot now has real finalized source/run/row evidence.
update public.datasets set active_version_id=null where id='62000000-0000-4000-8000-000000000001';
update public.dataset_versions set status='DRAFT' where id='63000000-0000-4000-8000-000000000001';
insert into public.source_files(id,unit_induk_id,object_path,original_name,byte_size,sha256,uploaded_by) values('64000000-0000-4000-8000-000000000002','61000000-0000-4000-8000-000000000001','unit/61000000-0000-4000-8000-000000000001/dataset/62000000-0000-4000-8000-000000000001/version/63000000-0000-4000-8000-000000000001/64000000-0000-4000-8000-000000000002.xlsx','synthetic-base.xlsx',1,repeat('a',64),'60000000-0000-4000-8000-000000000001');
insert into public.import_sessions(id,unit_induk_id,dataset_id,dataset_version_id,source_file_id,created_by) values('65000000-0000-4000-8000-000000000002','61000000-0000-4000-8000-000000000001','62000000-0000-4000-8000-000000000001','63000000-0000-4000-8000-000000000001','64000000-0000-4000-8000-000000000002','60000000-0000-4000-8000-000000000001');
insert into public.import_sheets(id,import_session_id,unit_induk_id,sheet_name,header_row,selected,layout_hash,diagnostics) select '66000000-0000-4000-8000-000000000002','65000000-0000-4000-8000-000000000002',unit_induk_id,sheet_name,header_row,selected,layout_hash,diagnostics from public.import_sheets where id='66000000-0000-4000-8000-000000000001';
insert into public.import_column_mappings(import_sheet_id,import_session_id,unit_induk_id,source_column_index,source_header,canonical_field,confidence,confirmed_by,confirmed_at) values('66000000-0000-4000-8000-000000000002','65000000-0000-4000-8000-000000000002','61000000-0000-4000-8000-000000000001',1,'NO_ASET','noAset',1,'60000000-0000-4000-8000-000000000001',now());
insert into public.asset_import_runs(id,import_session_id,unit_induk_id,dataset_version_id,created_by,expected_row_count,expected_valuation_count,source_hash,mapping_hash,rule_version,expected_rows_hash,expected_valuations_hash) values('67000000-0000-4000-8000-000000000000','65000000-0000-4000-8000-000000000002','61000000-0000-4000-8000-000000000001','63000000-0000-4000-8000-000000000001','60000000-0000-4000-8000-000000000001',1,1,repeat('a',64),repeat('b',64),'test',repeat('c',64),repeat('d',64));
insert into public.asset_snapshot_rows(id,import_run_id,unit_induk_id,dataset_version_id,import_sheet_id,source_row_number,no_aset) values('68000000-0000-4000-8000-000000000000','67000000-0000-4000-8000-000000000000','61000000-0000-4000-8000-000000000001','63000000-0000-4000-8000-000000000001','66000000-0000-4000-8000-000000000002',2,'BASE');
insert into public.asset_valuations(asset_row_id,import_run_id,unit_induk_id,dataset_version_id,value_source,nilai_abc,calculation_method,age_status,rule_version,as_of) values('68000000-0000-4000-8000-000000000000','67000000-0000-4000-8000-000000000000','61000000-0000-4000-8000-000000000001','63000000-0000-4000-8000-000000000001','SAP_BOOK_VALUE',0,'DIRECT_BOOK_VALUE','PROVIDED_AGE','test','2026-10-15');
update public.asset_import_runs r set expected_rows_hash=h.rows_hash,expected_valuations_hash=h.valuations_hash from private.asset_run_hashes('67000000-0000-4000-8000-000000000000')h where r.id='67000000-0000-4000-8000-000000000000';
select public.finalize_asset_import_run('60000000-0000-4000-8000-000000000001','67000000-0000-4000-8000-000000000000');
update public.dataset_versions set status='ACTIVE' where id='63000000-0000-4000-8000-000000000001';
update public.datasets set active_version_id='63000000-0000-4000-8000-000000000001' where id='62000000-0000-4000-8000-000000000001';
do $$declare n integer; begin for n in 1..2 loop
insert into public.asset_import_runs(id,import_session_id,unit_induk_id,dataset_version_id,created_by,expected_row_count,expected_valuation_count,source_hash,mapping_hash,rule_version,expected_rows_hash,expected_valuations_hash) select
 ('67000000-0000-4000-8000-00000000000'||n)::uuid,'65000000-0000-4000-8000-000000000001','61000000-0000-4000-8000-000000000001','63000000-0000-4000-8000-000000000002','60000000-0000-4000-8000-000000000001',1,1,repeat('a',64),repeat('b',64),'test',repeat('c',64),repeat('d',64);
insert into public.asset_snapshot_rows(id,import_run_id,unit_induk_id,dataset_version_id,import_sheet_id,source_row_number,error_codes,no_aset) select
 ('68000000-0000-4000-8000-00000000000'||n)::uuid,('67000000-0000-4000-8000-00000000000'||n)::uuid,'61000000-0000-4000-8000-000000000001','63000000-0000-4000-8000-000000000002','66000000-0000-4000-8000-000000000001',2,array['MISSING_REQUIRED_FIELD'],'SYNTHETIC';
insert into public.asset_valuations(asset_row_id,import_run_id,unit_induk_id,dataset_version_id,value_source,nilai_abc,calculation_method,age_status,rule_version,as_of) select
 ('68000000-0000-4000-8000-00000000000'||n)::uuid,('67000000-0000-4000-8000-00000000000'||n)::uuid,'61000000-0000-4000-8000-000000000001','63000000-0000-4000-8000-000000000002','SAP_BOOK_VALUE',0,'DIRECT_BOOK_VALUE','PROVIDED_AGE','test','2026-10-15';
 if n=1 then update public.asset_import_runs set status='FAILED',failure_code='BATCH_FAILED' where id='67000000-0000-4000-8000-000000000001'; end if;
end loop; end$$;
select throws_ok($$update public.asset_import_runs set source_hash=repeat('c',64) where id='67000000-0000-4000-8000-000000000002'$$,'22023',null,'Run source digest must match stored file');
select throws_ok($$update public.asset_import_runs set mapping_hash=repeat('c',64) where id='67000000-0000-4000-8000-000000000002'$$,'22023',null,'Run layout digest must match selected mapping');
set local role service_role;
select throws_ok($$select public.finalize_asset_import_run('60000000-0000-4000-8000-000000000001','67000000-0000-4000-8000-000000000001')$$,'22023',null,'Failed run cannot finalize');
select throws_ok($$select public.finalize_asset_import_run('60000000-0000-4000-8000-000000000001','67000000-0000-4000-8000-000000000002')$$,'22023',null,'Mismatched hashes cannot finalize');
reset role;
select is((select current_run_id from public.import_sessions where id='65000000-0000-4000-8000-000000000001'),null::uuid,'Rejected runs never become current');
update public.asset_import_runs r set expected_rows_hash=h.rows_hash,expected_valuations_hash=h.valuations_hash from private.asset_run_hashes('67000000-0000-4000-8000-000000000002') h where r.id='67000000-0000-4000-8000-000000000002';
update public.asset_import_runs set expected_row_count=2,expected_valuation_count=2 where id='67000000-0000-4000-8000-000000000002';
set local role service_role;
select throws_ok($$update public.asset_import_runs set status='COMPLETE',completed_at=now(),finalized_rows_hash=expected_rows_hash,finalized_valuations_hash=expected_valuations_hash where id='67000000-0000-4000-8000-000000000002'$$,'42501',null,'Direct service transition has no UPDATE privilege');
select throws_ok($$select public.finalize_asset_import_run('60000000-0000-4000-8000-000000000001','67000000-0000-4000-8000-000000000002')$$,'22023',null,'Partial batches cannot finalize');
reset role;
update public.asset_import_runs set expected_row_count=1,expected_valuation_count=1 where id='67000000-0000-4000-8000-000000000002';
set local role service_role;
select lives_ok($$select public.finalize_asset_import_run('60000000-0000-4000-8000-000000000001','67000000-0000-4000-8000-000000000002')$$,'Complete matching run finalizes');
select is((select current_run_id from public.import_sessions where id='65000000-0000-4000-8000-000000000001'),'67000000-0000-4000-8000-000000000002'::uuid,'Only successful retry is current');
select throws_ok($$select pg_temp.submit_current('60000000-0000-4000-8000-000000000001','63000000-0000-4000-8000-000000000002')$$,'22023',null,'Blocking row issues prevent submission');
select throws_ok($$update public.asset_snapshot_rows set no_aset='tampered' where id='68000000-0000-4000-8000-000000000002'$$,'42501',null,'Service cannot rewrite finalized snapshot evidence');
reset role;

-- A clean retry replaces the errored finalized snapshot; old batches remain frozen.
insert into public.asset_import_runs(id,import_session_id,unit_induk_id,dataset_version_id,created_by,expected_row_count,expected_valuation_count,source_hash,mapping_hash,rule_version,expected_rows_hash,expected_valuations_hash) values('67000000-0000-4000-8000-000000000003','65000000-0000-4000-8000-000000000001','61000000-0000-4000-8000-000000000001','63000000-0000-4000-8000-000000000002','60000000-0000-4000-8000-000000000001',1,1,repeat('a',64),repeat('b',64),'test',repeat('c',64),repeat('d',64));
insert into public.asset_snapshot_rows(id,import_run_id,unit_induk_id,dataset_version_id,import_sheet_id,source_row_number,no_aset) values('68000000-0000-4000-8000-000000000003','67000000-0000-4000-8000-000000000003','61000000-0000-4000-8000-000000000001','63000000-0000-4000-8000-000000000002','66000000-0000-4000-8000-000000000001',2,'CLEAN');
insert into public.asset_valuations(asset_row_id,import_run_id,unit_induk_id,dataset_version_id,value_source,nilai_abc,calculation_method,age_status,rule_version,as_of) values('68000000-0000-4000-8000-000000000003','67000000-0000-4000-8000-000000000003','61000000-0000-4000-8000-000000000001','63000000-0000-4000-8000-000000000002','SAP_BOOK_VALUE',0,'DIRECT_BOOK_VALUE','PROVIDED_AGE','test','2026-10-15');
update public.asset_valuations set manual_approval_required=true where asset_row_id='68000000-0000-4000-8000-000000000003';
update public.asset_import_runs r set expected_rows_hash=h.rows_hash,expected_valuations_hash=h.valuations_hash from private.asset_run_hashes('67000000-0000-4000-8000-000000000003') h where r.id='67000000-0000-4000-8000-000000000003';
set local role service_role;
select lives_ok($$select public.finalize_asset_import_run('60000000-0000-4000-8000-000000000001','67000000-0000-4000-8000-000000000003')$$);
insert into public.version_comparisons(id,dataset_id,unit_induk_id,from_version_id,to_version_id,from_run_id,to_run_id,summary,created_by) values('69000000-0000-4000-8000-000000000001','62000000-0000-4000-8000-000000000001','61000000-0000-4000-8000-000000000001','63000000-0000-4000-8000-000000000001','63000000-0000-4000-8000-000000000002','67000000-0000-4000-8000-000000000000','67000000-0000-4000-8000-000000000003','{"counts":{"ADDED":1,"REMOVED":1}}','60000000-0000-4000-8000-000000000001');
insert into public.asset_version_changes(comparison_id,unit_induk_id,identity_key,change_kind,from_row_id,to_row_id) values('69000000-0000-4000-8000-000000000001','61000000-0000-4000-8000-000000000001','ASSET:BASE','REMOVED','68000000-0000-4000-8000-000000000000',null),('69000000-0000-4000-8000-000000000001','61000000-0000-4000-8000-000000000001','ASSET:CLEAN','ADDED',null,'68000000-0000-4000-8000-000000000003');
select lives_ok($$select public.complete_asset_import_comparison('60000000-0000-4000-8000-000000000001','67000000-0000-4000-8000-000000000003','63000000-0000-4000-8000-000000000001','69000000-0000-4000-8000-000000000001')$$,'Current active comparison sealed before submission');
select throws_ok($$update public.import_sessions set current_run_id='67000000-0000-4000-8000-000000000002' where id='65000000-0000-4000-8000-000000000001'$$,'42501',null,'Service cannot switch an editable current run outside finalization');
select lives_ok($$select pg_temp.submit_current('60000000-0000-4000-8000-000000000001','63000000-0000-4000-8000-000000000002')$$);
select is((select status::text from public.dataset_versions where id='63000000-0000-4000-8000-000000000002'),'PENDING_RST','Clean version submitted');
select throws_ok($$update public.import_sessions set current_run_id='67000000-0000-4000-8000-000000000002' where id='65000000-0000-4000-8000-000000000001'$$,'42501',null,'Submitted pointer cannot switch to an older errorful COMPLETE run');
reset role;
select throws_ok($$update public.import_sessions set current_run_id='67000000-0000-4000-8000-000000000002' where id='65000000-0000-4000-8000-000000000001'$$,'22023',null,'Pending pointer status guard also protects owner-level writes');
set local role service_role;
select throws_ok($$insert into public.asset_import_runs(id,import_session_id,unit_induk_id,dataset_version_id,created_by,expected_row_count,expected_valuation_count,source_hash,mapping_hash,rule_version,expected_rows_hash,expected_valuations_hash) select '67000000-0000-4000-8000-000000000004',import_session_id,unit_induk_id,dataset_version_id,created_by,expected_row_count,expected_valuation_count,source_hash,mapping_hash,rule_version,expected_rows_hash,expected_valuations_hash from public.asset_import_runs where id='67000000-0000-4000-8000-000000000003'$$,'22023',null,'A processing run cannot be created after submission');
select throws_ok($$select pg_temp.review_current('60000000-0000-4000-8000-000000000002','63000000-0000-4000-8000-000000000002','ACTIVATE','Approve')$$,'22023',null,'Review-required estimates cannot activate unapproved');
select throws_ok($$update public.asset_valuations set approved_by='60000000-0000-4000-8000-000000000001',approved_at=now(),approval_notes='Forged' where asset_row_id='68000000-0000-4000-8000-000000000003'$$,'42501',null,'Unit operator cannot supply valuation approval identity');
select lives_ok($$update public.asset_valuations set approved_by='60000000-0000-4000-8000-000000000002',approved_at=now(),approval_notes='Evidence reviewed' where asset_row_id='68000000-0000-4000-8000-000000000003'$$,'RST can append approval evidence to frozen valuation');
select throws_ok($$update public.asset_valuations set approval_notes='Rewritten' where asset_row_id='68000000-0000-4000-8000-000000000003'$$,'22023',null,'Valuation approval cannot be rewritten');
select is((select finalized_valuations_hash from public.asset_import_runs where id='67000000-0000-4000-8000-000000000003'),(select valuations_hash from private.asset_run_hashes('67000000-0000-4000-8000-000000000003')),'Appending approval does not change calculation hash');
select lives_ok($$select pg_temp.review_current('60000000-0000-4000-8000-000000000002','63000000-0000-4000-8000-000000000002','RETURN','Please verify')$$);
select is((select status::text from public.dataset_versions where id='63000000-0000-4000-8000-000000000002'),'NEEDS_FIX','Reviewer returns with notes');
select lives_ok($$select pg_temp.submit_current('60000000-0000-4000-8000-000000000001','63000000-0000-4000-8000-000000000002')$$);
reset role;

create function pg_temp.fail_asset_audit() returns trigger language plpgsql as $$begin if new.action='ASSET_VERSION_ACTIVATE' then raise exception 'synthetic audit failure'; end if; return new; end;$$;
create trigger synthetic_asset_audit_failure before insert on public.audit_events for each row execute function pg_temp.fail_asset_audit();
set local role service_role;
select throws_ok($$select pg_temp.review_current('60000000-0000-4000-8000-000000000002','63000000-0000-4000-8000-000000000002','ACTIVATE','Approved')$$,'P0001',null,'Audit failure rolls back activation transaction');
select is((select active_version_id from public.datasets where id='62000000-0000-4000-8000-000000000001'),'63000000-0000-4000-8000-000000000001'::uuid,'Pointer unchanged after rollback');
select is((select status::text from public.dataset_versions where id='63000000-0000-4000-8000-000000000001'),'ACTIVE','Previous status rolls back');
select is((select status::text from public.dataset_versions where id='63000000-0000-4000-8000-000000000002'),'PENDING_RST','Candidate status rolls back');
select is((select count(*) from public.approval_events where dataset_version_id='63000000-0000-4000-8000-000000000002' and action='ACTIVATED'),0::bigint,'Approval append also rolls back');
reset role;
drop trigger synthetic_asset_audit_failure on public.audit_events;
set local role service_role;
select lives_ok($$select pg_temp.review_current('60000000-0000-4000-8000-000000000002','63000000-0000-4000-8000-000000000002','ACTIVATE','Approved')$$);
select is((select active_version_id from public.datasets where id='62000000-0000-4000-8000-000000000001'),'63000000-0000-4000-8000-000000000002'::uuid,'Dataset pointer switches atomically');
select is((select status::text from public.dataset_versions where id='63000000-0000-4000-8000-000000000001'),'HISTORICAL','Previous active is historical');
select is((select status::text from public.dataset_versions where id='63000000-0000-4000-8000-000000000002'),'ACTIVE','Candidate is active');
select throws_ok($$update public.import_sessions set current_run_id='67000000-0000-4000-8000-000000000002' where id='65000000-0000-4000-8000-000000000001'$$,'42501',null,'Active current run cannot be switched directly by service');
select throws_ok($$truncate public.asset_valuations$$,'42501',null,'Service cannot truncate active valuations');
select throws_ok($$truncate public.asset_snapshot_rows cascade$$,'42501',null,'Service cannot cascade truncate active snapshot rows');
select is((select count(*) from public.approval_events where dataset_version_id='63000000-0000-4000-8000-000000000002' and action='ACTIVATED'),1::bigint,'Activation approval appended once');
select is((select count(*) from public.audit_events where target_id='63000000-0000-4000-8000-000000000002' and action='ASSET_VERSION_ACTIVATE'),1::bigint,'Activation audited once');
select is((select count(*) from public.approval_events where dataset_version_id='63000000-0000-4000-8000-000000000002' and action='APPROVED'),2::bigint,'Valuation approval and version approval each append an immutable event');
select throws_ok($$update public.approval_events set notes='rewrite' where dataset_version_id='63000000-0000-4000-8000-000000000002'$$,'42501',null,'Even service cannot rewrite approval events');
select throws_ok($$delete from public.audit_events where target_id='63000000-0000-4000-8000-000000000002'$$,'42501',null,'Even service cannot delete audit events');
select throws_ok($$truncate public.audit_events$$,'42501',null,'Service cannot bypass audit immutability with TRUNCATE');
reset role;
select throws_ok($$truncate public.asset_snapshot_rows cascade$$,'42501',null,'Statement guard protects snapshots even with table-owner privileges');
select throws_ok($$update public.import_sessions set current_run_id='67000000-0000-4000-8000-000000000002' where id='65000000-0000-4000-8000-000000000001'$$,'22023',null,'Active pointer status guard also protects owner-level writes');
update public.dataset_versions set status='HISTORICAL' where id='63000000-0000-4000-8000-000000000002';
select throws_ok($$update public.import_sessions set current_run_id='67000000-0000-4000-8000-000000000002' where id='65000000-0000-4000-8000-000000000001'$$,'22023',null,'Historical pointer status guard prevents switching snapshots');
-- Structural concurrency contract; a two-connection runtime race remains a gate.
select ok(replace(pg_get_functiondef('private.lock_asset_version_for_workflow(uuid)'::regprocedure),chr(10),' ') ~* 'public.datasets.*for update.*public.dataset_versions v.*for update.*public.import_sessions.*for update','Shared helper locks dataset, version and session in order');
select ok(replace(pg_get_functiondef('private.guard_asset_run()'::regprocedure),chr(10),' ') ~* 'if tg_op=''INSERT'' then[[:space:]]+perform private[.]lock_asset_version_for_workflow[(]new.dataset_version_id[)]','Run INSERT branch joins the shared parent lock protocol');
select ok(position('private.lock_asset_version_for_workflow(p_version_id)' in pg_get_functiondef('public.submit_asset_version(uuid,uuid,uuid,uuid,text,uuid,uuid)'::regprocedure))>0 and
 position('private.lock_asset_version_for_workflow(p_version_id)' in pg_get_functiondef('public.submit_asset_version(uuid,uuid,uuid,uuid,text,uuid,uuid)'::regprocedure))<position('private.assert_asset_version_ready' in pg_get_functiondef('public.submit_asset_version(uuid,uuid,uuid,uuid,text,uuid,uuid)'::regprocedure)),'Submit locks parents before its readiness check');
select ok(position('private.lock_asset_version_for_workflow(p_version_id)' in pg_get_functiondef('public.activate_asset_version(uuid,uuid,text)'::regprocedure))>0 and
 position('private.lock_asset_version_for_workflow(p_version_id)' in pg_get_functiondef('public.activate_asset_version(uuid,uuid,text)'::regprocedure))<position('private.assert_asset_version_ready' in pg_get_functiondef('public.activate_asset_version(uuid,uuid,text)'::regprocedure)),'Activation locks parents before its readiness check');
select * from finish();
rollback;
