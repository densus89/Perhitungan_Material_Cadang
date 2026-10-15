-- Asset persistence shares the foundation's datasets, identities and events.
-- Writes are server-only; every exposed workflow also checks its human actor.
create type public.asset_import_run_status as enum ('PROCESSING','FAILED','COMPLETE');
create type public.asset_valuation_source as enum (
  'SAP_BOOK_VALUE','PROVIDED_ADJUSTED_VALUE','SYSTEM_DEPRECIATION',
  'ESTIMATED_SAME_GI','ESTIMATED_SAME_UPT','ESTIMATED_SAME_UNIT',
  'ESTIMATED_NEAREST_LOCATION','ESTIMATED_NATIONAL','UNRESOLVED'
);
create type public.asset_calculation_method as enum ('DIRECT_BOOK_VALUE','STRAIGHT_LINE','UNRESOLVED');
create type public.asset_age_status as enum ('OPERATION_DATE','PROVIDED_AGE','AGE_IMPUTED','UNRESOLVED');
create type public.asset_change_kind as enum ('ADDED','REMOVED','CHANGED','UNCHANGED','AMBIGUOUS');

alter table public.datasets add constraint datasets_id_unit_unique unique(id,unit_induk_id);
create unique index dataset_versions_one_active_idx on public.dataset_versions(dataset_id) where status='ACTIVE';

create table public.source_files (
  id uuid primary key default gen_random_uuid(),
  unit_induk_id uuid not null references public.unit_induk(id),
  object_path text not null unique,
  original_name text not null check (original_name ~* '[.]xlsx$'),
  byte_size bigint not null check (byte_size between 1 and 52428800),
  mime_type text not null default 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    check (mime_type='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'),
  sha256 text not null check (sha256 ~ '^[0-9a-f]{64}$'),
  uploaded_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  unique(id,unit_induk_id),
  check (object_path like 'unit/' || unit_induk_id::text || '/dataset/%/version/%/' || id::text || '.xlsx'
    and object_path !~ '(^|/)[.][.]?(/|$)' and position(chr(92) in object_path)=0)
);

create table public.import_sessions (
  id uuid primary key default gen_random_uuid(),
  unit_induk_id uuid not null,
  dataset_id uuid not null,
  dataset_version_id uuid not null unique,
  source_file_id uuid not null,
  current_run_id uuid,
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(id,unit_induk_id),
  unique(id,unit_induk_id,dataset_version_id),
  foreign key(dataset_id,unit_induk_id) references public.datasets(id,unit_induk_id),
  foreign key(dataset_id,dataset_version_id) references public.dataset_versions(dataset_id,id),
  foreign key(source_file_id,unit_induk_id) references public.source_files(id,unit_induk_id)
);

create table public.import_sheets (
  id uuid primary key default gen_random_uuid(),
  import_session_id uuid not null,
  unit_induk_id uuid not null,
  sheet_name text not null check (btrim(sheet_name)<>''),
  header_row integer not null check (header_row>0),
  selected boolean not null default false,
  layout_hash text check (layout_hash ~ '^[0-9a-f]{64}$'),
  diagnostics jsonb not null default '{}' check (jsonb_typeof(diagnostics)='object'),
  created_at timestamptz not null default now(),
  unique(import_session_id,sheet_name),
  unique(id,import_session_id,unit_induk_id),
  foreign key(import_session_id,unit_induk_id) references public.import_sessions(id,unit_induk_id)
);
create unique index import_sheets_one_selected_idx on public.import_sheets(import_session_id) where selected;

create table public.mapping_profiles (
  id uuid primary key default gen_random_uuid(),
  unit_induk_id uuid not null references public.unit_induk(id),
  name text not null check (btrim(name)<>''),
  layout_hash text not null check (layout_hash ~ '^[0-9a-f]{64}$'),
  rule_version text not null check (btrim(rule_version)<>''),
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  unique(id,unit_induk_id),
  unique(unit_induk_id,name,layout_hash,rule_version)
);

create table public.import_column_mappings (
  id uuid primary key default gen_random_uuid(),
  import_sheet_id uuid not null,
  import_session_id uuid not null,
  unit_induk_id uuid not null,
  mapping_profile_id uuid,
  source_column_index integer not null check (source_column_index>0),
  source_header text not null,
  canonical_field text check (canonical_field in (
    'unitInduk','upt','namaGi','bayPenghantar','tid','noAset','namaPeralatan','spesifikasiMara',
    'jumlah','satuan','kondisiAset','tanggalOperasi','usiaAsetTahun','kodeClassAsset','kodeJenis',
    'kodeSubjenis','nilaiBukuSap','hargaPengadaanSaatIni','tanggalReferensiHarga','nilaiAbcInput','kodeMaterial','keterangan')),
  confidence numeric not null check (confidence between 0 and 1),
  confirmed_by uuid references public.profiles(id),
  confirmed_at timestamptz,
  unique(import_sheet_id,source_column_index),
  unique(import_sheet_id,canonical_field),
  check ((confirmed_by is null)=(confirmed_at is null)),
  foreign key(import_sheet_id,import_session_id,unit_induk_id) references public.import_sheets(id,import_session_id,unit_induk_id),
  foreign key(mapping_profile_id,unit_induk_id) references public.mapping_profiles(id,unit_induk_id)
);

