begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select no_plan();

-- These invoker utilities distinguish allowed effects from either RLS-filtered
-- rows or a missing table privilege without aborting the fixture transaction.
create function pg_temp.changed(statement text) returns bigint
language plpgsql as $$
declare affected bigint;
begin
  execute statement;
  get diagnostics affected = row_count;
  return affected;
exception when insufficient_privilege then return -1;
end;
$$;
create function pg_temp.visible(statement text) returns bigint
language plpgsql as $$
declare amount bigint;
begin
  execute statement into amount;
  return amount;
exception when insufficient_privilege then return -1;
end;
$$;

-- Unrelated legitimate records make whole-table fixture counts unsafe. These
-- transaction-only sentinels prove account administration does not break RLS QA.
insert into auth.users (id, email) values
  ('39000000-0000-4000-8000-000000000001', 'rls.unrelated@pln.co.id');
insert into public.audit_events (action, target_type) values ('unrelated_account_event', 'profile');

insert into auth.users (id, email, raw_user_meta_data) values
  ('30000000-0000-4000-8000-000000000001', 'rls.admin@pln.co.id', '{}'),
  ('30000000-0000-4000-8000-000000000002', 'rls.reviewer@pln.co.id', '{}'),
  ('30000000-0000-4000-8000-000000000003', 'rls.operator@pln.co.id', '{"role":"RST_ADMIN"}'),
  ('30000000-0000-4000-8000-000000000004', 'rls.viewer@pln.co.id', '{}'),
  ('30000000-0000-4000-8000-000000000005', 'rls.disabled.admin@pln.co.id', '{}'),
  ('30000000-0000-4000-8000-000000000006', 'rls.disabled.reviewer@pln.co.id', '{}'),
  ('30000000-0000-4000-8000-000000000007', 'rls.disabled.operator@pln.co.id', '{}'),
  ('30000000-0000-4000-8000-000000000008', 'rls.disabled.viewer@pln.co.id', '{}'),
  ('30000000-0000-4000-8000-000000000009', 'rls.invited@pln.co.id', '{}'),
  ('30000000-0000-4000-8000-000000000010', 'rls.roleless@pln.co.id', '{"role":"RST_ADMIN"}');
update public.profiles set status = 'ACTIVE' where id in
  ('30000000-0000-4000-8000-000000000001', '30000000-0000-4000-8000-000000000002',
   '30000000-0000-4000-8000-000000000003', '30000000-0000-4000-8000-000000000004',
   '30000000-0000-4000-8000-000000000010');
update public.profiles set status = 'DISABLED' where id in
  ('30000000-0000-4000-8000-000000000005', '30000000-0000-4000-8000-000000000006',
   '30000000-0000-4000-8000-000000000007', '30000000-0000-4000-8000-000000000008');
insert into public.user_role_assignments (user_id, role) values
  ('30000000-0000-4000-8000-000000000001', 'RST_ADMIN'),
  ('30000000-0000-4000-8000-000000000002', 'RST_REVIEWER'),
  ('30000000-0000-4000-8000-000000000003', 'UNIT_OPERATOR'),
  ('30000000-0000-4000-8000-000000000004', 'VIEWER'),
  ('30000000-0000-4000-8000-000000000005', 'RST_ADMIN'),
  ('30000000-0000-4000-8000-000000000006', 'RST_REVIEWER'),
  ('30000000-0000-4000-8000-000000000007', 'UNIT_OPERATOR'),
  ('30000000-0000-4000-8000-000000000008', 'VIEWER'),
  ('30000000-0000-4000-8000-000000000009', 'RST_ADMIN');
insert into public.unit_induk (id, code, name) values
  ('31000000-0000-4000-8000-000000000001', 'RLS_A', 'Synthetic Unit A'),
  ('31000000-0000-4000-8000-000000000002', 'RLS_B', 'Synthetic Unit B');
