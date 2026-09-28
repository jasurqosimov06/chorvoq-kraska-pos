-- =====================================================================
-- CHORVOQ KRASKA — barcha ma'lumotni 0 ga qaytarish.
-- Akkauntlar (login/parol) va rollar QOLADI. Qaytarib bo'lmaydi!
-- Oldin supabase/rollar.sql ishga tushirilgan bo'lishi kerak (sale_costs jadvallari).
-- Qurilmalar settings.data.resetId o'zgarganini ko'rib, lokal nusxani yubormasdan o'chiradi.
-- =====================================================================

truncate table public.sale_lines, public.sales, public.purchases, public.payments,
  public.ledger, public.expenses, public.dividends, public.fixed_expenses,
  public.customers, public.suppliers, public.products,
  public.sale_costs, public.sale_line_costs;

-- Kassadagi boshlang'ich qoldiqlar 0; resetId — qurilmalarga "lokal nusxani o'chir" belgisi
insert into public.settings (id, data, updated_ms)
values ('main', jsonb_build_object(
    'openNaqd', 0, 'openPlastik', 0, 'openBank', 0,
    'resetId', gen_random_uuid()::text,
    'updatedMs', (extract(epoch from clock_timestamp()) * 1000)::bigint),
  (extract(epoch from clock_timestamp()) * 1000)::bigint)
on conflict (id) do update
  set data = public.settings.data || excluded.data, updated_ms = excluded.updated_ms;
