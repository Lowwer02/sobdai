-- 049_kp_backfill_summary_identity.sql
-- Sobdai Knowledge Platform — reconciled frozen Migration 047 responsibility.
--
-- Migration-number audit
-- ----------------------
-- Production migration 048_kp_online_indexes.sql implemented the frozen
-- migration 046 index responsibility. Production 048 is committed and is the
-- current repository maximum, so 049 is the next monotonic production number.
--
-- Purpose
-- -------
-- Install the private, one-Summary-at-a-time executor for the frozen Summary
-- identity backfill. Deployment of this file does not execute the executor,
-- seed a manifest, or update any existing Summary or migration-ledger row.
--
-- Frozen execution boundary
-- -------------------------
-- * An operator first freezes and loads the approved code/slug manifest into
--   kp_migration.summary_ledger under a running migration run.
-- * Each explicit function call is one transaction for one Summary aggregate.
-- * The executor preserves the Summary UUID and every legacy authority column.
-- * It copies title to canonical_title, applies the frozen product-entitled and
--   active mappings, records creation provenance, and advances the allocator
--   beyond every code reserved by the run manifest.
-- * Later frozen migrations remain responsible for revisions, pointers,
--   placements, aliases, constraint validation, and required-column tightening.
--
-- No backfill call appears in this migration. Production data execution remains
-- a separate, explicitly approved, resumable operator activity.

set local lock_timeout = '5s';

-- ─────────────────────────────────────────────────────────────────────────────
-- Fail closed before installing the controlled executor
-- ─────────────────────────────────────────────────────────────────────────────

do $kp_summary_identity_executor_preflight$
declare
    expected record;
begin
    if to_regclass('public.summaries') is null
       or to_regclass('public.summary_code_seq') is null
       or to_regclass('kp_migration.migration_runs') is null
       or to_regclass('kp_migration.summary_ledger') is null
       or to_regclass('kp_migration.batch_progress') is null
    then
        raise exception using
            errcode = 'check_violation',
            message = 'Knowledge Platform migration 049 prerequisites are missing: summaries, allocator, or migration-control tables.';
    end if;

    if to_regprocedure('public.format_summary_code(bigint)') is null
       or to_regprocedure('public.allocate_summary_codes(integer)') is null
    then
        raise exception using
            errcode = 'check_violation',
            message = 'Knowledge Platform migration 049 requires the frozen Summary-code allocator functions.';
    end if;

    for expected in
        select *
        from (values
            ('summaries', 'id', 'uuid'),
            ('summaries', 'package_id', 'uuid'),
            ('summaries', 'title', 'text'),
            ('summaries', 'slug', 'text'),
            ('summaries', 'content_md', 'text'),
            ('summaries', 'updated_at', 'timestamptz'),
            ('summaries', 'summary_code', 'text'),
            ('summaries', 'canonical_slug', 'text'),
            ('summaries', 'canonical_title', 'text'),
            ('summaries', 'visibility', 'text'),
            ('summaries', 'lifecycle_status', 'text'),
            ('summaries', 'created_by', 'uuid'),
            ('summaries', 'archived_by', 'uuid'),
            ('summaries', 'archived_at', 'timestamptz'),
            ('migration_runs', 'id', 'uuid'),
            ('migration_runs', 'status', 'text'),
            ('migration_runs', 'created_by', 'uuid'),
            ('summary_ledger', 'migration_run_id', 'uuid'),
            ('summary_ledger', 'source_summary_id', 'uuid'),
            ('summary_ledger', 'target_summary_code', 'text'),
            ('summary_ledger', 'target_canonical_slug', 'text'),
            ('batch_progress', 'migration_run_id', 'uuid'),
            ('batch_progress', 'batch_key', 'text')
        ) as required(table_name, column_name, udt_name)
    loop
        if not exists (
            select 1
            from information_schema.columns c
            where c.table_schema = case
                    when expected.table_name = 'summaries' then 'public'
                    else 'kp_migration'
                end
              and c.table_name = expected.table_name
              and c.column_name = expected.column_name
              and c.udt_name = expected.udt_name
        ) then
            raise exception using
                errcode = 'check_violation',
                message = format(
                    'Knowledge Platform migration 049 drift: required column %I.%I type=%s is missing.',
                    expected.table_name,
                    expected.column_name,
                    expected.udt_name
                );
        end if;
    end loop;

    for expected in
        select index_name
        from (values
            ('summaries_summary_code_key'),
            ('summaries_canonical_slug_key'),
            ('summaries_lifecycle_visibility_idx'),
            ('summaries_subject_topic_lifecycle_idx'),
            ('summaries_current_published_version_idx')
        ) as required(index_name)
    loop
        if not exists (
            select 1
            from pg_index i
            join pg_class index_class on index_class.oid = i.indexrelid
            join pg_class table_class on table_class.oid = i.indrelid
            join pg_namespace table_namespace on table_namespace.oid = table_class.relnamespace
            where table_namespace.nspname = 'public'
              and table_class.relname = 'summaries'
              and index_class.relname = expected.index_name
              and i.indisvalid
              and i.indisready
        ) then
            raise exception using
                errcode = 'check_violation',
                message = format(
                    'Knowledge Platform migration 049 requires valid migration 048 index %I.',
                    expected.index_name
                );
        end if;
    end loop;
