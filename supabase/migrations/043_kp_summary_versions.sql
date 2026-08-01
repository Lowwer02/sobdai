-- 043_kp_summary_versions.sql
-- Sobdai Knowledge Platform — SummaryVersion foundation.
--
-- The frozen SQL Migration Design assigned this responsibility to migration
-- 042. Production migration 041_news_gp_exam_requirement.sql shifted the first
-- Knowledge Layer migration to 042, so SummaryVersion uses the next available,
-- monotonically increasing production identity: 043.
--
-- Purpose
-- -------
-- Create revision-owned Summary Markdown, editorial lifecycle, immutable
-- publication evidence, and the same-parent current-version pointer structure.
--
-- Scope boundary
-- --------------
-- * Creates only public.summary_versions and its protections.
-- * Modifies public.summaries only to add the frozen deferred same-parent
--   current_published_version_id foreign key.
-- * Creates no Summary aliases, source relationships, PackageSummary objects,
--   backfill, publish command/RPC, read model, or application integration.
-- * Inserts no data and leaves the legacy Summary representation authoritative.
--
-- Safety / rollback
-- -----------------
-- The new table is empty and dormant. RLS is enabled with no policies and
-- browser grants are revoked. The only existing-table operation is a bounded,
-- NOT VALID pointer FK; deployment fails quickly rather than waiting on locks.

set local lock_timeout = '5s';

-- ─────────────────────────────────────────────────────────────────────────────
-- Fail closed on migration 042 dependency drift
-- ─────────────────────────────────────────────────────────────────────────────

do $kp_summary_versions_preflight$
declare
    expected_column text;
begin
    if to_regclass('public.summaries') is null then
        raise exception using
            errcode = 'check_violation',
            message = 'Knowledge Platform migration 043 requires public.summaries from migration 042.';
    end if;

    foreach expected_column in array array[
        'id',
        'current_published_version_id',
        'summary_code',
        'canonical_slug',
        'canonical_title',
        'visibility',
        'lifecycle_status',
        'created_by',
        'archived_by',
        'archived_at'
    ]
    loop
        if not exists (
            select 1
            from information_schema.columns c
            where c.table_schema = 'public'
              and c.table_name = 'summaries'
              and c.column_name = expected_column
        ) then
            raise exception using
                errcode = 'check_violation',
                message = format(
                    'Knowledge Platform migration 043 requires migration 042 column public.summaries.%I.',
                    expected_column
                );
        end if;
    end loop;

    if not exists (
        select 1
        from pg_constraint c
        where c.conrelid = 'public.summaries'::regclass
          and c.contype = 'p'
          and pg_get_constraintdef(c.oid) = 'PRIMARY KEY (id)'
    ) then
        raise exception using
            errcode = 'check_violation',
            message = 'Knowledge Platform migration 043 requires the preserved Summary UUID primary key.';
    end if;

    if to_regprocedure('public.handle_updated_at()') is null then
        raise exception using
            errcode = 'check_violation',
            message = 'Knowledge Platform migration 043 requires public.handle_updated_at().';
    end if;

    if to_regclass('public.summary_aliases') is not null
       or to_regclass('public.summary_reference_documents') is not null
       or to_regclass('public.summary_version_reference_documents') is not null
       or to_regclass('public.package_summaries') is not null
    then
        raise exception using
            errcode = 'check_violation',
            message = 'Knowledge Platform migration 043 scope drift: a later Knowledge/Product object already exists.';
    end if;
end
$kp_summary_versions_preflight$;

-- ─────────────────────────────────────────────────────────────────────────────
-- SummaryVersion child entity
-- ─────────────────────────────────────────────────────────────────────────────

