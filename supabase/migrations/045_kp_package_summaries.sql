-- 045_kp_package_summaries.sql
-- Sobdai Knowledge Platform — PackageSummary placement foundation.
--
-- The frozen SQL Migration Design assigned this responsibility to migration
-- 044. Production identities through 044 are occupied, so the unchanged
-- PackageSummary responsibility uses the next free identity: 045.
--
-- Purpose
-- -------
-- Create Product-owned placement records that reference reusable Summary
-- assets without moving or copying Summary content.
--
-- Scope boundary
-- --------------
-- * Creates only public.package_summaries and its protections.
-- * Uses the frozen composite placement identity (package_id, summary_id).
-- * Adds status, version-selection, ordering, release, navigation, legacy-route,
--   and lifecycle audit fields assigned to PackageSummary.
-- * Creates no backfill, read model, picker, publish workflow, Recommendation
--   integration, Adaptive Learning object, or later migration responsibility.
-- * Does not alter packages, summaries, summary_versions, or application code.
--
-- Safety / rollback
-- -----------------
-- The table is new, empty, and dormant. RLS is enabled without policies and
-- browser grants are revoked. Existing Package/Summary storage stays authoritative.

set local lock_timeout = '5s';

-- ─────────────────────────────────────────────────────────────────────────────
-- Fail closed on migrations 042-044 dependency drift
-- ─────────────────────────────────────────────────────────────────────────────

do $kp_package_summaries_preflight$
declare
    expected_table text;
begin
    foreach expected_table in array array[
        'packages',
        'summaries',
        'summary_versions',
        'summary_aliases',
        'summary_reference_documents',
        'summary_version_reference_documents'
    ]
    loop
        if to_regclass('public.' || expected_table) is null then
            raise exception using
                errcode = 'check_violation',
                message = format(
                    'Knowledge Platform migration 045 requires public.%I from migrations 042-044.',
                    expected_table
                );
        end if;
    end loop;

    if not exists (
        select 1
        from pg_constraint c
        where c.conrelid = 'public.packages'::regclass
          and c.contype = 'p'
          and pg_get_constraintdef(c.oid) = 'PRIMARY KEY (id)'
    ) then
        raise exception using
            errcode = 'check_violation',
            message = 'Knowledge Platform migration 045 requires the Package UUID primary key.';
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
            message = 'Knowledge Platform migration 045 requires the preserved Summary UUID primary key.';
    end if;

    if not exists (
        select 1
        from pg_constraint c
        where c.conrelid = 'public.summary_versions'::regclass
          and c.conname = 'summary_versions_parent_id_key'
          and c.contype = 'u'
          and c.convalidated
    ) then
        raise exception using
            errcode = 'check_violation',
            message = 'Knowledge Platform migration 045 requires the migration 043 same-parent SummaryVersion identity.';
    end if;

    if to_regprocedure('public.handle_updated_at()') is null then
        raise exception using
            errcode = 'check_violation',
            message = 'Knowledge Platform migration 045 requires public.handle_updated_at().';
    end if;
end
$kp_package_summaries_preflight$;

-- ─────────────────────────────────────────────────────────────────────────────
-- PackageSummary placement entity
-- ─────────────────────────────────────────────────────────────────────────────

