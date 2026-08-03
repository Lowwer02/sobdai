-- 051_kp_backfill_initial_summary_versions.sql
-- Sobdai Knowledge Platform — reconciled frozen Migration 049 responsibility.
--
-- Migration-number audit
-- ----------------------
-- Production migration 050_kp_backfill_reference_documents_curated.sql
-- implemented the frozen migration 048 responsibility. Production 050 is
-- committed and is the current repository maximum, so 051 is next.
--
-- Purpose
-- -------
-- Install the private manifest, source-snapshot preparation, approval,
-- one-Summary execution, reconciliation, and safety controls for initial
-- SummaryVersion revision 1 backfill.
--
-- Deployment boundary
-- -------------------
-- Deployment creates empty migration-control objects and helper functions only.
-- It does not invoke a helper, insert SummaryVersions or source snapshots,
-- update Summary rows or pointers, insert ReferenceDocuments, or execute any
-- production backfill. Legacy Markdown and publication fields remain authority.

set local lock_timeout = '5s';

-- ─────────────────────────────────────────────────────────────────────────────
-- Fail closed on frozen dependencies 036, 043, 044, 049, and 050
-- ─────────────────────────────────────────────────────────────────────────────

do $kp_initial_versions_preflight$
declare
    expected record;
begin
    for expected in
        select object_name
        from (values
            ('public.profiles'),
            ('public.summaries'),
            ('public.summary_versions'),
            ('public.summary_reference_documents'),
            ('public.summary_version_reference_documents'),
            ('kp_migration.migration_runs'),
            ('kp_migration.summary_ledger'),
            ('kp_migration.batch_progress'),
            ('kp_migration.reference_document_manifest')
        ) as required(object_name)
    loop
        if to_regclass(expected.object_name) is null then
            raise exception using
                errcode = 'check_violation',
                message = format('Knowledge Platform migration 051 prerequisite %s is missing.', expected.object_name);
        end if;
    end loop;

    if to_regprocedure('kp_migration.backfill_summary_identity_unit(uuid,uuid)') is null
       or to_regprocedure('kp_migration.reconcile_curated_reference_documents(uuid)') is null
       or to_regprocedure('public.protect_summary_version_reference_document()') is null
    then
        raise exception using
            errcode = 'check_violation',
            message = 'Knowledge Platform migration 051 requires migrations 044, 049, and 050 helpers.';
    end if;

    for expected in
        select index_name
        from (values
            ('summary_versions_parent_revision_key'),
            ('summary_versions_parent_id_key'),
            ('summary_versions_one_open_revision_key'),
            ('summary_versions_checksum_idx'),
            ('summary_version_reference_documents_unpinned_key'),
            ('summary_version_reference_documents_pinned_key')
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
                message = format('Knowledge Platform migration 051 requires valid predecessor index %I.', expected.index_name);
        end if;
    end loop;
end
$kp_initial_versions_preflight$;

-- ─────────────────────────────────────────────────────────────────────────────
-- Private revision and immutable-source-snapshot manifests
-- ─────────────────────────────────────────────────────────────────────────────

create table if not exists kp_migration.summary_version_manifest (
    migration_run_id uuid not null,
    source_summary_id uuid not null,
    target_revision_id uuid not null,

    source_updated_at timestamptz not null,
    source_content_bytes bigint not null,
    source_content_checksum text not null,
    checksum_algorithm text not null,
    legacy_is_published boolean not null,
    legacy_read_time_minutes integer not null,

    mapping_status text not null,
    quarantine_reason text,
    target_content_checksum text not null,
    read_time_minutes integer not null,
    read_time_policy_version text not null,
    content_schema_version text not null,
    change_note text not null,

    seo_title text,
    seo_description text,
    social_image_bucket text,
    social_image_path text,

    migration_actor_id uuid not null,
    synthetic_published_at timestamptz,
    publication_timestamp_source text,

    state text not null default 'preparing',
    approved_by uuid,
    approved_at timestamptz,
    applied_at timestamptz,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),

    constraint kp_summary_version_manifest_pkey
        primary key (migration_run_id, source_summary_id),
    constraint kp_summary_version_manifest_run_fkey
        foreign key (migration_run_id)
        references kp_migration.migration_runs(id) on delete restrict,
    constraint kp_summary_version_manifest_ledger_fkey
        foreign key (migration_run_id, source_summary_id)
        references kp_migration.summary_ledger(migration_run_id, source_summary_id)
        on delete restrict,
    constraint kp_summary_version_manifest_revision_key
        unique (target_revision_id),
    constraint kp_summary_version_manifest_mapping_status_check check (
        mapping_status in ('draft', 'published', 'quarantined')
    ),
    constraint kp_summary_version_manifest_source_check check (
        source_content_bytes >= 0
        and btrim(source_content_checksum) <> ''
        and btrim(checksum_algorithm) <> ''
        and legacy_read_time_minutes > 0
    ),
    constraint kp_summary_version_manifest_target_check check (
        btrim(target_content_checksum) <> ''
        and read_time_minutes > 0
        and btrim(read_time_policy_version) <> ''
        and btrim(content_schema_version) <> ''
        and btrim(change_note) <> ''
        and (seo_title is null or btrim(seo_title) <> '')
        and (seo_description is null or btrim(seo_description) <> '')
        and (social_image_bucket is null or btrim(social_image_bucket) <> '')
        and (social_image_path is null or btrim(social_image_path) <> '')
        and (
            (social_image_bucket is null and social_image_path is null)
            or (social_image_bucket is not null and social_image_path is not null)
        )
    ),
    constraint kp_summary_version_manifest_mapping_check check (
        (
            mapping_status = 'published'
            and legacy_is_published
            and quarantine_reason is null
            and synthetic_published_at is not null
            and publication_timestamp_source is not null
            and btrim(publication_timestamp_source) <> ''
        )
        or (
            mapping_status = 'draft'
            and not legacy_is_published
            and quarantine_reason is null
            and synthetic_published_at is null
            and publication_timestamp_source is null
        )
        or (
            mapping_status = 'quarantined'
            and legacy_is_published
            and quarantine_reason is not null
            and btrim(quarantine_reason) <> ''
            and synthetic_published_at is null
            and publication_timestamp_source is null
        )
    ),
    constraint kp_summary_version_manifest_state_check check (
        state in ('preparing', 'approved', 'applied')
    ),
    constraint kp_summary_version_manifest_approval_check check (
        (state = 'preparing' and approved_by is null and approved_at is null and applied_at is null)
        or (state = 'approved' and approved_by is not null and approved_at is not null and applied_at is null)
        or (state = 'applied' and approved_by is not null and approved_at is not null and applied_at is not null)
    )
);

