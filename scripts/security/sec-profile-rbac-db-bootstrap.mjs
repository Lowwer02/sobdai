#!/usr/bin/env node

import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import pg from 'pg'

const { Client } = pg

const DESTRUCTIVE_TEST_GUARD = 'YES_I_AM_USING_SOBDAI_SEC_TEST'
const MIGRATION_PATH = resolve(
  dirname(fileURLToPath(import.meta.url)),
  '../../supabase/migrations/079_sec_profile_rbac_baseline_hardening.sql',
)

const TEST_EMAILS = Object.freeze({
  ownerA: 'sec-db2a-owner-a@example.com',
  ownerB: 'sec-db2a-owner-b@example.com',
  admin: 'sec-db2a-admin@example.com',
  editor: 'sec-db2a-editor@example.com',
  support: 'sec-db2a-support@example.com',
  normal: 'sec-db2a-normal-user@example.com',
  bannedManager: 'sec-db2a-banned-user@example.com',
  deletedManager: 'sec-db2a-deleted-user@example.com',
})
const TEST_EMAIL_LIST = Object.values(TEST_EMAILS)
const STAFF_ROLES = new Set(['owner', 'admin', 'editor', 'support'])

const LEGACY_TEARDOWN_SQL = `
do $sec_fixture_drop_policies$
declare
  policy_row record;
begin
  -- Remove every mutation policy on the known SEC surface. Public SELECT
  -- policies are deliberately retained; only the pre-079 mutation boundary
  -- is reconstructed here.
  for policy_row in
    select schemaname, tablename, policyname
    from pg_catalog.pg_policies
    where (
      schemaname = 'public'
      and tablename in (
        'profiles', 'homepage_settings', 'news', 'news_packages',
        'news_summaries', 'news_redirects', 'articles', 'article_packages',
        'promotions', 'organizations', 'positions', 'packages', 'exam_sets',
        'questions', 'exam_set_questions', 'orders',
        'reference_documents', 'reference_document_versions',
        'reference_document_aliases'
      )
      and cmd in ('INSERT', 'UPDATE', 'DELETE', 'ALL')
    )
    or (
      schemaname = 'storage'
      and tablename = 'objects'
      and cmd in ('INSERT', 'UPDATE', 'DELETE', 'ALL')
      and (
        coalesce(qual, '') || ' ' || coalesce(with_check, '')
      ) ilike any (array['%package-assets%', '%news-assets%', '%article-assets%'])
    )
  loop
    execute format(
      'drop policy if exists %I on %I.%I',
      policy_row.policyname,
      policy_row.schemaname,
      policy_row.tablename
    );
  end loop;
end
$sec_fixture_drop_policies$;

do $sec_fixture_drop_profile_policies$
declare
  policy_row record;
begin
  for policy_row in
    select policyname
    from pg_catalog.pg_policies
    where schemaname = 'public' and tablename = 'profiles'
  loop
    execute format(
      'drop policy if exists %I on public.profiles',
      policy_row.policyname
    );
  end loop;
end
$sec_fixture_drop_profile_policies$;

drop trigger if exists profiles_security_guard on public.profiles;

drop function if exists public.profile_actor_is_manager();
drop function if exists public.admin_update_profile_role(uuid, text);
drop function if exists public.admin_update_profile_status(uuid, text, text);
drop function if exists public.deactivate_my_profile();
drop function if exists public.protect_profile_security_fields();
drop function if exists public.kp_is_content_editor();
drop function if exists public.sec079_default_acl_probe();

alter table public.profiles
  drop constraint if exists profiles_status_check;
alter table public.profiles
  drop column if exists status;
`

