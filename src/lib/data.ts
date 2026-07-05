import { useLiveQuery } from 'dexie-react-hooks'
import { db, DEFAULT_SETTINGS } from '../db'
import type { CartLine, Account } from '../types'
import { saleNumber, today } from './format'

export function useSettings() {
  return useLiveQuery(async () => (await db.settings.get(1)) ?? DEFAULT_SETTINGS, [], DEFAULT_SETTINGS)
}

export function useProducts() {
  return useLiveQuery(() => db.products.orderBy('name').toArray(), [], [])
}

export function useSuppliers() {
  return useLiveQuery(() => db.suppliers.orderBy('name').toArray(), [], [])
}

export function useCustomers() {
  return useLiveQuery(() => db.customers.orderBy('name').toArray(), [], [])
}

export function useFixedExpenses() {
  return useLiveQuery(() => db.fixedExpenses.orderBy('id').toArray(), [], [])
}

export function useExpenses() {
  return useLiveQuery(() => db.expenses.orderBy('date').reverse().toArray(), [], [])
}

export function useDividends() {
  return useLiveQuery(() => db.dividends.orderBy('date').reverse().toArray(), [], [])
}

export function useSales() {
  return useLiveQuery(() => db.sales.toArray(), [], [])
}

export function useLedger() {
  return useLiveQuery(() => db.ledger.orderBy('id').reverse().toArray(), [], [])
}

export function useBalances() {
  return useLiveQuery(async () => {
    const s = (await db.settings.get(1)) ?? DEFAULT_SETTINGS
    const led = await db.ledger.toArray()
    const bal: Record<Account, number> = { naqd: s.openNaqd || 0, plastik: s.openPlastik || 0, bank: s.openBank || 0 }
    for (const l of led) bal[l.account] = (bal[l.account] || 0) + l.amount
    return bal
  }, [], { naqd: 0, plastik: 0, bank: 0 })
}

// productId -> { purchased, sold, stock }
export function useStockMap() {
  return useLiveQuery(async () => {
    const [purchases, lines] = await Promise.all([db.purchases.toArray(), db.saleLines.toArray()])
    const m = new Map<number, { purchased: number; sold: number; stock: number }>()
    for (const p of purchases) {
      const e = m.get(p.productId) ?? { purchased: 0, sold: 0, stock: 0 }
      e.purchased += p.qty
      m.set(p.productId, e)
    }
    for (const l of lines) {
      const e = m.get(l.productId) ?? { purchased: 0, sold: 0, stock: 0 }
      e.sold += l.qty
      m.set(l.productId, e)
    }
    for (const e of m.values()) e.stock = e.purchased - e.sold
    return m
  }, [], new Map())
}

export interface CheckoutInput {
  cart: CartLine[]
  customerId: number | null
  paymentMethod: string
  account: Account // to'langan summa qaysi hisobga tushadi
  cashbackUsed: number
  paid: number // hozir to'langan summa (so'm)
  kurs: number
  cashbackPercent: number
}

export async function checkout(input: CheckoutInput): Promise<number> {
  const { cart, customerId, paymentMethod, account, cashbackUsed, cashbackPercent } = input
  const total = cart.reduce((s, l) => s + l.price * l.qty, 0)
  const cost = cart.reduce((s, l) => s + l.cost * l.qty, 0)
  const payable = Math.max(0, total - cashbackUsed)
  const paid = Math.min(Math.max(0, input.paid), payable)
  const debt = Math.max(0, payable - paid)
  const cashbackEarned = customerId ? Math.round((paid * cashbackPercent) / 100) : 0
  const profit = total - cost

  return await db.transaction('rw', db.sales, db.saleLines, db.customers, db.ledger, async () => {
    const now = Date.now()
    const saleId = (await db.sales.add({
      number: saleNumber(),
      date: today(),
      customerId: customerId ?? null,
      total,
      cost,
      profit,
      cashbackEarned,
      cashbackUsed,
      paid,
      debt,
      paymentMethod,
      createdAt: now,
    })) as number

    for (const l of cart) {
      await db.saleLines.add({
        saleId, productId: l.productId, name: l.name,
        qty: l.qty, price: l.price, cost: l.cost, createdAt: now,
      })
    }

    if (customerId) {
      const c = await db.customers.get(customerId)
      if (c) {
        await db.customers.update(customerId, {
          cashback: Math.max(0, (c.cashback || 0) - cashbackUsed + cashbackEarned),
          debt: (c.debt || 0) + debt,
          totalSpent: (c.totalSpent || 0) + payable,
        })
      }
    }
    if (paid > 0) {
      await db.ledger.add({ date: today(), account, amount: paid, type: 'sotuv', note: `Sotuv №${saleId}`, createdAt: now })
    }
    return saleId
  })
}

