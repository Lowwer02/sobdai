-- 042_kp_summaries_expand.sql
-- Sobdai Knowledge Platform — first Knowledge Layer migration.
--
-- The frozen SQL Migration Design assigned this responsibility to migration
-- 041. Production migration 041_news_gp_exam_requirement.sql now occupies that
-- identity, so the unchanged responsibility is reconciled to the next free,
-- monotonically increasing production identity: 042.
--
-- Purpose
-- -------
-- Expand the existing public.summaries row into the stable Summary aggregate
-- root while every legacy Summary reader and writer remains authoritative.
--
-- Scope boundary
-- --------------
-- * Adds only Summary-root identity, lifecycle, ownership, and audit fields.
-- * Preserves the existing UUID primary key and every legacy column.
-- * Creates no SummaryVersion, alias, source relation, or Package placement.
-- * Adds no current-version pointer FK because summary_versions does not exist.
-- * Adds no large-table lookup/unique index; the frozen online-index migration
--   owns those builds after identity collision analysis.
-- * Does not backfill or insert domain data.
-- * Preserves the existing Summary RLS policies unchanged. The dedicated RLS
--   foundation remains a later migration.
--
-- Deployment safety
-- -----------------
-- New columns are nullable and have no defaults, avoiding a table rewrite.
-- The migration fails quickly rather than waiting behind a long-lived lock.
-- The deployment executor owns bounded retry scheduling after a lock timeout.

set local lock_timeout = '5s';

-- ─────────────────────────────────────────────────────────────────────────────
-- Fail closed on dependency or baseline drift before taking the ALTER lock
-- ─────────────────────────────────────────────────────────────────────────────

do $kp_summary_root_prerequisites$
begin
    if to_regclass('public.summaries') is null
       or to_regclass('public.reference_documents') is null
       or to_regclass('public.reference_document_versions') is null
       or to_regclass('public.reference_document_aliases') is null
    then
        raise exception using
            errcode = 'check_violation',
            message = 'Knowledge Platform migration 042 prerequisites are missing: migrations 038-040 and public.summaries must exist.';
    end if;

    if not exists (
        select 1
        from pg_constraint c
        where c.conrelid = 'public.summaries'::regclass
          and c.contype = 'p'
          and pg_get_constraintdef(c.oid) = 'PRIMARY KEY (id)'
    ) then
        raise exception using
            errcode = 'check_violation',
            message = 'Knowledge Platform migration 042 drift: summaries must retain its UUID id primary key.';
    end if;

    if not exists (
        select 1
        from pg_class c
        join pg_namespace n on n.oid = c.relnamespace
        where n.nspname = 'public'
          and c.relname = 'summaries'
          and c.relrowsecurity
    ) then
        raise exception using
            errcode = 'check_violation',
            message = 'Knowledge Platform migration 042 drift: existing summaries RLS must remain enabled.';
    end if;
end
$kp_summary_root_prerequisites$;

-- ─────────────────────────────────────────────────────────────────────────────
-- Persistent Summary-code allocator
-- ─────────────────────────────────────────────────────────────────────────────

-- Sequence allocation is intentionally gap-tolerant. A rolled-back caller may
-- consume values, but allocated Summary codes are never reused.
create sequence if not exists public.summary_code_seq
    as bigint
    start with 1
    increment by 1
    minvalue 1
    no cycle
    cache 10;

comment on sequence public.summary_code_seq is
    'Persistent, gap-tolerant allocator for immutable Summary business identifiers.';

create or replace function public.format_summary_code(seq_value bigint)
returns text
language sql
immutable
strict
set search_path = pg_catalog
as $function$
    select 'SUM-' || lpad(seq_value::text, 6, '0')
$function$;

comment on function public.format_summary_code(bigint) is
    'Formats one allocator value as a case-normalized SUM-… Summary business identifier.';

create or replace function public.allocate_summary_codes(n integer)
returns text[]
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
    codes text[];
begin
    if n is null or n <= 0 then
        return array[]::text[];
    end if;

    select array_agg(
        public.format_summary_code(
            nextval('public.summary_code_seq'::regclass)
        )
        order by ordinal
    )
    into codes
    from generate_series(1, n) as allocated(ordinal);

    return codes;
end
$function$;

comment on function public.allocate_summary_codes(integer) is
    'Allocates immutable SUM-… identifiers only. It encodes no Package, Subject, year, title, or slug and may leave intentional gaps.';

