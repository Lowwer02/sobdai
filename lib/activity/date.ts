export function getBangkokDateKey(value: string | Date = new Date()) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Bangkok',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date(value))
}

export function getBangkokRangeStart(kind: 'day' | 'month', now = new Date()) {
  const bangkokOffsetMs = 7 * 60 * 60 * 1000
  const bangkokNow = new Date(now.getTime() + bangkokOffsetMs)
  const start = kind === 'day'
    ? new Date(Date.UTC(
        bangkokNow.getUTCFullYear(),
        bangkokNow.getUTCMonth(),
        bangkokNow.getUTCDate()
      ))
    : new Date(Date.UTC(
        bangkokNow.getUTCFullYear(),
        bangkokNow.getUTCMonth(),
        1
      ))

  return new Date(start.getTime() - bangkokOffsetMs).toISOString()
}
