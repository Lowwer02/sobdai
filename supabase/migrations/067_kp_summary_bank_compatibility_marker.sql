-- 067_kp_summary_bank_compatibility_marker.sql
-- Sobdai Knowledge Platform — hybrid Summary membership foundation.
--
-- This migration is schema- and validation-only. It deliberately performs no
-- domain-row mutation against Summary or PackageSummary records.
-- Existing rows with summary_code IS NULL are grandfathered legacy rows and
-- remain without PackageSummary placements or compatibility markers.
--
-- A later writer migration owns creation and maintenance of KP-native rows.
-- The marker below is an internal canonical/compatibility placement only; the
-- complete package_summaries relation remains the product membership authority.

set local lock_timeout = '5s';

-- ─────────────────────────────────────────────────────────────────────────────
-- Fail closed on required pre-existing storage, without requiring historical
-- placements. Both the 29-row legacy/zero-placement state and a future state
-- containing KP-native rows are valid inputs to this migration.
-- ─────────────────────────────────────────────────────────────────────────────

do $kp_summary_bank_marker_preflight$
declare
    expected record;
    v_column_exists boolean;
begin
    for expected in
        select relation_name
        from (values
            ('public.summaries'),
            ('public.package_summaries')
        ) as required(relation_name)
    loop
        if to_regclass(expected.relation_name) is null then
            raise exception using
                errcode = 'check_violation',
                message = format(
                    'Knowledge Platform migration 067 prerequisite is missing: %s.',
                    expected.relation_name
                );
        end if;
    end loop;

    for expected in
        select table_name, column_name, udt_name, is_nullable
        from (values
            ('summaries', 'id', 'uuid', 'NO'),
            ('summaries', 'package_id', 'uuid', 'NO'),
            ('summaries', 'slug', 'text', 'NO'),
            ('summaries', 'summary_code', 'text', 'YES'),
            ('summaries', 'canonical_slug', 'text', 'YES'),
            ('summaries', 'canonical_title', 'text', 'YES'),
            ('summaries', 'visibility', 'text', 'YES'),
            ('summaries', 'lifecycle_status', 'text', 'YES'),
            ('summaries', 'current_published_version_id', 'uuid', 'YES'),
            ('package_summaries', 'package_id', 'uuid', 'NO'),
            ('package_summaries', 'summary_id', 'uuid', 'NO'),
            ('package_summaries', 'legacy_slug', 'text', 'YES'),
            ('package_summaries', 'sort_order', 'int4', 'NO'),
            ('package_summaries', 'display_order', 'int4', 'NO'),
            ('package_summaries', 'released_at', 'timestamptz', 'YES')
        ) as required(table_name, column_name, udt_name, is_nullable)
    loop
        if not exists (
            select 1
            from information_schema.columns c
            where c.table_schema = 'public'
              and c.table_name = expected.table_name
              and c.column_name = expected.column_name
              and c.udt_name = expected.udt_name
              and c.is_nullable = expected.is_nullable
        ) then
            raise exception using
                errcode = 'check_violation',
                message = format(
                    'Knowledge Platform migration 067 requires public.%I.%I type=%s nullable=%s.',
                    expected.table_name,
                    expected.column_name,
                    expected.udt_name,
                    expected.is_nullable
                );
        end if;
    end loop;

    select exists (
        select 1
        from information_schema.columns c
        where c.table_schema = 'public'
          and c.table_name = 'package_summaries'
          and c.column_name = 'is_summary_bank_compatibility'
    ) into v_column_exists;

    if v_column_exists then
        if not exists (
            select 1
            from information_schema.columns c
            where c.table_schema = 'public'
              and c.table_name = 'package_summaries'
              and c.column_name = 'is_summary_bank_compatibility'
              and c.udt_name = 'bool'
              and c.is_nullable = 'NO'
              and c.column_default in ('false', 'false::boolean')
        ) then
            raise exception using
                errcode = 'check_violation',
                message = 'Knowledge Platform migration 067 found an incompatible pre-existing compatibility marker column.';
        end if;

        if exists (
            select 1
            from public.package_summaries ps
            join public.summaries s on s.id = ps.summary_id
            where ps.is_summary_bank_compatibility
              and (
                  s.summary_code is null
                  or ps.legacy_slug is null
                  or ps.legacy_slug is distinct from s.slug
                  or ps.package_id is distinct from s.package_id
              )
        ) then
            raise exception using
                errcode = 'check_violation',
                message = 'Knowledge Platform migration 067 found a compatibility marker outside the KP-native canonical Package/slug association.';
        end if;

        if exists (
            select ps.summary_id
            from public.package_summaries ps
            where ps.is_summary_bank_compatibility
            group by ps.summary_id
            having count(*) > 1
        ) then
            raise exception using
                errcode = 'unique_violation',
                message = 'Knowledge Platform migration 067 found multiple compatibility markers for one Summary.';
        end if;
    elsif to_regclass('public.package_summaries_one_bank_compatibility_key') is not null
       or exists (
            select 1
            from pg_catalog.pg_constraint c
            where c.conrelid = 'public.package_summaries'::regclass
              and c.conname = 'package_summaries_bank_compatibility_slug_check'
       )
    then
        raise exception using
            errcode = 'check_violation',
            message = 'Knowledge Platform migration 067 found partial marker schema without its required column.';
    end if;
