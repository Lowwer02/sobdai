-- 067_kp_summary_bank_compatibility_marker.sql
-- Sobdai Knowledge Platform — durable Summary Bank compatibility placement.
--
-- Migration-number audit
-- ----------------------
-- Migration 066 is the highest tracked or untracked numeric migration present
-- when this file is created. Migration 067 is therefore the next safe identity.
--
-- Purpose
-- -------
-- Persist, on PackageSummary itself, the one placement that represents each
-- historical Summary Bank row. The one-time backfill uses the still-present
-- legacy Summary Package association as its only authority. No placement is
-- inferred, selected heuristically, or created by this migration.
--
-- Lifecycle boundary
-- ------------------
-- This migration does not change any kp_persist_* writer. A later forward
-- migration must make those commands maintain this marker before legacy
-- Summary Package ownership or migration-control evidence is retired.

set local lock_timeout = '5s';

-- ─────────────────────────────────────────────────────────────────────────────
-- Fail closed before adding or backfilling the marker. All public.summaries
-- rows are legacy-compatible Summary Bank rows at this coexistence boundary.
-- ─────────────────────────────────────────────────────────────────────────────

do $kp_summary_bank_marker_preflight$
declare
    expected record;
    v_column_exists boolean;
    v_ledger_mismatch boolean := false;
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
            ('summaries', 'sort_order', 'int4', 'NO'),
            ('summaries', 'display_order', 'int4', 'NO'),
            ('summaries', 'released_at', 'timestamptz', 'YES'),
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

    if exists (
        select 1
        from public.summaries s
        where s.package_id is null
           or s.slug is null
           or nullif(btrim(s.slug), '') is null
    ) then
        raise exception using
            errcode = 'not_null_violation',
            message = 'Knowledge Platform migration 067 requires every Summary Bank Summary to retain a Package and non-empty legacy slug.';
    end if;

    if exists (
        select 1
        from public.summaries s
        where (
            select count(*)
            from public.package_summaries ps
            where ps.summary_id = s.id
              and ps.package_id = s.package_id
        ) <> 1
    ) then
        raise exception using
            errcode = 'cardinality_violation',
            message = 'Knowledge Platform migration 067 requires exactly one PackageSummary matching each historical Summary/Package association.';
    end if;

    if exists (
        select 1
        from public.summaries s
        join public.package_summaries ps
          on ps.summary_id = s.id
         and ps.package_id = s.package_id
        where ps.legacy_slug is distinct from s.slug
    ) then
        raise exception using
            errcode = 'check_violation',
            message = 'Knowledge Platform migration 067 found a historical PackageSummary legacy slug that does not match its Summary.';
    end if;

    if exists (
        select 1
        from public.summaries s
        join public.package_summaries ps
          on ps.summary_id = s.id
         and ps.package_id = s.package_id
        where ps.sort_order is distinct from s.sort_order
           or ps.display_order is distinct from s.display_order
           or ps.released_at is distinct from s.released_at
    ) then
        raise exception using
            errcode = 'check_violation',
            message = 'Knowledge Platform migration 067 found historical PackageSummary ordering metadata that does not match its Summary.';
    end if;

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
                message = 'Knowledge Platform migration 067 found an incompatible pre-existing Summary Bank compatibility marker column.';
        end if;

        if exists (
            select 1
            from public.package_summaries ps
            where ps.is_summary_bank_compatibility
              and not exists (
                  select 1
                  from public.summaries s
                  where s.id = ps.summary_id
                    and s.package_id = ps.package_id
                    and s.slug = ps.legacy_slug
              )
        ) then
            raise exception using
                errcode = 'check_violation',
                message = 'Knowledge Platform migration 067 found a conflicting pre-existing compatibility marker.';
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
                message = 'Knowledge Platform migration 067 found multiple pre-existing compatibility markers for one Summary.';
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

    -- Migration evidence is optional and is never referenced by a durable
    -- object. When migration 053 placement evidence remains available, every
    -- recorded association and ordering value must agree with live authority.
    if to_regclass('kp_migration.summary_ledger') is not null then
        for expected in
            select column_name
            from (values
                ('source_summary_id'),
                ('source_package_id'),
                ('target_summary_id'),
                ('target_package_id'),
                ('target_legacy_slug'),
                ('provenance')
            ) as required(column_name)
        loop
            if not exists (
                select 1
                from information_schema.columns c
                where c.table_schema = 'kp_migration'
                  and c.table_name = 'summary_ledger'
                  and c.column_name = expected.column_name
            ) then
                raise exception using
                    errcode = 'check_violation',
                    message = format(
                        'Knowledge Platform migration 067 found incomplete migration evidence: kp_migration.summary_ledger.%I is missing.',
                        expected.column_name
                    );
            end if;
        end loop;

        execute $ledger_check$
            select exists (
                select 1
                from kp_migration.summary_ledger l
                join public.summaries s
                  on s.id = l.source_summary_id
                join public.package_summaries ps
                  on ps.summary_id = s.id
                 and ps.package_id = s.package_id
                where l.provenance ? 'package_summary_placement'
                  and (
                      l.source_package_id is distinct from s.package_id
                      or l.target_summary_id is distinct from s.id
                      or l.target_package_id is distinct from s.package_id
                      or l.target_legacy_slug is distinct from s.slug
                      or l.provenance #>> '{package_summary_placement,package_id}' is distinct from s.package_id::text
                      or l.provenance #>> '{package_summary_placement,summary_id}' is distinct from s.id::text
                      or l.provenance #>> '{package_summary_placement,legacy_slug}' is distinct from s.slug
                      or l.provenance #> '{package_summary_placement,sort_order}' is distinct from to_jsonb(ps.sort_order)
                      or l.provenance #> '{package_summary_placement,display_order}' is distinct from to_jsonb(ps.display_order)
                      or coalesce(l.provenance #> '{package_summary_placement,released_at}', 'null'::jsonb)
                         is distinct from coalesce(to_jsonb(ps.released_at), 'null'::jsonb)
                  )
            )
        $ledger_check$ into v_ledger_mismatch;

        if v_ledger_mismatch then
            raise exception using
                errcode = 'serialization_failure',
                message = 'Knowledge Platform migration 067 found migration-053 placement evidence that conflicts with live historical authority.';
        end if;
    end if;
end
$kp_summary_bank_marker_preflight$;

-- ─────────────────────────────────────────────────────────────────────────────
-- Durable target-owned marker and invariants. IF NOT EXISTS is paired with
-- explicit catalog validation so a partial or divergent prior attempt fails.
-- ─────────────────────────────────────────────────────────────────────────────

alter table public.package_summaries
    add column if not exists is_summary_bank_compatibility boolean not null default false;

comment on column public.package_summaries.is_summary_bank_compatibility is
    'True only for the durable PackageSummary placement representing one historical Summary Bank row.';

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
            message = 'Knowledge Platform migration 067 found an incompatible pre-existing compatibility marker CHECK constraint.';
    end if;
end
$kp_summary_bank_marker_constraint$;

do $kp_summary_bank_marker_partial_state$
begin
    if exists (
        select 1
        from public.package_summaries ps
        where ps.is_summary_bank_compatibility
          and (
              ps.legacy_slug is null
              or not exists (
                  select 1
                  from public.summaries s
                  where s.id = ps.summary_id
                    and s.package_id = ps.package_id
                    and s.slug = ps.legacy_slug
              )
          )
    ) then
        raise exception using
            errcode = 'check_violation',
            message = 'Knowledge Platform migration 067 refuses to overwrite conflicting compatibility marker state.';
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
            message = 'Knowledge Platform migration 067 refuses ambiguous compatibility marker state.';
    end if;
end
$kp_summary_bank_marker_partial_state$;

create unique index if not exists package_summaries_one_bank_compatibility_key
    on public.package_summaries (summary_id)
    where is_summary_bank_compatibility = true;

comment on index public.package_summaries_one_bank_compatibility_key is
    'Enforces at most one durable Summary Bank compatibility placement per Summary.';

-- ─────────────────────────────────────────────────────────────────────────────
-- Exact historical backfill. The join is the preserved Summary UUID plus its
-- preserved Package FK; slug is validation evidence, never a row selector.
-- ─────────────────────────────────────────────────────────────────────────────

update public.package_summaries ps
set is_summary_bank_compatibility = true
from public.summaries s
where ps.summary_id = s.id
  and ps.package_id = s.package_id
  and not ps.is_summary_bank_compatibility;

alter table public.package_summaries
    validate constraint package_summaries_bank_compatibility_slug_check;

-- ─────────────────────────────────────────────────────────────────────────────
-- Post-backfill data and catalog reconciliation. No repair path is provided.
-- ─────────────────────────────────────────────────────────────────────────────

do $kp_summary_bank_marker_postflight$
declare
    v_expected_count bigint;
    v_marked_count bigint;
    v_marker_attnum smallint;
begin
    select count(*) into v_expected_count
    from public.summaries;

    select count(*) into v_marked_count
    from public.package_summaries ps
    where ps.is_summary_bank_compatibility;

    if v_marked_count <> v_expected_count then
        raise exception using
            errcode = 'cardinality_violation',
            message = format(
                'Knowledge Platform migration 067 marker count mismatch: expected %s, marked %s.',
                v_expected_count,
                v_marked_count
            );
    end if;

    if exists (
        select 1
        from public.summaries s
        where (
            select count(*)
            from public.package_summaries ps
            where ps.summary_id = s.id
              and ps.is_summary_bank_compatibility
        ) <> 1
    ) then
        raise exception using
            errcode = 'cardinality_violation',
            message = 'Knowledge Platform migration 067 did not produce exactly one marked placement for every Summary Bank Summary.';
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
            message = 'Knowledge Platform migration 067 produced multiple marked placements for one Summary.';
    end if;

    if exists (
        select 1
        from public.package_summaries ps
        where ps.is_summary_bank_compatibility
          and ps.legacy_slug is null
    ) then
        raise exception using
            errcode = 'not_null_violation',
            message = 'Knowledge Platform migration 067 produced a marked placement without a legacy slug.';
    end if;

    if exists (
        select 1
        from public.package_summaries ps
        where ps.is_summary_bank_compatibility
          and not exists (
              select 1
              from public.summaries s
              where s.id = ps.summary_id
                and s.package_id = ps.package_id
                and s.slug = ps.legacy_slug
          )
    ) then
        raise exception using
            errcode = 'check_violation',
            message = 'Knowledge Platform migration 067 marked a placement outside the exact historical Package/slug association.';
    end if;

    if exists (
        select 1
        from public.package_summaries ps
        join public.summaries s on s.id = ps.summary_id
        where ps.package_id <> s.package_id
          and ps.is_summary_bank_compatibility
    ) then
        raise exception using
            errcode = 'check_violation',
            message = 'Knowledge Platform migration 067 marked an additional target-only PackageSummary placement.';
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
