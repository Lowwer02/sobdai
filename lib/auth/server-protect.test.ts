import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import test from 'node:test'

const authDir = dirname(fileURLToPath(import.meta.url))
const source = readFileSync(join(authDir, 'server-protect.ts'), 'utf8')

test('usable-account guard rejects banned and deleted profiles', () => {
  assert.match(source, /candidate\.status\s*===\s*'active'/)
  assert.match(source, /candidate\.deleted_at\s*===\s*null/)
  assert.match(source, /typeof\s+candidate\.role\s*===\s*'string'/)
})

test('all application authorization helpers use the usability guard', () => {
  for (const helper of ['requireStaff', 'requirePermission', 'checkPermission']) {
    const start = source.indexOf(`export async function ${helper}`)
    assert.notEqual(start, -1, `${helper} exists`)
    const block = source.slice(start, start + 900)
    assert.match(block, /isUsableAccountProfile\(profile\)/, `${helper} checks account usability`)
  }
})

test('staff roles and permission semantics remain unchanged for usable accounts', () => {
  assert.match(source, /STAFF_ROLES[^\n]*\['owner',\s*'admin',\s*'editor',\s*'support'\]/)
  assert.match(source, /hasPermission\(profile\.role,\s*permission\)/)
})