insert into public.user_unit_assignments (user_id, unit_induk_id) values
  ('30000000-0000-4000-8000-000000000003', '31000000-0000-4000-8000-000000000001'),
  ('30000000-0000-4000-8000-000000000007', '31000000-0000-4000-8000-000000000002');
insert into public.datasets (id, unit_induk_id, type) values
  ('32000000-0000-4000-8000-000000000001', '31000000-0000-4000-8000-000000000001', 'ASSET'),
  ('32000000-0000-4000-8000-000000000002', '31000000-0000-4000-8000-000000000002', 'ASSET');
insert into public.dataset_versions (id, dataset_id, version_number, status, created_by) values
  ('33000000-0000-4000-8000-000000000001', '32000000-0000-4000-8000-000000000001', 1, 'DRAFT', '30000000-0000-4000-8000-000000000003'),
  ('33000000-0000-4000-8000-000000000002', '32000000-0000-4000-8000-000000000002', 1, 'DRAFT', '30000000-0000-4000-8000-000000000002'),
  ('33000000-0000-4000-8000-000000000003', '32000000-0000-4000-8000-000000000001', 2, 'ACTIVE', '30000000-0000-4000-8000-000000000003');
update public.datasets set active_version_id = '33000000-0000-4000-8000-000000000003'
  where id = '32000000-0000-4000-8000-000000000001';
insert into public.approval_events (dataset_version_id, actor_id, action) values
  ('33000000-0000-4000-8000-000000000003', '30000000-0000-4000-8000-000000000002', 'APPROVED'),
  ('33000000-0000-4000-8000-000000000002', '30000000-0000-4000-8000-000000000002', 'RETURNED');
insert into public.audit_events (actor_id, action, target_type, target_id) values
  ('30000000-0000-4000-8000-000000000001', 'synthetic_fixture', 'dataset', '32000000-0000-4000-8000-000000000001');

select has_function('private', 'current_app_role', array[]::text[], 'Relational role helper exists privately');
select has_function('private', 'is_rst', array[]::text[], 'RST helper exists privately');
select has_function('private', 'is_rst_admin', array[]::text[], 'Admin helper exists privately');
select has_function('private', 'can_access_unit', array['uuid'], 'Unit helper exists privately');
select is((select count(*)::integer from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'private' and p.proname in ('current_app_role', 'is_rst', 'is_rst_admin', 'can_access_unit')
  and p.prosecdef and p.proconfig @> array['search_path=""']), 4, 'Authorization helpers are definers with empty search paths');
select is((select count(*)::integer from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  cross join lateral aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
  where n.nspname = 'private' and a.grantee = 0 and a.privilege_type = 'EXECUTE'),
  0, 'PUBLIC cannot execute private helpers');
select is((select count(*)::integer from pg_class c join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relkind = 'r' and c.relrowsecurity), 8, 'Every phase-1 public table has RLS');
select ok(not has_table_privilege('anon', 'public.' || name, 'SELECT'), 'Anonymous SELECT grant revoked: ' || name)
  from (values ('unit_induk'), ('profiles'), ('user_role_assignments'), ('user_unit_assignments'),
    ('datasets'), ('dataset_versions'), ('approval_events'), ('audit_events')) tables(name);
select is((select count(*) from storage.buckets where id = 'source-files' and not public), 1::bigint, 'Source file bucket exists and is private');

set local role anon;
select ok(pg_temp.visible('select count(*) from public.' || name) <= 0, 'Unauthenticated read denied: ' || name)
  from (values ('unit_induk'), ('profiles'), ('user_role_assignments'), ('user_unit_assignments'),
    ('datasets'), ('dataset_versions'), ('approval_events'), ('audit_events')) tables(name);
select throws_ok($sql$ select private.current_app_role() $sql$, '42501', null, 'Anonymous helper execution denied');
reset role;

