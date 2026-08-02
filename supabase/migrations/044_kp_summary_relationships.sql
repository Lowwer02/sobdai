-- 044_kp_summary_relationships.sql
-- Sobdai Knowledge Platform — Summary metadata and relationship foundation.
--
-- The frozen SQL Migration Design assigned this responsibility to migration
-- 043. Production identities 041-043 are already occupied, so this unchanged
-- responsibility uses the next free production identity: 044.
--
-- Purpose
-- -------
-- Create direct Summary aliases, mutable live Summary-to-source relationships,
-- and immutable SummaryVersion source snapshots.
--
-- Scope boundary
-- --------------
-- * Creates only public.summary_aliases,
--   public.summary_reference_documents, and
--   public.summary_version_reference_documents.
-- * Installs only their frozen collision, lifecycle, audit, relationship, and
--   snapshot-immutability protections.
-- * Creates no PackageSummary, Package integration, backfill, read model,
--   publish workflow, Recommendation integration, or later-layer object.
-- * Inserts no data and preserves all legacy Summary behavior.
--
-- Safety / rollback
-- -----------------
-- All three tables are new and empty. RLS is enabled without policies and
-- browser grants are revoked, leaving the relationship layer dormant.

set local lock_timeout = '5s';

-- ─────────────────────────────────────────────────────────────────────────────
-- Fail closed on migrations 038-043 dependency drift
-- ─────────────────────────────────────────────────────────────────────────────

do $kp_summary_relationships_preflight$
declare
    expected_table text;
begin
    foreach expected_table in array array[
        'summaries',
        'summary_versions',
        'reference_documents',
        'reference_document_versions'
    ]
    loop
        if to_regclass('public.' || expected_table) is null then
            raise exception using
                errcode = 'check_violation',
                message = format(
                    'Knowledge Platform migration 044 requires public.%I from migrations 038-043.',
                    expected_table
                );
        end if;
    end loop;

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
            message = 'Knowledge Platform migration 044 requires migration 043 SummaryVersion parent identity.';
    end if;

    if not exists (
        select 1
        from pg_constraint c
        where c.conrelid = 'public.reference_document_versions'::regclass
          and c.conname = 'reference_document_versions_parent_id_key'
          and c.contype = 'u'
          and c.convalidated
    ) then
        raise exception using
            errcode = 'check_violation',
            message = 'Knowledge Platform migration 044 requires migration 039 source-version parent identity.';
    end if;

    if to_regprocedure('public.handle_updated_at()') is null then
        raise exception using
            errcode = 'check_violation',
            message = 'Knowledge Platform migration 044 requires public.handle_updated_at().';
    end if;

    if to_regclass('public.package_summaries') is not null then
        raise exception using
            errcode = 'check_violation',
            message = 'Knowledge Platform migration 044 scope drift: later Product relationship public.package_summaries already exists.';
    end if;
end
$kp_summary_relationships_preflight$;

-- ─────────────────────────────────────────────────────────────────────────────
-- SummaryAlias child entity
-- ─────────────────────────────────────────────────────────────────────────────

create table if not exists public.summary_aliases (
    id uuid not null default uuid_generate_v4(),
    summary_id uuid not null,
    slug text not null,
    redirect_type text not null,
    status text not null default 'active',
    reason text not null,

    created_by uuid not null,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    retired_by uuid,
    retired_at timestamptz,

    constraint summary_aliases_pkey primary key (id),
    constraint summary_aliases_slug_key unique (slug),

    constraint summary_aliases_slug_check check (
        btrim(slug) <> ''
        and slug = lower(btrim(slug))
    ),
    constraint summary_aliases_redirect_type_check check (
        redirect_type in ('permanent', 'temporary')
    ),
    constraint summary_aliases_status_check check (
        status in ('active', 'retired')
    ),
    constraint summary_aliases_reason_check check (
        reason in ('rename', 'merge', 'correction', 'migration')
    ),
    constraint summary_aliases_retirement_check check (
        (
            status = 'retired'
            and retired_by is not null
            and retired_at is not null
        )
        or (
            status = 'active'
            and retired_by is null
            and retired_at is null
        )
    ),

    constraint summary_aliases_summary_fkey
        foreign key (summary_id)
        references public.summaries(id)
        on delete restrict,
    constraint summary_aliases_created_by_fkey
        foreign key (created_by)
        references public.profiles(id)
        on delete set null,
    constraint summary_aliases_retired_by_fkey
        foreign key (retired_by)
        references public.profiles(id)
        on delete set null
);

