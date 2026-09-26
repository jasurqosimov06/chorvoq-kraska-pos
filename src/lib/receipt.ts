import { num, som } from './format'
import { brand } from '../brand'

export interface ReceiptData {
  shopName: string
  number: string
  date: string
  time: string
  lines: { name: string; qty: number; price: number }[]
  total: number
  cashbackUsed: number
  cashbackEarned: number
  payable: number
  paid: number
  debt: number
  paymentMethod: string
  customerName?: string
}

export function buildReceiptHtml(r: ReceiptData): string {
  const rows = r.lines
    .map(
      (l) => `<div class="r"><span>${escapeHtml(l.name)}</span></div>
      <div class="r"><span>${l.qty} × ${num(l.price)}</span><span>${num(l.qty * l.price)}</span></div>`,
    )
    .join('')
  return `<div class="receipt">
    <div class="center big">${escapeHtml(r.shopName)}</div>
    <div class="center">${escapeHtml(brand.tagline)}</div>
    <hr/>
    <div class="r"><span>Chek №</span><span>${r.number}</span></div>
    <div class="r"><span>Sana</span><span>${r.date} ${r.time}</span></div>
    ${r.customerName ? `<div class="r"><span>Mijoz</span><span>${escapeHtml(r.customerName)}</span></div>` : ''}
    <hr/>
    ${rows}
    <hr/>
    <div class="r"><span>Jami</span><span>${num(r.total)}</span></div>
    ${r.cashbackUsed ? `<div class="r"><span>Keshbek ishlatildi</span><span>-${num(r.cashbackUsed)}</span></div>` : ''}
    <div class="r big"><span>TO'LOV</span><span>${num(r.payable)}</span></div>
    <div class="r"><span>To'landi (${r.paymentMethod})</span><span>${num(r.paid)}</span></div>
    ${r.debt ? `<div class="r big"><span>QARZ</span><span>${num(r.debt)}</span></div>` : ''}
    ${r.cashbackEarned ? `<div class="r"><span>Keshbek qo'shildi</span><span>+${num(r.cashbackEarned)}</span></div>` : ''}
    <hr/>
    <div class="center">Xaridingiz uchun rahmat!</div>
  </div>`
}

const RECEIPT_CSS = `
  body { margin: 0; padding: 10px; }
  .receipt { font-family: 'Consolas', monospace; font-size: 13px; color: #000; width: 280px; margin: 0 auto; }
  .receipt .center { text-align: center; }
  .receipt .big { font-size: 15px; font-weight: bold; }
  .receipt hr { border: none; border-top: 1px dashed #999; margin: 7px 0; }
  .receipt .r { display: flex; justify-content: space-between; gap: 8px; }
`

export function printReceipt(r: ReceiptData) {
  const html = buildReceiptHtml(r)
  const w = window.open('', '_blank', 'width=340,height=600')
  if (!w) return
  w.document.write(`<!doctype html><html><head><title>Chek ${r.number}</title><style>${RECEIPT_CSS}</style></head><body>${html}</body></html>`)
  w.document.close()
  w.focus()
  setTimeout(() => {
    w.print()
  }, 250)
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c] as string))
}

export { som }
