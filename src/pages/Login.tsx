import { useState } from 'react'
import { useAuth } from '../lib/auth'

export default function Login() {
  const { signIn, signUp } = useAuth()
  const [mode, setMode] = useState<'in' | 'up'>('in')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [name, setName] = useState('')
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setErr(''); setBusy(true)
    const res = mode === 'in' ? await signIn(email, password) : await signUp(email, password, name)
    setBusy(false)
    if (res.error) setErr(res.error)
    else if (mode === 'up') setErr("Ro'yxatdan o'tdingiz! Endi shu email/parol bilan kiring.")
  }

  return (
    <div className="login-wrap">
      <form className="login-card" onSubmit={submit}>
        <div className="login-brand">MARKA<span className="r">ZZO</span></div>
        <div className="login-sub">Do'kon boshqaruvi</div>
        <h2>{mode === 'in' ? 'Tizimga kirish' : "Ro'yxatdan o'tish"}</h2>
        {mode === 'up' && (
          <div className="field"><label>Ism</label><input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Ismingiz" /></div>
        )}
        <div className="field"><label>Email</label><input className="input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoFocus /></div>
        <div className="field"><label>Parol</label><input className="input" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={6} /></div>
        {err && <div className="login-err">{err}</div>}
        <button className="btn primary block lg" type="submit" disabled={busy}>{busy ? '...' : mode === 'in' ? 'Kirish' : "Ro'yxatdan o'tish"}</button>
        <div className="login-toggle">
          {mode === 'in' ? (
            <>Akkount yo'qmi? <a onClick={() => { setMode('up'); setErr('') }}>Ro'yxatdan o'tish</a></>
          ) : (
            <>Akkount bormi? <a onClick={() => { setMode('in'); setErr('') }}>Kirish</a></>
          )}
        </div>
        <div className="login-hint">Birinchi ro'yxatdan o'tgan foydalanuvchi — <b>Admin</b> bo'ladi.</div>
      </form>
    </div>
  )
}