create table if not exists public.summary_versions (
    id uuid not null default uuid_generate_v4(),
    summary_id uuid not null,
    revision_number integer not null,
    status text not null default 'draft',

    content_md text,
    content_checksum text,

    title_snapshot text,
    subject_snapshot text,
    topic_snapshot text,
    law_snapshot text,

    seo_title text,
    seo_description text,
    social_image_bucket text,
    social_image_path text,

    read_time_minutes integer,
    read_time_policy_version text,
    content_schema_version text not null,
    change_note text,

    authored_by uuid not null,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),

    submitted_for_review_at timestamptz,
    reviewed_by uuid,
    reviewed_at timestamptz,
    published_by uuid,
    published_at timestamptz,
    retired_by uuid,
    retired_at timestamptz,
    retirement_reason text,

    constraint summary_versions_pkey primary key (id),
    constraint summary_versions_parent_revision_key
        unique (summary_id, revision_number),
    constraint summary_versions_parent_id_key
        unique (summary_id, id),

    constraint summary_versions_revision_number_check check (
        revision_number > 0
    ),
    constraint summary_versions_status_check check (
        status in ('draft', 'in_review', 'published', 'retired')
    ),
    constraint summary_versions_required_text_check check (
        btrim(content_schema_version) <> ''
        and (content_md is null or btrim(content_md) <> '')
        and (content_checksum is null or btrim(content_checksum) <> '')
        and (title_snapshot is null or btrim(title_snapshot) <> '')
        and (subject_snapshot is null or btrim(subject_snapshot) <> '')
        and (topic_snapshot is null or btrim(topic_snapshot) <> '')
        and (law_snapshot is null or btrim(law_snapshot) <> '')
        and (seo_title is null or btrim(seo_title) <> '')
        and (seo_description is null or btrim(seo_description) <> '')
        and (social_image_bucket is null or btrim(social_image_bucket) <> '')
        and (social_image_path is null or btrim(social_image_path) <> '')
        and (read_time_policy_version is null or btrim(read_time_policy_version) <> '')
        and (change_note is null or btrim(change_note) <> '')
        and (retirement_reason is null or btrim(retirement_reason) <> '')
    ),
    constraint summary_versions_content_checksum_check check (
        (content_md is null and content_checksum is null)
        or (content_md is not null and content_checksum is not null)
    ),
    constraint summary_versions_social_image_pair_check check (
        (social_image_bucket is null and social_image_path is null)
        or (social_image_bucket is not null and social_image_path is not null)
    ),
    constraint summary_versions_read_time_check check (
        read_time_minutes is null or read_time_minutes > 0
    ),
    constraint summary_versions_review_audit_check check (
        (reviewed_by is null and reviewed_at is null)
        or (reviewed_by is not null and reviewed_at is not null)
    ),
    constraint summary_versions_publication_audit_check check (
        (
            published_by is null
            and published_at is null
        )
        or (
            published_by is not null
            and published_at is not null
            and status in ('published', 'retired')
        )
    ),
    constraint summary_versions_review_readiness_check check (
        status not in ('in_review', 'published')
        or (
            content_md is not null
            and content_checksum is not null
            and change_note is not null
            and submitted_for_review_at is not null
        )
    ),
    constraint summary_versions_published_semantics_check check (
        status <> 'published'
        or (
            content_md is not null
            and content_checksum is not null
            and title_snapshot is not null
            and read_time_minutes is not null
            and read_time_policy_version is not null
            and submitted_for_review_at is not null
            and reviewed_by is not null
            and reviewed_at is not null
            and published_by is not null
            and published_at is not null
        )
    ),
    constraint summary_versions_retirement_check check (
        (
            status = 'retired'
            and retired_by is not null
            and retired_at is not null
            and retirement_reason is not null
        )
        or (
            status <> 'retired'
            and retired_by is null
            and retired_at is null
            and retirement_reason is null
        )
    ),

    constraint summary_versions_parent_fkey
        foreign key (summary_id)
        references public.summaries(id)
        on delete restrict,
    constraint summary_versions_authored_by_fkey
        foreign key (authored_by)
        references public.profiles(id)
        on delete set null,
    constraint summary_versions_reviewed_by_fkey
        foreign key (reviewed_by)
        references public.profiles(id)
        on delete set null,
    constraint summary_versions_published_by_fkey
        foreign key (published_by)
        references public.profiles(id)
        on delete set null,
    constraint summary_versions_retired_by_fkey
        foreign key (retired_by)
        references public.profiles(id)
        on delete set null
);

comment on table public.summary_versions is
    'Revision-owned Summary Markdown, reviewed snapshots, publishing evidence, and retained history. Published and retired revisions are immutable.';
