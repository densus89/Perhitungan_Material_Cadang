begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select no_plan();

insert into auth.users(id,email) values
 ('50000000-0000-4000-8000-000000000001','asset.operator.a@pln.co.id'),
 ('50000000-0000-4000-8000-000000000002','asset.operator.b@pln.co.id'),
 ('50000000-0000-4000-8000-000000000003','asset.reviewer@pln.co.id'),
 ('50000000-0000-4000-8000-000000000004','asset.viewer@pln.co.id'),
 ('50000000-0000-4000-8000-000000000005','asset.admin@pln.co.id');
update public.profiles set status='ACTIVE' where id::text like '50000000-%';
insert into public.user_role_assignments(user_id,role) values
 ('50000000-0000-4000-8000-000000000001','UNIT_OPERATOR'),
 ('50000000-0000-4000-8000-000000000002','UNIT_OPERATOR'),
 ('50000000-0000-4000-8000-000000000003','RST_REVIEWER'),
 ('50000000-0000-4000-8000-000000000004','VIEWER'),
 ('50000000-0000-4000-8000-000000000005','RST_ADMIN');
insert into public.unit_induk(id,code,name) values
 ('51000000-0000-4000-8000-000000000001','ASSET_RLS_A','A'),('51000000-0000-4000-8000-000000000002','ASSET_RLS_B','B');
insert into public.user_unit_assignments(user_id,unit_induk_id) values
 ('50000000-0000-4000-8000-000000000001','51000000-0000-4000-8000-000000000001'),
 ('50000000-0000-4000-8000-000000000002','51000000-0000-4000-8000-000000000002');
insert into public.datasets(id,unit_induk_id,type) select
 ('52000000-0000-4000-8000-00000000000'||n)::uuid,('51000000-0000-4000-8000-00000000000'||n)::uuid,'ASSET' from generate_series(1,2) n;
insert into public.dataset_versions(id,dataset_id,version_number) select
 ('53000000-0000-4000-8000-00000000000'||n)::uuid,('52000000-0000-4000-8000-00000000000'||n)::uuid,1 from generate_series(1,2) n;
insert into public.dataset_versions(id,dataset_id,version_number) values('53000000-0000-4000-8000-000000000003','52000000-0000-4000-8000-000000000001',2);
insert into public.source_files(id,unit_induk_id,object_path,original_name,byte_size,sha256,uploaded_by) select
 ('54000000-0000-4000-8000-00000000000'||n)::uuid,('51000000-0000-4000-8000-00000000000'||n)::uuid,
 'unit/51000000-0000-4000-8000-00000000000'||n||'/dataset/52000000-0000-4000-8000-00000000000'||n||'/version/53000000-0000-4000-8000-00000000000'||n||'/54000000-0000-4000-8000-00000000000'||n||'.xlsx','synthetic.xlsx',1,repeat('a',64),('50000000-0000-4000-8000-00000000000'||n)::uuid from generate_series(1,2) n;
insert into public.import_sessions(id,unit_induk_id,dataset_id,dataset_version_id,source_file_id,created_by) select
 ('55000000-0000-4000-8000-00000000000'||n)::uuid,('51000000-0000-4000-8000-00000000000'||n)::uuid,
 ('52000000-0000-4000-8000-00000000000'||n)::uuid,('53000000-0000-4000-8000-00000000000'||n)::uuid,
 ('54000000-0000-4000-8000-00000000000'||n)::uuid,('50000000-0000-4000-8000-00000000000'||n)::uuid from generate_series(1,2) n;
insert into public.import_sheets(id,import_session_id,unit_induk_id,sheet_name,header_row,selected,layout_hash) select
 ('56000000-0000-4000-8000-00000000000'||n)::uuid,('55000000-0000-4000-8000-00000000000'||n)::uuid,('51000000-0000-4000-8000-00000000000'||n)::uuid,'Assets',1,true,repeat('b',64) from generate_series(1,2) n;
insert into public.asset_import_runs(id,import_session_id,unit_induk_id,dataset_version_id,created_by,expected_row_count,expected_valuation_count,source_hash,mapping_hash,rule_version,expected_rows_hash,expected_valuations_hash) select
 ('57000000-0000-4000-8000-00000000000'||n)::uuid,('55000000-0000-4000-8000-00000000000'||n)::uuid,('51000000-0000-4000-8000-00000000000'||n)::uuid,
 ('53000000-0000-4000-8000-00000000000'||n)::uuid,('50000000-0000-4000-8000-00000000000'||n)::uuid,1,1,repeat('a',64),repeat('b',64),'test',repeat('c',64),repeat('d',64) from generate_series(1,2) n;
