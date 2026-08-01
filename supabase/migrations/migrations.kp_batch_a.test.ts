/**
 * Static contract tests for Knowledge Platform Implementation Sprint 1,
 * Batch A migrations 035 and 036.
 *
 * These tests intentionally do not execute SQL: this repository has no local
 * Supabase/PostgreSQL runtime. They pin the frozen migration responsibilities
 * and prevent Batch B+ scope, destructive preflight behavior, public exposure,
 * or operational-ledger coupling to domain delete semantics.
 *
 * Run:
 *   node --experimental-strip-types supabase/migrations/migrations.kp_batch_a.test.ts
 */

import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const migrationDir = dirname(fileURLToPath(import.meta.url))
const m035 = readFileSync(join(migrationDir, '035_kp_preflight_guards.sql'), 'utf8')
const m036 = readFileSync(join(migrationDir, '036_kp_migration_control.sql'), 'utf8')

function withoutLineComments(sql: string): string {
  return sql
    .split('\n')
    .filter((line) => !line.trimStart().startsWith('--'))
    .join('\n')
}

const m035Sql = withoutLineComments(m035)
const m036Sql = withoutLineComments(m036)

function verifiesBatchAPredecessorsRemainPresent(): void {
  const sqlFiles = readdirSync(migrationDir).filter((name) => name.endsWith('.sql'))
  assert.ok(sqlFiles.includes('034_news_storage.sql'), 'migration 034 predecessor must exist')
  assert.ok(sqlFiles.includes('035_kp_preflight_guards.sql'), 'migration 035 must exist')
  assert.ok(sqlFiles.includes('036_kp_migration_control.sql'), 'migration 036 must exist')
  assert.ok(sqlFiles.includes('037_news_cta_config.sql'), 'production migration 037 must remain present')
}

function verifies035IsReadOnly(): void {
  for (const forbidden of [
    /\bcreate\s+table\b/i,
    /\balter\s+table\b/i,
    /\bdrop\s+table\b/i,
    /\binsert\s+into\b/i,
    /\bupdate\s+public\./i,
    /\bdelete\s+from\b/i,
    /\bcreate\s+(?:or\s+replace\s+)?function\b/i,
    /\bcreate\s+policy\b/i,
  ]) {
    assert.ok(!forbidden.test(m035Sql), `035 must be read-only; forbidden pattern: ${forbidden}`)
  }
}

function verifies035ChecksFrozenBaseline(): void {
  for (const requiredText of [
    "extname = 'uuid-ossp'",
    "to_regprocedure('public.handle_updated_at()')",
    "to_regclass('supabase_migrations.schema_migrations')",
    "where version = ''034''",
    "('summaries', 'content_md', 'text', 'NO')",
    "('summaries', 'package_id', 'uuid', 'NO')",
    "('summaries', 'display_order', 'int4', 'NO')",
    "('summaries', 'released_at', 'timestamptz', 'YES')",
    "('packages', 'package_code', 'text', 'NO')",
    "('news_summaries', 'summary_id', 'uuid', 'NO')",
    "pg_get_constraintdef(c.oid) = 'UNIQUE (package_id, slug)'",
    "pg_get_constraintdef(c.oid) = 'PRIMARY KEY (news_id, summary_id)'",
    "c.confdeltype = 'c'",
    'c.relrowsecurity',
  ]) {
    assert.ok(m035.includes(requiredText), `035 missing frozen baseline assertion: ${requiredText}`)
  }
}

function verifies035ChecksSupabaseAndRbacDrift(): void {
  for (const role of ['anon', 'authenticated', 'service_role']) {
    assert.ok(m035.includes(`('${role}')`), `035 must require Supabase role: ${role}`)
  }
  assert.match(m035, /rolname\s*=\s*'service_role'[\s\S]*?rolbypassrls/i)
  for (const role of ['owner', 'admin', 'editor', 'support', 'user']) {
    assert.ok(m035.includes(`not ilike '%${role}%'`), `035 must detect missing RBAC role: ${role}`)
  }
}

function verifies036CreatesOnlyPrivateControlInfrastructure(): void {
  assert.match(m036Sql, /create\s+schema\s+if\s+not\s+exists\s+kp_migration/i)
  for (const table of ['migration_runs', 'summary_ledger', 'batch_progress']) {
    assert.match(
      m036Sql,
      new RegExp(`create\\s+table\\s+if\\s+not\\s+exists\\s+kp_migration\\.${table}`, 'i'),
      `036 must create kp_migration.${table}`,
    )
  }
  assert.ok(
    !/create\s+table\s+(?:if\s+not\s+exists\s+)?public\./i.test(m036Sql),
    '036 must not create a public/domain table',
  )
}

