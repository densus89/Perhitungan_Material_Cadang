begin;
create extension if not exists pgtap with schema extensions;
set local search_path=public,extensions;
select no_plan();
select has_function('public','review_asset_version',array['uuid','uuid','text','jsonb','text','uuid[]','jsonb','boolean'],'Review uses one atomic actor-checked RPC');
select has_function('public','list_asset_version_reviews',array['jsonb'],'Queue filters before bounded pagination');
select ok(not has_table_privilege('service_role','public.version_comparisons','UPDATE'),'No direct comparison update');
select ok(not has_table_privilege('service_role','public.asset_version_changes','DELETE'),'No direct diff delete');
create function pg_temp.uid(k integer,n integer) returns uuid language sql immutable as $$select ('a5170000-'||lpad(k::text,4,'0')||'-4000-8000-'||lpad(n::text,12,'0'))::uuid$$;
insert into auth.users(id,email) values(pg_temp.uid(1,1),'review.operator@pln.co.id'),(pg_temp.uid(1,2),'review.reviewer@pln.co.id'),(pg_temp.uid(1,3),'review.admin@pln.co.id'),(pg_temp.uid(1,4),'review.viewer@pln.co.id');
update public.profiles set status='ACTIVE' where id in(pg_temp.uid(1,1),pg_temp.uid(1,2),pg_temp.uid(1,3),pg_temp.uid(1,4));
insert into public.user_role_assignments(user_id,role) values(pg_temp.uid(1,1),'UNIT_OPERATOR'),(pg_temp.uid(1,2),'RST_REVIEWER'),(pg_temp.uid(1,3),'RST_ADMIN'),(pg_temp.uid(1,4),'VIEWER');
insert into public.unit_induk(id,code,name) values(pg_temp.uid(2,1),'REVIEW_TEST','RST synthetic only');
insert into public.user_unit_assignments(user_id,unit_induk_id) values(pg_temp.uid(1,1),pg_temp.uid(2,1));
insert into public.datasets(id,unit_induk_id,type) values(pg_temp.uid(3,1),pg_temp.uid(2,1),'ASSET');
insert into public.dataset_versions(id,dataset_id,version_number) select pg_temp.uid(4,n),pg_temp.uid(3,1),n from generate_series(1,7)n;
insert into public.source_files(id,unit_induk_id,object_path,original_name,byte_size,sha256,uploaded_by) select pg_temp.uid(5,n),pg_temp.uid(2,1),'unit/'||pg_temp.uid(2,1)||'/dataset/'||pg_temp.uid(3,1)||'/version/'||pg_temp.uid(4,n)||'/'||pg_temp.uid(5,n)||'.xlsx','synthetic-review.xlsx',1,repeat('a',64),pg_temp.uid(1,1) from generate_series(1,7)n;
insert into public.import_sessions(id,unit_induk_id,dataset_id,dataset_version_id,source_file_id,created_by) select pg_temp.uid(6,n),pg_temp.uid(2,1),pg_temp.uid(3,1),pg_temp.uid(4,n),pg_temp.uid(5,n),pg_temp.uid(1,1) from generate_series(1,7)n;
insert into public.import_sheets(id,import_session_id,unit_induk_id,sheet_name,header_row,diagnostics) select pg_temp.uid(7,n),pg_temp.uid(6,n),pg_temp.uid(2,1),'Assets',1,jsonb_build_object('uploadVerified',repeat('a',64)) from generate_series(1,7)n;
create function pg_temp.prepare(n integer,rows_count integer,kind text) returns void language plpgsql as $$
declare run_id uuid:=pg_temp.uid(8,n); revision uuid; base_id uuid; base_run uuid;
begin
 select public.replace_asset_import_mapping(pg_temp.uid(1,1),pg_temp.uid(6,n),pg_temp.uid(7,n),(select mapping_revision from public.import_sessions where id=pg_temp.uid(6,n)),
 '{"sheetName":"Assets","headerRow":1,"columns":[{"columnIndex":1,"columnLetter":"A","header":"NO_ASET","normalizedHeader":"NO ASET","field":"noAset","confidence":1}],"confidence":1,"score":1,"missingRequiredFields":[],"ambiguousFields":[]}',repeat('b',64),repeat('c',64),'test',repeat('a',64)) into revision;
 perform public.reserve_asset_import_run(pg_temp.uid(1,1),pg_temp.uid(6,n),revision,jsonb_build_object('id',run_id,'expected_row_count',rows_count,'expected_valuation_count',rows_count,'source_hash',repeat('a',64),'mapping_hash',repeat('b',64),'rule_version','test','expected_rows_hash',repeat('c',64),'expected_valuations_hash',repeat('d',64)));
 if kind='INCOMPLETE' then return; end if;
 insert into public.asset_snapshot_rows(id,import_run_id,unit_induk_id,dataset_version_id,import_sheet_id,source_row_number,no_aset,nama_peralatan,kondisi_aset,error_codes,warning_codes)
 select pg_temp.uid(10+n,i),run_id,pg_temp.uid(2,1),pg_temp.uid(4,n),pg_temp.uid(7,n),i+1,'TEST-'||i,'SYNTHETIC-'||i,'P2',case when kind='ERROR' then array['FORMULA_ERROR'] else '{}'::text[] end,array['AGE_IMPUTED'] from generate_series(1,rows_count)i;
 insert into public.asset_valuations(asset_row_id,import_run_id,unit_induk_id,dataset_version_id,value_source,nilai_abc,calculation_method,age_status,rule_version,as_of,manual_approval_required)
 select pg_temp.uid(10+n,i),run_id,pg_temp.uid(2,1),pg_temp.uid(4,n),case when kind='UNRESOLVED' then 'UNRESOLVED'::public.asset_valuation_source else 'ESTIMATED_SAME_GI'::public.asset_valuation_source end,case when kind='UNRESOLVED' then null else 100 end,case when kind='UNRESOLVED' then 'UNRESOLVED'::public.asset_calculation_method else 'DIRECT_BOOK_VALUE'::public.asset_calculation_method end,'AGE_IMPUTED','test','2026-10-16',kind in('MANUAL','UNRESOLVED') from generate_series(1,rows_count)i;
 update public.asset_import_runs r0 set expected_rows_hash=h.rows_hash,expected_valuations_hash=h.valuations_hash from private.asset_run_hashes(run_id)h where r0.id=run_id;
 perform public.finalize_asset_import_run(pg_temp.uid(1,1),run_id);
 select active_version_id into base_id from public.datasets where id=pg_temp.uid(3,1);
 if base_id is not null then
  select current_run_id into base_run from public.import_sessions where dataset_version_id=base_id;
  insert into public.version_comparisons(id,dataset_id,unit_induk_id,from_version_id,to_version_id,from_run_id,to_run_id,summary,created_by)
  values(pg_temp.uid(9,n),pg_temp.uid(3,1),pg_temp.uid(2,1),base_id,pg_temp.uid(4,n),base_run,run_id,'{}',pg_temp.uid(1,1));
  insert into public.asset_version_changes(comparison_id,unit_induk_id,identity_key,change_kind,from_row_id,to_row_id)
  select pg_temp.uid(9,n),pg_temp.uid(2,1),'ASSET:'||coalesce(a.no_aset,b.no_aset),case when a.id is null then 'ADDED'::public.asset_change_kind when b.id is null then 'REMOVED'::public.asset_change_kind else 'UNCHANGED'::public.asset_change_kind end,a.id,b.id
  from (select * from public.asset_snapshot_rows where import_run_id=base_run)a full join (select * from public.asset_snapshot_rows where import_run_id=run_id)b using(no_aset);
 end if;
 perform public.complete_asset_import_comparison(pg_temp.uid(1,1),run_id,base_id,case when base_id is null then null else pg_temp.uid(9,n) end);
 -- Deliberately simulate corrupted submitted gates for ERROR/UNRESOLVED defense-in-depth checks.
 update public.dataset_versions set status='PENDING_RST' where id=pg_temp.uid(4,n);
