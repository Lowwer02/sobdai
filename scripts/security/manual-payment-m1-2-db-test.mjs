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
const OPERATION_TIMEOUT_MS = 20000
const IDS = {
  manager: '11111111-1111-4111-8111-111111111111',
  buyer: '22222222-2222-4222-8222-222222222222',
  otherBuyer: '33333333-3333-4333-8333-333333333333',
  support: '44444444-4444-4444-8444-444444444444',
}
const RECIPIENT_A = '081234567890123'
const RECIPIENT_B = '089876543210987'

function ensure(condition, message) {
  assert.ok(condition, message)
}

function readConfiguration() {
  assert.equal(process.env.M1_PAYMENT_DB_ALLOW_DESTRUCTIVE_TESTS, TEST_GUARD)
  assert.equal(process.env.M1_PAYMENT_DB_LOCAL_ONLY, LOCAL_ONLY_GUARD)
  const forbidden = [
    'NEXT_PUBLIC_SUPABASE_URL',
    'NEXT_PUBLIC_SUPABASE_ANON_KEY',
    'SUPABASE_URL',
    'SUPABASE_ANON_KEY',
    'SUPABASE_SERVICE_ROLE_KEY',
    'DATABASE_URL',
    'POSTGRES_URL',
    'POSTGRES_PASSWORD',
  ]
  for (const key of forbidden) {
    assert.equal(process.env[key], undefined, `application environment is forbidden: ${key}`)
  }

  const rawUrl = process.env.M1_PAYMENT_DB_TEST_DATABASE_URL
  ensure(rawUrl, 'missing required environment: M1_PAYMENT_DB_TEST_DATABASE_URL')
  const url = new URL(rawUrl)
  ensure(['postgres:', 'postgresql:'].includes(url.protocol), 'test target is not PostgreSQL')
  assert.equal(url.hostname, '127.0.0.1')
  assert.equal(url.username, 'postgres')
  assert.equal(url.password, '')
  assert.match(url.pathname, /^\/sobdai_m1_payment_test_[a-z0-9_]+$/)
  ensure(url.port !== '', 'local test target must declare a port')
  assert.equal(url.search, '')
  assert.equal(url.hash, '')
  return url.toString()
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

async function query(client, sql, params = []) {
  return withTimeout(client.query(sql, params), 'database operation')
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

async function runAs(client, userId, callback) {
  await query(client, 'begin')
  try {
    await setAuthenticated(client, userId)
    const result = await callback()
    await resetAuthenticated(client)
    await query(client, 'commit')
    return result
  } catch (error) {
    await query(client, 'rollback').catch(() => {})
    throw error
  }
}

async function expectRejected(client, label, callback) {
  const savepoint = `m1_2_expected_failure_${randomUUID().replaceAll('-', '')}`
  await query(client, `savepoint ${savepoint}`)
  let error = null
  try {
    await callback()
  } catch (caught) {
    error = caught
  }
  await query(client, `rollback to savepoint ${savepoint}`)
  await query(client, `release savepoint ${savepoint}`)
  ensure(error, `${label} unexpectedly succeeded`)
  return error
}

function migrationSql(name) {
  return readFileSync(join(ROOT, 'supabase/migrations', name), 'utf8')
}

async function bootstrap(client) {
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
    "  if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon nologin; end if;",
    "  if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated nologin; end if;",
    "  if not exists (select 1 from pg_roles where rolname = 'service_role') then create role service_role nologin bypassrls; else alter role service_role bypassrls; end if;",
    'end $$;',
    'grant usage on schema public, auth, storage to anon, authenticated, service_role;',
  ].join('\n'))

  await query(client, [
    'create or replace function auth.uid()',
    'returns uuid',
    'language sql',
    'stable',
    "as $$ select nullif(pg_catalog.current_setting('request.jwt.claim.sub', true), '')::uuid $$;",
    'grant execute on function auth.uid() to public;',
    '',
    'create table public.profiles (',
    '  id uuid primary key,',
    '  email text not null unique,',
    "  role text not null default 'user',",
    "  status text not null default 'active',",
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
    "  difficulty text not null default 'Mixed',",
    "  features jsonb not null default '[]'::jsonb,",
    '  is_published boolean not null default true',
    ');',
    '',
    'create table public.orders (',
    '  id uuid primary key default uuid_generate_v4(),',
    '  user_id uuid not null references public.profiles(id),',
    '  package_id uuid not null references public.packages(id),',
    '  amount numeric not null default 0,',
    "  status text not null default 'pending' check (status in ('free', 'pending', 'paid', 'failed', 'refunded', 'cancelled')),",
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
    `  ('${IDS.manager}', 'm1-2-manager@example.test', 'admin', 'active', null),`,
    `  ('${IDS.buyer}', 'm1-2-buyer@example.test', 'user', 'active', null),`,
    `  ('${IDS.otherBuyer}', 'm1-2-other@example.test', 'user', 'active', null),`,
    `  ('${IDS.support}', 'm1-2-support@example.test', 'support', 'active', null);`,
  ].join('\n'))
}

async function insertPackage(client, suffix, price) {
  const id = randomUUID()
  await query(client, `
    insert into public.packages (
      id, slug, package_code, name, current_price, original_price,
      difficulty, features, is_published
    ) values ($1, $2, $3, $4, $5, $5, 'Mixed', '[]'::jsonb, true)
  `, [id, `m1-2-${suffix}-${id.slice(0, 8)}`, `M1-2-${suffix}-${id.slice(0, 8)}`, `M1.2 ${suffix}`, price])
  return id
}

async function updateSettings(
  client,
  actorId,
  enabled,
  recipientIdentifier,
  displayName = 'M1.2 test recipient',
  instructionText = 'Disposable database test',
) {
  return runAs(client, actorId, () => query(client, `
    select * from public.update_payment_settings($1, $2, $3, $4)
  `, [enabled, recipientIdentifier, displayName, instructionText]))
}

async function createManualOrder(client, actorId, packageId) {
  const result = await runAs(client, actorId, () => query(
    client,
    'select * from public.create_manual_payment_order($1)',
    [packageId],
  ))
  ensure(result.rows.length === 1, 'manual order RPC did not return one row')
  return result.rows[0]
}