const LEGACY_BASELINE_SQL = `
alter default privileges for role postgres in schema public
grant execute on functions to anon, authenticated, service_role;

alter table public.profiles alter column role set default 'user';

create policy "Public profiles are viewable by everyone."
on public.profiles for select using (true);
create policy "Users can update own profile."
on public.profiles for update using (
  auth.uid() = id
  or exists (
    select 1 from public.profiles
    where id = auth.uid() and role in ('owner', 'admin')
  )
);

create policy "Only admins can manage homepage settings."
on public.homepage_settings for all using (
  exists (
    select 1 from public.profiles
    where id = auth.uid() and role in ('owner', 'admin', 'editor')
  )
);
create policy "Content managers can manage news."
on public.news for all using (
  exists (
    select 1 from public.profiles
    where id = auth.uid() and role in ('owner', 'admin', 'editor')
  )
);
create policy "Content managers can manage news_packages."
on public.news_packages for all using (
  exists (
    select 1 from public.profiles
    where id = auth.uid() and role in ('owner', 'admin', 'editor')
  )
);
create policy "Content managers can manage news_summaries."
on public.news_summaries for all using (
  exists (
    select 1 from public.profiles
    where id = auth.uid() and role in ('owner', 'admin', 'editor')
  )
);
create policy "Content managers can manage news_redirects."
on public.news_redirects for all using (
  exists (
    select 1 from public.profiles
    where id = auth.uid() and role in ('owner', 'admin', 'editor')
  )
);
create policy "Content managers can manage articles."
on public.articles for all using (
  exists (
    select 1 from public.profiles
    where id = auth.uid() and role in ('owner', 'admin', 'editor')
  )
);
create policy "Content managers can manage article_packages."
on public.article_packages for all using (
  exists (
    select 1 from public.profiles
    where id = auth.uid() and role in ('owner', 'admin', 'editor')
  )
);
create policy "Content managers can manage promotions."
on public.promotions for all using (
  exists (
    select 1 from public.profiles
    where id = auth.uid() and role in ('owner', 'admin', 'editor')
  )
);

create policy "Only owners can insert organizations."
on public.organizations for insert with check (
  exists (select 1 from public.profiles where id = auth.uid() and role = 'owner')
);
create policy "Only owners can update organizations."
on public.organizations for update using (
  exists (select 1 from public.profiles where id = auth.uid() and role = 'owner')
);
create policy "Only owners can delete organizations."
on public.organizations for delete using (
  exists (select 1 from public.profiles where id = auth.uid() and role = 'owner')
);
create policy "Only owners can insert positions."
on public.positions for insert with check (
  exists (select 1 from public.profiles where id = auth.uid() and role = 'owner')
);
create policy "Only owners can update positions."
on public.positions for update using (
  exists (select 1 from public.profiles where id = auth.uid() and role = 'owner')
);
create policy "Only owners can delete positions."
on public.positions for delete using (
  exists (select 1 from public.profiles where id = auth.uid() and role = 'owner')
);

create policy "Content creators can insert packages."
on public.packages for insert with check (
  exists (
    select 1 from public.profiles
    where id = auth.uid() and role in ('owner', 'admin', 'editor')
  )
);
create policy "Content creators can update packages."
on public.packages for update using (
  exists (
    select 1 from public.profiles
    where id = auth.uid() and role in ('owner', 'admin', 'editor')
  )
);
create policy "Content managers can delete packages."
on public.packages for delete using (
  exists (
    select 1 from public.profiles
    where id = auth.uid() and role in ('owner', 'admin')
  )
);

create policy "Content creators can insert exam_sets."
on public.exam_sets for insert with check (
  exists (
    select 1 from public.profiles
    where id = auth.uid() and role in ('owner', 'admin', 'editor')
  )
);
create policy "Content creators can update exam_sets."
on public.exam_sets for update using (
  exists (
    select 1 from public.profiles
    where id = auth.uid() and role in ('owner', 'admin', 'editor')
  )
);
create policy "Content managers can delete exam_sets."
on public.exam_sets for delete using (
  exists (
    select 1 from public.profiles
    where id = auth.uid() and role in ('owner', 'admin')
  )
);

create policy "Content creators can insert questions."
on public.questions for insert with check (
  exists (
    select 1 from public.profiles
    where id = auth.uid() and role in ('owner', 'admin', 'editor')
  )
);
create policy "Content creators can update questions."
on public.questions for update using (
  exists (
    select 1 from public.profiles
    where id = auth.uid() and role in ('owner', 'admin', 'editor')
  )
);
create policy "Content managers can delete questions."
on public.questions for delete using (
  exists (
    select 1 from public.profiles
    where id = auth.uid() and role in ('owner', 'admin')
  )
);

create policy "Content creators can manage exam_set_questions."
on public.exam_set_questions for all using (
  exists (
    select 1 from public.profiles
    where id = auth.uid() and role in ('owner', 'admin', 'editor')
  )
);

create policy "Financial managers can insert orders."
on public.orders for insert with check (
  exists (
    select 1 from public.profiles
    where id = auth.uid() and role in ('owner', 'admin')
  )
);
create policy "Financial managers can update orders."
on public.orders for update using (
  exists (
    select 1 from public.profiles
    where id = auth.uid() and role in ('owner', 'admin')
  )
);
create policy "Financial managers can delete orders."
on public.orders for delete using (
  exists (
    select 1 from public.profiles
    where id = auth.uid() and role in ('owner', 'admin')
  )
);

create policy "Users can upload package assets."
on storage.objects for insert to authenticated
with check (bucket_id = 'package-assets' and auth.role() = 'authenticated');
create policy "Users can update package assets."
on storage.objects for update to authenticated
using (bucket_id = 'package-assets' and auth.role() = 'authenticated');
create policy "Content managers can upload news assets."
on storage.objects for insert to authenticated
with check (
  bucket_id = 'news-assets'
  and exists (
    select 1 from public.profiles
    where id = auth.uid() and role in ('owner', 'admin', 'editor')
  )
);
create policy "Content managers can update news assets."
on storage.objects for update to authenticated
using (
  bucket_id = 'news-assets'
  and exists (
    select 1 from public.profiles
    where id = auth.uid() and role in ('owner', 'admin', 'editor')
  )
);
create policy "Content managers can delete news assets."
on storage.objects for delete to authenticated
using (
  bucket_id = 'news-assets'
  and exists (
    select 1 from public.profiles
    where id = auth.uid() and role in ('owner', 'admin', 'editor')
  )
);
create policy "Content managers can upload article assets."
on storage.objects for insert to authenticated
with check (
  bucket_id = 'article-assets'
  and exists (
    select 1 from public.profiles
    where id = auth.uid() and role in ('owner', 'admin', 'editor')
  )
);
create policy "Content managers can update article assets."
on storage.objects for update to authenticated
using (
  bucket_id = 'article-assets'
  and exists (
    select 1 from public.profiles
    where id = auth.uid() and role in ('owner', 'admin', 'editor')
  )
);
create policy "Content managers can delete article assets."
on storage.objects for delete to authenticated
using (
  bucket_id = 'article-assets'
  and exists (
    select 1 from public.profiles
    where id = auth.uid() and role in ('owner', 'admin', 'editor')
  )
);

create or replace function public.kp_is_content_editor()
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public, auth, pg_temp
as $function$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role in ('owner', 'admin', 'editor')
  )
$function$;

create policy kp_editor_insert
on public.reference_documents for insert to authenticated
with check (public.kp_is_content_editor());
create policy kp_editor_update
on public.reference_documents for update to authenticated
using (public.kp_is_content_editor())
with check (public.kp_is_content_editor());
create policy kp_editor_insert
on public.reference_document_versions for insert to authenticated
with check (public.kp_is_content_editor());
create policy kp_editor_update
on public.reference_document_versions for update to authenticated
using (public.kp_is_content_editor())
with check (public.kp_is_content_editor());
create policy kp_editor_insert
on public.reference_document_aliases for insert to authenticated
with check (public.kp_is_content_editor());
create policy kp_editor_update
on public.reference_document_aliases for update to authenticated
using (public.kp_is_content_editor())
with check (public.kp_is_content_editor());

grant select, update on table public.profiles to anon, authenticated;
grant insert, update, delete on table
  public.organizations, public.positions, public.packages, public.exam_sets,
  public.questions, public.exam_set_questions, public.orders
  to authenticated;
grant select, insert, update on table
  public.reference_documents, public.reference_document_versions,
  public.reference_document_aliases
  to authenticated;
grant insert, update, delete on table storage.objects to authenticated;
`

