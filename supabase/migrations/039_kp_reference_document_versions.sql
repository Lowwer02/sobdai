-- 039_kp_reference_document_versions.sql
-- Sobdai Knowledge Platform — Migration 039 (Reference Layer versions).
--
-- Purpose
-- -------
-- Create immutable, parent-scoped ReferenceDocument source versions and their
-- same-parent supersession lineage.
--
-- Scope boundary
-- --------------
-- * Creates only public.reference_document_versions and its protections.
-- * Does not create aliases, Knowledge Layer, or Product Layer objects.
-- * Inserts no data. Curated source rows arrive in migration 048.
-- * `publication_date` is the source publisher's date. `verified` is Sobdai's
--   trusted-source state; this table has no separate product publishing state.
--
-- Safety / rollback
-- -----------------
-- This migration is additive and unused by the legacy application. RLS is
-- enabled with no policies and browser grants are revoked. Operational rollback
-- leaves the empty table dormant. Never drop accepted source history after use.

-- Fail before creating a partial child schema if migration 038 is unavailable
-- or incompatible with the frozen parent contract.
do $kp_reference_versions_preflight$
begin
    if to_regclass('public.reference_documents') is null then
        raise exception using
            errcode = 'check_violation',
            message = 'Knowledge Platform migration 039 requires public.reference_documents from migration 038.';
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
            message = 'Knowledge Platform migration 039 requires the validated migration 038 ReferenceDocument primary key.';
    end if;
end
$kp_reference_versions_preflight$;

-- ─────────────────────────────────────────────────────────────────────────────
-- ReferenceDocumentVersion child entity
-- ─────────────────────────────────────────────────────────────────────────────

create table if not exists public.reference_document_versions (
    id uuid not null default uuid_generate_v4(),
    reference_document_id uuid not null,
    version_label text not null,
    status text not null default 'draft',

    publication_date date,
    effective_from_date date,
    effective_to_date date,

    source_url text,
    storage_bucket text,
    storage_path text,
    media_type text,
    byte_size bigint,
    content_checksum text,

    supersedes_version_id uuid,

    verification_method text,
    verified_by uuid,
    verified_at timestamptz,

    created_by uuid not null,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),

    withdrawn_by uuid,
    withdrawn_at timestamptz,
    withdrawal_reason text,

    constraint reference_document_versions_pkey primary key (id),
    constraint reference_document_versions_parent_label_key
        unique (reference_document_id, version_label),
    constraint reference_document_versions_parent_id_key
        unique (reference_document_id, id),

    constraint reference_document_versions_required_text_check check (
        btrim(version_label) <> ''
        and (source_url is null or btrim(source_url) <> '')
        and (storage_bucket is null or btrim(storage_bucket) <> '')
        and (storage_path is null or btrim(storage_path) <> '')
        and (media_type is null or btrim(media_type) <> '')
        and (content_checksum is null or btrim(content_checksum) <> '')
        and (verification_method is null or btrim(verification_method) <> '')
        and (withdrawal_reason is null or btrim(withdrawal_reason) <> '')
    ),
    constraint reference_document_versions_status_check check (
        status in ('draft', 'verified', 'superseded', 'withdrawn')
    ),
    constraint reference_document_versions_effective_dates_check check (
        effective_to_date is null
        or effective_from_date is null
        or effective_to_date >= effective_from_date
    ),
    constraint reference_document_versions_storage_pair_check check (
        (storage_bucket is null and storage_path is null)
        or (storage_bucket is not null and storage_path is not null)
    ),
    constraint reference_document_versions_storage_metadata_check check (
        storage_bucket is null
        or (media_type is not null and content_checksum is not null)
    ),
    constraint reference_document_versions_byte_size_check check (
        byte_size is null or byte_size >= 0
    ),
    constraint reference_document_versions_verification_audit_check check (
        (verified_by is null and verified_at is null)
        or (verified_by is not null and verified_at is not null)
    ),
    constraint reference_document_versions_verified_semantics_check check (
        status not in ('verified', 'superseded')
        or (
            content_checksum is not null
            and verification_method is not null
            and verified_by is not null
            and verified_at is not null
        )
    ),
    constraint reference_document_versions_not_self_superseding_check check (
        supersedes_version_id is null or supersedes_version_id <> id
    ),
    constraint reference_document_versions_withdrawal_check check (
        (
            status = 'withdrawn'
            and withdrawn_by is not null
            and withdrawn_at is not null
            and withdrawal_reason is not null
        )
        or (
            status <> 'withdrawn'
            and withdrawn_by is null
            and withdrawn_at is null
            and withdrawal_reason is null
        )
    ),

    constraint reference_document_versions_parent_fkey
        foreign key (reference_document_id)
        references public.reference_documents(id)
        on delete restrict,
    constraint reference_document_versions_supersedes_fkey
        foreign key (reference_document_id, supersedes_version_id)
        references public.reference_document_versions(reference_document_id, id)
        on delete restrict
        deferrable initially deferred,
    constraint reference_document_versions_verified_by_fkey
        foreign key (verified_by)
        references public.profiles(id)
        on delete set null,
    constraint reference_document_versions_created_by_fkey
        foreign key (created_by)
        references public.profiles(id)
        on delete set null,
    constraint reference_document_versions_withdrawn_by_fkey
        foreign key (withdrawn_by)
        references public.profiles(id)
        on delete set null
);

