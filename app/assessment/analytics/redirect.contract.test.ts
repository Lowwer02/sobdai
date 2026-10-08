import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import test from 'node:test'

/**
 * app/assessment/analytics/redirect.contract.test.ts
 *
 * Learning Analytics UX V1 (merge): /assessment/analytics is a permanent
 * redirect stub to /exams. Pins:
 *  - the stub redirects authenticated users to /exams (and guests to /login)
 *  - the retired analytics/recommendations rendering is gone from the stub
 *  - app/assessment/actions.ts STILL exports fetchMyAnalytics and
 *    fetchMyRecommendations (RecommendedActions depends on them)
 */

const root = process.cwd()
const read = (path: string) => readFileSync(join(root, path), 'utf8')

const stub = read('app/assessment/analytics/page.tsx')
const actions = read('app/assessment/actions.ts')

test('analytics page is a redirect stub to /exams with a login gate', () => {
  assert.match(stub, /redirect\('\/exams'\)/)
  assert.match(stub, /redirect\('\/login'\)/)
  assert.match(stub, /supabase\.auth\.getUser\(\)/)
})

test('analytics page no longer renders analytics/recommendations content', () => {
  assert.doesNotMatch(stub, /fetchMyAnalytics/)
  assert.doesNotMatch(stub, /fetchMyRecommendations/)
  assert.doesNotMatch(stub, /ผลการเรียนของฉัน[\s\S]*คะแนนเฉลี่ย/)
})

test('analytics page keeps its noindex metadata', () => {
  assert.match(stub, /noindex:\s*true/)
})

test('actions.ts still exports fetchMyAnalytics and fetchMyRecommendations', () => {
  assert.match(actions, /export async function fetchMyAnalytics/)
  assert.match(actions, /export async function fetchMyRecommendations/)
})
