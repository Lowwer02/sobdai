-- 048_kp_online_indexes.sql
-- Sobdai Knowledge Platform — reconciled Migration 046 responsibility.
--
-- Migration-number audit
-- ----------------------
-- The frozen SQL Migration Design assigns the Knowledge/Product index
-- unit to migration 046. Production migration 041_news_gp_exam_requirement.sql
-- shifted the deployed Knowledge Platform sequence, and the repository then
-- acquired the unrelated production migration 047_homepage_latest_news.sql.
-- 048 is therefore the next free monotonically increasing production identity
-- for the still-unimplemented index responsibility.
--
-- Scope boundary
-- --------------
-- * Builds only the Summary-root lookup/filter indexes assigned to the frozen
--   index unit.
-- * Uses standard CREATE INDEX under the approved current-scale architecture
--   decision.
-- * Is intentionally deployable through the standard Supabase SQL Editor
--   transaction workflow; all five indexes and validations succeed or roll
--   back together.
-- * Does not insert, update, delete, backfill, tighten constraints, add
--   triggers, alter RLS, or change legacy columns/application behavior.
--
-- Failure policy
-- --------------
-- A failed or incompatible index is never accepted as success. The
-- assertion block below checks readiness, validity, uniqueness, table
-- ownership, and the intended partial predicates. Correct the live drift and
-- rerun this standard transactional unit.

set lock_timeout = '5s';

-- ─────────────────────────────────────────────────────────────────────────────
-- Fail closed before starting the standard transactional builds
-- ─────────────────────────────────────────────────────────────────────────────

do $kp_online_indexes_preflight$
declare
    expected record;
begin
    if to_regclass('public.summaries') is null then
        raise exception using
            errcode = 'check_violation',
            message = 'Knowledge Platform migration 048 requires public.summaries.';
    end if;

    for expected in
        select *
        from (
            values
                ('summary_code', 'text'),
                ('canonical_slug', 'text'),
                ('visibility', 'text'),
                ('lifecycle_status', 'text'),
                ('subject', 'text'),
                ('topic', 'text'),
                ('current_published_version_id', 'uuid')
        ) as required_columns(column_name, udt_name)
    loop
        if not exists (
            select 1
            from information_schema.columns c
            where c.table_schema = 'public'
              and c.table_name = 'summaries'
              and c.column_name = expected.column_name
              and c.udt_name = expected.udt_name
        ) then
            raise exception using
                errcode = 'check_violation',
                message = format(
                    'Knowledge Platform migration 048 drift: public.summaries.%I type=%s is missing.',
                    expected.column_name,
                    expected.udt_name
                );
        end if;
    end loop;

    if not exists (
        select 1
        from pg_class c
        join pg_namespace n on n.oid = c.relnamespace
        where n.nspname = 'public'
          and c.relname = 'summaries'
          and c.relkind = 'r'
          and c.relrowsecurity
    ) then
        raise exception using
            errcode = 'check_violation',
            message = 'Knowledge Platform migration 048 drift: public.summaries RLS must remain enabled.';
    end if;
end
$kp_online_indexes_preflight$;

-- ─────────────────────────────────────────────────────────────────────────────
-- Standard transactional lookup and filter indexes
-- ─────────────────────────────────────────────────────────────────────────────

create unique index if not exists summaries_summary_code_key
    on public.summaries (summary_code)
    where summary_code is not null;

create unique index if not exists summaries_canonical_slug_key
    on public.summaries (canonical_slug)
    where canonical_slug is not null;

create index if not exists summaries_lifecycle_visibility_idx
    on public.summaries (lifecycle_status, visibility)
    where lifecycle_status is not null
      and visibility is not null;

create index if not exists summaries_subject_topic_lifecycle_idx
    on public.summaries (subject, topic, lifecycle_status)
    where lifecycle_status is not null;

create index if not exists summaries_current_published_version_idx
    on public.summaries (current_published_version_id)
    where current_published_version_id is not null;

-- ─────────────────────────────────────────────────────────────────────────────
-- Fail closed on index shape/readiness after the transactional builds
-- ─────────────────────────────────────────────────────────────────────────────

do $kp_online_indexes_assertions$
declare
    expected record;
    index_definition text;
    index_is_unique boolean;
    index_is_valid boolean;
    index_is_ready boolean;
begin
    for expected in
        select *
        from (
            values
                ('summaries_summary_code_key', true, 'WHERE (summary_code IS NOT NULL)'),
                ('summaries_canonical_slug_key', true, 'WHERE (canonical_slug IS NOT NULL)'),
                ('summaries_lifecycle_visibility_idx', false, 'WHERE ((lifecycle_status IS NOT NULL) AND (visibility IS NOT NULL))'),
                ('summaries_subject_topic_lifecycle_idx', false, 'WHERE (lifecycle_status IS NOT NULL)'),
                ('summaries_current_published_version_idx', false, 'WHERE (current_published_version_id IS NOT NULL)')
        ) as expected_indexes(index_name, expected_unique, expected_predicate)
    loop
        select
            pg_get_indexdef(i.indexrelid),
            i.indisunique,
            i.indisvalid,
            i.indisready
        into
            index_definition,
            index_is_unique,
            index_is_valid,
            index_is_ready
        from pg_index i
        join pg_class index_class on index_class.oid = i.indexrelid
        join pg_class table_class on table_class.oid = i.indrelid
        join pg_namespace table_namespace on table_namespace.oid = table_class.relnamespace
        where index_class.relname = expected.index_name
          and table_namespace.nspname = 'public'
          and table_class.relname = 'summaries';

        if index_definition is null then
            raise exception using
                errcode = 'check_violation',
                message = format('Knowledge Platform migration 048 drift: index %I is missing.', expected.index_name);
        end if;
        if index_is_unique is distinct from expected.expected_unique then
            raise exception using
                errcode = 'check_violation',
                message = format('Knowledge Platform migration 048 drift: index %I uniqueness is incompatible.', expected.index_name);
        end if;
        if not index_is_valid or not index_is_ready then
            raise exception using
                errcode = 'check_violation',
                message = format('Knowledge Platform migration 048 failed: index %I is not valid and ready.', expected.index_name);
        end if;
        if upper(index_definition) not like '%' || upper(expected.expected_predicate) || '%' then
            raise exception using
                errcode = 'check_violation',
                message = format('Knowledge Platform migration 048 drift: index %I predicate is incompatible.', expected.index_name);
        end if;
    end loop;
end
$kp_online_indexes_assertions$;

comment on index public.summaries_summary_code_key is
    'Knowledge Platform Summary business-code lookup; nullable during coexistence/backfill.';
comment on index public.summaries_canonical_slug_key is
    'Knowledge Platform canonical Summary slug lookup; nullable during coexistence/backfill.';
comment on index public.summaries_lifecycle_visibility_idx is
    'Knowledge Platform Summary lifecycle and visibility filter path.';
comment on index public.summaries_subject_topic_lifecycle_idx is
    'Knowledge Platform Summary classification and lifecycle filter path.';
comment on index public.summaries_current_published_version_idx is
    'Knowledge Platform current published SummaryVersion pointer lookup.';

notify pgrst, 'reload schema';