end
$kp_summary_bank_marker_preflight$;

-- ─────────────────────────────────────────────────────────────────────────────
-- Summary identity discriminator. Existing all-NULL legacy identity is valid;
-- a KP-native identity must provide the complete five-field bundle. The
-- publication pointer is intentionally excluded and may remain NULL for a
-- KP-native draft until its first publication.
-- ─────────────────────────────────────────────────────────────────────────────

do $kp_summary_identity_bundle_constraint$
declare
    v_definition text;
begin
    select pg_catalog.pg_get_constraintdef(c.oid)
    into v_definition
    from pg_catalog.pg_constraint c
    where c.conrelid = 'public.summaries'::regclass
      and c.conname = 'summaries_kp_identity_bundle_check';

    if v_definition is null then
        alter table public.summaries
            add constraint summaries_kp_identity_bundle_check
            check (
                (
                    summary_code is null
                    and canonical_slug is null
                    and canonical_title is null
                    and visibility is null
                    and lifecycle_status is null
                )
                or (
                    summary_code is not null
                    and canonical_slug is not null
                    and canonical_title is not null
                    and visibility is not null
                    and lifecycle_status is not null
                )
            ) not valid;
    elsif position('SUMMARY_CODE IS NULL' in upper(v_definition)) = 0
       or position('SUMMARY_CODE IS NOT NULL' in upper(v_definition)) = 0
       or position('CANONICAL_SLUG IS NULL' in upper(v_definition)) = 0
       or position('CANONICAL_SLUG IS NOT NULL' in upper(v_definition)) = 0
       or position('CANONICAL_TITLE IS NULL' in upper(v_definition)) = 0
       or position('CANONICAL_TITLE IS NOT NULL' in upper(v_definition)) = 0
       or position('VISIBILITY IS NULL' in upper(v_definition)) = 0
       or position('VISIBILITY IS NOT NULL' in upper(v_definition)) = 0
       or position('LIFECYCLE_STATUS IS NULL' in upper(v_definition)) = 0
       or position('LIFECYCLE_STATUS IS NOT NULL' in upper(v_definition)) = 0
    then
        raise exception using
            errcode = 'check_violation',
            message = 'Knowledge Platform migration 067 found a divergent all-or-none KP identity constraint.';
    end if;
end
$kp_summary_identity_bundle_constraint$;

alter table public.summaries
    validate constraint summaries_kp_identity_bundle_check;

-- ─────────────────────────────────────────────────────────────────────────────
-- Durable target-owned marker and its local slug validity rule. No domain row
-- is created or rewritten here; the empty package_summaries table is valid.
-- ─────────────────────────────────────────────────────────────────────────────

alter table public.package_summaries
    add column if not exists is_summary_bank_compatibility boolean not null default false;

