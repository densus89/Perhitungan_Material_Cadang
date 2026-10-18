-- A 2,000-row paired payload exceeds the hosted request envelope for wide asset
-- records. Keep the database contract aligned with the application-side 1,000
-- row window that is proven against the hosted API.
create or replace function public.insert_asset_import_batch(
  p_actor_id uuid,
  p_run_id uuid,
  p_rows jsonb,
  p_valuations jsonb
) returns integer
language plpgsql security definer set search_path='' as $$
declare
  r public.asset_import_runs;
  row_count integer;
  valuation_count integer;
  inserted_rows integer;
  inserted_valuations integer;
begin
  if jsonb_typeof(p_rows)<>'object' or jsonb_typeof(p_valuations)<>'object'
     or not (p_rows ?& array['id','import_run_id','unit_induk_id','dataset_version_id','import_sheet_id','source_row_number'])
     or not (p_valuations ?& array['asset_row_id','import_run_id','unit_induk_id','dataset_version_id','value_source','calculation_method','age_status','rule_version','as_of']) then
    raise exception 'Invalid columnar import payload' using errcode='22023';
  end if;

  row_count:=jsonb_array_length(p_rows->'id');
  valuation_count:=jsonb_array_length(p_valuations->'asset_row_id');
  if row_count<1 or row_count>1000 or valuation_count<>row_count
     or exists(select 1 from jsonb_each(p_rows) where jsonb_typeof(value)<>'array' or jsonb_array_length(value)<>row_count)
     or exists(select 1 from jsonb_each(p_valuations) where jsonb_typeof(value)<>'array' or jsonb_array_length(value)<>valuation_count) then
    raise exception 'Invalid columnar import batch size' using errcode='22023';
  end if;

  select * into r from public.asset_import_runs where id=p_run_id;
  if not found or r.status<>'PROCESSING' then raise exception 'Run is not processing' using errcode='22023'; end if;
  perform private.assert_asset_actor(p_actor_id,r.unit_induk_id,false);

  insert into public.asset_snapshot_rows
  select (jsonb_populate_record(null::public.asset_snapshot_rows,
    (select jsonb_object_agg(key,value->i) from jsonb_each(p_rows)))).*
  from generate_series(0,row_count-1)i;
  get diagnostics inserted_rows=row_count;

  insert into public.asset_valuations
  select (jsonb_populate_record(null::public.asset_valuations,
    (select jsonb_object_agg(key,value->i) from jsonb_each(p_valuations)))).*
  from generate_series(0,valuation_count-1)i;
  get diagnostics inserted_valuations=row_count;

  if inserted_rows<>row_count or inserted_valuations<>valuation_count then
    raise exception 'Incomplete columnar import batch' using errcode='22023';
  end if;
  return inserted_rows;
end;
$$;
