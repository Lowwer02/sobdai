import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const migrationDir = dirname(fileURLToPath(import.meta.url))
const migrationName = '055_kp_final_unique_indexes.sql'
const sql = readFileSync(join(migrationDir, migrationName), 'utf8')
const design = readFileSync(join(migrationDir, '..', '..', 'knowledge_platform_sql_migration_design_v1.md'), 'utf8')
const executable = sql.split('\n').filter((line) => !line.trimStart().startsWith('--')).join('\n')
const deploymentSql = executable.replace(/create\s+or\s+replace\s+function[\s\S]*?\$function\$;/gi, '')

function verifiesIdentityAndFrozenResponsibility(): void {
  const files = readdirSync(migrationDir)
  const kpNumbered = files.filter((name) => /^\d+_kp_.+\.sql$/.test(name)).map((name) => Number(name.slice(0, 3)))
  assert.equal(Math.max(...kpNumbered), 55)
  assert.equal(files.filter((name) => /^055_.+\.sql$/.test(name)).length, 1)
  assert.ok(files.includes('054_kp_backfill_aliases_curated.sql'))
  assert.match(sql, /reconciled frozen Migration 053 responsibility/i)
  assert.match(design, /## 053 — `053_kp_final_unique_indexes\.sql`/i)
  assert.match(design, /Production migrations 048 and 055 satisfy the standard-migration criteria/i)
}

function verifiesTransactionalExecutionClass(): void {
  assert.match(executable, /create\s+unique\s+index\s+if\s+not\s+exists/i)
  assert.ok((executable.match(/create\s+unique\s+index\s+if\s+not\s+exists/gi) ?? []).length >= 4)
  assert.doesNotMatch(executable, /create\s+(?:unique\s+)?index\s+concurrently/i)
  assert.doesNotMatch(executable, /^\s*(?:begin|commit|rollback)\s*;\s*$/im)
  assert.match(sql, /Supabase SQL Editor transaction workflow/i)
}

function verifiesAssignedIndexSet(): void {
  for (const indexName of [
    'packages_package_code_key',
    'summaries_summary_code_final_key',
    'summaries_canonical_slug_final_key',
    'package_summaries_package_legacy_slug_final_key',
  ]) {
    assert.match(executable, new RegExp(`create\\s+unique\\s+index\\s+if\\s+not\\s+exists\\s+${indexName}`, 'i'))
    assert.match(executable, new RegExp(`comment\\s+on\\s+index\\s+public\\.${indexName}`, 'i'))
  }
  assert.match(executable, /on\s+public\.packages\s*\(package_code\)/i)
  assert.match(executable, /on\s+public\.summaries\s*\(summary_code\)/i)
  assert.match(executable, /on\s+public\.summaries\s*\(canonical_slug\)/i)
  assert.match(executable, /on\s+public\.package_summaries\s*\(package_id,\s*legacy_slug\)/i)
  assert.match(executable, /summary_aliases_slug_key/i)
  assert.match(executable, /news_summaries_summary_id_idx/i)
}

function verifiesPrerequisiteAndDuplicateGates(): void {
  assert.match(executable, /reconcile_curated_summary_aliases\(uuid\)/i)
  assert.match(executable, /summary_alias_manifest/i)
  assert.match(executable, /duplicate.*package_code/i)
  assert.match(executable, /duplicate.*canonical_slug/i)
  assert.match(executable, /duplicate.*Package-scoped legacy routes/i)
  assert.match(executable, /canonical Summary\/alias namespace collision/i)
  assert.match(executable, /create\s+unique\s+index\s+if\s+not\s+exists/i)
}

function verifiesReadOnlyReconciliationSurface(): void {
  assert.match(executable, /create\s+or\s+replace\s+function\s+kp_migration\.reconcile_final_unique_indexes/i)
  assert.match(executable, /index_total\s+bigint/i)
  assert.match(executable, /valid_total\s+bigint/i)
  assert.match(executable, /duplicate_package_code_total\s+bigint/i)
  assert.match(executable, /namespace_collision_total\s+bigint/i)
  assert.match(executable, /mismatch_total\s+bigint/i)
  assert.match(executable, /stable/i)
  assert.match(executable, /security\s+definer/i)
  assert.match(executable, /grant\s+execute\s+on\s+function[\s\S]*?to\s+service_role/i)
}

function verifiesNoDataOrDomainMutation(): void {
  assert.doesNotMatch(deploymentSql, /\b(?:insert\s+into|update|delete\s+from)\s+public\./i)
  assert.doesNotMatch(executable, /alter\s+table\s+public\./i)
  assert.doesNotMatch(executable, /drop\s+(?:index|constraint|table)\s+public\./i)
  assert.doesNotMatch(executable, /insert\s+into\s+kp_migration\.(?:summary_ledger|batch_progress)/i)
  assert.doesNotMatch(executable, /(?:recommend|assessment|cutover|legacy cleanup)\w*/i)
  assert.doesNotMatch(executable, /\bnotify\s+pgrst\b/i)
}

function verifiesIndexPostValidationAndPermissions(): void {
  assert.match(executable, /indisvalid/i)
  assert.match(executable, /indisready/i)
  assert.match(executable, /indisunique/i)
  assert.match(executable, /indpred\s+is\s+not\s+null/i)
  assert.match(executable, /index_is_partial\s+is\s+distinct\s+from\s+false/i)
  assert.match(executable, /revoke\s+all\s+on\s+function[\s\S]*?from\s+public,\s*anon,\s*authenticated/i)
  assert.match(executable, /has_function_privilege\('anon'/i)
}

const tests = [
  ['identity and frozen responsibility', verifiesIdentityAndFrozenResponsibility],
  ['transactional execution class', verifiesTransactionalExecutionClass],
  ['assigned index set', verifiesAssignedIndexSet],
  ['prerequisite and duplicate gates', verifiesPrerequisiteAndDuplicateGates],
  ['read-only reconciliation surface', verifiesReadOnlyReconciliationSurface],
  ['no data or domain mutation', verifiesNoDataOrDomainMutation],
  ['index post-validation and permissions', verifiesIndexPostValidationAndPermissions],
] as const

for (const [name, run] of tests) {
  run()
  process.stdout.write(`✓ ${name}\n`)
}

process.stdout.write(`\n${tests.length} Knowledge Platform migration 055 tests passed.\n`)
