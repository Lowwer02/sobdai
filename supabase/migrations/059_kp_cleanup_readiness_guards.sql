-- 059_kp_cleanup_readiness_guards.sql
-- Sobdai Knowledge Platform — legacy-cleanup readiness gate.
--
-- Migration-number audit
-- ----------------------
-- Knowledge Platform migration 058 is the highest deployed KP migration.
-- Repository migrations 062+ belong to unrelated product areas and do not
-- consume the frozen Knowledge Platform identities. This file therefore
-- implements frozen responsibility 059 exactly.
--
-- Purpose
-- -------
-- Install the fail-closed evidence surface that migration 060 must call
-- before removing legacy Summary authority. The gate reports target/legacy
-- parity, migration-ledger completion, final-index health, the 058 writer
-- boundary, and catalog dependencies. A separate assertion requires explicit
-- operator attestations for target authority, rollback-window closure,
-- target-only approval, and zero legacy application dependency.
--
-- Deployment precondition
-- ----------------------
-- This migration is safe to install before cleanup. It does not assert or
-- toggle application-owned flags during deployment. Migration 060 must invoke
-- kp_migration.assert_cleanup_readiness(...) with evidence collected from the
-- D3/D4 rollout, and the call must succeed before any destructive operation.
--
-- Scope boundary
-- --------------
-- * No domain tables, columns, indexes, rows, or policies are created,
--   removed, or changed. The assigned cleanup write-fence trigger is the only
--   Summary trigger installed here; it makes legacy Summary authority
--   read-only for non-operator sessions.
-- * The reconciliation helpers are read-only and service-role-only. They do
--   not repair data, advance a ledger, remove a writer fence, or perform
--   cutover.
-- * The 058 single-writer fence is asserted, not replaced. This migration adds
--   the separate cleanup fence that rejects legacy-field mutation after the
--   rollback window; target-owned fields remain writable through the approved
--   Application Layer path.
-- * Feature flags are server-side Application Layer state. Boolean arguments
--   and a non-empty operator attestation are deliberately supplied at the
--   assertion boundary instead of inventing database flag storage.
-- * Target-only Summary/Package states are reported for audit but do not fail
--   the gate when target-only approval is explicitly attested.
--
-- Rollback
-- --------
-- Leave the read-only gate installed. If cleanup readiness is not approved,
-- do not call the assertion. Any later removal of this gate is a forward
-- compatibility decision owned by migration 061.

set local lock_timeout = '5s';

-- ─────────────────────────────────────────────────────────────────────────────
-- Fail closed on the frozen 058, ledger, projection, and reconciliation
-- surface. This block is catalog-only and never invokes a domain command.
-- ─────────────────────────────────────────────────────────────────────────────

do $kp_cleanup_readiness_preflight$
declare
    expected record;
    v_function oid;