comment on table public.summary_aliases is
    'Direct former-global-slug redirects to current Summary identities. Active and retired slugs remain globally reserved.';
comment on column public.summary_aliases.id is
    'UUID audit identity for one Summary alias; not a business identifier.';
comment on column public.summary_aliases.summary_id is
    'Direct target Summary. Alias chains are not representable.';
comment on column public.summary_aliases.slug is
    'Lowercase trimmed former global canonical Summary slug, unique across all aliases.';
comment on column public.summary_aliases.redirect_type is
    'Redirect behavior: permanent or temporary.';
comment on column public.summary_aliases.status is
    'Alias lifecycle: active or retired; retirement does not release the slug.';
comment on column public.summary_aliases.reason is
    'Controlled alias reason: rename, merge, correction, or migration.';
comment on column public.summary_aliases.created_by is
    'Profile that registered the direct Summary alias.';
comment on column public.summary_aliases.created_at is
    'UTC instant when the Summary alias was registered.';
comment on column public.summary_aliases.updated_at is
    'UTC instant of the most recent permitted alias lifecycle update.';
comment on column public.summary_aliases.retired_by is
    'Profile that retired this alias from active resolution.';
comment on column public.summary_aliases.retired_at is
    'UTC instant when this alias was retired.';

-- ─────────────────────────────────────────────────────────────────────────────
-- Live Summary-to-ReferenceDocument relationship
-- ─────────────────────────────────────────────────────────────────────────────

create table if not exists public.summary_reference_documents (
    id uuid not null default uuid_generate_v4(),
    summary_id uuid not null,
    reference_document_id uuid not null,
    reference_document_version_id uuid,
    role text not null,
    coverage_note text,
    sort_order integer not null default 0,

    created_by uuid not null,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),

    constraint summary_reference_documents_pkey primary key (id),
    constraint summary_reference_documents_role_check check (
        role in ('primary', 'supporting')
    ),
    constraint summary_reference_documents_coverage_note_check check (
        coverage_note is null or btrim(coverage_note) <> ''
    ),

    constraint summary_reference_documents_summary_fkey
        foreign key (summary_id)
        references public.summaries(id)
        on delete restrict,
    constraint summary_reference_documents_document_fkey
        foreign key (reference_document_id)
        references public.reference_documents(id)
        on delete restrict,
    constraint summary_reference_documents_version_fkey
        foreign key (reference_document_id, reference_document_version_id)
        references public.reference_document_versions(reference_document_id, id)
        on delete restrict
        deferrable initially deferred,
    constraint summary_reference_documents_created_by_fkey
        foreign key (created_by)
        references public.profiles(id)
        on delete set null
);

comment on table public.summary_reference_documents is
    'Live Summary-owned source relationships, optionally pinned to one version of the selected ReferenceDocument.';
comment on column public.summary_reference_documents.id is
    'UUID audit identity for one live Summary source relationship.';
comment on column public.summary_reference_documents.summary_id is
    'Owning Summary aggregate root.';
comment on column public.summary_reference_documents.reference_document_id is
    'Referenced stable source-document identity.';
comment on column public.summary_reference_documents.reference_document_version_id is
    'Optional explicit source-version pin; same-document ownership is enforced structurally.';
comment on column public.summary_reference_documents.role is
    'Source role in the Summary: primary or supporting.';
comment on column public.summary_reference_documents.coverage_note is
    'Optional human-readable scope covered by this source relationship.';
comment on column public.summary_reference_documents.sort_order is
    'Stable source display order within one Summary; lower values appear first.';
comment on column public.summary_reference_documents.created_by is
    'Profile that linked the source to the Summary.';
comment on column public.summary_reference_documents.created_at is
    'UTC instant when the live source relationship was created.';
comment on column public.summary_reference_documents.updated_at is
    'UTC instant of the most recent permitted live relationship change.';

-- ─────────────────────────────────────────────────────────────────────────────
-- Immutable SummaryVersion source snapshot
-- ─────────────────────────────────────────────────────────────────────────────

