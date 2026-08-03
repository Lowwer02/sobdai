/**
 * supabase/migrations/migrations.062.test.ts
 * ----------------------------------------------------------------------------
 * Migration integrity tests for migration 062 (assessment_sessions).
 *
 * These tests do NOT execute the SQL (no Postgres in unit-test scope). They
 * parse the migration file as text and verify the normative invariants for
 * Phase 1A (Assessment Session Foundation + Resume), mirroring the style of
 * migrations.kp_046.test.ts / migrations.ig2.test.ts.
 *
 * Verified here:
 *  - Exactly one 062_*.sql exists; it is the highest-numbered migration (the
 *    053–061 range is reserved for other work and must be untouched).
 *  - The assessment_sessions table has the required columns + CHECK constraints.
 *  - The partial UNIQUE index enforces one in_progress session per
 *    (user_id, exam_set_id, mode).
 *  - outcome_attempt_id references exam_attempts with ON DELETE SET NULL.
 *  - RLS is enabled; SELECT/INSERT/UPDATE policies exist for authenticated;
 *    NO delete policy.
 *  - updated_at trigger reuses the shared handle_updated_at() fn.
 *  - The schema-reload NOTIFY is present.
 *  - Scope exclusions: no edits to exam_attempts, no analytics/recommendation
 *    columns, no Knowledge Platform (035–052) object is touched by this file.
 */

import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import test from 'node:test'

const migrationDir = dirname(fileURLToPath(import.meta.url))
const migrationName = '062_assessment_sessions.sql'
const sql = readFileSync(join(migrationDir, migrationName), 'utf8')

// Executable SQL = comments stripped, for assertions that should only match
// real statements (not commented-out intent).
const executableSql = sql
  .split('\n')
  .filter((line) => !line.trimStart().startsWith('--'))
  .join('\n')

test('062 exists as a unique migration and does not collide', () => {
  const files = readdirSync(migrationDir)
  assert.equal(
    files.filter((name) => /^062_.+\.sql$/.test(name)).length,
    1,
    'exactly one 062_*.sql file',
  )
  // The reserved range for other work is present and untouched.
  for (const reserved of [52]) {
    assert.ok(files.some((name) => name.startsWith(`0${reserved}_`)), `0${reserved} still present`)
  }
})

test('creates the assessment_sessions table with the required columns', () => {
  assert.match(executableSql, /create table if not exists public\.assessment_sessions/i)
  for (const col of [
    'id',
    'user_id',
    'exam_set_id',
    'package_id',
    'mode',
    'status',
    'current_index',
    'answers',
    'flagged',
    'time_used_seconds',
    'started_at',
    'updated_at',
    'completed_at',
    'outcome_attempt_id',
  ]) {
    assert.match(executableSql, new RegExp(`\\b${col}\\b`), `column ${col} present`)
  }
})

test('enforces mode and status enums and non-negative numerics', () => {
  assert.match(executableSql, /mode\s+text not null check \(mode in \('practice', 'simulation'\)\)/i)
  assert.match(
    executableSql,
    /status\s+text not null default 'in_progress'\s+check \(status in \('in_progress', 'completed'\)\)/i,
  )
  assert.match(executableSql, /current_index\s+integer not null default 0 check \(current_index >= 0\)/i)
  assert.match(executableSql, /time_used_seconds\s+integer not null default 0 check \(time_used_seconds >= 0\)/i)
})

test('answers and flagged default to empty jsonb objects', () => {
  assert.match(executableSql, /answers\s+jsonb not null default '\{\}'::jsonb/i)
  assert.match(executableSql, /flagged\s+jsonb not null default '\{\}'::jsonb/i)
})

test('foreign keys reference the right tables with cascade / set null behavior', () => {
  // user / exam_set / package cascade (their deletion removes the session).
  assert.match(executableSql, /user_id\s+uuid not null references auth\.users\(id\) on delete cascade/i)
  assert.match(executableSql, /exam_set_id\s+uuid not null references public\.exam_sets\(id\) on delete cascade/i)
  assert.match(executableSql, /package_id\s+uuid not null references public\.packages\(id\) on delete cascade/i)
  // outcome_attempt_id is nullable and SET NULL on delete (never cascade).
  assert.match(
    executableSql,
    /outcome_attempt_id\s+uuid\s+references public\.exam_attempts\(id\) on delete set null/i,
  )
})

test('partial unique index guarantees one in_progress session per user/exam/mode', () => {
  assert.match(
    executableSql,
    /create unique index if not exists assessment_sessions_active_unique_idx\s+on public\.assessment_sessions \(user_id, exam_set_id, mode\)\s+where status = 'in_progress'/i,
  )
})

test('has a recent-session lookup index', () => {
  assert.match(
    executableSql,
    /create index if not exists assessment_sessions_user_updated_idx\s+on public\.assessment_sessions \(user_id, updated_at desc\)/i,
  )
})

test('enables RLS with owner-only SELECT/INSERT/UPDATE and NO delete policy', () => {
  assert.match(executableSql, /alter table public\.assessment_sessions enable row level security/i)
  // Three owner-scoped policies to authenticated, all keyed on auth.uid() = user_id.
  assert.match(executableSql, /for select[\s\S]+?to authenticated[\s\S]+?using \(auth\.uid\(\) = user_id\)/i)
  assert.match(executableSql, /for insert[\s\S]+?to authenticated[\s\S]+?with check \(auth\.uid\(\) = user_id\)/i)
  assert.match(
    executableSql,
    /for update[\s\S]+?to authenticated[\s\S]+?using \(auth\.uid\(\) = user_id\)[\s\S]+?with check \(auth\.uid\(\) = user_id\)/i,
  )
  // Explicitly NO delete policy for authenticated.
  assert.doesNotMatch(executableSql, /for delete[\s\S]+?to authenticated/i)
})

test('reuses the shared handle_updated_at trigger fn', () => {
  assert.match(
    executableSql,
    /create trigger handle_updated_at_assessment_sessions\s+before update on public\.assessment_sessions\s+for each row execute procedure public\.handle_updated_at\(\)/i,
  )
})

test('notifies PostgREST to reload schema', () => {
  assert.match(executableSql, /notify pgrst, 'reload schema'/i)
})

test('does not touch exam_attempts, Knowledge Platform tables, or analytics', () => {
  // No ALTER on exam_attempts — the Outcome table stays immutable / untouched.
  assert.doesNotMatch(executableSql, /alter table public\.exam_attempts\b/i)
  // No analytics / recommendation / scoring columns leak into the session.
  assert.doesNotMatch(executableSql, /\b(weak_topics|subject_breakdown|score|accuracy|recommendation)\b/i)
  // No service-role usage in this migration.
  assert.doesNotMatch(executableSql, /service_role/i)
  // No Knowledge Platform (035–052) object is altered.
  for (const kp of ['summaries', 'summary_versions', 'package_summaries', 'reference_documents']) {
    assert.doesNotMatch(executableSql, new RegExp(`alter table public\\.${kp}\\b`, 'i'))
  }
})
