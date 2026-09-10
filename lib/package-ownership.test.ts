import assert from 'node:assert/strict'
import test from 'node:test'

// @ts-expect-error Node's strip-types test runner requires the explicit .ts extension.
import { packageOwnershipError, validatePackageOrganizationPosition } from './package-ownership.ts'

test('Package organization/position ownership accepts matching organization IDs', () => {
  const check = validatePackageOrganizationPosition('org-1', 'org-1')
  assert.deepEqual(check, { valid: true })
  assert.equal(packageOwnershipError(check), null)
})

test('Package organization/position ownership rejects mismatched organizations', () => {
  const check = validatePackageOrganizationPosition('org-1', 'org-2')
  assert.deepEqual(check, { valid: false, reason: 'mismatch' })
  assert.equal(packageOwnershipError(check), 'ตำแหน่งที่เลือกไม่ได้อยู่ในหน่วยงานเดียวกับแพ็กเกจ')
})

test('Package organization/position ownership rejects missing selections', () => {
  const check = validatePackageOrganizationPosition('', null)
  assert.deepEqual(check, { valid: false, reason: 'missing' })
  assert.equal(packageOwnershipError(check), 'ไม่พบหน่วยงานหรือตำแหน่งที่เลือก')
})
