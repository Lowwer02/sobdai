-- 058_kp_restrict_direct_writes.sql
-- Sobdai Knowledge Platform — coexistence writer-boundary enforcement.
--
-- Migration-number audit
-- ----------------------
-- Knowledge Platform migration 057 is the highest deployed KP migration.
-- Repository migrations 062+ belong to unrelated product areas and do not
-- consume the frozen Knowledge Platform identities. This file therefore
-- implements frozen responsibility 058 exactly.
--
-- Purpose
-- -------
-- Enforce the Phase 4 single-writer rule after the D2 dual-write Application
-- Service has completed its soak. Browser roles and direct service-role table
-- mutations are removed from the Summary aggregate boundary. Approved 057
-- SECURITY DEFINER commands remain the only application write path; a
-- superuser/database owner remains available for controlled migration work.
--
-- Deployment precondition
-- ----------------------
-- The operator must deploy this migration only after kp_dual_write_summary
-- and kp_dual_write_publish are enabled in the server-side Application Layer,
-- the dual-write reconciliation gate reports zero unexplained drift, and the
-- short Summary editorial freeze is active. Flags are application-owned and
-- are deliberately not stored or toggled by SQL here. Target-only reuse and
-- target-authority flags remain off.
--
-- Scope boundary
-- --------------
-- * No tables, columns, indexes, domain rows, migration-ledger rows, or
--   feature-flag storage are created or changed.
-- * The protected aggregate is the legacy Summary root plus its target
--   revisions, aliases, live/snapshot source relations, and PackageSummary
--   placements. ReferenceDocument roots/versions/aliases remain under their
--   existing editor/operator policy because 057 deliberately exposes no
--   ReferenceDocument persistence command.
-- * Read policies and grants remain intact. Only direct client mutation
--   policies/privileges are removed.
-- * The trigger is SECURITY INVOKER. It never trusts a browser or a direct
--   service-role table write merely because that role bypasses RLS; approved
--   057 functions run as their owner and are explicitly recognized.
-- * Reconciliation is catalog-only. It reports policy, privilege, RLS, and
--   trigger state without reading or mutating domain data.
--
-- Rollback
-- --------
-- Drain in-flight commands, restore the prior direct-write policy only through
-- an approved forward compensating migration, and then disable the dual-write
-- flags. Do not down-migrate a committed writer-policy decision.

set local lock_timeout = '5s';

-- ─────────────────────────────────────────────────────────────────────────────
-- Fail closed on the frozen coexistence dependency surface. This block is
-- catalog-only and never invokes a persistence function or touches a row.
-- ─────────────────────────────────────────────────────────────────────────────

do $kp_restrict_direct_writes_preflight$
declare
    expected record;
    v_function oid;