select set_config('request.jwt.claim.sub', '30000000-0000-4000-8000-000000000001', true);
set local role authenticated;
select is(pg_temp.visible($sql$ select count(*) from public.profiles where id between '30000000-0000-4000-8000-000000000001' and '30000000-0000-4000-8000-000000000010' $sql$), 10::bigint, 'Admin reads every fixture profile');
select is(pg_temp.visible($sql$ select count(*) from public.user_role_assignments where user_id between '30000000-0000-4000-8000-000000000001' and '30000000-0000-4000-8000-000000000010' $sql$), 9::bigint, 'Admin reads every fixture role');
select is(pg_temp.visible($sql$ select count(*) from public.user_unit_assignments where user_id between '30000000-0000-4000-8000-000000000001' and '30000000-0000-4000-8000-000000000010' $sql$), 2::bigint, 'Admin reads every fixture assignment');
select is(pg_temp.visible($sql$ select count(*) from public.datasets where id in ('32000000-0000-4000-8000-000000000001', '32000000-0000-4000-8000-000000000002') $sql$), 2::bigint, 'Admin reads both fixture units datasets');
select is(pg_temp.visible($sql$ select count(*) from public.dataset_versions where id in ('33000000-0000-4000-8000-000000000001', '33000000-0000-4000-8000-000000000002', '33000000-0000-4000-8000-000000000003') $sql$), 3::bigint, 'Admin reads all fixture versions');
select is(pg_temp.visible($sql$ select count(*) from public.approval_events where dataset_version_id in ('33000000-0000-4000-8000-000000000002', '33000000-0000-4000-8000-000000000003') $sql$), 2::bigint, 'Admin reads all fixture approvals');
select is(pg_temp.visible($sql$ select count(*) from public.audit_events where action = 'synthetic_fixture' and target_id = '32000000-0000-4000-8000-000000000001' $sql$), 1::bigint, 'Admin reads fixture audit history');
select ok(pg_temp.changed($sql$ update public.profiles set status = 'DISABLED' where id = '30000000-0000-4000-8000-000000000002' $sql$) <= 0, 'Even admin client cannot bypass audited profile management');
select ok(pg_temp.changed($sql$ update public.user_role_assignments set role = 'RST_ADMIN' where user_id = '30000000-0000-4000-8000-000000000002' $sql$) <= 0, 'Even admin client cannot directly manage roles');
select ok(pg_temp.changed($sql$ delete from public.user_unit_assignments where user_id = '30000000-0000-4000-8000-000000000003' $sql$) <= 0, 'Even admin client cannot directly manage unit assignments');
select ok(pg_temp.changed($sql$ update public.profiles set status = 'DISABLED' where id = '30000000-0000-4000-8000-000000000001' $sql$) <= 0, 'Admin cannot mutate own status');
select ok(pg_temp.changed($sql$ update public.user_role_assignments set role = 'VIEWER' where user_id = '30000000-0000-4000-8000-000000000001' $sql$) <= 0, 'Admin cannot mutate own privilege');
select throws_ok($sql$ insert into public.audit_events (actor_id, action, target_type) values ('30000000-0000-4000-8000-000000000001', 'forged', 'profile') $sql$, '42501', null, 'Admin cannot append arbitrary audits');
select throws_ok($sql$ insert into public.approval_events (dataset_version_id, actor_id, action) values ('33000000-0000-4000-8000-000000000001', '30000000-0000-4000-8000-000000000001', 'APPROVED') $sql$, '42501', null, 'Admin cannot bypass audited approval workflow');
select throws_ok($sql$ update public.audit_events set action = 'rewritten' $sql$, '42501', null, 'Audit events are immutable');
select throws_ok($sql$ delete from public.audit_events $sql$, '42501', null, 'Audit events cannot be deleted by clients');
select throws_ok($sql$ update public.approval_events set notes = 'rewritten' $sql$, '42501', null, 'Approval decisions are immutable');
select throws_ok($sql$ delete from public.approval_events $sql$, '42501', null, 'Approval decisions cannot be deleted by clients');
select throws_ok($sql$ insert into storage.objects (bucket_id, name) values ('source-files', 'admin-forbidden.csv') $sql$, '42501', null, 'Admin cannot upload source files');
reset role;