async function insertPaymentSubmission(client, orderId, status, rejectionReason = 'Test evidence rejected') {
  const idempotencyKey = randomUUID()
  const storageObjectPath = `${IDS.buyer}/${orderId}/${randomUUID()}.png`
  const isRejected = status === 'rejected'
  const isReviewed = isRejected || status === 'approved'
  const result = await query(client, `
    insert into public.payment_submissions (
      order_id,
      idempotency_key,
      storage_object_path,
      original_filename,
      mime_type,
      file_size_bytes,
      payment_method,
      status,
      reviewed_at,
      reviewed_by,
      rejection_reason
    ) values ($1, $2, $3, $4, 'image/png', 128, 'promptpay_manual', $5, $6, $7, $8)
    returning id, status
  `, [
    orderId,
    idempotencyKey,
    storageObjectPath,
    `${status}-evidence.png`,
    status,
    isReviewed ? new Date().toISOString() : null,
    isReviewed ? IDS.manager : null,
    isRejected ? rejectionReason : null,
  ])
  return { ...result.rows[0], storageObjectPath, idempotencyKey }
}

async function insertStorageObject(client, storageObjectPath) {
  await query(client, `
    insert into storage.objects (bucket_id, name)
    values ('payment-slips', $1)
  `, [storageObjectPath])
}

async function removeTestArtifacts(client, orderId, packageId) {
  await query(client, 'delete from public.payment_submissions where order_id = $1', [orderId])
  const eventCount = await query(client, 'select count(*)::int as count from public.manual_payment_order_events where order_id = $1', [orderId])
  if (eventCount.rows[0].count !== 0) return
  await query(client, 'delete from public.orders where id = $1', [orderId])
  await query(client, 'delete from public.packages where id = $1', [packageId])
}

async function openAuthenticatedTransaction(connectionString, actorId) {
  const session = new Client({ connectionString, connectionTimeoutMillis: 10000 })
  await session.connect()
  await query(session, `set statement_timeout = '${STATEMENT_TIMEOUT}'`)
  await query(session, 'begin')
  await setAuthenticated(session, actorId)
  return session
}

async function finishAuthenticatedTransaction(session, commit = true) {
  if (commit) {
    await resetAuthenticated(session)
    await query(session, 'commit')
  } else {
    await query(session, 'rollback').catch(() => {})
  }
  await session.end()
}

async function getSettings(client) {
  const result = await query(client, 'select enabled, recipient_identifier from public.payment_settings where id = 1')
  return result.rows[0]
}

async function cleanupOrder(client, orderId, packageId) {
  await query(client, 'delete from public.payment_submissions where order_id = $1', [orderId])
  const eventCount = await query(client, 'select count(*)::int as count from public.manual_payment_order_events where order_id = $1', [orderId])
  if (eventCount.rows[0].count !== 0) return
  await query(client, 'delete from public.orders where id = $1', [orderId])
  await query(client, 'delete from public.packages where id = $1', [packageId])
}

async function runSettingsUpdateInSecondSession(connectionString, actorId, enabled, recipientIdentifier) {
  const client = new Client({ connectionString, connectionTimeoutMillis: 10000 })
  let inTransaction = false
  try {
    await client.connect()
    await query(client, `set statement_timeout = '${STATEMENT_TIMEOUT}'`)
    await query(client, 'begin')
    inTransaction = true
    await setAuthenticated(client, actorId)
    const result = await query(client, `
      select * from public.update_payment_settings($1, $2, $3, $4)
    `, [enabled, recipientIdentifier, 'M1.2 concurrent test', 'Disposable database test'])
    await resetAuthenticated(client)
    await query(client, 'commit')
    inTransaction = false
    return { result, error: null }
  } catch (error) {
    if (inTransaction) await query(client, 'rollback').catch(() => {})
    return { result: null, error }
  } finally {
    await client.end().catch(() => {})
  }
}

async function applyMigrationInTransaction(client, migrationName) {
  await query(client, 'begin')
  try {
    await query(client, migrationSql(migrationName))
    await query(client, 'commit')
    return null
  } catch (error) {
    await query(client, 'rollback').catch(() => {})
    return error
  }
}

async function expectMigrationRejected(client, migrationName, label) {
  const error = await applyMigrationInTransaction(client, migrationName)
  ensure(error, `${label} unexpectedly succeeded`)
  return error
}

async function assertLifecycleLockHeld(connectionString, label) {
  const probe = new Client({ connectionString, connectionTimeoutMillis: 10000 })
  try {
    await probe.connect()
    await query(probe, 'begin')
    const result = await query(probe, 'select pg_try_advisory_xact_lock(7281, 1201) as acquired')
    assert.equal(result.rows[0].acquired, false, `${label} did not hold the lifecycle advisory lock`)
    await query(probe, 'rollback')
  } finally {
    await probe.end().catch(() => {})
  }
}

async function startMigrationInSecondSession(connectionString, migrationName) {
  const client = new Client({ connectionString, connectionTimeoutMillis: 10000 })
  await client.connect()
  await query(client, `set statement_timeout = '${STATEMENT_TIMEOUT}'`)
  await query(client, 'begin')

  const result = query(client, migrationSql(migrationName))
    .then(async () => {
      await query(client, 'commit')
      return null
    })
    .catch(async (error) => {
      await query(client, 'rollback').catch(() => {})
      return error
    })
    .finally(async () => {
      await client.end().catch(() => {})
    })

  return result
}

async function waitBriefly() {
  await new Promise((resolve) => setTimeout(resolve, 250))
}

