#!/usr/bin/env node

import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import pg from 'pg'

const { Client } = pg

const TEST_GUARD = 'YES_I_AM_USING_SOBDAI_NOTIFICATION_V1_TEST'
const LOCAL_ONLY_GUARD = 'YES_I_AM_USING_SOBDAI_LOCAL_ONLY'
const EXISTING_MIGRATION_GUARD = 'YES_I_AM_REUSING_CANONICAL_NOTIFICATION_V1'
const STATEMENT_TIMEOUT = '15000ms'
const OPERATION_TIMEOUT_MS = 10000
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
const MIGRATION_SQL = readFileSync(join(ROOT, 'supabase/migrations/092_notifications_v1.sql'), 'utf8')
const REQUIRED_ENVIRONMENT = [
  'N1_NOTIFICATION_DB_ALLOW_DESTRUCTIVE_TESTS',
  'N1_NOTIFICATION_DB_TEST_DATABASE_URL',
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
const FIXTURE_EMAILS = {
  manager: process.env.N1_NOTIFICATION_DB_MANAGER_EMAIL || 'sec-db2a-admin@example.com',
  buyer: process.env.N1_NOTIFICATION_DB_BUYER_EMAIL || 'sec-db2a-normal-user@example.com',
  support: process.env.N1_NOTIFICATION_DB_SUPPORT_EMAIL || 'sec-db2a-support@example.com',
}

function ensure(condition, message) {
  assert.ok(condition, message)
}

function readConfiguration() {
  for (const key of REQUIRED_ENVIRONMENT) {
    ensure(process.env[key], `missing required environment: ${key}`)
  }

  for (const key of FORBIDDEN_APPLICATION_ENVIRONMENT) {
    assert.equal(process.env[key], undefined, `application environment is forbidden: ${key}`)
  }

  assert.equal(process.env.N1_NOTIFICATION_DB_ALLOW_DESTRUCTIVE_TESTS, TEST_GUARD)

  const localOnly = process.env.N1_NOTIFICATION_DB_LOCAL_ONLY
  ensure(
    localOnly === undefined || localOnly === LOCAL_ONLY_GUARD,
    'local database guard is invalid',
  )

  if (localOnly === LOCAL_ONLY_GUARD) {
    ensure(
      process.env.N1_NOTIFICATION_DB_TEST_PROJECT_REF === undefined
        && process.env.N1_NOTIFICATION_DB_TEST_SUPABASE_URL === undefined,
      'local database cannot include remote Supabase target variables',
    )

    let databaseUrl
    try {
      databaseUrl = new URL(process.env.N1_NOTIFICATION_DB_TEST_DATABASE_URL)
    } catch {
      throw new Error('local database URL is invalid')
    }

    ensure(
      ['postgres:', 'postgresql:'].includes(databaseUrl.protocol),
      'local database URL is not PostgreSQL',
    )
    ensure(
      ['127.0.0.1', 'localhost'].includes(databaseUrl.hostname),
      'local database must use loopback host',
    )
    ensure(
      /^\/sobdai_notifications_v1_test_[a-z0-9_]+$/.test(databaseUrl.pathname),
      'local database name is not a disposable notification V1 database',
    )
    ensure(databaseUrl.username === 'postgres', 'local database must use postgres role')
    ensure(databaseUrl.password === '', 'local database URL must not contain a password')
    ensure(databaseUrl.port !== '', 'local database URL must declare a port')
    ensure(databaseUrl.search === '' && databaseUrl.hash === '', 'local database URL contains unexpected parts')

    return {
      databaseUrl: databaseUrl.toString(),
      localOnly: true,
      reuseExistingMigration: false,
    }
  }

  for (const key of ['N1_NOTIFICATION_DB_TEST_PROJECT_REF', 'N1_NOTIFICATION_DB_TEST_SUPABASE_URL']) {
    ensure(process.env[key], `missing required environment: ${key}`)
  }

  const projectRef = process.env.N1_NOTIFICATION_DB_TEST_PROJECT_REF
  assert.match(projectRef, /^[a-z0-9]{20}$/)

  const supabaseUrl = new URL(process.env.N1_NOTIFICATION_DB_TEST_SUPABASE_URL)
  assert.equal(supabaseUrl.protocol, 'https:')
  assert.equal(supabaseUrl.hostname, `${projectRef}.supabase.co`)
  assert.equal(supabaseUrl.pathname, '/')
  assert.equal(supabaseUrl.search, '')
  assert.equal(supabaseUrl.hash, '')

  const databaseUrl = new URL(process.env.N1_NOTIFICATION_DB_TEST_DATABASE_URL)
  assert.ok(['postgres:', 'postgresql:'].includes(databaseUrl.protocol))
  assert.equal(databaseUrl.pathname, '/postgres')
  assert.equal(databaseUrl.search, '')
  assert.equal(databaseUrl.hash, '')
  assert.ok(databaseUrl.username)
  assert.ok(databaseUrl.password)
  assert.ok(['', '5432', '6543'].includes(databaseUrl.port))
  assert.ok(
    databaseUrl.hostname === `db.${projectRef}.supabase.co`
      || /^[a-z0-9-]+\.pooler\.supabase\.com$/.test(databaseUrl.hostname),
    'database must be the declared Supabase project',
  )

  if (databaseUrl.hostname === `db.${projectRef}.supabase.co`) {
    assert.equal(databaseUrl.username, 'postgres')
  } else {
    assert.equal(databaseUrl.username, `postgres.${projectRef}`)
  }

  const reuseExistingMigration = process.env.N1_NOTIFICATION_DB_REUSE_EXISTING_MIGRATION
  ensure(
    reuseExistingMigration === undefined || reuseExistingMigration === EXISTING_MIGRATION_GUARD,
    'existing migration reuse guard is invalid',
  )

  return {
    databaseUrl: databaseUrl.toString(),
    localOnly: false,
    reuseExistingMigration: reuseExistingMigration === EXISTING_MIGRATION_GUARD,
  }
}

function withTimeout(promise, label) {
  let timer
  return Promise.race([
    promise,
    new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error(`${label} timed out`)), OPERATION_TIMEOUT_MS)
    }),
  ]).finally(() => clearTimeout(timer))
}

