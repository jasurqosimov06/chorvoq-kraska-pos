-- =====================================================================
-- CHORVOQ KRASKA — rollarga qarab ruxsatlar (RLS). Ma'lumotlarga TEGMAYDI,
-- xohlagancha qayta ishga tushirsa bo'ladi.
--
-- Admin    — hamma jadvalni o'qiydi va yozadi.
-- Sotuvchi — Kassa / Ostatka / Qarzlar / Mijozlar uchun keraklisi:
--   * sotuv, sotuv qatorlari, mijozlar, ta'minotchilar, to'lovlar — o'qish/yozish
--   * tovarlar, kirimlar (qoldiq hisobi uchun), sozlamalar      — faqat o'qish
--   * pul harakatlari (ledger)  — faqat sotuv/qaytarish/qarz to'lovi turlari
--   * xarajatlar, doimiy xarajatlar, dividendlar                 — umuman yo'q
-- =====================================================================

create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles where id = auth.uid() and role = 'admin');
$$;

do $$
declare t text;
begin
  -- Eski "hamma hammasini qila oladi" qoidasini olib tashlash, admin uchun to'liq ruxsat
  foreach t in array array['settings','products','purchases','customers','suppliers',
    'sales','sale_lines','payments','fixed_expenses','expenses','dividends','ledger']
  loop
    execute format('alter table public.%I enable row level security;', t);
    execute format('drop policy if exists auth_all on public.%I;', t);
    execute format('drop policy if exists admin_all on public.%I;', t);
    execute format('drop policy if exists seller_rw on public.%I;', t);
    execute format('drop policy if exists seller_read on public.%I;', t);
    execute format('create policy admin_all on public.%I for all to authenticated using (public.is_admin()) with check (public.is_admin());', t);
  end loop;

  -- Sotuvchi: o'qish + yozish
  foreach t in array array['customers','suppliers','sales','sale_lines','payments']
  loop
    execute format('create policy seller_rw on public.%I for all to authenticated using (true) with check (true);', t);
  end loop;

  -- Sotuvchi: faqat o'qish
  foreach t in array array['products','purchases','settings']
  loop
    execute format('create policy seller_read on public.%I for select to authenticated using (true);', t);
  end loop;
end $$;

-- Sotuvchi: kassadagi pul harakatlarining faqat o'ziga tegishli turlari
drop policy if exists seller_ledger on public.ledger;
create policy seller_ledger on public.ledger for all to authenticated
  using (type in ('sotuv', 'qaytarish', 'qarz-tolov', 'yetkazuvchi-tolov'))
  with check (type in ('sotuv', 'qaytarish', 'qarz-tolov', 'yetkazuvchi-tolov'));

-- Profil: hamma o'qiydi, har kim faqat o'z ismini o'zgartira oladi (rolni emas)
alter table public.profiles enable row level security;
drop policy if exists profiles_read on public.profiles;
create policy profiles_read on public.profiles for select to authenticated using (true);
drop policy if exists profiles_self on public.profiles;
create policy profiles_self on public.profiles for update to authenticated using (auth.uid() = id);
revoke update on public.profiles from anon, authenticated;
grant update (name) on public.profiles to authenticated;

-- Tayyor!