-- ─────────────────────────────────────────────────────────────────────────────
-- Summary aggregate-root expansion
-- ─────────────────────────────────────────────────────────────────────────────

alter table public.summaries
    add column if not exists summary_code text,
    add column if not exists canonical_slug text,
    add column if not exists canonical_title text,
    add column if not exists visibility text,
    add column if not exists lifecycle_status text,
    add column if not exists current_published_version_id uuid,
    add column if not exists created_by uuid,
    add column if not exists archived_by uuid,
    add column if not exists archived_at timestamptz;

-- These constraints accept the intentional pre-backfill NULL state. Migration
-- 055 owns final NOT NULL enforcement after reconciliation. NOT VALID avoids a
-- populated-table scan while still constraining every new or changed row.
alter table public.summaries
    add constraint summaries_summary_code_check check (
        summary_code is null
        or (
            btrim(summary_code) <> ''
            and summary_code = upper(btrim(summary_code))
        )
    ) not valid,
    add constraint summaries_canonical_slug_check check (
        canonical_slug is null
        or (
            btrim(canonical_slug) <> ''
            and canonical_slug = lower(btrim(canonical_slug))
        )
    ) not valid,
    add constraint summaries_canonical_title_check check (
        canonical_title is null or btrim(canonical_title) <> ''
    ) not valid,
    add constraint summaries_visibility_check check (
        visibility is null
        or visibility in ('public_indexable', 'authenticated', 'product_entitled')
    ) not valid,
    add constraint summaries_lifecycle_status_check check (
        lifecycle_status is null
        or lifecycle_status in ('active', 'archived')
    ) not valid,
    add constraint summaries_archive_check check (
        (
            lifecycle_status is null
            and archived_at is null
            and archived_by is null
        )
        or (
            lifecycle_status = 'active'
            and archived_at is null
            and archived_by is null
        )
        or (
            lifecycle_status = 'archived'
            and archived_at is not null
            and archived_by is not null
        )
    ) not valid,
    add constraint summaries_created_by_fkey
        foreign key (created_by)
        references public.profiles(id)
        on delete set null
        not valid,
    add constraint summaries_archived_by_fkey
        foreign key (archived_by)
        references public.profiles(id)
        on delete set null
        not valid;

comment on table public.summaries is
    'Stable reusable Summary aggregate root. Legacy Package ownership, mutable Markdown, publication, and ordering columns remain authoritative during migration.';
comment on column public.summaries.id is
    'Existing immutable UUID identity preserved as the Summary aggregate primary key.';
comment on column public.summaries.summary_code is
    'Globally unique immutable Summary business identifier after backfill; allocated in the SUM-… namespace.';
comment on column public.summaries.canonical_slug is
    'Globally unique canonical public locator after backfill; Package-scoped legacy slug remains unchanged during coexistence.';
comment on column public.summaries.canonical_title is
    'Current canonical display title owned by the Summary root; required after backfill.';
comment on column public.summaries.subject is
    'Canonical Summary classification retained on the aggregate root.';
comment on column public.summaries.topic is
    'Canonical Summary classification retained on the aggregate root.';
comment on column public.summaries.law is
    'Canonical legal classification retained on the aggregate root.';
comment on column public.summaries.visibility is
    'Stable asset access class: public_indexable, authenticated, or product_entitled; populated during backfill.';
comment on column public.summaries.lifecycle_status is
    'Summary root lifecycle: active or archived; populated during backfill.';
comment on column public.summaries.current_published_version_id is
    'Optional unpinned-read pointer. Its same-parent SummaryVersion foreign key is added only after SummaryVersion exists.';
comment on column public.summaries.created_by is
    'Profile that established the Summary root; populated for legacy rows during backfill.';
comment on column public.summaries.created_at is
    'UTC instant when the Summary root was established; existing audit value is preserved.';
comment on column public.summaries.updated_at is
    'UTC instant of the latest mutable Summary-root or legacy compatibility change.';
comment on column public.summaries.archived_by is
    'Profile that archived the Summary; present only while lifecycle_status is archived.';
comment on column public.summaries.archived_at is
    'UTC archive instant; present only while lifecycle_status is archived.';

