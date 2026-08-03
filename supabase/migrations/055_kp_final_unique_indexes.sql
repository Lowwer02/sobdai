-- 055_kp_final_unique_indexes.sql
-- Sobdai Knowledge Platform — reconciled frozen Migration 053 responsibility.
--
-- Migration-number audit
-- ----------------------
-- Production migration 054_kp_backfill_aliases_curated.sql is committed and
-- is the current deployed Knowledge Platform maximum. Production migration
-- 055 is therefore the next identity and implements frozen responsibility 053.
-- The repository's unrelated committed Assessment migration 062 is not part
-- of the deployed Knowledge Platform sequence and is intentionally untouched.
--
-- Purpose
-- -------
-- Build the final uniqueness/access paths that require clean backfilled
-- values: Package business code, Summary business code, canonical Summary
-- slug, and the Package-scoped legacy route. Existing canonical/alias and
-- reverse-consumer indexes are verified rather than duplicated.
--
-- Deployment boundary
-- -------------------
-- This is a standard transactional index unit. Every index build below is
-- CREATE UNIQUE INDEX and is intentionally deployable through the normal
-- Supabase SQL Editor transaction workflow. All index builds, comments,
-- helper creation, and validations succeed or roll back together.
--
-- No rows are inserted, updated, or deleted. No constraint is attached, no
-- legacy column is removed, and no application behavior is changed. A failed
-- build rolls back with the transaction; the post-validation block still fails
-- closed on any incompatible or incomplete index state.

set lock_timeout = '5s';

-- ─────────────────────────────────────────────────────────────────────────────
-- Fail closed before starting standard transactional index builds
-- ─────────────────────────────────────────────────────────────────────────────

do $kp_final_unique_indexes_preflight$
declare
    expected record;