comment on column public.summary_versions.id is
    'Immutable UUID identity for one Summary revision.';
comment on column public.summary_versions.summary_id is
    'Owning Summary aggregate root.';
comment on column public.summary_versions.revision_number is
    'Positive monotonic revision number, unique and never reused within one Summary.';
comment on column public.summary_versions.status is
    'Editorial lifecycle: draft, in_review, published, or retired.';
comment on column public.summary_versions.content_md is
    'Authoritative Markdown body for this revision; required before review.';
comment on column public.summary_versions.content_checksum is
    'Canonical Markdown digest for exact-content identity and duplicate detection.';
comment on column public.summary_versions.title_snapshot is
    'Audit snapshot of the Summary canonical title reviewed for publication.';
comment on column public.summary_versions.subject_snapshot is
    'Audit snapshot of canonical Subject classification; never canonical ownership.';
comment on column public.summary_versions.topic_snapshot is
    'Audit snapshot of canonical Topic classification; never canonical ownership.';
comment on column public.summary_versions.law_snapshot is
    'Audit snapshot of canonical legal classification; never canonical ownership.';
comment on column public.summary_versions.seo_title is
    'Optional revision-owned SEO title.';
comment on column public.summary_versions.seo_description is
    'Optional revision-owned SEO description.';
comment on column public.summary_versions.social_image_bucket is
    'Optional controlled Supabase Storage bucket for the revision social image.';
comment on column public.summary_versions.social_image_path is
    'Optional stable object path for the revision social image; never a signed URL.';
comment on column public.summary_versions.read_time_minutes is
    'Positive read-time estimate derived from this revision Markdown.';
comment on column public.summary_versions.read_time_policy_version is
    'Versioned calculation policy used to derive read_time_minutes.';
comment on column public.summary_versions.content_schema_version is
    'Required authoring/template contract version for this revision.';
comment on column public.summary_versions.change_note is
    'Editorial explanation required before review.';
comment on column public.summary_versions.authored_by is
    'Profile that created this Summary revision.';
comment on column public.summary_versions.created_at is
    'UTC instant when the Summary revision was created.';
comment on column public.summary_versions.updated_at is
    'UTC instant of the most recent permitted draft or lifecycle update.';
comment on column public.summary_versions.submitted_for_review_at is
    'UTC instant when this revision most recently entered review.';
comment on column public.summary_versions.reviewed_by is
    'Profile that approved this revision before publication.';
comment on column public.summary_versions.reviewed_at is
    'UTC instant when review approval was recorded.';
comment on column public.summary_versions.published_by is
    'Profile that published this revision.';
comment on column public.summary_versions.published_at is
    'UTC publication instant for this immutable revision.';
comment on column public.summary_versions.retired_by is
    'Profile that explicitly retired this revision.';
comment on column public.summary_versions.retired_at is
    'UTC instant when this revision was retired.';
comment on column public.summary_versions.retirement_reason is
    'Required explanation for explicit revision retirement.';

-- ─────────────────────────────────────────────────────────────────────────────
-- Lifecycle, identity, immutability, and retention protection
-- ─────────────────────────────────────────────────────────────────────────────

create or replace function public.enforce_summary_version_transition()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $function$
begin
    if new.status is not distinct from old.status then
        return new;
    end if;

    if not (
        (old.status = 'draft' and new.status in ('in_review', 'retired'))
        or (old.status = 'in_review' and new.status in ('draft', 'published', 'retired'))
        or (old.status = 'published' and new.status = 'retired')
    ) then
        raise exception
            'invalid SummaryVersion lifecycle transition: % -> %',
            old.status,
            new.status
            using errcode = 'check_violation';
    end if;

    return new;
end
$function$;

comment on function public.enforce_summary_version_transition() is
    'Allows only frozen SummaryVersion lifecycle transitions and keeps published/retired states one-way.';