begin
    for expected in
        select table_name
        from (values
            ('summaries'),
            ('summary_versions'),
            ('summary_aliases'),
            ('summary_reference_documents'),
            ('summary_version_reference_documents'),
            ('package_summaries')
        ) as protected(table_name)
    loop
        if to_regclass('public.' || expected.table_name) is null then
            raise exception using
                errcode = 'check_violation',
                message = format(
                    'Knowledge Platform migration 058 prerequisite is missing: public.%I.',
                    expected.table_name
                );
        end if;

        if not exists (
            select 1
            from pg_catalog.pg_class c
            join pg_catalog.pg_namespace n on n.oid = c.relnamespace
            where n.nspname = 'public'
              and c.relname = expected.table_name
              and c.relkind = 'r'
              and c.relrowsecurity
        ) then
            raise exception using
                errcode = 'check_violation',
                message = format(
                    'Knowledge Platform migration 058 requires RLS on public.%I.',
                    expected.table_name
                );
        end if;
    end loop;

    if to_regclass('public.profiles') is null then
        raise exception using
            errcode = 'check_violation',
            message = 'Knowledge Platform migration 058 requires public.profiles for the frozen Summary boundary.';
    end if;

    if to_regprocedure('public.kp_can_read_package_summary(uuid,uuid)') is null
       or to_regprocedure('public.kp_can_read_summary_version(uuid,uuid)') is null
       or to_regprocedure('public.kp_read_summary_route(text,text)') is null
    then
        raise exception using
            errcode = 'check_violation',
            message = 'Knowledge Platform migration 058 requires the frozen 046 access predicates and 056 read resolver.';
    end if;

    for expected in
        select function_name
        from (values
            ('public.kp_persist_require_actor(uuid)'),
            ('public.kp_persist_create_compatibility_summary(uuid,text,text,text,text,text,text,text,uuid,text,text,text,integer,text,text,text,uuid,uuid,integer,integer,text)'),
            ('public.kp_persist_update_compatibility_draft(uuid,uuid,text,text,text,text,text,text,uuid,text,text,text,integer,text,text,text,uuid,integer,integer,text)'),
            ('public.kp_persist_publish_compatibility_revision(uuid,uuid,uuid,jsonb)'),
            ('public.kp_persist_retire_compatibility_revision(uuid,uuid,uuid,text,uuid)'),
            ('public.kp_persist_reassign_compatibility_package(uuid,uuid,text,uuid)'),
            ('public.kp_persist_replace_summary_sources(uuid,jsonb,uuid)'),
            ('public.kp_persist_attach_package_summary(uuid,uuid,text,text,uuid,integer,integer,timestamptz,text,text,uuid)'),
            ('public.kp_persist_detach_package_summary(uuid,uuid,uuid)'),
            ('public.kp_persist_register_summary_alias(uuid,text,text,text,uuid)')
        ) as required(function_name)
    loop
        v_function := to_regprocedure(expected.function_name);
        if v_function is null then
            raise exception using
                errcode = 'check_violation',
                message = format(
                    'Knowledge Platform migration 058 requires the 057 persistence function %s.',
                    expected.function_name
                );
        end if;

        if not exists (
            select 1
            from pg_catalog.pg_proc p
            where p.oid = v_function
              and p.prosecdef
              and array_to_string(p.proconfig, ',') ilike '%search_path=pg_catalog, public, pg_temp%'
              and array_to_string(p.proconfig, ',') ilike '%lock_timeout=5s%'
        ) then
            raise exception using
                errcode = 'check_violation',
                message = format(
                    'Knowledge Platform migration 058 requires a locked SECURITY DEFINER persistence function: %s.',
                    expected.function_name
                );
        end if;

        if has_function_privilege('public', v_function, 'EXECUTE')
           or has_function_privilege('anon', v_function, 'EXECUTE')
           or has_function_privilege('authenticated', v_function, 'EXECUTE')
           or not has_function_privilege('service_role', v_function, 'EXECUTE')
        then
            raise exception using
                errcode = 'check_violation',
                message = format(
                    'Knowledge Platform migration 058 requires service-role-only persistence execution: %s.',
                    expected.function_name
                );
        end if;
    end loop;
end
$kp_restrict_direct_writes_preflight$;

-- ─────────────────────────────────────────────────────────────────────────────
-- Shared writer fence. It is deliberately SECURITY INVOKER: direct table
-- callers must be identifiable, while 057 SECURITY DEFINER commands execute
-- under their trusted owner and remain atomic across the protected aggregate.
-- ─────────────────────────────────────────────────────────────────────────────

create or replace function public.kp_enforce_summary_writer_boundary()
returns trigger
language plpgsql
security invoker
set search_path = pg_catalog, public, pg_temp
set lock_timeout = '5s'
as $function$
declare
    v_is_superuser boolean := false;
    v_is_approved_api_owner boolean := false;
