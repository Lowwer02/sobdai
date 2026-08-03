import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const migrationDir = dirname(fileURLToPath(import.meta.url))
const migrationName = '051_kp_backfill_initial_summary_versions.sql'
const sql = readFileSync(join(migrationDir, migrationName), 'utf8')
const design = readFileSync(join(migrationDir, '..', '..', 'knowledge_platform_sql_migration_design_v1.md'), 'utf8')
const executable = sql.split('\n').filter((line) => !line.trimStart().startsWith('--')).join('\n')
const deploymentSql = executable.replace(/create\s+or\s+replace\s+function[\s\S]*?\$function\$;/gi, '')

function verifiesIdentityAndFrozenResponsibility(): void {
  const files = readdirSync(migrationDir)
  const numbered = files.filter((name) => /^\d+_.+\.sql$/.test(name)).map((name) => Number(name.slice(0, 3)))
  assert.equal(Math.max(...numbered), 51)
  assert.equal(files.filter((name) => /^051_.+\.sql$/.test(name)).length, 1)
  assert.ok(files.includes('050_kp_backfill_reference_documents_curated.sql'))
  assert.match(sql, /reconciled frozen Migration 049 responsibility/i)
  assert.match(design, /## 049 — `049_kp_backfill_initial_summary_versions\.sql`/i)
}

function verifiesDeploymentIsDataInert(): void {
  assert.doesNotMatch(deploymentSql, /\b(?:insert\s+into|update|delete\s+from)\s+public\./i)
  assert.doesNotMatch(deploymentSql, /\b(?:select|call)\s+kp_migration\.(?:refresh|approve|apply)/i)
  assert.doesNotMatch(executable, /update\s+public\.summaries/i)
  assert.doesNotMatch(executable, /insert\s+into\s+public\.reference_documents/i)
  assert.doesNotMatch(executable, /\bpackage_summaries\b/i)
}

function verifiesPrivateManifestsAndSafety(): void {
  assert.match(executable, /create\s+table\s+if\s+not\s+exists\s+kp_migration\.summary_version_manifest/i)
  assert.match(executable, /create\s+table\s+if\s+not\s+exists\s+kp_migration\.summary_version_source_manifest/i)
  assert.match(executable, /mapping_status\s+in\s*\('draft',\s*'published',\s*'quarantined'\)/i)
  assert.match(executable, /state\s+in\s*\('preparing',\s*'approved',\s*'applied'\)/i)
  assert.match(executable, /unique\s*\(target_revision_id\)/i)
  assert.match(executable, /unique\s*\(snapshot_id\)/i)
  assert.match(executable, /guard_initial_summary_version_manifest/i)
  assert.match(executable, /immutable after approval/i)
  assert.match(executable, /enable\s+row\s+level\s+security/i)
  assert.doesNotMatch(executable, /create\s+policy/i)
}

function verifiesFrozenMappingAndProvenance(): void {
  assert.match(executable, /markdown_checksum_algorithm/i)
  assert.match(executable, /read_time_policy_version/i)
  assert.match(executable, /content_schema_version/i)
  assert.match(executable, /synthetic_publication_timestamp_source/i)
  assert.match(executable, /state mapping violates the frozen publication truth table/i)
  assert.match(executable, /v_summary\.read_time_minutes\s+is\s+distinct\s+from\s+v_manifest\.legacy_read_time_minutes/i)
  assert.match(executable, /mapping_status = 'published'[\s\S]*?'in_review'/i)
  assert.match(executable, /set\s+status\s*=\s*'published'/i)
  assert.match(executable, /mapping_status = 'quarantined'/i)
  assert.match(executable, /'QUARANTINED_CONTENT'/i)
}

function verifiesAssignedWritesAndSnapshots(): void {
  const apply = executable.match(/create\s+or\s+replace\s+function\s+kp_migration\.apply_initial_summary_version_unit[\s\S]*?as\s+\$function\$([\s\S]*?)\$function\$;/i)
  assert.ok(apply)
  const body = apply[1]
  assert.match(body, /insert\s+into\s+public\.summary_versions/i)
  assert.match(body, /insert\s+into\s+public\.summary_version_reference_documents/i)
  assert.match(body, /revision_number,\s*status/i)
  assert.match(body, /v_summary\.content_md/i)
  assert.match(body, /update\s+kp_migration\.summary_ledger/i)
  assert.match(body, /insert\s+into\s+kp_migration\.batch_progress/i)
  assert.match(body, /source relationships changed after approval/i)
  assert.match(body, /approved source is no longer available and accepted/i)
  assert.doesNotMatch(body, /current_published_version_id\s*=/i)
  assert.doesNotMatch(body, /insert\s+into\s+public\.summary_reference_documents/i)
}

function verifiesSourceFreezeReconciliationAndPermissions(): void {
  assert.match(executable, /refresh_initial_summary_version_sources/i)
  assert.match(executable, /source manifest differs from reviewed live relationships/i)
  assert.match(executable, /unavailable or unaccepted source/i)
  assert.match(executable, /v\.id\s+is\s+null\s+or\s+v\.status\s+not\s+in\s*\('verified',\s*'superseded'\)/i)
  assert.match(executable, /reconcile_initial_summary_versions/i)
  assert.match(executable, /mismatch_total\s+bigint/i)
  assert.match(executable, /v\.content_md\s+is\s+not\s+distinct\s+from/i)
  assert.match(executable, /public\.summary_version_reference_documents\s+target[\s\S]*?not\s+exists\s*\([\s\S]*?from\s+snapshots/i)
  assert.match(executable, /revoke\s+all\s+on\s+table[\s\S]*?from\s+public,\s*anon,\s*authenticated/i)
  assert.match(executable, /grant\s+execute\s+on\s+function[\s\S]*?to\s+service_role/i)
  assert.doesNotMatch(executable, /\b(?:recommend|assessment|cutover)\w*\b/i)
}

const tests = [
  ['identity and frozen responsibility', verifiesIdentityAndFrozenResponsibility],
  ['deployment is data-inert', verifiesDeploymentIsDataInert],
  ['private manifests and safety', verifiesPrivateManifestsAndSafety],
  ['frozen mapping and provenance', verifiesFrozenMappingAndProvenance],
  ['assigned writes and source snapshots', verifiesAssignedWritesAndSnapshots],
  ['source freeze, reconciliation, and permissions', verifiesSourceFreezeReconciliationAndPermissions],
] as const

for (const [name, run] of tests) {
  run()
  process.stdout.write(`✓ ${name}\n`)
}

process.stdout.write(`\n${tests.length} Knowledge Platform migration 051 tests passed.\n`)