comment on table kp_migration.summary_version_manifest is
    'Private deterministic revision-1 manifest. It records approved checksum/read-time/schema policies and synthetic publication evidence without becoming content authority.';

create table if not exists kp_migration.summary_version_source_manifest (
    migration_run_id uuid not null,
    source_summary_id uuid not null,
    snapshot_id uuid not null,
    reference_document_id uuid not null,
    reference_document_version_id uuid,
    role text not null,
    coverage_note text,
    sort_order integer not null default 0,

    constraint kp_summary_version_source_manifest_pkey
        primary key (migration_run_id, source_summary_id, snapshot_id),
    constraint kp_summary_version_source_manifest_parent_fkey
        foreign key (migration_run_id, source_summary_id)
        references kp_migration.summary_version_manifest(migration_run_id, source_summary_id)
        on delete restrict,
    constraint kp_summary_version_source_manifest_snapshot_key
        unique (snapshot_id),
    constraint kp_summary_version_source_manifest_role_check check (
        role in ('primary', 'supporting')
    ),
    constraint kp_summary_version_source_manifest_coverage_check check (
        coverage_note is null or btrim(coverage_note) <> ''
    )
);

comment on table kp_migration.summary_version_source_manifest is
    'Frozen source rows to insert with revision 1 before a migrated publication becomes immutable.';

create index if not exists kp_summary_version_manifest_run_state_idx
    on kp_migration.summary_version_manifest (migration_run_id, state, source_summary_id);

create index if not exists kp_summary_version_manifest_target_revision_idx
    on kp_migration.summary_version_manifest (target_revision_id);

create unique index if not exists kp_summary_version_source_manifest_unpinned_key
    on kp_migration.summary_version_source_manifest (
        migration_run_id, source_summary_id, reference_document_id
    ) where reference_document_version_id is null;

create unique index if not exists kp_summary_version_source_manifest_pinned_key
    on kp_migration.summary_version_source_manifest (
        migration_run_id, source_summary_id,
        reference_document_id, reference_document_version_id
    ) where reference_document_version_id is not null;

-- ─────────────────────────────────────────────────────────────────────────────
-- Manifest lifecycle protection
-- ─────────────────────────────────────────────────────────────────────────────

create or replace function kp_migration.guard_initial_summary_version_manifest()
returns trigger
language plpgsql
set search_path = pg_catalog, kp_migration, pg_temp
as $function$
begin
    if tg_op = 'DELETE' then
        if old.state <> 'preparing' then
            raise exception 'approved initial SummaryVersion manifests are retained'
                using errcode = 'check_violation';
        end if;
        return old;
    end if;

    if old.state = 'preparing' and new.state in ('preparing', 'approved') then
        return new;
    end if;

    if old.state = 'approved'
       and new.state = 'applied'
       and (to_jsonb(new) - array['state', 'applied_at', 'updated_at'])
           = (to_jsonb(old) - array['state', 'applied_at', 'updated_at'])
    then
        return new;
    end if;

    raise exception 'approved or applied initial SummaryVersion manifest content is immutable'
        using errcode = 'check_violation';
end
$function$;

create or replace function kp_migration.guard_initial_summary_version_source_manifest()
returns trigger
language plpgsql
set search_path = pg_catalog, kp_migration, pg_temp
as $function$
declare
    v_run_id uuid := case when tg_op = 'DELETE' then old.migration_run_id else new.migration_run_id end;
    v_summary_id uuid := case when tg_op = 'DELETE' then old.source_summary_id else new.source_summary_id end;
    v_state text;
begin
    select m.state into v_state
    from kp_migration.summary_version_manifest m
    where m.migration_run_id = v_run_id
      and m.source_summary_id = v_summary_id
    for share;

    if v_state is distinct from 'preparing' then
        raise exception 'initial SummaryVersion source manifest is immutable after approval'
            using errcode = 'check_violation';
    end if;

    if tg_op = 'DELETE' then
        return old;
    end if;
    return new;
end
$function$;

drop trigger if exists guard_initial_summary_version_manifest
    on kp_migration.summary_version_manifest;
create trigger guard_initial_summary_version_manifest
    before update or delete on kp_migration.summary_version_manifest
    for each row execute function kp_migration.guard_initial_summary_version_manifest();

