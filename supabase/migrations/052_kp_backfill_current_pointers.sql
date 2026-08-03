-- 052_kp_backfill_current_pointers.sql
-- Sobdai Knowledge Platform — reconciled frozen Migration 050 responsibility.
--
-- Migration-number audit
-- ----------------------
-- Production migration 051_kp_backfill_initial_summary_versions.sql is
-- committed and is the current repository maximum. Production migration 052
-- is therefore the next identity and implements frozen responsibility 050.
--
-- Purpose
-- -------
-- Install the controlled one-Summary executor and read-only reconciliation
-- helper for current published-version pointers. Pointer selection is taken
-- only from the approved migration ledger/initial-version manifest; it is
-- never inferred from a maximum revision number.
--
-- Deployment boundary
-- -------------------
-- Deployment defines and validates functions only. It does not invoke a
-- helper, update a Summary, insert a SummaryVersion, mutate legacy authority,
-- or execute production backfill. Target reads remain off/shadow.

set local lock_timeout = '5s';

-- ─────────────────────────────────────────────────────────────────────────────
-- Fail closed on frozen dependencies 036, 043, 048, and 051
-- ─────────────────────────────────────────────────────────────────────────────

do $kp_current_pointers_preflight$
declare
    expected record;
begin
    for expected in
        select object_name
        from (values
            ('public.summaries'),
            ('public.summary_versions'),
            ('kp_migration.migration_runs'),
            ('kp_migration.summary_ledger'),
            ('kp_migration.batch_progress'),
            ('kp_migration.summary_version_manifest')
        ) as required(object_name)
    loop
        if to_regclass(expected.object_name) is null then
            raise exception using
                errcode = 'check_violation',
                message = format('Knowledge Platform migration 052 prerequisite %s is missing.', expected.object_name);
        end if;
    end loop;

    if to_regprocedure('kp_migration.apply_initial_summary_version_unit(uuid,uuid)') is null
       or to_regprocedure('kp_migration.reconcile_initial_summary_versions(uuid)') is null
    then
        raise exception using
            errcode = 'check_violation',
            message = 'Knowledge Platform migration 052 requires production migration 051 initial-version helpers.';
    end if;

    if not exists (
        select 1
        from pg_constraint c
        where c.conrelid = 'public.summaries'::regclass
          and c.conname = 'summaries_current_published_version_fkey'
          and c.contype = 'f'
          and c.confrelid = 'public.summary_versions'::regclass
          and c.confdeltype = 'r'
          and c.condeferrable
          and c.condeferred
          and not c.convalidated
          and pg_get_constraintdef(c.oid) ilike '%FOREIGN KEY (id, current_published_version_id)%'
          and pg_get_constraintdef(c.oid) ilike '%REFERENCES summary_versions(summary_id, id)%'
    ) then
        raise exception using
            errcode = 'check_violation',
            message = 'Knowledge Platform migration 052 requires the deferred, NOT VALID same-parent current-pointer FK from migration 043.';
    end if;

    if not exists (
        select 1
        from pg_class c
        join pg_namespace n on n.oid = c.relnamespace
        join pg_index i on i.indexrelid = c.oid
        where n.nspname = 'public'
          and c.relname = 'summaries_current_published_version_idx'
          and i.indrelid = 'public.summaries'::regclass
          and i.indisvalid
          and i.indisready
    ) then
        raise exception using
            errcode = 'check_violation',
            message = 'Knowledge Platform migration 052 requires the valid current-pointer index from production migration 048.';
    end if;

    -- The audited production baseline has no generic Summary updated_at
    -- trigger. Such a trigger would rewrite frozen source evidence when only
    -- the target pointer changes, so execution must fail rather than conceal
    -- that operational drift.
    if exists (
        select 1
        from pg_trigger t
        where t.tgrelid = 'public.summaries'::regclass
          and t.tgname = 'handle_updated_at_summaries'
          and not t.tgisinternal
          and t.tgenabled <> 'D'
    ) then
        raise exception using
            errcode = 'check_violation',
            message = 'Knowledge Platform migration 052 cannot preserve frozen Summary source evidence while handle_updated_at_summaries is enabled.';
    end if;
end
$kp_current_pointers_preflight$;

-- ─────────────────────────────────────────────────────────────────────────────
-- Controlled one-Summary pointer unit — defined only, never invoked here
-- ─────────────────────────────────────────────────────────────────────────────