create or replace function public.protect_summary_version()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $function$
begin
    if row(
        new.id,
        new.summary_id,
        new.revision_number,
        new.authored_by,
        new.created_at
    ) is distinct from row(
        old.id,
        old.summary_id,
        old.revision_number,
        old.authored_by,
        old.created_at
    ) then
        raise exception
            'SummaryVersion identity, parent, revision number, and creation audit are immutable'
            using errcode = 'check_violation';
    end if;

    -- Content cannot change while a revision remains under review. An editor
    -- must return it to draft, matching the frozen lifecycle.
    if old.status = 'in_review'
       and new.status <> 'draft'
       and row(
            new.content_md,
            new.content_checksum,
            new.title_snapshot,
            new.subject_snapshot,
            new.topic_snapshot,
            new.law_snapshot,
            new.seo_title,
            new.seo_description,
            new.social_image_bucket,
            new.social_image_path,
            new.read_time_minutes,
            new.read_time_policy_version,
            new.content_schema_version,
            new.change_note
       ) is distinct from row(
            old.content_md,
            old.content_checksum,
            old.title_snapshot,
            old.subject_snapshot,
            old.topic_snapshot,
            old.law_snapshot,
            old.seo_title,
            old.seo_description,
            old.social_image_bucket,
            old.social_image_path,
            old.read_time_minutes,
            old.read_time_policy_version,
            old.content_schema_version,
            old.change_note
       )
    then
        raise exception
            'SummaryVersion content changes require returning the revision to draft'
            using errcode = 'check_violation';
    end if;

    if old.status in ('published', 'retired')
       and row(
            new.content_md,
            new.content_checksum,
            new.title_snapshot,
            new.subject_snapshot,
            new.topic_snapshot,
            new.law_snapshot,
            new.seo_title,
            new.seo_description,
            new.social_image_bucket,
            new.social_image_path,
            new.read_time_minutes,
            new.read_time_policy_version,
            new.content_schema_version,
            new.change_note,
            new.submitted_for_review_at,
            new.reviewed_by,
            new.reviewed_at,
            new.published_by,
            new.published_at
       ) is distinct from row(
            old.content_md,
            old.content_checksum,
            old.title_snapshot,
            old.subject_snapshot,
            old.topic_snapshot,
            old.law_snapshot,
            old.seo_title,
            old.seo_description,
            old.social_image_bucket,
            old.social_image_path,
            old.read_time_minutes,
            old.read_time_policy_version,
            old.content_schema_version,
            old.change_note,
            old.submitted_for_review_at,
            old.reviewed_by,
            old.reviewed_at,
            old.published_by,
            old.published_at
       )
    then
        raise exception
            'published or retired SummaryVersion content and provenance are immutable'
            using errcode = 'check_violation';
    end if;

    if old.status = 'retired'
       and row(new.retired_by, new.retired_at, new.retirement_reason)
           is distinct from
           row(old.retired_by, old.retired_at, old.retirement_reason)
    then
        raise exception
            'retired SummaryVersion audit is immutable'
            using errcode = 'check_violation';
    end if;

    return new;
end
$function$;

comment on function public.protect_summary_version() is
    'Protects immutable revision identity and creation audit, review-state content, and published/retired content and provenance.';

create or replace function public.prevent_summary_version_history_delete()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $function$
begin
    if old.status in ('published', 'retired') then
        raise exception
            'published or retired SummaryVersion history cannot be deleted'
            using errcode = 'check_violation';
    end if;
    return old;
end
$function$;

comment on function public.prevent_summary_version_history_delete() is
    'Allows disposal only of draft/in-review revisions; published and retired history is retained.';

drop trigger if exists enforce_summary_version_transition
    on public.summary_versions;
create trigger enforce_summary_version_transition
    before update of status on public.summary_versions
    for each row execute function public.enforce_summary_version_transition();

drop trigger if exists protect_summary_version
    on public.summary_versions;
create trigger protect_summary_version
    before update on public.summary_versions
    for each row execute function public.protect_summary_version();

drop trigger if exists prevent_summary_version_history_delete
    on public.summary_versions;
create trigger prevent_summary_version_history_delete
    before delete on public.summary_versions
    for each row execute function public.prevent_summary_version_history_delete();

drop trigger if exists handle_updated_at_summary_versions
    on public.summary_versions;
create trigger handle_updated_at_summary_versions
    before update on public.summary_versions
    for each row execute procedure public.handle_updated_at();

