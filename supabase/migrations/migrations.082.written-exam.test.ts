/**
 * Static contract tests for WE-2B Written Exam persistence (082).
 *
 * These tests intentionally do not connect to Supabase or mutate a database.
 * They verify the executable SQL contract. A later isolated database audit
 * must exercise the RPCs under real authenticated/anonymous roles and two
 * concurrent transactions.
 *
 * Run with:
 *   node --experimental-strip-types supabase/migrations/migrations.082.written-exam.test.ts
 */

import assert from 'node:assert/strict'
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import test from 'node:test'

const migrationDir = dirname(fileURLToPath(import.meta.url))
const migrationName = '082_written_exam_persistence.sql'
const migrationPath = join(migrationDir, migrationName)
const migration = readFileSync(migrationPath, 'utf8')
const executableSql = migration
  .split('\n')
  .filter((line) => !line.trimStart().startsWith('--'))
  .join('\n')

function functionBlock(name: string): string {
  const match = executableSql.match(
    new RegExp(`create\\s+or\\s+replace\\s+function\\s+public\\.${name}[\\s\\S]*?\\$function\\$[\\s\\S]*?\\$function\\$`, 'i'),
  )
  assert.ok(match, `function ${name} exists`)
  return match[0]!
}

test('082 exists exactly once and leaves reserved predecessor migrations alone', () => {
  assert.equal(existsSync(migrationPath), true)
  assert.equal(readdirSync(migrationDir).filter((name) => /^082_.+\.sql$/.test(name)).length, 1)
  assert.doesNotMatch(migration, /(?:080|081)_[^\n]*written_exam/i)
  assert.doesNotMatch(migration, /780079/)
})

test('the three-table model has explicit identity, package, revision, and question keys', () => {
  for (const table of [
    'written_exam_materials',
    'written_exam_material_versions',
    'written_exam_questions',
  ]) {
    assert.match(executableSql, new RegExp(`create\\s+table\\s+public\\.${table}\\s*\\(`, 'i'))
    assert.match(executableSql, new RegExp(`alter\\s+table\\s+public\\.${table}\\s+enable\\s+row\\s+level\\s+security`, 'i'))
  }

  assert.match(executableSql, /unique\s*\(\s*package_id\s*,\s*slug\s*\)/i)
  assert.match(executableSql, /foreign key\s*\(\s*package_id\s*\)[\s\S]*?references\s+public\.packages\s*\(\s*id\s*\)[\s\S]*?on delete restrict/i)
  assert.match(executableSql, /unique\s*\(\s*material_id\s*,\s*revision_number\s*\)/i)
  assert.match(executableSql, /unique\s*\(\s*material_version_id\s*,\s*question_number\s*\)/i)
  assert.match(executableSql, /question_number\s+integer\s+not null/i)
  assert.match(executableSql, /question_number\s+between\s+1\s+and\s+200/i)
  assert.match(executableSql, /format_version\s+text\s+not null/i)
  assert.match(executableSql, /format_version\s*=\s*'written-exam-v1'/i)
})

test('source boundary and normalized Parser V1 fields are database-enforced', () => {
  assert.match(executableSql, /octet_length\(source_md\)\s+between\s+1\s+and\s+1048576/i)
  assert.match(executableSql, /source_checksum\s+text\s+not null/i)
  for (const column of [
    'question_markdown',
    'model_answer_markdown',
    'keywords',
    'answer_structure_markdown',
    'memory_technique_markdown',
  ]) {
    assert.match(executableSql, new RegExp(`\\b${column}\\b`, 'i'))
  }
  assert.match(executableSql, /cardinality\(keywords\)\s+between\s+1\s+and\s+30/i)
})

test('there is one draft and one published revision per material, without checksum uniqueness', () => {
  assert.match(executableSql, /create\s+unique\s+index\s+written_exam_material_versions_one_draft_idx[\s\S]*?where\s+status\s*=\s*'draft'/i)
  assert.match(executableSql, /create\s+unique\s+index\s+written_exam_material_versions_one_published_idx[\s\S]*?where\s+status\s*=\s*'published'/i)
  assert.doesNotMatch(executableSql, /unique[^;\n]*question_checksum/i)
  assert.doesNotMatch(executableSql, /unique\s+index[^;\n]*question_checksum/i)
})