-- Once allocated, a Summary business identifier cannot be changed or cleared.
-- The NULL → value transition remains available for migration 047 backfill.
create or replace function public.protect_summary_code()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $function$
begin
    if old.summary_code is not null
       and new.summary_code is distinct from old.summary_code
    then
        raise exception
            'summary_code is immutable once allocated (current value: %)', old.summary_code
            using errcode = 'check_violation';
    end if;
    return new;
end
$function$;

comment on function public.protect_summary_code() is
    'Allows initial Summary-code allocation and rejects every later change or removal.';

drop trigger if exists protect_summary_code on public.summaries;
create trigger protect_summary_code
    before update of summary_code on public.summaries
    for each row execute function public.protect_summary_code();

-- Migration 042 does not add or alter a legacy updated_at trigger. Production
-- has no user trigger on public.summaries, so drift validation must preserve
-- that audited baseline rather than assume migration 005's trigger was applied.

-- No Summary indexes are built here. The table is populated and the frozen
-- online-index migration owns unique-on-non-null identity and lookup indexes.

-- Existing Summary RLS and policies intentionally remain untouched. New
-- fields do not alter the legacy public is_published rule or editorial policy.

revoke all on sequence public.summary_code_seq
    from public, anon, authenticated;
revoke all on function public.format_summary_code(bigint)
    from public, anon, authenticated;
revoke all on function public.allocate_summary_codes(integer)
    from public, anon, authenticated;
revoke all on function public.protect_summary_code()
    from public, anon, authenticated;

grant usage, select on sequence public.summary_code_seq to service_role;
grant execute on function public.format_summary_code(bigint) to service_role;
grant execute on function public.allocate_summary_codes(integer) to service_role;

-- ─────────────────────────────────────────────────────────────────────────────
-- Fail-closed migration validation
-- ─────────────────────────────────────────────────────────────────────────────

do $kp_summary_root_assertions$
declare
    expected record;
