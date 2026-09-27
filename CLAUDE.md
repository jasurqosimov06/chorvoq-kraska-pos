# CHORVOQ KRASKA POS / ERP

MARKAZZO POS/ERP'ning alohida nusxasi (boshqa do'kon, boshqa brend).
MUHIM: MARKAZZO (~/Projects/markazzo-pos, markazzo-pos.vercel.app, uning Supabase'i) ga HECH QACHON tegilmaydi.
Jonli: https://chorvoq-kraska-pos.vercel.app (Vercel team "markazzo", loyiha chorvoq-kraska-pos; Supabase qjlethmonvfmzxowpqnh)
GitHub: https://github.com/jasurqosimov06/chorvoq-kraska-pos
Bu loyiha o'z GitHub repo, o'z Supabase va o'z Vercel loyihasiga ega bo'lishi shart — Markazzo kalitlarini bu yerga qo'ymang.

## Stek
- React 18 + TypeScript + Vite, react-router
- Local-first: Dexie (IndexedDB, baza nomi `VITE_DB_NAME`, standart `chorvoq_c1`) → Supabase bilan sinxron (`src/lib/sync.ts`: push 4s / pull 20s + realtime)
- Supabase: auth + Postgres, sxema `supabase/schema.sql` (⚠️ jadvallarni o'chiradi — faqat yangi baza uchun; ruxsatlar: `supabase/rollar.sql`, qayta ishlatsa bo'ladi) (bigint id, `updated_ms`/`deleted` sinxron ustunlari, RLS, profiles+rollar)
- Deploy: Vercel (env: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`)

## Ishga tushirish (yangi kompyuterda)
1. `.env.example` → `.env.local` nusxa, Supabase kalitlarini kiriting (git'ga yuklanmaydi)
2. `npm install`
3. `npm run dev` → http://localhost:5174 (Markazzo 5173 bilan to'qnashmasligi uchun)
4. Build: `npm run build` (0 xato bo'lishi shart)

## Tuzilma
- `src/lib/data.ts` — barcha biznes logika (checkout, returnSale, returnToSupplier, addExpense, transferMoney...)
- `src/lib/auth.tsx` — login/rollar. Admin = hammasi; Sotuvchi = Kassa/Ostatka/Qarzlar/Mijozlar. Birinchi ro'yxatdan o'tgan = admin (DB trigger)
- `src/pages/` — POS (Kassa), Dashboard, Products, Purchases (Kirim/Vozvrat), Stock, Customers, Debts, Balances (Hisob), Expenses, Reports, Settings

## AI: rasmdan tovar qo'shish
- `api/ai-products.ts` — Vercel funksiya: rasm(lar) → Claude (`claude-opus-5`, structured output) → tovarlar ro'yxati. Faqat Admin (Supabase token + profiles.role tekshiriladi).
- Vercel env: `ANTHROPIC_API_KEY` (faqat serverda; `VITE_` prefiksi QO'YILMAYDI). Env o'zgarsa — qayta deploy.
- UI: `src/components/AiImportModal.tsx` (Tovarlar → 🤖 Rasmdan qo'shish). Miqdor → pul harakatisiz kirim (`addPurchase`, paidUzs 0).
- `vite dev` /api ni ishlatmaydi — to'liq sinov faqat deploy'da (yoki `vercel dev`).

## Rollar va tannarx (supabase/rollar.sql)
- Sotuvchi kirim narxini ko'rmaydi: tovar/kirimni `products_public`/`purchases_public` view'dan tortadi; `sales.cost/profit`, `sale_lines.cost` bazada doim 0 (trigger), haqiqiysi `sale_costs`/`sale_line_costs` da (faqat admin). Sotuvchi sotganda tannarxni trigger hisoblaydi (cost_usd × settings.kurs).
- Admin sotuvlarni `sales_full`/`sale_lines_full` dan oladi. Qaysi rol qayerdan tortishi: `src/lib/sync.ts` PULL_SOURCE / NO_PUSH.
- Boshqa foydalanuvchi/rol kirganda lokal Dexie tozalanadi (`sync_owner`). Chiqishda avval push.

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

## Brendlar (bir kod — bir nechta do'kon)
- Brend env orqali: `src/brand.ts` (runtime) + `vite.config.ts` brandPlugin (index.html, manifest). Standart = CHORVOQ KRASKA (feruza #0e7490).
- Env: `VITE_BRAND_NAME`, `VITE_BRAND_HIGHLIGHT`, `VITE_BRAND_TAGLINE`, `VITE_BRAND_COLOR(_2/_DARK)`, `VITE_DB_NAME`, `VITE_SEED_DEMO` (`.env.example`ga qarang)
- Yangi do'kon: yangi Supabase loyiha (`supabase/schema.sql` ni ishga tushirish) + shu repo'dan yangi Vercel loyiha, o'z env qiymatlari bilan.