create table public.asset_import_runs (
  id uuid primary key default gen_random_uuid(),
  import_session_id uuid not null,
  unit_induk_id uuid not null,
  dataset_version_id uuid not null,
  status public.asset_import_run_status not null default 'PROCESSING',
  expected_row_count integer not null check (expected_row_count>0),
  expected_valuation_count integer not null check (expected_valuation_count=expected_row_count),
  source_hash text not null check (source_hash ~ '^[0-9a-f]{64}$'),
  mapping_hash text not null check (mapping_hash ~ '^[0-9a-f]{64}$'),
  rule_version text not null check (btrim(rule_version)<>''),
  expected_rows_hash text not null check (expected_rows_hash ~ '^[0-9a-f]{64}$'),
  expected_valuations_hash text not null check (expected_valuations_hash ~ '^[0-9a-f]{64}$'),
  finalized_rows_hash text,
  finalized_valuations_hash text,
  failure_code text,
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  unique(id,unit_induk_id,dataset_version_id),
  unique(id,import_session_id,unit_induk_id),
  foreign key(import_session_id,unit_induk_id,dataset_version_id) references public.import_sessions(id,unit_induk_id,dataset_version_id),
  check (status<>'COMPLETE' or (completed_at is not null and finalized_rows_hash=expected_rows_hash
    and finalized_rows_hash is not null and finalized_valuations_hash=expected_valuations_hash and finalized_valuations_hash is not null)),
  check (status<>'FAILED' or nullif(btrim(failure_code),'') is not null)
);
alter table public.import_sessions add constraint import_sessions_current_run_fkey
  foreign key(current_run_id,id,unit_induk_id) references public.asset_import_runs(id,import_session_id,unit_induk_id);

create table public.asset_snapshot_rows (
  id uuid primary key default gen_random_uuid(),
  import_run_id uuid not null,
  unit_induk_id uuid not null,
  dataset_version_id uuid not null,
  import_sheet_id uuid not null references public.import_sheets(id),
  source_row_number integer not null check (source_row_number>0),
  unit_induk text, upt text, nama_gi text, bay_penghantar text, tid text, no_aset text,
  nama_peralatan text, spesifikasi_mara text,
  jumlah numeric, satuan text,
  kondisi_aset text check (kondisi_aset in ('P0','P1','P2','P3','P4')),
  tanggal_operasi date, usia_aset_tahun numeric,
  kode_class_asset text, kode_jenis text, kode_subjenis text,
  nilai_buku_sap numeric, harga_pengadaan_saat_ini numeric,
  tanggal_referensi_harga date, nilai_abc_input numeric,
  kode_material text, keterangan text,
  provenance jsonb not null default '{}' check (jsonb_typeof(provenance)='object'),
  error_codes text[] not null default '{}',
  warning_codes text[] not null default '{}',
  created_at timestamptz not null default now(),
  unique(import_run_id,import_sheet_id,source_row_number),
  unique(id,import_run_id,unit_induk_id,dataset_version_id),
  foreign key(import_run_id,unit_induk_id,dataset_version_id) references public.asset_import_runs(id,unit_induk_id,dataset_version_id)
);

create table public.useful_life_rules (
  id uuid primary key default gen_random_uuid(),
  rule_version text not null check (btrim(rule_version)<>''),
  function_code text not null, class_code text not null, type_code text not null, subtype_code text not null,
  useful_life_years numeric not null check (useful_life_years>0 and useful_life_years<'Infinity'::numeric),
  effective_from date not null, effective_to date,
  source_document text not null check (btrim(source_document)<>''),
  source_locator text not null check (btrim(source_locator)<>''),
  source_hash text not null check (source_hash ~ '^[0-9a-f]{64}$'),
  created_at timestamptz not null default now(),
  check (effective_to is null or effective_to>=effective_from),
  unique(rule_version,function_code,class_code,type_code,subtype_code,effective_from)
);

create table public.asset_class_mappings (
  id uuid primary key default gen_random_uuid(),
  alias_key text not null check (alias_key=lower(btrim(alias_key)) and alias_key<>''),
  useful_life_rule_id uuid not null references public.useful_life_rules(id),
  approved_by uuid not null references public.profiles(id),
  approved_at timestamptz not null,
  approval_evidence text not null check (btrim(approval_evidence)<>''),
  effective_from date not null, effective_to date,
  created_at timestamptz not null default now(),
  check (effective_to is null or effective_to>=effective_from),
  unique(alias_key,useful_life_rule_id,effective_from)
);