comment on table public.reference_document_versions is
    'One proposed, verified, superseded, or withdrawn source edition/representation belonging to a ReferenceDocument. Accepted source identity and provenance are immutable.';
comment on column public.reference_document_versions.id is
    'UUID child identity for one ReferenceDocument source version.';
comment on column public.reference_document_versions.reference_document_id is
    'Owning ReferenceDocument aggregate root.';
comment on column public.reference_document_versions.version_label is
    'Official or editorial edition label, unique within one ReferenceDocument.';
comment on column public.reference_document_versions.status is
    'Source-version lifecycle: draft, verified, superseded, or withdrawn.';
comment on column public.reference_document_versions.publication_date is
    'Date the source authority published this version; not a Sobdai product publication timestamp.';
comment on column public.reference_document_versions.effective_from_date is
    'Optional legal or domain effective start date.';
comment on column public.reference_document_versions.effective_to_date is
    'Optional legal or domain effective end date; never before effective_from_date.';
comment on column public.reference_document_versions.source_url is
    'Authoritative version-specific source URL.';
comment on column public.reference_document_versions.storage_bucket is
    'Supabase Storage bucket containing an immutable controlled source copy.';
comment on column public.reference_document_versions.storage_path is
    'Immutable object path for the controlled source copy; never a signed URL.';
comment on column public.reference_document_versions.media_type is
    'MIME type of the stored or identified source representation.';
comment on column public.reference_document_versions.byte_size is
    'Optional non-negative source object size in bytes.';
comment on column public.reference_document_versions.content_checksum is
    'Algorithm-qualified digest identifying the exact source content; required before verification.';
comment on column public.reference_document_versions.supersedes_version_id is
    'Optional prior version in the same ReferenceDocument lineage.';
comment on column public.reference_document_versions.verification_method is
    'Editorial/source method used to establish trusted verified provenance.';
comment on column public.reference_document_versions.verified_by is
    'Profile that verified this exact source identity and provenance.';
comment on column public.reference_document_versions.verified_at is
    'UTC instant when this exact source identity and provenance was verified.';
comment on column public.reference_document_versions.created_by is
    'Profile that created the source-version record.';
comment on column public.reference_document_versions.created_at is
    'UTC instant when the source-version record was created.';
comment on column public.reference_document_versions.updated_at is
    'UTC instant of the most recent permitted lifecycle or audit update.';
comment on column public.reference_document_versions.withdrawn_by is
    'Profile that withdrew the version from trusted editorial use.';
comment on column public.reference_document_versions.withdrawn_at is
    'UTC instant when the source version was withdrawn.';
comment on column public.reference_document_versions.withdrawal_reason is
    'Required reason explaining why a withdrawn source is invalid or untrusted for new use.';

-- ─────────────────────────────────────────────────────────────────────────────
-- Lifecycle and immutability protection
-- ─────────────────────────────────────────────────────────────────────────────

create or replace function public.enforce_reference_document_version_transition()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $function$
begin
    if new.status is not distinct from old.status then
        return new;
    end if;

    if not (
        (old.status = 'draft' and new.status in ('verified', 'withdrawn'))
        or (old.status = 'verified' and new.status in ('superseded', 'withdrawn'))
        or (old.status = 'superseded' and new.status = 'withdrawn')
    ) then
        raise exception
            'invalid ReferenceDocumentVersion lifecycle transition: % -> %',
            old.status,
            new.status
            using errcode = 'check_violation';
    end if;

    return new;
end
$function$;

comment on function public.enforce_reference_document_version_transition() is
    'Allows only the frozen draft→verified/withdrawn, verified→superseded/withdrawn, and superseded→withdrawn lifecycle transitions.';

