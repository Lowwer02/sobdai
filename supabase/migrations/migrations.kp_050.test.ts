import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const migrationDir = dirname(fileURLToPath(import.meta.url))
const migrationName = '050_kp_backfill_reference_documents_curated.sql'
const sql = readFileSync(join(migrationDir, migrationName), 'utf8')
const design = readFileSync(join(migrationDir, '..', '..', 'knowledge_platform_sql_migration_design_v1.md'), 'utf8')

const executable = sql
  .split('\n')
  .filter((line) => !line.trimStart().startsWith('--'))
  .join('\n')

const functionBodies = [...executable.matchAll(/as\s+\$function\$([\s\S]*?)\$function\$;/gi)].map((match) => match[1])
const deploymentSql = executable.replace(/create\s+or\s+replace\s+function[\s\S]*?\$function\$;/gi, '')

function verifiesProductionIdentityAndFrozenResponsibility(): void {
  const files = readdirSync(migrationDir)
  const numbered = files
    .filter((name) => /^\d+_.+\.sql$/.test(name))
    .map((name) => Number(name.slice(0, name.indexOf('_'))))

  assert.equal(Math.max(...numbered), 50)
  assert.equal(files.filter((name) => /^050_.+\.sql$/.test(name)).length, 1)
  assert.ok(files.includes('049_kp_backfill_summary_identity.sql'))
  assert.match(sql, /reconciled frozen Migration 048 responsibility/i)
  assert.match(design, /## 048 — `048_kp_backfill_reference_documents_curated\.sql`/i)
  assert.match(design, /Load only human-approved ReferenceDocument identities/i)
}

function verifiesDeploymentDoesNotExecuteDataMigration(): void {
  assert.doesNotMatch(deploymentSql, /\b(?:insert\s+into|update|delete\s+from)\s+public\./i)
  assert.doesNotMatch(deploymentSql, /\b(?:select|call)\s+kp_migration\.(?:approve|apply|confirm_empty)/i)
  assert.doesNotMatch(executable, /update\s+public\.summaries/i)
  assert.doesNotMatch(executable, /insert\s+into\s+public\.summaries/i)
  assert.doesNotMatch(executable, /\bsummary_versions\b/i)
  assert.doesNotMatch(executable, /\bsummary_version_reference_documents\b/i)
  assert.doesNotMatch(executable, /\bpackage_summaries\b/i)
}

function verifiesPrivateRelationalManifest(): void {
  for (const table of [
    'reference_document_manifest',
    'reference_document_alias_manifest',
    'summary_reference_document_manifest',
  ]) {
    assert.match(executable, new RegExp(`create\\s+table\\s+if\\s+not\\s+exists\\s+kp_migration\\.${table}`, 'i'))
    assert.match(executable, new RegExp(`alter\\s+table\\s+kp_migration\\.${table}\\s+enable\\s+row\\s+level\\s+security`, 'i'))
  }
  assert.match(executable, /foreign\s+key\s*\(migration_run_id\)[\s\S]*?references\s+kp_migration\.migration_runs/i)
  assert.match(executable, /references\s+kp_migration\.summary_ledger\s*\(migration_run_id,\s*source_summary_id\)/i)
  assert.match(executable, /state\s+in\s*\('preparing',\s*'approved',\s*'applied'\)/i)
  assert.match(executable, /document_code\s*~\s*'\^DOC-\[0-9\]\{6,\}\$'/i)
  assert.match(executable, /reference_document_alias_manifest_run_locator_key/i)
  assert.match(executable, /kp_summary_reference_document_manifest_(?:un)?pinned_key/i)
}

function verifiesHumanReviewAndExactLegacyBoundary(): void {
  const bodies = functionBodies.join('\n')
  assert.match(executable, /approve_curated_reference_document_manifest/i)
  assert.match(bodies, /s\.document\s+is\s+distinct\s+from\s+r\.source_document_text/i)
  assert.match(bodies, /l\.target_summary_id\s+is\s+distinct\s+from\s+s\.id/i)
  assert.match(bodies, /unknown actor/i)
  assert.match(bodies, /at least one approved Summary relationship/i)
  assert.match(executable, /guard_curated_reference_manifest_child/i)
  assert.match(executable, /immutable after approval/i)
}

function verifiesAtomicAssignedWritesAndLedgerIntegration(): void {
  const apply = executable.match(
    /create\s+or\s+replace\s+function\s+kp_migration\.apply_curated_reference_document_unit[\s\S]*?as\s+\$function\$([\s\S]*?)\$function\$;/i,
  )
  assert.ok(apply)
  const body = apply[1]
  assert.match(body, /insert\s+into\s+public\.reference_documents/i)
  assert.match(body, /insert\s+into\s+public\.reference_document_versions/i)
  assert.match(body, /'verified'/i)
  assert.match(body, /insert\s+into\s+public\.reference_document_aliases/i)
  assert.match(body, /insert\s+into\s+public\.summary_reference_documents/i)
  assert.match(body, /update\s+kp_migration\.summary_ledger/i)
  assert.match(body, /insert\s+into\s+kp_migration\.batch_progress/i)
  assert.match(body, /pg_catalog\.setval[\s\S]*?reference_document_code_seq/i)
  assert.doesNotMatch(body, /\bquestions\b/i)
}

function verifiesEmptyReconciliationAndPermissions(): void {
  assert.match(executable, /confirm_empty_curated_reference_manifest/i)
  assert.match(executable, /reconcile_curated_reference_documents/i)
  assert.match(executable, /'approved_empty'/i)
  assert.match(executable, /mismatch_total\s+bigint/i)
  assert.match(executable, /revoke\s+all\s+on\s+table[\s\S]*?from\s+public,\s*anon,\s*authenticated/i)
  assert.match(executable, /grant\s+execute\s+on\s+function[\s\S]*?to\s+service_role/i)
  assert.doesNotMatch(executable, /create\s+policy/i)
  assert.doesNotMatch(executable, /\b(?:recommend|assessment|cutover)\w*\b/i)
}

const tests = [
  ['production identity and frozen responsibility', verifiesProductionIdentityAndFrozenResponsibility],
  ['deployment does not execute data migration', verifiesDeploymentDoesNotExecuteDataMigration],
  ['private relational manifest', verifiesPrivateRelationalManifest],
  ['human review and exact legacy boundary', verifiesHumanReviewAndExactLegacyBoundary],
  ['atomic assigned writes and ledger integration', verifiesAtomicAssignedWritesAndLedgerIntegration],
  ['empty manifest, reconciliation, and permissions', verifiesEmptyReconciliationAndPermissions],
] as const

for (const [name, run] of tests) {
  run()
  process.stdout.write(`✓ ${name}\n`)
}

process.stdout.write(`\n${tests.length} Knowledge Platform migration 050 tests passed.\n`)
