/**
 * Static contract tests for WE-4's learner-safe Written Exam discovery RPC.
 *
 * The repository does not have a local PostgreSQL runtime available in this
 * worktree, so these tests verify the executable SQL contract. A disposable
 * database proof should run separately when an isolated test database is
 * provisioned; this test never connects to the configured application project.
 *
 * Run with:
 *   node --experimental-strip-types supabase/migrations/migrations.083.written-exam-discovery.test.ts
 */

import assert from 'node:assert/strict'
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import test from 'node:test'

const migrationDir = dirname(fileURLToPath(import.meta.url))
const migrationName = '083_written_exam_learner_discovery.sql'
const migrationPath = join(migrationDir, migrationName)
const migration = readFileSync(migrationPath, 'utf8')
const executableSql = migration
  .split('\n')
  .filter((line) => !line.trimStart().startsWith('--'))
  .join('\n')

function functionBlock(name: string): string {
  const match = executableSql.match(
    new RegExp(`create\\s+function\\s+public\\.${name}[\\s\\S]*?\\$function\\$[\\s\\S]*?\\$function\\$`, 'i'),
  )
  assert.ok(match, `function ${name} exists`)
  return match[0]!
}

test('083 is present exactly once and follows migration 082', () => {
  assert.equal(existsSync(migrationPath), true)
  assert.equal(
    readdirSync(migrationDir).filter((name) => /^083_.+\.sql$/.test(name)).length,
    1,
  )
  assert.match(migration, /requires migration 082 learner reader/i)
  assert.match(migration, /get_published_written_exam_for_learner\(text, text\)/i)
})

test('discovery is a bounded, deterministic, published-only safe projection', () => {
  const block = functionBlock('get_published_written_exam_materials_for_package\\(')

  assert.match(block, /language\s+sql/i)
  assert.match(block, /stable/i)
  assert.match(block, /security\s+definer/i)
  assert.match(block, /set\s+search_path\s*=\s*pg_catalog,\s*public,\s*auth,\s*pg_temp/i)
  assert.match(block, /p\.is_published\s*=\s*true/i)
  assert.match(block, /v\.status\s*=\s*'published'/i)
  assert.match(block, /having\s+count\(q\.id\)\s*>\s*0/i)
  assert.match(block, /order\s+by\s+v\.title,\s*m\.slug/i)
  assert.match(block, /limit\s+20/i)

  for (const safeColumn of ['m.slug', 'v.title', 'count(q.id)']) {
    assert.match(block, new RegExp(safeColumn.replace(/[().]/g, '\\$&'), 'i'))
  }

  for (const forbidden of [
    'source_md',
    'source_checksum',
    'created_by',
    'updated_by',
    'published_by',
    'archived_by',
    'question_markdown',
    'model_answer_markdown',
    'keywords',
    'answer_structure_markdown',
    'memory_technique_markdown',
  ]) {
    assert.doesNotMatch(block, new RegExp(`\\b${forbidden}\\b`, 'i'))
  }
})

test('discovery ACL is explicit and does not grant raw-table access', () => {
  const signature = 'get_published_written_exam_materials_for_package\\(text\\)'
  assert.match(
    executableSql,
    new RegExp(`revoke\\s+all\\s+on\\s+function\\s+public\\.${signature}[\\s\\S]*?from\\s+public,\\s*anon,\\s*authenticated,\\s*service_role`, 'i'),
  )
  assert.match(
    executableSql,
    new RegExp(`grant\\s+execute\\s+on\\s+function\\s+public\\.${signature}[\\s\\S]*?to\\s+anon,\\s*authenticated`, 'i'),
  )
  assert.doesNotMatch(
    executableSql,
    /grant\s+(?:select|insert|update|delete|all)[^;]*on\s+table\s+public\.written_exam_/i,
  )
  assert.match(executableSql, /has_function_privilege\('anon'/i)
  assert.match(executableSql, /has_function_privilege\('authenticated'/i)
  assert.match(executableSql, /has_function_privilege\('service_role'/i)
})