comment on column public.package_summaries.is_summary_bank_compatibility is
    'True for the one internal canonical/compatibility PackageSummary membership of a KP-native Summary; false for secondary product memberships.';

do $kp_summary_bank_marker_constraint$
declare
    v_definition text;
begin
    select pg_catalog.pg_get_constraintdef(c.oid)
    into v_definition
    from pg_catalog.pg_constraint c
    where c.conrelid = 'public.package_summaries'::regclass
      and c.conname = 'package_summaries_bank_compatibility_slug_check';

    if v_definition is null then
        alter table public.package_summaries
            add constraint package_summaries_bank_compatibility_slug_check
            check (
                not is_summary_bank_compatibility
                or legacy_slug is not null
            ) not valid;
    elsif v_definition not ilike '%NOT is_summary_bank_compatibility%legacy_slug IS NOT NULL%' then
        raise exception using
            errcode = 'check_violation',
            message = 'Knowledge Platform migration 067 found an incompatible compatibility marker CHECK constraint.';
    end if;
end
$kp_summary_bank_marker_constraint$;

alter table public.package_summaries
    validate constraint package_summaries_bank_compatibility_slug_check;

create unique index if not exists package_summaries_one_bank_compatibility_key
    on public.package_summaries (summary_id)
    where is_summary_bank_compatibility = true;

comment on index public.package_summaries_one_bank_compatibility_key is
    'Enforces at most one internal compatibility marker membership per KP-native Summary.';

-- ─────────────────────────────────────────────────────────────────────────────
-- Hybrid reconciliation. Each branch is scoped by the frozen discriminator:
-- legacy rows must have no placements, while KP-native rows require membership
-- and one marker. These checks are read-only and therefore safe for the live
-- 29-legacy/zero-placement starting state.
-- ─────────────────────────────────────────────────────────────────────────────

do $kp_summary_bank_marker_postflight$
declare
    v_marker_attnum smallint;