begin
    -- RLS bypass is not writer authorization. Direct browser and service-role
    -- table writes must fail even when the role can otherwise bypass RLS.
    if current_user in ('public', 'anon', 'authenticated', 'service_role') then
        raise exception using
            errcode = 'insufficient_privilege',
            message = 'Direct Summary mutations are disabled; use the approved transactional persistence API.';
    end if;

    select coalesce(r.rolsuper, false)
           or exists (
               select 1
               from pg_catalog.pg_database d
               where d.datname = current_database()
                 and pg_catalog.pg_get_userbyid(d.datdba) = current_user
           )
    into v_is_superuser
    from pg_catalog.pg_roles r
    where r.rolname = current_user;

    if not v_is_superuser then
        select exists (
            select 1
            from pg_catalog.pg_proc p
            join pg_catalog.pg_namespace n on n.oid = p.pronamespace
            where n.nspname = 'public'
              and p.oid in (
                  to_regprocedure('public.kp_persist_require_actor(uuid)'),
                  to_regprocedure('public.kp_persist_create_compatibility_summary(uuid,text,text,text,text,text,text,text,uuid,text,text,text,integer,text,text,text,uuid,uuid,integer,integer,text)'),
                  to_regprocedure('public.kp_persist_update_compatibility_draft(uuid,uuid,text,text,text,text,text,text,uuid,text,text,text,integer,text,text,text,uuid,integer,integer,text)'),
                  to_regprocedure('public.kp_persist_publish_compatibility_revision(uuid,uuid,uuid,jsonb)'),
                  to_regprocedure('public.kp_persist_retire_compatibility_revision(uuid,uuid,uuid,text,uuid)'),
                  to_regprocedure('public.kp_persist_reassign_compatibility_package(uuid,uuid,text,uuid)'),
                  to_regprocedure('public.kp_persist_replace_summary_sources(uuid,jsonb,uuid)'),
                  to_regprocedure('public.kp_persist_attach_package_summary(uuid,uuid,text,text,uuid,integer,integer,timestamptz,text,text,uuid)'),
                  to_regprocedure('public.kp_persist_detach_package_summary(uuid,uuid,uuid)'),
                  to_regprocedure('public.kp_persist_register_summary_alias(uuid,text,text,text,uuid)')
              )
              and p.prosecdef
              and pg_catalog.pg_get_userbyid(p.proowner) = current_user
              and array_to_string(p.proconfig, ',') ilike '%search_path=pg_catalog, public, pg_temp%'
              and array_to_string(p.proconfig, ',') ilike '%lock_timeout=5s%'
        )
        into v_is_approved_api_owner;
    end if;

    if not v_is_superuser and not v_is_approved_api_owner then
        raise exception using
            errcode = 'insufficient_privilege',
            message = 'Direct Summary mutations are disabled; use the approved transactional persistence API or a controlled migration operator.';
    end if;

    if tg_op = 'DELETE' then
        return old;
    end if;
    return new;
end
$function$;

comment on function public.kp_enforce_summary_writer_boundary() is
    'SECURITY INVOKER single-writer fence for the Summary aggregate. Browser and direct service-role table writes are denied; approved 057 SECURITY DEFINER commands and controlled migration operators remain allowed.';

revoke all on function public.kp_enforce_summary_writer_boundary()
    from public, anon, authenticated;
grant execute on function public.kp_enforce_summary_writer_boundary()
    to service_role;

-- ─────────────────────────────────────────────────────────────────────────────
-- Install the fence across the legacy root and target-owned Summary tables.
-- ReferenceDocument roots/versions/aliases remain on their existing aggregate
-- policy; 057 has no ReferenceDocument command in the approved writer API.
-- ─────────────────────────────────────────────────────────────────────────────

drop trigger if exists kp_single_writer_boundary on public.summaries;
create trigger kp_single_writer_boundary
    before insert or update or delete on public.summaries
    for each row execute function public.kp_enforce_summary_writer_boundary();

drop trigger if exists kp_single_writer_boundary on public.summary_versions;
create trigger kp_single_writer_boundary
    before insert or update or delete on public.summary_versions
    for each row execute function public.kp_enforce_summary_writer_boundary();

drop trigger if exists kp_single_writer_boundary on public.summary_aliases;
create trigger kp_single_writer_boundary
    before insert or update or delete on public.summary_aliases
    for each row execute function public.kp_enforce_summary_writer_boundary();

drop trigger if exists kp_single_writer_boundary on public.summary_reference_documents;
create trigger kp_single_writer_boundary
    before insert or update or delete on public.summary_reference_documents
    for each row execute function public.kp_enforce_summary_writer_boundary();

