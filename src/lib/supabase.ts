import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined
const key = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined

// Supabase sozlangan bo'lsagina bulut/sinxron yoqiladi. Aks holda ilova lokal (offline) ishlaydi.
export const supabaseEnabled = Boolean(url && key)

export const supabase = supabaseEnabled ? createClient(url as string, key as string) : null
