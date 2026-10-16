-- Review fixes: independent bounded display and genuine unprocessed duplicate
-- trash tokens. Existing frozen-run activation/profile guarantees stay intact.
create function private.can_trash_unprocessed_asset_draft(p_version_id uuid)
returns boolean language sql stable security definer set search_path='' as $$
 select exists(
  select 1 from public.dataset_versions v join public.datasets d on d.id=v.dataset_id and d.type='ASSET'
  join public.import_sessions s on s.dataset_version_id=v.id and s.dataset_id=d.id and s.unit_induk_id=d.unit_induk_id
  join public.source_files f on f.id=s.source_file_id and f.unit_induk_id=d.unit_induk_id
  where v.id=p_version_id and v.status='DRAFT' and s.current_run_id is null and d.active_version_id is distinct from v.id
  and not exists(select 1 from public.asset_import_runs r where r.import_session_id=s.id)
  and not exists(select 1 from public.approval_events a where a.dataset_version_id=v.id)
  and not exists(select 1 from public.version_comparisons c where c.from_version_id=v.id or c.to_version_id=v.id)
  and not exists(select 1 from public.asset_import_run_metadata m where m.dataset_version_id=v.id or m.comparison_base_version_id=v.id)
  and not exists(select 1 from public.mapping_profiles p where p.source_version_id=v.id)
  and exists(select 1 from public.import_sessions other join public.source_files other_file on other_file.id=other.source_file_id
   join public.dataset_versions other_version on other_version.id=other.dataset_version_id
   where other.id<>s.id and other.dataset_id=d.id and other.unit_induk_id=d.unit_induk_id
   and other_file.unit_induk_id=d.unit_induk_id and other_file.sha256=f.sha256 and other_version.status<>'TRASH')
 )
$$;
revoke all on function private.can_trash_unprocessed_asset_draft(uuid) from public,anon,authenticated,service_role;

-- A compact authoritative state read. The complete mapping count and confirmed
-- digest are read in SQL; the 16,384-column document never enters this response.
-- Mutation RPCs still revalidate all indexed mappings under workflow locks.
create function public.get_asset_version_review_state(p_version_id uuid)
returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object(
  'versionId',v.id,'versionNumber',v.version_number,'status',v.status,'createdAt',v.created_at,
  'unitId',d.unit_induk_id,'unitName',u.name,'datasetId',d.id,'importId',s.id,'runId',s.current_run_id,'sourceFileId',f.id,
  'fileName',f.original_name,'source',jsonb_build_object('byteSize',f.byte_size,'mimeType',f.mime_type,'sha256',f.sha256),
  'expected',case when s.current_run_id is null then jsonb_build_object('kind','UNPROCESSED_DRAFT','unitId',d.unit_induk_id,'sourceFileId',f.id,'mappingRevision',s.mapping_revision,'updatedAt',v.updated_at)
   else jsonb_build_object('runId',r.id,'mappingRevision',s.mapping_revision,'layoutHash',m.layout_hash,'baseVersionId',m.comparison_base_version_id,'comparisonId',m.comparison_id) end,
  'eligibleDraftTrash',private.can_trash_unprocessed_asset_draft(v.id),'mappingCount',mapping_count.total,
  'mapping',jsonb_build_object('layoutHash',m.layout_hash,'ruleVersion',r.rule_version,'revision',s.mapping_revision,
   'provenance',jsonb_strip_nulls(jsonb_build_object('uploadVerified',m.diagnostics->'uploadVerified','canonicalHash',m.diagnostics->'canonicalHash','layoutHash',m.layout_hash,'ruleVersion',r.rule_version)),
   'columns','[]'::jsonb,'total',mapping_count.total,'offset',0,'hasMore',mapping_count.total>100),
  'summary',coalesce(m.summary,'{}'::jsonb))
 from public.dataset_versions v join public.datasets d on d.id=v.dataset_id and d.type='ASSET'
 join public.unit_induk u on u.id=d.unit_induk_id
 join public.import_sessions s on s.dataset_version_id=v.id and s.dataset_id=d.id and s.unit_induk_id=d.unit_induk_id
 join public.source_files f on f.id=s.source_file_id and f.unit_induk_id=d.unit_induk_id
 left join public.asset_import_runs r on r.id=s.current_run_id and r.import_session_id=s.id and r.unit_induk_id=d.unit_induk_id
 left join public.asset_import_run_metadata m on m.import_run_id=r.id and m.unit_induk_id=d.unit_induk_id
 cross join lateral(select count(*) as total from public.import_column_mappings cm where cm.import_session_id=s.id and cm.unit_induk_id=d.unit_induk_id)mapping_count
 where v.id=p_version_id
