import Dexie, { type Table } from 'dexie'
import type { Settings, Product, Purchase, Customer, Sale, SaleLine, Supplier, Payment, FixedExpense, Expense, Dividend, Ledger } from './types'

// Sinxron uchun har yozuvga qo'shiladigan maydonlar
export type Syncable = { updatedMs?: number; deleted?: boolean }

export type SProduct = Product & Syncable
export type SPurchase = Purchase & Syncable
export type SCustomer = Customer & Syncable
export type SSale = Sale & Syncable
export type SSaleLine = SaleLine & Syncable
export type SSupplier = Supplier & Syncable
export type SPayment = Payment & Syncable
export type SFixedExpense = FixedExpense & Syncable
export type SExpense = Expense & Syncable
export type SDividend = Dividend & Syncable
export type SLedger = Ledger & Syncable

// Global noyob ID (offline ham to'qnashmaydi)
export function genId(): number {
  return Math.floor(Math.random() * 9007199254740991)
}

// Sinxron bulutdan yozayotganda hooklar updatedMs ni bosib ketmasligi uchun bayroq
let applyingRemote = false
export function setApplyingRemote(v: boolean) { applyingRemote = v }

// Sinxronlanadigan raqamli-id jadvallar
export const SYNC_TABLES = [
  'products', 'purchases', 'customers', 'suppliers', 'sales', 'sale_lines',
  'payments', 'fixed_expenses', 'expenses', 'dividends', 'ledger',
] as const

// Dexie jadval nomi ↔ bulut jadval nomi
export const TABLE_MAP: Record<string, string> = {
  products: 'products', purchases: 'purchases', customers: 'customers', suppliers: 'suppliers',
  sales: 'sales', saleLines: 'sale_lines', payments: 'payments', fixedExpenses: 'fixed_expenses',
  expenses: 'expenses', dividends: 'dividends', ledger: 'ledger',
}

export class MarkazzoDB extends Dexie {
  settings!: Table<Settings, number>
  products!: Table<SProduct, number>
  purchases!: Table<SPurchase, number>
  customers!: Table<SCustomer, number>
  sales!: Table<SSale, number>
  saleLines!: Table<SSaleLine, number>
  suppliers!: Table<SSupplier, number>
  payments!: Table<SPayment, number>
  fixedExpenses!: Table<SFixedExpense, number>
  expenses!: Table<SExpense, number>
  dividends!: Table<SDividend, number>
  ledger!: Table<SLedger, number>

  constructor() {
    // Baza nomi (sxema o'zgarganda toza boshlash uchun)
    super('markazzo_c2')
    this.version(1).stores({
      settings: 'id',
      products: 'id, barcode, sku, name, category',
      purchases: 'id, productId, date, supplierId',
      customers: 'id, phone, name',
      sales: 'id, date, number, customerId',
      saleLines: 'id, saleId, productId',
      suppliers: 'id, name, phone',
      payments: 'id, partyId, kind, date',
      fixedExpenses: 'id, name',
      expenses: 'id, date, category',
      dividends: 'id, date',
      ledger: 'id, date, account, type',
    })

    const dataTables = ['products', 'purchases', 'customers', 'suppliers', 'sales', 'saleLines',
      'payments', 'fixedExpenses', 'expenses', 'dividends', 'ledger']
    for (const name of dataTables) {
      const tbl = (this as any)[name] as Table<any, number>
      tbl.hook('creating', (_pk: any, obj: any) => {
        if (obj.id == null) obj.id = genId()
        if (obj.deleted == null) obj.deleted = false
        if (!applyingRemote) obj.updatedMs = Date.now()
        else if (obj.updatedMs == null) obj.updatedMs = Date.now()
      })
      tbl.hook('updating', (_mods: any) => {
        if (!applyingRemote) return { updatedMs: Date.now() }
        return undefined
      })
    }
  }
}

export const db = new MarkazzoDB()

// Yumshoq o'chirish (sinxron uchun) — haqiqiy o'chirish o'rniga
export async function softDelete(table: string, id: number) {
  await (db as any)[table].update(id, { deleted: true })
}

export const DEFAULT_SETTINGS: Settings = {
  id: 1,
  shopName: 'MARKAZZO',
  kurs: 12650,
  lowStockLimit: 5,
  cashbackPercent: 2,
  telegramToken: '',
  telegramChatId: '',
  openNaqd: 0,
  openPlastik: 0,
  openBank: 0,
}

