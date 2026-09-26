import { useMemo, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db'
import { useProducts, useSettings, useStockMap, useCustomers, useSuppliers, useFixedExpenses, useExpenses, useBalances, useSales } from '../lib/data'
import { costUzs, num, pct, som, today, monthNow, inMonth } from '../lib/format'
import { sendTelegram } from '../lib/telegram'
import { useToast } from '../components/Toast'

export default function Dashboard() {
  const settings = useSettings()
  const products = useProducts()
  const stockMap = useStockMap()
  const toast = useToast()
  const sales = useSales()
  const lines = useLiveQuery(() => db.saleLines.filter((l) => !l.deleted).toArray(), [], [])
  const customers = useCustomers()
  const suppliers = useSuppliers()
  const fixedExp = useFixedExpenses()
  const variableExp = useExpenses()
  const balances = useBalances()
  const [sending, setSending] = useState(false)
  const cashTotal = balances.naqd + balances.plastik + balances.bank

  const receivable = customers.reduce((s, c) => s + (c.debt || 0), 0)
  const payable = suppliers.reduce((s, x) => s + (x.debt || 0), 0)

  const ym = monthNow()
  const monthGross = sales.filter((s) => inMonth(s.date, ym)).reduce((a, s) => a + (s.profit || 0), 0)
  const monthFixed = fixedExp.filter((f) => f.active).reduce((a, f) => a + (f.amount || 0), 0)
  const monthVar = variableExp.filter((e) => inMonth(e.date, ym)).reduce((a, e) => a + (e.amount || 0), 0)
  const monthExpenses = monthFixed + monthVar
  const monthNet = monthGross - monthExpenses

  const t = today()
  const stats = useMemo(() => {
    const todays = sales.filter((s) => s.date === t)
    const todaySales = todays.reduce((s, x) => s + x.total, 0)
    const todayProfit = todays.reduce((s, x) => s + x.profit, 0)
    const totalSales = sales.reduce((s, x) => s + x.total, 0)
    const totalCost = sales.reduce((s, x) => s + x.cost, 0)
    const totalProfit = totalSales - totalCost
    const avgMarja = totalSales ? totalProfit / totalSales : 0
    const rent = totalCost ? totalProfit / totalCost : 0

    let stockCost = 0
    for (const p of products) {
      const st = stockMap.get(p.id!)?.stock ?? 0
      stockCost += st * costUzs(p.costUsd, settings.kurs)
    }
    // top products by revenue
    const byProd = new Map<number, { name: string; rev: number; profit: number; qty: number }>()
    for (const l of lines) {
      const e = byProd.get(l.productId) ?? { name: l.name, rev: 0, profit: 0, qty: 0 }
      e.rev += l.price * l.qty
      e.profit += (l.price - l.cost) * l.qty
      e.qty += l.qty
      byProd.set(l.productId, e)
    }
    const top = [...byProd.values()].sort((a, b) => b.rev - a.rev).slice(0, 7)
    const lowCount = products.filter((p) => (stockMap.get(p.id!)?.stock ?? 0) <= settings.lowStockLimit).length

    return { todaySales, todayProfit, totalSales, totalProfit, avgMarja, rent, stockCost, top, lowCount, count: sales.length }
  }, [sales, lines, products, stockMap, settings, t])

  async function report() {
    setSending(true)
    const txt =
      `<b>📊 ${settings.shopName} — kunlik hisobot</b>\n${t}\n\n` +
      `💰 Bugungi sotuv: <b>${num(stats.todaySales)} so'm</b>\n` +
      `📈 Bugungi foyda: <b>${num(stats.todayProfit)} so'm</b>\n\n` +
      `Jami sotuv: ${num(stats.totalSales)} so'm\n` +
      `Jami foyda: ${num(stats.totalProfit)} so'm\n` +
      `O'rtacha marja: ${pct(stats.avgMarja)}\n` +
      `Rentabellik: ${pct(stats.rent)}\n` +
      `Ombor qiymati (tannarx): ${num(stats.stockCost)} so'm\n` +
      `Kam qolgan tovarlar: ${stats.lowCount} ta\n` +
      `Mijozlar qarzi (bizga): ${num(receivable)} so'm\n` +
      `Yetkazib beruvchi qarzi (bizdan): ${num(payable)} so'm\n\n` +
      `<b>Bu oy:</b>\nXarajat: ${num(monthExpenses)} so'm\nSof foyda: <b>${num(monthNet)} so'm</b>`
    const res = await sendTelegram(settings.telegramToken, settings.telegramChatId, txt)
    setSending(false)
    if (res.ok) toast('Telegramga yuborildi', 'ok')
    else toast('Telegram: ' + res.error, 'err')
  }

  return (
    <>
      <div className="kpis">
        <div className="kpi"><div className="lab">Bugungi sotuv</div><div className="val">{som(stats.todaySales)}</div></div>
        <div className="kpi"><div className="lab">Bugungi foyda</div><div className="val green">{som(stats.todayProfit)}</div></div>
        <div className="kpi"><div className="lab">Umumiy sotuv</div><div className="val">{som(stats.totalSales)}</div><div className="sub">{stats.count} ta chek</div></div>
        <div className="kpi"><div className="lab">Umumiy foyda</div><div className="val green">{som(stats.totalProfit)}</div></div>
        <div className="kpi"><div className="lab">O'rtacha marja</div><div className="val">{pct(stats.avgMarja)}</div></div>
        <div className="kpi"><div className="lab">Rentabellik</div><div className="val">{pct(stats.rent)}</div><div className="sub">foyda / tannarx</div></div>
        <div className="kpi"><div className="lab">Ombor qiymati (tannarx)</div><div className="val">{som(stats.stockCost)}</div></div>
        <div className="kpi"><div className="lab">Kam qolgan tovarlar</div><div className="val">{stats.lowCount}</div></div>
        <div className="kpi"><div className="lab">Mijozlar qarzi (bizga)</div><div className="val">{som(receivable)}</div></div>
        <div className="kpi"><div className="lab">Yetkazib beruvchi qarzi (bizdan)</div><div className="val">{som(payable)}</div></div>
        <div className="kpi"><div className="lab">Bu oy xarajat</div><div className="val">{som(monthExpenses)}</div></div>
        <div className="kpi"><div className="lab">Bu oy sof foyda</div><div className="val" style={{ color: monthNet >= 0 ? 'var(--green)' : 'var(--brand)' }}>{som(monthNet)}</div></div>
        <div className="kpi"><div className="lab">Hisobda jami (naqd+plastik+bank)</div><div className="val">{som(cashTotal)}</div><div className="sub">💵 {num(balances.naqd)} · 💳 {num(balances.plastik)} · 🏦 {num(balances.bank)}</div></div>
      </div>

      <div className="card" style={{ marginTop: 16 }}>
        <div className="section-head">
          <h2>Eng ko'p sotilgan tovarlar</h2>
          <button className="btn primary" onClick={report} disabled={sending}>📲 Telegramga hisobot</button>
        </div>
        <div className="table-wrap">
          <table>
            <thead><tr><th>Tovar</th><th className="num">Sotilgan</th><th className="num">Tushum</th><th className="num">Foyda</th></tr></thead>
            <tbody>
              {stats.top.map((r, i) => (
                <tr key={i}><td><b>{r.name}</b></td><td className="num">{r.qty}</td><td className="num">{num(r.rev)}</td><td className="num">{num(r.profit)}</td></tr>
              ))}
              {stats.top.length === 0 && <tr><td colSpan={4} className="empty">Hali sotuv yo'q. Kassadan sotuvni boshlang.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
    </>
  )
}