end$$;
create function pg_temp.expected(n integer) returns jsonb language sql as $$select jsonb_build_object('runId',pg_temp.uid(8,n),'mappingRevision',s.mapping_revision,'layoutHash',repeat('b',64),'baseVersionId',m.comparison_base_version_id,'comparisonId',m.comparison_id) from public.import_sessions s left join public.asset_import_run_metadata m on m.import_run_id=s.current_run_id where s.dataset_version_id=pg_temp.uid(4,n)$$;
create function pg_temp.review(n integer,action text default 'ACTIVATE',actor_n integer default 2,ids uuid[] default '{}',options jsonb default '{"offset":0,"filter":"ALL"}',promote boolean default false,note text default 'Synthetic evidence verified') returns jsonb language sql as $$select public.review_asset_version(pg_temp.uid(1,actor_n),pg_temp.uid(4,n),action,pg_temp.expected(n),note,ids,options,promote)$$;
select pg_temp.prepare(1,101,'MANUAL');
select pg_temp.prepare(2,1,'ERROR');
select pg_temp.prepare(3,1,'UNRESOLVED');
select pg_temp.prepare(4,1,'INCOMPLETE');
select pg_temp.prepare(5,1,'DIRECT');
select pg_temp.prepare(6,1,'DIRECT');
select throws_ok($$select pg_temp.review(1,'ACTIVATE',1)$$,'42501',null,'Operator cannot review through service RPC');
select throws_ok($$select pg_temp.review(1,'ACTIVATE',4)$$,'42501',null,'Viewer cannot review through service RPC');
update public.profiles set status='DISABLED' where id=pg_temp.uid(1,2);
select throws_ok($$select pg_temp.review(1)$$,'42501',null,'Disabled reviewer fails closed');
update public.profiles set status='ACTIVE' where id=pg_temp.uid(1,2);
select throws_ok($$select pg_temp.review(2)$$,'22023',null,'Blocking persisted errors reject activation');
select throws_ok($$select pg_temp.review(3)$$,'22023',null,'Unresolved persisted values reject activation');
select throws_ok($$select pg_temp.review(4)$$,'22023',null,'Incomplete run rejects activation');
select throws_ok($$select pg_temp.review(1)$$,'22023',null,'Manual evidence requires acknowledgement');
select throws_ok($$select pg_temp.review(1,'RETURN',2,'{}','{"offset":0,"filter":"ALL"}',false,' ')$$,'22023',null,'Return requires nonempty note');
select throws_ok($$select public.review_asset_version(pg_temp.uid(1,2),pg_temp.uid(4,1),'ACTIVATE',jsonb_set(pg_temp.expected(1),'{runId}',to_jsonb(pg_temp.uid(8,9))),'Synthetic stale','{}','{}',false)$$,'22023',null,'Stale expected run rejects atomically');
select throws_ok($$select pg_temp.review(1,'ACKNOWLEDGE',2,array[pg_temp.uid(11,101)])$$,'22023',null,'Hidden page selection cannot be acknowledged');
select throws_ok($$select pg_temp.review(1,'ACKNOWLEDGE',2,array[pg_temp.uid(11,1)],'{"offset":0,"filter":"ALL","source":"SAP_BOOK_VALUE"}')$$,'22023',null,'Filtered-out selection cannot be acknowledged');
select lives_ok($$select pg_temp.review(1,'ACKNOWLEDGE',2,array(select pg_temp.uid(11,i) from generate_series(1,100)i))$$,'Visible compatible page acknowledgement succeeds');
select throws_ok($$select pg_temp.review(1)$$,'22023',null,'Unacknowledged hidden row still blocks activation');
select lives_ok($$select pg_temp.review(1,'ACKNOWLEDGE',2,array[pg_temp.uid(11,101)],'{"offset":100,"filter":"WARNING","issue":"AGE_IMPUTED"}')$$,'Second visible filtered page can be acknowledged');
create function pg_temp.fail_review_audit() returns trigger language plpgsql as $$begin if new.action='ASSET_VERSION_ACTIVATE' then raise exception 'Synthetic audit outage'; end if; return new; end$$;
create trigger synthetic_review_audit before insert on public.audit_events for each row execute function pg_temp.fail_review_audit();
select throws_ok($$select pg_temp.review(1,'ACTIVATE',2,'{}','{"offset":0,"filter":"ALL"}',true)$$,'P0001',null,'Audit failure rolls back activation and profile promotion');
select is((select count(*) from public.mapping_profiles where source_version_id=pg_temp.uid(4,1)),0::bigint,'No profile remains after failed audited approval');
select is((select status::text from public.dataset_versions where id=pg_temp.uid(4,1)),'PENDING_RST','Failed atomic approval retains pending status');
create or replace function pg_temp.fail_review_audit() returns trigger language plpgsql as $$begin if new.action='ASSET_MAPPING_PROFILE_APPROVED' then raise exception 'Synthetic mapping audit outage'; end if; return new; end$$;
select throws_ok($$select pg_temp.review(1,'ACTIVATE',2,'{}','{"offset":0,"filter":"ALL"}',true)$$,'P0001',null,'Profile approval audit failure rolls back completed activation too');
select is((select status::text from public.dataset_versions where id=pg_temp.uid(4,1)),'PENDING_RST','Late profile audit failure restores pending snapshot');
select is((select count(*) from public.mapping_profiles where source_version_id=pg_temp.uid(4,1)),0::bigint,'Late profile audit failure leaves no reusable profile');
drop trigger synthetic_review_audit on public.audit_events;
select lives_ok($$select pg_temp.review(1,'ACTIVATE',2,'{}','{"offset":0,"filter":"ALL"}',true)$$,'Acknowledged snapshot activates and promotes exact mapping in one transaction');
select is((select active_version_id from public.datasets where id=pg_temp.uid(3,1)),pg_temp.uid(4,1),'Dataset active pointer matches approved version');
select is((select layout_hash from public.mapping_profiles where source_version_id=pg_temp.uid(4,1)),encode(extensions.digest('[{"columnIndex":1,"normalizedHeader":"NO ASET"}]','sha256'),'hex'),'Reusable profile uses existing import header fingerprint contract');
select is((select details->>'header_fingerprint' from public.audit_events where target_id=pg_temp.uid(4,1) and action='ASSET_MAPPING_PROFILE_APPROVED'),encode(extensions.digest('[{"columnIndex":1,"normalizedHeader":"NO ASET"}]','sha256'),'hex'),'Approval audit explicitly records reusable header fingerprint');
select is((select details->>'confirmed_layout_hash' from public.audit_events where target_id=pg_temp.uid(4,1) and action='ASSET_MAPPING_PROFILE_APPROVED'),repeat('b',64),'Audit distinguishes header reuse fingerprint from frozen confirmed layout');
select throws_ok($$select pg_temp.review(5)$$,'22023',null,'Concurrent activation invalidates formerly sealed no-active base');
select throws_ok($$select pg_temp.review(1)$$,'22023',null,'Already active/superseded version cannot reactivate');
select throws_ok($$select pg_temp.review(1,'TRASH',3)$$,'22023',null,'Admin cannot trash active snapshot');
select throws_ok($$select pg_temp.review(6,'TRASH',2)$$,'42501',null,'Reviewer cannot trash');
select lives_ok($$select pg_temp.review(6,'RETURN')$$,'Return is audited and preserves evidence');
select lives_ok($$select pg_temp.review(6,'TRASH',3)$$,'Admin logically trashes returned duplicate');
select is((select count(*) from public.asset_snapshot_rows where dataset_version_id=pg_temp.uid(4,6)),1::bigint,'Trash preserves frozen rows');
select is((select count(*) from public.source_files where id=pg_temp.uid(5,6)),1::bigint,'Trash preserves source evidence');
select is((select status::text from public.dataset_versions where id=pg_temp.uid(4,6)),'TRASH','Trash status is recoverable logical state');
select is((public.list_asset_version_reviews(jsonb_build_object('unitId',pg_temp.uid(2,1),'status','PENDING_RST','issue','FORMULA_ERROR','offset',0,'filter','ERROR'))->>'total')::integer,1,'Queue applies unit/status/issue/error filters before pagination');
select is(jsonb_array_length(public.list_asset_version_reviews(jsonb_build_object('unitId',pg_temp.uid(2,1),'status','ALL','offset',0,'filter','WARNING'))->'versions'),5,'Queue exposes only matching persisted warning aggregates');
select ok(not has_function_privilege('authenticated','public.review_asset_version(uuid,uuid,text,jsonb,text,uuid[],jsonb,boolean)','EXECUTE'),'Browser cannot call privileged review RPC');
select ok(not has_function_privilege('service_role','public.activate_asset_version(uuid,uuid,text)','EXECUTE'),'Legacy activation bypass is not callable by service');
select pg_temp.prepare(7,1,'DIRECT');
select lives_ok($$select pg_temp.review(7,'ACTIVATE',3)$$,'Admin atomically activates comparison against exact current base');
select is((select status::text from public.dataset_versions where id=pg_temp.uid(4,1)),'HISTORICAL','Prior active version moves to history atomically');
select is((select active_version_id from public.datasets where id=pg_temp.uid(3,1)),pg_temp.uid(4,7),'Only the newly approved snapshot remains active');
select is((select count(*) from public.mapping_profiles where source_version_id=pg_temp.uid(4,7)),0::bigint,'Unchecked mapping promotion creates no profile');
select lives_ok($$select pg_temp.review(1,'TRASH',3)$$,'Admin may logically trash history without purging referenced evidence');
select is((select count(*) from public.asset_snapshot_rows where dataset_version_id=pg_temp.uid(4,1)),101::bigint,'Historical trash retains every comparison/approval-referenced row');
select is((select count(*) from public.approval_events where dataset_version_id=pg_temp.uid(4,1) and action='ACTIVATED'),1::bigint,'Historical trash retains activation evidence');
select * from finish();
rollback;