// Yetkazib beruvchidan tovar qabul qilish (ombor + qarz + kassadan chiqim)
export async function addPurchase(p: {
  date: string; productId: number; qty: number; costUsd: number; kurs: number
  supplierId: number | null; supplierName: string; paidUzs: number; account: Account
}): Promise<void> {
  const summa = p.qty * p.costUsd * p.kurs
  const paid = Math.min(Math.max(0, p.paidUzs), summa)
  const debt = Math.max(0, summa - paid)
  await db.transaction('rw', db.purchases, db.products, db.suppliers, db.ledger, async () => {
    await db.purchases.add({
      date: p.date, productId: p.productId, qty: p.qty, costUsd: p.costUsd, kurs: p.kurs,
      supplier: p.supplierName, supplierId: p.supplierId, paidUzs: paid, createdAt: Date.now(),
    })
    if (p.costUsd) await db.products.update(p.productId, { costUsd: p.costUsd })
    if (p.supplierId && debt > 0) {
      const s = await db.suppliers.get(p.supplierId)
      if (s) await db.suppliers.update(p.supplierId, { debt: (s.debt || 0) + debt })
    }
    if (paid > 0) {
      await db.ledger.add({ date: p.date, account: p.account, amount: -paid, type: 'kirim', note: `Kirim: ${p.supplierName}`, createdAt: Date.now() })
    }
  })
}

// Mijoz qarzini to'lash (kassaga kirim)
export async function payCustomerDebt(customerId: number, amount: number, account: Account, note: string): Promise<void> {
  await db.transaction('rw', db.customers, db.payments, db.ledger, async () => {
    const c = await db.customers.get(customerId)
    if (!c) return
    const amt = Math.min(Math.max(0, amount), c.debt || 0)
    await db.customers.update(customerId, { debt: (c.debt || 0) - amt })
    await db.payments.add({ partyId: customerId, kind: 'customer', amount: amt, date: today(), note, createdAt: Date.now() })
    if (amt > 0) await db.ledger.add({ date: today(), account, amount: amt, type: 'qarz-tolov', note: `Mijoz qarzi: ${c.name}`, createdAt: Date.now() })
  })
}

// Yetkazib beruvchiga to'lov (kassadan chiqim)
export async function paySupplierDebt(supplierId: number, amount: number, account: Account, note: string): Promise<void> {
  await db.transaction('rw', db.suppliers, db.payments, db.ledger, async () => {
    const s = await db.suppliers.get(supplierId)
    if (!s) return
    const amt = Math.min(Math.max(0, amount), s.debt || 0)
    await db.suppliers.update(supplierId, { debt: (s.debt || 0) - amt })
    await db.payments.add({ partyId: supplierId, kind: 'supplier', amount: amt, date: today(), note, createdAt: Date.now() })
    if (amt > 0) await db.ledger.add({ date: today(), account, amount: -amt, type: 'yetkazuvchi-tolov', note: `Yetkazuvchiga: ${s.name}`, createdAt: Date.now() })
  })
}

// O'zgaruvchan xarajat (kassadan chiqim)
export async function addExpense(e: { date: string; category: string; name: string; amount: number; account: Account }): Promise<void> {
  await db.transaction('rw', db.expenses, db.ledger, async () => {
    await db.expenses.add({ date: e.date, category: e.category, name: e.name || e.category, amount: e.amount, note: '', createdAt: Date.now() })
    await db.ledger.add({ date: e.date, account: e.account, amount: -e.amount, type: 'xarajat', note: `Xarajat: ${e.name || e.category}`, createdAt: Date.now() })
  })
}

// Dividend (kassadan chiqim)
export async function addDividend(d: { date: string; amount: number; account: Account; note: string }): Promise<void> {
  await db.transaction('rw', db.dividends, db.ledger, async () => {
    await db.dividends.add({ date: d.date, amount: d.amount, note: d.note, createdAt: Date.now() })
    await db.ledger.add({ date: d.date, account: d.account, amount: -d.amount, type: 'dividend', note: `Dividend${d.note ? ': ' + d.note : ''}`, createdAt: Date.now() })
  })
}

// Hisoblar orasida o'tkazma
export async function transferMoney(from: Account, to: Account, amount: number, note: string): Promise<void> {
  if (from === to || amount <= 0) return
  const d = today()
  await db.transaction('rw', db.ledger, async () => {
    await db.ledger.add({ date: d, account: from, amount: -amount, type: 'otkazma', note: note || `O'tkazma → ${to}`, createdAt: Date.now() })
    await db.ledger.add({ date: d, account: to, amount: amount, type: 'otkazma', note: note || `O'tkazma ← ${from}`, createdAt: Date.now() })
  })
}

// Qo'lda tuzatish (+/−)
export async function adjustAccount(account: Account, delta: number, note: string): Promise<void> {
  if (!delta) return
  await db.ledger.add({ date: today(), account, amount: delta, type: 'tuzatish', note: note || 'Tuzatish', createdAt: Date.now() })
}
