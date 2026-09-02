/**
 * Static contract tests for the Daily Retention Phase 1 follow-up (089).
 *
 * These checks intentionally do not connect to Production. They protect the
 * state-only, authenticated-RPC, consistency-reward contract.
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
  assert.match(
    readFileSync(join(migrationDir, '..', 'verification', '089_daily_retention_phase1.sql'), 'utf8'),
    /verification-only/,
  )
})

test('Daily persists one aggregate reward state with exactly one quest', () => {
  assert.match(executableSql, /create table public\.daily_challenges/i)
  assert.match(executableSql, /create table public\.user_daily_progress/i)
  assert.match(executableSql, /create table public\.user_progress/i)
  assert.match(executableSql, /primary key \(user_id, local_date\)/i)
  assert.match(executableSql, /exp_earned integer/i)
  assert.match(executableSql, /exp_earned between 0 and 50/i)
  assert.match(executableSql, /exp_earned = case when daily_completed then 50 else 0 end/i)
  assert.match(executableSql, /jsonb_typeof\(answers\) = 'object'/i)
  assert.doesNotMatch(executableSql, /quest_one_completed|quest_two_completed|both_quests_completed|score-three-of-five/i)
  assert.doesNotMatch(executableSql, /then 20 else 0 end|then 30 else 0 end/i)
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
  assert.match(functionBlock('daily_submit_answer'), /persisted challenge is invalid/i)
})

test('RPCs derive the user/date and expose only authenticated execution', () => {
  for (const name of [
    'daily_get_or_create_challenge',
    'daily_get_state',
    'daily_submit_answer',
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
    ['daily_submit_answer', 'uuid, text, integer'],
  ]) {
    assert.match(
      executableSql,
      new RegExp(`revoke\\s+all\\s+on\\s+function\\s+public\\.${name}\\s*\\(${args}\\)[\\s\\S]*?grant\\s+execute\\s+on\\s+function\\s+public\\.${name}\\s*\\(${args}\\)\\s+to\\s+authenticated`, 'i'),
    )
  }

  assert.match(executableSql, /revoke all on table public\.daily_challenges from public, anon, authenticated/i)
  assert.match(executableSql, /revoke all on table public\.user_daily_progress from public, anon, authenticated/i)
  assert.match(executableSql, /revoke all on table public\.user_progress from public, anon, authenticated/i)
  assert.doesNotMatch(executableSql, /grant\s+(?:insert|update|delete)[\s\S]*?user_daily_progress/i)
  assert.doesNotMatch(executableSql, /grant\s+(?:insert|update|delete)[\s\S]*?user_progress/i)
})

test('Each answer is terminal, merged, DB-scored, and retry-idempotent', () => {
  const submitBlock = functionBlock('daily_submit_answer')
  assert.match(submitBlock, /p_question_id\s+uuid/i)
  assert.match(submitBlock, /p_choice\s+text/i)
  assert.match(submitBlock, /p_next_index\s+integer/i)
  assert.match(submitBlock, /for v_lock_question_id in[\s\S]*?order by ids\.id[\s\S]*?for update/i)
  assert.match(submitBlock, /public\.daily_question_is_valid\(q\)/i)
  assert.match(submitBlock, /select q\.\*[\s\S]*?from public\.questions q[\s\S]*?for update/i)
  assert.match(submitBlock, /jsonb_set\([\s\S]*?p_question_id::text[\s\S]*?true/i)
  assert.match(submitBlock, /if v_answers \? \(p_question_id::text\) then/i)
  assert.match(submitBlock, /v_existing_choice <> p_choice/i)
  assert.match(submitBlock, /v_idempotent := true/i)
  assert.match(submitBlock, /v_questions_answered = 5/i)
  assert.match(submitBlock, /v_exp_delta := 50/i)
  assert.match(submitBlock, /correctAnswer.*v_selected_question\.correct_answer/i)
  assert.doesNotMatch(submitBlock, /p_(?:score|accuracy|correct|exp|streak|quest|is_correct)\b/i)
})

test('Streaks recompute from completed dates under a consistent user lock', () => {
  const streakBlock = functionBlock('daily_recompute_user_streaks')
  const submitBlock = functionBlock('daily_submit_answer')
  assert.match(streakBlock, /from public\.user_daily_progress p[\s\S]*p\.daily_completed/i)
  assert.match(streakBlock, /row_number\(\) over \(order by p\.local_date\)/i)
  assert.match(streakBlock, /order by run_end desc/i)
  assert.match(streakBlock, /greatest\(v_existing_longest/i)
  assert.match(submitBlock, /insert into public\.user_progress[\s\S]*?on conflict \(user_id\) do nothing/i)
  assert.match(submitBlock, /from public\.user_progress p[\s\S]*?for update/i)
  assert.match(submitBlock, /perform public\.daily_recompute_user_streaks\(v_user_id\)/i)
})

test('No client-authored answer snapshot or reward inputs exist', () => {
  const actions = readFileSync(join(migrationDir, '..', '..', 'app', 'daily', 'actions.ts'), 'utf8')
  const runtime = readFileSync(join(migrationDir, '..', '..', 'components', 'daily', 'DailyRuntime.tsx'), 'utf8')
  assert.match(actions, /submitDailyAnswer/i)
  assert.match(actions, /daily_submit_answer/i)
  assert.doesNotMatch(actions, /saveDailyProgress|p_answers|p_finalize/i)
  assert.match(runtime, /draftAnswers/i)
  assert.doesNotMatch(runtime, /setTimeout|persistSnapshot|saveDailyProgress|p_answers|p_finalize/i)
  assert.doesNotMatch(executableSql, /p_(?:score|accuracy|correct|exp|streak|quest|is_correct)\b/i)
})
