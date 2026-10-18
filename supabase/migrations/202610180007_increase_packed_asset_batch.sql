-- Packed linear decoding keeps database work proportional to the row count.
-- A 3,000-row window reduces hosted REST round-trips while staying bounded.
create or replace function public.insert_asset_import_batch(
  p_actor_id uuid,
  p_run_id uuid,
  p_rows jsonb,
  p_valuations jsonb
) returns integer
language plpgsql security definer set search_path='' set statement_timeout to '60s' as $$
declare
  r public.asset_import_runs;
  row_count integer;
  valuation_count integer;
  inserted_rows integer;
  inserted_valuations integer;
begin
  if jsonb_typeof(p_rows)<>'array' or jsonb_typeof(p_valuations)<>'array' then
    raise exception 'Invalid packed import payload' using errcode='22023';
  end if;

  row_count:=jsonb_array_length(p_rows);
  valuation_count:=jsonb_array_length(p_valuations);
  if row_count<1 or row_count>3000 or valuation_count<>row_count
     or exists(select 1 from jsonb_array_elements(p_rows) item where jsonb_typeof(item)<>'array' or jsonb_array_length(item)<>32)
     or exists(select 1 from jsonb_array_elements(p_valuations) item where jsonb_typeof(item)<>'array' or jsonb_array_length(item)<>23) then
    raise exception 'Invalid packed import batch size' using errcode='22023';
  end if;

  select * into r from public.asset_import_runs where id=p_run_id;
  if not found or r.status<>'PROCESSING' then raise exception 'Run is not processing' using errcode='22023'; end if;
  perform private.assert_asset_actor(p_actor_id,r.unit_induk_id,false);

  insert into public.asset_snapshot_rows(
    id,import_run_id,unit_induk_id,dataset_version_id,import_sheet_id,source_row_number,
    unit_induk,upt,nama_gi,bay_penghantar,tid,no_aset,nama_peralatan,spesifikasi_mara,
    jumlah,satuan,kondisi_aset,tanggal_operasi,usia_aset_tahun,kode_class_asset,kode_jenis,kode_subjenis,
    nilai_buku_sap,harga_pengadaan_saat_ini,tanggal_referensi_harga,nilai_abc_input,kode_material,keterangan,
    provenance,error_codes,warning_codes,created_at)
  select
    (item->>0)::uuid,(item->>1)::uuid,(item->>2)::uuid,(item->>3)::uuid,(item->>4)::uuid,(item->>5)::integer,
    item->>6,item->>7,item->>8,item->>9,item->>10,item->>11,item->>12,item->>13,
    (item->>14)::numeric,item->>15,item->>16,(item->>17)::date,(item->>18)::numeric,item->>19,item->>20,item->>21,
    (item->>22)::numeric,(item->>23)::numeric,(item->>24)::date,(item->>25)::numeric,item->>26,item->>27,
    item->28,array(select jsonb_array_elements_text(item->29)),array(select jsonb_array_elements_text(item->30)),(item->>31)::timestamptz
  from jsonb_array_elements(p_rows) item;
  get diagnostics inserted_rows=row_count;

  insert into public.asset_valuations(
    asset_row_id,import_run_id,unit_induk_id,dataset_version_id,nilai_abc,harga_pengadaan_saat_ini,
    value_source,calculation_method,age_status,age_years,useful_life_years,useful_life_rule_id,
    rule_version,as_of,manual_approval_required,approved_by,approved_at,approval_notes,selected_donor_ids,
    donor_evidence,calculation_evidence,warning_codes,created_at)
  select
    (item->>0)::uuid,(item->>1)::uuid,(item->>2)::uuid,(item->>3)::uuid,(item->>4)::numeric,(item->>5)::numeric,
    (item->>6)::public.asset_valuation_source,(item->>7)::public.asset_calculation_method,(item->>8)::public.asset_age_status,
    (item->>9)::numeric,(item->>10)::numeric,(item->>11)::uuid,item->>12,(item->>13)::date,(item->>14)::boolean,
    (item->>15)::uuid,(item->>16)::timestamptz,item->>17,array(select value::uuid from jsonb_array_elements_text(item->18) value),
    item->19,item->20,array(select jsonb_array_elements_text(item->21)),(item->>22)::timestamptz
  from jsonb_array_elements(p_valuations) item;
  get diagnostics inserted_valuations=row_count;

  if inserted_rows<>row_count or inserted_valuations<>valuation_count then
    raise exception 'Incomplete packed import batch' using errcode='22023';
  end if;
  return inserted_rows;
end;
$$;
