import { useMemo, useState } from 'react'
import { db } from '../db'
import { useProducts, useSettings, useStockMap, checkout } from '../lib/data'
import { useLiveQuery } from 'dexie-react-hooks'
import { costUzs, num, som } from '../lib/format'
import type { Account, CartLine, Product } from '../types'
import { ScannerModal } from '../components/ScannerModal'
import { Modal } from '../components/Modal'
import { useToast } from '../components/Toast'
import { printReceipt, type ReceiptData } from '../lib/receipt'

export default function POS() {
  const products = useProducts()
  const stockMap = useStockMap()
  const settings = useSettings()
  const customers = useLiveQuery(() => db.customers.orderBy('name').toArray(), [], [])
  const toast = useToast()

  const [q, setQ] = useState('')
  const [cart, setCart] = useState<CartLine[]>([])
  const [scan, setScan] = useState(false)
  const [customerId, setCustomerId] = useState<number | null>(null)
  const [payMethod, setPayMethod] = useState('Naqd')
  const [useCashback, setUseCashback] = useState(false)
  const [paid, setPaid] = useState<number | ''>('')
  const [receipt, setReceipt] = useState<ReceiptData | null>(null)

  const stockOf = (id?: number) => (id ? stockMap.get(id)?.stock ?? 0 : 0)

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase()
    if (!s) return products
    return products.filter(
      (p) => p.name.toLowerCase().includes(s) || p.sku.toLowerCase().includes(s) || p.barcode.includes(s),
    )
  }, [products, q])

  function addProduct(p: Product) {
    if (!p.id) return
    const stock = stockOf(p.id)
    const cost = costUzs(p.costUsd, settings.kurs)
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
          <button className="btn primary" onClick={() => setScan(true)}>📷 Skaner</button>
        </div>
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
                <b>{num(l.price * l.qty)} so'm</b>
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

      {receipt && (
        <Modal
          title="✅ Sotuv yakunlandi"
          onClose={() => setReceipt(null)}
          footer={
            <>
              <button className="btn" onClick={() => setReceipt(null)}>Yangi sotuv</button>
              <button className="btn primary" onClick={() => printReceipt(receipt)}>🖨 Chekni chop etish</button>
            </>
          }
        >
          <div className="receipt">
            <div className="center big">{receipt.shopName}</div>
            <div className="center">Kraska va dekorativ qoplamalar</div>
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
