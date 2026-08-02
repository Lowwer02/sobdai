import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const migrationDir = dirname(fileURLToPath(import.meta.url))
const migrationName = '048_kp_online_indexes.sql'
const sql = readFileSync(join(migrationDir, migrationName), 'utf8')
const design = readFileSync(join(migrationDir, '..', '..', 'knowledge_platform_sql_migration_design_v1.md'), 'utf8')

function executableSql(source: string): string {
  return source
    .split('\n')
    .filter((line) => !line.trimStart().startsWith('--'))
    .join('\n')
}

const executable = executableSql(sql)

function verifiesNumberReconciliation(): void {
  const numbered = readdirSync(migrationDir)
    .filter((name) => /^\d+_.+\.sql$/.test(name))
    .map((name) => Number(name.slice(0, name.indexOf('_'))))
  const max = Math.max(...numbered)
  assert.equal(max, 48, '048 must be the next migration after the existing 047 production migration')
  assert.ok(readdirSync(migrationDir).includes('047_homepage_latest_news.sql'))
  assert.match(sql, /frozen SQL Migration Design assigns[\s\S]*?unit to migration 046/i)
  assert.match(sql, /047_homepage_latest_news\.sql/i)
  assert.match(design, /production migration 048 is classified as a[\s\S]*?Standard Transactional Index Migration/i)
  assert.match(design, /Concurrent Index Policy/i)
}

function verifiesOnlyTheStandardTransactionalIndexUnitIsImplemented(): void {
  for (const indexName of [
    'summaries_summary_code_key',
    'summaries_canonical_slug_key',
    'summaries_lifecycle_visibility_idx',
    'summaries_subject_topic_lifecycle_idx',
    'summaries_current_published_version_idx',
  ]) {
    assert.ok(sql.includes(indexName), `048 must define ${indexName}`)
  }
  assert.equal(
    (executable.match(/create\s+(?:unique\s+)?index\s+if\s+not\s+exists/gi) ?? []).length,
    5,
    '048 must build exactly five standard transactional indexes',
  )
  assert.doesNotMatch(executable, /create\s+(?:unique\s+)?index\s+concurrently/i)
  assert.doesNotMatch(executable, /\b(?:insert\s+into|update|delete\s+from)\s+public\./i)
  assert.doesNotMatch(executable, /\b(?:alter|drop)\s+(?:table|column|constraint)\b/i)
  assert.doesNotMatch(executable, /\bcreate\s+trigger\b/i)
  assert.doesNotMatch(executable, /\bcreate\s+policy\b/i)
  assert.doesNotMatch(executable, /\bcreate\s+(?:or\s+replace\s+)?function\b/i)
}

function verifiesIndexPredicatesAndDependencies(): void {
  assert.match(executable, /on\s+public\.summaries\s*\(summary_code\)\s*where\s+summary_code\s+is\s+not\s+null/i)
  assert.match(executable, /on\s+public\.summaries\s*\(canonical_slug\)\s*where\s+canonical_slug\s+is\s+not\s+null/i)
  assert.match(executable, /on\s+public\.summaries\s*\(lifecycle_status,\s*visibility\)/i)
  assert.match(executable, /on\s+public\.summaries\s*\(subject,\s*topic,\s*lifecycle_status\)/i)
  assert.match(executable, /on\s+public\.summaries\s*\(current_published_version_id\)/i)
  for (const column of [
    'summary_code',
    'canonical_slug',
    'visibility',
    'lifecycle_status',
    'current_published_version_id',
  ]) {
    assert.ok(sql.includes(`('${column}', '`), `048 must preflight ${column}`)
  }
  assert.match(executable, /c\.relrowsecurity/i)
  assert.match(executable, /indisvalid/i)
  assert.match(executable, /indisready/i)
}

const tests: Array<{ name: string; run: () => void }> = [
  { name: 'migration number is reconciled to 048', run: verifiesNumberReconciliation },
  {
    name: 'only the standard transactional index unit is implemented',
    run: verifiesOnlyTheStandardTransactionalIndexUnitIsImplemented,
  },
  { name: 'index predicates and dependencies are frozen', run: verifiesIndexPredicatesAndDependencies },
]

for (const test of tests) {
  test.run()
  process.stdout.write(`✓ ${test.name}\n`)
}

process.stdout.write(`\n${tests.length} Knowledge Platform migration 048 tests passed.\n`)
