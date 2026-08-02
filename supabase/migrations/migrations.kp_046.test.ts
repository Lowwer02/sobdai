import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const migrationPath = new URL('./046_kp_rls_foundation.sql', import.meta.url)
const sql = readFileSync(migrationPath, 'utf8')

const targetTables = [
  'reference_documents',
  'reference_document_versions',
  'reference_document_aliases',
  'summary_versions',
  'summary_aliases',
  'summary_reference_documents',
  'summary_version_reference_documents',
  'package_summaries',
]

test('046 is the reconciled RLS responsibility and validates migrations 038-045', () => {
  assert.match(sql, /frozen SQL Migration Design assigned this responsibility to migration\s+-- 045/i)
  assert.match(sql, /041_news_gp_exam_requirement\.sql shifted/i)
  for (const table of targetTables) {
    assert.match(sql, new RegExp(`\\('${table}'\\)`))
  }
})

test('046 creates only bounded RLS helper functions and policies', () => {
  for (const fn of [
    'kp_is_content_editor',
    'kp_is_staff',
    'kp_can_read_package_summary',
    'kp_can_read_summary_version',
  ]) {
    assert.match(sql, new RegExp(`create or replace function public\\.${fn}\\(`, 'i'))
  }

  assert.doesNotMatch(sql, /\bcreate\s+table\b/i)
  assert.doesNotMatch(sql, /\balter\s+table\b/i)
  assert.doesNotMatch(sql, /\bcreate\s+(?:unique\s+)?index\b/i)
  assert.doesNotMatch(sql, /\bcreate\s+trigger\b/i)
  assert.doesNotMatch(sql, /\bcreate\s+(?:materialized\s+)?view\b/i)
})

test('staff and editor predicates use the frozen profile roles', () => {
  assert.match(sql, /p\.role in \('owner', 'admin', 'editor'\)/)
  assert.match(sql, /p\.role in \('owner', 'admin', 'editor', 'support'\)/)
  assert.match(sql, /security definer/g)
  assert.match(sql, /set search_path = pg_catalog, public/g)
  assert.match(sql, /kp_staff_preview/)
  assert.match(sql, /kp_editor_insert/)
  assert.match(sql, /kp_editor_update/)
})

test('public placement reads require active published and visibility access', () => {
  assert.match(sql, /ps\.status = 'active'/)
  assert.match(sql, /p\.is_published = true/)
  assert.match(sql, /s\.lifecycle_status = 'active'/)
  assert.match(sql, /s\.visibility = 'public_indexable'/)
  assert.match(sql, /s\.visibility = 'authenticated'/)
  assert.match(sql, /s\.visibility = 'product_entitled'/)
  assert.match(sql, /o\.status = 'completed'/)
})

test('Markdown reads resolve only a published selected version', () => {
  assert.match(sql, /sv\.status = 'published'/)
  assert.match(sql, /ps\.version_policy = 'latest_published'/)
  assert.match(sql, /s\.current_published_version_id = sv\.id/)
  assert.match(sql, /ps\.version_policy = 'pinned'/)
  assert.match(sql, /ps\.pinned_summary_version_id = sv\.id/)
  assert.match(sql, /kp_accessible_summary_version/)
  assert.match(sql, /kp_accessible_package_summary/)
})

test('browser grants are bounded and destructive mutation remains denied', () => {
  assert.match(sql, /grant select, insert, update[\s\S]+to authenticated;/i)
  assert.match(sql, /grant select[\s\S]+public\.summary_versions,[\s\S]+public\.package_summaries[\s\S]+to anon;/i)
  assert.match(sql, /revoke delete[\s\S]+from anon, authenticated;/i)
  assert.match(sql, /revoke insert, update[\s\S]+from anon;/i)
  assert.match(sql, /has_schema_privilege\('anon', 'kp_migration', 'USAGE'\)/)
})

test('legacy tables and production data remain untouched', () => {
  const executableSql = sql
    .split('\n')
    .filter((line) => !line.trimStart().startsWith('--'))
    .join('\n')

  assert.doesNotMatch(executableSql, /\b(?:insert\s+into|update|delete\s+from)\s+public\.(?:summaries|packages|orders)\b/i)
  assert.doesNotMatch(executableSql, /\bdrop\s+(?:table|column|constraint)\b/i)
  assert.doesNotMatch(executableSql, /drop policy[\s\S]+on public\.summaries/i)
  assert.doesNotMatch(executableSql, /create policy[\s\S]+on public\.summaries\b/i)
})

test('later Knowledge Platform responsibilities are absent', () => {
  for (const forbidden of [
    /summary picker/i,
    /recommendation changes/i,
    /adaptive learning/i,
    /final cutover/i,
    /legacy field removal/i,
  ]) {
    const executableSql = sql
      .split('\n')
      .filter((line) => !line.trimStart().startsWith('--'))
      .join('\n')
    assert.doesNotMatch(executableSql, forbidden)
  }
})
