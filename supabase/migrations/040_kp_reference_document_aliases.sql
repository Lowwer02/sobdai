-- 040_kp_reference_document_aliases.sql
-- Sobdai Knowledge Platform — Migration 040 (Reference Layer aliases).
--
-- Purpose
-- -------
-- Create direct alternate code, title, and legacy-key locators for stable
-- ReferenceDocument resolution, historical matching, and redirects.
--
-- Scope boundary
-- --------------
-- * Creates only public.reference_document_aliases and its protections.
-- * Every alias targets a ReferenceDocument directly; alias chains cannot be
--   represented by this schema.
-- * An alias has no independent business ID. Its canonical locator is the
--   globally unique (alias_type, normalized_value) pair.
-- * Does not create or alter Summary, Package, Knowledge, or migration 041+
--   objects and inserts no data.
--
-- Safety / rollback
-- -----------------
-- This migration is additive and unused by the legacy application. RLS is
-- enabled without policies and browser grants are revoked. Operational rollback
-- leaves the empty table dormant. Used aliases are retired, never deleted or
-- reused; corrections are forward lifecycle operations.

-- Fail before creating a partial alias layer if the deployed Reference Layer
-- predecessors do not match migrations 038 and 039.
do $kp_reference_aliases_preflight$
begin
    if to_regclass('public.reference_documents') is null then
        raise exception using
            errcode = 'check_violation',
            message = 'Knowledge Platform migration 040 requires public.reference_documents from migration 038.';
    end if;

    if to_regclass('public.reference_document_versions') is null then
        raise exception using
            errcode = 'check_violation',
            message = 'Knowledge Platform migration 040 requires migration 039 to precede it.';
    end if;

    if not exists (
        select 1
        from pg_constraint c
        where c.conrelid = 'public.reference_documents'::regclass
          and c.conname = 'reference_documents_pkey'
          and c.contype = 'p'
          and c.convalidated
    ) then
        raise exception using
            errcode = 'check_violation',
            message = 'Knowledge Platform migration 040 requires the validated migration 038 ReferenceDocument primary key.';
    end if;

    if not exists (
        select 1
        from pg_constraint c
        where c.conrelid = 'public.reference_document_versions'::regclass
          and c.conname = 'reference_document_versions_pkey'
          and c.contype = 'p'
          and c.convalidated
    ) then
        raise exception using
            errcode = 'check_violation',
            message = 'Knowledge Platform migration 040 requires the validated migration 039 version table.';
    end if;
end
$kp_reference_aliases_preflight$;

-- ─────────────────────────────────────────────────────────────────────────────
-- ReferenceDocumentAlias child entity
-- ─────────────────────────────────────────────────────────────────────────────

create table if not exists public.reference_document_aliases (
    id uuid not null default uuid_generate_v4(),
    reference_document_id uuid not null,

    alias_type text not null,
    alias_value text not null,
    normalized_value text not null,

    status text not null default 'active',
    reason text not null,

    created_by uuid not null,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),

    retired_by uuid,
    retired_at timestamptz,

    constraint reference_document_aliases_pkey primary key (id),
    constraint reference_document_aliases_type_normalized_key
        unique (alias_type, normalized_value),

    constraint reference_document_aliases_type_check check (
        alias_type in ('code', 'title', 'legacy_key')
    ),
    constraint reference_document_aliases_status_check check (
        status in ('active', 'retired')
    ),
    constraint reference_document_aliases_required_text_check check (
        btrim(alias_value) <> ''
        and btrim(normalized_value) <> ''
        and btrim(reason) <> ''
    ),
    constraint reference_document_aliases_normalized_value_check check (
        normalized_value = lower(btrim(normalized_value))
    ),
    constraint reference_document_aliases_retirement_check check (
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

    constraint reference_document_aliases_document_fkey
        foreign key (reference_document_id)
        references public.reference_documents(id)
        on delete restrict,
    constraint reference_document_aliases_created_by_fkey
        foreign key (created_by)
        references public.profiles(id)
        on delete set null,
    constraint reference_document_aliases_retired_by_fkey
        foreign key (retired_by)
        references public.profiles(id)
        on delete set null
);

comment on table public.reference_document_aliases is
    'Direct alternate code, title, or legacy-key locators for one ReferenceDocument. Historical and retired locators remain globally reserved.';
comment on column public.reference_document_aliases.id is
    'UUID audit identity for this alias row; not a public business identifier.';
