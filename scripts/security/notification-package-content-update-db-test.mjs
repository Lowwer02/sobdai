#!/usr/bin/env node
// Sobdai Notification V1.2 — isolated runtime regression for the
// PACKAGE_CONTENT_UPDATE fanout.
//
// Builds a disposable fixture on an EMPTY postgres database (minimal stubs for
// the 092/093 dependencies), applies the REAL migrations 092 → 093 → 104 from
// this repository, then proves the fanout semantics end to end:
//
//   1. distinct entitled users each receive exactly one notification
//   2. a user with multiple completed orders receives exactly one
//   3. repeating the same event inserts 0 additional rows
//   4. two concurrent fanouts do not duplicate rows
//   5. wrong-package / banned / soft-deleted users receive nothing
//   6. unpublished or foreign exam sets fail closed
//   7. type-specific source integrity checks reject bad rows
//   8. PACKAGE_APPROVED / PAYMENT_REJECTED producers still work and dedupe
//   9. RLS, grants, and mark-read permissions are unchanged
//
// Safety: refuses application environments, refuses non-empty public schemas,
// and requires an explicit disposable-database guard. It never touches any
// Supabase production fixture (unlike the *-supabase-db-test scripts, this one
// is meant for a scratch/local postgres you own).
//
// RUN:
//   PKG_CONTENT_DB_TEST_DATABASE_URL=postgres://user:pass@host:5432/empty_db \
//   PKG_CONTENT_DB_TEST_GUARD='YES_I_AM_USING_A_DISPOSABLE_DATABASE' \
//   node scripts/security/notification-package-content-update-db-test.mjs