create table if not exists public.package_summaries (
    package_id uuid not null,
    summary_id uuid not null,

    status text not null default 'draft',
    version_policy text not null default 'latest_published',
    pinned_summary_version_id uuid,

    sort_order integer not null default 0,
    display_order integer not null default 0,
    released_at timestamptz,
    navigation_label text,
    legacy_slug text,

    created_by uuid not null,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    activated_by uuid,
    activated_at timestamptz,
    hidden_by uuid,
    hidden_at timestamptz,

    constraint package_summaries_pkey
        primary key (package_id, summary_id),

    constraint package_summaries_status_check check (
        status in ('draft', 'active', 'hidden')
    ),
    constraint package_summaries_version_policy_check check (
        version_policy in ('latest_published', 'pinned')
    ),
    constraint package_summaries_policy_pin_check check (
        (
            version_policy = 'latest_published'
            and pinned_summary_version_id is null
        )
        or (
            version_policy = 'pinned'
            and pinned_summary_version_id is not null
        )
    ),
    constraint package_summaries_optional_text_check check (
        (navigation_label is null or btrim(navigation_label) <> '')
        and (legacy_slug is null or btrim(legacy_slug) <> '')
    ),
    constraint package_summaries_legacy_slug_check check (
        legacy_slug is null
        or legacy_slug = lower(btrim(legacy_slug))
    ),
    constraint package_summaries_lifecycle_audit_check check (
        (
            status = 'draft'
            and activated_by is null
            and activated_at is null
            and hidden_by is null
            and hidden_at is null
        )
        or (
            status = 'active'
            and activated_by is not null
            and activated_at is not null
            and hidden_by is null
            and hidden_at is null
        )
        or (
            status = 'hidden'
            and activated_by is null
            and activated_at is null
            and hidden_by is not null
            and hidden_at is not null
        )
    ),

    constraint package_summaries_package_fkey
        foreign key (package_id)
        references public.packages(id)
        on delete cascade,
    constraint package_summaries_summary_fkey
        foreign key (summary_id)
        references public.summaries(id)
        on delete restrict,
    constraint package_summaries_pinned_version_fkey
        foreign key (summary_id, pinned_summary_version_id)
        references public.summary_versions(summary_id, id)
        on delete restrict
        deferrable initially deferred,
    constraint package_summaries_created_by_fkey
        foreign key (created_by)
        references public.profiles(id)
        on delete set null,
    constraint package_summaries_activated_by_fkey
        foreign key (activated_by)
        references public.profiles(id)
        on delete set null,
    constraint package_summaries_hidden_by_fkey
        foreign key (hidden_by)
        references public.profiles(id)
        on delete set null
);

comment on table public.package_summaries is
    'Package-owned placement of one reusable Summary. Stores Product context only and never owns or copies Summary Markdown.';
comment on column public.package_summaries.package_id is
    'Owning Package and first component of the placement identity.';
comment on column public.package_summaries.summary_id is
    'Referenced reusable Summary and second component of the placement identity.';
comment on column public.package_summaries.status is
    'Placement lifecycle: draft, active, or hidden.';
comment on column public.package_summaries.version_policy is
    'Revision selection strategy: latest_published or pinned.';
comment on column public.package_summaries.pinned_summary_version_id is
    'Required only for pinned policy and structurally restricted to the selected Summary.';
comment on column public.package_summaries.sort_order is
    'Stable Package-local manual sequence.';
comment on column public.package_summaries.display_order is
    'Package-local promotional precedence; higher values are displayed first.';
comment on column public.package_summaries.released_at is
    'Optional Package-context release instant.';
comment on column public.package_summaries.navigation_label is
    'Optional Package-specific display label; never canonical Summary title ownership.';
comment on column public.package_summaries.legacy_slug is
    'Optional lowercase Package-scoped legacy Summary route key.';
comment on column public.package_summaries.created_by is
    'Profile that attached the Summary to the Package.';
comment on column public.package_summaries.created_at is
    'UTC instant when the placement was attached.';
comment on column public.package_summaries.updated_at is
    'UTC instant of the most recent permitted placement change.';
comment on column public.package_summaries.activated_by is
    'Profile that most recently activated the placement; present only while active.';
comment on column public.package_summaries.activated_at is
    'UTC instant of the most recent activation; present only while active.';
comment on column public.package_summaries.hidden_by is
    'Profile that most recently hid the placement; present only while hidden.';
comment on column public.package_summaries.hidden_at is
    'UTC instant when the placement was hidden; present only while hidden.';

-- ─────────────────────────────────────────────────────────────────────────────
-- Placement identity and lifecycle protection
-- ─────────────────────────────────────────────────────────────────────────────

create or replace function public.enforce_package_summary_transition()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $function$
begin
    if new.status is not distinct from old.status then
        return new;
    end if;

    if not (
        (old.status = 'draft' and new.status in ('active', 'hidden'))
        or (old.status = 'active' and new.status = 'hidden')
        or (old.status = 'hidden' and new.status in ('active', 'draft'))
    ) then
        raise exception
            'invalid PackageSummary lifecycle transition: % -> %',
            old.status,
            new.status
            using errcode = 'check_violation';
    end if;

    return new;
end
$function$;

comment on function public.enforce_package_summary_transition() is
    'Allows only the frozen draft/active/hidden PackageSummary lifecycle transitions.';

create or replace function public.protect_package_summary_identity()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $function$
begin
    if row(
        new.package_id,
        new.summary_id,
        new.created_by,
        new.created_at
    ) is distinct from row(
        old.package_id,
        old.summary_id,
        old.created_by,
        old.created_at
    ) then
        raise exception
            'PackageSummary Package/Summary identity and attachment audit are immutable'
            using errcode = 'check_violation';
    end if;

    return new;
