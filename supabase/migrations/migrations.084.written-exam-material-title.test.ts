/**
 * Static contract tests for the 084 Written Exam material metadata title.
 *
 * The tests intentionally do not connect to Supabase. They verify that the
 * additive migration uses the existing auth/RPC boundary and that title edits
 * cannot mutate package identity or revision content.
 */

import assert from 'node:assert/strict'
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import test from 'node:test'

const migrationDir = dirname(fileURLToPath(import.meta.url))
const migrationName = '084_written_exam_material_title.sql'
const migrationPath = join(migrationDir, migrationName)
const migration = readFileSync(migrationPath, 'utf8')
const executableSql = migration
  .split('\n')
  .filter((line) => !line.trimStart().startsWith('--'))
  .join('\n')

function functionBlock(name: string): string {
  const match = executableSql.match(
    new RegExp(`create(?:\\s+or\\s+replace)?\\s+function\\s+public\\.${name}[\\s\\S]*?\\$function\\$[\\s\\S]*?\\$function\\$`, 'i'),
  )
  assert.ok(match, `function ${name} exists`)
  return match[0]!
}

test('084 exists exactly once and fails closed on missing 082/083 or duplicate title state', () => {
  assert.equal(existsSync(migrationPath), true)
  assert.equal(readdirSync(migrationDir).filter((name) => /^084_.+\.sql$/.test(name)).length, 1)
  assert.match(migration, /requires the 082\/083 learner RPCs/i)
  assert.match(migration, /material title column already exists/i)
  assert.match(migration, /material title RPC already exists/i)
})

test('material title is additive and backfilled without creating a revision or question mutation', () => {
  assert.match(executableSql, /alter\s+table\s+public\.written_exam_materials\s+add\s+column\s+title\s+text\s+null/i)
  assert.match(executableSql, /update\s+public\.written_exam_materials\s+as\s+m\s+set\s+title\s*=\s*seed\.title/i)
  assert.match(executableSql, /when\s+'published'\s+then\s+0[\s\S]*?when\s+'draft'\s+then\s+1/i)
  assert.match(executableSql, /add\s+constraint\s+written_exam_materials_title_check/i)

  const titleUpdate = functionBlock('update_written_exam_material_title\\(')
  assert.doesNotMatch(titleUpdate, /written_exam_material_versions|written_exam_questions/i)
  assert.doesNotMatch(titleUpdate, /package_id\s*=|slug\s*=/i)
})

test('title update is server-authorized, actor-derived, bounded, and material-only', () => {
  const titleUpdate = functionBlock('update_written_exam_material_title\\(')
  assert.match(titleUpdate, /security\s+definer/i)
  assert.match(titleUpdate, /set\s+search_path\s*=\s*pg_catalog,\s*public,\s*auth,\s*pg_temp/i)
  assert.match(titleUpdate, /v_actor_id\s*:=\s*auth\.uid\(\)/i)
  assert.match(titleUpdate, /p\.role\s+in\s*\(\s*'owner',\s*'admin',\s*'editor'\s*\)/i)
  assert.match(titleUpdate, /p\.status\s*=\s*'active'/i)
  assert.match(titleUpdate, /p\.deleted_at\s+is\s+null/i)
  assert.match(titleUpdate, /p_title\s+is\s+null[\s\S]*?char_length\(btrim\(p_title\)\)\s+not\s+between\s+1\s+and\s+300/i)
  assert.match(titleUpdate, /from\s+public\.written_exam_materials\s+m[\s\S]*?where\s+m\.id\s*=\s*p_material_id[\s\S]*?for\s+update/i)
  assert.match(titleUpdate, /update\s+public\.written_exam_materials[\s\S]*?set\s+title\s*=\s*v_title,[\s\S]*?updated_by\s*=\s*v_actor_id/i)
  assert.doesNotMatch(titleUpdate, /p_actor|p_role|p_package|p_slug|p_updated_by/i)
})

test('learner and discovery projections use material metadata title with a legacy revision fallback', () => {
  const learner = functionBlock('get_published_written_exam_for_learner\\(')
  const discovery = functionBlock('get_published_written_exam_materials_for_package\\(')

  assert.match(learner, /coalesce\(m\.title,\s*v\.title\)/i)
  assert.match(learner, /v\.status\s*=\s*'published'/i)
  assert.match(learner, /auth\.uid\(\)\s+is\s+not\s+null/i)
  assert.match(learner, /o\.status\s+in\s*\(\s*'paid',\s*'free'\s*\)/i)
  assert.match(discovery, /coalesce\(m\.title,\s*v\.title\)/i)
  assert.match(discovery, /p\.is_published\s*=\s*true/i)
  assert.match(discovery, /v\.status\s*=\s*'published'/i)
  assert.match(discovery, /having\s+count\(q\.id\)\s*>\s*0/i)
  assert.match(discovery, /limit\s+20/i)
  for (const forbidden of [
    'source_md',
    'source_checksum',
    'question_markdown',
    'model_answer_markdown',
    'keywords',
    'answer_structure_markdown',
    'memory_technique_markdown',
  ]) {
    assert.doesNotMatch(discovery, new RegExp(`\\b${forbidden}\\b`, 'i'))
  }
})

test('new title RPC is authenticated-only and learner ACLs remain explicit', () => {
  assert.match(executableSql, /revoke\s+all\s+on\s+function\s+public\.update_written_exam_material_title\(uuid,\s*text\)\s+from\s+public,\s*anon,\s*authenticated,\s*service_role/i)
  assert.match(executableSql, /grant\s+execute\s+on\s+function\s+public\.update_written_exam_material_title\(uuid,\s*text\)\s+to\s+authenticated/i)
  assert.match(executableSql, /has_function_privilege\('authenticated',\s*title_signature,\s*'EXECUTE'\)/i)
  assert.match(executableSql, /has_function_privilege\('anon',\s*title_signature,\s*'EXECUTE'\)/i)
  assert.match(executableSql, /has_function_privilege\('service_role',\s*title_signature,\s*'EXECUTE'\)/i)
  assert.match(executableSql, /revoke\s+all\s+on\s+function\s+public\.get_published_written_exam_for_learner\(text,\s*text\)/i)
  assert.match(executableSql, /revoke\s+all\s+on\s+function\s+public\.get_published_written_exam_materials_for_package\(text\)/i)
})
