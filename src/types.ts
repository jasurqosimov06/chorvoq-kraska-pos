export type Account = 'naqd' | 'plastik' | 'bank'

export const ACCOUNTS: { key: Account; label: string; ic: string }[] = [
  { key: 'naqd', label: 'Naqd', ic: '💵' },
  { key: 'plastik', label: 'Plastik', ic: '💳' },
  { key: 'bank', label: 'Bank hisob', ic: '🏦' },
]

export function accountLabel(a: Account): string {
  return ACCOUNTS.find((x) => x.key === a)?.label ?? a
}

// Kassa harakati (ledger): kirim +, chiqim −
export interface Ledger {
  id?: number
  date: string
  account: Account
  amount: number // + kirim, − chiqim
  type: string // sotuv | kirim | xarajat | dividend | qarz-tolov | yetkazuvchi-tolov | otkazma | tuzatish
  note: string
  createdAt: number
}

export interface Settings {
  id: number // always 1
  shopName: string
  kurs: number // 1 USD -> UZS
  lowStockLimit: number
  cashbackPercent: number // % of sale total credited to customer
  telegramToken: string
  telegramChatId: string
  openNaqd: number // boshlang'ich qoldiq (so'm)
  openPlastik: number
  openBank: number
  updatedMs?: number // sinxron uchun
}

export interface Product {
  id?: number
  barcode: string
  sku: string
  name: string
  family: string // bir turdagi tovar guruhi (masalan "Akril emulsiya")
  category: string
  brand: string
  unit: string
  size: string // hajm/o'lchov (20 kg, 10 kg, 3 kg)
  costUsd: number
  priceUzs: number
  imageData: string // base64 rasm (data URL) yoki ''
  createdAt: number
}

export interface Supplier {
  id?: number
  name: string
  phone: string
  debt: number // biz shu yetkazib beruvchiga qarzdormiz (so'm)
  createdAt: number
}

export interface Payment {
  id?: number
  partyId: number // customerId yoki supplierId
  kind: 'customer' | 'supplier'
  amount: number
  date: string
  note: string
  createdAt: number
}

export interface Purchase {
  id?: number
  date: string // yyyy-mm-dd
  productId: number
  qty: number
  costUsd: number
  kurs: number
  supplier: string
  supplierId?: number | null
  paidUzs: number // qabul paytida to'langan summa (so'm)
  createdAt: number
}

export interface Customer {
  id?: number
  name: string
  phone: string
  cashback: number // balance in UZS
  debt: number // mijoz bizga qarzdor (so'm)
  totalSpent: number
  createdAt: number
}

export interface Sale {
  id?: number
  number: string
  date: string // yyyy-mm-dd
  customerId?: number | null
  total: number
  cost: number
  profit: number
  cashbackEarned: number
  cashbackUsed: number
  paid: number // hozir to'langan (so'm)
  debt: number // qarzga qolgan (so'm)
  paymentMethod: string // Naqd | Karta | Qarz
  createdAt: number
}

export interface SaleLine {
  id?: number
  saleId: number
  productId: number
  name: string
  qty: number
  price: number // priceUzs at sale time
  cost: number // costUzs at sale time
  createdAt: number
}

export interface CartLine {
  productId: number
  barcode: string
  name: string
  unit: string
  qty: number
  price: number
  cost: number
  stock: number
}

export interface FixedExpense {
  id?: number
  name: string
  amount: number // oylik summa (so'm)
  active: boolean
  note: string
  createdAt: number
}

export interface Expense {
  id?: number
  date: string // yyyy-mm-dd
  category: string
  name: string
  amount: number // so'm
  note: string
  createdAt: number
}

export interface Dividend {
  id?: number
  date: string // yyyy-mm-dd
  amount: number // so'm
  note: string
  createdAt: number
}

export const EXPENSE_CATS = [
  'Obed / ovqat',
  'Dostavka',
  "Sovg'a",
  'KPI / bonus',
  'Transport',
  'Reklama',
  "Ta'mir / xo'jalik",
  'Soliq / bank',
  'Boshqa',
]

export const CATEGORIES = [
  "Bo'yoq (Suvli/Vodoemulsiya)",
  "Bo'yoq (Moyli/Emal)",
  'Lak',
  'Gruntovka (Praymer)',
  'Shpaklyovka',
  'Dekorativ shtukaturka',
  'Dekorativ qoplama',
  'Rastvoritel (Eritma)',
  'Asboblar',
  'Lenta / Plyonka',
  'Boshqa',
]

export const UNITS = ['dona', 'kg', 'litr', 'komplekt', 'metr']
