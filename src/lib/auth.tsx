import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import { supabase, supabaseEnabled } from './supabase'

export type Role = 'admin' | 'sotuvchi'

interface AuthCtx {
  ready: boolean
  user: { id: string; email: string } | null
  role: Role
  name: string
  signIn: (email: string, password: string) => Promise<{ error?: string }>
  signUp: (email: string, password: string, name: string) => Promise<{ error?: string }>
  signOut: () => Promise<void>
}

// Supabase o'chirilgan bo'lsa (kalit yo'q) — lokal rejim: login talab qilinmaydi, hamma admin.
const Ctx = createContext<AuthCtx>({
  ready: true, user: null, role: 'admin', name: '',
  signIn: async () => ({}), signUp: async () => ({}), signOut: async () => {},
})

export function useAuth() {
  return useContext(Ctx)
}

export const authRequired = supabaseEnabled

export function AuthProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(!supabaseEnabled)
  const [user, setUser] = useState<AuthCtx['user']>(null)
  const [role, setRole] = useState<Role>('admin')
  const [name, setName] = useState('')

  // 1) Sessiyani kuzatamiz. DIQQAT: onAuthStateChange ichida await-DB chaqirmaymiz (deadlock).
  useEffect(() => {
    if (!supabaseEnabled || !supabase) return
    const apply = (session: any) => {
      const u = session?.user ?? null
      setUser(u ? { id: u.id, email: u.email } : null)
      if (!u) { setRole('admin'); setName('') }
      setReady(true)
    }
    supabase.auth.getSession().then(({ data }) => apply(data.session))
    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => apply(session))
    return () => sub.subscription.unsubscribe()
  }, [])

  // 2) Profil (rol) ni alohida — callback tashqarisida — yuklaymiz
  useEffect(() => {
    if (!supabase || !user) return
    let active = true
    supabase.from('profiles').select('role, name').eq('id', user.id).single().then(({ data }) => {
      if (!active) return
      setRole((data?.role as Role) ?? 'sotuvchi')
      setName(data?.name || user.email)
    })
    return () => { active = false }
  }, [user?.id])

  const signIn: AuthCtx['signIn'] = async (email, password) => {
    if (!supabase) return {}
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    return error ? { error: error.message } : {}
  }
  const signUp: AuthCtx['signUp'] = async (email, password, name) => {
    if (!supabase) return {}
    const { error } = await supabase.auth.signUp({ email, password, options: { data: { name } } })
    return error ? { error: error.message } : {}
  }
  const signOut = async () => { if (supabase) await supabase.auth.signOut() }

  return <Ctx.Provider value={{ ready, user, role, name, signIn, signUp, signOut }}>{children}</Ctx.Provider>
}