drop trigger if exists kp_single_writer_boundary on public.summary_version_reference_documents;
create trigger kp_single_writer_boundary
    before insert or update or delete on public.summary_version_reference_documents
    for each row execute function public.kp_enforce_summary_writer_boundary();

drop trigger if exists kp_single_writer_boundary on public.package_summaries;
create trigger kp_single_writer_boundary
    before insert or update or delete on public.package_summaries
    for each row execute function public.kp_enforce_summary_writer_boundary();

-- ─────────────────────────────────────────────────────────────────────────────
-- Remove browser mutation policies while preserving all read policies. The
-- explicit privilege revocation also closes direct service/API REST table
-- paths; the approved 057 functions retain their owner rights and RPC grants.
-- ─────────────────────────────────────────────────────────────────────────────

drop policy if exists "Admins can manage summaries." on public.summaries;
drop policy if exists "Content managers can manage summaries." on public.summaries;

drop policy if exists kp_editor_insert on public.summary_versions;
drop policy if exists kp_editor_update on public.summary_versions;
drop policy if exists kp_editor_insert on public.summary_aliases;
drop policy if exists kp_editor_update on public.summary_aliases;
drop policy if exists kp_editor_insert on public.summary_reference_documents;
drop policy if exists kp_editor_update on public.summary_reference_documents;
drop policy if exists kp_editor_insert on public.summary_version_reference_documents;
drop policy if exists kp_editor_update on public.summary_version_reference_documents;
drop policy if exists kp_editor_insert on public.package_summaries;
drop policy if exists kp_editor_update on public.package_summaries;

revoke insert, update, delete, truncate
    on table
        public.summaries,
        public.summary_versions,
        public.summary_aliases,
        public.summary_reference_documents,
        public.summary_version_reference_documents,
        public.package_summaries
    from public, anon, authenticated;

-- The service role can execute the approved RPCs, but direct table writes still
-- hit the SECURITY INVOKER fence. Explicit grants preserve the owner/API path
-- without reopening a PostgREST table mutation surface for browser roles.
grant select, insert, update, delete
    on table
        public.summaries,
        public.summary_versions,
        public.summary_aliases,
        public.summary_reference_documents,
        public.summary_version_reference_documents,
        public.package_summaries
    to service_role;

-- ─────────────────────────────────────────────────────────────────────────────
-- Catalog-only reconciliation helper for deployment smoke tests and periodic
-- operational checks. It never reads domain rows and is service-role-only.
-- ─────────────────────────────────────────────────────────────────────────────

