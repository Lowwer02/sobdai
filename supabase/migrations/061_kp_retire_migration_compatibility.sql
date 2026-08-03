-- 061_kp_retire_migration_compatibility.sql
-- Sobdai Knowledge Platform — final compatibility-retirement infrastructure.
--
-- Migration-number audit
-- ----------------------
-- Knowledge Platform migration 060 is the highest deployed KP migration.
-- Repository migrations 062+ are unrelated product migrations and do not
-- consume the frozen Knowledge Platform sequence. This file implements the
-- final frozen Knowledge Platform responsibility 061 only.
--
-- Purpose
-- -------
-- Install the final verification surface, private completion ledger, and a
-- fail-closed operator executor for retiring migration-only projections,
-- persistence routines, manifests, and temporary control tables after the
-- 060 observation period and evidence export.
--
-- Safety boundary
-- ---------------
-- * Deployment performs no cleanup, cutover, feature-flag change, or domain
--   row mutation.
-- * Compatibility removal is available only through an explicit service-role
--   call with D5 application confirmation, stale-flag retirement evidence,
--   consumer absence, audit-export checksum, and operator attestation.
-- * The executor never uses CASCADE and never deletes Summary, Package,
--   SummaryVersion, PackageSummary, ReferenceDocument, Alias, News, or other
--   product rows. It may remove only named migration-control objects and
--   compatibility routines/views after the approval gate succeeds.
-- * The completion ledger is retained in the private kp_migration schema after
--   temporary control objects are retired; no client RLS policy is introduced.
--
-- Rollback
-- --------
-- Before explicit execution, leave this migration dormant. After retirement,
-- recreate a compatibility projection only through a forward migration or a
-- verified database restore, as required by the frozen design.

set local lock_timeout = '5s';

-- ─────────────────────────────────────────────────────────────────────────────
-- Fail closed on the deployed 060 target-authority surface. This block is
-- catalog-only and intentionally does not call a cleanup function.
-- ─────────────────────────────────────────────────────────────────────────────

do $kp_final_completion_preflight$
declare
    expected record;
begin
    if to_regnamespace('kp_migration') is null then
        raise exception using
            errcode = 'check_violation',
            message = 'Knowledge Platform migration 061 requires the private kp_migration schema.';
    end if;

    for expected in
        select relation_name
        from (values
            ('public.summaries'),
            ('public.news_summaries'),
            ('public.package_summaries'),
            ('public.summary_versions'),
            ('public.summary_aliases'),
            ('public.summary_reference_documents'),
            ('public.summary_version_reference_documents')
        ) as required(relation_name)
    loop
        if to_regclass(expected.relation_name) is null then
            raise exception using
                errcode = 'check_violation',
                message = format(
                    'Knowledge Platform migration 061 prerequisite is missing: %s.',
                    expected.relation_name
                );
        end if;
    end loop;

    for expected in
        select column_name
        from (values
            ('id'),
            ('summary_code'),
            ('canonical_slug'),
            ('canonical_title'),
            ('visibility'),
            ('lifecycle_status'),
            ('current_published_version_id')
        ) as required(column_name)
    loop
        if not exists (
            select 1
            from information_schema.columns c
            where c.table_schema = 'public'
              and c.table_name = 'summaries'
              and c.column_name = expected.column_name
        ) then
            raise exception using
                errcode = 'check_violation',
                message = format(
                    'Knowledge Platform migration 061 requires target Summary field public.summaries.%I.',
                    expected.column_name
                );
        end if;
    end loop;

    if to_regprocedure('kp_migration.reconcile_legacy_summary_authority(uuid)') is null then
        raise exception using
            errcode = 'check_violation',
            message = 'Knowledge Platform migration 061 requires the deployed 060 reconciliation helper.';
    end if;

    -- 060's physical retirement remains a separately approved operation. Its
    -- legacy columns, cleanup fence, and News FK are therefore reported by
    -- reconciliation below rather than required during this dormant install.
end
$kp_final_completion_preflight$;

