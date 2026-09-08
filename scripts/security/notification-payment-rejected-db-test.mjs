#!/usr/bin/env node

import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import pg from 'pg'

const { Client } = pg

const TEST_GUARD = 'YES_I_AM_USING_SOBDAI_NOTIFICATION_V1_TEST'
const REUSE_MIGRATION_GUARD = 'YES_I_AM_REUSING_PAYMENT_REJECTED_NOTIFICATION_MIGRATION'
const STATEMENT_TIMEOUT = '15000ms'
const OPERATION_TIMEOUT_MS = 30000
const EXPECTED_TEST_PROJECT_REF = 'nbxkvmcvnigegkkscfau'
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
const MIGRATION_SQL = readFileSync(join(ROOT, 'supabase/migrations/093_payment_rejected_notification.sql'), 'utf8')
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
  assert.equal(process.env.N1_NOTIFICATION_DB_TEST_PROJECT_REF, EXPECTED_TEST_PROJECT_REF)

  const supabaseUrl = new URL(process.env.N1_NOTIFICATION_DB_TEST_SUPABASE_URL)
  assert.equal(supabaseUrl.protocol, 'https:')
  assert.equal(supabaseUrl.hostname, `${EXPECTED_TEST_PROJECT_REF}.supabase.co`)
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
    databaseUrl.hostname === `db.${EXPECTED_TEST_PROJECT_REF}.supabase.co`
      || /^[a-z0-9-]+\.pooler\.supabase\.com$/.test(databaseUrl.hostname),
    'database must be the declared Supabase project',
  )

  if (databaseUrl.hostname === `db.${EXPECTED_TEST_PROJECT_REF}.supabase.co`) {
    assert.equal(databaseUrl.username, 'postgres')
  } else {
    assert.equal(databaseUrl.username, `postgres.${EXPECTED_TEST_PROJECT_REF}`)
  }

  const reuseMigration = process.env.N1_NOTIFICATION_DB_REUSE_REJECTED_MIGRATION
  ensure(
    reuseMigration === undefined || reuseMigration === REUSE_MIGRATION_GUARD,
    'rejected notification migration reuse guard is invalid',
  )

  return {
    databaseUrl: databaseUrl.toString(),
    reuseMigration: reuseMigration === REUSE_MIGRATION_GUARD,
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
  const savepoint = `n1_rejected_expected_${randomUUID().replaceAll('-', '')}`
  await query(client, 'begin')
  await query(client, `savepoint ${savepoint}`)
  let error = null
  try {
    await callback()
  } catch (caught) {
    error = caught
  }
  await query(client, `rollback to savepoint ${savepoint}`).catch(() => {})
  await query(client, `release savepoint ${savepoint}`).catch(() => {})
  await query(client, 'rollback')
  ensure(error, `${label} unexpectedly succeeded`)
  return error
}

async function createClient(config) {
  const client = new Client({
    connectionString: config.databaseUrl,
    ssl: { rejectUnauthorized: false },
    connectionTimeoutMillis: 30000,
  })
  await client.connect()
  await query(client, `set statement_timeout = '${STATEMENT_TIMEOUT}'`)
  return client
}

async function inventory(client) {
  const result = await query(
    client,
    `
      select
        current_database() as database_name,
        current_user as database_user,
        to_regclass('public.profiles') is not null as profiles,
        to_regclass('public.packages') is not null as packages,
        to_regclass('public.orders') is not null as orders,
        to_regclass('public.payment_submissions') is not null as payment_submissions,
        to_regclass('public.notifications') is not null as notifications,
        to_regprocedure('public.approve_payment_submission(uuid)') is not null as approve_rpc,
        to_regprocedure('public.reject_payment_submission(uuid,text)') is not null as reject_rpc
    `,
  )
  const row = result.rows[0]
  assert.equal(row.profiles, true)
  assert.equal(row.packages, true)
  assert.equal(row.orders, true)
  assert.equal(row.payment_submissions, true)
  assert.equal(row.notifications, true)
  assert.equal(row.approve_rpc, true)
  assert.equal(row.reject_rpc, true)
  return {
    database_name: row.database_name,
    database_user: row.database_user,
    expected_project_ref: EXPECTED_TEST_PROJECT_REF,
    canonical_092_objects_present: true,
  }
}