begin
    for expected in
        select relation_name
        from (values
            ('kp_migration.migration_runs'),
            ('kp_migration.summary_ledger'),
            ('kp_migration.batch_progress'),
            ('public.summaries'),
            ('public.package_summaries'),
            ('public.summary_versions'),
            ('public.summary_aliases')
        ) as required(relation_name)
    loop
        if to_regclass(expected.relation_name) is null then
            raise exception using
                errcode = 'check_violation',
                message = format(
                    'Knowledge Platform migration 059 prerequisite is missing: %s.',
                    expected.relation_name
                );
        end if;
    end loop;

    for expected in
        select relation_name
        from (values
            ('kp_read_admin_library'),
            ('kp_read_summary_picker'),
            ('kp_read_package_summaries'),
            ('kp_read_news_summaries'),
            ('kp_read_recommendation_store')
        ) as required(relation_name)
    loop
        if not exists (
            select 1
            from pg_catalog.pg_class c
            join pg_catalog.pg_namespace n on n.oid = c.relnamespace
            where n.nspname = 'public'
              and c.relname = expected.relation_name
              and c.relkind = 'v'
        ) then
            raise exception using
                errcode = 'check_violation',
                message = format(
                    'Knowledge Platform migration 059 requires read projection public.%I.',
                    expected.relation_name
                );
        end if;
    end loop;

    for expected in
        select function_name
        from (values
            ('public.kp_read_summary_route(text,text)'),
            ('public.kp_enforce_summary_writer_boundary()'),
            ('public.kp_reconcile_writer_boundary()'),
            ('kp_migration.reconcile_final_unique_indexes()'),
            ('kp_migration.reconcile_curated_reference_documents(uuid)'),
            ('kp_migration.reconcile_initial_summary_versions(uuid)'),
            ('kp_migration.reconcile_current_summary_pointers(uuid)'),
            ('kp_migration.reconcile_package_summary_placements(uuid)'),
            ('kp_migration.reconcile_curated_summary_aliases(uuid)')
        ) as required(function_name)
    loop
        v_function := to_regprocedure(expected.function_name);
        if v_function is null then
            raise exception using
                errcode = 'check_violation',
                message = format(
                    'Knowledge Platform migration 059 requires function %s.',
                    expected.function_name
                );
        end if;
    end loop;

    if not exists (
        select 1
        from pg_catalog.pg_proc p
        where p.oid = to_regprocedure('public.kp_enforce_summary_writer_boundary()')
          and not p.prosecdef
          and array_to_string(p.proconfig, ',') ilike '%search_path=pg_catalog, public, pg_temp%'
          and array_to_string(p.proconfig, ',') ilike '%lock_timeout=5s%'
    ) then
        raise exception using
            errcode = 'check_violation',
            message = 'Knowledge Platform migration 059 requires the locked SECURITY INVOKER 058 writer fence.';
    end if;

    if not exists (
        select 1
        from pg_catalog.pg_trigger t
        join pg_catalog.pg_class c on c.oid = t.tgrelid
        join pg_catalog.pg_namespace n on n.oid = c.relnamespace
        where n.nspname = 'public'
          and c.relname = 'summaries'
          and t.tgname = 'kp_single_writer_boundary'
          and not t.tgisinternal
    ) then
        raise exception using
            errcode = 'check_violation',
            message = 'Knowledge Platform migration 059 requires the 058 Summary write fence trigger.';
    end if;
end
$kp_cleanup_readiness_preflight$;

-- ─────────────────────────────────────────────────────────────────────────────
-- Cleanup write fence. Migration 058 controls who may write the Summary
-- aggregate; migration 059 additionally freezes legacy authority fields before
-- migration 060 removes them. A controlled database owner/superuser session
-- remains available for an approved forward repair or cleanup operation.
-- ─────────────────────────────────────────────────────────────────────────────

create or replace function public.kp_enforce_summary_cleanup_fence()
returns trigger
language plpgsql
security invoker
set search_path = pg_catalog, public, pg_temp
set lock_timeout = '5s'
as $function$
declare
    v_controlled_operator boolean := false;
begin
    select exists (
        select 1
        from pg_catalog.pg_roles r
        where r.rolname = session_user
          and r.rolsuper
    ) or exists (
        select 1
        from pg_catalog.pg_database d
        where d.datname = current_database()
          and pg_catalog.pg_get_userbyid(d.datdba) = session_user
    )
    into v_controlled_operator;

    if v_controlled_operator then
        if tg_op = 'DELETE' then
            return old;
        end if;
        return new;
    end if;

    if tg_op = 'INSERT' then
        raise exception using
            errcode = 'insufficient_privilege',
            message = 'Legacy Summary authority is retired; create target Summary state through the approved Application Layer path.';
    end if;

    if tg_op = 'DELETE' then
        raise exception using
            errcode = 'insufficient_privilege',
            message = 'Legacy Summary rows are protected by the cleanup write fence; use an approved forward migration.';
    end if;

    if new.package_id is distinct from old.package_id
       or new.title is distinct from old.title
       or new.slug is distinct from old.slug
       or new.content_md is distinct from old.content_md
       or new.read_time_minutes is distinct from old.read_time_minutes
       or new.sort_order is distinct from old.sort_order
       or new.display_order is distinct from old.display_order
       or new.released_at is distinct from old.released_at
       or new.is_published is distinct from old.is_published
       or new.document is distinct from old.document
    then
        raise exception using
            errcode = 'insufficient_privilege',
            message = 'Legacy Summary authority fields are read-only after migration 059; write target state through the approved Application Layer path.';
    end if;

    return new;
end
$function$;

comment on function public.kp_enforce_summary_cleanup_fence() is
    'SECURITY INVOKER migration 059 cleanup fence. Non-operator sessions cannot insert/delete legacy Summary rows or mutate legacy authority fields; target fields remain available through approved commands.';