// family, sku, barcode, nomi, kat, brend, hajm, birlik, costUsd, priceUzs, boshlang'ich qoldiq
const SEED: Array<[string, string, string, string, string, string, string, string, number, number, number]> = [
  ['Akril emulsiya', 'BY001', '4780001000011', 'Akril emulsiya oq 20kg', "Bo'yoq (Suvli/Vodoemulsiya)", 'MARKAZZO', '20 kg', 'dona', 11.0, 189000, 40],
  ['Akril emulsiya', 'BY001B', '4780001000042', 'Akril emulsiya oq 10kg', "Bo'yoq (Suvli/Vodoemulsiya)", 'MARKAZZO', '10 kg', 'dona', 6.0, 105000, 50],
  ['Akril emulsiya', 'BY001C', '4780001000059', 'Akril emulsiya oq 3kg', "Bo'yoq (Suvli/Vodoemulsiya)", 'MARKAZZO', '3 kg', 'dona', 2.2, 42000, 70],
  ['Fasad bo\'yoq', 'BY003', '4780001000035', "Fasad bo'yoq oq 15kg", "Bo'yoq (Suvli/Vodoemulsiya)", 'Sadolin', '15 kg', 'dona', 15.2, 265000, 18],
  ['Emal PF-115', 'EM001', '4780001000066', 'Emal PF-115 oq 2.7kg', "Bo'yoq (Moyli/Emal)", 'Olimp', '2.7 kg', 'dona', 4.8, 82000, 48],
  ['Emal PF-115', 'EM002', '4780001000073', 'Emal PF-115 qora 0.9kg', "Bo'yoq (Moyli/Emal)", 'Olimp', '0.9 kg', 'dona', 1.9, 34000, 60],
  ['Lak', 'LK001', '4780001000080', 'Yaxlit lak (PF) 0.8kg', 'Lak', 'Tikkurila', '0.8 kg', 'dona', 3.6, 65000, 30],
  ['Gruntovka', 'GR001', '4780001000097', 'Gruntovka chuqur 10L', 'Gruntovka (Praymer)', 'Ceresit', '10 L', 'dona', 6.4, 112000, 30],
  ['Beton-kontakt', 'GR002', '4780001000103', 'Beton-kontakt 15kg', 'Gruntovka (Praymer)', 'Knauf', '15 kg', 'dona', 9.8, 168000, 22],
  ['Shpaklyovka', 'SH001', '4780001000110', 'Start shpaklyovka 20kg', 'Shpaklyovka', 'Knauf', '20 kg', 'dona', 4.2, 72000, 60],
  ['Shpaklyovka', 'SH002', '4780001000127', 'Finish shpaklyovka 25kg', 'Shpaklyovka', 'Vetonit', '25 kg', 'dona', 7.5, 129000, 45],
  ['Dekorativ shtukaturka', 'DS001', '4780001000134', 'Dekorativ shtukaturka 25kg', 'Dekorativ shtukaturka', 'Bayramix', '25 kg', 'dona', 18.0, 315000, 20],
  ['Travertin', 'DK001', '4780001000141', 'Travertin qoplama 15kg', 'Dekorativ qoplama', 'MARKAZZO', '15 kg', 'dona', 22.0, 385000, 15],
  ['Marmarin', 'DK002', '4780001000158', 'Marmarin effekt 5kg', 'Dekorativ qoplama', 'San Marco', '5 kg', 'dona', 12.5, 219000, 24],
  ['Rastvoritel', 'RS001', '4780001000165', 'Ular rastvoritel 646, 5L', 'Rastvoritel (Eritma)', 'Nitro', '5 L', 'dona', 5.2, 89000, 35],
  ['Valik', 'AS001', '4780001000172', 'Valik 25sm (yuqori tuk)', 'Asboblar', 'Color Expert', '25 sm', 'dona', 2.1, 38000, 100],
  ['Cho\'tka', 'AS002', '4780001000189', "Cho'tka 3\" tekis", 'Asboblar', 'Color Expert', '3 dyuym', 'dona', 0.9, 17000, 120],
  ['Shpatel', 'AS003', '4780001000196', "Shpatel to'plami (5 dona)", 'Asboblar', 'Stayer', '5 dona', 'komplekt', 3.4, 62000, 40],
  ['Malyar lenta', 'LN001', '4780001000202', 'Malyar lenta 48mm x 40m', 'Lenta / Plyonka', 'Blue Dolphin', '48mm', 'dona', 1.1, 21000, 90],
]

// Namuna uchun barqaror (deterministik) ID — takrorlanmaslik uchun (upsert)
const SEED_PID_BASE = 900_000_000_000_000
const SEED_KID_BASE = 900_000_000_000_100

// Namuna ma'lumot yuklash (lokal). Sinxron rejimda faqat bulut bo'sh bo'lsa chaqiriladi.
export async function seedData() {
  const count = await db.products.count()
  if (count > 0) return
  const now = Date.now()
  const today = new Date().toISOString().slice(0, 10)
  const products: SProduct[] = []
  const purchases: SPurchase[] = []
  SEED.forEach(([family, sku, barcode, name, category, brand, size, unit, costUsd, priceUzs, startQty], i) => {
    const pid = SEED_PID_BASE + i
    products.push({ id: pid, family, barcode, sku, name, category, brand, unit, size, costUsd, priceUzs, imageData: '', createdAt: now } as SProduct)
    if (startQty > 0) {
      const summa = startQty * costUsd * DEFAULT_SETTINGS.kurs
      purchases.push({
        id: SEED_KID_BASE + i, date: today, productId: pid, qty: startQty, costUsd,
        kurs: DEFAULT_SETTINGS.kurs, supplier: "Boshlang'ich qoldiq", supplierId: null,
        paidUzs: summa, createdAt: now,
      } as SPurchase)
    }
  })
  await db.products.bulkPut(products)
  await db.purchases.bulkPut(purchases)
}

export async function ensureSettings() {
  const s = await db.settings.get(1)
  if (!s) await db.settings.put(DEFAULT_SETTINGS)
}

export async function getSettings(): Promise<Settings> {
  return (await db.settings.get(1)) ?? DEFAULT_SETTINGS
}
