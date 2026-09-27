-- =====================================================================
-- CHORVOQ KRASKA — rollarga qarab ruxsatlar (RLS) va tannarxni yashirish.
-- Ma'lumotlarni O'CHIRMAYDI, xohlagancha qayta ishga tushirsa bo'ladi.
--
-- Admin    — hamma narsani ko'radi va yozadi.
-- Sotuvchi — Kassa / Ostatka / Qarzlar / Mijozlar uchun keraklisi, KIRIM NARXISIZ:
--   * tovarlar       → products_public ko'rinishi (cost_usd yo'q), faqat o'qish
--   * kirimlar       → purchases_public ko'rinishi (faqat miqdor), faqat o'qish
--   * sotuv, sotuv qatorlari → yozadi; tannarx/foyda ustunlari doim 0 bo'lib turadi,
--     haqiqiysi sale_costs / sale_line_costs jadvallarida (faqat admin), sotuvchi
--     sotganda tannarxni server o'zi tovar narxi × kurs bo'yicha hisoblaydi
--   * mijozlar, ta'minotchilar, to'lovlar — o'qish/yozish
--   * pul harakatlari (ledger) — faqat sotuv/qaytarish/qarz to'lovi turlari
--   * xarajatlar, doimiy xarajatlar, dividendlar — umuman yo'q
-- Admin sotuvlarni sales_full / sale_lines_full ko'rinishlaridan (tannarx bilan) oladi.
-- =====================================================================

create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles where id = auth.uid() and role = 'admin');
$$;

-- ---------- Tannarx jadvallari (faqat admin) ----------
create table if not exists public.sale_costs (
  id bigint primary key, cost double precision default 0, profit double precision default 0
);
create table if not exists public.sale_line_costs (
  id bigint primary key, cost double precision default 0
);

-- Qayta ishga tushirganda triggerlar ko'chirishga xalaqit bermasin
drop trigger if exists sales_cost_trg on public.sales;
drop trigger if exists sale_lines_cost_trg on public.sale_lines;
drop trigger if exists sale_lines_bump_trg on public.sale_lines;

-- Mavjud tannarxlarni ko'chirish (updated_ms o'zgarmaydi)
insert into public.sale_costs (id, cost, profit)
  select id, coalesce(cost, 0), coalesce(profit, 0) from public.sales
  where coalesce(cost, 0) <> 0 or coalesce(profit, 0) <> 0
  on conflict (id) do nothing;
insert into public.sale_line_costs (id, cost)
  select id, coalesce(cost, 0) from public.sale_lines where coalesce(cost, 0) <> 0
  on conflict (id) do nothing;
update public.sales set cost = 0, profit = 0 where coalesce(cost, 0) <> 0 or coalesce(profit, 0) <> 0;
update public.sale_lines set cost = 0 where coalesce(cost, 0) <> 0;

-- ---------- Triggerlar: tannarx asosiy jadvalda saqlanmaydi ----------
create or replace function public.sales_cost_fn()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if public.is_admin() then
    insert into public.sale_costs (id, cost, profit)
    values (new.id, coalesce(new.cost, 0), coalesce(new.profit, 0))
    on conflict (id) do update set cost = excluded.cost, profit = excluded.profit;
  end if;
  new.cost := 0;
  new.profit := 0;
  return new;
end; $$;

create or replace function public.sale_lines_cost_fn()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  real_cost double precision;
  k double precision;
begin
  if public.is_admin() then
    insert into public.sale_line_costs (id, cost) values (new.id, coalesce(new.cost, 0))
    on conflict (id) do update set cost = excluded.cost;
  elsif tg_op = 'INSERT' and not exists (select 1 from public.sale_line_costs where id = new.id) then
    -- Sotuvchi sotdi: tannarx = katalogdagi kirim narxi ($) × joriy kurs
    select coalesce((data->>'kurs')::double precision, 0) into k from public.settings where id = 'main';
    select coalesce(cost_usd, 0) * coalesce(k, 0) into real_cost from public.products where id = new.product_id;
    insert into public.sale_line_costs (id, cost) values (new.id, coalesce(real_cost, 0));
  end if;
  new.cost := 0;
  return new;
end; $$;

-- Sotuvchi qatorlari keyin kelsa, admin sotuvni qayta tortib olishi uchun uni "yangilaymiz"
create or replace function public.sale_lines_bump_fn()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then
    update public.sales set updated_ms = greatest(coalesce(updated_ms, 0), coalesce(new.updated_ms, 0)) + 1
    where id = new.sale_id;
  end if;
  return null;
end; $$;

create trigger sales_cost_trg before insert or update on public.sales
  for each row execute function public.sales_cost_fn();
create trigger sale_lines_cost_trg before insert or update on public.sale_lines
  for each row execute function public.sale_lines_cost_fn();
create trigger sale_lines_bump_trg after insert on public.sale_lines
  for each row execute function public.sale_lines_bump_fn();

-- ---------- Ko'rinishlar (view) ----------
create or replace view public.products_public as
  select id, barcode, sku, name, family, category, brand, unit, size, price_uzs, image_data,
         created_at, updated_ms, deleted
  from public.products where auth.uid() is not null;

create or replace view public.purchases_public as
  select id, date, product_id, qty, created_at, updated_ms, deleted
  from public.purchases where auth.uid() is not null;

create or replace view public.sale_lines_full as
  select sl.id, sl.sale_id, sl.product_id, sl.name, sl.qty, sl.price, coalesce(c.cost, 0) as cost,
         sl.created_at, sl.updated_ms, sl.deleted
  from public.sale_lines sl left join public.sale_line_costs c on c.id = sl.id
  where public.is_admin();

create or replace view public.sales_full as
  select s.id, s.number, s.date, s.customer_id, s.total,
         coalesce(sc.cost, lc.cost, 0) as cost,
         coalesce(sc.profit, s.total - coalesce(lc.cost, 0)) as profit,
         s.cashback_earned, s.cashback_used, s.paid, s.debt, s.payment_method,
         s.created_at, s.updated_ms, s.deleted
  from public.sales s
  left join public.sale_costs sc on sc.id = s.id
  left join lateral (
    select sum(c.cost * l.qty) as cost
    from public.sale_lines l join public.sale_line_costs c on c.id = l.id
    where l.sale_id = s.id
  ) lc on true
  where public.is_admin();

revoke all on public.products_public, public.purchases_public, public.sale_lines_full, public.sales_full from anon, public;
grant select on public.products_public, public.purchases_public, public.sale_lines_full, public.sales_full to authenticated;

-- ---------- RLS qoidalari ----------
do $$
declare t text;
begin
  foreach t in array array['settings','products','purchases','customers','suppliers',
    'sales','sale_lines','payments','fixed_expenses','expenses','dividends','ledger',
    'sale_costs','sale_line_costs']
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
  -- Sotuvchi: faqat o'qish (tovar/kirim — faqat yuqoridagi ko'rinishlar orqali)
  execute 'create policy seller_read on public.settings for select to authenticated using (true);';
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
