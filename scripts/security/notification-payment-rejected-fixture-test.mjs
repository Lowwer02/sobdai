#!/usr/bin/env node

import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { spawn } from 'node:child_process'
import pg from 'pg'

const { Client } = pg

const TEST_GUARD = 'YES_I_AM_USING_SOBDAI_NOTIFICATION_V1_TEST'
const OLD_MIGRATION_REUSE_GUARD = 'YES_I_AM_REUSING_CANONICAL_NOTIFICATION_V1'
const NEW_MIGRATION_REUSE_GUARD = 'YES_I_AM_REUSING_PAYMENT_REJECTED_NOTIFICATION_MIGRATION'
const EXPECTED_PROJECT_REF = 'nbxkvmcvnigegkkscfau'
const EXPECTED_SUPABASE_URL = 'https://nbxkvmcvnigegkkscfau.supabase.co'
const PROFILE_TRIGGER = 'handle_updated_at_profiles'
const WORKTREE = process.cwd()
const OLD_HARNESS = 'scripts/security/notification-v1-db-test.mjs'
const NEW_HARNESS = 'scripts/security/notification-payment-rejected-db-test.mjs'
const FIXTURE_EMAILS = [
  'sec-db2a-owner-a@example.com',
  'sec-db2a-owner-b@example.com',
  'sec-db2a-admin@example.com',
  'sec-db2a-editor@example.com',
  'sec-db2a-support@example.com',
  'sec-db2a-normal-user@example.com',
  'sec-db2a-banned-user@example.com',
  'sec-db2a-deleted-user@example.com',
]
const MANAGER_EMAIL = 'sec-db2a-admin@example.com'
const SUPPORT_EMAIL = 'sec-db2a-support@example.com'

const REQUIRED_ENVIRONMENT = [
  'N1_NOTIFICATION_DB_ALLOW_DESTRUCTIVE_TESTS',
  'N1_NOTIFICATION_DB_TEST_DATABASE_URL',
  'N1_NOTIFICATION_DB_TEST_PROJECT_REF',
  'N1_NOTIFICATION_DB_TEST_SUPABASE_URL',
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

function ensure(condition, message) {
  assert.ok(condition, message)
}

function sha256(value) {
  return createHash('sha256').update(value).digest('hex')
}

function readConfiguration() {
  for (const key of REQUIRED_ENVIRONMENT) ensure(process.env[key], `missing required environment: ${key}`)
  for (const key of FORBIDDEN_APPLICATION_ENVIRONMENT) {
    assert.equal(process.env[key], undefined, `application environment is forbidden: ${key}`)
  }

  assert.equal(process.env.N1_NOTIFICATION_DB_ALLOW_DESTRUCTIVE_TESTS, TEST_GUARD)
  assert.equal(process.env.N1_NOTIFICATION_DB_TEST_PROJECT_REF, EXPECTED_PROJECT_REF)
  assert.equal(process.env.N1_NOTIFICATION_DB_TEST_SUPABASE_URL, EXPECTED_SUPABASE_URL)

  const databaseUrl = new URL(process.env.N1_NOTIFICATION_DB_TEST_DATABASE_URL)
  assert.ok(['postgres:', 'postgresql:'].includes(databaseUrl.protocol))
  assert.equal(databaseUrl.pathname, '/postgres')
  assert.equal(databaseUrl.search, '')
  assert.equal(databaseUrl.hash, '')
  assert.equal(databaseUrl.username, `postgres.${EXPECTED_PROJECT_REF}`)
  assert.ok(databaseUrl.password)
  assert.ok(databaseUrl.hostname.endsWith('.pooler.supabase.com'))

  return { databaseUrl: databaseUrl.toString() }
}

function childEnvironment(extra = {}) {
  const environment = { PATH: process.env.PATH }
  for (const key of [
    'N1_NOTIFICATION_DB_ALLOW_DESTRUCTIVE_TESTS',
    'N1_NOTIFICATION_DB_TEST_DATABASE_URL',
    'N1_NOTIFICATION_DB_TEST_PROJECT_REF',
    'N1_NOTIFICATION_DB_TEST_SUPABASE_URL',
  ]) {
    environment[key] = process.env[key]
  }
  return { ...environment, ...extra }
}

function runHarness(script, extraEnvironment, args = []) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [script, ...args], {
      cwd: WORKTREE,
      env: childEnvironment(extraEnvironment),
      stdio: 'inherit',
    })
    child.on('error', reject)
    child.on('exit', (code, signal) => resolve({ code, signal }))
  })
}