create table if not exists public.summary_version_reference_documents (
    id uuid not null default uuid_generate_v4(),
    summary_version_id uuid not null,
    reference_document_id uuid not null,
    reference_document_version_id uuid,
    role text not null,
    coverage_note text,
    sort_order integer not null default 0,
    created_at timestamptz not null default now(),

    constraint summary_version_reference_documents_pkey primary key (id),
    constraint summary_version_reference_documents_role_check check (
        role in ('primary', 'supporting')
    ),
    constraint summary_version_reference_documents_coverage_note_check check (
        coverage_note is null or btrim(coverage_note) <> ''
    ),

    constraint summary_version_reference_documents_version_fkey
        foreign key (summary_version_id)
        references public.summary_versions(id)
        on delete cascade,
    constraint summary_version_reference_documents_document_fkey
        foreign key (reference_document_id)
        references public.reference_documents(id)
        on delete restrict,
    constraint summary_version_reference_documents_source_version_fkey
        foreign key (reference_document_id, reference_document_version_id)
        references public.reference_document_versions(reference_document_id, id)
        on delete restrict
        deferrable initially deferred
);

comment on table public.summary_version_reference_documents is
    'Relational source snapshot reviewed with one SummaryVersion. Rows become immutable with a published or retired parent revision.';
comment on column public.summary_version_reference_documents.id is
    'UUID identity for one revision source-snapshot row.';
comment on column public.summary_version_reference_documents.summary_version_id is
    'Owning SummaryVersion revision.';
comment on column public.summary_version_reference_documents.reference_document_id is
    'Snapshotted stable source-document identity.';
comment on column public.summary_version_reference_documents.reference_document_version_id is
    'Optional snapshotted source-version pin; same-document ownership is enforced structurally.';
comment on column public.summary_version_reference_documents.role is
    'Snapshotted source role: primary or supporting.';
comment on column public.summary_version_reference_documents.coverage_note is
    'Optional immutable-at-publication coverage text.';
comment on column public.summary_version_reference_documents.sort_order is
    'Snapshotted source order reviewed for this SummaryVersion.';
comment on column public.summary_version_reference_documents.created_at is
    'UTC instant when the source snapshot row was created.';

-- ─────────────────────────────────────────────────────────────────────────────
-- Summary alias lifecycle and direct-target protection
-- ─────────────────────────────────────────────────────────────────────────────

create or replace function public.enforce_summary_alias_transition()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $function$
begin
    if new.status is not distinct from old.status then
        return new;
    end if;

    if not (old.status = 'active' and new.status = 'retired') then
        raise exception
            'invalid SummaryAlias lifecycle transition: % -> %',
            old.status,
            new.status
            using errcode = 'check_violation';
    end if;

    return new;
end
$function$;

comment on function public.enforce_summary_alias_transition() is
    'Allows only the frozen active-to-retired SummaryAlias lifecycle transition.';

create or replace function public.protect_summary_alias_identity()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $function$
begin
    if row(
        new.id,
        new.summary_id,
        new.slug,
        new.created_by,
        new.created_at
    ) is distinct from row(
        old.id,
        old.summary_id,
        old.slug,
        old.created_by,
        old.created_at
    ) then
        raise exception
            'SummaryAlias target, locator, and creation audit are immutable'
            using errcode = 'check_violation';
    end if;

    if old.status = 'retired'
       and row(
            new.redirect_type,
            new.reason,
            new.retired_by,
            new.retired_at
       ) is distinct from row(
            old.redirect_type,
            old.reason,
            old.retired_by,
            old.retired_at
       )
    then
        raise exception
            'retired SummaryAlias audit is immutable'
            using errcode = 'check_violation';
    end if;

    return new;
end
$function$;

comment on function public.protect_summary_alias_identity() is
    'Prevents alias repointing or reuse and protects terminal retirement audit.';

-- ─────────────────────────────────────────────────────────────────────────────
-- Global canonical-slug / alias namespace collision guard
-- ─────────────────────────────────────────────────────────────────────────────

create or replace function public.guard_summary_slug_namespace()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $function$
declare
    candidate_slug text;
begin
    if tg_table_name = 'summary_aliases' then
        candidate_slug := new.slug;
    elsif tg_table_name = 'summaries' then
        candidate_slug := new.canonical_slug;
    else
        raise exception
            'guard_summary_slug_namespace() attached to unsupported table %',
            tg_table_name
            using errcode = 'check_violation';
    end if;

    if candidate_slug is null then
        return new;
    end if;

    -- All canonical and alias writers share this transaction-scoped lock key,
    -- closing the cross-table race that separate unique indexes cannot prevent.
    perform pg_advisory_xact_lock(hashtextextended(candidate_slug, 0));

    if tg_table_name = 'summary_aliases' then
        if exists (
            select 1
            from public.summaries s
            where s.canonical_slug = candidate_slug
        ) then
            raise exception
                'Summary slug namespace collision: alias % is already canonical',
                candidate_slug
                using errcode = 'unique_violation';
        end if;
    else
        if exists (
            select 1
            from public.summary_aliases a
            where a.slug = candidate_slug
        ) then
            raise exception
                'Summary slug namespace collision: canonical slug % is already an alias',
                candidate_slug
                using errcode = 'unique_violation';
        end if;
    end if;

    return new;