async function query(client, text, params = []) {
  return withTimeout(client.query(text, params), 'database operation')
}

async function setAuthenticated(client, userId) {
  await query(client, 'set role authenticated')
  await query(client, "select set_config('request.jwt.claim.sub', $1, false)", [userId])
  await query(client, "select set_config('request.jwt.claim.role', 'authenticated', false)")
}

async function resetAuthenticated(client) {
  await query(client, 'reset role')
  await query(client, "select set_config('request.jwt.claim.sub', '', false)")
  await query(client, "select set_config('request.jwt.claim.role', '', false)")
}

async function asAuthenticated(client, userId, callback) {
  await setAuthenticated(client, userId)
  try {
    return await callback()
  } finally {
    await resetAuthenticated(client)
  }
}

async function asUntrustedRole(client, role, callback) {
  ensure(['anon', 'authenticated'].includes(role), `unsupported untrusted role: ${role}`)
  await query(client, `set role ${role}`)
  try {
    return await callback()
  } finally {
    await query(client, 'reset role')
  }
}

async function expectRejected(client, label, callback) {
  let error = null
  try {
    await callback()
  } catch (caught) {
    error = caught
  }
  ensure(error, `${label} unexpectedly succeeded`)
  return error
}

async function lookupFixtureIds(client) {
  const result = await query(
    client,
    `
      select id::text, email, role, status, deleted_at
      from public.profiles
      where email = any($1::text[])
    `,
    [Object.values(FIXTURE_EMAILS)],
  )
  const byEmail = new Map(result.rows.map((row) => [row.email, row]))
  const ids = {}
  for (const [key, email] of Object.entries(FIXTURE_EMAILS)) {
    const row = byEmail.get(email)
    ensure(row, `missing disposable profile: ${email}`)
    ensure(row.status === 'active' && row.deleted_at === null, `${key} fixture is not active`)
    ids[key] = row.id
  }
  ensure(['owner', 'admin'].includes(byEmail.get(FIXTURE_EMAILS.manager).role), 'manager fixture lacks financial role')
  ensure(byEmail.get(FIXTURE_EMAILS.buyer).role === 'user', 'buyer fixture must be a customer')
  ensure(byEmail.get(FIXTURE_EMAILS.support).role === 'support', 'support fixture must be read-only support')
  return ids
}

