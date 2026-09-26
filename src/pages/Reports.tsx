import { Fragment, useMemo, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db'
import { useProducts, useSales } from '../lib/data'
import { num, som, monthNow, today } from '../lib/format'
import { useToast } from '../components/Toast'

interface Item { name: string; sku: string; cat: string; qty: number; sale: number; cost: number }
interface Group { sup: string; items: Item[]; qty: number; sale: number; cost: number }

export default function Reports() {
  const sales = useSales()
  const lines = useLiveQuery(() => db.saleLines.filter((l) => !l.deleted).toArray(), [], [])
  const purchases = useLiveQuery(() => db.purchases.filter((p) => !p.deleted).toArray(), [], [])
  const products = useProducts()
  const toast = useToast()

  const ym = monthNow()
  const [from, setFrom] = useState(ym + '-01')
  const [to, setTo] = useState(today())
  const [busy, setBusy] = useState(false)

  const report = useMemo(() => {
    const saleById = new Map(sales.map((s) => [s.id, s]))
    const inRange = (s: any) => s && (!from || s.date >= from) && (!to || s.date <= to)
    const psup: Record<number, string> = {}
    for (const x of purchases) {
      const sup = (x.supplier || '').trim()
      if (sup && x.productId != null && !psup[x.productId]) psup[x.productId] = sup.startsWith('VALIK') ? 'VALIK №1' : sup
    }
    const prodById = new Map(products.map((p) => [p.id, p]))
    const agg = new Map<number, Item>()
    for (const l of lines) {
      if (!inRange(saleById.get(l.saleId))) continue
      const cur = agg.get(l.productId) || { name: '', sku: '', cat: '', qty: 0, sale: 0, cost: 0 }
      cur.qty += l.qty; cur.sale += l.price * l.qty; cur.cost += l.cost * l.qty
      agg.set(l.productId, cur)
    }
    const bysup = new Map<string, Item[]>()
    for (const [pid, a] of agg) {
      const p = prodById.get(pid)
      a.name = p?.name || "(o'chirilgan tovar)"; a.sku = p?.sku || ''; a.cat = p?.category || ''
      const sup = psup[pid] || '— (noma\'lum)'
      if (!bysup.has(sup)) bysup.set(sup, [])
      bysup.get(sup)!.push(a)
    }
    const groups: Group[] = [...bysup.entries()].map(([sup, items]) => ({
      sup, items: items.sort((x, y) => y.sale - x.sale),
      qty: items.reduce((s, x) => s + x.qty, 0), sale: items.reduce((s, x) => s + x.sale, 0), cost: items.reduce((s, x) => s + x.cost, 0),
    })).sort((a, b) => b.sale - a.sale)
    const total = {
      qty: groups.reduce((s, g) => s + g.qty, 0), sale: groups.reduce((s, g) => s + g.sale, 0), cost: groups.reduce((s, g) => s + g.cost, 0),
      types: agg.size,
    }
    return { groups, total }
  }, [sales, lines, purchases, products, from, to])

  async function exportXlsx() {
    setBusy(true)
    try {
      const XLSX = await import('xlsx')
      const rows: any[][] = [
        ['MARKAZZO — Sotilgan tovarlar hisoboti'],
        [`Sana oralig'i: ${from || 'boshidan'} — ${to || 'oxirigacha'}`],
        [],
        ['№', "Ta'minotchi", 'Tovar', 'Kod', 'Kategoriya', 'Sotilgan', "Sotuv summasi (so'm)", "Tannarx (so'm)", "Foyda (so'm)"],
      ]
      let n = 0
      for (const g of report.groups) {
        for (const it of g.items) {
          n++
          rows.push([n, g.sup, it.name, it.sku, it.cat, it.qty, Math.round(it.sale), Math.round(it.cost), Math.round(it.sale - it.cost)])
        }
        rows.push(['', 'Jami: ' + g.sup, '', '', '', g.qty, Math.round(g.sale), Math.round(g.cost), Math.round(g.sale - g.cost)])
      }
      rows.push(['', 'UMUMIY JAMI', '', '', '', report.total.qty, Math.round(report.total.sale), Math.round(report.total.cost), Math.round(report.total.sale - report.total.cost)])
      const ws = XLSX.utils.aoa_to_sheet(rows)
      ws['!cols'] = [{ wch: 5 }, { wch: 20 }, { wch: 38 }, { wch: 12 }, { wch: 22 }, { wch: 10 }, { wch: 18 }, { wch: 16 }, { wch: 16 }]
      const wb = XLSX.utils.book_new()
      XLSX.utils.book_append_sheet(wb, ws, 'Sotilgan tovarlar')
      XLSX.writeFile(wb, `MARKAZZO_sotilgan_${from || 'all'}_${to || 'now'}.xlsx`)
      toast('Excel yuklab olindi', 'ok')
    } catch (e: any) {
      toast('Xatolik: ' + (e?.message ?? ''), 'err')
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <div className="card">
        <h2>Sotilgan tovarlar hisoboti</h2>
        <div className="row" style={{ alignItems: 'flex-end' }}>
          <div className="field"><label>Sanadan</label><input className="input" type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></div>
          <div className="field"><label>Sanagacha</label><input className="input" type="date" value={to} onChange={(e) => setTo(e.target.value)} /></div>
          <button className="btn" onClick={() => { setFrom(''); setTo('') }}>Butun davr</button>
          <span className="spacer" />
          <button className="btn primary lg" onClick={exportXlsx} disabled={busy || report.total.types === 0}>📥 Excel yuklab olish</button>
        </div>
      </div>

      <div className="kpis" style={{ marginBottom: 16 }}>
        <div className="kpi"><div className="lab">Sotilgan tovar turi</div><div className="val">{report.total.types}</div></div>
        <div className="kpi"><div className="lab">Umumiy sotuv</div><div className="val">{som(report.total.sale)}</div></div>
        <div className="kpi"><div className="lab">Tannarx</div><div className="val">{som(report.total.cost)}</div></div>
        <div className="kpi"><div className="lab">Foyda</div><div className="val green">{som(report.total.sale - report.total.cost)}</div></div>
      </div>

      <div className="table-wrap">
        <table>
          <thead><tr><th>Tovar</th><th>Kod</th><th className="num">Sotilgan</th><th className="num">Sotuv (so'm)</th><th className="num">Foyda (so'm)</th></tr></thead>
          <tbody>
            {report.groups.map((g) => (
              <Fragment key={g.sup}>
                <tr><td colSpan={5} style={{ background: '#1f1f1f', color: '#fff', fontWeight: 700 }}>Ta'minotchi: {g.sup}</td></tr>
                {g.items.map((it, i) => (
                  <tr key={g.sup + i}>
                    <td>{it.name}</td>
                    <td>{it.sku}</td>
                    <td className="num">{it.qty}</td>
                    <td className="num">{num(it.sale)}</td>
                    <td className="num">{num(it.sale - it.cost)}</td>
                  </tr>
                ))}
                <tr style={{ background: '#f2dcdc', fontWeight: 700 }}>
                  <td colSpan={2}>Jami: {g.sup}</td>
                  <td className="num">{g.qty}</td>
                  <td className="num">{num(g.sale)}</td>
                  <td className="num">{num(g.sale - g.cost)}</td>
                </tr>
              </Fragment>
            ))}
            {report.total.types === 0 && <tr><td colSpan={5} className="empty">Bu davrда sotuv yo'q</td></tr>}
          </tbody>
        </table>
      </div>
    </>
  )
}