async function runProof() {
  const connectionString = readConfiguration()
  const client = new Client({ connectionString, connectionTimeoutMillis: 10000 })
  await client.connect()
  try {
    await query(client, `set statement_timeout = '${STATEMENT_TIMEOUT}'`)
    await bootstrap(client)

    // -----------------------------------------------------------------------
    // 098 EXPAND compatibility and pre-cutover guards.
    // -----------------------------------------------------------------------
    await query(client, migrationSql('098_payment_settings_m1_2_expand.sql'))
    const expandTrigger = await query(client, `
      select exists (
        select 1 from pg_trigger t
        join pg_class c on c.oid = t.tgrelid
        join pg_namespace n on n.oid = c.relnamespace
        where n.nspname = 'public'
          and c.relname = 'orders'
          and t.tgname = 'guard_payment_settings_for_manual_order'
          and not t.tgisinternal
      ) as installed
    `)
    assert.equal(expandTrigger.rows[0].installed, false)
    const expandSettings = await getSettings(client)
    assert.deepEqual(expandSettings, { enabled: false, recipient_identifier: '' })
    const expandPackage = await insertPackage(client, 'expand-m1-1', 763)
    const expandOrder = await createManualOrder(client, IDS.buyer, expandPackage)
    assert.equal(String(expandOrder.amount), '763')
    assert.equal(expandOrder.status, 'pending')
    await cleanupOrder(client, expandOrder.order_id, expandPackage)

    // The canonical M1.1 RPC holds the same transaction advisory lock that
    // 100 will use, while retaining the old disabled/unconfigured behavior.
    const expandLockPackage = await insertPackage(client, 'expand-lock', 764)
    const expandCreateSession = new Client({ connectionString, connectionTimeoutMillis: 10000 })
    await expandCreateSession.connect()
    await query(expandCreateSession, `set statement_timeout = '${STATEMENT_TIMEOUT}'`)
    await query(expandCreateSession, 'begin')
    await setAuthenticated(expandCreateSession, IDS.buyer)
    const expandCreateInFlight = query(
      expandCreateSession,
      'select * from public.create_manual_payment_order($1)',
      [expandLockPackage],
    )
    await waitBriefly()
    await assertLifecycleLockHeld(connectionString, '098 canonical order creation')
    const expandLockOrder = await expandCreateInFlight
    assert.equal(expandLockOrder.rows[0].status, 'pending')
    await resetAuthenticated(expandCreateSession)
    await query(expandCreateSession, 'commit')
    await expandCreateSession.end()
    await cleanupOrder(client, expandLockOrder.rows[0].order_id, expandLockPackage)

    // Destination changes are already blocked during the compatibility phase;
    // display-only changes remain available.
    const guardedRecipientPackage = await insertPackage(client, 'expand-recipient-guard', 765)
    const guardedRecipientOrder = await createManualOrder(client, IDS.buyer, guardedRecipientPackage)
    const expandRecipientError = await runAs(client, IDS.manager, () => expectRejected(
      client,
      '098 recipient change with pending order',
      () => query(client, 'select * from public.update_payment_settings($1, $2, $3, $4)', [false, RECIPIENT_A, 'Blocked recipient', 'Disposable database test']),
    ))
    assert.equal(expandRecipientError.code, '55006')
    assert.match(expandRecipientError.message, /ยังมีคำสั่งซื้อ PromptPay ที่รอชำระอยู่/)
    await cleanupOrder(client, guardedRecipientOrder.order_id, guardedRecipientPackage)

    const invalidRecipientError = await runAs(client, IDS.manager, () => expectRejected(
      client,
      'invalid E-Wallet configuration',
      () => query(client, 'select * from public.update_payment_settings($1, $2, $3, $4)', [false, '123', 'Invalid test recipient', 'Disposable database test']),
    ))
    assert.equal(invalidRecipientError.code, '22023')

    const managerSettings = await updateSettings(client, IDS.manager, false, RECIPIENT_A)
    assert.equal(managerSettings.rows[0].recipient_identifier, RECIPIENT_A)

    const cancelCompatibilityError = await applyMigrationInTransaction(
      client,
      '099_manual_payment_cancel_rejected_orders.sql',
    )
    assert.equal(cancelCompatibilityError, null, cancelCompatibilityError?.message)

    // -----------------------------------------------------------------------
    // 099 rejected-evidence cancellation boundary.
    // -----------------------------------------------------------------------
    const cancellationCases = {
      migration098Compatibility: 1,
      migration099Compatibility: 1,
    }

    const zeroSubmissionPackage = await insertPackage(client, 'cancel-zero', 780)
    const zeroSubmissionOrder = await createManualOrder(client, IDS.buyer, zeroSubmissionPackage)
    const zeroSubmissionResult = await runAs(client, IDS.manager, () => query(
      client,
      'select * from public.cancel_manual_payment_order($1)',
      [zeroSubmissionOrder.order_id],
    ))
    assert.deepEqual(zeroSubmissionResult.rows[0], {
      order_id: zeroSubmissionOrder.order_id,
      status: 'cancelled',
    })
    cancellationCases.zeroSubmissionCancel = 1
    await removeTestArtifacts(client, zeroSubmissionOrder.order_id, zeroSubmissionPackage)

    const rejectedEvidencePackage = await insertPackage(client, 'cancel-rejected', 781)
    const rejectedEvidenceOrder = await createManualOrder(client, IDS.buyer, rejectedEvidencePackage)
    await insertPaymentSubmission(client, rejectedEvidenceOrder.order_id, 'rejected', 'ยอดเงินไม่ตรงกับคำสั่งซื้อ')
    await insertPaymentSubmission(client, rejectedEvidenceOrder.order_id, 'rejected', 'ภาพหลักฐานไม่ชัดเจน')
    const rejectedEvidenceResult = await runAs(client, IDS.manager, () => query(
      client,
      'select * from public.cancel_manual_payment_order($1)',
      [rejectedEvidenceOrder.order_id],
    ))
    assert.equal(rejectedEvidenceResult.rows[0].status, 'cancelled')
    const rejectedEvidenceRows = await query(client, `
      select status, rejection_reason
      from public.payment_submissions
      where order_id = $1
      order by created_at
    `, [rejectedEvidenceOrder.order_id])
    assert.equal(rejectedEvidenceRows.rows.length, 2)
    assert.ok(rejectedEvidenceRows.rows.every((row) => row.status === 'rejected'))
    assert.ok(rejectedEvidenceRows.rows.every((row) => row.rejection_reason))
    cancellationCases.allRejectedSubmissionCancel = 1
    cancellationCases.rejectedEvidencePreserved = 1
    const rejectedEventRows = await query(client, `
      select event_type, from_status, to_status, payment_provider
      from public.manual_payment_order_events
      where order_id = $1
    `, [rejectedEvidenceOrder.order_id])
    assert.deepEqual(rejectedEventRows.rows, [{
      event_type: 'cancelled',
      from_status: 'pending',
      to_status: 'cancelled',
      payment_provider: 'promptpay_manual',
    }])
    cancellationCases.cancellationAuditEvent = 1
    const rejectedRetryResult = await runAs(client, IDS.manager, () => query(
      client,
      'select * from public.cancel_manual_payment_order($1)',
      [rejectedEvidenceOrder.order_id],
    ))
    assert.equal(rejectedRetryResult.rows[0].status, 'cancelled')
    const rejectedRetryEvents = await query(client, 'select count(*)::int as count from public.manual_payment_order_events where order_id = $1', [rejectedEvidenceOrder.order_id])
    assert.equal(rejectedRetryEvents.rows[0].count, 1)
    cancellationCases.cancellationRetry = 1
    await removeTestArtifacts(client, rejectedEvidenceOrder.order_id, rejectedEvidencePackage)

    const submittedPackage = await insertPackage(client, 'cancel-submitted', 782)
    const submittedOrder = await createManualOrder(client, IDS.buyer, submittedPackage)
    await insertPaymentSubmission(client, submittedOrder.order_id, 'submitted')
    const submittedCancelError = await runAs(client, IDS.manager, () => expectRejected(
      client,
      'submitted evidence prevents cancellation',
      () => query(client, 'select * from public.cancel_manual_payment_order($1)', [submittedOrder.order_id]),
    ))
    assert.equal(submittedCancelError.code, '40001')
    cancellationCases.pendingReviewPreventsCancel = 1
    await removeTestArtifacts(client, submittedOrder.order_id, submittedPackage)

    const approvedPackage = await insertPackage(client, 'cancel-approved', 783)
    const approvedOrder = await createManualOrder(client, IDS.buyer, approvedPackage)
    await insertPaymentSubmission(client, approvedOrder.order_id, 'approved')
    const approvedCancelError = await runAs(client, IDS.manager, () => expectRejected(
      client,
      'approved evidence prevents cancellation',
      () => query(client, 'select * from public.cancel_manual_payment_order($1)', [approvedOrder.order_id]),
    ))
    assert.equal(approvedCancelError.code, '40001')
    cancellationCases.approvedEvidencePreventsCancel = 1
    await removeTestArtifacts(client, approvedOrder.order_id, approvedPackage)

    const rejectedPaidPackage = await insertPackage(client, 'cancel-paid', 784)
    const rejectedPaidOrder = await createManualOrder(client, IDS.buyer, rejectedPaidPackage)
    await insertPaymentSubmission(client, rejectedPaidOrder.order_id, 'approved')
    await query(client, "update public.orders set status = 'paid' where id = $1", [rejectedPaidOrder.order_id])
    const paidCancelError = await runAs(client, IDS.manager, () => expectRejected(
      client,
      'paid order prevents cancellation',
      () => query(client, 'select * from public.cancel_manual_payment_order($1)', [rejectedPaidOrder.order_id]),
    ))
    assert.equal(paidCancelError.code, '40001')
    cancellationCases.paidOrderPreventsCancel = 1
    await removeTestArtifacts(client, rejectedPaidOrder.order_id, rejectedPaidPackage)

    const freePackage = await insertPackage(client, 'cancel-free', 785)
    const freeOrder = await createManualOrder(client, IDS.buyer, freePackage)
    await query(client, "update public.orders set status = 'free' where id = $1", [freeOrder.order_id])
    const freeCancelError = await runAs(client, IDS.manager, () => expectRejected(
      client,
      'free order prevents cancellation',
      () => query(client, 'select * from public.cancel_manual_payment_order($1)', [freeOrder.order_id]),
    ))
    assert.equal(freeCancelError.code, '40001')
    cancellationCases.freeOrderPreventsCancel = 1
    await removeTestArtifacts(client, freeOrder.order_id, freePackage)

    const nonPromptPayPackage = await insertPackage(client, 'cancel-non-promptpay', 786)
    const nonPromptPayOrder = await createManualOrder(client, IDS.buyer, nonPromptPayPackage)
    await query(client, "update public.orders set payment_provider = 'omise' where id = $1", [nonPromptPayOrder.order_id])
    const nonPromptPayCancelError = await runAs(client, IDS.manager, () => expectRejected(
      client,
      'non-PromptPay order prevents cancellation',
      () => query(client, 'select * from public.cancel_manual_payment_order($1)', [nonPromptPayOrder.order_id]),
    ))
    assert.equal(nonPromptPayCancelError.code, '40001')
    cancellationCases.nonPromptPayPreventsCancel = 1
    await removeTestArtifacts(client, nonPromptPayOrder.order_id, nonPromptPayPackage)

    const unauthorizedPackage = await insertPackage(client, 'cancel-unauthorized', 787)
    const unauthorizedOrder = await createManualOrder(client, IDS.buyer, unauthorizedPackage)
    const unauthorizedCancelError = await runAs(client, IDS.buyer, () => expectRejected(
      client,
      'unauthorized cancellation',
      () => query(client, 'select * from public.cancel_manual_payment_order($1)', [unauthorizedOrder.order_id]),
    ))
    assert.equal(unauthorizedCancelError.code, '42501')
    cancellationCases.authorizationPreserved = 1
    await removeTestArtifacts(client, unauthorizedOrder.order_id, unauthorizedPackage)

    const directUpdatePackage = await insertPackage(client, 'cancel-direct-update', 788)
    const directUpdateOrder = await createManualOrder(client, IDS.buyer, directUpdatePackage)
    await query(client, 'begin')
    const directCancelError = await expectRejected(
      client,
      'direct cancellation update',
      () => query(client, "update public.orders set status = 'cancelled' where id = $1", [directUpdateOrder.order_id]),
    )
    await query(client, 'commit')
    assert.equal(directCancelError.code, '42501')
    cancellationCases.directUpdateForbidden = 1
    await removeTestArtifacts(client, directUpdateOrder.order_id, directUpdatePackage)

    // Real two-session race: cancellation acquires the order lock first, so
    // submission waits and then fails against the committed cancelled order.
    const cancelWinsPackage = await insertPackage(client, 'race-cancel-wins', 789)
    const cancelWinsOrder = await createManualOrder(client, IDS.buyer, cancelWinsPackage)
    const cancelWinsPath = `${IDS.buyer}/${cancelWinsOrder.order_id}/${randomUUID()}.png`
    await insertStorageObject(client, cancelWinsPath)
    const cancelWinsSession = await openAuthenticatedTransaction(connectionString, IDS.manager)
    const cancelWinsResult = await query(
      cancelWinsSession,
      'select * from public.cancel_manual_payment_order($1)',
      [cancelWinsOrder.order_id],
    )
    assert.equal(cancelWinsResult.rows[0].status, 'cancelled')
    const submitAfterCancelSession = await openAuthenticatedTransaction(connectionString, IDS.buyer)
    let submitAfterCancelSettled = false
    const submitAfterCancelInFlight = query(
      submitAfterCancelSession,
      'select * from public.submit_payment_slip($1, $2, $3, $4, $5, $6)',
      [cancelWinsOrder.order_id, randomUUID(), cancelWinsPath, 'race.png', 'image/png', 128],
    ).then(
      (result) => {
        submitAfterCancelSettled = true
        return { result, error: null }
      },
      (error) => {
        submitAfterCancelSettled = true
        return { result: null, error }
      },
    )
    await waitBriefly()
    assert.equal(submitAfterCancelSettled, false, 'submission completed while cancellation held the order lock')
    await finishAuthenticatedTransaction(cancelWinsSession, true)
    const submitAfterCancelOutcome = await submitAfterCancelInFlight
    const submitAfterCancelError = submitAfterCancelOutcome.error
    assert.ok(submitAfterCancelError)
    assert.equal(submitAfterCancelError.code, '22023')
    await finishAuthenticatedTransaction(submitAfterCancelSession, false)
    const cancelWinsState = await query(client, 'select o.status, count(ps.id)::int as submissions from public.orders o left join public.payment_submissions ps on ps.order_id = o.id where o.id = $1 group by o.status', [cancelWinsOrder.order_id])
    assert.deepEqual(cancelWinsState.rows[0], { status: 'cancelled', submissions: 0 })

    // Reverse race: submission commits first while holding the same order row
    // lock, so cancellation waits and then rejects the active evidence.
    const submitWinsPackage = await insertPackage(client, 'race-submit-wins', 790)
    const submitWinsOrder = await createManualOrder(client, IDS.buyer, submitWinsPackage)
    const submitWinsPath = `${IDS.buyer}/${submitWinsOrder.order_id}/${randomUUID()}.png`
    await insertStorageObject(client, submitWinsPath)
    const submitWinsSession = await openAuthenticatedTransaction(connectionString, IDS.buyer)
    const submitWinsResult = await query(
      submitWinsSession,
      'select * from public.submit_payment_slip($1, $2, $3, $4, $5, $6)',
      [submitWinsOrder.order_id, randomUUID(), submitWinsPath, 'race.png', 'image/png', 128],
    )
    assert.equal(submitWinsResult.rows[0].status, 'submitted')
    const cancelAfterSubmitSession = await openAuthenticatedTransaction(connectionString, IDS.manager)
    let cancelAfterSubmitSettled = false
    const cancelAfterSubmitInFlight = query(
      cancelAfterSubmitSession,
      'select * from public.cancel_manual_payment_order($1)',
      [submitWinsOrder.order_id],
    ).then(
      (result) => {
        cancelAfterSubmitSettled = true
        return { result, error: null }
      },
      (error) => {
        cancelAfterSubmitSettled = true
        return { result: null, error }
      },
    )
    await waitBriefly()
    assert.equal(cancelAfterSubmitSettled, false, 'cancellation completed while submission held the order lock')
    await finishAuthenticatedTransaction(submitWinsSession, true)
    const cancelAfterSubmitOutcome = await cancelAfterSubmitInFlight
    const cancelAfterSubmitError = cancelAfterSubmitOutcome.error
    assert.ok(cancelAfterSubmitError)
    assert.equal(cancelAfterSubmitError.code, '40001')
    await finishAuthenticatedTransaction(cancelAfterSubmitSession, false)
    const submitWinsState = await query(client, 'select o.status, count(ps.id)::int as submissions from public.orders o left join public.payment_submissions ps on ps.order_id = o.id where o.id = $1 group by o.status', [submitWinsOrder.order_id])
    assert.deepEqual(submitWinsState.rows[0], { status: 'pending', submissions: 1 })
    cancellationCases.cancelVsSubmitTwoSession = 1
    await removeTestArtifacts(client, cancelWinsOrder.order_id, cancelWinsPackage)
    await removeTestArtifacts(client, submitWinsOrder.order_id, submitWinsPackage)

    // 100 preflight must reject every unsafe state before installing any
    // enforcement, then accept only valid recipient + disabled + zero pending.
    await updateSettings(client, IDS.manager, false, '')
    const missingRecipientError = await expectMigrationRejected(
      client,
      '100_payment_settings_m1_2_enforce.sql',
      '100 missing recipient preflight',
    )
    assert.equal(missingRecipientError.code, '23514')
    assert.match(missingRecipientError.message, /valid configured PromptPay recipient while payment remains disabled/i)

    await query(client, 'alter table public.payment_settings drop constraint payment_settings_recipient_identifier_check')
    await query(client, "update public.payment_settings set enabled = false, recipient_identifier = '' where id = 1")
    await query(client, "update public.payment_settings set recipient_identifier = '123' where id = 1")
    const invalidCutoverError = await expectMigrationRejected(
      client,
      '100_payment_settings_m1_2_enforce.sql',
      '100 invalid recipient preflight',
    )
    assert.equal(invalidCutoverError.code, '23514')
    assert.match(invalidCutoverError.message, /valid configured PromptPay recipient/i)
    await query(client, 'update public.payment_settings set recipient_identifier = $1 where id = 1', [RECIPIENT_A])
    await query(client, `
      alter table public.payment_settings
      add constraint payment_settings_recipient_identifier_check check (
        recipient_identifier = '' or recipient_identifier ~ '^[0-9]{15}$'
      )
    `)

    await updateSettings(client, IDS.manager, true, RECIPIENT_A)
    const enabledCutoverError = await expectMigrationRejected(
      client,
      '100_payment_settings_m1_2_enforce.sql',
      '100 enabled=true preflight',
    )
    assert.equal(enabledCutoverError.code, '23514')
    assert.match(enabledCutoverError.message, /while payment remains disabled/i)
    await updateSettings(client, IDS.manager, false, RECIPIENT_A)

    const pendingCutoverPackage = await insertPackage(client, 'cutover-pending', 766)
    const pendingCutoverOrder = await createManualOrder(client, IDS.buyer, pendingCutoverPackage)
    cancellationCases.m1_1OrderAfter099 = 1
    const pendingCutoverError = await expectMigrationRejected(
      client,
      '100_payment_settings_m1_2_enforce.sql',
      '100 pending-order preflight',
    )
    assert.equal(pendingCutoverError.code, '23514')
    assert.match(pendingCutoverError.message, /zero pending promptpay_manual orders/i)
    await cleanupOrder(client, pendingCutoverOrder.order_id, pendingCutoverPackage)

    // Two physical sessions: old M1.1 creation wins the shared lock first.
    // 100 must wait, then reject the cutover after observing the committed
    // pending order. It must never succeed over that order.
    const cutoverRacePackage = await insertPackage(client, 'race-cutover', 767)
    const cutoverRaceCreateSession = new Client({ connectionString, connectionTimeoutMillis: 10000 })
    await cutoverRaceCreateSession.connect()
    await query(cutoverRaceCreateSession, `set statement_timeout = '${STATEMENT_TIMEOUT}'`)
    await query(cutoverRaceCreateSession, 'begin')
    await setAuthenticated(cutoverRaceCreateSession, IDS.buyer)
    const cutoverRaceOrderInFlight = query(
      cutoverRaceCreateSession,
      'select * from public.create_manual_payment_order($1)',
      [cutoverRacePackage],
    )
    const cutoverRaceOrder = await cutoverRaceOrderInFlight
    assert.equal(cutoverRaceOrder.rows[0].status, 'pending')
    let cutoverRaceSettled = false
    const cutoverRaceInFlight = startMigrationInSecondSession(
      connectionString,
      '100_payment_settings_m1_2_enforce.sql',
    )
    cutoverRaceInFlight.then(() => { cutoverRaceSettled = true }, () => { cutoverRaceSettled = true })
    await waitBriefly()
    assert.equal(cutoverRaceSettled, false, '100 completed before the old M1.1 transaction released the lifecycle lock')
    await resetAuthenticated(cutoverRaceCreateSession)
    await query(cutoverRaceCreateSession, 'commit')
    await cutoverRaceCreateSession.end()
    const cutoverRaceError = await cutoverRaceInFlight
    assert.ok(cutoverRaceError)
    assert.equal(cutoverRaceError.code, '23514')
    assert.match(cutoverRaceError.message, /zero pending promptpay_manual orders/i)
    await cleanupOrder(client, cutoverRaceOrder.rows[0].order_id, cutoverRacePackage)

    const cutoverError = await applyMigrationInTransaction(
      client,
      '100_payment_settings_m1_2_enforce.sql',
    )
    assert.equal(cutoverError, null, cutoverError?.message)
    cancellationCases.migration100Enforcement = 1

    const catalog = await query(client, `
      select
        to_regclass('public.payment_settings') is not null as settings_table,
        to_regprocedure('public.update_payment_settings(boolean,text,text,text)') is not null as settings_rpc,
        to_regprocedure('public.create_manual_payment_order(uuid)') is not null as create_rpc,
        to_regprocedure('public.cancel_manual_payment_order(uuid)') is not null as cancel_rpc,
        to_regprocedure('public.guard_payment_settings_lifecycle()') is not null as lifecycle_function,
        to_regprocedure('public.guard_payment_settings_for_manual_order()') is not null as order_function,
        has_table_privilege('authenticated', 'public.payment_settings', 'SELECT') as authenticated_select,
        has_table_privilege('authenticated', 'public.payment_settings', 'UPDATE') as authenticated_update,
        has_table_privilege('service_role', 'public.payment_settings', 'SELECT') as service_select,
        has_function_privilege('authenticated', 'public.update_payment_settings(boolean,text,text,text)', 'EXECUTE') as manager_rpc_execute,
        has_function_privilege('anon', 'public.update_payment_settings(boolean,text,text,text)', 'EXECUTE') as anon_rpc_execute,
        exists (select 1 from pg_trigger where tgname = 'guard_payment_settings_lifecycle') as lifecycle_trigger,
        exists (select 1 from pg_trigger where tgname = 'guard_payment_settings_for_manual_order') as order_trigger
    `)
    assert.deepEqual(catalog.rows[0], {
      settings_table: true,
      settings_rpc: true,
      create_rpc: true,
      cancel_rpc: true,
      lifecycle_function: true,
      order_function: true,
      authenticated_select: true,
      authenticated_update: false,
      service_select: true,
      manager_rpc_execute: true,
      anon_rpc_execute: false,
      lifecycle_trigger: true,
      order_trigger: true,
    })

    assert.equal((await getSettings(client)).enabled, false)

    // The old M1.1 RPC is now blocked at the final database boundary while
    // the controlled promotion window keeps payment disabled.
    const disabledPackage = await insertPackage(client, 'post-cutover-disabled', 768)
    const disabledError = await runAs(client, IDS.buyer, () => expectRejected(
      client,
      'disabled manual order after 100',
      () => query(client, 'select * from public.create_manual_payment_order($1)', [disabledPackage]),
    ))
    assert.equal(disabledError.code, '55000')
    assert.match(disabledError.message, /PromptPay payment settings are unavailable/i)
    const directOrderId = randomUUID()
    await query(client, 'begin')
    const directInsertError = await expectRejected(client, 'direct disabled manual insert', () => query(
      client,
      `insert into public.orders (id, user_id, package_id, amount, status, payment_provider)
       values ($1, $2, $3, $4, 'pending', 'promptpay_manual')`,
      [directOrderId, IDS.buyer, disabledPackage, 768],
    ))
    await query(client, 'commit')
    assert.equal(directInsertError.code, '55000')
    await query(client, 'delete from public.packages where id = $1', [disabledPackage])

    const managerRead = await runAs(client, IDS.manager, () => query(client, 'select * from public.payment_settings'))
    assert.equal(managerRead.rows.length, 1)
    assert.equal(managerRead.rows[0].recipient_identifier, RECIPIENT_A)
    const buyerRead = await runAs(client, IDS.buyer, () => query(client, 'select * from public.payment_settings'))
    assert.equal(buyerRead.rows.length, 0)
    const supportRead = await runAs(client, IDS.support, () => query(client, 'select * from public.payment_settings'))
    assert.equal(supportRead.rows.length, 0)
    const supportRpcError = await runAs(client, IDS.support, () => expectRejected(
      client,
      'support settings RPC',
      () => query(client, 'select * from public.update_payment_settings($1, $2, $3, $4)', [true, RECIPIENT_A, 'x', 'y']),
    ))
    assert.equal(supportRpcError.code, '42501')

    // Promotion is complete; opening payment is a separate serialized action.
    const enableResult = await updateSettings(client, IDS.manager, true, RECIPIENT_A)
    assert.equal(enableResult.rows[0].enabled, true)
    const enabledPackage = await insertPackage(client, 'post-promotion-enabled', 769)
    const enabledOrder = await createManualOrder(client, IDS.buyer, enabledPackage)
    assert.equal(enabledOrder.status, 'pending')
    await cleanupOrder(client, enabledOrder.order_id, enabledPackage)

    // Persisted orders.amount remains the amount authority after the package changes.
    const amountPackage = await insertPackage(client, 'amount', 770)
    const amountOrder = await createManualOrder(client, IDS.buyer, amountPackage)
    assert.equal(String(amountOrder.amount), '770')
    await query(client, 'update public.packages set current_price = 9999 where id = $1', [amountPackage])
    const persistedAmount = await query(client, 'select amount::text from public.orders where id = $1', [amountOrder.order_id])
    assert.equal(persistedAmount.rows[0].amount, '770')
    const displayUpdate = await updateSettings(
      client,
      IDS.manager,
      true,
      RECIPIENT_A,
      'Updated M1.2 recipient',
      'Updated disposable instruction',
    )
    assert.equal(displayUpdate.rows[0].display_name, 'Updated M1.2 recipient')
    assert.equal(displayUpdate.rows[0].instruction_text, 'Updated disposable instruction')
    await updateSettings(client, IDS.manager, false, RECIPIENT_A)
    const amountOrderWhileDisabled = await query(client, 'select status, payment_provider from public.orders where id = $1', [amountOrder.order_id])
    assert.deepEqual(amountOrderWhileDisabled.rows[0], { status: 'pending', payment_provider: 'promptpay_manual' })
    await cleanupOrder(client, amountOrder.order_id, amountPackage)
    await updateSettings(client, IDS.manager, true, RECIPIENT_A)

    // Two physical sessions: enable wins first and holds the lock; the old
    // create waits, then observes the committed enabled state and succeeds.
    await updateSettings(client, IDS.manager, false, RECIPIENT_A)
    const enableRacePackage = await insertPackage(client, 'race-enable', 771)
    const enableRaceSettingsSession = new Client({ connectionString, connectionTimeoutMillis: 10000 })
    await enableRaceSettingsSession.connect()
    await query(enableRaceSettingsSession, `set statement_timeout = '${STATEMENT_TIMEOUT}'`)
    await query(enableRaceSettingsSession, 'begin')
    await setAuthenticated(enableRaceSettingsSession, IDS.manager)
    const enableRaceSettings = await query(
      enableRaceSettingsSession,
      'select * from public.update_payment_settings($1, $2, $3, $4)',
      [true, RECIPIENT_A, 'M1.2 enable race', 'Disposable database test'],
    )
    assert.equal(enableRaceSettings.rows[0].enabled, true)

    const enableRaceCreateSession = new Client({ connectionString, connectionTimeoutMillis: 10000 })
    await enableRaceCreateSession.connect()
    await query(enableRaceCreateSession, `set statement_timeout = '${STATEMENT_TIMEOUT}'`)
    await query(enableRaceCreateSession, 'begin')
    await setAuthenticated(enableRaceCreateSession, IDS.buyer)
    const enableRaceCreateInFlight = query(
      enableRaceCreateSession,
      'select * from public.create_manual_payment_order($1)',
      [enableRacePackage],
    )
    let enableRaceCreateSettled = false
    enableRaceCreateInFlight.then(() => { enableRaceCreateSettled = true }, () => { enableRaceCreateSettled = true })
    await waitBriefly()
    assert.equal(enableRaceCreateSettled, false, 'create completed before enable released the lifecycle lock')
    await resetAuthenticated(enableRaceSettingsSession)
    await query(enableRaceSettingsSession, 'commit')
    await enableRaceSettingsSession.end()
    const enableRaceOrder = await enableRaceCreateInFlight
    assert.equal(enableRaceOrder.rows[0].status, 'pending')
    await resetAuthenticated(enableRaceCreateSession)
    await query(enableRaceCreateSession, 'commit')
    await enableRaceCreateSession.end()
    assert.equal((await getSettings(client)).enabled, true)
    await cleanupOrder(client, enableRaceOrder.rows[0].order_id, enableRacePackage)
    await query(client, 'delete from public.packages where id = $1', [enableRacePackage])

    // Two physical sessions: create holds the lifecycle lock; disable must wait.
    const disablePackage = await insertPackage(client, 'race-disable', 772)
    const createSession = new Client({ connectionString, connectionTimeoutMillis: 10000 })
    await createSession.connect()
    await query(createSession, `set statement_timeout = '${STATEMENT_TIMEOUT}'`)
    await query(createSession, 'begin')
    await setAuthenticated(createSession, IDS.buyer)
    const createInFlight = query(createSession, 'select * from public.create_manual_payment_order($1)', [disablePackage])
    const disableInFlight = runSettingsUpdateInSecondSession(connectionString, IDS.manager, false, RECIPIENT_A)
    await waitBriefly()
    let disableSettled = false
    disableInFlight.then(() => { disableSettled = true }, () => { disableSettled = true })
    await waitBriefly()
    assert.equal(disableSettled, false, 'disable completed before the create transaction released the lifecycle lock')
    const disableOrder = await createInFlight
    assert.equal(disableOrder.rows[0].status, 'pending')
    await resetAuthenticated(createSession)
    await query(createSession, 'commit')
    await createSession.end()
    const disableResult = await disableInFlight
    assert.equal(disableResult.error, null)
    assert.equal((await getSettings(client)).enabled, false)
    const disableOrderId = disableOrder.rows[0].order_id
    const disableOrderState = await query(client, 'select status, payment_provider from public.orders where id = $1', [disableOrderId])
    assert.deepEqual(disableOrderState.rows[0], { status: 'pending', payment_provider: 'promptpay_manual' })
    await cleanupOrder(client, disableOrderId, disablePackage)
    await updateSettings(client, IDS.manager, true, RECIPIENT_A)

    // Two physical sessions: create wins first; recipient replacement waits and
    // then observes the committed pending order and is rejected.
    const recipientPackage = await insertPackage(client, 'race-recipient', 773)
    const recipientCreateSession = new Client({ connectionString, connectionTimeoutMillis: 10000 })
    await recipientCreateSession.connect()
    await query(recipientCreateSession, `set statement_timeout = '${STATEMENT_TIMEOUT}'`)
    await query(recipientCreateSession, 'begin')
    await setAuthenticated(recipientCreateSession, IDS.buyer)
    const recipientCreateInFlight = query(recipientCreateSession, 'select * from public.create_manual_payment_order($1)', [recipientPackage])
    const recipientUpdateInFlight = runSettingsUpdateInSecondSession(connectionString, IDS.manager, true, RECIPIENT_B)
    await waitBriefly()
    let recipientUpdateSettled = false
    recipientUpdateInFlight.then(() => { recipientUpdateSettled = true }, () => { recipientUpdateSettled = true })
    await waitBriefly()
    assert.equal(recipientUpdateSettled, false, 'recipient update completed before the create transaction released the lifecycle lock')
    const recipientOrder = await recipientCreateInFlight
    assert.equal(recipientOrder.rows[0].status, 'pending')
    await resetAuthenticated(recipientCreateSession)
    await query(recipientCreateSession, 'commit')
    await recipientCreateSession.end()
    const recipientResult = await recipientUpdateInFlight
    assert.ok(recipientResult.error)
    assert.equal(recipientResult.error.code, '55006')
    assert.match(recipientResult.error.message, /ยังมีคำสั่งซื้อ PromptPay ที่รอชำระอยู่/)
    assert.equal((await getSettings(client)).recipient_identifier, RECIPIENT_A)
    const recipientOrderId = recipientOrder.rows[0].order_id
    await cleanupOrder(client, recipientOrderId, recipientPackage)

    // M1.1 cancellation and paid-transition guard remain present after M1.2.
    const cancelPackage = await insertPackage(client, 'm1-1-regression', 774)
    const cancelOrder = await createManualOrder(client, IDS.buyer, cancelPackage)
    const cancelResult = await runAs(client, IDS.manager, () => query(
      client,
      'select * from public.cancel_manual_payment_order($1)',
      [cancelOrder.order_id],
    ))
    assert.equal(cancelResult.rows[0].status, 'cancelled')
    const access = await query(client, 'select count(*)::int as count from public.orders where id = $1 and status in (\'paid\', \'free\')', [cancelOrder.order_id])
    assert.equal(access.rows[0].count, 0)
    await cleanupOrder(client, cancelOrder.order_id, cancelPackage)

    const paidPackage = await insertPackage(client, 'paid-guard', 775)
    const paidOrder = await createManualOrder(client, IDS.buyer, paidPackage)
    await query(client, 'begin')
    const paidError = await expectRejected(client, 'direct paid transition', () => query(
      client,
      "update public.orders set status = 'paid' where id = $1",
      [paidOrder.order_id],
    ))
    await query(client, 'commit')
    assert.equal(paidError.code, '42501')
    await cleanupOrder(client, paidOrder.order_id, paidPackage)

    // Cross-user order visibility remains fenced by the existing RLS policy.
    const visibilityPackage = await insertPackage(client, 'visibility', 776)
    const visibilityOrder = await createManualOrder(client, IDS.buyer, visibilityPackage)
    const otherView = await runAs(client, IDS.otherBuyer, () => query(client, 'select id from public.orders where id = $1', [visibilityOrder.order_id]))
    assert.equal(otherView.rows.length, 0)
    await cleanupOrder(client, visibilityOrder.order_id, visibilityPackage)

    console.log(JSON.stringify({
      status: 'PASS',
      database: new URL(connectionString).pathname.slice(1),
      migration: ['088_manual_payment_foundation.sql', '097_manual_payment_m1_1.sql', '098_payment_settings_m1_2_expand.sql', '099_manual_payment_cancel_rejected_orders.sql', '100_payment_settings_m1_2_enforce.sql'],
      tests: {
        expandM1_1Compatibility: 1,
        expandCanonicalAdvisoryLock: 1,
        expandRecipientPendingGuard: 1,
        enforceMissingRecipientPreflight: 1,
        enforceInvalidRecipientPreflight: 1,
        enforceEnabledTruePreflight: 1,
        enforcePendingPreflight: 1,
        enforceZeroPendingDisabledCutover: 1,
        oldOrderVsCutoverTwoSession: 1,
        postCutoverDisabledFailClosed: 1,
        rbacAndPrivacy: 1,
        persistedAmountAuthority: 1,
        displayOnlyEdits: 1,
        directInsertFailClosed: 1,
        enableAfterPromotion: 1,
        createVsEnableTwoSession: 1,
        createVsDisableTwoSession: 1,
        createVsRecipientTwoSession: 1,
        m1_1Cancellation: 1,
        m1_1PaidGuard: 1,
        crossUserOrderRls: 1,
      },
      followUpTests: {
        ...cancellationCases,
        existingM1_2ConcurrencyIntegritySuite: 21,
      },
    }, null, 2))
  } finally {
    await client.end().catch(() => {})
  }
}

runProof().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
