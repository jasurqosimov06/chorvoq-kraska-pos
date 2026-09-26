import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import App from './App'
import { AuthProvider } from './lib/auth'
import './styles.css'
import { ensureSettings, seedData, db } from './db'
import { supabaseEnabled } from './lib/supabase'
import { checkout, addPurchase, payCustomerDebt, paySupplierDebt, addExpense, addDividend, transferMoney, adjustAccount } from './lib/data'
import { supabase } from './lib/supabase'
import { pushAll, pullAll } from './lib/sync'

// dev-only debug handle (excluded from production build)
if (import.meta.env.DEV) {
  ;(window as any).__markazzo = { db, supabase, pushAll, pullAll, checkout, addPurchase, payCustomerDebt, paySupplierDebt, addExpense, addDividend, transferMoney, adjustAccount }
}

async function boot() {
  await ensureSettings()
  // Lokal rejim (Supabase yo'q): darhol namuna yuklaymiz.
  // Sinxron rejimda esa namuna bulut bo'sh bo'lganда, kirgandan keyin yuklanadi.
  if (!supabaseEnabled) await seedData()
  ReactDOM.createRoot(document.getElementById('root')!).render(
    <React.StrictMode>
      <BrowserRouter>
        <AuthProvider>
          <App />
        </AuthProvider>
      </BrowserRouter>
    </React.StrictMode>,
  )
}
boot()