insert into public.asset_snapshot_rows(id,import_run_id,unit_induk_id,dataset_version_id,import_sheet_id,source_row_number,no_aset) select
 ('58000000-0000-4000-8000-00000000000'||n)::uuid,('57000000-0000-4000-8000-00000000000'||n)::uuid,('51000000-0000-4000-8000-00000000000'||n)::uuid,
 ('53000000-0000-4000-8000-00000000000'||n)::uuid,('56000000-0000-4000-8000-00000000000'||n)::uuid,2,'SYNTHETIC' from generate_series(1,2) n;

select ok(c.relrowsecurity,'RLS enabled: '||c.relname) from pg_class c join pg_namespace n on n.oid=c.relnamespace
 where n.nspname='public' and c.relname in ('source_files','import_sessions','import_sheets','mapping_profiles','import_column_mappings','asset_import_runs','asset_snapshot_rows','useful_life_rules','asset_class_mappings','asset_valuations','gi_location_references','version_comparisons','asset_version_changes');
select is((select count(*) from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relrowsecurity
 and c.relname in ('source_files','import_sessions','import_sheets','mapping_profiles','import_column_mappings','asset_import_runs','asset_snapshot_rows','useful_life_rules','asset_class_mappings','asset_valuations','gi_location_references','version_comparisons','asset_version_changes')),13::bigint,'RLS checks cover all thirteen expected tables');
select ok(not has_table_privilege('service_role','public.'||name,'TRUNCATE'),'Service has no TRUNCATE grant: '||name) from (values
 ('source_files'),('import_sessions'),('import_sheets'),('mapping_profiles'),('import_column_mappings'),('asset_import_runs'),('asset_snapshot_rows'),('useful_life_rules'),('asset_class_mappings'),('asset_valuations'),('gi_location_references'),('version_comparisons'),('asset_version_changes')) t(name);
select ok(not has_column_privilege('service_role','public.import_sessions','current_run_id','UPDATE'),'Service cannot bypass audited finalization by updating current_run_id');
select ok(not has_table_privilege('authenticated','public.'||name,'INSERT,UPDATE,DELETE'),'No direct writes: '||name) from (values
 ('source_files'),('import_sessions'),('import_sheets'),('mapping_profiles'),('import_column_mappings'),('asset_import_runs'),('asset_snapshot_rows'),('useful_life_rules'),('asset_class_mappings'),('asset_valuations'),('gi_location_references'),('version_comparisons'),('asset_version_changes'),('approval_events'),('audit_events')) t(name);
select ok(not has_function_privilege('authenticated',signature,'EXECUTE') and has_function_privilege('service_role',signature,'EXECUTE'),'Service-only RPC: '||signature) from (values
 ('public.finalize_asset_import_run(uuid,uuid)'),('public.submit_asset_version(uuid,uuid,uuid,uuid,text,uuid,uuid)'),('public.return_asset_version(uuid,uuid,text)'),('public.activate_asset_version(uuid,uuid,text)')) t(signature);

