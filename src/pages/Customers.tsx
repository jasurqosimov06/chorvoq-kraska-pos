import { useState } from 'react'
import { db, softDelete } from '../db'
import { useCustomers } from '../lib/data'
import { num, som } from '../lib/format'
import type { Customer } from '../types'
import { Modal } from '../components/Modal'
import { useToast } from '../components/Toast'

const EMPTY: Customer = { name: '', phone: '', cashback: 0, debt: 0, totalSpent: 0, createdAt: 0 }

export default function Customers() {
  const customers = useCustomers()
  const toast = useToast()
  const [edit, setEdit] = useState<Customer | null>(null)
  const [q, setQ] = useState('')

  const filtered = customers.filter((c) => !q || c.name.toLowerCase().includes(q.toLowerCase()) || c.phone.includes(q))

  async function save() {
    if (!edit) return
    if (!edit.name.trim()) return toast('Ismni kiriting', 'err')
    if (edit.id) { await db.customers.update(edit.id, edit); toast('Saqlandi', 'ok') }
    else { await db.customers.add({ ...edit, createdAt: Date.now() }); toast("Mijoz qo'shildi", 'ok') }
    setEdit(null)
  }

  async function remove(c: Customer) {
    if (!c.id) return
    if (!confirm(`"${c.name}" o'chirilsinmi?`)) return
    await softDelete('customers', c.id)
    toast("O'chirildi", 'ok')
  }

  return (
    <>
      <div className="section-head">
        <input className="input" style={{ maxWidth: 340 }} placeholder="Ism yoki telefon..." value={q} onChange={(e) => setQ(e.target.value)} />
        <button className="btn primary" onClick={() => setEdit({ ...EMPTY })}>+ Yangi mijoz</button>
      </div>
      <div className="table-wrap">
        <table>
          <thead><tr><th>Ism</th><th>Telefon</th><th className="num">Qarzi</th><th className="num">Keshbek balansi</th><th className="num">Jami xarid</th><th></th></tr></thead>
          <tbody>
            {filtered.map((c) => (
              <tr key={c.id}>
                <td><b>{c.name}</b></td>
                <td>{c.phone}</td>
                <td className="num">{(c.debt || 0) > 0 ? <b style={{ color: 'var(--brand)' }}>{som(c.debt)}</b> : '—'}</td>
                <td className="num">{som(c.cashback)}</td>
                <td className="num">{som(c.totalSpent)}</td>
                <td className="num">
                  <button className="btn sm" onClick={() => setEdit({ ...c })}>✏️</button>{' '}
                  <button className="btn sm danger" onClick={() => remove(c)}>🗑</button>
                </td>
              </tr>
            ))}
            {filtered.length === 0 && <tr><td colSpan={6} className="empty">Mijoz yo'q. Keshbek va sodiqlik uchun mijoz qo'shing.</td></tr>}
          </tbody>
        </table>
      </div>

      {edit && (
        <Modal
          title={edit.id ? 'Mijozni tahrirlash' : 'Yangi mijoz'}
          onClose={() => setEdit(null)}
          footer={<><button className="btn" onClick={() => setEdit(null)}>Bekor</button><button className="btn primary" onClick={save}>Saqlash</button></>}
        >
          <div className="field"><label>Ism *</label><input className="input" value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value })} /></div>
          <div className="field"><label>Telefon</label><input className="input" value={edit.phone} onChange={(e) => setEdit({ ...edit, phone: e.target.value })} placeholder="+998..." /></div>
          <div className="field"><label>Keshbek balansi (so'm)</label><input className="input" type="number" value={edit.cashback || ''} onChange={(e) => setEdit({ ...edit, cashback: Number(e.target.value) })} /></div>
        </Modal>
      )}
    </>
  )
}
