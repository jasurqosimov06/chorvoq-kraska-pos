import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import { supabase, supabaseEnabled } from './supabase'

export type Role = 'admin' | 'sotuvchi'

interface AuthCtx {
  ready: boolean
  user: { id: string; email: string } | null
  role: Role
  roleReady: boolean // profil (rol) yuklandimi
  name: string
  signIn: (email: string, password: string) => Promise<{ error?: string }>
  signUp: (email: string, password: string, name: string) => Promise<{ error?: string }>
  signOut: () => Promise<void>
}

// Supabase o'chirilgan bo'lsa (kalit yo'q) — lokal rejim: login talab qilinmaydi, hamma admin.
const Ctx = createContext<AuthCtx>({
  ready: true, user: null, role: 'admin', roleReady: true, name: '',
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
  const [roleReady, setRoleReady] = useState(!supabaseEnabled)
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
    setRoleReady(false)
    const cacheKey = `role_${user.id}`
    supabase.from('profiles').select('role, name').eq('id', user.id).single().then(({ data }) => {
      if (!active) return
      // Internet bo'lmasa oxirgi ma'lum rol (aks holda — eng cheklangani)
      const r = (data?.role as Role) ?? (localStorage.getItem(cacheKey) as Role | null) ?? 'sotuvchi'
      if (data?.role) localStorage.setItem(cacheKey, data.role)
      setRole(r)
      setName(data?.name || user.email)
      setRoleReady(true)
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

  return <Ctx.Provider value={{ ready, user, role, roleReady, name, signIn, signUp, signOut }}>{children}</Ctx.Provider>
}