test('published and archived content is immutable and deletion is archive-only', () => {
  const materialGuard = functionBlock('protect_written_exam_material_identity\\(')
  const versionGuard = functionBlock('protect_written_exam_version_lifecycle\\(')
  const questionGuard = functionBlock('protect_written_exam_question_lifecycle\\(')

  assert.match(materialGuard, /tg_op\s*=\s*'DELETE'/i)
  assert.match(materialGuard, /new\.package_id\s+is\s+distinct\s+from\s+old\.package_id/i)
  assert.match(materialGuard, /new\.slug\s+is\s+distinct\s+from\s+old\.slug/i)
  assert.match(versionGuard, /old\.status\s*=\s*'published'\s+and\s+new\.status\s*=\s*'archived'/i)
  for (const field of ['source_md', 'source_checksum', 'title', 'format_version', 'material_id', 'revision_number']) {
    assert.match(versionGuard, new RegExp(`new\\.${field}\\s+is\\s+distinct\\s+from\\s+old\\.${field}`, 'i'))
  }
  assert.match(versionGuard, /published_at\s*:=\s*timezone/i)
  assert.match(versionGuard, /archived_at\s*:=\s*timezone/i)
  assert.match(questionGuard, /published or archived Written Exam questions are immutable/i)
  assert.match(executableSql, /before\s+insert\s+or\s+update\s+or\s+delete\s+on\s+public\.written_exam_questions/i)
})

test('save draft RPC derives active editor identity, resolves package_code, and is atomic/idempotent', () => {
  const block = functionBlock('save_written_exam_draft\\(')
  assert.match(block, /security\s+definer/i)
  assert.match(block, /set\s+search_path\s*=\s*pg_catalog,\s*public,\s*auth,\s*pg_temp/i)
  assert.match(block, /v_actor_id\s*:=\s*auth\.uid\(\)/i)
  assert.match(block, /p\.role\s+in\s*\(\s*'owner',\s*'admin',\s*'editor'\s*\)/i)
  assert.match(block, /p\.status\s*=\s*'active'/i)
  assert.match(block, /p\.deleted_at\s+is\s+null/i)
  assert.match(block, /where\s+p\.package_code\s*=\s*p_package_code/i)
  assert.match(block, /for\s+share/i)
  assert.match(block, /on conflict\s*\(\s*package_id,\s*slug\s*\)\s+do nothing/i)
  assert.match(block, /where\s+v\.material_id\s*=\s*v_material_id[\s\S]*?and\s+v\.status\s*=\s*'draft'[\s\S]*?for\s+update/i)
  assert.match(block, /v_existing_draft_checksum\s*=\s*p_source_checksum[\s\S]*?and\s+v_existing_draft_title\s*=\s*btrim\(p_title\)/i)
  assert.match(block, /'idempotent_retry',\s*true/i)
  assert.match(block, /coalesce\(max\(v\.revision_number\),\s*0\)\s*\+\s*1/i)
  assert.match(block, /delete\s+from\s+public\.written_exam_questions/i)
  assert.match(block, /insert\s+into\s+public\.written_exam_questions/i)
  assert.match(block, /p_material_id\s+is\s+not\s+null/i)
  assert.match(block, /package binding or slug cannot be rebound/i)
  assert.doesNotMatch(block, /p_actor|p_role|p_created_by/i)
})

test('publish and archive RPCs are owner/admin-only and serialize lifecycle transitions', () => {
  const publishBlock = functionBlock('publish_written_exam\\(')
  const archiveBlock = functionBlock('archive_written_exam\\(')

  for (const block of [publishBlock, archiveBlock]) {
    assert.match(block, /security\s+definer/i)
    assert.match(block, /v_actor_id\s*:=\s*auth\.uid\(\)/i)
    assert.match(block, /p\.role\s+in\s*\(\s*'owner',\s*'admin'\s*\)/i)
    assert.match(block, /p\.status\s*=\s*'active'/i)
    assert.match(block, /p\.deleted_at\s+is\s+null/i)
    assert.match(block, /from\s+public\.written_exam_materials[\s\S]*?for\s+update/i)
  }

  assert.match(publishBlock, /v\.status\s*=\s*'draft'[\s\S]*?for\s+update/i)
  assert.match(publishBlock, /set\s+status\s*=\s*'archived'/i)
  assert.match(publishBlock, /set\s+status\s*=\s*'published'/i)
  assert.match(archiveBlock, /v\.status\s*=\s*'published'[\s\S]*?for\s+update/i)
  assert.match(archiveBlock, /set\s+status\s*=\s*'archived'/i)
})

