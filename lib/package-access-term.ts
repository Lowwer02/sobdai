/**
 * Package Detail V1 uses lifetime access for every package.
 * Keep the customer-facing term in one place; no expiry date is calculated.
 */
export const PACKAGE_ACCESS_TERM = 'ไม่จำกัดระยะเวลา' as const

export function resolvePackageAccessTerm(): typeof PACKAGE_ACCESS_TERM {
  return PACKAGE_ACCESS_TERM
}
