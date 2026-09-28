import { supabase, supabaseEnabled } from './supabase'
import { db, setApplyingRemote, TABLE_MAP, DEFAULT_SETTINGS } from '../db'

// Dexie jadval nomlari (kalitlari) ↔ bulut nomlari TABLE_MAP da
const DEXIE_TABLES = Object.keys(TABLE_MAP)

const snake = (k: string) => k.replace(/[A-Z]/g, (m) => '_' + m.toLowerCase())
const camel = (k: string) => k.replace(/_([a-z])/g, (_, c: string) => c.toUpperCase())

function toCloud(rec: any) {
  const o: any = {}
  for (const k of Object.keys(rec)) o[snake(k)] = rec[k]
  if (o.updated_ms == null) o.updated_ms = Date.now()
  if (o.deleted == null) o.deleted = false
  return o
}
function fromCloud(row: any) {
  const o: any = {}
  for (const k of Object.keys(row)) o[camel(k)] = row[k]
  return o
}

// Postgres: row-level security ruxsat bermadi
const RLS_DENIED = '42501'

export type SyncRole = 'admin' | 'sotuvchi'
let role: SyncRole = 'admin'

// Qaysi jadvalni qayerdan tortamiz (supabase/rollar.sql): sotuvchi tovar/kirimni tannarxsiz
// ko'rinishlardan oladi; bazaviy sotuv jadvallarida tannarx 0, admin uni *_full dan oladi
const PULL_SOURCE: Record<SyncRole, Record<string, string>> = {
  sotuvchi: { products: 'products_public', purchases: 'purchases_public' },
  admin: { sales: 'sales_full', saleLines: 'sale_lines_full' },
}
const pullSource = (dName: string) => PULL_SOURCE[role][dName] ?? TABLE_MAP[dName]
// Sotuvchi bu jadvallarga yoza olmaydi — yubormaymiz ham
const NO_PUSH: Record<SyncRole, string[]> = {
  sotuvchi: ['products', 'purchases', 'fixedExpenses', 'expenses', 'dividends'],
  admin: [],
}

const getMs = (key: string) => Number(localStorage.getItem(key) || '0')
const setMs = (key: string, v: number) => localStorage.setItem(key, String(v))

// ---------- PUSH: lokal o'zgarishlarni bulutga ----------
async function pushTable(dName: string) {
  if (!supabase || NO_PUSH[role].includes(dName)) return
  const cName = TABLE_MAP[dName]
  const key = `push_${dName}`
  const last = getMs(key)
  const recs = await (db as any)[dName].filter((r: any) => (r.updatedMs || 0) > last).toArray()
  if (recs.length === 0) return
  const rows = recs.map(toCloud)
  const { error } = await supabase.from(cName).upsert(rows)
  if (error) {
    if (error.code !== RLS_DENIED) throw error
    // Ruxsat yo'q (masalan sotuvchi qurilmasida admin yozuvlari qolgan) — bittalab yuboramiz,
    // ruxsatsizlarini tashlab ketamiz, aks holda ular butun jadval sinxronini to'xtatib qo'yadi
    for (const row of rows) {
      const r = await supabase.from(cName).upsert(row)
      if (r.error && r.error.code !== RLS_DENIED) throw r.error
    }
  }
  const maxMs = Math.max(...recs.map((r: any) => r.updatedMs || 0))
  setMs(key, maxMs)
}

// ---------- PULL: bulutdagi o'zgarishlarni lokalga ----------
async function pullTable(dName: string) {
  if (!supabase) return
  const cName = pullSource(dName)
  const key = `pull_${dName}`
  const last = getMs(key)
  const { data, error } = await supabase.from(cName).select('*').gt('updated_ms', last).order('updated_ms', { ascending: true }).limit(2000)
  if (error) throw error
  if (!data || data.length === 0) return
  setApplyingRemote(true)
  try {
    for (const row of data) {
      const rec = fromCloud(row)
      const local = await (db as any)[dName].get(rec.id)
      // LWW: lokal yangiroq bo'lsa, tegmaymiz (u keyin push qilinadi)
      if (local && (local.updatedMs || 0) > (rec.updatedMs || 0)) continue
      if (rec.deleted) await (db as any)[dName].delete(rec.id)
      else await (db as any)[dName].put(rec)
    }
  } finally {
    setApplyingRemote(false)
  }
  const maxMs = Math.max(...data.map((r: any) => r.updated_ms || 0))
  setMs(key, maxMs)
}

// ---------- Sozlamalar sinxroni ----------
async function pushSettings() {
  if (!supabase || role !== 'admin') return
  const s = await db.settings.get(1)
  if (!s) return
  const last = getMs('push_settings')
  const ms = s.updatedMs || 0
  if (ms <= last) return
  const { error } = await supabase.from('settings').upsert({ id: 'main', data: s, updated_ms: ms })
  if (error) throw error
  setMs('push_settings', ms)
}
async function pullSettings() {
  if (!supabase) return
  const { data, error } = await supabase.from('settings').select('*').eq('id', 'main').maybeSingle()
  if (error || !data) return
  const remote = data.data || {}
  const local = await db.settings.get(1)
  if ((remote.updatedMs || 0) > (local?.updatedMs || 0)) {
    setApplyingRemote(true)
    try { await db.settings.put({ ...DEFAULT_SETTINGS, ...remote, id: 1 }) } finally { setApplyingRemote(false) }
  }
}

