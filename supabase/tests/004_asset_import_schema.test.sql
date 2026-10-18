begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
-- Explicit identifier types/descriptions prevent selecting a different pgTAP overload.
select extensions.plan(48);

select extensions.has_enum('public'::name,'asset_import_run_status'::name,'Import run status enum exists'::text);
select extensions.enum_has_labels('public'::name,'asset_import_run_status'::name,array['PROCESSING','FAILED','COMPLETE']::name[],'Enum labels match asset_import_run_status'::text);
select extensions.enum_has_labels('public'::name,'asset_valuation_source'::name,array['SAP_BOOK_VALUE','PROVIDED_ADJUSTED_VALUE','SYSTEM_DEPRECIATION','ESTIMATED_SAME_GI','ESTIMATED_SAME_UPT','ESTIMATED_SAME_UNIT','ESTIMATED_NEAREST_LOCATION','ESTIMATED_NATIONAL','UNRESOLVED']::name[],'Enum labels match asset_valuation_source'::text);
select extensions.has_table('public'::name,name::name,('Persistent import table: '||name)::text) from (values
  ('source_files'),('import_sessions'),('import_sheets'),('mapping_profiles'),('import_column_mappings'),
  ('asset_import_runs'),('asset_snapshot_rows'),('useful_life_rules'),('asset_class_mappings'),
  ('asset_valuations'),('gi_location_references'),('version_comparisons'),('asset_version_changes')) t(name);