begin
    for expected in
        select *
        from (
            values
                ('id', 'uuid', 'NO'),
                ('summary_code', 'text', 'YES'),
                ('canonical_slug', 'text', 'YES'),
                ('canonical_title', 'text', 'YES'),
                ('visibility', 'text', 'YES'),
                ('lifecycle_status', 'text', 'YES'),
                ('current_published_version_id', 'uuid', 'YES'),
                ('created_by', 'uuid', 'YES'),
                ('created_at', 'timestamptz', 'NO'),
                ('updated_at', 'timestamptz', 'NO'),
                ('archived_by', 'uuid', 'YES'),
                ('archived_at', 'timestamptz', 'YES')
        ) as required_columns(column_name, udt_name, is_nullable)
    loop
        if not exists (
            select 1
            from information_schema.columns c
            where c.table_schema = 'public'
              and c.table_name = 'summaries'
              and c.column_name = expected.column_name
              and c.udt_name = expected.udt_name
              and c.is_nullable = expected.is_nullable
        ) then
            raise exception using
                errcode = 'check_violation',
                message = format(
                    'Knowledge Platform migration 042 drift: expected public.summaries.%I type=%s nullable=%s.',
                    expected.column_name,
                    expected.udt_name,
                    expected.is_nullable
                );
        end if;
    end loop;

    for expected in
        select *
        from (
            values
                ('summaries_summary_code_check', 'c'),
                ('summaries_canonical_slug_check', 'c'),
                ('summaries_canonical_title_check', 'c'),
                ('summaries_visibility_check', 'c'),
                ('summaries_lifecycle_status_check', 'c'),
                ('summaries_archive_check', 'c'),
                ('summaries_created_by_fkey', 'f'),
                ('summaries_archived_by_fkey', 'f')
        ) as required_constraints(constraint_name, constraint_type)
    loop
        if not exists (
            select 1
            from pg_constraint c
            where c.conrelid = 'public.summaries'::regclass
              and c.conname = expected.constraint_name
              and c.contype = expected.constraint_type::"char"
              and not c.convalidated
        ) then
            raise exception using
                errcode = 'check_violation',
                message = format(
                    'Knowledge Platform migration 042 drift: deferred constraint %I is missing, has the wrong type, or was validated prematurely.',
                    expected.constraint_name
                );
        end if;
    end loop;

    for expected in
        select *
        from (
            values
                ('summaries_created_by_fkey'),
                ('summaries_archived_by_fkey')
        ) as actor_fks(constraint_name)
    loop
        if not exists (
            select 1
            from pg_constraint c
            where c.conrelid = 'public.summaries'::regclass
              and c.conname = expected.constraint_name
              and c.confrelid = 'public.profiles'::regclass
              and c.confdeltype = 'n'
        ) then
            raise exception using
                errcode = 'check_violation',
                message = format(
                    'Knowledge Platform migration 042 drift: actor FK %I must reference profiles with ON DELETE SET NULL.',
                    expected.constraint_name
                );
        end if;
    end loop;

    if exists (
        select 1
        from pg_constraint c
        where c.conrelid = 'public.summaries'::regclass
          and c.conkey @> array[
              (
                  select a.attnum
                  from pg_attribute a
                  where a.attrelid = 'public.summaries'::regclass
                    and a.attname = 'current_published_version_id'
                    and not a.attisdropped
              )
          ]::smallint[]
    ) then
        raise exception using
            errcode = 'check_violation',
            message = 'Knowledge Platform migration 042 drift: current_published_version_id must not be constrained before SummaryVersion exists.';
    end if;

    if to_regclass('public.summary_versions') is not null
       or to_regclass('public.summary_aliases') is not null
       or to_regclass('public.summary_reference_documents') is not null
       or to_regclass('public.package_summaries') is not null
    then
        raise exception using
            errcode = 'check_violation',
            message = 'Knowledge Platform migration 042 scope drift: a later Knowledge/Product object already exists.';
    end if;

    if not exists (
        select 1
        from pg_sequence s
        where s.seqrelid = 'public.summary_code_seq'::regclass
          and s.seqtypid = 'bigint'::regtype
          and s.seqstart = 1
          and s.seqincrement = 1
          and s.seqmin = 1
          and not s.seqcycle
          and s.seqcache = 10
    ) then
        raise exception using
            errcode = 'check_violation',
            message = 'Knowledge Platform migration 042 drift: summary_code_seq has an incompatible allocation policy.';
    end if;

    if to_regprocedure('public.format_summary_code(bigint)') is null
       or to_regprocedure('public.allocate_summary_codes(integer)') is null
       or to_regprocedure('public.protect_summary_code()') is null
    then
        raise exception using
            errcode = 'check_violation',
            message = 'Knowledge Platform migration 042 drift: Summary-code allocation or immutability primitive is missing.';
    end if;

    for expected in
        select *
        from (
            values
                ('protect_summary_code')
        ) as required_triggers(trigger_name)
    loop
        if not exists (
            select 1
            from pg_trigger t
            where t.tgrelid = 'public.summaries'::regclass
              and t.tgname = expected.trigger_name
              and not t.tgisinternal
              and t.tgenabled <> 'D'
        ) then
            raise exception using
                errcode = 'check_violation',
                message = format(
                    'Knowledge Platform migration 042 drift: trigger %I is missing or disabled.',
                    expected.trigger_name
                );
        end if;
    end loop;

    if not exists (
        select 1
        from pg_class c
        join pg_namespace n on n.oid = c.relnamespace
        where n.nspname = 'public'
          and c.relname = 'summaries'
          and c.relrowsecurity
    ) then
        raise exception using
            errcode = 'check_violation',
            message = 'Knowledge Platform migration 042 drift: summaries RLS is not enabled.';
    end if;

    for expected in
        select *
        from (
            values
                ('Published summaries viewable by everyone.'),
                ('Content managers can manage summaries.')
        ) as required_policies(policy_name)
    loop
        if not exists (
            select 1
            from pg_policies p
            where p.schemaname = 'public'
              and p.tablename = 'summaries'
              and p.policyname = expected.policy_name
        ) then
            raise exception using
                errcode = 'check_violation',
                message = format(
                    'Knowledge Platform migration 042 drift: existing Summary policy %I is missing.',
                    expected.policy_name
                );
        end if;
    end loop;

    if has_function_privilege('anon', 'public.allocate_summary_codes(integer)', 'EXECUTE')
       or has_function_privilege('authenticated', 'public.allocate_summary_codes(integer)', 'EXECUTE')
    then
        raise exception using
            errcode = 'check_violation',
            message = 'Knowledge Platform migration 042 drift: a browser role can allocate Summary identifiers.';
    end if;

    raise notice 'Knowledge Platform migration 042 passed: Summary root expansion is compatible, constrained, and dormant.';
end
$kp_summary_root_assertions$;

notify pgrst, 'reload schema';
