#!/usr/bin/env node

import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import pg from 'pg'

const { Client } = pg

const TEST_GUARD = 'YES_I_AM_USING_LOCAL_WE084_TEST'
const DATABASE_PREFIX = 'sobdai_we084_runtime_'
const STATEMENT_TIMEOUT = '15000ms'
const REQUIRED_ENVIRONMENT = [
  'WE084_DB_ALLOW_DESTRUCTIVE_TESTS',
  'WE084_DB_TEST_DATABASE_URL',
]
const FORBIDDEN_APPLICATION_ENVIRONMENT = [
  'NEXT_PUBLIC_SUPABASE_URL',
  'NEXT_PUBLIC_SUPABASE_ANON_KEY',
  'SUPABASE_URL',
  'SUPABASE_ANON_KEY',
  'SUPABASE_SERVICE_ROLE_KEY',
  'DATABASE_URL',
  'POSTGRES_URL',
  'POSTGRES_PASSWORD',
]

const scriptDir = dirname(fileURLToPath(import.meta.url))
const repositoryRoot = resolve(scriptDir, '..')
const migrationDir = resolve(repositoryRoot, 'supabase', 'migrations')
const migrationPaths = [
  resolve(migrationDir, '082_written_exam_persistence.sql'),
  resolve(migrationDir, '083_written_exam_learner_discovery.sql'),
  resolve(migrationDir, '084_written_exam_material_title.sql'),
]

const IDS = Object.freeze({
  editor: '10000000-0000-4000-8000-000000000001',
  unauthorized: '10000000-0000-4000-8000-000000000002',
  learner: '10000000-0000-4000-8000-000000000003',
  package: '20000000-0000-4000-8000-000000000001',
  publishedMaterial: '30000000-0000-4000-8000-000000000001',
  draftMaterial: '30000000-0000-4000-8000-000000000002',
  retainedMaterial: '30000000-0000-4000-8000-000000000003',
})

function readConfiguration() {
  for (const key of REQUIRED_ENVIRONMENT) {
    assert.ok(process.env[key], `missing required environment: ${key}`)
  }
  for (const key of FORBIDDEN_APPLICATION_ENVIRONMENT) {
    assert.equal(process.env[key], undefined, `application environment is forbidden: ${key}`)
  }
  assert.equal(process.env.WE084_DB_ALLOW_DESTRUCTIVE_TESTS, TEST_GUARD)

  const databaseUrl = new URL(process.env.WE084_DB_TEST_DATABASE_URL)
  assert.ok(['postgres:', 'postgresql:'].includes(databaseUrl.protocol))
  assert.ok(['127.0.0.1', 'localhost'].includes(databaseUrl.hostname), 'database must be local')
  assert.equal(databaseUrl.search, '')
  assert.equal(databaseUrl.hash, '')

  const databaseName = decodeURIComponent(databaseUrl.pathname.slice(1))
  assert.ok(databaseName.startsWith(DATABASE_PREFIX), `database must start with ${DATABASE_PREFIX}`)

  return {
    databaseName,
    databaseUrl: databaseUrl.toString(),
  }
}

async function readMigrations() {
  return Promise.all(migrationPaths.map((path) => readFile(path, 'utf8')))
}

async function assertFreshLocalDatabase(client, expectedDatabaseName) {
  const server = await client.query(`
    select
      current_database() as database_name,
      current_setting('is_superuser') = 'on' as is_superuser,
      current_setting('server_version_num')::integer as server_version_num
  `)
  assert.equal(server.rows[0]?.database_name, expectedDatabaseName)
  assert.equal(server.rows[0]?.is_superuser, true, 'runtime fixture requires a local PostgreSQL superuser')
  assert.ok(server.rows[0]?.server_version_num >= 150000, 'runtime fixture requires PostgreSQL 15 or newer')

  const inventory = await client.query(`
    select count(*)::integer as object_count
    from pg_catalog.pg_class c
    join pg_catalog.pg_namespace n on n.oid = c.relnamespace
    where n.nspname in ('public', 'auth')
      and c.relkind in ('r', 'p', 'v', 'm', 'S', 'f')
  `)
  assert.equal(inventory.rows[0]?.object_count, 0, 'runtime database must be fresh')
}

