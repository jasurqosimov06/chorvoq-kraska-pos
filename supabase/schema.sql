-- =====================================================================
-- CHORVOQ KRASKA — Supabase baza sxemasi (offline-sync + rollar)
-- Supabase Dashboard → SQL Editor → yangi query → shu faylni to'liq
-- joylashtiring va RUN bosing. (Jadvallar bo'sh bo'lsa xavfsiz qayta ishga tushadi.)
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

-- ---------- Xavfsizlik (RLS): faqat tizimga kirganlar ----------
do $$
declare t text;
begin
  foreach t in array array['settings','products','purchases','customers','suppliers',
    'sales','sale_lines','payments','fixed_expenses','expenses','dividends','ledger']
  loop
    execute format('alter table public.%I enable row level security;', t);
    execute format('drop policy if exists auth_all on public.%I;', t);
    execute format('create policy auth_all on public.%I for all to authenticated using (true) with check (true);', t);
  end loop;
end $$;

alter table public.profiles enable row level security;
drop policy if exists profiles_read on public.profiles;
create policy profiles_read on public.profiles for select to authenticated using (true);
drop policy if exists profiles_self on public.profiles;
create policy profiles_self on public.profiles for update to authenticated using (auth.uid() = id);
-- Foydalanuvchi faqat o'z ismini o'zgartira oladi; rolni (admin/sotuvchi) faqat Supabase paneli orqali
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
