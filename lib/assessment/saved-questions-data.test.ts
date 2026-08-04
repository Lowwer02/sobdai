/**
 * lib/assessment/saved-questions-data.test.ts
 * ----------------------------------------------------------------------------
 * Pure-helper tests for the Saved Questions data layer (Phase 1F).
 *
 * These tests exercise ONLY the side-effect-free helpers (input validation,
 * bookmark-state mapping, preview building, the dashboard limit constant) so
 * they run in Node with NO Supabase / next/headers. Mirrors the style of the
 * project's existing node:test suites.
 */

import assert from 'node:assert/strict'
import test from 'node:test'
import {
  buildQuestionPreview,
  cleanId,
  looksLikeUuid,
  mapBookmarkState,
  SAVED_QUESTIONS_DASHBOARD_LIMIT,
} from './saved-questions-data'

// ─── Input validation ────────────────────────────────────────────────────────

test('cleanId trims strings and rejects non-strings', () => {
  assert.equal(cleanId('  abc  '), 'abc')
  assert.equal(cleanId(''), '')
  assert.equal(cleanId(undefined), '')
  assert.equal(cleanId(null), '')
  assert.equal(cleanId(123), '')
  assert.equal(cleanId({ x: 1 }), '')
  assert.equal(cleanId(['a']), '')
})

test('looksLikeUuid accepts v4-shaped ids and rejects garbage', () => {
  assert.ok(looksLikeUuid('11111111-2222-3333-4444-555555555555'))
  assert.ok(looksLikeUuid('aB1cD2eF-1234-5678-9aBC-dE0F12345678'))
  assert.ok(!looksLikeUuid(''))
  assert.ok(!looksLikeUuid('not-a-uuid'))
  assert.ok(!looksLikeUuid('11111111-2222-3333-4444')) // too short
  assert.ok(!looksLikeUuid('111111112222333344445555555555555')) // no dashes
})

// ─── Bookmark-state mapping ─────────────────────────────────────────────────

test('mapBookmarkState defaults every displayed question to not-bookmarked', () => {
  const ids = ['q1', 'q2', 'q3']
  const state = mapBookmarkState([], ids)
  assert.equal(Object.keys(state).length, 3)
  for (const id of ids) {
    assert.equal(state[id].isBookmarked, false)
    assert.equal(state[id].bookmarkId, null)
    assert.equal(state[id].questionId, id)
  }
})

test('mapBookmarkState marks bookmarked questions with their bookmark id', () => {
  const ids = ['q1', 'q2', 'q3']
  const rows = [{ id: 'b1', question_id: 'q2' }]
  const state = mapBookmarkState(rows, ids)
  assert.equal(state.q1.isBookmarked, false)
  assert.equal(state.q2.isBookmarked, true)
  assert.equal(state.q2.bookmarkId, 'b1')
  assert.equal(state.q3.isBookmarked, false)
})

test('mapBookmarkState skips rows for questions not in the display set', () => {
  // A row for q4 (not displayed) must not pollute the map.
  const rows = [{ id: 'bx', question_id: 'q4' }]
  const state = mapBookmarkState(rows, ['q1', 'q2'])
  assert.equal(state.q4, undefined)
  assert.equal(Object.keys(state).length, 2)
})

test('mapBookmarkState is resilient to malformed rows (untrusted storage)', () => {
  const rows = [
    null,
    'string',
    42,
    [],
    {},
    { id: 'b1' }, // missing question_id
    { question_id: 'q1' }, // missing id
    { id: '  ', question_id: 'q1' },
    { id: 'b2', question_id: '  ' },
    { id: 'b3', question_id: 'q2' }, // valid
  ]
  const state = mapBookmarkState(rows, ['q1', 'q2'])
  assert.equal(state.q1.isBookmarked, false) // malformed rows for q1 skipped
  assert.equal(state.q2.isBookmarked, true)
  assert.equal(state.q2.bookmarkId, 'b3')
})

test('mapBookmarkState handles non-array input safely', () => {
  const state = mapBookmarkState(undefined, ['q1'])
  assert.equal(state.q1.isBookmarked, false)
  assert.doesNotThrow(() => mapBookmarkState(null, ['q1']))
  assert.doesNotThrow(() => mapBookmarkState({}, ['q1']))
})

test('mapBookmarkState returns empty map for no question ids', () => {
  const state = mapBookmarkState([{ id: 'b1', question_id: 'q1' }], [])
  assert.equal(Object.keys(state).length, 0)
})

// ─── Question preview building ───────────────────────────────────────────────

test('buildQuestionPreview collapses whitespace and trims', () => {
  assert.equal(
    buildQuestionPreview('  สวัสดี\n\nครับ   ทุกคน  '),
    'สวัสดี ครับ ทุกคน',
  )
})

test('buildQuestionPreview truncates with an ellipsis past the limit', () => {
  const long = 'x'.repeat(120)
  const out = buildQuestionPreview(long, 10)
  assert.equal(out.length, 11) // 10 chars + ellipsis
  assert.ok(out.endsWith('…'))
})

test('buildQuestionPreview does not truncate at or under the limit', () => {
  assert.equal(buildQuestionPreview('short', 10), 'short')
  assert.equal(buildQuestionPreview('exactly10!', 10), 'exactly10!')
})

test('buildQuestionPreview handles null / empty / non-string', () => {
  assert.equal(buildQuestionPreview(null), '')
  assert.equal(buildQuestionPreview(undefined), '')
  assert.equal(buildQuestionPreview(''), '')
  assert.equal(buildQuestionPreview('   '), '')
  // The function is defensive against non-string input; exercise it via an
  // unknown-typed value (the runtime guard returns '' for any non-string).
  assert.equal(buildQuestionPreview(123 as unknown as string), '')
})

test('buildQuestionPreview clamps a nonsensical max to >= 1', () => {
  // max <= 0 is clamped to 1, so a 1-char slice + ellipsis is returned.
  const out = buildQuestionPreview('hello world', 0)
  assert.equal(out, 'h…')
})

// ─── Dashboard limit ─────────────────────────────────────────────────────────

test('SAVED_QUESTIONS_DASHBOARD_LIMIT is exactly 6', () => {
  assert.equal(SAVED_QUESTIONS_DASHBOARD_LIMIT, 6)
})