const RESET_FIXTURE_SQL = `
update public.profiles
set
  role = case email
    when $1 then 'owner'
    when $2 then 'owner'
    when $3 then 'admin'
    when $4 then 'editor'
    when $5 then 'support'
    when $6 then 'user'
    when $7 then 'admin'
    when $8 then 'admin'
    else role
  end,
  display_name = case
    when email = $1 then 'SEC DB2 test owner A'
    when email = $2 then 'SEC DB2 test owner B'
    when email = $3 then 'SEC DB2 test admin'
    when email = $4 then 'SEC DB2 test editor'
    when email = $5 then 'SEC DB2 test support'
    when email = $6 then 'SEC DB2 test normal'
    when email = $7 then 'SEC DB2 test banned manager'
    when email = $8 then 'SEC DB2 test deleted manager'
    else display_name
  end,
  occupation = 'SEC security test',
  phone = '0000000000',
  avatar_url = null,
  last_seen_at = now(),
  deleted_at = null,
  deleted_reason = null,
  deleted_by = null,
  banned_at = null,
  banned_reason = null,
  banned_by = null
where email = any($9::text[])
`

class BootstrapFailure extends Error {
  constructor(stage, error) {
    super(stage)
    this.stage = stage
    this.code = error?.code ?? null
    this.databaseMessage = typeof error?.message === 'string' ? error.message : null
  }
}