select set_config('request.jwt.claim.sub', '30000000-0000-4000-8000-000000000002', true);
set local role authenticated;
select is(pg_temp.visible($sql$ select count(*) from public.datasets where id in ('32000000-0000-4000-8000-000000000001', '32000000-0000-4000-8000-000000000002') $sql$), 2::bigint, 'Reviewer reads both fixture units datasets');
select is(pg_temp.visible($sql$ select count(*) from public.dataset_versions where id in ('33000000-0000-4000-8000-000000000001', '33000000-0000-4000-8000-000000000002', '33000000-0000-4000-8000-000000000003') $sql$), 3::bigint, 'Reviewer reads every fixture version');
select is(pg_temp.visible($sql$ select count(*) from public.approval_events where dataset_version_id in ('33000000-0000-4000-8000-000000000002', '33000000-0000-4000-8000-000000000003') $sql$), 2::bigint, 'Reviewer reads all fixture approval details');
select is(pg_temp.visible('select count(*) from public.profiles'), 1::bigint, 'Reviewer only reads own profile');
select is(pg_temp.visible('select count(*) from public.user_role_assignments'), 1::bigint, 'Reviewer only reads own role');
select is(pg_temp.visible('select count(*) from public.user_unit_assignments'), 0::bigint, 'Reviewer cannot enumerate unit assignments');
select is(pg_temp.visible('select count(*) from public.audit_events'), 0::bigint, 'Reviewer cannot enumerate account audit history');
select ok(pg_temp.changed($sql$ update public.profiles set status = 'DISABLED' $sql$) <= 0, 'Reviewer cannot manage users');
select ok(pg_temp.changed($sql$ delete from public.datasets $sql$) <= 0, 'Reviewer cannot delete datasets');
select ok(pg_temp.changed($sql$ delete from public.dataset_versions $sql$) <= 0, 'Reviewer cannot delete versions');
select throws_ok($sql$ insert into storage.objects (bucket_id, name) values ('source-files', 'reviewer-forbidden.csv') $sql$, '42501', null, 'Reviewer cannot upload source files');
reset role;