begin
    for expected in
        select schema_name, relation_name
        from (values
            ('public', 'packages'),
            ('public', 'summaries'),
            ('public', 'summary_aliases'),
            ('public', 'package_summaries'),
            ('public', 'news_summaries'),
            ('kp_migration', 'migration_runs'),
            ('kp_migration', 'summary_ledger'),
            ('kp_migration', 'batch_progress'),
            ('kp_migration', 'summary_alias_manifest')
        ) as required(schema_name, relation_name)
    loop
        if to_regclass(format('%I.%I', expected.schema_name, expected.relation_name)) is null then
            raise exception using
                errcode = 'check_violation',
                message = format('Knowledge Platform migration 055 prerequisite %I.%I is missing.', expected.schema_name, expected.relation_name);
        end if;
    end loop;

    for expected in
        select table_schema, table_name, column_name, udt_name
        from (values
            ('public', 'packages', 'package_code', 'text'),
            ('public', 'summaries', 'summary_code', 'text'),
            ('public', 'summaries', 'canonical_slug', 'text'),
            ('public', 'summary_aliases', 'slug', 'text'),
            ('public', 'package_summaries', 'package_id', 'uuid'),
            ('public', 'package_summaries', 'legacy_slug', 'text'),
            ('kp_migration', 'summary_alias_manifest', 'migration_run_id', 'uuid'),
            ('kp_migration', 'summary_alias_manifest', 'state', 'text')
        ) as required(table_schema, table_name, column_name, udt_name)
    loop
        if not exists (
            select 1
            from information_schema.columns c
            where c.table_schema = expected.table_schema
              and c.table_name = expected.table_name
              and c.column_name = expected.column_name
              and c.udt_name = expected.udt_name
        ) then
            raise exception using
                errcode = 'check_violation',
                message = format('Knowledge Platform migration 055 requires %I.%I.%I type=%s.', expected.table_schema, expected.table_name, expected.column_name, expected.udt_name);
        end if;
    end loop;

    if to_regprocedure('kp_migration.reconcile_curated_summary_aliases(uuid)') is null then
        raise exception using
            errcode = 'check_violation',
            message = 'Knowledge Platform migration 055 requires the production 054 alias reconciliation helper.';
    end if;

    if exists (
        select 1
        from kp_migration.summary_alias_manifest m
        where m.state <> 'applied'
    ) then
        raise exception using
            errcode = 'object_not_in_prerequisite_state',
            message = 'Knowledge Platform migration 055 requires every curated Summary alias manifest unit to be applied or explicitly absent.';
    end if;

    -- The frozen 047–052 work must have no unresolved duplicate identity before
    -- a final unique path is attempted. NULLs are intentionally allowed by the
    -- full unique indexes; the later required-identity migration owns
    -- required-column enforcement.
    for expected in
        select relation_name, column_name
        from (values
            ('packages', 'package_code'),
            ('summaries', 'summary_code'),
            ('summaries', 'canonical_slug')
        ) as required(relation_name, column_name)
    loop
        if expected.relation_name = 'packages' and exists (
            select 1 from public.packages
            where package_code is not null
            group by package_code
            having count(*) > 1
        ) then
            raise exception using
                errcode = 'unique_violation',
                message = format('Knowledge Platform migration 055 found duplicate %I.%I values; final unique index build is blocked.', expected.relation_name, expected.column_name);
        elsif expected.column_name = 'summary_code' and exists (
            select 1 from public.summaries
            where summary_code is not null
            group by summary_code
            having count(*) > 1
        ) then
            raise exception using
                errcode = 'unique_violation',
                message = format('Knowledge Platform migration 055 found duplicate %I.%I values; final unique index build is blocked.', expected.relation_name, expected.column_name);
        elsif expected.column_name = 'canonical_slug' and exists (
            select 1 from public.summaries
            where canonical_slug is not null
            group by canonical_slug
            having count(*) > 1
        ) then
            raise exception using
                errcode = 'unique_violation',
                message = format('Knowledge Platform migration 055 found duplicate %I.%I values; final unique index build is blocked.', expected.relation_name, expected.column_name);
        end if;
    end loop;

    if exists (
        select 1
        from public.package_summaries ps
        where ps.legacy_slug is not null
        group by ps.package_id, ps.legacy_slug
        having count(*) > 1
    ) then
        raise exception using
            errcode = 'unique_violation',
            message = 'Knowledge Platform migration 055 found duplicate Package-scoped legacy routes.';
    end if;

    if exists (
        select 1
        from public.summaries s
        join public.summary_aliases a on a.slug = s.canonical_slug
    ) then
        raise exception using
            errcode = 'unique_violation',
            message = 'Knowledge Platform migration 055 found a canonical Summary/alias namespace collision.';
    end if;

    for expected in
        select index_name, table_name, must_be_unique, must_be_partial
        from (values
            ('summaries_summary_code_key', 'summaries', true, true),
            ('summaries_canonical_slug_key', 'summaries', true, true),
            ('summary_aliases_slug_key', 'summary_aliases', true, false),
            ('package_summaries_package_legacy_slug_key', 'package_summaries', true, true),
            ('package_summaries_summary_package_idx', 'package_summaries', false, false),
            ('news_summaries_summary_id_idx', 'news_summaries', false, false),
            ('summary_aliases_summary_status_idx', 'summary_aliases', false, false)
        ) as required(index_name, table_name, must_be_unique, must_be_partial)
    loop
        if not exists (
            select 1
            from pg_class i
            join pg_namespace n on n.oid = i.relnamespace
            join pg_index x on x.indexrelid = i.oid
            where n.nspname = 'public'
              and i.relname = expected.index_name
              and x.indrelid = format('public.%I', expected.table_name)::regclass
              and x.indisunique = expected.must_be_unique
              and (x.indpred is not null) = expected.must_be_partial
              and x.indisvalid
              and x.indisready
        ) then
            raise exception using
                errcode = 'check_violation',
                message = format('Knowledge Platform migration 055 requires valid predecessor index public.%I.', expected.index_name);
        end if;
    end loop;
end
$kp_final_unique_indexes_preflight$;

