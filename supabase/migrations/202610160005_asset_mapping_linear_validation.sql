-- The maximum-width review regression exposed repeated JSON expansion in the
-- previous mapping join. Materialize both sides once and compare the complete
-- indexed mapping with a full hash/merge join, including unmapped columns.
create or replace function private.assert_asset_mapping(p_session_id uuid,p_revision uuid,p_layout_hash text,p_rule_version text)
returns public.import_sheets language plpgsql security definer set search_path='' as $$
declare s public.import_sessions; sheet public.import_sheets;
begin
 select * into s from public.import_sessions where id=p_session_id;
 select * into sheet from public.import_sheets where import_session_id=s.id and selected;
 if p_revision is null or p_revision is distinct from s.mapping_revision or sheet.id is null
   or sheet.layout_hash is distinct from p_layout_hash or sheet.diagnostics->>'ruleVersion' is distinct from p_rule_version
   or jsonb_typeof(sheet.diagnostics->'mapping'->'columns') is distinct from 'array'
   or jsonb_array_length(sheet.diagnostics->'mapping'->'columns')=0 then
   raise exception 'Stale or unconfirmed mapping' using errcode='22023';
 end if;
 if (select count(*) from public.import_column_mappings where import_sheet_id=sheet.id)<>jsonb_array_length(sheet.diagnostics->'mapping'->'columns')
   or exists(
    with expected as materialized (
     select (c->>'columnIndex')::integer as column_index,c->>'field' as canonical_field,c->>'header' as source_header
     from jsonb_array_elements(sheet.diagnostics->'mapping'->'columns')c
    ), actual as materialized (
     select source_column_index as column_index,canonical_field,source_header,confirmed_by,confirmed_at
     from public.import_column_mappings where import_sheet_id=sheet.id
    )
    select 1 from expected e full join actual a on a.column_index=e.column_index
    where e.column_index is null or a.column_index is null or a.confirmed_by is null or a.confirmed_at is null
     or a.canonical_field is distinct from e.canonical_field or a.source_header is distinct from e.source_header
   ) then
   raise exception 'Confirmed indexed mapping required' using errcode='22023';
 end if;
 return sheet;
end$$;
revoke all on function private.assert_asset_mapping(uuid,uuid,text,text) from public,anon,authenticated,service_role;