-- ─────────────────────────────────────────────────────────────────────────────
-- Durable final completion ledger. This is operational evidence, not a domain
-- aggregate. It is created empty; the explicit record function below is the
-- only completion path.
-- ─────────────────────────────────────────────────────────────────────────────

create table if not exists kp_migration.completion_ledger (
    completion_key text primary key,
    migration_number integer not null,
    migration_name text not null,
    status text not null default 'pending',
    design_revision text not null,
    audit_export_checksum text,
    operator_attestation text,
    application_deployment text,
    verified_at timestamptz,
    completed_at timestamptz,
    metadata jsonb not null default '{}'::jsonb,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),

    constraint kp_completion_ledger_key_check check (
        completion_key = 'knowledge_platform'
    ),
    constraint kp_completion_ledger_migration_check check (
        migration_number = 61
        and btrim(migration_name) <> ''
        and btrim(design_revision) <> ''
    ),
    constraint kp_completion_ledger_status_check check (
        status in ('pending', 'verified', 'completed', 'blocked')
    ),
    constraint kp_completion_ledger_metadata_check check (
        jsonb_typeof(metadata) = 'object'
    ),
    constraint kp_completion_ledger_verified_check check (
        status not in ('verified', 'completed')
        or (
            verified_at is not null
            and nullif(btrim(audit_export_checksum), '') is not null
            and nullif(btrim(operator_attestation), '') is not null
        )
    ),
    constraint kp_completion_ledger_completed_check check (
        status <> 'completed'
        or (
            completed_at is not null
            and application_deployment = 'D5'
        )
    )
);

comment on table kp_migration.completion_ledger is
    'Durable final Knowledge Platform completion evidence. Private operational metadata; no product rows or application state.';
comment on column kp_migration.completion_ledger.audit_export_checksum is
    'Checksum of the exported 036–060 migration evidence and final dependency report.';
comment on column kp_migration.completion_ledger.application_deployment is
    'Application deployment identifier. Final completion requires D5, which removes migration compatibility consumers and stale flags.';

create index if not exists kp_completion_ledger_status_idx
    on kp_migration.completion_ledger (status, completed_at);

alter table kp_migration.completion_ledger enable row level security;
revoke all on table kp_migration.completion_ledger
    from public, anon, authenticated, service_role;
grant select on table kp_migration.completion_ledger to service_role;

drop trigger if exists handle_updated_at_kp_completion_ledger
    on kp_migration.completion_ledger;
create trigger handle_updated_at_kp_completion_ledger
    before update on kp_migration.completion_ledger
    for each row execute function public.handle_updated_at();

-- ─────────────────────────────────────────────────────────────────────────────
-- Final reconciliation. It is catalog/evidence-only and can be called before
-- or after the explicit retirement executor.
-- ─────────────────────────────────────────────────────────────────────────────

create or replace function kp_migration.reconcile_final_completion()
returns table (
    target_authority_ready boolean,
    legacy_columns_remaining bigint,
    legacy_policy_count bigint,
    cleanup_fence_present boolean,
    news_summary_cascade_fk_count bigint,
    news_summary_restrict_fk_count bigint,
    target_index_missing_count bigint,
    unknown_legacy_dependency_count bigint,
    compatibility_view_count bigint,
    persistence_function_count bigint,
    migration_control_table_count bigint,
    migration_control_routine_count bigint,
    completion_ledger_present boolean,
    completion_record_present boolean,
    client_privilege_violation_count bigint,
    final_prerequisites_clear boolean,
    final_completion_clear boolean,
    mismatch_total bigint
)
language plpgsql
stable
security definer
set search_path = pg_catalog, public, kp_migration, pg_temp
set lock_timeout = '5s'
as $function$
declare
    v_target_authority_ready boolean := false;
    v_legacy_columns_remaining bigint := 0;
    v_legacy_policy_count bigint := 0;
    v_cleanup_fence_present boolean := false;
    v_news_summary_cascade_fk_count bigint := 0;
    v_news_summary_restrict_fk_count bigint := 0;
    v_target_index_missing_count bigint := 0;
    v_unknown_legacy_dependency_count bigint := 0;
    v_compatibility_view_count bigint := 0;
    v_persistence_function_count bigint := 0;
    v_migration_control_table_count bigint := 0;
    v_migration_control_routine_count bigint := 0;
    v_completion_ledger_present boolean := false;
    v_completion_record_present boolean := false;
    v_client_privilege_violation_count bigint := 0;
    v_final_prerequisites_clear boolean := false;
    v_final_completion_clear boolean := false;
    v_mismatch_total bigint := 0;
