/**
 * Static contract tests for the PackageSummary placement foundation.
 *
 * Run:
 *   node --experimental-strip-types supabase/migrations/migrations.kp_045.test.ts
 */

import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const migrationDir = dirname(fileURLToPath(import.meta.url))
const migrationName = '045_kp_package_summaries.sql'
const migration = readFileSync(join(migrationDir, migrationName), 'utf8')
const sql = migration
  .split('\n')
  .filter((line) => !line.trimStart().startsWith('--'))
  .join('\n')

function verifiesIdentityAndDependencies(): void {
  const files = readdirSync(migrationDir).filter((name) => name.endsWith('.sql'))
  for (const required of [
    '042_kp_summaries_expand.sql',
    '043_kp_summary_versions.sql',
    '044_kp_summary_relationships.sql',
    migrationName,
  ]) {
    assert.ok(files.includes(required), `required migration is missing: ${required}`)
  }
  assert.ok(!files.includes('044_kp_package_summaries.sql'), 'PackageSummary must not collide with production 044')
  assert.match(sql, /set\s+local\s+lock_timeout\s*=\s*'5s'/i)
  for (const dependency of ['packages', 'summaries', 'summary_versions']) {
    assert.ok(migration.includes(`'${dependency}'`), `missing dependency guard: ${dependency}`)
  }
}

function verifiesPackageSummaryScopeOnly(): void {
  const createdTables = [...sql.matchAll(/create\s+table\s+if\s+not\s+exists\s+public\.(\w+)/gi)].map((match) => match[1])
  assert.deepEqual(createdTables, ['package_summaries'])
  assert.ok(!/\binsert\s+into\b/i.test(sql), '045 must not backfill placements')
  assert.ok(!/\bupdate\s+public\.(?:packages|summaries|summary_versions)\b/i.test(sql), '045 must not mutate existing domain rows')
  assert.ok(!/\balter\s+table\s+public\.(?:packages|summaries|summary_versions)\b/i.test(sql), '045 must not alter existing domain tables')
  assert.ok(!/\bcreate\s+(?:or\s+replace\s+)?view\b/i.test(sql), '045 must not create read models')
  assert.ok(!/\bcreate\s+(?:or\s+replace\s+)?function\s+public\.(?:publish|backfill|recommend|picker)/i.test(sql), '045 must not create later workflows')
}

function verifiesFrozenCompositeIdentityAndColumns(): void {
  assert.match(sql, /primary\s+key\s*\(package_id,\s*summary_id\)/i)
  assert.ok(!/\bid\s+uuid\s+not\s+null\s+default/i.test(sql), 'frozen pure placement must not add a UUID surrogate identity')
  for (const required of [
    /package_id\s+uuid\s+not\s+null/i,
    /summary_id\s+uuid\s+not\s+null/i,
    /status\s+text\s+not\s+null\s+default\s+'draft'/i,
    /version_policy\s+text\s+not\s+null\s+default\s+'latest_published'/i,
    /pinned_summary_version_id\s+uuid\b/i,
    /sort_order\s+integer\s+not\s+null\s+default\s+0/i,
    /display_order\s+integer\s+not\s+null\s+default\s+0/i,
    /released_at\s+timestamptz\b/i,
    /navigation_label\s+text\b/i,
    /legacy_slug\s+text\b/i,
    /created_by\s+uuid\s+not\s+null/i,
    /created_at\s+timestamptz\s+not\s+null\s+default\s+now\s*\(\s*\)/i,
    /updated_at\s+timestamptz\s+not\s+null\s+default\s+now\s*\(\s*\)/i,
    /activated_by\s+uuid\b/i,
    /activated_at\s+timestamptz\b/i,
    /hidden_by\s+uuid\b/i,
    /hidden_at\s+timestamptz\b/i,
  ]) {
    assert.match(sql, required)
  }
}

function verifiesConstraintsAndDeleteBehavior(): void {
  for (const constraint of [
    'package_summaries_pkey',
    'package_summaries_status_check',
    'package_summaries_version_policy_check',
    'package_summaries_policy_pin_check',
    'package_summaries_optional_text_check',
    'package_summaries_legacy_slug_check',
    'package_summaries_lifecycle_audit_check',
    'package_summaries_package_fkey',
    'package_summaries_summary_fkey',
    'package_summaries_pinned_version_fkey',
  ]) {
    assert.ok(migration.includes(constraint), `missing PackageSummary constraint: ${constraint}`)
  }
  assert.match(sql, /foreign\s+key\s*\(package_id\)[\s\S]*?references\s+public\.packages\s*\(id\)[\s\S]*?on\s+delete\s+cascade/i)
  assert.match(sql, /foreign\s+key\s*\(summary_id\)[\s\S]*?references\s+public\.summaries\s*\(id\)[\s\S]*?on\s+delete\s+restrict/i)
  assert.match(
    sql,
    /foreign\s+key\s*\(summary_id,\s*pinned_summary_version_id\)[\s\S]*?references\s+public\.summary_versions\s*\(summary_id,\s*id\)[\s\S]*?on\s+delete\s+restrict[\s\S]*?deferrable\s+initially\s+deferred/i,
  )
  for (const actor of ['created_by', 'activated_by', 'hidden_by']) {
    assert.match(sql, new RegExp(`foreign\\s+key\\s*\\(${actor}\\)[\\s\\S]*?references\\s+public\\.profiles\\s*\\(id\\)[\\s\\S]*?on\\s+delete\\s+set\\s+null`, 'i'))
  }
}