function createClient(config) {
  const client = new Client({
    connectionString: config.databaseUrl,
    ssl: { rejectUnauthorized: false },
    connectionTimeoutMillis: 10000,
  })
  client.on('error', () => {})
  return client
}

async function queryOrThrow(client, sql, params, stage) {
  try {
    return await client.query(sql, params)
  } catch (error) {
    throw new BootstrapFailure(stage, error)
  }
}

async function closeQuietly(client) {
  if (!client) return
  let timer
  let finished = false
  try {
    await Promise.race([
      client.end().catch(() => {}),
      new Promise((resolve) => {
        timer = setTimeout(() => {
          if (!finished) client.connection?.stream?.destroy()
          resolve()
        }, 3000)
      }),
    ])
  } finally {
    finished = true
    clearTimeout(timer)
  }
}

async function assertDisposablePopulation(client) {
  const result = await queryOrThrow(
    client,
    [
      'select',
      '  count(*)::int as total_profiles,',
      '  count(*) filter (where email <> all($1::text[]))::int as unexpected_profiles,',
      '  count(*) filter (where email = any($1::text[]))::int as fixture_profiles,',
      '  (select count(*)::int from auth.users where email = any($1::text[])) as fixture_auth_users',
      'from public.profiles',
    ].join('\n'),
    [TEST_EMAIL_LIST],
    'disposable_population_lookup',
  )
  const row = result.rows[0]
  if (
    row.total_profiles !== TEST_EMAIL_LIST.length
    || row.unexpected_profiles !== 0
    || row.fixture_profiles !== TEST_EMAIL_LIST.length
    || row.fixture_auth_users !== TEST_EMAIL_LIST.length
  ) {
    throw new BootstrapFailure('disposable_population_not_exact_fixture')
  }
}