comment on column public.reference_document_aliases.reference_document_id is
    'Direct target ReferenceDocument. Alias-to-alias targets are not representable.';
comment on column public.reference_document_aliases.alias_type is
    'Locator namespace: code, title, or legacy_key.';
comment on column public.reference_document_aliases.alias_value is
    'Authored or display representation of the historical/alternate locator.';
comment on column public.reference_document_aliases.normalized_value is
    'Lowercase, trimmed canonical match key. Unique with alias_type across active and retired aliases.';
comment on column public.reference_document_aliases.status is
    'Alias lifecycle: active or retired. Retirement never releases the locator for reuse.';
comment on column public.reference_document_aliases.reason is
    'Required audit reason for creating the alias, such as rename, historical title, or legacy import key.';
comment on column public.reference_document_aliases.created_by is
    'Profile that registered the alias.';
comment on column public.reference_document_aliases.created_at is
    'UTC instant when the alias was registered.';
comment on column public.reference_document_aliases.updated_at is
    'UTC instant of the most recent permitted alias lifecycle or display update.';
comment on column public.reference_document_aliases.retired_by is
    'Profile that retired the alias from new resolution use.';
comment on column public.reference_document_aliases.retired_at is
    'UTC instant when the alias was retired.';

-- ─────────────────────────────────────────────────────────────────────────────
-- Stable locator and lifecycle protection
-- ─────────────────────────────────────────────────────────────────────────────

create or replace function public.enforce_reference_document_alias_transition()
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
            'invalid ReferenceDocumentAlias lifecycle transition: % -> %',
            old.status,
            new.status
            using errcode = 'check_violation';
    end if;

    return new;
end
$function$;

comment on function public.enforce_reference_document_alias_transition() is
    'Allows only the frozen active→retired alias lifecycle transition.';

create or replace function public.protect_reference_document_alias_identity()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $function$
begin
    -- Direct target and canonical locator identity never change. A correction
    -- creates a new alias and retires the incorrect one without reusing its key.
    if row(
        new.id,
        new.reference_document_id,
        new.alias_type,
        new.normalized_value,
        new.created_by,
        new.created_at
    ) is distinct from row(
        old.id,
        old.reference_document_id,
        old.alias_type,
        old.normalized_value,
        old.created_by,
        old.created_at
    ) then
        raise exception
            'ReferenceDocumentAlias target and canonical locator are immutable'
            using errcode = 'check_violation';
    end if;

    if old.status = 'retired'
       and row(
            new.alias_value,
            new.reason,
            new.retired_by,
            new.retired_at
       ) is distinct from row(
            old.alias_value,
            old.reason,
            old.retired_by,
            old.retired_at
       )
    then
        raise exception
            'retired ReferenceDocumentAlias audit is immutable'
            using errcode = 'check_violation';
    end if;

    return new;
end
$function$;

comment on function public.protect_reference_document_alias_identity() is
    'Prevents alias repointing, locator reuse, and mutation of terminal retirement audit.';

drop trigger if exists enforce_reference_document_alias_transition
    on public.reference_document_aliases;
create trigger enforce_reference_document_alias_transition
    before update of status on public.reference_document_aliases
    for each row execute function public.enforce_reference_document_alias_transition();

drop trigger if exists protect_reference_document_alias_identity
    on public.reference_document_aliases;
create trigger protect_reference_document_alias_identity
    before update on public.reference_document_aliases
    for each row execute function public.protect_reference_document_alias_identity();

drop trigger if exists handle_updated_at_reference_document_aliases
    on public.reference_document_aliases;
create trigger handle_updated_at_reference_document_aliases
    before update on public.reference_document_aliases
    for each row execute procedure public.handle_updated_at();

-- The unique constraint's backing index is the canonical alias lookup. Because
-- it includes retired rows, an externally used locator is never reusable.
create index if not exists reference_document_aliases_document_status_idx
    on public.reference_document_aliases (reference_document_id, status);

-- No public resolver or editorial policies are installed in 040. Migration 045
-- owns the approved aggregate-aware policies; later resolver projections/RPCs
-- expose only the bounded alias behavior required by their consumer.
alter table public.reference_document_aliases enable row level security;

revoke all on table public.reference_document_aliases
    from public, anon, authenticated;
revoke all on function public.enforce_reference_document_alias_transition()
    from public, anon, authenticated;
