/**
 * Static contract tests for the SummaryVersion foundation migration.
 *
 * The frozen responsibility formerly numbered 042 is reconciled to 043 because
 * migrations 041 and 042 already occupy production identities.
 *
 * Run:
 *   node --experimental-strip-types supabase/migrations/migrations.kp_043.test.ts
 */

import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const migrationDir = dirname(fileURLToPath(import.meta.url))
const migrationName = '043_kp_summary_versions.sql'
const migration = readFileSync(join(migrationDir, migrationName), 'utf8')
const sql = migration
  .split('\n')
  .filter((line) => !line.trimStart().startsWith('--'))
  .join('\n')

function verifiesProductionSafeIdentityAndDependency(): void {
  const files = readdirSync(migrationDir).filter((name) => name.endsWith('.sql'))
  for (const required of [
    '038_kp_reference_documents.sql',
    '039_kp_reference_document_versions.sql',
    '040_kp_reference_document_aliases.sql',
    '041_news_gp_exam_requirement.sql',
    '042_kp_summaries_expand.sql',
    migrationName,
  ]) {
    assert.ok(files.includes(required), `required migration is missing: ${required}`)
  }
  assert.ok(!files.includes('042_kp_summary_versions.sql'), 'SummaryVersion must not collide with production 042')
  assert.match(sql, /set\s+local\s+lock_timeout\s*=\s*'5s'/i)
  assert.match(sql, /to_regclass\s*\(\s*'public\.summaries'\s*\)/i)
  assert.ok(migration.includes('current_published_version_id'))
}

function verifiesSummaryVersionScopeOnly(): void {
  assert.match(sql, /create\s+table\s+if\s+not\s+exists\s+public\.summary_versions/i)
  for (const forbiddenTable of [
    'summary_aliases',
    'summary_reference_documents',
    'summary_version_reference_documents',
    'package_summaries',
  ]) {
    assert.ok(
      !new RegExp(`create\\s+table[\\s\\S]*?public\\.${forbiddenTable}\\b`, 'i').test(sql),
      `043 must not create later table public.${forbiddenTable}`,
    )
  }
  assert.ok(!/\binsert\s+into\b/i.test(sql), '043 must not insert or backfill data')
  assert.ok(!/\bcreate\s+(?:or\s+replace\s+)?view\b/i.test(sql), '043 must not create a read model')
  assert.ok(!/\bpackage_id\b/i.test(sql), '043 must not add Package integration')
  assert.ok(!/\bcreate\s+(?:or\s+replace\s+)?function\s+public\.(?:publish|create_draft|allocate_revision)/i.test(sql), '043 must not install workflow commands')
}

function verifiesFrozenColumns(): void {
  for (const required of [
    /id\s+uuid\s+not\s+null\s+default\s+uuid_generate_v4\s*\(\s*\)/i,
    /summary_id\s+uuid\s+not\s+null/i,
    /revision_number\s+integer\s+not\s+null/i,
    /status\s+text\s+not\s+null\s+default\s+'draft'/i,
    /content_md\s+text\b/i,
    /content_checksum\s+text\b/i,
    /title_snapshot\s+text\b/i,
    /subject_snapshot\s+text\b/i,
    /topic_snapshot\s+text\b/i,
    /law_snapshot\s+text\b/i,
    /seo_title\s+text\b/i,
    /seo_description\s+text\b/i,
    /social_image_bucket\s+text\b/i,
    /social_image_path\s+text\b/i,
    /read_time_minutes\s+integer\b/i,
    /read_time_policy_version\s+text\b/i,
    /content_schema_version\s+text\s+not\s+null/i,
    /change_note\s+text\b/i,
    /authored_by\s+uuid\s+not\s+null/i,
    /created_at\s+timestamptz\s+not\s+null\s+default\s+now\s*\(\s*\)/i,
    /updated_at\s+timestamptz\s+not\s+null\s+default\s+now\s*\(\s*\)/i,
    /submitted_for_review_at\s+timestamptz\b/i,
    /reviewed_by\s+uuid\b/i,
    /reviewed_at\s+timestamptz\b/i,
    /published_by\s+uuid\b/i,
    /published_at\s+timestamptz\b/i,
    /retired_by\s+uuid\b/i,
    /retired_at\s+timestamptz\b/i,
    /retirement_reason\s+text\b/i,
  ]) {
    assert.match(sql, required)
  }
  assert.ok(!/\bversion_label\b/i.test(sql), 'frozen SummaryVersion identity uses revision_number, not a label')
}

function verifiesKeysConstraintsAndSameParentPointer(): void {
  for (const constraint of [
    'summary_versions_pkey',
    'summary_versions_parent_revision_key',
    'summary_versions_parent_id_key',
    'summary_versions_revision_number_check',
    'summary_versions_status_check',
    'summary_versions_required_text_check',
    'summary_versions_content_checksum_check',
    'summary_versions_social_image_pair_check',
    'summary_versions_read_time_check',
    'summary_versions_review_audit_check',
    'summary_versions_publication_audit_check',
    'summary_versions_review_readiness_check',
    'summary_versions_published_semantics_check',
    'summary_versions_retirement_check',
    'summary_versions_parent_fkey',
    'summaries_current_published_version_fkey',
  ]) {
    assert.ok(migration.includes(constraint), `missing frozen constraint: ${constraint}`)
  }
  assert.match(sql, /unique\s*\(summary_id,\s*revision_number\)/i)
  assert.match(sql, /unique\s*\(summary_id,\s*id\)/i)
  assert.match(sql, /foreign\s+key\s*\(summary_id\)[\s\S]*?references\s+public\.summaries\s*\(id\)[\s\S]*?on\s+delete\s+restrict/i)
  assert.match(
    sql,
    /foreign\s+key\s*\(id,\s*current_published_version_id\)[\s\S]*?references\s+public\.summary_versions\s*\(summary_id,\s*id\)[\s\S]*?on\s+delete\s+restrict[\s\S]*?deferrable\s+initially\s+deferred[\s\S]*?not\s+valid/i,
  )
  for (const actor of ['authored_by', 'reviewed_by', 'published_by', 'retired_by']) {
    assert.match(
      sql,
      new RegExp(`foreign\\s+key\\s*\\(${actor}\\)[\\s\\S]*?references\\s+public\\.profiles\\s*\\(id\\)[\\s\\S]*?on\\s+delete\\s+set\\s+null`, 'i'),
    )
  }
}

