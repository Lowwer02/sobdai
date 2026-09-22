import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import test from 'node:test'

const migrationPath = fileURLToPath(new URL('./102_agency_profiles_v1.sql', import.meta.url))
const migration = readFileSync(migrationPath, 'utf8')
const normalizedMigration = migration.replace(/\s+/g, ' ')

test('102 refuses to run against a missing baseline or a partial earlier attempt', () => {
  assert.match(migrationPath, /102_agency_profiles_v1\.sql$/)

  assert.ok(
    normalizedMigration.includes("to_regclass('public.agency_profiles') is not null"),
    '102 must fail closed when agency_profiles already exists',
  )
  assert.ok(
    normalizedMigration.includes("column_name = 'organization_id'") &&
      normalizedMigration.includes("table_name = 'news'"),
    '102 must fail closed when news.organization_id already exists',
  )
})

test('102 creates the 1:1 agency_profiles contract with fail-closed lifecycle columns', () => {
  assert.ok(
    normalizedMigration.includes('create table public.agency_profiles'),
    '102 must create public.agency_profiles',
  )

  const uniqueOrg = normalizedMigration.indexOf('constraint agency_profiles_organization_id_key unique (organization_id)')
  const notNullOrg = normalizedMigration.indexOf('organization_id uuid not null references public.organizations(id) on delete cascade')
  assert.ok(uniqueOrg >= 0, '102 must enforce the 1:1 UNIQUE organization_id')
  assert.ok(notNullOrg >= 0, '102 must bind organization_id NOT NULL with ON DELETE CASCADE')

  assert.ok(
    normalizedMigration.includes("check (status in ('draft', 'published', 'archived'))"),
    '102 must constrain the lifecycle status values',
  )
  assert.ok(
    normalizedMigration.includes('constraint agency_profiles_published_at_check check ( status <> \'published\' or published_at is not null )'),
    '102 must require published_at when status is published',
  )
  assert.ok(
    normalizedMigration.includes('constraint agency_profiles_slug_not_empty check (btrim(slug) <> \'\')'),
    '102 must refuse blank slugs',
  )
  assert.ok(
    normalizedMigration.includes('author_id uuid references public.article_authors(id) on delete set null'),
    '102 must reference article_authors for the editorial author',
  )
})

test('102 adds the authoritative nullable News organization relation with a partial index', () => {
  const addColumn = normalizedMigration.indexOf('alter table public.news add column organization_id uuid')
  assert.ok(addColumn >= 0, '102 must add news.organization_id')

  const fk = normalizedMigration.indexOf(
    'foreign key (organization_id) references public.organizations(id) on delete set null',
  )
  assert.ok(fk > addColumn, '102 must attach the organizations FK after adding the column')

  assert.ok(
    normalizedMigration.includes('create index news_organization_id_idx on public.news (organization_id) where organization_id is not null'),
    '102 must index news.organization_id with a partial index',
  )
})

test('102 ships RLS with published-only public reads and content-manager writes', () => {
  assert.ok(
    normalizedMigration.includes('alter table public.agency_profiles enable row level security'),
    '102 must enable RLS',
  )
  assert.ok(
    normalizedMigration.includes('create policy "Public can read published agency profiles."'),
    '102 must restrict anon/public reads to published rows',
  )
  assert.ok(
    normalizedMigration.includes('create policy "Content managers can manage agency profiles."'),
    '102 must scope writes to active non-deleted owner/admin/editor profiles',
  )
  assert.ok(
    normalizedMigration.includes("p.role in ('owner', 'admin', 'editor')") &&
      normalizedMigration.includes('p.status = \'active\'') &&
      normalizedMigration.includes('p.deleted_at is null'),
    '102 must use the hardened profiles authorization columns',
  )
})

test('102 normalizes the ACL in the same migration (no 094-to-096 repair sequence)', () => {
  const revoke = 'revoke all privileges on table public.agency_profiles from anon, authenticated, service_role'
  const revokeIndex = normalizedMigration.indexOf(revoke)
  assert.ok(revokeIndex >= 0, '102 must revoke all privileges from the three target roles')

  const grants = [
    'grant select on table public.agency_profiles to anon',
    'grant select, insert, update, delete on table public.agency_profiles to authenticated',
    'grant select, insert, update, delete on table public.agency_profiles to service_role',
  ]
  for (const grant of grants) {
    const grantIndex = normalizedMigration.indexOf(grant)
    assert.ok(grantIndex > revokeIndex, `102 must grant "${grant}" only after the revoke`)
  }
})

test('102 never seeds agency data or widens news RLS', () => {
  assert.doesNotMatch(migration, /insert\s+into\s+public\.agency_profiles/i)
  assert.doesNotMatch(migration, /update\s+public\.news\s+set/i)
  assert.doesNotMatch(migration, /create\s+(or\s+replace\s+)?function/i)
  assert.doesNotMatch(migration, /security\s+definer/i)
  assert.ok(
    normalizedMigration.includes("notify pgrst, 'reload schema'"),
    '102 must reload the PostgREST schema cache',
  )
})
