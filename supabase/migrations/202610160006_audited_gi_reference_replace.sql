-- Reference imports use one transaction and an explicit active DIV RST admin.
-- Existing versions must never be overwritten by an unrelated source version.
revoke insert,update,delete,truncate on public.gi_location_references from service_role;
revoke update,delete on public.version_comparisons from service_role;

create function public.replace_gi_location_reference(p_actor_id uuid,p_source_version text,p_source_hash text,p_rows jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare imported_count integer; replaced_count integer; audit_id uuid;
begin
  perform private.assert_asset_actor(p_actor_id,null,true);
  if not exists(select 1 from public.user_role_assignments where user_id=p_actor_id and role='RST_ADMIN') then
    raise exception 'Active RST admin required' using errcode='42501';
  end if;
  if p_source_version is null or btrim(p_source_version)='' or length(p_source_version)>120
    or p_source_hash is null or p_source_hash !~ '^[0-9a-f]{64}$'
    or jsonb_typeof(p_rows) is distinct from 'array' then
    raise exception 'Invalid reference metadata' using errcode='22023';
  end if;
  imported_count:=jsonb_array_length(p_rows);
  if imported_count<1 or imported_count>20000 then raise exception 'Invalid reference size' using errcode='22023'; end if;
  if exists(select 1 from jsonb_array_elements(p_rows) r where
    jsonb_typeof(r) is distinct from 'object'
    or jsonb_typeof(r->'unit_induk_key') is distinct from 'string'
    or jsonb_typeof(r->'upt') is distinct from 'string'
    or jsonb_typeof(r->'nama_gi') is distinct from 'string'
    or jsonb_typeof(r->'latitude') is distinct from 'number'
    or jsonb_typeof(r->'longitude') is distinct from 'number') then
    raise exception 'Invalid reference fields' using errcode='22023';
  end if;
  if exists(select 1 from jsonb_to_recordset(p_rows) as r(unit_induk_key text,upt text,nama_gi text,latitude double precision,longitude double precision) where
    unit_induk_key='' or upt='' or nama_gi=''
    or unit_induk_key<>upper(regexp_replace(btrim(unit_induk_key),'[[:space:]]+',' ','g'))
    or upt<>upper(regexp_replace(btrim(upt),'[[:space:]]+',' ','g'))
    or nama_gi<>upper(regexp_replace(btrim(nama_gi),'[[:space:]]+',' ','g'))
    or latitude not between -90 and 90 or longitude not between -180 and 180
    or not exists(select 1 from public.unit_induk u where upper(regexp_replace(btrim(u.code),'[[:space:]]+',' ','g'))=r.unit_induk_key)) then
    raise exception 'Invalid normalized location or coordinate' using errcode='22023';
  end if;
  if exists(select 1 from jsonb_to_recordset(p_rows) as r(unit_induk_key text,upt text,nama_gi text) group by unit_induk_key,upt,nama_gi having count(*)>1) then
    raise exception 'Duplicate normalized location' using errcode='22023';
  end if;
  -- Serialize replacements. Do not delete anything before all validation passes.
  lock table public.gi_location_references in share row exclusive mode;
  if exists(select 1 from jsonb_to_recordset(p_rows) as r(unit_induk_key text,upt text,nama_gi text)
    join public.gi_location_references g on g.unit_induk_key=r.unit_induk_key and g.upt_key=r.upt and g.nama_gi_key=r.nama_gi
    where g.source_version<>p_source_version) then
    raise exception 'Location belongs to another reference version' using errcode='22023';
  end if;
  delete from public.gi_location_references where source_version=p_source_version;
  get diagnostics replaced_count=row_count;
  insert into public.gi_location_references(unit_induk_id,unit_induk_key,upt,nama_gi,latitude,longitude,source_hash,source_version,updated_by)
    select u.id,r.unit_induk_key,r.upt,r.nama_gi,r.latitude,r.longitude,p_source_hash,p_source_version,p_actor_id
    from jsonb_to_recordset(p_rows) as r(unit_induk_key text,upt text,nama_gi text,latitude double precision,longitude double precision)
    join public.unit_induk u on upper(regexp_replace(btrim(u.code),'[[:space:]]+',' ','g'))=r.unit_induk_key;
  insert into public.audit_events(actor_id,action,target_type,target_id,details)
    values(p_actor_id,'GI_REFERENCE_REPLACED','gi_location_reference',null,jsonb_build_object(
      'source_version',p_source_version,'source_hash',p_source_hash,'row_count',imported_count,'replaced_count',replaced_count)) returning id into audit_id;
  return jsonb_build_object('rowCount',imported_count,'replacedCount',replaced_count,'auditId',audit_id);
end;
$$;
revoke all on function public.replace_gi_location_reference(uuid,text,text,jsonb) from public,anon,authenticated;
grant execute on function public.replace_gi_location_reference(uuid,text,text,jsonb) to service_role;
