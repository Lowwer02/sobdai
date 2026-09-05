/**
 * supabase/migrations/migrations.question-document-code.test.ts
 * ----------------------------------------------------------------------------
 * Migration integrity test for 090 (questions.document_code — Document Code
 * Intake V1).
 *
 * These tests do NOT execute the SQL (no Postgres in unit-test scope). They
 * parse the migration file as text and verify the normative invariants:
 *   - exactly the ONE nullable column is added, re-runnably (IF NOT EXISTS)
 *   - no NOT NULL (legacy rows stay valid with NULL)
 *   - no FK / REFERENCES, no new table, no alias table, no Document Registry
 *   - no backfill (legacy Question rows are never mutated)
 *   - additive-only, reversible, lock_timeout bounded
 *
 * RUN: npx jiti supabase/migrations/migrations.question-document-code.test.ts
 */

import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const M090 = readFileSync(join(__dirname, '090_question_document_code.sql'), 'utf8')

/** SQL with comment lines stripped, so assertions see executable text only. */
function executableSql(source: string): string {
  return source
    .split('\n')
    .filter((line) => !line.trimStart().startsWith('--'))
    .join('\n')
}

function verifies_m090_adds_exactly_one_nullable_column(): void {
  assert.match(
    M090,
    /ADD\s+COLUMN\s+IF\s+NOT\s+EXISTS\s+document_code\s+text\b/i,
    'migration 090 must declare document_code as nullable text via IF NOT EXISTS'
  )
  // Exactly one ADD COLUMN — ONE nullable column only.
  const addColumnCount = (M090.match(/ADD\s+COLUMN/gi) || []).length
  assert.equal(addColumnCount, 1, `expected exactly 1 ADD COLUMN, got ${addColumnCount}`)
}

function verifies_m090_does_not_add_not_null(): void {
  const exec = executableSql(M090)
  assert.doesNotMatch(
    exec,
    /document_code\s+text\s+NOT\s+NULL/i,
    'document_code must stay nullable — legacy rows remain valid with NULL'
  )
  assert.doesNotMatch(
    exec,
    /SET\s+NOT\s+NULL/i,
    'migration must not tighten the column to NOT NULL'
  )
}

function verifies_m090_has_no_fk_or_registry(): void {
  const exec = executableSql(M090)
  assert.doesNotMatch(exec, /\bREFERENCES\b/i, 'no FK in Document Code Intake V1')
  assert.doesNotMatch(exec, /\bCREATE\s+TABLE\b/i, 'no documents/aliases/registry table in V1')
  assert.doesNotMatch(exec, /\bCREATE\s+FUNCTION\b/i, 'no new functions in V1')
}

function verifies_m090_has_no_backfill(): void {
  const exec = executableSql(M090)
  assert.doesNotMatch(
    exec,
    /\bUPDATE\s+public\.questions\b/i,
    'no legacy backfill — existing Question rows must not be mutated'
  )
  assert.doesNotMatch(exec, /\bINSERT\s+INTO\b/i, 'no data inserts in V1')
}

function verifies_m090_is_additive_and_rerunnable(): void {
  assert.doesNotMatch(
    executableSql(M090),
    /\bDROP\s+COLUMN\b/i,
    'up path must not drop columns (DROP only documented as the reverse migration)'
  )
  assert.match(M090, /lock_timeout/i, 'lock_timeout must be bounded like sibling migrations')
  assert.match(
    M090,
    /DROP\s+COLUMN\s+IF\s+EXISTS\s+document_code/,
    'the reverse migration (DROP COLUMN) must be documented'
  )
}

// ─── runner ─────────────────────────────────────────────────────────────────

const tests: Array<{ name: string; fn: () => void }> = [
  { name: 'm090: adds exactly one nullable text column (IF NOT EXISTS)', fn: verifies_m090_adds_exactly_one_nullable_column },
  { name: 'm090: no NOT NULL — legacy rows stay valid with NULL', fn: verifies_m090_does_not_add_not_null },
  { name: 'm090: no FK, no registry/alias table, no functions', fn: verifies_m090_has_no_fk_or_registry },
  { name: 'm090: no backfill — legacy questions untouched', fn: verifies_m090_has_no_backfill },
  { name: 'm090: additive, re-runnable, reversible, lock_timeout bounded', fn: verifies_m090_is_additive_and_rerunnable },
]

let passed = 0
let failed = 0
for (const t of tests) {
  try {
    t.fn()
    console.log(`  ✓ ${t.name}`)
    passed++
  } catch (e) {
    console.error(`  ✗ ${t.name}`)
    console.error(`    ${(e as Error).message}`)
    failed++
  }
}

console.log(`\n${passed}/${tests.length} passed, ${failed} failed`)
if (failed > 0) {
  process.exit(1)
}