create table public.asset_valuations (
  asset_row_id uuid primary key,
  import_run_id uuid not null,
  unit_induk_id uuid not null,
  dataset_version_id uuid not null,
  nilai_abc numeric check (nilai_abc>=0 and nilai_abc<'Infinity'::numeric),
  harga_pengadaan_saat_ini numeric check (harga_pengadaan_saat_ini>=0 and harga_pengadaan_saat_ini<'Infinity'::numeric),
  value_source public.asset_valuation_source not null,
  calculation_method public.asset_calculation_method not null,
  age_status public.asset_age_status not null,
  age_years numeric check (age_years>=0 and age_years<'Infinity'::numeric),
  useful_life_years numeric check (useful_life_years>0 and useful_life_years<'Infinity'::numeric),
  useful_life_rule_id uuid references public.useful_life_rules(id),
  rule_version text not null check (btrim(rule_version)<>''),
  as_of date not null,
  manual_approval_required boolean not null default false,
  approved_by uuid references public.profiles(id),
  approved_at timestamptz,
  approval_notes text,
  selected_donor_ids uuid[] not null default '{}',
  donor_evidence jsonb not null default '{}' check (jsonb_typeof(donor_evidence)='object'),
  calculation_evidence jsonb not null default '{}' check (jsonb_typeof(calculation_evidence)='object'),
  warning_codes text[] not null default '{}',
  created_at timestamptz not null default now(),
  foreign key(asset_row_id,import_run_id,unit_induk_id,dataset_version_id) references public.asset_snapshot_rows(id,import_run_id,unit_induk_id,dataset_version_id),
  check ((approved_by is null)=(approved_at is null)),
  check (value_source<>'UNRESOLVED' or (nilai_abc is null and manual_approval_required)),
  check (value_source='UNRESOLVED' or nilai_abc is not null)
);

create table public.gi_location_references (
  id uuid primary key default gen_random_uuid(),
  unit_induk_id uuid not null references public.unit_induk(id),
  unit_induk_key text not null check (unit_induk_key=upper(regexp_replace(btrim(unit_induk_key),'[[:space:]]+',' ','g')) and unit_induk_key<>''),
  upt text not null check (btrim(upt)<>''),
  nama_gi text not null check (btrim(nama_gi)<>''),
  upt_key text generated always as (upper(regexp_replace(btrim(upt),'[[:space:]]+',' ','g'))) stored,
  nama_gi_key text generated always as (upper(regexp_replace(btrim(nama_gi),'[[:space:]]+',' ','g'))) stored,
  latitude double precision not null check (latitude between -90 and 90),
  longitude double precision not null check (longitude between -180 and 180),
  source_hash text not null check (source_hash ~ '^[0-9a-f]{64}$'),
  source_version text not null check (btrim(source_version)<>''),
  updated_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(unit_induk_id,upt_key,nama_gi_key)
);

create table public.version_comparisons (
  id uuid primary key default gen_random_uuid(),
  dataset_id uuid not null,
  unit_induk_id uuid not null,
  from_version_id uuid not null,
  to_version_id uuid not null,
  from_run_id uuid not null,
  to_run_id uuid not null,
  summary jsonb not null default '{}' check (jsonb_typeof(summary)='object'),
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  unique(id,unit_induk_id),
  unique(from_run_id,to_run_id),
  check (from_version_id<>to_version_id),
  foreign key(dataset_id,unit_induk_id) references public.datasets(id,unit_induk_id),
  foreign key(dataset_id,from_version_id) references public.dataset_versions(dataset_id,id),
  foreign key(dataset_id,to_version_id) references public.dataset_versions(dataset_id,id),
  foreign key(from_run_id,unit_induk_id,from_version_id) references public.asset_import_runs(id,unit_induk_id,dataset_version_id),
  foreign key(to_run_id,unit_induk_id,to_version_id) references public.asset_import_runs(id,unit_induk_id,dataset_version_id)
);

create table public.asset_version_changes (
  id uuid primary key default gen_random_uuid(),
  comparison_id uuid not null,
  unit_induk_id uuid not null,
  identity_key text not null check (btrim(identity_key)<>''),
  change_kind public.asset_change_kind not null,
  from_row_id uuid references public.asset_snapshot_rows(id),
  to_row_id uuid references public.asset_snapshot_rows(id),
  changed_fields text[] not null default '{}',
  evidence jsonb not null default '{}' check (jsonb_typeof(evidence)='object'),
  unique(comparison_id,identity_key),
  foreign key(comparison_id,unit_induk_id) references public.version_comparisons(id,unit_induk_id),
  check (from_row_id is not null or to_row_id is not null)
);

