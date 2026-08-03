import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const migrationDir = dirname(fileURLToPath(import.meta.url))
const migrationName = '056_kp_read_projections.sql'
const sql = readFileSync(join(migrationDir, migrationName), 'utf8')
const design = readFileSync(join(migrationDir, '..', '..', 'knowledge_platform_sql_migration_design_v1.md'), 'utf8')
const executable = sql.split('\n').filter((line) => !line.trimStart().startsWith('--')).join('\n')

function verifiesIdentityAndFrozenResponsibility(): void {
  const files = readdirSync(migrationDir)
  const kpNumbered = files
    .filter((name) => /^\d+_kp_.+\.sql$/.test(name))
    .map((name) => Number(name.slice(0, 3)))

  assert.equal(Math.max(...kpNumbered), 56)
  assert.equal(files.filter((name) => /^056_.+\.sql$/.test(name)).length, 1)
  assert.ok(files.includes('055_kp_final_unique_indexes.sql'))
  assert.match(sql, /frozen consumer read projections/i)
  assert.match(design, /## 056 — `056_kp_read_projections\.sql`/i)
  assert.match(design, /creates views\/functions for Summary Library, Picker, Public Package, Public Summary\/resolver, legacy compatibility, News, and Recommendation ContentStore/i)
}

function verifiesProjectionSetAndReadOnlyShape(): void {
  for (const relationName of [
    'kp_read_admin_library',
    'kp_read_summary_picker',
    'kp_read_package_summaries',
    'kp_read_news_summaries',
    'kp_read_recommendation_store',
  ]) {
    assert.match(executable, new RegExp(`create\\s+or\\s+replace\\s+view\\s+public\\.${relationName}`, 'i'))
    assert.match(executable, new RegExp(`${relationName}[\\s\\S]{0,320}security_invoker\\s*=\\s*true`, 'i'))
    assert.match(executable, new RegExp(`comment\\s+on\\s+view\\s+public\\.${relationName}`, 'i'))
  }

  assert.match(executable, /create\s+or\s+replace\s+function\s+public\.kp_read_summary_route\(\s*p_slug\s+text[\s\S]*?p_package_slug\s+text\s+default\s+null/i)
  assert.match(executable, /returns\s+table\s*\([\s\S]*?content_md\s+text[\s\S]*?source_citations\s+jsonb/i)
  assert.match(executable, /resolved_by\s+text/i)
  assert.match(executable, /canonical|alias|legacy/i)
}

function verifiesDependenciesAndIndexGates(): void {
  for (const prerequisite of [
    'public.kp_can_read_package_summary(uuid,uuid)',
    'public.kp_can_read_summary_version(uuid,uuid)',
    'kp_migration.reconcile_final_unique_indexes()',
    'packages_package_code_key',
    'summaries_summary_code_final_key',
    'summaries_canonical_slug_final_key',
    'package_summaries_package_legacy_slug_final_key',
  ]) {
    assert.match(executable, new RegExp(prerequisite.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i'))
  }
  assert.match(executable, /indisunique/i)
  assert.match(executable, /indisvalid/i)
  assert.match(executable, /indisready/i)
}

function verifiesEntitlementAndCitationBoundaries(): void {
  assert.match(executable, /kp_can_read_package_summary\(ps\.package_id,\s*ps\.summary_id\)/i)
  assert.match(executable, /kp_can_read_summary_version\(ps\.summary_id,\s*sv\.id\)/i)
  assert.match(executable, /s\.is_published\s*=\s*true/i)
  assert.match(executable, /ps\.status\s*=\s*'active'/i)
  assert.match(executable, /p\.is_published\s*=\s*true/i)
  assert.match(executable, /v\.status\s+in\s*\('verified',\s*'superseded'\)/i)
  assert.match(executable, /jsonb_build_object/i)
  assert.match(executable, /content_md/i)
  assert.match(executable, /no Markdown|never Markdown/i)
}

function verifiesResolverSecurityAndGrants(): void {
  assert.match(executable, /language\s+sql[\s\S]*?stable[\s\S]*?security\s+definer[\s\S]*?set\s+search_path\s*=\s*pg_catalog,\s*public,\s*pg_temp/i)
  assert.match(executable, /revoke\s+all\s+on\s+function\s+public\.kp_read_summary_route\(text,\s*text\)[\s\S]*?from\s+public,\s*anon,\s*authenticated/i)
  assert.match(executable, /grant\s+execute\s+on\s+function\s+public\.kp_read_summary_route\(text,\s*text\)[\s\S]*?to\s+anon,\s*authenticated,\s*service_role/i)
  assert.match(executable, /grant\s+select[\s\S]*?kp_read_package_summaries[\s\S]*?to\s+anon,\s*authenticated,\s*service_role/i)
  assert.match(executable, /revoke\s+select\s+on\s+table[\s\S]*?reference_documents[\s\S]*?from\s+anon/i)
  assert.match(executable, /has_function_privilege\('public'/i)
  assert.match(executable, /has_function_privilege\('anon'/i)
  assert.match(executable, /prosecdef/i)
  assert.match(executable, /proconfig/i)
}

function verifiesNoSchemaOrDataMutation(): void {
  assert.doesNotMatch(executable, /create\s+table/i)
  assert.doesNotMatch(executable, /alter\s+table/i)
  assert.doesNotMatch(executable, /create\s+(?:unique\s+)?index/i)
  assert.doesNotMatch(executable, /create\s+trigger/i)
  assert.doesNotMatch(executable, /create\s+policy/i)
  assert.doesNotMatch(executable, /\b(?:insert\s+into|update\s+public\.|delete\s+from\s+public\.)/i)
  assert.doesNotMatch(executable, /(?:backfill|cutover|legacy cleanup|dual.write|recommendation engine|assessment engine)/i)
}

function verifiesSchemaReloadAndFlagBoundaries(): void {
  assert.match(sql, /kp_shadow_admin_library/i)
  assert.match(sql, /kp_shadow_package_read/i)
  assert.match(sql, /kp_shadow_summary_read/i)
  assert.match(sql, /kp_shadow_recommendation_store/i)
  assert.match(sql, /all served target\s+read flags default-off/i)
  assert.match(executable, /notify\s+pgrst,\s*'reload schema'/i)
}

const tests = [
  ['identity and frozen responsibility', verifiesIdentityAndFrozenResponsibility],
  ['projection set and read-only shape', verifiesProjectionSetAndReadOnlyShape],
  ['dependencies and index gates', verifiesDependenciesAndIndexGates],
  ['entitlement and citation boundaries', verifiesEntitlementAndCitationBoundaries],
  ['resolver security and grants', verifiesResolverSecurityAndGrants],
  ['no schema or data mutation', verifiesNoSchemaOrDataMutation],
  ['schema reload and flag boundaries', verifiesSchemaReloadAndFlagBoundaries],
] as const

for (const [name, run] of tests) {
  run()
  process.stdout.write(`✓ ${name}\n`)
}

process.stdout.write(`\n${tests.length} Knowledge Platform migration 056 tests passed.\n`)
