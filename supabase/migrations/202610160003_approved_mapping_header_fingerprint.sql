-- Forward-only integration correction: profile lookup uses the normalized
-- header/index fingerprint; a confirmed layout additionally includes canonical
-- assignments and sheet/header coordinates. Keep both in approval evidence.
create function private.asset_header_fingerprint(p_mapping jsonb)
returns text language sql immutable strict set search_path='' as $$
 select encode(extensions.digest('['||coalesce(string_agg(
  '{"columnIndex":'||(c->>'columnIndex')::integer::text||',"normalizedHeader":'||to_json(c->>'normalizedHeader')::text||'}',
  ',' order by (c->>'columnIndex')::integer),'')||']','sha256'),'hex')
 from jsonb_array_elements(p_mapping->'columns')c
$$;
revoke all on function private.asset_header_fingerprint(jsonb) from public,anon,authenticated,service_role;

-- Preserve the validated activation/acknowledgement protocol as an internal
-- implementation. The sole public RPC wraps it in the same transaction and
-- appends optional profile approval only after successful locked activation.
alter function public.review_asset_version(uuid,uuid,text,jsonb,text,uuid[],jsonb,boolean) set schema private;
revoke all on function private.review_asset_version(uuid,uuid,text,jsonb,text,uuid[],jsonb,boolean) from public,anon,authenticated,service_role;
create function public.review_asset_version(p_actor_id uuid,p_version_id uuid,p_action text,p_expected jsonb,p_notes text,p_row_ids uuid[],p_filters jsonb,p_promote_mapping boolean)
returns jsonb language plpgsql security definer set search_path='' as $$
declare result jsonb; s public.import_sessions; r public.asset_import_runs; sheet public.import_sheets; profile_id uuid; header_hash text;
begin
 if p_promote_mapping is null or p_promote_mapping and p_action is distinct from 'ACTIVATE' then
  raise exception 'Mapping promotion requires explicit activation' using errcode='22023'; end if;
 result:=private.review_asset_version(p_actor_id,p_version_id,p_action,p_expected,p_notes,p_row_ids,p_filters,false);
 if not p_promote_mapping then return result; end if;
 -- The internal workflow retains dataset/version/session/run locks until this
 -- outer call ends, so no later mapping or active-base change can intervene.
 select * into s from public.import_sessions where dataset_version_id=p_version_id;
 select * into r from public.asset_import_runs where id=s.current_run_id;
 sheet:=private.assert_asset_mapping(s.id,s.mapping_revision,r.mapping_hash,r.rule_version);
 if jsonb_typeof(sheet.diagnostics->'mapping'->'columns') is distinct from 'array'
  or jsonb_array_length(sheet.diagnostics->'mapping'->'columns')=0
  or exists(select 1 from jsonb_array_elements(sheet.diagnostics->'mapping'->'columns')c where jsonb_typeof(c->'normalizedHeader') is distinct from 'string') then
  raise exception 'Normalized indexed header evidence required' using errcode='22023'; end if;
 header_hash:=private.asset_header_fingerprint(sheet.diagnostics->'mapping');
 insert into public.mapping_profiles(unit_induk_id,name,layout_hash,rule_version,created_by,approved_by,approved_at,source_version_id,mapping)
 values(s.unit_induk_id,'RST approved '||p_version_id,header_hash,r.rule_version,p_actor_id,p_actor_id,now(),p_version_id,sheet.diagnostics->'mapping') returning id into profile_id;
 insert into public.audit_events(actor_id,action,target_type,target_id,details)
 values(p_actor_id,'ASSET_MAPPING_PROFILE_APPROVED','dataset_version',p_version_id,jsonb_build_object(
  'notes',btrim(p_notes),'unit_induk_id',s.unit_induk_id,'import_run_id',r.id,'mapping_profile_id',profile_id,
  'header_fingerprint',header_hash,'confirmed_layout_hash',r.mapping_hash,'rule_version',r.rule_version,'expected',p_expected));
 return result||jsonb_build_object('mappingProfileId',profile_id);
end$$;
revoke all on function public.review_asset_version(uuid,uuid,text,jsonb,text,uuid[],jsonb,boolean) from public,anon,authenticated;
grant execute on function public.review_asset_version(uuid,uuid,text,jsonb,text,uuid[],jsonb,boolean) to service_role;