async function applyMigration(client, config) {
  const existing = await query(client, "select to_regclass('public.notifications') as notifications")
  if (existing.rows[0].notifications !== null) {
    ensure(
      config.reuseExistingMigration,
      'disposable target already has public.notifications; use a fresh target or explicitly reuse the canonical migration',
    )
    await assertNotificationMetadata(client)
    return { alreadyApplied: true }
  }

  await query(client, 'begin')
  try {
    await query(client, MIGRATION_SQL)
    await query(client, 'commit')
  } catch (error) {
    await query(client, 'rollback').catch(() => {})
    throw error
  }
  const objects = await query(
    client,
    `
      select
        to_regclass('public.notifications') is not null as table_exists,
        to_regprocedure('public.try_create_package_approved_notification(uuid)') is not null as producer_exists,
        to_regprocedure('public.approve_payment_submission(uuid)') is not null as approve_exists,
        exists (
          select 1
          from pg_class
          where oid = 'public.notifications'::regclass
            and relrowsecurity
        ) as rls_enabled,
        exists (select 1 from pg_indexes where indexname = 'notifications_user_unread_idx') as unread_index,
        exists (select 1 from pg_indexes where indexname = 'notifications_user_created_at_idx') as created_index,
        exists (select 1 from pg_indexes where indexname = 'notifications_type_source_order_key') as dedupe_index,
        has_table_privilege('authenticated', 'public.notifications', 'SELECT') as authenticated_select,
        has_table_privilege('authenticated', 'public.notifications', 'INSERT') as authenticated_insert,
        has_column_privilege('authenticated', 'public.notifications', 'read_at', 'UPDATE') as authenticated_read_at_update,
        has_column_privilege('authenticated', 'public.notifications', 'title', 'UPDATE') as authenticated_title_update,
        has_table_privilege('authenticated', 'public.notifications', 'DELETE') as authenticated_delete
    `,
  )
  assert.deepEqual(objects.rows[0], {
    table_exists: true,
    producer_exists: true,
    approve_exists: true,
    rls_enabled: true,
    unread_index: true,
    created_index: true,
    dedupe_index: true,
    authenticated_select: true,
    authenticated_insert: false,
    authenticated_read_at_update: true,
    authenticated_title_update: false,
    authenticated_delete: false,
  })

  return { alreadyApplied: false }
}

