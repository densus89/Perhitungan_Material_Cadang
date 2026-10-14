-- Phase-one accounts have a stable email identity. Changing an Auth email would
-- otherwise leave relational roles attached to a different human identity.
create or replace function private.prevent_auth_email_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.email is distinct from old.email then
    raise exception using errcode = '22023', message = 'Account email changes are not supported';
  end if;
  return new;
end;
$$;

revoke all on function private.prevent_auth_email_change() from public, anon, authenticated;

drop trigger if exists prevent_auth_email_change on auth.users;
create trigger prevent_auth_email_change
before update of email on auth.users
for each row execute function private.prevent_auth_email_change();

-- This helper intentionally ignores the application role. It lets a valid AAL1
-- admin read only their own profile and role so the app can route them to MFA.
create or replace function private.current_identity_is_active()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.profiles as profile
    join auth.users as identity on identity.id = profile.id
    join public.user_role_assignments as role on role.user_id = profile.id
    where profile.id = (select auth.uid())
      and profile.status = 'ACTIVE'
      and profile.email = lower(btrim(identity.email))
      and (
        profile.email ~ '^[^@[:space:]]+@pln[.]co[.]id$'
        or profile.email = 'sitompul89@gmail.com'
      )
  );
$$;

-- Admin access is available only after TOTP elevation to AAL2. Every role also
-- requires an exact match between the immutable Auth email and profile email.
create or replace function private.current_app_role()
returns public.app_role
language sql
stable
security definer
set search_path = ''
as $$
  select roles.role
  from public.profiles as profile
  join auth.users as identity on identity.id = profile.id
  join public.user_role_assignments as roles on roles.user_id = profile.id
  where profile.id = (select auth.uid())
    and profile.status = 'ACTIVE'
    and profile.email = lower(btrim(identity.email))
    and (
      profile.email ~ '^[^@[:space:]]+@pln[.]co[.]id$'
      or profile.email = 'sitompul89@gmail.com'
    )
    and (roles.role <> 'RST_ADMIN' or (select auth.jwt()->>'aal') = 'aal2');
$$;

revoke all on function private.current_identity_is_active(), private.current_app_role()
  from public, anon, authenticated;
grant execute on function private.current_identity_is_active(), private.current_app_role()
  to authenticated, service_role;

drop policy if exists profiles_read on public.profiles;
create policy profiles_read on public.profiles
  for select to authenticated
  using ((select private.is_rst_admin()) or (
    id = (select auth.uid()) and (select private.current_identity_is_active())
  ));

drop policy if exists user_role_assignments_read on public.user_role_assignments;
create policy user_role_assignments_read on public.user_role_assignments
  for select to authenticated
  using ((select private.is_rst_admin()) or (
    user_id = (select auth.uid()) and (select private.current_identity_is_active())
  ));

-- Reference data belongs in an idempotent migration so `supabase db push`
-- produces a usable hosted database without a separate local seed command.
insert into public.unit_induk (id, code, name)
values
  ('00000000-0000-4000-8000-000000000001', 'BABEL', 'BABEL'),
  ('00000000-0000-4000-8000-000000000002', 'MMU', 'MMU'),
  ('00000000-0000-4000-8000-000000000003', 'NTB', 'NTB'),
  ('00000000-0000-4000-8000-000000000004', 'NTT', 'NTT'),
  ('00000000-0000-4000-8000-000000000005', 'P3BKAL', 'P3BKAL'),
  ('00000000-0000-4000-8000-000000000006', 'P3BS', 'P3BS'),
  ('00000000-0000-4000-8000-000000000007', 'P3BSUL', 'P3BSUL'),
  ('00000000-0000-4000-8000-000000000008', 'PPB', 'PPB'),
  ('00000000-0000-4000-8000-000000000009', 'UIT JBB', 'UIT JBB'),
  ('00000000-0000-4000-8000-000000000010', 'UIT JBM', 'UIT JBM'),
  ('00000000-0000-4000-8000-000000000011', 'UIT JBT', 'UIT JBT')
on conflict (code) do update set name = excluded.name;