begin
    if exists (
        select 1
        from public.summaries s
        where s.summary_code is null
          and (
              s.canonical_slug is not null
              or s.canonical_title is not null
              or s.visibility is not null
              or s.lifecycle_status is not null
          )
    ) then
        raise exception using
            errcode = 'check_violation',
            message = 'Knowledge Platform migration 067 found legacy Summary rows with partial KP identity.';
    end if;

    if exists (
        select 1
        from public.summaries s
        where s.summary_code is not null
          and (
              s.canonical_slug is null
              or s.canonical_title is null
              or s.visibility is null
              or s.lifecycle_status is null
              or nullif(btrim(s.summary_code), '') is null
              or s.summary_code is distinct from upper(btrim(s.summary_code))
              or nullif(btrim(s.canonical_slug), '') is null
              or s.canonical_slug is distinct from lower(btrim(s.canonical_slug))
              or nullif(btrim(s.canonical_title), '') is null
              or s.visibility not in ('public_indexable', 'authenticated', 'product_entitled')
              or s.lifecycle_status not in ('active', 'archived')
          )
    ) then
        raise exception using
            errcode = 'check_violation',
            message = 'Knowledge Platform migration 067 found KP-native Summary identity that is incomplete or malformed.';
    end if;

    if exists (
        select 1
        from public.summaries s
        where s.summary_code is null
          and exists (
              select 1
              from public.package_summaries ps
              where ps.summary_id = s.id
          )
    ) then
        raise exception using
            errcode = 'cardinality_violation',
            message = 'Knowledge Platform migration 067 found a legacy Summary with a Package membership.';
    end if;

    if exists (
        select 1
        from public.summaries s
        where s.summary_code is null
          and exists (
              select 1
              from public.package_summaries ps
              where ps.summary_id = s.id
                and ps.is_summary_bank_compatibility
          )
    ) then
        raise exception using
            errcode = 'cardinality_violation',
            message = 'Knowledge Platform migration 067 found a legacy Summary with a compatibility marker.';
    end if;

    if exists (
        select 1
        from public.summaries s
        where s.summary_code is not null
          and not exists (
              select 1
              from public.package_summaries ps
              where ps.summary_id = s.id
          )
    ) then
        raise exception using
            errcode = 'cardinality_violation',
            message = 'Knowledge Platform migration 067 found a KP-native Summary without a Package membership.';
    end if;

    if exists (
        select 1
        from public.summaries s
        where s.summary_code is not null
          and (
              select count(*)
              from public.package_summaries ps
              where ps.summary_id = s.id
                and ps.is_summary_bank_compatibility
          ) <> 1
    ) then
        raise exception using
            errcode = 'cardinality_violation',
            message = 'Knowledge Platform migration 067 found a KP-native Summary without one compatibility marker.';
    end if;

    if exists (
        select 1
        from public.package_summaries ps
        join public.summaries s on s.id = ps.summary_id
        where ps.is_summary_bank_compatibility
          and (
              s.summary_code is null
              or ps.legacy_slug is null
              or nullif(btrim(ps.legacy_slug), '') is null
              or ps.legacy_slug is distinct from lower(btrim(ps.legacy_slug))
              or ps.package_id is distinct from s.package_id
              or ps.legacy_slug is distinct from s.slug
          )
    ) then
        raise exception using
            errcode = 'check_violation',
            message = 'Knowledge Platform migration 067 found a marker inconsistent with its KP-native Summary Package or slug.';
    end if;

    if not exists (
        select 1
        from information_schema.columns c
        where c.table_schema = 'public'
          and c.table_name = 'package_summaries'
          and c.column_name = 'is_summary_bank_compatibility'
          and c.udt_name = 'bool'
          and c.is_nullable = 'NO'
          and c.column_default in ('false', 'false::boolean')
    ) then
        raise exception using
            errcode = 'check_violation',
            message = 'Knowledge Platform migration 067 compatibility marker column has an invalid final definition.';
    end if;

    if not exists (
        select 1
        from pg_catalog.pg_constraint c
        where c.conrelid = 'public.summaries'::regclass
          and c.conname = 'summaries_kp_identity_bundle_check'
          and c.contype = 'c'
          and c.convalidated
    ) then
        raise exception using
            errcode = 'check_violation',
            message = 'Knowledge Platform migration 067 all-or-none KP identity constraint is missing or unvalidated.';
    end if;

    if not exists (
        select 1
        from pg_catalog.pg_constraint c
        where c.conrelid = 'public.package_summaries'::regclass
          and c.conname = 'package_summaries_bank_compatibility_slug_check'
          and c.contype = 'c'
          and c.convalidated
          and pg_catalog.pg_get_constraintdef(c.oid) ilike '%NOT is_summary_bank_compatibility%legacy_slug IS NOT NULL%'
    ) then
        raise exception using
            errcode = 'check_violation',
            message = 'Knowledge Platform migration 067 compatibility marker CHECK is missing, divergent, or unvalidated.';
    end if;

    select a.attnum
    into v_marker_attnum
    from pg_catalog.pg_attribute a
    where a.attrelid = 'public.package_summaries'::regclass
      and a.attname = 'summary_id'
      and not a.attisdropped;

    if not exists (
        select 1
        from pg_catalog.pg_class c
        join pg_catalog.pg_namespace n on n.oid = c.relnamespace
        join pg_catalog.pg_index i on i.indexrelid = c.oid
        where n.nspname = 'public'
          and c.relname = 'package_summaries_one_bank_compatibility_key'
          and i.indrelid = 'public.package_summaries'::regclass
          and i.indisunique
          and i.indisvalid
          and i.indisready
          and i.indnkeyatts = 1
          and i.indkey[0] = v_marker_attnum
          and pg_catalog.pg_get_expr(i.indpred, i.indrelid) in (
              'is_summary_bank_compatibility',
              '(is_summary_bank_compatibility = true)'
          )
    ) then
        raise exception using
            errcode = 'check_violation',
            message = 'Knowledge Platform migration 067 compatibility marker unique index is missing or divergent.';
    end if;
end
$kp_summary_bank_marker_postflight$;

notify pgrst, 'reload schema';