const bootstrapSql = String.raw`
do $roles$
begin
    if not exists (select 1 from pg_catalog.pg_roles where rolname = 'anon') then
        execute 'create role anon nologin';
    end if;
    if not exists (select 1 from pg_catalog.pg_roles where rolname = 'authenticated') then
        execute 'create role authenticated nologin';
    end if;
    if not exists (select 1 from pg_catalog.pg_roles where rolname = 'service_role') then
        execute 'create role service_role nologin';
    end if;
end
$roles$;

create extension "uuid-ossp";
create schema auth;

create function auth.uid()
returns uuid
language sql
stable
as $function$
    select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid;
$function$;

revoke all on function auth.uid() from public;
grant usage on schema auth, public to anon, authenticated, service_role;
grant execute on function auth.uid() to anon, authenticated, service_role;

create table public.profiles (
    id uuid primary key,
    role text not null,
    status text not null,
    deleted_at timestamptz null
);

create table public.packages (
    id uuid primary key,
    slug text not null unique,
    package_code text not null,
    name text not null,
    is_published boolean not null default false,
    constraint packages_package_code_key unique (package_code)
);

create table public.orders (
    user_id uuid not null,
    package_id uuid not null,
    status text not null
);

create function public.handle_updated_at()
returns trigger
language plpgsql
as $function$
begin
    new.updated_at := timezone('utc'::text, now());
    return new;
end
$function$;

create function public.kp_is_content_editor()
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public, auth, pg_temp
as $function$
    select exists (
        select 1
        from public.profiles p
        where p.id = auth.uid()
          and p.role in ('owner', 'admin', 'editor')
          and p.status = 'active'
          and p.deleted_at is null
    );
$function$;

revoke all on function public.kp_is_content_editor() from public, anon, authenticated, service_role;
grant execute on function public.kp_is_content_editor() to authenticated;

insert into public.profiles (id, role, status, deleted_at) values
    ('${IDS.editor}', 'editor', 'active', null),
    ('${IDS.unauthorized}', 'user', 'active', null),
    ('${IDS.learner}', 'user', 'active', null);

insert into public.packages (id, slug, package_code, name, is_published) values
    ('${IDS.package}', 'runtime-package', 'RUNTIME-PKG', 'Runtime Package', true);

insert into public.orders (user_id, package_id, status) values
    ('${IDS.learner}', '${IDS.package}', 'paid');
`