select set_config('request.jwt.claim.sub','50000000-0000-4000-8000-000000000001',true);
set local role authenticated;
select is((select count(*) from public.import_sessions where id::text like '55000000-%'),1::bigint,'Operator reads only its draft summary');
select is((select count(*) from public.asset_snapshot_rows where id::text like '58000000-%'),1::bigint,'Operator reads only its rows');
select is((select id from public.asset_snapshot_rows where id::text like '58000000-%'),'58000000-0000-4000-8000-000000000001'::uuid,'Operator A sees A, not B');
select throws_ok($$insert into storage.objects(bucket_id,name) values('source-files','unit/51000000-0000-4000-8000-000000000001/dataset/52000000-0000-4000-8000-000000000001/version/53000000-0000-4000-8000-000000000001/54000000-0000-4000-8000-000000000009.xlsx')$$,'42501',null,'Valid scoped XLSX path is denied by storage authorization');
reset role;
select set_config('request.jwt.claim.sub','50000000-0000-4000-8000-000000000002',true);
set local role authenticated;
select is((select id from public.asset_snapshot_rows where id::text like '58000000-%'),'58000000-0000-4000-8000-000000000002'::uuid,'Operator B sees B, not A');
reset role;
select set_config('request.jwt.claim.sub','50000000-0000-4000-8000-000000000004',true);
set local role authenticated;
select is((select count(*) from public.import_sessions where id::text like '55000000-%'),0::bigint,'Viewer cannot read unit drafts');
select throws_ok($$update public.asset_snapshot_rows set no_aset='forged' where id='58000000-0000-4000-8000-000000000001'$$,'42501',null,'Viewer cannot mutate rows');
reset role;
select set_config('request.jwt.claim.sub','50000000-0000-4000-8000-000000000003',true);
set local role authenticated;
select is((select count(*) from public.asset_snapshot_rows where id::text like '58000000-%'),2::bigint,'RST reviewer reads both units');
reset role;
select set_config('request.jwt.claim.sub','50000000-0000-4000-8000-000000000005',true);
select set_config('request.jwt.claims','{"aal":"aal2"}',true);
set local role authenticated;
select is((select count(*) from public.import_sessions where id::text like '55000000-%'),2::bigint,'RST admin at AAL2 reads both units');
reset role;
set local role service_role;
select throws_ok($$select public.finalize_asset_import_run('50000000-0000-4000-8000-000000000002','57000000-0000-4000-8000-000000000001')$$,'42501',null,'Server RPC rejects other-unit actor');
select throws_ok($$select public.finalize_asset_import_run('50000000-0000-4000-8000-000000000003','57000000-0000-4000-8000-000000000001')$$,'42501',null,'RST cannot masquerade as a unit uploader');
select throws_ok($$select public.submit_asset_version('50000000-0000-4000-8000-000000000004','53000000-0000-4000-8000-000000000001',null,null,null,null,null)$$,'42501',null,'Viewer cannot submit via service RPC');
select throws_ok($$select public.return_asset_version('50000000-0000-4000-8000-000000000001','53000000-0000-4000-8000-000000000001','fix')$$,'42501',null,'Operator cannot return a version');
select throws_ok($$select public.activate_asset_version('50000000-0000-4000-8000-000000000004','53000000-0000-4000-8000-000000000001','approve')$$,'42501',null,'Viewer cannot activate via service RPC');
reset role;
select throws_ok($$update public.asset_import_runs set unit_induk_id='51000000-0000-4000-8000-000000000002' where id='57000000-0000-4000-8000-000000000001'$$,'22023',null,'Run cannot move to another unit');
select throws_ok($$update public.import_sessions set current_run_id='57000000-0000-4000-8000-000000000001' where id='55000000-0000-4000-8000-000000000001'$$,'22023',null,'Processing run cannot become current directly');
select throws_ok($$update public.import_sessions set source_file_id='54000000-0000-4000-8000-000000000002' where id='55000000-0000-4000-8000-000000000001'$$,'22023',null,'Session source ownership cannot change');
select throws_ok($$insert into storage.objects(bucket_id,name) values('source-files','unit/51000000-0000-4000-8000-000000000001/dataset/52000000-0000-4000-8000-000000000001/version/53000000-0000-4000-8000-000000000001/54000000-0000-4000-8000-000000000009.csv')$$,'22023',null,'Non-XLSX extension rejected even at storage database boundary');
select throws_ok($$insert into storage.objects(bucket_id,name) values('source-files','unit/51000000-0000-4000-8000-000000000001/dataset/52000000-0000-4000-8000-000000000001/version/53000000-0000-4000-8000-000000000001/../54000000-0000-4000-8000-000000000009.xlsx')$$,'22023',null,'Storage path traversal is a validation error');
insert into public.gi_location_references(unit_induk_id,unit_induk_key,upt,nama_gi,latitude,longitude,source_hash,source_version,updated_by)
 values('51000000-0000-4000-8000-000000000001','ASSET_RLS_A','  UPT   Alpha ',' GI  Alpha ',0,100,repeat('a',64),'synthetic','50000000-0000-4000-8000-000000000003');
select throws_ok($$update public.gi_location_references set unit_induk_key='OTHER_UNIT' where unit_induk_id='51000000-0000-4000-8000-000000000001'$$,'22023',null,'Coordinate unit label must agree with the relational unit master');
select throws_ok($$insert into public.gi_location_references(unit_induk_id,unit_induk_key,upt,nama_gi,latitude,longitude,source_hash,source_version,updated_by)
 values('51000000-0000-4000-8000-000000000001','ASSET_RLS_A','upt alpha','gi alpha',1,101,repeat('b',64),'synthetic','50000000-0000-4000-8000-000000000003')$$,'23505',null,'Normalized UPT/GI coordinate keys deduplicate case and whitespace');
select throws_ok($$update public.source_files set byte_size=52428801 where id='54000000-0000-4000-8000-000000000001'$$,'23514',null,'Metadata rejects a file above 50 MiB');
select throws_ok($$insert into public.import_sessions(unit_induk_id,dataset_id,dataset_version_id,source_file_id,created_by) values('51000000-0000-4000-8000-000000000002','52000000-0000-4000-8000-000000000001','53000000-0000-4000-8000-000000000003','54000000-0000-4000-8000-000000000001','50000000-0000-4000-8000-000000000001')$$,'23503',null,'Unit and version must belong to the same dataset');
select * from finish();
rollback;