function verifiesLifecycleAndPublicationEvidence(): void {
  for (const status of ['draft', 'in_review', 'published', 'retired']) {
    assert.ok(migration.includes(`'${status}'`), `missing SummaryVersion lifecycle value: ${status}`)
  }
  for (const evidence of [
    'content_md is not null',
    'content_checksum is not null',
    'title_snapshot is not null',
    'read_time_minutes is not null',
    'read_time_policy_version is not null',
    'reviewed_by is not null',
    'reviewed_at is not null',
    'published_by is not null',
    'published_at is not null',
  ]) {
    assert.ok(migration.includes(evidence), `published evidence missing: ${evidence}`)
  }
  for (const transition of [
    /old\.status\s*=\s*'draft'\s+and\s+new\.status\s+in\s*\('in_review',\s*'retired'\)/i,
    /old\.status\s*=\s*'in_review'\s+and\s+new\.status\s+in\s*\('draft',\s*'published',\s*'retired'\)/i,
    /old\.status\s*=\s*'published'\s+and\s+new\.status\s*=\s*'retired'/i,
  ]) {
    assert.match(sql, transition)
  }
}

function verifiesImmutabilityAndRetentionTriggers(): void {
  for (const immutableField of [
    'new.id',
    'new.summary_id',
    'new.revision_number',
    'new.content_md',
    'new.content_checksum',
    'new.title_snapshot',
    'new.read_time_policy_version',
    'new.published_by',
    'new.published_at',
  ]) {
    assert.ok(migration.includes(immutableField), `immutability protection missing: ${immutableField}`)
  }
  assert.match(sql, /old\.status\s+in\s*\('published',\s*'retired'\)/i)
  assert.match(sql, /before\s+delete\s+on\s+public\.summary_versions/i)
  for (const trigger of [
    'enforce_summary_version_transition',
    'protect_summary_version',
    'prevent_summary_version_history_delete',
    'handle_updated_at_summary_versions',
  ]) {
    assert.match(sql, new RegExp(`create\\s+trigger\\s+${trigger}`, 'i'))
  }
}

function verifiesFrozenIndexes(): void {
  for (const index of [
    'summary_versions_parent_revision_key',
    'summary_versions_parent_id_key',
    'summary_versions_one_open_revision_key',
    'summary_versions_parent_status_revision_idx',
    'summary_versions_status_published_idx',
    'summary_versions_checksum_idx',
  ]) {
    assert.ok(migration.includes(index), `missing SummaryVersion index: ${index}`)
  }
  assert.match(sql, /create\s+unique\s+index[\s\S]*?summary_versions_one_open_revision_key[\s\S]*?where\s+status\s+in\s*\('draft',\s*'in_review'\)/i)
  assert.match(sql, /create\s+index\s+if\s+not\s+exists\s+summary_versions_checksum_idx[\s\S]*?where\s+content_checksum\s+is\s+not\s+null/i)
  assert.ok(!/create\s+unique\s+index[^;]*?summary_versions_checksum_idx/i.test(sql), 'checksum index must not be unique')
}

function verifiesDenyByDefaultRlsAndValidation(): void {
  assert.match(sql, /alter\s+table\s+public\.summary_versions\s+enable\s+row\s+level\s+security/i)
  assert.ok(!/\bcreate\s+policy\b/i.test(sql), '043 must enable RLS without policies')
  assert.match(sql, /revoke\s+all\s+on\s+table\s+public\.summary_versions\s+from\s+public,\s*anon,\s*authenticated/i)
  assert.ok(migration.includes('$kp_summary_versions_preflight$'))
  assert.ok(migration.includes('$kp_summary_versions_assertions$'))
  for (const catalog of [
    'information_schema.columns',
    'pg_constraint',
    'pg_index',
    'pg_trigger',
    'pg_policies',
    'c.relrowsecurity',
  ]) {
    assert.ok(migration.includes(catalog), `043 validation must inspect ${catalog}`)
  }
}

const tests: Array<{ name: string; run: () => void }> = [
  { name: 'production-safe identity and migration 042 dependency', run: verifiesProductionSafeIdentityAndDependency },
  { name: 'SummaryVersion scope only', run: verifiesSummaryVersionScopeOnly },
  { name: 'frozen SummaryVersion columns', run: verifiesFrozenColumns },
  { name: 'keys, constraints, and same-parent pointer', run: verifiesKeysConstraintsAndSameParentPointer },
  { name: 'lifecycle and publication evidence', run: verifiesLifecycleAndPublicationEvidence },
  { name: 'immutability and retention triggers', run: verifiesImmutabilityAndRetentionTriggers },
  { name: 'frozen SummaryVersion indexes', run: verifiesFrozenIndexes },
  { name: 'deny-by-default RLS and fail-closed validation', run: verifiesDenyByDefaultRlsAndValidation },
]

for (const test of tests) {
  test.run()
  process.stdout.write(`✓ ${test.name}\n`)
}

process.stdout.write(`\n${tests.length} Knowledge Platform migration 043 tests passed.\n`)
