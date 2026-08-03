-- 050_kp_backfill_reference_documents_curated.sql
-- Sobdai Knowledge Platform — reconciled frozen Migration 048 responsibility.
--
-- Migration-number audit
-- ----------------------
-- Production migration 049_kp_backfill_summary_identity.sql implemented the
-- frozen migration 047 responsibility. Production 049 is committed and is the
-- current repository maximum, so 050 is the next monotonic production number.
--
-- Purpose
-- -------
-- Install the private manifest, approval, execution, reconciliation, and
-- explicit-empty evidence needed for the human-curated ReferenceDocument
-- backfill. Deployment creates only empty control objects and helper functions.
-- It does not invoke a helper, insert ReferenceDocument facts, update Summary
-- rows, infer a source from free text, or execute production backfill.
--
-- Frozen execution boundary
-- -------------------------
-- * Operators load reviewed candidates into the private manifest while its
--   parent entry is preparing.
-- * Approval fails closed unless Summary identity migration 049 is represented
--   in the ledger and every raw summaries.document value still matches.
-- * One later explicit apply call atomically creates one ReferenceDocument,
--   its first verified version, approved aliases, and approved live Summary
--   relationships, then records ledger and batch evidence.
-- * An explicitly empty approved manifest records zero-count ledger evidence
--   and inserts no source facts.
-- * Revision source snapshots remain assigned to the next frozen migration.

set local lock_timeout = '5s';

-- ─────────────────────────────────────────────────────────────────────────────
-- Fail closed on migrations 036, 038-040, 044, 048, and 049 dependencies
-- ─────────────────────────────────────────────────────────────────────────────

do $kp_curated_reference_preflight$
declare
    expected record;
begin
    for expected in
        select object_name
        from (values
            ('public.profiles'),
            ('public.summaries'),
            ('public.reference_documents'),
            ('public.reference_document_versions'),
            ('public.reference_document_aliases'),
            ('public.summary_reference_documents'),
            ('public.reference_document_code_seq'),
            ('kp_migration.migration_runs'),
            ('kp_migration.summary_ledger'),
            ('kp_migration.batch_progress')
        ) as required(object_name)
    loop
        if to_regclass(expected.object_name) is null then
            raise exception using
                errcode = 'check_violation',
                message = format('Knowledge Platform migration 050 prerequisite %s is missing.', expected.object_name);
        end if;
    end loop;

    if to_regprocedure('public.format_reference_document_code(bigint)') is null
       or to_regprocedure('public.allocate_reference_document_codes(integer)') is null
       or to_regprocedure('kp_migration.backfill_summary_identity_unit(uuid,uuid)') is null
    then
        raise exception using
            errcode = 'check_violation',
            message = 'Knowledge Platform migration 050 requires the ReferenceDocument allocator and migration 049 Summary identity executor.';
    end if;

    for expected in
        select index_name
        from (values
            ('reference_documents_document_code_key'),
            ('reference_document_versions_parent_label_key'),
            ('reference_document_aliases_type_normalized_key'),
            ('summary_reference_documents_unpinned_key'),
            ('summary_reference_documents_pinned_key'),
            ('summaries_summary_code_key'),
            ('summaries_canonical_slug_key')
        ) as required(index_name)
    loop
        if not exists (
            select 1
            from pg_class c
            join pg_namespace n on n.oid = c.relnamespace
            join pg_index i on i.indexrelid = c.oid
            where n.nspname = 'public'
              and c.relname = expected.index_name
              and i.indisvalid
              and i.indisready
        ) then
            raise exception using
                errcode = 'check_violation',
                message = format('Knowledge Platform migration 050 requires valid predecessor index %I.', expected.index_name);
        end if;
    end loop;
end
$kp_curated_reference_preflight$;

-- ─────────────────────────────────────────────────────────────────────────────
-- Private reviewed manifest — empty on deployment
-- ─────────────────────────────────────────────────────────────────────────────

