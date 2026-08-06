export const CONSENT_COOKIE_NAME = 'sobdai_consent'
export const CONSENT_VERSION = 1
export const CONSENT_MAX_AGE_SECONDS = 31536000

export interface ConsentPreferences {
  version: number
  necessary: true
  analytics: boolean
  marketing: false
  updatedAt: string
}

/**
 * Creates a normalized ConsentPreferences object.
 */
export function createConsentPreferences(analytics: boolean): ConsentPreferences {
  return {
    version: CONSENT_VERSION,
    necessary: true,
    analytics,
    marketing: false,
    updatedAt: new Date().toISOString(),
  }
}

/**
 * Safely parses and validates raw consent cookie string or JSON value.
 */
export function parseConsentValue(rawValue: string | null | undefined): ConsentPreferences | null {
  if (!rawValue) return null

  try {
    const decoded = decodeURIComponent(rawValue)
    const parsed = JSON.parse(decoded)

    if (typeof parsed !== 'object' || parsed === null) {
      return null
    }

    if (parsed.version !== CONSENT_VERSION) return null
    if (parsed.necessary !== true) return null
    if (typeof parsed.analytics !== 'boolean') return null
    if (parsed.marketing !== false) return null
    if (typeof parsed.updatedAt !== 'string') return null

    const date = new Date(parsed.updatedAt)
    if (Number.isNaN(date.getTime())) return null
    if (date.toISOString() !== parsed.updatedAt) return null

    return {
      version: CONSENT_VERSION,
      necessary: true,
      analytics: parsed.analytics,
      marketing: false,
      updatedAt: parsed.updatedAt,
    }
  } catch {
    return null
  }
}

/**
 * Serializes consent preferences into a URL-encoded JSON string.
 */
export function serializeConsentValue(consent: ConsentPreferences): string {
  const payload: ConsentPreferences = {
    version: CONSENT_VERSION,
    necessary: true,
    analytics: Boolean(consent.analytics),
    marketing: false,
    updatedAt: consent.updatedAt,
  }
  return encodeURIComponent(JSON.stringify(payload))
}

/**
 * Parses the `sobdai_consent` cookie value from a raw browser cookie string.
 */
export function parseConsentFromCookieString(cookieString: string): ConsentPreferences | null {
  if (!cookieString) return null

  const cookies = cookieString.split(';')
  for (let i = 0; i < cookies.length; i++) {
    const cookie = cookies[i].trim()
    const equalsIndex = cookie.indexOf('=')
    if (equalsIndex === -1) continue

    const name = cookie.slice(0, equalsIndex).trim()
    if (name === CONSENT_COOKIE_NAME) {
      const value = cookie.slice(equalsIndex + 1).trim()
      return parseConsentValue(value)
    }
  }

  return null
}

/**
 * Reads consent preferences from `document.cookie` in client environments.
 */
export function readConsentFromDocumentCookie(): ConsentPreferences | null {
  if (typeof document === 'undefined') return null
  return parseConsentFromCookieString(document.cookie)
}

/**
 * Writes the `sobdai_consent` cookie to `document.cookie`.
 */
export function writeConsentToDocumentCookie(consent: ConsentPreferences): void {
  if (typeof document === 'undefined') return

  const serialized = serializeConsentValue(consent)
  const isHttps = typeof window !== 'undefined' && window.location.protocol === 'https:'
  const secureFlag = isHttps ? '; Secure' : ''

  document.cookie = `${CONSENT_COOKIE_NAME}=${serialized}; Path=/; Max-Age=${CONSENT_MAX_AGE_SECONDS}; SameSite=Lax${secureFlag}`
}

/**
 * Clears the `sobdai_consent` cookie from `document.cookie`.
 */
export function clearConsentDocumentCookie(): void {
  if (typeof document === 'undefined') return

  document.cookie = `${CONSENT_COOKIE_NAME}=; Path=/; Max-Age=0; Expires=Thu, 01 Jan 1970 00:00:00 GMT; SameSite=Lax`
}

/**
 * Deletes known first-party analytics cookies (_ga, _clck, _clsk, _ga_*) from document.cookie.
 */
export function clearKnownAnalyticsCookiesFromDocument(): void {
  if (typeof document === 'undefined') return

  try {
    const rawCookies = document.cookie ? document.cookie.split(';') : []
    const isHttps = typeof window !== 'undefined' && window.location.protocol === 'https:'
    const secureFlag = isHttps ? '; Secure' : ''
    const hostname = typeof window !== 'undefined' ? window.location.hostname : ''
    const isLocalhost = hostname === 'localhost' || hostname === '127.0.0.1'

    for (let i = 0; i < rawCookies.length; i++) {
      const cookie = rawCookies[i].trim()
      const equalsIndex = cookie.indexOf('=')
      const name = equalsIndex === -1 ? cookie.trim() : cookie.slice(0, equalsIndex).trim()

      if (!name) continue

      const isExactMatch = name === '_ga' || name === '_clck' || name === '_clsk'
      const isGaContainerMatch = name.startsWith('_ga_')

      if (isExactMatch || isGaContainerMatch) {
        const baseDirective = `=; Path=/; Max-Age=0; Expires=Thu, 01 Jan 1970 00:00:00 GMT; SameSite=Lax${secureFlag}`

        // Host-only deletion
        document.cookie = `${name}${baseDirective}`

        // Domain-level deletion attempts (if hostname is available and not localhost)
        if (hostname && !isLocalhost) {
          document.cookie = `${name}${baseDirective}; Domain=${hostname}`
          document.cookie = `${name}${baseDirective}; Domain=.${hostname}`
        }
      }
    }
  } catch {
    // Ignore deletion failures silently to avoid throwing exceptions
  }
}
