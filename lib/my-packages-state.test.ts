import assert from 'node:assert/strict'
import test from 'node:test'
// @ts-expect-error Node's strip-types test runner requires an explicit TS extension.
import { deriveMyPackagesViewState } from './my-packages-state.ts'

interface TestPackage {
  id: string
  is_published: boolean
}

const packageRow = (id: string, is_published = true): TestPackage => ({
  id,
  is_published,
})

test('successful authority query with no qualifying packages is a true empty state', () => {
  const state = deriveMyPackagesViewState(
    [
      { status: 'pending', packages: packageRow('pending-package') },
      { status: 'failed', packages: packageRow('failed-package') },
    ],
    null,
  )

  assert.equal(state.kind, 'empty')
  assert.equal(state.historyHref, '/orders')
  assert.deepEqual(state.packages, [])
})

test('authority query errors are distinct and fail closed even with an order response', () => {
  const state = deriveMyPackagesViewState(
    [{ status: 'paid', packages: packageRow('owned-package') }],
    new Error('authority unavailable'),
  )

  assert.equal(state.kind, 'error')
  assert.equal(state.historyHref, '/orders')
  assert.deepEqual(state.packages, [])
})

test('successful qualifying package query resolves the normal package state', () => {
  const state = deriveMyPackagesViewState(
    [{ status: 'paid', packages: packageRow('owned-package') }],
    null,
  )

  assert.equal(state.kind, 'ready')
  assert.equal(state.historyHref, '/orders')
  if (state.kind !== 'ready') assert.fail('expected a ready package state')
  assert.deepEqual(state.packages, [packageRow('owned-package')])
})
