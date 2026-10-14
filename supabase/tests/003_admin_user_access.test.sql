begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select no_plan();

insert into auth.users (id, email, raw_user_meta_data) values
  ('40000000-0000-4000-8000-000000000001', 'admin.rpc@pln.co.id', '{}'),
  ('40000000-0000-4000-8000-000000000002', 'forged.rpc@pln.co.id', '{"role":"RST_ADMIN"}'),
  ('40000000-0000-4000-8000-000000000003', 'target.rpc@pln.co.id', '{}'),
  ('40000000-0000-4000-8000-000000000004', 'residual.rpc@pln.co.id', '{}');
update public.profiles set status = 'ACTIVE' where id in
  ('40000000-0000-4000-8000-000000000001', '40000000-0000-4000-8000-000000000002', '40000000-0000-4000-8000-000000000003');
update public.profiles set status = 'DISABLED' where id = '40000000-0000-4000-8000-000000000004';
insert into public.user_role_assignments (user_id, role) values
  ('40000000-0000-4000-8000-000000000001', 'RST_ADMIN'),
  ('40000000-0000-4000-8000-000000000002', 'VIEWER'),
  ('40000000-0000-4000-8000-000000000003', 'UNIT_OPERATOR'),
  ('40000000-0000-4000-8000-000000000004', 'RST_ADMIN');
insert into public.unit_induk (id, code, name) values ('41000000-0000-4000-8000-000000000001', 'RPC_TEST', 'RPC Unit');
insert into public.user_unit_assignments (user_id, unit_induk_id) values
  ('40000000-0000-4000-8000-000000000003', '41000000-0000-4000-8000-000000000001');

select has_function('public', 'admin_replace_user_access', array['uuid', 'uuid', 'app_role', 'uuid[]', 'account_status'], 'Serialized admin RPC exists');
select ok((select prosecdef and proconfig @> array['search_path=""'] from pg_proc where oid = 'public.admin_replace_user_access(uuid,uuid,public.app_role,uuid[],public.account_status)'::regprocedure), 'RPC pins empty definer search path');
select ok(not has_function_privilege('anon', 'public.admin_replace_user_access(uuid,uuid,public.app_role,uuid[],public.account_status)', 'EXECUTE'), 'Anonymous cannot invoke admin RPC');
select ok(not has_function_privilege('authenticated', 'public.admin_replace_user_access(uuid,uuid,public.app_role,uuid[],public.account_status)', 'EXECUTE'), 'Authenticated admin cannot invoke privileged RPC');
select ok(has_function_privilege('service_role', 'public.admin_replace_user_access(uuid,uuid,public.app_role,uuid[],public.account_status)', 'EXECUTE'), 'Service role can invoke RPC');
select ok((select pg_get_functiondef('public.admin_replace_user_access(uuid,uuid,public.app_role,uuid[],public.account_status)'::regprocedure) like '%for update%'), 'Database target lock serializes overlapping replacements');

set local role service_role;
select is(public.admin_replace_user_access('40000000-0000-4000-8000-000000000002', '40000000-0000-4000-8000-000000000003', 'RST_ADMIN', '{}'::uuid[], 'ACTIVE'), 'FORBIDDEN', 'Forged Auth role cannot supply an admin Actor');
select is(public.admin_replace_user_access('40000000-0000-4000-8000-000000000001', '40000000-0000-4000-8000-000000000001', 'VIEWER', '{}'::uuid[], 'DISABLED'), 'ACCESS_CONFLICT', 'RPC rejects self privilege replacement');
select is(public.admin_replace_user_access('40000000-0000-4000-8000-000000000001', '40000000-0000-4000-8000-000000000003', 'RST_REVIEWER', '{}'::uuid[], 'ACTIVE'), 'UPDATED', 'Atomic replacement succeeds');
reset role;
select is((select status::text from public.profiles where id = '40000000-0000-4000-8000-000000000003'), 'ACTIVE', 'Success restores requested status');
select is((select role::text from public.user_role_assignments where user_id = '40000000-0000-4000-8000-000000000003'), 'RST_REVIEWER', 'Role replaced');
select is((select count(*) from public.user_unit_assignments where user_id = '40000000-0000-4000-8000-000000000003'), 0::bigint, 'Old units replaced');
select is((select count(*) from public.audit_events where target_id = '40000000-0000-4000-8000-000000000003' and action = 'USER_ACCESS_UPDATED'), 1::bigint, 'Required success audit persisted');