begin
    select count(*)::bigint
    into v_legacy_columns_remaining
    from pg_catalog.pg_attribute a
    where a.attrelid = 'public.summaries'::regclass
      and not a.attisdropped
      and a.attname = any (array[
          'package_id', 'title', 'slug', 'content_md', 'read_time_minutes',
          'sort_order', 'display_order', 'released_at', 'is_published'
      ]::name[]);

    select count(*)::bigint
    into v_legacy_policy_count
    from pg_catalog.pg_policies p
    where p.schemaname = 'public'
      and p.tablename = 'summaries'
      and (
          p.policyname in (
              'Published summaries viewable by everyone.',
              'Admins can manage summaries.',
              'Content managers can manage summaries.'
          )
          or coalesce(p.qual, '') ilike '%is_published%'
          or coalesce(p.qual, '') ilike '%package_id%'
          or coalesce(p.qual, '') ilike '%content_md%'
          or coalesce(p.with_check, '') ilike '%is_published%'
          or coalesce(p.with_check, '') ilike '%package_id%'
          or coalesce(p.with_check, '') ilike '%content_md%'
      );

    select exists (
        select 1
        from pg_catalog.pg_trigger t
        where t.tgrelid = 'public.summaries'::regclass
          and t.tgname = 'kp_cleanup_legacy_summary_write_fence'
          and not t.tgisinternal
    )
    into v_cleanup_fence_present;

    select count(*)::bigint
    into v_news_summary_cascade_fk_count
    from pg_catalog.pg_constraint c
    where c.conrelid = 'public.news_summaries'::regclass
      and c.confrelid = 'public.summaries'::regclass
      and c.contype = 'f'
      and pg_catalog.pg_get_constraintdef(c.oid) ilike '%on delete cascade%';

    select count(*)::bigint
    into v_news_summary_restrict_fk_count
    from pg_catalog.pg_constraint c
    where c.conrelid = 'public.news_summaries'::regclass
      and c.confrelid = 'public.summaries'::regclass
      and c.contype = 'f'
      and pg_catalog.pg_get_constraintdef(c.oid) ilike '%on delete restrict%';

    select count(*)::bigint
    into v_target_index_missing_count
    from (
        values
            ('packages_package_code_key'),
            ('summaries_summary_code_final_key'),
            ('summaries_canonical_slug_final_key'),
            ('package_summaries_package_legacy_slug_final_key')
    ) as required(index_name)
    where to_regclass(format('public.%I', required.index_name)) is null;

    select count(*)::bigint
    into v_compatibility_view_count
    from pg_catalog.pg_class c
    join pg_catalog.pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relkind = 'v'
      and c.relname in (
          'kp_read_admin_library',
          'kp_read_summary_picker',
          'kp_read_package_summaries',
          'kp_read_news_summaries',
          'kp_read_recommendation_store'
      );

    select count(*)::bigint
    into v_persistence_function_count
    from pg_catalog.pg_proc p
    join pg_catalog.pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname like 'kp_persist_%';

    select count(*)::bigint
    into v_migration_control_table_count
    from unnest(array[
        'migration_runs',
        'summary_ledger',
        'batch_progress',
        'reference_document_manifest',
        'reference_document_alias_manifest',
        'summary_reference_document_manifest',
        'summary_version_manifest',
        'summary_version_source_manifest',
        'summary_alias_manifest'
    ]::text[]) as required(table_name)
    where to_regclass(format('kp_migration.%I', required.table_name)) is not null;

    select count(*)::bigint
    into v_migration_control_routine_count
    from pg_catalog.pg_proc p
    join pg_catalog.pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'kp_migration'
      and p.proname not in (
          'reconcile_final_completion',
          'assert_final_completion',
          'record_final_completion',
          'execute_final_compatibility_retirement'
      );

    select count(*)::bigint
    into v_unknown_legacy_dependency_count
    from (
        select v.viewname as object_name
        from pg_catalog.pg_views v
        where v.schemaname = 'public'
          and (
              v.definition ilike '%s.title%'
              or v.definition ilike '%s.is_published%'
              or v.definition ilike '%s.package_id%'
              or v.definition ilike '%s.content_md%'
          )
          and v.viewname not like 'kp_read_%'
        union all
        select p.proname as object_name
        from pg_catalog.pg_proc p
        join pg_catalog.pg_namespace n on n.oid = p.pronamespace
        where n.nspname = 'public'
          and (
              pg_catalog.pg_get_functiondef(p.oid) ilike '%s.title%'
              or pg_catalog.pg_get_functiondef(p.oid) ilike '%s.is_published%'
              or pg_catalog.pg_get_functiondef(p.oid) ilike '%s.package_id%'
              or pg_catalog.pg_get_functiondef(p.oid) ilike '%s.content_md%'
          )
          and p.proname not like 'kp_read_%'
          and p.proname not like 'kp_persist_%'
    ) dependencies;

    v_completion_ledger_present := to_regclass('kp_migration.completion_ledger') is not null;

    if v_completion_ledger_present then
        select exists (
            select 1
            from kp_migration.completion_ledger l
            where l.completion_key = 'knowledge_platform'
              and l.status = 'completed'
        )
        into v_completion_record_present;
    end if;

    v_client_privilege_violation_count :=
        (case when has_schema_privilege('anon', 'kp_migration', 'USAGE') then 1 else 0 end)
        + (case when has_schema_privilege('authenticated', 'kp_migration', 'USAGE') then 1 else 0 end)
        + (case when v_completion_ledger_present and has_table_privilege('anon', 'kp_migration.completion_ledger', 'SELECT') then 1 else 0 end)
        + (case when v_completion_ledger_present and has_table_privilege('authenticated', 'kp_migration.completion_ledger', 'SELECT') then 1 else 0 end)
        + (case when v_completion_ledger_present and has_table_privilege('service_role', 'kp_migration.completion_ledger', 'INSERT') then 1 else 0 end)
        + (case when v_completion_ledger_present and has_table_privilege('service_role', 'kp_migration.completion_ledger', 'UPDATE') then 1 else 0 end)
        + (case when v_completion_ledger_present and has_table_privilege('service_role', 'kp_migration.completion_ledger', 'DELETE') then 1 else 0 end);

    v_target_authority_ready :=
        v_legacy_columns_remaining = 0
        and v_legacy_policy_count = 0
        and not v_cleanup_fence_present
        and v_news_summary_cascade_fk_count = 0
        and v_news_summary_restrict_fk_count > 0
        and v_target_index_missing_count = 0
        and v_unknown_legacy_dependency_count = 0
        and exists (
            select 1
            from pg_catalog.pg_class c
            where c.oid = 'public.summaries'::regclass
              and c.relrowsecurity
        );

    v_final_prerequisites_clear :=
        v_target_authority_ready
        and v_completion_ledger_present
        and v_client_privilege_violation_count = 0;

    v_final_completion_clear :=
        -- This is the structural postcondition used by the completion writer;
        -- completion_record_present is reported separately because the writer
        -- must create that record after the retirement DDL succeeds.
        v_final_prerequisites_clear
        and v_compatibility_view_count = 0
        and v_persistence_function_count = 0
        and v_migration_control_table_count = 0
        and v_migration_control_routine_count = 0;

    v_mismatch_total :=
        v_legacy_columns_remaining
        + v_legacy_policy_count
        + case when v_cleanup_fence_present then 1 else 0 end
        + v_news_summary_cascade_fk_count
        + case when v_news_summary_restrict_fk_count > 0 then 0 else 1 end
        + v_target_index_missing_count
        + v_unknown_legacy_dependency_count
        + v_compatibility_view_count
        + v_persistence_function_count
        + v_migration_control_table_count
        + v_migration_control_routine_count
        + case when v_completion_ledger_present then 0 else 1 end
        + case when v_completion_record_present then 0 else 1 end
        + v_client_privilege_violation_count;

    return query
    select
        v_target_authority_ready,
        v_legacy_columns_remaining,
        v_legacy_policy_count,
        v_cleanup_fence_present,
        v_news_summary_cascade_fk_count,
        v_news_summary_restrict_fk_count,
        v_target_index_missing_count,
        v_unknown_legacy_dependency_count,
        v_compatibility_view_count,
        v_persistence_function_count,
        v_migration_control_table_count,
        v_migration_control_routine_count,
        v_completion_ledger_present,
        v_completion_record_present,
        v_client_privilege_violation_count,
        v_final_prerequisites_clear,
        v_final_completion_clear,
        v_mismatch_total;
