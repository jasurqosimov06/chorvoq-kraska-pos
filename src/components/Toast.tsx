import { createContext, useCallback, useContext, useState, type ReactNode } from 'react'

type Kind = 'ok' | 'err' | 'info'
const Ctx = createContext<(msg: string, kind?: Kind) => void>(() => {})

export function useToast() {
  return useContext(Ctx)
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toast, setToast] = useState<{ msg: string; kind: Kind } | null>(null)
  const show = useCallback((msg: string, kind: Kind = 'info') => {
    setToast({ msg, kind })
    window.setTimeout(() => setToast(null), 2600)
  }, [])
  return (
    <Ctx.Provider value={show}>
      {children}
      {toast && <div className={`toast ${toast.kind}`}>{toast.msg}</div>}
    </Ctx.Provider>
  )
}