end
$function$;

comment on function public.protect_package_summary_identity() is
    'Prevents placement repointing and mutation of its creation audit.';

drop trigger if exists enforce_package_summary_transition
    on public.package_summaries;
create trigger enforce_package_summary_transition
    before update of status on public.package_summaries
    for each row execute function public.enforce_package_summary_transition();

drop trigger if exists protect_package_summary_identity
    on public.package_summaries;
create trigger protect_package_summary_identity
    before update on public.package_summaries
    for each row execute function public.protect_package_summary_identity();

drop trigger if exists handle_updated_at_package_summaries
    on public.package_summaries;
create trigger handle_updated_at_package_summaries
    before update on public.package_summaries
    for each row execute procedure public.handle_updated_at();

-- Cross-row activation readiness is intentionally not installed here. The
-- frozen publish/activation Application Service validates active Summary state
-- and resolved published revision later; this migration only creates storage.

-- ─────────────────────────────────────────────────────────────────────────────
-- Frozen placement indexes
-- ─────────────────────────────────────────────────────────────────────────────

create index if not exists package_summaries_package_order_idx
    on public.package_summaries (
        package_id,
        status,
        display_order desc,
        sort_order,
        summary_id
    );

create index if not exists package_summaries_summary_package_idx
    on public.package_summaries (summary_id, package_id);

create index if not exists package_summaries_pinned_version_idx
    on public.package_summaries (pinned_summary_version_id)
    where pinned_summary_version_id is not null;

create unique index if not exists package_summaries_package_legacy_slug_key
    on public.package_summaries (package_id, legacy_slug)
    where legacy_slug is not null;

create index if not exists package_summaries_package_release_idx
    on public.package_summaries (package_id, released_at desc);

-- ─────────────────────────────────────────────────────────────────────────────
-- Dormant deny-by-default access boundary
-- ─────────────────────────────────────────────────────────────────────────────

alter table public.package_summaries enable row level security;

revoke all on table public.package_summaries
    from public, anon, authenticated;
revoke all on function public.enforce_package_summary_transition()
    from public, anon, authenticated;
revoke all on function public.protect_package_summary_identity()
    from public, anon, authenticated;

grant select, insert, update, delete
    on table public.package_summaries
    to service_role;

-- ─────────────────────────────────────────────────────────────────────────────
-- Fail-closed migration validation
-- ─────────────────────────────────────────────────────────────────────────────

do $kp_package_summaries_assertions$
declare
    expected record;