end
$function$;

comment on function public.guard_summary_slug_namespace() is
    'Serializes and rejects collisions between global Summary canonical slugs and active or retired direct aliases.';

-- ─────────────────────────────────────────────────────────────────────────────
-- Published revision snapshot immutability
-- ─────────────────────────────────────────────────────────────────────────────

create or replace function public.protect_summary_version_reference_document()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $function$
declare
    parent_status text;
begin
    if tg_op in ('UPDATE', 'DELETE') then
        select sv.status
        into parent_status
        from public.summary_versions sv
        where sv.id = old.summary_version_id
        for share;

        if parent_status in ('published', 'retired') then
            raise exception
                'published or retired SummaryVersion source snapshots are immutable'
                using errcode = 'check_violation';
        end if;
    end if;

    if tg_op in ('INSERT', 'UPDATE') then
        select sv.status
        into parent_status
        from public.summary_versions sv
        where sv.id = new.summary_version_id
        for share;

        if parent_status in ('published', 'retired') then
            raise exception
                'published or retired SummaryVersion source snapshots are immutable'
                using errcode = 'check_violation';
        end if;
    end if;

    if tg_op = 'DELETE' then
        return old;
    end if;
    return new;
end
$function$;

comment on function public.protect_summary_version_reference_document() is
    'Allows draft/in-review snapshot editing and rejects inserts, updates, or deletes after the parent revision is published or retired.';

-- ─────────────────────────────────────────────────────────────────────────────
-- Triggers
-- ─────────────────────────────────────────────────────────────────────────────

drop trigger if exists enforce_summary_alias_transition
    on public.summary_aliases;
create trigger enforce_summary_alias_transition
    before update of status on public.summary_aliases
    for each row execute function public.enforce_summary_alias_transition();

drop trigger if exists protect_summary_alias_identity
    on public.summary_aliases;
create trigger protect_summary_alias_identity
    before update on public.summary_aliases
    for each row execute function public.protect_summary_alias_identity();

drop trigger if exists guard_summary_alias_slug_namespace
    on public.summary_aliases;
create trigger guard_summary_alias_slug_namespace
    before insert or update of slug, summary_id on public.summary_aliases
    for each row execute function public.guard_summary_slug_namespace();

drop trigger if exists guard_summary_canonical_slug_namespace
    on public.summaries;
create trigger guard_summary_canonical_slug_namespace
    before insert or update of canonical_slug on public.summaries
    for each row execute function public.guard_summary_slug_namespace();

drop trigger if exists handle_updated_at_summary_aliases
    on public.summary_aliases;
create trigger handle_updated_at_summary_aliases
    before update on public.summary_aliases
    for each row execute procedure public.handle_updated_at();

drop trigger if exists handle_updated_at_summary_reference_documents
    on public.summary_reference_documents;
create trigger handle_updated_at_summary_reference_documents
    before update on public.summary_reference_documents
    for each row execute procedure public.handle_updated_at();

drop trigger if exists protect_summary_version_reference_document
    on public.summary_version_reference_documents;
create trigger protect_summary_version_reference_document
    before insert or update or delete on public.summary_version_reference_documents
    for each row execute function public.protect_summary_version_reference_document();

-- ─────────────────────────────────────────────────────────────────────────────
-- Frozen alias and relationship indexes
-- ─────────────────────────────────────────────────────────────────────────────

create index if not exists summary_aliases_summary_status_idx
    on public.summary_aliases (summary_id, status);

create unique index if not exists summary_reference_documents_unpinned_key
    on public.summary_reference_documents (summary_id, reference_document_id)
    where reference_document_version_id is null;

create unique index if not exists summary_reference_documents_pinned_key
    on public.summary_reference_documents (
        summary_id,
        reference_document_id,
        reference_document_version_id
    )
    where reference_document_version_id is not null;

create index if not exists summary_reference_documents_summary_order_idx
    on public.summary_reference_documents (summary_id, sort_order, id);

create index if not exists summary_reference_documents_document_summary_idx
    on public.summary_reference_documents (reference_document_id, summary_id);

create index if not exists summary_reference_documents_version_idx
    on public.summary_reference_documents (reference_document_version_id)
    where reference_document_version_id is not null;

create index if not exists summary_reference_documents_summary_role_idx
    on public.summary_reference_documents (summary_id, role);

