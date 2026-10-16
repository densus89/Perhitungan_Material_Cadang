-- Task 7: expected-state review and activation, recoverable trash, audited mapping approval.
-- Old three-argument activation remains a compatibility function for migration tests,
-- but is no longer callable by the application/service role.
revoke execute on function public.activate_asset_version(uuid,uuid,text),public.return_asset_version(uuid,uuid,text) from service_role;
revoke update,delete on public.version_comparisons,public.asset_version_changes from service_role;

alter table public.mapping_profiles
 add column approved_by uuid references public.profiles(id),
 add column approved_at timestamptz,
 add column source_version_id uuid references public.dataset_versions(id),
 add column mapping jsonb,
 add constraint mapping_profiles_approval_complete check(
   (approved_by is null and approved_at is null and source_version_id is null and mapping is null)
   or (approved_by is not null and approved_at is not null and source_version_id is not null and jsonb_typeof(mapping)='object'));
create index mapping_profiles_approver_idx on public.mapping_profiles(approved_by);
create index mapping_profiles_source_version_idx on public.mapping_profiles(source_version_id);
revoke insert,update,delete on public.mapping_profiles from service_role;

-- Only the privileged server adapter invokes this read, after requireActor + RST authorization.
create function public.list_asset_version_reviews(p_filters jsonb)
returns jsonb language sql stable security definer set search_path='' as $$
 with matching as (
 select v.id as "versionId",v.version_number as "versionNumber",d.unit_induk_id as "unitId",u.name as "unitName",v.status,v.created_at as "createdAt",f.original_name as "fileName"
 from public.dataset_versions v join public.datasets d on d.id=v.dataset_id and d.type='ASSET'
 join public.unit_induk u on u.id=d.unit_induk_id join public.import_sessions s on s.dataset_version_id=v.id
 join public.source_files f on f.id=s.source_file_id
 left join public.asset_import_run_metadata m on m.import_run_id=s.current_run_id
 where (coalesce(p_filters->>'status','PENDING_RST')='ALL' or v.status::text=coalesce(p_filters->>'status','PENDING_RST'))
 and (p_filters->>'unitId' is null or d.unit_induk_id=(p_filters->>'unitId')::uuid)
 and (p_filters->>'issue' is null or coalesce((m.summary->'issueCounts'->>(p_filters->>'issue'))::integer,0)>0)
 and (p_filters->>'source' is null or coalesce((m.summary->'valueSources'->>(p_filters->>'source'))::integer,0)>0)
 and (p_filters->>'condition' is null or coalesce((m.summary->'conditions'->>(p_filters->>'condition'))::integer,0)>0)
 and (coalesce(p_filters->>'filter','ALL')='ALL'
  or p_filters->>'filter'='WARNING' and coalesce((m.summary->>'warningCount')::integer,0)>0
  or p_filters->>'filter'='ERROR' and coalesce((m.summary->>'blockingErrors')::integer,0)>0
  or p_filters->>'filter'='AGE_IMPUTED' and coalesce((m.summary->'issueCounts'->>'AGE_IMPUTED')::integer,0)>0
  or p_filters->>'filter'='ESTIMATED' and exists(select 1 from public.asset_valuations a where a.import_run_id=s.current_run_id and (a.value_source::text like 'ESTIMATED_%' or a.value_source='SYSTEM_DEPRECIATION')))
 and (p_filters->>'search' is null or position(lower(p_filters->>'search') in lower(f.original_name))>0)
 ), page as (select * from matching order by "createdAt" desc,"versionId" limit 50 offset least(greatest(coalesce((p_filters->>'offset')::integer,0),0),10000000))
 select jsonb_build_object('versions',coalesce((select jsonb_agg(to_jsonb(page)) from page),'[]'::jsonb),'total',(select count(*) from matching),'offset',coalesce((p_filters->>'offset')::integer,0))
$$;

create function public.review_asset_version(p_actor_id uuid,p_version_id uuid,p_action text,p_expected jsonb,p_notes text,p_row_ids uuid[],p_filters jsonb,p_promote_mapping boolean)
returns jsonb language plpgsql security definer set search_path='' as $$
declare d public.datasets; v public.dataset_versions; s public.import_sessions; r public.asset_import_runs; m public.asset_import_run_metadata; sheet public.import_sheets;
 profile_id uuid; actor_role public.app_role; visible_ids uuid[]; before_status public.dataset_status; previous_id uuid;