test('learner RPC exposes only published normalized fields and reuses paid/free entitlement', () => {
  const block = functionBlock('get_published_written_exam_for_learner\\(')
  assert.match(block, /returns\s+table/i)
  assert.match(block, /v\.status\s*=\s*'published'/i)
  assert.match(block, /p\.is_published\s*=\s*true/i)
  assert.match(block, /auth\.uid\(\)\s+is\s+not\s+null/i)
  assert.match(block, /actor\.role\s+in\s*\(\s*'owner',\s*'admin'\s*\)/i)
  assert.match(block, /actor\.status\s*=\s*'active'/i)
  assert.match(block, /actor\.deleted_at\s+is\s+null/i)
  assert.match(block, /o\.status\s+in\s*\(\s*'paid',\s*'free'\s*\)/i)
  for (const forbidden of ['source_md', 'source_checksum', 'created_by', 'updated_by', 'published_by', 'archived_by', 'created_at', 'updated_at']) {
    assert.doesNotMatch(block, new RegExp(`\\b${forbidden}\\b`, 'i'), `learner projection excludes ${forbidden}`)
  }
  assert.match(block, /order\s+by\s+q\.question_number/i)
})

test('raw-table RLS/ACL and RPC ACLs fence anonymous, learner DML, and service_role execution', () => {
  for (const table of [
    'written_exam_materials',
    'written_exam_material_versions',
    'written_exam_questions',
  ]) {
    assert.match(executableSql, new RegExp(`revoke\\s+all\\s+on\\s+table\\s+public\\.${table}\\s+from\\s+public,\\s*anon,\\s*authenticated`, 'i'))
    assert.match(executableSql, new RegExp(`grant\\s+select\\s+on\\s+table\\s+public\\.${table}\\s+to\\s+authenticated`, 'i'))
    assert.match(executableSql, new RegExp(`create\\s+policy\\s+written_exam_${table.replace('written_exam_', '')}_staff_select[\\s\\S]*?for\\s+select[\\s\\S]*?to\\s+authenticated[\\s\\S]*?kp_is_content_editor`, 'i'))
  }

  assert.doesNotMatch(executableSql, /grant\s+(?:insert|update|delete|all)[^;]*on\s+table\s+public\.written_exam_/i)

  for (const signature of [
    'save_written_exam_draft\\(uuid, text, text, text, text, text, text, text, jsonb\\)',
    'publish_written_exam\\(uuid\\)',
    'archive_written_exam\\(uuid\\)',
    'get_published_written_exam_for_learner\\(text, text\\)',
  ]) {
    assert.match(executableSql, new RegExp(`revoke\\s+all\\s+on\\s+function\\s+public\\.${signature}\\s+from\\s+public,\\s*anon,\\s*authenticated,\\s*service_role`, 'i'))
    assert.match(executableSql, new RegExp(`grant\\s+execute\\s+on\\s+function\\s+public\\.${signature}\\s+to\\s+authenticated`, 'i'))
  }
})

test('WE-1 boundary ownership remains explicit for future app-layer coverage', () => {
  // PostgreSQL text cannot contain an invalid server-encoding byte sequence;
  // invalid UTF-8, File/FormData shape, and extension checks remain app-layer
  // responsibilities. The persistence backstop must nevertheless be byte-
  // based and reject oversized source content.
  assert.match(executableSql, /octet_length\(p_source_md\)\s+not\s+between\s+1\s+and\s+1048576/i)
  assert.match(migration, /invalid UTF-8/i)
  assert.match(migration, /File\/FormData/i)
})