async function assertNotificationMetadata(client) {
  const relation = await query(
    client,
    `
      select relrowsecurity as rls_enabled, relforcerowsecurity as rls_forced
      from pg_class
      where oid = 'public.notifications'::regclass
    `,
  )
  assert.deepEqual(relation.rows[0], { rls_enabled: true, rls_forced: false })

  const policies = await query(
    client,
    `
      select policyname, cmd, roles::text, qual, with_check
      from pg_policies
      where schemaname = 'public' and tablename = 'notifications'
      order by policyname
    `,
  )
  const policiesByName = new Map(policies.rows.map((row) => [row.policyname, row]))
  const selectPolicy = policiesByName.get('Users can view own notifications.')
  const updatePolicy = policiesByName.get('Users can mark own notifications read.')
  ensure(selectPolicy && updatePolicy, 'notification RLS policies are incomplete')
  assert.equal(selectPolicy.cmd, 'SELECT')
  assert.equal(selectPolicy.roles, '{authenticated}')
  assert.match(selectPolicy.qual, /user_id\s*=\s*auth\.uid\(\)/i)
  assert.equal(updatePolicy.cmd, 'UPDATE')
  assert.equal(updatePolicy.roles, '{authenticated}')
  assert.match(updatePolicy.qual, /user_id\s*=\s*auth\.uid\(\)/i)
  assert.match(updatePolicy.with_check, /user_id\s*=\s*auth\.uid\(\)/i)
  assert.match(updatePolicy.with_check, /read_at\s+is\s+not\s+null/i)

  const privileges = await query(
    client,
    `
      select
        has_table_privilege('anon', 'public.notifications', 'SELECT') as anon_select,
        has_table_privilege('authenticated', 'public.notifications', 'SELECT') as authenticated_select,
        has_table_privilege('authenticated', 'public.notifications', 'INSERT') as authenticated_insert,
        has_table_privilege('authenticated', 'public.notifications', 'DELETE') as authenticated_delete,
        has_table_privilege('authenticated', 'public.notifications', 'UPDATE') as authenticated_table_update,
        has_column_privilege('authenticated', 'public.notifications', 'read_at', 'UPDATE') as read_at_update,
        has_column_privilege('authenticated', 'public.notifications', 'user_id', 'UPDATE') as user_id_update,
        has_column_privilege('authenticated', 'public.notifications', 'type', 'UPDATE') as type_update,
        has_column_privilege('authenticated', 'public.notifications', 'title', 'UPDATE') as title_update,
        has_column_privilege('authenticated', 'public.notifications', 'body', 'UPDATE') as body_update,
        has_column_privilege('authenticated', 'public.notifications', 'href', 'UPDATE') as href_update,
        has_column_privilege('authenticated', 'public.notifications', 'source_order_id', 'UPDATE') as source_order_id_update,
        has_column_privilege('authenticated', 'public.notifications', 'created_at', 'UPDATE') as created_at_update
    `,
  )
  assert.deepEqual(privileges.rows[0], {
    anon_select: false,
    authenticated_select: true,
    authenticated_insert: false,
    authenticated_delete: false,
    authenticated_table_update: false,
    read_at_update: true,
    user_id_update: false,
    type_update: false,
    title_update: false,
    body_update: false,
    href_update: false,
    source_order_id_update: false,
    created_at_update: false,
  })

  const indexes = await query(
    client,
    `
      select indexname, indexdef
      from pg_indexes
      where schemaname = 'public'
        and tablename = 'notifications'
        and indexname = any($1::text[])
      order by indexname
    `,
    [[
      'notifications_type_source_order_key',
      'notifications_user_unread_idx',
      'notifications_user_created_at_idx',
    ]],
  )
  assert.equal(indexes.rows.length, 3)
  assert.ok(indexes.rows.some((row) => row.indexname === 'notifications_type_source_order_key' && /unique/i.test(row.indexdef)))
  assert.ok(indexes.rows.some((row) => row.indexname === 'notifications_user_unread_idx' && /read_at\s+is\s+null/i.test(row.indexdef)))
  assert.ok(indexes.rows.some((row) => row.indexname === 'notifications_user_created_at_idx'))

  const constraints = await query(
    client,
    `
      select conname, contype, pg_get_constraintdef(oid, true) as definition
      from pg_constraint
      where conrelid = 'public.notifications'::regclass
      order by conname
    `,
  )
  assert.ok(constraints.rows.some((row) => row.conname === 'notifications_type_source_order_key' && row.contype === 'u'))
  assert.ok(constraints.rows.some((row) => row.conname === 'notifications_user_id_fkey' && /references profiles\(id\) on delete cascade/i.test(row.definition)))
  assert.ok(constraints.rows.some((row) => row.conname === 'notifications_source_order_id_fkey' && /references orders\(id\) on delete cascade/i.test(row.definition)))

  const functions = await query(
    client,
    `
      select p.oid::regprocedure::text as signature,
             p.prosecdef as security_definer,
             p.proconfig as configuration,
             has_function_privilege('public', p.oid, 'EXECUTE') as public_execute,
             has_function_privilege('anon', p.oid, 'EXECUTE') as anon_execute,
             has_function_privilege('authenticated', p.oid, 'EXECUTE') as authenticated_execute,
             has_function_privilege('service_role', p.oid, 'EXECUTE') as service_role_execute
      from pg_proc p
      where p.oid in (
        to_regprocedure('public.try_create_package_approved_notification(uuid)'),
        to_regprocedure('public.approve_payment_submission(uuid)'),
        to_regprocedure('public.guard_manual_payment_paid_transition()')
      )
      order by p.oid::regprocedure::text
    `,
  )
  const bySignature = new Map(functions.rows.map((row) => [row.signature, row]))
  const helper = bySignature.get('try_create_package_approved_notification(uuid)')
  ensure(helper, 'notification producer metadata is missing')
  assert.equal(helper.security_definer, true)
  assert.deepEqual(helper.configuration, ['search_path=pg_catalog, public, auth, pg_temp', 'lock_timeout=5s'])
  assert.deepEqual(
    [helper.public_execute, helper.anon_execute, helper.authenticated_execute, helper.service_role_execute],
    [false, false, false, false],
  )

  const approval = bySignature.get('approve_payment_submission(uuid)')
  ensure(approval, 'approval RPC metadata is missing after migration')
  assert.equal(approval.security_definer, true)
  assert.deepEqual(approval.configuration, ['search_path=pg_catalog, public, auth, pg_temp', 'lock_timeout=5s'])
  assert.deepEqual(
    [approval.public_execute, approval.anon_execute, approval.authenticated_execute, approval.service_role_execute],
    [false, false, true, false],
  )

  const guard = bySignature.get('guard_manual_payment_paid_transition()')
  ensure(guard, 'manual payment guard metadata is missing')
  assert.equal(guard.security_definer, true)
  assert.deepEqual(guard.configuration, ['search_path=pg_catalog, public, pg_temp'])
  assert.deepEqual(
    [guard.public_execute, guard.anon_execute, guard.authenticated_execute, guard.service_role_execute],
    [false, false, false, false],
  )

  return {
    rls_enabled: true,
    policies: ['own_select', 'own_read_update'],
    update_read_at_only: true,
    insert_delete_denied: true,
    helper_security_definer_fixed_search_path: true,
    helper_execute_denied_to_untrusted_roles: true,
    approval_security_unchanged: true,
    foreign_keys_cascade: true,
    unique_type_source_order: true,
    unread_and_list_indexes: true,
  }
}