async function inspectStatusContract(client) {
  const column = await queryOrThrow(
    client,
    [
      'select column_name, data_type, is_nullable, column_default',
      'from information_schema.columns',
      "where table_schema = 'public' and table_name = 'profiles' and column_name = 'status'",
    ].join('\n'),
    [],
    'status_column_lookup',
  )
  const constraints = await queryOrThrow(
    client,
    [
      'select conname, pg_get_constraintdef(oid) as definition',
      'from pg_catalog.pg_constraint',
      "where conrelid = 'public.profiles'::regclass and contype = 'c'",
    ].join('\n'),
    [],
    'status_constraint_lookup',
  )
  const row = column.rows[0] ?? null
  const statusConstraint = constraints.rows.find((candidate) => /status/i.test(candidate.definition)) ?? null
  const values = row
    ? await queryOrThrow(
        client,
        [
          'select',
          "  count(*)::int as total,",
          "  count(*) filter (where status = 'active')::int as active,",
          "  count(*) filter (where status = 'banned')::int as banned,",
          '  count(*) filter (where status is null)::int as null_status',
          'from public.profiles',
        ].join('\n'),
        [],
        'status_value_lookup',
      )
    : null
  return {
    exists: Boolean(row),
    data_type: row?.data_type ?? null,
    is_nullable: row?.is_nullable ?? null,
    column_default: row?.column_default ?? null,
    status_constraint: statusConstraint?.definition ?? null,
    values: values?.rows[0] ?? null,
  }
}

async function prepareLegacyBaseline(config, { unsafe = false } = {}) {
  const client = createClient(config)
  try {
    await client.connect()
    await assertDisposablePopulation(client)
    await queryOrThrow(client, 'begin', [], 'legacy_baseline_begin')
    await queryOrThrow(client, LEGACY_TEARDOWN_SQL, [], 'legacy_baseline_teardown')
    await queryOrThrow(client, LEGACY_BASELINE_SQL, [], 'legacy_baseline_policies')
    await queryOrThrow(
      client,
      RESET_FIXTURE_SQL,
      [
        TEST_EMAILS.ownerA,
        TEST_EMAILS.ownerB,
        TEST_EMAILS.admin,
        TEST_EMAILS.editor,
        TEST_EMAILS.support,
        TEST_EMAILS.normal,
        TEST_EMAILS.bannedManager,
        TEST_EMAILS.deletedManager,
        TEST_EMAIL_LIST,
      ],
      'legacy_baseline_fixture_reset',
    )
    if (unsafe) {
      await queryOrThrow(
        client,
        [
          'update public.profiles',
          "set banned_at = now(), banned_reason = 'SEC unsafe legacy fixture'",
          'where email = $1',
        ].join('\n'),
        [TEST_EMAILS.bannedManager],
        'legacy_baseline_unsafe_state',
      )
    }
    await queryOrThrow(client, 'commit', [], 'legacy_baseline_commit')

    const stateClient = createClient(config)
    try {
      await stateClient.connect()
      const state = await inspectStatusContract(stateClient)
      if (state.exists) throw new BootstrapFailure('legacy_baseline_status_still_exists')
      return {
        status_column_absent: true,
        unsafe_legacy_state: unsafe,
      }
    } finally {
      await closeQuietly(stateClient)
    }
  } catch (error) {
    await client.query('rollback').catch(() => {})
    if (error instanceof BootstrapFailure) throw error
    throw new BootstrapFailure('legacy_baseline', error)
  } finally {
    await closeQuietly(client)
  }
}

