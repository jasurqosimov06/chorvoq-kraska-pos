-- =====================================================================
-- CHORVOQ KRASKA — tovarlar, kirimlar va yetkazib beruvchilarni 0 ga qaytarish.
-- O'chadi: tovarlar, kirimlar (ombor qoldig'i), vozvratlar, yetkazib beruvchilar va ularning qarzi,
--          yetkazib beruvchiga to'lovlar hamda shularning kassadagi yozuvlari (kirim/vozvrat/yetkazuvchi-tolov).
-- Qoladi: sotuvlar, mijozlar va ularning qarzi, xarajatlar, dividendlar, boshqa kassa harakatlari,
--         akkauntlar, sozlamalar (kurs). Qaytarib bo'lmaydi!
-- Qurilmalar settings.data.resetId o'zgarganini ko'rib, lokal nusxani yubormasdan yangilaydi.
-- =====================================================================

truncate table public.products, public.purchases, public.suppliers;
delete from public.payments where kind = 'supplier';
delete from public.ledger where type in ('kirim', 'vozvrat', 'yetkazuvchi-tolov');

update public.settings
set data = data || jsonb_build_object(
      'resetId', gen_random_uuid()::text,
      'updatedMs', (extract(epoch from clock_timestamp()) * 1000)::bigint),
    updated_ms = (extract(epoch from clock_timestamp()) * 1000)::bigint
where id = 'main';

-- Natija (hammasi 0 bo'lishi kerak)
select (select count(*) from public.products) as "Tovarlar",
       (select count(*) from public.purchases) as "Kirimlar",
       (select count(*) from public.suppliers) as "Yetkazib beruvchilar",
       (select count(*) from public.payments where kind = 'supplier') as "Ularga to'lovlar";
