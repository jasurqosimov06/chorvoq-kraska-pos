import { useMemo, useState } from 'react'
import { useProducts, useSettings, useStockMap } from '../lib/data'
import { costUzs, num, som } from '../lib/format'
import { authRequired, useAuth } from '../lib/auth'

export default function Stock() {
  const products = useProducts()
  const stockMap = useStockMap()
  const settings = useSettings()
  const { role } = useAuth()
  const showCost = !authRequired || role === 'admin' // sotuvchi tannarxni ko'rmaydi
  const [q, setQ] = useState('')
  const [onlyLow, setOnlyLow] = useState(false)

  const rows = useMemo(() => {
    const s = q.trim().toLowerCase()
    return products
      .map((p) => {
        const e = stockMap.get(p.id!) ?? { purchased: 0, sold: 0, stock: 0 }
        const cost = costUzs(p.costUsd || 0, settings.kurs)
        const status = e.stock <= 0 ? 'out' : e.stock <= settings.lowStockLimit ? 'low' : 'ok'
        return { p, ...e, cost, costVal: e.stock * cost, saleVal: e.stock * p.priceUzs, status }
      })
      .filter((r) => (!s || r.p.name.toLowerCase().includes(s) || r.p.sku.toLowerCase().includes(s) || r.p.category.toLowerCase().includes(s)))
      .filter((r) => (!onlyLow || r.status !== 'ok'))
  }, [products, stockMap, settings, q, onlyLow])

  const totalCost = rows.reduce((s, r) => s + r.costVal, 0)
  const totalSale = rows.reduce((s, r) => s + r.saleVal, 0)

  return (
    <>
      <div className="kpis" style={{ marginBottom: 16 }}>
        {showCost && <div className="kpi"><div className="lab">Ombor qiymati (tannarx)</div><div className="val">{som(totalCost)}</div></div>}
        <div className="kpi"><div className="lab">Ombor qiymati (sotuvda)</div><div className="val">{som(totalSale)}</div></div>
        {showCost && <div className="kpi"><div className="lab">Kutilayotgan foyda</div><div className="val green">{som(totalSale - totalCost)}</div></div>}
        <div className="kpi"><div className="lab">Kam/tugagan tovarlar</div><div className="val">{rows.filter((r) => r.status !== 'ok').length}</div></div>
      </div>

      <div className="section-head">
        <input className="input" style={{ maxWidth: 340 }} placeholder="Qidirish..." value={q} onChange={(e) => setQ(e.target.value)} />
        <label className="row" style={{ gap: 8 }}><input type="checkbox" checked={onlyLow} onChange={(e) => setOnlyLow(e.target.checked)} /> Faqat kam qolganlar</label>
      </div>

      <div className="table-wrap">
        <table>
          <thead>
            <tr><th>Kod</th><th>Nomi</th><th>Kategoriya</th><th className="num">Kirim</th><th className="num">Sotuv</th><th className="num">Qoldiq</th>{showCost && <th className="num">Qiymat (tannarx)</th>}<th className="num">Qiymat (sotuv)</th><th>Holat</th></tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.p.id}>
                <td>{r.p.sku}</td>
                <td><b>{r.p.name}</b></td>
                <td>{r.p.category}</td>
                <td className="num">{r.purchased}</td>
                <td className="num">{r.sold}</td>
                <td className="num"><b>{r.stock}</b> {r.p.unit}</td>
                {showCost && <td className="num">{num(r.costVal)}</td>}
                <td className="num">{num(r.saleVal)}</td>
                <td>
                  {r.status === 'ok' && <span className="badge ok">Bor</span>}
                  {r.status === 'low' && <span className="badge low">Kam qoldi</span>}
                  {r.status === 'out' && <span className="badge out">Tugadi</span>}
                </td>
              </tr>
            ))}
            {rows.length === 0 && <tr><td colSpan={showCost ? 9 : 8} className="empty">Ma'lumot yo'q</td></tr>}
          </tbody>
        </table>
      </div>
    </>
  )
}