begin
    if to_regclass('public.package_summaries') is null then
        raise exception using
            errcode = 'check_violation',
            message = 'Knowledge Platform migration 045 drift: public.package_summaries is missing.';
    end if;

    for expected in
        select *
        from (
            values
                ('package_id', 'uuid', 'NO'),
                ('summary_id', 'uuid', 'NO'),
                ('status', 'text', 'NO'),
                ('version_policy', 'text', 'NO'),
                ('pinned_summary_version_id', 'uuid', 'YES'),
                ('sort_order', 'int4', 'NO'),
                ('display_order', 'int4', 'NO'),
                ('released_at', 'timestamptz', 'YES'),
                ('navigation_label', 'text', 'YES'),
                ('legacy_slug', 'text', 'YES'),
                ('created_by', 'uuid', 'NO'),
                ('created_at', 'timestamptz', 'NO'),
                ('updated_at', 'timestamptz', 'NO'),
                ('activated_by', 'uuid', 'YES'),
                ('activated_at', 'timestamptz', 'YES'),
                ('hidden_by', 'uuid', 'YES'),
                ('hidden_at', 'timestamptz', 'YES')
        ) as required_columns(column_name, udt_name, is_nullable)
    loop
        if not exists (
            select 1
            from information_schema.columns c
            where c.table_schema = 'public'
              and c.table_name = 'package_summaries'
              and c.column_name = expected.column_name
              and c.udt_name = expected.udt_name
              and c.is_nullable = expected.is_nullable
        ) then
            raise exception using
                errcode = 'check_violation',
                message = format(
                    'Knowledge Platform migration 045 drift: expected public.package_summaries.%I type=%s nullable=%s.',
                    expected.column_name,
                    expected.udt_name,
                    expected.is_nullable
                );
        end if;
    end loop;

    if (
        select count(*)
        from information_schema.columns c
        where c.table_schema = 'public'
          and c.table_name = 'package_summaries'
    ) <> 17 then
        raise exception using
            errcode = 'check_violation',
            message = 'Knowledge Platform migration 045 drift: public.package_summaries has unexpected columns.';
    end if;

    for expected in
        select *
        from (
            values
                ('package_summaries_pkey'),
                ('package_summaries_status_check'),
                ('package_summaries_version_policy_check'),
                ('package_summaries_policy_pin_check'),
                ('package_summaries_optional_text_check'),
                ('package_summaries_legacy_slug_check'),
                ('package_summaries_lifecycle_audit_check'),
                ('package_summaries_package_fkey'),
                ('package_summaries_summary_fkey'),
                ('package_summaries_pinned_version_fkey'),
                ('package_summaries_created_by_fkey'),
                ('package_summaries_activated_by_fkey'),
                ('package_summaries_hidden_by_fkey')
        ) as required_constraints(constraint_name)
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
                message = format(
                    'Knowledge Platform migration 045 drift: constraint %I is missing or unvalidated.',
                    expected.constraint_name
                );
        end if;
    end loop;

    if not exists (
        select 1
        from pg_constraint c
        where c.conrelid = 'public.package_summaries'::regclass
          and c.conname = 'package_summaries_pkey'
          and c.contype = 'p'
          and pg_get_constraintdef(c.oid) = 'PRIMARY KEY (package_id, summary_id)'
    ) then
        raise exception using
            errcode = 'check_violation',
            message = 'Knowledge Platform migration 045 drift: PackageSummary identity must be composite (package_id, summary_id).';
    end if;

    if not exists (
        select 1
        from pg_constraint c
        where c.conrelid = 'public.package_summaries'::regclass
          and c.conname = 'package_summaries_package_fkey'
          and c.contype = 'f'
          and c.confrelid = 'public.packages'::regclass
          and c.confdeltype = 'c'
    ) then
        raise exception using
            errcode = 'check_violation',
            message = 'Knowledge Platform migration 045 drift: Package deletion must cascade only its placements.';
    end if;

    if not exists (
        select 1
        from pg_constraint c
        where c.conrelid = 'public.package_summaries'::regclass
          and c.conname = 'package_summaries_summary_fkey'
          and c.contype = 'f'
          and c.confrelid = 'public.summaries'::regclass
          and c.confdeltype = 'r'
    ) then
        raise exception using
            errcode = 'check_violation',
            message = 'Knowledge Platform migration 045 drift: Summary deletion must be restricted by Package placements.';
    end if;

    if not exists (
        select 1
        from pg_constraint c
        where c.conrelid = 'public.package_summaries'::regclass
          and c.conname = 'package_summaries_pinned_version_fkey'
          and c.contype = 'f'
          and c.confrelid = 'public.summary_versions'::regclass
          and c.confdeltype = 'r'
          and c.condeferrable
          and c.condeferred
          and pg_get_constraintdef(c.oid) ilike '%FOREIGN KEY (summary_id, pinned_summary_version_id)%'
          and pg_get_constraintdef(c.oid) ilike '%REFERENCES summary_versions(summary_id, id)%'
    ) then
        raise exception using
            errcode = 'check_violation',
            message = 'Knowledge Platform migration 045 drift: pinned revision FK must be same-Summary, RESTRICT, and deferred.';
    end if;

    for expected in
        select *
        from (
            values
                ('package_summaries_created_by_fkey'),
                ('package_summaries_activated_by_fkey'),
                ('package_summaries_hidden_by_fkey')
        ) as actor_fks(constraint_name)
    loop
        if not exists (
            select 1
            from pg_constraint c
            where c.conrelid = 'public.package_summaries'::regclass
              and c.conname = expected.constraint_name
              and c.contype = 'f'
              and c.confrelid = 'public.profiles'::regclass
              and c.confdeltype = 'n'
        ) then
            raise exception using
                errcode = 'check_violation',
                message = format(
                    'Knowledge Platform migration 045 drift: actor FK %I must reference profiles with ON DELETE SET NULL.',
                    expected.constraint_name
                );
        end if;
    end loop;

    for expected in
        select *
        from (
            values
                ('package_summaries_pkey'),
                ('package_summaries_package_order_idx'),
                ('package_summaries_summary_package_idx'),
                ('package_summaries_pinned_version_idx'),
                ('package_summaries_package_legacy_slug_key'),
                ('package_summaries_package_release_idx')
        ) as required_indexes(index_name)
    loop
        if not exists (
            select 1
            from pg_class i
            join pg_namespace n on n.oid = i.relnamespace
            join pg_index x on x.indexrelid = i.oid
            where n.nspname = 'public'
              and i.relname = expected.index_name
              and x.indrelid = 'public.package_summaries'::regclass
              and x.indisvalid
              and x.indisready
        ) then
            raise exception using
                errcode = 'check_violation',
                message = format(
                    'Knowledge Platform migration 045 drift: index %I is missing, invalid, or not ready.',
                    expected.index_name
                );
        end if;
    end loop;

    if not exists (
        select 1
        from pg_class i
        join pg_namespace n on n.oid = i.relnamespace
        join pg_index x on x.indexrelid = i.oid
        where n.nspname = 'public'
          and i.relname = 'package_summaries_package_legacy_slug_key'
          and x.indrelid = 'public.package_summaries'::regclass
          and x.indisunique
          and x.indpred is not null
    ) then
        raise exception using
            errcode = 'check_violation',
            message = 'Knowledge Platform migration 045 drift: Package legacy slug index must be unique and partial.';
    end if;

    if to_regprocedure('public.enforce_package_summary_transition()') is null
       or to_regprocedure('public.protect_package_summary_identity()') is null
    then
        raise exception using
            errcode = 'check_violation',
            message = 'Knowledge Platform migration 045 drift: placement lifecycle or identity function is missing.';
    end if;

    for expected in
        select *
        from (
            values
                ('enforce_package_summary_transition'),
                ('protect_package_summary_identity'),
                ('handle_updated_at_package_summaries')
        ) as required_triggers(trigger_name)
    loop
        if not exists (
            select 1
            from pg_trigger t
            where t.tgrelid = 'public.package_summaries'::regclass
              and t.tgname = expected.trigger_name
              and not t.tgisinternal
              and t.tgenabled <> 'D'
        ) then
            raise exception using
                errcode = 'check_violation',
                message = format(
                    'Knowledge Platform migration 045 drift: trigger %I is missing or disabled.',
                    expected.trigger_name
                );
        end if;
    end loop;

    if not exists (
        select 1
        from pg_class c
        join pg_namespace n on n.oid = c.relnamespace
        where n.nspname = 'public'
          and c.relname = 'package_summaries'
          and c.relrowsecurity
    ) then
        raise exception using
            errcode = 'check_violation',
            message = 'Knowledge Platform migration 045 drift: RLS is not enabled on public.package_summaries.';
    end if;

    if exists (
        select 1
        from pg_policies
        where schemaname = 'public'
          and tablename = 'package_summaries'
    ) then
        raise exception using
            errcode = 'check_violation',
            message = 'Knowledge Platform migration 045 drift: package_summaries must have no policies before the dedicated RLS foundation.';
    end if;

    if has_table_privilege('anon', 'public.package_summaries', 'SELECT')
       or has_table_privilege('authenticated', 'public.package_summaries', 'SELECT')
       or has_table_privilege('anon', 'public.package_summaries', 'INSERT')
       or has_table_privilege('authenticated', 'public.package_summaries', 'INSERT')
       or has_table_privilege('anon', 'public.package_summaries', 'UPDATE')
       or has_table_privilege('authenticated', 'public.package_summaries', 'UPDATE')
       or has_table_privilege('anon', 'public.package_summaries', 'DELETE')
       or has_table_privilege('authenticated', 'public.package_summaries', 'DELETE')
    then
        raise exception using
            errcode = 'check_violation',
            message = 'Knowledge Platform migration 045 drift: a browser role can access dormant PackageSummary storage.';
    end if;

    for expected in
        select *
        from (
            values
                ('SELECT'),
                ('INSERT'),
                ('UPDATE'),
                ('DELETE')
        ) as service_privileges(privilege_name)
    loop
        if not has_table_privilege(
            'service_role',
            'public.package_summaries',
            expected.privilege_name
        ) then
            raise exception using
                errcode = 'check_violation',
                message = format(
                    'Knowledge Platform migration 045 drift: service_role lacks %s on public.package_summaries.',
                    expected.privilege_name
                );
        end if;
    end loop;

    raise notice 'Knowledge Platform migration 045 passed: PackageSummary placements are valid, private, and dormant.';
end
$kp_package_summaries_assertions$;

notify pgrst, 'reload schema';
