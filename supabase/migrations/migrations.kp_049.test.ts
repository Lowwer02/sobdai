import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const migrationDir = dirname(fileURLToPath(import.meta.url))
const migrationName = '049_kp_backfill_summary_identity.sql'
const sql = readFileSync(join(migrationDir, migrationName), 'utf8')
const design = readFileSync(join(migrationDir, '..', '..', 'knowledge_platform_sql_migration_design_v1.md'), 'utf8')

function executableSql(source: string): string {
  return source
    .split('\n')
    .filter((line) => !line.trimStart().startsWith('--'))
    .join('\n')
}

const executable = executableSql(sql)
const functionMatch = executable.match(
  /create\s+or\s+replace\s+function\s+kp_migration\.backfill_summary_identity_unit[\s\S]*?as\s+\$function\$([\s\S]*?)\$function\$;/i,
)
assert.ok(functionMatch, '049 must define the private Summary identity execution unit')
const functionBody = functionMatch[1]
const deploymentSql = executable.replace(functionMatch[0], '')

function verifiesProductionIdentityAndFrozenResponsibility(): void {
  const numbered = readdirSync(migrationDir)
    .filter((name) => /^\d+_.+\.sql$/.test(name))
    .map((name) => Number(name.slice(0, name.indexOf('_'))))

  assert.equal(Math.max(...numbered), 49, '049 must be the next production migration after committed 048')
  assert.ok(readdirSync(migrationDir).includes('048_kp_online_indexes.sql'))
  assert.match(sql, /reconciled frozen Migration 047 responsibility/i)
  assert.match(design, /## 047 — `047_kp_backfill_summary_identity\.sql`/i)
  assert.match(design, /Populate stable Summary root identity and canonical metadata/i)
}

function verifiesDeploymentDoesNotExecuteBackfill(): void {
  assert.doesNotMatch(deploymentSql, /\b(?:insert\s+into|update|delete\s+from)\s+(?:public\.summaries|kp_migration\.summary_ledger)/i)
  assert.doesNotMatch(deploymentSql, /\bcall\s+kp_migration\.backfill_summary_identity_unit/i)
  assert.doesNotMatch(deploymentSql, /\bselect\s+kp_migration\.backfill_summary_identity_unit/i)
  assert.doesNotMatch(executable, /\bcreate\s+table\b/i)
  assert.doesNotMatch(executable, /\balter\s+table\b/i)
  assert.doesNotMatch(executable, /\bcreate\s+(?:unique\s+)?index\b/i)
  assert.doesNotMatch(executable, /\bcreate\s+trigger\b/i)
  assert.doesNotMatch(executable, /\bcreate\s+policy\b/i)
}

function verifiesFrozenIdentityMapping(): void {
  assert.match(functionBody, /where\s+s\.id\s*=\s*p_source_summary_id[\s\S]*?for\s+update/i)
  assert.match(functionBody, /v_summary\.package_id\s+is\s+distinct\s+from\s+v_ledger\.source_package_id/i)
  assert.match(functionBody, /v_summary\.updated_at\s+is\s+distinct\s+from\s+v_ledger\.source_updated_at/i)
  assert.match(functionBody, /octet_length\(v_summary\.content_md\)\s+is\s+distinct\s+from\s+v_ledger\.source_content_bytes/i)
  assert.match(functionBody, /summary_code\s*=\s*coalesce\(summary_code,\s*v_ledger\.target_summary_code\)/i)
  assert.match(functionBody, /canonical_slug\s*=\s*coalesce\(canonical_slug,\s*v_ledger\.target_canonical_slug\)/i)
  assert.match(functionBody, /canonical_title\s*=\s*coalesce\(canonical_title,\s*title\)/i)
  assert.match(functionBody, /visibility\s*=\s*coalesce\(visibility,\s*'product_entitled'\)/i)
  assert.match(functionBody, /lifecycle_status\s*=\s*coalesce\(lifecycle_status,\s*'active'\)/i)
  assert.match(functionBody, /created_by\s*=\s*coalesce\(created_by,\s*v_run\.created_by\)/i)

  const summaryUpdate = functionBody.match(/update\s+public\.summaries\s+set([\s\S]*?)where\s+id\s*=\s*v_summary\.id/i)
  assert.ok(summaryUpdate, '049 must contain the bounded target-field Summary update')
  for (const legacyColumn of ['package_id', 'title', 'slug', 'content_md', 'read_time_minutes', 'sort_order', 'is_published', 'created_at', 'updated_at']) {
    assert.doesNotMatch(
      summaryUpdate[1],
      new RegExp(`(?:^|,)\\s*${legacyColumn}\\s*=`, 'i'),
      `049 must not mutate legacy authority column ${legacyColumn}`,
    )
  }
}

function verifiesManifestAllocatorLedgerAndPermissions(): void {
  assert.match(functionBody, /does not exactly cover the live Summary inventory/i)
  assert.match(functionBody, /target_summary_code\s+!~\s+'\^SUM-\[0-9\]\{6,\}\$'/i)
  assert.match(functionBody, /pg_catalog\.setval\([\s\S]*?'public\.summary_code_seq'::regclass/i)
  assert.match(functionBody, /update\s+kp_migration\.summary_ledger[\s\S]*?target_summary_id\s*=\s*v_summary\.id/i)
  assert.match(functionBody, /insert\s+into\s+kp_migration\.batch_progress/i)
  assert.match(functionBody, /'summary_identity'/i)
  assert.match(executable, /security\s+definer/i)
  assert.match(executable, /set\s+search_path\s*=\s*pg_catalog,\s*public,\s*kp_migration,\s*pg_temp/i)
  assert.match(executable, /revoke\s+all\s+on\s+function[\s\S]*?from\s+public,\s*anon,\s*authenticated/i)
  assert.match(executable, /grant\s+execute\s+on\s+function[\s\S]*?to\s+service_role/i)
}

function verifiesNoLaterResponsibilities(): void {
  assert.doesNotMatch(functionBody, /\bsummary_versions\b/i)
  assert.doesNotMatch(functionBody, /\bpackage_summaries\b/i)
  assert.doesNotMatch(functionBody, /\bsummary_aliases\b/i)
  assert.doesNotMatch(functionBody, /current_published_version_id\s*=/i)
  assert.doesNotMatch(executable, /\b(?:recommend|assessment|cutover)\w*\b/i)
}

const tests: Array<{ name: string; run: () => void }> = [
  { name: 'production identity and frozen responsibility', run: verifiesProductionIdentityAndFrozenResponsibility },
  { name: 'deployment does not execute backfill', run: verifiesDeploymentDoesNotExecuteBackfill },
  { name: 'frozen Summary identity mapping', run: verifiesFrozenIdentityMapping },
  { name: 'manifest, allocator, ledger, and permissions', run: verifiesManifestAllocatorLedgerAndPermissions },
  { name: 'later responsibilities remain absent', run: verifiesNoLaterResponsibilities },
]

for (const test of tests) {
  test.run()
  process.stdout.write(`✓ ${test.name}\n`)
}

process.stdout.write(`\n${tests.length} Knowledge Platform migration 049 tests passed.\n`)