drop trigger if exists handle_updated_at_kp_summary_version_manifest
    on kp_migration.summary_version_manifest;
create trigger handle_updated_at_kp_summary_version_manifest
    before update on kp_migration.summary_version_manifest
    for each row execute procedure public.handle_updated_at();

drop trigger if exists guard_initial_summary_version_source_manifest
    on kp_migration.summary_version_source_manifest;
create trigger guard_initial_summary_version_source_manifest
    before insert or update or delete on kp_migration.summary_version_source_manifest
    for each row execute function kp_migration.guard_initial_summary_version_source_manifest();

-- ─────────────────────────────────────────────────────────────────────────────
-- Refresh source snapshots from already reviewed live relationships
-- Manifest-only operation; never inserts domain snapshots
-- ─────────────────────────────────────────────────────────────────────────────

create or replace function kp_migration.refresh_initial_summary_version_sources(
    p_migration_run_id uuid,
    p_source_summary_id uuid
)
returns integer
language plpgsql
security definer
set search_path = pg_catalog, public, kp_migration, pg_temp
set lock_timeout = '5s'
as $function$
declare
    v_state text;
    v_count integer;
begin
    select m.state into v_state
    from kp_migration.summary_version_manifest m
    where m.migration_run_id = p_migration_run_id
      and m.source_summary_id = p_source_summary_id
    for update;

    if v_state is distinct from 'preparing' then
        raise exception 'source snapshots can be refreshed only while the revision manifest is preparing'
            using errcode = 'object_not_in_prerequisite_state';
    end if;

    delete from kp_migration.summary_version_source_manifest
    where migration_run_id = p_migration_run_id
      and source_summary_id = p_source_summary_id;

    insert into kp_migration.summary_version_source_manifest (
        migration_run_id, source_summary_id, snapshot_id,
        reference_document_id, reference_document_version_id,
        role, coverage_note, sort_order
    )
    select
        p_migration_run_id,
        p_source_summary_id,
        uuid_generate_v4(),
        r.reference_document_id,
        r.reference_document_version_id,
        r.role,
        r.coverage_note,
        r.sort_order
    from public.summary_reference_documents r
    where r.summary_id = p_source_summary_id
    order by r.sort_order, r.id;

    get diagnostics v_count = row_count;
    return v_count;
end
$function$;

-- ─────────────────────────────────────────────────────────────────────────────
-- Approval freezes checksum policy, state mapping, provenance, and snapshots
-- ─────────────────────────────────────────────────────────────────────────────

