/**
 * app/admin/exam-sets/status-filter.test.ts
 * ----------------------------------------------------------------------------
 * Unit tests for the Status filter URL-parameter validation helper.
 *
 * Pure module: imports only from ./status-filter (no React, no Supabase, no
 * browser). Covers the validation cases that are unit-testable without the
 * running app — the behavioral/integration checks (filter combos, pagination
 * reset, Back/Forward, mobile, invalid URL not crashing the page) are covered
 * by Browser QA, since the page has no component-test harness.
 *
 * RUN: npx jiti app/admin/exam-sets/status-filter.test.ts
 *
 * Coverage targets:
 *  - no `status` param → 'all'
 *  - draft / published / archived → themselves
 *  - unknown token (e.g. 'random') → 'all' (no throw)
 *  - empty string → 'all'
 *  - array value → 'all' (never flows to the query)
 */

import assert from 'node:assert/strict'
import test from 'node:test'

import {
  parseStatusParam,
  EXAM_SET_STATUS_VALUES,
} from './status-filter'

test('no status param (undefined) falls back to all', () => {
  assert.equal(parseStatusParam(undefined), 'all')
})

test('status=draft parses to draft', () => {
  assert.equal(parseStatusParam('draft'), 'draft')
})

test('status=published parses to published', () => {
  assert.equal(parseStatusParam('published'), 'published')
})

test('status=archived parses to archived', () => {
  assert.equal(parseStatusParam('archived'), 'archived')
})

test('unknown status token falls back to all without throwing', () => {
  assert.equal(parseStatusParam('random'), 'all')
  assert.equal(parseStatusParam('Published'), 'all') // case-sensitive
  assert.equal(parseStatusParam('DRAFT'), 'all')
})

test('empty string falls back to all', () => {
  assert.equal(parseStatusParam(''), 'all')
})

test('array value falls back to all (never reaches the query)', () => {
  assert.equal(parseStatusParam(['draft']), 'all')
  assert.equal(parseStatusParam(['draft', 'published']), 'all')
  assert.equal(parseStatusParam([]), 'all')
})

test('every exported status value round-trips through parseStatusParam', () => {
  for (const s of EXAM_SET_STATUS_VALUES) {
    assert.equal(parseStatusParam(s), s)
  }
})