async function assertCanonicalMigrationShape(client) {
  const structure = await query(
    client,
    `
      select
        exists (
          select 1
            from information_schema.columns
           where table_schema = 'public'
             and table_name = 'notifications'
             and column_name = 'source_payment_submission_id'
             and udt_name = 'uuid'
             and is_nullable = 'YES'
        ) as source_column,
        exists (
          select 1
            from pg_constraint
           where conrelid = 'public.notifications'::regclass
             and conname = 'notifications_type_check'
             and pg_get_constraintdef(oid, true) ilike '%PACKAGE_APPROVED%'
             and pg_get_constraintdef(oid, true) ilike '%PAYMENT_REJECTED%'
        ) as type_check,
        not exists (
          select 1
            from pg_constraint
           where conrelid = 'public.notifications'::regclass
             and conname = 'notifications_type_source_order_key'
        ) as old_order_constraint_removed,
        exists (
          select 1
            from pg_indexes
           where schemaname = 'public'
             and indexname = 'notifications_type_source_order_key'
             and indexdef ilike '%CREATE UNIQUE INDEX%'
             and indexdef ilike '%(type, source_order_id)%'
             and indexdef ilike '%PACKAGE_APPROVED%'
        ) as approval_partial_index,
        exists (
          select 1
            from pg_constraint
           where conrelid = 'public.notifications'::regclass
             and conname = 'notifications_type_source_payment_submission_key'
             and pg_get_constraintdef(oid, true) ilike '%UNIQUE (type, source_payment_submission_id)%'
        ) as rejection_unique,
        exists (
          select 1
            from pg_constraint
           where conrelid = 'public.notifications'::regclass
             and conname = 'notifications_source_payment_submission_id_fkey'
             and pg_get_constraintdef(oid, true) ilike '%REFERENCES payment_submissions(id) ON DELETE CASCADE%'
        ) as source_fk,
        exists (
          select 1
            from pg_attrdef ad
            join pg_depend dep
              on dep.classid = 'pg_attrdef'::regclass
             and dep.objid = ad.oid
             and dep.refclassid = 'pg_proc'::regclass
            join pg_proc fn on fn.oid = dep.refobjid
            join pg_namespace ns on ns.oid = fn.pronamespace
            join pg_attribute att
              on att.attrelid = ad.adrelid
             and att.attnum = ad.adnum
           where ad.adrelid = 'public.notifications'::regclass
             and att.attname = 'id'
             and ns.nspname = 'extensions'
             and fn.proname = 'uuid_generate_v4'
        ) as uuid_default_extensions
    `,
  )
  assert.deepEqual(structure.rows[0], {
    source_column: true,
    type_check: true,
    old_order_constraint_removed: true,
    approval_partial_index: true,
    rejection_unique: true,
    source_fk: true,
    uuid_default_extensions: true,
  })

  const functions = await query(
    client,
    `select p.oid::regprocedure::text as signature,
            pg_get_functiondef(p.oid) as definition
       from pg_proc p
      where p.oid in (
        to_regprocedure('public.try_create_payment_rejected_notification(uuid)'),
        to_regprocedure('public.try_create_package_approved_notification(uuid)'),
        to_regprocedure('public.reject_payment_submission(uuid,text)')
      )`,
  )
  const bySignature = new Map(functions.rows.map((row) => [row.signature, row.definition]))
  const rejectedHelper = bySignature.get('try_create_payment_rejected_notification(uuid)')
  const approvedHelper = bySignature.get('try_create_package_approved_notification(uuid)')
  const rejectRpc = bySignature.get('reject_payment_submission(uuid,text)')
  ensure(rejectedHelper && approvedHelper && rejectRpc, '093 trusted function shape is incomplete')
  assert.match(rejectedHelper, /source_payment_submission_id/i)
  assert.match(rejectedHelper, /on conflict \(type, source_payment_submission_id\) do nothing/i)
  assert.match(approvedHelper, /on conflict \(type, source_order_id\) where type = 'PACKAGE_APPROVED' do nothing/i)
  assert.ok((rejectRpc.match(/try_create_payment_rejected_notification/g) ?? []).length >= 2)
  assert.doesNotMatch(rejectRpc, /update public\.orders[\s\S]*?set status/i)

  return {
    source_submission_uuid_column_nullable: true,
    package_approved_partial_order_dedupe: true,
    payment_rejected_submission_dedupe: true,
    source_submission_fk_cascade: true,
    uuid_default_uses_extensions_function: true,
    trusted_function_bodies_match_093: true,
  }
}

