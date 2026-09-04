const DEFAULT_INTERNAL_RETURN_PATH = '/'
const MAX_INTERNAL_RETURN_PATH_LENGTH = 2_048
const CONTROL_CHARACTER_PATTERN = /[\u0000-\u001f\u007f]/
const MAX_CANONICALIZATION_PASSES = 4

function hasSafeInternalShape(value: string): boolean {
  return value.startsWith('/')
    && !value.startsWith('//')
    && !value.includes('\\')
    && !CONTROL_CHARACTER_PATTERN.test(value)
}

/**
 * Accept only same-origin application paths. The original representation is
 * returned so valid encoded query values are preserved; decoding is used only
 * to reject dangerous forms that another URL layer could reveal later.
 */
export function normalizeInternalReturnPath(value: unknown): string {
  if (typeof value !== 'string'
    || value.length === 0
    || value.length > MAX_INTERNAL_RETURN_PATH_LENGTH) {
    return DEFAULT_INTERNAL_RETURN_PATH
  }

  let inspected = value
  for (let pass = 0; pass < MAX_CANONICALIZATION_PASSES; pass += 1) {
    if (!hasSafeInternalShape(inspected)) return DEFAULT_INTERNAL_RETURN_PATH

    let decoded: string
    try {
      decoded = decodeURIComponent(inspected)
    } catch {
      return DEFAULT_INTERNAL_RETURN_PATH
    }

    if (decoded === inspected) return value
    inspected = decoded
  }

  // Refuse values that remain encoded after the bounded inspection instead
  // of allowing a later component to perform an unexamined extra decode.
  try {
    if (decodeURIComponent(inspected) !== inspected) return DEFAULT_INTERNAL_RETURN_PATH
  } catch {
    return DEFAULT_INTERNAL_RETURN_PATH
  }

  return hasSafeInternalShape(inspected) ? value : DEFAULT_INTERNAL_RETURN_PATH
}

export function buildInternalReturnUrl(origin: string, value: unknown): URL {
  return new URL(normalizeInternalReturnPath(value), origin)
}
