import { useState } from 'react'
import { db } from '../db'
import { addPurchase, useProducts, useSettings, useSuppliers } from '../lib/data'
import { costUzs, num, pct, marja, today, usd } from '../lib/format'
import { fileToAiJpeg } from '../lib/image'
import { supabase, supabaseEnabled } from '../lib/supabase'
import { CATEGORIES, UNITS, type Product } from '../types'
import { Modal } from './Modal'
import { useToast } from './Toast'

const MAX_IMAGES = 5

// Serverdan (api/ai-products) keladigan bitta tovar
interface AiProduct {
  name: string; family: string; category: string; brand: string; size: string; unit: string
  barcode: string; qty: number; cost: number; costCurrency: 'USD' | 'UZS'; price: number
  confidence: 'yuqori' | "o'rta" | 'past'; note: string
}

// Ko'rib chiqish/tahrirlash uchun qator
interface Draft {
  on: boolean
  existingId: number | null // bazada shunday tovar bor bo'lsa — faqat qoldiq qo'shiladi
  name: string; family: string; category: string; brand: string; size: string; unit: string
  barcode: string; qty: number; costUsd: number; priceUzs: number
  confidence: AiProduct['confidence']; note: string
}

// Excel ustun nomlari (kichik harf, bo'shliqsiz solishtiriladi)
const COLS: Record<string, keyof Draft> = {
  nomi: 'name', guruh: 'family', kategoriya: 'category', brend: 'brand', hajm: 'size', birlik: 'unit',
  shtrixkod: 'barcode', miqdor: 'qty', 'kirim($)': 'costUsd', kirim: 'costUsd', "sotuv(so'm)": 'priceUzs', sotuv: 'priceUzs',
}

function findExisting(products: Product[], barcode: string, name: string): number | null {
  const n = name.trim().toLowerCase()
  const hit = products.find((p) => (barcode && p.barcode === barcode) || p.name.trim().toLowerCase() === n)
  return hit?.id ?? null
}

// Ustama: tannarx × (1 + %), 100 so'mga yuqoriga yaxlitlanadi
function withMarkup(costUsd: number, kurs: number, markupPct: number): number {
  return Math.ceil((costUzs(costUsd, kurs) * (1 + markupPct / 100)) / 100) * 100
}

