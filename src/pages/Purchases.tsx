import { useMemo, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db, softDelete } from '../db'
import { useProducts, useSettings, useSuppliers, useStockMap, addPurchase, returnToSupplier, editPurchase } from '../lib/data'
import { num, som, today, usd } from '../lib/format'
import { ACCOUNTS, type Account, type Purchase } from '../types'
import { useToast } from '../components/Toast'
import { Modal } from '../components/Modal'

export default function Purchases() {
  const products = useProducts()
  const suppliers = useSuppliers()
  const settings = useSettings()
  const toast = useToast()
  const stockMap = useStockMap()
  const allPurchases = useLiveQuery(() => db.purchases.filter((k) => !k.deleted).toArray(), [], [])
  const pmap = new Map(products.map((p) => [p.id!, p]))

  // filtrlar
  const [fFrom, setFFrom] = useState('')
  const [fTo, setFTo] = useState('')
  const [fSup, setFSup] = useState<number | ''>('')

  const purchases = useMemo(() => {
    return allPurchases
      .filter((k) => (!fFrom || k.date >= fFrom) && (!fTo || k.date <= fTo) && (!fSup || k.supplierId === Number(fSup)))
      .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : (b.createdAt || 0) - (a.createdAt || 0)))
      .slice(0, 300)
  }, [allPurchases, fFrom, fTo, fSup])

  const fTotals = useMemo(() => {
    let summa = 0, paid = 0
    for (const k of purchases) { const s = k.qty * k.costUsd * k.kurs; summa += s; paid += (k.paidUzs ?? s) }
    return { summa, paid, debt: Math.max(0, summa - paid) }
  }, [purchases])

  const [mode, setMode] = useState<'kirim' | 'vozvrat'>('kirim')
  const [date, setDate] = useState(today())
  const [productId, setProductId] = useState<number | ''>('')
  const [qty, setQty] = useState<number | ''>('')
  const [costUsd, setCostUsd] = useState<number | ''>('')
  const [supplierId, setSupplierId] = useState<number | ''>('')
  const [paid, setPaid] = useState<number | ''>('')
  const [account, setAccount] = useState<Account>('naqd')
  const [retMode, setRetMode] = useState<'debt' | 'cash'>('debt')
  // Tahrirlanayotgan kirim (asl yozuv + yangi qiymatlar)
  const [edit, setEdit] = useState<{ orig: Purchase; date: string; qty: number | ''; costUsd: number | ''; supplierId: number | '' } | null>(null)

  const curStock = productId ? (stockMap.get(Number(productId))?.stock ?? 0) : 0

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

  async function doReturn() {
    if (!productId || !qty || Number(qty) <= 0) return toast('Tovar va miqdorni kiriting', 'err')
    if (Number(qty) > curStock) return toast(`Omborda faqat ${curStock} dona bor`, 'err')
    const sup = suppliers.find((s) => s.id === supplierId)
    await returnToSupplier({
      date, productId: Number(productId), qty: Number(qty), costUsd: Number(costUsd) || 0, kurs: settings.kurs,
      supplierId: supplierId ? Number(supplierId) : null, supplierName: sup?.name || "Ta'minotchi",
      mode: retMode, account,
    })
    toast(retMode === 'debt' ? `Vozvrat: qarzdan ${som(summaUzs)} chegirildi` : `Vozvrat: ${som(summaUzs)} qaytarildi`, 'ok')
    setQty('')
  }

  async function saveEdit() {
    if (!edit?.orig.id) return
    const q = Number(edit.qty) || 0
    if (q <= 0) return toast("Miqdor 0 dan katta bo'lsin", 'err')
    const sup = suppliers.find((x) => x.id === edit.supplierId)
    await editPurchase(edit.orig.id, {
      date: edit.date, qty: q, costUsd: Number(edit.costUsd) || 0,
      supplierId: edit.supplierId ? Number(edit.supplierId) : null,
      supplierName: edit.supplierId ? (sup?.name || edit.orig.supplier) : "Boshlang'ich qoldiq",
    })
    toast('Kirim tuzatildi', 'ok')
    setEdit(null)
  }

  async function remove(id?: number) {
    if (!id) return
    if (!confirm("Kirim o'chirilsinmi? Ombor qoldig'i kamayadi. (Ta'minotchi qarzi avtomatik tuzatilmaydi)")) return
    await softDelete('purchases', id)
    toast("O'chirildi", 'ok')
  }

  return (
    <>
      <div className="section-head">
        <div className="pill-toggle">
          <button className={mode === 'kirim' ? 'on' : ''} onClick={() => setMode('kirim')}>📥 Kirim</button>
          <button className={mode === 'vozvrat' ? 'on' : ''} onClick={() => setMode('vozvrat')}>↩️ Vozvrat (qaytarish)</button>
        </div>
      </div>

      {mode === 'vozvrat' ? (
        <div className="card">
          <h2>Ta'minotchiga qaytarish (vozvrat)</h2>
          <div className="grid3">
            <div className="field"><label>Sana</label><input className="input" type="date" value={date} onChange={(e) => setDate(e.target.value)} /></div>
            <div className="field"><label>Tovar</label>
              <select className="input" value={productId} onChange={(e) => onPick(e.target.value ? Number(e.target.value) : '')}>
                <option value="">— tanlang —</option>
                {products.map((p) => <option key={p.id} value={p.id}>{p.name} ({p.sku})</option>)}
              </select>
            </div>
            <div className="field"><label>Qaytariladigan miqdor</label>
              <input className="input" type="number" value={qty} onChange={(e) => setQty(e.target.value ? Number(e.target.value) : '')} />
              {productId ? <span style={{ fontSize: 12, color: '#6b7280' }}>Omborда: {curStock} dona</span> : null}
            </div>
            <div className="field"><label>Kirim narxi ($)</label><input className="input" type="number" step="0.01" value={costUsd} onChange={(e) => setCostUsd(e.target.value ? Number(e.target.value) : '')} /></div>
            <div className="field"><label>Yetkazib beruvchi</label>
              <select className="input" value={supplierId} onChange={(e) => setSupplierId(e.target.value ? Number(e.target.value) : '')}>
                <option value="">— tanlang —</option>
                {suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </div>
            <div className="field"><label>Qaytarish turi</label>
              <select className="input" value={retMode} onChange={(e) => setRetMode(e.target.value as 'debt' | 'cash')}>
                <option value="debt">Qarzdan chegirilsin (bizning qarzimiz kamayadi)</option>
                <option value="cash">Pul qaytarildi (hisobga tushdi)</option>
              </select>
            </div>
            {retMode === 'cash' && (
              <div className="field"><label>Qaysi hisobga</label>
                <select className="input" value={account} onChange={(e) => setAccount(e.target.value as Account)}>
                  {ACCOUNTS.map((a) => <option key={a.key} value={a.key}>{a.ic} {a.label}</option>)}
                </select>
              </div>
            )}
          </div>
          <div className="row" style={{ marginTop: 12, justifyContent: 'space-between' }}>
            <div style={{ color: '#6b7280' }}>Qaytarish summasi: <b style={{ color: 'var(--brand)' }}>{som(summaUzs)}</b> — ombordan {Number(qty) || 0} dona chiqadi</div>
            <button className="btn primary lg" onClick={doReturn}>↩️ Qaytarish</button>
          </div>
        </div>
      ) : (
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
      )}

      <div className="card">
        <div className="section-head">
          <h2>Kirimlar tarixi</h2>
          <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
            <input className="input" type="date" style={{ width: 150 }} value={fFrom} onChange={(e) => setFFrom(e.target.value)} title="Sanadan" />
            <input className="input" type="date" style={{ width: 150 }} value={fTo} onChange={(e) => setFTo(e.target.value)} title="Sanagacha" />
            <select className="input" style={{ width: 180 }} value={fSup} onChange={(e) => setFSup(e.target.value ? Number(e.target.value) : '')}>
              <option value="">Barcha ta'minotchilar</option>
              {suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
            {(fFrom || fTo || fSup) && <button className="btn sm" onClick={() => { setFFrom(''); setFTo(''); setFSup('') }}>Tozalash</button>}
          </div>
        </div>
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
                    <td className="num" style={{ whiteSpace: 'nowrap' }}>
                      {k.qty > 0 && <><button className="btn sm" title="Tahrirlash" onClick={() => setEdit({ orig: k, date: k.date, qty: k.qty, costUsd: k.costUsd, supplierId: k.supplierId ?? '' })}>✏️</button>{' '}</>}
                      <button className="btn sm danger" onClick={() => remove(k.id)}>🗑</button>
                    </td>
                  </tr>
                )
              })}
              {purchases.length === 0 && <tr><td colSpan={9} className="empty">Kirim topilmadi</td></tr>}
              {purchases.length > 0 && (
                <tr style={{ background: '#f2dcdc', fontWeight: 700 }}>
                  <td colSpan={4}>JAMI ({purchases.length} ta)</td>
                  <td className="num">{num(fTotals.summa)}</td>
                  <td className="num">{num(fTotals.paid)}</td>
                  <td className="num">{fTotals.debt > 0 ? num(fTotals.debt) : '—'}</td>
                  <td colSpan={2}></td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {edit && (() => {
        const o = edit.orig
        const paidOld = o.paidUzs ?? o.qty * o.costUsd * o.kurs
        const summaNew = (Number(edit.qty) || 0) * (Number(edit.costUsd) || 0) * o.kurs
        const debtOld = Math.max(0, o.qty * o.costUsd * o.kurs - paidOld)
        const debtNew = Math.max(0, summaNew - paidOld)
        return (
          <Modal
            title={`Kirimni tahrirlash — ${pmap.get(o.productId)?.name ?? ''}`}
            onClose={() => setEdit(null)}
            footer={<><button className="btn" onClick={() => setEdit(null)}>Bekor</button><button className="btn primary" onClick={saveEdit}>Saqlash</button></>}
          >
            <div className="grid2">
              <div className="field"><label>Sana</label><input className="input" type="date" value={edit.date} onChange={(e) => setEdit({ ...edit, date: e.target.value })} /></div>
              <div className="field"><label>Yetkazib beruvchi</label>
                <select className="input" value={edit.supplierId} onChange={(e) => setEdit({ ...edit, supplierId: e.target.value ? Number(e.target.value) : '' })}>
                  <option value="">— yo'q (qarzsiz) —</option>
                  {suppliers.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
                </select>
              </div>
              <div className="field"><label>Miqdor</label><input className="input" type="number" value={edit.qty} onChange={(e) => setEdit({ ...edit, qty: e.target.value ? Number(e.target.value) : '' })} /></div>
              <div className="field"><label>Kirim narxi ($)</label><input className="input" type="number" step="0.01" value={edit.costUsd} onChange={(e) => setEdit({ ...edit, costUsd: e.target.value ? Number(e.target.value) : '' })} /></div>
            </div>
            <div className="card" style={{ background: '#f8fafc', padding: 12, fontSize: 14, display: 'flex', flexDirection: 'column', gap: 4 }}>
              <span>Summa: <b>{som(o.qty * o.costUsd * o.kurs)}</b> → <b>{som(summaNew)}</b> (kurs {num(o.kurs)})</span>
              <span>To'langan: <b>{som(paidOld)}</b> (o'zgarmaydi)</span>
              <span>Bu kirim bo'yicha qarz: <b>{som(o.supplierId ? debtOld : 0)}</b> → <b style={{ color: 'var(--brand)' }}>{som(edit.supplierId ? debtNew : 0)}</b></span>
              {summaNew < paidOld && <span style={{ color: 'var(--amber)' }}>Yangi summa to'langandan kam — ortiqcha to'lov qarzdan ayrilmaydi.</span>}
              <span style={{ color: 'var(--muted)', fontSize: 12 }}>Ombor qoldig'i va ta'minotchi qarzi avtomatik to'g'rilanadi. Narx o'zgarsa, katalogdagi kirim narxi ham yangilanadi.</span>
            </div>
          </Modal>
        )
      })()}
    </>
  )
}