-- ─────────────────────────────────────────────────────────────────────────────
-- Frozen revision and editorial-operation indexes
-- ─────────────────────────────────────────────────────────────────────────────

create unique index if not exists summary_versions_one_open_revision_key
    on public.summary_versions (summary_id)
    where status in ('draft', 'in_review');

create index if not exists summary_versions_parent_status_revision_idx
    on public.summary_versions (summary_id, status, revision_number desc);

create index if not exists summary_versions_status_published_idx
    on public.summary_versions (status, published_at desc);

create index if not exists summary_versions_checksum_idx
    on public.summary_versions (content_checksum)
    where content_checksum is not null;

-- ─────────────────────────────────────────────────────────────────────────────
-- Same-parent current-version pointer
-- ─────────────────────────────────────────────────────────────────────────────

alter table public.summaries
    add constraint summaries_current_published_version_fkey
        foreign key (id, current_published_version_id)
        references public.summary_versions(summary_id, id)
        on delete restrict
        deferrable initially deferred
        not valid;

-- No pointer is populated and no publishing workflow is installed here.

-- ─────────────────────────────────────────────────────────────────────────────
-- Dormant deny-by-default access boundary
-- ─────────────────────────────────────────────────────────────────────────────

alter table public.summary_versions enable row level security;

revoke all on table public.summary_versions
    from public, anon, authenticated;
revoke all on function public.enforce_summary_version_transition()
    from public, anon, authenticated;
revoke all on function public.protect_summary_version()
    from public, anon, authenticated;
revoke all on function public.prevent_summary_version_history_delete()
    from public, anon, authenticated;

grant select, insert, update, delete
    on table public.summary_versions
    to service_role;

-- ─────────────────────────────────────────────────────────────────────────────
-- Fail-closed migration validation
-- ─────────────────────────────────────────────────────────────────────────────

do $kp_summary_versions_assertions$
declare
    expected record;