revoke all on function public.protect_reference_document_alias_identity()
    from public, anon, authenticated;

grant select, insert, update, delete
    on table public.reference_document_aliases
    to service_role;

-- ─────────────────────────────────────────────────────────────────────────────
-- Fail-closed migration validation
-- ─────────────────────────────────────────────────────────────────────────────

do $kp_reference_aliases_assertions$
declare
    expected record;
begin
    if to_regclass('public.reference_document_aliases') is null then
        raise exception using
            errcode = 'check_violation',
            message = 'Knowledge Platform migration 040 drift: public.reference_document_aliases is missing.';
    end if;

    for expected in
        select *
        from (
            values
                ('id', 'uuid', 'NO'),
                ('reference_document_id', 'uuid', 'NO'),
                ('alias_type', 'text', 'NO'),
                ('alias_value', 'text', 'NO'),
                ('normalized_value', 'text', 'NO'),
                ('status', 'text', 'NO'),
                ('reason', 'text', 'NO'),
                ('created_by', 'uuid', 'NO'),
                ('created_at', 'timestamptz', 'NO'),
                ('updated_at', 'timestamptz', 'NO'),
                ('retired_by', 'uuid', 'YES'),
                ('retired_at', 'timestamptz', 'YES')
        ) as required_columns(column_name, udt_name, is_nullable)
    loop
        if not exists (
            select 1
            from information_schema.columns c
            where c.table_schema = 'public'
              and c.table_name = 'reference_document_aliases'
              and c.column_name = expected.column_name
              and c.udt_name = expected.udt_name
              and c.is_nullable = expected.is_nullable
        ) then
            raise exception using
                errcode = 'check_violation',
                message = format(
                    'Knowledge Platform migration 040 drift: expected public.reference_document_aliases.%I type=%s nullable=%s.',
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
          and c.table_name = 'reference_document_aliases'
    ) <> 12 then
        raise exception using
            errcode = 'check_violation',
            message = 'Knowledge Platform migration 040 drift: public.reference_document_aliases has unexpected columns.';
    end if;

    for expected in
        select *
        from (
            values
                ('reference_document_aliases_pkey'),
                ('reference_document_aliases_type_normalized_key'),
                ('reference_document_aliases_type_check'),
                ('reference_document_aliases_status_check'),
                ('reference_document_aliases_required_text_check'),
                ('reference_document_aliases_normalized_value_check'),
                ('reference_document_aliases_retirement_check'),
                ('reference_document_aliases_document_fkey'),
                ('reference_document_aliases_created_by_fkey'),
                ('reference_document_aliases_retired_by_fkey')
        ) as required_constraints(constraint_name)
    loop
        if not exists (
            select 1
            from pg_constraint c
            where c.conrelid = 'public.reference_document_aliases'::regclass
              and c.conname = expected.constraint_name
              and c.convalidated
        ) then
            raise exception using
                errcode = 'check_violation',
                message = format(
                    'Knowledge Platform migration 040 drift: constraint %I is missing or unvalidated.',
                    expected.constraint_name
                );
        end if;
    end loop;

    if not exists (
        select 1
        from pg_constraint c
        where c.conrelid = 'public.reference_document_aliases'::regclass
          and c.conname = 'reference_document_aliases_document_fkey'
          and c.contype = 'f'
          and c.confrelid = 'public.reference_documents'::regclass
          and c.confdeltype = 'r'
    ) then
        raise exception using
            errcode = 'check_violation',
            message = 'Knowledge Platform migration 040 drift: alias target FK must reference migration 038 with ON DELETE RESTRICT.';
    end if;

    for expected in
        select *
        from (
            values
                ('reference_document_aliases_created_by_fkey'),
                ('reference_document_aliases_retired_by_fkey')
        ) as actor_fks(constraint_name)
    loop
        if not exists (
            select 1
            from pg_constraint c
            where c.conrelid = 'public.reference_document_aliases'::regclass
              and c.conname = expected.constraint_name
              and c.contype = 'f'
              and c.confrelid = 'public.profiles'::regclass
              and c.confdeltype = 'n'
        ) then
            raise exception using
                errcode = 'check_violation',
                message = format(
                    'Knowledge Platform migration 040 drift: actor FK %I must reference profiles with ON DELETE SET NULL.',
                    expected.constraint_name
                );
        end if;
    end loop;

    for expected in
        select *
        from (
            values
                ('reference_document_aliases_type_normalized_key'),
                ('reference_document_aliases_document_status_idx')
        ) as required_indexes(index_name)
    loop
        if not exists (
            select 1
            from pg_class i
            join pg_namespace n on n.oid = i.relnamespace
            join pg_index x on x.indexrelid = i.oid
            where n.nspname = 'public'
              and i.relname = expected.index_name
              and x.indrelid = 'public.reference_document_aliases'::regclass
              and x.indisvalid
              and x.indisready
        ) then
            raise exception using
                errcode = 'check_violation',
                message = format(
                    'Knowledge Platform migration 040 drift: index %I is missing, invalid, or not ready.',
                    expected.index_name
                );
        end if;
    end loop;

    if not exists (
        select 1
        from pg_index x
        join pg_class i on i.oid = x.indexrelid
        join pg_namespace n on n.oid = i.relnamespace
        where n.nspname = 'public'
          and i.relname = 'reference_document_aliases_type_normalized_key'
          and x.indrelid = 'public.reference_document_aliases'::regclass
          and x.indisunique
          and x.indpred is null
    ) then
        raise exception using
            errcode = 'check_violation',
            message = 'Knowledge Platform migration 040 drift: alias locator uniqueness must cover active and retired rows.';
    end if;

    if to_regprocedure('public.enforce_reference_document_alias_transition()') is null
       or to_regprocedure('public.protect_reference_document_alias_identity()') is null
    then
        raise exception using
            errcode = 'check_violation',
            message = 'Knowledge Platform migration 040 drift: alias lifecycle or identity protection is missing.';
    end if;

    for expected in
        select *
        from (
            values
                ('enforce_reference_document_alias_transition'),
                ('protect_reference_document_alias_identity'),
                ('handle_updated_at_reference_document_aliases')
        ) as required_triggers(trigger_name)
    loop
        if not exists (
            select 1
            from pg_trigger t
            where t.tgrelid = 'public.reference_document_aliases'::regclass
              and t.tgname = expected.trigger_name
              and not t.tgisinternal
              and t.tgenabled <> 'D'
        ) then
            raise exception using
                errcode = 'check_violation',
                message = format(
                    'Knowledge Platform migration 040 drift: trigger %I is missing or disabled.',
                    expected.trigger_name
                );
        end if;
    end loop;

    if not exists (
        select 1
        from pg_class c
        join pg_namespace n on n.oid = c.relnamespace
        where n.nspname = 'public'
          and c.relname = 'reference_document_aliases'
          and c.relrowsecurity
    ) then
        raise exception using
            errcode = 'check_violation',
            message = 'Knowledge Platform migration 040 drift: RLS is not enabled on public.reference_document_aliases.';
    end if;

    if exists (
        select 1
        from pg_policies
        where schemaname = 'public'
          and tablename = 'reference_document_aliases'
    ) then
        raise exception using
            errcode = 'check_violation',
            message = 'Knowledge Platform migration 040 drift: reference_document_aliases must have no policies before migration 045.';
    end if;

    if has_table_privilege('anon', 'public.reference_document_aliases', 'SELECT')
       or has_table_privilege('authenticated', 'public.reference_document_aliases', 'SELECT')
       or has_table_privilege('anon', 'public.reference_document_aliases', 'INSERT')
       or has_table_privilege('authenticated', 'public.reference_document_aliases', 'INSERT')
       or has_table_privilege('anon', 'public.reference_document_aliases', 'UPDATE')
       or has_table_privilege('authenticated', 'public.reference_document_aliases', 'UPDATE')
       or has_table_privilege('anon', 'public.reference_document_aliases', 'DELETE')
       or has_table_privilege('authenticated', 'public.reference_document_aliases', 'DELETE')
    then
        raise exception using
            errcode = 'check_violation',
            message = 'Knowledge Platform migration 040 drift: a browser role can access dormant ReferenceDocument aliases.';
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
            'public.reference_document_aliases',
            expected.privilege_name
        ) then
            raise exception using
                errcode = 'check_violation',
                message = format(
                    'Knowledge Platform migration 040 drift: service_role lacks %s on public.reference_document_aliases.',
                    expected.privilege_name
                );
        end if;
    end loop;

    raise notice 'Knowledge Platform migration 040 passed: direct ReferenceDocument aliases are unique, private, and dormant.';
end
$kp_reference_aliases_assertions$;

notify pgrst, 'reload schema';
