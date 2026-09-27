import { useEffect } from 'react'
import { NavLink, Route, Routes, useLocation } from 'react-router-dom'
import { ToastProvider } from './components/Toast'
import { useSettings } from './lib/data'
import { num } from './lib/format'
import { useAuth, authRequired } from './lib/auth'
import { pendingCount, pushAll, startSync, stopSync } from './lib/sync'
import POS from './pages/POS'
import Dashboard from './pages/Dashboard'
import Products from './pages/Products'
import Purchases from './pages/Purchases'
import Stock from './pages/Stock'
import Customers from './pages/Customers'
import Debts from './pages/Debts'
import Expenses from './pages/Expenses'
import Balances from './pages/Balances'
import Reports from './pages/Reports'
import Settings from './pages/Settings'
import Login from './pages/Login'
import { brand } from './brand'

const NAV = [
  { to: '/', ic: '🛒', label: 'Kassa', end: true },
  { to: '/boshqaruv', ic: '📊', label: 'Boshqaruv', admin: true },
  { to: '/hisob', ic: '💰', label: 'Hisob', admin: true },
  { to: '/tovarlar', ic: '📦', label: 'Tovarlar', admin: true },
  { to: '/kirim', ic: '📥', label: 'Kirim', admin: true },
  { to: '/ostatka', ic: '🗃️', label: 'Ostatka' },
  { to: '/qarzlar', ic: '💳', label: 'Qarzlar' },
  { to: '/xarajatlar', ic: '💸', label: 'Xarajatlar', admin: true },
  { to: '/hisobotlar', ic: '📈', label: 'Hisobotlar', admin: true },
  { to: '/mijozlar', ic: '👤', label: 'Mijozlar' },
  { to: '/sozlama', ic: '⚙️', label: 'Sozlama', admin: true },
]

const TITLES: Record<string, string> = {
  '/': 'Kassa', '/boshqaruv': 'Boshqaruv paneli', '/hisob': 'Hisob (Kassa balansi)', '/tovarlar': 'Tovarlar', '/kirim': 'Tovar kirimi',
  '/ostatka': 'Ombor qoldig\'i', '/qarzlar': 'Qarzdorlik', '/xarajatlar': 'Xarajatlar va sof foyda',
  '/hisobotlar': 'Hisobotlar', '/mijozlar': 'Mijozlar', '/sozlama': 'Sozlama',
}

function Denied() {
  return <div className="empty">Bu bo'lim faqat administrator uchun.</div>
}

export default function App() {
  const settings = useSettings()
  const path = useLocation().pathname
  const { ready, user, role, roleReady, name, signOut } = useAuth()

  useEffect(() => {
    if (!authRequired) return
    if (user && roleReady) startSync(user.id, role)
    else stopSync()
  }, [user?.id, roleReady, role])

  // Chiqishdan oldin lokal yozuvlarni bulutga yuboramiz — keyingi foydalanuvchi kirganda lokal nusxa tozalanadi
  async function logout() {
    await pushAll()
    const left = await pendingCount()
    if (left > 0 && !confirm(`${left} ta yozuv hali bulutga yuborilmagan (internetni tekshiring). Baribir chiqilsinmi?`)) return
    await signOut()
  }

  if (authRequired && !ready) return <div className="fullcenter">Yuklanmoqda…</div>
  if (authRequired && !user) return <Login />
  if (authRequired && !roleReady) return <div className="fullcenter">Yuklanmoqda…</div>

  const isAdmin = !authRequired || role === 'admin'
  const nav = NAV.filter((n) => isAdmin || !n.admin)
  const guard = (el: JSX.Element, adminOnly?: boolean) => (adminOnly && !isAdmin ? <Denied /> : el)

  return (
    <ToastProvider>
      <div className="app">
        <aside className="sidebar">
          <div className="brand">{brand.namePlain}<span className="r">{brand.nameHighlight}</span><small>DO'KON BOSHQARUVI</small></div>
          <nav className="nav">
            {nav.map((n) => (
              <NavLink key={n.to} to={n.to} end={n.end}>
                <span className="ic">{n.ic}</span> {n.label}
              </NavLink>
            ))}
          </nav>
          <div className="sidebar-foot">v0.5 · {authRequired ? (isAdmin ? 'Admin' : 'Sotuvchi') : 'Lokal'}</div>
        </aside>

        <div className="main">
          <header className="topbar">
            <h1>{TITLES[path] ?? brand.name}</h1>
            <div className="topbar-right">
              <span className="kurs">USD: <b>{num(settings.kurs)}</b></span>
              {authRequired && user && (
                <div className="user-chip">
                  <span className="uname">{name}</span>
                  <span className={`urole ${isAdmin ? 'admin' : ''}`}>{isAdmin ? 'Admin' : 'Sotuvchi'}</span>
                  <button className="btn sm" onClick={logout} title="Chiqish">⎋</button>
                </div>
              )}
            </div>
          </header>
          <main className="content">
            <Routes>
              <Route path="/" element={<POS />} />
              <Route path="/boshqaruv" element={guard(<Dashboard />, true)} />
              <Route path="/hisob" element={guard(<Balances />, true)} />
              <Route path="/tovarlar" element={guard(<Products />, true)} />
              <Route path="/kirim" element={guard(<Purchases />, true)} />
              <Route path="/ostatka" element={<Stock />} />
              <Route path="/qarzlar" element={<Debts />} />
              <Route path="/xarajatlar" element={guard(<Expenses />, true)} />
              <Route path="/hisobotlar" element={guard(<Reports />, true)} />
              <Route path="/mijozlar" element={<Customers />} />
              <Route path="/sozlama" element={guard(<Settings />, true)} />
            </Routes>
          </main>
        </div>

        <nav className="mobile-nav">
          {nav.map((n) => (
            <NavLink key={n.to} to={n.to} end={n.end}>
              <span className="ic">{n.ic}</span>
              {n.label}
            </NavLink>
          ))}
        </nav>
      </div>
    </ToastProvider>
  )
}