create index source_files_unit_time_idx on public.source_files(unit_induk_id,created_at desc);
create index source_files_uploader_idx on public.source_files(uploaded_by);
create index import_sessions_unit_version_idx on public.import_sessions(unit_induk_id,dataset_version_id);
create index import_sessions_source_idx on public.import_sessions(source_file_id);
create index import_sessions_current_run_idx on public.import_sessions(current_run_id);
create index import_sessions_creator_idx on public.import_sessions(created_by);
create index mapping_profiles_creator_idx on public.mapping_profiles(created_by);
create index import_column_mappings_profile_idx on public.import_column_mappings(mapping_profile_id);
create index import_column_mappings_confirmer_idx on public.import_column_mappings(confirmed_by);
create index import_runs_session_status_idx on public.asset_import_runs(import_session_id,status,created_at desc);
create index import_runs_unit_version_idx on public.asset_import_runs(unit_induk_id,dataset_version_id);
create index import_runs_creator_idx on public.asset_import_runs(created_by);
create index asset_rows_version_run_idx on public.asset_snapshot_rows(dataset_version_id,import_run_id);
create index asset_rows_identity_idx on public.asset_snapshot_rows(import_run_id,no_aset,tid);
create index asset_rows_location_idx on public.asset_snapshot_rows(unit_induk_id,upt,nama_gi);
create index asset_rows_equipment_condition_idx on public.asset_snapshot_rows(import_run_id,nama_peralatan,kondisi_aset);
create index asset_rows_codes_idx on public.asset_snapshot_rows(kode_class_asset,kode_jenis,kode_subjenis);
create index asset_rows_sheet_idx on public.asset_snapshot_rows(import_sheet_id);
create index asset_rows_errors_gin on public.asset_snapshot_rows using gin(error_codes);
create index asset_rows_warnings_gin on public.asset_snapshot_rows using gin(warning_codes);
create index useful_life_rules_lookup_idx on public.useful_life_rules(class_code,type_code,subtype_code,effective_from);
create index asset_class_mappings_rule_idx on public.asset_class_mappings(useful_life_rule_id);
create index asset_class_mappings_approver_idx on public.asset_class_mappings(approved_by);
create index asset_valuations_run_idx on public.asset_valuations(import_run_id,value_source);
create index asset_valuations_unit_version_idx on public.asset_valuations(unit_induk_id,dataset_version_id);
create index asset_valuations_rule_idx on public.asset_valuations(useful_life_rule_id);
create index asset_valuations_approver_idx on public.asset_valuations(approved_by);
create index asset_valuations_warnings_gin on public.asset_valuations using gin(warning_codes);
create index gi_location_references_updater_idx on public.gi_location_references(updated_by);
create index version_comparisons_unit_version_idx on public.version_comparisons(unit_induk_id,to_version_id);
create index version_comparisons_dataset_idx on public.version_comparisons(dataset_id);
create index version_comparisons_creator_idx on public.version_comparisons(created_by);
create index asset_version_changes_from_row_idx on public.asset_version_changes(from_row_id);
create index asset_version_changes_to_row_idx on public.asset_version_changes(to_row_id);

-- A single scope policy on every unit-owned table. Rules and curated aliases
-- are national reference data visible only to an active application identity.
do $$
declare table_name text;
begin
  foreach table_name in array array['source_files','import_sessions','import_sheets','mapping_profiles',
    'import_column_mappings','asset_import_runs','asset_snapshot_rows','asset_valuations',
    'gi_location_references','version_comparisons','asset_version_changes'] loop
    execute format('alter table public.%I enable row level security',table_name);
    execute format('revoke all on table public.%I from public, anon, authenticated',table_name);
    execute format('grant select on table public.%I to authenticated',table_name);
    execute format('grant all on table public.%I to service_role',table_name);
    execute format('create policy asset_unit_read on public.%I for select to authenticated using (private.can_access_unit(unit_induk_id))',table_name);
  end loop;
  foreach table_name in array array['useful_life_rules','asset_class_mappings'] loop
    execute format('alter table public.%I enable row level security',table_name);
    execute format('revoke all on table public.%I from public, anon, authenticated',table_name);
    execute format('grant select on table public.%I to authenticated',table_name);
    execute format('grant all on table public.%I to service_role',table_name);
    execute format('create policy asset_reference_read on public.%I for select to authenticated using ((select private.current_app_role()) is not null)',table_name);
  end loop;
end;
$$;

update storage.buckets set public=false,file_size_limit=52428800,
  allowed_mime_types=array['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet']
where id='source-files';

-- The bucket API enforces byte/MIME limits. The database also rejects a renamed
-- non-XLSX path, including direct service inserts; no authenticated policy added.
create function private.check_source_object_path() returns trigger
language plpgsql set search_path='' as $$
begin
  if new.bucket_id='source-files' and (new.name !~* '^unit/[0-9a-f-]{36}/dataset/[0-9a-f-]{36}/version/[0-9a-f-]{36}/[0-9a-f-]{36}[.]xlsx$'
    or new.name ~ '(^|/)[.][.]?(/|$)' or position(chr(92) in new.name)>0) then
    raise exception 'Invalid source XLSX object path' using errcode='22023';
  end if;
  return new;
end;
$$;
create trigger check_source_object_path before insert or update on storage.objects
  for each row execute function private.check_source_object_path();

create function private.reject_event_mutation() returns trigger
language plpgsql set search_path='' as $$
begin raise exception 'Events are append-only' using errcode='42501'; end;
$$;
create trigger approval_events_immutable before update or delete on public.approval_events
  for each row execute function private.reject_event_mutation();
create trigger audit_events_immutable before update or delete on public.audit_events
  for each row execute function private.reject_event_mutation();
