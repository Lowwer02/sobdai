import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const read = (path: string) => readFileSync(path, 'utf8')
const action = read('app/admin/position-entities/actions.ts')
const createPage = read('app/admin/position-entities/create/page.tsx')
const editPage = read('app/admin/position-entities/[id]/edit/page.tsx')

test('Position mapping action reloads operational fields and uses the atomic RPC', () => {
  assert.match(action, /select\('id, code, name, organization_id, position_entity_id'\)/)
  assert.match(action, /validatePositionMappingSelection/)
  assert.match(action, /replace_position_entity_mappings/)
  assert.doesNotMatch(action, /clearError|linkError/)
  assert.doesNotMatch(action, /\.from\('positions'\)\s*\.update/)
})

test('create and edit mapping options filter the same operational placeholders', () => {
  for (const page of [createPage, editPage]) {
    assert.match(page, /isOperationalPositionPlaceholder/)
    assert.match(page, /\.filter\(/)
    assert.match(page, /code: row\.code/)
    assert.match(page, /name: row\.name/)
  }
})

test('"use server" module exports only async functions', () => {
  assert.match(action, /^['"]use server['"]/m)
  const runtimeExports = action
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.startsWith('export ') && !line.startsWith('export type'))
  assert.ok(runtimeExports.length > 0, 'expected at least one server action export')
  for (const line of runtimeExports) {
    assert.match(line, /^export async function/, `non-async runtime export: ${line}`)
  }
})