create unique index if not exists summary_version_reference_documents_unpinned_key
    on public.summary_version_reference_documents (
        summary_version_id,
        reference_document_id
    )
    where reference_document_version_id is null;

create unique index if not exists summary_version_reference_documents_pinned_key
    on public.summary_version_reference_documents (
        summary_version_id,
        reference_document_id,
        reference_document_version_id
    )
    where reference_document_version_id is not null;

create index if not exists summary_version_reference_documents_version_order_idx
    on public.summary_version_reference_documents (
        summary_version_id,
        sort_order,
        id
    );

create index if not exists summary_version_reference_documents_document_idx
    on public.summary_version_reference_documents (reference_document_id);

create index if not exists summary_version_reference_documents_source_version_idx
    on public.summary_version_reference_documents (reference_document_version_id)
    where reference_document_version_id is not null;

-- ─────────────────────────────────────────────────────────────────────────────
-- Dormant deny-by-default access boundary
-- ─────────────────────────────────────────────────────────────────────────────

alter table public.summary_aliases enable row level security;
alter table public.summary_reference_documents enable row level security;
alter table public.summary_version_reference_documents enable row level security;

revoke all on table
    public.summary_aliases,
    public.summary_reference_documents,
    public.summary_version_reference_documents
    from public, anon, authenticated;

revoke all on function public.enforce_summary_alias_transition()
    from public, anon, authenticated;
revoke all on function public.protect_summary_alias_identity()
    from public, anon, authenticated;
revoke all on function public.guard_summary_slug_namespace()
    from public, anon, authenticated;
revoke all on function public.protect_summary_version_reference_document()
    from public, anon, authenticated;

grant select, insert, update, delete
    on table public.summary_aliases,
             public.summary_reference_documents,
             public.summary_version_reference_documents
    to service_role;

-- ─────────────────────────────────────────────────────────────────────────────
-- Fail-closed migration validation
-- ─────────────────────────────────────────────────────────────────────────────

do $kp_summary_relationships_assertions$
declare
    expected record;