create or replace function public.protect_reference_document_version()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $function$
begin
    -- A non-draft record is retained as immutable source evidence. Status and
    -- withdrawal audit may advance only through the lifecycle trigger.
    if old.status in ('verified', 'superseded', 'withdrawn')
       and row(
            new.id,
            new.reference_document_id,
            new.version_label,
            new.publication_date,
            new.effective_from_date,
            new.effective_to_date,
            new.source_url,
            new.storage_bucket,
            new.storage_path,
            new.media_type,
            new.byte_size,
            new.content_checksum,
            new.supersedes_version_id,
            new.verification_method,
            new.verified_by,
            new.verified_at,
            new.created_by,
            new.created_at
       ) is distinct from row(
            old.id,
            old.reference_document_id,
            old.version_label,
            old.publication_date,
            old.effective_from_date,
            old.effective_to_date,
            old.source_url,
            old.storage_bucket,
            old.storage_path,
            old.media_type,
            old.byte_size,
            old.content_checksum,
            old.supersedes_version_id,
            old.verification_method,
            old.verified_by,
            old.verified_at,
            old.created_by,
            old.created_at
       )
    then
        raise exception
            'accepted ReferenceDocumentVersion content and provenance are immutable'
            using errcode = 'check_violation';
    end if;

    if old.status = 'withdrawn'
       and row(new.withdrawn_by, new.withdrawn_at, new.withdrawal_reason)
           is distinct from
           row(old.withdrawn_by, old.withdrawn_at, old.withdrawal_reason)
    then
        raise exception
            'withdrawn ReferenceDocumentVersion audit is immutable'
            using errcode = 'check_violation';
    end if;

    return new;
end
$function$;

comment on function public.protect_reference_document_version() is
    'Prevents mutation of accepted source identity/content/provenance and terminal withdrawal audit.';

drop trigger if exists enforce_reference_document_version_transition
    on public.reference_document_versions;
create trigger enforce_reference_document_version_transition
    before update of status on public.reference_document_versions
    for each row execute function public.enforce_reference_document_version_transition();

drop trigger if exists protect_reference_document_version
    on public.reference_document_versions;
create trigger protect_reference_document_version
    before update on public.reference_document_versions
    for each row execute function public.protect_reference_document_version();

drop trigger if exists handle_updated_at_reference_document_versions
    on public.reference_document_versions;
create trigger handle_updated_at_reference_document_versions
    before update on public.reference_document_versions
    for each row execute procedure public.handle_updated_at();

-- ─────────────────────────────────────────────────────────────────────────────
-- Frozen version and editorial-operation indexes
-- ─────────────────────────────────────────────────────────────────────────────

create index if not exists reference_document_versions_parent_status_effective_idx
    on public.reference_document_versions (
        reference_document_id,
        status,
        effective_from_date
    );

create index if not exists reference_document_versions_supersedes_idx
    on public.reference_document_versions (supersedes_version_id)
    where supersedes_version_id is not null;

create index if not exists reference_document_versions_checksum_idx
    on public.reference_document_versions (content_checksum)
    where content_checksum is not null;

create index if not exists reference_document_versions_status_verified_idx
    on public.reference_document_versions (status, verified_at);

-- No public/staff base-table policies are installed in 039. Migration 045 owns
-- the frozen aggregate-aware policy foundation and approved command paths.
alter table public.reference_document_versions enable row level security;

revoke all on table public.reference_document_versions
    from public, anon, authenticated;
revoke all on function public.enforce_reference_document_version_transition()
    from public, anon, authenticated;
revoke all on function public.protect_reference_document_version()
    from public, anon, authenticated;

grant select, insert, update, delete
    on table public.reference_document_versions
    to service_role;

-- ─────────────────────────────────────────────────────────────────────────────
-- Fail-closed migration validation
-- ─────────────────────────────────────────────────────────────────────────────

do $kp_reference_versions_assertions$
declare
    expected record;