begin
 perform private.lock_asset_version_for_workflow(p_version_id);
 select * into v from public.dataset_versions where id=p_version_id;
 select * into d from public.datasets where id=v.dataset_id;
 perform private.assert_asset_actor(p_actor_id,d.unit_induk_id,true);
 select role into actor_role from public.user_role_assignments where user_id=p_actor_id;
 if d.type<>'ASSET' or p_action not in('ACTIVATE','ACKNOWLEDGE','RETURN','TRASH') or p_action is null
  or nullif(btrim(p_notes),'') is null or length(p_notes)>4000 or p_promote_mapping is null then
  raise exception 'Action and explicit notes required' using errcode='22023'; end if;
 if p_action='TRASH' and actor_role<>'RST_ADMIN' then raise exception 'Admin trash only' using errcode='42501'; end if;
 select * into s from public.import_sessions where dataset_version_id=v.id;
 select * into r from public.asset_import_runs where id=s.current_run_id for update;
 select * into m from public.asset_import_run_metadata where import_run_id=r.id;
 if r.id is null or m.import_run_id is null or p_expected is null
  or r.id is distinct from (p_expected->>'runId')::uuid
  or s.mapping_revision is distinct from (p_expected->>'mappingRevision')::uuid
  or r.mapping_revision is distinct from s.mapping_revision or m.mapping_revision is distinct from s.mapping_revision
  or r.mapping_hash is distinct from p_expected->>'layoutHash' or m.layout_hash is distinct from p_expected->>'layoutHash'
  or m.comparison_base_version_id is distinct from (p_expected->>'baseVersionId')::uuid
  or m.comparison_id is distinct from (p_expected->>'comparisonId')::uuid then
  raise exception 'Review state changed' using errcode='22023'; end if;
 before_status:=v.status; previous_id:=d.active_version_id;
 if p_action='TRASH' then
  if v.status not in('HISTORICAL','NEEDS_FIX','REJECTED','DRAFT','READY_TO_SUBMIT') or d.active_version_id=v.id
   or exists(select 1 from public.asset_import_runs where import_session_id=s.id and status='PROCESSING') then
   raise exception 'Active, pending or processing evidence cannot be trashed' using errcode='22023'; end if;
  -- Logical only: source files, rows, comparisons, approvals and audit evidence remain intact.
  update public.dataset_versions set status='TRASH',updated_at=now() where id=v.id;
  insert into public.approval_events(dataset_version_id,actor_id,action,notes) values(v.id,p_actor_id,'TRASHED',btrim(p_notes));
 elsif p_action='RETURN' then
  if v.status<>'PENDING_RST' then raise exception 'Pending review required' using errcode='22023'; end if;
  update public.dataset_versions set status='NEEDS_FIX',updated_at=now() where id=v.id;
  insert into public.approval_events(dataset_version_id,actor_id,action,notes) values(v.id,p_actor_id,'RETURNED',btrim(p_notes));
 else
  if v.status<>'PENDING_RST' or not m.comparison_ready then raise exception 'Pending sealed review required' using errcode='22023'; end if;
  sheet:=private.assert_asset_mapping(s.id,s.mapping_revision,r.mapping_hash,r.rule_version);
  perform private.assert_asset_version_ready(v.id,false);
  perform private.assert_asset_comparison(r.id,m.comparison_base_version_id,m.comparison_id);
  if p_action='ACKNOWLEDGE' then
   if p_promote_mapping or p_row_ids is null or cardinality(p_row_ids)<1 or cardinality(p_row_ids)>100
    or cardinality(p_row_ids)<>(select count(distinct x) from unnest(p_row_ids)x)
    or p_filters is null or coalesce((p_filters->>'offset')::integer,-1) not between 0 and 10000000
    or coalesce(p_filters->>'filter','') not in('ALL','WARNING','ERROR','ESTIMATED','AGE_IMPUTED') then
    raise exception 'Bounded visible selection required' using errcode='22023'; end if;
   select array_agg(id) into visible_ids from (
    select a.id from public.asset_snapshot_rows a join public.asset_valuations av on av.asset_row_id=a.id
    where a.import_run_id=r.id and a.unit_induk_id=d.unit_induk_id
    and (p_filters->>'issue' is null or p_filters->>'issue'=any(a.error_codes||a.warning_codes))
    and (p_filters->>'source' is null or av.value_source::text=p_filters->>'source')
    and (p_filters->>'condition' is null or coalesce(a.kondisi_aset,'MISSING')=p_filters->>'condition')
    and (p_filters->>'search' is null or position(lower(p_filters->>'search') in lower(a.nama_peralatan))>0)
    and (p_filters->>'filter'='ALL' or p_filters->>'filter'='WARNING' and cardinality(a.warning_codes)>0
     or p_filters->>'filter'='ERROR' and cardinality(a.error_codes)>0
     or p_filters->>'filter'='AGE_IMPUTED' and av.age_status='AGE_IMPUTED'
     or p_filters->>'filter'='ESTIMATED' and (av.value_source::text like 'ESTIMATED_%' or av.value_source='SYSTEM_DEPRECIATION'))
    order by a.source_row_number,a.id limit 100 offset (p_filters->>'offset')::integer
   )visible;
   if not p_row_ids<@coalesce(visible_ids,'{}'::uuid[]) or exists(select 1 from public.asset_valuations av join public.asset_snapshot_rows a on a.id=av.asset_row_id where av.asset_row_id=any(p_row_ids) and
     (av.import_run_id<>r.id or not av.manual_approval_required or av.approved_by is not null or av.value_source='UNRESOLVED' or av.nilai_abc is null or cardinality(a.error_codes)>0))
    or (select count(distinct av.value_source) from public.asset_valuations av where av.asset_row_id=any(p_row_ids))<>1 then
    raise exception 'Selection is hidden, incompatible, unresolved or already approved' using errcode='22023'; end if;
   update public.asset_valuations set approved_by=p_actor_id,approved_at=now(),approval_notes=btrim(p_notes) where asset_row_id=any(p_row_ids);
  else
   if cardinality(coalesce(p_row_ids,'{}'::uuid[]))<>0 then raise exception 'Activation cannot acknowledge hidden rows' using errcode='22023'; end if;
   perform private.assert_asset_version_ready(v.id,true);
   if d.active_version_id is not null then
    update public.dataset_versions set status='HISTORICAL',updated_at=now() where id=d.active_version_id and dataset_id=d.id and status='ACTIVE' and version_number<v.version_number;
    if not found then raise exception 'Version is superseded' using errcode='22023'; end if;
   end if;
   if p_promote_mapping then
    insert into public.mapping_profiles(unit_induk_id,name,layout_hash,rule_version,created_by,approved_by,approved_at,source_version_id,mapping)
    values(d.unit_induk_id,'RST approved '||v.id,r.mapping_hash,r.rule_version,p_actor_id,p_actor_id,now(),v.id,sheet.diagnostics->'mapping') returning id into profile_id;
   end if;
   update public.dataset_versions set status='ACTIVE',updated_at=now() where id=v.id;
   update public.datasets set active_version_id=v.id,updated_at=now() where id=d.id;
   insert into public.approval_events(dataset_version_id,actor_id,action,notes) values(v.id,p_actor_id,'APPROVED',btrim(p_notes)),(v.id,p_actor_id,'ACTIVATED',btrim(p_notes));
  end if;
 end if;
 if p_action not in('ACTIVATE','ACKNOWLEDGE') and (p_promote_mapping or cardinality(coalesce(p_row_ids,'{}'::uuid[]))<>0) then raise exception 'Unexpected approval controls' using errcode='22023'; end if;
 insert into public.audit_events(actor_id,action,target_type,target_id,details) values(p_actor_id,'ASSET_VERSION_'||p_action,'dataset_version',v.id,
  jsonb_build_object('notes',btrim(p_notes),'previous_status',before_status,'previous_version_id',previous_id,'import_run_id',r.id,'expected',p_expected,'row_ids',p_row_ids,'filters',p_filters,'mapping_profile_id',profile_id,'mapping_fingerprint',case when profile_id is not null then r.mapping_hash else null end,'recoverable',p_action='TRASH'));
 return jsonb_build_object('versionId',v.id,'status',(select status from public.dataset_versions where id=v.id),'previousVersionId',case when p_action='ACTIVATE' then previous_id else null end,'mappingProfileId',profile_id);
end$$;
revoke all on function public.list_asset_version_reviews(jsonb),public.review_asset_version(uuid,uuid,text,jsonb,text,uuid[],jsonb,boolean) from public,anon,authenticated;
grant execute on function public.list_asset_version_reviews(jsonb),public.review_asset_version(uuid,uuid,text,jsonb,text,uuid[],jsonb,boolean) to service_role;
