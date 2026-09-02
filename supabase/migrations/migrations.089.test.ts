/**
 * Static contract tests for Daily Retention Phase 1 (089).
 *
 * These checks intentionally do not connect to Production. They protect the
 * migration's state-only, authenticated-RPC, server-authoritative contract.
 * Run with:
 *   node --experimental-strip-types supabase/migrations/migrations.089.test.ts
 */

import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import test from 'node:test'

const migrationDir = dirname(fileURLToPath(import.meta.url))
const migrationName = '089_daily_retention_phase1.sql'
const migration = readFileSync(join(migrationDir, migrationName), 'utf8')
const executableSql = migration
  .split('\n')
  .filter((line) => !line.trimStart().startsWith('--'))
  .join('\n')

function functionBlock(name: string): string {
  const start = executableSql.search(new RegExp(`create\\s+or\\s+replace\\s+function\\s+public\\.${name}\\s*\\(`, 'i'))
  assert.notEqual(start, -1, `function ${name} exists`)
  const rest = executableSql.slice(start)
  const next = rest.search(/\ncreate\s+(?:or\s+replace\s+)?function\s+public\./i)
  return next === -1 ? rest : rest.slice(0, next)
}

test('089 is the unique next migration and verification companion exists', () => {
  const files = readdirSync(migrationDir)
  assert.equal(files.filter((name) => /^089_.+\.sql$/.test(name)).length, 1)
  assert.equal(files.includes('089_daily_retention_phase1.sql'), true)
  assert.equal(
    readFileSync(join(migrationDir, '..', 'verification', '089_daily_retention_phase1.sql'), 'utf8').includes('verification-only'),
    true,
  )
})

test('Daily persists state only and contains exactly two rewards', () => {
  assert.match(executableSql, /create table public\.daily_challenges/i)
  assert.match(executableSql, /create table public\.user_daily_progress/i)
  assert.match(executableSql, /create table public\.user_progress/i)
  assert.match(executableSql, /local_date date primary key/i)
  assert.match(executableSql, /primary key \(user_id, local_date\)/i)
  assert.match(executableSql, /total_exp integer/i)
  assert.match(executableSql, /current_streak integer/i)
  assert.match(executableSql, /longest_streak integer/i)
  assert.match(executableSql, /exp_earned integer/i)
  assert.match(executableSql, /exp_earned between 0 and 100/i)
  assert.doesNotMatch(executableSql, /create table public\.(?:daily_answers|daily_events|daily_exp_ledger|daily_review_tracking)/i)
  assert.doesNotMatch(executableSql, /level\s+(?:integer|text|numeric)|total_level/i)
})