function verifies036DoesNotCoupleLedgerToDomainDeletes(): void {
  assert.ok(
    !/references\s+public\.(?:summaries|packages)/i.test(m036Sql),
    '036 ledger must record domain UUID values without domain FKs',
  )
  assert.match(
    m036Sql,
    /references\s+kp_migration\.migration_runs\s*\(\s*id\s*\)\s*on\s+delete\s+restrict/i,
    '036 must keep internal run→ledger/progress integrity',
  )
  assert.ok(
    m036.includes('target_summary_id is null or target_summary_id = source_summary_id'),
    '036 must pin one-to-one Summary identity preservation',
  )
}

function verifies036PinsLedgerStateAndSuccessInvariants(): void {
  for (const state of ['pending', 'in_progress', 'succeeded', 'failed', 'stale', 'skipped']) {
    assert.ok(m036.includes(`'${state}'`), `summary ledger state missing: ${state}`)
  }
  for (const requiredTarget of [
    'target_summary_id is not null',
    'target_revision_id is not null',
    "nullif(btrim(target_summary_code), '') is not null",
    "nullif(btrim(target_canonical_slug), '') is not null",
    'target_package_id is not null',
    "nullif(btrim(target_legacy_slug), '') is not null",
    "nullif(btrim(target_content_checksum), '') is not null",
    'completed_at is not null',
  ]) {
    assert.ok(m036.includes(requiredTarget), `succeeded ledger invariant missing: ${requiredTarget}`)
  }
  assert.ok(
    m036.includes('processed_count = succeeded_count + failed_count + skipped_count'),
    'batch progress counts must reconcile',
  )
}

function verifies036IndexesAndRls(): void {
  for (const indexName of [
    'kp_migration_runs_status_created_idx',
    'kp_summary_ledger_run_state_idx',
    'kp_summary_ledger_source_summary_idx',
    'kp_summary_ledger_target_revision_idx',
    'kp_summary_ledger_run_summary_code_key',
    'kp_summary_ledger_run_canonical_slug_key',
    'kp_batch_progress_run_state_idx',
    'kp_batch_progress_running_heartbeat_idx',
  ]) {
    assert.ok(m036.includes(indexName), `036 missing index: ${indexName}`)
  }

  for (const table of ['migration_runs', 'summary_ledger', 'batch_progress']) {
    assert.match(
      m036Sql,
      new RegExp(`alter\\s+table\\s+kp_migration\\.${table}\\s+enable\\s+row\\s+level\\s+security`, 'i'),
      `036 must enable RLS on kp_migration.${table}`,
    )
  }

  assert.match(m036Sql, /revoke\s+all\s+on\s+schema\s+kp_migration\s+from\s+public,\s*anon,\s*authenticated/i)
  assert.match(m036Sql, /grant\s+usage\s+on\s+schema\s+kp_migration\s+to\s+service_role/i)
  assert.ok(!/grant[\s\S]*?\bto\s+(?:anon|authenticated)\b/i.test(m036Sql), '036 must not grant clients access')
}

function verifies036UsesExistingSupabaseConventions(): void {
  assert.match(m036Sql, /default\s+uuid_generate_v4\s*\(\s*\)/i)
  assert.match(m036Sql, /timestamptz\s+not\s+null\s+default\s+now\s*\(\s*\)/i)
  assert.match(m036Sql, /execute\s+procedure\s+public\.handle_updated_at\s*\(\s*\)/i)
  assert.ok(m036.includes('$kp_control_assertions$'), '036 must fail closed on incompatible pre-existing objects')
}

const tests: Array<{ name: string; run: () => void }> = [
  { name: 'Batch A predecessors remain present', run: verifiesBatchAPredecessorsRemainPresent },
  { name: '035 is read-only', run: verifies035IsReadOnly },
  { name: '035 checks frozen baseline', run: verifies035ChecksFrozenBaseline },
  { name: '035 checks Supabase/RBAC drift', run: verifies035ChecksSupabaseAndRbacDrift },
  { name: '036 creates only private control infrastructure', run: verifies036CreatesOnlyPrivateControlInfrastructure },
  { name: '036 does not couple ledger to domain deletes', run: verifies036DoesNotCoupleLedgerToDomainDeletes },
  { name: '036 pins ledger state/success invariants', run: verifies036PinsLedgerStateAndSuccessInvariants },
  { name: '036 indexes and RLS', run: verifies036IndexesAndRls },
  { name: '036 follows existing Supabase conventions', run: verifies036UsesExistingSupabaseConventions },
]

for (const test of tests) {
  test.run()
  process.stdout.write(`✓ ${test.name}\n`)
}

process.stdout.write(`\n${tests.length} Knowledge Platform Batch A migration tests passed.\n`)
