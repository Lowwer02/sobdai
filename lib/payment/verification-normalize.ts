const ZERO_WIDTH_CHARACTERS = /[\u200B-\u200D\uFEFF]/g
const THAI_DIGIT_MAP: Record<string, string> = {
  '๐': '0',
  '๑': '1',
  '๒': '2',
  '๓': '3',
  '๔': '4',
  '๕': '5',
  '๖': '6',
  '๗': '7',
  '๘': '8',
  '๙': '9',
}

export function normalizeThaiDigits(value: string): string {
  return value.replace(/[๐-๙]/g, (digit) => THAI_DIGIT_MAP[digit] || digit)
}

export function normalizeOcrText(value: string): string {
  return value
    .normalize('NFKC')
    .replace(ZERO_WIDTH_CHARACTERS, '')
    // Keep record boundaries for field extraction; only replace other control
    // characters so OCR lines remain independently attributable.
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, ' ')
    .replace(/[ \t]+/g, ' ')
    .trim()
}

/**
 * Recipient comparison is intentionally exact after conservative formatting
 * normalization. It removes presentation noise, not OCR character errors;
 * fuzzy or edit-distance matches never become STRONG_MATCH.
 */
export function normalizeRecipientName(value: string): string {
  let normalized = normalizeOcrText(value)
    .toLocaleLowerCase('th-TH')
    .replace(/^\s*(นาย|นางสาว|นาง|คุณ|mr\.?|mrs\.?|ms\.?)\s*/iu, '')

  normalized = normalized
    .replace(/[\p{P}\p{S}\s]+/gu, '')
    .replace(ZERO_WIDTH_CHARACTERS, '')

  return normalized
}

export function normalizeReference(value: string): string {
  return normalizeThaiDigits(value)
    .normalize('NFKC')
    .replace(ZERO_WIDTH_CHARACTERS, '')
    .replace(/[^a-zA-Z0-9ก-๙]/g, '')
    .toUpperCase()
}

export function canonicalAmount(value: string): string | null {
  const normalized = normalizeThaiDigits(value)
    .normalize('NFKC')
    .replace(/[฿$€£]|THB|บาท/giu, '')
    .replace(/,/g, '')
    .replace(/\s/g, '')

  if (!/^(?:0|[1-9]\d*)(?:\.\d{1,2})?$/.test(normalized)) return null

  const [whole, fraction = ''] = normalized.split('.')
  if (BigInt(whole) <= BigInt(0)) return null
  return `${BigInt(whole).toString()}.${fraction.padEnd(2, '0')}`
}

export function uniqueStrings(values: readonly (string | null | undefined)[]): string[] {
  return Array.from(new Set(values.filter((value): value is string => Boolean(value))))
}

export function tailMatches(value: string, suffixes: readonly string[]): boolean {
  const digits = normalizeThaiDigits(value).replace(/\D/g, '')
  return suffixes.some((suffix) => digits.endsWith(normalizeThaiDigits(suffix).replace(/\D/g, '')))
}

export function maskReference(value: string | null | undefined): string | null {
  if (!value) return null
  const normalized = normalizeReference(value)
  return normalized.length <= 4 ? normalized : `••••${normalized.slice(-4)}`
}
