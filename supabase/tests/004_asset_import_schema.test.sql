begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select no_plan();

select has_enum('public', 'asset_import_run_status');
select enum_has_labels('public', 'asset_import_run_status', array['PROCESSING','FAILED','COMPLETE']);
select enum_has_labels('public', 'asset_valuation_source', array['SAP_BOOK_VALUE','PROVIDED_ADJUSTED_VALUE','SYSTEM_DEPRECIATION','ESTIMATED_SAME_GI','ESTIMATED_SAME_UPT','ESTIMATED_SAME_UNIT','ESTIMATED_NEAREST_LOCATION','ESTIMATED_NATIONAL','UNRESOLVED']);
select has_table('public', name, 'Persistent import table: ' || name) from (values
  ('source_files'),('import_sessions'),('import_sheets'),('mapping_profiles'),('import_column_mappings'),
  ('asset_import_runs'),('asset_snapshot_rows'),('useful_life_rules'),('asset_class_mappings'),
  ('asset_valuations'),('gi_location_references'),('version_comparisons'),('asset_version_changes')) t(name);
select fk_ok('public','import_sessions',array['dataset_id','dataset_version_id'],'public','dataset_versions',array['dataset_id','id']);
select fk_ok('public','import_sessions',array['dataset_id','unit_induk_id'],'public','datasets',array['id','unit_induk_id']);
select fk_ok('public','asset_import_runs',array['import_session_id','unit_induk_id','dataset_version_id'],'public','import_sessions',array['id','unit_induk_id','dataset_version_id']);
select fk_ok('public','asset_snapshot_rows',array['import_run_id','unit_induk_id','dataset_version_id'],'public','asset_import_runs',array['id','unit_induk_id','dataset_version_id']);
select fk_ok('public','asset_valuations',array['asset_row_id','import_run_id','unit_induk_id','dataset_version_id'],'public','asset_snapshot_rows',array['id','import_run_id','unit_induk_id','dataset_version_id']);
select col_is_unique('public','source_files',array['object_path']);
select col_is_unique('public','import_sessions',array['dataset_version_id']);
select col_is_unique('public','gi_location_references',array['unit_induk_id','upt_key','nama_gi_key']);
select col_is_unique('public','asset_snapshot_rows',array['import_run_id','import_sheet_id','source_row_number']);
select has_index('public','asset_snapshot_rows','asset_rows_identity_idx');
select has_index('public','asset_snapshot_rows','asset_rows_location_idx');
select has_index('public','asset_snapshot_rows','asset_rows_errors_gin');
select has_index('public','asset_snapshot_rows','asset_rows_warnings_gin');
select has_index('public','asset_valuations','asset_valuations_warnings_gin');
select hasnt_column('public','import_column_mappings','nilai_abc');
select hasnt_column('public','asset_snapshot_rows','nilai_abc');
select col_type_is('public','asset_snapshot_rows','jumlah','numeric');
select col_type_is('public','asset_snapshot_rows','tanggal_operasi','date');
select col_type_is('public','asset_snapshot_rows','error_codes','text[]');
select is((select file_size_limit from storage.buckets where id='source-files'),52428800::bigint,'50 MiB limit');
select is((select public from storage.buckets where id='source-files'),false,'Private XLSX bucket');
select is((select allowed_mime_types from storage.buckets where id='source-files'),array['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet']::text[],'XLSX MIME only');
select * from finish();
rollback;