select set_config('request.jwt.claim.sub', '30000000-0000-4000-8000-000000000003', true);
set local role authenticated;
select lives_ok($sql$ select private.current_app_role(), private.is_rst(), private.is_rst_admin(), private.can_access_unit('31000000-0000-4000-8000-000000000001') $sql$, 'Authenticated helper use has no policy recursion');
select is(pg_temp.visible('select count(*) from public.datasets'), 1::bigint, 'Operator reads only assigned unit dataset despite forged Auth metadata');
select is(pg_temp.visible('select count(*) from public.dataset_versions'), 2::bigint, 'Operator reads assigned unit draft and active detail');
select is(pg_temp.visible($sql$ select count(*) from public.datasets where unit_induk_id = '31000000-0000-4000-8000-000000000002' $sql$), 0::bigint, 'Cross-unit dataset SELECT denied');
select is(pg_temp.visible($sql$ select count(*) from public.dataset_versions where dataset_id = '32000000-0000-4000-8000-000000000002' $sql$), 0::bigint, 'Cross-unit version SELECT denied');
select is(pg_temp.visible('select count(*) from public.approval_events'), 1::bigint, 'Operator reads only assigned-unit approval history');
select is(pg_temp.visible('select count(*) from public.profiles'), 1::bigint, 'Operator only reads own profile');
select is(pg_temp.visible('select count(*) from public.user_role_assignments'), 1::bigint, 'Operator only reads own role');
select is(pg_temp.visible('select count(*) from public.user_unit_assignments'), 1::bigint, 'Operator reads own unit assignment');
select lives_ok($sql$ insert into public.datasets (id, unit_induk_id, type) values ('32000000-0000-4000-8000-000000000003', '31000000-0000-4000-8000-000000000001', 'HISTORY') $sql$, 'Operator creates metadata for assigned unit');
select throws_ok($sql$ insert into public.datasets (unit_induk_id, type) values ('31000000-0000-4000-8000-000000000002', 'HISTORY') $sql$, '42501', null, 'Cross-unit dataset INSERT denied');
select throws_ok($sql$ insert into public.datasets (unit_induk_id, type, active_version_id) values ('31000000-0000-4000-8000-000000000001', 'PRICE', '33000000-0000-4000-8000-000000000003') $sql$, '42501', null, 'Operator cannot create an active dataset pointer');
select lives_ok($sql$ insert into public.dataset_versions (id, dataset_id, version_number, created_by) values ('33000000-0000-4000-8000-000000000004', '32000000-0000-4000-8000-000000000003', 1, '30000000-0000-4000-8000-000000000003') $sql$, 'Operator creates own assigned-unit draft');
select throws_ok($sql$ insert into public.dataset_versions (dataset_id, version_number, created_by) values ('32000000-0000-4000-8000-000000000002', 2, '30000000-0000-4000-8000-000000000003') $sql$, '42501', null, 'Cross-unit version INSERT denied');
select throws_ok($sql$ insert into public.dataset_versions (dataset_id, version_number, status, created_by) values ('32000000-0000-4000-8000-000000000001', 3, 'ACTIVE', '30000000-0000-4000-8000-000000000003') $sql$, '42501', null, 'Operator cannot create an active version');
select throws_ok($sql$ insert into public.dataset_versions (dataset_id, version_number, created_by) values ('32000000-0000-4000-8000-000000000001', 3, '30000000-0000-4000-8000-000000000001') $sql$, '42501', null, 'Operator cannot impersonate a version creator');
select is(pg_temp.changed($sql$ update public.dataset_versions set status = 'NEEDS_FIX' where id = '33000000-0000-4000-8000-000000000001' $sql$), 1::bigint, 'Operator can revise own assigned-unit draft');
select ok(pg_temp.changed($sql$ update public.dataset_versions set status = 'NEEDS_FIX' where id = '33000000-0000-4000-8000-000000000002' $sql$) <= 0, 'Cross-unit version UPDATE denied');
select ok(pg_temp.changed($sql$ update public.dataset_versions set status = 'DRAFT' where id = '33000000-0000-4000-8000-000000000003' $sql$) <= 0, 'Operator cannot change active version');
select throws_ok($sql$ update public.dataset_versions set status = 'ACTIVE' where id = '33000000-0000-4000-8000-000000000001' $sql$, '42501', null, 'Operator cannot activate a draft');
select throws_ok($sql$ update public.dataset_versions set status = 'PENDING_RST' where id = '33000000-0000-4000-8000-000000000001' $sql$, '42501', null, 'Operator cannot bypass audited submission');
select throws_ok($sql$ update public.dataset_versions set dataset_id = '32000000-0000-4000-8000-000000000002' where id = '33000000-0000-4000-8000-000000000001' $sql$, '42501', null, 'Version dataset lineage cannot be reassigned');
select throws_ok($sql$ update public.dataset_versions set created_by = '30000000-0000-4000-8000-000000000001' where id = '33000000-0000-4000-8000-000000000001' $sql$, '42501', null, 'Version creator cannot be rewritten');
select throws_ok($sql$ update public.dataset_versions set version_number = 9 where id = '33000000-0000-4000-8000-000000000001' $sql$, '42501', null, 'Version number cannot be rewritten');
select ok(pg_temp.changed($sql$ update public.datasets set unit_induk_id = '31000000-0000-4000-8000-000000000002' where id = '32000000-0000-4000-8000-000000000001' $sql$) <= 0, 'Dataset cannot be moved across units');
select ok(pg_temp.changed($sql$ update public.datasets set active_version_id = '33000000-0000-4000-8000-000000000001' where id = '32000000-0000-4000-8000-000000000001' $sql$) <= 0, 'Operator cannot move active pointer');
select ok(pg_temp.changed($sql$ delete from public.dataset_versions where id = '33000000-0000-4000-8000-000000000002' $sql$) <= 0, 'Cross-unit version DELETE denied');
select ok(pg_temp.changed($sql$ delete from public.dataset_versions where id = '33000000-0000-4000-8000-000000000001' $sql$) <= 0, 'Operator cannot delete even own draft');
select ok(pg_temp.changed($sql$ delete from public.datasets where id = '32000000-0000-4000-8000-000000000002' $sql$) <= 0, 'Cross-unit dataset DELETE denied');
select ok(pg_temp.changed($sql$ update public.profiles set status = 'ACTIVE' where id = '30000000-0000-4000-8000-000000000003' $sql$) <= 0, 'Operator cannot mutate own status');
select ok(pg_temp.changed($sql$ update public.user_role_assignments set role = 'RST_ADMIN' where user_id = '30000000-0000-4000-8000-000000000003' $sql$) <= 0, 'Operator cannot elevate own role');
select throws_ok($sql$ insert into public.user_unit_assignments (user_id, unit_induk_id) values ('30000000-0000-4000-8000-000000000003', '31000000-0000-4000-8000-000000000002') $sql$, '42501', null, 'Operator cannot self-assign another unit');
select throws_ok($sql$ insert into public.audit_events (actor_id, action, target_type) values ('30000000-0000-4000-8000-000000000003', 'forged', 'dataset') $sql$, '42501', null, 'Operator cannot append arbitrary audits');
select throws_ok($sql$ insert into storage.objects (bucket_id, name) values ('source-files', 'operator-forbidden.csv') $sql$, '42501', null, 'Operator cannot upload before signed-upload workflow');
reset role;

