import { NavLink, Route, Routes, useLocation } from 'react-router-dom'
import { ToastProvider } from './components/Toast'
import { useSettings } from './lib/data'
import { num } from './lib/format'
import POS from './pages/POS'
import Dashboard from './pages/Dashboard'
import Products from './pages/Products'
import Purchases from './pages/Purchases'
import Stock from './pages/Stock'
import Customers from './pages/Customers'
import Debts from './pages/Debts'
import Expenses from './pages/Expenses'
import Balances from './pages/Balances'
import Settings from './pages/Settings'

const NAV = [
  { to: '/', ic: '🛒', label: 'Kassa', end: true },
  { to: '/boshqaruv', ic: '📊', label: 'Boshqaruv' },
  { to: '/hisob', ic: '💰', label: 'Hisob' },
  { to: '/tovarlar', ic: '📦', label: 'Tovarlar' },
  { to: '/kirim', ic: '📥', label: 'Kirim' },
  { to: '/ostatka', ic: '🗃️', label: 'Ostatka' },
  { to: '/qarzlar', ic: '💳', label: 'Qarzlar' },
  { to: '/xarajatlar', ic: '💸', label: 'Xarajatlar' },
  { to: '/mijozlar', ic: '👤', label: 'Mijozlar' },
  { to: '/sozlama', ic: '⚙️', label: 'Sozlama' },
]

const MOBILE_NAV = NAV

const TITLES: Record<string, string> = {
  '/': 'Kassa', '/boshqaruv': 'Boshqaruv paneli', '/hisob': 'Hisob (Kassa balansi)', '/tovarlar': 'Tovarlar', '/kirim': 'Tovar kirimi',
  '/ostatka': 'Ombor qoldig\'i', '/qarzlar': 'Qarzdorlik', '/xarajatlar': 'Xarajatlar va sof foyda',
  '/mijozlar': 'Mijozlar', '/sozlama': 'Sozlama',
}

export default function App() {
  const settings = useSettings()
  const path = useLocation().pathname

  return (
    <ToastProvider>
      <div className="app">
        <aside className="sidebar">
          <div className="brand">MARKA<span className="r">ZZO</span><small>DO'KON BOSHQARUVI</small></div>
          <nav className="nav">
            {NAV.map((n) => (
              <NavLink key={n.to} to={n.to} end={n.end}>
                <span className="ic">{n.ic}</span> {n.label}
              </NavLink>
            ))}
          </nav>
          <div className="sidebar-foot">v0.1 · MVP</div>
        </aside>

        <div className="main">
          <header className="topbar">
            <h1>{TITLES[path] ?? 'MARKAZZO'}</h1>
            <div className="kurs">USD kurs: <b>{num(settings.kurs)} so'm</b></div>
          </header>
          <main className="content">
            <Routes>
              <Route path="/" element={<POS />} />
              <Route path="/boshqaruv" element={<Dashboard />} />
              <Route path="/hisob" element={<Balances />} />
              <Route path="/tovarlar" element={<Products />} />
              <Route path="/kirim" element={<Purchases />} />
              <Route path="/ostatka" element={<Stock />} />
              <Route path="/qarzlar" element={<Debts />} />
              <Route path="/xarajatlar" element={<Expenses />} />
              <Route path="/mijozlar" element={<Customers />} />
              <Route path="/sozlama" element={<Settings />} />
            </Routes>
          </main>
        </div>

        <nav className="mobile-nav">
          {MOBILE_NAV.map((n) => (
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
