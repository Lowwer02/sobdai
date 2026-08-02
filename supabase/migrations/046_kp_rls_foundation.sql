-- 046_kp_rls_foundation.sql
-- Sobdai Knowledge Platform — Knowledge/Product expansion security foundation.
--
-- The frozen SQL Migration Design assigned this responsibility to migration
-- 045. Production migration 041_news_gp_exam_requirement.sql shifted the
-- unchanged Knowledge Platform sequence by one, so the next free, monotonic
-- production identity is 046.
--
-- Purpose
-- -------
-- Install the frozen RLS ownership and read boundaries for the eight target
-- tables created by migrations 038-045 while legacy Package/Summary storage
-- remains authoritative and fully operational.
--
-- Scope boundary
-- --------------
-- * Adds only bounded RLS predicate helpers, grants, and policies.
-- * Does not change the existing public.summaries policies or legacy columns.
-- * Does not create a read model, resolver, application service, or workflow.
-- * Does not insert, update, delete, migrate, or backfill production data.
-- * Does not expose ReferenceDocument bodies, aliases, source relations, or
--   migration-control objects to public clients.
-- * Does not expose Summary Markdown unless an active placement resolves the
--   requested published revision and the frozen visibility rule permits it.
--
-- Later migration boundaries
-- --------------------------
-- Transactional persistence and direct-write restriction remain assigned to
-- their later frozen migrations. Existing database constraints and triggers
-- continue to enforce lifecycle and immutability invariants in the meantime.

set local lock_timeout = '5s';

-- ─────────────────────────────────────────────────────────────────────────────
-- Fail closed before changing grants or policies
-- ─────────────────────────────────────────────────────────────────────────────

do $kp_rls_preflight$
declare
    expected record;
begin
    for expected in
        select table_name
        from (values
            ('reference_documents'),
            ('reference_document_versions'),
            ('reference_document_aliases'),
            ('summary_versions'),
            ('summary_aliases'),
            ('summary_reference_documents'),
            ('summary_version_reference_documents'),
            ('package_summaries')
        ) as required(table_name)
    loop
        if to_regclass('public.' || expected.table_name) is null then
            raise exception using
                errcode = 'check_violation',
                message = format(
                    'Knowledge Platform migration 046 prerequisite is missing: public.%I.',
                    expected.table_name
                );
        end if;

        if not exists (
            select 1
            from pg_class c
            join pg_namespace n on n.oid = c.relnamespace
            where n.nspname = 'public'
              and c.relname = expected.table_name
              and c.relkind = 'r'
              and c.relrowsecurity
        ) then
            raise exception using
                errcode = 'check_violation',
                message = format(
                    'Knowledge Platform migration 046 drift: RLS must already be enabled on public.%I.',
                    expected.table_name
                );
        end if;

        if exists (
            select 1
            from pg_policies p
            where p.schemaname = 'public'
              and p.tablename = expected.table_name
        ) then
            raise exception using
                errcode = 'check_violation',
                message = format(
                    'Knowledge Platform migration 046 drift: public.%I must still have the deny-all pre-foundation policy state.',
                    expected.table_name
                );
        end if;
    end loop;

    if to_regclass('public.profiles') is null
       or to_regclass('public.packages') is null
       or to_regclass('public.summaries') is null
       or to_regclass('public.orders') is null
    then
        raise exception using
            errcode = 'check_violation',
            message = 'Knowledge Platform migration 046 prerequisites are missing: profiles, packages, summaries, and orders must exist.';
    end if;

    if not exists (
        select 1
        from information_schema.columns c
        where c.table_schema = 'public'
          and c.table_name = 'packages'
          and c.column_name = 'is_published'
          and c.data_type = 'boolean'
    ) then
        raise exception using
            errcode = 'check_violation',
            message = 'Knowledge Platform migration 046 drift: packages.is_published boolean is required.';
    end if;

    if not exists (
        select 1
        from information_schema.columns c
        where c.table_schema = 'public'
          and c.table_name = 'profiles'
          and c.column_name = 'role'
          and c.data_type = 'text'
    ) then
        raise exception using
            errcode = 'check_violation',
            message = 'Knowledge Platform migration 046 drift: profiles.role text is required.';
    end if;
end
$kp_rls_preflight$;

