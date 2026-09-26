# MARKAZZO POS / ERP

Kraska va dekorativ qoplama do'koni uchun Billz uslubidagi POS/ERP web-ilova.
Jonli: https://markazzo-pos.vercel.app

## Stek
- React 18 + TypeScript + Vite, react-router
- Local-first: Dexie (IndexedDB, baza nomi `markazzo_c1`) → Supabase bilan sinxron (`src/lib/sync.ts`: push 4s / pull 20s + realtime)
- Supabase: auth + Postgres, sxema `supabase/schema.sql` (bigint id, `updated_ms`/`deleted` sinxron ustunlari, RLS, profiles+rollar)
- Deploy: Vercel (env: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`)

## Ishga tushirish (yangi kompyuterda)
1. `.env.example` → `.env.local` nusxa, Supabase kalitlarini kiriting (git'ga yuklanmaydi)
2. `npm install`
3. `npm run dev` → http://localhost:5173
4. Build: `npm run build` (0 xato bo'lishi shart)

## Tuzilma
- `src/lib/data.ts` — barcha biznes logika (checkout, returnSale, returnToSupplier, addExpense, transferMoney...)
- `src/lib/auth.tsx` — login/rollar. Admin = hammasi; Sotuvchi = Kassa/Ostatka/Qarzlar/Mijozlar. Birinchi ro'yxatdan o'tgan = admin (DB trigger)
- `src/pages/` — POS (Kassa), Dashboard, Products, Purchases (Kirim/Vozvrat), Stock, Customers, Debts, Balances (Hisob), Expenses, Reports, Settings

## Muhim qoidalar / tuzoqlar
- `onAuthStateChange` ichida DB'ni await qilmang — deadlock. Profil alohida effektda yuklanadi.
- ID'lar global `genId()`; o'chirish faqat yumshoq (`softDelete`), bulutdan keladigan yozuvlarda `setApplyingRemote`.
- Har bir pul harakati `ledger`ga ishorali yoziladi (sotuv +, kirim/xarajat −). Hisoblar: Naqd/Plastik/Bank.
- Tannarx katalogdagi kirim narxidan olinadi (FIFO emas).
- Mobil: grid bolalariga `min-width: 0` (grid blowout oldini olish).
- Dev-server bir nechta nusxada ishlasa bulutni ifloslashi mumkin — test uchun alohida Supabase loyiha afzal.

## Ish tartibi (bir nechta kompyuter)
- Boshlashdan oldin `git pull`, tugatgach `git add -A && git commit && git push`.

## Tarix
v0.2 qarzlar · v0.3 xarajatlar/sof foyda/dividend · v0.4 hisoblar/ledger · v0.5 Supabase+login+sync ·
v0.6 narxni qo'lda o'zgartirish, sotuvni qaytarish · v0.7 mobil overflow · v0.8 chekni ko'rish ·
v0.9 Hisobotlar + Excel eksport · v0.10 ta'minotchiga vozvrat

## Reja
- Brendni sozlanadigan qilish (nom/logo/rang env yoki Settings orqali) → ikkinchi do'kon uchun alohida Supabase + Vercel
