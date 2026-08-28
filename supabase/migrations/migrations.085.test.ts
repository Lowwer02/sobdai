/**
 * Static contract tests for the Affiliate M1 foundation (085).
 *
 * These tests intentionally do not connect to a database. They verify the
 * migration's executable SQL text only. After applying 085 in Supabase, run the
 * adversarial anon/authenticated checks described in scripts/security/README.md
 * style (unpublished rows must be invisible to anon; staff must write).
 *
 * Run with:
 *   node --test supabase/migrations/migrations.085.test.ts
 */

import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import test from 'node:test'

const migrationDir = dirname(fileURLToPath(import.meta.url))
const migrationName = '085_affiliate_cms.sql'
const migration = readFileSync(join(migrationDir, migrationName), 'utf8')
const executableSql = migration
  .split('\n')
  .filter((line) => !line.trimStart().startsWith('--'))
  .join('\n')

test('085 exists as a unique migration (next canonical number after 084)', () => {
  const files = readdirSync(migrationDir)
  assert.equal(files.filter((name) => /^085_.+\.sql$/.test(name)).length, 1)
  assert.equal(files.filter((name) => /^086_.+\.sql$/.test(name)).length, 0)
})

test('085 creates the three affiliate tables with idempotent guards', () => {
  for (const table of ['affiliate_products', 'affiliate_collections', 'affiliate_collection_items']) {
    assert.match(
      executableSql,
      new RegExp(`create\\s+table\\s+if\\s+not\\s+exists\\s+public\\.${table}`, 'i'),
    )
    assert.match(executableSql, new RegExp(`alter\\s+table\\s+public\\.${table}\\s+enable\\s+row\\s+level\\s+security`, 'i'))
  }
})

test('085 lifecycle columns follow the news/articles draft|published|archived convention', () => {
  const statusChecks = executableSql.match(/check\s*\(\s*status\s+in\s*\('draft',\s*'published',\s*'archived'\)\s*\)/gi)
  assert.ok(statusChecks && statusChecks.length >= 2, 'products + collections status CHECKs')
})

test('085 reuses the ordered-junction shape (composite PK + sort_order + cascades)', () => {
  assert.match(executableSql, /primary\s+key\s*\(\s*collection_id,\s*product_id\s*\)/i)
  assert.match(executableSql, /sort_order\s+int\s+not\s+null\s+default\s+0/i)
  assert.match(executableSql, /references\s+public\.affiliate_collections\(id\)\s+on\s+delete\s+cascade/i)
  assert.match(executableSql, /references\s+public\.affiliate_products\(id\)\s+on\s+delete\s+cascade/i)
})

test('085 admin policies use the 079-hardened staff predicate', () => {
  const hardened = /to\s+authenticated[\s\S]*?role\s+in\s+\('owner',\s*'admin',\s*'editor'\)[\s\S]*?status\s*=\s*'active'[\s\S]*?deleted_at\s+is\s+null/i
  const matches = executableSql.match(new RegExp(hardened.source, 'gi'))
  assert.ok(matches && matches.length >= 3, `expected 3+ hardened admin policies, found ${matches?.length ?? 0}`)
})

test('085 public read is published-only and the junction cannot leak unpublished sides', () => {
  assert.match(executableSql, /"Public can read published affiliate products\."[\s\S]*?for\s+select\s+using\s+\(status\s*=\s*'published'\)/i)
  assert.match(executableSql, /"Public can read published affiliate collections\."[\s\S]*?for\s+select\s+using\s+\(status\s*=\s*'published'\)/i)

  // Slice the region owned by the items policy (up to the next create policy).
  const start = executableSql.indexOf('"Public can read published affiliate collection items."')
  const end = executableSql.indexOf('create policy', start + 1)
  const region = executableSql.slice(start, end > start ? end : undefined)
  assert.ok(start !== -1, 'items policy exists')
  assert.match(region, /for\s+select\s+using/i)
  assert.match(region, /affiliate_collections[\s\S]*?status\s*=\s*'published'/i)
  assert.match(region, /affiliate_products[\s\S]*?status\s*=\s*'published'/i)
  assert.match(region, /\)\s*\n\s*and\s+exists\s*\(/i)
})

test('085 wires news + articles additively (default-off, FK set null, if-not-exists)', () => {
  for (const table of ['news', 'articles']) {
    assert.match(
      executableSql,
      new RegExp(`alter\\s+table\\s+public\\.${table}[\\s\\S]*?add\\s+column\\s+if\\s+not\\s+exists\\s+affiliate_enabled\\s+boolean\\s+not\\s+null\\s+default\\s+false`, 'i'),
    )
    assert.match(
      executableSql,
      new RegExp(`alter\\s+table\\s+public\\.${table}[\\s\\S]*?add\\s+column\\s+if\\s+not\\s+exists\\s+affiliate_collection_id\\s+uuid\\s*\\n?\\s*references\\s+public\\.affiliate_collections\\(id\\)\\s+on\\s+delete\\s+set\\s+null`, 'i'),
    )
  }
  // No price columns anywhere (volatile marketplace data is intentionally absent).
  assert.doesNotMatch(executableSql, /price\s+(text|numeric|int|integer|decimal|bigint|real|double)/i)
})

test('085 creates the rail query + reverse-lookup indexes and reloads the schema', () => {
  assert.match(executableSql, /affiliate_collection_items_order_idx[\s\S]*?\(collection_id,\s*sort_order,\s*product_id\)/i)
  assert.match(executableSql, /affiliate_collection_items_product_id_idx[\s\S]*?\(product_id\)/i)
  assert.match(executableSql, /news_affiliate_collection_id_idx/i)
  assert.match(executableSql, /articles_affiliate_collection_id_idx/i)
  assert.match(executableSql, /notify\s+pgrst,\s*'reload\s+schema'/i)
})
