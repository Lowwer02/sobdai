-- 053_kp_backfill_package_summaries.sql
-- Sobdai Knowledge Platform — reconciled frozen Migration 051 responsibility.
--
-- Migration-number audit
-- ----------------------
-- Production migration 052_kp_backfill_current_pointers.sql is committed and
-- is the current deployed Knowledge Platform maximum. Production migration
-- 053 is therefore the next identity and implements frozen responsibility 051.
--
-- Purpose
-- -------
-- Install controlled one-Summary execution and read-only reconciliation for
-- the single compatibility PackageSummary placement owned by each legacy
-- Summary. The legacy Package FK, slug, order, display order, and release
-- values remain the deterministic source.
--
-- Deployment boundary
-- -------------------
-- Deployment defines and validates functions only. It does not invoke a
-- helper, insert a PackageSummary, modify a Summary or SummaryVersion, update
-- production rows, or execute backfill. Legacy Package ownership/routes and
-- existing application behavior remain authoritative.

set local lock_timeout = '5s';

-- ─────────────────────────────────────────────────────────────────────────────
-- Fail closed on frozen dependencies 036, 045, 049, and 052
-- ─────────────────────────────────────────────────────────────────────────────

do $kp_package_placement_preflight$
declare
    expected record;
begin
    for expected in
        select object_name
        from (values
            ('public.profiles'),
            ('public.packages'),
            ('public.summaries'),
            ('public.summary_versions'),
            ('public.package_summaries'),
            ('kp_migration.migration_runs'),
            ('kp_migration.summary_ledger'),
            ('kp_migration.batch_progress'),
            ('kp_migration.summary_version_manifest')
        ) as required(object_name)
    loop
        if to_regclass(expected.object_name) is null then
            raise exception using
                errcode = 'check_violation',
                message = format('Knowledge Platform migration 053 prerequisite %s is missing.', expected.object_name);
        end if;
    end loop;

    if to_regprocedure('kp_migration.apply_current_summary_pointer_unit(uuid,uuid)') is null
       or to_regprocedure('kp_migration.reconcile_current_summary_pointers(uuid)') is null
    then
        raise exception using
            errcode = 'check_violation',
            message = 'Knowledge Platform migration 053 requires production migration 052 current-pointer helpers.';
    end if;

    for expected in
        select constraint_name
        from (values
            ('package_summaries_pkey'),
            ('package_summaries_status_check'),
            ('package_summaries_version_policy_check'),
            ('package_summaries_policy_pin_check'),
            ('package_summaries_lifecycle_audit_check'),
            ('package_summaries_package_fkey'),
            ('package_summaries_summary_fkey')
        ) as required(constraint_name)
    loop
        if not exists (
            select 1
            from pg_constraint c
            where c.conrelid = 'public.package_summaries'::regclass
              and c.conname = expected.constraint_name
              and c.convalidated
        ) then
            raise exception using
                errcode = 'check_violation',
                message = format('Knowledge Platform migration 053 requires validated PackageSummary constraint %I.', expected.constraint_name);
        end if;
    end loop;

    if not exists (
        select 1
        from pg_class c
        join pg_namespace n on n.oid = c.relnamespace
        join pg_index i on i.indexrelid = c.oid
        where n.nspname = 'public'
          and c.relname = 'package_summaries_package_legacy_slug_key'
          and i.indrelid = 'public.package_summaries'::regclass
          and i.indisunique
          and i.indisvalid
          and i.indisready
          and pg_get_expr(i.indpred, i.indrelid) = '(legacy_slug IS NOT NULL)'
    ) then
        raise exception using
            errcode = 'check_violation',
            message = 'Knowledge Platform migration 053 requires the valid Package-scoped legacy-slug uniqueness index.';
    end if;

    if not exists (
        select 1
        from pg_class c
        join pg_namespace n on n.oid = c.relnamespace
        where n.nspname = 'public'
          and c.relname = 'package_summaries'
          and c.relkind = 'r'
          and c.relrowsecurity
    ) then
        raise exception using
            errcode = 'check_violation',
            message = 'Knowledge Platform migration 053 requires PackageSummary RLS to remain enabled.';
    end if;
