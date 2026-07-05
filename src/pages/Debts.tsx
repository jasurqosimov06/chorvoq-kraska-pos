import { useState } from 'react'
import { db } from '../db'
import { useCustomers, useSuppliers, payCustomerDebt, paySupplierDebt } from '../lib/data'
import { som } from '../lib/format'
import { Modal } from '../components/Modal'
import { useToast } from '../components/Toast'
import { ACCOUNTS, type Account, type Supplier } from '../types'

type PayTarget = { kind: 'customer' | 'supplier'; id: number; name: string; max: number }

export default function Debts() {
  const customers = useCustomers()
  const suppliers = useSuppliers()
  const toast = useToast()
  const [tab, setTab] = useState<'customer' | 'supplier'>('customer')
  const [pay, setPay] = useState<PayTarget | null>(null)
  const [amount, setAmount] = useState<number | ''>('')
  const [payAccount, setPayAccount] = useState<Account>('naqd')
  const [editSup, setEditSup] = useState<Supplier | null>(null)

  const debtors = customers.filter((c) => (c.debt || 0) > 0)
  const totalReceivable = debtors.reduce((s, c) => s + (c.debt || 0), 0)
  const payables = suppliers.filter((s) => (s.debt || 0) > 0)
  const totalPayable = payables.reduce((s, x) => s + (x.debt || 0), 0)

  async function doPay() {
    if (!pay) return
    const amt = Math.min(Number(amount) || 0, pay.max)
    if (amt <= 0) return toast('Summani kiriting', 'err')
    if (pay.kind === 'customer') await payCustomerDebt(pay.id, amt, payAccount, 'Qarz to\'lovi')
    else await paySupplierDebt(pay.id, amt, payAccount, 'Yetkazib beruvchiga to\'lov')
    toast('To\'lov qabul qilindi', 'ok')
    setPay(null); setAmount('')
  }

  async function saveSupplier() {
    if (!editSup) return
    if (!editSup.name.trim()) return toast('Nomini kiriting', 'err')
    if (editSup.id) await db.suppliers.update(editSup.id, editSup)
    else await db.suppliers.add({ ...editSup, createdAt: Date.now() })
    toast('Saqlandi', 'ok')
    setEditSup(null)
  }

  return (
    <>
      <div className="kpis" style={{ marginBottom: 16 }}>
        <div className="kpi"><div className="lab">Mijozlar qarzi (bizga)</div><div className="val">{som(totalReceivable)}</div><div className="sub">{debtors.length} ta mijoz</div></div>
        <div className="kpi"><div className="lab">Yetkazib beruvchi qarzi (bizdan)</div><div className="val">{som(totalPayable)}</div><div className="sub">{payables.length} ta ta'minotchi</div></div>
        <div className="kpi"><div className="lab">Sof qarz holati</div><div className="val">{som(totalReceivable - totalPayable)}</div><div className="sub">bizga − bizdan</div></div>
      </div>

      <div className="section-head">
        <div className="pill-toggle">
          <button className={tab === 'customer' ? 'on' : ''} onClick={() => setTab('customer')}>Mijozlar qarzi</button>
          <button className={tab === 'supplier' ? 'on' : ''} onClick={() => setTab('supplier')}>Yetkazib beruvchilar</button>
        </div>
        {tab === 'supplier' && <button className="btn primary" onClick={() => setEditSup({ name: '', phone: '', debt: 0, createdAt: 0 })}>+ Yetkazib beruvchi</button>}
      </div>

      {tab === 'customer' ? (
        <div className="table-wrap">
          <table>
            <thead><tr><th>Mijoz</th><th>Telefon</th><th className="num">Qarzi</th><th></th></tr></thead>
            <tbody>
              {debtors.map((c) => (
                <tr key={c.id}>
                  <td><b>{c.name}</b></td>
                  <td>{c.phone}</td>
                  <td className="num"><b style={{ color: 'var(--brand)' }}>{som(c.debt)}</b></td>
                  <td className="num"><button className="btn sm primary" onClick={() => { setPay({ kind: 'customer', id: c.id!, name: c.name, max: c.debt }); setAmount(c.debt) }}>Qarz to'lash</button></td>
                </tr>
              ))}
              {debtors.length === 0 && <tr><td colSpan={4} className="empty">Qarzdor mijoz yo'q 👍</td></tr>}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="table-wrap">
          <table>
            <thead><tr><th>Yetkazib beruvchi</th><th>Telefon</th><th className="num">Bizning qarzimiz</th><th></th></tr></thead>
            <tbody>
              {suppliers.map((s) => (
                <tr key={s.id}>
                  <td><b>{s.name}</b></td>
                  <td>{s.phone}</td>
                  <td className="num">{(s.debt || 0) > 0 ? <b style={{ color: 'var(--brand)' }}>{som(s.debt)}</b> : '—'}</td>
                  <td className="num">
                    <button className="btn sm" onClick={() => setEditSup({ ...s })}>✏️</button>{' '}
                    {(s.debt || 0) > 0 && <button className="btn sm primary" onClick={() => { setPay({ kind: 'supplier', id: s.id!, name: s.name, max: s.debt }); setAmount(s.debt) }}>To'lov qilish</button>}
                  </td>
                </tr>
              ))}
              {suppliers.length === 0 && <tr><td colSpan={4} className="empty">Yetkazib beruvchi yo'q. "+ Yetkazib beruvchi" tugmasidan qo'shing.</td></tr>}
            </tbody>
          </table>
        </div>
      )}

      {pay && (
        <Modal
          title={pay.kind === 'customer' ? `Qarz to'lash — ${pay.name}` : `To'lov — ${pay.name}`}
          onClose={() => setPay(null)}
          footer={<><button className="btn" onClick={() => setPay(null)}>Bekor</button><button className="btn primary" onClick={doPay}>Tasdiqlash</button></>}
        >
          <div className="field"><label>Joriy qarz</label><div style={{ fontWeight: 800, fontSize: 20, color: 'var(--brand)' }}>{som(pay.max)}</div></div>
          <div className="field"><label>To'lov summasi (so'm)</label><input className="input" type="number" autoFocus value={amount} onChange={(e) => setAmount(e.target.value ? Number(e.target.value) : '')} /></div>
          <div className="field"><label>{pay.kind === 'customer' ? 'Qaysi hisobga tushdi' : 'Qaysi hisobdan'}</label>
            <select className="input" value={payAccount} onChange={(e) => setPayAccount(e.target.value as Account)}>{ACCOUNTS.map((a) => <option key={a.key} value={a.key}>{a.ic} {a.label}</option>)}</select>
          </div>
        </Modal>
      )}

      {editSup && (
        <Modal
          title={editSup.id ? 'Yetkazib beruvchini tahrirlash' : 'Yangi yetkazib beruvchi'}
          onClose={() => setEditSup(null)}
          footer={<><button className="btn" onClick={() => setEditSup(null)}>Bekor</button><button className="btn primary" onClick={saveSupplier}>Saqlash</button></>}
        >
          <div className="field"><label>Nomi *</label><input className="input" value={editSup.name} onChange={(e) => setEditSup({ ...editSup, name: e.target.value })} /></div>
          <div className="field"><label>Telefon</label><input className="input" value={editSup.phone} onChange={(e) => setEditSup({ ...editSup, phone: e.target.value })} /></div>
          <div className="field"><label>Boshlang'ich qarz (so'm)</label><input className="input" type="number" value={editSup.debt || ''} onChange={(e) => setEditSup({ ...editSup, debt: Number(e.target.value) })} /></div>
        </Modal>
      )}
    </>
  )
}