const seedSql = String.raw`
insert into public.written_exam_materials (id, package_id, slug, created_by, updated_by) values
    ('${IDS.publishedMaterial}', '${IDS.package}', 'published-precedence', '${IDS.editor}', '${IDS.editor}'),
    ('${IDS.draftMaterial}', '${IDS.package}', 'draft-precedence', '${IDS.editor}', '${IDS.editor}'),
    ('${IDS.retainedMaterial}', '${IDS.package}', 'retained-precedence', '${IDS.editor}', '${IDS.editor}');

set local session_replication_role = replica;

insert into public.written_exam_material_versions (
    id,
    material_id,
    revision_number,
    format_version,
    title,
    source_md,
    source_checksum,
    status,
    published_at,
    archived_at
) values
    ('40000000-0000-4000-8000-000000000001', '${IDS.publishedMaterial}', 2, 'written-exam-v1', 'Published seed title', 'published source', repeat('a', 64), 'published', now(), null),
    ('40000000-0000-4000-8000-000000000002', '${IDS.publishedMaterial}', 8, 'written-exam-v1', 'Draft seed title', 'draft source', repeat('b', 64), 'draft', null, null),
    ('40000000-0000-4000-8000-000000000003', '${IDS.publishedMaterial}', 9, 'written-exam-v1', 'Archived newest title', 'archived source', repeat('c', 64), 'archived', now() - interval '2 days', now() - interval '1 day'),
    ('40000000-0000-4000-8000-000000000004', '${IDS.draftMaterial}', 2, 'written-exam-v1', 'Draft fallback title', 'draft fallback source', repeat('d', 64), 'draft', null, null),
    ('40000000-0000-4000-8000-000000000005', '${IDS.draftMaterial}', 5, 'written-exam-v1', 'Archived higher revision title', 'archived fallback source', repeat('e', 64), 'archived', now() - interval '2 days', now() - interval '1 day'),
    ('40000000-0000-4000-8000-000000000006', '${IDS.retainedMaterial}', 3, 'written-exam-v1', 'Archived older retained title', 'old retained source', repeat('f', 64), 'archived', now() - interval '4 days', now() - interval '3 days'),
    ('40000000-0000-4000-8000-000000000007', '${IDS.retainedMaterial}', 9, 'written-exam-v1', 'Archived newest retained title', 'new retained source', repeat('0', 64), 'archived', now() - interval '2 days', now() - interval '1 day');

insert into public.written_exam_questions (
    id,
    material_version_id,
    question_number,
    question_markdown,
    model_answer_markdown,
    keywords,
    answer_structure_markdown,
    memory_technique_markdown,
    question_checksum
) values (
    '50000000-0000-4000-8000-000000000001',
    '40000000-0000-4000-8000-000000000001',
    1,
    'Runtime question',
    'Runtime model answer',
    array['runtime'],
    'Runtime answer structure',
    'Runtime memory technique',
    repeat('1', 64)
);

set local session_replication_role = origin;
`

async function snapshotRows(client, tableName) {
  assert.ok(['written_exam_material_versions', 'written_exam_questions'].includes(tableName))
  const result = await client.query(`
    select coalesce(jsonb_agg(to_jsonb(row_value) order by row_value.id), '[]'::jsonb) as rows
    from public.${tableName} row_value
  `)
  return result.rows[0]?.rows
}

async function withDatabaseRole(client, role, actorId, callback) {
  await client.query("select set_config('request.jwt.claim.sub', $1, false)", [actorId ?? ''])
  await client.query(`set role ${role}`)
  try {
    return await callback()
  } finally {
    await client.query('reset role')
    await client.query("select set_config('request.jwt.claim.sub', '', false)")
  }
}

