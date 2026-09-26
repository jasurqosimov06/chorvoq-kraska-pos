import { useEffect, useState } from 'react'
import { db, getSettings } from '../db'
import { useBalances, useLedger, transferMoney, adjustAccount } from '../lib/data'
import { som, num } from '../lib/format'
import { ACCOUNTS, accountLabel, type Account, type Settings } from '../types'
import { Modal } from '../components/Modal'
import { useToast } from '../components/Toast'

const TYPE_LABEL: Record<string, string> = {
  sotuv: 'Sotuv', kirim: 'Tovar kirimi', xarajat: 'Xarajat', dividend: 'Dividend',
  'qarz-tolov': 'Mijoz qarzi', 'yetkazuvchi-tolov': "Yetkazuvchiga to'lov",
  otkazma: "O'tkazma", tuzatish: 'Tuzatish', qaytarish: 'Qaytarish (bekor)', vozvrat: 'Vozvrat (ta\'minotchidan)',
}

export default function Balances() {
  const balances = useBalances()
  const ledger = useLedger()
  const toast = useToast()
  const [s, setS] = useState<Settings | null>(null)
  const [filter, setFilter] = useState<Account | 'all'>('all')
  const [transfer, setTransfer] = useState(false)
  const [adjust, setAdjust] = useState(false)

  // transfer form
  const [tFrom, setTFrom] = useState<Account>('naqd')
  const [tTo, setTTo] = useState<Account>('bank')
  const [tAmount, setTAmount] = useState<number | ''>('')
  // adjust form
  const [aAcc, setAAcc] = useState<Account>('naqd')
  const [aDelta, setADelta] = useState<number | ''>('')
  const [aNote, setANote] = useState('')

  useEffect(() => { getSettings().then(setS) }, [])

  const total = balances.naqd + balances.plastik + balances.bank
  const shown = filter === 'all' ? ledger : ledger.filter((l) => l.account === filter)

  async function saveOpening() {
    if (!s) return
    await db.settings.put({ ...s, id: 1, updatedMs: Date.now() })
    toast('Boshlang\'ich qoldiqlar saqlandi', 'ok')
  }

  async function doTransfer() {
    if (tFrom === tTo) return toast('Har xil hisob tanlang', 'err')
    if (!tAmount || Number(tAmount) <= 0) return toast('Summani kiriting', 'err')
    await transferMoney(tFrom, tTo, Number(tAmount), '')
    toast("O'tkazma bajarildi", 'ok')
    setTransfer(false); setTAmount('')
  }

  async function doAdjust() {
    if (!aDelta || Number(aDelta) === 0) return toast('Summani kiriting', 'err')
    await adjustAccount(aAcc, Number(aDelta), aNote)
    toast('Tuzatish qo\'shildi', 'ok')
    setAdjust(false); setADelta(''); setANote('')
  }

  return (
    <>
      <div className="kpis" style={{ marginBottom: 8 }}>
        {ACCOUNTS.map((a) => (
          <div className="kpi" key={a.key}>
            <div className="lab">{a.ic} {a.label}</div>
            <div className="val" style={{ color: balances[a.key] < 0 ? 'var(--brand)' : undefined }}>{som(balances[a.key])}</div>
          </div>
        ))}
        <div className="kpi" style={{ background: '#141414' }}>
          <div className="lab" style={{ color: '#9ca3af' }}>Jami mablag'</div>
          <div className="val" style={{ color: '#fff' }}>{som(total)}</div>
        </div>
      </div>

      <div className="row" style={{ marginBottom: 16 }}>
        <button className="btn primary" onClick={() => setTransfer(true)}>🔁 Hisoblar orasida o'tkazma</button>
        <button className="btn" onClick={() => setAdjust(true)}>✏️ Qo'lda tuzatish</button>
      </div>

      {/* Boshlang'ich qoldiqlar */}
      {s && (
        <div className="card">
          <div className="section-head"><h2>Boshlang'ich qoldiq (tizim boshlanganda)</h2></div>
          <div className="grid3">
            <div className="field"><label>💵 Naqd</label><input className="input" type="number" value={s.openNaqd || 0} onChange={(e) => setS({ ...s, openNaqd: Number(e.target.value) })} /></div>
            <div className="field"><label>💳 Plastik</label><input className="input" type="number" value={s.openPlastik || 0} onChange={(e) => setS({ ...s, openPlastik: Number(e.target.value) })} /></div>
            <div className="field"><label>🏦 Bank hisob</label><input className="input" type="number" value={s.openBank || 0} onChange={(e) => setS({ ...s, openBank: Number(e.target.value) })} /></div>
          </div>
          <div className="row" style={{ marginTop: 12 }}><button className="btn primary" onClick={saveOpening}>Saqlash</button></div>
        </div>
      )}

      {/* Harakatlar */}
      <div className="card">
        <div className="section-head">
          <h2>Pul harakatlari</h2>
          <div className="pill-toggle">
            <button className={filter === 'all' ? 'on' : ''} onClick={() => setFilter('all')}>Barchasi</button>
            {ACCOUNTS.map((a) => <button key={a.key} className={filter === a.key ? 'on' : ''} onClick={() => setFilter(a.key)}>{a.label}</button>)}
          </div>
        </div>
        <div className="table-wrap">
          <table>
            <thead><tr><th>Sana</th><th>Amal</th><th>Izoh</th><th>Hisob</th><th className="num">Summa</th></tr></thead>
            <tbody>
              {shown.slice(0, 200).map((l) => (
                <tr key={l.id}>
                  <td>{l.date}</td>
                  <td>{TYPE_LABEL[l.type] ?? l.type}</td>
                  <td>{l.note}</td>
                  <td>{accountLabel(l.account)}</td>
                  <td className="num" style={{ color: l.amount < 0 ? 'var(--brand)' : 'var(--green)', fontWeight: 700 }}>
                    {l.amount < 0 ? '−' : '+'}{num(Math.abs(l.amount))}
                  </td>
                </tr>
              ))}
              {shown.length === 0 && <tr><td colSpan={5} className="empty">Harakat yo'q. Sotuv/kirim/xarajat qilinganda bu yerda ko'rinadi.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>

      {transfer && (
        <Modal title="Hisoblar orasida o'tkazma" onClose={() => setTransfer(false)}
          footer={<><button className="btn" onClick={() => setTransfer(false)}>Bekor</button><button className="btn primary" onClick={doTransfer}>O'tkazish</button></>}>
          <div className="grid2">
            <div className="field"><label>Qaysi hisobdan</label>
              <select className="input" value={tFrom} onChange={(e) => setTFrom(e.target.value as Account)}>{ACCOUNTS.map((a) => <option key={a.key} value={a.key}>{a.ic} {a.label}</option>)}</select>
            </div>
            <div className="field"><label>Qaysi hisobga</label>
              <select className="input" value={tTo} onChange={(e) => setTTo(e.target.value as Account)}>{ACCOUNTS.map((a) => <option key={a.key} value={a.key}>{a.ic} {a.label}</option>)}</select>
            </div>
          </div>
          <div className="field"><label>Summa (so'm)</label><input className="input" type="number" autoFocus value={tAmount} onChange={(e) => setTAmount(e.target.value ? Number(e.target.value) : '')} /></div>
        </Modal>
      )}

      {adjust && (
        <Modal title="Qo'lda tuzatish" onClose={() => setAdjust(false)}
          footer={<><button className="btn" onClick={() => setAdjust(false)}>Bekor</button><button className="btn primary" onClick={doAdjust}>Qo'shish</button></>}>
          <div className="field"><label>Hisob</label>
            <select className="input" value={aAcc} onChange={(e) => setAAcc(e.target.value as Account)}>{ACCOUNTS.map((a) => <option key={a.key} value={a.key}>{a.ic} {a.label}</option>)}</select>
          </div>
          <div className="field"><label>Summa (+ qo'shish, − ayirish)</label><input className="input" type="number" value={aDelta} onChange={(e) => setADelta(e.target.value ? Number(e.target.value) : '')} placeholder="masalan: -50000" /></div>
          <div className="field"><label>Izoh</label><input className="input" value={aNote} onChange={(e) => setANote(e.target.value)} placeholder="sabab" /></div>
        </Modal>
      )}
    </>
  )
}