async function assertMigrationDriftFailsClosed(client) {
  const existing = await query(client, "select to_regclass('public.notifications') as notifications")
  if (existing.rows[0].notifications !== null) {
    const suffix = randomUUID().replaceAll('-', '')
    const renamedTable = `notifications_n1_drift_existing_${suffix}`

    let migrationError = null
    await query(client, 'begin')
    try {
      await query(client, "set local lock_timeout = '5s'")
      await query(client, `alter table public.notifications rename to ${renamedTable}`)
      await query(client, 'create table public.notifications (sentinel text)')
      await query(client, MIGRATION_SQL)
    } catch (error) {
      migrationError = error
    }
    await query(client, 'rollback').catch(() => {})

    ensure(migrationError, 'migration accepted an incompatible pre-existing notifications object')
    assert.equal(migrationError.code, '42710')
    const restored = await query(client, "select to_regclass('public.notifications') as notifications")
    assert.notEqual(restored.rows[0].notifications, null)
    const temporarySentinel = await query(client, `select to_regclass('public.${renamedTable}') as notifications`)
    assert.equal(temporarySentinel.rows[0].notifications, null)
    return {
      migration_drift_fails_closed: true,
      mode: 'existing canonical table temporarily renamed in a rolled-back transaction',
    }
  }

  let migrationError = null
  await query(client, 'begin')
  try {
    await query(client, 'create table public.notifications (sentinel text)')
    await query(client, MIGRATION_SQL)
  } catch (error) {
    migrationError = error
  }
  await query(client, 'rollback').catch(() => {})

  ensure(migrationError, 'migration accepted an incompatible pre-existing notifications object')
  assert.equal(migrationError.code, '42710')
  const remaining = await query(client, "select to_regclass('public.notifications') as notifications")
  assert.equal(remaining.rows[0].notifications, null)
  return { migration_drift_fails_closed: true, mode: 'sentinel table rolled back' }
}

async function insertPackage(client, id, suffix) {
  await query(
    client,
    `
      insert into public.packages (
        id, slug, package_code, name, current_price, original_price,
        difficulty, features, is_published
      ) values ($1, $2, $3, $4, 900, 900, 'Mixed', '[]'::jsonb, true)
    `,
    [id, `n1-${suffix}-${id.slice(0, 8)}`, `N1-${suffix}-${id.slice(0, 8)}`, `N1 ${suffix}`],
  )
}

async function insertOrder(client, id, userId, packageId, status = 'pending') {
  await query(
    client,
    `
      insert into public.orders (id, user_id, package_id, amount, status, payment_provider)
      values ($1, $2, $3, 900, $4, 'promptpay_manual')
    `,
    [id, userId, packageId, status],
  )
}

async function insertSubmission(client, id, orderId, userId, suffix) {
  await query(
    client,
    `
      insert into public.payment_submissions (
        id, order_id, idempotency_key, storage_object_path, original_filename,
        mime_type, file_size_bytes, payment_method, status
      ) values ($1, $2, $3, $4, $5, 'image/png', 128, 'promptpay_manual', 'submitted')
    `,
    [
      id,
      orderId,
      randomUUID(),
      `${userId}/${orderId}/${randomUUID()}.png`,
      `${suffix}.png`,
    ],
  )
}

async function notificationCount(client, orderId) {
  const result = await query(
    client,
    `select count(*)::int as count from public.notifications where source_order_id = $1 and type = 'PACKAGE_APPROVED'`,
    [orderId],
  )
  return result.rows[0].count
}