create or replace function public.kp_reconcile_writer_boundary()
returns jsonb
language sql
stable
security definer
set search_path = pg_catalog, public, pg_temp
set lock_timeout = '5s'
as $function$
with protected(table_name) as (
    values
        ('summaries'::text),
        ('summary_versions'::text),
        ('summary_aliases'::text),
        ('summary_reference_documents'::text),
        ('summary_version_reference_documents'::text),
        ('package_summaries'::text)
),
status as (
    select
        p.table_name,
        exists (
            select 1
            from pg_catalog.pg_class c
            join pg_catalog.pg_namespace n on n.oid = c.relnamespace
            where n.nspname = 'public'
              and c.relname = p.table_name
              and c.relkind = 'r'
              and c.relrowsecurity
        ) as rls_enabled,
        exists (
            select 1
            from pg_catalog.pg_trigger t
            join pg_catalog.pg_class c on c.oid = t.tgrelid
            join pg_catalog.pg_namespace n on n.oid = c.relnamespace
            where n.nspname = 'public'
              and c.relname = p.table_name
              and t.tgname = 'kp_single_writer_boundary'
              and not t.tgisinternal
        ) as trigger_present,
        (
            select count(*)
            from pg_catalog.pg_policies policy
            where policy.schemaname = 'public'
              and policy.tablename = p.table_name
              and policy.cmd in ('INSERT', 'UPDATE', 'DELETE', 'ALL')
              and policy.roles && array['public', 'anon', 'authenticated']::name[]
        )::integer as client_mutation_policy_count,
        (
            case when has_table_privilege('anon', 'public.' || p.table_name, 'INSERT') then 1 else 0 end
            + case when has_table_privilege('anon', 'public.' || p.table_name, 'UPDATE') then 1 else 0 end
            + case when has_table_privilege('anon', 'public.' || p.table_name, 'DELETE') then 1 else 0 end
            + case when has_table_privilege('authenticated', 'public.' || p.table_name, 'INSERT') then 1 else 0 end
            + case when has_table_privilege('authenticated', 'public.' || p.table_name, 'UPDATE') then 1 else 0 end
            + case when has_table_privilege('authenticated', 'public.' || p.table_name, 'DELETE') then 1 else 0 end
        )::integer as client_mutation_privilege_count
    from protected p
)
select jsonb_build_object(
    'migration', '058',
    'boundary', 'summary_single_writer',
    'protected_tables', coalesce(
        (
            select jsonb_agg(
                jsonb_build_object(
                    'table', s.table_name,
                    'rls_enabled', s.rls_enabled,
                    'trigger_present', s.trigger_present,
                    'client_mutation_policy_count', s.client_mutation_policy_count,
                    'client_mutation_privilege_count', s.client_mutation_privilege_count
                )
                order by s.table_name
            )
            from status s
        ),
        '[]'::jsonb
    ),
    'mismatch_count', coalesce(
        (
            select sum(
                case
                    when not s.rls_enabled
                      or not s.trigger_present
                      or s.client_mutation_policy_count <> 0
                      or s.client_mutation_privilege_count <> 0
                    then 1
                    else 0
                end
            )
            from status s
        ),
        0
    ),
    'api_function_service_role_only', not has_function_privilege(
        'public',
        'public.kp_reconcile_writer_boundary()',
        'EXECUTE'
    ) and has_function_privilege(
        'service_role',
        'public.kp_reconcile_writer_boundary()',
        'EXECUTE'
    ),
    'scope', 'catalog-only'
);
$function$;

comment on function public.kp_reconcile_writer_boundary() is
    'Catalog-only 058 writer-boundary reconciliation. Reports RLS, trigger, client mutation-policy, and client privilege state without reading domain rows.';

revoke all on function public.kp_reconcile_writer_boundary()
    from public, anon, authenticated;
grant execute on function public.kp_reconcile_writer_boundary()
    to service_role;

-- ─────────────────────────────────────────────────────────────────────────────
-- Fail-closed postconditions. These checks assert the policy/privilege switch
-- and preserve read access; they do not execute any business command.
-- ─────────────────────────────────────────────────────────────────────────────

do $kp_restrict_direct_writes_assertions$
declare
    expected record;
    v_guard oid;
    v_reconcile oid;
