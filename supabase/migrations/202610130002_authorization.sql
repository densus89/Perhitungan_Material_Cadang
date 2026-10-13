-- The private schema is deliberately absent from the Data API's exposed schemas.
create schema if not exists private;
revoke all on schema private from public, anon, authenticated;
grant usage on schema private to authenticated, service_role;

-- Definer helpers read the assignment tables as their owner, preventing RLS
-- recursion. An inactive or unassigned profile never yields an application role.
create function private.current_app_role()
returns public.app_role
language sql
stable
security definer
set search_path = ''
as $$
  select roles.role
  from public.profiles as profile
  join public.user_role_assignments as roles on roles.user_id = profile.id
  where profile.id = (select auth.uid()) and profile.status = 'ACTIVE';
$$;

create function private.is_rst()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(private.current_app_role() in ('RST_ADMIN', 'RST_REVIEWER'), false);
$$;

create function private.is_rst_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(private.current_app_role() = 'RST_ADMIN', false);
$$;

create function private.can_access_unit(unit_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.is_rst() or (
    coalesce(private.current_app_role() = 'UNIT_OPERATOR', false)
    and exists (
      select 1 from public.user_unit_assignments as assignment
      where assignment.user_id = (select auth.uid())
        and assignment.unit_induk_id = unit_id
    )
  );
$$;

revoke all on function private.current_app_role(), private.is_rst(),
  private.is_rst_admin(), private.can_access_unit(uuid) from public, anon, authenticated;
grant execute on function private.current_app_role(), private.is_rst(),
  private.is_rst_admin(), private.can_access_unit(uuid) to authenticated, service_role;
-- Future private helpers must also be granted explicitly.
alter default privileges in schema private revoke execute on functions from public;

-- Table grants and RLS are independent gates. No client gets account-management,
-- destructive, active-pointer, or event-write privileges. Those audited workflows
-- use the server-only service role, including when the actor is an RST admin.
revoke all on table public.unit_induk, public.profiles,
  public.user_role_assignments, public.user_unit_assignments, public.datasets,
  public.dataset_versions, public.approval_events, public.audit_events
  from public, anon, authenticated;
grant usage on schema public to authenticated, service_role;
grant select on table public.unit_induk, public.profiles,
  public.user_role_assignments, public.user_unit_assignments, public.datasets,
  public.dataset_versions, public.approval_events, public.audit_events
  to authenticated;
grant insert (id, unit_induk_id, type) on public.datasets to authenticated;
grant insert (id, dataset_id, version_number, status, created_by)
  on public.dataset_versions to authenticated;
grant update (status) on public.dataset_versions to authenticated;
grant all on table public.unit_induk, public.profiles,
  public.user_role_assignments, public.user_unit_assignments, public.datasets,
  public.dataset_versions, public.approval_events, public.audit_events
  to service_role;

alter table public.unit_induk enable row level security;
alter table public.profiles enable row level security;
alter table public.user_role_assignments enable row level security;
alter table public.user_unit_assignments enable row level security;
alter table public.datasets enable row level security;
alter table public.dataset_versions enable row level security;
alter table public.approval_events enable row level security;
alter table public.audit_events enable row level security;

create policy unit_induk_read on public.unit_induk
  for select to authenticated
  using ((select private.current_app_role()) is not null);

create policy profiles_read on public.profiles
  for select to authenticated
  using ((select private.is_rst_admin()) or (
    id = (select auth.uid()) and (select private.current_app_role()) is not null
  ));

create policy user_role_assignments_read on public.user_role_assignments
  for select to authenticated
  using ((select private.is_rst_admin()) or (
    user_id = (select auth.uid()) and (select private.current_app_role()) is not null
  ));

create policy user_unit_assignments_read on public.user_unit_assignments
  for select to authenticated
  using ((select private.is_rst_admin()) or (
    user_id = (select auth.uid()) and (select private.current_app_role()) is not null
  ));

create policy datasets_read on public.datasets
  for select to authenticated
  using (private.can_access_unit(unit_induk_id));

create policy datasets_create_draft on public.datasets
  for insert to authenticated
  with check (
    (select private.current_app_role()) = 'UNIT_OPERATOR'
    and private.can_access_unit(unit_induk_id)
    and active_version_id is null
  );

create policy dataset_versions_read on public.dataset_versions
  for select to authenticated
  using (exists (
    select 1 from public.datasets as dataset
    where dataset.id = dataset_id and private.can_access_unit(dataset.unit_induk_id)
  ));

create policy dataset_versions_create_draft on public.dataset_versions
  for insert to authenticated
  with check (
    (select private.current_app_role()) = 'UNIT_OPERATOR'
    and status = 'DRAFT' and created_by = (select auth.uid())
    and exists (
      select 1 from public.datasets as dataset
      where dataset.id = dataset_id and private.can_access_unit(dataset.unit_induk_id)
    )
  );

create policy dataset_versions_update_draft on public.dataset_versions
  for update to authenticated
  using (
    (select private.current_app_role()) = 'UNIT_OPERATOR'
    and status in ('DRAFT', 'NEEDS_FIX', 'READY_TO_SUBMIT')
    and exists (
      select 1 from public.datasets as dataset
      where dataset.id = dataset_id and private.can_access_unit(dataset.unit_induk_id)
    )
  )
  with check (
    (select private.current_app_role()) = 'UNIT_OPERATOR'
    and status in ('DRAFT', 'NEEDS_FIX', 'READY_TO_SUBMIT')
    and exists (
      select 1 from public.datasets as dataset
      where dataset.id = dataset_id and private.can_access_unit(dataset.unit_induk_id)
    )
  );

create policy approval_events_read on public.approval_events
  for select to authenticated
  using (exists (
    select 1 from public.dataset_versions as version
    join public.datasets as dataset on dataset.id = version.dataset_id
    where version.id = dataset_version_id and private.can_access_unit(dataset.unit_induk_id)
  ));

create policy audit_events_read on public.audit_events
  for select to authenticated
  using ((select private.is_rst_admin()));

-- Private placeholder only. Phase 2 will add scoped signed-upload workflows
-- after draft creation; there are intentionally no client object policies here.
insert into storage.buckets (id, name, public)
values ('source-files', 'source-files', false)
on conflict (id) do update set public = false;
