-- DDER TOOLS nakladnoyi (2026-09-06) ta'minotchisiz import qilingan bo'lsa:
-- DDER brendli, ta'minotchisiz kirimlarni "DDER TOOLS" ga bog'laydi va qarzni kirim summasidan qo'shadi.
-- Ikkinchi marta ishga tushirilsa hech narsa qo'shmaydi (faqat ta'minotchisiz kirimlar olinadi).
do $$
declare
  sid bigint;
  total double precision;
  ms bigint := (extract(epoch from clock_timestamp()) * 1000)::bigint;
begin
  select id into sid from public.suppliers
  where lower(trim(name)) = 'dder tools' and coalesce(deleted, false) = false limit 1;
  if sid is null then
    sid := floor(random() * 9000000000000000)::bigint;
    insert into public.suppliers (id, name, phone, debt, created_at, updated_ms, deleted)
    values (sid, 'DDER TOOLS', '+998 95 172 39 59', 0, ms, ms, false);
  end if;

  select coalesce(sum(p.qty * p.cost_usd * p.kurs), 0) into total
  from public.purchases p join public.products pr on pr.id = p.product_id
  where pr.brand = 'DDER' and p.supplier_id is null and coalesce(p.deleted, false) = false;

  update public.purchases p
  set supplier = 'DDER TOOLS', supplier_id = sid, date = '2026-09-06', updated_ms = ms
  from public.products pr
  where pr.id = p.product_id and pr.brand = 'DDER' and p.supplier_id is null and coalesce(p.deleted, false) = false;

  update public.suppliers set debt = coalesce(debt, 0) + total, updated_ms = ms where id = sid;
end $$;

-- Natija: ta'minotchi qarzi va unga bog'langan kirimlar
select s.name as "Ta'minotchi", round(s.debt::numeric) as "Qarz (so'm)",
       (select count(*) from public.purchases p where p.supplier_id = s.id) as "Kirimlar soni",
       (select round(sum(p.qty * p.cost_usd)::numeric, 2) from public.purchases p where p.supplier_id = s.id) as "Jami ($)"
from public.suppliers s where lower(trim(s.name)) = 'dder tools';