revoke truncate on public.approval_events,public.audit_events from public,anon,authenticated,service_role;
create trigger approval_events_no_truncate before truncate on public.approval_events
  for each statement execute function private.reject_event_mutation();
create trigger audit_events_no_truncate before truncate on public.audit_events
  for each statement execute function private.reject_event_mutation();

-- Independent of JWT claims: a service call never turns a supplied UUID into
-- authority. Row locks prevent assignment replacement during this transaction.
create function private.assert_asset_actor(p_actor_id uuid,p_unit_id uuid,p_rst_only boolean)
returns void language plpgsql security definer set search_path='' as $$
declare actor_role public.app_role;
begin
  select r.role into actor_role from public.profiles p
    join auth.users a on a.id=p.id
    join public.user_role_assignments r on r.user_id=p.id
    where p.id=p_actor_id and p.status='ACTIVE' and p.email=lower(btrim(a.email))
      and (p.email ~ '^[^@[:space:]]+@pln[.]co[.]id$' or p.email='sitompul89@gmail.com')
    for share of p,r;
  if p_rst_only and actor_role in ('RST_ADMIN','RST_REVIEWER') then return; end if;
  if not p_rst_only and actor_role='UNIT_OPERATOR' then
    perform 1 from public.user_unit_assignments where user_id=p_actor_id and unit_induk_id=p_unit_id for share;
    if found then return; end if;
  end if;
  raise exception 'Actor has no required role or unit scope' using errcode='42501';
end;
$$;

-- This digest is separate from the workbook reader's canonical hash chain.
-- Hash each persisted JSONB record (except execution timestamp), concatenate
-- the 64-character digests in stable identity order, then SHA256 that stream.
create function private.asset_run_hashes(p_run_id uuid)
returns table(rows_hash text,valuations_hash text)
language sql stable set search_path='' as $$
  select
    (select encode(extensions.digest(coalesce(string_agg(encode(extensions.digest(
      (to_jsonb(r)-'created_at')::text,'sha256'),'hex'),'' order by r.import_sheet_id,r.source_row_number),''),'sha256'),'hex')
      from public.asset_snapshot_rows r where r.import_run_id=p_run_id),
    (select encode(extensions.digest(coalesce(string_agg(encode(extensions.digest(
      (to_jsonb(v)-array['created_at','approved_by','approved_at','approval_notes'])::text,'sha256'),'hex'),'' order by v.asset_row_id),''),'sha256'),'hex')
      from public.asset_valuations v where v.import_run_id=p_run_id);
$$;

create function private.guard_gi_location_reference() returns trigger
language plpgsql security definer set search_path='' as $$
declare normalized_unit text;
begin
  select upper(regexp_replace(btrim(code),'[[:space:]]+',' ','g')) into normalized_unit
    from public.unit_induk where id=new.unit_induk_id;
  if new.unit_induk_key is distinct from normalized_unit then
    raise exception 'Coordinate key does not match unit master' using errcode='22023';
  end if;
  perform private.assert_asset_actor(new.updated_by,new.unit_induk_id,true);
  new.updated_at:=now();
  return new;
end;
$$;
create trigger guard_gi_location_reference before insert or update on public.gi_location_references
  for each row execute function private.guard_gi_location_reference();

-- Lock the parent run for every batch mutation. A finalizer holding that lock
-- sees a stable batch; a writer waiting behind it sees COMPLETE and fails.
create function private.guard_asset_batch() returns trigger
language plpgsql security definer set search_path='' as $$
declare run public.asset_import_runs; sheet_session uuid; target_run uuid;
begin
  if tg_op='DELETE' then target_run:=old.import_run_id; else target_run:=new.import_run_id; end if;
  if tg_op='UPDATE' and old.import_run_id<>new.import_run_id then
    raise exception 'Cannot move a batch record' using errcode='22023';
  end if;
  select * into run from public.asset_import_runs where id=target_run for update;
  if not found then
    raise exception 'Import run not found' using errcode='22023';
  end if;
  -- Approval is separate evidence, excluded from the frozen calculation hash.
  -- It can be appended once by an independently verified RST actor during review.
  if tg_table_name='asset_valuations' and tg_op='UPDATE' and run.status='COMPLETE' then
    if old.approved_by is not null or new.approved_by is null
      or (to_jsonb(new)-array['approved_by','approved_at','approval_notes'])
        is distinct from (to_jsonb(old)-array['approved_by','approved_at','approval_notes']) then
      raise exception 'Frozen calculation or approval cannot be rewritten' using errcode='22023';
    end if;
    perform private.assert_asset_actor(new.approved_by,run.unit_induk_id,true);
    perform 1 from public.dataset_versions where id=run.dataset_version_id and status='PENDING_RST' for update;
    if not found or new.approved_at is null or new.approved_at>now()
      or nullif(btrim(new.approval_notes),'') is null then
      raise exception 'Pending review and complete approval evidence required' using errcode='22023';
    end if;
    insert into public.approval_events(dataset_version_id,actor_id,action,notes)
      values(run.dataset_version_id,new.approved_by,'APPROVED',new.approval_notes);
    insert into public.audit_events(actor_id,action,target_type,target_id,details)
      values(new.approved_by,'ASSET_VALUATION_APPROVED','dataset_version',run.dataset_version_id,
        jsonb_build_object('asset_row_id',new.asset_row_id,'import_run_id',run.id,'notes',new.approval_notes));
    return new;
  end if;
  if run.status<>'PROCESSING' then
    raise exception 'Only processing batch records are writable' using errcode='22023';
  end if;
  if tg_table_name='asset_valuations' then
    if tg_op<>'DELETE' and new.approved_by is not null then
      raise exception 'Approval is appended during pending review only' using errcode='22023';
    end if;
  end if;
  if tg_table_name='asset_snapshot_rows' and tg_op<>'DELETE' then
    select import_session_id into sheet_session from public.import_sheets
      where id=new.import_sheet_id and unit_induk_id=new.unit_induk_id;
    if sheet_session is distinct from run.import_session_id then
      raise exception 'Sheet does not belong to run session' using errcode='22023';
    end if;
  end if;
  if tg_op='DELETE' then return old; end if;
  return new;
