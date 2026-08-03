import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const migrationDir = dirname(fileURLToPath(import.meta.url))
const migrationName = '061_kp_retire_migration_compatibility.sql'
const sql = readFileSync(join(migrationDir, migrationName), 'utf8')
const design = readFileSync(
  join(migrationDir, '..', '..', 'knowledge_platform_sql_migration_design_v1.md'),
  'utf8'
)
const executable = sql
  .split('\n')
  .filter((line) => !line.trimStart().startsWith('--'))
  .join('\n')

function escaped(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function verifiesIdentityAndFrozenResponsibility(): void {
  const files = readdirSync(migrationDir)
  const kpNumbered = files
    .filter((name) => /^\d+_kp_.+\.sql$/.test(name))
    .map((name) => Number(name.slice(0, 3)))

  assert.equal(Math.max(...kpNumbered), 61)
  assert.equal(files.filter((name) => /^061_.+\.sql$/.test(name)).length, 1)
  assert.ok(files.includes('060_kp_remove_legacy_summary_authority.sql'))
  assert.match(design, /## 061 — `061_kp_retire_migration_compatibility\.sql`/i)
  assert.match(
    design,
    /Remove obsolete legacy projections\/persistence functions and temporary migration-control structures after evidence export/i
  )
  assert.match(sql, /final compatibility-retirement infrastructure/i)
  assert.match(sql, /Migration 060 is the highest deployed KP migration/i)
  assert.match(sql, /final frozen Knowledge Platform responsibility 061 only/i)
}

function verifiesCompletionLedger(): void {
  assert.match(executable, /create\s+table\s+if\s+not\s+exists\s+kp_migration\.completion_ledger/i)
  assert.match(executable, /completion_key\s+text\s+primary\s+key/i)
  assert.match(executable, /migration_number\s+integer\s+not\s+null/i)
  assert.match(executable, /migration_number\s*=\s*61/i)
  assert.match(executable, /status\s+in\s*\('pending',\s*'verified',\s*'completed',\s*'blocked'\)/i)
  assert.match(executable, /audit_export_checksum\s+text/i)
  assert.match(executable, /application_deployment\s+text/i)
  assert.match(executable, /application_deployment\s*=\s*'D5'/i)
  assert.match(executable, /create\s+index\s+if\s+not\s+exists\s+kp_completion_ledger_status_idx/i)
  assert.match(executable, /alter\s+table\s+kp_migration\.completion_ledger\s+enable\s+row\s+level\s+security/i)
  assert.match(executable, /create\s+trigger\s+handle_updated_at_kp_completion_ledger/i)
  assert.doesNotMatch(executable, /create\s+policy[\s\S]*?completion_ledger/i)
}

function verifiesFinalReconciliation(): void {
  const reconcile = sql.match(
    /create\s+or\s+replace\s+function\s+kp_migration\.reconcile_final_completion\(\)[\s\S]*?as\s+\$function\$[\s\S]*?\$function\$/i
  )?.[0]
  assert.ok(reconcile)
  for (const field of [
    'target_authority_ready boolean',
    'legacy_columns_remaining bigint',
    'news_summary_cascade_fk_count bigint',
    'news_summary_restrict_fk_count bigint',
    'target_index_missing_count bigint',
    'unknown_legacy_dependency_count bigint',
    'compatibility_view_count bigint',
    'persistence_function_count bigint',
    'migration_control_table_count bigint',
    'migration_control_routine_count bigint',
    'completion_record_present boolean',
    'final_prerequisites_clear boolean',
    'final_completion_clear boolean',
    'mismatch_total bigint',
  ]) {
    assert.match(reconcile, new RegExp(field.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i'))
  }
  assert.match(reconcile, /security\s+definer/i)
  assert.match(reconcile, /stable/i)
  assert.match(reconcile, /pg_catalog\.pg_views/i)
  assert.match(reconcile, /pg_catalog\.pg_proc/i)
  assert.match(reconcile, /pg_catalog\.pg_constraint/i)
  assert.match(reconcile, /completion_ledger/i)
}

function verifiesExplicitGatesAndNoAutomaticCleanup(): void {
  const assertion = sql.match(
    /create\s+or\s+replace\s+function\s+kp_migration\.assert_final_completion\([\s\S]*?as\s+\$function\$[\s\S]*?\$function\$/i
  )?.[0]
  assert.ok(assertion)
  for (const argument of [
    'p_060_stable boolean',
    'p_audit_export_verified boolean',
    'p_application_d5_confirmed boolean',
    'p_compatibility_consumers_absent boolean',
    'p_feature_flags_retired boolean',
    'p_operator_attestation text',
    'p_confirm_destructive boolean',
  ]) {
    assert.match(assertion, new RegExp(argument.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i'))
  }
  assert.match(assertion, /raise\s+exception\s+using/i)
  assert.match(assertion, /errcode\s*=\s*'check_violation'/i)
  assert.match(assertion, /p_confirm_destructive\s+is\s+not\s+true/i)
  assert.match(sql, /Deployment performs no cleanup, cutover, feature-flag change[\s\S]*?row mutation/i)
  assert.match(sql, /Deployment never calls either function|dormant during migration/i)

  assert.doesNotMatch(executable, /perform\s+kp_migration\.execute_final_compatibility_retirement/i)
  assert.doesNotMatch(executable, /select\s+kp_migration\.execute_final_compatibility_retirement/i)
  assert.doesNotMatch(executable, /drop\s+schema\b/i)
  assert.doesNotMatch(executable, /drop\s+(?:table|view|function)\s+[^;]*\s+cascade/i)
  assert.doesNotMatch(executable, /delete\s+from\s+(?:public|summaries|packages|summary_versions|package_summaries)\b/i)
  assert.doesNotMatch(executable, /update\s+(?:public\.)?(?:summaries|packages|summary_versions|package_summaries)\b/i)
}

function verifiesRetirementExecutorAndLedgerWriter(): void {
  const executor = sql.match(
    /create\s+or\s+replace\s+function\s+kp_migration\.execute_final_compatibility_retirement\([\s\S]*?as\s+\$function\$[\s\S]*?\$function\$/i
  )?.[0]
  assert.ok(executor)
  for (const objectName of [
    'kp_read_admin_library',
    'kp_read_summary_picker',
    'kp_read_package_summaries',
    'kp_read_news_summaries',
    'kp_read_recommendation_store',
    'kp_persist_%',
    'summary_reference_document_manifest',
    'summary_version_manifest',
    'summary_alias_manifest',
    'migration_runs',
    'summary_ledger',
    'batch_progress',
  ]) {
    assert.match(executor, new RegExp(objectName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i'))
  }
  assert.match(executor, /kp_migration\.assert_final_completion/i)
  assert.match(executor, /kp_migration\.record_final_completion/i)
  assert.match(executor, /domain_rows_changed.*false/i)
  assert.match(executor, /pg_catalog\.pg_notify/i)
  assert.match(executor, /drop\s+table\s+if\s+exists/i)
  assert.match(executor, /drop\s+function\s+if\s+exists/i)
  assert.ok(
    executor.indexOf('summary_reference_document_manifest') <
      executor.indexOf('Retire only the known Knowledge Platform migration routines')
  )

  const writer = sql.match(
    /create\s+or\s+replace\s+function\s+kp_migration\.record_final_completion\([\s\S]*?as\s+\$function\$[\s\S]*?\$function\$/i
  )?.[0]
  assert.ok(writer)
  assert.match(writer, /insert\s+into\s+kp_migration\.completion_ledger/i)
  assert.match(writer, /on\s+conflict\s*\(completion_key\)\s+do\s+update/i)
  assert.match(writer, /final_completion_clear/i)
}

function verifiesSecurityAndBoundedGrants(): void {
  for (const signature of [
    'kp_migration.reconcile_final_completion()',
    'kp_migration.assert_final_completion(boolean, boolean, boolean, boolean, boolean, text, boolean)',
    'kp_migration.record_final_completion(text, text, boolean, boolean, boolean, boolean)',
    'kp_migration.execute_final_compatibility_retirement(boolean, boolean, boolean, boolean, boolean, text, text, boolean)',
  ]) {
    assert.match(
      executable,
      new RegExp(`revoke\\s+all\\s+on\\s+function\\s+${escaped(signature)}[\\s\\S]*?from\\s+public,\\s*anon,\\s*authenticated`, 'i')
    )
    assert.match(
      executable,
      new RegExp(`grant\\s+execute\\s+on\\s+function\\s+${escaped(signature)}[\\s\\S]*?to\\s+service_role`, 'i')
    )
  }
  assert.match(executable, /security\s+definer/i)
  assert.match(executable, /set\s+search_path\s*=\s*pg_catalog,\s*public,\s*kp_migration,\s*pg_temp/i)
  assert.match(executable, /set\s+lock_timeout\s*=\s*'5s'/i)
  assert.match(executable, /has_function_privilege\('public'/i)
  assert.match(executable, /has_function_privilege\('anon'/i)
  assert.match(executable, /has_function_privilege\('authenticated'/i)
  assert.match(executable, /has_function_privilege\('service_role'/i)
  assert.match(sql, /No PostgREST surface is introduced/i)
}

const tests = [
  ['identity and frozen responsibility', verifiesIdentityAndFrozenResponsibility],
  ['completion ledger', verifiesCompletionLedger],
  ['final reconciliation', verifiesFinalReconciliation],
  ['explicit gates and no automatic cleanup', verifiesExplicitGatesAndNoAutomaticCleanup],
  ['retirement executor and ledger writer', verifiesRetirementExecutorAndLedgerWriter],
  ['security and bounded grants', verifiesSecurityAndBoundedGrants],
] as const

for (const [name, run] of tests) {
  run()
  process.stdout.write(`✓ ${name}\n`)
}

process.stdout.write(`\n${tests.length} Knowledge Platform migration 061 tests passed.\n`)