select set_config('request.jwt.claim.sub', '30000000-0000-4000-8000-000000000004', true);
set local role authenticated;
select is(pg_temp.visible($sql$ select count(*) from public.unit_induk where id in ('31000000-0000-4000-8000-000000000001', '31000000-0000-4000-8000-000000000002') $sql$), 2::bigint, 'Viewer reads both fixture national unit references');
select is(pg_temp.visible('select count(*) from public.profiles'), 1::bigint, 'Viewer reads own profile');
select is(pg_temp.visible('select count(*) from public.datasets'), 0::bigint, 'Viewer cannot read detailed datasets');
select is(pg_temp.visible('select count(*) from public.dataset_versions'), 0::bigint, 'Viewer cannot read detailed versions');
select is(pg_temp.visible('select count(*) from public.approval_events'), 0::bigint, 'Viewer cannot read detailed approval events');
select throws_ok($sql$ insert into public.datasets (unit_induk_id, type) values ('31000000-0000-4000-8000-000000000002', 'PRICE') $sql$, '42501', null, 'Viewer cannot create metadata');
select throws_ok($sql$ insert into storage.objects (bucket_id, name) values ('source-files', 'viewer-forbidden.csv') $sql$, '42501', null, 'Viewer cannot upload source files');
reset role;

-- Every inactive/roleless account is checked against every application table.
-- The roleless user carries forged RST metadata; the invited user has a real role.
select set_config('request.jwt.claim.sub', '30000000-0000-4000-8000-000000000005', true);
set local role authenticated;
select is(pg_temp.visible('select count(*) from public.' || name), 0::bigint, 'Disabled admin loses read: ' || name)
  from (values ('unit_induk'), ('profiles'), ('user_role_assignments'), ('user_unit_assignments'), ('datasets'), ('dataset_versions'), ('approval_events'), ('audit_events')) tables(name);
