// Unit tests for the Phase 4 facet count helpers.
//
// Run with:  npx jiti app/admin/exam-sets/facet-counts.test.ts
//
// Mirrors the style of the sibling exam-sets tests (node:test +
// node:assert/strict). `buildExamSetFacetQuery` is exercised via a recording
// fake builder (it accepts a Supabase-like builder, so it is not pure in the
// mathematical sense — see the module header), and `aggregateFacetCounts` is
// a pure helper tested directly.

import { test } from 'node:test'
import assert from 'node:assert/strict'

import {
  buildExamSetFacetQuery,
  aggregateFacetCounts,
  type FilterableQueryBuilder,
  type CountResult,
} from './facet-counts'

// ─── Recording fake query builder ────────────────────────────────────────────
// Records each predicate call so tests can assert exactly which filters the
// helper applied (and, critically, which it did NOT). Implements the helper's
// `FilterableQueryBuilder` contract structurally; `this`-typed methods keep it
// chainable like the real Supabase builder.
interface RecordedCall {
  method: 'ilike' | 'eq'
  column: string
  value: string | boolean
}
class FakeBuilder implements FilterableQueryBuilder {
  calls: RecordedCall[] = []
  ilike(column: string, value: string): this {
    this.calls.push({ method: 'ilike', column, value })
    return this
  }
  eq(column: string, value: string | boolean): this {
    this.calls.push({ method: 'eq', column, value })
    return this
  }
}

// ─── buildExamSetFacetQuery ─────────────────────────────────────────────────
test('buildExamSetFacetQuery: empty filters apply nothing', () => {
  const q = new FakeBuilder()
  buildExamSetFacetQuery(q, {})
  assert.equal(q.calls.length, 0)
})

test('buildExamSetFacetQuery: applies Search as ilike on name', () => {
  const q = new FakeBuilder()
  buildExamSetFacetQuery(q, { search: 'foo' })
  assert.deepEqual(q.calls, [{ method: 'ilike', column: 'name', value: '%foo%' }])
})

test('buildExamSetFacetQuery: applies Package as eq on package_id', () => {
  const q = new FakeBuilder()
  buildExamSetFacetQuery(q, { packageFilter: 'pkg-1' })
  assert.deepEqual(q.calls, [{ method: 'eq', column: 'package_id', value: 'pkg-1' }])
})

test('buildExamSetFacetQuery: applies Type as eq on is_sample (Sample=true)', () => {
  const q = new FakeBuilder()
  buildExamSetFacetQuery(q, { typeFilter: 'Sample' })
  assert.deepEqual(q.calls, [{ method: 'eq', column: 'is_sample', value: true }])
})

test('buildExamSetFacetQuery: Type=Full maps to is_sample=false', () => {
  const q = new FakeBuilder()
  buildExamSetFacetQuery(q, { typeFilter: 'Full' })
  assert.deepEqual(q.calls, [{ method: 'eq', column: 'is_sample', value: false }])
})

test('buildExamSetFacetQuery: applies all three filters together', () => {
  const q = new FakeBuilder()
  buildExamSetFacetQuery(q, {
    search: 'bar',
    packageFilter: 'pkg-9',
    typeFilter: 'Full',
  })
  assert.deepEqual(q.calls, [
    { method: 'ilike', column: 'name', value: '%bar%' },
    { method: 'eq', column: 'package_id', value: 'pkg-9' },
    { method: 'eq', column: 'is_sample', value: false },
  ])
})

test('buildExamSetFacetQuery: never adds a status predicate', () => {
  const q = new FakeBuilder()
  buildExamSetFacetQuery(q, { search: 'x', packageFilter: 'p', typeFilter: 'Sample' })
  assert.equal(q.calls.some((c) => c.column === 'status'), false)
})

test('buildExamSetFacetQuery: never adds pagination/ordering (only ilike/eq)', () => {
  const q = new FakeBuilder()
  buildExamSetFacetQuery(q, { search: 'x', packageFilter: 'p', typeFilter: 'Sample' })
  for (const c of q.calls) {
    assert.ok(c.method === 'ilike' || c.method === 'eq')
  }
})

test('buildExamSetFacetQuery: "All" sentinel skips package and type', () => {
  const q = new FakeBuilder()
  buildExamSetFacetQuery(q, { packageFilter: 'All', typeFilter: 'All' })
  assert.equal(q.calls.length, 0)
})

// ─── aggregateFacetCounts ────────────────────────────────────────────────────
function ok(count: number): CountResult {
  return { count, error: null }
}
function err(): CountResult {
  return { count: null, error: { message: 'boom' } }
}

test('aggregateFacetCounts: all success → sums to all', () => {
  const r = aggregateFacetCounts(ok(5), ok(12), ok(3))
  assert.equal(r.ok, true)
  if (r.ok) {
    assert.deepEqual(r.counts, { draft: 5, published: 12, archived: 3, all: 20 })
  }
})

test('aggregateFacetCounts: null count on success is treated as 0', () => {
  const r = aggregateFacetCounts({ count: null, error: null }, ok(2), ok(3))
  assert.equal(r.ok, true)
  if (r.ok) assert.equal(r.counts.all, 5)
})

test('aggregateFacetCounts: draft error → not silently zeroed', () => {
  const r = aggregateFacetCounts(err(), ok(2), ok(3))
  assert.equal(r.ok, false)
  if (!r.ok) assert.match(r.error, /status counts/i)
})

test('aggregateFacetCounts: published error → not silently zeroed', () => {
  const r = aggregateFacetCounts(ok(1), err(), ok(3))
  assert.equal(r.ok, false)
})

test('aggregateFacetCounts: archived error → not silently zeroed', () => {
  const r = aggregateFacetCounts(ok(1), ok(2), err())
  assert.equal(r.ok, false)
})

test('aggregateFacetCounts: error never leaks raw DB message', () => {
  const r = aggregateFacetCounts(err(), ok(0), ok(0))
  assert.equal(r.ok, false)
  if (!r.ok) assert.equal(r.error.includes('boom'), false)
})

test('aggregateFacetCounts: zero across all statuses → all = 0', () => {
  const r = aggregateFacetCounts(ok(0), ok(0), ok(0))
  assert.equal(r.ok, true)
  if (r.ok) assert.equal(r.counts.all, 0)
})