revoke all on function public.kp_enforce_summary_cleanup_fence()
    from public, anon, authenticated;
grant execute on function public.kp_enforce_summary_cleanup_fence()
    to service_role;

drop trigger if exists kp_cleanup_legacy_summary_write_fence on public.summaries;
create trigger kp_cleanup_legacy_summary_write_fence
    before insert or update or delete on public.summaries
    for each row execute function public.kp_enforce_summary_cleanup_fence();

-- ─────────────────────────────────────────────────────────────────────────────
-- Read-only cleanup evidence. The migration-run argument identifies the
-- accepted backfill/reconciliation evidence set; no run is created or altered.
-- ─────────────────────────────────────────────────────────────────────────────

create or replace function kp_migration.reconcile_cleanup_readiness(
    p_migration_run_id uuid
)
returns table (
    migration_run_present boolean,
    migration_run_completed boolean,
    ledger_unsettled_total bigint,
    batch_unfinished_total bigint,
    writer_boundary_mismatch_total bigint,
    final_index_mismatch_total bigint,
    reference_document_mismatch_total bigint,
    summary_version_mismatch_total bigint,
    pointer_mismatch_total bigint,
    placement_mismatch_total bigint,
    alias_mismatch_total bigint,
    legacy_route_mismatch_total bigint,
    target_only_summary_total bigint,
    target_only_placement_total bigint,
    unknown_legacy_catalog_dependency_total bigint,
    legacy_write_fence_present boolean,
    cleanup_write_fence_present boolean,
    legacy_client_mutation_privilege_total bigint,
    cleanup_prerequisites_clear boolean,
    mismatch_total bigint
)
language plpgsql
stable
security definer
set search_path = pg_catalog, public, kp_migration, pg_temp
set lock_timeout = '5s'
as $function$
declare
    v_run_status text;
    v_run_present boolean := false;
    v_run_completed boolean := false;
    v_ledger_unsettled bigint := 0;
    v_batch_unfinished bigint := 0;
    v_writer_mismatch bigint := 0;
    v_index_mismatch bigint := 0;
    v_reference_mismatch bigint := 0;
    v_version_mismatch bigint := 0;
    v_pointer_mismatch bigint := 0;
    v_placement_mismatch bigint := 0;
    v_alias_mismatch bigint := 0;
    v_legacy_route_mismatch bigint := 0;
    v_target_only_summary bigint := 0;
    v_target_only_placement bigint := 0;
    v_catalog_dependency bigint := 0;
    v_legacy_fence boolean := false;
    v_cleanup_fence boolean := false;
    v_client_privileges bigint := 0;
    v_mismatch bigint := 0;
    v_clear boolean := false;