create table if not exists kp_migration.reference_document_manifest (
    migration_run_id uuid not null,
    manifest_key text not null,

    reference_document_id uuid not null,
    document_code text not null,
    canonical_title text not null,
    short_title text,
    document_type text not null,
    issuer text not null,
    jurisdiction text not null,
    source_homepage_url text,
    lifecycle_status text not null default 'active',

    reference_document_version_id uuid not null,
    version_label text not null,
    publication_date date,
    effective_from_date date,
    effective_to_date date,
    source_url text,
    storage_bucket text,
    storage_path text,
    media_type text,
    byte_size bigint,
    content_checksum text not null,
    verification_method text not null,
    verified_by uuid not null,
    verified_at timestamptz not null,
    created_by uuid not null,

    state text not null default 'preparing',
    approved_by uuid,
    approved_at timestamptz,
    applied_at timestamptz,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),

    constraint kp_reference_document_manifest_pkey primary key (migration_run_id, manifest_key),
    constraint kp_reference_document_manifest_run_fkey foreign key (migration_run_id)
        references kp_migration.migration_runs(id) on delete restrict,
    constraint kp_reference_document_manifest_run_document_id_key
        unique (migration_run_id, reference_document_id),
    constraint kp_reference_document_manifest_run_document_code_key
        unique (migration_run_id, document_code),
    constraint kp_reference_document_manifest_run_version_id_key
        unique (migration_run_id, reference_document_version_id),
    constraint kp_reference_document_manifest_required_text_check check (
        btrim(manifest_key) <> ''
        and document_code ~ '^DOC-[0-9]{6,}$'
        and btrim(canonical_title) <> ''
        and (short_title is null or btrim(short_title) <> '')
        and btrim(document_type) <> ''
        and btrim(issuer) <> ''
        and btrim(jurisdiction) <> ''
        and (source_homepage_url is null or btrim(source_homepage_url) <> '')
        and btrim(version_label) <> ''
        and (source_url is null or btrim(source_url) <> '')
        and (storage_bucket is null or btrim(storage_bucket) <> '')
        and (storage_path is null or btrim(storage_path) <> '')
        and (media_type is null or btrim(media_type) <> '')
        and btrim(content_checksum) <> ''
        and btrim(verification_method) <> ''
    ),
    constraint kp_reference_document_manifest_lifecycle_check check (
        lifecycle_status in ('active', 'repealed')
    ),
    constraint kp_reference_document_manifest_effective_dates_check check (
        effective_to_date is null
        or effective_from_date is null
        or effective_to_date >= effective_from_date
    ),
    constraint kp_reference_document_manifest_storage_pair_check check (
        (storage_bucket is null and storage_path is null)
        or (storage_bucket is not null and storage_path is not null)
    ),
    constraint kp_reference_document_manifest_storage_metadata_check check (
        storage_bucket is null or media_type is not null
    ),
    constraint kp_reference_document_manifest_byte_size_check check (
        byte_size is null or byte_size >= 0
    ),
    constraint kp_reference_document_manifest_state_check check (
        state in ('preparing', 'approved', 'applied')
    ),
    constraint kp_reference_document_manifest_approval_check check (
        (state = 'preparing' and approved_by is null and approved_at is null and applied_at is null)
        or (state = 'approved' and approved_by is not null and approved_at is not null and applied_at is null)
        or (state = 'applied' and approved_by is not null and approved_at is not null and applied_at is not null)
    )
);

comment on table kp_migration.reference_document_manifest is
    'Private human-reviewed manifest for one ReferenceDocument root and its first verified version. It is not domain authority until explicitly applied.';

create table if not exists kp_migration.reference_document_alias_manifest (
    migration_run_id uuid not null,
    manifest_key text not null,
    alias_id uuid not null,
    alias_type text not null,
    alias_value text not null,
    normalized_value text not null,
    reason text not null,
    created_by uuid not null,

    constraint kp_reference_document_alias_manifest_pkey
        primary key (migration_run_id, manifest_key, alias_id),
    constraint kp_reference_document_alias_manifest_parent_fkey
        foreign key (migration_run_id, manifest_key)
        references kp_migration.reference_document_manifest(migration_run_id, manifest_key)
        on delete restrict,
    constraint kp_reference_document_alias_manifest_run_alias_id_key
        unique (migration_run_id, alias_id),
    constraint kp_reference_document_alias_manifest_run_locator_key
        unique (migration_run_id, alias_type, normalized_value),
    constraint kp_reference_document_alias_manifest_type_check check (
        alias_type in ('code', 'title', 'legacy_key')
    ),
    constraint kp_reference_document_alias_manifest_text_check check (
        btrim(alias_value) <> ''
        and btrim(normalized_value) <> ''
        and normalized_value = lower(btrim(normalized_value))
        and btrim(reason) <> ''
    )
);

comment on table kp_migration.reference_document_alias_manifest is
    'Approved alias candidates owned by one curated ReferenceDocument manifest entry.';

create table if not exists kp_migration.summary_reference_document_manifest (
    migration_run_id uuid not null,
    manifest_key text not null,
    relationship_id uuid not null,
    source_summary_id uuid not null,
    source_document_text text not null,
    reference_document_version_id uuid,
    role text not null,
    coverage_note text,
    sort_order integer not null default 0,
    created_by uuid not null,

    constraint kp_summary_reference_document_manifest_pkey
        primary key (migration_run_id, manifest_key, relationship_id),
    constraint kp_summary_reference_document_manifest_parent_fkey
        foreign key (migration_run_id, manifest_key)
        references kp_migration.reference_document_manifest(migration_run_id, manifest_key)
        on delete restrict,
    constraint kp_summary_reference_document_manifest_ledger_fkey
        foreign key (migration_run_id, source_summary_id)
        references kp_migration.summary_ledger(migration_run_id, source_summary_id)
        on delete restrict,
    constraint kp_summary_reference_document_manifest_run_relationship_id_key
        unique (migration_run_id, relationship_id),
    constraint kp_summary_reference_document_manifest_role_check check (
        role in ('primary', 'supporting')
    ),
    constraint kp_summary_reference_document_manifest_text_check check (
        btrim(source_document_text) <> ''
        and (coverage_note is null or btrim(coverage_note) <> '')
    )
);

comment on table kp_migration.summary_reference_document_manifest is
    'Human-approved mapping from exact legacy Summary document text to one curated ReferenceDocument relationship.';

create index if not exists kp_reference_document_manifest_run_state_idx
    on kp_migration.reference_document_manifest (migration_run_id, state, manifest_key);

