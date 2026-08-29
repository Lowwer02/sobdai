/**
 * Static contract tests for AdSense Conservative (M3) — migration 087.
 *
 * These tests intentionally do not connect to a database. They verify the
 * migration's executable SQL text only (mirrors migrations.085.test.ts).
 *
 * Run with:
 *   node --test supabase/migrations/migrations.087.test.ts
 */

import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import test from 'node:test'

const migrationDir = dirname(fileURLToPath(import.meta.url))
const migrationName = '087_adsense_content_toggle.sql'
const migration = readFileSync(join(migrationDir, migrationName), 'utf8')
const executableSql = migration
  .split('\n')
  .filter((line) => !line.trimStart().startsWith('--'))
  .join('\n')

test('087 exists as a unique migration (next canonical number after 086)', () => {
  const files = readdirSync(migrationDir)
  assert.equal(files.filter((name) => /^087_.+\.sql$/.test(name)).length, 1)
})

test('087 adds the adsense_enabled opt-in to news + articles additively (default-off)', () => {
  for (const table of ['news', 'articles']) {
    assert.match(
      executableSql,
      new RegExp(
        `alter\\s+table\\s+public\\.${table}\\s+add\\s+column\\s+if\\s+not\\s+exists\\s+adsense_enabled\\s+boolean\\s+not\\s+null\\s+default\\s+false`,
        'i'
      ),
      `${table}.adsense_enabled must be additive, not-null, default false`
    )
  }
})

test('087 is strictly additive: no drops, renames, or RLS policy changes', () => {
  assert.doesNotMatch(executableSql, /drop\s+(table|column|policy|index|trigger)/i)
  assert.doesNotMatch(executableSql, /rename/i)
  assert.doesNotMatch(executableSql, /create\s+policy/i, 'no new RLS policies required')
  assert.doesNotMatch(executableSql, /alter\s+table[\s\S]*?disable\s+row\s+level\s+security/i)
  assert.doesNotMatch(executableSql, /grant|revoke/i, 'no privilege changes required')
})

test('087 stores NO per-content AdSense ids (platform env config only)', () => {
  assert.doesNotMatch(executableSql, /adsense_(client|slot|publisher)_id/i)
  assert.doesNotMatch(executableSql, /pub-\d+/i)
})

test('087 reloads the PostgREST schema', () => {
  assert.match(executableSql, /notify\s+pgrst,\s*'reload\s+schema'/i)
})

test('087 ships verification queries for the operator', () => {
  assert.match(migration, /information_schema\.columns/i)
  assert.match(migration, /adsense_enabled/i)
})