async function paymentState(client, submissionId) {
  const result = await query(
    client,
    `
      select ps.status as submission_status,
             ps.reviewed_at is not null as reviewed,
             ps.reviewed_by::text as reviewed_by,
             o.status as order_status
      from public.payment_submissions ps
      join public.orders o on o.id = ps.order_id
      where ps.id = $1
    `,
    [submissionId],
  )
  return result.rows[0] ?? null
}

async function orderState(client, orderId) {
  const result = await query(client, 'select status from public.orders where id = $1', [orderId])
  return result.rows[0]?.status ?? null
}

async function createFailureTrigger(client) {
  const suffix = randomUUID().replaceAll('-', '')
  const functionName = `n1_notification_failure_${suffix}`
  const triggerName = `n1_notification_failure_${suffix}`
  await query(
    client,
    `
      create function public.${functionName}()
      returns trigger
      language plpgsql
      as $failure$
      begin
        raise exception using errcode = 'P0001', message = 'notification V1 integration failure injection';
      end
      $failure$;
      create trigger ${triggerName}
      before insert on public.notifications
      for each row execute function public.${functionName}();
    `,
  )
  return { functionName, triggerName }
}

async function dropFailureTrigger(client, trigger) {
  if (!trigger) return
  await query(client, `drop trigger if exists ${trigger.triggerName} on public.notifications`)
  await query(client, `drop function if exists public.${trigger.functionName}()`)
}

async function assertHelperExecutionFenced(client, orderId) {
  for (const role of ['anon', 'authenticated']) {
    const error = await asUntrustedRole(client, role, () =>
      expectRejected(client, `${role} notification producer execution`, () =>
        query(client, 'select public.try_create_package_approved_notification($1)', [orderId]),
      ),
    )
    assert.equal(error.code, '42501')
  }
  return true
}

async function createClient(config) {
  const client = new Client({
    connectionString: config.databaseUrl,
    ...(config.localOnly ? {} : { ssl: { rejectUnauthorized: false } }),
    connectionTimeoutMillis: 10000,
  })
  await client.connect()
  await query(client, `set statement_timeout = '${STATEMENT_TIMEOUT}'`)
  return client
}

async function cleanup(client, ids) {
  await resetAuthenticated(client).catch(() => {})
  await query(client, 'delete from public.notifications where source_order_id = any($1::uuid[])', [ids.orders]).catch(() => {})
  await query(client, 'delete from public.payment_submissions where id = any($1::uuid[])', [ids.submissions]).catch(() => {})
  await query(client, 'delete from public.orders where id = any($1::uuid[])', [ids.orders]).catch(() => {})
  await query(client, 'delete from public.packages where id = any($1::uuid[])', [ids.packages]).catch(() => {})
}