end;
$$;
create trigger guard_asset_rows before insert or update or delete on public.asset_snapshot_rows
  for each row execute function private.guard_asset_batch();
create trigger guard_asset_valuations before insert or update or delete on public.asset_valuations
  for each row execute function private.guard_asset_batch();

create function private.guard_asset_run() returns trigger
language plpgsql security definer set search_path='' as $$
declare version_status public.dataset_status; file_hash text; hashes record;
begin
  if tg_op<>'INSERT' and old.status<>'PROCESSING' then
    raise exception 'Terminal import run is immutable' using errcode='22023';
  end if;
  if tg_op='DELETE' then return old; end if;
  if tg_op='INSERT' and new.status<>'PROCESSING' then
    raise exception 'New import run must be processing' using errcode='22023';
  end if;
  if tg_op='UPDATE' and (new.id,new.import_session_id,new.unit_induk_id,new.dataset_version_id)
    is distinct from (old.id,old.import_session_id,old.unit_induk_id,old.dataset_version_id) then
    raise exception 'Import run ownership is immutable' using errcode='22023';
  end if;
  select v.status,f.sha256 into version_status,file_hash from public.import_sessions s
    join public.dataset_versions v on v.id=s.dataset_version_id
    join public.source_files f on f.id=s.source_file_id
    join public.datasets d on d.id=s.dataset_id
    where s.id=new.import_session_id and d.type='ASSET';
  if version_status is null or version_status not in ('DRAFT','NEEDS_FIX','READY_TO_SUBMIT') or file_hash<>new.source_hash then
    raise exception 'Run requires an editable ASSET version and matching source hash' using errcode='22023';
  end if;
  if not exists(select 1 from public.import_sheets where import_session_id=new.import_session_id
      and selected and layout_hash=new.mapping_hash) then
    raise exception 'Run requires the confirmed selected layout hash' using errcode='22023';
  end if;
  -- Keep the table invariant even if a future server accidentally updates the
  -- status directly rather than invoking finalization. This UPDATE owns the
  -- same row lock used by batch writers, so counts and digests are stable.
  if new.status='COMPLETE' then
    select * into hashes from private.asset_run_hashes(new.id);
    if (select count(*) from public.asset_snapshot_rows where import_run_id=new.id)<>new.expected_row_count
      or (select count(*) from public.asset_valuations where import_run_id=new.id)<>new.expected_valuation_count
      or hashes.rows_hash<>new.expected_rows_hash or hashes.valuations_hash<>new.expected_valuations_hash
      or exists(select 1 from public.asset_valuations where import_run_id=new.id and rule_version<>new.rule_version) then
      raise exception 'Complete run counts, hashes and rules must match persisted batches' using errcode='22023';
    end if;
    new.finalized_rows_hash:=hashes.rows_hash;
    new.finalized_valuations_hash:=hashes.valuations_hash;
    new.completed_at:=now();
  end if;
  return new;
end;
$$;
create trigger guard_asset_run before insert or update or delete on public.asset_import_runs
  for each row execute function private.guard_asset_run();

create function private.guard_asset_session() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  if tg_op='UPDATE' and (new.id,new.unit_induk_id,new.dataset_id,new.dataset_version_id,new.source_file_id)
    is distinct from (old.id,old.unit_induk_id,old.dataset_id,old.dataset_version_id,old.source_file_id) then
    raise exception 'Import session ownership is immutable' using errcode='22023';
  end if;
  if tg_op='UPDATE' and old.current_run_id is not null and new.current_run_id is null then
    raise exception 'A finalized session must retain a current run' using errcode='22023';
  end if;
  if new.current_run_id is not null and not exists(select 1 from public.asset_import_runs r
    where r.id=new.current_run_id and r.import_session_id=new.id and r.status='COMPLETE') then
    raise exception 'Current run must be complete and belong to this session' using errcode='22023';
  end if;
  return new;
