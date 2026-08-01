-- 038_kp_reference_documents.sql
-- Sobdai Knowledge Platform — Migration 038 (Reference Layer root).
--
-- Purpose
-- -------
-- Create stable ReferenceDocument aggregate roots and the persistent,
-- gap-tolerant allocator for immutable DOC-… business identifiers.
--
-- Scope boundary
-- --------------
-- * Creates only public.reference_documents and its allocation primitives.
-- * Does not create ReferenceDocumentVersion, aliases, Knowledge Layer, or
--   Product Layer objects. Those remain migrations 039+.
-- * Inserts no domain data. Curated ReferenceDocuments arrive in migration 048.
-- * The root + first verified-version transaction invariant becomes usable only
--   after migration 039 and is enforced by the later Application Layer command.
--
-- Safety / rollback
-- -----------------
-- This is additive and unused by the legacy application. RLS is enabled with
-- no policies, and client grants are revoked, so the table remains dormant.
-- Operational rollback leaves these empty objects in place. Drop them only in
-- a separately approved forward migration before any identifier is allocated.

-- ─────────────────────────────────────────────────────────────────────────────
-- Persistent Document-code allocator
-- ─────────────────────────────────────────────────────────────────────────────

-- Sequence values are intentionally gap-tolerant: nextval() is not rolled back
-- when a later transaction fails. Codes remain stable and are never reused.
create sequence if not exists public.reference_document_code_seq
    as bigint
    start with 1
    increment by 1
    minvalue 1
    no cycle
    cache 10;

comment on sequence public.reference_document_code_seq is
    'Persistent, gap-tolerant allocator for immutable ReferenceDocument business identifiers.';

-- This function is the single SQL source of truth for the DOC-… representation.
-- The identifier contains no title, issuer, jurisdiction, subject, or year.
create or replace function public.format_reference_document_code(seq_value bigint)
returns text
language sql
immutable
strict
set search_path = pg_catalog
as $function$
    select 'DOC-' || lpad(seq_value::text, 6, '0')
$function$;

comment on function public.format_reference_document_code(bigint) is
    'Formats one allocator value as a case-normalized DOC-… ReferenceDocument business identifier.';

-- Allocation advances only the dedicated sequence. It does not insert or
-- mutate ReferenceDocument metadata and is not exposed to browser roles.
create or replace function public.allocate_reference_document_codes(n integer)
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
        public.format_reference_document_code(
            nextval('public.reference_document_code_seq'::regclass)
        )
        order by ordinal
    )
    into codes
    from generate_series(1, n) as allocated(ordinal);

    return codes;
end
$function$;

comment on function public.allocate_reference_document_codes(integer) is
    'Allocates immutable DOC-… identifiers only. It contains no mutable ReferenceDocument metadata and may leave intentional sequence gaps.';

-- ─────────────────────────────────────────────────────────────────────────────
-- ReferenceDocument aggregate root
-- ─────────────────────────────────────────────────────────────────────────────

create table if not exists public.reference_documents (
    id uuid not null default uuid_generate_v4(),
    document_code text not null,

    canonical_title text not null,
    short_title text,
    document_type text not null,
    issuer text not null,
    jurisdiction text not null,
    source_homepage_url text,

    lifecycle_status text not null default 'active',
    superseded_by_document_id uuid,

    created_by uuid not null,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    archived_at timestamptz,
    archived_by uuid,

    constraint reference_documents_pkey primary key (id),
    constraint reference_documents_document_code_key unique (document_code),

    constraint reference_documents_document_code_check check (
        document_code <> ''
        and document_code = upper(btrim(document_code))
    ),
    constraint reference_documents_required_text_check check (
        btrim(canonical_title) <> ''
        and (short_title is null or btrim(short_title) <> '')
        and btrim(document_type) <> ''
        and btrim(issuer) <> ''
        and btrim(jurisdiction) <> ''
        and (source_homepage_url is null or btrim(source_homepage_url) <> '')
    ),
    constraint reference_documents_lifecycle_status_check check (
        lifecycle_status in ('active', 'superseded', 'repealed', 'archived')
    ),
    constraint reference_documents_not_self_superseding_check check (
        superseded_by_document_id is null
        or superseded_by_document_id <> id
    ),
    constraint reference_documents_supersession_check check (
        (lifecycle_status = 'superseded' and superseded_by_document_id is not null)
        or (lifecycle_status <> 'superseded' and superseded_by_document_id is null)
    ),
    constraint reference_documents_archive_check check (
        (
            lifecycle_status = 'archived'
            and archived_at is not null
            and archived_by is not null
        )
        or (
            lifecycle_status <> 'archived'
            and archived_at is null
            and archived_by is null
        )
    ),

    constraint reference_documents_superseded_by_fkey
        foreign key (superseded_by_document_id)
        references public.reference_documents(id)
        on delete restrict
        deferrable initially deferred,
    constraint reference_documents_created_by_fkey
        foreign key (created_by)
        references public.profiles(id)
        on delete set null,
    constraint reference_documents_archived_by_fkey
        foreign key (archived_by)
        references public.profiles(id)
        on delete set null
);