-- ─────────────────────────────────────────────────────────────────────────────
-- Standard transactional index builds
-- ─────────────────────────────────────────────────────────────────────────────

create unique index if not exists packages_package_code_key
    on public.packages (package_code);

create unique index if not exists summaries_summary_code_final_key
    on public.summaries (summary_code);

create unique index if not exists summaries_canonical_slug_final_key
    on public.summaries (canonical_slug);

create unique index if not exists package_summaries_package_legacy_slug_final_key
    on public.package_summaries (package_id, legacy_slug);

comment on index public.packages_package_code_key is
    'Knowledge Platform final unique Package business-code path; prepared for later constraint attachment.';
comment on index public.summaries_summary_code_final_key is
    'Knowledge Platform final unique Summary business-code path; nullable values remain governed by later required-identity enforcement.';
comment on index public.summaries_canonical_slug_final_key is
    'Knowledge Platform final unique canonical Summary slug path; nullable values remain governed by later required-identity enforcement.';
comment on index public.package_summaries_package_legacy_slug_final_key is
    'Knowledge Platform final Package-scoped legacy route path; canonical aliases remain globally separate.';

-- ─────────────────────────────────────────────────────────────────────────────
-- Read-only post-validation and reconciliation surface
-- ─────────────────────────────────────────────────────────────────────────────

create or replace function kp_migration.reconcile_final_unique_indexes()
returns table (
    index_total bigint,
    valid_total bigint,
    ready_total bigint,
    unique_total bigint,
    partial_total bigint,
    duplicate_package_code_total bigint,
    duplicate_summary_code_total bigint,
    duplicate_canonical_slug_total bigint,
    duplicate_legacy_route_total bigint,
    namespace_collision_total bigint,
    mismatch_total bigint
)
language sql
stable
security definer
set search_path = pg_catalog, public, kp_migration, pg_temp
as $function$
    with expected(index_name, table_name, is_unique, is_partial) as (
        values
            ('packages_package_code_key', 'packages', true, false),
            ('summaries_summary_code_final_key', 'summaries', true, false),
            ('summaries_canonical_slug_final_key', 'summaries', true, false),
            ('package_summaries_package_legacy_slug_final_key', 'package_summaries', true, false),
            ('summaries_summary_code_key', 'summaries', true, true),
            ('summaries_canonical_slug_key', 'summaries', true, true),
            ('summary_aliases_slug_key', 'summary_aliases', true, false),
            ('package_summaries_package_legacy_slug_key', 'package_summaries', true, true),
            ('package_summaries_summary_package_idx', 'package_summaries', false, false),
            ('news_summaries_summary_id_idx', 'news_summaries', false, false),
            ('summary_aliases_summary_status_idx', 'summary_aliases', false, false)
    ), catalog as (
        select
            e.*,
            i.indisvalid,
            i.indisready,
            i.indisunique,
            (i.indpred is not null) as is_partial_actual
        from expected e
        left join pg_class c on c.relname = e.index_name
            and c.relnamespace = 'public'::regnamespace
        left join pg_namespace n on n.oid = c.relnamespace
        left join pg_index i on i.indexrelid = c.oid
            and i.indrelid = format('public.%I', e.table_name)::regclass
    ), duplicates as (
        select
            (select count(*) from (
                select package_code from public.packages where package_code is not null group by package_code having count(*) > 1
            ) d)::bigint as package_code_total,
            (select count(*) from (
                select summary_code from public.summaries where summary_code is not null group by summary_code having count(*) > 1
            ) d)::bigint as summary_code_total,
            (select count(*) from (
                select canonical_slug from public.summaries where canonical_slug is not null group by canonical_slug having count(*) > 1
            ) d)::bigint as canonical_slug_total,
            (select count(*) from (
                select package_id, legacy_slug from public.package_summaries where legacy_slug is not null group by package_id, legacy_slug having count(*) > 1
            ) d)::bigint as legacy_route_total,
            (select count(*) from public.summaries s join public.summary_aliases a on a.slug = s.canonical_slug)::bigint as namespace_total
    )
    select
        (select count(*) from catalog),
        (select count(*) from catalog where indisvalid),
        (select count(*) from catalog where indisready),
        (select count(*) from catalog where indisunique = is_unique),
        (select count(*) from catalog where is_partial_actual = is_partial),
        d.package_code_total,
        d.summary_code_total,
        d.canonical_slug_total,
        d.legacy_route_total,
        d.namespace_total,
        (
            (select count(*) from catalog where indisvalid is distinct from true or indisready is distinct from true or indisunique is distinct from is_unique or is_partial_actual is distinct from is_partial)
            + d.package_code_total
            + d.summary_code_total
            + d.canonical_slug_total
            + d.legacy_route_total
            + d.namespace_total
        )::bigint
    from duplicates d;
