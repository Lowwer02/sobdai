/**
 * UI contract tests for the shared entity chip row (Entity Discovery V1).
 *
 * Static source-text assertions: the row is a server-rendered Next.js Link
 * list with flex-wrap (no horizontal scroll), a hard cap of 3 visible links,
 * deterministic rendering (input order), accessible focus states, and Thai
 * long-name wrapping instead of truncation.
 *
 * Run with:
 *   node --test components/entities/EntityChipRow.ui-contract.test.ts
 */

import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import test from 'node:test'

const dir = dirname(fileURLToPath(import.meta.url))
const source = readFileSync(join(dir, 'EntityChipRow.tsx'), 'utf8')

test('the chip row renders real server-side Links, not JS-only navigation', () => {
  assert.doesNotMatch(source, /^['"]use client['"]/m)
  assert.match(source, /import Link from 'next\/link'/)
  assert.match(source, /<Link[\s\S]*?href=\{item\.href\}/)
  assert.doesNotMatch(source, /rel="nofollow"|rel=\{'nofollow'\}/)
  assert.doesNotMatch(source, /onClick|router\./)
})

test('visible links are hard-capped at three and render in input order', () => {
  assert.match(source, /export const MAX_DISCOVERY_ENTITY_LINKS = 3/)
  assert.match(source, /items\.slice\(0, MAX_DISCOVERY_ENTITY_LINKS\)/)
  assert.match(source, /visible\.map\(\(item\) =>/)
  assert.match(source, /if \(visible\.length === 0\) return null/)
})

test('chips wrap instead of scrolling or truncating long Thai names', () => {
  assert.match(source, /flex-wrap/)
  assert.doesNotMatch(source, /overflow-x|overflow-x-auto|whitespace-nowrap|truncate/)
  assert.match(source, /break-words/)
  assert.match(source, /\[overflow-wrap:anywhere\]/)
})

test('chips keep an accessible focus state', () => {
  assert.match(source, /focus:outline-none focus:ring-2 focus:ring-brand/)
})

test('the row stays a small single-purpose component', () => {
  assert.doesNotMatch(source, /supabase|createClient|fetch\(/)
  assert.doesNotMatch(source, /useState|useEffect/)
})