import pg from 'pg'
import { readFileSync } from 'node:fs'
import { join, dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const { Client } = pg

const URL_ENV = 'PKG_CONTENT_DB_TEST_DATABASE_URL'
const GUARD_ENV = 'PKG_CONTENT_DB_TEST_GUARD'
const GUARD_VALUE = 'YES_I_AM_USING_A_DISPOSABLE_DATABASE'
const STATEMENT_TIMEOUT_MS = 15000

const FORBIDDEN_APPLICATION_ENVIRONMENT = [
  'NEXT_PUBLIC_SUPABASE_URL',
  'NEXT_PUBLIC_SUPABASE_ANON_KEY',
  'SUPABASE_URL',
  'SUPABASE_ANON_KEY',
  'SUPABASE_SERVICE_ROLE_KEY',
  'DATABASE_URL',
  'POSTGRES_URL',
  'POSTGRES_PASSWORD',
  'OMISE_SECRET_KEY',
  'OMISE_WEBHOOK_KEY',
]

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const readRepoFile = (path) => readFileSync(join(repoRoot, path), 'utf8')
const migrationFiles = [
  'supabase/migrations/092_notifications_v1.sql',
  'supabase/migrations/093_payment_rejected_notification.sql',
  'supabase/migrations/104_package_content_update_notification.sql',
]

let passed = 0
const failures = []
function check(name, condition, detail = '') {
  if (condition) {
    passed += 1
    console.log(`  ok - ${name}`)
  } else {
    failures.push(`${name}${detail ? ` :: ${detail}` : ''}`)
    console.error(`  FAIL - ${name}${detail ? ` :: ${detail}` : ''}`)
  }
}

async function expectError(client, name, sql, messagePattern) {
  try {
    await client.query(sql)
    check(name, false, 'expected an error but the statement succeeded')
  } catch (error) {
    check(name, messagePattern.test(error.message), `got: ${error.message}`)
    // A failed batch that opened its own transaction (for example
    // `begin; migration; commit;`) leaves the session inside an aborted
    // transaction because PostgreSQL skips the remaining statements,
    // including the trailing commit. Probe for that state and roll back
    // only this call's own transaction; a failed plain statement runs in
    // autocommit and leaves nothing to clean up.
    try {
      await client.query('select 1')
    } catch (abortError) {
      if (abortError.code === '25P02') {
        await client.query('rollback')
      } else {
        throw abortError
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Disposable fixture schema: only what the canonical 092/093 preflights and
// producers require. The migrations themselves stay byte-identical to disk.
// ---------------------------------------------------------------------------
const FIXTURE_SCHEMA_SQL = `
create schema if not exists extensions;
create extension if not exists "uuid-ossp" with schema extensions;

create schema if not exists auth;
create or replace function auth.uid() returns uuid
language sql stable as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
$$;

do $roles$
begin
  if to_regrole('authenticated') is null then create role authenticated nologin; end if;
  if to_regrole('anon') is null then create role anon nologin; end if;
  if to_regrole('service_role') is null then create role service_role nologin; end if;
end
$roles$;

create table public.profiles (
  id uuid primary key,
  email text unique not null,
  role text not null default 'user',
  status text not null default 'active',
  deleted_at timestamptz
);

create table public.packages (
  id uuid primary key default extensions.uuid_generate_v4(),
  slug text unique not null,
  package_code text not null,
  name text not null,
  org_name text not null,
  is_published boolean not null default true
);

create table public.orders (
  id uuid primary key default extensions.uuid_generate_v4(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  package_id uuid not null references public.packages(id) on delete cascade,
  status text not null,
  payment_provider text,
  created_at timestamptz not null default now()
);

create table public.exam_sets (
  id uuid primary key default extensions.uuid_generate_v4(),
  package_id uuid not null references public.packages(id) on delete cascade,
  name text not null,
  is_sample boolean not null default false,
  status text not null default 'draft',
  created_at timestamptz not null default now()
);

create table public.payment_submissions (
  id uuid primary key default extensions.uuid_generate_v4(),
  order_id uuid not null references public.orders(id) on delete cascade,
  status text not null,
  reviewed_at timestamptz,
  reviewed_by uuid,
  rejection_reason text
);

-- 092/093 preflights only require the approval/rejection RPCs to exist; the
-- migrations themselves replace these stubs with the canonical bodies.
create function public.approve_payment_submission(p_submission_id uuid)
returns table (payment_submission_id uuid, order_id uuid, status text)
language plpgsql as $$ begin return query select null::uuid, null::uuid, 'stub'::text; end $$;

create function public.reject_payment_submission(p_submission_id uuid, p_rejection_reason text)
returns table (payment_submission_id uuid, order_id uuid, status text)
language plpgsql as $$ begin return query select null::uuid, null::uuid, 'stub'::text; end $$;
`

// The fanout mirrors docs/notification-package-content-update-v1.2-production-sql.md
// Gate B. %EXAM_SET_ID% and %CONFIRMED_ELIGIBLE% are substituted per scenario;
// the exam-set name pin comes from the fixture's confirmed hard set.
const HARD_EXAM_SET_NAME = 'ชุดยาก (new)'

function fanoutSql(examSetId, confirmedEligible) {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(examSetId)) {
    throw new Error('exam set id must be a uuid')
  }
  if (!Number.isInteger(confirmedEligible) || confirmedEligible < 0) {
    throw new Error('confirmed eligible must be a non-negative integer')
  }
  const examSetName = HARD_EXAM_SET_NAME.replaceAll("'", "''")
  return `
do $package_content_update_fanout$
declare
  v_package_id  uuid;
  v_slug        text;
  v_exam_set_id uuid := '${examSetId}';
  v_confirmed_eligible int := ${confirmedEligible};
  v_send_date   date := coalesce(
                     to_date(nullif(current_setting('app.notification_v1_2_send_date', true), ''), 'YYYY-MM-DD'),
                     date '2026-10-09'
                   );
  v_today       date := (now() at time zone 'Asia/Bangkok')::date;
  v_event_key   text;
  v_eligible    int;
  v_already     int;
  v_pending     int;
  v_inserted    int;
begin
  if v_today <> v_send_date then
    raise exception 'Gate B send-time guard: the approved copy says "สอบพรุ่งนี้", which is only true on %. Asia/Bangkok today is %. If delivery is delayed, update the body copy AND the guard date together, then rerun.', v_send_date, v_today;
  end if;

  select id, slug into v_package_id, v_slug
    from public.packages
   where package_code = 'OPSMOAC-PPA-2026-V10' and is_published = true;
  if v_package_id is null or v_slug is null then
    raise exception 'Gate B: target package not found or unpublished.';
  end if;

  if not exists (
    select 1 from public.exam_sets
     where id = v_exam_set_id
       and package_id = v_package_id
       and status = 'published'
       and name = '${examSetName}'
  ) then
    raise exception 'Gate B: % is not the confirmed published hard exam set of the target package.', v_exam_set_id;
  end if;

  v_event_key := 'package_content_update:' || v_package_id::text || ':' || v_exam_set_id::text;

  with entitled as (
    select distinct o.user_id from public.orders o
     where o.package_id = v_package_id and o.status in ('paid','free')
  ), candidates as (
    select e.user_id from entitled e
     join public.profiles pr on pr.id = e.user_id
     where pr.deleted_at is null and pr.status = 'active'
  ), already as (
    select c.user_id from candidates c
     join public.notifications n
       on n.user_id = c.user_id
      and n.type = 'PACKAGE_CONTENT_UPDATE'
      and n.source_event_key = v_event_key
  )
  select (select count(*) from candidates)::int,
         (select count(*) from already)::int
    into v_eligible, v_already;

  if v_eligible <> v_confirmed_eligible then
    raise exception 'Gate B: eligible audience drift — Gate A confirmed %, now %. Re-run Gate A.', v_confirmed_eligible, v_eligible;
  end if;

  v_pending := v_eligible - v_already;

  with candidates as (
    select distinct o.user_id
    from public.orders o
    join public.profiles pr on pr.id = o.user_id
    where o.package_id = v_package_id
      and o.status in ('paid','free')
      and pr.deleted_at is null
      and pr.status = 'active'
  ), pending as (
    select c.user_id from candidates c
     where not exists (
       select 1 from public.notifications n
        where n.user_id = c.user_id
          and n.type = 'PACKAGE_CONTENT_UPDATE'
          and n.source_event_key = v_event_key
     )
  ), ins as (
    insert into public.notifications
      (user_id, type, title, body, href, source_order_id, source_event_key)
    select p.user_id,
           'PACKAGE_CONTENT_UPDATE',
           'เพิ่มข้อสอบชุดใหม่แล้ว 🔥',
           'แพ็กเกจนักวิเคราะห์นโยบายและแผน สป.กษ. เพิ่มชุดข้อสอบระดับยากแล้ว เตรียมความพร้อมโค้งสุดท้ายก่อนสอบพรุ่งนี้',
           '/package/' || v_slug || '/exam/' || v_exam_set_id::text,
           null,
           v_event_key
    from pending p
    on conflict (user_id, type, source_event_key) where source_event_key is not null
    do nothing
    returning 1
  )
  select count(*)::int into v_inserted from ins;

  raise notice 'GATE_B_RESULT eligible=% already=% pending=% inserted=%', v_eligible, v_already, v_pending, v_inserted;
end
$package_content_update_fanout$;`
}

async function main() {
  const databaseUrl = process.env[URL_ENV]
  const guard = process.env[GUARD_ENV]

  if (!databaseUrl || guard !== GUARD_VALUE) {
    console.error(`Refusing to run: set ${URL_ENV} and ${GUARD_ENV}=${GUARD_VALUE} (disposable postgres only).`)
    process.exit(2)
  }

  const forbidden = FORBIDDEN_APPLICATION_ENVIRONMENT.filter((name) => process.env[name] !== undefined)
  if (forbidden.length > 0) {
    console.error(`Refusing to run: application environment variables present (${forbidden.join(', ')}). Use an isolated database URL instead.`)
    process.exit(2)
  }

  const client = new Client({ connectionString: databaseUrl })
  const clientB = new Client({ connectionString: databaseUrl })
  const notices = []
  await client.connect()
  client.on('notice', (notice) => notices.push(String(notice.message)))
  await client.query(`set statement_timeout = ${STATEMENT_TIMEOUT_MS}`)

  const { rows: schemaCheck } = await client.query(`
    select to_regclass('public.profiles') is not null as preexisting,
           to_regprocedure('auth.uid()') is not null as auth_uid_preexisting
  `)
  if (schemaCheck[0].preexisting) {
    console.error('Refusing to run: public.profiles already exists. This test needs an EMPTY database.')
    await client.end()
    process.exit(2)
  }
  if (schemaCheck[0].auth_uid_preexisting) {
    console.error('Refusing to run: a real auth.uid() already exists (Supabase-style fixture). This harness rewrites auth.uid() and may only run against an empty disposable database.')
    await client.end()
    process.exit(2)
  }

  console.log('fixture: creating dependency stubs')
  await client.query(FIXTURE_SCHEMA_SQL)

  console.log('fixture: applying real migrations 092 → 093 → 104')
  for (const file of migrationFiles) {
    await client.query('begin')
    try {
      await client.query(readRepoFile(file))
      await client.query('commit')
      console.log(`  applied ${file}`)
    } catch (error) {
      await client.query('rollback')
      console.error(`Migration ${file} failed: ${error.message}`)
      await client.end()
      process.exit(1)
    }
  }

  // 104 must refuse a second application (fail-closed preflight). The file
  // opens with SET LOCAL, so it has to be applied inside a transaction like
  // the migration runner does.
  await expectError(client, 'migration 104 refuses re-application',
    `begin;\n${readRepoFile(migrationFiles[2])}\ncommit;`,
    /already-present source_event_key/)

  console.log('seed: users, packages, orders, exam sets')
  const seed = await client.query(`
    insert into public.profiles (id, email, status, deleted_at) values
      ('11111111-1111-4111-8111-111111111111', 'user-a@test.local', 'active', null),
      ('22222222-2222-4222-8222-222222222222', 'user-b@test.local', 'active', null),
      ('33333333-3333-4333-8333-333333333333', 'user-c@test.local', 'active', null),
      ('44444444-4444-4444-8444-444444444444', 'user-multi@test.local', 'active', null),
      ('55555555-5555-4555-8555-555555555555', 'user-banned@test.local', 'banned', null),
      ('66666666-6666-4666-8666-666666666666', 'user-deleted@test.local', 'active', now()),
      ('77777777-7777-4777-8777-777777777777', 'user-other@test.local', 'active', null)
    returning id;

    insert into public.packages (slug, package_code, name, org_name, is_published) values
      ('spks-ppa-test', 'OPSMOAC-PPA-2026-V10', 'นักวิเคราะห์นโยบายและแผน สป.กษ.', 'สป.กษ.', true),
      ('other-package', 'OTHER-PKG-1', 'Other', 'Other Org', true);

    insert into public.orders (user_id, package_id, status, payment_provider)
    select s.user_id::uuid, pkg.id, s.status,
           case when s.status = 'free' then 'free' else 'paid' end
      from (values
        ('11111111-1111-4111-8111-111111111111', 'paid'),
        ('22222222-2222-4222-8222-222222222222', 'free'),
        ('33333333-3333-4333-8333-333333333333', 'paid'),
        ('44444444-4444-4444-8444-444444444444', 'paid'),
        ('44444444-4444-4444-8444-444444444444', 'free'),
        ('55555555-5555-4555-8555-555555555555', 'paid'),
        ('66666666-6666-4666-8666-666666666666', 'paid')
      ) as s(user_id, status)
      cross join public.packages pkg
     where pkg.package_code = 'OPSMOAC-PPA-2026-V10';

    insert into public.orders (user_id, package_id, status, payment_provider)
    select '77777777-7777-4777-8777-777777777777'::uuid, id, 'paid', 'paid'
      from public.packages where package_code = 'OTHER-PKG-1';

    insert into public.exam_sets (package_id, name, status, created_at)
    select id, 'ชุดยาก (new)', 'published', now() from public.packages where package_code = 'OPSMOAC-PPA-2026-V10';

    insert into public.exam_sets (package_id, name, status, created_at)
    select id, 'ชุดเดิม (old)', 'published', now() - interval '30 days' from public.packages where package_code = 'OPSMOAC-PPA-2026-V10';

    insert into public.exam_sets (package_id, name, status)
    select id, 'draft set', 'draft' from public.packages where package_code = 'OPSMOAC-PPA-2026-V10';

    insert into public.exam_sets (package_id, name, status)
    select id, 'other package set', 'published' from public.packages where package_code = 'OTHER-PKG-1';
  `)
  void seed

  const ids = (await client.query(`
    select
      (select id from public.packages where package_code = 'OPSMOAC-PPA-2026-V10') as package_id,
      (select id from public.packages where package_code = 'OTHER-PKG-1') as other_package_id,
      (select id from public.exam_sets where name = 'ชุดยาก (new)') as exam_set_id,
      (select id from public.exam_sets where name = 'draft set') as draft_set_id,
      (select id from public.packages where package_code = 'OTHER-PKG-1') as other_exam_package_id
  `)).rows[0]
  const otherExamSetId = (await client.query(
    'select id from public.exam_sets where package_id = $1 limit 1',
    [ids.other_package_id],
  )).rows[0].id
  const oldPublishedSetId = (await client.query(
    "select id from public.exam_sets where name = 'ชุดเดิม (old)' limit 1",
  )).rows[0].id
  const eventKey = `package_content_update:${ids.package_id}:${ids.exam_set_id}`

  // The multi-order user: confirm two completed orders exist for them.
  const { rows: orderCounts } = await client.query(`
    select o.user_id::text as user_id, count(*)::int as n
      from public.orders o
     where o.package_id = $1 and o.status in ('paid','free')
     group by o.user_id
     order by o.user_id
  `, [ids.package_id])
  const multi = orderCounts.find((row) => row.user_id === '44444444-4444-4444-8444-444444444444')
  check('multi-order user has two completed orders', multi?.n === 2, `got ${multi?.n}`)

  // Gate A mirror: distinct entitled users after the active-profile filter.
  const { rows: gateAEligible } = await client.query(`
    select distinct o.user_id::text as user_id
      from public.orders o
      join public.profiles pr on pr.id = o.user_id
     where o.package_id = $1
       and o.status in ('paid','free')
       and pr.deleted_at is null
       and pr.status = 'active'
     order by o.user_id::text
  `, [ids.package_id])
  check(
    'Gate A eligible audience is exactly the 4 entitled active users',
    gateAEligible.length === 4
      && gateAEligible.some((r) => r.user_id.startsWith('44444444'))
      && !gateAEligible.some((r) => r.user_id.startsWith('55555555'))
      && !gateAEligible.some((r) => r.user_id.startsWith('66666666'))
      && !gateAEligible.some((r) => r.user_id.startsWith('77777777')),
    JSON.stringify(gateAEligible),
  )

  const setGuardDateToday = `select set_config('app.notification_v1_2_send_date', to_char((now() at time zone 'Asia/Bangkok')::date, 'YYYY-MM-DD'), false)`
  const setGuardDateStale = `select set_config('app.notification_v1_2_send_date', '2000-01-01', false)`

  console.log('scenario: send-time guard fails closed on a stale date')
  await client.query(setGuardDateStale)
  await expectError(client, 'stale guard date rejects the fanout',
    fanoutSql(ids.exam_set_id, 4), /send-time guard/)
  const { rows: afterGuardTrip } = await client.query(
    "select count(*)::int as n from public.notifications where type = 'PACKAGE_CONTENT_UPDATE'",
  )
  check('guard rejection inserted nothing', afterGuardTrip[0].n === 0, `got ${afterGuardTrip[0].n}`)

  console.log('scenario: fail-closed target validation')
  await client.query(setGuardDateToday)
  await expectError(client, 'draft exam set rejected',
    fanoutSql(ids.draft_set_id, 4), /not the confirmed published hard exam set/)
  await expectError(client, 'foreign-package exam set rejected',
    fanoutSql(otherExamSetId, 4), /not the confirmed published hard exam set/)
  await expectError(client, 'non-hard published set of the target package rejected',
    fanoutSql(oldPublishedSetId, 4), /not the confirmed published hard exam set/)
  await expectError(client, 'eligible audience drift rejected',
    fanoutSql(ids.exam_set_id, 5), /audience drift/)
  const { rows: afterFailClosed } = await client.query(
    "select count(*)::int as n from public.notifications where type = 'PACKAGE_CONTENT_UPDATE'",
  )
  check('fail-closed scenarios inserted nothing', afterFailClosed[0].n === 0, `got ${afterFailClosed[0].n}`)

  console.log('scenario: multi-user fanout')
  await client.query(setGuardDateToday)
  notices.length = 0
  await client.query(fanoutSql(ids.exam_set_id, 4))
  const gateBNotice = notices.find((message) => message.includes('GATE_B_RESULT')) ?? ''
  check('first fanout inserts 4 (one per recipient)', /inserted=4/.test(gateBNotice), gateBNotice)

  const { rows: perUser } = await client.query(`
    select user_id::text as user_id, count(*)::int as n
      from public.notifications
     where type = 'PACKAGE_CONTENT_UPDATE' and source_event_key = $1
     group by user_id order by user_id
  `, [eventKey])
  check('user A received exactly 1', perUser.find((r) => r.user_id.startsWith('11111111'))?.n === 1)
  check('user B received exactly 1', perUser.find((r) => r.user_id.startsWith('22222222'))?.n === 1)
  check('user C received exactly 1', perUser.find((r) => r.user_id.startsWith('33333333'))?.n === 1)
  check('multi-order user received exactly 1', perUser.find((r) => r.user_id.startsWith('44444444'))?.n === 1)
  check('banned user received nothing', !perUser.some((r) => r.user_id.startsWith('55555555')))
  check('soft-deleted user received nothing', !perUser.some((r) => r.user_id.startsWith('66666666')))
  check('other-package user received nothing', !perUser.some((r) => r.user_id.startsWith('77777777')))

  const { rows: hrefCheck } = await client.query(`
    select distinct href from public.notifications
     where type = 'PACKAGE_CONTENT_UPDATE' and source_event_key = $1
  `, [eventKey])
  check(
    'CTA is the internal exam-set route',
    hrefCheck.length === 1 && hrefCheck[0].href === `/package/spks-ppa-test/exam/${ids.exam_set_id}`,
    hrefCheck.map((r) => r.href).join(','),
  )

  console.log('scenario: rerun and concurrent fanout')
  await client.query(setGuardDateToday)
  notices.length = 0
  await client.query(fanoutSql(ids.exam_set_id, 4))
  check('repeat fanout inserts 0', /inserted=0/.test(notices.find((m) => m.includes('GATE_B_RESULT')) ?? ''))

  await clientB.connect()
  await clientB.query(`set statement_timeout = ${STATEMENT_TIMEOUT_MS}`)
  await clientB.query(setGuardDateToday)
  // Clear rows and race two fanouts from independent sessions.
  await client.query('begin')
  await client.query("delete from public.notifications where type = 'PACKAGE_CONTENT_UPDATE'")
  await client.query('commit')
  notices.length = 0
  const raceNoticesB = []
  clientB.on('notice', (notice) => raceNoticesB.push(String(notice.message)))
  const [resultA, resultB] = await Promise.all([
    client.query(fanoutSql(ids.exam_set_id, 4)),
    clientB.query(fanoutSql(ids.exam_set_id, 4)),
  ])
  void resultA
  void resultB
  const { rows: afterRace } = await client.query(`
    select user_id::text as user_id, count(*)::int as n
      from public.notifications
     where type = 'PACKAGE_CONTENT_UPDATE' and source_event_key = $1
     group by user_id
  `, [eventKey])
  check('concurrent fanouts still yield 4 rows, one per user', afterRace.length === 4 && afterRace.every((r) => r.n === 1),
    JSON.stringify(afterRace))
  const insertedTotal = [
    ...notices.filter((m) => m.includes('GATE_B_RESULT')),
    ...raceNoticesB.filter((m) => m.includes('GATE_B_RESULT')),
  ].reduce((sum, message) => sum + (Number(/inserted=(\d+)/.exec(message)?.[1] ?? '0')), 0)
  check('concurrent fanouts inserted each row exactly once', insertedTotal === 4, `sum inserted=${insertedTotal}`)

  console.log('scenario: type-specific source integrity')
  const anyUser = '11111111-1111-4111-8111-111111111111'
  await expectError(client, 'PACKAGE_APPROVED requires an order source',
    `insert into public.notifications (user_id, type, title, body, href, source_order_id)
     values ('${anyUser}', 'PACKAGE_APPROVED', 'x', 'x', '/my-packages', null)`,
    /notifications_package_approved_source_check/)
  await expectError(client, 'PAYMENT_REJECTED requires a submission source',
    `insert into public.notifications (user_id, type, title, body, href, source_order_id)
     values ('${anyUser}', 'PAYMENT_REJECTED', 'x', 'x', '/checkout/x', null)`,
    /notifications_payment_rejected_source_check/)
  await expectError(client, 'PACKAGE_CONTENT_UPDATE requires an event key',
    `insert into public.notifications (user_id, type, title, body, href, source_order_id)
     values ('${anyUser}', 'PACKAGE_CONTENT_UPDATE', 'x', 'x', '/package/x', null)`,
    /notifications_package_content_update_source_check/)
  await expectError(client, 'event-key rows cannot fake an order reference',
    `insert into public.notifications (user_id, type, title, body, href, source_order_id, source_event_key)
     values ('${anyUser}', 'PACKAGE_CONTENT_UPDATE', 'x', 'x', '/package/x', '11111111-1111-4111-8111-111111111111', '${eventKey}')`,
    /notifications_event_key_scope_check/)

  console.log('scenario: existing producers unchanged')
  const orderA = (await client.query(
    "select id from public.orders where user_id = $1 and package_id = $2 limit 1",
    [anyUser, ids.package_id],
  )).rows[0].id
  await client.query('select public.try_create_package_approved_notification($1)', [orderA])
  const { rows: approvedRows } = await client.query(
    "select href, source_order_id::text as order_id from public.notifications where type = 'PACKAGE_APPROVED' and user_id = $1",
    [anyUser],
  )
  check('PACKAGE_APPROVED producer emits one order-anchored row',
    approvedRows.length === 1
    && approvedRows[0].href === '/my-packages'
    && approvedRows[0].order_id === orderA)
  await client.query('select public.try_create_package_approved_notification($1)', [orderA])
  const { rows: approvedAgain } = await client.query(
    "select count(*)::int as n from public.notifications where type = 'PACKAGE_APPROVED' and user_id = $1",
    [anyUser],
  )
  check('PACKAGE_APPROVED producer stays idempotent', approvedAgain[0].n === 1, `got ${approvedAgain[0].n}`)

  const submission = (await client.query(`
    insert into public.payment_submissions (order_id, status, rejection_reason)
    values ($1, 'rejected', 'test only')
    returning id
  `, [orderA])).rows[0].id
  // The canonical producers are best-effort by contract (092/093: errors are
  // isolated in `exception when others then raise warning`), so invalid input
  // is a silent no-op, not a raised error.
  await client.query('select public.try_create_payment_rejected_notification($1)', [submission])
  const { rows: noRejectedRow } = await client.query(
    'select count(*)::int as n from public.notifications where source_payment_submission_id = $1',
    [submission],
  )
  check('rejected producer no-ops on a non-pending order (best-effort isolation)',
    noRejectedRow[0].n === 0, `got ${noRejectedRow[0].n}`)
  const pendingOrder = (await client.query(`
    insert into public.orders (user_id, package_id, status, payment_provider)
    values ('11111111-1111-4111-8111-111111111111', $1, 'pending', 'promptpay_manual')
    returning id
  `, [ids.package_id])).rows[0].id
  const pendingSubmission = (await client.query(`
    insert into public.payment_submissions (order_id, status) values ($1, 'rejected') returning id
  `, [pendingOrder])).rows[0].id
  await client.query('select public.try_create_payment_rejected_notification($1)', [pendingSubmission])
  const { rows: rejectedRows } = await client.query(
    'select href, source_payment_submission_id::text as sub_id from public.notifications where type = $1 and source_payment_submission_id = $2',
    ['PAYMENT_REJECTED', pendingSubmission],
  )
  check('PAYMENT_REJECTED producer emits one submission-anchored row',
    rejectedRows.length === 1 && rejectedRows[0].href === `/checkout/${ids.package_id}`)
  await client.query('select public.try_create_payment_rejected_notification($1)', [pendingSubmission])
  const { rows: rejectedAgain } = await client.query(
    'select count(*)::int as n from public.notifications where type = $1 and source_payment_submission_id = $2',
    ['PAYMENT_REJECTED', pendingSubmission],
  )
  check('PAYMENT_REJECTED producer stays idempotent', rejectedAgain[0].n === 1)

  console.log('scenario: RLS, grants, and mark-read unchanged')
  const { rows: privs } = await client.query(`
    select
      has_table_privilege('authenticated', 'public.notifications', 'SELECT') as can_select,
      has_table_privilege('authenticated', 'public.notifications', 'INSERT') as can_insert,
      has_table_privilege('authenticated', 'public.notifications', 'DELETE') as can_delete,
      has_table_privilege('authenticated', 'public.notifications', 'UPDATE') as can_update,
      has_column_privilege('authenticated', 'public.notifications', 'read_at', 'UPDATE') as can_update_read_at,
      has_column_privilege('authenticated', 'public.notifications', 'href', 'UPDATE') as can_update_href
  `)
  check('authenticated can select own (grant)', privs[0].can_select === true)
  check('authenticated cannot insert', privs[0].can_insert === false)
  check('authenticated cannot delete', privs[0].can_delete === false)
  check('authenticated update is column-scoped to read_at only',
    privs[0].can_update === false
    && privs[0].can_update_read_at === true
    && privs[0].can_update_href === false,
    JSON.stringify(privs[0]))

  await client.query('begin')
  await client.query("select set_config('request.jwt.claim.sub', '11111111-1111-4111-8111-111111111111', true)")
  await client.query('set local role authenticated')
  const { rows: visible } = await client.query(
    "select count(*)::int as n from public.notifications where type = 'PACKAGE_CONTENT_UPDATE'",
  )
  check('authenticated sees only own rows', visible[0].n === 1, `got ${visible[0].n}`)
  const { rows: marked } = await client.query(`
    update public.notifications set read_at = now()
     where type = 'PACKAGE_CONTENT_UPDATE' and read_at is null
    returning id
  `)
  check('authenticated can mark own notification read', marked.length === 1)
  await client.query('rollback')

  await client.query(setGuardDateToday)
  notices.length = 0
  await client.query(fanoutSql(ids.exam_set_id, 4))
  check('fanout after mark-read still inserts 0 (dedupe ignores read state)',
    /inserted=0/.test(notices.find((m) => m.includes('GATE_B_RESULT')) ?? ''))

  await clientB.end()
  await client.end()

  console.log(`\n${passed} checks passed, ${failures.length} failed`)
  if (failures.length > 0) {
    failures.forEach((failure) => console.error(`  - ${failure}`))
    process.exit(1)
  }
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