comment on table public.reference_documents is
    'Stable identity for one authoritative source work across editions, amendments, files, and URLs. Aggregate root for versions and aliases.';
comment on column public.reference_documents.id is
    'Internal immutable UUID identity for the ReferenceDocument aggregate.';
comment on column public.reference_documents.document_code is
    'Globally unique, case-normalized, immutable business identifier. Never reused and contains no mutable metadata.';
comment on column public.reference_documents.canonical_title is
    'Current authoritative full display title owned by the ReferenceDocument root.';
comment on column public.reference_documents.short_title is
    'Optional recognizable short display title.';
comment on column public.reference_documents.document_type is
    'Controlled Reference Layer source category.';
comment on column public.reference_documents.issuer is
    'Issuing authority. Required for every established ReferenceDocument.';
comment on column public.reference_documents.jurisdiction is
    'Applicable legal or administrative jurisdiction.';
comment on column public.reference_documents.source_homepage_url is
    'Optional canonical publisher landing page for the work, not a version-specific file URL.';
comment on column public.reference_documents.lifecycle_status is
    'ReferenceDocument lifecycle: active, superseded, repealed, or archived.';
comment on column public.reference_documents.superseded_by_document_id is
    'Direct successor ReferenceDocument when this identity has been superseded.';
comment on column public.reference_documents.created_by is
    'Profile that established this ReferenceDocument.';
comment on column public.reference_documents.created_at is
    'UTC instant when the ReferenceDocument was established.';
comment on column public.reference_documents.updated_at is
    'UTC instant of the most recent mutable root-metadata or lifecycle change.';
comment on column public.reference_documents.archived_at is
    'UTC archive instant; present only while lifecycle_status is archived.';
comment on column public.reference_documents.archived_by is
    'Profile that archived the ReferenceDocument; present only while archived.';

-- ─────────────────────────────────────────────────────────────────────────────
-- Identity and audit protections
-- ─────────────────────────────────────────────────────────────────────────────

create or replace function public.protect_reference_document_code()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $function$
begin
    if new.document_code is distinct from old.document_code then
        raise exception
            'document_code is immutable (current value: %)', old.document_code
            using errcode = 'check_violation';
    end if;
    return new;
end
$function$;

comment on function public.protect_reference_document_code() is
    'Rejects every attempted change to an allocated ReferenceDocument business identifier.';

drop trigger if exists protect_reference_document_code
    on public.reference_documents;
create trigger protect_reference_document_code
    before update of document_code on public.reference_documents
    for each row execute function public.protect_reference_document_code();

drop trigger if exists handle_updated_at_reference_documents
    on public.reference_documents;
create trigger handle_updated_at_reference_documents
    before update on public.reference_documents
    for each row execute procedure public.handle_updated_at();

-- ─────────────────────────────────────────────────────────────────────────────
-- Frozen access and lookup indexes
-- ─────────────────────────────────────────────────────────────────────────────

create index if not exists reference_documents_lifecycle_type_idx
    on public.reference_documents (lifecycle_status, document_type);

create index if not exists reference_documents_issuer_lifecycle_idx
    on public.reference_documents (issuer, lifecycle_status);

create index if not exists reference_documents_superseded_by_idx
    on public.reference_documents (superseded_by_document_id)
    where superseded_by_document_id is not null;

-- No base-table policies are installed in 038. Migration 045 owns the approved
-- aggregate-aware policy foundation. Until then, RLS denies browser access.
alter table public.reference_documents enable row level security;

revoke all on table public.reference_documents
    from public, anon, authenticated;
revoke all on sequence public.reference_document_code_seq
    from public, anon, authenticated;
revoke all on function public.format_reference_document_code(bigint)
    from public, anon, authenticated;
revoke all on function public.allocate_reference_document_codes(integer)
    from public, anon, authenticated;
revoke all on function public.protect_reference_document_code()
    from public, anon, authenticated;

grant select, insert, update, delete
    on table public.reference_documents
    to service_role;
grant usage, select
    on sequence public.reference_document_code_seq
    to service_role;
grant execute on function public.format_reference_document_code(bigint)
    to service_role;
grant execute on function public.allocate_reference_document_codes(integer)
    to service_role;

-- ─────────────────────────────────────────────────────────────────────────────
-- Fail-closed migration validation
-- ─────────────────────────────────────────────────────────────────────────────