create index if not exists kp_reference_document_alias_manifest_parent_idx
    on kp_migration.reference_document_alias_manifest (migration_run_id, manifest_key);

create unique index if not exists kp_summary_reference_document_manifest_unpinned_key
    on kp_migration.summary_reference_document_manifest (
        migration_run_id,
        source_summary_id,
        manifest_key
    ) where reference_document_version_id is null;

create unique index if not exists kp_summary_reference_document_manifest_pinned_key
    on kp_migration.summary_reference_document_manifest (
        migration_run_id,
        source_summary_id,
        manifest_key,
        reference_document_version_id
    ) where reference_document_version_id is not null;

-- ─────────────────────────────────────────────────────────────────────────────
-- Manifest immutability after approval
-- ─────────────────────────────────────────────────────────────────────────────

create or replace function kp_migration.guard_curated_reference_manifest()
returns trigger
language plpgsql
set search_path = pg_catalog, kp_migration, pg_temp
as $function$
begin
    if tg_op = 'DELETE' then
        if old.state <> 'preparing' then
            raise exception 'approved curated ReferenceDocument manifests are retained'
                using errcode = 'check_violation';
        end if;
        return old;
    end if;

    if old.state = 'preparing' then
        if new.state not in ('preparing', 'approved') then
            raise exception 'curated ReferenceDocument manifest must be approved before application'
                using errcode = 'check_violation';
        end if;
        return new;
    end if;

    if old.state = 'approved'
       and new.state = 'applied'
       and (to_jsonb(new) - array['state', 'applied_at', 'updated_at'])
           = (to_jsonb(old) - array['state', 'applied_at', 'updated_at'])
    then
        return new;
    end if;

    raise exception 'approved or applied curated ReferenceDocument manifest content is immutable'
        using errcode = 'check_violation';
end
$function$;

create or replace function kp_migration.guard_curated_reference_manifest_child()
returns trigger
language plpgsql
set search_path = pg_catalog, kp_migration, pg_temp
as $function$
declare
    v_run_id uuid := case when tg_op = 'DELETE' then old.migration_run_id else new.migration_run_id end;
    v_manifest_key text := case when tg_op = 'DELETE' then old.manifest_key else new.manifest_key end;
    v_state text;
begin
    select m.state into v_state
    from kp_migration.reference_document_manifest m
    where m.migration_run_id = v_run_id
      and m.manifest_key = v_manifest_key
    for share;

    if v_state is distinct from 'preparing' then
        raise exception 'curated ReferenceDocument manifest children are immutable after approval'
            using errcode = 'check_violation';
    end if;

    if tg_op = 'DELETE' then
        return old;
    end if;
    return new;
end
$function$;

drop trigger if exists guard_curated_reference_manifest
    on kp_migration.reference_document_manifest;
create trigger guard_curated_reference_manifest
    before update or delete on kp_migration.reference_document_manifest
    for each row execute function kp_migration.guard_curated_reference_manifest();

drop trigger if exists handle_updated_at_kp_reference_document_manifest
    on kp_migration.reference_document_manifest;
create trigger handle_updated_at_kp_reference_document_manifest
    before update on kp_migration.reference_document_manifest
    for each row execute procedure public.handle_updated_at();

drop trigger if exists guard_curated_reference_alias_manifest
    on kp_migration.reference_document_alias_manifest;
create trigger guard_curated_reference_alias_manifest
    before insert or update or delete on kp_migration.reference_document_alias_manifest
    for each row execute function kp_migration.guard_curated_reference_manifest_child();

drop trigger if exists guard_curated_summary_reference_manifest
    on kp_migration.summary_reference_document_manifest;
create trigger guard_curated_summary_reference_manifest
    before insert or update or delete on kp_migration.summary_reference_document_manifest
    for each row execute function kp_migration.guard_curated_reference_manifest_child();

-- ─────────────────────────────────────────────────────────────────────────────
-- Explicit human approval — manifest metadata only, no domain writes
-- ─────────────────────────────────────────────────────────────────────────────