function verifiesLifecycleAndPolicyRules(): void {
  for (const value of ['draft', 'active', 'hidden', 'latest_published', 'pinned']) {
    assert.ok(migration.includes(`'${value}'`), `missing placement vocabulary: ${value}`)
  }
  assert.match(sql, /version_policy\s*=\s*'latest_published'[\s\S]*?pinned_summary_version_id\s+is\s+null/i)
  assert.match(sql, /version_policy\s*=\s*'pinned'[\s\S]*?pinned_summary_version_id\s+is\s+not\s+null/i)
  for (const transition of [
    /old\.status\s*=\s*'draft'\s+and\s+new\.status\s+in\s*\('active',\s*'hidden'\)/i,
    /old\.status\s*=\s*'active'\s+and\s+new\.status\s*=\s*'hidden'/i,
    /old\.status\s*=\s*'hidden'\s+and\s+new\.status\s+in\s*\('active',\s*'draft'\)/i,
  ]) {
    assert.match(sql, transition)
  }
}

function verifiesFrozenIndexes(): void {
  for (const index of [
    'package_summaries_pkey',
    'package_summaries_package_order_idx',
    'package_summaries_summary_package_idx',
    'package_summaries_pinned_version_idx',
    'package_summaries_package_legacy_slug_key',
    'package_summaries_package_release_idx',
  ]) {
    assert.ok(migration.includes(index), `missing placement index: ${index}`)
  }
  assert.match(sql, /create\s+unique\s+index[\s\S]*?package_summaries_package_legacy_slug_key[\s\S]*?where\s+legacy_slug\s+is\s+not\s+null/i)
}

function verifiesTriggers(): void {
  for (const trigger of [
    'enforce_package_summary_transition',
    'protect_package_summary_identity',
    'handle_updated_at_package_summaries',
  ]) {
    assert.match(sql, new RegExp(`create\\s+trigger\\s+${trigger}`, 'i'))
  }
  assert.ok(migration.includes('new.package_id'))
  assert.ok(migration.includes('new.summary_id'))
}

function verifiesDenyByDefaultRlsAndValidation(): void {
  assert.match(sql, /alter\s+table\s+public\.package_summaries\s+enable\s+row\s+level\s+security/i)
  assert.ok(!/\bcreate\s+policy\b/i.test(sql), '045 must enable RLS without policies')
  assert.match(sql, /revoke\s+all\s+on\s+table\s+public\.package_summaries\s+from\s+public,\s*anon,\s*authenticated/i)
  assert.ok(migration.includes('$kp_package_summaries_preflight$'))
  assert.ok(migration.includes('$kp_package_summaries_assertions$'))
  for (const catalog of ['information_schema.columns', 'pg_constraint', 'pg_index', 'pg_trigger', 'pg_policies', 'c.relrowsecurity']) {
    assert.ok(migration.includes(catalog), `045 validation must inspect ${catalog}`)
  }
}

const tests: Array<{ name: string; run: () => void }> = [
  { name: 'production-safe identity and dependencies', run: verifiesIdentityAndDependencies },
  { name: 'PackageSummary scope only', run: verifiesPackageSummaryScopeOnly },
  { name: 'frozen composite identity and columns', run: verifiesFrozenCompositeIdentityAndColumns },
  { name: 'constraints and delete behavior', run: verifiesConstraintsAndDeleteBehavior },
  { name: 'lifecycle and version-policy rules', run: verifiesLifecycleAndPolicyRules },
  { name: 'frozen placement indexes', run: verifiesFrozenIndexes },
  { name: 'placement triggers', run: verifiesTriggers },
  { name: 'deny-by-default RLS and fail-closed validation', run: verifiesDenyByDefaultRlsAndValidation },
]

for (const test of tests) {
  test.run()
  process.stdout.write(`✓ ${test.name}\n`)
}

process.stdout.write(`\n${tests.length} Knowledge Platform migration 045 tests passed.\n`)