async function connect(config) {
  const client = new Client({
    connectionString: config.databaseUrl,
    ssl: { rejectUnauthorized: false },
    connectionTimeoutMillis: 30000,
  })
  await client.connect()
  await client.query("set statement_timeout = '30000ms'")
  return client
}

async function query(client, text, params = []) {
  return client.query(text, params)
}

async function fetchIdentity(client) {
  return (await query(client, `
    select current_database() as database_name,
           current_user as database_user,
           current_setting('transaction_read_only') as transaction_read_only
  `)).rows[0]
}

async function fetchProfileSnapshot(client) {
  const rows = (await query(client, `
    select email, id::text as id, to_jsonb(p)::text as row_json
      from public.profiles p
     where email = any($1::text[])
     order by email
  `, [FIXTURE_EMAILS])).rows
  ensure(rows.length === FIXTURE_EMAILS.length, 'SEC fixture profile count is not exactly eight')
  return {
    rows,
    digest: sha256(JSON.stringify(rows.map((row) => ({ email: row.email, row_json: row.row_json })))),
  }
}

async function fetchAuthSnapshot(client) {
  const rows = (await query(client, `
    select p.email, u.id::text as id, to_jsonb(u)::text as row_json
      from public.profiles p
      left join auth.users u on u.id = p.id
     where p.email = any($1::text[])
     order by p.email
  `, [FIXTURE_EMAILS])).rows
  ensure(rows.length === FIXTURE_EMAILS.length, 'SEC fixture Auth population is not exactly eight rows')
  ensure(rows.every((row) => row.id !== null), 'an SEC fixture profile is missing its Auth user')
  return {
    rows,
    digest: sha256(JSON.stringify(rows.map((row) => ({ email: row.email, id: row.id, row_json: row.row_json })))),
  }
}

async function fetchProfileTriggers(client) {
  return (await query(client, `
    select t.tgname as trigger_name,
           t.tgenabled,
           pg_get_triggerdef(t.oid, true) as trigger_definition,
           p.oid::regprocedure::text as function_signature,
           pg_get_functiondef(p.oid) as function_definition
      from pg_trigger t
      join pg_proc p on p.oid = t.tgfoid
     where t.tgrelid = 'public.profiles'::regclass
       and not t.tgisinternal
     order by t.tgname
  `)).rows
}

function assertBaselineProfiles(snapshot) {
  const byEmail = new Map(snapshot.rows.map((row) => [row.email, JSON.parse(row.row_json)]))
  ensure(byEmail.get(MANAGER_EMAIL)?.role === 'user', 'admin fixture is not user in canonical baseline')
  ensure(byEmail.get(SUPPORT_EMAIL)?.role === 'user', 'support fixture is not user in canonical baseline')
  ensure(byEmail.get('sec-db2a-normal-user@example.com')?.role === 'user', 'buyer fixture is not user in canonical baseline')
  ensure(snapshot.rows.every((row) => JSON.parse(row.row_json).status === 'active'), 'canonical fixture status drifted')
}

function assertTriggersEnabled(triggers) {
  const names = new Set(triggers.map((trigger) => trigger.trigger_name))
  ensure(names.has(PROFILE_TRIGGER), 'updated_at profile trigger is missing')
  ensure(names.has('profiles_security_guard'), 'profile security trigger is missing')
  for (const trigger of triggers) assert.equal(trigger.tgenabled, 'O', `${trigger.trigger_name} is not enabled`)
}

