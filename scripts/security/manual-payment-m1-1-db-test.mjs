#!/usr/bin/env node

import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import pg from 'pg'

const { Client } = pg
const ROOT = process.cwd()
const TEST_GUARD = 'YES_I_AM_USING_SOBDAI_PAYMENT_TEST'
const LOCAL_ONLY_GUARD = 'YES_I_AM_USING_SOBDAI_LOCAL_DB_ONLY'
const STATEMENT_TIMEOUT = '15000ms'
const OPERATION_TIMEOUT_MS = 15000
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
  manager: 'sec-db2a-admin@example.com',
  buyer: 'sec-db2a-normal-user@example.com',
  support: 'sec-db2a-support@example.com',
}
const FIXTURE_IDS = {
  manager: '11111111-1111-4111-8111-111111111111',
  buyer: '22222222-2222-4222-8222-222222222222',
  support: '33333333-3333-4333-8333-333333333333',
}

function ensure(condition, message) {
  assert.ok(condition, message)
}

function readConfiguration() {
  assert.equal(process.env.M1_PAYMENT_DB_ALLOW_DESTRUCTIVE_TESTS, TEST_GUARD)
  assert.equal(process.env.M1_PAYMENT_DB_LOCAL_ONLY, LOCAL_ONLY_GUARD)

  for (const key of FORBIDDEN_APPLICATION_ENVIRONMENT) {
    assert.equal(process.env[key], undefined, 'application environment is forbidden: ' + key)
  }

  const rawUrl = process.env.M1_PAYMENT_DB_TEST_DATABASE_URL
  ensure(rawUrl, 'missing required environment: M1_PAYMENT_DB_TEST_DATABASE_URL')

  const databaseUrl = new URL(rawUrl)
  ensure(['postgres:', 'postgresql:'].includes(databaseUrl.protocol), 'database URL is not PostgreSQL')
  assert.equal(databaseUrl.hostname, '127.0.0.1', 'runtime target must use IPv4 loopback')
  assert.match(databaseUrl.pathname, /^\/sobdai_m1_payment_test_[a-z0-9_]+$/, 'database is not disposable')
  assert.equal(databaseUrl.username, 'postgres', 'runtime target must use postgres role')
  assert.equal(databaseUrl.password, '', 'local database URL must not contain a password')
  ensure(databaseUrl.port !== '', 'local database URL must declare a port')
  assert.equal(databaseUrl.search, '', 'database URL contains unexpected query parameters')
  assert.equal(databaseUrl.hash, '', 'database URL contains an unexpected fragment')

  return databaseUrl.toString()
}