async function runProof() {
  const config = readConfiguration()
  const [migration082, migration083, migration084] = await readMigrations()
  const client = new Client({
    connectionString: config.databaseUrl,
    connectionTimeoutMillis: 10000,
  })

  await client.connect()
  try {
    await client.query(`set statement_timeout = '${STATEMENT_TIMEOUT}'`)
    await assertFreshLocalDatabase(client, config.databaseName)
    await client.query('begin')
    await client.query(bootstrapSql)
    await client.query(migration082)
    await client.query(migration083)
    await client.query(seedSql)

    const identityBefore = await client.query(`
      select package_id::text, slug
      from public.written_exam_materials
      where id = $1
    `, [IDS.publishedMaterial])
    const versionsBefore = await snapshotRows(client, 'written_exam_material_versions')
    const questionsBefore = await snapshotRows(client, 'written_exam_questions')

    await client.query(migration084)

    const backfill = await client.query(`
      select slug, title
      from public.written_exam_materials
      order by slug
    `)
    assert.deepEqual(backfill.rows, [
      { slug: 'draft-precedence', title: 'Draft fallback title' },
      { slug: 'published-precedence', title: 'Published seed title' },
      { slug: 'retained-precedence', title: 'Archived newest retained title' },
    ])

    const rpcCatalog = await client.query(`
      select
        pg_catalog.to_regprocedure('public.update_written_exam_material_title(uuid, text)') is not null as installed,
        pg_catalog.has_function_privilege('authenticated', 'public.update_written_exam_material_title(uuid, text)', 'EXECUTE') as authenticated_execute,
        pg_catalog.has_function_privilege('anon', 'public.update_written_exam_material_title(uuid, text)', 'EXECUTE') as anon_execute
    `)
    assert.deepEqual(rpcCatalog.rows[0], {
      installed: true,
      authenticated_execute: true,
      anon_execute: false,
    })

    const authorized = await withDatabaseRole(client, 'authenticated', IDS.editor, () =>
      client.query(
        'select public.update_written_exam_material_title($1::uuid, $2::text) as result',
        [IDS.publishedMaterial, 'Edited material title'],
      ),
    )
    assert.deepEqual(authorized.rows[0]?.result, {
      material_id: IDS.publishedMaterial,
      title: 'Edited material title',
    })

    let unauthorizedError = null
    await client.query('savepoint unauthorized_title_update')
    await client.query("select set_config('request.jwt.claim.sub', $1, false)", [IDS.unauthorized])
    await client.query('set role authenticated')
    try {
      await client.query(
        'select public.update_written_exam_material_title($1::uuid, $2::text)',
        [IDS.publishedMaterial, 'Unauthorized title'],
      )
    } catch (error) {
      unauthorizedError = error
    }
    await client.query('rollback to savepoint unauthorized_title_update')
    await client.query('reset role')
    await client.query("select set_config('request.jwt.claim.sub', '', false)")
    assert.equal(unauthorizedError?.code, '42501')

    const discovery = await withDatabaseRole(client, 'anon', null, () =>
      client.query(
        'select * from public.get_published_written_exam_materials_for_package($1::text)',
        ['runtime-package'],
      ),
    )
    assert.deepEqual(discovery.rows, [{
      material_slug: 'published-precedence',
      material_title: 'Edited material title',
      question_count: 1,
    }])

    const learner = await withDatabaseRole(client, 'authenticated', IDS.learner, () =>
      client.query(
        'select material_title, question_number, question_markdown from public.get_published_written_exam_for_learner($1::text, $2::text)',
        ['runtime-package', 'published-precedence'],
      ),
    )
    assert.deepEqual(learner.rows, [{
      material_title: 'Edited material title',
      question_number: 1,
      question_markdown: 'Runtime question',
    }])

    const identityAfter = await client.query(`
      select package_id::text, slug, title
      from public.written_exam_materials
      where id = $1
    `, [IDS.publishedMaterial])
    assert.deepEqual(
      { package_id: identityAfter.rows[0]?.package_id, slug: identityAfter.rows[0]?.slug },
      identityBefore.rows[0],
    )
    assert.equal(identityAfter.rows[0]?.title, 'Edited material title')
    assert.deepEqual(await snapshotRows(client, 'written_exam_material_versions'), versionsBefore)
    assert.deepEqual(await snapshotRows(client, 'written_exam_questions'), questionsBefore)

    await client.query('rollback')
    console.log(JSON.stringify({
      status: 'PASS',
      postgres_runtime: true,
      migrations: ['082', '083', '084'],
      assertions: {
        material_title_backfill_precedence: true,
        title_rpc_installed: true,
        authorized_content_write: true,
        unauthorized_rejected: true,
        package_and_slug_unchanged: true,
        revisions_and_questions_unchanged: true,
        learner_and_discovery_title: true,
      },
    }, null, 2))
  } catch (error) {
    await client.query('rollback').catch(() => {})
    throw error
  } finally {
    await client.end()
  }
}

runProof().catch((error) => {
  console.error(JSON.stringify({
    status: 'FAIL',
    code: error?.code ?? null,
    message: error?.message ?? String(error),
  }, null, 2))
  process.exitCode = 1
})
