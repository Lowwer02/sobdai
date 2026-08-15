import assert from 'node:assert/strict'
import test from 'node:test'

// @ts-expect-error Node's strip-types test runner requires the explicit .ts extension.
import { INTERNAL_PACKAGE_ACCESS_ROLES, hasInternalPackageAccess } from './rbac.ts'

test('internal Package access is exactly Owner/Admin', () => {
  assert.deepEqual(INTERNAL_PACKAGE_ACCESS_ROLES, ['owner', 'admin'])

  for (const role of ['owner', 'admin']) {
    assert.equal(hasInternalPackageAccess(role), true, `${role} should bypass customer entitlement`)
  }

  for (const role of ['editor', 'support', 'user', null, undefined, '']) {
    assert.equal(hasInternalPackageAccess(role), false, `${String(role)} must not bypass customer entitlement`)
  }
})