$function$;

comment on function kp_migration.reconcile_final_unique_indexes() is
    'Read-only catalog, duplicate, namespace, and final-index reconciliation for frozen migration 053. It never repairs indexes or data.';

revoke all on function kp_migration.reconcile_final_unique_indexes()
    from public, anon, authenticated;
grant execute on function kp_migration.reconcile_final_unique_indexes()
    to service_role;

-- ─────────────────────────────────────────────────────────────────────────────
-- Fail-closed assertions; no data execution
-- ─────────────────────────────────────────────────────────────────────────────

do $kp_final_unique_indexes_assertions$
declare
    expected record;
    index_is_valid boolean;
    index_is_ready boolean;
    index_is_unique boolean;
    index_is_partial boolean;
begin
    if pg_catalog.has_function_privilege('anon', 'kp_migration.reconcile_final_unique_indexes()', 'EXECUTE')
       or pg_catalog.has_function_privilege('authenticated', 'kp_migration.reconcile_final_unique_indexes()', 'EXECUTE')
    then
        raise exception using
            errcode = 'insufficient_privilege',
            message = 'Knowledge Platform migration 055 requires the final-index reconciliation helper to remain unavailable to browser roles.';
    end if;

    for expected in
        select index_name, table_name
        from (values
            ('packages_package_code_key', 'packages'),
            ('summaries_summary_code_final_key', 'summaries'),
            ('summaries_canonical_slug_final_key', 'summaries'),
            ('package_summaries_package_legacy_slug_final_key', 'package_summaries')
        ) as required(index_name, table_name)
    loop
        select x.indisvalid, x.indisready, x.indisunique, (x.indpred is not null)
        into index_is_valid, index_is_ready, index_is_unique, index_is_partial
        from pg_class i
        join pg_namespace n on n.oid = i.relnamespace
        join pg_index x on x.indexrelid = i.oid
        where n.nspname = 'public'
          and i.relname = expected.index_name
          and x.indrelid = format('public.%I', expected.table_name)::regclass;

        if index_is_valid is distinct from true
           or index_is_ready is distinct from true
           or index_is_unique is distinct from true
           or index_is_partial is distinct from false
        then
            raise exception using
                errcode = 'check_violation',
                message = format('Knowledge Platform migration 055 failed: final index public.%I is missing, invalid, not ready, non-unique, or partial.', expected.index_name);
        end if;
    end loop;

    if exists (
        select 1 from public.packages where package_code is not null group by package_code having count(*) > 1
    ) or exists (
        select 1 from public.summaries where summary_code is not null group by summary_code having count(*) > 1
    ) or exists (
        select 1 from public.summaries where canonical_slug is not null group by canonical_slug having count(*) > 1
    ) or exists (
        select 1 from public.package_summaries where legacy_slug is not null group by package_id, legacy_slug having count(*) > 1
    ) or exists (
        select 1 from public.summaries s join public.summary_aliases a on a.slug = s.canonical_slug
    ) then
        raise exception using
            errcode = 'unique_violation',
            message = 'Knowledge Platform migration 055 post-validation found a duplicate or canonical/alias namespace collision.';
    end if;
end
$kp_final_unique_indexes_assertions$;
