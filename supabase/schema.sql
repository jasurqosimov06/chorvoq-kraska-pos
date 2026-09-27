-- =====================================================================
-- CHORVOQ KRASKA — Supabase baza sxemasi (offline-sync + rollar)
-- Supabase Dashboard → SQL Editor → yangi query → shu faylni to'liq
-- joylashtiring va RUN bosing. FAQAT YANGI (BO'SH) BAZA UCHUN!
-- ⚠️ Bu fayl jadvallarni O'CHIRIB qayta yaratadi — ma'lumot bor bazada ISHLATMANG.
-- Mavjud bazada ruxsatlarni yangilash uchun: supabase/rollar.sql
-- =====================================================================

-- ---------- Foydalanuvchi profillari (rollar) ----------
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  name text default '',
  role text not null default 'sotuvchi',   -- 'admin' | 'sotuvchi'
  created_at timestamptz default now()
);

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, name, role)
  values (new.id, coalesce(new.raw_user_meta_data->>'name', ''),
          case when (select count(*) from public.profiles) = 0 then 'admin' else 'sotuvchi' end);
  return new;
end; $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users for each row execute function public.handle_new_user();

-- ---------- Ma'lumot jadvallari (bigint id + sync ustunlari) ----------
-- id: mijoz tomonidan yaratilgan noyob raqam | updated_ms: sync soati | deleted: yumshoq o'chirish

drop table if exists public.sale_lines cascade;
drop table if exists public.sales cascade;
drop table if exists public.purchases cascade;
drop table if exists public.payments cascade;
drop table if exists public.ledger cascade;
drop table if exists public.expenses cascade;
drop table if exists public.dividends cascade;
drop table if exists public.fixed_expenses cascade;
drop table if exists public.customers cascade;
drop table if exists public.suppliers cascade;
drop table if exists public.products cascade;
drop table if exists public.settings cascade;
drop table if exists public.sale_costs cascade;
drop table if exists public.sale_line_costs cascade;

create table public.settings (
  id text primary key default 'main', data jsonb not null default '{}',
  updated_ms bigint default 0, deleted boolean default false
);
create table public.products (
  id bigint primary key, barcode text default '', sku text default '', name text default '',
  family text default '', category text default '', brand text default '', unit text default '', size text default '',
  cost_usd double precision default 0, price_uzs double precision default 0, image_data text default '',
  created_at bigint, updated_ms bigint default 0, deleted boolean default false
);
create table public.purchases (
  id bigint primary key, date text, product_id bigint, qty double precision default 0,
  cost_usd double precision default 0, kurs double precision default 0, supplier text default '',
  supplier_id bigint, paid_uzs double precision default 0,
  created_at bigint, updated_ms bigint default 0, deleted boolean default false
);
create table public.customers (
  id bigint primary key, name text default '', phone text default '',
  cashback double precision default 0, debt double precision default 0, total_spent double precision default 0,
  created_at bigint, updated_ms bigint default 0, deleted boolean default false
);
create table public.suppliers (
  id bigint primary key, name text default '', phone text default '', debt double precision default 0,
  created_at bigint, updated_ms bigint default 0, deleted boolean default false
);
create table public.sales (
  id bigint primary key, number text, date text, customer_id bigint,
  total double precision default 0, cost double precision default 0, profit double precision default 0,
  cashback_earned double precision default 0, cashback_used double precision default 0,
  paid double precision default 0, debt double precision default 0, payment_method text default '',
  created_at bigint, updated_ms bigint default 0, deleted boolean default false
);
create table public.sale_lines (
  id bigint primary key, sale_id bigint, product_id bigint, name text default '',
  qty double precision default 0, price double precision default 0, cost double precision default 0,
  created_at bigint, updated_ms bigint default 0, deleted boolean default false
);
create table public.payments (
  id bigint primary key, party_id bigint, kind text, amount double precision default 0,
  date text, note text default '', created_at bigint, updated_ms bigint default 0, deleted boolean default false
);
create table public.fixed_expenses (
  id bigint primary key, name text default '', amount double precision default 0,
  active boolean default true, note text default '', created_at bigint, updated_ms bigint default 0, deleted boolean default false
);
create table public.expenses (
  id bigint primary key, date text, category text default '', name text default '',
  amount double precision default 0, note text default '', created_at bigint, updated_ms bigint default 0, deleted boolean default false
);
create table public.dividends (
  id bigint primary key, date text, amount double precision default 0, note text default '',
  created_at bigint, updated_ms bigint default 0, deleted boolean default false
);
create table public.ledger (
  id bigint primary key, date text, account text, amount double precision default 0,
  type text, note text default '', created_at bigint, updated_ms bigint default 0, deleted boolean default false
);

-- ---------- Xavfsizlik (RLS) + tannarxni yashirish: supabase/rollar.sql bilan bir xil ----------
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


-- ---------- Realtime (jonli sinxron) ----------
do $$
declare t text;
begin
  foreach t in array array['products','purchases','customers','suppliers',
    'sales','sale_lines','payments','fixed_expenses','expenses','dividends','ledger','settings']
  loop
    begin execute format('alter publication supabase_realtime add table public.%I;', t);
    exception when duplicate_object then null; end;
  end loop;
end $$;

-- Tayyor!
