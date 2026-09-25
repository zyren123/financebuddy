// K 线日期是无时区的 'YYYY-MM-DD' 字符串,统一按 UTC 日做加减,避免本地时区漂移

export function toISODate(d: Date): string {
  return d.toISOString().slice(0, 10)
}

export function todayISO(): string {
  return toISODate(new Date())
}

export function addDays(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + days)
  return toISODate(d)
}