-- ─────────────────────────────────────────────────────────────────────────────
-- Bounded policy predicates
-- ─────────────────────────────────────────────────────────────────────────────

create or replace function public.kp_is_content_editor()
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public
as $function$
    select exists (
        select 1
        from public.profiles p
        where p.id = auth.uid()
          and p.role in ('owner', 'admin', 'editor')
    )
$function$;

comment on function public.kp_is_content_editor() is
    'RLS-only role predicate for frozen Knowledge Platform content mutation scope.';

create or replace function public.kp_is_staff()
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public
as $function$
    select exists (
        select 1
        from public.profiles p
        where p.id = auth.uid()
          and p.role in ('owner', 'admin', 'editor', 'support')
    )
$function$;

comment on function public.kp_is_staff() is
    'RLS-only role predicate for frozen Knowledge Platform staff preview scope.';

create or replace function public.kp_can_read_package_summary(
    target_package_id uuid,
    target_summary_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public
as $function$
    select exists (
        select 1
        from public.package_summaries ps
        join public.packages p on p.id = ps.package_id
        join public.summaries s on s.id = ps.summary_id
        where ps.package_id = target_package_id
          and ps.summary_id = target_summary_id
          and ps.status = 'active'
          and p.is_published = true
          and s.lifecycle_status = 'active'
          and (
              s.visibility = 'public_indexable'
              or (
                  s.visibility = 'authenticated'
                  and auth.uid() is not null
              )
              or (
                  s.visibility = 'product_entitled'
                  and auth.uid() is not null
                  and exists (
                      select 1
                      from public.orders o
                      where o.user_id = auth.uid()
                        and o.package_id = ps.package_id
                        and o.status = 'completed'
                  )
              )
          )
    )
$function$;

comment on function public.kp_can_read_package_summary(uuid, uuid) is
    'RLS-only predicate for an active placement under a published Package with public, authenticated, or completed-order access.';

create or replace function public.kp_can_read_summary_version(
    target_summary_id uuid,
    target_version_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public
as $function$
    select exists (
        select 1
        from public.summary_versions sv
        join public.summaries s on s.id = sv.summary_id
        join public.package_summaries ps on ps.summary_id = sv.summary_id
        where sv.summary_id = target_summary_id
          and sv.id = target_version_id
          and sv.status = 'published'
          and (
              (
                  ps.version_policy = 'latest_published'
                  and s.current_published_version_id = sv.id
              )
              or (
                  ps.version_policy = 'pinned'
                  and ps.pinned_summary_version_id = sv.id
              )
          )
          and public.kp_can_read_package_summary(ps.package_id, ps.summary_id)
    )
$function$;

comment on function public.kp_can_read_summary_version(uuid, uuid) is
    'RLS-only predicate that exposes exactly a published revision resolved by an accessible active Package placement.';

revoke all on function public.kp_is_content_editor()
    from public;
revoke all on function public.kp_is_staff()
    from public;
revoke all on function public.kp_can_read_package_summary(uuid, uuid)
    from public;
revoke all on function public.kp_can_read_summary_version(uuid, uuid)
    from public;

grant execute on function public.kp_is_content_editor()
    to authenticated;
grant execute on function public.kp_is_staff()
    to authenticated;
grant execute on function public.kp_can_read_package_summary(uuid, uuid)
    to anon, authenticated;
grant execute on function public.kp_can_read_summary_version(uuid, uuid)
    to anon, authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- Grants remain narrower than service_role
-- ─────────────────────────────────────────────────────────────────────────────

grant select, insert, update
    on table
        public.reference_documents,
        public.reference_document_versions,
        public.reference_document_aliases,
        public.summary_versions,
        public.summary_aliases,
        public.summary_reference_documents,
        public.summary_version_reference_documents,
        public.package_summaries
    to authenticated;

grant select
    on table
        public.summary_versions,
        public.package_summaries
    to anon;

revoke delete
    on table
        public.reference_documents,
        public.reference_document_versions,
        public.reference_document_aliases,
        public.summary_versions,
        public.summary_aliases,
        public.summary_reference_documents,
        public.summary_version_reference_documents,
        public.package_summaries
    from anon, authenticated;

revoke insert, update
    on table
        public.reference_documents,
        public.reference_document_versions,
        public.reference_document_aliases,
        public.summary_versions,
        public.summary_aliases,
        public.summary_reference_documents,
        public.summary_version_reference_documents,
        public.package_summaries
    from anon;

-- ─────────────────────────────────────────────────────────────────────────────
-- Staff preview and editor mutation policies
-- ─────────────────────────────────────────────────────────────────────────────

do $kp_rls_install_staff_policies$
declare
    expected record;
begin
    for expected in
        select table_name
        from (values
            ('reference_documents'),
            ('reference_document_versions'),
            ('reference_document_aliases'),
            ('summary_versions'),
            ('summary_aliases'),
            ('summary_reference_documents'),
            ('summary_version_reference_documents'),
            ('package_summaries')
        ) as target(table_name)
    loop
        execute format(
            'create policy kp_staff_preview on public.%I for select to authenticated using (public.kp_is_staff())',
            expected.table_name
        );
        execute format(
            'create policy kp_editor_insert on public.%I for insert to authenticated with check (public.kp_is_content_editor())',
            expected.table_name
        );
        execute format(
            'create policy kp_editor_update on public.%I for update to authenticated using (public.kp_is_content_editor()) with check (public.kp_is_content_editor())',
            expected.table_name
        );
    end loop;
end
$kp_rls_install_staff_policies$;

-- Public base reads are deliberately limited to placement metadata and the
-- exact resolved published SummaryVersion. Every other public target read is
-- deferred to the later security-aware projection/resolver migration.
create policy kp_accessible_package_summary
    on public.package_summaries
    for select
    to anon, authenticated
    using (
        public.kp_can_read_package_summary(package_id, summary_id)
    );

create policy kp_accessible_summary_version
    on public.summary_versions
    for select
    to anon, authenticated
    using (
        public.kp_can_read_summary_version(summary_id, id)
    );

-- ─────────────────────────────────────────────────────────────────────────────
-- Fail-closed postconditions
-- ─────────────────────────────────────────────────────────────────────────────

do $kp_rls_assertions$
declare
    expected record;
    policy_count integer;
begin
    for expected in
        select table_name, expected_policy_count
        from (values
            ('reference_documents', 3),
            ('reference_document_versions', 3),
            ('reference_document_aliases', 3),
            ('summary_versions', 4),
            ('summary_aliases', 3),
            ('summary_reference_documents', 3),
            ('summary_version_reference_documents', 3),
            ('package_summaries', 4)
        ) as target(table_name, expected_policy_count)
    loop
        select count(*)
        into policy_count
        from pg_policies p
        where p.schemaname = 'public'
          and p.tablename = expected.table_name;

        if policy_count <> expected.expected_policy_count then
            raise exception using
                errcode = 'check_violation',
                message = format(
                    'Knowledge Platform migration 046 drift: public.%I has %s policies; expected %s.',
                    expected.table_name,
                    policy_count,
                    expected.expected_policy_count
                );
        end if;

        if not exists (
            select 1
            from pg_policies p
            where p.schemaname = 'public'
              and p.tablename = expected.table_name
              and p.policyname = 'kp_staff_preview'
              and p.cmd = 'SELECT'
        ) or not exists (
            select 1
            from pg_policies p
            where p.schemaname = 'public'
              and p.tablename = expected.table_name
              and p.policyname = 'kp_editor_insert'
              and p.cmd = 'INSERT'
        ) or not exists (
            select 1
            from pg_policies p
            where p.schemaname = 'public'
              and p.tablename = expected.table_name
              and p.policyname = 'kp_editor_update'
              and p.cmd = 'UPDATE'
        ) then
            raise exception using
                errcode = 'check_violation',
                message = format(
                    'Knowledge Platform migration 046 drift: staff/editor policies are incomplete on public.%I.',
                    expected.table_name
                );
        end if;

        if has_table_privilege('anon', 'public.' || expected.table_name, 'INSERT')
           or has_table_privilege('anon', 'public.' || expected.table_name, 'UPDATE')
           or has_table_privilege('anon', 'public.' || expected.table_name, 'DELETE')
           or has_table_privilege('authenticated', 'public.' || expected.table_name, 'DELETE')
        then
            raise exception using
                errcode = 'check_violation',
                message = format(
                    'Knowledge Platform migration 046 drift: destructive or anonymous mutation grant exists on public.%I.',
                    expected.table_name
                );
        end if;

        if not has_table_privilege('authenticated', 'public.' || expected.table_name, 'SELECT')
           or not has_table_privilege('authenticated', 'public.' || expected.table_name, 'INSERT')
           or not has_table_privilege('authenticated', 'public.' || expected.table_name, 'UPDATE')
        then
            raise exception using
                errcode = 'check_violation',
                message = format(
                    'Knowledge Platform migration 046 drift: authenticated policy grants are incomplete on public.%I.',
                    expected.table_name
                );
        end if;
    end loop;

    if not has_table_privilege('anon', 'public.summary_versions', 'SELECT')
       or not has_table_privilege('anon', 'public.package_summaries', 'SELECT')
    then
        raise exception using
            errcode = 'check_violation',
            message = 'Knowledge Platform migration 046 drift: bounded public base-read grants are missing.';
    end if;

    for expected in
        select table_name
        from (values
            ('reference_documents'),
            ('reference_document_versions'),
            ('reference_document_aliases'),
            ('summary_aliases'),
            ('summary_reference_documents'),
            ('summary_version_reference_documents')
        ) as private_target(table_name)
    loop
        if has_table_privilege('anon', 'public.' || expected.table_name, 'SELECT') then
            raise exception using
                errcode = 'check_violation',
                message = format(
                    'Knowledge Platform migration 046 drift: anon can read private base table public.%I.',
                    expected.table_name
                );
        end if;
    end loop;

    if not exists (
        select 1
        from pg_policies p
        where p.schemaname = 'public'
          and p.tablename = 'package_summaries'
          and p.policyname = 'kp_accessible_package_summary'
          and p.cmd = 'SELECT'
    ) or not exists (
        select 1
        from pg_policies p
        where p.schemaname = 'public'
          and p.tablename = 'summary_versions'
          and p.policyname = 'kp_accessible_summary_version'
          and p.cmd = 'SELECT'
    ) then
        raise exception using
            errcode = 'check_violation',
            message = 'Knowledge Platform migration 046 drift: entitlement-aware base-read policies are missing.';
    end if;

    if has_schema_privilege('anon', 'kp_migration', 'USAGE')
       or has_schema_privilege('authenticated', 'kp_migration', 'USAGE')
    then
        raise exception using
            errcode = 'check_violation',
            message = 'Knowledge Platform migration 046 drift: migration-control schema became client-accessible.';
    end if;

    if not exists (
        select 1
        from pg_proc p
        join pg_namespace n on n.oid = p.pronamespace
        where n.nspname = 'public'
          and p.proname = 'kp_can_read_summary_version'
          and p.prosecdef
          and p.proconfig @> array['search_path=pg_catalog, public']::text[]
    ) then
        raise exception using
            errcode = 'check_violation',
            message = 'Knowledge Platform migration 046 drift: summary-version access predicate is missing or not security hardened.';
    end if;

    -- Validate the grants required by the policies. Whether anon has an
    -- otherwise harmless effective EXECUTE on the two boolean role predicates
    -- can vary with platform default/inherited function privileges; those
    -- predicates return false without an authenticated staff profile, and the
    -- staff/editor policies themselves are scoped TO authenticated. Treating
    -- that effective privilege as architecture drift caused a false failure
    -- after successful helper creation and grants.
    if not has_function_privilege('authenticated', 'public.kp_is_staff()', 'EXECUTE')
       or not has_function_privilege('authenticated', 'public.kp_is_content_editor()', 'EXECUTE')
       or not has_function_privilege('anon', 'public.kp_can_read_package_summary(uuid, uuid)', 'EXECUTE')
       or not has_function_privilege('anon', 'public.kp_can_read_summary_version(uuid, uuid)', 'EXECUTE')
    then
        raise exception using
            errcode = 'check_violation',
            message = 'Knowledge Platform migration 046 drift: helper execution grants violate the frozen boundary.';
    end if;
end
$kp_rls_assertions$;

do $kp_rls_complete$
begin
    raise notice 'Knowledge Platform migration 046 complete: target RLS foundation installed; legacy authority and data unchanged.';
end
$kp_rls_complete$;

notify pgrst, 'reload schema';
