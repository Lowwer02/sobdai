export type MobilePrimaryHref = '/' | '/packages' | '/daily' | '/exams'
export type MobileConsentStatus = 'loading' | 'undecided' | 'accepted' | 'rejected'

const MY_AREA_PREFIXES = ['/exams', '/my-packages', '/orders', '/settings', '/notifications']

function matchesPrefix(pathname: string, prefix: string) {
  return pathname === prefix || pathname.startsWith(`${prefix}/`)
}

export function normalizeMobilePathname(pathname: string) {
  const withoutTrailingSlashes = pathname.replace(/\/+$/, '')
  return withoutTrailingSlashes || '/'
}

export function getActiveMobilePrimaryHref(pathname: string): MobilePrimaryHref | null {
  const currentPath = normalizeMobilePathname(pathname)
  if (currentPath === '/') return '/'
  if (matchesPrefix(currentPath, '/packages') || matchesPrefix(currentPath, '/package')) return '/packages'
  if (matchesPrefix(currentPath, '/daily')) return '/daily'
  if (MY_AREA_PREFIXES.some((prefix) => matchesPrefix(currentPath, prefix))) return '/exams'
  return null
}

export function shouldShowMobileBottomNav(
  isExcluded: boolean,
  consentStatus: MobileConsentStatus,
  isPreferencesOpen: boolean,
) {
  return !isExcluded && consentStatus !== 'loading' && consentStatus !== 'undecided' && !isPreferencesOpen
}
