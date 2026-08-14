import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const migrationDir = dirname(fileURLToPath(import.meta.url))
const migrationName = '073_kp_summary_admin_staff_read.sql'
const sql = readFileSync(join(migrationDir, migrationName), 'utf8')
const migration058 = readFileSync(
  join(migrationDir, '058_kp_restrict_direct_writes.sql'),
  'utf8',
)
const migration060 = readFileSync(
  join(migrationDir, '060_kp_remove_legacy_summary_authority.sql'),
  'utf8',
)
const migration005 = readFileSync(
  join(migrationDir, '005_summary_bank.sql'),
  'utf8',
)
const laterMigrations = [
  '067_kp_summary_bank_compatibility_marker.sql',
  '068_kp_summary_bank_compatibility_writer_core.sql',
  '069_kp_summary_bank_compatibility_publication.sql',
  '070_kp_summary_bank_compatibility_delete.sql',
  '071_kp_summary_bank_compatibility_import.sql',
  '072_kp_summary_bank_compatibility_edit.sql',
].map((name) => readFileSync(join(migrationDir, name), 'utf8'))

function withoutLineComments(source: string): string {
  return source
    .split('\n')
    .filter((line) => !line.trimStart().startsWith('--'))
    .join('\n')
}

const executable = withoutLineComments(sql)

function verifiesIdentityAndPrerequisites(): void {
  const files = readdirSync(migrationDir)
  assert.equal(files.filter((name) => name === migrationName).length, 1)
  assert.match(sql, /073_kp_summary_admin_staff_read\.sql/i)
  assert.match(sql, /public\.summaries/i)
  assert.match(sql, /pg_catalog\.pg_policy/i)
  assert.match(sql, /to_regprocedure\('public\.kp_is_staff\(\)'\)/i)
  assert.match(sql, /p\.prosecdef/i)
  assert.match(sql, /Published summaries viewable by everyone\./i)
}

function verifiesSelectOnlyStaffPolicy(): void {
  const policy = executable.match(
    /create\s+policy\s+kp_f4_4_summary_staff_read[\s\S]*?using\s*\(\s*public\.kp_is_staff\(\)\s*\)/i,
  )?.[0]
  assert.ok(policy)
  assert.match(policy, /on\s+public\.summaries/i)
  assert.match(policy, /for\s+select/i)
  assert.match(policy, /to\s+authenticated/i)
  assert.match(policy, /using\s*\(\s*public\.kp_is_staff\(\)\s*\)/i)
  assert.doesNotMatch(policy, /for\s+(?:insert|update|delete)/i)
  assert.doesNotMatch(policy, /with\s+check/i)
  assert.match(executable, /drop\s+policy\s+if\s+exists\s+kp_f4_4_summary_staff_read\s+on\s+public\.summaries/i)
}

function verifiesExistingSecuritySurfacesRemainIntact(): void {
  assert.match(migration005, /create\s+policy\s+"Published summaries viewable by everyone\."\s+on\s+public\.summaries\s+for\s+select/i)
  assert.match(migration005, /using\s*\(\s*is_published\s*=\s*true\s*\)/i)
  assert.match(migration058, /revoke\s+insert,\s*update,\s*delete,\s*truncate[\s\S]*from\s+public,\s*anon,\s*authenticated/i)
  assert.match(migration058, /security\s+invoker/i)
  assert.match(migration058, /kp_enforce_summary_writer_boundary/i)
  assert.match(migration060, /create\s+policy\s+kp_target_summary_staff_read[\s\S]*?for\s+select[\s\S]*?to\s+authenticated[\s\S]*?public\.kp_is_staff\(\)/i)

  assert.doesNotMatch(sql, /kp_read_admin_library[\s\S]*security\s+definer/i)
  assert.doesNotMatch(sql, /create\s+(?:or\s+replace\s+)?view\s+public\.kp_read_admin_library/i)
  assert.doesNotMatch(sql, /(?:grant|revoke)\s+(?:insert|update|delete|truncate)/i)
  assert.doesNotMatch(sql, /060_kp_remove_legacy_summary_authority|kp_migration\.execute_legacy_summary_authority_removal/i)
  assert.doesNotMatch(sql, /insert\s+into|update\s+public\.|delete\s+from/i)
  assert.doesNotMatch(sql, /alter\s+table|create\s+table|create\s+index/i)
}

function verifiesNoConflictWith067Through072(): void {
  for (const laterMigration of laterMigrations) {
    assert.doesNotMatch(laterMigration, /kp_f4_4_summary_staff_read/i)
  }
}

const tests = [
  ['identity and prerequisites', verifiesIdentityAndPrerequisites],
  ['select-only staff policy', verifiesSelectOnlyStaffPolicy],
  ['existing security surfaces remain intact', verifiesExistingSecuritySurfacesRemainIntact],
  ['no conflict with migrations 067-072', verifiesNoConflictWith067Through072],
] as const

for (const [name, run] of tests) {
  run()
  process.stdout.write(`✓ ${name}\n`)
}

process.stdout.write(`\n${tests.length} Knowledge Platform migration 073 tests passed.\n`)