async function runProof() {
  const config = readConfiguration()
  const client = await createClient(config)
  const cleanupIds = { packages: [], orders: [], submissions: [] }
  let failureTrigger = null
  const extraClients = []

  try {
    const ids = await lookupFixtureIds(client)
    const migrationDrift = await assertMigrationDriftFailsClosed(client)
    const migration = await applyMigration(client, config)
    const metadata = await assertNotificationMetadata(client)

    const flows = ['recovery', 'success', 'rejected', 'concurrent', 'support'].map((name) => ({
      packageId: randomUUID(),
      orderId: randomUUID(),
      submissionId: randomUUID(),
      name,
    }))
    cleanupIds.packages = flows.map((flow) => flow.packageId)
    cleanupIds.orders = flows.map((flow) => flow.orderId)
    cleanupIds.submissions = flows.map((flow) => flow.submissionId)

    await query(client, 'begin')
    for (const flow of flows) {
      await insertPackage(client, flow.packageId, flow.name)
      await insertOrder(client, flow.orderId, flow.name === 'support' ? ids.support : ids.buyer, flow.packageId)
      await insertSubmission(
        client,
        flow.submissionId,
        flow.orderId,
        flow.name === 'support' ? ids.support : ids.buyer,
        flow.name,
      )
    }
    await query(client, 'commit')

    failureTrigger = await createFailureTrigger(client)
    await asAuthenticated(client, ids.manager, () =>
      query(client, 'select * from public.approve_payment_submission($1)', [flows[0].submissionId]),
    )
    assert.equal(await orderState(client, flows[0].orderId), 'paid')
    assert.equal(await notificationCount(client, flows[0].orderId), 0)
    assert.deepEqual(await paymentState(client, flows[0].submissionId), {
      submission_status: 'approved',
      reviewed: true,
      reviewed_by: ids.manager,
      order_status: 'paid',
    })
    const accessWithoutNotification = await query(
      client,
      `select id from public.orders where id = $1 and status in ('paid', 'free')`,
      [flows[0].orderId],
    )
    assert.equal(accessWithoutNotification.rows.length, 1)

    await dropFailureTrigger(client)
    failureTrigger = null
    await asAuthenticated(client, ids.manager, () =>
      query(client, 'select * from public.approve_payment_submission($1)', [flows[0].submissionId]),
    )
    await asAuthenticated(client, ids.manager, () =>
      query(client, 'select * from public.approve_payment_submission($1)', [flows[0].submissionId]),
    )
    assert.equal(await notificationCount(client, flows[0].orderId), 1)
    assert.deepEqual((await paymentState(client, flows[0].submissionId)).order_status, 'paid')

    await asAuthenticated(client, ids.manager, () =>
      query(client, 'select * from public.approve_payment_submission($1)', [flows[1].submissionId]),
    )
    await asAuthenticated(client, ids.manager, () =>
      query(client, 'select * from public.approve_payment_submission($1)', [flows[1].submissionId]),
    )
    const successNotification = await query(
      client,
      `select href, type from public.notifications where source_order_id = $1`,
      [flows[1].orderId],
    )
    assert.deepEqual(successNotification.rows, [{ href: '/my-packages', type: 'PACKAGE_APPROVED' }])
    assert.equal(await orderState(client, flows[1].orderId), 'paid')

    const rejected = await asAuthenticated(client, ids.manager, () =>
      query(client, 'select * from public.reject_payment_submission($1, $2)', [flows[2].submissionId, 'integration rejection']),
    )
    assert.equal(rejected.rows[0].status, 'rejected')
    assert.equal(await orderState(client, flows[2].orderId), 'pending')
    assert.equal(await notificationCount(client, flows[2].orderId), 0)
    assert.deepEqual(await paymentState(client, flows[2].submissionId), {
      submission_status: 'rejected',
      reviewed: true,
      reviewed_by: ids.manager,
      order_status: 'pending',
    })

    const concurrentA = await createClient(config)
    const concurrentB = await createClient(config)
    extraClients.push(concurrentA, concurrentB)
    const concurrentResults = await Promise.all([
      asAuthenticated(concurrentA, ids.manager, () =>
        query(concurrentA, 'select * from public.approve_payment_submission($1)', [flows[3].submissionId]),
      ),
      asAuthenticated(concurrentB, ids.manager, () =>
        query(concurrentB, 'select * from public.approve_payment_submission($1)', [flows[3].submissionId]),
      ),
    ])
    assert.deepEqual(concurrentResults.map((result) => result.rows[0].status), ['approved', 'approved'])
    assert.equal(await notificationCount(client, flows[3].orderId), 1)
    assert.deepEqual((await paymentState(client, flows[3].submissionId)).order_status, 'paid')

    await asAuthenticated(client, ids.manager, () =>
      query(client, 'select * from public.approve_payment_submission($1)', [flows[4].submissionId]),
    )
    const supportNotification = await query(
      client,
      `select id::text, user_id::text, read_at from public.notifications where source_order_id = $1`,
      [flows[4].orderId],
    )
    assert.equal(supportNotification.rows.length, 1)
    const supportNotificationId = supportNotification.rows[0].id
    const helperExecutionFenced = await assertHelperExecutionFenced(client, flows[4].orderId)

    const buyerRows = await asAuthenticated(client, ids.buyer, () =>
      query(client, 'select id::text, user_id::text from public.notifications order by created_at'),
    )
    ensure(buyerRows.rows.length === 3, 'buyer should see only buyer-owned notification rows')
    ensure(buyerRows.rows.every((row) => row.user_id === ids.buyer), 'buyer saw a foreign notification row')
    const foreignSelect = await asAuthenticated(client, ids.buyer, () =>
      query(client, 'select id from public.notifications where id = $1', [supportNotificationId]),
    )
    assert.equal(foreignSelect.rows.length, 0)

    const foreignRead = await asAuthenticated(client, ids.buyer, () =>
      query(client, 'update public.notifications set read_at = now() where id = $1 returning id', [supportNotificationId]),
    )
    assert.equal(foreignRead.rows.length, 0)

    const buyerNotification = await query(
      client,
      'select id::text from public.notifications where source_order_id = $1',
      [flows[0].orderId],
    )
    const ownNotificationId = buyerNotification.rows[0].id
    const ownReadCorrect = await asAuthenticated(client, ids.buyer, () =>
      query(client, 'update public.notifications set read_at = now() where id = $1 returning id', [ownNotificationId]),
    )
    assert.equal(ownReadCorrect.rows.length, 1)

    const immutableAssignments = [
      ['user_id', '$2', [ownNotificationId, ids.support]],
      ['type', "'PACKAGE_APPROVED'", [ownNotificationId]],
      ['title', "'forged'", [ownNotificationId]],
      ['body', "'forged'", [ownNotificationId]],
      ['href', "'/forged'", [ownNotificationId]],
      ['source_order_id', '$2', [ownNotificationId, flows[4].orderId]],
      ['created_at', 'now()', [ownNotificationId]],
    ]
    for (const [column, expression, params] of immutableAssignments) {
      const error = await asAuthenticated(client, ids.buyer, () =>
        expectRejected(client, `immutable ${column} update`, () =>
          query(client, `update public.notifications set ${column} = ${expression} where id = $1`, params),
        ),
      )
      assert.equal(error.code, '42501')
    }

    const forgedInsertError = await asAuthenticated(client, ids.buyer, () =>
      expectRejected(client, 'forged notification insert', () =>
        query(
          client,
          `
            insert into public.notifications (user_id, type, title, body, href, source_order_id)
            values ($1, 'PACKAGE_APPROVED', 'forged', 'forged', '/my-packages', $2)
          `,
          [ids.buyer, flows[4].orderId],
        ),
      ),
    )
    assert.equal(forgedInsertError.code, '42501')

    const deleteError = await asAuthenticated(client, ids.buyer, () =>
      expectRejected(client, 'notification delete', () =>
        query(client, 'delete from public.notifications where id = $1', [ownNotificationId]),
      ),
    )
    assert.equal(deleteError.code, '42501')

    await query(
      client,
      `
        insert into public.notifications (user_id, type, title, body, href, source_order_id)
        values ($1, 'PACKAGE_APPROVED', 'test-only pending notification', 'test-only pending notification', '/my-packages', $2)
      `,
      [ids.buyer, flows[2].orderId],
    )
    const pendingNotification = await asAuthenticated(client, ids.buyer, () =>
      query(client, 'select id from public.notifications where source_order_id = $1', [flows[2].orderId]),
    )
    assert.equal(pendingNotification.rows.length, 1)
    const accessWithNotificationOnly = await query(
      client,
      `select id from public.orders where id = $1 and status in ('paid', 'free')`,
      [flows[2].orderId],
    )
    assert.equal(accessWithNotificationOnly.rows.length, 0)

    const access = await query(
      client,
      `select id from public.orders where id = $1 and status in ('paid', 'free')`,
      [flows[0].orderId],
    )
    assert.equal(access.rows.length, 1)

    await dropFailureTrigger(client)
    failureTrigger = null
    console.log(JSON.stringify({
      status: 'PASS',
      database: 'disposable-only',
      migration: migration.alreadyApplied ? '092 (already applied; canonical metadata verified)' : '092',
      environment: {
        project_ref: config.localOnly ? null : process.env.N1_NOTIFICATION_DB_TEST_PROJECT_REF,
        explicit_test_variables: true,
        application_environment_rejected: true,
        dotenv_files_loaded: false,
      },
      migration_drift: migrationDrift,
      metadata,
      assertions: {
        approval_paid_and_one_notification: true,
        approval_retry_remains_one_notification: true,
        notification_failure_keeps_payment_paid: true,
        notification_failure_keeps_paid_access: true,
        notification_retry_recovers_one_notification: true,
        concurrent_repeated_approval_dedupes_without_payment_corruption: true,
        rejection_creates_no_approval_notification: true,
        cross_user_select_denied: true,
        cross_user_read_mutation_denied: true,
        owner_read_mutation_allowed: true,
        immutable_fields_denied: true,
        forged_insert_denied: true,
        delete_denied: true,
        helper_execution_denied_to_untrusted_roles: helperExecutionFenced,
        notification_presence_does_not_grant_access: true,
      },
    }, null, 2))
  } finally {
    await dropFailureTrigger(client, failureTrigger).catch(() => {})
    for (const extraClient of extraClients) {
      await extraClient.end().catch(() => {})
    }
    await cleanup(client, cleanupIds)
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
