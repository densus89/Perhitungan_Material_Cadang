begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select plan(27);

select has_enum('public', 'app_role', 'Application roles exist');
select has_enum('public', 'account_status', 'Account statuses exist');
select has_enum('public', 'dataset_type', 'Dataset types exist');
select has_enum('public', 'dataset_status', 'Dataset statuses exist');
select has_enum('public', 'approval_action', 'Approval actions exist');

select has_table('public', 'unit_induk', 'Units exist');
select has_table('public', 'profiles', 'Profiles exist');
select has_table('public', 'user_role_assignments', 'Role assignments exist');
select has_table('public', 'user_unit_assignments', 'Unit assignments exist');
select has_table('public', 'datasets', 'Datasets exist');
select has_table('public', 'dataset_versions', 'Dataset versions exist');
select has_table('public', 'approval_events', 'Approval events exist');
select has_table('public', 'audit_events', 'Audit events exist');

select fk_ok('public', 'profiles', 'id', 'auth', 'users', 'id', 'Profiles reference Auth users');
select fk_ok('public', 'user_role_assignments', 'user_id', 'public', 'profiles', 'id', 'Roles reference profiles');
select fk_ok('public', 'user_unit_assignments', 'user_id', 'public', 'profiles', 'id', 'Assignments reference profiles');
select fk_ok('public', 'user_unit_assignments', 'unit_induk_id', 'public', 'unit_induk', 'id', 'Assignments reference units');
select fk_ok('public', 'datasets', 'unit_induk_id', 'public', 'unit_induk', 'id', 'Datasets reference units');
select fk_ok('public', 'datasets', 'active_version_id', 'public', 'dataset_versions', 'id', 'Active pointer references a version');
select fk_ok('public', 'dataset_versions', 'dataset_id', 'public', 'datasets', 'id', 'Versions reference datasets');
select fk_ok('public', 'dataset_versions', 'created_by', 'public', 'profiles', 'id', 'Version creators reference profiles');
select fk_ok('public', 'approval_events', 'dataset_version_id', 'public', 'dataset_versions', 'id', 'Approvals reference versions');
select fk_ok('public', 'approval_events', 'actor_id', 'public', 'profiles', 'id', 'Approval actors reference profiles');
select fk_ok('public', 'audit_events', 'actor_id', 'public', 'profiles', 'id', 'Audit actors reference profiles');
select col_is_unique('public', 'dataset_versions', array['dataset_id', 'version_number'], 'Version numbers are unique within a dataset');
select is((select count(*) from public.unit_induk where id::text like '00000000-0000-4000-8000-%'), 11::bigint, 'Canonical unit references are deployed by migrations');
select results_eq($sql$ select code from public.unit_induk where id::text like '00000000-0000-4000-8000-%' order by id $sql$,
  $sql$ values ('BABEL'::text), ('MMU'::text), ('NTB'::text), ('NTT'::text), ('P3BKAL'::text), ('P3BS'::text), ('P3BSUL'::text), ('PPB'::text), ('UIT JBB'::text), ('UIT JBM'::text), ('UIT JBT'::text) $sql$,
  'Canonical unit codes and stable ordering match the deployment baseline');

select * from finish();
rollback;
