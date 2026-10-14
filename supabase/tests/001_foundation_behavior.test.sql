begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select no_plan();

select enum_has_labels('public', 'app_role', array['RST_ADMIN', 'RST_REVIEWER', 'UNIT_OPERATOR', 'VIEWER'], 'Exact application roles');
select enum_has_labels('public', 'account_status', array['INVITED', 'ACTIVE', 'DISABLED'], 'Exact account statuses');
select enum_has_labels('public', 'dataset_type', array['ASSET', 'HISTORY', 'PRICE', 'LEAD_TIME', 'LOCATION', 'RFQ_REFERENCE'], 'Exact dataset types');
select enum_has_labels('public', 'dataset_status', array['DRAFT', 'NEEDS_FIX', 'READY_TO_SUBMIT', 'PENDING_RST', 'REJECTED', 'ACTIVE', 'HISTORICAL', 'TRASH'], 'Exact version statuses');
select enum_has_labels('public', 'approval_action', array['SUBMITTED', 'APPROVED', 'REJECTED', 'RETURNED', 'ACTIVATED', 'RESTORED', 'TRASHED', 'PURGED'], 'Exact approval actions');
select has_function('public', 'activate_my_profile', array[]::text[], 'Self-activation RPC exists');

select lives_ok($sql$
  insert into auth.users (id, email, raw_user_meta_data)
  values ('10000000-0000-4000-8000-000000000001', '  FOUNDATION.TEST.ONE@PLN.CO.ID  ', '{"display_name":"  Synthetic One  ","role":"RST_ADMIN"}'::jsonb),
         ('10000000-0000-4000-8000-000000000002', 'foundation.test.two@pln.co.id', '{}'::jsonb);
$sql$, 'Auth creation inserts normalized application profiles');
select results_eq($sql$ select email, display_name, status::text from public.profiles where id = '10000000-0000-4000-8000-000000000001' $sql$,
  $sql$ values ('foundation.test.one@pln.co.id'::text, 'Synthetic One'::text, 'INVITED'::text) $sql$, 'Profile fields are normalized and start invited');
select results_eq($sql$ select count(*) from public.user_role_assignments where user_id in ('10000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000002') $sql$,
  array[0::bigint], 'Auth metadata never assigns a role');

select throws_ok($sql$ insert into auth.users (id, email) values ('10000000-0000-4000-8000-000000000003', 'synthetic@sub.pln.co.id') $sql$, '23514', null, 'Rejects subdomains');
select throws_ok($sql$ insert into auth.users (id, email) values ('10000000-0000-4000-8000-000000000003', 'synthetic@pln.co.id.evil.invalid') $sql$, '23514', null, 'Rejects suffix domains');
select throws_ok($sql$ insert into auth.users (id, email) values ('10000000-0000-4000-8000-000000000003', '@pln.co.id') $sql$, '23514', null, 'Rejects missing local part');
select throws_ok($sql$ update public.profiles set email = 'synthetic@example.invalid' where id = '10000000-0000-4000-8000-000000000001' $sql$, '23514', null, 'Profile updates enforce domain');
select throws_ok($sql$ update public.profiles set email = 'SYNTHETIC@PLN.CO.ID' where id = '10000000-0000-4000-8000-000000000001' $sql$, '23514', null, 'Stored profile email must already be normalized');
select throws_ok($sql$ update auth.users set email = 'foundation.changed@pln.co.id' where id = '10000000-0000-4000-8000-000000000001' $sql$, '22023', null, 'Phase-one identities cannot change email');
select lives_ok($sql$ insert into auth.users (id, email) values ('10000000-0000-4000-8000-000000000004', 'sitompul89@gmail.com') $sql$, 'Allows the single approved Gmail guest');
select throws_ok($sql$ insert into auth.users (id, email) values ('10000000-0000-4000-8000-000000000005', 'other@gmail.com') $sql$, '23514', null, 'Rejects every other Gmail account');

select throws_ok($sql$ select public.activate_my_profile() $sql$, '42501', null, 'Missing authentication cannot activate a profile');
set local role anon;
select throws_ok($sql$ select public.activate_my_profile() $sql$, '42501', null, 'Anonymous role cannot execute self-activation');
reset role;
select set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000001', true);
set local role authenticated;
select lives_ok($sql$ select public.activate_my_profile() $sql$, 'Authenticated invitation can activate');
reset role;
select results_eq($sql$ select status::text from public.profiles where id = '10000000-0000-4000-8000-000000000001' $sql$, array['ACTIVE'::text], 'Only current profile becomes active');
select results_eq($sql$ select status::text from public.profiles where id = '10000000-0000-4000-8000-000000000002' $sql$, array['INVITED'::text], 'Another profile remains invited');
select lives_ok($sql$ select public.activate_my_profile() $sql$, 'Repeated activation is idempotent');
update public.profiles set status = 'DISABLED' where id = '10000000-0000-4000-8000-000000000001';
set local role authenticated;
select lives_ok($sql$ select public.activate_my_profile() $sql$, 'Disabled self-activation safely leaves status alone');
reset role;
select results_eq($sql$ select status::text from public.profiles where id = '10000000-0000-4000-8000-000000000001' $sql$, array['DISABLED'::text], 'Self-activation cannot enable a disabled account');

select is((select count(*)::integer from pg_class c join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relname in ('unit_induk', 'profiles', 'user_role_assignments', 'user_unit_assignments', 'datasets', 'dataset_versions', 'approval_events', 'audit_events') and c.relrowsecurity),
  8, 'All application tables deny access by default with RLS');

select * from finish();
rollback;