export async function pushAll() {
  for (const t of DEXIE_TABLES) { try { await pushTable(t) } catch (e) { /* offline */ } }
  try { await pushSettings() } catch {}
}
export async function pullAll() {
  try { await applyRemoteReset() } catch {}
  for (const t of DEXIE_TABLES) { try { await pullTable(t) } catch (e) { /* offline */ } }
  try { await pullSettings() } catch {}
}

let started = false
let pushTimer: any = null
let pullTimer: any = null
let channel: any = null

// Lokal nusxada hali bulutga ketmagan yozuvlar soni
export async function pendingCount(): Promise<number> {
  let n = 0
  for (const t of DEXIE_TABLES) {
    const last = getMs(`push_${t}`)
    n += await (db as any)[t].filter((r: any) => (r.updatedMs || 0) > last).count()
  }
  return n
}

async function clearLocalData() {
  for (const t of DEXIE_TABLES) {
    await (db as any)[t].clear()
    localStorage.removeItem(`push_${t}`)
    localStorage.removeItem(`pull_${t}`)
  }
  localStorage.removeItem('push_settings')
}

// Boshqa foydalanuvchi/rol kirganda: oldingisining lokal nusxasini (tannarx va h.k.) o'chiramiz
async function resetLocalFor(owner: string) {
  if (localStorage.getItem('sync_owner') === owner) return
  try { await pushAll() } catch {}
  await clearLocalData()
  localStorage.setItem('sync_owner', owner)
}

// Baza tozalangan bo'lsa (supabase/tozalash.sql → settings.data.resetId o'zgaradi),
// lokal nusxani bulutga YUBORMASDAN o'chiramiz — aks holda eski ma'lumot qaytib keladi
async function applyRemoteReset() {
  if (!supabase) return
  const { data, error } = await supabase.from('settings').select('data').eq('id', 'main').maybeSingle()
  if (error) return
  const rid = data?.data?.resetId as string | undefined
  if (!rid || localStorage.getItem('reset_id') === rid) return
  await clearLocalData()
  localStorage.setItem('reset_id', rid)
}

const refetchTimers: Record<string, any> = {}
function refetchSoon(dName: string) {
  clearTimeout(refetchTimers[dName])
  refetchTimers[dName] = setTimeout(() => { pullTable(dName).catch(() => {}) }, 500)
}

export async function startSync(userId: string, userRole: SyncRole) {
  if (!supabaseEnabled || !supabase || started) return
  started = true
  role = userRole
  try { await applyRemoteReset() } catch {}
  await resetLocalFor(`${userId}:${userRole}`)

  // 1) Boshlang'ich pull (bulutdagi hamma narsani olib kelamiz)
  await pullAll()

  // 2) Bulut rejimida namuna avtomatik yuklanmaydi — foydalanuvchi o'z tovarlarini qo'shadi.
  //    (Namuna faqat internetsiz lokal rejimда yuklanadi.)

  // 3) Lokal (sinxronlanmagan) narsalarni bulutga yuboramiz
  await pushAll()

  // 4) Realtime — boshqa qurilmalardagi o'zgarishlar
  channel = supabase.channel('markazzo-sync')
  for (const dName of DEXIE_TABLES) {
    channel.on('postgres_changes', { event: '*', schema: 'public', table: TABLE_MAP[dName] }, async (payload: any) => {
      // Bu rol uchun jadval boshqa ko'rinishdan olinadi — payloadni emas, o'sha ko'rinishni tortamiz
      if (pullSource(dName) !== TABLE_MAP[dName]) { refetchSoon(dName); return }
      const row = payload.new
      if (!row || row.id == null) return
      const rec = fromCloud(row)
      const local = await (db as any)[dName].get(rec.id)
      if (local && (local.updatedMs || 0) > (rec.updatedMs || 0)) return
      setApplyingRemote(true)
      try {
        if (rec.deleted) await (db as any)[dName].delete(rec.id)
        else await (db as any)[dName].put(rec)
      } finally { setApplyingRemote(false) }
      const key = `pull_${dName}`
      if ((rec.updatedMs || 0) > getMs(key)) setMs(key, rec.updatedMs || 0)
    })
  }
  channel.on('postgres_changes', { event: '*', schema: 'public', table: 'settings' }, () => { pullSettings() })
  channel.subscribe()

  // 5) Davriy push (lokal yozuvlarni yuborish) va zaxira pull
  pushTimer = setInterval(() => { pushAll() }, 4000)
  pullTimer = setInterval(() => { pullAll() }, 20000)
  window.addEventListener('online', onOnline)
}

function onOnline() { pushAll().then(pullAll) }

export function stopSync() {
  started = false
  if (pushTimer) clearInterval(pushTimer)
  if (pullTimer) clearInterval(pullTimer)
  if (channel && supabase) supabase.removeChannel(channel)
  channel = null
  window.removeEventListener('online', onOnline)
  // Kursorlar saqlanadi; boshqa foydalanuvchi kirsa resetLocalFor tozalaydi
}
