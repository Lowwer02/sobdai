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

    // EXPAND is safe with the released M1.1 shape and does not fence orders yet.
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

    const invalidRecipientError = await runAs(client, IDS.manager, () => expectRejected(
      client,
      'invalid E-Wallet configuration',
      () => query(client, 'select * from public.update_payment_settings($1, $2, $3, $4)', [false, '123', 'Invalid test recipient', 'Disposable database test']),
    ))
    assert.equal(invalidRecipientError.code, '22023')

    const managerSettings = await updateSettings(client, IDS.manager, true, RECIPIENT_A)
    assert.equal(managerSettings.rows[0].recipient_identifier, RECIPIENT_A)

    // ENFORCE is deliberately gated on the configured-and-verified state.
    await query(client, migrationSql('099_payment_settings_m1_2_enforce.sql'))
    const recipientWithoutPending = await updateSettings(client, IDS.manager, true, RECIPIENT_B)
    assert.equal(recipientWithoutPending.rows[0].recipient_identifier, RECIPIENT_B)
    await updateSettings(client, IDS.manager, true, RECIPIENT_A)

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

    // Persisted orders.amount remains the amount authority after the package changes.
    const amountPackage = await insertPackage(client, 'amount', 764)
    const amountOrder = await createManualOrder(client, IDS.buyer, amountPackage)
    assert.equal(String(amountOrder.amount), '764')
    await query(client, 'update public.packages set current_price = 9999 where id = $1', [amountPackage])
    const persistedAmount = await query(client, 'select amount::text from public.orders where id = $1', [amountOrder.order_id])
    assert.equal(persistedAmount.rows[0].amount, '764')
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

    // A disabled setting fails closed for a new order, while an existing order remains.
    await updateSettings(client, IDS.manager, false, RECIPIENT_A)
    const disabledPackage = await insertPackage(client, 'disabled', 765)
    const directOrderId = randomUUID()
    await query(client, 'begin')
    const directInsertError = await expectRejected(client, 'direct disabled manual insert', () => query(
      client,
      `insert into public.orders (id, user_id, package_id, amount, status, payment_provider)
       values ($1, $2, $3, $4, 'pending', 'promptpay_manual')`,
      [directOrderId, IDS.buyer, disabledPackage, 765],
    ))
    await query(client, 'commit')
    assert.equal(directInsertError.code, '55000')
    const disabledError = await runAs(client, IDS.buyer, () => expectRejected(
      client,
      'disabled manual order',
      () => query(client, 'select * from public.create_manual_payment_order($1)', [disabledPackage]),
    ))
    assert.equal(disabledError.code, '55000')
    assert.match(disabledError.message, /PromptPay payment settings are unavailable/i)
    await updateSettings(client, IDS.manager, true, RECIPIENT_A)

    // Two physical sessions: create holds the lifecycle lock; disable must wait.
    const disablePackage = await insertPackage(client, 'race-disable', 766)
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
    const recipientPackage = await insertPackage(client, 'race-recipient', 767)
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
    const cancelPackage = await insertPackage(client, 'm1-1-regression', 768)
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

    const paidPackage = await insertPackage(client, 'paid-guard', 769)
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
    const visibilityPackage = await insertPackage(client, 'visibility', 770)
    const visibilityOrder = await createManualOrder(client, IDS.buyer, visibilityPackage)
    const otherView = await runAs(client, IDS.otherBuyer, () => query(client, 'select id from public.orders where id = $1', [visibilityOrder.order_id]))
    assert.equal(otherView.rows.length, 0)
    await cleanupOrder(client, visibilityOrder.order_id, visibilityPackage)

    console.log(JSON.stringify({
      status: 'PASS',
      database: new URL(connectionString).pathname.slice(1),
      migration: ['088_manual_payment_foundation.sql', '097_manual_payment_m1_1.sql', '098_payment_settings_m1_2_expand.sql', '099_payment_settings_m1_2_enforce.sql'],
      tests: {
        expandBeforeEnforce: 1,
        rbacAndPrivacy: 1,
        persistedAmountAuthority: 1,
        displayOnlyEdits: 1,
        disabledFailClosed: 1,
        directInsertFailClosed: 1,
        createVsDisableTwoSession: 1,
        createVsRecipientTwoSession: 1,
        m1_1Cancellation: 1,
        m1_1PaidGuard: 1,
        crossUserOrderRls: 1,
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
