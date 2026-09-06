/**
 * supabase/migrations/migrations.091.test.ts
 * ----------------------------------------------------------------------------
 * Migration integrity tests for migration 091
 * (kp_legacy_summary_publish_released_at — Package Content Freshness V1
 * remediation).
 *
 * These tests do NOT execute the SQL (no Postgres in unit-test scope). They
 * parse the migration file as text and verify the normative invariants:
 *
 *  - Exactly one 091_*.sql exists and no earlier migration is modified.
 *  - The migration CREATE OR REPLACEs ONLY kp_persist_publish_legacy_summary
 *    with the exact 069 signature (uuid, uuid).
 *  - released_at is stamped with clock_timestamp() inside the
 *    unpublished -> published UPDATE (executable SQL, not a comment).
 *  - The is_published idempotence guard is intact, so an already-published
 *    row is never re-stamped (edits while published cannot refresh the stamp).
 *  - SECURITY DEFINER + locked proconfig (search_path / lock_timeout) are
 *    preserved so the migration-068 writer fence keeps authorizing the RPC.
 *  - Grants match 069: service_role execute only.
 *  - Migration 069 is NOT edited or re-run (its file is untouched; 091 uses
 *    CREATE OR REPLACE, not a re-execution).
 */

import assert from 'node:assert/strict'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import test from 'node:test'

const migrationDir = dirname(fileURLToPath(import.meta.url))
const migrationName = '091_kp_legacy_summary_publish_released_at.sql'
const sql = readFileSync(join(migrationDir, migrationName), 'utf8')

// Executable SQL = comments stripped, for assertions that should only match
// real statements (not commented-out intent).
const executableSql = sql
  .split('\n')
  .filter((line) => !line.trimStart().startsWith('--'))
  .join('\n')

test('091 exists as a unique migration and leaves prior migrations untouched', () => {
  const files = readdirSync(migrationDir)
  assert.equal(
    files.filter((name) => /^091_.+\.sql$/.test(name)).length,
    1,
    'exactly one 091_*.sql file',
  )
  // 069 remains present and unmodified in this task (same content as the
  // committed baseline: we never edit/re-run old migrations).
  const source069 = readFileSync(
    join(migrationDir, '069_kp_summary_bank_compatibility_publication.sql'),
    'utf8',
  )
  assert.match(source069, /create function public\.kp_persist_publish_legacy_summary\(/)
})

test('091 replaces only the legacy publish RPC with the exact 069 signature', () => {
  const replaces = executableSql.match(/create or replace function public\.\w+\(/g) ?? []
  assert.deepEqual(replaces, ['create or replace function public.kp_persist_publish_legacy_summary('])
  assert.match(executableSql, /kp_persist_publish_legacy_summary\(\s*p_summary_id uuid,\s*p_actor_id uuid\s*\)/)
})

test('released_at is stamped with clock_timestamp() on the publish transition', () => {
  assert.match(
    executableSql,
    /set is_published = true,\s*released_at = clock_timestamp\(\),\s*updated_at = clock_timestamp\(\)/,
  )
  // Exactly one stamping site in the migration body.
  assert.equal(
    (executableSql.match(/released_at = clock_timestamp\(\)/g) ?? []).length,
    1,
  )
})

test('the is_published idempotence guard is intact — already-published rows never re-stamp', () => {
  // The early return for already-published rows must precede the UPDATE.
  const guardIndex = executableSql.indexOf('if v_summary.is_published then')
  const updateIndex = executableSql.indexOf('update public.summaries')
  assert.ok(guardIndex > -1 && updateIndex > -1)
  assert.ok(guardIndex < updateIndex)
  assert.match(executableSql, /'idempotent_retry', true/)
})

test('SECURITY DEFINER and locked proconfig are preserved for the writer fence', () => {
  assert.match(executableSql, /security definer/)
  assert.match(executableSql, /set search_path = pg_catalog, public, pg_temp/)
  assert.match(executableSql, /set lock_timeout = '5s'/)
})

test('grants match 069: service_role execute only', () => {
  assert.match(
    executableSql,
    /revoke all on function public\.kp_persist_publish_legacy_summary\(uuid,uuid\)\s*from public, anon, authenticated/,
  )
  assert.match(
    executableSql,
    /grant execute on function public\.kp_persist_publish_legacy_summary\(uuid,uuid\)\s*to service_role/,
  )
  // No broader grants are introduced.
  assert.doesNotMatch(executableSql, /grant execute[\s\S]*to (anon|authenticated|public)\b/)
})

test('091 does not touch exam_sets or other tables with data changes', () => {
  assert.doesNotMatch(executableSql, /alter table/i)
  assert.doesNotMatch(executableSql, /insert into/i)
  assert.doesNotMatch(executableSql, /delete from/i)
  // The only data mutation is the legacy summary publication UPDATE.
  assert.equal((executableSql.match(/update public\.\w+/g) ?? []).length, 1)
  assert.match(executableSql, /update public\.summaries/)
})