end
$function$;

comment on function kp_migration.reconcile_final_completion() is
    'Stable, catalog/evidence-only final Knowledge Platform reconciliation. It reports 060 target authority, compatibility objects, temporary control objects, private grants, and completion-ledger state without mutating domain data.';

-- ─────────────────────────────────────────────────────────────────────────────
-- Final production-readiness assertion. It authorizes only the explicit
-- compatibility-retirement executor; it never performs retirement itself.
-- ─────────────────────────────────────────────────────────────────────────────

create or replace function kp_migration.assert_final_completion(
    p_060_stable boolean,
    p_audit_export_verified boolean,
    p_application_d5_confirmed boolean,
    p_compatibility_consumers_absent boolean,
    p_feature_flags_retired boolean,
    p_operator_attestation text,
    p_confirm_destructive boolean
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
    if p_060_stable is not true
       or p_audit_export_verified is not true
       or p_application_d5_confirmed is not true
       or p_compatibility_consumers_absent is not true
       or p_feature_flags_retired is not true
       or p_operator_attestation is null
       or btrim(p_operator_attestation) = ''
       or p_confirm_destructive is not true
    then
        raise exception using
            errcode = 'check_violation',
            message = 'Knowledge Platform migration 061 final-retirement approval is incomplete.',
            hint = 'Keep compatibility objects installed. Export the audit ledger, complete D5, retire stale flags, verify consumer absence, and retry with an explicit attestation.';
    end if;

    select to_jsonb(r), r.final_prerequisites_clear
    into v_report, v_prerequisites_clear
    from kp_migration.reconcile_final_completion() r;

    if not coalesce(v_prerequisites_clear, false) then
        raise exception using
            errcode = 'check_violation',
            message = 'Knowledge Platform migration 061 final-retirement prerequisites are not satisfied.',
            detail = coalesce(v_report, '{}'::jsonb)::text,
            hint = 'Do not remove migration compatibility. Resolve target-authority, RLS, FK, index, dependency, or private-grant drift first.';
    end if;
end
$function$;

comment on function kp_migration.assert_final_completion(boolean, boolean, boolean, boolean, boolean, text, boolean) is
    'Fail-closed final migration 061 readiness assertion. It validates D5/evidence/consumer/flag attestations and target authority but performs no cleanup.';

-- ─────────────────────────────────────────────────────────────────────────────
-- Explicit completion-ledger writer. It is dormant during migration
-- deployment and can run only after the compatibility-retirement executor has
-- left no temporary objects behind.
-- ─────────────────────────────────────────────────────────────────────────────

create or replace function kp_migration.record_final_completion(
    p_audit_export_checksum text,
    p_operator_attestation text,
    p_application_d5_confirmed boolean,
    p_compatibility_consumers_absent boolean,
    p_feature_flags_retired boolean,
    p_confirm_completion boolean
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, kp_migration, pg_temp
set lock_timeout = '5s'
as $function$
declare
    v_report jsonb;
    v_final_clear boolean;
begin
    if p_audit_export_checksum is null
       or btrim(p_audit_export_checksum) = ''
       or p_operator_attestation is null
       or btrim(p_operator_attestation) = ''
       or p_application_d5_confirmed is not true
       or p_compatibility_consumers_absent is not true
       or p_feature_flags_retired is not true
       or p_confirm_completion is not true
    then
        raise exception using
            errcode = 'check_violation',
            message = 'Knowledge Platform migration 061 completion evidence is incomplete.';
    end if;

    select to_jsonb(r), r.final_completion_clear
    into v_report, v_final_clear
    from kp_migration.reconcile_final_completion() r;

    if not coalesce(v_final_clear, false) then
        raise exception using
            errcode = 'check_violation',
            message = 'Knowledge Platform migration 061 cannot be marked complete while temporary compatibility/control objects remain.',
            detail = coalesce(v_report, '{}'::jsonb)::text;
    end if;

    insert into kp_migration.completion_ledger (
        completion_key,
        migration_number,
        migration_name,
        status,
        design_revision,
        audit_export_checksum,
        operator_attestation,
        application_deployment,
        verified_at,
        completed_at,
        metadata
    ) values (
        'knowledge_platform',
        61,
        '061_kp_retire_migration_compatibility.sql',
        'completed',
        'knowledge_platform_sql_migration_design_v1',
        btrim(p_audit_export_checksum),
        btrim(p_operator_attestation),
        'D5',
        now(),
        now(),
        jsonb_build_object(
            'compatibility_consumers_absent', p_compatibility_consumers_absent,
            'feature_flags_retired', p_feature_flags_retired,
            'domain_rows_changed', false
        )
    )
    on conflict (completion_key) do update
       set migration_number = excluded.migration_number,
           migration_name = excluded.migration_name,
           status = excluded.status,
           design_revision = excluded.design_revision,
           audit_export_checksum = excluded.audit_export_checksum,
           operator_attestation = excluded.operator_attestation,
           application_deployment = excluded.application_deployment,
           verified_at = excluded.verified_at,
           completed_at = excluded.completed_at,
           metadata = excluded.metadata;

    return jsonb_build_object(
        'migration', '061',
        'status', 'completed',
        'application_deployment', 'D5',
        'domain_rows_changed', false,
        'audit_export_checksum', btrim(p_audit_export_checksum)
    );
end
$function$;

comment on function kp_migration.record_final_completion(text, text, boolean, boolean, boolean, boolean) is
    'Explicit service-role-only completion-ledger writer for migration 061. It writes operational evidence only after final compatibility/control retirement is reconciled.';

-- ─────────────────────────────────────────────────────────────────────────────
-- Explicit forward-only compatibility retirement. The function is installed
-- dormant. DDL runs in the caller's transaction, so any postcondition failure
-- rolls back the complete retirement operation.
-- ─────────────────────────────────────────────────────────────────────────────

create or replace function kp_migration.execute_final_compatibility_retirement(
    p_060_stable boolean,
    p_audit_export_verified boolean,
    p_application_d5_confirmed boolean,
    p_compatibility_consumers_absent boolean,
    p_feature_flags_retired boolean,
    p_audit_export_checksum text,
    p_operator_attestation text,
    p_confirm_destructive boolean
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, kp_migration, pg_temp
set lock_timeout = '5s'
as $function$
declare
    v_routine record;
    v_table_name text;
    v_report jsonb;
    v_final_clear boolean;
    v_completion jsonb;
begin
    perform kp_migration.assert_final_completion(
        p_060_stable,
        p_audit_export_verified,
        p_application_d5_confirmed,
        p_compatibility_consumers_absent,
        p_feature_flags_retired,
        p_operator_attestation,
        p_confirm_destructive
    );

    -- Compatibility projections are removed only after D5 confirms that all
    -- consumers have moved to the final application surface.
    execute 'drop function if exists public.kp_read_summary_route(text,text)';
    execute 'drop view if exists public.kp_read_recommendation_store';
    execute 'drop view if exists public.kp_read_news_summaries';
    execute 'drop view if exists public.kp_read_package_summaries';
    execute 'drop view if exists public.kp_read_summary_picker';
    execute 'drop view if exists public.kp_read_admin_library';

    -- The 057 persistence API is migration compatibility code. Drop every
    -- overload by identity arguments, without touching any domain table.
    for v_routine in
        select n.nspname,
               p.proname,
               pg_catalog.pg_get_function_identity_arguments(p.oid) as identity_arguments
        from pg_catalog.pg_proc p
        join pg_catalog.pg_namespace n on n.oid = p.pronamespace
        where n.nspname = 'public'
          and p.proname like 'kp_persist_%'
    loop
        execute format(
            'drop function if exists %I.%I(%s)',
            v_routine.nspname,
            v_routine.proname,
            v_routine.identity_arguments
        );
    end loop;

    -- Drop manifests and temporary control tables in dependency-safe order.
    -- Their triggers are removed with the tables before their guard routines
    -- are retired below. No CASCADE is used, so unexpected dependencies abort
    -- the transaction.
    foreach v_table_name in array ARRAY[
        'summary_reference_document_manifest',
        'reference_document_alias_manifest',
        'summary_alias_manifest',
        'summary_version_source_manifest',
        'summary_version_manifest',
        'reference_document_manifest',
        'batch_progress',
        'summary_ledger',
        'migration_runs'
    ]
    loop
        execute format(
            'drop table if exists kp_migration.%I',
            v_table_name
        );
    end loop;

    -- Retire only the known Knowledge Platform migration routines. The final
    -- reconciliation/assertion/record/executor functions are explicitly kept.
    -- This follows table retirement so manifest trigger dependencies are gone.
    for v_routine in
        select n.nspname,
               p.proname,
               pg_catalog.pg_get_function_identity_arguments(p.oid) as identity_arguments
        from pg_catalog.pg_proc p
        join pg_catalog.pg_namespace n on n.oid = p.pronamespace
        where n.nspname = 'kp_migration'
          and (
              p.proname like 'backfill_%'
              or p.proname like 'guard_%'
              or p.proname like 'approve_%'
              or p.proname like 'apply_%'
              or p.proname like 'confirm_%'
              or p.proname like 'refresh_%'
              or p.proname like 'reconcile_%'
              or p.proname in (
                  'assert_cleanup_readiness',
                  'assert_legacy_summary_authority_removal',
                  'execute_legacy_summary_authority_removal'
              )
          )
          and p.proname not in (
              'reconcile_final_completion',
              'assert_final_completion',
              'record_final_completion',
              'execute_final_compatibility_retirement'
          )
    loop
        execute format(
            'drop function if exists %I.%I(%s)',
            v_routine.nspname,
            v_routine.proname,
            v_routine.identity_arguments
        );
    end loop;

    select to_jsonb(r), r.final_completion_clear
    into v_report, v_final_clear
    from kp_migration.reconcile_final_completion() r;

    if not coalesce(v_final_clear, false) then
        raise exception using
            errcode = 'check_violation',
            message = 'Knowledge Platform migration 061 retirement postconditions failed.',
            detail = coalesce(v_report, '{}'::jsonb)::text;
    end if;

    v_completion := kp_migration.record_final_completion(
        p_audit_export_checksum,
        p_operator_attestation,
        p_application_d5_confirmed,
        p_compatibility_consumers_absent,
        p_feature_flags_retired,
        true
    );

    perform pg_catalog.pg_notify('pgrst', 'reload schema');

    return jsonb_build_object(
        'migration', '061',
        'status', 'completed',
        'domain_rows_changed', false,
        'compatibility_objects_retired', true,
        'temporary_control_objects_retired', true,
        'completion', v_completion,
        'rollback', 'forward_recreate_or_verified_database_restore'
    );
end
$function$;

comment on function kp_migration.execute_final_compatibility_retirement(boolean, boolean, boolean, boolean, boolean, text, text, boolean) is
    'Explicit service-role-only final migration 061 executor. Removes only named migration compatibility/control objects after evidence approval; never deletes product rows or runs during migration deployment.';

-- ─────────────────────────────────────────────────────────────────────────────
-- Private final-ledger access. No PostgREST surface is introduced.
-- ─────────────────────────────────────────────────────────────────────────────

revoke all on function kp_migration.reconcile_final_completion()
    from public, anon, authenticated;
revoke all on function kp_migration.assert_final_completion(boolean, boolean, boolean, boolean, boolean, text, boolean)
    from public, anon, authenticated;
revoke all on function kp_migration.record_final_completion(text, text, boolean, boolean, boolean, boolean)
    from public, anon, authenticated;
revoke all on function kp_migration.execute_final_compatibility_retirement(boolean, boolean, boolean, boolean, boolean, text, text, boolean)
    from public, anon, authenticated;

grant execute on function kp_migration.reconcile_final_completion()
    to service_role;
grant execute on function kp_migration.assert_final_completion(boolean, boolean, boolean, boolean, boolean, text, boolean)
    to service_role;
grant execute on function kp_migration.record_final_completion(text, text, boolean, boolean, boolean, boolean)
    to service_role;
grant execute on function kp_migration.execute_final_compatibility_retirement(boolean, boolean, boolean, boolean, boolean, text, text, boolean)
    to service_role;

-- Keep the final ledger private even though 036 granted service_role access to
-- all temporary control tables by default. Completion writes go through the
-- SECURITY DEFINER record function only.
revoke insert, update, delete, truncate
    on table kp_migration.completion_ledger
    from service_role;
grant select on table kp_migration.completion_ledger to service_role;

-- ─────────────────────────────────────────────────────────────────────────────
-- Installation assertions. They verify helper shape/security and do not call
-- reconciliation, completion, or retirement functions.
-- ─────────────────────────────────────────────────────────────────────────────

do $kp_final_completion_assertions$
declare
    expected record;
    v_function oid;
begin
    if to_regclass('kp_migration.completion_ledger') is null then
        raise exception using
            errcode = 'check_violation',
            message = 'Knowledge Platform migration 061 completion ledger was not created.';
    end if;

    if not exists (
        select 1
        from pg_catalog.pg_class c
        where c.oid = 'kp_migration.completion_ledger'::regclass
          and c.relrowsecurity
    ) then
        raise exception using
            errcode = 'check_violation',
            message = 'Knowledge Platform migration 061 completion ledger RLS is not enabled.';
    end if;

    if exists (
        select 1
        from pg_catalog.pg_policies p
        where p.schemaname = 'kp_migration'
          and p.tablename = 'completion_ledger'
    ) then
        raise exception using
            errcode = 'check_violation',
            message = 'Knowledge Platform migration 061 completion ledger must not expose client RLS policies.';
    end if;

    for expected in
        select function_name
        from (values
            ('kp_migration.reconcile_final_completion()'),
            ('kp_migration.assert_final_completion(boolean,boolean,boolean,boolean,boolean,text,boolean)'),
            ('kp_migration.record_final_completion(text,text,boolean,boolean,boolean,boolean)'),
            ('kp_migration.execute_final_compatibility_retirement(boolean,boolean,boolean,boolean,boolean,text,text,boolean)')
        ) as required(function_name)
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
           )
           or has_function_privilege('public', v_function, 'EXECUTE')
           or has_function_privilege('anon', v_function, 'EXECUTE')
           or has_function_privilege('authenticated', v_function, 'EXECUTE')
           or not has_function_privilege('service_role', v_function, 'EXECUTE')
        then
            raise exception using
                errcode = 'check_violation',
                message = format(
                    'Knowledge Platform migration 061 final helper security or grants are incompatible: %s.',
                    expected.function_name
                );
        end if;
    end loop;

    if not has_table_privilege('service_role', 'kp_migration.completion_ledger', 'SELECT')
       or has_table_privilege('service_role', 'kp_migration.completion_ledger', 'INSERT')
       or has_table_privilege('service_role', 'kp_migration.completion_ledger', 'UPDATE')
       or has_table_privilege('service_role', 'kp_migration.completion_ledger', 'DELETE')
       or has_table_privilege('anon', 'kp_migration.completion_ledger', 'SELECT')
       or has_table_privilege('authenticated', 'kp_migration.completion_ledger', 'SELECT')
    then
        raise exception using
            errcode = 'check_violation',
            message = 'Knowledge Platform migration 061 completion-ledger grants are not private and read-only.';
    end if;
end
$kp_final_completion_assertions$;