$$;
revoke all on function public.get_asset_version_review_state(uuid) from public,anon,authenticated;
grant execute on function public.get_asset_version_review_state(uuid) to service_role;

create or replace function public.review_asset_version(p_actor_id uuid,p_version_id uuid,p_action text,p_expected jsonb,p_notes text,p_row_ids uuid[],p_filters jsonb,p_promote_mapping boolean)
returns jsonb language plpgsql security definer set search_path='' as $$
declare result jsonb; s public.import_sessions; r public.asset_import_runs; sheet public.import_sheets; profile_id uuid; header_hash text;
 v public.dataset_versions; d public.datasets; f public.source_files;
begin
 if p_expected->>'kind'='UNPROCESSED_DRAFT' then
  perform private.lock_asset_version_for_workflow(p_version_id);
  select * into v from public.dataset_versions where id=p_version_id;
  select * into d from public.datasets where id=v.dataset_id;
  perform private.assert_asset_actor(p_actor_id,d.unit_induk_id,true);
  if not exists(select 1 from public.user_role_assignments where user_id=p_actor_id and role='RST_ADMIN')
   or d.unit_induk_id is distinct from (p_expected->>'unitId')::uuid then raise exception 'Admin and exact expected unit required' using errcode='42501'; end if;
  select * into s from public.import_sessions where dataset_version_id=v.id;
  select * into f from public.source_files where id=s.source_file_id;
  if p_action is distinct from 'TRASH' or p_promote_mapping is distinct from false or cardinality(coalesce(p_row_ids,'{}'::uuid[]))<>0
   or nullif(btrim(p_notes),'') is null or length(p_notes)>4000
   or s.source_file_id is distinct from (p_expected->>'sourceFileId')::uuid
   or s.mapping_revision is distinct from (p_expected->>'mappingRevision')::uuid
   or v.updated_at is distinct from (p_expected->>'updatedAt')::timestamptz
   or not private.can_trash_unprocessed_asset_draft(v.id) then raise exception 'Draft is changed, unique, processing or evidence referenced' using errcode='22023'; end if;
  update public.dataset_versions set status='TRASH',updated_at=now() where id=v.id;
  insert into public.approval_events(dataset_version_id,actor_id,action,notes) values(v.id,p_actor_id,'TRASHED',btrim(p_notes));
  insert into public.audit_events(actor_id,action,target_type,target_id,details) values(p_actor_id,'ASSET_VERSION_TRASH','dataset_version',v.id,
   jsonb_build_object('notes',btrim(p_notes),'expected',p_expected,'unit_induk_id',d.unit_induk_id,'source_file_id',f.id,'source_hash',f.sha256,'previous_status','DRAFT','recoverable',true));
  return jsonb_build_object('versionId',v.id,'status','TRASH','previousVersionId',null,'mappingProfileId',null);
 end if;
 if p_promote_mapping is null or p_promote_mapping and p_action is distinct from 'ACTIVATE' then
  raise exception 'Mapping promotion requires explicit activation' using errcode='22023'; end if;
 result:=private.review_asset_version(p_actor_id,p_version_id,p_action,p_expected,p_notes,p_row_ids,p_filters,false);
 if not p_promote_mapping then return result; end if;
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
-- The comparison index supports an independent kind-filtered stable page.
create index asset_version_changes_review_page_idx on public.asset_version_changes(comparison_id,unit_induk_id,change_kind,identity_key,id);