end;
$$;
create trigger guard_asset_session before insert or update on public.import_sessions
  for each row execute function private.guard_asset_session();

create function private.guard_asset_comparison_change() returns trigger
language plpgsql security definer set search_path='' as $$
declare comparison public.version_comparisons;
begin
  select * into comparison from public.version_comparisons where id=new.comparison_id;
  if (new.from_row_id is not null and not exists(select 1 from public.asset_snapshot_rows
      where id=new.from_row_id and import_run_id=comparison.from_run_id))
    or (new.to_row_id is not null and not exists(select 1 from public.asset_snapshot_rows
      where id=new.to_row_id and import_run_id=comparison.to_run_id)) then
    raise exception 'Comparison row belongs to another version/run' using errcode='22023';
  end if;
  return new;
end;
$$;
create trigger guard_asset_comparison_change before insert or update on public.asset_version_changes
  for each row execute function private.guard_asset_comparison_change();

create function public.finalize_asset_import_run(p_actor_id uuid,p_run_id uuid)
returns uuid language plpgsql security definer set search_path='' as $$
declare run public.asset_import_runs; session public.import_sessions; target_dataset uuid;
begin
  select s.dataset_id into target_dataset from public.asset_import_runs r
    join public.import_sessions s on s.id=r.import_session_id where r.id=p_run_id;
  if not found then raise exception 'Import run not found' using errcode='22023'; end if;
  perform 1 from public.datasets where id=target_dataset for update;
  select * into run from public.asset_import_runs where id=p_run_id;
  perform private.assert_asset_actor(p_actor_id,run.unit_induk_id,false);
  perform 1 from public.dataset_versions where id=run.dataset_version_id
    and status in ('DRAFT','NEEDS_FIX','READY_TO_SUBMIT') for update;
  if not found then raise exception 'Version is not editable' using errcode='22023'; end if;
  select * into session from public.import_sessions where id=run.import_session_id for update;
  select * into run from public.asset_import_runs where id=p_run_id for update;
  if run.status<>'PROCESSING' then raise exception 'Run is not processing' using errcode='22023'; end if;
  -- The mandatory table guard validates/seals counts and hashes once under the
  -- locked run, including accidental direct service transitions.
  update public.asset_import_runs set status='COMPLETE' where id=p_run_id returning * into run;
  update public.import_sessions set current_run_id=p_run_id,updated_at=now() where id=session.id;
  insert into public.audit_events(actor_id,action,target_type,target_id,details) values
    (p_actor_id,'ASSET_IMPORT_FINALIZED','dataset_version',run.dataset_version_id,
      jsonb_build_object('import_run_id',p_run_id,'row_count',run.expected_row_count,
        'rows_hash',run.finalized_rows_hash,'valuations_hash',run.finalized_valuations_hash));
  return p_run_id;
end;
$$;

-- Shared locked readiness check used at submission and again at activation.
create function private.assert_asset_version_ready(p_version_id uuid,p_require_approval boolean default false) returns uuid
language plpgsql security definer set search_path='' as $$
declare run public.asset_import_runs;
begin
  select r.* into run from public.import_sessions s
    join public.asset_import_runs r on r.id=s.current_run_id
    where s.dataset_version_id=p_version_id and r.status='COMPLETE';
  if not found then raise exception 'No finalized current import' using errcode='22023'; end if;
  if exists(select 1 from public.asset_import_runs where import_session_id=run.import_session_id and status='PROCESSING')
    or exists(select 1 from public.asset_snapshot_rows where import_run_id=run.id and cardinality(error_codes)>0)
    or (select count(*) from public.asset_snapshot_rows where import_run_id=run.id)<>run.expected_row_count
    or (select count(*) from public.asset_valuations where import_run_id=run.id)<>run.expected_valuation_count
    or exists(select 1 from public.asset_valuations v where v.import_run_id=run.id and
      (v.value_source='UNRESOLVED' or v.nilai_abc is null or (p_require_approval and v.manual_approval_required and
        (v.approved_by is null or nullif(btrim(v.approval_notes),'') is null or not exists(
          select 1 from public.profiles p join public.user_role_assignments r on r.user_id=p.id
          where p.id=v.approved_by and p.status='ACTIVE' and r.role in ('RST_ADMIN','RST_REVIEWER')))))) then
    raise exception 'Import has blocking errors or unapproved valuations' using errcode='22023';
  end if;
  return run.id;
end;
$$;

