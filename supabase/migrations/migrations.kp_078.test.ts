/**
 * Contract tests for migration 078's public package catalog RPC.
 *
 * PostgreSQL/Supabase is intentionally not required here — static SQL guards
 * verify the additive one-roundtrip catalog function and that the existing
 * get_package_public_counts RPC (016) is left untouched.
 *
 * Run with:
 *   node --experimental-strip-types supabase/migrations/migrations.kp_078.test.ts
 */

import assert from 'node:assert/strict'
import { readdirSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const migrationDir = dirname(fileURLToPath(import.meta.url))
const sql = readFileSync(join(migrationDir, '078_kp_public_package_catalog.sql'), 'utf8')

const executable = sql
  .split('\n')
  .filter((line) => !line.trimStart().startsWith('--'))
  .join('\n')

function verifiesIdentity(): void {
  assert.match(sql, /078_kp_public_package_catalog\.sql/i)
  assert.match(sql, /public\.get_public_package_catalog/i)
  // the file must exist exactly once
  const files = readdirSync(migrationDir)
  assert.equal(files.filter((name) => name === '078_kp_public_package_catalog.sql').length, 1)
}

function verifiesAdditiveOnly(): void {
  // must not alter, drop, or re-create the existing counts RPC (016)
  // (checked on the executable SQL — the header comment may reference it)
  assert.doesNotMatch(executable, /get_package_public_counts/i)
  // must not touch tables, views, policies, or data
  assert.doesNotMatch(executable, /create\s+(?:or\s+replace\s+)?(?:table|view|policy)/i)
  assert.doesNotMatch(executable, /alter\s+table|create\s+index/i)
  assert.doesNotMatch(executable, /drop\s+function/i)
  assert.doesNotMatch(executable, /\b(?:insert|update|delete)\s+into\b/i)
}

function verifiesSecurityModel(): void {
  const fn = executable.match(
    /create\s+or\s+replace\s+function\s+public\.get_public_package_catalog[\s\S]*$/
  )?.[0]
  assert.ok(fn)
  assert.match(fn, /language\s+sql/i)
  assert.match(fn, /security\s+definer/i)
  assert.match(fn, /set\s+search_path\s*=\s*public/i)
  // only published packages
  assert.match(fn, /is_published\s*=\s*true/i)
  // count only published questions (mirrors migration 016 semantics)
  assert.match(fn, /q\.status\s*=\s*'Published'/i)
  // ordering contract matches the page (created_at descending)
  assert.match(fn, /order\s+by\s+p\.created_at\s+desc/i)
  // zero-count packages are preserved
  assert.match(fn, /coalesce\(pp\.total_questions,\s*0\)/i)
  assert.match(fn, /coalesce\(pp\.total_exam_sets,\s*0\)/i)
}

function verifiesGrants(): void {
  assert.match(
    executable,
    /grant\s+execute\s+on\s+function\s+public\.get_public_package_catalog\(\)\s+to\s+anon,\s+authenticated/i
  )
}

function verifiesPostgrestReload(): void {
  assert.match(executable, /NOTIFY\s+pgrst,\s*'reload\s+schema';/i)
}

function verifiesReturnContract(): void {
  // every field consumed by PackageCardData / the /packages page is returned
  for (const column of [
    'id uuid',
    'slug text',
    'exam_year text',
    'current_price numeric',
    'original_price numeric',
    'difficulty text',
    'description text',
    'logo_url text',
    'organization_name text',
    'organization_logo_url text',
    'position_name text',
    'total_questions bigint',
    'total_exam_sets bigint',
  ]) {
    assert.match(sql, new RegExp(column.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i'))
  }
}

const tests = [
  ['identity', verifiesIdentity],
  ['additive only (016 untouched, no schema/data changes)', verifiesAdditiveOnly],
  ['security model + publication/count/order semantics', verifiesSecurityModel],
  ['anon + authenticated execute grants', verifiesGrants],
  ['PostgREST schema reload notification', verifiesPostgrestReload],
  ['return contract covers /packages fields', verifiesReturnContract],
] as const

for (const [name, run] of tests) {
  run()
  process.stdout.write(`✓ ${name}\n`)
}

process.stdout.write(`\n${tests.length} Knowledge Platform migration 078 tests passed.\n`)
