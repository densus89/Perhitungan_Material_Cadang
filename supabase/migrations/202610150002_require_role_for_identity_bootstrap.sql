-- Reading the self profile at AAL1 is needed only for an already assigned user.
-- An active but roleless Auth identity remains fully outside the application.
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