select throws_ok($sql$ insert into public.datasets (unit_induk_id, type) values ('31000000-0000-4000-8000-000000000002', 'PRICE') $sql$, '42501', null, 'Disabled admin cannot create metadata');
select lives_ok($sql$ select public.activate_my_profile() $sql$, 'Disabled self-activation remains harmless');
reset role;
select is((select status::text from public.profiles where id = '30000000-0000-4000-8000-000000000005'), 'DISABLED', 'Activation RPC cannot revive disabled admin');
select set_config('request.jwt.claim.sub', '30000000-0000-4000-8000-000000000006', true);
set local role authenticated;
select is(pg_temp.visible('select count(*) from public.' || name), 0::bigint, 'Disabled reviewer loses read: ' || name)
  from (values ('unit_induk'), ('profiles'), ('user_role_assignments'), ('user_unit_assignments'), ('datasets'), ('dataset_versions'), ('approval_events'), ('audit_events')) tables(name);
reset role;
select set_config('request.jwt.claim.sub', '30000000-0000-4000-8000-000000000007', true);
set local role authenticated;
select is(pg_temp.visible('select count(*) from public.' || name), 0::bigint, 'Disabled operator loses read: ' || name)
  from (values ('unit_induk'), ('profiles'), ('user_role_assignments'), ('user_unit_assignments'), ('datasets'), ('dataset_versions'), ('approval_events'), ('audit_events')) tables(name);
select throws_ok($sql$ insert into public.datasets (unit_induk_id, type) values ('31000000-0000-4000-8000-000000000002', 'PRICE') $sql$, '42501', null, 'Disabled operator cannot write assigned unit');
reset role;
select set_config('request.jwt.claim.sub', '30000000-0000-4000-8000-000000000008', true);
set local role authenticated;
select is(pg_temp.visible('select count(*) from public.' || name), 0::bigint, 'Disabled viewer loses read: ' || name)
  from (values ('unit_induk'), ('profiles'), ('user_role_assignments'), ('user_unit_assignments'), ('datasets'), ('dataset_versions'), ('approval_events'), ('audit_events')) tables(name);
reset role;
select set_config('request.jwt.claim.sub', '30000000-0000-4000-8000-000000000009', true);
set local role authenticated;
select is(pg_temp.visible('select count(*) from public.' || name), 0::bigint, 'Invited role holder loses read: ' || name)
  from (values ('unit_induk'), ('profiles'), ('user_role_assignments'), ('user_unit_assignments'), ('datasets'), ('dataset_versions'), ('approval_events'), ('audit_events')) tables(name);
reset role;
select set_config('request.jwt.claim.sub', '30000000-0000-4000-8000-000000000010', true);
set local role authenticated;
select is(pg_temp.visible('select count(*) from public.' || name), 0::bigint, 'Auth metadata without relational role grants no read: ' || name)
  from (values ('unit_induk'), ('profiles'), ('user_role_assignments'), ('user_unit_assignments'), ('datasets'), ('dataset_versions'), ('approval_events'), ('audit_events')) tables(name);
reset role;

-- Storage SELECT is tested against an actual object, so missing read policies
-- cannot pass simply because the bucket happens to be empty.
select lives_ok($sql$ insert into storage.objects (bucket_id, name) values ('source-files', 'synthetic-private.csv') $sql$, 'Privileged fixture creates a real private object');
select set_config('request.jwt.claim.sub', '30000000-0000-4000-8000-000000000001', true);
set local role authenticated;
select is(pg_temp.visible($sql$ select count(*) from storage.objects where bucket_id = 'source-files' $sql$), 0::bigint, 'Authenticated clients cannot read source objects');
reset role;
select set_config('request.jwt.claim.sub', '', true);
set local role authenticated;
select is(pg_temp.visible('select count(*) from public.profiles'), 0::bigint, 'Authenticated database role without user identity grants no access');
reset role;
set local role service_role;
select is(pg_temp.visible($sql$ select count(*) from public.profiles where id between '30000000-0000-4000-8000-000000000001' and '30000000-0000-4000-8000-000000000010' $sql$), 10::bigint, 'Server service role retains fixture profile management access');
select lives_ok($sql$ insert into public.audit_events (action, target_type) values ('synthetic_server_event', 'test') $sql$, 'Server can append trusted audit events');
reset role;
select * from finish();
rollback;
