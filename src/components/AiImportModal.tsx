import { useState } from 'react'
import { db } from '../db'
import { addPurchase, useProducts, useSettings } from '../lib/data'
import { costUzs, num, today } from '../lib/format'
import { fileToAiJpeg } from '../lib/image'
import { supabase } from '../lib/supabase'
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

function findExisting(products: Product[], barcode: string, name: string): number | null {
  const n = name.trim().toLowerCase()
  const hit = products.find((p) => (barcode && p.barcode === barcode) || p.name.trim().toLowerCase() === n)
  return hit?.id ?? null
}

export function AiImportModal({ onClose }: { onClose: () => void }) {
  const products = useProducts()
  const settings = useSettings()
  const toast = useToast()
  const [images, setImages] = useState<string[]>([])
  const [busy, setBusy] = useState(false)
  const [rows, setRows] = useState<Draft[] | null>(null)
  const [saving, setSaving] = useState(false)

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

  async function analyze() {
    if (!images.length) return
    setBusy(true)
    try {
      const token = (await supabase?.auth.getSession())?.data.session?.access_token
      const res = await fetch('/api/ai-products', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({ images, categories: CATEGORIES }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || `Server xatosi (${res.status})`)
      const list = (data.products ?? []) as AiProduct[]
      if (!list.length) { toast('Rasmda tovar topilmadi', 'err'); return }
      setRows(list.map((p) => {
        const existingId = findExisting(products, p.barcode, p.name)
        const costUsd = p.costCurrency === 'UZS' ? Math.round((p.cost / settings.kurs) * 100) / 100 : p.cost
        return {
          on: !existingId || p.qty > 0, existingId,
          name: p.name, family: p.family, category: CATEGORIES.includes(p.category) ? p.category : 'Boshqa',
          brand: p.brand, size: p.size, unit: UNITS.includes(p.unit) ? p.unit : 'dona', barcode: p.barcode,
          qty: Math.max(0, p.qty || 0), costUsd: Math.max(0, costUsd || 0), priceUzs: Math.max(0, p.price || 0),
          confidence: p.confidence, note: p.note,
        }
      }))
    } catch (err: any) {
      toast(err?.message || 'Xato', 'err')
    } finally {
      setBusy(false)
    }
  }

  function upd(i: number, patch: Partial<Draft>) {
    setRows((rs) => rs && rs.map((r, j) => (j === i ? { ...r, ...patch } : r)))
  }

  async function save() {
    if (!rows) return
    const chosen = rows.filter((r) => r.on)
    if (chosen.some((r) => !r.existingId && !r.name.trim())) { toast('Nomi bo\'sh tovar bor', 'err'); return }
    setSaving(true)
    let added = 0, stocked = 0
    try {
      for (const r of chosen) {
        let productId = r.existingId
        if (!productId) {
          productId = (await db.products.add({
            barcode: r.barcode.trim(), sku: 'T' + Date.now().toString().slice(-6) + added,
            name: r.name.trim(), family: r.family.trim() || r.name.trim(), category: r.category, brand: r.brand.trim(),
            unit: r.unit, size: r.size.trim(), costUsd: r.costUsd, priceUzs: r.priceUzs, imageData: '', createdAt: Date.now(),
          })) as number
          added++
        }
        if (r.qty > 0) {
          // Pul harakatisiz boshlang'ich qoldiq sifatida (ta'minotchi qarzi/kassa o'zgarmaydi)
          await addPurchase({
            date: today(), productId, qty: r.qty, costUsd: r.costUsd, kurs: settings.kurs,
            supplierId: null, supplierName: 'AI kirim (rasmdan)', paidUzs: 0, account: 'naqd',
          })
          stocked++
        }
      }
      toast(`${added} ta yangi tovar, ${stocked} ta qoldiq qo'shildi`, 'ok')
      onClose()
    } catch (err: any) {
      toast(err?.message || 'Saqlashda xato', 'err')
    } finally {
      setSaving(false)
    }
  }

  const chosenCount = rows?.filter((r) => r.on).length ?? 0

  return (
    <Modal
      title="🤖 Rasmdan tovar qo'shish"
      onClose={onClose}
      wide
      footer={rows ? (
        <>
          <button className="btn" onClick={() => setRows(null)} disabled={saving}>← Rasmlarga qaytish</button>
          <button className="btn primary" onClick={save} disabled={saving || chosenCount === 0}>
            {saving ? 'Saqlanmoqda…' : `Saqlash (${chosenCount})`}
          </button>
        </>
      ) : (
        <>
          <button className="btn" onClick={onClose}>Bekor</button>
          <button className="btn primary" onClick={analyze} disabled={busy || images.length === 0}>
            {busy ? 'AI o\'qiyapti…' : '🤖 Tovarlarni aniqlash'}
          </button>
        </>
      )}
    >
      {!rows && (
        <>
          <div style={{ fontSize: 14, color: 'var(--muted)' }}>
            Tovar yorlig'i, nakladnoy yoki narxlar ro'yxatini rasmga oling (ko'pi bilan {MAX_IMAGES} ta).
            AI tovarlarni aniqlaydi, siz tekshirib saqlaysiz. Matn aniq ko'rinsin.
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
        </>
      )}

      {rows && (
        <>
          <div style={{ fontSize: 14, color: 'var(--muted)' }}>
            {rows.length} ta tovar topildi. Tekshiring, keraksizlarini belgidan chiqaring. Miqdor kiritilsa, omborga qoldiq sifatida qo'shiladi (kassa va qarzga ta'sir qilmaydi).
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
                    <select className="input" value={r.category} onChange={(e) => upd(i, { category: e.target.value })}>
                      {CATEGORIES.map((c) => <option key={c}>{c}</option>)}
                    </select>
                  </div>
                  <div className="field"><label>Brend</label><input className="input" value={r.brand} onChange={(e) => upd(i, { brand: e.target.value })} /></div>
                  <div className="field"><label>Hajm</label><input className="input" value={r.size} onChange={(e) => upd(i, { size: e.target.value })} /></div>
                  <div className="field"><label>Birlik</label>
                    <select className="input" value={r.unit} onChange={(e) => upd(i, { unit: e.target.value })}>
                      {UNITS.map((u) => <option key={u}>{u}</option>)}
                    </select>
                  </div>
                  <div className="field"><label>Shtrix-kod</label><input className="input" value={r.barcode} onChange={(e) => upd(i, { barcode: e.target.value })} /></div>
                  <div className="field"><label>Sotuv (so'm)</label><input className="input" type="number" value={r.priceUzs || ''} onChange={(e) => upd(i, { priceUzs: Number(e.target.value) })} /></div>
                </div>
              )}
              <div className="grid3">
                <div className="field"><label>Kirim ($)</label><input className="input" type="number" step="0.01" value={r.costUsd || ''} onChange={(e) => upd(i, { costUsd: Number(e.target.value) })} /></div>
                <div className="field"><label>Miqdor</label><input className="input" type="number" value={r.qty || ''} onChange={(e) => upd(i, { qty: Number(e.target.value) })} /></div>
                <div className="field"><label>Tannarx (so'm)</label><div className="input" style={{ background: '#f8fafc' }}>{num(costUzs(r.costUsd, settings.kurs))}</div></div>
              </div>
            </div>
          ))}
        </>
      )}
    </Modal>
  )
}
