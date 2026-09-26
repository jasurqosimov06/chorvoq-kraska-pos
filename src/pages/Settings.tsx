import { useEffect, useState } from 'react'
import { db, DEFAULT_SETTINGS, seedData } from '../db'
import { getSettings } from '../db'
import type { Settings as S } from '../types'
import { sendTelegram } from '../lib/telegram'
import { useToast } from '../components/Toast'
import { fileSlug } from '../brand'

export default function Settings() {
  const toast = useToast()
  const [s, setS] = useState<S>(DEFAULT_SETTINGS)

  useEffect(() => { getSettings().then(setS) }, [])

  async function save() {
    await db.settings.put({ ...s, id: 1, updatedMs: Date.now() })
    toast('Sozlamalar saqlandi', 'ok')
  }

  async function testTelegram() {
    const r = await sendTelegram(s.telegramToken, s.telegramChatId, `✅ ${s.shopName}: Telegram ulanishi ishlayapti!`)
    if (r.ok) toast('Test xabari yuborildi', 'ok')
    else toast('Xato: ' + r.error, 'err')
  }

  async function backup() {
    const data = {
      settings: await db.settings.toArray(),
      products: await db.products.toArray(),
      purchases: await db.purchases.toArray(),
      customers: await db.customers.toArray(),
      sales: await db.sales.toArray(),
      saleLines: await db.saleLines.toArray(),
      suppliers: await db.suppliers.toArray(),
      payments: await db.payments.toArray(),
      fixedExpenses: await db.fixedExpenses.toArray(),
      expenses: await db.expenses.toArray(),
      dividends: await db.dividends.toArray(),
      ledger: await db.ledger.toArray(),
      exportedAt: new Date().toISOString(),
    }
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `${fileSlug.toLowerCase()}-backup-${new Date().toISOString().slice(0, 10)}.json`
    a.click()
    toast('Zaxira nusxa yuklandi', 'ok')
  }

  async function restore(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    if (!confirm('Barcha joriy ma\'lumotlar zaxiradagi bilan almashtiriladi. Davom etilsinmi?')) return
    const data = JSON.parse(await file.text())
    await db.transaction('rw', [db.settings, db.products, db.purchases, db.customers, db.sales, db.saleLines, db.suppliers, db.payments, db.fixedExpenses, db.expenses, db.dividends, db.ledger], async () => {
      await Promise.all([db.settings.clear(), db.products.clear(), db.purchases.clear(), db.customers.clear(), db.sales.clear(), db.saleLines.clear(), db.suppliers.clear(), db.payments.clear(), db.fixedExpenses.clear(), db.expenses.clear(), db.dividends.clear(), db.ledger.clear()])
      await db.settings.bulkAdd(data.settings ?? [])
      await db.products.bulkAdd(data.products ?? [])
      await db.purchases.bulkAdd(data.purchases ?? [])
      await db.customers.bulkAdd(data.customers ?? [])
      await db.sales.bulkAdd(data.sales ?? [])
      await db.saleLines.bulkAdd(data.saleLines ?? [])
      await db.suppliers.bulkAdd(data.suppliers ?? [])
      await db.payments.bulkAdd(data.payments ?? [])
      await db.fixedExpenses.bulkAdd(data.fixedExpenses ?? [])
      await db.expenses.bulkAdd(data.expenses ?? [])
      await db.dividends.bulkAdd(data.dividends ?? [])
      await db.ledger.bulkAdd(data.ledger ?? [])
    })
    toast('Tiklandi', 'ok')
    getSettings().then(setS)
  }

  async function resetAll() {
    if (!confirm("HAMMA ma'lumot o'chib, namuna tovarlar qayta yuklanadi. Davom etilsinmi?")) return
    await db.transaction('rw', [db.settings, db.products, db.purchases, db.customers, db.sales, db.saleLines, db.suppliers, db.payments, db.fixedExpenses, db.expenses, db.dividends, db.ledger], async () => {
      await Promise.all([db.settings.clear(), db.products.clear(), db.purchases.clear(), db.customers.clear(), db.sales.clear(), db.saleLines.clear(), db.suppliers.clear(), db.payments.clear(), db.fixedExpenses.clear(), db.expenses.clear(), db.dividends.clear(), db.ledger.clear()])
    })
    await seedData()
    toast('Tizim tozalandi', 'ok')
    getSettings().then(setS)
  }

  return (
    <>
      <div className="card">
        <h2>Umumiy</h2>
        <div className="grid2">
          <div className="field"><label>Do'kon nomi</label><input className="input" value={s.shopName} onChange={(e) => setS({ ...s, shopName: e.target.value })} /></div>
          <div className="field"><label>USD kursi (1$ = so'm)</label><input className="input" type="number" value={s.kurs} onChange={(e) => setS({ ...s, kurs: Number(e.target.value) })} /></div>
          <div className="field"><label>Kam qoldi chegarasi</label><input className="input" type="number" value={s.lowStockLimit} onChange={(e) => setS({ ...s, lowStockLimit: Number(e.target.value) })} /></div>
          <div className="field"><label>Keshbek foizi (%)</label><input className="input" type="number" step="0.1" value={s.cashbackPercent} onChange={(e) => setS({ ...s, cashbackPercent: Number(e.target.value) })} /></div>
        </div>
        <div className="row" style={{ marginTop: 14 }}><button className="btn primary" onClick={save}>Saqlash</button></div>
      </div>

      <div className="card">
        <h2>Telegram hisobot</h2>
        <p style={{ color: '#64748b', marginTop: 0, fontSize: 13.5 }}>
          @BotFather'dan bot yarating va tokenni oling. Chat ID — o'zingiz yoki guruh ID. Keyin Boshqaruvdan hisobot yuborasiz.
        </p>
        <div className="grid2">
          <div className="field"><label>Bot Token</label><input className="input" value={s.telegramToken} onChange={(e) => setS({ ...s, telegramToken: e.target.value })} placeholder="123456:ABC-..." /></div>
          <div className="field"><label>Chat ID</label><input className="input" value={s.telegramChatId} onChange={(e) => setS({ ...s, telegramChatId: e.target.value })} placeholder="-100..." /></div>
        </div>
        <div className="row" style={{ marginTop: 14 }}>
          <button className="btn primary" onClick={save}>Saqlash</button>
          <button className="btn" onClick={testTelegram}>Test yuborish</button>
        </div>
      </div>

      <div className="card">
        <h2>Ma'lumotlar (zaxira)</h2>
        <p style={{ color: '#64748b', marginTop: 0, fontSize: 13.5 }}>
          Ma'lumotlar shu qurilma brauzerida saqlanadi. Muntazam zaxira nusxa oling. Bulutga (Supabase) ulanish keyingi bosqichda qo'shiladi.
        </p>
        <div className="row">
          <button className="btn" onClick={backup}>⬇️ Zaxira nusxa (JSON)</button>
          <label className="btn">⬆️ Tiklash<input type="file" accept="application/json" hidden onChange={restore} /></label>
          <button className="btn danger" onClick={resetAll}>🗑 Tozalash + namuna</button>
        </div>
      </div>
    </>
  )
}
