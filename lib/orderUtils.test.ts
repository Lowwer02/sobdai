import assert from 'node:assert/strict'
import test from 'node:test'
// @ts-expect-error Node's strip-types test runner requires an explicit TS extension.
import { ORDER_COMPLETED_STATUSES, selectAccessiblePackages, type PackageAccessOrderRow } from './orderUtils.ts'

interface TestPackage {
  id: string
  is_published: boolean
}

const packageRow = (id: string, is_published = true): TestPackage => ({
  id,
  is_published,
})

test('paid and free orders resolve published packages, while non-access statuses do not', () => {
  const orders: PackageAccessOrderRow<TestPackage>[] = [
    { status: 'paid', packages: packageRow('paid-package') },
    { status: 'free', packages: packageRow('free-package') },
    { status: 'pending', packages: packageRow('pending-package') },
    { status: 'failed', packages: packageRow('failed-package') },
    { status: 'refunded', packages: packageRow('refunded-package') },
    { status: 'cancelled', packages: packageRow('cancelled-package') },
  ]

  assert.deepEqual(ORDER_COMPLETED_STATUSES, ['paid', 'free'])
  assert.deepEqual(
    selectAccessiblePackages(orders).map((pkg) => pkg.id),
    ['paid-package', 'free-package'],
  )
})

test('accessible package resolution deduplicates orders and excludes unpublished or missing packages', () => {
  const orders: PackageAccessOrderRow<TestPackage>[] = [
    { status: 'paid', packages: packageRow('package-1') },
    // A relation represented as an array is normalized to its first package.
    { status: 'free', packages: [packageRow('package-1')] },
    { status: 'paid', packages: packageRow('unpublished-package', false) },
    { status: 'paid', packages: null },
  ]

  assert.deepEqual(selectAccessiblePackages(orders), [packageRow('package-1')])
})