create or replace function kp_migration.approve_initial_summary_version_manifest(
    p_migration_run_id uuid,
    p_source_summary_id uuid,
    p_approved_by uuid
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public, kp_migration, pg_temp
set lock_timeout = '5s'
as $function$
declare
    v_manifest kp_migration.summary_version_manifest%rowtype;
    v_run kp_migration.migration_runs%rowtype;
    v_ledger kp_migration.summary_ledger%rowtype;
    v_summary public.summaries%rowtype;
begin
    select r.* into v_run
    from kp_migration.migration_runs r
    where r.id = p_migration_run_id
      and r.status in ('preparing', 'running')
    for share;

    if not found or not exists (select 1 from public.profiles p where p.id = p_approved_by) then
        raise exception 'initial SummaryVersion approval requires a valid run and approver'
            using errcode = 'object_not_in_prerequisite_state';
    end if;

    select m.* into v_manifest
    from kp_migration.summary_version_manifest m
    where m.migration_run_id = p_migration_run_id
      and m.source_summary_id = p_source_summary_id
    for update;

    if not found or v_manifest.state <> 'preparing' then
        raise exception 'initial SummaryVersion manifest must exist in preparing state'
            using errcode = 'object_not_in_prerequisite_state';
    end if;

    select l.* into v_ledger
    from kp_migration.summary_ledger l
    where l.migration_run_id = p_migration_run_id
      and l.source_summary_id = p_source_summary_id
    for update;

    select s.* into v_summary
    from public.summaries s
    where s.id = p_source_summary_id
    for share;

    if v_ledger.target_summary_id is distinct from v_summary.id
       or v_summary.summary_code is null
       or v_summary.canonical_slug is null
       or v_summary.current_published_version_id is not null
       or v_summary.updated_at is distinct from v_manifest.source_updated_at
       or octet_length(v_summary.content_md) is distinct from v_manifest.source_content_bytes
       or v_summary.is_published is distinct from v_manifest.legacy_is_published
       or v_summary.read_time_minutes is distinct from v_manifest.legacy_read_time_minutes
       or v_ledger.source_updated_at is distinct from v_manifest.source_updated_at
       or v_ledger.source_content_bytes is distinct from v_manifest.source_content_bytes
       or v_ledger.source_content_checksum is distinct from v_manifest.source_content_checksum
       or v_manifest.target_content_checksum is distinct from v_manifest.source_content_checksum
    then
        raise exception 'initial SummaryVersion manifest does not match frozen Summary/ledger source evidence'
            using errcode = 'serialization_failure';
    end if;

    if v_manifest.checksum_algorithm <> v_run.markdown_checksum_algorithm
       or v_manifest.read_time_policy_version is distinct from v_run.metadata ->> 'read_time_policy_version'
       or v_manifest.content_schema_version is distinct from v_run.metadata ->> 'content_schema_version'
       or (
           v_manifest.mapping_status = 'published'
           and v_manifest.publication_timestamp_source
               is distinct from v_run.metadata ->> 'synthetic_publication_timestamp_source'
       )
    then
        raise exception 'initial SummaryVersion manifest policy identifiers do not match the approved migration run'
            using errcode = 'check_violation';
    end if;

    if not exists (select 1 from public.profiles p where p.id = v_manifest.migration_actor_id) then
        raise exception 'initial SummaryVersion migration actor does not exist'
            using errcode = 'foreign_key_violation';
    end if;

    if (not v_summary.is_published and v_manifest.mapping_status <> 'draft')
       or (v_summary.is_published and v_manifest.mapping_status not in ('published', 'quarantined'))
       or (
           v_summary.is_published
           and v_manifest.mapping_status = 'published'
           and btrim(v_summary.content_md) = ''
       )
    then
        raise exception 'initial SummaryVersion state mapping violates the frozen publication truth table'
            using errcode = 'check_violation';
    end if;

    if exists (
        select 1
        from public.summary_versions v
        where v.id = v_manifest.target_revision_id
           or (v.summary_id = p_source_summary_id and v.revision_number = 1)
    ) then
        raise exception 'initial SummaryVersion target revision already exists'
            using errcode = 'unique_violation';
    end if;

    if exists (
        (
            select r.reference_document_id, r.reference_document_version_id,
                   r.role, r.coverage_note, r.sort_order
            from public.summary_reference_documents r
            where r.summary_id = p_source_summary_id
        )
        except
        (
            select s.reference_document_id, s.reference_document_version_id,
                   s.role, s.coverage_note, s.sort_order
            from kp_migration.summary_version_source_manifest s
            where s.migration_run_id = p_migration_run_id
              and s.source_summary_id = p_source_summary_id
        )
    ) or exists (
        (
            select s.reference_document_id, s.reference_document_version_id,
                   s.role, s.coverage_note, s.sort_order
            from kp_migration.summary_version_source_manifest s
            where s.migration_run_id = p_migration_run_id
              and s.source_summary_id = p_source_summary_id
        )
        except
        (
            select r.reference_document_id, r.reference_document_version_id,
                   r.role, r.coverage_note, r.sort_order
            from public.summary_reference_documents r
            where r.summary_id = p_source_summary_id
        )
    ) then
        raise exception 'initial SummaryVersion source manifest differs from reviewed live relationships'
            using errcode = 'serialization_failure';
    end if;

    if exists (
        select 1
        from kp_migration.summary_version_source_manifest s
        left join public.reference_documents d on d.id = s.reference_document_id
        left join public.reference_document_versions v
          on v.reference_document_id = s.reference_document_id
         and v.id = s.reference_document_version_id
        where s.migration_run_id = p_migration_run_id
          and s.source_summary_id = p_source_summary_id
          and (
              d.id is null
              or (
                  s.reference_document_version_id is not null
                  and (v.id is null or v.status not in ('verified', 'superseded'))
              )
          )
    ) then
        raise exception 'initial SummaryVersion source manifest contains an unavailable or unaccepted source'
            using errcode = 'check_violation';
    end if;

    update kp_migration.summary_version_manifest
    set state = 'approved', approved_by = p_approved_by, approved_at = clock_timestamp()
    where migration_run_id = p_migration_run_id
      and source_summary_id = p_source_summary_id;

    update kp_migration.summary_ledger
    set target_revision_id = v_manifest.target_revision_id,
        provenance = jsonb_set(
            provenance,
            '{initial_summary_version_manifest}',
            jsonb_build_object(
                'migration', 51,
                'frozen_responsibility', 49,
                'mapping_status', v_manifest.mapping_status,
                'approved_by', p_approved_by,
                'checksum_algorithm', v_manifest.checksum_algorithm,
                'read_time_policy_version', v_manifest.read_time_policy_version,
                'content_schema_version', v_manifest.content_schema_version
            ),
            true
        )
    where migration_run_id = p_migration_run_id
      and source_summary_id = p_source_summary_id;

    return v_manifest.target_revision_id;
end
$function$;

-- ─────────────────────────────────────────────────────────────────────────────
-- Controlled one-Summary execution unit — defined only, never invoked here
-- ─────────────────────────────────────────────────────────────────────────────

create or replace function kp_migration.apply_initial_summary_version_unit(
    p_migration_run_id uuid,
    p_source_summary_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public, kp_migration, pg_temp
set lock_timeout = '5s'
as $function$
declare
    v_manifest kp_migration.summary_version_manifest%rowtype;
    v_ledger kp_migration.summary_ledger%rowtype;
    v_summary public.summaries%rowtype;
    v_snapshot kp_migration.summary_version_source_manifest%rowtype;
    v_now timestamptz := clock_timestamp();
    v_remaining bigint;
    v_initial_status text;
begin
    if not exists (
        select 1 from kp_migration.migration_runs r
        where r.id = p_migration_run_id and r.status = 'running'
    ) then
        raise exception 'initial SummaryVersion application requires a running migration run'
            using errcode = 'object_not_in_prerequisite_state';
    end if;

    select m.* into v_manifest
    from kp_migration.summary_version_manifest m
    where m.migration_run_id = p_migration_run_id
      and m.source_summary_id = p_source_summary_id
    for update;

    if not found then
        raise exception 'initial SummaryVersion manifest does not exist'
            using errcode = 'foreign_key_violation';
    end if;
    if v_manifest.state = 'applied' then
        return v_manifest.target_revision_id;
    end if;
    if v_manifest.state <> 'approved' then
        raise exception 'initial SummaryVersion manifest must be approved before application'
            using errcode = 'object_not_in_prerequisite_state';
    end if;

    select l.* into v_ledger
    from kp_migration.summary_ledger l
    where l.migration_run_id = p_migration_run_id
      and l.source_summary_id = p_source_summary_id
    for update;

    select s.* into v_summary
    from public.summaries s
    where s.id = p_source_summary_id
    for share;

    if v_summary.updated_at is distinct from v_manifest.source_updated_at
       or octet_length(v_summary.content_md) is distinct from v_manifest.source_content_bytes
       or v_summary.is_published is distinct from v_manifest.legacy_is_published
       or v_summary.read_time_minutes is distinct from v_manifest.legacy_read_time_minutes
       or v_summary.current_published_version_id is not null
       or v_ledger.source_content_checksum is distinct from v_manifest.source_content_checksum
       or v_ledger.target_revision_id is distinct from v_manifest.target_revision_id
    then
        raise exception 'initial SummaryVersion source evidence changed after approval'
            using errcode = 'serialization_failure';
    end if;

    if exists (
        (
            select r.reference_document_id, r.reference_document_version_id,
                   r.role, r.coverage_note, r.sort_order
            from public.summary_reference_documents r
            where r.summary_id = p_source_summary_id
        )
        except
        (
            select s.reference_document_id, s.reference_document_version_id,
                   s.role, s.coverage_note, s.sort_order
            from kp_migration.summary_version_source_manifest s
            where s.migration_run_id = p_migration_run_id
              and s.source_summary_id = p_source_summary_id
        )
    ) or exists (
        (
            select s.reference_document_id, s.reference_document_version_id,
                   s.role, s.coverage_note, s.sort_order
            from kp_migration.summary_version_source_manifest s
            where s.migration_run_id = p_migration_run_id
              and s.source_summary_id = p_source_summary_id
        )
        except
        (
            select r.reference_document_id, r.reference_document_version_id,
                   r.role, r.coverage_note, r.sort_order
            from public.summary_reference_documents r
            where r.summary_id = p_source_summary_id
        )
    ) then
        raise exception 'initial SummaryVersion source relationships changed after approval'
            using errcode = 'serialization_failure';
    end if;

    if exists (
        select 1
        from kp_migration.summary_version_source_manifest s
        left join public.reference_documents d on d.id = s.reference_document_id
        left join public.reference_document_versions v
          on v.reference_document_id = s.reference_document_id
         and v.id = s.reference_document_version_id
        where s.migration_run_id = p_migration_run_id
          and s.source_summary_id = p_source_summary_id
          and (
              d.id is null
              or (
                  s.reference_document_version_id is not null
                  and (v.id is null or v.status not in ('verified', 'superseded'))
              )
          )
    ) then
        raise exception 'initial SummaryVersion approved source is no longer available and accepted'
            using errcode = 'serialization_failure';
    end if;

    v_initial_status := case
        when v_manifest.mapping_status = 'published' then 'in_review'
        else 'draft'
    end;

    insert into public.summary_versions (
        id, summary_id, revision_number, status,
        content_md, content_checksum,
        title_snapshot, subject_snapshot, topic_snapshot, law_snapshot,
        seo_title, seo_description, social_image_bucket, social_image_path,
        read_time_minutes, read_time_policy_version,
        content_schema_version, change_note,
        authored_by, created_at, updated_at,
        submitted_for_review_at, reviewed_by, reviewed_at,
        published_by, published_at
    ) values (
        v_manifest.target_revision_id,
        v_summary.id,
        1,
        v_initial_status,
        case when btrim(v_summary.content_md) = '' then null else v_summary.content_md end,
        case when btrim(v_summary.content_md) = '' then null else v_manifest.target_content_checksum end,
        v_summary.canonical_title,
        v_summary.subject,
        v_summary.topic,
        v_summary.law,
        v_manifest.seo_title,
        v_manifest.seo_description,
        v_manifest.social_image_bucket,
        v_manifest.social_image_path,
        v_manifest.read_time_minutes,
        v_manifest.read_time_policy_version,
        v_manifest.content_schema_version,
        v_manifest.change_note,
        v_manifest.migration_actor_id,
        v_summary.created_at,
        v_summary.created_at,
        case when v_manifest.mapping_status = 'published' then v_manifest.synthetic_published_at else null end,
        case when v_manifest.mapping_status = 'published' then v_manifest.migration_actor_id else null end,
        case when v_manifest.mapping_status = 'published' then v_manifest.synthetic_published_at else null end,
        null,
        null
    );

    for v_snapshot in
        select s.*
        from kp_migration.summary_version_source_manifest s
        where s.migration_run_id = p_migration_run_id
          and s.source_summary_id = p_source_summary_id
        order by s.sort_order, s.snapshot_id
    loop
        insert into public.summary_version_reference_documents (
            id, summary_version_id, reference_document_id,
            reference_document_version_id, role, coverage_note, sort_order
        ) values (
            v_snapshot.snapshot_id,
            v_manifest.target_revision_id,
            v_snapshot.reference_document_id,
            v_snapshot.reference_document_version_id,
            v_snapshot.role,
            v_snapshot.coverage_note,
            v_snapshot.sort_order
        );
    end loop;

    if v_manifest.mapping_status = 'published' then
        update public.summary_versions
        set status = 'published',
            published_by = v_manifest.migration_actor_id,
            published_at = v_manifest.synthetic_published_at
        where id = v_manifest.target_revision_id;
    end if;

    update kp_migration.summary_ledger
    set target_revision_id = v_manifest.target_revision_id,
        target_content_checksum = case
            when btrim(v_summary.content_md) = '' then null
            else v_manifest.target_content_checksum
        end,
        state = 'in_progress',
        attempt_count = attempt_count + 1,
        last_attempted_at = v_now,
        error_code = case when v_manifest.mapping_status = 'quarantined' then 'QUARANTINED_CONTENT' else null end,
        error_message = case when v_manifest.mapping_status = 'quarantined' then v_manifest.quarantine_reason else null end,
        provenance = jsonb_set(
            provenance,
            '{initial_summary_version}',
            jsonb_build_object(
                'migration', 51,
                'frozen_responsibility', 49,
                'revision_id', v_manifest.target_revision_id,
                'mapping_status', v_manifest.mapping_status,
                'quarantine_reason', v_manifest.quarantine_reason,
                'source_content_checksum', v_manifest.source_content_checksum,
                'target_content_checksum', v_manifest.target_content_checksum,
                'checksum_algorithm', v_manifest.checksum_algorithm,
                'legacy_read_time_minutes', v_manifest.legacy_read_time_minutes,
                'read_time_minutes', v_manifest.read_time_minutes,
                'read_time_policy_version', v_manifest.read_time_policy_version,
                'content_schema_version', v_manifest.content_schema_version,
                'synthetic_publication', v_manifest.mapping_status = 'published',
                'publication_timestamp_source', v_manifest.publication_timestamp_source,
                'applied_at', v_now
            ),
            true
        )
    where migration_run_id = p_migration_run_id
      and source_summary_id = p_source_summary_id;

    update kp_migration.summary_version_manifest
    set state = 'applied', applied_at = v_now
    where migration_run_id = p_migration_run_id
      and source_summary_id = p_source_summary_id;

    select count(*) into v_remaining
    from kp_migration.summary_version_manifest m
    where m.migration_run_id = p_migration_run_id
      and m.state <> 'applied';

    insert into kp_migration.batch_progress (
        migration_run_id, batch_key, state, last_source_summary_id,
        source_updated_watermark,
        processed_count, succeeded_count, failed_count, skipped_count,
        started_at, heartbeat_at, completed_at
    ) values (
        p_migration_run_id,
        'initial_summary_versions',
        case when v_remaining = 0 then 'completed' else 'running' end,
        p_source_summary_id,
        v_manifest.source_updated_at,
        1, 1, 0, 0,
        v_now, v_now,
        case when v_remaining = 0 then v_now else null end
    )
    on conflict (migration_run_id, batch_key) do update
    set state = excluded.state,
        last_source_summary_id = excluded.last_source_summary_id,
        source_updated_watermark = greatest(
            kp_migration.batch_progress.source_updated_watermark,
            excluded.source_updated_watermark
        ),
        processed_count = kp_migration.batch_progress.processed_count + 1,
        succeeded_count = kp_migration.batch_progress.succeeded_count + 1,
        started_at = coalesce(kp_migration.batch_progress.started_at, excluded.started_at),
        heartbeat_at = excluded.heartbeat_at,
        completed_at = excluded.completed_at,
        error_message = null;

    return v_manifest.target_revision_id;
end
$function$;

-- Read-only manifest/target reconciliation; never repairs data.
create or replace function kp_migration.reconcile_initial_summary_versions(
    p_migration_run_id uuid
)
returns table (
    manifest_total bigint,
    preparing_total bigint,
    approved_total bigint,
    applied_total bigint,
    published_total bigint,
    draft_total bigint,
    quarantined_total bigint,
    target_revision_total bigint,
    target_snapshot_total bigint,
    mismatch_total bigint
)
language sql
stable
security definer
set search_path = pg_catalog, public, kp_migration, pg_temp
as $function$
    with manifest as (
        select m.*
        from kp_migration.summary_version_manifest m
        where m.migration_run_id = p_migration_run_id
    ), snapshots as (
        select s.*
        from kp_migration.summary_version_source_manifest s
        where s.migration_run_id = p_migration_run_id
    )
    select
        (select count(*) from manifest),
        (select count(*) from manifest where state = 'preparing'),
        (select count(*) from manifest where state = 'approved'),
        (select count(*) from manifest where state = 'applied'),
        (select count(*) from manifest where mapping_status = 'published'),
        (select count(*) from manifest where mapping_status = 'draft'),
        (select count(*) from manifest where mapping_status = 'quarantined'),
        (select count(*) from manifest m join public.summary_versions v on v.id = m.target_revision_id),
        (select count(*) from snapshots s join public.summary_version_reference_documents target on target.id = s.snapshot_id),
        (
            select count(*)
            from manifest m
            where m.state = 'applied'
              and (
                  not exists (
                      select 1
                      from public.summary_versions v
                      join public.summaries root on root.id = m.source_summary_id
                      where v.id = m.target_revision_id
                        and v.summary_id = m.source_summary_id
                        and v.revision_number = 1
                        and v.status = case when m.mapping_status = 'published' then 'published' else 'draft' end
                        and v.content_md is not distinct from case
                            when btrim(root.content_md) = '' then null
                            else root.content_md
                        end
                        and v.content_checksum is not distinct from case
                            when btrim(root.content_md) = '' then null
                            else m.target_content_checksum
                        end
                        and v.title_snapshot is not distinct from root.canonical_title
                        and v.subject_snapshot is not distinct from root.subject
                        and v.topic_snapshot is not distinct from root.topic
                        and v.law_snapshot is not distinct from root.law
                        and v.seo_title is not distinct from m.seo_title
                        and v.seo_description is not distinct from m.seo_description
                        and v.social_image_bucket is not distinct from m.social_image_bucket
                        and v.social_image_path is not distinct from m.social_image_path
                        and v.read_time_minutes = m.read_time_minutes
                        and v.read_time_policy_version = m.read_time_policy_version
                        and v.content_schema_version = m.content_schema_version
                        and v.change_note = m.change_note
                        and v.authored_by = m.migration_actor_id
                        and v.submitted_for_review_at is not distinct from case
                            when m.mapping_status = 'published' then m.synthetic_published_at
                            else null
                        end
                        and v.reviewed_by is not distinct from case
                            when m.mapping_status = 'published' then m.migration_actor_id
                            else null
                        end
                        and v.reviewed_at is not distinct from case
                            when m.mapping_status = 'published' then m.synthetic_published_at
                            else null
                        end
                        and v.published_by is not distinct from case
                            when m.mapping_status = 'published' then m.migration_actor_id
                            else null
                        end
                        and v.published_at is not distinct from case
                            when m.mapping_status = 'published' then m.synthetic_published_at
                            else null
                        end
                  )
                  or exists (
                      select 1 from snapshots s
                      where s.source_summary_id = m.source_summary_id
                        and not exists (
                            select 1
                            from public.summary_version_reference_documents target
                            where target.id = s.snapshot_id
                              and target.summary_version_id = m.target_revision_id
                              and target.reference_document_id = s.reference_document_id
                              and target.reference_document_version_id is not distinct from s.reference_document_version_id
                              and target.role = s.role
                              and target.coverage_note is not distinct from s.coverage_note
                              and target.sort_order = s.sort_order
                        )
                  )
                  or exists (
                      select 1
                      from public.summary_version_reference_documents target
                      where target.summary_version_id = m.target_revision_id
                        and not exists (
                            select 1
                            from snapshots s
                            where s.source_summary_id = m.source_summary_id
                              and s.snapshot_id = target.id
                              and s.reference_document_id = target.reference_document_id
                              and s.reference_document_version_id is not distinct from target.reference_document_version_id
                              and s.role = target.role
                              and s.coverage_note is not distinct from target.coverage_note
                              and s.sort_order = target.sort_order
                        )
                  )
                  or not exists (
                      select 1
                      from kp_migration.summary_ledger l
                      join public.summaries root on root.id = m.source_summary_id
                      where l.migration_run_id = m.migration_run_id
                        and l.source_summary_id = m.source_summary_id
                        and l.target_revision_id = m.target_revision_id
                        and l.target_content_checksum is not distinct from case
                            when btrim(root.content_md) = '' then null
                            else m.target_content_checksum
                        end
                  )
                  or exists (
                      select 1
                      from public.summaries root
                      where root.id = m.source_summary_id
                        and root.current_published_version_id is not null
                  )
              )
        );
$function$;

comment on function kp_migration.refresh_initial_summary_version_sources(uuid, uuid) is
    'Refreshes only the preparing migration manifest from reviewed live source relationships; it creates no domain snapshot rows.';
comment on function kp_migration.approve_initial_summary_version_manifest(uuid, uuid, uuid) is
    'Freezes revision-1 checksum, state mapping, read-time/schema policy, synthetic publication evidence, and source snapshots.';
comment on function kp_migration.apply_initial_summary_version_unit(uuid, uuid) is
    'Controlled frozen migration 049 executor installed as production migration 051. One explicit call creates one revision and its source snapshots.';
comment on function kp_migration.reconcile_initial_summary_versions(uuid) is
    'Read-only initial SummaryVersion and immutable source-snapshot reconciliation evidence.';

-- ─────────────────────────────────────────────────────────────────────────────
-- Private service/operator access only
-- ─────────────────────────────────────────────────────────────────────────────

alter table kp_migration.summary_version_manifest enable row level security;
alter table kp_migration.summary_version_source_manifest enable row level security;

revoke all on table
    kp_migration.summary_version_manifest,
    kp_migration.summary_version_source_manifest
from public, anon, authenticated;

grant select, insert, update, delete on table
    kp_migration.summary_version_manifest,
    kp_migration.summary_version_source_manifest
to service_role;

revoke all on function kp_migration.guard_initial_summary_version_manifest()
    from public, anon, authenticated;
revoke all on function kp_migration.guard_initial_summary_version_source_manifest()
    from public, anon, authenticated;
revoke all on function kp_migration.refresh_initial_summary_version_sources(uuid, uuid)
    from public, anon, authenticated;
revoke all on function kp_migration.approve_initial_summary_version_manifest(uuid, uuid, uuid)
    from public, anon, authenticated;
revoke all on function kp_migration.apply_initial_summary_version_unit(uuid, uuid)
    from public, anon, authenticated;
revoke all on function kp_migration.reconcile_initial_summary_versions(uuid)
    from public, anon, authenticated;

grant execute on function kp_migration.refresh_initial_summary_version_sources(uuid, uuid)
    to service_role;
grant execute on function kp_migration.approve_initial_summary_version_manifest(uuid, uuid, uuid)
    to service_role;
grant execute on function kp_migration.apply_initial_summary_version_unit(uuid, uuid)
    to service_role;
grant execute on function kp_migration.reconcile_initial_summary_versions(uuid)
    to service_role;

-- ─────────────────────────────────────────────────────────────────────────────
-- Fail-closed post-validation; still no backfill invocation
-- ─────────────────────────────────────────────────────────────────────────────

do $kp_initial_versions_assertions$
declare
    expected record;
    function_is_security_definer boolean;
    function_config text[];
begin
    for expected in
        select table_name
        from (values
            ('summary_version_manifest'),
            ('summary_version_source_manifest')
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
        ) or has_table_privilege('anon', 'kp_migration.' || expected.table_name, 'SELECT')
           or has_table_privilege('authenticated', 'kp_migration.' || expected.table_name, 'SELECT')
        then
            raise exception using
                errcode = 'check_violation',
                message = format('Knowledge Platform migration 051 drift: manifest table kp_migration.%I is missing, exposed, or RLS-disabled.', expected.table_name);
        end if;
    end loop;

    for expected in
        select table_name, constraint_name
        from (values
            ('summary_version_manifest', 'kp_summary_version_manifest_pkey'),
            ('summary_version_manifest', 'kp_summary_version_manifest_run_fkey'),
            ('summary_version_manifest', 'kp_summary_version_manifest_ledger_fkey'),
            ('summary_version_manifest', 'kp_summary_version_manifest_revision_key'),
            ('summary_version_manifest', 'kp_summary_version_manifest_mapping_status_check'),
            ('summary_version_manifest', 'kp_summary_version_manifest_source_check'),
            ('summary_version_manifest', 'kp_summary_version_manifest_target_check'),
            ('summary_version_manifest', 'kp_summary_version_manifest_mapping_check'),
            ('summary_version_manifest', 'kp_summary_version_manifest_state_check'),
            ('summary_version_manifest', 'kp_summary_version_manifest_approval_check'),
            ('summary_version_source_manifest', 'kp_summary_version_source_manifest_pkey'),
            ('summary_version_source_manifest', 'kp_summary_version_source_manifest_parent_fkey'),
            ('summary_version_source_manifest', 'kp_summary_version_source_manifest_snapshot_key'),
            ('summary_version_source_manifest', 'kp_summary_version_source_manifest_role_check'),
            ('summary_version_source_manifest', 'kp_summary_version_source_manifest_coverage_check')
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
                    'Knowledge Platform migration 051 drift: constraint %I is missing from kp_migration.%I.',
                    expected.constraint_name,
                    expected.table_name
                );
        end if;
    end loop;

    for expected in
        select index_name
        from (values
            ('kp_summary_version_manifest_run_state_idx'),
            ('kp_summary_version_manifest_target_revision_idx'),
            ('kp_summary_version_source_manifest_unpinned_key'),
            ('kp_summary_version_source_manifest_pinned_key')
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
                message = format('Knowledge Platform migration 051 drift: index kp_migration.%I is missing or invalid.', expected.index_name);
        end if;
    end loop;

    for expected in
        select table_name, trigger_name
        from (values
            ('summary_version_manifest', 'guard_initial_summary_version_manifest'),
            ('summary_version_manifest', 'handle_updated_at_kp_summary_version_manifest'),
            ('summary_version_source_manifest', 'guard_initial_summary_version_source_manifest')
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
                    'Knowledge Platform migration 051 drift: trigger %I is missing from kp_migration.%I.',
                    expected.trigger_name,
                    expected.table_name
                );
        end if;
    end loop;

    for expected in
        select signature
        from (values
            ('kp_migration.refresh_initial_summary_version_sources(uuid,uuid)'),
            ('kp_migration.approve_initial_summary_version_manifest(uuid,uuid,uuid)'),
            ('kp_migration.apply_initial_summary_version_unit(uuid,uuid)'),
            ('kp_migration.reconcile_initial_summary_versions(uuid)')
        ) as required(signature)
    loop
        if to_regprocedure(expected.signature) is null
           or has_function_privilege('anon', expected.signature, 'EXECUTE')
           or has_function_privilege('authenticated', expected.signature, 'EXECUTE')
           or not has_function_privilege('service_role', expected.signature, 'EXECUTE')
        then
            raise exception using
                errcode = 'check_violation',
                message = format('Knowledge Platform migration 051 drift: helper %s has incompatible existence or grants.', expected.signature);
        end if;
    end loop;

    for expected in
        select signature, require_lock_timeout
        from (values
            ('kp_migration.refresh_initial_summary_version_sources(uuid,uuid)', true),
            ('kp_migration.approve_initial_summary_version_manifest(uuid,uuid,uuid)', true),
            ('kp_migration.apply_initial_summary_version_unit(uuid,uuid)', true),
            ('kp_migration.reconcile_initial_summary_versions(uuid)', false)
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
                message = format('Knowledge Platform migration 051 drift: helper %s has incompatible security configuration.', expected.signature);
        end if;
    end loop;

    if exists (
        select 1 from pg_policies p
        where p.schemaname = 'kp_migration'
          and p.tablename in ('summary_version_manifest', 'summary_version_source_manifest')
    ) then
        raise exception using
            errcode = 'check_violation',
            message = 'Knowledge Platform migration 051 drift: private manifest tables must not expose RLS policies.';
    end if;
end
$kp_initial_versions_assertions$;
