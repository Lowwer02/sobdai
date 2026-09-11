import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import test from 'node:test'

const actions = readFileSync(fileURLToPath(new URL('../admin/packages/actions.ts', import.meta.url)), 'utf8')

test('Package create and update actions load position organization ownership before writing', () => {
  assert.match(actions, /validatePackageOrganizationPosition/)
  assert.equal((actions.match(/select\('id, code'\)/g) || []).length, 2)
  assert.equal((actions.match(/select\('code, organization_id'\)/g) || []).length, 2)
  assert.equal((actions.match(/if \(!org \|\| !pos\)/g) || []).length, 2)
  assert.equal((actions.match(/pos\.organization_id !== org\.id/g) || []).length, 2)
  assert.equal((actions.match(/packageOwnershipError\(ownership\)/g) || []).length, 2)
})