async function verifySupabaseDefaultFunctionAcl(config) {
  const client = createClient(config)
  try {
    await client.connect()
    await queryOrThrow(client, 'begin', [], 'default_function_acl_probe_begin')
    await queryOrThrow(
      client,
      'drop function if exists public.sec079_default_acl_probe()',
      [],
      'default_function_acl_probe_teardown',
    )
    await queryOrThrow(
      client,
      [
        'create function public.sec079_default_acl_probe()',
        'returns boolean',
        'language sql',
        'as $function$ select true $function$',
      ].join('\n'),
      [],
      'default_function_acl_probe_create',
    )
    const privileges = await queryOrThrow(
      client,
      [
        'select',
        "  has_function_privilege('anon', 'public.sec079_default_acl_probe()', 'EXECUTE') as anon_execute,",
        "  has_function_privilege('authenticated', 'public.sec079_default_acl_probe()', 'EXECUTE') as authenticated_execute,",
        "  has_function_privilege('service_role', 'public.sec079_default_acl_probe()', 'EXECUTE') as service_role_execute",
      ].join('\n'),
      [],
      'default_function_acl_probe_lookup',
    )
    const row = privileges.rows[0] ?? {}
    await queryOrThrow(
      client,
      'drop function public.sec079_default_acl_probe()',
      [],
      'default_function_acl_probe_cleanup',
    )
    await queryOrThrow(client, 'commit', [], 'default_function_acl_probe_commit')

    const result = {
      anon_execute: row.anon_execute === true,
      authenticated_execute: row.authenticated_execute === true,
      service_role_execute: row.service_role_execute === true,
      regression_reproduced: row.anon_execute === true
        && row.authenticated_execute === true
        && row.service_role_execute === true,
    }
    if (!result.regression_reproduced) {
      throw new BootstrapFailure('default_function_acl_not_reproduced', {
        message: JSON.stringify(result),
      })
    }
    return result
  } catch (error) {
    await client.query('rollback').catch(() => {})
    if (error instanceof BootstrapFailure) throw error
    throw new BootstrapFailure('default_function_acl_probe', error)
  } finally {
    await closeQuietly(client)
  }
}

async function assertPre079SelfPromotion(config) {
  const admin = createClient(config)
  const normal = createClient(config)
  try {
    await admin.connect()
    const lookup = await queryOrThrow(
      admin,
      'select id::text as id from public.profiles where email = $1',
      [TEST_EMAILS.normal],
      'pre079_normal_lookup',
    )
    const normalId = lookup.rows[0]?.id
    if (!normalId) throw new BootstrapFailure('pre079_normal_profile_missing')

    await normal.connect()
    await queryOrThrow(normal, 'set role authenticated', [], 'pre079_authenticated_role')
    await queryOrThrow(
      normal,
      "select set_config('request.jwt.claim.sub', $1, false)",
      [normalId],
      'pre079_authenticated_claim',
    )
    await queryOrThrow(normal, 'begin', [], 'pre079_promotion_begin')
    const promotion = await queryOrThrow(
      normal,
      "update public.profiles set role = 'owner' where id = $1",
      [normalId],
      'pre079_self_promotion',
    )
    if (promotion.rowCount !== 1) throw new BootstrapFailure('pre079_self_promotion_not_reproduced')
    await queryOrThrow(normal, 'commit', [], 'pre079_promotion_commit')

    await queryOrThrow(
      admin,
      "update public.profiles set role = 'user' where id = $1",
      [normalId],
      'pre079_self_promotion_cleanup',
    )
    return {
      reproduced: true,
      row_count: promotion.rowCount,
      cleaned_up: true,
    }
  } catch (error) {
    await normal.query('rollback').catch(() => {})
    if (error instanceof BootstrapFailure) throw error
    throw new BootstrapFailure('pre079_self_promotion', error)
  } finally {
    await Promise.all([closeQuietly(admin), closeQuietly(normal)])
  }
}

async function applyMigration(config) {
  const migration = readFileSync(MIGRATION_PATH, 'utf8')
  const client = createClient(config)
  try {
    await client.connect()
    await queryOrThrow(client, 'begin', [], 'migration_begin')
    try {
      await client.query(migration)
      await client.query('commit')
      return { ok: true }
    } catch (error) {
      await client.query('rollback').catch(() => {})
      return {
        ok: false,
        code: error?.code ?? null,
        message: typeof error?.message === 'string' ? error.message : null,
      }
    }
  } catch (error) {
    await client.query('rollback').catch(() => {})
    if (error instanceof BootstrapFailure) throw error
    throw new BootstrapFailure('migration_apply', error)
  } finally {
    await closeQuietly(client)
  }
}