test('Daily 5 is Published-only, deterministic, distinct, and no-random', () => {
  const challengeBlock = functionBlock('daily_get_or_create_challenge')
  const validityBlock = functionBlock('daily_question_is_valid')
  assert.match(challengeBlock, /timezone\('Asia\/Bangkok', now\(\)\)::date/i)
  assert.match(validityBlock, /p_question\.status\s*=\s*'Published'/i)
  assert.match(validityBlock, /char_length\(btrim\(p_question\.content\)\)\s*>\s*0/i)
  assert.match(challengeBlock, /md5\(v_today::text\s*\|\|\s*':'\s*\|\|\s*q\.id::text\)/i)
  assert.match(challengeBlock, /order by selection_key, q\.id/i)
  assert.match(challengeBlock, /limit 5/i)
  assert.match(challengeBlock, /on conflict \(local_date\) do nothing/i)
  assert.doesNotMatch(challengeBlock, /random\s*\(/i)
  assert.match(executableSql, /daily_challenges_distinct_questions_check/i)
  assert.match(executableSql, /create trigger daily_challenges_immutable[\s\S]*?before update or delete on public\.daily_challenges/i)
  assert.match(functionBlock('daily_get_state'), /challenge-invalid/i)
})

test('RPCs derive the user/date and expose only authenticated execution', () => {
  for (const name of [
    'daily_get_or_create_challenge',
    'daily_get_state',
    'daily_save_progress',
  ]) {
    const block = functionBlock(name)
    assert.match(block, /security\s+definer/i)
    assert.match(block, /set search_path = pg_catalog, public, auth, pg_temp/i)
    assert.match(block, /auth\.uid\(\)/i)
    assert.match(block, /timezone\('Asia\/Bangkok', now\(\)\)::date/i)
  }

  for (const [name, args] of [
    ['daily_get_or_create_challenge', ''],
    ['daily_get_state', ''],
    ['daily_save_progress', 'jsonb, integer, boolean'],
  ]) {
    assert.match(
      executableSql,
      new RegExp(`revoke\\s+all\\s+on\\s+function\\s+public\\.${name}\\s*\\(${args}\\)[\\s\\S]*?grant\\s+execute\\s+on\\s+function\\s+public\\.${name}\\s*\\(${args}\\)\\s+to\\s+authenticated`, 'i'),
    )
  }

  assert.match(executableSql, /revoke all on table public\.user_daily_progress from public, anon, authenticated/i)
  assert.match(executableSql, /revoke all on table public\.user_progress from public, anon, authenticated/i)
  assert.doesNotMatch(executableSql, /grant\s+(?:insert|update|delete)[\s\S]*?user_daily_progress/i)
  assert.doesNotMatch(executableSql, /grant\s+(?:insert|update|delete)[\s\S]*?user_progress/i)
})

test('Progress save computes correctness from the database and finalization is idempotent', () => {
  const saveBlock = functionBlock('daily_save_progress')
  assert.match(saveBlock, /p_answers\s*\?\s*\(q\.id::text\)/i)
  assert.match(saveBlock, /p_answers\s*->>\s*\(q\.id::text\)\s*\)\s*=\s*q\.correct_answer::text/i)
  assert.match(saveBlock, /p_finalize/i)
  assert.match(saveBlock, /All five Daily questions must be answered/i)
  assert.match(saveBlock, /for update/i)
  assert.match(saveBlock, /v_was_completed\s*:=\s*v_daily_completed/i)
  assert.match(saveBlock, /if v_was_completed then/i)
  assert.match(saveBlock, /v_exp_delta\s*:=\s*50/i)
  assert.match(saveBlock, /then 20 else 0 end/i)
  assert.match(saveBlock, /then 30 else 0 end/i)
  assert.match(saveBlock, /v_total_exp\s*\+\s*v_exp_delta/i)
  assert.match(saveBlock, /v_today - 1/i)
  assert.match(saveBlock, /total_daily_questions\s*=\s*v_total_daily_questions\s*\+\s*5/i)
})

test('concurrent first creation and finalization have database convergence guards', () => {
  const challengeBlock = functionBlock('daily_get_or_create_challenge')
  const saveBlock = functionBlock('daily_save_progress')
  assert.match(challengeBlock, /on conflict \(local_date\) do nothing/i)
  assert.match(challengeBlock, /select array\[[\s\S]*?from public\.daily_challenges/i)
  assert.match(saveBlock, /insert into public\.user_daily_progress[\s\S]*?on conflict \(user_id, local_date\) do nothing/i)
  assert.match(saveBlock, /from public\.user_daily_progress[\s\S]*?for update/i)
  assert.match(saveBlock, /insert into public\.user_progress[\s\S]*?on conflict \(user_id\) do nothing/i)
  assert.match(saveBlock, /from public\.user_progress[\s\S]*?for update/i)
  assert.match(saveBlock, /if v_was_completed then[\s\S]*?v_exp_delta := 0/i)
})

test('No client-authored score, EXP, streak, quest, or correctness inputs exist', () => {
  const saveSignature = /daily_save_progress\(\s*p_answers\s+jsonb,\s*p_current_index\s+integer,\s*p_finalize\s+boolean/i
  assert.match(executableSql, saveSignature)
  assert.doesNotMatch(executableSql, /p_(?:score|accuracy|correct|exp|streak|quest|is_correct)\b/i)
  assert.doesNotMatch(executableSql, /create table public\.(?:daily_answers|daily_events|daily_exp_ledger)/i)
})