create or replace function kp_migration.apply_current_summary_pointer_unit(
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
    v_revision public.summary_versions%rowtype;
    v_initial_reconciliation record;
    v_expected_pointer_id uuid;
    v_recorded_total bigint;
    v_remaining bigint;
    v_now timestamptz := clock_timestamp();
    v_pointer_provenance jsonb;
begin
    if p_migration_run_id is null or p_source_summary_id is null then
        raise exception 'current Summary pointer application requires migration_run_id and source_summary_id'
            using errcode = 'null_value_not_allowed';
    end if;

    select r.* into v_run
    from kp_migration.migration_runs r
    where r.id = p_migration_run_id
    for share;

    if not found or v_run.status <> 'running' then
        raise exception 'current Summary pointer application requires a running migration run'
            using errcode = 'object_not_in_prerequisite_state';
    end if;

    -- A pointer pass is valid only for an exact, fully applied revision
    -- manifest. No live Summary may be omitted and no stale ledger row may be
    -- silently accepted.
    if exists (
        select 1
        from kp_migration.summary_ledger l
        left join kp_migration.summary_version_manifest m
          on m.migration_run_id = l.migration_run_id
         and m.source_summary_id = l.source_summary_id
        left join public.summaries s on s.id = l.source_summary_id
        where l.migration_run_id = p_migration_run_id
          and (m.source_summary_id is null or s.id is null)
    ) or exists (
        select 1
        from public.summaries s
        left join kp_migration.summary_ledger l
          on l.migration_run_id = p_migration_run_id
         and l.source_summary_id = s.id
        where l.source_summary_id is null
    ) then
        raise exception 'current Summary pointer run does not exactly cover the live Summary inventory and revision manifest'
            using errcode = 'check_violation';
    end if;

    if exists (
        select 1
        from kp_migration.summary_version_manifest m
        where m.migration_run_id = p_migration_run_id
          and m.state <> 'applied'
    ) then
        raise exception 'current Summary pointers require every initial SummaryVersion manifest unit to be applied'
            using errcode = 'object_not_in_prerequisite_state';
    end if;

    select count(*) into v_recorded_total
    from kp_migration.summary_ledger l
    where l.migration_run_id = p_migration_run_id
      and l.provenance ? 'current_summary_pointer';

    -- Before the first pointer write, consume migration 051's read-only gate.
    -- Later units cannot reuse that gate because an expected pointer would
    -- correctly appear as drift to the earlier no-pointer responsibility.
    if v_recorded_total = 0 then
        select * into v_initial_reconciliation
        from kp_migration.reconcile_initial_summary_versions(p_migration_run_id);

        if v_initial_reconciliation.manifest_total = 0
           or v_initial_reconciliation.manifest_total <> v_initial_reconciliation.applied_total
           or v_initial_reconciliation.manifest_total <> v_initial_reconciliation.target_revision_total
           or v_initial_reconciliation.mismatch_total <> 0
        then
            raise exception 'current Summary pointer pass requires a complete zero-mismatch migration 051 reconciliation'
                using errcode = 'object_not_in_prerequisite_state';
        end if;
    end if;

    select l.* into v_ledger
    from kp_migration.summary_ledger l
    where l.migration_run_id = p_migration_run_id
      and l.source_summary_id = p_source_summary_id
    for update;

    if not found or v_ledger.state <> 'in_progress' then
        raise exception 'current Summary pointer ledger unit must exist in in_progress state'
            using errcode = 'object_not_in_prerequisite_state';
    end if;

    select m.* into v_manifest
    from kp_migration.summary_version_manifest m
    where m.migration_run_id = p_migration_run_id
      and m.source_summary_id = p_source_summary_id
    for share;

    if not found or v_manifest.state <> 'applied' then
        raise exception 'current Summary pointer requires an applied initial-version manifest unit'
            using errcode = 'object_not_in_prerequisite_state';
    end if;

    select s.* into v_summary
    from public.summaries s
    where s.id = p_source_summary_id
    for update;

    if not found then
        raise exception 'current Summary pointer source Summary does not exist'
            using errcode = 'foreign_key_violation';
    end if;

    select v.* into v_revision
    from public.summary_versions v
    where v.id = v_ledger.target_revision_id
    for share;

    if not found
       or v_ledger.target_summary_id is distinct from v_summary.id
       or v_ledger.target_revision_id is distinct from v_manifest.target_revision_id
       or v_revision.summary_id is distinct from v_summary.id
       or v_revision.revision_number <> 1
       or v_summary.updated_at is distinct from v_manifest.source_updated_at
       or octet_length(v_summary.content_md) is distinct from v_manifest.source_content_bytes
       or v_summary.is_published is distinct from v_manifest.legacy_is_published
    then
        raise exception 'current Summary pointer ledger, revision, or frozen source evidence is inconsistent'
            using errcode = 'serialization_failure';
    end if;

    if v_manifest.mapping_status = 'published' then
        if not v_summary.is_published or v_revision.status <> 'published' then
            raise exception 'current Summary pointer requires its ledger-addressed revision to be published'
                using errcode = 'check_violation';
        end if;
        v_expected_pointer_id := v_ledger.target_revision_id;
    elsif v_manifest.mapping_status in ('draft', 'quarantined') then
        if v_revision.status <> 'draft' then
            raise exception 'draft or quarantined Summary mapping must retain a draft revision and a null pointer'
                using errcode = 'check_violation';
        end if;
        v_expected_pointer_id := null;
    else
        raise exception 'current Summary pointer encountered an unsupported initial-version mapping status'
            using errcode = 'check_violation';
    end if;

    if v_summary.current_published_version_id is not null
       and v_summary.current_published_version_id is distinct from v_expected_pointer_id
    then
        raise exception 'current Summary pointer conflicts with the ledger-addressed revision'
            using errcode = 'serialization_failure';
    end if;

    v_pointer_provenance := v_ledger.provenance -> 'current_summary_pointer';

    if v_pointer_provenance is not null then
        if jsonb_typeof(v_pointer_provenance) <> 'object'
           or v_pointer_provenance ->> 'migration' <> '52'
           or v_pointer_provenance ->> 'frozen_responsibility' <> '50'
           or v_pointer_provenance ->> 'mapping_status' is distinct from v_manifest.mapping_status
           or (v_pointer_provenance -> 'pointer_required') is distinct from to_jsonb(v_expected_pointer_id is not null)
           or (
               v_expected_pointer_id is null
               and (v_pointer_provenance -> 'expected_pointer_id') is distinct from 'null'::jsonb
           )
           or (
               v_expected_pointer_id is not null
               and (v_pointer_provenance -> 'expected_pointer_id') is distinct from to_jsonb(v_expected_pointer_id)
           )
           or v_summary.current_published_version_id is distinct from v_expected_pointer_id
        then
            raise exception 'recorded current Summary pointer provenance does not reconcile with the live target'
                using errcode = 'serialization_failure';
        end if;

        return v_expected_pointer_id;
    end if;

    if v_expected_pointer_id is not null
       and v_summary.current_published_version_id is null
    then
        update public.summaries
        set current_published_version_id = v_expected_pointer_id
        where id = p_source_summary_id
          and current_published_version_id is null;

        if not found then
            raise exception 'current Summary pointer changed concurrently'
                using errcode = 'serialization_failure';
        end if;
    end if;

    update kp_migration.summary_ledger
    set state = 'in_progress',
        attempt_count = attempt_count + 1,
        last_attempted_at = v_now,
        provenance = jsonb_set(
            provenance,
            '{current_summary_pointer}',
            jsonb_build_object(
                'migration', 52,
                'frozen_responsibility', 50,
                'mapping_status', v_manifest.mapping_status,
                'pointer_required', v_expected_pointer_id is not null,
                'expected_pointer_id', v_expected_pointer_id,
                'resolved_at', v_now
            ),
            true
        )
    where migration_run_id = p_migration_run_id
      and source_summary_id = p_source_summary_id;

    select count(*) into v_remaining
    from kp_migration.summary_ledger l
    where l.migration_run_id = p_migration_run_id
      and not (l.provenance ? 'current_summary_pointer');

    insert into kp_migration.batch_progress (
        migration_run_id, batch_key, state, last_source_summary_id,
        source_updated_watermark,
        processed_count, succeeded_count, failed_count, skipped_count,
        started_at, heartbeat_at, completed_at
    ) values (
        p_migration_run_id,
        'current_summary_pointers',
        case when v_remaining = 0 then 'completed' else 'running' end,
        p_source_summary_id,
        v_manifest.source_updated_at,
        1, 1, 0, 0,
        v_now, v_now,
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
        succeeded_count = kp_migration.batch_progress.succeeded_count + 1,
        started_at = coalesce(kp_migration.batch_progress.started_at, excluded.started_at),
        heartbeat_at = excluded.heartbeat_at,
        completed_at = excluded.completed_at,
        error_message = null;

    return v_expected_pointer_id;
end
$function$;

-- Read-only reconciliation. It reports both eligible pointers and intentional
-- nulls; it never repairs or infers a pointer.
create or replace function kp_migration.reconcile_current_summary_pointers(
    p_migration_run_id uuid
)
returns table (
    ledger_total bigint,
    manifest_total bigint,
    pointer_required_total bigint,
    pointer_excluded_total bigint,
    recorded_total bigint,
    target_pointer_total bigint,
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
        (select count(*) from manifest),
        (select count(*) from manifest where mapping_status = 'published'),
        (select count(*) from manifest where mapping_status in ('draft', 'quarantined')),
        (select count(*) from ledger where provenance ? 'current_summary_pointer'),
        (
            select count(*)
            from manifest m
            join public.summaries s on s.id = m.source_summary_id
            where s.current_published_version_id = m.target_revision_id
        ),
        (
            (select count(*)
             from ledger l
             left join manifest m on m.source_summary_id = l.source_summary_id
             where m.source_summary_id is null)
            +
            (select count(*)
             from public.summaries s
             left join ledger l on l.source_summary_id = s.id
             where l.source_summary_id is null)
            +
            (select count(*)
             from manifest m
             where not exists (
                 select 1
                 from ledger l
                 join public.summaries s on s.id = m.source_summary_id
                 join public.summary_versions v on v.id = m.target_revision_id
                 where l.source_summary_id = m.source_summary_id
                   and m.state = 'applied'
                   and l.target_summary_id = s.id
                   and l.target_revision_id = m.target_revision_id
                   and v.summary_id = s.id
                   and v.revision_number = 1
                   and s.updated_at = m.source_updated_at
                   and octet_length(s.content_md) = m.source_content_bytes
                   and s.is_published = m.legacy_is_published
                   and v.status = case when m.mapping_status = 'published' then 'published' else 'draft' end
                   and s.current_published_version_id is not distinct from case
                       when m.mapping_status = 'published' then m.target_revision_id
                       else null
                   end
                   and l.provenance ? 'current_summary_pointer'
                   and l.provenance #>> '{current_summary_pointer,migration}' = '52'
                   and l.provenance #>> '{current_summary_pointer,frozen_responsibility}' = '50'
                   and l.provenance #>> '{current_summary_pointer,mapping_status}' = m.mapping_status
                   and (l.provenance #> '{current_summary_pointer,pointer_required}')
                       = to_jsonb(m.mapping_status = 'published')
                   and (l.provenance #> '{current_summary_pointer,expected_pointer_id}')
                       is not distinct from case
                           when m.mapping_status = 'published' then to_jsonb(m.target_revision_id)
                           else 'null'::jsonb
                       end
             ))
        );
$function$;

comment on function kp_migration.apply_current_summary_pointer_unit(uuid, uuid) is
    'Controlled frozen migration 050 executor installed as production migration 052. One explicit call resolves one Summary pointer strictly from the ledger and applied revision manifest.';
comment on function kp_migration.reconcile_current_summary_pointers(uuid) is
    'Read-only ledger/manifest/current-pointer truth-table reconciliation. It performs no repair and never infers a revision by order.';

-- ─────────────────────────────────────────────────────────────────────────────
-- Private service/operator execution only; no new RLS surface
-- ─────────────────────────────────────────────────────────────────────────────

revoke all on function kp_migration.apply_current_summary_pointer_unit(uuid, uuid)
    from public, anon, authenticated;
revoke all on function kp_migration.reconcile_current_summary_pointers(uuid)
    from public, anon, authenticated;

grant execute on function kp_migration.apply_current_summary_pointer_unit(uuid, uuid)
    to service_role;
grant execute on function kp_migration.reconcile_current_summary_pointers(uuid)
    to service_role;

-- ─────────────────────────────────────────────────────────────────────────────
-- Fail-closed post-validation; still no backfill invocation
-- ─────────────────────────────────────────────────────────────────────────────

do $kp_current_pointers_assertions$
declare
    expected record;
    function_is_security_definer boolean;
    function_config text[];
begin
    for expected in
        select signature
        from (values
            ('kp_migration.apply_current_summary_pointer_unit(uuid,uuid)'),
            ('kp_migration.reconcile_current_summary_pointers(uuid)')
        ) as required(signature)
    loop
        if to_regprocedure(expected.signature) is null
           or has_function_privilege('anon', expected.signature, 'EXECUTE')
           or has_function_privilege('authenticated', expected.signature, 'EXECUTE')
           or not has_function_privilege('service_role', expected.signature, 'EXECUTE')
        then
            raise exception using
                errcode = 'check_violation',
                message = format('Knowledge Platform migration 052 drift: helper %s has incompatible existence or grants.', expected.signature);
        end if;
    end loop;

    for expected in
        select signature, require_lock_timeout
        from (values
            ('kp_migration.apply_current_summary_pointer_unit(uuid,uuid)', true),
            ('kp_migration.reconcile_current_summary_pointers(uuid)', false)
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
                message = format('Knowledge Platform migration 052 drift: helper %s has incompatible security configuration.', expected.signature);
        end if;
    end loop;
end
$kp_current_pointers_assertions$;