create or replace function kp_migration.approve_curated_reference_document_manifest(
    p_migration_run_id uuid,
    p_manifest_key text,
    p_approved_by uuid
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public, kp_migration, pg_temp
set lock_timeout = '5s'
as $function$
declare
    v_manifest kp_migration.reference_document_manifest%rowtype;
begin
    if not exists (
        select 1 from kp_migration.migration_runs r
        where r.id = p_migration_run_id
          and r.status in ('preparing', 'running')
    ) then
        raise exception 'curated ReferenceDocument approval requires a preparing or running migration run'
            using errcode = 'object_not_in_prerequisite_state';
    end if;

    if not exists (select 1 from public.profiles p where p.id = p_approved_by) then
        raise exception 'curated ReferenceDocument approver does not exist'
            using errcode = 'foreign_key_violation';
    end if;

    select m.* into v_manifest
    from kp_migration.reference_document_manifest m
    where m.migration_run_id = p_migration_run_id
      and m.manifest_key = p_manifest_key
    for update;

    if not found or v_manifest.state <> 'preparing' then
        raise exception 'curated ReferenceDocument manifest must exist in preparing state'
            using errcode = 'object_not_in_prerequisite_state';
    end if;

    if not exists (
        select 1
        from kp_migration.summary_reference_document_manifest r
        where r.migration_run_id = p_migration_run_id
          and r.manifest_key = p_manifest_key
    ) then
        raise exception 'curated ReferenceDocument manifest requires at least one approved Summary relationship'
            using errcode = 'check_violation';
    end if;

    if not exists (select 1 from public.profiles p where p.id = v_manifest.created_by)
       or not exists (select 1 from public.profiles p where p.id = v_manifest.verified_by)
       or exists (
            select 1
            from kp_migration.reference_document_alias_manifest a
            left join public.profiles p on p.id = a.created_by
            where a.migration_run_id = p_migration_run_id
              and a.manifest_key = p_manifest_key
              and p.id is null
       )
       or exists (
            select 1
            from kp_migration.summary_reference_document_manifest r
            left join public.profiles p on p.id = r.created_by
            where r.migration_run_id = p_migration_run_id
              and r.manifest_key = p_manifest_key
              and p.id is null
       )
    then
        raise exception 'curated ReferenceDocument manifest contains an unknown actor'
            using errcode = 'foreign_key_violation';
    end if;

    if exists (
        select 1
        from kp_migration.summary_reference_document_manifest r
        join kp_migration.summary_ledger l
          on l.migration_run_id = r.migration_run_id
         and l.source_summary_id = r.source_summary_id
        join public.summaries s on s.id = r.source_summary_id
        where r.migration_run_id = p_migration_run_id
          and r.manifest_key = p_manifest_key
          and (
              l.target_summary_id is distinct from s.id
              or s.summary_code is null
              or s.canonical_slug is null
              or s.document is distinct from r.source_document_text
              or (
                  r.reference_document_version_id is not null
                  and r.reference_document_version_id <> v_manifest.reference_document_version_id
              )
          )
    ) then
        raise exception 'curated ReferenceDocument manifest does not match migrated Summary identity or exact legacy document text'
            using errcode = 'serialization_failure';
    end if;

    if exists (
        select 1 from public.reference_documents d
        where d.id = v_manifest.reference_document_id
           or d.document_code = v_manifest.document_code
    ) or exists (
        select 1
        from kp_migration.reference_document_alias_manifest a
        join public.reference_document_aliases target
          on target.alias_type = a.alias_type
         and target.normalized_value = a.normalized_value
        where a.migration_run_id = p_migration_run_id
          and a.manifest_key = p_manifest_key
    ) then
        raise exception 'curated ReferenceDocument manifest collides with an existing document or reserved alias'
            using errcode = 'unique_violation';
    end if;

    update kp_migration.reference_document_manifest
    set state = 'approved',
        approved_by = p_approved_by,
        approved_at = clock_timestamp()
    where migration_run_id = p_migration_run_id
      and manifest_key = p_manifest_key;

    return v_manifest.reference_document_id;
end
$function$;

-- ─────────────────────────────────────────────────────────────────────────────
-- Controlled reviewed-data unit — defined only, never invoked here
-- ─────────────────────────────────────────────────────────────────────────────

create or replace function kp_migration.apply_curated_reference_document_unit(
    p_migration_run_id uuid,
    p_manifest_key text
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public, kp_migration, pg_temp
set lock_timeout = '5s'
as $function$
declare
    v_manifest kp_migration.reference_document_manifest%rowtype;
    v_alias kp_migration.reference_document_alias_manifest%rowtype;
    v_relation kp_migration.summary_reference_document_manifest%rowtype;
    v_manifest_max bigint;
    v_sequence_last bigint;
    v_remaining bigint;
    v_now timestamptz := clock_timestamp();
begin
    if not exists (
        select 1 from kp_migration.migration_runs r
        where r.id = p_migration_run_id and r.status = 'running'
    ) then
        raise exception 'curated ReferenceDocument application requires a running migration run'
            using errcode = 'object_not_in_prerequisite_state';
    end if;

    select m.* into v_manifest
    from kp_migration.reference_document_manifest m
    where m.migration_run_id = p_migration_run_id
      and m.manifest_key = p_manifest_key
    for update;

    if not found then
        raise exception 'curated ReferenceDocument manifest does not exist'
            using errcode = 'foreign_key_violation';
    end if;
    if v_manifest.state = 'applied' then
        return v_manifest.reference_document_id;
    end if;
    if v_manifest.state <> 'approved' then
        raise exception 'curated ReferenceDocument manifest must be approved before application'
            using errcode = 'object_not_in_prerequisite_state';
    end if;

    -- Recheck exact source evidence at the write boundary.
    if exists (
        select 1
        from kp_migration.summary_reference_document_manifest r
        join kp_migration.summary_ledger l
          on l.migration_run_id = r.migration_run_id
         and l.source_summary_id = r.source_summary_id
        join public.summaries s on s.id = r.source_summary_id
        where r.migration_run_id = p_migration_run_id
          and r.manifest_key = p_manifest_key
          and (
              l.target_summary_id is distinct from s.id
              or s.document is distinct from r.source_document_text
          )
    ) then
        raise exception 'curated ReferenceDocument source evidence changed after approval'
            using errcode = 'serialization_failure';
    end if;

    select max(substring(m.document_code from 5)::bigint)
    into v_manifest_max
    from kp_migration.reference_document_manifest m
    where m.migration_run_id = p_migration_run_id
      and m.state in ('approved', 'applied');

    select last_value into v_sequence_last
    from public.reference_document_code_seq;

    perform pg_catalog.setval(
        'public.reference_document_code_seq'::regclass,
        greatest(v_manifest_max, v_sequence_last),
        true
    );

    insert into public.reference_documents (
        id, document_code, canonical_title, short_title, document_type,
        issuer, jurisdiction, source_homepage_url, lifecycle_status, created_by
    ) values (
        v_manifest.reference_document_id,
        v_manifest.document_code,
        v_manifest.canonical_title,
        v_manifest.short_title,
        v_manifest.document_type,
        v_manifest.issuer,
        v_manifest.jurisdiction,
        v_manifest.source_homepage_url,
        v_manifest.lifecycle_status,
        v_manifest.created_by
    );

    insert into public.reference_document_versions (
        id, reference_document_id, version_label, status,
        publication_date, effective_from_date, effective_to_date,
        source_url, storage_bucket, storage_path, media_type, byte_size,
        content_checksum, verification_method, verified_by, verified_at, created_by
    ) values (
        v_manifest.reference_document_version_id,
        v_manifest.reference_document_id,
        v_manifest.version_label,
        'verified',
        v_manifest.publication_date,
        v_manifest.effective_from_date,
        v_manifest.effective_to_date,
        v_manifest.source_url,
        v_manifest.storage_bucket,
        v_manifest.storage_path,
        v_manifest.media_type,
        v_manifest.byte_size,
        v_manifest.content_checksum,
        v_manifest.verification_method,
        v_manifest.verified_by,
        v_manifest.verified_at,
        v_manifest.created_by
    );

    for v_alias in
        select a.*
        from kp_migration.reference_document_alias_manifest a
        where a.migration_run_id = p_migration_run_id
          and a.manifest_key = p_manifest_key
        order by a.alias_type, a.normalized_value, a.alias_id
    loop
        insert into public.reference_document_aliases (
            id, reference_document_id, alias_type, alias_value,
            normalized_value, status, reason, created_by
        ) values (
            v_alias.alias_id,
            v_manifest.reference_document_id,
            v_alias.alias_type,
            v_alias.alias_value,
            v_alias.normalized_value,
            'active',
            v_alias.reason,
            v_alias.created_by
        );
    end loop;

    for v_relation in
        select r.*
        from kp_migration.summary_reference_document_manifest r
        where r.migration_run_id = p_migration_run_id
          and r.manifest_key = p_manifest_key
        order by r.source_summary_id, r.sort_order, r.relationship_id
    loop
        insert into public.summary_reference_documents (
            id, summary_id, reference_document_id,
            reference_document_version_id, role, coverage_note,
            sort_order, created_by
        ) values (
            v_relation.relationship_id,
            v_relation.source_summary_id,
            v_manifest.reference_document_id,
            v_relation.reference_document_version_id,
            v_relation.role,
            v_relation.coverage_note,
            v_relation.sort_order,
            v_relation.created_by
        );

        update kp_migration.summary_ledger
        set provenance = jsonb_set(
            provenance,
            '{curated_reference_documents}',
            coalesce(provenance -> 'curated_reference_documents', '[]'::jsonb)
                || jsonb_build_array(jsonb_build_object(
                    'migration', 50,
                    'frozen_responsibility', 48,
                    'manifest_key', p_manifest_key,
                    'reference_document_id', v_manifest.reference_document_id,
                    'reference_document_version_id', v_relation.reference_document_version_id,
                    'relationship_id', v_relation.relationship_id,
                    'applied_at', v_now
                )),
            true
        )
        where migration_run_id = p_migration_run_id
          and source_summary_id = v_relation.source_summary_id;
    end loop;

    update kp_migration.reference_document_manifest
    set state = 'applied', applied_at = v_now
    where migration_run_id = p_migration_run_id
      and manifest_key = p_manifest_key;

    select count(*) into v_remaining
    from kp_migration.reference_document_manifest m
    where m.migration_run_id = p_migration_run_id
      and m.state <> 'applied';

    insert into kp_migration.batch_progress (
        migration_run_id, batch_key, state,
        processed_count, succeeded_count, failed_count, skipped_count,
        started_at, heartbeat_at, completed_at
    ) values (
        p_migration_run_id,
        'curated_reference_documents',
        case when v_remaining = 0 then 'completed' else 'running' end,
        1, 1, 0, 0,
        v_now, v_now,
        case when v_remaining = 0 then v_now else null end
    )
    on conflict (migration_run_id, batch_key) do update
    set state = excluded.state,
        processed_count = kp_migration.batch_progress.processed_count + 1,
        succeeded_count = kp_migration.batch_progress.succeeded_count + 1,
        started_at = coalesce(kp_migration.batch_progress.started_at, excluded.started_at),
        heartbeat_at = excluded.heartbeat_at,
        completed_at = excluded.completed_at,
        error_message = null;

    return v_manifest.reference_document_id;
end
$function$;

-- Explicitly approve a zero-row curated unit without creating source facts.
create or replace function kp_migration.confirm_empty_curated_reference_manifest(
    p_migration_run_id uuid,
    p_approved_by uuid
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public, kp_migration, pg_temp
set lock_timeout = '5s'
as $function$
declare
    v_now timestamptz := clock_timestamp();
begin
    if not exists (
        select 1 from kp_migration.migration_runs r
        where r.id = p_migration_run_id and r.status = 'running'
    ) or not exists (select 1 from public.profiles p where p.id = p_approved_by) then
        raise exception 'empty curated ReferenceDocument confirmation has invalid run or approver'
            using errcode = 'object_not_in_prerequisite_state';
    end if;

    if exists (
        select 1 from kp_migration.reference_document_manifest m
        where m.migration_run_id = p_migration_run_id
    ) then
        raise exception 'empty curated ReferenceDocument confirmation requires an empty manifest'
            using errcode = 'check_violation';
    end if;

    insert into kp_migration.batch_progress (
        migration_run_id, batch_key, state,
        processed_count, succeeded_count, failed_count, skipped_count,
        started_at, heartbeat_at, completed_at
    ) values (
        p_migration_run_id, 'curated_reference_documents', 'completed',
        0, 0, 0, 0, v_now, v_now, v_now
    ) on conflict (migration_run_id, batch_key) do update
    set state = 'completed',
        heartbeat_at = excluded.heartbeat_at,
        completed_at = excluded.completed_at,
        error_message = null;

    update kp_migration.migration_runs
    set metadata = jsonb_set(
        metadata,
        '{curated_reference_documents}',
        jsonb_build_object(
            'status', 'approved_empty',
            'approved_by', p_approved_by,
            'approved_at', v_now,
            'migration', 50,
            'frozen_responsibility', 48
        ),
        true
    )
    where id = p_migration_run_id;
end
$function$;

-- Read-only reconciliation. It reports evidence; it never repairs or inserts.
create or replace function kp_migration.reconcile_curated_reference_documents(
    p_migration_run_id uuid
)
returns table (
    manifest_total bigint,
    preparing_total bigint,
    approved_total bigint,
    applied_total bigint,
    target_document_total bigint,
    target_version_total bigint,
    target_alias_total bigint,
    target_relationship_total bigint,
    mismatch_total bigint
)
language sql
stable
security definer
set search_path = pg_catalog, public, kp_migration, pg_temp
as $function$
    with manifest as (
        select m.*
        from kp_migration.reference_document_manifest m
        where m.migration_run_id = p_migration_run_id
    ),
    expected_aliases as (
        select a.*
        from kp_migration.reference_document_alias_manifest a
        where a.migration_run_id = p_migration_run_id
    ),
    expected_relationships as (
        select r.*
        from kp_migration.summary_reference_document_manifest r
        where r.migration_run_id = p_migration_run_id
    )
    select
        (select count(*) from manifest),
        (select count(*) from manifest where state = 'preparing'),
        (select count(*) from manifest where state = 'approved'),
        (select count(*) from manifest where state = 'applied'),
        (select count(*) from manifest m join public.reference_documents d on d.id = m.reference_document_id),
        (select count(*) from manifest m join public.reference_document_versions v on v.id = m.reference_document_version_id),
        (select count(*) from expected_aliases a join public.reference_document_aliases target on target.id = a.alias_id),
        (select count(*) from expected_relationships r join public.summary_reference_documents target on target.id = r.relationship_id),
        (
            select count(*)
            from manifest m
            where m.state = 'applied'
              and (
                  not exists (
                      select 1 from public.reference_documents d
                      where d.id = m.reference_document_id
                        and d.document_code = m.document_code
                        and d.canonical_title = m.canonical_title
                  )
                  or not exists (
                      select 1 from public.reference_document_versions v
                      where v.id = m.reference_document_version_id
                        and v.reference_document_id = m.reference_document_id
                        and v.status = 'verified'
                        and v.content_checksum = m.content_checksum
                  )
                  or exists (
                      select 1 from expected_aliases a
                      where a.manifest_key = m.manifest_key
                        and not exists (
                            select 1 from public.reference_document_aliases target
                            where target.id = a.alias_id
                              and target.reference_document_id = m.reference_document_id
                              and target.alias_type = a.alias_type
                              and target.normalized_value = a.normalized_value
                        )
                  )
                  or exists (
                      select 1 from expected_relationships r
                      where r.manifest_key = m.manifest_key
                        and not exists (
                            select 1 from public.summary_reference_documents target
                            where target.id = r.relationship_id
                              and target.summary_id = r.source_summary_id
                              and target.reference_document_id = m.reference_document_id
                              and target.reference_document_version_id is not distinct from r.reference_document_version_id
                        )
                  )
              )
        );
$function$;

comment on function kp_migration.approve_curated_reference_document_manifest(uuid, text, uuid) is
    'Freezes one human-reviewed curated ReferenceDocument manifest after exact legacy-source and Summary-identity validation; writes no domain facts.';
comment on function kp_migration.apply_curated_reference_document_unit(uuid, text) is
    'Controlled frozen migration 048 executor installed as production migration 050; one explicit call atomically applies one approved source aggregate.';
comment on function kp_migration.confirm_empty_curated_reference_manifest(uuid, uuid) is
    'Records explicit human approval that a migration run has no curated ReferenceDocument mappings; inserts no source facts.';
comment on function kp_migration.reconcile_curated_reference_documents(uuid) is
    'Read-only manifest-to-target counts and mismatch evidence for the curated ReferenceDocument unit.';

-- ─────────────────────────────────────────────────────────────────────────────
-- Private access boundary
-- ─────────────────────────────────────────────────────────────────────────────

alter table kp_migration.reference_document_manifest enable row level security;
alter table kp_migration.reference_document_alias_manifest enable row level security;
alter table kp_migration.summary_reference_document_manifest enable row level security;

revoke all on table
    kp_migration.reference_document_manifest,
    kp_migration.reference_document_alias_manifest,
    kp_migration.summary_reference_document_manifest
from public, anon, authenticated;

grant select, insert, update, delete on table
    kp_migration.reference_document_manifest,
    kp_migration.reference_document_alias_manifest,
    kp_migration.summary_reference_document_manifest
to service_role;

revoke all on function kp_migration.guard_curated_reference_manifest()
    from public, anon, authenticated;
revoke all on function kp_migration.guard_curated_reference_manifest_child()
    from public, anon, authenticated;
revoke all on function kp_migration.approve_curated_reference_document_manifest(uuid, text, uuid)
    from public, anon, authenticated;
revoke all on function kp_migration.apply_curated_reference_document_unit(uuid, text)
    from public, anon, authenticated;
revoke all on function kp_migration.confirm_empty_curated_reference_manifest(uuid, uuid)
    from public, anon, authenticated;
revoke all on function kp_migration.reconcile_curated_reference_documents(uuid)
    from public, anon, authenticated;

grant execute on function kp_migration.approve_curated_reference_document_manifest(uuid, text, uuid)
    to service_role;
grant execute on function kp_migration.apply_curated_reference_document_unit(uuid, text)
    to service_role;
grant execute on function kp_migration.confirm_empty_curated_reference_manifest(uuid, uuid)
    to service_role;
grant execute on function kp_migration.reconcile_curated_reference_documents(uuid)
    to service_role;

-- ─────────────────────────────────────────────────────────────────────────────
-- Fail closed on object shape, RLS, and browser denial; still no data execution
-- ─────────────────────────────────────────────────────────────────────────────

do $kp_curated_reference_assertions$
declare
    expected record;
    function_is_security_definer boolean;
    function_config text[];
begin
    for expected in
        select table_name
        from (values
            ('reference_document_manifest'),
            ('reference_document_alias_manifest'),
            ('summary_reference_document_manifest')
        ) as required(table_name)
    loop
        if not exists (
            select 1
            from pg_class c
            join pg_namespace n on n.oid = c.relnamespace
            where n.nspname = 'kp_migration'
              and c.relname = expected.table_name
              and c.relkind = 'r'
              and c.relrowsecurity
        ) then
            raise exception using
                errcode = 'check_violation',
                message = format('Knowledge Platform migration 050 drift: kp_migration.%I is missing or RLS-disabled.', expected.table_name);
        end if;

        if has_table_privilege('anon', 'kp_migration.' || expected.table_name, 'SELECT')
           or has_table_privilege('authenticated', 'kp_migration.' || expected.table_name, 'SELECT')
        then
            raise exception using
                errcode = 'check_violation',
                message = format('Knowledge Platform migration 050 drift: browser role can read kp_migration.%I.', expected.table_name);
        end if;
    end loop;

    for expected in
        select table_name, constraint_name
        from (values
            ('reference_document_manifest', 'kp_reference_document_manifest_pkey'),
            ('reference_document_manifest', 'kp_reference_document_manifest_run_fkey'),
            ('reference_document_manifest', 'kp_reference_document_manifest_run_document_id_key'),
            ('reference_document_manifest', 'kp_reference_document_manifest_run_document_code_key'),
            ('reference_document_manifest', 'kp_reference_document_manifest_run_version_id_key'),
            ('reference_document_manifest', 'kp_reference_document_manifest_required_text_check'),
            ('reference_document_manifest', 'kp_reference_document_manifest_lifecycle_check'),
            ('reference_document_manifest', 'kp_reference_document_manifest_effective_dates_check'),
            ('reference_document_manifest', 'kp_reference_document_manifest_storage_pair_check'),
            ('reference_document_manifest', 'kp_reference_document_manifest_storage_metadata_check'),
            ('reference_document_manifest', 'kp_reference_document_manifest_byte_size_check'),
            ('reference_document_manifest', 'kp_reference_document_manifest_state_check'),
            ('reference_document_manifest', 'kp_reference_document_manifest_approval_check'),
            ('reference_document_alias_manifest', 'kp_reference_document_alias_manifest_pkey'),
            ('reference_document_alias_manifest', 'kp_reference_document_alias_manifest_parent_fkey'),
            ('reference_document_alias_manifest', 'kp_reference_document_alias_manifest_run_alias_id_key'),
            ('reference_document_alias_manifest', 'kp_reference_document_alias_manifest_run_locator_key'),
            ('reference_document_alias_manifest', 'kp_reference_document_alias_manifest_type_check'),
            ('reference_document_alias_manifest', 'kp_reference_document_alias_manifest_text_check'),
            ('summary_reference_document_manifest', 'kp_summary_reference_document_manifest_pkey'),
            ('summary_reference_document_manifest', 'kp_summary_reference_document_manifest_parent_fkey'),
            ('summary_reference_document_manifest', 'kp_summary_reference_document_manifest_ledger_fkey'),
            ('summary_reference_document_manifest', 'kp_summary_reference_document_manifest_run_relationship_id_key'),
            ('summary_reference_document_manifest', 'kp_summary_reference_document_manifest_role_check'),
            ('summary_reference_document_manifest', 'kp_summary_reference_document_manifest_text_check')
        ) as required(table_name, constraint_name)
    loop
        if not exists (
            select 1
            from pg_constraint c
            join pg_class t on t.oid = c.conrelid
            join pg_namespace n on n.oid = t.relnamespace
            where n.nspname = 'kp_migration'
              and t.relname = expected.table_name
              and c.conname = expected.constraint_name
              and c.convalidated
        ) then
            raise exception using
                errcode = 'check_violation',
                message = format(
                    'Knowledge Platform migration 050 drift: constraint %I is missing from kp_migration.%I.',
                    expected.constraint_name,
                    expected.table_name
                );
        end if;
    end loop;

    for expected in
        select index_name
        from (values
            ('kp_reference_document_manifest_run_state_idx'),
            ('kp_reference_document_alias_manifest_parent_idx'),
            ('kp_summary_reference_document_manifest_unpinned_key'),
            ('kp_summary_reference_document_manifest_pinned_key')
        ) as required(index_name)
    loop
        if not exists (
            select 1
            from pg_class c
            join pg_namespace n on n.oid = c.relnamespace
            join pg_index i on i.indexrelid = c.oid
            where n.nspname = 'kp_migration'
              and c.relname = expected.index_name
              and i.indisvalid
              and i.indisready
        ) then
            raise exception using
                errcode = 'check_violation',
                message = format('Knowledge Platform migration 050 drift: index kp_migration.%I is missing or invalid.', expected.index_name);
        end if;
    end loop;

    for expected in
        select table_name, trigger_name
        from (values
            ('reference_document_manifest', 'guard_curated_reference_manifest'),
            ('reference_document_manifest', 'handle_updated_at_kp_reference_document_manifest'),
            ('reference_document_alias_manifest', 'guard_curated_reference_alias_manifest'),
            ('summary_reference_document_manifest', 'guard_curated_summary_reference_manifest')
        ) as required(table_name, trigger_name)
    loop
        if not exists (
            select 1
            from pg_trigger trigger_row
            join pg_class table_row on table_row.oid = trigger_row.tgrelid
            join pg_namespace n on n.oid = table_row.relnamespace
            where n.nspname = 'kp_migration'
              and table_row.relname = expected.table_name
              and trigger_row.tgname = expected.trigger_name
              and not trigger_row.tgisinternal
              and trigger_row.tgenabled <> 'D'
        ) then
            raise exception using
                errcode = 'check_violation',
                message = format(
                    'Knowledge Platform migration 050 drift: trigger %I is missing from kp_migration.%I.',
                    expected.trigger_name,
                    expected.table_name
                );
        end if;
    end loop;

    for expected in
        select signature
        from (values
            ('kp_migration.approve_curated_reference_document_manifest(uuid,text,uuid)'),
            ('kp_migration.apply_curated_reference_document_unit(uuid,text)'),
            ('kp_migration.confirm_empty_curated_reference_manifest(uuid,uuid)'),
            ('kp_migration.reconcile_curated_reference_documents(uuid)')
        ) as required(signature)
    loop
        if to_regprocedure(expected.signature) is null
           or has_function_privilege('anon', expected.signature, 'EXECUTE')
           or has_function_privilege('authenticated', expected.signature, 'EXECUTE')
           or not has_function_privilege('service_role', expected.signature, 'EXECUTE')
        then
            raise exception using
                errcode = 'check_violation',
                message = format('Knowledge Platform migration 050 drift: helper %s has incompatible existence or grants.', expected.signature);
        end if;
    end loop;

    for expected in
        select signature, require_lock_timeout
        from (values
            ('kp_migration.approve_curated_reference_document_manifest(uuid,text,uuid)', true),
            ('kp_migration.apply_curated_reference_document_unit(uuid,text)', true),
            ('kp_migration.confirm_empty_curated_reference_manifest(uuid,uuid)', true),
            ('kp_migration.reconcile_curated_reference_documents(uuid)', false)
        ) as required(signature, require_lock_timeout)
    loop
        select p.prosecdef, p.proconfig
        into function_is_security_definer, function_config
        from pg_proc p
        where p.oid = expected.signature::regprocedure;

        if not function_is_security_definer
           or function_config is null
           or not ('search_path=pg_catalog, public, kp_migration, pg_temp' = any(function_config))
           or (
               expected.require_lock_timeout
               and not ('lock_timeout=5s' = any(function_config))
           )
        then
            raise exception using
                errcode = 'check_violation',
                message = format('Knowledge Platform migration 050 drift: helper %s has incompatible security configuration.', expected.signature);
        end if;
    end loop;

    if exists (
        select 1
        from pg_policies p
        where p.schemaname = 'kp_migration'
          and p.tablename in (
              'reference_document_manifest',
              'reference_document_alias_manifest',
              'summary_reference_document_manifest'
          )
    ) then
        raise exception using
            errcode = 'check_violation',
            message = 'Knowledge Platform migration 050 drift: private manifest tables must not expose RLS policies.';
    end if;
end
$kp_curated_reference_assertions$;