function withTimeout(promise, label) {
  let timer
  return Promise.race([
    promise,
    new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error(label + ' timed out')), OPERATION_TIMEOUT_MS)
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

async function inTransaction(client, callback) {
  await query(client, 'begin')
  try {
    const result = await callback()
    await query(client, 'commit')
    return result
  } catch (error) {
    await query(client, 'rollback').catch(() => {})
    throw error
  }
}

async function asAuthenticated(client, userId, callback) {
  await setAuthenticated(client, userId)
  try {
    return await callback()
  } finally {
    await resetAuthenticated(client).catch(() => {})
  }
}

async function runAs(client, userId, callback) {
  return inTransaction(client, () => asAuthenticated(client, userId, callback))
}

async function expectRejected(client, label, callback) {
  const savepoint = 'm1_expected_failure_' + randomUUID().replaceAll('-', '')
  await query(client, 'savepoint ' + savepoint)
  let error = null
  try {
    await callback()
  } catch (caught) {
    error = caught
  }
  await query(client, 'rollback to savepoint ' + savepoint)
  await query(client, 'release savepoint ' + savepoint)
  ensure(error, label + ' unexpectedly succeeded')
  return error
}

function migrationSql(name) {
  return readFileSync(join(ROOT, 'supabase/migrations', name), 'utf8')
}

async function bootstrapLocalDatabase(client) {
  // This reset is safe only because readConfiguration() requires the explicit
  // loopback host and disposable database-name guard before reaching here.
  await query(client, [
    'drop extension if exists "uuid-ossp" cascade;',
    'drop schema if exists public cascade;',
    'drop schema if exists auth cascade;',
    'drop schema if exists storage cascade;',
    'create schema public;',
    'create schema auth;',
    'create schema storage;',
    'create extension "uuid-ossp";',
    'do $$ begin',
    '  if not exists (select 1 from pg_roles where rolname = \'anon\') then create role anon nologin; end if;',
    '  if not exists (select 1 from pg_roles where rolname = \'authenticated\') then create role authenticated nologin; end if;',
    '  if not exists (select 1 from pg_roles where rolname = \'service_role\') then create role service_role nologin; end if;',
    'end $$;',
    'grant usage on schema public, auth, storage to anon, authenticated, service_role;',
  ].join('\n'))

  await query(client, [
    'create or replace function auth.uid()',
    'returns uuid',
    'language sql',
    'stable',
    'as $$ select nullif(pg_catalog.current_setting(\'request.jwt.claim.sub\', true), \'\')::uuid $$;',
    'grant execute on function auth.uid() to public;',
    '',
    'create table public.profiles (',
    '  id uuid primary key,',
    '  email text not null unique,',
    '  role text not null default \'user\',',
    '  status text not null default \'active\',',
    '  deleted_at timestamptz',
    ');',
    '',
    'create table public.packages (',
    '  id uuid primary key,',
    '  slug text not null unique,',
    '  package_code text not null unique,',
    '  name text not null,',
    '  current_price numeric not null default 0,',
    '  original_price numeric not null default 0,',
    '  difficulty text not null default \'Mixed\',',
    '  features jsonb not null default \'[]\'::jsonb,',
    '  is_published boolean not null default true',
    ');',
    '',
    'create table public.orders (',
    '  id uuid primary key default uuid_generate_v4(),',
    '  user_id uuid not null references public.profiles(id),',
    '  package_id uuid not null references public.packages(id),',
    '  amount numeric not null default 0,',
    '  status text not null default \'pending\' check (status in (\'free\', \'pending\', \'paid\', \'failed\', \'refunded\', \'cancelled\')),',
    '  payment_provider text,',
    '  created_at timestamptz not null default now(),',
    '  updated_at timestamptz not null default now()',
    ');',
    '',
    'create or replace function public.handle_updated_at()',
    'returns trigger',
    'language plpgsql',
    'as $$ begin new.updated_at = now(); return new; end $$;',
    '',
    'create table storage.buckets (',
    '  id text primary key,',
    '  name text not null,',
    '  public boolean not null default false,',
    '  file_size_limit bigint,',
    '  allowed_mime_types text[]',
    ');',
    '',
    'create table storage.objects (',
    '  id uuid primary key default uuid_generate_v4(),',
    '  bucket_id text not null,',
    '  name text not null,',
    '  unique (bucket_id, name)',
    ');',
    '',
    'alter table public.orders enable row level security;',
    'create policy "Users can view own orders." on public.orders for select to authenticated using (auth.uid() = user_id);',
    'create policy "Support staff can view all orders." on public.orders for select to authenticated using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role in (\'owner\', \'admin\', \'support\') and p.status = \'active\' and p.deleted_at is null));',
    'create policy "Financial managers can insert orders." on public.orders for insert to authenticated with check (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role in (\'owner\', \'admin\') and p.status = \'active\' and p.deleted_at is null));',
    'create policy "Financial managers can update orders." on public.orders for update to authenticated using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role in (\'owner\', \'admin\') and p.status = \'active\' and p.deleted_at is null));',
    'create policy "Financial managers can delete orders." on public.orders for delete to authenticated using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role in (\'owner\', \'admin\') and p.status = \'active\' and p.deleted_at is null));',
    '',
    'grant select on public.profiles, public.packages to authenticated;',
    'grant select, insert, update, delete on public.orders to authenticated;',
  ].join('\n'))

  await query(client, migrationSql('088_manual_payment_foundation.sql'))
  await query(client, migrationSql('097_manual_payment_m1_1.sql'))

  await query(client, [
    'insert into public.profiles (id, email, role, status, deleted_at) values',
    '  (\'11111111-1111-4111-8111-111111111111\', \'sec-db2a-admin@example.com\', \'admin\', \'active\', null),',
    '  (\'22222222-2222-4222-8222-222222222222\', \'sec-db2a-normal-user@example.com\', \'user\', \'active\', null),',
    '  (\'33333333-3333-4333-8333-333333333333\', \'sec-db2a-support@example.com\', \'support\', \'active\', null);',
  ].join('\n'))
}

async function assertMigrationObjects(client) {
  const result = await query(client, [
    'select',
    '  to_regclass(\'public.payment_submissions\') is not null as payment_submissions,',
    '  to_regclass(\'public.manual_payment_order_events\') is not null as audit_table,',
    '  to_regprocedure(\'public.cancel_manual_payment_order(uuid)\') is not null as cancel_rpc,',
    '  to_regprocedure(\'public.submit_payment_slip(uuid,uuid,text,text,text,bigint)\') is not null as submit_rpc,',
    '  to_regprocedure(\'public.approve_payment_submission(uuid)\') is not null as approve_rpc,',
    '  to_regprocedure(\'public.reject_payment_submission(uuid,text)\') is not null as reject_rpc,',
    '  to_regprocedure(\'public.guard_manual_payment_paid_transition()\') is not null as paid_guard,',
    '  to_regprocedure(\'public.guard_manual_payment_cancel_transition()\') is not null as cancel_guard,',
    '  exists (select 1 from pg_trigger t join pg_class c on c.oid = t.tgrelid join pg_namespace n on n.oid = c.relnamespace where n.nspname = \'public\' and c.relname = \'orders\' and t.tgname = \'guard_manual_payment_cancel_transition\' and not t.tgisinternal) as cancel_trigger,',
    '  has_table_privilege(\'authenticated\', \'public.payment_submissions\', \'SELECT\') as evidence_select,',
    '  has_table_privilege(\'authenticated\', \'public.payment_submissions\', \'INSERT\') as evidence_insert,',
    '  has_table_privilege(\'authenticated\', \'public.payment_submissions\', \'UPDATE\') as evidence_update,',
    '  has_table_privilege(\'authenticated\', \'public.payment_submissions\', \'DELETE\') as evidence_delete,',
    '  has_table_privilege(\'authenticated\', \'public.manual_payment_order_events\', \'INSERT\') as audit_insert,',
    '  has_table_privilege(\'authenticated\', \'public.manual_payment_order_events\', \'UPDATE\') as audit_update,',
    '  has_table_privilege(\'authenticated\', \'public.manual_payment_order_events\', \'DELETE\') as audit_delete,',
    '  has_function_privilege(\'authenticated\', \'public.cancel_manual_payment_order(uuid)\', \'EXECUTE\') as cancel_execute',
  ].join('\n'))

  assert.deepEqual(result.rows[0], {
    payment_submissions: true,
    audit_table: true,
    cancel_rpc: true,
    submit_rpc: true,
    approve_rpc: true,
    reject_rpc: true,
    paid_guard: true,
    cancel_guard: true,
    cancel_trigger: true,
    evidence_select: true,
    evidence_insert: false,
    evidence_update: false,
    evidence_delete: false,
    audit_insert: false,
    audit_update: false,
    audit_delete: false,
    cancel_execute: true,
  })
}

async function lookupFixtureIds(client) {
  const result = await query(
    client,
    'select id::text, email, role, status, deleted_at from public.profiles where email = any($1::text[])',
    [Object.values(FIXTURE_EMAILS)],
  )
  const byEmail = new Map(result.rows.map((row) => [row.email, row]))
  for (const [key, email] of Object.entries(FIXTURE_EMAILS)) {
    const row = byEmail.get(email)
    ensure(row, 'missing disposable profile: ' + email)
    assert.equal(row.id, FIXTURE_IDS[key])
    assert.equal(row.status, 'active')
    assert.equal(row.deleted_at, null)
  }
  assert.equal(byEmail.get(FIXTURE_EMAILS.manager).role, 'admin')
  assert.equal(byEmail.get(FIXTURE_EMAILS.buyer).role, 'user')
  assert.equal(byEmail.get(FIXTURE_EMAILS.support).role, 'support')
  return { ...FIXTURE_IDS }
}

async function insertPackage(client, id, suffix, currentPrice) {
  await query(
    client,
    'insert into public.packages (id, slug, package_code, name, current_price, original_price, difficulty, features, is_published) values ($1, $2, $3, $4, $5, $5, \'Mixed\', \'[]\'::jsonb, true)',
    [id, 'm1-payment-' + suffix + '-' + id.slice(0, 8), 'M1-' + suffix + '-' + id.slice(0, 8), 'M1 ' + suffix, currentPrice],
  )
}

async function insertOrder(client, id, userId, packageId, amount, provider, status = 'pending') {
  await query(
    client,
    'insert into public.orders (id, user_id, package_id, amount, status, payment_provider) values ($1, $2, $3, $4, $5, $6)',
    [id, userId, packageId, amount, status, provider],
  )
}

async function createFixture(client, suffix, options = {}) {
  const packageId = randomUUID()
  const orderId = randomUUID()
  const amount = options.amount ?? 900
  const provider = options.provider ?? 'promptpay_manual'
  const status = options.status ?? 'pending'
  await insertPackage(client, packageId, suffix, amount)
  await insertOrder(client, orderId, FIXTURE_IDS.buyer, packageId, amount, provider, status)
  return { packageId, orderId, amount }
}

async function insertStorageObject(client, path) {
  await query(client, 'insert into storage.objects (bucket_id, name) values (\'payment-slips\', $1)', [path])
}

async function submitEvidence(client, ids, orderId, suffix) {
  const objectId = randomUUID()
  const idempotencyKey = randomUUID()
  const objectPath = ids.buyer + '/' + orderId + '/' + objectId + '.png'
  await insertStorageObject(client, objectPath)
  const result = await runAs(client, ids.buyer, () => query(
    client,
    'select * from public.submit_payment_slip($1, $2, $3, $4, $5, $6)',
    [orderId, idempotencyKey, objectPath, suffix + '.png', 'image/png', 128],
  ))
  assert.equal(result.rows.length, 1)
  return {
    id: result.rows[0].payment_submission_id,
    orderId,
    idempotencyKey,
    objectPath,
    status: result.rows[0].status,
  }
}

async function rejectEvidence(client, ids, submissionId, reason = 'ยอดเงินไม่ตรง') {
  const result = await runAs(client, ids.manager, () => query(
    client,
    'select * from public.reject_payment_submission($1, $2)',
    [submissionId, reason],
  ))
  assert.equal(result.rows[0].status, 'rejected')
  return result.rows[0]
}

async function approveEvidence(client, ids, submissionId) {
  const result = await runAs(client, ids.manager, () => query(
    client,
    'select * from public.approve_payment_submission($1)',
    [submissionId],
  ))
  assert.equal(result.rows[0].status, 'approved')
  return result.rows[0]
}

async function getOrderState(client, orderId) {
  const result = await query(
    client,
    'select id::text, status, payment_provider from public.orders where id = $1',
    [orderId],
  )
  return result.rows[0]
}

async function getSubmissionCount(client, orderId) {
  const result = await query(
    client,
    'select count(*)::integer as count from public.payment_submissions where order_id = $1',
    [orderId],
  )
  return Number(result.rows[0].count)
}

async function getAuditRows(client, orderId) {
  const result = await query(
    client,
    'select order_id::text, actor_id::text, event_type, from_status, to_status, payment_provider from public.manual_payment_order_events where order_id = $1 order by created_at, id',
    [orderId],
  )
  return result.rows
}

async function runConcurrentRpc(connectionString, actorId, sql, params = []) {
  const client = new Client({ connectionString, connectionTimeoutMillis: 10000 })
  await client.connect()
  let started = false
  try {
    await query(client, 'set statement_timeout = \'' + STATEMENT_TIMEOUT + '\'')
    await query(client, 'begin')
    started = true
    await setAuthenticated(client, actorId)
    const result = await query(client, sql, params)
    await query(client, 'commit')
    started = false
    return { result, error: null }
  } catch (error) {
    if (started) await query(client, 'rollback').catch(() => {})
    return { result: null, error }
  } finally {
    await resetAuthenticated(client).catch(() => {})
    await client.end()
  }
}

async function runProof() {
  const connectionString = readConfiguration()
  const client = new Client({ connectionString, connectionTimeoutMillis: 10000 })
  const assertions = {}
  const pass = (number, name) => {
    assertions[String(number)] = name
  }

  await client.connect()
  try {
    await query(client, 'set statement_timeout = \'' + STATEMENT_TIMEOUT + '\'')
    await bootstrapLocalDatabase(client)
    await assertMigrationObjects(client)
    const ids = await lookupFixtureIds(client)

    const cancelFixture = await createFixture(client, 'cancel')
    const cancelResult = await runAs(client, ids.manager, () =>
      query(client, 'select * from public.cancel_manual_payment_order($1)', [cancelFixture.orderId]),
    )
    assert.deepEqual(cancelResult.rows[0], { order_id: cancelFixture.orderId, status: 'cancelled' })
    assert.deepEqual(await getOrderState(client, cancelFixture.orderId), {
      id: cancelFixture.orderId,
      status: 'cancelled',
      payment_provider: 'promptpay_manual',
    })
    pass(1, 'financial manager cancels pending manual order with zero submissions')

    const auditRows = await getAuditRows(client, cancelFixture.orderId)
    assert.deepEqual(auditRows, [{
      order_id: cancelFixture.orderId,
      actor_id: ids.manager,
      event_type: 'cancelled',
      from_status: 'pending',
      to_status: 'cancelled',
      payment_provider: 'promptpay_manual',
    }])
    pass(12, 'durable cancellation audit records actor and transition')

    const accessRows = await runAs(client, ids.buyer, () => query(
      client,
      'select id from public.orders where user_id = $1 and package_id = $2 and status in (\'paid\', \'free\')',
      [ids.buyer, cancelFixture.packageId],
    ))
    assert.equal(accessRows.rows.length, 0)
    pass(9, 'cancelled order grants no package access')

    const repeatResult = await runAs(client, ids.manager, () =>
      query(client, 'select * from public.cancel_manual_payment_order($1)', [cancelFixture.orderId]),
    )
    assert.deepEqual(repeatResult.rows[0], { order_id: cancelFixture.orderId, status: 'cancelled' })
    assert.equal((await getAuditRows(client, cancelFixture.orderId)).length, 1)
    pass(11, 'repeated canonical cancellation is deterministic and audit-idempotent')

    const freshResult = await runAs(client, ids.buyer, () =>
      query(client, 'select * from public.create_manual_payment_order($1)', [cancelFixture.packageId]),
    )
    assert.equal(freshResult.rows[0].status, 'pending')
    assert.notEqual(freshResult.rows[0].order_id, cancelFixture.orderId)
    pass(10, 'cancelled order permits a fresh manual purchase')

    const forgedMarkerError = await runAs(client, ids.manager, async () => {
      await query(
        client,
        'select pg_catalog.set_config($1, $2, false)',
        ['sobdai.manual_payment_cancel_authorization', 'cancel:' + freshResult.rows[0].order_id + ':' + ids.manager],
      )
      const error = await expectRejected(client, 'direct cancellation with forged marker', () =>
        query(client, 'update public.orders set status = \'cancelled\' where id = $1', [freshResult.rows[0].order_id]),
      )
      await query(client, "select pg_catalog.set_config('sobdai.manual_payment_cancel_authorization', '', false)")
      return error
    })
    assert.equal(forgedMarkerError.code, '42501')
    assert.equal((await getOrderState(client, freshResult.rows[0].order_id)).status, 'pending')
    pass(4, 'direct table cancellation remains blocked at the database boundary')

    const customerCancelError = await runAs(client, ids.buyer, () =>
      expectRejected(client, 'customer cancellation RPC', () =>
        query(client, 'select * from public.cancel_manual_payment_order($1)', [freshResult.rows[0].order_id]),
      ),
    )
    assert.equal(customerCancelError.code, '42501')
    pass(2, 'normal customer cancellation RPC is denied')

    const supportCancelError = await runAs(client, ids.support, () =>
      expectRejected(client, 'support cancellation RPC', () =>
        query(client, 'select * from public.cancel_manual_payment_order($1)', [freshResult.rows[0].order_id]),
      ),
    )
    assert.equal(supportCancelError.code, '42501')
    pass(3, 'support cancellation RPC is denied')

    const submittedFixture = await createFixture(client, 'submitted')
    const submitted = await submitEvidence(client, ids, submittedFixture.orderId, 'submitted')
    const submittedCancelError = await runAs(client, ids.manager, () =>
      expectRejected(client, 'cancellation with submitted evidence', () =>
        query(client, 'select * from public.cancel_manual_payment_order($1)', [submittedFixture.orderId]),
      ),
    )
    assert.equal(submittedCancelError.code, '40001')
    assert.equal(await getSubmissionCount(client, submittedFixture.orderId), 1)
    pass(5, 'pending order with submitted evidence cannot be cancelled')

    const rejectedFixture = await createFixture(client, 'rejected')
    const rejected = await submitEvidence(client, ids, rejectedFixture.orderId, 'rejected')
    await rejectEvidence(client, ids, rejected.id)
    const rejectedAuditBefore = (await getAuditRows(client, rejectedFixture.orderId)).length
    const rejectedCancelError = await runAs(client, ids.manager, () =>
      expectRejected(client, 'cancellation with rejected historical evidence', () =>
        query(client, 'select * from public.cancel_manual_payment_order($1)', [rejectedFixture.orderId]),
      ),
    )
    assert.equal(rejectedCancelError.code, '40001')
    assert.deepEqual(await getOrderState(client, rejectedFixture.orderId), {
      id: rejectedFixture.orderId,
      status: 'pending',
      payment_provider: 'promptpay_manual',
    })
    assert.equal((await getAuditRows(client, rejectedFixture.orderId)).length, rejectedAuditBefore)
    pass(6, 'pending order with rejected historical evidence cannot be cancelled')
    pass(13, 'failed cancellation writes no durable audit row')

    const paidFixture = await createFixture(client, 'paid')
    const paidSubmission = await submitEvidence(client, ids, paidFixture.orderId, 'paid')
    await approveEvidence(client, ids, paidSubmission.id)
    const paidCancelError = await runAs(client, ids.manager, () =>
      expectRejected(client, 'paid manual cancellation', () =>
        query(client, 'select * from public.cancel_manual_payment_order($1)', [paidFixture.orderId]),
      ),
    )
    assert.equal(paidCancelError.code, '40001')
    assert.equal((await getOrderState(client, paidFixture.orderId)).status, 'paid')
    pass(7, 'paid manual order cannot be cancelled')
    pass(20, 'canonical approval still works and grants through the order authority')

    const freeFixture = await createFixture(client, 'free', {
      amount: 0,
      provider: 'manual_grant',
      status: 'free',
    })
    const omiseFixture = await createFixture(client, 'omise', { provider: 'omise' })
    for (const orderId of [freeFixture.orderId, omiseFixture.orderId]) {
      const error = await runAs(client, ids.manager, () =>
        expectRejected(client, 'non-manual cancellation', () =>
          query(client, 'select * from public.cancel_manual_payment_order($1)', [orderId]),
        ),
      )
      assert.equal(error.code, '40001')
    }
    assert.equal((await getOrderState(client, freeFixture.orderId)).status, 'free')
    assert.equal((await getOrderState(client, omiseFixture.orderId)).status, 'pending')
    pass(8, 'free and non-manual orders remain unchanged')

    const paidGuardFixture = await createFixture(client, 'paid-guard')
    const paidGuardError = await runAs(client, ids.manager, () =>
      expectRejected(client, 'direct manual pending-to-paid update', () =>
        query(client, 'update public.orders set status = \'paid\' where id = $1', [paidGuardFixture.orderId]),
      ),
    )
    assert.equal(paidGuardError.code, '42501')
    assert.equal((await getOrderState(client, paidGuardFixture.orderId)).status, 'pending')
    pass(19, 'manual paid-transition guard blocks direct pending-to-paid mutation')

    const rejectionFixture = await createFixture(client, 'rejection')
    const rejectionSubmission = await submitEvidence(client, ids, rejectionFixture.orderId, 'rejection')
    await rejectEvidence(client, ids, rejectionSubmission.id, 'หลักฐานไม่ชัดเจน')
    const rejectionState = await query(
      client,
      'select ps.status as submission_status, o.status as order_status from public.payment_submissions ps join public.orders o on o.id = ps.order_id where ps.id = $1',
      [rejectionSubmission.id],
    )
    assert.deepEqual(rejectionState.rows[0], { submission_status: 'rejected', order_status: 'pending' })
    pass(21, 'canonical rejection preserves pending state without access')

    const freeAccess = await runAs(client, ids.buyer, () => query(
      client,
      'select id from public.orders where user_id = $1 and package_id = $2 and status in (\'paid\', \'free\')',
      [ids.buyer, freeFixture.packageId],
    ))
    assert.equal(freeAccess.rows.length, 1)
    pass(22, 'free flow remains accessible through the existing order status authority')

    const capFixture = await createFixture(client, 'cap')
    const capSubmissions = []
    for (let index = 1; index <= 5; index += 1) {
      const submission = await submitEvidence(client, ids, capFixture.orderId, 'cap-' + index)
      capSubmissions.push(submission)
      if (index < 5) await rejectEvidence(client, ids, submission.id, 'retry-' + index)
    }
    assert.equal(await getSubmissionCount(client, capFixture.orderId), 5)
    assert.deepEqual(
      (await query(client, 'select status from public.payment_submissions where order_id = $1 order by created_at', [capFixture.orderId])).rows.map((row) => row.status),
      ['rejected', 'rejected', 'rejected', 'rejected', 'submitted'],
    )
    const sixthObjectPath = ids.buyer + '/' + capFixture.orderId + '/' + randomUUID() + '.png'
    const sixthIdempotencyKey = randomUUID()
    await insertStorageObject(client, sixthObjectPath)
    const sixthError = await runAs(client, ids.buyer, () =>
      expectRejected(client, 'sixth payment submission', () =>
        query(
          client,
          'select * from public.submit_payment_slip($1, $2, $3, $4, $5, $6)',
          [capFixture.orderId, sixthIdempotencyKey, sixthObjectPath, 'sixth.png', 'image/png', 128],
        ),
      ),
    )
    assert.equal(sixthError.code, 'P0001')
    const directEvidenceError = await runAs(client, ids.buyer, () =>
      expectRejected(client, 'direct evidence insert', () =>
        query(
          client,
          'insert into public.payment_submissions (order_id, idempotency_key, storage_object_path, original_filename, mime_type, file_size_bytes, payment_method, status) values ($1, $2, $3, $4, $5, $6, $7, $8)',
          [capFixture.orderId, randomUUID(), ids.buyer + '/' + capFixture.orderId + '/' + randomUUID() + '.png', 'direct.png', 'image/png', 128, 'promptpay_manual', 'submitted'],
        ),
      ),
    )
    assert.equal(directEvidenceError.code, '42501')
    assert.equal(await getSubmissionCount(client, capFixture.orderId), 5)
    assert.equal((await query(client, 'select id from public.payment_submissions where idempotency_key = $1', [sixthIdempotencyKey])).rows.length, 0)
    pass(14, 'submission attempts one through five are allowed and rejected history counts')
    pass(15, 'submission attempt six is rejected by the database cap')
    pass(16, 'submission attempt six creates no canonical evidence and direct insert is denied')

    const concurrentCapFixture = await createFixture(client, 'concurrent-cap')
    for (let index = 1; index <= 4; index += 1) {
      const submission = await submitEvidence(client, ids, concurrentCapFixture.orderId, 'concurrent-cap-' + index)
      await rejectEvidence(client, ids, submission.id)
    }
    const concurrentCapPaths = [randomUUID(), randomUUID()].map((objectId) =>
      ids.buyer + '/' + concurrentCapFixture.orderId + '/' + objectId + '.png')
    const concurrentCapKeys = [randomUUID(), randomUUID()]
    for (const objectPath of concurrentCapPaths) await insertStorageObject(client, objectPath)
    const concurrentCapResults = await Promise.all(concurrentCapKeys.map((key, index) =>
      runConcurrentRpc(
        connectionString,
        ids.buyer,
        'select * from public.submit_payment_slip($1, $2, $3, $4, $5, $6)',
        [concurrentCapFixture.orderId, key, concurrentCapPaths[index], 'concurrent.png', 'image/png', 128],
      )))
    const concurrentCapSuccesses = concurrentCapResults.filter((entry) => entry.result).length
    assert.equal(concurrentCapSuccesses, 1)
    assert.equal(await getSubmissionCount(client, concurrentCapFixture.orderId), 5)
    pass(17, 'concurrent capped submissions never exceed five committed rows')

    const raceFixture = await createFixture(client, 'cancel-submit-race')
    const raceObjectPath = ids.buyer + '/' + raceFixture.orderId + '/' + randomUUID() + '.png'
    const raceIdempotencyKey = randomUUID()
    await insertStorageObject(client, raceObjectPath)
    const [raceCancel, raceSubmit] = await Promise.all([
      runConcurrentRpc(
        connectionString,
        ids.manager,
        'select * from public.cancel_manual_payment_order($1)',
        [raceFixture.orderId],
      ),
      runConcurrentRpc(
        connectionString,
        ids.buyer,
        'select * from public.submit_payment_slip($1, $2, $3, $4, $5, $6)',
        [raceFixture.orderId, raceIdempotencyKey, raceObjectPath, 'race.png', 'image/png', 128],
      ),
    ])
    const raceWinners = [raceCancel, raceSubmit].filter((entry) => entry.result).length
    assert.equal(raceWinners, 1)
    const raceState = await getOrderState(client, raceFixture.orderId)
    const raceCount = await getSubmissionCount(client, raceFixture.orderId)
    assert.equal(raceState.status === 'cancelled' ? raceCount === 0 : raceState.status === 'pending' && raceCount === 1, true)
    assert.equal(!(raceState.status === 'cancelled' && raceCount > 0), true)
    pass(18, 'cancel-versus-first-submit race has exactly one safe winner')

    assert.equal(Object.keys(assertions).length, 22)
    console.log(JSON.stringify({
      status: 'PASS',
      database: 'Postgres.app 18 / 127.0.0.1 disposable database',
      migrations: ['088_manual_payment_foundation.sql', '097_manual_payment_m1_1.sql'],
      pass_count: Object.keys(assertions).length,
      assertions,
      concurrent_cap_successes: concurrentCapSuccesses,
      cancel_submit_race_winners: raceWinners,
      cancelled_race_evidence_rows: raceState.status === 'cancelled' ? raceCount : null,
    }, null, 2))
  } finally {
    await client.end()
  }
}

runProof().catch((error) => {
  console.error(JSON.stringify({
    status: 'FAIL',
    code: error?.code ?? null,
    message: error?.message ?? String(error),
    detail: error?.detail ?? null,
    hint: error?.hint ?? null,
    where: error?.where ?? null,
  }, null, 2))
  process.exitCode = 1
})