create function public.submit_asset_version(p_actor_id uuid,p_version_id uuid)
returns uuid language plpgsql security definer set search_path='' as $$
declare dataset public.datasets; version public.dataset_versions; run_id uuid;
begin
  select d.* into dataset from public.datasets d join public.dataset_versions v on v.dataset_id=d.id where v.id=p_version_id;
  if not found then raise exception 'Version not found' using errcode='22023'; end if;
  perform 1 from public.datasets where id=dataset.id for update;
  perform private.assert_asset_actor(p_actor_id,dataset.unit_induk_id,false);
  select * into version from public.dataset_versions where id=p_version_id for update;
  if dataset.type<>'ASSET' or version.status not in ('DRAFT','NEEDS_FIX','READY_TO_SUBMIT') then
    raise exception 'Version is not submittable' using errcode='22023';
  end if;
  run_id:=private.assert_asset_version_ready(p_version_id,false);
  update public.dataset_versions set status='PENDING_RST',updated_at=now() where id=p_version_id;
  insert into public.approval_events(dataset_version_id,actor_id,action) values(p_version_id,p_actor_id,'SUBMITTED');
  insert into public.audit_events(actor_id,action,target_type,target_id,details) values
    (p_actor_id,'ASSET_VERSION_SUBMITTED','dataset_version',p_version_id,jsonb_build_object('import_run_id',run_id));
  return p_version_id;
end;
$$;

create function public.return_asset_version(p_actor_id uuid,p_version_id uuid,p_notes text)
returns uuid language plpgsql security definer set search_path='' as $$
declare dataset public.datasets; version public.dataset_versions;
begin
  select d.* into dataset from public.datasets d join public.dataset_versions v on v.dataset_id=d.id where v.id=p_version_id;
  if not found then raise exception 'Version not found' using errcode='22023'; end if;
  perform 1 from public.datasets where id=dataset.id for update;
  perform private.assert_asset_actor(p_actor_id,dataset.unit_induk_id,true);
  select * into version from public.dataset_versions where id=p_version_id for update;
  if dataset.type<>'ASSET' or version.status<>'PENDING_RST' or nullif(btrim(p_notes),'') is null then
    raise exception 'Pending version and return notes required' using errcode='22023';
  end if;
  update public.dataset_versions set status='NEEDS_FIX',updated_at=now() where id=p_version_id;
  insert into public.approval_events(dataset_version_id,actor_id,action,notes) values(p_version_id,p_actor_id,'RETURNED',p_notes);
  insert into public.audit_events(actor_id,action,target_type,target_id,details) values
    (p_actor_id,'ASSET_VERSION_RETURNED','dataset_version',p_version_id,jsonb_build_object('notes',p_notes));
  return p_version_id;
end;
$$;

create function public.activate_asset_version(p_actor_id uuid,p_version_id uuid,p_notes text)
returns uuid language plpgsql security definer set search_path='' as $$
declare dataset public.datasets; version public.dataset_versions; run_id uuid;
begin
  select d.* into dataset from public.datasets d join public.dataset_versions v on v.dataset_id=d.id where v.id=p_version_id;
  if not found then raise exception 'Version not found' using errcode='22023'; end if;
  select * into dataset from public.datasets where id=dataset.id for update;
  perform private.assert_asset_actor(p_actor_id,dataset.unit_induk_id,true);
  select * into version from public.dataset_versions where id=p_version_id for update;
  if dataset.type<>'ASSET' or version.status<>'PENDING_RST' or nullif(btrim(p_notes),'') is null then
    raise exception 'Pending version and approval notes required' using errcode='22023';
  end if;
  run_id:=private.assert_asset_version_ready(p_version_id,true);
  if dataset.active_version_id is not null then
    update public.dataset_versions set status='HISTORICAL',updated_at=now()
      where id=dataset.active_version_id and dataset_id=dataset.id and status='ACTIVE'
        and version_number<version.version_number;
    if not found then raise exception 'Previous active version invariant failed' using errcode='22023'; end if;
  end if;
  update public.dataset_versions set status='ACTIVE',updated_at=now() where id=p_version_id;
  update public.datasets set active_version_id=p_version_id,updated_at=now() where id=dataset.id;
  insert into public.approval_events(dataset_version_id,actor_id,action,notes) values(p_version_id,p_actor_id,'ACTIVATED',p_notes);
  insert into public.audit_events(actor_id,action,target_type,target_id,details) values
    (p_actor_id,'ASSET_VERSION_ACTIVATED','dataset_version',p_version_id,
      jsonb_build_object('previous_version_id',dataset.active_version_id,'import_run_id',run_id,'notes',p_notes));
  return p_version_id;
end;
$$;

revoke all on function private.check_source_object_path(),private.reject_event_mutation(),
  private.assert_asset_actor(uuid,uuid,boolean),private.asset_run_hashes(uuid),private.guard_asset_batch(),
  private.guard_gi_location_reference(),
  private.guard_asset_run(),private.guard_asset_session(),private.guard_asset_comparison_change(),
  private.assert_asset_version_ready(uuid,boolean) from public,anon,authenticated;
grant execute on function private.asset_run_hashes(uuid) to service_role;
revoke all on function public.finalize_asset_import_run(uuid,uuid),public.submit_asset_version(uuid,uuid),
  public.return_asset_version(uuid,uuid,text),public.activate_asset_version(uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.finalize_asset_import_run(uuid,uuid),public.submit_asset_version(uuid,uuid),
  public.return_asset_version(uuid,uuid,text),public.activate_asset_version(uuid,uuid,text) to service_role;