begin
    for expected in
        select *
        from (
            values
                ('summary_aliases', 11),
                ('summary_reference_documents', 10),
                ('summary_version_reference_documents', 8)
        ) as expected_tables(table_name, column_count)
    loop
        if to_regclass('public.' || expected.table_name) is null then
            raise exception using
                errcode = 'check_violation',
                message = format(
                    'Knowledge Platform migration 044 drift: public.%I is missing.',
                    expected.table_name
                );
        end if;

        if (
            select count(*)
            from information_schema.columns c
            where c.table_schema = 'public'
              and c.table_name = expected.table_name
        ) <> expected.column_count then
            raise exception using
                errcode = 'check_violation',
                message = format(
                    'Knowledge Platform migration 044 drift: public.%I has unexpected columns.',
                    expected.table_name
                );
        end if;
    end loop;

    for expected in
        select *
        from (
            values
                ('summary_aliases', 'summary_aliases_summary_fkey', 'summaries', 'r'),
                ('summary_reference_documents', 'summary_reference_documents_summary_fkey', 'summaries', 'r'),
                ('summary_reference_documents', 'summary_reference_documents_document_fkey', 'reference_documents', 'r'),
                ('summary_version_reference_documents', 'summary_version_reference_documents_document_fkey', 'reference_documents', 'r'),
                ('summary_version_reference_documents', 'summary_version_reference_documents_version_fkey', 'summary_versions', 'c')
        ) as domain_fks(table_name, constraint_name, referenced_table, delete_action)
    loop
        if not exists (
            select 1
            from pg_constraint c
            where c.conrelid = ('public.' || expected.table_name)::regclass
              and c.conname = expected.constraint_name
              and c.contype = 'f'
              and c.confrelid = ('public.' || expected.referenced_table)::regclass
              and c.confdeltype = expected.delete_action::"char"
        ) then
            raise exception using
                errcode = 'check_violation',
                message = format(
                    'Knowledge Platform migration 044 drift: domain FK %I on public.%I has incompatible target or delete behavior.',
                    expected.constraint_name,
                    expected.table_name
                );
        end if;
    end loop;

    for expected in
        select *
        from (
            values
                ('summary_aliases', 'summary_aliases_created_by_fkey'),
                ('summary_aliases', 'summary_aliases_retired_by_fkey'),
                ('summary_reference_documents', 'summary_reference_documents_created_by_fkey')
        ) as actor_fks(table_name, constraint_name)
    loop
        if not exists (
            select 1
            from pg_constraint c
            where c.conrelid = ('public.' || expected.table_name)::regclass
              and c.conname = expected.constraint_name
              and c.contype = 'f'
              and c.confrelid = 'public.profiles'::regclass
              and c.confdeltype = 'n'
        ) then
            raise exception using
                errcode = 'check_violation',
                message = format(
                    'Knowledge Platform migration 044 drift: actor FK %I must reference profiles with ON DELETE SET NULL.',
                    expected.constraint_name
                );
        end if;
    end loop;

    for expected in
        select *
        from (
            values
                ('summary_aliases', 'id', 'uuid', 'NO'),
                ('summary_aliases', 'summary_id', 'uuid', 'NO'),
                ('summary_aliases', 'slug', 'text', 'NO'),
                ('summary_aliases', 'redirect_type', 'text', 'NO'),
                ('summary_aliases', 'status', 'text', 'NO'),
                ('summary_aliases', 'reason', 'text', 'NO'),
                ('summary_aliases', 'created_by', 'uuid', 'NO'),
                ('summary_aliases', 'created_at', 'timestamptz', 'NO'),
                ('summary_aliases', 'updated_at', 'timestamptz', 'NO'),
                ('summary_aliases', 'retired_by', 'uuid', 'YES'),
                ('summary_aliases', 'retired_at', 'timestamptz', 'YES'),
                ('summary_reference_documents', 'id', 'uuid', 'NO'),
                ('summary_reference_documents', 'summary_id', 'uuid', 'NO'),
                ('summary_reference_documents', 'reference_document_id', 'uuid', 'NO'),
                ('summary_reference_documents', 'reference_document_version_id', 'uuid', 'YES'),
                ('summary_reference_documents', 'role', 'text', 'NO'),
                ('summary_reference_documents', 'coverage_note', 'text', 'YES'),
                ('summary_reference_documents', 'sort_order', 'int4', 'NO'),
                ('summary_reference_documents', 'created_by', 'uuid', 'NO'),
                ('summary_reference_documents', 'created_at', 'timestamptz', 'NO'),
                ('summary_reference_documents', 'updated_at', 'timestamptz', 'NO'),
                ('summary_version_reference_documents', 'id', 'uuid', 'NO'),
                ('summary_version_reference_documents', 'summary_version_id', 'uuid', 'NO'),
                ('summary_version_reference_documents', 'reference_document_id', 'uuid', 'NO'),
                ('summary_version_reference_documents', 'reference_document_version_id', 'uuid', 'YES'),
                ('summary_version_reference_documents', 'role', 'text', 'NO'),
                ('summary_version_reference_documents', 'coverage_note', 'text', 'YES'),
                ('summary_version_reference_documents', 'sort_order', 'int4', 'NO'),
                ('summary_version_reference_documents', 'created_at', 'timestamptz', 'NO')
        ) as required_columns(table_name, column_name, udt_name, is_nullable)
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
                    'Knowledge Platform migration 044 drift: expected public.%I.%I type=%s nullable=%s.',
                    expected.table_name,
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
                ('summary_reference_documents_unpinned_key', 'summary_reference_documents'),
                ('summary_reference_documents_pinned_key', 'summary_reference_documents'),
                ('summary_version_reference_documents_unpinned_key', 'summary_version_reference_documents'),
                ('summary_version_reference_documents_pinned_key', 'summary_version_reference_documents')
        ) as partial_unique_indexes(index_name, table_name)
    loop
        if not exists (
            select 1
            from pg_class i
            join pg_namespace n on n.oid = i.relnamespace
            join pg_index x on x.indexrelid = i.oid
            where n.nspname = 'public'
              and i.relname = expected.index_name
              and x.indrelid = ('public.' || expected.table_name)::regclass
              and x.indisunique
              and x.indpred is not null
        ) then
            raise exception using
                errcode = 'check_violation',
                message = format(
                    'Knowledge Platform migration 044 drift: %I must be a partial unique relationship index.',
                    expected.index_name
                );
        end if;
    end loop;

    for expected in
        select *
        from (
            values
                ('summary_aliases', 'summary_aliases_pkey'),
                ('summary_aliases', 'summary_aliases_slug_key'),
                ('summary_aliases', 'summary_aliases_slug_check'),
                ('summary_aliases', 'summary_aliases_redirect_type_check'),
                ('summary_aliases', 'summary_aliases_status_check'),
                ('summary_aliases', 'summary_aliases_reason_check'),
                ('summary_aliases', 'summary_aliases_retirement_check'),
                ('summary_aliases', 'summary_aliases_summary_fkey'),
                ('summary_aliases', 'summary_aliases_created_by_fkey'),
                ('summary_aliases', 'summary_aliases_retired_by_fkey'),
                ('summary_reference_documents', 'summary_reference_documents_pkey'),
                ('summary_reference_documents', 'summary_reference_documents_role_check'),
                ('summary_reference_documents', 'summary_reference_documents_coverage_note_check'),
                ('summary_reference_documents', 'summary_reference_documents_summary_fkey'),
                ('summary_reference_documents', 'summary_reference_documents_document_fkey'),
                ('summary_reference_documents', 'summary_reference_documents_version_fkey'),
                ('summary_reference_documents', 'summary_reference_documents_created_by_fkey'),
                ('summary_version_reference_documents', 'summary_version_reference_documents_pkey'),
                ('summary_version_reference_documents', 'summary_version_reference_documents_role_check'),
                ('summary_version_reference_documents', 'summary_version_reference_documents_coverage_note_check'),
                ('summary_version_reference_documents', 'summary_version_reference_documents_version_fkey'),
                ('summary_version_reference_documents', 'summary_version_reference_documents_document_fkey'),
                ('summary_version_reference_documents', 'summary_version_reference_documents_source_version_fkey')
        ) as required_constraints(table_name, constraint_name)
    loop
        if not exists (
            select 1
            from pg_constraint c
            where c.conrelid = ('public.' || expected.table_name)::regclass
              and c.conname = expected.constraint_name
              and c.convalidated
        ) then
            raise exception using
                errcode = 'check_violation',
                message = format(
                    'Knowledge Platform migration 044 drift: constraint %I on public.%I is missing or unvalidated.',
                    expected.constraint_name,
                    expected.table_name
                );
        end if;
    end loop;

    for expected in
        select *
        from (
            values
                ('summary_reference_documents', 'summary_reference_documents_version_fkey'),
                ('summary_version_reference_documents', 'summary_version_reference_documents_source_version_fkey')
        ) as same_parent_fks(table_name, constraint_name)
    loop
        if not exists (
            select 1
            from pg_constraint c
            where c.conrelid = ('public.' || expected.table_name)::regclass
              and c.conname = expected.constraint_name
              and c.contype = 'f'
              and c.confrelid = 'public.reference_document_versions'::regclass
              and c.confdeltype = 'r'
              and c.condeferrable
              and c.condeferred
              and pg_get_constraintdef(c.oid) ilike '%FOREIGN KEY (reference_document_id, reference_document_version_id)%'
              and pg_get_constraintdef(c.oid) ilike '%REFERENCES reference_document_versions(reference_document_id, id)%'
        ) then
            raise exception using
                errcode = 'check_violation',
                message = format(
                    'Knowledge Platform migration 044 drift: %I must enforce a deferred same-document source-version pin.',
                    expected.constraint_name
                );
        end if;
    end loop;

    if not exists (
        select 1
        from pg_constraint c
        where c.conrelid = 'public.summary_version_reference_documents'::regclass
          and c.conname = 'summary_version_reference_documents_version_fkey'
          and c.contype = 'f'
          and c.confrelid = 'public.summary_versions'::regclass
          and c.confdeltype = 'c'
    ) then
        raise exception using
            errcode = 'check_violation',
            message = 'Knowledge Platform migration 044 drift: snapshot parent FK must cascade only eligible revision deletion.';
    end if;

    for expected in
        select *
        from (
            values
                ('summary_aliases_slug_key', 'summary_aliases'),
                ('summary_aliases_summary_status_idx', 'summary_aliases'),
                ('summary_reference_documents_unpinned_key', 'summary_reference_documents'),
                ('summary_reference_documents_pinned_key', 'summary_reference_documents'),
                ('summary_reference_documents_summary_order_idx', 'summary_reference_documents'),
                ('summary_reference_documents_document_summary_idx', 'summary_reference_documents'),
                ('summary_reference_documents_version_idx', 'summary_reference_documents'),
                ('summary_reference_documents_summary_role_idx', 'summary_reference_documents'),
                ('summary_version_reference_documents_unpinned_key', 'summary_version_reference_documents'),
                ('summary_version_reference_documents_pinned_key', 'summary_version_reference_documents'),
                ('summary_version_reference_documents_version_order_idx', 'summary_version_reference_documents'),
                ('summary_version_reference_documents_document_idx', 'summary_version_reference_documents'),
                ('summary_version_reference_documents_source_version_idx', 'summary_version_reference_documents')
        ) as required_indexes(index_name, table_name)
    loop
        if not exists (
            select 1
            from pg_class i
            join pg_namespace n on n.oid = i.relnamespace
            join pg_index x on x.indexrelid = i.oid
            where n.nspname = 'public'
              and i.relname = expected.index_name
              and x.indrelid = ('public.' || expected.table_name)::regclass
              and x.indisvalid
              and x.indisready
        ) then
            raise exception using
                errcode = 'check_violation',
                message = format(
                    'Knowledge Platform migration 044 drift: index %I is missing, invalid, or not ready.',
                    expected.index_name
                );
        end if;
    end loop;

    for expected in
        select *
        from (
            values
                ('summary_aliases', 'enforce_summary_alias_transition'),
                ('summary_aliases', 'protect_summary_alias_identity'),
                ('summary_aliases', 'guard_summary_alias_slug_namespace'),
                ('summary_aliases', 'handle_updated_at_summary_aliases'),
                ('summaries', 'guard_summary_canonical_slug_namespace'),
                ('summary_reference_documents', 'handle_updated_at_summary_reference_documents'),
                ('summary_version_reference_documents', 'protect_summary_version_reference_document')
        ) as required_triggers(table_name, trigger_name)
    loop
        if not exists (
            select 1
            from pg_trigger t
            where t.tgrelid = ('public.' || expected.table_name)::regclass
              and t.tgname = expected.trigger_name
              and not t.tgisinternal
              and t.tgenabled <> 'D'
        ) then
            raise exception using
                errcode = 'check_violation',
                message = format(
                    'Knowledge Platform migration 044 drift: trigger %I on public.%I is missing or disabled.',
                    expected.trigger_name,
                    expected.table_name
                );
        end if;
    end loop;

    for expected in
        select *
        from (
            values
                ('summary_aliases'),
                ('summary_reference_documents'),
                ('summary_version_reference_documents')
        ) as rls_tables(table_name)
    loop
        if not exists (
            select 1
            from pg_class c
            join pg_namespace n on n.oid = c.relnamespace
            where n.nspname = 'public'
              and c.relname = expected.table_name
              and c.relrowsecurity
        ) then
            raise exception using
                errcode = 'check_violation',
                message = format(
                    'Knowledge Platform migration 044 drift: RLS is not enabled on public.%I.',
                    expected.table_name
                );
        end if;

        if exists (
            select 1
            from pg_policies p
            where p.schemaname = 'public'
              and p.tablename = expected.table_name
        ) then
            raise exception using
                errcode = 'check_violation',
                message = format(
                    'Knowledge Platform migration 044 drift: public.%I must have no policies before the dedicated RLS foundation.',
                    expected.table_name
                );
        end if;

        if has_table_privilege('anon', 'public.' || expected.table_name, 'SELECT')
           or has_table_privilege('authenticated', 'public.' || expected.table_name, 'SELECT')
           or has_table_privilege('anon', 'public.' || expected.table_name, 'INSERT')
           or has_table_privilege('authenticated', 'public.' || expected.table_name, 'INSERT')
           or has_table_privilege('anon', 'public.' || expected.table_name, 'UPDATE')
           or has_table_privilege('authenticated', 'public.' || expected.table_name, 'UPDATE')
           or has_table_privilege('anon', 'public.' || expected.table_name, 'DELETE')
           or has_table_privilege('authenticated', 'public.' || expected.table_name, 'DELETE')
        then
            raise exception using
                errcode = 'check_violation',
                message = format(
                    'Knowledge Platform migration 044 drift: a browser role can access dormant public.%I.',
                    expected.table_name
                );
        end if;

        if not has_table_privilege('service_role', 'public.' || expected.table_name, 'SELECT')
           or not has_table_privilege('service_role', 'public.' || expected.table_name, 'INSERT')
           or not has_table_privilege('service_role', 'public.' || expected.table_name, 'UPDATE')
           or not has_table_privilege('service_role', 'public.' || expected.table_name, 'DELETE')
        then
            raise exception using
                errcode = 'check_violation',
                message = format(
                    'Knowledge Platform migration 044 drift: service_role lacks required access on public.%I.',
                    expected.table_name
                );
        end if;
    end loop;

    if to_regclass('public.package_summaries') is not null then
        raise exception using
            errcode = 'check_violation',
            message = 'Knowledge Platform migration 044 scope drift: PackageSummary must remain absent.';
    end if;

    raise notice 'Knowledge Platform migration 044 passed: Summary aliases and source relationships are valid, private, and dormant.';
end
$kp_summary_relationships_assertions$;

notify pgrst, 'reload schema';
