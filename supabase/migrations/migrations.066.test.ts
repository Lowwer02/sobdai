/**
 * supabase/migrations/migrations.066.test.ts
 * ----------------------------------------------------------------------------
 * Migration integrity tests for migration 066 (assessment_question_bookmarks).
 *
 * These tests do NOT execute the SQL (no Postgres in unit-test scope). They
 * parse the migration file as text and verify the normative invariants for
 * Phase 1F (Saved Questions), mirroring the style of migrations.062.test.ts.
 *
 * Verified here:
 *  - Exactly one 066_*.sql exists; it is the highest-numbered assessment
 *    migration and does not collide with any other prefix.
 *  - The assessment_question_bookmarks table has the required columns.
 *  - The UNIQUE index enforces one bookmark per (user_id, question_id, exam_set_id).
 *  - Foreign keys reference the right tables with cascade / set null behavior.
 *  - RLS is enabled; SELECT/INSERT/DELETE policies exist for authenticated;
 *    NO update policy (bookmarks are never edited).
 *  - updated_at trigger reuses the shared handle_updated_at() fn.
 *  - The schema-reload NOTIFY is present.
 *  - Scope exclusions: no edits to questions, exam_attempts, exam_sets,
 *    assessment_sessions, or any Knowledge Platform object.
 */

import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import test from 'node:test'

const migrationDir = dirname(fileURLToPath(import.meta.url))
const migrationName = '066_assessment_question_bookmarks.sql'
const sql = readFileSync(join(migrationDir, migrationName), 'utf8')

// Executable SQL = comments stripped, for assertions that should only match
// real statements (not commented-out intent).
const executableSql = sql
  .split('\n')
  .filter((line) => !line.trimStart().startsWith('--'))
  .join('\n')

test('066 exists as a unique migration and does not collide', () => {
  const files = readdirSync(migrationDir)
  assert.equal(
    files.filter((name) => /^066_.+\.sql$/.test(name)).length,
    1,
    'exactly one 066_*.sql file',
  )
  // Pre-existing assessment + storage migrations remain untouched/present.
  for (const existing of ['062_assessment_sessions.sql', '065_article_storage.sql']) {
    assert.ok(files.includes(existing), `${existing} still present`)
  }
})

test('creates the assessment_question_bookmarks table with the required columns', () => {
  assert.match(executableSql, /create table if not exists public\.assessment_question_bookmarks/i)
  for (const col of [
    'id',
    'user_id',
    'question_id',
    'exam_set_id',
    'package_id',
    'source_attempt_id',
    'created_at',
    'updated_at',
  ]) {
    assert.match(executableSql, new RegExp(`\\b${col}\\b`), `column ${col} present`)
  }
})

test('foreign keys reference the right tables with cascade / set null behavior', () => {
  // user / question / exam_set / package cascade (their deletion removes the bookmark).
  assert.match(executableSql, /user_id\s+uuid not null references auth\.users\(id\) on delete cascade/i)
  assert.match(executableSql, /question_id\s+uuid not null references public\.questions\(id\) on delete cascade/i)
  assert.match(executableSql, /exam_set_id\s+uuid not null references public\.exam_sets\(id\) on delete cascade/i)
  assert.match(executableSql, /package_id\s+uuid not null references public\.packages\(id\) on delete cascade/i)
  // source_attempt_id is nullable and SET NULL on delete (never cascade) so the
  // bookmark outlives the attempt that produced it.
  assert.match(
    executableSql,
    /source_attempt_id\s+uuid\s+references public\.exam_attempts\(id\) on delete set null/i,
  )
})

test('unique index enforces one bookmark per user/question/exam_set', () => {
  assert.match(
    executableSql,
    /create unique index if not exists assessment_question_bookmarks_unique_idx\s+on public\.assessment_question_bookmarks \(user_id, question_id, exam_set_id\)/i,
  )
})

test('has a newest-first user lookup index for the dashboard', () => {
  assert.match(
    executableSql,
    /create index if not exists assessment_question_bookmarks_user_created_idx\s+on public\.assessment_question_bookmarks \(user_id, created_at desc, id\)/i,
  )
})

test('has a per-(user, exam_set) lookup index for the review page', () => {
  assert.match(
    executableSql,
    /create index if not exists assessment_question_bookmarks_user_examset_idx\s+on public\.assessment_question_bookmarks \(user_id, exam_set_id\)/i,
  )
})

test('enables RLS with owner-only SELECT/INSERT/DELETE and NO update policy', () => {
  assert.match(executableSql, /alter table public\.assessment_question_bookmarks enable row level security/i)
  // Three owner-scoped policies to authenticated, all keyed on auth.uid() = user_id.
  assert.match(executableSql, /for select[\s\S]+?to authenticated[\s\S]+?using \(auth\.uid\(\) = user_id\)/i)
  assert.match(executableSql, /for insert[\s\S]+?to authenticated[\s\S]+?with check \(auth\.uid\(\) = user_id\)/i)
  assert.match(executableSql, /for delete[\s\S]+?to authenticated[\s\S]+?using \(auth\.uid\(\) = user_id\)/i)
  // Explicitly NO update policy for authenticated (bookmarks are never edited).
  assert.doesNotMatch(executableSql, /for update[\s\S]+?to authenticated/i)
})

test('reuses the shared handle_updated_at trigger fn', () => {
  assert.match(
    executableSql,
    /create trigger handle_updated_at_assessment_question_bookmarks\s+before update on public\.assessment_question_bookmarks\s+for each row execute procedure public\.handle_updated_at\(\)/i,
  )
})

test('notifies PostgREST to reload schema', () => {
  assert.match(executableSql, /notify pgrst, 'reload schema'/i)
})

test('does not touch questions, exam_attempts, assessment_sessions, or Knowledge Platform tables', () => {
  // No ALTER on the question / outcome / session tables — they stay untouched.
  assert.doesNotMatch(executableSql, /alter table public\.questions\b/i)
  assert.doesNotMatch(executableSql, /alter table public\.exam_attempts\b/i)
  assert.doesNotMatch(executableSql, /alter table public\.exam_sets\b/i)
  assert.doesNotMatch(executableSql, /alter table public\.assessment_sessions\b/i)
  // No service-role usage in this migration.
  assert.doesNotMatch(executableSql, /service_role/i)
  // No Knowledge Platform object is altered.
  for (const kp of ['summaries', 'summary_versions', 'package_summaries', 'reference_documents']) {
    assert.doesNotMatch(executableSql, new RegExp(`alter table public\\.${kp}\\b`, 'i'))
  }
})