do $kp_reference_documents_assertions$
declare
    expected record;
begin
    if to_regclass('public.reference_documents') is null then
        raise exception using
            errcode = 'check_violation',
            message = 'Knowledge Platform migration 038 drift: public.reference_documents is missing.';
    end if;

    for expected in
        select *
        from (
            values
                ('id', 'uuid', 'NO'),
                ('document_code', 'text', 'NO'),
                ('canonical_title', 'text', 'NO'),
                ('short_title', 'text', 'YES'),
                ('document_type', 'text', 'NO'),
                ('issuer', 'text', 'NO'),
                ('jurisdiction', 'text', 'NO'),
                ('source_homepage_url', 'text', 'YES'),
                ('lifecycle_status', 'text', 'NO'),
                ('superseded_by_document_id', 'uuid', 'YES'),
                ('created_by', 'uuid', 'NO'),
                ('created_at', 'timestamptz', 'NO'),
                ('updated_at', 'timestamptz', 'NO'),
                ('archived_at', 'timestamptz', 'YES'),
                ('archived_by', 'uuid', 'YES')
        ) as required_columns(column_name, udt_name, is_nullable)
    loop
        if not exists (
            select 1
            from information_schema.columns c
            where c.table_schema = 'public'
              and c.table_name = 'reference_documents'
              and c.column_name = expected.column_name
              and c.udt_name = expected.udt_name
              and c.is_nullable = expected.is_nullable
        ) then
            raise exception using
                errcode = 'check_violation',
                message = format(
                    'Knowledge Platform migration 038 drift: expected public.reference_documents.%I type=%s nullable=%s.',
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
          and c.table_name = 'reference_documents'
    ) <> 15 then
        raise exception using
            errcode = 'check_violation',
            message = 'Knowledge Platform migration 038 drift: public.reference_documents has unexpected columns.';
    end if;

    for expected in
        select *
        from (
            values
                ('reference_documents_pkey'),
                ('reference_documents_document_code_key'),
                ('reference_documents_document_code_check'),
                ('reference_documents_required_text_check'),
                ('reference_documents_lifecycle_status_check'),
                ('reference_documents_not_self_superseding_check'),
                ('reference_documents_supersession_check'),
                ('reference_documents_archive_check'),
                ('reference_documents_superseded_by_fkey'),
                ('reference_documents_created_by_fkey'),
                ('reference_documents_archived_by_fkey')
        ) as required_constraints(constraint_name)
    loop
        if not exists (
            select 1
            from pg_constraint c
            join pg_class t on t.oid = c.conrelid
            join pg_namespace n on n.oid = t.relnamespace
            where n.nspname = 'public'
              and t.relname = 'reference_documents'
              and c.conname = expected.constraint_name
              and c.convalidated
        ) then
            raise exception using
                errcode = 'check_violation',
                message = format(
                    'Knowledge Platform migration 038 drift: constraint %I is missing or unvalidated.',
                    expected.constraint_name
                );
        end if;
    end loop;

    if not exists (
        select 1
        from pg_constraint c
        join pg_class t on t.oid = c.conrelid
        join pg_namespace n on n.oid = t.relnamespace
        where n.nspname = 'public'
          and t.relname = 'reference_documents'
          and c.conname = 'reference_documents_superseded_by_fkey'
          and c.contype = 'f'
          and c.confrelid = 'public.reference_documents'::regclass
          and c.confdeltype = 'r'
          and c.condeferrable
          and c.condeferred
    ) then
        raise exception using
            errcode = 'check_violation',
            message = 'Knowledge Platform migration 038 drift: successor FK must be self-referencing, RESTRICT, and initially deferred.';
    end if;

    for expected in
        select *
        from (
            values
                ('reference_documents_created_by_fkey'),
                ('reference_documents_archived_by_fkey')
        ) as actor_fks(constraint_name)
    loop
        if not exists (
            select 1
            from pg_constraint c
            join pg_class t on t.oid = c.conrelid
            join pg_namespace n on n.oid = t.relnamespace
            where n.nspname = 'public'
              and t.relname = 'reference_documents'
              and c.conname = expected.constraint_name
              and c.contype = 'f'
              and c.confrelid = 'public.profiles'::regclass
              and c.confdeltype = 'n'
        ) then
            raise exception using
                errcode = 'check_violation',
                message = format(
                    'Knowledge Platform migration 038 drift: actor FK %I must reference profiles with ON DELETE SET NULL.',
                    expected.constraint_name
                );
        end if;
    end loop;

    for expected in
        select *
        from (
            values
                ('reference_documents_document_code_key'),
                ('reference_documents_lifecycle_type_idx'),
                ('reference_documents_issuer_lifecycle_idx'),
                ('reference_documents_superseded_by_idx')
        ) as required_indexes(index_name)
    loop
        if not exists (
            select 1
            from pg_class i
            join pg_namespace n on n.oid = i.relnamespace
            join pg_index x on x.indexrelid = i.oid
            where n.nspname = 'public'
              and i.relname = expected.index_name
              and x.indrelid = 'public.reference_documents'::regclass
              and x.indisvalid
              and x.indisready
        ) then
            raise exception using
                errcode = 'check_violation',
                message = format(
                    'Knowledge Platform migration 038 drift: index %I is missing, invalid, or not ready.',
                    expected.index_name
                );
        end if;
    end loop;

    if not exists (
        select 1
        from pg_sequence s
        where s.seqrelid = 'public.reference_document_code_seq'::regclass
          and s.seqtypid = 'bigint'::regtype
          and s.seqstart = 1
          and s.seqincrement = 1
          and s.seqmin = 1
          and not s.seqcycle
          and s.seqcache = 10
    ) then
        raise exception using
            errcode = 'check_violation',
            message = 'Knowledge Platform migration 038 drift: reference_document_code_seq has an incompatible allocation policy.';
    end if;

    if to_regprocedure('public.format_reference_document_code(bigint)') is null
       or to_regprocedure('public.allocate_reference_document_codes(integer)') is null
       or to_regprocedure('public.protect_reference_document_code()') is null
    then
        raise exception using
            errcode = 'check_violation',
            message = 'Knowledge Platform migration 038 drift: Document-code allocation or immutability primitive is missing.';
    end if;

    for expected in
        select *
        from (
            values
                ('protect_reference_document_code'),
                ('handle_updated_at_reference_documents')
        ) as required_triggers(trigger_name)
    loop
        if not exists (
            select 1
            from pg_trigger t
            where t.tgrelid = 'public.reference_documents'::regclass
              and t.tgname = expected.trigger_name
              and not t.tgisinternal
              and t.tgenabled <> 'D'
        ) then
            raise exception using
                errcode = 'check_violation',
                message = format(
                    'Knowledge Platform migration 038 drift: trigger %I is missing or disabled.',
                    expected.trigger_name
                );
        end if;
    end loop;

    if not exists (
        select 1
        from pg_class c
        join pg_namespace n on n.oid = c.relnamespace
        where n.nspname = 'public'
          and c.relname = 'reference_documents'
          and c.relrowsecurity
    ) then
        raise exception using
            errcode = 'check_violation',
            message = 'Knowledge Platform migration 038 drift: RLS is not enabled on public.reference_documents.';
    end if;

    if exists (
        select 1
        from pg_policies
        where schemaname = 'public'
          and tablename = 'reference_documents'
    ) then
        raise exception using
            errcode = 'check_violation',
            message = 'Knowledge Platform migration 038 drift: reference_documents must have no policies before migration 045.';
    end if;

    if has_table_privilege('anon', 'public.reference_documents', 'SELECT')
       or has_table_privilege('authenticated', 'public.reference_documents', 'SELECT')
       or has_table_privilege('anon', 'public.reference_documents', 'INSERT')
       or has_table_privilege('authenticated', 'public.reference_documents', 'INSERT')
       or has_table_privilege('anon', 'public.reference_documents', 'UPDATE')
       or has_table_privilege('authenticated', 'public.reference_documents', 'UPDATE')
       or has_table_privilege('anon', 'public.reference_documents', 'DELETE')
       or has_table_privilege('authenticated', 'public.reference_documents', 'DELETE')
       or has_function_privilege('anon', 'public.allocate_reference_document_codes(integer)', 'EXECUTE')
       or has_function_privilege('authenticated', 'public.allocate_reference_document_codes(integer)', 'EXECUTE')
    then
        raise exception using
            errcode = 'check_violation',
            message = 'Knowledge Platform migration 038 drift: a browser role can access dormant ReferenceDocument objects.';
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
            'public.reference_documents',
            expected.privilege_name
        ) then
            raise exception using
                errcode = 'check_violation',
                message = format(
                    'Knowledge Platform migration 038 drift: service_role lacks %s on public.reference_documents.',
                    expected.privilege_name
                );
        end if;
    end loop;

    if not has_sequence_privilege(
        'service_role',
        'public.reference_document_code_seq',
        'USAGE'
    ) or not has_function_privilege(
        'service_role',
        'public.allocate_reference_document_codes(integer)',
        'EXECUTE'
    ) then
        raise exception using
            errcode = 'check_violation',
            message = 'Knowledge Platform migration 038 drift: service_role lacks allocator privileges.';
    end if;

    raise notice 'Knowledge Platform migration 038 passed: ReferenceDocument roots are valid, private, and dormant.';
end
$kp_reference_documents_assertions$;

notify pgrst, 'reload schema';
