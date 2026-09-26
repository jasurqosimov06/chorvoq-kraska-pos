// Brend sozlamalari — har bir do'kon (Vercel loyiha) o'z env qiymatlarini beradi.
// Bo'sh qoldirilsa CHORVOQ KRASKA standartlari ishlatiladi.
const env = import.meta.env

const name = (env.VITE_BRAND_NAME as string | undefined)?.trim() || 'CHORVOQ KRASKA'
// Nomning oxiridagi rangli qismi (masalan MARKA|ZZO). Nom oxiriga mos kelmasa — rangsiz.
const hl = (env.VITE_BRAND_HIGHLIGHT as string | undefined) ?? (name === 'CHORVOQ KRASKA' ? 'KRASKA' : '')
const highlight = hl && name.endsWith(hl) ? hl : ''

export const brand = {
  name,
  namePlain: name.slice(0, name.length - highlight.length),
  nameHighlight: highlight,
  tagline: (env.VITE_BRAND_TAGLINE as string | undefined)?.trim() || 'Kraska va dekorativ qoplamalar',
  color: (env.VITE_BRAND_COLOR as string | undefined)?.trim() || '#0e7490',
  color2: (env.VITE_BRAND_COLOR_2 as string | undefined)?.trim() || '#22b8cf',
  colorDark: (env.VITE_BRAND_COLOR_DARK as string | undefined)?.trim() || '#155e75',
  // IndexedDB nomi — bir kompyuterda (bir origin) ikki brend to'qnashmasligi uchun
  dbName: (env.VITE_DB_NAME as string | undefined)?.trim() || 'chorvoq_c1',
  // Lokal rejimda namuna (kraska) tovarlarini avtomatik yuklash
  seedDemo: (env.VITE_SEED_DEMO as string | undefined) !== 'false',
}

export const fileSlug = name.replace(/[^\p{L}\p{N}]+/gu, '_')

// CSS o'zgaruvchilari, sarlavha va theme-color ni brendga moslash
export function applyBrand() {
  const root = document.documentElement.style
  root.setProperty('--brand', brand.color)
  root.setProperty('--brand-2', brand.color2)
  root.setProperty('--brand-dark', brand.colorDark)
  document.title = `${brand.name} — Do'kon boshqaruvi`
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', brand.color)
}