export function AiImportModal({ onClose }: { onClose: () => void }) {
  const products = useProducts()
  const suppliers = useSuppliers()
  const settings = useSettings()
  const toast = useToast()
  const [images, setImages] = useState<string[]>([])
  const [busy, setBusy] = useState(false)
  const [rows, setRows] = useState<Draft[] | null>(null)
  const [saving, setSaving] = useState(false)
  const [supplierName, setSupplierName] = useState('')
  const [date, setDate] = useState(today())
  const [markup, setMarkup] = useState(40)

  const categories = Array.from(new Set([...CATEGORIES, ...products.map((p) => p.category).filter(Boolean)]))

  function toDrafts(list: Omit<Draft, 'on' | 'existingId'>[]): Draft[] {
    return list.map((p) => {
      const existingId = findExisting(products, p.barcode, p.name)
      // Sotuv narxi berilmagan bo'lsa — tannarx + ustama
      const priceUzs = p.priceUzs || (p.costUsd ? withMarkup(p.costUsd, settings.kurs, markup) : 0)
      return { ...p, priceUzs, on: !existingId || p.qty > 0, existingId }
    })
  }

  async function onFiles(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? [])
    e.target.value = ''
    if (!files.length) return
    const room = MAX_IMAGES - images.length
    if (files.length > room) toast(`Ko'pi bilan ${MAX_IMAGES} ta rasm`, 'err')
    try {
      const urls = await Promise.all(files.slice(0, room).map(fileToAiJpeg))
      setImages((prev) => [...prev, ...urls])
    } catch (err: any) {
      toast(err?.message || 'Rasm xatosi', 'err')
    }
  }

  // Excel/CSV: birinchi qator — sarlavha (Nomi, Kategoriya, Brend, Hajm, Birlik, Shtrix-kod, Miqdor, Kirim ($), Sotuv (so'm))
  async function onSheet(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    try {
      const XLSX = await import('xlsx')
      const wb = XLSX.read(await file.arrayBuffer())
      const raw = XLSX.utils.sheet_to_json<Record<string, unknown>>(wb.Sheets[wb.SheetNames[0]], { defval: '' })
      const list = raw.map((r) => {
        const d: any = { name: '', family: '', category: 'Boshqa', brand: '', size: '', unit: 'dona', barcode: '', qty: 0, costUsd: 0, priceUzs: 0, confidence: 'yuqori', note: '' }
        for (const [k, v] of Object.entries(r)) {
          const f = COLS[k.toLowerCase().replace(/[\s-]/g, '')]
          if (!f) continue
          d[f] = ['qty', 'costUsd', 'priceUzs'].includes(f) ? Number(String(v).replace(',', '.')) || 0 : String(v).trim()
        }
        if (!UNITS.includes(d.unit)) d.unit = 'dona'
        return d
      }).filter((d) => d.name)
      if (!list.length) { toast("Faylda tovar topilmadi (birinchi qatorda 'Nomi' ustuni bo'lsin)", 'err'); return }
      setRows(toDrafts(list))
    } catch (err: any) {
      toast(err?.message || "Faylni o'qib bo'lmadi", 'err')
    }
  }

  async function analyze() {
    if (!images.length) return
    setBusy(true)
    try {
      const token = (await supabase?.auth.getSession())?.data.session?.access_token
      const res = await fetch('/api/ai-products', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({ images, categories }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || `Server xatosi (${res.status})`)
      const list = (data.products ?? []) as AiProduct[]
      if (!list.length) { toast('Rasmda tovar topilmadi', 'err'); return }
      setRows(toDrafts(list.map((p) => ({
        name: p.name, family: p.family, category: p.category || 'Boshqa',
        brand: p.brand, size: p.size, unit: UNITS.includes(p.unit) ? p.unit : 'dona', barcode: p.barcode,
        qty: Math.max(0, p.qty || 0),
        costUsd: Math.max(0, (p.costCurrency === 'UZS' ? Math.round((p.cost / settings.kurs) * 100) / 100 : p.cost) || 0),
        priceUzs: Math.max(0, p.price || 0),
        confidence: p.confidence, note: p.note,
      }))))
    } catch (err: any) {
      toast(err?.message || 'Xato', 'err')
    } finally {
      setBusy(false)
    }
  }

  function upd(i: number, patch: Partial<Draft>) {
    setRows((rs) => rs && rs.map((r, j) => (j === i ? { ...r, ...patch } : r)))
  }

  function applyMarkup() {
    setRows((rs) => rs && rs.map((r) => (r.existingId || !r.costUsd ? r : { ...r, priceUzs: withMarkup(r.costUsd, settings.kurs, markup) })))
    toast(`Sotuv narxlari: tannarx + ${markup}%`, 'ok')
  }

  async function save() {
    if (!rows) return
    const chosen = rows.filter((r) => r.on)
    if (chosen.some((r) => !r.existingId && !r.name.trim())) { toast('Nomi bo\'sh tovar bor', 'err'); return }
    setSaving(true)
    let added = 0, stocked = 0
    try {
      // Ta'minotchi: bor bo'lsa o'sha, yo'q bo'lsa yangisi yaratiladi. Kirim qarzga yoziladi.
      const sName = supplierName.trim()
      let supplierId: number | null = null
      if (sName) {
        const ex = suppliers.find((s) => s.name.trim().toLowerCase() === sName.toLowerCase())
        supplierId = ex?.id ?? ((await db.suppliers.add({ name: sName, phone: '', debt: 0, createdAt: Date.now() })) as number)
      }
      for (const r of chosen) {
        let productId = r.existingId
        if (!productId) {
          productId = (await db.products.add({
            barcode: r.barcode.trim(), sku: 'T' + Date.now().toString().slice(-6) + added,
            name: r.name.trim(), family: r.family.trim() || r.name.trim(), category: r.category.trim() || 'Boshqa', brand: r.brand.trim(),
            unit: r.unit, size: r.size.trim(), costUsd: r.costUsd, priceUzs: r.priceUzs, imageData: '', createdAt: Date.now(),
          })) as number
          added++
        }
        if (r.qty > 0) {
          await addPurchase({
            date, productId, qty: r.qty, costUsd: r.costUsd, kurs: settings.kurs,
            supplierId, supplierName: sName || "Boshlang'ich qoldiq", paidUzs: 0, account: 'naqd',
          })
          stocked++
        }
      }
      toast(`${added} ta yangi tovar, ${stocked} ta kirim${sName ? ` (${sName} — qarzga)` : ''}`, 'ok')
      onClose()
    } catch (err: any) {
      toast(err?.message || 'Saqlashda xato', 'err')
    } finally {
      setSaving(false)
    }
  }

  const chosen = rows?.filter((r) => r.on) ?? []
  const totalUsd = chosen.reduce((s, r) => s + r.qty * r.costUsd, 0)

  return (
    <Modal
      title="📥 Tovar kiritish (rasm / Excel)"
      onClose={onClose}
      wide
      footer={rows ? (
        <>
          <button className="btn" onClick={() => setRows(null)} disabled={saving}>← Orqaga</button>
          <button className="btn primary" onClick={save} disabled={saving || chosen.length === 0}>
            {saving ? 'Saqlanmoqda…' : `Saqlash (${chosen.length})`}
          </button>
        </>
      ) : (
        <>
          <button className="btn" onClick={onClose}>Bekor</button>
          {supabaseEnabled && (
            <button className="btn primary" onClick={analyze} disabled={busy || images.length === 0}>
              {busy ? 'AI o\'qiyapti…' : '🤖 Rasmdan aniqlash'}
            </button>
          )}
        </>
      )}
    >
      {!rows && (
        <>
          <div className="card" style={{ padding: 12 }}>
            <b>Excel fayldan</b>
            <div style={{ fontSize: 13, color: 'var(--muted)', margin: '4px 0 8px' }}>
              Ustunlar: Nomi, Guruh, Kategoriya, Brend, Hajm, Birlik, Shtrix-kod, Miqdor, Kirim ($), Sotuv (so'm)
            </div>
            <label className="btn">📄 Fayl tanlash<input type="file" accept=".xlsx,.xls,.csv" hidden onChange={onSheet} /></label>
          </div>
          {supabaseEnabled && (
            <div className="card" style={{ padding: 12, display: 'flex', flexDirection: 'column', gap: 10 }}>
              <b>Rasmdan (AI)</b>
              <div style={{ fontSize: 13, color: 'var(--muted)' }}>
                Tovar yorlig'i, nakladnoy yoki narxlar ro'yxatini rasmga oling (ko'pi bilan {MAX_IMAGES} ta). Matn aniq ko'rinsin.
              </div>
              <div className="row">
                <label className="btn">📷 Suratga olish<input type="file" accept="image/*" capture="environment" hidden onChange={onFiles} disabled={busy} /></label>
                <label className="btn">🖼 Galereyadan<input type="file" accept="image/*" multiple hidden onChange={onFiles} disabled={busy} /></label>
              </div>
              {images.length > 0 && (
                <div className="ai-thumbs">
                  {images.map((src, i) => (
                    <div key={i} className="ai-thumb">
                      <img src={src} alt="" />
                      {!busy && <button className="x" onClick={() => setImages(images.filter((_, j) => j !== i))} aria-label="O'chirish">×</button>}
                    </div>
                  ))}
                </div>
              )}
              {busy && <div className="empty">AI rasmlarni o'qiyapti… 20–60 soniya kuting.</div>}
            </div>
          )}
        </>
      )}

      {rows && (
        <>
          <div className="card" style={{ padding: 12, background: '#f8fafc' }}>
            <div className="grid3">
              <div className="field"><label>Ta'minotchi (qarzga yoziladi)</label>
                <input className="input" list="sup-list" value={supplierName} onChange={(e) => setSupplierName(e.target.value)} placeholder="bo'sh — boshlang'ich qoldiq" />
                <datalist id="sup-list">{suppliers.map((s) => <option key={s.id} value={s.name} />)}</datalist>
              </div>
              <div className="field"><label>Sana</label><input className="input" type="date" value={date} onChange={(e) => setDate(e.target.value)} /></div>
              <div className="field"><label>Ustama (tannarx + %)</label>
                <div className="row" style={{ flexWrap: 'nowrap' }}>
                  <input className="input" type="number" value={markup} onChange={(e) => setMarkup(Number(e.target.value))} />
                  <button className="btn sm" onClick={applyMarkup}>Qo'llash</button>
                </div>
              </div>
            </div>
            <div className="row" style={{ marginTop: 8, fontSize: 14 }}>
              <span>{chosen.length} ta tovar · Jami: <b>{usd(totalUsd)}</b> = <b>{num(costUzs(totalUsd, settings.kurs))} so'm</b> (kurs {num(settings.kurs)})</span>
            </div>
            <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 4 }}>
              {supplierName.trim() ? `Kirim "${supplierName.trim()}" ga qarz bo'lib yoziladi, kassadan pul chiqmaydi.` : "Ta'minotchi ko'rsatilmasa — pulsiz boshlang'ich qoldiq."}
            </div>
          </div>
          {rows.map((r, i) => (
            <div key={i} className={`ai-card ${r.on ? '' : 'off'}`}>
              <div className="row" style={{ flexWrap: 'nowrap' }}>
                <input type="checkbox" checked={r.on} onChange={(e) => upd(i, { on: e.target.checked })} />
                <input className="input" value={r.name} onChange={(e) => upd(i, { name: e.target.value })} disabled={!!r.existingId} style={{ fontWeight: 700 }} />
              </div>
              <div className="row" style={{ gap: 6 }}>
                {r.existingId && <span className="badge ok">Bazada bor — faqat qoldiq qo'shiladi</span>}
                {r.confidence !== 'yuqori' && <span className={`badge ${r.confidence === 'past' ? 'out' : 'low'}`}>Ishonch: {r.confidence}</span>}
                {r.note && <span style={{ fontSize: 12, color: 'var(--muted)' }}>{r.note}</span>}
              </div>
              {!r.existingId && (
                <div className="grid3">
                  <div className="field"><label>Kategoriya</label>
                    <input className="input" list="imp-cat-list" value={r.category} onChange={(e) => upd(i, { category: e.target.value })} />
                  </div>
                  <div className="field"><label>Brend</label><input className="input" value={r.brand} onChange={(e) => upd(i, { brand: e.target.value })} /></div>
                  <div className="field"><label>Hajm</label><input className="input" value={r.size} onChange={(e) => upd(i, { size: e.target.value })} /></div>
                  <div className="field"><label>Birlik</label>
                    <select className="input" value={r.unit} onChange={(e) => upd(i, { unit: e.target.value })}>
                      {UNITS.map((u) => <option key={u}>{u}</option>)}
                    </select>
                  </div>
                  <div className="field"><label>Shtrix-kod</label><input className="input" value={r.barcode} onChange={(e) => upd(i, { barcode: e.target.value })} /></div>
                  <div className="field"><label>Sotuv (so'm) · marja {pct(marja(r.priceUzs, costUzs(r.costUsd, settings.kurs)))}</label>
                    <input className="input" type="number" value={r.priceUzs || ''} onChange={(e) => upd(i, { priceUzs: Number(e.target.value) })} />
                  </div>
                </div>
              )}
              <div className="grid3">
                <div className="field"><label>Kirim ($)</label><input className="input" type="number" step="0.01" value={r.costUsd || ''} onChange={(e) => upd(i, { costUsd: Number(e.target.value) })} /></div>
                <div className="field"><label>Miqdor</label><input className="input" type="number" value={r.qty || ''} onChange={(e) => upd(i, { qty: Number(e.target.value) })} /></div>
                <div className="field"><label>Tannarx (so'm)</label><div className="input" style={{ background: '#f8fafc' }}>{num(costUzs(r.costUsd, settings.kurs))}</div></div>
              </div>
            </div>
          ))}
          <datalist id="imp-cat-list">{categories.map((c) => <option key={c} value={c} />)}</datalist>
        </>
      )}
    </Modal>
  )
}
