import { useMemo, useState } from 'react'
import { db } from '../db'
import { useProducts, useSettings, useStockMap } from '../lib/data'
import { costUzs, marja, num, pct, usd } from '../lib/format'
import { CATEGORIES, UNITS, type Product } from '../types'
import { Modal } from '../components/Modal'
import { useToast } from '../components/Toast'
import { ScannerModal } from '../components/ScannerModal'
import { fileToResizedDataUrl } from '../lib/image'

const EMPTY: Product = {
  barcode: '', sku: '', name: '', family: '', category: CATEGORIES[0], brand: '', unit: 'dona', size: '',
  costUsd: 0, priceUzs: 0, imageData: '', createdAt: 0,
}

export default function Products() {
  const products = useProducts()
  const stockMap = useStockMap()
  const settings = useSettings()
  const toast = useToast()
  const [q, setQ] = useState('')
  const [edit, setEdit] = useState<Product | null>(null)
  const [scanField, setScanField] = useState(false)

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase()
    if (!s) return products
    return products.filter((p) => p.name.toLowerCase().includes(s) || p.sku.toLowerCase().includes(s) || p.barcode.includes(s) || p.category.toLowerCase().includes(s))
  }, [products, q])

  async function persist(): Promise<Product | null> {
    if (!edit) return null
    if (!edit.name.trim()) { toast('Nomini kiriting', 'err'); return null }
    const data = { ...edit }
    if (!data.sku.trim()) data.sku = 'T' + Date.now().toString().slice(-6)
    if (data.id) {
      await db.products.update(data.id, data)
      toast('Saqlandi', 'ok')
    } else {
      data.createdAt = Date.now()
      const id = (await db.products.add(data)) as number
      data.id = id
      toast("Tovar qo'shildi", 'ok')
    }
    return data
  }

  async function save() {
    const r = await persist()
    if (r) setEdit(null)
  }

  // Joriy tovarni saqlab, xuddi shu guruhdan boshqa hajm (variant) qo'shishga o'tadi
  async function saveVariant() {
    const r = await persist()
    if (!r) return
    setEdit({
      ...EMPTY,
      family: r.family || r.name,
      category: r.category, brand: r.brand, unit: r.unit,
      imageData: r.imageData, costUsd: r.costUsd,
      name: (r.family || r.name) + ' ',
    })
  }

  async function onImage(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file || !edit) return
    try {
      const url = await fileToResizedDataUrl(file)
      setEdit({ ...edit, imageData: url })
    } catch (err: any) {
      toast(err?.message || 'Rasm xatosi', 'err')
    }
  }

  async function remove(p: Product) {
    if (!p.id) return
    if (!confirm(`"${p.name}" o'chirilsinmi?`)) return
    await db.products.delete(p.id)
    toast("O'chirildi", 'ok')
  }

  return (
    <>
      <div className="section-head">
        <input className="input" style={{ maxWidth: 340 }} placeholder="Qidirish..." value={q} onChange={(e) => setQ(e.target.value)} />
        <button className="btn primary" onClick={() => setEdit({ ...EMPTY })}>+ Yangi tovar</button>
      </div>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th></th><th>Kod</th><th>Nomi</th><th>Kategoriya</th><th className="num">Kirim ($)</th>
              <th className="num">Tannarx (so'm)</th><th className="num">Sotuv (so'm)</th>
              <th className="num">Marja</th><th className="num">Qoldiq</th><th></th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((p) => {
              const cost = costUzs(p.costUsd, settings.kurs)
              const st = stockMap.get(p.id!)?.stock ?? 0
              return (
                <tr key={p.id}>
                  <td>{p.imageData ? <img className="pthumb" src={p.imageData} alt="" /> : <div className="pthumb pthumb-ph">📦</div>}</td>
                  <td>{p.sku}</td>
                  <td><b>{p.name}</b><div style={{ fontSize: 12, color: '#6b7280' }}>{[p.family, p.brand, p.size, p.barcode].filter(Boolean).join(' · ')}</div></td>
                  <td>{p.category}</td>
                  <td className="num">{usd(p.costUsd)}</td>
                  <td className="num">{num(cost)}</td>
                  <td className="num">{num(p.priceUzs)}</td>
                  <td className="num">{pct(marja(p.priceUzs, cost))}</td>
                  <td className="num">{st} {p.unit}</td>
                  <td className="num">
                    <button className="btn sm" onClick={() => setEdit({ ...p })}>✏️</button>{' '}
                    <button className="btn sm danger" onClick={() => remove(p)}>🗑</button>
                  </td>
                </tr>
              )
            })}
            {filtered.length === 0 && <tr><td colSpan={10} className="empty">Tovar yo'q</td></tr>}
          </tbody>
        </table>
      </div>

      {edit && (
        <Modal
          title={edit.id ? 'Tovarni tahrirlash' : 'Yangi tovar'}
          onClose={() => setEdit(null)}
          wide
          footer={<>
            <button className="btn" onClick={() => setEdit(null)}>Bekor</button>
            <button className="btn dark" onClick={saveVariant} title="Saqlab, shu guruhdan boshqa hajm qo'shish">+ Hajm (variant)</button>
            <button className="btn primary" onClick={save}>Saqlash</button>
          </>}
        >
          <div className="row" style={{ alignItems: 'flex-start' }}>
            {edit.imageData
              ? <img src={edit.imageData} alt="" style={{ width: 88, height: 88, objectFit: 'contain', borderRadius: 10, border: '1px solid var(--line)', background: '#fafafa' }} />
              : <div style={{ width: 88, height: 88, borderRadius: 10, border: '1px dashed var(--line)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 30, color: '#cbd5e1' }}>📦</div>}
            <div className="field" style={{ flex: 1 }}>
              <label>Tovar rasmi</label>
              <label className="btn sm">📷 Rasm tanlash<input type="file" accept="image/*" hidden onChange={onImage} /></label>
              {edit.imageData && <button className="btn sm danger" onClick={() => setEdit({ ...edit, imageData: '' })}>Rasmni o'chirish</button>}
            </div>
          </div>
          <div className="grid2">
            <div className="field"><label>Nomi *</label><input className="input" value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value })} /></div>
            <div className="field"><label>Guruh (family)</label><input className="input" value={edit.family} onChange={(e) => setEdit({ ...edit, family: e.target.value })} placeholder="Akril emulsiya" /></div>
            <div className="field"><label>Kod (SKU)</label><input className="input" value={edit.sku} onChange={(e) => setEdit({ ...edit, sku: e.target.value })} placeholder="avto" /></div>
            <div className="field">
              <label>Shtrix-kod</label>
              <div className="row" style={{ flexWrap: 'nowrap' }}>
                <input className="input" value={edit.barcode} onChange={(e) => setEdit({ ...edit, barcode: e.target.value })} />
                <button className="btn sm" onClick={() => setScanField(true)}>📷</button>
              </div>
            </div>
            <div className="field"><label>Kategoriya</label>
              <select className="input" value={edit.category} onChange={(e) => setEdit({ ...edit, category: e.target.value })}>
                {CATEGORIES.map((c) => <option key={c}>{c}</option>)}
              </select>
            </div>
            <div className="field"><label>Brend</label><input className="input" value={edit.brand} onChange={(e) => setEdit({ ...edit, brand: e.target.value })} /></div>
            <div className="field"><label>Hajm/O'lchov</label><input className="input" value={edit.size} onChange={(e) => setEdit({ ...edit, size: e.target.value })} placeholder="15 kg" /></div>
            <div className="field"><label>Birlik</label>
              <select className="input" value={edit.unit} onChange={(e) => setEdit({ ...edit, unit: e.target.value })}>
                {UNITS.map((u) => <option key={u}>{u}</option>)}
              </select>
            </div>
            <div className="field"><label>Kirim narxi ($)</label><input className="input" type="number" step="0.01" value={edit.costUsd || ''} onChange={(e) => setEdit({ ...edit, costUsd: Number(e.target.value) })} /></div>
            <div className="field"><label>Sotuv narxi (so'm)</label><input className="input" type="number" value={edit.priceUzs || ''} onChange={(e) => setEdit({ ...edit, priceUzs: Number(e.target.value) })} /></div>
          </div>
          <div className="card" style={{ background: '#f8fafc', padding: 12 }}>
            <div className="row">
              <span>Tannarx (so'm): <b>{num(costUzs(edit.costUsd, settings.kurs))}</b></span>
              <span className="spacer" />
              <span>Marja: <b>{pct(marja(edit.priceUzs, costUzs(edit.costUsd, settings.kurs)))}</b></span>
            </div>
          </div>
          {scanField && <ScannerModal onDetected={(c) => { setEdit({ ...edit, barcode: c }); setScanField(false) }} onClose={() => setScanField(false)} />}
        </Modal>
      )}
    </>
  )
}