begin
    for expected in
        select table_name
        from (values
            ('summaries'),
            ('summary_versions'),
            ('summary_aliases'),
            ('summary_reference_documents'),
            ('summary_version_reference_documents'),
            ('package_summaries')
        ) as protected(table_name)
    loop
        if not exists (
            select 1
            from pg_catalog.pg_class c
            join pg_catalog.pg_namespace n on n.oid = c.relnamespace
            where n.nspname = 'public'
              and c.relname = expected.table_name
              and c.relkind = 'r'
              and c.relrowsecurity
        ) then
            raise exception using
                errcode = 'check_violation',
                message = format(
                    'Knowledge Platform migration 058 failed: RLS is not enabled on public.%I.',
                    expected.table_name
                );
        end if;

        if not exists (
            select 1
            from pg_catalog.pg_trigger t
            join pg_catalog.pg_class c on c.oid = t.tgrelid
            join pg_catalog.pg_namespace n on n.oid = c.relnamespace
            where n.nspname = 'public'
              and c.relname = expected.table_name
              and t.tgname = 'kp_single_writer_boundary'
              and not t.tgisinternal
        ) then
            raise exception using
                errcode = 'check_violation',
                message = format(
                    'Knowledge Platform migration 058 failed: writer fence is missing on public.%I.',
                    expected.table_name
                );
        end if;

        if exists (
            select 1
            from pg_catalog.pg_policies policy
            where policy.schemaname = 'public'
              and policy.tablename = expected.table_name
              and policy.cmd in ('INSERT', 'UPDATE', 'DELETE', 'ALL')
              and policy.roles && array['public', 'anon', 'authenticated']::name[]
        ) then
            raise exception using
                errcode = 'check_violation',
                message = format(
                    'Knowledge Platform migration 058 failed: a client mutation policy remains on public.%I.',
                    expected.table_name
                );
        end if;

        if has_table_privilege('anon', 'public.' || expected.table_name, 'INSERT')
           or has_table_privilege('anon', 'public.' || expected.table_name, 'UPDATE')
           or has_table_privilege('anon', 'public.' || expected.table_name, 'DELETE')
           or has_table_privilege('authenticated', 'public.' || expected.table_name, 'INSERT')
           or has_table_privilege('authenticated', 'public.' || expected.table_name, 'UPDATE')
           or has_table_privilege('authenticated', 'public.' || expected.table_name, 'DELETE')
        then
            raise exception using
                errcode = 'check_violation',
                message = format(
                    'Knowledge Platform migration 058 failed: a client mutation privilege remains on public.%I.',
                    expected.table_name
                );
        end if;

        if not has_table_privilege('service_role', 'public.' || expected.table_name, 'SELECT')
           or not has_table_privilege('service_role', 'public.' || expected.table_name, 'INSERT')
           or not has_table_privilege('service_role', 'public.' || expected.table_name, 'UPDATE')
           or not has_table_privilege('service_role', 'public.' || expected.table_name, 'DELETE')
        then
            raise exception using
                errcode = 'check_violation',
                message = format(
                    'Knowledge Platform migration 058 failed: approved service-role API grants are missing on public.%I.',
                    expected.table_name
                );
        end if;
    end loop;

    v_guard := to_regprocedure('public.kp_enforce_summary_writer_boundary()');
    if v_guard is null
       or exists (
           select 1
           from pg_catalog.pg_proc p
           where p.oid = v_guard
             and p.prosecdef
       )
       or not exists (
           select 1
           from pg_catalog.pg_proc p
           where p.oid = v_guard
             and array_to_string(p.proconfig, ',') ilike '%search_path=pg_catalog, public, pg_temp%'
             and array_to_string(p.proconfig, ',') ilike '%lock_timeout=5s%'
       )
       or has_function_privilege('public', v_guard, 'EXECUTE')
       or has_function_privilege('anon', v_guard, 'EXECUTE')
       or has_function_privilege('authenticated', v_guard, 'EXECUTE')
       or not has_function_privilege('service_role', v_guard, 'EXECUTE')
    then
        raise exception using
            errcode = 'check_violation',
            message = 'Knowledge Platform migration 058 writer fence is not SECURITY INVOKER and least-privilege locked.';
    end if;

    v_reconcile := to_regprocedure('public.kp_reconcile_writer_boundary()');
    if v_reconcile is null
       or not exists (
           select 1
           from pg_catalog.pg_proc p
           where p.oid = v_reconcile
             and p.prosecdef
             and p.provolatile = 's'
             and array_to_string(p.proconfig, ',') ilike '%search_path=pg_catalog, public, pg_temp%'
             and array_to_string(p.proconfig, ',') ilike '%lock_timeout=5s%'
       )
       or has_function_privilege('public', v_reconcile, 'EXECUTE')
       or has_function_privilege('anon', v_reconcile, 'EXECUTE')
       or has_function_privilege('authenticated', v_reconcile, 'EXECUTE')
       or not has_function_privilege('service_role', v_reconcile, 'EXECUTE')
    then
        raise exception using
            errcode = 'check_violation',
            message = 'Knowledge Platform migration 058 reconciliation helper grants or hardening are incorrect.';
    end if;
end
$kp_restrict_direct_writes_assertions$;

-- PostgREST must see the policy/function boundary after deployment. The
-- application-owned dual-write flags remain unchanged and are not persisted.
notify pgrst, 'reload schema';