async function captureBaseline(client) {
  await query(client, 'begin transaction read only')
  const identity = await fetchIdentity(client)
  assert.equal(identity.database_name, 'postgres')
  assert.equal(identity.database_user, 'postgres')
  assert.equal(identity.transaction_read_only, 'on')
  const profiles = await fetchProfileSnapshot(client)
  const auth = await fetchAuthSnapshot(client)
  const triggers = await fetchProfileTriggers(client)
  await query(client, 'rollback')

  assertBaselineProfiles(profiles)
  assertTriggersEnabled(triggers)
  return { identity, profiles, auth, triggers }
}

async function applyTemporaryRoles(client) {
  await query(client, 'begin')
  try {
    const manager = await query(
      client,
      'update public.profiles set role = $1 where email = $2 and role = $3',
      ['admin', MANAGER_EMAIL, 'user'],
    )
    const support = await query(
      client,
      'update public.profiles set role = $1 where email = $2 and role = $3',
      ['support', SUPPORT_EMAIL, 'user'],
    )
    assert.equal(manager.rowCount, 1)
    assert.equal(support.rowCount, 1)
    await query(client, 'commit')
  } catch (error) {
    await query(client, 'rollback').catch(() => {})
    throw error
  }
}

const PROFILE_SNAPSHOT_COLUMNS = `
  id uuid,
  email text,
  role text,
  created_at timestamptz,
  updated_at timestamptz,
  status text,
  display_name text,
  occupation text,
  phone text,
  avatar_url text,
  deleted_at timestamptz,
  deleted_reason text,
  deleted_by uuid,
  banned_at timestamptz,
  banned_reason text,
  banned_by uuid,
  last_seen_at timestamptz
`

async function restoreExactProfiles(client, baseline) {
  const targetRows = baseline.profiles.rows
    .filter((row) => row.email === MANAGER_EMAIL || row.email === SUPPORT_EMAIL)
    .map((row) => JSON.parse(row.row_json))
  ensure(targetRows.length === 2, 'exact target profile snapshot is incomplete')

  await query(client, 'begin')
  let transactionOpen = true
  try {
    await query(client, `alter table public.profiles disable trigger ${PROFILE_TRIGGER}`)
    const restored = await query(
      client,
      `
        update public.profiles as p
           set id = s.id,
               email = s.email,
               role = s.role,
               created_at = s.created_at,
               updated_at = s.updated_at,
               status = s.status,
               display_name = s.display_name,
               occupation = s.occupation,
               phone = s.phone,
               avatar_url = s.avatar_url,
               deleted_at = s.deleted_at,
               deleted_reason = s.deleted_reason,
               deleted_by = s.deleted_by,
               banned_at = s.banned_at,
               banned_reason = s.banned_reason,
               banned_by = s.banned_by,
               last_seen_at = s.last_seen_at
          from jsonb_to_recordset($1::jsonb) as s(${PROFILE_SNAPSHOT_COLUMNS})
         where p.id = s.id
      `,
      [JSON.stringify(targetRows)],
    )
    assert.equal(restored.rowCount, 2, 'exact target profile restoration did not affect two rows')
    await query(client, `alter table public.profiles enable trigger ${PROFILE_TRIGGER}`)
    const triggerState = await fetchProfileTriggers(client)
    assertTriggersEnabled(triggerState)
    await query(client, 'commit')
    transactionOpen = false
  } catch (error) {
    await query(client, `alter table public.profiles enable trigger ${PROFILE_TRIGGER}`).catch(() => {})
    if (transactionOpen) await query(client, 'rollback').catch(() => {})
    throw error
  }

  const restoredProfiles = await captureBaseline(client)
  assert.equal(restoredProfiles.profiles.digest, baseline.profiles.digest, 'profile baseline digest mismatch after restoration')
  assert.equal(restoredProfiles.auth.digest, baseline.auth.digest, 'Auth users changed during notification testing')
  assert.deepEqual(restoredProfiles.triggers, baseline.triggers, 'profile trigger state changed during restoration')
  return restoredProfiles
}