async function addIncompatibleStatus(config) {
  const client = createClient(config)
  try {
    await client.connect()
    await queryOrThrow(client, 'alter table public.profiles add column status text', [], 'incompatible_status_add')
  } catch (error) {
    if (error instanceof BootstrapFailure) throw error
    throw new BootstrapFailure('incompatible_status_add', error)
  } finally {
    await closeQuietly(client)
  }
}

async function inspectStatus(config) {
  const client = createClient(config)
  try {
    await client.connect()
    return await inspectStatusContract(client)
  } catch (error) {
    if (error instanceof BootstrapFailure) throw error
    throw new BootstrapFailure('status_inspection', error)
  } finally {
    await closeQuietly(client)
  }
}

async function verifyStaffShellGuard(config) {
  const client = createClient(config)
  try {
    await client.connect()
    await queryOrThrow(client, 'begin', [], 'staff_shell_guard_fixture_begin')
    await queryOrThrow(
      client,
      [
        'update public.profiles',
        "set status = case when email = $1 then 'banned' else status end,",
        "    banned_at = case when email = $1 then now() else banned_at end,",
        "    deleted_at = case when email = $2 then now() else deleted_at end",
        'where email = any($3::text[])',
      ].join('\n'),
      [TEST_EMAILS.bannedManager, TEST_EMAILS.deletedManager, [TEST_EMAILS.bannedManager, TEST_EMAILS.deletedManager]],
      'staff_shell_guard_fixture_update',
    )
    const result = await queryOrThrow(
      client,
      [
        'select email, role, status, deleted_at',
        'from public.profiles',
        'where email = any($1::text[])',
      ].join('\n'),
      [[
        TEST_EMAILS.ownerA,
        TEST_EMAILS.admin,
        TEST_EMAILS.editor,
        TEST_EMAILS.support,
        TEST_EMAILS.normal,
        TEST_EMAILS.bannedManager,
        TEST_EMAILS.deletedManager,
      ]],
      'staff_shell_profile_lookup',
    )
    const rows = new Map(result.rows.map((row) => [row.email, row]))
    const usableStaff = (email) => {
      const row = rows.get(email)
      return Boolean(
        row
        && STAFF_ROLES.has(row.role)
        && row.status === 'active'
        && row.deleted_at === null,
      )
    }
    const staff = {
      owner: usableStaff(TEST_EMAILS.ownerA),
      admin: usableStaff(TEST_EMAILS.admin),
      editor: usableStaff(TEST_EMAILS.editor),
      support: usableStaff(TEST_EMAILS.support),
    }
    const nonStaff = {
      normal_user: usableStaff(TEST_EMAILS.normal),
      banned_manager: usableStaff(TEST_EMAILS.bannedManager),
      deleted_manager: usableStaff(TEST_EMAILS.deletedManager),
    }
    if (!Object.values(staff).every(Boolean) || Object.values(nonStaff).some(Boolean)) {
      throw new BootstrapFailure('staff_shell_guard_contract_failed')
    }
    await queryOrThrow(client, 'rollback', [], 'staff_shell_guard_fixture_rollback')
    return {
      pass: true,
      predicate: "role in ('owner', 'admin', 'editor', 'support') AND status = 'active' AND deleted_at IS NULL",
      staff,
      non_staff_rejected: Object.fromEntries(Object.keys(nonStaff).map((key) => [key, true])),
      support_limited_permission_model: true,
    }
  } catch (error) {
    await client.query('rollback').catch(() => {})
    if (error instanceof BootstrapFailure) throw error
    throw new BootstrapFailure('staff_shell_guard_contract', error)
  } finally {
    await closeQuietly(client)
  }
}

function requireMigrationSuccess(result, stage) {
  if (!result.ok) {
    throw new BootstrapFailure(stage, { code: result.code, message: result.message })
  }
}

