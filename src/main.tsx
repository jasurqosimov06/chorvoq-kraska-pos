import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import App from './App'
import './styles.css'
import { ensureSeed, db } from './db'
import { checkout, addPurchase, payCustomerDebt, paySupplierDebt, addExpense, addDividend, transferMoney, adjustAccount } from './lib/data'

// dev-only debug handle (excluded from production build)
if (import.meta.env.DEV) {
  ;(window as any).__markazzo = { db, checkout, addPurchase, payCustomerDebt, paySupplierDebt, addExpense, addDividend, transferMoney, adjustAccount }
}

ensureSeed().finally(() => {
  ReactDOM.createRoot(document.getElementById('root')!).render(
    <React.StrictMode>
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </React.StrictMode>,
  )
})
