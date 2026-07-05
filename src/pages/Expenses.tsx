import { useMemo, useState } from 'react'
import { db } from '../db'
import { useFixedExpenses, useExpenses, useDividends, useSales, addExpense, addDividend as addDividendTx } from '../lib/data'
import { som, num, today, monthNow, monthLabel, inMonth } from '../lib/format'
import { EXPENSE_CATS, ACCOUNTS, type Account, type FixedExpense } from '../types'
import { Modal } from '../components/Modal'
import { useToast } from '../components/Toast'

export default function Expenses() {
  const fixed = useFixedExpenses()
  const expenses = useExpenses()
  const dividends = useDividends()
  const sales = useSales()
  const toast = useToast()

  const [ym, setYm] = useState(monthNow())
  const [tab, setTab] = useState<'fixed' | 'variable' | 'dividend'>('fixed')
  const [editFixed, setEditFixed] = useState<FixedExpense | null>(null)

  // qo'shish uchun formalar
  const [vDate, setVDate] = useState(today())
  const [vCat, setVCat] = useState(EXPENSE_CATS[0])
  const [vName, setVName] = useState('')
  const [vAmount, setVAmount] = useState<number | ''>('')
  const [vAccount, setVAccount] = useState<Account>('naqd')
  const [dDate, setDDate] = useState(today())
  const [dAmount, setDAmount] = useState<number | ''>('')
  const [dNote, setDNote] = useState('')
  const [dAccount, setDAccount] = useState<Account>('naqd')

  const pnl = useMemo(() => {
    const monthSales = sales.filter((s) => inMonth(s.date, ym))
    const grossProfit = monthSales.reduce((s, x) => s + (x.profit || 0), 0)
    const revenue = monthSales.reduce((s, x) => s + (x.total || 0), 0)
    const fixedTotal = fixed.filter((f) => f.active).reduce((s, f) => s + (f.amount || 0), 0)
    const monthExp = expenses.filter((e) => inMonth(e.date, ym))
    const variableTotal = monthExp.reduce((s, e) => s + (e.amount || 0), 0)
    const expensesTotal = fixedTotal + variableTotal
    const net = grossProfit - expensesTotal
    const dividendsTotal = dividends.filter((d) => inMonth(d.date, ym)).reduce((s, d) => s + (d.amount || 0), 0)
    const retained = net - dividendsTotal
    return { revenue, grossProfit, fixedTotal, variableTotal, expensesTotal, net, dividendsTotal, retained }
  }, [sales, fixed, expenses, dividends, ym])

  const monthExpenses = expenses.filter((e) => inMonth(e.date, ym))
  const monthDividends = dividends.filter((d) => inMonth(d.date, ym))
  const fixedActiveTotal = fixed.filter((f) => f.active).reduce((s, f) => s + f.amount, 0)

  async function addFixed() {
    await db.fixedExpenses.add({ name: 'Yangi xarajat', amount: 0, active: true, note: '', createdAt: Date.now() })
    toast("Qo'shildi — tahrirlang", 'ok')
  }
  async function saveFixed() {
    if (!editFixed) return
    if (editFixed.id) await db.fixedExpenses.update(editFixed.id, editFixed)
    toast('Saqlandi', 'ok')
    setEditFixed(null)
  }
  async function delFixed(id?: number) {
    if (!id) return
    if (!confirm("O'chirilsinmi?")) return
    await db.fixedExpenses.delete(id)
  }
  async function toggleFixed(f: FixedExpense) {
    await db.fixedExpenses.update(f.id!, { active: !f.active })
  }

  async function addVariable() {
    if (!vAmount || Number(vAmount) <= 0) return toast('Summani kiriting', 'err')
    await addExpense({ date: vDate, category: vCat, name: vName || vCat, amount: Number(vAmount), account: vAccount })
    toast("Xarajat qo'shildi", 'ok')
    setVName(''); setVAmount('')
  }
  async function delVariable(id?: number) {
    if (!id) return
    await db.expenses.delete(id)
  }

  async function addDividend() {
    if (!dAmount || Number(dAmount) <= 0) return toast('Summani kiriting', 'err')
    await addDividendTx({ date: dDate, amount: Number(dAmount), account: dAccount, note: dNote })
    toast('Dividend yozildi', 'ok')
    setDAmount(''); setDNote('')
  }
  async function delDividend(id?: number) {
    if (!id) return
    await db.dividends.delete(id)
  }

  return (
    <>
      <div className="section-head">
        <div className="row" style={{ gap: 8 }}>
          <label style={{ fontWeight: 600, color: 'var(--muted)' }}>Oy:</label>
          <input className="input" type="month" style={{ width: 180 }} value={ym} onChange={(e) => setYm(e.target.value || monthNow())} />
          <b style={{ fontSize: 16 }}>{monthLabel(ym)}</b>
        </div>
      </div>

      {/* Sof foyda hisoboti */}
      <div className="card">
        <h2>Sof foyda hisoboti — {monthLabel(ym)}</h2>
        <div className="pnl">
          <div className="pnl-row"><span>Savdo tushumi (oborot)</span><span>{som(pnl.revenue)}</span></div>
          <div className="pnl-row plus"><span>Yalpi foyda (savdo marjasi)</span><span>{som(pnl.grossProfit)}</span></div>
          <div className="pnl-row minus"><span>− Doimiy xarajatlar</span><span>{som(pnl.fixedTotal)}</span></div>
          <div className="pnl-row minus"><span>− O'zgaruvchan xarajatlar</span><span>{som(pnl.variableTotal)}</span></div>
          <div className="pnl-row total"><span>= SOF FOYDA</span><span className={pnl.net >= 0 ? 'pos' : 'neg'}>{som(pnl.net)}</span></div>
          <div className="pnl-row minus"><span>− Dividend (yechilgan)</span><span>{som(pnl.dividendsTotal)}</span></div>
          <div className="pnl-row total"><span>= Biznesda qolgan</span><span className={pnl.retained >= 0 ? 'pos' : 'neg'}>{som(pnl.retained)}</span></div>
        </div>
      </div>

      <div className="section-head" style={{ marginTop: 16 }}>
        <div className="pill-toggle">
          <button className={tab === 'fixed' ? 'on' : ''} onClick={() => setTab('fixed')}>Doimiy xarajatlar</button>
          <button className={tab === 'variable' ? 'on' : ''} onClick={() => setTab('variable')}>O'zgaruvchan</button>
          <button className={tab === 'dividend' ? 'on' : ''} onClick={() => setTab('dividend')}>Dividend</button>
        </div>
      </div>

      {tab === 'fixed' && (
        <div className="card">
          <div className="section-head">
            <h2>Doimiy (oylik o'zgarmas) xarajatlar · jami {som(fixedActiveTotal)}/oy</h2>
            <button className="btn primary" onClick={addFixed}>+ Qo'shish</button>
          </div>
          <div className="table-wrap">
            <table>
              <thead><tr><th>Nomi</th><th className="num">Oylik summa</th><th>Faol</th><th></th></tr></thead>
              <tbody>
                {fixed.map((f) => (
                  <tr key={f.id} style={{ opacity: f.active ? 1 : 0.5 }}>
                    <td><b>{f.name}</b>{f.note ? <div style={{ fontSize: 12, color: 'var(--muted)' }}>{f.note}</div> : null}</td>
                    <td className="num">{som(f.amount)}</td>
                    <td><input type="checkbox" checked={f.active} onChange={() => toggleFixed(f)} /></td>
                    <td className="num">
                      <button className="btn sm" onClick={() => setEditFixed({ ...f })}>✏️</button>{' '}
                      <button className="btn sm danger" onClick={() => delFixed(f.id)}>🗑</button>
                    </td>
                  </tr>
                ))}
                {fixed.length === 0 && <tr><td colSpan={4} className="empty">Doimiy xarajat yo'q</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {tab === 'variable' && (
        <div className="card">
          <h2>O'zgaruvchan xarajat qo'shish</h2>
          <div className="grid3">
            <div className="field"><label>Sana</label><input className="input" type="date" value={vDate} onChange={(e) => setVDate(e.target.value)} /></div>
            <div className="field"><label>Turi</label>
              <select className="input" value={vCat} onChange={(e) => setVCat(e.target.value)}>{EXPENSE_CATS.map((c) => <option key={c}>{c}</option>)}</select>
            </div>
            <div className="field"><label>Izoh (ixtiyoriy)</label><input className="input" value={vName} onChange={(e) => setVName(e.target.value)} placeholder="masalan: kuryer haqi" /></div>
            <div className="field"><label>Summa (so'm)</label><input className="input" type="number" value={vAmount} onChange={(e) => setVAmount(e.target.value ? Number(e.target.value) : '')} /></div>
            <div className="field"><label>Qaysi hisobdan</label>
              <select className="input" value={vAccount} onChange={(e) => setVAccount(e.target.value as Account)}>{ACCOUNTS.map((a) => <option key={a.key} value={a.key}>{a.ic} {a.label}</option>)}</select>
            </div>
            <div className="field" style={{ justifyContent: 'flex-end' }}><button className="btn primary block lg" onClick={addVariable}>+ Qo'shish</button></div>
          </div>
          <div className="table-wrap" style={{ marginTop: 14 }}>
            <table>
              <thead><tr><th>Sana</th><th>Turi</th><th>Izoh</th><th className="num">Summa</th><th></th></tr></thead>
              <tbody>
                {monthExpenses.map((e) => (
                  <tr key={e.id}>
                    <td>{e.date}</td><td>{e.category}</td><td>{e.name}</td>
                    <td className="num">{num(e.amount)}</td>
                    <td className="num"><button className="btn sm danger" onClick={() => delVariable(e.id)}>🗑</button></td>
                  </tr>
                ))}
                {monthExpenses.length === 0 && <tr><td colSpan={5} className="empty">{monthLabel(ym)} da xarajat yo'q</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {tab === 'dividend' && (
        <div className="card">
          <h2>Dividend (sof foydadan yechilgan pul)</h2>
          <div className="grid3">
            <div className="field"><label>Sana</label><input className="input" type="date" value={dDate} onChange={(e) => setDDate(e.target.value)} /></div>
            <div className="field"><label>Summa (so'm)</label><input className="input" type="number" value={dAmount} onChange={(e) => setDAmount(e.target.value ? Number(e.target.value) : '')} /></div>
            <div className="field"><label>Izoh</label><input className="input" value={dNote} onChange={(e) => setDNote(e.target.value)} placeholder="kim/nima uchun" /></div>
            <div className="field"><label>Qaysi hisobdan</label>
              <select className="input" value={dAccount} onChange={(e) => setDAccount(e.target.value as Account)}>{ACCOUNTS.map((a) => <option key={a.key} value={a.key}>{a.ic} {a.label}</option>)}</select>
            </div>
            <div className="field" style={{ justifyContent: 'flex-end' }}><button className="btn primary block lg" onClick={addDividend}>+ Yechish</button></div>
          </div>
          <div className="table-wrap" style={{ marginTop: 14 }}>
            <table>
              <thead><tr><th>Sana</th><th>Izoh</th><th className="num">Summa</th><th></th></tr></thead>
              <tbody>
                {monthDividends.map((d) => (
                  <tr key={d.id}>
                    <td>{d.date}</td><td>{d.note}</td><td className="num">{num(d.amount)}</td>
                    <td className="num"><button className="btn sm danger" onClick={() => delDividend(d.id)}>🗑</button></td>
                  </tr>
                ))}
                {monthDividends.length === 0 && <tr><td colSpan={4} className="empty">{monthLabel(ym)} da dividend yo'q</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {editFixed && (
        <Modal
          title="Doimiy xarajat"
          onClose={() => setEditFixed(null)}
          footer={<><button className="btn" onClick={() => setEditFixed(null)}>Bekor</button><button className="btn primary" onClick={saveFixed}>Saqlash</button></>}
        >
          <div className="field"><label>Nomi</label><input className="input" value={editFixed.name} onChange={(e) => setEditFixed({ ...editFixed, name: e.target.value })} /></div>
          <div className="field"><label>Oylik summa (so'm)</label><input className="input" type="number" value={editFixed.amount || ''} onChange={(e) => setEditFixed({ ...editFixed, amount: Number(e.target.value) })} /></div>
          <div className="field"><label>Izoh</label><input className="input" value={editFixed.note} onChange={(e) => setEditFixed({ ...editFixed, note: e.target.value })} /></div>
        </Modal>
      )}
    </>
  )
}