begin
    if to_regclass('public.summary_versions') is null then
        raise exception using
            errcode = 'check_violation',
            message = 'Knowledge Platform migration 043 drift: public.summary_versions is missing.';
    end if;

    for expected in
        select *
        from (
            values
                ('id', 'uuid', 'NO'),
                ('summary_id', 'uuid', 'NO'),
                ('revision_number', 'int4', 'NO'),
                ('status', 'text', 'NO'),
                ('content_md', 'text', 'YES'),
                ('content_checksum', 'text', 'YES'),
                ('title_snapshot', 'text', 'YES'),
                ('subject_snapshot', 'text', 'YES'),
                ('topic_snapshot', 'text', 'YES'),
                ('law_snapshot', 'text', 'YES'),
                ('seo_title', 'text', 'YES'),
                ('seo_description', 'text', 'YES'),
                ('social_image_bucket', 'text', 'YES'),
                ('social_image_path', 'text', 'YES'),
                ('read_time_minutes', 'int4', 'YES'),
                ('read_time_policy_version', 'text', 'YES'),
                ('content_schema_version', 'text', 'NO'),
                ('change_note', 'text', 'YES'),
                ('authored_by', 'uuid', 'NO'),
                ('created_at', 'timestamptz', 'NO'),
                ('updated_at', 'timestamptz', 'NO'),
                ('submitted_for_review_at', 'timestamptz', 'YES'),
                ('reviewed_by', 'uuid', 'YES'),
                ('reviewed_at', 'timestamptz', 'YES'),
                ('published_by', 'uuid', 'YES'),
                ('published_at', 'timestamptz', 'YES'),
                ('retired_by', 'uuid', 'YES'),
                ('retired_at', 'timestamptz', 'YES'),
                ('retirement_reason', 'text', 'YES')
        ) as required_columns(column_name, udt_name, is_nullable)
    loop
        if not exists (
            select 1
            from information_schema.columns c
            where c.table_schema = 'public'
              and c.table_name = 'summary_versions'
              and c.column_name = expected.column_name
              and c.udt_name = expected.udt_name
              and c.is_nullable = expected.is_nullable
        ) then
            raise exception using
                errcode = 'check_violation',
                message = format(
                    'Knowledge Platform migration 043 drift: expected public.summary_versions.%I type=%s nullable=%s.',
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
          and c.table_name = 'summary_versions'
    ) <> 29 then
        raise exception using
            errcode = 'check_violation',
            message = 'Knowledge Platform migration 043 drift: public.summary_versions has unexpected columns.';
    end if;

    for expected in
        select *
        from (
            values
                ('summary_versions_pkey'),
                ('summary_versions_parent_revision_key'),
                ('summary_versions_parent_id_key'),
                ('summary_versions_revision_number_check'),
                ('summary_versions_status_check'),
                ('summary_versions_required_text_check'),
                ('summary_versions_content_checksum_check'),
                ('summary_versions_social_image_pair_check'),
                ('summary_versions_read_time_check'),
                ('summary_versions_review_audit_check'),
                ('summary_versions_publication_audit_check'),
                ('summary_versions_review_readiness_check'),
                ('summary_versions_published_semantics_check'),
                ('summary_versions_retirement_check'),
                ('summary_versions_parent_fkey'),
                ('summary_versions_authored_by_fkey'),
                ('summary_versions_reviewed_by_fkey'),
                ('summary_versions_published_by_fkey'),
                ('summary_versions_retired_by_fkey')
        ) as required_constraints(constraint_name)
    loop
        if not exists (
            select 1
            from pg_constraint c
            where c.conrelid = 'public.summary_versions'::regclass
              and c.conname = expected.constraint_name
              and c.convalidated
        ) then
            raise exception using
                errcode = 'check_violation',
                message = format(
                    'Knowledge Platform migration 043 drift: constraint %I is missing or unvalidated.',
                    expected.constraint_name
                );
        end if;
    end loop;

    if not exists (
        select 1
        from pg_constraint c
        where c.conrelid = 'public.summary_versions'::regclass
          and c.conname = 'summary_versions_parent_fkey'
          and c.contype = 'f'
          and c.confrelid = 'public.summaries'::regclass
          and c.confdeltype = 'r'
    ) then
        raise exception using
            errcode = 'check_violation',
            message = 'Knowledge Platform migration 043 drift: SummaryVersion parent FK must reference summaries with ON DELETE RESTRICT.';
    end if;

    for expected in
        select *
        from (
            values
                ('summary_versions_authored_by_fkey'),
                ('summary_versions_reviewed_by_fkey'),
                ('summary_versions_published_by_fkey'),
                ('summary_versions_retired_by_fkey')
        ) as actor_fks(constraint_name)
    loop
        if not exists (
            select 1
            from pg_constraint c
            where c.conrelid = 'public.summary_versions'::regclass
              and c.conname = expected.constraint_name
              and c.contype = 'f'
              and c.confrelid = 'public.profiles'::regclass
              and c.confdeltype = 'n'
        ) then
            raise exception using
                errcode = 'check_violation',
                message = format(
                    'Knowledge Platform migration 043 drift: actor FK %I must reference profiles with ON DELETE SET NULL.',
                    expected.constraint_name
                );
        end if;
    end loop;

    if not exists (
        select 1
        from pg_constraint c
        where c.conrelid = 'public.summaries'::regclass
          and c.conname = 'summaries_current_published_version_fkey'
          and c.contype = 'f'
          and c.confrelid = 'public.summary_versions'::regclass
          and c.confdeltype = 'r'
          and c.condeferrable
          and c.condeferred
          and not c.convalidated
          and pg_get_constraintdef(c.oid) ilike '%FOREIGN KEY (id, current_published_version_id)%'
          and pg_get_constraintdef(c.oid) ilike '%REFERENCES summary_versions(summary_id, id)%'
    ) then
        raise exception using
            errcode = 'check_violation',
            message = 'Knowledge Platform migration 043 drift: current pointer FK must be same-parent, RESTRICT, deferred, and NOT VALID.';
    end if;

    for expected in
        select *
        from (
            values
                ('summary_versions_parent_revision_key'),
                ('summary_versions_parent_id_key'),
                ('summary_versions_one_open_revision_key'),
                ('summary_versions_parent_status_revision_idx'),
                ('summary_versions_status_published_idx'),
                ('summary_versions_checksum_idx')
        ) as required_indexes(index_name)
    loop
        if not exists (
            select 1
            from pg_class i
            join pg_namespace n on n.oid = i.relnamespace
            join pg_index x on x.indexrelid = i.oid
            where n.nspname = 'public'
              and i.relname = expected.index_name
              and x.indrelid = 'public.summary_versions'::regclass
              and x.indisvalid
              and x.indisready
        ) then
            raise exception using
                errcode = 'check_violation',
                message = format(
                    'Knowledge Platform migration 043 drift: index %I is missing, invalid, or not ready.',
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
          and i.relname = 'summary_versions_one_open_revision_key'
          and x.indrelid = 'public.summary_versions'::regclass
          and x.indisunique
          and x.indpred is not null
          and pg_get_expr(x.indpred, x.indrelid) ilike '%status%'
          and pg_get_expr(x.indpred, x.indrelid) ilike '%draft%'
          and pg_get_expr(x.indpred, x.indrelid) ilike '%in_review%'
    ) then
        raise exception using
            errcode = 'check_violation',
            message = 'Knowledge Platform migration 043 drift: one-open-revision index must be unique and partial for draft/in_review.';
    end if;

    if to_regprocedure('public.enforce_summary_version_transition()') is null
       or to_regprocedure('public.protect_summary_version()') is null
       or to_regprocedure('public.prevent_summary_version_history_delete()') is null
    then
        raise exception using
            errcode = 'check_violation',
            message = 'Knowledge Platform migration 043 drift: lifecycle, immutability, or retention function is missing.';
    end if;

    for expected in
        select *
        from (
            values
                ('enforce_summary_version_transition'),
                ('protect_summary_version'),
                ('prevent_summary_version_history_delete'),
                ('handle_updated_at_summary_versions')
        ) as required_triggers(trigger_name)
    loop
        if not exists (
            select 1
            from pg_trigger t
            where t.tgrelid = 'public.summary_versions'::regclass
              and t.tgname = expected.trigger_name
              and not t.tgisinternal
              and t.tgenabled <> 'D'
        ) then
            raise exception using
                errcode = 'check_violation',
                message = format(
                    'Knowledge Platform migration 043 drift: trigger %I is missing or disabled.',
                    expected.trigger_name
                );
        end if;
    end loop;

    if not exists (
        select 1
        from pg_class c
        join pg_namespace n on n.oid = c.relnamespace
        where n.nspname = 'public'
          and c.relname = 'summary_versions'
          and c.relrowsecurity
    ) then
        raise exception using
            errcode = 'check_violation',
            message = 'Knowledge Platform migration 043 drift: RLS is not enabled on public.summary_versions.';
    end if;

    if exists (
        select 1
        from pg_policies
        where schemaname = 'public'
          and tablename = 'summary_versions'
    ) then
        raise exception using
            errcode = 'check_violation',
            message = 'Knowledge Platform migration 043 drift: summary_versions must have no policies before the dedicated RLS foundation.';
    end if;

    if has_table_privilege('anon', 'public.summary_versions', 'SELECT')
       or has_table_privilege('authenticated', 'public.summary_versions', 'SELECT')
       or has_table_privilege('anon', 'public.summary_versions', 'INSERT')
       or has_table_privilege('authenticated', 'public.summary_versions', 'INSERT')
       or has_table_privilege('anon', 'public.summary_versions', 'UPDATE')
       or has_table_privilege('authenticated', 'public.summary_versions', 'UPDATE')
       or has_table_privilege('anon', 'public.summary_versions', 'DELETE')
       or has_table_privilege('authenticated', 'public.summary_versions', 'DELETE')
    then
        raise exception using
            errcode = 'check_violation',
            message = 'Knowledge Platform migration 043 drift: a browser role can access dormant SummaryVersion storage.';
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
            'public.summary_versions',
            expected.privilege_name
        ) then
            raise exception using
                errcode = 'check_violation',
                message = format(
                    'Knowledge Platform migration 043 drift: service_role lacks %s on public.summary_versions.',
                    expected.privilege_name
                );
        end if;
    end loop;

    raise notice 'Knowledge Platform migration 043 passed: immutable SummaryVersion storage is valid, private, and dormant.';
end
$kp_summary_versions_assertions$;

notify pgrst, 'reload schema';