async function assertNoTemporaryObjects(client) {
  const result = (await query(client, `
    select
      (select count(*) from pg_proc where proname like 'n1_rejected_failure_%' or proname like 'n1_notification_failure_%')::int as failure_functions,
      (select count(*) from pg_trigger where tgname like 'n1_rejected_failure_%' or tgname like 'n1_notification_failure_%')::int as failure_triggers,
      (select count(*) from public.packages where slug like 'n1-%')::int as packages,
      (select count(*) from public.orders o join public.packages p on p.id = o.package_id where p.slug like 'n1-%')::int as orders,
      (select count(*) from public.payment_submissions ps join public.orders o on o.id = ps.order_id join public.packages p on p.id = o.package_id where p.slug like 'n1-%')::int as submissions
  `)).rows[0]
  assert.deepEqual(result, {
    failure_functions: 0,
    failure_triggers: 0,
    packages: 0,
    orders: 0,
    submissions: 0,
  })
}

async function main() {
  const config = readConfiguration()
  const client = await connect(config)
  let baseline = null
  let rolesApplied = false
  let harnessError = null
  let restoreError = null
  const harnessResults = []

  try {
    baseline = await captureBaseline(client)

    const canonicalCheck = await runHarness(NEW_HARNESS, {}, ['--check-canonical'])
    harnessResults.push({ harness: 'canonical-093-read-only-check', ...canonicalCheck })
    ensure(canonicalCheck.code === 0, 'canonical 093 schema check failed before role mutation')

    await applyTemporaryRoles(client)
    rolesApplied = true

    const canonicalRegression = await runHarness(OLD_HARNESS, {
      N1_NOTIFICATION_DB_REUSE_EXISTING_MIGRATION: OLD_MIGRATION_REUSE_GUARD,
    })
    harnessResults.push({ harness: 'canonical-092-runtime', ...canonicalRegression })
    ensure(canonicalRegression.code === 0, 'canonical PACKAGE_APPROVED runtime harness failed')

    const rejectedRuntime = await runHarness(NEW_HARNESS, {
      N1_NOTIFICATION_DB_REUSE_REJECTED_MIGRATION: NEW_MIGRATION_REUSE_GUARD,
    })
    harnessResults.push({ harness: 'payment-rejected-093-runtime', ...rejectedRuntime })
    ensure(rejectedRuntime.code === 0, 'PAYMENT_REJECTED runtime harness failed')
  } catch (error) {
    harnessError = error
  } finally {
    if (rolesApplied && baseline) {
      try {
        await restoreExactProfiles(client, baseline)
        await assertNoTemporaryObjects(client)
      } catch (error) {
        restoreError = error
      }
    }
    await client.end().catch(() => {})
  }

  if (restoreError) {
    console.error(JSON.stringify({
      status: 'RESTORE_FAILURE',
      message: restoreError.message,
      baseline_digest: baseline?.profiles.digest ?? null,
      harness_results: harnessResults,
    }, null, 2))
    process.exitCode = 2
    return
  }

  if (harnessError) {
    console.error(JSON.stringify({
      status: 'HARNESS_FAILURE',
      message: harnessError.message,
      baseline_digest: baseline?.profiles.digest ?? null,
      harness_results: harnessResults,
      restoration_verified: Boolean(baseline && rolesApplied),
    }, null, 2))
    process.exitCode = 1
    return
  }

  console.log(JSON.stringify({
    status: 'PASS',
    database: 'sobdai-sec-test',
    project_ref: EXPECTED_PROJECT_REF,
    baseline_digest: baseline.profiles.digest,
    harness_results: harnessResults,
    temporary_roles: {
      admin_fixture: 'user -> admin -> user',
      support_fixture: 'user -> support -> user',
    },
    exact_profile_restoration: true,
    auth_users_unchanged: true,
    profile_triggers_restored_enabled: true,
    temporary_objects_removed: true,
  }, null, 2))
}

main().catch((error) => {
  console.error(JSON.stringify({
    status: 'FAIL',
    code: error?.code ?? null,
    message: error?.message ?? String(error),
  }, null, 2))
  process.exitCode = 1
})