end
$kp_summary_identity_executor_preflight$;

-- ─────────────────────────────────────────────────────────────────────────────
-- Private controlled execution unit — defined only, never invoked here
-- ─────────────────────────────────────────────────────────────────────────────

create or replace function kp_migration.backfill_summary_identity_unit(
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
    v_summary public.summaries%rowtype;
    v_manifest_max bigint;
    v_sequence_last bigint;
    v_remaining bigint;
    v_now timestamptz := clock_timestamp();
    v_already_complete boolean;
begin
    if p_migration_run_id is null or p_source_summary_id is null then
        raise exception using
            errcode = 'null_value_not_allowed',
            message = 'Summary identity backfill requires migration_run_id and source_summary_id.';
    end if;

    select r.*
    into v_run
    from kp_migration.migration_runs r
    where r.id = p_migration_run_id
    for share;

    if not found then
        raise exception using
            errcode = 'foreign_key_violation',
            message = format('Summary identity backfill migration run %s does not exist.', p_migration_run_id);
    end if;
    if v_run.status <> 'running' then
        raise exception using
            errcode = 'object_not_in_prerequisite_state',
            message = format('Summary identity backfill run %s must be running; current status=%s.', p_migration_run_id, v_run.status);
    end if;
    if v_run.created_by is null then
        raise exception using
            errcode = 'object_not_in_prerequisite_state',
            message = format('Summary identity backfill run %s requires created_by provenance.', p_migration_run_id);
    end if;

    -- The run manifest must cover the complete live legacy Summary inventory.
    -- This prevents a partial manifest from being mistaken for a complete pass.
    if exists (
        select 1
        from public.summaries s
        left join kp_migration.summary_ledger l
          on l.migration_run_id = p_migration_run_id
         and l.source_summary_id = s.id
        where l.source_summary_id is null
    ) or exists (
        select 1
        from kp_migration.summary_ledger l
        left join public.summaries s on s.id = l.source_summary_id
        where l.migration_run_id = p_migration_run_id
          and s.id is null
    ) then
        raise exception using
            errcode = 'check_violation',
            message = format('Summary identity backfill run %s does not exactly cover the live Summary inventory.', p_migration_run_id);
    end if;

    if exists (
        select 1
        from kp_migration.summary_ledger l
        where l.migration_run_id = p_migration_run_id
          and (
              l.target_summary_code is null
              or l.target_summary_code !~ '^SUM-[0-9]{6,}$'
              or l.target_canonical_slug is null
              or btrim(l.target_canonical_slug) = ''
              or l.target_canonical_slug <> lower(btrim(l.target_canonical_slug))
          )
    ) then
        raise exception using
            errcode = 'check_violation',
            message = format('Summary identity backfill run %s has an incomplete or invalid code/slug manifest.', p_migration_run_id);
    end if;

    select l.*
    into v_ledger
    from kp_migration.summary_ledger l
    where l.migration_run_id = p_migration_run_id
      and l.source_summary_id = p_source_summary_id
    for update;

    if not found then
        raise exception using
            errcode = 'foreign_key_violation',
            message = format('Summary identity backfill manifest has no source Summary %s.', p_source_summary_id);
    end if;
    if v_ledger.state in ('succeeded', 'skipped') then
        raise exception using
            errcode = 'object_not_in_prerequisite_state',
            message = format('Summary identity backfill cannot alter ledger unit %s in state=%s.', p_source_summary_id, v_ledger.state);
    end if;

    select s.*
    into v_summary
    from public.summaries s
    where s.id = p_source_summary_id
    for update;

    if not found then
        raise exception using
            errcode = 'foreign_key_violation',
            message = format('Summary identity backfill source Summary %s no longer exists.', p_source_summary_id);
    end if;

    if v_summary.package_id is distinct from v_ledger.source_package_id
       or v_summary.updated_at is distinct from v_ledger.source_updated_at
       or octet_length(v_summary.content_md) is distinct from v_ledger.source_content_bytes
    then
        raise exception using
            errcode = 'serialization_failure',
            message = format('Summary identity backfill source Summary %s changed after the manifest was frozen.', p_source_summary_id);
    end if;

    if (v_ledger.target_summary_id is not null and v_ledger.target_summary_id <> v_summary.id)
       or (v_summary.summary_code is not null and v_summary.summary_code <> v_ledger.target_summary_code)
       or (v_summary.canonical_slug is not null and v_summary.canonical_slug <> v_ledger.target_canonical_slug)
       or (v_summary.canonical_title is not null and v_summary.canonical_title <> v_summary.title)
       or (v_summary.visibility is not null and v_summary.visibility <> 'product_entitled')
       or (v_summary.lifecycle_status is not null and v_summary.lifecycle_status <> 'active')
       or (v_summary.created_by is not null and v_summary.created_by <> v_run.created_by)
       or v_summary.archived_by is not null
       or v_summary.archived_at is not null
    then
        raise exception using
            errcode = 'check_violation',
            message = format('Summary identity backfill target fields for Summary %s contain incompatible data.', p_source_summary_id);
    end if;

    v_already_complete :=
        v_ledger.target_summary_id = v_summary.id
        and v_summary.summary_code = v_ledger.target_summary_code
        and v_summary.canonical_slug = v_ledger.target_canonical_slug
        and v_summary.canonical_title = v_summary.title
        and v_summary.visibility = 'product_entitled'
        and v_summary.lifecycle_status = 'active'
        and v_summary.created_by = v_run.created_by;

    if v_already_complete then
        return v_summary.id;
    end if;

    -- Reserve every manifest allocation before applying the first unit. Sequence
    -- advancement is intentionally gap-tolerant and is never rolled backward.
    select max(substring(l.target_summary_code from 5)::bigint)
    into v_manifest_max
    from kp_migration.summary_ledger l
    where l.migration_run_id = p_migration_run_id;

    select last_value
    into v_sequence_last
    from public.summary_code_seq;

    perform pg_catalog.setval(
        'public.summary_code_seq'::regclass,
        greatest(v_manifest_max, v_sequence_last),
        true
    );

    update public.summaries
    set summary_code = coalesce(summary_code, v_ledger.target_summary_code),
        canonical_slug = coalesce(canonical_slug, v_ledger.target_canonical_slug),
        canonical_title = coalesce(canonical_title, title),
        visibility = coalesce(visibility, 'product_entitled'),
        lifecycle_status = coalesce(lifecycle_status, 'active'),
        created_by = coalesce(created_by, v_run.created_by)
    where id = v_summary.id;

    update kp_migration.summary_ledger
    set target_summary_id = v_summary.id,
        state = 'in_progress',
        attempt_count = attempt_count + 1,
        last_attempted_at = v_now,
        error_code = null,
        error_message = null,
        provenance = jsonb_set(
            provenance,
            '{summary_identity}',
            jsonb_build_object(
                'migration', 49,
                'frozen_responsibility', 47,
                'applied_at', v_now,
                'created_by', v_run.created_by
            ),
            true
        )
    where migration_run_id = p_migration_run_id
      and source_summary_id = p_source_summary_id;

    select count(*)
    into v_remaining
    from kp_migration.summary_ledger l
    join public.summaries s on s.id = l.source_summary_id
    where l.migration_run_id = p_migration_run_id
      and (
          l.target_summary_id is distinct from s.id
          or s.summary_code is distinct from l.target_summary_code
          or s.canonical_slug is distinct from l.target_canonical_slug
          or s.canonical_title is distinct from s.title
          or s.visibility is distinct from 'product_entitled'
          or s.lifecycle_status is distinct from 'active'
          or s.created_by is distinct from v_run.created_by
      );

    insert into kp_migration.batch_progress (
        migration_run_id,
        batch_key,
        state,
        last_source_summary_id,
        source_updated_watermark,
        processed_count,
        succeeded_count,
        failed_count,
        skipped_count,
        started_at,
        heartbeat_at,
        completed_at
    ) values (
        p_migration_run_id,
        'summary_identity',
        case when v_remaining = 0 then 'completed' else 'running' end,
        p_source_summary_id,
        v_ledger.source_updated_at,
        1,
        1,
        0,
        0,
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
        succeeded_count = kp_migration.batch_progress.succeeded_count + 1,
        started_at = coalesce(kp_migration.batch_progress.started_at, excluded.started_at),
        heartbeat_at = excluded.heartbeat_at,
        completed_at = excluded.completed_at,
        error_message = null;

    return v_summary.id;
end
$function$;

comment on function kp_migration.backfill_summary_identity_unit(uuid, uuid) is
    'Controlled frozen migration 047 executor installed as production migration 049. One explicit call transactionally maps one legacy Summary root; deployment never invokes it.';

revoke all on function kp_migration.backfill_summary_identity_unit(uuid, uuid)
    from public, anon, authenticated;
grant execute on function kp_migration.backfill_summary_identity_unit(uuid, uuid)
    to service_role;

-- ─────────────────────────────────────────────────────────────────────────────
-- Fail closed on executor security and shape; still no data execution
-- ─────────────────────────────────────────────────────────────────────────────

do $kp_summary_identity_executor_assertions$
declare
    function_is_security_definer boolean;
    function_config text[];
begin
    if to_regprocedure('kp_migration.backfill_summary_identity_unit(uuid,uuid)') is null then
        raise exception using
            errcode = 'check_violation',
            message = 'Knowledge Platform migration 049 failed: Summary identity executor is missing.';
    end if;

    select p.prosecdef, p.proconfig
    into function_is_security_definer, function_config
    from pg_proc p
    where p.oid = 'kp_migration.backfill_summary_identity_unit(uuid,uuid)'::regprocedure;

    if not function_is_security_definer
       or function_config is null
       or not ('search_path=pg_catalog, public, kp_migration, pg_temp' = any(function_config))
       or not ('lock_timeout=5s' = any(function_config))
    then
        raise exception using
            errcode = 'check_violation',
            message = 'Knowledge Platform migration 049 drift: executor security or runtime configuration is incompatible.';
    end if;

    if has_function_privilege('anon', 'kp_migration.backfill_summary_identity_unit(uuid,uuid)', 'EXECUTE')
       or has_function_privilege('authenticated', 'kp_migration.backfill_summary_identity_unit(uuid,uuid)', 'EXECUTE')
    then
        raise exception using
            errcode = 'check_violation',
            message = 'Knowledge Platform migration 049 drift: a browser role can execute the private backfill.';
    end if;

    if not has_function_privilege('service_role', 'kp_migration.backfill_summary_identity_unit(uuid,uuid)', 'EXECUTE') then
        raise exception using
            errcode = 'check_violation',
            message = 'Knowledge Platform migration 049 drift: service_role cannot execute the controlled backfill.';
    end if;
end
$kp_summary_identity_executor_assertions$;

