import Dexie, { type Table } from 'dexie'
import type { Settings, Product, Purchase, Customer, Sale, SaleLine, Supplier, Payment, FixedExpense, Expense, Dividend, Ledger } from './types'

export class MarkazzoDB extends Dexie {
  settings!: Table<Settings, number>
  products!: Table<Product, number>
  purchases!: Table<Purchase, number>
  customers!: Table<Customer, number>
  sales!: Table<Sale, number>
  saleLines!: Table<SaleLine, number>
  suppliers!: Table<Supplier, number>
  payments!: Table<Payment, number>
  fixedExpenses!: Table<FixedExpense, number>
  expenses!: Table<Expense, number>
  dividends!: Table<Dividend, number>
  ledger!: Table<Ledger, number>

  constructor() {
    super('markazzo')
    this.version(1).stores({
      settings: 'id',
      products: '++id, barcode, sku, name, category',
      purchases: '++id, productId, date',
      customers: '++id, phone, name',
      sales: '++id, date, number, customerId',
      saleLines: '++id, saleId, productId',
    })
    // v2: qarzdorlik + yetkazib beruvchi + to'lovlar
    this.version(2).stores({
      suppliers: '++id, name, phone',
      payments: '++id, partyId, kind, date',
      purchases: '++id, productId, date, supplierId',
    })
    // v3: xarajatlar + dividend
    this.version(3).stores({
      fixedExpenses: '++id, name',
      expenses: '++id, date, category',
      dividends: '++id, date',
    })
    // v4: hisoblar (naqd/plastik/bank) — kassa harakati
    this.version(4).stores({
      ledger: '++id, date, account, type',
    })
  }
}

export const db = new MarkazzoDB()

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

export async function ensureSeed() {
  const s = await db.settings.get(1)
  if (!s) await db.settings.put(DEFAULT_SETTINGS)
  const count = await db.products.count()
  if (count === 0) {
    const now = Date.now()
    const today = new Date().toISOString().slice(0, 10)
    for (const [family, sku, barcode, name, category, brand, size, unit, costUsd, priceUzs, startQty] of SEED) {
      const pid = (await db.products.add({
        family, barcode, sku, name, category, brand, unit, size, costUsd, priceUzs, imageData: '', createdAt: now,
      })) as number
      if (startQty > 0) {
        const summa = startQty * costUsd * DEFAULT_SETTINGS.kurs
        await db.purchases.add({
          date: today, productId: pid, qty: startQty, costUsd,
          kurs: DEFAULT_SETTINGS.kurs, supplier: "Boshlang'ich qoldiq", supplierId: null,
          paidUzs: summa, createdAt: now,
        })
      }
    }
    // namuna doimiy (o'zgarmas) oylik xarajatlar
    const fixed: Array<[string, number]> = [
      ["Do'kon arendasi", 3000000],
      ['Kommunal (svet, suv, gaz)', 800000],
      ['Ishchi oyligi', 4000000],
    ]
    for (const [name, amount] of fixed) {
      await db.fixedExpenses.add({ name, amount, active: true, note: '', createdAt: now })
    }
  }
}

export async function getSettings(): Promise<Settings> {
  return (await db.settings.get(1)) ?? DEFAULT_SETTINGS
}