-- The second serialized replacement fails after assignment writes; both its
-- success audit and best-effort failure audit are deliberately unavailable.
create function pg_temp.fail_rpc_audit() returns trigger language plpgsql as $$
begin
  if new.action in ('USER_ACCESS_UPDATED', 'USER_ACCESS_UPDATE_FAILED') then
    raise exception 'synthetic audit failure';
  end if;
  return new;
end;
$$;
create trigger rpc_audit_failure before insert on public.audit_events for each row execute function pg_temp.fail_rpc_audit();
set local role service_role;
select is(public.admin_replace_user_access('40000000-0000-4000-8000-000000000001', '40000000-0000-4000-8000-000000000003', 'UNIT_OPERATOR', array['41000000-0000-4000-8000-000000000001']::uuid[], 'ACTIVE'), 'FAILED', 'Failure returns sanitized outcome even when failure audit also fails');
reset role;
select is((select status::text from public.profiles where id = '40000000-0000-4000-8000-000000000003'), 'DISABLED', 'Failed later replacement commits DISABLED');
select is((select role::text from public.user_role_assignments where user_id = '40000000-0000-4000-8000-000000000003'), 'RST_REVIEWER', 'Partial role change rolled back');
select is((select count(*) from public.user_unit_assignments where user_id = '40000000-0000-4000-8000-000000000003'), 0::bigint, 'Partial unit change rolled back');
drop trigger rpc_audit_failure on public.audit_events;

set local role service_role;
select is(public.admin_replace_user_access('40000000-0000-4000-8000-000000000001', '40000000-0000-4000-8000-000000000003', 'UNIT_OPERATOR', '{}'::uuid[], 'ACTIVE'), 'FAILED', 'Database independently requires operator units');
select is(public.admin_replace_user_access('40000000-0000-4000-8000-000000000001', '40000000-0000-4000-8000-000000000003', 'VIEWER', array['41000000-0000-4000-8000-000000000099']::uuid[], 'ACTIVE'), 'FAILED', 'Database rejects forged unit ID');
select is(public.admin_replace_user_access('40000000-0000-4000-8000-000000000001', '40000000-0000-4000-8000-000000000003', 'VIEWER', array['41000000-0000-4000-8000-000000000001','41000000-0000-4000-8000-000000000001']::uuid[], 'ACTIVE'), 'FAILED', 'Database rejects duplicate unit IDs');
reset role;
update public.profiles set status = 'DISABLED' where id = '40000000-0000-4000-8000-000000000001';
set local role service_role;
select is(public.admin_replace_user_access('40000000-0000-4000-8000-000000000001', '40000000-0000-4000-8000-000000000003', 'VIEWER', '{}'::uuid[], 'ACTIVE'), 'FORBIDDEN', 'Disabled relational admin cannot mutate access');
reset role;

-- Residual invited Auth accounts with admin assignments cannot self-activate
-- once failed provisioning stages/retains a DISABLED profile.
select set_config('request.jwt.claim.sub', '40000000-0000-4000-8000-000000000004', true);
set local role authenticated;
select lives_ok($sql$ select public.activate_my_profile() $sql$, 'Disabled residual Auth user cannot use self activation to regain privileges');
select is((select count(*) from public.profiles), 0::bigint, 'Residual disabled admin cannot read application profiles');
reset role;
select is((select status::text from public.profiles where id = '40000000-0000-4000-8000-000000000004'), 'DISABLED', 'Residual admin remains disabled after activation RPC');
select * from finish();
rollback;
