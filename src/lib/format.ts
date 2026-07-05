const nf = new Intl.NumberFormat('ru-RU')

export function som(n: number): string {
  return nf.format(Math.round(n || 0)) + " so'm"
}

export function num(n: number): string {
  return nf.format(Math.round(n || 0))
}

export function usd(n: number): string {
  return '$' + (n || 0).toFixed(2)
}

export function pct(n: number): string {
  return (n * 100).toFixed(1) + '%'
}

const p2 = (n: number) => String(n).padStart(2, '0')

export function today(): string {
  const d = new Date()
  return `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}`
}

export function monthNow(): string {
  const d = new Date()
  return `${d.getFullYear()}-${p2(d.getMonth() + 1)}` // yyyy-mm (mahalliy)
}

export function inMonth(dateStr: string, ym: string): boolean {
  return typeof dateStr === 'string' && dateStr.startsWith(ym)
}

export function monthLabel(ym: string): string {
  const months = ['Yanvar', 'Fevral', 'Mart', 'Aprel', 'May', 'Iyun', 'Iyul', 'Avgust', 'Sentabr', 'Oktabr', 'Noyabr', 'Dekabr']
  const [y, m] = ym.split('-')
  return `${months[Number(m) - 1] ?? m} ${y}`
}

export function costUzs(costUsd: number, kurs: number): number {
  return costUsd * kurs
}

// marja = (sotuv - tannarx) / sotuv
export function marja(price: number, cost: number): number {
  if (!price) return 0
  return (price - cost) / price
}

export function saleNumber(): string {
  const d = new Date()
  const p = (x: number) => String(x).padStart(2, '0')
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`
}