begin
    if to_regclass('public.reference_document_versions') is null then
        raise exception using
            errcode = 'check_violation',
            message = 'Knowledge Platform migration 039 drift: public.reference_document_versions is missing.';
    end if;

    for expected in
        select *
        from (
            values
                ('id', 'uuid', 'NO'),
                ('reference_document_id', 'uuid', 'NO'),
                ('version_label', 'text', 'NO'),
                ('status', 'text', 'NO'),
                ('publication_date', 'date', 'YES'),
                ('effective_from_date', 'date', 'YES'),
                ('effective_to_date', 'date', 'YES'),
                ('source_url', 'text', 'YES'),
                ('storage_bucket', 'text', 'YES'),
                ('storage_path', 'text', 'YES'),
                ('media_type', 'text', 'YES'),
                ('byte_size', 'int8', 'YES'),
                ('content_checksum', 'text', 'YES'),
                ('supersedes_version_id', 'uuid', 'YES'),
                ('verification_method', 'text', 'YES'),
                ('verified_by', 'uuid', 'YES'),
                ('verified_at', 'timestamptz', 'YES'),
                ('created_by', 'uuid', 'NO'),
                ('created_at', 'timestamptz', 'NO'),
                ('updated_at', 'timestamptz', 'NO'),
                ('withdrawn_by', 'uuid', 'YES'),
                ('withdrawn_at', 'timestamptz', 'YES'),
                ('withdrawal_reason', 'text', 'YES')
        ) as required_columns(column_name, udt_name, is_nullable)
    loop
        if not exists (
            select 1
            from information_schema.columns c
            where c.table_schema = 'public'
              and c.table_name = 'reference_document_versions'
              and c.column_name = expected.column_name
              and c.udt_name = expected.udt_name
              and c.is_nullable = expected.is_nullable
        ) then
            raise exception using
                errcode = 'check_violation',
                message = format(
                    'Knowledge Platform migration 039 drift: expected public.reference_document_versions.%I type=%s nullable=%s.',
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
          and c.table_name = 'reference_document_versions'
    ) <> 23 then
        raise exception using
            errcode = 'check_violation',
            message = 'Knowledge Platform migration 039 drift: public.reference_document_versions has unexpected columns.';
    end if;

    for expected in
        select *
        from (
            values
                ('reference_document_versions_pkey'),
                ('reference_document_versions_parent_label_key'),
                ('reference_document_versions_parent_id_key'),
                ('reference_document_versions_required_text_check'),
                ('reference_document_versions_status_check'),
                ('reference_document_versions_effective_dates_check'),
                ('reference_document_versions_storage_pair_check'),
                ('reference_document_versions_storage_metadata_check'),
                ('reference_document_versions_byte_size_check'),
                ('reference_document_versions_verification_audit_check'),
                ('reference_document_versions_verified_semantics_check'),
                ('reference_document_versions_not_self_superseding_check'),
                ('reference_document_versions_withdrawal_check'),
                ('reference_document_versions_parent_fkey'),
                ('reference_document_versions_supersedes_fkey'),
                ('reference_document_versions_verified_by_fkey'),
                ('reference_document_versions_created_by_fkey'),
                ('reference_document_versions_withdrawn_by_fkey')
        ) as required_constraints(constraint_name)
    loop
        if not exists (
            select 1
            from pg_constraint c
            where c.conrelid = 'public.reference_document_versions'::regclass
              and c.conname = expected.constraint_name
              and c.convalidated
        ) then
            raise exception using
                errcode = 'check_violation',
                message = format(
                    'Knowledge Platform migration 039 drift: constraint %I is missing or unvalidated.',
                    expected.constraint_name
                );
        end if;
    end loop;

    if not exists (
        select 1
        from pg_constraint c
        where c.conrelid = 'public.reference_document_versions'::regclass
          and c.conname = 'reference_document_versions_parent_fkey'
          and c.contype = 'f'
          and c.confrelid = 'public.reference_documents'::regclass
          and c.confdeltype = 'r'
    ) then
        raise exception using
            errcode = 'check_violation',
            message = 'Knowledge Platform migration 039 drift: parent FK must reference migration 038 with ON DELETE RESTRICT.';
    end if;

    if not exists (
        select 1
        from pg_constraint c
        where c.conrelid = 'public.reference_document_versions'::regclass
          and c.conname = 'reference_document_versions_supersedes_fkey'
          and c.contype = 'f'
          and c.confrelid = 'public.reference_document_versions'::regclass
          and c.confdeltype = 'r'
          and c.condeferrable
          and c.condeferred
          and pg_get_constraintdef(c.oid) ilike '%FOREIGN KEY (reference_document_id, supersedes_version_id)%'
          and pg_get_constraintdef(c.oid) ilike '%REFERENCES reference_document_versions(reference_document_id, id)%'
    ) then
        raise exception using
            errcode = 'check_violation',
            message = 'Knowledge Platform migration 039 drift: supersedes FK must enforce same-parent lineage with ON DELETE RESTRICT.';
    end if;

    for expected in
        select *
        from (
            values
                ('reference_document_versions_verified_by_fkey'),
                ('reference_document_versions_created_by_fkey'),
                ('reference_document_versions_withdrawn_by_fkey')
        ) as actor_fks(constraint_name)
    loop
        if not exists (
            select 1
            from pg_constraint c
            where c.conrelid = 'public.reference_document_versions'::regclass
              and c.conname = expected.constraint_name
              and c.contype = 'f'
              and c.confrelid = 'public.profiles'::regclass
              and c.confdeltype = 'n'
        ) then
            raise exception using
                errcode = 'check_violation',
                message = format(
                    'Knowledge Platform migration 039 drift: actor FK %I must reference profiles with ON DELETE SET NULL.',
                    expected.constraint_name
                );
        end if;
    end loop;

    for expected in
        select *
        from (
            values
                ('reference_document_versions_parent_label_key'),
                ('reference_document_versions_parent_id_key'),
                ('reference_document_versions_parent_status_effective_idx'),
                ('reference_document_versions_supersedes_idx'),
                ('reference_document_versions_checksum_idx'),
                ('reference_document_versions_status_verified_idx')
        ) as required_indexes(index_name)
    loop
        if not exists (
            select 1
            from pg_class i
            join pg_namespace n on n.oid = i.relnamespace
            join pg_index x on x.indexrelid = i.oid
            where n.nspname = 'public'
              and i.relname = expected.index_name
              and x.indrelid = 'public.reference_document_versions'::regclass
              and x.indisvalid
              and x.indisready
        ) then
            raise exception using
                errcode = 'check_violation',
                message = format(
                    'Knowledge Platform migration 039 drift: index %I is missing, invalid, or not ready.',
                    expected.index_name
                );
        end if;
    end loop;

    if to_regprocedure('public.enforce_reference_document_version_transition()') is null
       or to_regprocedure('public.protect_reference_document_version()') is null
    then
        raise exception using
            errcode = 'check_violation',
            message = 'Knowledge Platform migration 039 drift: lifecycle or immutability function is missing.';
    end if;

    for expected in
        select *
        from (
            values
                ('enforce_reference_document_version_transition'),
                ('protect_reference_document_version'),
                ('handle_updated_at_reference_document_versions')
        ) as required_triggers(trigger_name)
    loop
        if not exists (
            select 1
            from pg_trigger t
            where t.tgrelid = 'public.reference_document_versions'::regclass
              and t.tgname = expected.trigger_name
              and not t.tgisinternal
              and t.tgenabled <> 'D'
        ) then
            raise exception using
                errcode = 'check_violation',
                message = format(
                    'Knowledge Platform migration 039 drift: trigger %I is missing or disabled.',
                    expected.trigger_name
                );
        end if;
    end loop;

    if not exists (
        select 1
        from pg_class c
        join pg_namespace n on n.oid = c.relnamespace
        where n.nspname = 'public'
          and c.relname = 'reference_document_versions'
          and c.relrowsecurity
    ) then
        raise exception using
            errcode = 'check_violation',
            message = 'Knowledge Platform migration 039 drift: RLS is not enabled on public.reference_document_versions.';
    end if;

    if exists (
        select 1
        from pg_policies
        where schemaname = 'public'
          and tablename = 'reference_document_versions'
    ) then
        raise exception using
            errcode = 'check_violation',
            message = 'Knowledge Platform migration 039 drift: reference_document_versions must have no policies before migration 045.';
    end if;

    if has_table_privilege('anon', 'public.reference_document_versions', 'SELECT')
       or has_table_privilege('authenticated', 'public.reference_document_versions', 'SELECT')
       or has_table_privilege('anon', 'public.reference_document_versions', 'INSERT')
       or has_table_privilege('authenticated', 'public.reference_document_versions', 'INSERT')
       or has_table_privilege('anon', 'public.reference_document_versions', 'UPDATE')
       or has_table_privilege('authenticated', 'public.reference_document_versions', 'UPDATE')
       or has_table_privilege('anon', 'public.reference_document_versions', 'DELETE')
       or has_table_privilege('authenticated', 'public.reference_document_versions', 'DELETE')
    then
        raise exception using
            errcode = 'check_violation',
            message = 'Knowledge Platform migration 039 drift: a browser role can access dormant source-version storage.';
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
            'public.reference_document_versions',
            expected.privilege_name
        ) then
            raise exception using
                errcode = 'check_violation',
                message = format(
                    'Knowledge Platform migration 039 drift: service_role lacks %s on public.reference_document_versions.',
                    expected.privilege_name
                );
        end if;
    end loop;

    raise notice 'Knowledge Platform migration 039 passed: immutable ReferenceDocument versions are valid, private, and dormant.';
end
$kp_reference_versions_assertions$;

notify pgrst, 'reload schema';