function requireMigrationFailure(result, stage) {
  if (result.ok) throw new BootstrapFailure(stage + '_unexpected_success')
}

export async function runStatusCompatibilitySuite(config) {
  const report = {}

  report.legacy_clean_baseline = await prepareLegacyBaseline(config)
  report.round5_default_function_acl = await verifySupabaseDefaultFunctionAcl(config)
  report.pre079_self_promotion = await assertPre079SelfPromotion(config)

  const legacyMigration = await applyMigration(config)
  requireMigrationSuccess(legacyMigration, 'legacy_clean_migration')
  const legacyState = await inspectStatus(config)
  if (
    !legacyState.exists
    || legacyState.data_type !== 'text'
    || legacyState.is_nullable !== 'NO'
    || legacyState.column_default !== "'active'::text"
    || legacyState.values?.null_status !== 0
    || legacyState.values?.active !== legacyState.values?.total
  ) {
    throw new BootstrapFailure('legacy_clean_rows_not_active')
  }
  report.legacy_clean_migration = {
    succeeded: true,
    all_rows_active: true,
    profile_count: legacyState.values?.total ?? null,
  }

  const normalizedMigration = await applyMigration(config)
  requireMigrationSuccess(normalizedMigration, 'normalized_migration')
  const normalizedState = await inspectStatus(config)
  if (!normalizedState.exists || normalizedState.data_type !== 'text' || normalizedState.is_nullable !== 'NO') {
    throw new BootstrapFailure('normalized_status_contract_not_preserved')
  }
  report.normalized_baseline = {
    succeeded: true,
    status_shape_preserved: true,
  }

  await prepareLegacyBaseline(config, { unsafe: true })
  const unsafeMigration = await applyMigration(config)
  requireMigrationFailure(unsafeMigration, 'unsafe_legacy_migration')
  const unsafeState = await inspectStatus(config)
  if (unsafeState.exists) throw new BootstrapFailure('unsafe_legacy_status_was_added')
  report.unsafe_legacy_baseline = {
    aborted: true,
    status_column_still_absent: true,
    error_code: unsafeMigration.code,
  }

  await prepareLegacyBaseline(config)
  await addIncompatibleStatus(config)
  const incompatibleMigration = await applyMigration(config)
  requireMigrationFailure(incompatibleMigration, 'incompatible_status_migration')
  const incompatibleState = await inspectStatus(config)
  if (
    !incompatibleState.exists
    || incompatibleState.is_nullable !== 'YES'
    || incompatibleState.column_default !== null
  ) {
    throw new BootstrapFailure('incompatible_status_baseline_was_repaired')
  }
  report.incompatible_status_baseline = {
    aborted: true,
    incompatible_shape_preserved: true,
    error_code: incompatibleMigration.code,
  }

  await prepareLegacyBaseline(config)
  const finalMigration = await applyMigration(config)
  requireMigrationSuccess(finalMigration, 'final_legacy_migration')
  const finalState = await inspectStatus(config)
  if (!finalState.exists || finalState.values?.active !== finalState.values?.total) {
    throw new BootstrapFailure('final_legacy_migration_not_normalized')
  }
  report.staff_shell_guard = await verifyStaffShellGuard(config)
  report.final_fixture = {
    status_missing_baseline_applied: true,
    status_contract_established: true,
    all_rows_active: true,
  }

  return {
    pass: true,
    recognized_baselines: ['status_missing_legacy', 'status_normalized'],
    rejected_baselines: ['unsafe_status_missing_state', 'incompatible_status_definition'],
    report,
  }
}

export { TEST_EMAILS, TEST_EMAIL_LIST }

// Keep the guard identity in this file so a future standalone invocation or
// refactor cannot accidentally turn this helper into an ordinary test command.
export const DESTRUCTIVE_TEST_GUARD_VALUE = DESTRUCTIVE_TEST_GUARD