begin
    select r.status
    into v_run_status
    from kp_migration.migration_runs r
    where r.id = p_migration_run_id;
    v_run_present := found;
    v_run_completed := v_run_present and v_run_status = 'completed';

    if p_migration_run_id is not null then
        select count(*)
        into v_ledger_unsettled
        from kp_migration.summary_ledger l
        where l.migration_run_id = p_migration_run_id
          and l.state not in ('succeeded', 'skipped');

        select count(*)
        into v_batch_unfinished
        from kp_migration.batch_progress b
        where b.migration_run_id = p_migration_run_id
          and b.state <> 'completed';

        select coalesce(r.mismatch_total, 0)
        into v_reference_mismatch
        from kp_migration.reconcile_curated_reference_documents(p_migration_run_id) r;

        select coalesce(r.mismatch_total, 0)
        into v_version_mismatch
        from kp_migration.reconcile_initial_summary_versions(p_migration_run_id) r;

        select coalesce(r.mismatch_total, 0)
        into v_pointer_mismatch
        from kp_migration.reconcile_current_summary_pointers(p_migration_run_id) r;

        select coalesce(r.mismatch_total, 0)
        into v_placement_mismatch
        from kp_migration.reconcile_package_summary_placements(p_migration_run_id) r;

        select coalesce(r.mismatch_total, 0)
        into v_alias_mismatch
        from kp_migration.reconcile_curated_summary_aliases(p_migration_run_id) r;
    end if;

    select coalesce(
        nullif(public.kp_reconcile_writer_boundary() ->> 'mismatch_count', '')::bigint,
        0
    )
    into v_writer_mismatch;

    select coalesce(r.mismatch_total, 0)
    into v_index_mismatch
    from kp_migration.reconcile_final_unique_indexes() r;

    -- Compatibility URL parity is checked only for the legacy route that must
    -- survive through the rollback/cleanup boundary. Target-only placements
    -- with no legacy_slug are reported separately and are gated by explicit
    -- target-only approval in assert_cleanup_readiness.
    select count(*)
    into v_legacy_route_mismatch
    from public.summaries s
    where s.package_id is null
       or s.slug is null
       or not exists (
           select 1
           from public.package_summaries ps
           where ps.summary_id = s.id
             and ps.package_id = s.package_id
             and ps.legacy_slug = s.slug
       );

    select count(*)
    into v_target_only_summary
    from public.summaries s
    where s.package_id is null
       or s.slug is null;

    select count(*)
    into v_target_only_placement
    from public.package_summaries ps
    where ps.legacy_slug is null;

    -- Count only unknown view/routine dependencies on legacy Summary authority
    -- columns. Approved read projections, transactional compatibility APIs,
    -- writer/reconciliation helpers, and private migration functions are not
    -- blockers; indexes/constraints are schema evidence, not application use.
    with legacy_columns as (
        select a.attnum
        from pg_catalog.pg_attribute a
        where a.attrelid = 'public.summaries'::regclass
          and a.attname in (
              'package_id', 'title', 'slug', 'content_md',
              'read_time_minutes', 'sort_order', 'display_order',
              'released_at', 'is_published', 'document'
          )
          and not a.attisdropped
    ), dependencies as (
        select d.classid, d.objid
        from pg_catalog.pg_depend d
        join legacy_columns c on c.attnum = d.refobjsubid
        where d.refobjid = 'public.summaries'::regclass
          and d.deptype in ('n', 'a')
          and d.classid in ('pg_rewrite'::regclass, 'pg_proc'::regclass)
    ), unknown_dependencies as (
        select d.classid, d.objid
        from dependencies d
        where not exists (
            select 1
            from pg_catalog.pg_rewrite rw
            join pg_catalog.pg_class dep on dep.oid = rw.ev_class
            join pg_catalog.pg_namespace ns on ns.oid = dep.relnamespace
            where d.classid = 'pg_rewrite'::regclass
              and d.objid = rw.oid
              and ns.nspname = 'public'
              and dep.relname like 'kp_read_%'
        )
        and not exists (
            select 1
            from pg_catalog.pg_proc p
            join pg_catalog.pg_namespace ns on ns.oid = p.pronamespace
            where d.classid = 'pg_proc'::regclass
              and d.objid = p.oid
              and (
                  ns.nspname = 'kp_migration'
                  or (
                      ns.nspname = 'public'
                      and (
                          p.proname like 'kp_read_%'
                          or p.proname like 'kp_persist_%'
                          or p.proname like 'kp_reconcile_%'
                          or p.proname = 'kp_enforce_summary_writer_boundary'
                      )
                  )
              )
        )
    )
    select count(*)
    into v_catalog_dependency
    from unknown_dependencies;

    select exists (
        select 1
        from pg_catalog.pg_proc p
        where p.oid = to_regprocedure('public.kp_enforce_summary_writer_boundary()')
          and not p.prosecdef
          and array_to_string(p.proconfig, ',') ilike '%search_path=pg_catalog, public, pg_temp%'
          and array_to_string(p.proconfig, ',') ilike '%lock_timeout=5s%'
    ) and exists (
        select 1
        from pg_catalog.pg_trigger t
        join pg_catalog.pg_class c on c.oid = t.tgrelid
        join pg_catalog.pg_namespace n on n.oid = c.relnamespace
        where n.nspname = 'public'
          and c.relname = 'summaries'
          and t.tgname = 'kp_single_writer_boundary'
          and not t.tgisinternal
    )
    into v_legacy_fence;

    select exists (
        select 1
        from pg_catalog.pg_proc p
        where p.oid = to_regprocedure('public.kp_enforce_summary_cleanup_fence()')
          and not p.prosecdef
          and array_to_string(p.proconfig, ',') ilike '%search_path=pg_catalog, public, pg_temp%'
          and array_to_string(p.proconfig, ',') ilike '%lock_timeout=5s%'
    ) and exists (
        select 1
        from pg_catalog.pg_trigger t
        join pg_catalog.pg_class c on c.oid = t.tgrelid
        join pg_catalog.pg_namespace n on n.oid = c.relnamespace
        where n.nspname = 'public'
          and c.relname = 'summaries'
          and t.tgname = 'kp_cleanup_legacy_summary_write_fence'
          and not t.tgisinternal
    )
    into v_cleanup_fence;

    select
        (case when has_table_privilege('anon', 'public.summaries', 'INSERT') then 1 else 0 end)
        + (case when has_table_privilege('anon', 'public.summaries', 'UPDATE') then 1 else 0 end)
        + (case when has_table_privilege('anon', 'public.summaries', 'DELETE') then 1 else 0 end)
        + (case when has_table_privilege('authenticated', 'public.summaries', 'INSERT') then 1 else 0 end)
        + (case when has_table_privilege('authenticated', 'public.summaries', 'UPDATE') then 1 else 0 end)
        + (case when has_table_privilege('authenticated', 'public.summaries', 'DELETE') then 1 else 0 end)
    into v_client_privileges;

    v_mismatch :=
        (case when not v_run_present then 1 else 0 end)
        + (case when not v_run_completed then 1 else 0 end)
        + v_ledger_unsettled
        + v_batch_unfinished
        + v_writer_mismatch
        + v_index_mismatch
        + v_reference_mismatch
        + v_version_mismatch
        + v_pointer_mismatch
        + v_placement_mismatch
        + v_alias_mismatch
        + v_legacy_route_mismatch
        + v_catalog_dependency
        + (case when not v_legacy_fence then 1 else 0 end)
        + (case when not v_cleanup_fence then 1 else 0 end)
        + v_client_privileges;

    v_clear :=
        v_mismatch = 0
        and v_target_only_summary >= 0
        and v_target_only_placement >= 0;

    return query
    select
        v_run_present,
        v_run_completed,
        v_ledger_unsettled,
        v_batch_unfinished,
        v_writer_mismatch,
        v_index_mismatch,
        v_reference_mismatch,
        v_version_mismatch,
        v_pointer_mismatch,
        v_placement_mismatch,
        v_alias_mismatch,
        v_legacy_route_mismatch,
        v_target_only_summary,
        v_target_only_placement,
        v_catalog_dependency,
        v_legacy_fence,
        v_cleanup_fence,
        v_client_privileges,
        v_clear,
        v_mismatch;
