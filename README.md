# CHORVOQ KRASKA — Do'kon boshqaruv tizimi (POS/ERP)

Kraska va dekorativ qoplamalar do'koni uchun kassa (POS) va ombor tizimi. Billz uslubida, lekin o'zingizniki.

**Texnologiya:** React + TypeScript + Vite. Ma'lumotlar hozircha brauzerda (IndexedDB) saqlanadi — internetsiz ham ishlaydi. Keyingi bosqichda Supabase bulutiga ulanadi.

## Nimalar bor (MVP)
- 🛒 **Kassa (POS)** — tovar qidirish, kamera orqali shtrix-kod skanerlash, savat, sotish
- 🧾 **Chek** — sotuvdan keyin chekni chop etish (printer yoki PDF)
- 📦 **Tovarlar** — katalog, narx, marja; qo'shish/tahrirlash, shtrix-kod
- 📥 **Kirim** — tovar qabul qilish (USD narx → so'mga avtomatik)
- 🗃️ **Ostatka** — real vaqtli ombor qoldig'i, "Kam qoldi / Tugadi" ogohlantirishi
- 👤 **Mijozlar (CRM)** — mijoz bazasi, keshbek/sodiqlik
- 💰 **Hisob (Kassa balansi)** — Naqd / Plastik / Bank hisoblari balansi, o'tkazma, tuzatish, pul harakatlari tarixi
- 💳 **Qarzlar** — mijoz qarzi (bizga) va yetkazib beruvchi qarzi (bizdan), to'lovlar
- 💸 **Xarajatlar + sof foyda** — doimiy (arenda/kommunal/oylik) va o'zgaruvchan (obed/dostavka/sovg'a/KPI) xarajatlar; oylik Sof foyda hisoboti va dividend
- 📊 **Boshqaruv** — sotuv, foyda, o'rtacha marja, rentabellik, sof foyda, top tovarlar
- 📲 **Telegram** — kunlik hisobotni Telegramga yuborish
- 💾 **Zaxira** — JSON backup / tiklash

## Kompyuterda ishga tushirish
```bash
cd chorvoq-kraska-pos
npm install
npm run dev
```
Brauzerda ochiladi: http://localhost:5173

## Telefonda ochish (bir xil Wi-Fi)
`npm run dev` ishga tushganda "Network" manzili chiqadi (masalan `http://172.20.10.3:5173`).
Telefonni **kompyuter bilan bir xil Wi-Fi**ga ulang va shu manzilni brauzerda oching.
> Diqqat: kamera (shtrix-kod) faqat `localhost` yoki `https` da ishlaydi. Telefonda kamera uchun quyidagi bulutga chiqarish kerak.

## Bulutga chiqarish (telefon + kompyuter, istalgan joydan) — TAVSIYA
Xuddi Billz kabi istalgan joydan kirish uchun **Vercel** (bepul):
1. Loyihani GitHub'ga yuklang.
2. vercel.com'da "New Project" → GitHub repo'ni tanlang → Deploy.
3. Ochilgan `https://...vercel.app` manzil ham telefonda, ham kompyuterda ishlaydi, kamera ham. Telefonda "Add to Home Screen" bilan ilova sifatida o'rnatiladi (PWA).

## Keyingi bosqich — bulut baza (real sinxron)
Hozir ma'lumot har qurilmada alohida (brauzer bazasida). Bir do'konda bir necha kassa/telefon **bitta umumiy bazada** ishlashi uchun **Supabase** (bepul tarif) qo'shiladi:
- Supabase'da PostgreSQL jadval + Realtime;
- `src/lib/data.ts` dagi ma'lumot qatlami Supabase adapteriga almashtiriladi (ilova shunga tayyor tuzilgan);
- login/rollar (sotuvchi, admin), ko'p filial.

Ayni shu qadamni birga bajaramiz — sizga faqat bepul Supabase akkount kerak.

## Tuzilma
```
src/
  db.ts            # Dexie (IndexedDB) sxema + namuna tovarlar
  types.ts         # ma'lumot tiplari
  lib/
    data.ts        # so'rovlar, ombor hisobi, checkout (sotuv logikasi)
    format.ts      # son/valyuta formatlash, marja
    telegram.ts    # Telegram xabar
    receipt.ts     # chek chop etish
  components/       # Modal, ScannerModal, Toast
  pages/            # POS, Dashboard, Products, Purchases, Stock, Customers, Settings
```