end
$kp_package_placement_preflight$;

-- ─────────────────────────────────────────────────────────────────────────────
-- Controlled one-Summary placement unit — defined only, never invoked here
-- ─────────────────────────────────────────────────────────────────────────────

create or replace function kp_migration.apply_package_summary_placement_unit(
    p_migration_run_id uuid,
    p_source_summary_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public, kp_migration, pg_temp
set lock_timeout = '5s'
as $function$
declare
    v_run kp_migration.migration_runs%rowtype;
    v_ledger kp_migration.summary_ledger%rowtype;
    v_manifest kp_migration.summary_version_manifest%rowtype;
    v_summary public.summaries%rowtype;
    v_placement public.package_summaries%rowtype;
    v_pointer_reconciliation record;
    v_expected_status text;
    v_final_ledger_state text;
    v_placement_exists boolean;
    v_placement_provenance jsonb;
    v_remaining bigint;
    v_now timestamptz := clock_timestamp();
begin
    if p_migration_run_id is null or p_source_summary_id is null then
        raise exception 'PackageSummary placement application requires migration_run_id and source_summary_id'
            using errcode = 'null_value_not_allowed';
    end if;

    select r.* into v_run
    from kp_migration.migration_runs r
    where r.id = p_migration_run_id
    for share;

    if not found or v_run.status <> 'running' or v_run.created_by is null then
        raise exception 'PackageSummary placement application requires a running migration run with actor provenance'
            using errcode = 'object_not_in_prerequisite_state';
    end if;

    if not exists (select 1 from public.profiles p where p.id = v_run.created_by) then
        raise exception 'PackageSummary placement migration actor does not exist'
            using errcode = 'foreign_key_violation';
    end if;

    select * into v_pointer_reconciliation
    from kp_migration.reconcile_current_summary_pointers(p_migration_run_id);

    if v_pointer_reconciliation.ledger_total = 0
       or v_pointer_reconciliation.ledger_total <> v_pointer_reconciliation.manifest_total
       or v_pointer_reconciliation.ledger_total <> v_pointer_reconciliation.recorded_total
       or v_pointer_reconciliation.pointer_required_total <> v_pointer_reconciliation.target_pointer_total
       or v_pointer_reconciliation.mismatch_total <> 0
    then
        raise exception 'PackageSummary placement pass requires complete zero-mismatch migration 052 pointer reconciliation'
            using errcode = 'object_not_in_prerequisite_state';
    end if;

    select l.* into v_ledger
    from kp_migration.summary_ledger l
    where l.migration_run_id = p_migration_run_id
      and l.source_summary_id = p_source_summary_id
    for update;

    if not found then
        raise exception 'PackageSummary placement ledger unit does not exist'
            using errcode = 'foreign_key_violation';
    end if;

    select m.* into v_manifest
    from kp_migration.summary_version_manifest m
    where m.migration_run_id = p_migration_run_id
      and m.source_summary_id = p_source_summary_id
    for share;

    if not found or v_manifest.state <> 'applied' then
        raise exception 'PackageSummary placement requires an applied initial-version manifest unit'
            using errcode = 'object_not_in_prerequisite_state';
    end if;

    select s.* into v_summary
    from public.summaries s
    where s.id = p_source_summary_id
    for share;

    if not found then
        raise exception 'PackageSummary placement source Summary does not exist'
            using errcode = 'foreign_key_violation';
    end if;

    if not exists (select 1 from public.packages p where p.id = v_summary.package_id) then
        raise exception 'PackageSummary placement source Package does not exist'
            using errcode = 'foreign_key_violation';
    end if;

    if v_summary.id is distinct from v_ledger.target_summary_id
       or v_summary.package_id is distinct from v_ledger.source_package_id
       or v_summary.updated_at is distinct from v_ledger.source_updated_at
       or octet_length(v_summary.content_md) is distinct from v_ledger.source_content_bytes
       or v_summary.updated_at is distinct from v_manifest.source_updated_at
       or v_summary.is_published is distinct from v_manifest.legacy_is_published
       or v_ledger.target_revision_id is distinct from v_manifest.target_revision_id
       or (v_ledger.target_package_id is not null and v_ledger.target_package_id <> v_summary.package_id)
       or (v_ledger.target_legacy_slug is not null and v_ledger.target_legacy_slug <> v_summary.slug)
       or not (v_ledger.provenance ? 'current_summary_pointer')
    then
        raise exception 'PackageSummary placement ledger or frozen legacy source evidence is inconsistent'
            using errcode = 'serialization_failure';
    end if;

    if btrim(v_summary.slug) = ''
       or v_summary.slug <> lower(btrim(v_summary.slug))
    then
        raise exception 'PackageSummary placement requires the exact legacy slug to satisfy the frozen lowercase route contract'
            using errcode = 'check_violation';
    end if;

    if v_manifest.mapping_status = 'published' then
        if v_summary.current_published_version_id is distinct from v_manifest.target_revision_id then
            raise exception 'active PackageSummary placement requires the reconciled current published revision'
                using errcode = 'check_violation';
        end if;
        v_expected_status := 'active';
    elsif v_manifest.mapping_status in ('draft', 'quarantined') then
        if v_summary.current_published_version_id is not null then
            raise exception 'draft or quarantined PackageSummary placement requires a null current pointer'
                using errcode = 'check_violation';
        end if;
        v_expected_status := 'draft';
    else
        raise exception 'PackageSummary placement encountered an unsupported initial-version mapping status'
            using errcode = 'check_violation';
    end if;

    v_final_ledger_state := case
        when v_manifest.mapping_status = 'quarantined'
          or v_ledger.target_content_checksum is null
        then 'skipped'
        else 'succeeded'
    end;

    if v_ledger.state not in ('in_progress', v_final_ledger_state) then
        raise exception 'PackageSummary placement ledger unit has an incompatible completion state'
            using errcode = 'object_not_in_prerequisite_state';
    end if;

    if exists (
        select 1
        from public.package_summaries ps
        where ps.summary_id = p_source_summary_id
          and ps.package_id <> v_summary.package_id
    ) then
        raise exception 'PackageSummary compatibility backfill permits exactly one placement per legacy Summary'
            using errcode = 'unique_violation';
    end if;

    if exists (
        select 1
        from public.package_summaries ps
        where ps.package_id = v_summary.package_id
          and ps.legacy_slug = v_summary.slug
          and ps.summary_id <> p_source_summary_id
    ) then
        raise exception 'PackageSummary legacy route collides within the source Package'
            using errcode = 'unique_violation';
    end if;

    select ps.* into v_placement
    from public.package_summaries ps
    where ps.package_id = v_summary.package_id
      and ps.summary_id = p_source_summary_id
    for share;
    v_placement_exists := found;

    if v_placement_exists and (
        v_placement.status <> v_expected_status
        or v_placement.version_policy <> 'latest_published'
        or v_placement.pinned_summary_version_id is not null
        or v_placement.sort_order <> v_summary.sort_order
        or v_placement.display_order <> v_summary.display_order
        or v_placement.released_at is distinct from v_summary.released_at
        or v_placement.navigation_label is not null
        or v_placement.legacy_slug <> v_summary.slug
        or v_placement.created_by <> v_run.created_by
        or (
            v_expected_status = 'active'
            and (
                v_placement.activated_by <> v_run.created_by
                or v_placement.activated_at is null
                or v_placement.hidden_by is not null
                or v_placement.hidden_at is not null
            )
        )
        or (
            v_expected_status = 'draft'
            and (
                v_placement.activated_by is not null
                or v_placement.activated_at is not null
                or v_placement.hidden_by is not null
                or v_placement.hidden_at is not null
            )
        )
    ) then
        raise exception 'existing PackageSummary placement does not match the frozen compatibility mapping'
            using errcode = 'serialization_failure';
    end if;

    v_placement_provenance := v_ledger.provenance -> 'package_summary_placement';

    if v_placement_provenance is not null then
        if not v_placement_exists
           or jsonb_typeof(v_placement_provenance) <> 'object'
           or v_placement_provenance ->> 'migration' <> '53'
           or v_placement_provenance ->> 'frozen_responsibility' <> '51'
           or v_placement_provenance ->> 'package_id' is distinct from v_summary.package_id::text
           or v_placement_provenance ->> 'summary_id' is distinct from p_source_summary_id::text
           or v_placement_provenance ->> 'status' is distinct from v_expected_status
           or v_placement_provenance ->> 'legacy_slug' is distinct from v_summary.slug
           or v_ledger.target_package_id is distinct from v_summary.package_id
           or v_ledger.target_legacy_slug is distinct from v_summary.slug
           or v_ledger.state <> v_final_ledger_state
           or v_ledger.completed_at is null
        then
            raise exception 'recorded PackageSummary placement provenance does not reconcile with the live target'
                using errcode = 'serialization_failure';
        end if;

        return v_summary.package_id;
    end if;

    if not v_placement_exists then
        insert into public.package_summaries (
            package_id, summary_id,
            status, version_policy, pinned_summary_version_id,
            sort_order, display_order, released_at,
            navigation_label, legacy_slug,
            created_by, created_at, updated_at,
            activated_by, activated_at, hidden_by, hidden_at
        ) values (
            v_summary.package_id,
            p_source_summary_id,
            v_expected_status,
            'latest_published',
            null,
            v_summary.sort_order,
            v_summary.display_order,
            v_summary.released_at,
            null,
            v_summary.slug,
            v_run.created_by,
            v_now,
            v_now,
            case when v_expected_status = 'active' then v_run.created_by else null end,
            case when v_expected_status = 'active' then v_now else null end,
            null,
            null
        );
    end if;

    update kp_migration.summary_ledger
    set target_package_id = v_summary.package_id,
        target_legacy_slug = v_summary.slug,
        state = v_final_ledger_state,
        attempt_count = attempt_count + 1,
        last_attempted_at = v_now,
        completed_at = v_now,
        error_code = case
            when v_manifest.mapping_status = 'quarantined'
            then coalesce(error_code, 'QUARANTINED_CONTENT')
            when v_ledger.target_content_checksum is null
            then 'INCOMPLETE_CONTENT'
            else null
        end,
        error_message = case
            when v_manifest.mapping_status = 'quarantined'
            then coalesce(error_message, v_manifest.quarantine_reason)
            when v_ledger.target_content_checksum is null
            then 'Initial draft content is incomplete; placement was retained as draft.'
            else null
        end,
        provenance = jsonb_set(
            provenance,
            '{package_summary_placement}',
            jsonb_build_object(
                'migration', 53,
                'frozen_responsibility', 51,
                'package_id', v_summary.package_id,
                'summary_id', p_source_summary_id,
                'status', v_expected_status,
                'version_policy', 'latest_published',
                'legacy_slug', v_summary.slug,
                'sort_order', v_summary.sort_order,
                'display_order', v_summary.display_order,
                'released_at', v_summary.released_at,
                'applied_at', v_now
            ),
            true
        )
    where migration_run_id = p_migration_run_id
      and source_summary_id = p_source_summary_id;

    select count(*) into v_remaining
    from kp_migration.summary_ledger l
    where l.migration_run_id = p_migration_run_id
      and not (l.provenance ? 'package_summary_placement');

    insert into kp_migration.batch_progress (
        migration_run_id, batch_key, state, last_source_summary_id,
        source_updated_watermark,
        processed_count, succeeded_count, failed_count, skipped_count,
        started_at, heartbeat_at, completed_at
    ) values (
        p_migration_run_id,
        'package_summary_placements',
        case when v_remaining = 0 then 'completed' else 'running' end,
        p_source_summary_id,
        v_ledger.source_updated_at,
        1,
        case when v_final_ledger_state = 'succeeded' then 1 else 0 end,
        0,
        case when v_final_ledger_state = 'skipped' then 1 else 0 end,
        v_now,
        v_now,
        case when v_remaining = 0 then v_now else null end
    )
    on conflict (migration_run_id, batch_key) do update
    set state = excluded.state,
        last_source_summary_id = excluded.last_source_summary_id,
        source_updated_watermark = greatest(
            kp_migration.batch_progress.source_updated_watermark,
            excluded.source_updated_watermark
        ),
        processed_count = kp_migration.batch_progress.processed_count + 1,
        succeeded_count = kp_migration.batch_progress.succeeded_count + excluded.succeeded_count,
        skipped_count = kp_migration.batch_progress.skipped_count + excluded.skipped_count,
        started_at = coalesce(kp_migration.batch_progress.started_at, excluded.started_at),
        heartbeat_at = excluded.heartbeat_at,
        completed_at = excluded.completed_at,
        error_message = null;

    return v_summary.package_id;
end
$function$;

-- Read-only reconciliation; never repairs placement or ledger rows.
create or replace function kp_migration.reconcile_package_summary_placements(
    p_migration_run_id uuid
)
returns table (
    ledger_total bigint,
    placement_total bigint,
    active_total bigint,
    draft_total bigint,
    succeeded_total bigint,
    skipped_total bigint,
    mismatch_total bigint
)
language sql
stable
security definer
set search_path = pg_catalog, public, kp_migration, pg_temp
as $function$
    with ledger as (
        select l.*
        from kp_migration.summary_ledger l
        where l.migration_run_id = p_migration_run_id
    ), manifest as (
        select m.*
        from kp_migration.summary_version_manifest m
        where m.migration_run_id = p_migration_run_id
    )
    select
        (select count(*) from ledger),
        (
            select count(*)
            from ledger l
            join public.package_summaries ps
              on ps.package_id = l.target_package_id
             and ps.summary_id = l.source_summary_id
        ),
        (
            select count(*)
            from ledger l
            join public.package_summaries ps
              on ps.package_id = l.target_package_id
             and ps.summary_id = l.source_summary_id
            where ps.status = 'active'
        ),
        (
            select count(*)
            from ledger l
            join public.package_summaries ps
              on ps.package_id = l.target_package_id
             and ps.summary_id = l.source_summary_id
            where ps.status = 'draft'
        ),
        (select count(*) from ledger where state = 'succeeded'),
        (select count(*) from ledger where state = 'skipped'),
        (
            (select count(*)
             from public.package_summaries ps
             left join ledger l
               on l.source_summary_id = ps.summary_id
              and l.source_package_id = ps.package_id
             where l.source_summary_id is null)
            +
            (select count(*)
             from ledger l
             left join manifest m on m.source_summary_id = l.source_summary_id
             where m.source_summary_id is null)
            +
            (select count(*)
             from manifest m
             where not exists (
                 select 1
                 from ledger l
                 join kp_migration.migration_runs r on r.id = l.migration_run_id
                 join public.summaries s on s.id = m.source_summary_id
                 join public.package_summaries ps
                   on ps.package_id = s.package_id
                  and ps.summary_id = s.id
                 where l.source_summary_id = m.source_summary_id
                   and m.state = 'applied'
                   and l.target_summary_id = s.id
                   and l.source_package_id = s.package_id
                   and l.target_package_id = s.package_id
                   and l.target_legacy_slug = s.slug
                   and s.updated_at = l.source_updated_at
                   and octet_length(s.content_md) = l.source_content_bytes
                   and s.is_published = m.legacy_is_published
                   and s.current_published_version_id is not distinct from case
                       when m.mapping_status = 'published' then m.target_revision_id
                       else null
                   end
                   and ps.status = case
                       when m.mapping_status = 'published' then 'active'
                       else 'draft'
                   end
                   and ps.version_policy = 'latest_published'
                   and ps.pinned_summary_version_id is null
                   and ps.sort_order = s.sort_order
                   and ps.display_order = s.display_order
                   and ps.released_at is not distinct from s.released_at
                   and ps.navigation_label is null
                   and ps.legacy_slug = s.slug
                   and ps.created_by = r.created_by
                   and (
                       (ps.status = 'active' and ps.activated_by = r.created_by and ps.activated_at is not null)
                       or (ps.status = 'draft' and ps.activated_by is null and ps.activated_at is null)
                   )
                   and ps.hidden_by is null
                   and ps.hidden_at is null
                   and l.state = case
                       when m.mapping_status = 'quarantined' or l.target_content_checksum is null
                       then 'skipped'
                       else 'succeeded'
                   end
                   and l.completed_at is not null
                   and l.provenance ? 'package_summary_placement'
                   and l.provenance #>> '{package_summary_placement,migration}' = '53'
                   and l.provenance #>> '{package_summary_placement,frozen_responsibility}' = '51'
                   and l.provenance #>> '{package_summary_placement,package_id}' = s.package_id::text
                   and l.provenance #>> '{package_summary_placement,summary_id}' = s.id::text
                   and l.provenance #>> '{package_summary_placement,status}' = ps.status
                   and l.provenance #>> '{package_summary_placement,version_policy}' = 'latest_published'
                   and l.provenance #>> '{package_summary_placement,legacy_slug}' = s.slug
             ))
        );
$function$;

comment on function kp_migration.apply_package_summary_placement_unit(uuid, uuid) is
    'Controlled frozen migration 051 executor installed as production migration 053. One explicit call creates or verifies one compatibility placement and completes its ledger unit.';
comment on function kp_migration.reconcile_package_summary_placements(uuid) is
    'Read-only exact placement, route, order, lifecycle, pointer, and ledger reconciliation for frozen migration 051.';

-- ─────────────────────────────────────────────────────────────────────────────
-- Private service/operator execution only; no new RLS surface
-- ─────────────────────────────────────────────────────────────────────────────

revoke all on function kp_migration.apply_package_summary_placement_unit(uuid, uuid)
    from public, anon, authenticated;
revoke all on function kp_migration.reconcile_package_summary_placements(uuid)
    from public, anon, authenticated;

grant execute on function kp_migration.apply_package_summary_placement_unit(uuid, uuid)
    to service_role;
grant execute on function kp_migration.reconcile_package_summary_placements(uuid)
    to service_role;

-- ─────────────────────────────────────────────────────────────────────────────
-- Fail-closed post-validation; still no backfill invocation
-- ─────────────────────────────────────────────────────────────────────────────

do $kp_package_placement_assertions$
declare
    expected record;
    function_is_security_definer boolean;
    function_config text[];
begin
    for expected in
        select signature
        from (values
            ('kp_migration.apply_package_summary_placement_unit(uuid,uuid)'),
            ('kp_migration.reconcile_package_summary_placements(uuid)')
        ) as required(signature)
    loop
        if to_regprocedure(expected.signature) is null
           or has_function_privilege('anon', expected.signature, 'EXECUTE')
           or has_function_privilege('authenticated', expected.signature, 'EXECUTE')
           or not has_function_privilege('service_role', expected.signature, 'EXECUTE')
        then
            raise exception using
                errcode = 'check_violation',
                message = format('Knowledge Platform migration 053 drift: helper %s has incompatible existence or grants.', expected.signature);
        end if;
    end loop;

    for expected in
        select signature, require_lock_timeout
        from (values
            ('kp_migration.apply_package_summary_placement_unit(uuid,uuid)', true),
            ('kp_migration.reconcile_package_summary_placements(uuid)', false)
        ) as required(signature, require_lock_timeout)
    loop
        select p.prosecdef, p.proconfig
        into function_is_security_definer, function_config
        from pg_proc p
        where p.oid = expected.signature::regprocedure;

        if not function_is_security_definer
           or function_config is null
           or not ('search_path=pg_catalog, public, kp_migration, pg_temp' = any(function_config))
           or (
               expected.require_lock_timeout
               and not ('lock_timeout=5s' = any(function_config))
           )
        then
            raise exception using
                errcode = 'check_violation',
                message = format('Knowledge Platform migration 053 drift: helper %s has incompatible security configuration.', expected.signature);
        end if;
    end loop;
end
$kp_package_placement_assertions$;