end
$function$;

comment on function kp_migration.reconcile_cleanup_readiness(uuid) is
    'Read-only migration 059 cleanup evidence: completed ledger run, reconciliation totals, legacy URL parity, unknown catalog dependencies, the 058 Summary writer fence, and the 059 cleanup fence. It never changes data or flags.';

-- ─────────────────────────────────────────────────────────────────────────────
-- Explicit cleanup gate. This is the only object that turns operator evidence
-- into an abort/allow decision, and it is dormant until migration 060 calls it.
-- ─────────────────────────────────────────────────────────────────────────────

create or replace function kp_migration.assert_cleanup_readiness(
    p_migration_run_id uuid,
    p_target_authority_enabled boolean,
    p_rollback_window_closed boolean,
    p_target_only_approved boolean,
    p_legacy_dependency_confirmed boolean,
    p_operator_attestation text
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public, kp_migration, pg_temp
set lock_timeout = '5s'
as $function$
declare
    v_report jsonb;
    v_prerequisites_clear boolean;
begin
    select to_jsonb(r), r.cleanup_prerequisites_clear
    into v_report, v_prerequisites_clear
    from kp_migration.reconcile_cleanup_readiness(p_migration_run_id) r;

    if p_migration_run_id is null
       or not coalesce(v_prerequisites_clear, false)
       or p_target_authority_enabled is not true
       or p_rollback_window_closed is not true
       or p_target_only_approved is not true
       or p_legacy_dependency_confirmed is not true
       or p_operator_attestation is null
       or btrim(p_operator_attestation) = ''
    then
        raise exception using
            errcode = 'check_violation',
            message = 'Knowledge Platform migration 059 cleanup readiness gate is not satisfied.',
            detail = coalesce(v_report, '{}'::jsonb)::text,
            hint = 'Keep migration 060 unapplied; reconcile evidence, close the rollback window, obtain target-only approval, and retry with an operator attestation.';
    end if;
end
$function$;

comment on function kp_migration.assert_cleanup_readiness(uuid, boolean, boolean, boolean, boolean, text) is
    'Fail-closed migration 059 cleanup gate. Migration 060 must call it with explicit D3/D4 authority, rollback-closure, target-only, dependency, and operator-attestation evidence before destructive cleanup.';

-- ─────────────────────────────────────────────────────────────────────────────
-- Private service/operator access only. No PostgREST surface is introduced.
-- ─────────────────────────────────────────────────────────────────────────────

revoke all on function kp_migration.reconcile_cleanup_readiness(uuid)
    from public, anon, authenticated;
revoke all on function kp_migration.assert_cleanup_readiness(uuid, boolean, boolean, boolean, boolean, text)
    from public, anon, authenticated;

grant execute on function kp_migration.reconcile_cleanup_readiness(uuid)
    to service_role;
grant execute on function kp_migration.assert_cleanup_readiness(uuid, boolean, boolean, boolean, boolean, text)
    to service_role;

-- ─────────────────────────────────────────────────────────────────────────────
-- Fail-closed postconditions. They validate helper shape/security/grants only;
-- neither helper is invoked during migration deployment.
-- ─────────────────────────────────────────────────────────────────────────────

do $kp_cleanup_readiness_assertions$
declare
    expected record;
    v_function oid;
begin
    for expected in
        select function_name, require_stable
        from (values
            ('kp_migration.reconcile_cleanup_readiness(uuid)', true),
            ('kp_migration.assert_cleanup_readiness(uuid,boolean,boolean,boolean,boolean,text)', false)
        ) as required(function_name, require_stable)
    loop
        v_function := to_regprocedure(expected.function_name);
        if v_function is null
           or not exists (
               select 1
               from pg_catalog.pg_proc p
               where p.oid = v_function
                 and p.prosecdef
                 and array_to_string(p.proconfig, ',') ilike '%search_path=pg_catalog, public, kp_migration, pg_temp%'
                 and array_to_string(p.proconfig, ',') ilike '%lock_timeout=5s%'
                 and (not expected.require_stable or p.provolatile = 's')
           )
           or has_function_privilege('public', v_function, 'EXECUTE')
           or has_function_privilege('anon', v_function, 'EXECUTE')
           or has_function_privilege('authenticated', v_function, 'EXECUTE')
           or not has_function_privilege('service_role', v_function, 'EXECUTE')
        then
            raise exception using
                errcode = 'check_violation',
                message = format(
                    'Knowledge Platform migration 059 cleanup helper security/grants are incompatible: %s.',
                    expected.function_name
                );
        end if;
    end loop;

    v_function := to_regprocedure('public.kp_enforce_summary_cleanup_fence()');
    if v_function is null
       or exists (
           select 1
           from pg_catalog.pg_proc p
           where p.oid = v_function
             and p.prosecdef
       )
       or not exists (
           select 1
           from pg_catalog.pg_proc p
           where p.oid = v_function
             and array_to_string(p.proconfig, ',') ilike '%search_path=pg_catalog, public, pg_temp%'
             and array_to_string(p.proconfig, ',') ilike '%lock_timeout=5s%'
       )
       or has_function_privilege('public', v_function, 'EXECUTE')
       or has_function_privilege('anon', v_function, 'EXECUTE')
       or has_function_privilege('authenticated', v_function, 'EXECUTE')
       or not has_function_privilege('service_role', v_function, 'EXECUTE')
       or not exists (
           select 1
           from pg_catalog.pg_trigger t
           join pg_catalog.pg_class c on c.oid = t.tgrelid
           join pg_catalog.pg_namespace n on n.oid = c.relnamespace
           where n.nspname = 'public'
             and c.relname = 'summaries'
             and t.tgname = 'kp_cleanup_legacy_summary_write_fence'
             and not t.tgisinternal
       )
    then
        raise exception using
            errcode = 'check_violation',
            message = 'Knowledge Platform migration 059 cleanup write fence is missing or insufficiently hardened.';
    end if;

    if exists (
        select 1
        from pg_catalog.pg_class c
        join pg_catalog.pg_namespace n on n.oid = c.relnamespace
        where n.nspname = 'kp_migration'
          and c.relname like 'cleanup_readiness%'
          and c.relkind in ('r', 'p', 'm', 'v')
    ) then
        raise exception using
            errcode = 'check_violation',
            message = 'Knowledge Platform migration 059 must not create cleanup-readiness storage or a public read model.';
    end if;
end
$kp_cleanup_readiness_assertions$;
