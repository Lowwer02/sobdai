// @ts-expect-error Node's strip-types test runner requires an explicit TS extension.
import { selectAccessiblePackages, type PackageAccessOrderRow } from './orderUtils.ts'

export const MY_PACKAGES_ORDER_HISTORY_HREF = '/orders' as const

export type MyPackagesViewState<TPackage> =
  | { kind: 'error'; packages: []; historyHref: typeof MY_PACKAGES_ORDER_HISTORY_HREF }
  | { kind: 'empty'; packages: []; historyHref: typeof MY_PACKAGES_ORDER_HISTORY_HREF }
  | { kind: 'ready'; packages: TPackage[]; historyHref: typeof MY_PACKAGES_ORDER_HISTORY_HREF }

/**
 * Resolve the learner-facing state for the primary package-access read.
 *
 * The orders query is the entitlement authority. An authority error is kept
 * distinct from a successful query with no qualifying packages so the page
 * cannot accidentally present an access failure as an empty account.
 */
export function deriveMyPackagesViewState<
  TPackage extends { id: string; is_published: boolean },
>(
  orders: readonly PackageAccessOrderRow<TPackage>[] | null | undefined,
  authorityError: unknown,
): MyPackagesViewState<TPackage> {
  if (authorityError) {
    return { kind: 'error', packages: [], historyHref: MY_PACKAGES_ORDER_HISTORY_HREF }
  }

  const packages = selectAccessiblePackages(orders ?? [])

  if (packages.length === 0) {
    return { kind: 'empty', packages: [], historyHref: MY_PACKAGES_ORDER_HISTORY_HREF }
  }

  return { kind: 'ready', packages, historyHref: MY_PACKAGES_ORDER_HISTORY_HREF }
}
