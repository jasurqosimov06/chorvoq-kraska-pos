import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db'
import { useProducts, useSettings, useSuppliers, addPurchase } from '../lib/data'
import { num, som, today, usd } from '../lib/format'
import { ACCOUNTS, type Account } from '../types'
import { useToast } from '../components/Toast'

export default function Purchases() {
  const products = useProducts()
  const suppliers = useSuppliers()
  const settings = useSettings()
  const toast = useToast()
  const purchases = useLiveQuery(() => db.purchases.orderBy('id').reverse().limit(200).toArray(), [], [])
  const pmap = new Map(products.map((p) => [p.id!, p]))

  const [date, setDate] = useState(today())
  const [productId, setProductId] = useState<number | ''>('')
  const [qty, setQty] = useState<number | ''>('')
  const [costUsd, setCostUsd] = useState<number | ''>('')
  const [supplierId, setSupplierId] = useState<number | ''>('')
  const [paid, setPaid] = useState<number | ''>('')
  const [account, setAccount] = useState<Account>('naqd')

  const summaUzs = (Number(qty) || 0) * (Number(costUsd) || 0) * settings.kurs
  const debt = Math.max(0, summaUzs - (Number(paid) || 0))

  function onPick(id: number | '') {
    setProductId(id)
    const p = products.find((x) => x.id === id)
    if (p) setCostUsd(p.costUsd)
  }

  async function addSupplier() {
    const name = prompt("Yangi yetkazib beruvchi nomi:")
    if (!name || !name.trim()) return
    const id = (await db.suppliers.add({ name: name.trim(), phone: '', debt: 0, createdAt: Date.now() })) as number
    setSupplierId(id)
    toast("Ta'minotchi qo'shildi", 'ok')
  }

  async function add() {
    if (!productId || !qty || Number(qty) <= 0) return toast('Tovar va miqdorni kiriting', 'err')
    const sup = suppliers.find((s) => s.id === supplierId)
    await addPurchase({
      date, productId: Number(productId), qty: Number(qty), costUsd: Number(costUsd) || 0, kurs: settings.kurs,
      supplierId: supplierId ? Number(supplierId) : null, supplierName: sup?.name || "Ta'minotchi",
      paidUzs: Number(paid) || 0, account,
    })
    toast(debt > 0 ? `Kirim qo'shildi. Qarz: ${som(debt)}` : 'Kirim qo\'shildi, ombor yangilandi', 'ok')
    setQty(''); setPaid('')
  }

  async function remove(id?: number) {
    if (!id) return
    if (!confirm("Kirim o'chirilsinmi? Ombor qoldig'i kamayadi. (Ta'minotchi qarzi avtomatik tuzatilmaydi)")) return
    await db.purchases.delete(id)
    toast("O'chirildi", 'ok')
  }

  return (
    <>
      <div className="card">
        <h2>Yangi kirim</h2>
        <div className="grid3">
          <div className="field"><label>Sana</label><input className="input" type="date" value={date} onChange={(e) => setDate(e.target.value)} /></div>
          <div className="field"><label>Tovar</label>
            <select className="input" value={productId} onChange={(e) => onPick(e.target.value ? Number(e.target.value) : '')}>
              <option value="">— tanlang —</option>
              {products.map((p) => <option key={p.id} value={p.id}>{p.name} ({p.sku})</option>)}
            </select>
          </div>
          <div className="field"><label>Miqdor</label><input className="input" type="number" value={qty} onChange={(e) => setQty(e.target.value ? Number(e.target.value) : '')} /></div>
          <div className="field"><label>Kirim narxi ($)</label><input className="input" type="number" step="0.01" value={costUsd} onChange={(e) => setCostUsd(e.target.value ? Number(e.target.value) : '')} /></div>
          <div className="field"><label>Yetkazib beruvchi</label>
            <div className="row" style={{ flexWrap: 'nowrap' }}>
              <select className="input" value={supplierId} onChange={(e) => setSupplierId(e.target.value ? Number(e.target.value) : '')}>
                <option value="">— tanlang —</option>
                {suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
              <button className="btn sm" onClick={addSupplier}>+</button>
            </div>
          </div>
          <div className="field"><label>To'langan (so'm)</label><input className="input" type="number" value={paid} onChange={(e) => setPaid(e.target.value ? Number(e.target.value) : '')} placeholder="0 = qarzga" /></div>
          <div className="field"><label>Qaysi hisobdan</label>
            <select className="input" value={account} onChange={(e) => setAccount(e.target.value as Account)}>
              {ACCOUNTS.map((a) => <option key={a.key} value={a.key}>{a.ic} {a.label}</option>)}
            </select>
          </div>
        </div>
        <div className="row" style={{ marginTop: 12, justifyContent: 'space-between' }}>
          <div style={{ color: '#6b7280' }}>
            Summa: <b>{usd((Number(qty) || 0) * (Number(costUsd) || 0))}</b> = <b>{som(summaUzs)}</b>
            {debt > 0 && <span style={{ color: 'var(--brand)' }}> · Qarz: <b>{som(debt)}</b></span>}
          </div>
          <button className="btn primary lg" onClick={add}>📥 Qabul qilish</button>
        </div>
      </div>

      <div className="card">
        <h2>So'nggi kirimlar</h2>
        <div className="table-wrap">
          <table>
            <thead>
              <tr><th>Sana</th><th>Tovar</th><th className="num">Miqdor</th><th className="num">Narx ($)</th><th className="num">Summa (so'm)</th><th className="num">To'landi</th><th className="num">Qarz</th><th>Ta'minotchi</th><th></th></tr>
            </thead>
            <tbody>
              {purchases.map((k) => {
                const p = pmap.get(k.productId)
                const summa = k.qty * k.costUsd * k.kurs
                const kdebt = Math.max(0, summa - (k.paidUzs ?? summa))
                return (
                  <tr key={k.id}>
                    <td>{k.date}</td>
                    <td>{p?.name ?? '—'}</td>
                    <td className="num">{k.qty} {p?.unit}</td>
                    <td className="num">{usd(k.costUsd)}</td>
                    <td className="num">{num(summa)}</td>
                    <td className="num">{num(k.paidUzs ?? summa)}</td>
                    <td className="num">{kdebt > 0 ? <b style={{ color: 'var(--brand)' }}>{num(kdebt)}</b> : '—'}</td>
                    <td>{k.supplier}</td>
                    <td className="num"><button className="btn sm danger" onClick={() => remove(k.id)}>🗑</button></td>
                  </tr>
                )
              })}
              {purchases.length === 0 && <tr><td colSpan={9} className="empty">Kirim yo'q</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
    </>
  )
}