async function applyMigration(client, config) {
  const existing = await query(
    client,
    `select exists (
       select 1
       from information_schema.columns
       where table_schema = 'public'
         and table_name = 'notifications'
         and column_name = 'source_payment_submission_id'
     ) as applied`,
  )

  if (existing.rows[0].applied) {
    ensure(config.reuseMigration, '093 is already applied; explicit reuse guard is required')
    await assertCanonicalMigrationShape(client)
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
  await assertCanonicalMigrationShape(client)
  return { alreadyApplied: false }
}

async function assertMigrationDriftFailsClosed(client) {
  const suffix = randomUUID().replaceAll('-', '')
  const renamedTable = `notifications_n1_rejected_drift_${suffix}`
  let migrationError = null

  await query(client, 'begin')
  try {
    await query(client, `alter table public.notifications rename to ${renamedTable}`)
    await query(client, 'create table public.notifications (sentinel text)')
    await query(client, MIGRATION_SQL)
  } catch (error) {
    migrationError = error
  }
  await query(client, 'rollback').catch(() => {})

  ensure(migrationError, '093 accepted an incompatible pre-existing notifications object')
  assert.equal(migrationError.code, '23514')
  const restored = await query(client, "select to_regclass('public.notifications') as notifications")
  assert.notEqual(restored.rows[0].notifications, null)
  const renamed = await query(client, `select to_regclass('public.${renamedTable}') as notifications`)
  assert.equal(renamed.rows[0].notifications, null)
  return true
}

async function assertMetadata(client) {
  const structure = await query(
    client,
    `
      select
        exists (
          select 1 from information_schema.columns
          where table_schema = 'public' and table_name = 'notifications'
            and column_name = 'source_payment_submission_id' and udt_name = 'uuid'
        ) as source_column,
        exists (
          select 1 from pg_class
          where oid = 'public.notifications'::regclass and relrowsecurity
        ) as rls_enabled,
        exists (
          select 1 from pg_indexes
          where schemaname = 'public'
            and indexname = 'notifications_type_source_order_key'
            and indexdef ilike '%unique%'
            and indexdef ilike '%PACKAGE_APPROVED%'
        ) as approval_dedupe,
        exists (
          select 1 from pg_constraint
          where conrelid = 'public.notifications'::regclass
            and conname = 'notifications_type_source_payment_submission_key'
        ) as rejection_dedupe,
        has_table_privilege('authenticated', 'public.notifications', 'SELECT') as authenticated_select,
        has_table_privilege('authenticated', 'public.notifications', 'INSERT') as authenticated_insert,
        has_table_privilege('authenticated', 'public.notifications', 'DELETE') as authenticated_delete,
        has_table_privilege('authenticated', 'public.notifications', 'UPDATE') as authenticated_table_update,
        has_column_privilege('authenticated', 'public.notifications', 'read_at', 'UPDATE') as read_at_update,
        has_column_privilege('authenticated', 'public.notifications', 'source_payment_submission_id', 'UPDATE') as source_update
    `,
  )
  assert.deepEqual(structure.rows[0], {
    source_column: true,
    rls_enabled: true,
    approval_dedupe: true,
    rejection_dedupe: true,
    authenticated_select: true,
    authenticated_insert: false,
    authenticated_delete: false,
    authenticated_table_update: false,
    read_at_update: true,
    source_update: false,
  })

  const policies = await query(
    client,
    `select policyname, cmd, roles::text, qual, with_check
       from pg_policies
      where schemaname = 'public' and tablename = 'notifications'
      order by policyname`,
  )
  const policyByName = new Map(policies.rows.map((row) => [row.policyname, row]))
  const selectPolicy = policyByName.get('Users can view own notifications.')
  const updatePolicy = policyByName.get('Users can mark own notifications read.')
  ensure(selectPolicy && updatePolicy, 'notification RLS policies are incomplete')
  assert.equal(selectPolicy.roles, '{authenticated}')
  assert.match(selectPolicy.qual, /user_id\s*=\s*auth\.uid\(\)/i)
  assert.equal(updatePolicy.roles, '{authenticated}')
  assert.match(updatePolicy.qual, /user_id\s*=\s*auth\.uid\(\)/i)
  assert.match(updatePolicy.with_check, /read_at\s+is\s+not\s+null/i)

  const fks = await query(
    client,
    `select conname, pg_get_constraintdef(oid, true) as definition
       from pg_constraint
      where conrelid = 'public.notifications'::regclass
        and conname = 'notifications_source_payment_submission_id_fkey'`,
  )
  ensure(fks.rows.length === 1, 'source payment submission foreign key is missing')
  assert.match(fks.rows[0].definition, /references payment_submissions\(id\) on delete cascade/i)

  const functions = await query(
    client,
    `select p.oid::regprocedure::text as signature,
            p.prosecdef as security_definer,
            p.proconfig as configuration,
            has_function_privilege('public', p.oid, 'EXECUTE') as public_execute,
            has_function_privilege('anon', p.oid, 'EXECUTE') as anon_execute,
            has_function_privilege('authenticated', p.oid, 'EXECUTE') as authenticated_execute,
            has_function_privilege('service_role', p.oid, 'EXECUTE') as service_role_execute
       from pg_proc p
      where p.oid in (
        to_regprocedure('public.try_create_payment_rejected_notification(uuid)'),
        to_regprocedure('public.try_create_package_approved_notification(uuid)'),
        to_regprocedure('public.reject_payment_submission(uuid,text)'),
        to_regprocedure('public.approve_payment_submission(uuid)')
      )
      order by p.oid::regprocedure::text`,
  )
  const bySignature = new Map(functions.rows.map((row) => [row.signature, row]))
  const helper = bySignature.get('try_create_payment_rejected_notification(uuid)')
  ensure(helper, 'rejected notification helper metadata is missing')
  assert.equal(helper.security_definer, true)
  assert.deepEqual(helper.configuration, ['search_path=pg_catalog, public, auth, pg_temp', 'lock_timeout=5s'])
  assert.deepEqual(
    [helper.public_execute, helper.anon_execute, helper.authenticated_execute, helper.service_role_execute],
    [false, false, false, false],
  )

  const reject = bySignature.get('reject_payment_submission(uuid,text)')
  ensure(reject, 'rejection RPC metadata is missing')
  assert.equal(reject.security_definer, true)
  assert.deepEqual(reject.configuration, ['search_path=pg_catalog, public, auth, pg_temp', 'lock_timeout=5s'])
  assert.deepEqual(
    [reject.public_execute, reject.anon_execute, reject.authenticated_execute, reject.service_role_execute],
    [false, false, true, false],
  )

  const approval = bySignature.get('approve_payment_submission(uuid)')
  ensure(approval, 'approval RPC metadata is missing')
  assert.equal(approval.security_definer, true)
  assert.deepEqual(
    [approval.public_execute, approval.anon_execute, approval.authenticated_execute, approval.service_role_execute],
    [false, false, true, false],
  )

  return {
    rls_enabled: true,
    own_select_and_read_update_policies: true,
    update_read_at_only: true,
    insert_delete_denied: true,
    per_submission_unique_dedupe: true,
    source_submission_fk: true,
    trusted_helpers_fixed_search_path_and_fenced: true,
    rejection_and_approval_execute_only_for_authenticated: true,
  }
}

async function lookupFixtureIds(client) {
  const result = await query(
    client,
    `select id::text, email, role, status, deleted_at
       from public.profiles
      where email = any($1::text[])`,
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

async function insertPackage(client, id, suffix) {
  await query(
    client,
    `insert into public.packages (
       id, slug, package_code, name, current_price, original_price,
       difficulty, features, is_published
     ) values ($1, $2, $3, $4, 900, 900, 'Mixed', '[]'::jsonb, true)`,
    [id, `n1-rejected-${suffix}-${id.slice(0, 8)}`, `N1-R-${suffix}-${id.slice(0, 8)}`, `N1 rejected ${suffix}`],
  )
}

async function insertOrder(client, id, userId, packageId) {
  await query(
    client,
    `insert into public.orders (id, user_id, package_id, amount, status, payment_provider)
     values ($1, $2, $3, 900, 'pending', 'promptpay_manual')`,
    [id, userId, packageId],
  )
}

async function insertSubmission(client, id, orderId, userId, suffix) {
  await query(
    client,
    `insert into public.payment_submissions (
       id, order_id, idempotency_key, storage_object_path, original_filename,
       mime_type, file_size_bytes, payment_method, status
     ) values ($1, $2, $3, $4, $5, 'image/png', 128, 'promptpay_manual', 'submitted')`,
    [
      id,
      orderId,
      randomUUID(),
      `${userId}/${orderId}/${randomUUID()}.png`,
      `${suffix}.png`,
    ],
  )
}

async function notificationRows(client, orderId, type = 'PAYMENT_REJECTED') {
  const result = await query(
    client,
    `select id::text, type, title, body, href, source_order_id::text,
            source_payment_submission_id::text, read_at
       from public.notifications
      where source_order_id = $1 and type = $2
      order by created_at`,
    [orderId, type],
  )
  return result.rows
}

async function paymentState(client, submissionId) {
  const result = await query(
    client,
    `select ps.status as submission_status,
            ps.rejection_reason,
            ps.reviewed_at is not null as reviewed,
            ps.reviewed_by::text as reviewed_by,
            o.status as order_status
       from public.payment_submissions ps
       join public.orders o on o.id = ps.order_id
      where ps.id = $1`,
    [submissionId],
  )
  return result.rows[0] ?? null
}

async function createFailureTrigger(client) {
  const suffix = randomUUID().replaceAll('-', '')
  const functionName = `n1_rejected_failure_${suffix}`
  const triggerName = `n1_rejected_failure_${suffix}`
  await query(
    client,
    `create function public.${functionName}()
       returns trigger
       language plpgsql
       as $failure$
       begin
         raise exception using errcode = 'P0001', message = 'PAYMENT_REJECTED notification failure injection';
       end
       $failure$;
     create trigger ${triggerName}
       before insert on public.notifications
       for each row execute function public.${functionName}()`,
  )
  return { functionName, triggerName }
}

async function dropFailureTrigger(client, trigger) {
  if (!trigger) return
  await query(client, `drop trigger if exists ${trigger.triggerName} on public.notifications`)
  await query(client, `drop function if exists public.${trigger.functionName}()`)
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
  const extraClients = []
  let failureTrigger = null

  try {
    const target = await inventory(client)
    const ids = await lookupFixtureIds(client)
    const migrationDrift = await assertMigrationDriftFailsClosed(client)
    const migration = await applyMigration(client, config)
    const migrationShape = await assertCanonicalMigrationShape(client)
    const metadata = await assertMetadata(client)

    const packageRejected = randomUUID()
    const packageFailure = randomUUID()
    const packageApproved = randomUUID()
    const packageSupport = randomUUID()
    const orderRejected = randomUUID()
    const orderFailure = randomUUID()
    const orderApproved = randomUUID()
    const orderSupport = randomUUID()
    const submissionRejectedA = randomUUID()
    const submissionFailure = randomUUID()
    const submissionApproved = randomUUID()
    const submissionSupport = randomUUID()
    cleanupIds.packages = [packageRejected, packageFailure, packageApproved, packageSupport]
    cleanupIds.orders = [orderRejected, orderFailure, orderApproved, orderSupport]
    cleanupIds.submissions = [submissionRejectedA, submissionFailure, submissionApproved, submissionSupport]

    await query(client, 'begin')
    await insertPackage(client, packageRejected, 'rejected')
    await insertPackage(client, packageFailure, 'failure')
    await insertPackage(client, packageApproved, 'approved')
    await insertPackage(client, packageSupport, 'support')
    await insertOrder(client, orderRejected, ids.buyer, packageRejected)
    await insertOrder(client, orderFailure, ids.buyer, packageFailure)
    await insertOrder(client, orderApproved, ids.buyer, packageApproved)
    await insertOrder(client, orderSupport, ids.support, packageSupport)
    await insertSubmission(client, submissionRejectedA, orderRejected, ids.buyer, 'rejected-a')
    await insertSubmission(client, submissionFailure, orderFailure, ids.buyer, 'failure')
    await insertSubmission(client, submissionApproved, orderApproved, ids.buyer, 'approved')
    await insertSubmission(client, submissionSupport, orderSupport, ids.support, 'support')
    await query(client, 'commit')

    const rejected = await asAuthenticated(client, ids.manager, () =>
      query(client, 'select * from public.reject_payment_submission($1, $2)', [submissionRejectedA, 'internal reviewer note']),
    )
    assert.deepEqual(rejected.rows[0], {
      payment_submission_id: submissionRejectedA,
      order_id: orderRejected,
      status: 'rejected',
    })
    const firstRejectedRows = await notificationRows(client, orderRejected)
    assert.equal(firstRejectedRows.length, 1)
    assert.deepEqual(firstRejectedRows[0], {
      id: firstRejectedRows[0].id,
      type: 'PAYMENT_REJECTED',
      title: 'การชำระเงินยังไม่ผ่าน',
      body: 'กรุณาตรวจสอบและส่งหลักฐานการชำระเงินใหม่',
      href: `/checkout/${packageRejected}`,
      source_order_id: orderRejected,
      source_payment_submission_id: submissionRejectedA,
      read_at: null,
    })
    assert.equal((await paymentState(client, submissionRejectedA)).order_status, 'pending')
    assert.equal(
      (await query(client, `select id from public.orders where id = $1 and status in ('paid', 'free')`, [orderRejected])).rows.length,
      0,
    )

    const rejectionRetry = await asAuthenticated(client, ids.manager, () =>
      query(client, 'select * from public.reject_payment_submission($1, $2)', [submissionRejectedA, 'different retry reason']),
    )
    assert.deepEqual(rejectionRetry.rows[0], rejected.rows[0])
    assert.equal((await notificationRows(client, orderRejected)).length, 1)

    const submissionRejectedB = randomUUID()
    cleanupIds.submissions.push(submissionRejectedB)
    await insertSubmission(client, submissionRejectedB, orderRejected, ids.buyer, 'rejected-b')
    await asAuthenticated(client, ids.manager, () =>
      query(client, 'select * from public.reject_payment_submission($1, $2)', [submissionRejectedB, 'second attempt']),
    )
    const laterRejectedRows = await notificationRows(client, orderRejected)
    assert.equal(laterRejectedRows.length, 2)
    assert.deepEqual(
      laterRejectedRows.map((row) => row.source_payment_submission_id).sort(),
      [submissionRejectedA, submissionRejectedB].sort(),
    )

    failureTrigger = await createFailureTrigger(client)
    await asAuthenticated(client, ids.manager, () =>
      query(client, 'select * from public.reject_payment_submission($1, $2)', [submissionFailure, 'failure injection']),
    )
    assert.equal((await notificationRows(client, orderFailure)).length, 0)
    const failedRejectionState = await paymentState(client, submissionFailure)
    assert.equal(failedRejectionState.submission_status, 'rejected')
    assert.equal(failedRejectionState.order_status, 'pending')
    await dropFailureTrigger(client, failureTrigger)
    failureTrigger = null
    await asAuthenticated(client, ids.manager, () =>
      query(client, 'select * from public.reject_payment_submission($1, $2)', [submissionFailure, 'failure recovery retry']),
    )
    assert.equal((await notificationRows(client, orderFailure)).length, 1)

    const approved = await asAuthenticated(client, ids.manager, () =>
      query(client, 'select * from public.approve_payment_submission($1)', [submissionApproved]),
    )
    assert.equal(approved.rows[0].status, 'approved')
    assert.equal((await notificationRows(client, orderApproved, 'PAYMENT_REJECTED')).length, 0)
    assert.equal((await notificationRows(client, orderApproved, 'PACKAGE_APPROVED')).length, 1)
    assert.equal((await paymentState(client, submissionApproved)).order_status, 'paid')

    const supportRejected = await asAuthenticated(client, ids.manager, () =>
      query(client, 'select * from public.reject_payment_submission($1, $2)', [submissionSupport, 'support-visible reason']),
    )
    assert.equal(supportRejected.rows[0].status, 'rejected')
    const supportRows = await notificationRows(client, orderSupport)
    const supportNotificationId = supportRows[0].id
    const buyerForeignSelect = await asAuthenticated(client, ids.buyer, () =>
      query(client, 'select id from public.notifications where id = $1', [supportNotificationId]),
    )
    assert.equal(buyerForeignSelect.rows.length, 0)
    const buyerForeignUpdate = await asAuthenticated(client, ids.buyer, () =>
      query(client, 'update public.notifications set read_at = now() where id = $1 returning id', [supportNotificationId]),
    )
    assert.equal(buyerForeignUpdate.rows.length, 0)

    const ownRejectedId = firstRejectedRows[0].id
    const ownRead = await asAuthenticated(client, ids.buyer, () =>
      query(client, 'update public.notifications set read_at = now() where id = $1 returning id', [ownRejectedId]),
    )
    assert.equal(ownRead.rows.length, 1)

    for (const [column, expression, params] of [
      ['user_id', '$2', [ownRejectedId, ids.support]],
      ['type', "'PACKAGE_APPROVED'", [ownRejectedId]],
      ['title', "'forged'", [ownRejectedId]],
      ['body', "'forged'", [ownRejectedId]],
      ['href', "'/forged'", [ownRejectedId]],
      ['source_order_id', '$2', [ownRejectedId, orderSupport]],
      ['source_payment_submission_id', '$2', [ownRejectedId, submissionSupport]],
      ['created_at', 'now()', [ownRejectedId]],
    ]) {
      const error = await asAuthenticated(client, ids.buyer, () =>
        expectRejected(client, `immutable ${column} update`, () =>
          query(client, `update public.notifications set ${column} = ${expression} where id = $1`, params),
        ),
      )
      assert.equal(error.code, '42501')
    }

    const forgedInsertError = await asAuthenticated(client, ids.buyer, () =>
      expectRejected(client, 'forged PAYMENT_REJECTED insert', () =>
        query(
          client,
          `insert into public.notifications (
             user_id, type, title, body, href, source_order_id, source_payment_submission_id
           ) values ($1, 'PAYMENT_REJECTED', 'forged', 'forged', '/checkout/forged', $2, $3)`,
          [ids.buyer, orderSupport, submissionSupport],
        ),
      ),
    )
    assert.equal(forgedInsertError.code, '42501')

    const deleteError = await asAuthenticated(client, ids.buyer, () =>
      expectRejected(client, 'PAYMENT_REJECTED notification delete', () =>
        query(client, 'delete from public.notifications where id = $1 returning id', [ownRejectedId]),
      ),
    )
    assert.equal(deleteError.code, '42501')

    const helperExecutionFenced = {}
    for (const role of ['anon', 'authenticated']) {
      const error = await asUntrustedRole(client, role, () =>
        expectRejected(client, `${role} rejected helper execution`, () =>
          query(client, 'select public.try_create_payment_rejected_notification($1)', [submissionSupport]),
        ),
      )
      assert.equal(error.code, '42501')
      helperExecutionFenced[role] = true
    }

    console.log(JSON.stringify({
      status: 'PASS',
      database: 'sobdai-sec-test',
      project_ref: EXPECTED_TEST_PROJECT_REF,
      migration: migration.alreadyApplied ? '093 (already applied; explicit reuse guard verified)' : '093',
      migration_shape: migrationShape,
      environment: {
        application_environment_rejected: true,
        production_target_rejected: true,
        dotenv_files_loaded: false,
      },
      inventory: target,
      migration_drift_fails_closed: migrationDrift,
      metadata,
      fixtures_touched: false,
      assertions: {
        valid_rejection_creates_one_notification: true,
        repeated_same_rejection_dedupes: true,
        later_submission_creates_own_notification: true,
        rejected_notification_does_not_grant_access: true,
        notification_failure_does_not_roll_back_rejection: true,
        notification_retry_recovers_one_notification: true,
        approval_creates_no_rejected_notification: true,
        package_approved_behavior_remains_one_notification: true,
        cross_user_select_denied: true,
        cross_user_read_mutation_denied: true,
        owner_read_mutation_allowed: true,
        immutable_fields_denied: true,
        forged_rejected_insert_denied: true,
        delete_denied: true,
        helper_execution_denied_to_untrusted_roles: helperExecutionFenced,
        generic_body_does_not_expose_rejection_reason: true,
        stable_checkout_resubmission_cta: true,
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

async function runCanonicalCheck() {
  const config = readConfiguration()
  const client = await createClient(config)
  try {
    const target = await inventory(client)
    const migrationShape = await assertCanonicalMigrationShape(client)
    const metadata = await assertMetadata(client)
    console.log(JSON.stringify({
      status: 'PASS',
      mode: 'canonical-093-read-only-check',
      database: 'sobdai-sec-test',
      project_ref: EXPECTED_TEST_PROJECT_REF,
      target,
      migration_shape: migrationShape,
      metadata,
    }, null, 2))
  } finally {
    await client.end()
  }
}

const entrypoint = process.argv.includes('--check-canonical') ? runCanonicalCheck : runProof

entrypoint().catch((error) => {
  console.error(JSON.stringify({
    status: 'FAIL',
    code: error?.code ?? null,
    message: error?.message ?? String(error),
  }, null, 2))
  process.exitCode = 1
})
