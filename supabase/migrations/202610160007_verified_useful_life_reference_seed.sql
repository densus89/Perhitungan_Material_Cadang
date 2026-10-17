-- Forward seed of the exact eight Task 3 visually verified source rows.
-- This records source facts only. No equipment-name alias is approved here.
insert into public.useful_life_rules(rule_version,function_code,class_code,type_code,subtype_code,useful_life_years,effective_from,effective_to,source_document,source_locator,source_hash)
select 'PERDIR-0299-2016-verified-subset-v1',v.function_code,v.class_code,v.type_code,v.subtype_code,v.years,'2016-01-01'::date,null,
 'PERDIR 0299.P/DIR/2016, Lampiran I, Tabel Umur Masa Manfaat Aset Tetap',v.locator,
 'ed686bc369ff09923bc77b9e295f02d296c646a388a2def3248acd12474b500f'
from(values
 ('TRANS','10600','07','102',40,'PDF page 4, Lampiran I row 7.2, column 10 TRANS; PDF page 9 example I.a.1 confirms GI transformer 40 years'),
 ('TRANS','10700','08','',40,'PDF page 4, Lampiran I row 8, column 10 TRANS'),
 ('TRANS','10800','09','111',40,'PDF page 5, Lampiran I row 9.1, column 10 TRANS; PDF page 10 example II Tower SUTT 150 kV'),
 ('TRANS','10900','11','101',40,'PDF page 5, Lampiran I row 11.1, column 10 TRANS'),
 ('DISTRIBUSI','11100','13','102',25,'PDF page 5, Lampiran I row 13.2, column 12 DISTRIBUSI'),
 ('TELE INFORMASI DATA','11400','16','105',10,'PDF page 6, Lampiran I row 16.5, column 11 TELE INFORMASI DATA; PDF pages 9-10 example I.a.2 independently confirms transmission data 10 years'),
 ('TELE INFORMASI DATA','11600','17','112',10,'PDF page 7, Lampiran I row 17.11, column 11 TELE INFORMASI DATA'),
 ('TRANS','11700','18','102',5,'PDF page 7, Lampiran I row 18.2, column 10 TRANS')
) as v(function_code,class_code,type_code,subtype_code,years,locator)
on conflict(rule_version,function_code,class_code,type_code,subtype_code,effective_from) do nothing;
