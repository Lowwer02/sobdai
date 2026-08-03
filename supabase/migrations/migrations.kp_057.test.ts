import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const migrationDir = dirname(fileURLToPath(import.meta.url))
const migrationName = '057_kp_transactional_persistence_api.sql'
const sql = readFileSync(join(migrationDir, migrationName), 'utf8')
const design = readFileSync(
  join(migrationDir, '..', '..', 'knowledge_platform_sql_migration_design_v1.md'),
  'utf8'
)

const functionNames = [
  'kp_persist_require_actor',
  'kp_persist_create_compatibility_summary',
  'kp_persist_update_compatibility_draft',
  'kp_persist_publish_compatibility_revision',
  'kp_persist_retire_compatibility_revision',
  'kp_persist_reassign_compatibility_package',
  'kp_persist_replace_summary_sources',
  'kp_persist_attach_package_summary',
  'kp_persist_detach_package_summary',
  'kp_persist_register_summary_alias',
] as const

function verifiesIdentityAndFrozenResponsibility(): void {
  const files = readdirSync(migrationDir)
  const kpNumbered = files
    .filter((name) => /^\d+_kp_.+\.sql$/.test(name))
    .map((name) => Number(name.slice(0, 3)))

  assert.equal(Math.max(...kpNumbered), 57)
  assert.equal(files.filter((name) => /^057_.+\.sql$/.test(name)).length, 1)
  assert.ok(files.includes('056_kp_read_projections.sql'))
  assert.match(design, /## 057 — `057_kp_transactional_persistence_api\.sql`/i)
  assert.match(design, /Provide atomic persistence operations used by the Application Service/i)
  assert.match(sql, /frozen transactional persistence API/i)
}

function verifiesDependencyAndDormantBoundaries(): void {
  for (const prerequisite of [
    'public.summaries',
    'public.summary_versions',
    'public.summary_reference_documents',
    'public.summary_version_reference_documents',
    'public.package_summaries',
    'public.kp_can_read_package_summary(uuid,uuid)',
    'public.kp_can_read_summary_version(uuid,uuid)',
    'public.kp_read_summary_route(text,text)',
    'summaries_summary_code_final_key',
    'summaries_canonical_slug_final_key',
    'package_summaries_package_legacy_slug_final_key',
  ]) {
    assert.match(
      sql,
      new RegExp(prerequisite.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i')
    )
  }

  assert.doesNotMatch(sql, /create\s+table|alter\s+table|create\s+(?:unique\s+)?index|create\s+trigger|create\s+policy/i)
  assert.match(sql, /kp_dual_write_summary/i)
  assert.match(sql, /kp_dual_write_publish/i)
  assert.match(sql, /remain application-owned and default-off/i)
  assert.match(sql, /no audit\/outbox table is invented/i)
}

function verifiesPersistenceFunctionSetAndAtomicBoundaries(): void {
  for (const functionName of functionNames) {
    assert.match(
      sql,
      new RegExp(`create\\s+or\\s+replace\\s+function\\s+public\\.${functionName}\\b`, 'i')
    )
  }

  assert.match(sql, /create\s+or\s+replace\s+function\s+public\.kp_persist_create_compatibility_summary[\s\S]*?insert\s+into\s+public\.summaries[\s\S]*?insert\s+into\s+public\.summary_versions[\s\S]*?insert\s+into\s+public\.package_summaries/i)
  assert.match(sql, /create\s+or\s+replace\s+function\s+public\.kp_persist_publish_compatibility_revision[\s\S]*?delete\s+from\s+public\.summary_version_reference_documents[\s\S]*?update\s+public\.summary_versions[\s\S]*?update\s+public\.summaries[\s\S]*?update\s+public\.package_summaries/i)
  assert.match(sql, /for\s+update/i)
  assert.match(sql, /jsonb_to_recordset\(p_source_snapshots\)/i)
  assert.match(sql, /active pinned PackageSummary still selects/i)
  assert.match(sql, /legacy compatibility placement/i)
}

function verifiesSecurityAndBoundedGrants(): void {
  const functionBlocks = sql.match(/create\s+or\s+replace\s+function[\s\S]*?\$function\$/gi) ?? []
  assert.equal(functionBlocks.length, functionNames.length)
  for (const block of functionBlocks) {
    assert.match(block, /security\s+definer/i)
    assert.match(block, /set\s+search_path\s*=\s*pg_catalog,\s*public,\s*pg_temp/i)
    assert.match(block, /set\s+lock_timeout\s*=\s*'5s'/i)
  }

  assert.match(sql, /revoke\s+all\s+on\s+function[\s\S]*?from\s+public,\s*anon,\s*authenticated/i)
  assert.match(sql, /grant\s+execute\s+on\s+function[\s\S]*?to\s+service_role/i)
  assert.doesNotMatch(sql, /grant\s+execute\s+on\s+function[\s\S]*?to\s+anon/i)
  assert.doesNotMatch(sql, /grant\s+execute\s+on\s+function[\s\S]*?to\s+authenticated/i)
  assert.match(sql, /to_regprocedure\(expected\.function_name\)/i)
  assert.match(sql, /has_function_privilege\('public',\s*v_function,\s*'EXECUTE'\)/i)
  assert.match(sql, /notify\s+pgrst,\s*'reload schema'/i)
}

function verifiesNoDeploymentWritesOrFrozenSystemDrift(): void {
  assert.doesNotMatch(sql, /\b(?:select|call)\s+public\.kp_persist_/i)
  assert.doesNotMatch(sql, /\b(?:insert\s+into|update|delete\s+from)\s+kp_migration\./i)
  assert.doesNotMatch(sql, /recommendation engine|assessment engine|cutover execution|legacy cleanup/i)
  assert.match(sql, /Application Layer/i)
  assert.match(sql, /Recommendation/i)
  assert.match(sql, /Assessment/i)
  assert.match(sql, /migration 058 owns the later single-writer restriction/i)
}

const tests = [
  ['identity and frozen responsibility', verifiesIdentityAndFrozenResponsibility],
  ['dependency and dormant boundaries', verifiesDependencyAndDormantBoundaries],
  ['persistence function set and atomic boundaries', verifiesPersistenceFunctionSetAndAtomicBoundaries],
  ['security and bounded grants', verifiesSecurityAndBoundedGrants],
  ['no deployment writes or frozen-system drift', verifiesNoDeploymentWritesOrFrozenSystemDrift],
] as const

for (const [name, run] of tests) {
  run()
  process.stdout.write(`✓ ${name}\n`)
}

process.stdout.write(`\n${tests.length} Knowledge Platform migration 057 tests passed.\n`)

