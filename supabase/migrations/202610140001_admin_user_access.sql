-- One database transaction serializes all access replacements for a target,
-- including calls made by different server instances. Client roles cannot call
-- this function; the server must first establish the session Actor.
create function public.admin_replace_user_access(
  p_actor_id uuid,
  p_user_id uuid,
  p_role public.app_role,
  p_unit_induk_ids uuid[],
  p_status public.account_status
) returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  previous_status public.account_status;
begin
  if not exists (
    select 1 from public.profiles as profile
    join public.user_role_assignments as assignment on assignment.user_id = profile.id
    where profile.id = p_actor_id and profile.status = 'ACTIVE'
      and assignment.role = 'RST_ADMIN'
  ) then
    return 'FORBIDDEN';
  end if;
  if p_actor_id = p_user_id then return 'ACCESS_CONFLICT'; end if;

  select status into previous_status from public.profiles
    where id = p_user_id for update;
  if not found then return 'ACCESS_CONFLICT'; end if;
  -- A caller can lose access while waiting for the target row lock.
  if not exists (
    select 1 from public.profiles as profile
    join public.user_role_assignments as assignment on assignment.user_id = profile.id
    where profile.id = p_actor_id and profile.status = 'ACTIVE'
      and assignment.role = 'RST_ADMIN'
  ) then return 'FORBIDDEN'; end if;

  update public.profiles set status = 'DISABLED', updated_at = now()
    where id = p_user_id;

  -- Protected replacement: failure rolls back assignments and success audit,
  -- while the outer DISABLED update and target lock survive the subtransaction.
  begin
    if p_role is null or p_status is null or p_unit_induk_ids is null
      or cardinality(p_unit_induk_ids) > 200
      or cardinality(p_unit_induk_ids) <> (select count(distinct id) from unnest(p_unit_induk_ids) as units(id))
      or cardinality(p_unit_induk_ids) <> (select count(*) from public.unit_induk where id = any(p_unit_induk_ids))
      or (p_role = 'UNIT_OPERATOR' and cardinality(p_unit_induk_ids) = 0)
      or (previous_status = 'INVITED' and p_status = 'ACTIVE')
      or (previous_status <> 'INVITED' and p_status = 'INVITED') then
      raise exception 'Invalid access replacement' using errcode = '22023';
    end if;

    insert into public.user_role_assignments (user_id, role) values (p_user_id, p_role)
      on conflict (user_id) do update set role = excluded.role;
    delete from public.user_unit_assignments where user_id = p_user_id;
    insert into public.user_unit_assignments (user_id, unit_induk_id)
      select p_user_id, id from unnest(p_unit_induk_ids) as units(id);
    insert into public.audit_events (actor_id, action, target_type, target_id, details)
      values (p_actor_id, 'USER_ACCESS_UPDATED', 'profile', p_user_id,
        jsonb_build_object('role', p_role, 'unit_induk_ids', p_unit_induk_ids, 'status', p_status));
    update public.profiles set status = p_status, updated_at = now() where id = p_user_id;
    return 'UPDATED';
  exception when others then
    begin
      insert into public.audit_events (actor_id, action, target_type, target_id, details)
        values (p_actor_id, 'USER_ACCESS_UPDATE_FAILED', 'profile', p_user_id, '{}'::jsonb);
    exception when others then
      null;
    end;
    return 'FAILED';
  end;
end;
$$;

revoke all on function public.admin_replace_user_access(uuid, uuid, public.app_role, uuid[], public.account_status)
  from public, anon, authenticated;
grant execute on function public.admin_replace_user_access(uuid, uuid, public.app_role, uuid[], public.account_status)
  to service_role;