select extensions.fk_ok('public'::name,'import_sessions'::name,array['dataset_id','dataset_version_id']::name[],'public'::name,'dataset_versions'::name,array['dataset_id','id']::name[],'Ownership FK import_sessions to dataset_versions'::text);
select extensions.fk_ok('public'::name,'import_sessions'::name,array['dataset_id','unit_induk_id']::name[],'public'::name,'datasets'::name,array['id','unit_induk_id']::name[],'Ownership FK import_sessions to datasets'::text);
select extensions.fk_ok('public'::name,'asset_import_runs'::name,array['import_session_id','unit_induk_id','dataset_version_id']::name[],'public'::name,'import_sessions'::name,array['id','unit_induk_id','dataset_version_id']::name[],'Ownership FK asset_import_runs to import_sessions'::text);
select extensions.fk_ok('public'::name,'asset_snapshot_rows'::name,array['import_run_id','unit_induk_id','dataset_version_id']::name[],'public'::name,'asset_import_runs'::name,array['id','unit_induk_id','dataset_version_id']::name[],'Ownership FK asset_snapshot_rows to asset_import_runs'::text);
select extensions.fk_ok('public'::name,'asset_valuations'::name,array['asset_row_id','import_run_id','unit_induk_id','dataset_version_id']::name[],'public'::name,'asset_snapshot_rows'::name,array['id','import_run_id','unit_induk_id','dataset_version_id']::name[],'Ownership FK asset_valuations to asset_snapshot_rows'::text);
select extensions.col_is_unique('public'::name,'source_files'::name,array['object_path']::name[],'Unique keys on source_files'::text);
select extensions.col_is_unique('public'::name,'import_sessions'::name,array['dataset_version_id']::name[],'Unique keys on import_sessions'::text);
select extensions.col_is_unique('public'::name,'gi_location_references'::name,array['unit_induk_id','upt_key','nama_gi_key']::name[],'Unique keys on gi_location_references'::text);
select extensions.col_is_unique('public'::name,'asset_snapshot_rows'::name,array['import_run_id','import_sheet_id','source_row_number']::name[],'Unique keys on asset_snapshot_rows'::text);
select extensions.has_index('public'::name,'asset_snapshot_rows'::name,'asset_rows_identity_idx'::name,array['import_run_id','no_aset','tid']::name[],'Index asset_rows_identity_idx covers expected columns'::text);
select extensions.has_index('public'::name,'asset_snapshot_rows'::name,'asset_rows_location_idx'::name,array['unit_induk_id','upt','nama_gi']::name[],'Index asset_rows_location_idx covers expected columns'::text);
select extensions.has_index('public'::name,'asset_snapshot_rows'::name,'asset_rows_errors_gin'::name,array['error_codes']::name[],'Index asset_rows_errors_gin covers expected columns'::text);
select extensions.has_index('public'::name,'asset_snapshot_rows'::name,'asset_rows_warnings_gin'::name,array['warning_codes']::name[],'Index asset_rows_warnings_gin covers expected columns'::text);
select extensions.has_trigger('public'::name,'asset_snapshot_rows'::name,'guard_asset_rows_insert'::name,'Snapshot inserts use a statement-level batch guard');
select extensions.has_trigger('public'::name,'asset_valuations'::name,'guard_asset_valuations_insert'::name,'Valuation inserts use a statement-level batch guard');
select extensions.ok(strpos(pg_get_functiondef('private.guard_asset_insert_statement()'::regprocedure),'pg_advisory_xact_lock_shared')>0,'Insert batches share a run-scoped lifecycle lock');
select extensions.ok(strpos(pg_get_functiondef('public.finalize_asset_import_run(uuid,uuid)'::regprocedure),'pg_advisory_xact_lock(')>0,'Finalization takes the exclusive run-scoped lifecycle lock');
select extensions.ok(strpos(pg_get_functiondef('public.fail_asset_import_run(uuid,uuid)'::regprocedure),'pg_advisory_xact_lock(')>0,'Failure takes the exclusive run-scoped lifecycle lock');
select extensions.has_function('public'::name,'insert_asset_import_batch'::name,array['uuid','uuid','jsonb','jsonb']::name[],'Columnar asset batch RPC exists');
select extensions.ok(strpos(regexp_replace(pg_get_functiondef('public.insert_asset_import_batch(uuid,uuid,jsonb,jsonb)'::regprocedure),'[[:space:]]','','g'),'row_count>1000')>0,'Columnar asset RPC enforces the hosted-safe 1000-row limit');
select extensions.has_index('public'::name,'asset_valuations'::name,'asset_valuations_warnings_gin'::name,array['warning_codes']::name[],'Index asset_valuations_warnings_gin covers expected columns'::text);
select extensions.is((select am.amname from pg_class c join pg_namespace n on n.oid=c.relnamespace join pg_am am on am.oid=c.relam
 where n.nspname='public' and c.relname=index_name),'gin'::name,('Issue index uses GIN: '||index_name)::text)
 from (values('asset_rows_errors_gin'),('asset_rows_warnings_gin'),('asset_valuations_warnings_gin')) indexes(index_name);
select extensions.hasnt_column('public'::name,'import_column_mappings'::name,'nilai_abc'::name,'Source table import_column_mappings has no final calculated value'::text);
select extensions.hasnt_column('public'::name,'asset_snapshot_rows'::name,'nilai_abc'::name,'Source table asset_snapshot_rows has no final calculated value'::text);
select extensions.col_type_is('public'::name,'asset_snapshot_rows'::name,'jumlah'::name,'pg_catalog'::name,'numeric'::text,'Typed jumlah column'::text);
select extensions.col_type_is('public'::name,'asset_snapshot_rows'::name,'tanggal_operasi'::name,'pg_catalog'::name,'date'::text,'Typed tanggal_operasi column'::text);
select extensions.col_type_is('public'::name,'asset_snapshot_rows'::name,'error_codes'::name,'pg_catalog'::name,'text[]'::text,'Typed error_codes column'::text);
select extensions.is((select file_size_limit from storage.buckets where id='source-files'),52428800::bigint,'50 MiB limit');
select extensions.is((select public from storage.buckets where id='source-files'),false,'Private XLSX bucket');
select extensions.is((select allowed_mime_types from storage.buckets where id='source-files'),array['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet']::text[],'XLSX MIME only');
select * from extensions.finish();
rollback;
