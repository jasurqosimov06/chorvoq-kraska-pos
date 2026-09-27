import { useMemo, useState } from 'react'
import { db } from '../db'
import { useProducts, useSettings, useStockMap, useCustomers, useSales, checkout, returnSale } from '../lib/data'
import { costUzs, num, som } from '../lib/format'
import type { Account, CartLine, Product } from '../types'
import { ScannerModal } from '../components/ScannerModal'
import { Modal } from '../components/Modal'
import { useToast } from '../components/Toast'
import { printReceipt, type ReceiptData } from '../lib/receipt'
import { brand } from '../brand'

export default function POS() {
  const products = useProducts()
  const stockMap = useStockMap()
  const settings = useSettings()
  const customers = useCustomers()
  const toast = useToast()

  const [q, setQ] = useState('')
  const [cat, setCat] = useState('')
  const [cart, setCart] = useState<CartLine[]>([])
  const [scan, setScan] = useState(false)
  const [customerId, setCustomerId] = useState<number | null>(null)
  const [payMethod, setPayMethod] = useState('Naqd')
  const [useCashback, setUseCashback] = useState(false)
  const [paid, setPaid] = useState<number | ''>('')
  const [receipt, setReceipt] = useState<ReceiptData | null>(null)
  const [showSales, setShowSales] = useState(false)
  const [salesPeriod, setSalesPeriod] = useState<'kun' | 'hafta' | 'oy' | 'hammasi'>('oy')
  const sales = useSales()
  const recentSales = useMemo(() => {
    const d = new Date()
    if (salesPeriod === 'hafta') d.setDate(d.getDate() - 7)
    else if (salesPeriod === 'oy') d.setDate(d.getDate() - 30)
    const p = (x: number) => String(x).padStart(2, '0')
    const cutoff = salesPeriod === 'hammasi' ? '' : `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
    return [...sales]
      .filter((s) => !cutoff || s.date >= cutoff)
      .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0))
      .slice(0, 1000)
  }, [sales, salesPeriod])
  const recentTotal = useMemo(() => recentSales.reduce((s, x) => s + (x.total || 0), 0), [recentSales])

  const stockOf = (id?: number) => (id ? stockMap.get(id)?.stock ?? 0 : 0)

  const cats = useMemo(() => {
    const m = new Map<string, number>()
    for (const p of products) if (p.category) m.set(p.category, (m.get(p.category) || 0) + 1)
    return Array.from(m.entries()) // [category, count]
  }, [products])

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase()
    return products.filter(
      (p) =>
        (!cat || p.category === cat) &&
        (!s || p.name.toLowerCase().includes(s) || p.sku.toLowerCase().includes(s) || p.barcode.includes(s)),
    )
  }, [products, q, cat])

  function addProduct(p: Product) {
    if (!p.id) return
    const stock = stockOf(p.id)
    const cost = costUzs(p.costUsd || 0, settings.kurs) // sotuvchida tannarx yo'q — serverda hisoblanadi
    setCart((prev) => {
      const ex = prev.find((l) => l.productId === p.id)
      if (ex) {
        if (ex.qty >= stock) {
          toast(`Omborda faqat ${stock} ${p.unit} bor`, 'err')
          return prev
        }
        return prev.map((l) => (l.productId === p.id ? { ...l, qty: l.qty + 1 } : l))
      }
      if (stock <= 0) {
        toast('Bu tovar omborda tugagan', 'err')
        return prev
      }
      return [
        ...prev,
        { productId: p.id!, barcode: p.barcode, name: p.name, unit: p.unit, qty: 1, price: p.priceUzs, cost, stock },
      ]
    })
  }

  function onScan(code: string) {
    setScan(false)
    const p = products.find((x) => x.barcode === code || x.sku === code)
    if (p) {
      addProduct(p)
      toast(`Qo'shildi: ${p.name}`, 'ok')
    } else {
      toast(`Kod topilmadi: ${code}`, 'err')
    }
  }

  function setQty(id: number, delta: number) {
    setCart((prev) =>
      prev
        .map((l) => {
          if (l.productId !== id) return l
          const q = l.qty + delta
          if (q > l.stock) {
            toast(`Omborda faqat ${l.stock} ${l.unit} bor`, 'err')
            return l
          }
          return { ...l, qty: q }
        })
        .filter((l) => l.qty > 0),
    )
  }

  function setPrice(id: number, value: number) {
    setCart((prev) => prev.map((l) => (l.productId === id ? { ...l, price: Math.max(0, value) } : l)))
  }

  function removeLine(id: number) {
    setCart((prev) => prev.filter((l) => l.productId !== id))
  }

  const total = cart.reduce((s, l) => s + l.price * l.qty, 0)
  const cust = customers.find((c) => c.id === customerId)
  const cashbackAvail = cust?.cashback ?? 0
  const cashbackUsed = useCashback ? Math.min(cashbackAvail, total) : 0
  const payable = Math.max(0, total - cashbackUsed)
  const isDebt = payMethod === 'Qarz'
  const paidAmount = isDebt ? Math.min(Number(paid) || 0, payable) : payable
  const debtAmount = Math.max(0, payable - paidAmount)
  const account: Account = payMethod === 'Plastik' ? 'plastik' : payMethod === 'Bank' ? 'bank' : 'naqd'

  async function doCheckout() {
    if (cart.length === 0) return
    if (isDebt && !customerId) {
      toast('Qarzga sotish uchun mijozni tanlang', 'err')
      return
    }
    try {
      await checkout({
        cart, customerId, paymentMethod: payMethod, account, cashbackUsed, paid: paidAmount,
        kurs: settings.kurs, cashbackPercent: settings.cashbackPercent,
      })
      const cashbackEarned = customerId ? Math.round((paidAmount * settings.cashbackPercent) / 100) : 0
      const now = new Date()
      setReceipt({
        shopName: settings.shopName,
        number: `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}-${String(now.getHours()).padStart(2, '0')}${String(now.getMinutes()).padStart(2, '0')}`,
        date: now.toISOString().slice(0, 10),
        time: now.toTimeString().slice(0, 5),
        lines: cart.map((l) => ({ name: l.name, qty: l.qty, price: l.price })),
        total, cashbackUsed, cashbackEarned, payable, paid: paidAmount, debt: debtAmount, paymentMethod: payMethod,
        customerName: cust?.name,
      })
      setCart([])
      setCustomerId(null)
      setUseCashback(false)
      setPaid('')
      setPayMethod('Naqd')
      toast(debtAmount > 0 ? `Qarzga sotildi: ${som(debtAmount)}` : 'Sotuv amalga oshdi', 'ok')
    } catch (e: any) {
      toast('Xatolik: ' + (e?.message ?? ''), 'err')
    }
  }

  async function openReceipt(s: any) {
    const lines = (await db.saleLines.where('saleId').equals(s.id).toArray()).filter((l) => !l.deleted)
    setReceipt({
      shopName: settings.shopName,
      number: s.number,
      date: s.date,
      time: new Date(s.createdAt).toTimeString().slice(0, 5),
      lines: lines.map((l) => ({ name: l.name, qty: l.qty, price: l.price })),
      total: s.total || 0,
      cashbackUsed: s.cashbackUsed || 0,
      cashbackEarned: s.cashbackEarned || 0,
      payable: (s.total || 0) - (s.cashbackUsed || 0),
      paid: s.paid || 0,
      debt: s.debt || 0,
      paymentMethod: s.paymentMethod,
      customerName: customers.find((c) => c.id === s.customerId)?.name,
    })
    setShowSales(false)
  }

  async function doReturn(saleId: number, number: string) {
    if (!confirm(`Chek ${number} bekor qilinsinmi? Tovar omborga qaytadi, pul kassadan chiqadi.`)) return
    try {
      await returnSale(saleId)
      toast('Sotuv qaytarildi', 'ok')
    } catch (e: any) {
      toast('Xatolik: ' + (e?.message ?? ''), 'err')
    }
  }

  return (
    <div className="pos">
      <div className="pos-left">
        <div className="pos-search">
          <input
            className="input"
            placeholder="Tovar nomi, kodi yoki shtrix-kod bo'yicha qidirish..."
            value={q}
            onChange={(e) => setQ(e.target.value)}
            autoFocus
          />
          <button className="btn" onClick={() => setShowSales(true)}>🧾 Cheklar</button>
          <button className="btn primary" onClick={() => setScan(true)}>📷 Skaner</button>
        </div>
        {cats.length > 0 && (
          <div className="cat-chips">
            <button className={`chip ${cat === '' ? 'on' : ''}`} onClick={() => setCat('')}>Hammasi ({products.length})</button>
            {cats.map(([c, n]) => (
              <button key={c} className={`chip ${cat === c ? 'on' : ''}`} onClick={() => setCat(c)}>{c} ({n})</button>
            ))}
          </div>
        )}
        <div className="pos-grid">
          {filtered.map((p) => {
            const st = stockOf(p.id)
            return (
              <button key={p.id} className="pcard" onClick={() => addProduct(p)} disabled={st <= 0}>
                {p.imageData ? <img className="pimg" src={p.imageData} alt="" /> : null}
                <div className="nm">{p.name}</div>
                {p.size ? <div className="st">{p.size}</div> : null}
                <div className="pr">{num(p.priceUzs)} so'm</div>
                <div className="st">{p.sku} · Qoldiq: {st} {p.unit}</div>
              </button>
            )
          })}
          {filtered.length === 0 && <div className="empty">Tovar topilmadi</div>}
        </div>
      </div>

      <div className="cart">
        <div className="cart-head">
          <span>Savat</span>
          <span>{cart.reduce((s, l) => s + l.qty, 0)} dona</span>
        </div>
        <div className="cart-lines">
          {cart.length === 0 && <div className="cart-empty">Savat bo'sh.<br />Tovar tanlang yoki skanerlang.</div>}
          {cart.map((l) => (
            <div className="cline" key={l.productId}>
              <div className="top">
                <span className="nm">{l.name}</span>
                <button className="x" onClick={() => removeLine(l.productId)}>×</button>
              </div>
              <div className="bottom">
                <div className="qty">
                  <button onClick={() => setQty(l.productId, -1)}>−</button>
                  <span>{l.qty}</span>
                  <button onClick={() => setQty(l.productId, 1)}>+</button>
                </div>
                <div className="cline-price">
                  <input
                    className="price-inp"
                    type="number"
                    value={l.price}
                    onChange={(e) => setPrice(l.productId, Number(e.target.value))}
                    title="Narxni qo'lda o'zgartirish"
                  />
                  <span className="cline-x">×{l.qty}</span>
                </div>
                <b>{num(l.price * l.qty)}</b>
              </div>
            </div>
          ))}
        </div>
        <div className="cart-foot">
          <div className="field">
            <select className="input" value={customerId ?? ''} onChange={(e) => { setCustomerId(e.target.value ? Number(e.target.value) : null); setUseCashback(false) }}>
              <option value="">Mijozsiz (oddiy xarid)</option>
              {customers.map((c) => (
                <option key={c.id} value={c.id}>{c.name} {c.phone ? `(${c.phone})` : ''} · keshbek {num(c.cashback)}</option>
              ))}
            </select>
          </div>
          {cust && cashbackAvail > 0 && (
            <label className="row" style={{ gap: 8, fontSize: 14 }}>
              <input type="checkbox" checked={useCashback} onChange={(e) => setUseCashback(e.target.checked)} />
              Keshbekni ishlatish ({num(cashbackAvail)} so'm)
            </label>
          )}
          <div className="pill-toggle">
            {['Naqd', 'Plastik', 'Bank', 'Qarz'].map((m) => (
              <button key={m} className={payMethod === m ? 'on' : ''} onClick={() => setPayMethod(m)}>{m}</button>
            ))}
          </div>
          {isDebt && (
            <div className="field">
              <label>Hozir to'langan summa (so'm)</label>
              <input className="input" type="number" placeholder="0 = to'liq qarzga" value={paid} onChange={(e) => setPaid(e.target.value ? Number(e.target.value) : '')} />
            </div>
          )}
          <div className="totline"><span>Jami</span><span>{som(total)}</span></div>
          {cashbackUsed > 0 && <div className="totline"><span>Keshbek</span><span>−{num(cashbackUsed)}</span></div>}
          <div className="totline big"><span>To'lov</span><span className="v">{som(payable)}</span></div>
          {isDebt && debtAmount > 0 && <div className="totline" style={{ color: 'var(--brand)' }}><span>Qarzga qoladi</span><span>{som(debtAmount)}</span></div>}
          <button className="btn green block lg" onClick={doCheckout} disabled={cart.length === 0}>
            {debtAmount > 0 ? `Qarzga sotish · to'lov ${som(paidAmount)}` : `Sotish · ${som(payable)}`}
          </button>
        </div>
      </div>

      {scan && <ScannerModal onDetected={onScan} onClose={() => setScan(false)} />}

      {showSales && (
        <Modal title="Cheklar — ko'rish / qaytarish" onClose={() => setShowSales(false)} wide>
          <div className="row" style={{ justifyContent: 'space-between', marginBottom: 6, flexWrap: 'wrap', gap: 8 }}>
            <div className="pill-toggle">
              {([['kun', 'Bugun'], ['hafta', '1 hafta'], ['oy', '1 oy'], ['hammasi', 'Hammasi']] as const).map(([k, l]) => (
                <button key={k} className={salesPeriod === k ? 'on' : ''} onClick={() => setSalesPeriod(k)}>{l}</button>
              ))}
            </div>
            <span style={{ fontSize: 14 }}>{recentSales.length} ta chek · <b>{som(recentTotal)}</b></span>
          </div>
          <div className="table-wrap" style={{ maxHeight: '55vh', overflowY: 'auto' }}>
            <table>
              <thead><tr><th>Vaqt</th><th>Chek №</th><th>To'lov</th><th className="num">Summa</th><th></th></tr></thead>
              <tbody>
                {recentSales.map((s) => (
                  <tr key={s.id} onClick={() => openReceipt(s)} style={{ cursor: 'pointer' }}>
                    <td>{s.date} {new Date(s.createdAt).toTimeString().slice(0, 5)}</td>
                    <td>{s.number}</td>
                    <td>{s.paymentMethod}{s.debt > 0 ? ' (qarz)' : ''}</td>
                    <td className="num">{num(s.total)}</td>
                    <td className="num" style={{ whiteSpace: 'nowrap' }}>
                      <button className="btn sm" onClick={(e) => { e.stopPropagation(); openReceipt(s) }}>👁 Ko'rish</button>{' '}
                      <button className="btn sm danger" onClick={(e) => { e.stopPropagation(); doReturn(s.id!, s.number) }}>↩ Qaytarish</button>
                    </td>
                  </tr>
                ))}
                {recentSales.length === 0 && <tr><td colSpan={5} className="empty">Hali sotuv yo'q</td></tr>}
              </tbody>
            </table>
          </div>
        </Modal>
      )}

      {receipt && (
        <Modal
          title={`🧾 Chek № ${receipt.number}`}
          onClose={() => setReceipt(null)}
          footer={
            <>
              <button className="btn" onClick={() => setReceipt(null)}>Yopish</button>
              <button className="btn primary" onClick={() => printReceipt(receipt)}>🖨 Chekni chop etish</button>
            </>
          }
        >
          <div className="receipt">
            <div className="center big">{receipt.shopName}</div>
            <div className="center">{brand.tagline}</div>
            <hr />
            <div className="r"><span>Chek №</span><span>{receipt.number}</span></div>
            <div className="r"><span>Sana</span><span>{receipt.date} {receipt.time}</span></div>
            {receipt.customerName && <div className="r"><span>Mijoz</span><span>{receipt.customerName}</span></div>}
            <hr />
            {receipt.lines.map((l, i) => (
              <div key={i}>
                <div className="r"><span>{l.name}</span></div>
                <div className="r"><span>{l.qty} × {num(l.price)}</span><span>{num(l.qty * l.price)}</span></div>
              </div>
            ))}
            <hr />
            <div className="r"><span>Jami</span><span>{num(receipt.total)}</span></div>
            {receipt.cashbackUsed > 0 && <div className="r"><span>Keshbek</span><span>−{num(receipt.cashbackUsed)}</span></div>}
            <div className="r big"><span>TO'LOV</span><span>{num(receipt.payable)}</span></div>
            <div className="r"><span>To'landi ({receipt.paymentMethod})</span><span>{num(receipt.paid)}</span></div>
            {receipt.debt > 0 && <div className="r big"><span>QARZ</span><span>{num(receipt.debt)}</span></div>}
            {receipt.cashbackEarned > 0 && <div className="r"><span>Keshbek qo'shildi</span><span>+{num(receipt.cashbackEarned)}</span></div>}
          </div>
        </Modal>
      )}
    </div>
  )
}
