-- 082_written_exam_persistence.sql
--
-- WE-2B — Written Exam persistence contract.
--
-- Written Exam is a structured, subjective-answer material. It is deliberately
-- separate from the MCQ question bank and stores both the imported source and
-- the normalized question projection needed by the future learner reader.
--
-- Write boundary:
--   authenticated content staff -> SECURITY DEFINER RPCs only
--   anonymous/learner raw-table access -> denied
--   learner read -> get_published_written_exam_for_learner() only
--
-- Migration 082 was reserved only after checking all tracked files, refs, and
-- accessible local worktrees. Migrations 078/079/080/081 remain untouched.

set local lock_timeout = '5s';

-- ─────────────────────────────────────────────────────────────────────────────
-- 0. Fail-closed predecessor and collision gate
-- ─────────────────────────────────────────────────────────────────────────────

do $written_exam_preflight$
declare
    required_relation text;
    required_column record;
begin
    for required_relation in
        select relation_name
        from (values
            ('packages'),
            ('profiles'),
            ('orders')
        ) as required(relation_name)
    loop
        if pg_catalog.to_regclass(format('public.%I', required_relation)) is null then
            raise exception using
                errcode = 'check_violation',
                message = format(
                    'Written Exam migration 082 requires public.%I.',
                    required_relation
                );
        end if;
    end loop;

    for required_column in
        select table_name, column_name
        from (values
            ('packages', 'id'),
            ('packages', 'slug'),
            ('packages', 'package_code'),
            ('packages', 'is_published'),
            ('profiles', 'id'),
            ('profiles', 'role'),
            ('profiles', 'status'),
            ('profiles', 'deleted_at'),
            ('orders', 'user_id'),
            ('orders', 'package_id'),
            ('orders', 'status')
        ) as required(table_name, column_name)
    loop
        if not exists (
            select 1
            from information_schema.columns c
            where c.table_schema = 'public'
              and c.table_name = required_column.table_name
              and c.column_name = required_column.column_name
        ) then
            raise exception using
                errcode = 'check_violation',
                message = format(
                    'Written Exam migration 082 requires public.%I.%I.',
                    required_column.table_name,
                    required_column.column_name
                );
        end if;
    end loop;

    if pg_catalog.to_regclass('public.packages_package_code_key') is null then
        raise exception using
            errcode = 'check_violation',
            message = 'Written Exam migration 082 requires unique packages.package_code resolution.';
    end if;

    if pg_catalog.to_regprocedure('public.handle_updated_at()') is null then
        raise exception using
            errcode = 'check_violation',
            message = 'Written Exam migration 082 requires public.handle_updated_at().';
    end if;

    if pg_catalog.to_regprocedure('public.kp_is_content_editor()') is null then
        raise exception using
            errcode = 'check_violation',
            message = 'Written Exam migration 082 requires the SEC-079 active content-editor predicate.';
    end if;

    for required_relation in
        select relation_name
        from (values
            ('written_exam_materials'),
            ('written_exam_material_versions'),
            ('written_exam_questions')
        ) as required(relation_name)
    loop
        if pg_catalog.to_regclass(format('public.%I', required_relation)) is not null then
            raise exception using
                errcode = 'duplicate_object',
                message = format(
                    'Written Exam migration 082 refuses to replace existing public.%I.',
                    required_relation
                );
        end if;
    end loop;
end
$written_exam_preflight$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Normalized persistence model
-- ─────────────────────────────────────────────────────────────────────────────

create table public.written_exam_materials (
    id uuid default uuid_generate_v4() primary key,
    package_id uuid not null,
    slug text not null,

    created_by uuid null,
    updated_by uuid null,
    created_at timestamptz not null default timezone('utc'::text, now()),
    updated_at timestamptz not null default timezone('utc'::text, now()),

    constraint written_exam_materials_package_slug_key
        unique (package_id, slug),
    constraint written_exam_materials_slug_check
        check (
            char_length(slug) between 1 and 120
            and slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'
        ),
    constraint written_exam_materials_package_id_fkey
        foreign key (package_id)
        references public.packages (id)
        on delete restrict,
    constraint written_exam_materials_created_by_fkey
        foreign key (created_by)
        references public.profiles (id)
        on delete set null,
    constraint written_exam_materials_updated_by_fkey
        foreign key (updated_by)
        references public.profiles (id)
        on delete set null
);

create table public.written_exam_material_versions (
    id uuid default uuid_generate_v4() primary key,
    material_id uuid not null,
    revision_number integer not null,
    format_version text not null,
    title text not null,
    source_md text not null,
    source_checksum text not null,
    source_filename text null,
    status text not null default 'draft',

    created_by uuid null,
    updated_by uuid null,
    published_by uuid null,
    archived_by uuid null,
    created_at timestamptz not null default timezone('utc'::text, now()),
    updated_at timestamptz not null default timezone('utc'::text, now()),
    published_at timestamptz null,
    archived_at timestamptz null,

    constraint written_exam_material_versions_revision_key
        unique (material_id, revision_number),
    constraint written_exam_material_versions_revision_check
        check (revision_number > 0),
    constraint written_exam_material_versions_format_check
        check (format_version = 'written-exam-v1'),
    constraint written_exam_material_versions_title_check
        check (char_length(btrim(title)) between 1 and 300),
    constraint written_exam_material_versions_source_size_check
        check (octet_length(source_md) between 1 and 1048576),
    constraint written_exam_material_versions_checksum_check
        check (source_checksum ~ '^[0-9a-f]{64}$'),
    constraint written_exam_material_versions_status_check
        check (status in ('draft', 'published', 'archived')),
    constraint written_exam_material_versions_lifecycle_shape_check
        check (
            (
                status = 'draft'
                and published_at is null
                and archived_at is null
            )
            or (
                status = 'published'
                and published_at is not null
                and archived_at is null
            )
            or (
                status = 'archived'
                and published_at is not null
                and archived_at is not null
            )
        ),
    constraint written_exam_material_versions_material_id_fkey
        foreign key (material_id)
        references public.written_exam_materials (id)
        on delete restrict,
    constraint written_exam_material_versions_created_by_fkey
        foreign key (created_by)
        references public.profiles (id)
        on delete set null,
    constraint written_exam_material_versions_updated_by_fkey
        foreign key (updated_by)
        references public.profiles (id)
        on delete set null,
    constraint written_exam_material_versions_published_by_fkey
        foreign key (published_by)
        references public.profiles (id)
        on delete set null,
    constraint written_exam_material_versions_archived_by_fkey
        foreign key (archived_by)
        references public.profiles (id)
        on delete set null
);

create table public.written_exam_questions (
    id uuid default uuid_generate_v4() primary key,
    material_version_id uuid not null,
    question_number integer not null,
    question_markdown text not null,
    model_answer_markdown text not null,
    keywords text[] not null,
    answer_structure_markdown text not null,
    memory_technique_markdown text not null,
    question_checksum text null,
    created_at timestamptz not null default timezone('utc'::text, now()),
    updated_at timestamptz not null default timezone('utc'::text, now()),

    constraint written_exam_questions_version_number_key
        unique (material_version_id, question_number),
    constraint written_exam_questions_number_check
        check (question_number between 1 and 200),
    constraint written_exam_questions_question_check
        check (char_length(btrim(question_markdown)) > 0),
    constraint written_exam_questions_answer_check
        check (char_length(btrim(model_answer_markdown)) > 0),
    constraint written_exam_questions_keywords_check
        check (
            cardinality(keywords) between 1 and 30
            and array_position(keywords, null::text) is null
            and array_position(keywords, ''::text) is null
        ),
    constraint written_exam_questions_structure_check
        check (char_length(btrim(answer_structure_markdown)) > 0),
    constraint written_exam_questions_memory_check
        check (char_length(btrim(memory_technique_markdown)) > 0),
    constraint written_exam_questions_checksum_check
        check (
            question_checksum is null
            or question_checksum ~ '^[0-9a-f]{64}$'
        ),
    constraint written_exam_questions_version_id_fkey
        foreign key (material_version_id)
        references public.written_exam_material_versions (id)
        on delete cascade
);

comment on table public.written_exam_materials is
    'Written Exam material identity. Package binding and learner slug are stable; lifecycle lives on child versions.';
comment on table public.written_exam_material_versions is
    'Written Exam source and normalized revision lifecycle: draft -> published -> archived. Published content is immutable.';
comment on table public.written_exam_questions is
    'Normalized Parser V1 question projection. question_checksum is advisory and is intentionally not unique.';
comment on column public.written_exam_material_versions.source_md is
    'Original Parser V1 Markdown. Hard database backstop is octet_length(source_md) <= 1048576.';
comment on column public.written_exam_material_versions.source_checksum is
    'SHA-256 checksum supplied by the trusted Parser V1 integration and used for draft idempotency.';
comment on column public.written_exam_questions.question_checksum is
    'Advisory per-question checksum; duplicate values are allowed across questions and revisions.';

-- Invalid UTF-8, File/FormData shape, and .md/.markdown extension checks stay
-- at the WE-1 application boundary. PostgreSQL text still enforces the same
-- byte-based source cap below as a persistence backstop.

create index written_exam_materials_package_id_idx
    on public.written_exam_materials (package_id);

create index written_exam_material_versions_material_revision_idx
    on public.written_exam_material_versions (material_id, revision_number desc);

create unique index written_exam_material_versions_one_draft_idx
    on public.written_exam_material_versions (material_id)
    where status = 'draft';

create unique index written_exam_material_versions_one_published_idx
    on public.written_exam_material_versions (material_id)
    where status = 'published';

create index written_exam_questions_version_order_idx
    on public.written_exam_questions (material_version_id, question_number);

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Database-owned identity/lifecycle protection
-- ─────────────────────────────────────────────────────────────────────────────

create or replace function public.protect_written_exam_material_identity()
returns trigger
language plpgsql
security invoker
set search_path = pg_catalog, public, auth, pg_temp
as $function$
begin
    if tg_op = 'DELETE' then
        raise exception using
            errcode = 'check_violation',
            message = 'Written Exam materials are archived rather than hard-deleted.';
    end if;

    if new.package_id is distinct from old.package_id
       or new.slug is distinct from old.slug
    then
        raise exception using
            errcode = 'check_violation',
            message = 'Written Exam package binding and learner slug are immutable.';
    end if;

    return new;
end
$function$;

create trigger written_exam_material_identity_guard
before update or delete on public.written_exam_materials
for each row execute function public.protect_written_exam_material_identity();

create or replace function public.protect_written_exam_version_lifecycle()
returns trigger
language plpgsql
security invoker
set search_path = pg_catalog, public, auth, pg_temp
as $function$
begin
    if tg_op = 'DELETE' then
        raise exception using
            errcode = 'check_violation',
            message = 'Written Exam versions are retained; use archive lifecycle instead of delete.';
    end if;

    if tg_op = 'INSERT' then
        if new.status <> 'draft'
           or new.published_at is not null
           or new.archived_at is not null
        then
            raise exception using
                errcode = 'check_violation',
                message = 'Written Exam versions must enter persistence as draft.';
        end if;

        if auth.uid() is not null then
            new.created_by := auth.uid();
            new.updated_by := auth.uid();
        end if;
        return new;
    end if;

    if new.created_at is distinct from old.created_at then
        raise exception using
            errcode = 'check_violation',
            message = 'Written Exam version created_at is immutable.';
    end if;

    if old.status = 'draft' and new.status = 'draft' then
        if new.published_at is not null
           or new.published_by is not null
           or new.archived_at is not null
           or new.archived_by is not null
        then
            raise exception using
                errcode = 'check_violation',
                message = 'Draft Written Exam versions cannot carry publication lifecycle anchors.';
        end if;
        return new;
    end if;

    if old.status = 'draft' and new.status = 'published' then
        if new.archived_at is not null or new.archived_by is not null then
            raise exception using
                errcode = 'check_violation',
                message = 'A Written Exam draft cannot publish and archive in one transition.';
        end if;

        new.published_at := timezone('utc'::text, now());
        new.published_by := auth.uid();
        new.archived_at := null;
        new.archived_by := null;
        if auth.uid() is not null then
            new.updated_by := auth.uid();
        end if;
        return new;
    end if;

    if old.status = 'published' and new.status = 'archived' then
        if new.material_id is distinct from old.material_id
           or new.revision_number is distinct from old.revision_number
           or new.format_version is distinct from old.format_version
           or new.title is distinct from old.title
           or new.source_md is distinct from old.source_md
           or new.source_checksum is distinct from old.source_checksum
           or new.source_filename is distinct from old.source_filename
           or new.published_at is distinct from old.published_at
           or new.published_by is distinct from old.published_by
        then
            raise exception using
                errcode = 'check_violation',
                message = 'Published Written Exam content is immutable; only archive lifecycle fields may change.';
        end if;

        new.published_at := old.published_at;
        new.published_by := old.published_by;
        new.archived_at := timezone('utc'::text, now());
        new.archived_by := auth.uid();
        if auth.uid() is not null then
            new.updated_by := auth.uid();
        end if;
        return new;
    end if;

    raise exception using
        errcode = 'check_violation',
        message = format(
            'Invalid Written Exam version lifecycle transition: %s -> %s.',
            old.status,
            new.status
        );
end
$function$;

create trigger written_exam_version_lifecycle_guard
before insert or update or delete on public.written_exam_material_versions
for each row execute function public.protect_written_exam_version_lifecycle();

create or replace function public.protect_written_exam_question_lifecycle()
returns trigger
language plpgsql
security invoker
set search_path = pg_catalog, public, auth, pg_temp
as $function$
declare
    old_status text;
    new_status text;
begin
    if tg_op = 'INSERT' then
        select v.status
        into new_status
        from public.written_exam_material_versions v
        where v.id = new.material_version_id
        for share;

        if new_status is distinct from 'draft' then
            raise exception using
                errcode = 'check_violation',
                message = 'Questions may be inserted only into a Written Exam draft.';
        end if;
        return new;
    end if;

    select v.status
    into old_status
    from public.written_exam_material_versions v
    where v.id = old.material_version_id
    for share;

    if old_status is distinct from 'draft' then
        raise exception using
            errcode = 'check_violation',
            message = 'Published or archived Written Exam questions are immutable.';
    end if;

    if tg_op = 'UPDATE' then
        select v.status
        into new_status
        from public.written_exam_material_versions v
        where v.id = new.material_version_id
        for share;

        if new_status is distinct from 'draft' then
            raise exception using
                errcode = 'check_violation',
                message = 'Questions may be updated only within a Written Exam draft.';
        end if;
        return new;
    end if;

    -- DELETE is permitted only for atomic replacement of a draft question set.
    return old;
end
$function$;

create trigger written_exam_question_lifecycle_guard
before insert or update or delete on public.written_exam_questions
for each row execute function public.protect_written_exam_question_lifecycle();

create trigger written_exam_materials_updated_at
before update on public.written_exam_materials
for each row execute function public.handle_updated_at();

create trigger written_exam_material_versions_updated_at
before update on public.written_exam_material_versions
for each row execute function public.handle_updated_at();

create trigger written_exam_questions_updated_at
before update on public.written_exam_questions
for each row execute function public.handle_updated_at();

-- Trigger functions are database implementation details, not browser-callable
-- APIs. Explicitly fence every Supabase role, including service_role.
revoke all on function public.protect_written_exam_material_identity() from public, anon, authenticated, service_role;
revoke all on function public.protect_written_exam_version_lifecycle() from public, anon, authenticated, service_role;
revoke all on function public.protect_written_exam_question_lifecycle() from public, anon, authenticated, service_role;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. Raw-table RLS/ACL boundary
-- ─────────────────────────────────────────────────────────────────────────────

alter table public.written_exam_materials enable row level security;
alter table public.written_exam_material_versions enable row level security;
alter table public.written_exam_questions enable row level security;

-- Staff may inspect raw material data for admin tooling. The SEC-079 helper
-- requires owner/admin/editor, status active, and deleted_at IS NULL.
create policy written_exam_materials_staff_select
on public.written_exam_materials
for select
to authenticated
using (public.kp_is_content_editor());

create policy written_exam_material_versions_staff_select
on public.written_exam_material_versions
for select
to authenticated
using (public.kp_is_content_editor());

create policy written_exam_questions_staff_select
on public.written_exam_questions
for select
to authenticated
using (public.kp_is_content_editor());

-- Authenticated clients receive no raw-table DML. Learners also receive no
-- raw rows; the learner projection RPC below is the only learner read path.
revoke all on table public.written_exam_materials from public, anon, authenticated;
revoke all on table public.written_exam_material_versions from public, anon, authenticated;
revoke all on table public.written_exam_questions from public, anon, authenticated;

grant select on table public.written_exam_materials to authenticated;
grant select on table public.written_exam_material_versions to authenticated;
grant select on table public.written_exam_questions to authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. Trusted write RPCs
-- ─────────────────────────────────────────────────────────────────────────────

create or replace function public.save_written_exam_draft(
    p_material_id uuid,
    p_package_code text,
    p_slug text,
    p_format_version text,
    p_title text,
    p_source_md text,
    p_source_checksum text,
    p_source_filename text,
    p_questions jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, auth, pg_temp
set lock_timeout = '5s'
as $function$
declare
    v_actor_id uuid;
    v_actor_role text;
    v_package_id uuid;
    v_material_id uuid;
    v_material_package_id uuid;
    v_material_slug text;
    v_version_id uuid;
    v_revision_number integer;
    v_existing_draft_checksum text;
    v_existing_draft_title text;
    v_question jsonb;
    v_question_number integer;
    v_expected_question_number integer := 1;
    v_question_count integer;
    v_keywords text[];
    v_question_checksum text;
    v_question_markdown text;
    v_model_answer_markdown text;
    v_answer_structure_markdown text;
    v_memory_technique_markdown text;
begin
    v_actor_id := auth.uid();

    if v_actor_id is null then
        raise exception using
            errcode = 'insufficient_privilege',
            message = 'An authenticated content editor is required to save a Written Exam draft.';
    end if;

    select p.role
    into v_actor_role
    from public.profiles p
    where p.id = v_actor_id
      and p.role in ('owner', 'admin', 'editor')
      and p.status = 'active'
      and p.deleted_at is null
    for share;

    if v_actor_role is null then
        raise exception using
            errcode = 'insufficient_privilege',
            message = 'Only an active Owner, Admin, or Editor may save a Written Exam draft.';
    end if;

    if p_package_code is null
       or p_package_code <> btrim(p_package_code)
       or btrim(p_package_code) = ''
    then
        raise exception using
            errcode = 'invalid_parameter_value',
            message = 'Written Exam package_code is required and must be exact.';
    end if;

    if p_slug is null or p_slug !~ '^[a-z0-9]+(-[a-z0-9]+)*$' then
        raise exception using
            errcode = 'invalid_parameter_value',
            message = 'Written Exam slug must use lowercase kebab-case.';
    end if;

    if p_format_version is distinct from 'written-exam-v1' then
        raise exception using
            errcode = 'invalid_parameter_value',
            message = 'Written Exam format_version must be written-exam-v1.';
    end if;

    if p_title is null or char_length(btrim(p_title)) not between 1 and 300 then
        raise exception using
            errcode = 'invalid_parameter_value',
            message = 'Written Exam title is required.';
    end if;

    if p_source_md is null or octet_length(p_source_md) not between 1 and 1048576 then
        raise exception using
            errcode = 'invalid_parameter_value',
            message = 'Written Exam source must be between 1 byte and 1 MiB.';
    end if;

    if p_source_checksum is null or p_source_checksum !~ '^[0-9a-f]{64}$' then
        raise exception using
            errcode = 'invalid_parameter_value',
            message = 'Written Exam source_checksum must be a lowercase SHA-256 hex value.';
    end if;

    if coalesce(pg_catalog.jsonb_typeof(p_questions), 'null') <> 'array' then
        raise exception using
            errcode = 'invalid_parameter_value',
            message = 'Written Exam questions must be a JSON array.';
    end if;

    v_question_count := pg_catalog.jsonb_array_length(p_questions);
    if v_question_count < 1 or v_question_count > 200 then
        raise exception using
            errcode = 'invalid_parameter_value',
            message = 'Written Exam question count must be between 1 and 200.';
    end if;

    -- Resolve package_code inside the trusted transaction. package_code is
    -- never persisted as a second package identity.
    select p.id
    into v_package_id
    from public.packages p
    where p.package_code = p_package_code
    for share;

    if v_package_id is null then
        raise exception using
            errcode = 'foreign_key_violation',
            message = 'Written Exam package_code does not resolve to a package.';
    end if;

    if p_material_id is not null then
        select m.id, m.package_id, m.slug
        into v_material_id, v_material_package_id, v_material_slug
        from public.written_exam_materials m
        where m.id = p_material_id
        for update;

        if v_material_id is null then
            raise exception using
                errcode = 'foreign_key_violation',
                message = 'Written Exam material does not exist.';
        end if;

        if v_material_package_id is distinct from v_package_id
           or v_material_slug is distinct from p_slug
        then
            raise exception using
                errcode = 'check_violation',
                message = 'Written Exam package binding or slug cannot be rebound.';
        end if;
    else
        insert into public.written_exam_materials (
            package_id,
            slug,
            created_by,
            updated_by
        ) values (
            v_package_id,
            p_slug,
            v_actor_id,
            v_actor_id
        )
        on conflict (package_id, slug) do nothing;

        select m.id, m.package_id, m.slug
        into v_material_id, v_material_package_id, v_material_slug
        from public.written_exam_materials m
        where m.package_id = v_package_id
          and m.slug = p_slug
        for update;
    end if;

    if v_material_id is null then
        raise exception using
            errcode = 'foreign_key_violation',
            message = 'Written Exam material could not be resolved.';
    end if;

    select v.id, v.revision_number, v.source_checksum, v.title
    into v_version_id, v_revision_number, v_existing_draft_checksum, v_existing_draft_title
    from public.written_exam_material_versions v
    where v.material_id = v_material_id
      and v.status = 'draft'
    for update;

    -- The source checksum and normalized title together are the retry key. A
    -- repeated Save Draft with both values unchanged is a transactionally safe
    -- no-op, including its questions. A title-only edit remains a real update.
    if v_version_id is not null
       and v_existing_draft_checksum = p_source_checksum
       and v_existing_draft_title = btrim(p_title)
    then
        return pg_catalog.jsonb_build_object(
            'material_id', v_material_id,
            'version_id', v_version_id,
            'revision_number', v_revision_number,
            'question_count', v_question_count,
            'idempotent_retry', true
        );
    end if;

    if v_version_id is null then
        select coalesce(max(v.revision_number), 0) + 1
        into v_revision_number
        from public.written_exam_material_versions v
        where v.material_id = v_material_id;

        insert into public.written_exam_material_versions (
            material_id,
            revision_number,
            format_version,
            title,
            source_md,
            source_checksum,
            source_filename,
            status,
            created_by,
            updated_by
        ) values (
            v_material_id,
            v_revision_number,
            p_format_version,
            btrim(p_title),
            p_source_md,
            p_source_checksum,
            nullif(btrim(p_source_filename), ''),
            'draft',
            v_actor_id,
            v_actor_id
        )
        returning id into v_version_id;
    else
        update public.written_exam_material_versions
        set format_version = p_format_version,
            title = btrim(p_title),
            source_md = p_source_md,
            source_checksum = p_source_checksum,
            source_filename = nullif(btrim(p_source_filename), ''),
            updated_by = v_actor_id
        where id = v_version_id;

        delete from public.written_exam_questions
        where material_version_id = v_version_id;
    end if;

    -- The JSON array is the Parser V1 ordered projection. The database repeats
    -- the sequential-number invariant before replacing the draft atomically.
    for v_question in
        select value
        from pg_catalog.jsonb_array_elements(p_questions)
    loop
        if pg_catalog.jsonb_typeof(v_question) <> 'object' then
            raise exception using
                errcode = 'invalid_parameter_value',
                message = 'Each Written Exam question must be a JSON object.';
        end if;

        if coalesce(v_question->>'question_number', '') !~ '^[0-9]+$' then
            raise exception using
                errcode = 'invalid_parameter_value',
                message = 'Each Written Exam question requires an integer question_number.';
        end if;

        v_question_number := (v_question->>'question_number')::integer;
        if v_question_number <> v_expected_question_number then
            raise exception using
                errcode = 'check_violation',
                message = 'Written Exam question numbers must be sequential from 1.';
        end if;
        v_expected_question_number := v_expected_question_number + 1;

        v_question_markdown := v_question->>'question_markdown';
        v_model_answer_markdown := v_question->>'model_answer_markdown';
        v_answer_structure_markdown := v_question->>'answer_structure_markdown';
        v_memory_technique_markdown := v_question->>'memory_technique_markdown';

        if v_question_markdown is null or char_length(btrim(v_question_markdown)) = 0
           or v_model_answer_markdown is null or char_length(btrim(v_model_answer_markdown)) = 0
           or v_answer_structure_markdown is null or char_length(btrim(v_answer_structure_markdown)) = 0
           or v_memory_technique_markdown is null or char_length(btrim(v_memory_technique_markdown)) = 0
        then
            raise exception using
                errcode = 'invalid_parameter_value',
                message = 'Written Exam questions require all Parser V1 answer sections.';
        end if;

        if coalesce(pg_catalog.jsonb_typeof(v_question->'keywords'), 'null') <> 'array' then
            raise exception using
                errcode = 'invalid_parameter_value',
                message = 'Written Exam Keywords must be a JSON array.';
        end if;

        if exists (
            select 1
            from pg_catalog.jsonb_array_elements(v_question->'keywords') as keyword(value)
            where pg_catalog.jsonb_typeof(keyword.value) <> 'string'
        ) then
            raise exception using
                errcode = 'invalid_parameter_value',
                message = 'Written Exam Keywords must contain strings only.';
        end if;

        v_keywords := array(
            select pg_catalog.jsonb_array_elements_text(v_question->'keywords')
        );

        if coalesce(pg_catalog.cardinality(v_keywords), 0) < 1
           or pg_catalog.cardinality(v_keywords) > 30
           or exists (
               select 1
               from pg_catalog.unnest(v_keywords) as keyword(value)
               where char_length(btrim(keyword.value)) = 0
           )
        then
            raise exception using
                errcode = 'invalid_parameter_value',
                message = 'Written Exam Keywords must contain 1 to 30 non-empty strings.';
        end if;

        v_question_checksum := nullif(v_question->>'question_checksum', '');
        if v_question_checksum is not null
           and v_question_checksum !~ '^[0-9a-f]{64}$'
        then
            raise exception using
                errcode = 'invalid_parameter_value',
                message = 'Written Exam question_checksum must be lowercase SHA-256 hex when present.';
        end if;

        insert into public.written_exam_questions (
            material_version_id,
            question_number,
            question_markdown,
            model_answer_markdown,
            keywords,
            answer_structure_markdown,
            memory_technique_markdown,
            question_checksum
        ) values (
            v_version_id,
            v_question_number,
            v_question_markdown,
            v_model_answer_markdown,
            v_keywords,
            v_answer_structure_markdown,
            v_memory_technique_markdown,
            v_question_checksum
        );
    end loop;

    update public.written_exam_materials
    set updated_by = v_actor_id
    where id = v_material_id;

    return pg_catalog.jsonb_build_object(
        'material_id', v_material_id,
        'version_id', v_version_id,
        'revision_number', v_revision_number,
        'question_count', v_question_count,
        'idempotent_retry', false
    );
end
$function$;

create or replace function public.publish_written_exam(p_material_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, auth, pg_temp
set lock_timeout = '5s'
as $function$
declare
    v_actor_id uuid;
    v_actor_role text;
    v_material_id uuid;
    v_draft_id uuid;
    v_published_id uuid;
    v_question_count bigint;
    v_question_min integer;
    v_question_max integer;
begin
    v_actor_id := auth.uid();

    if v_actor_id is null then
        raise exception using
            errcode = 'insufficient_privilege',
            message = 'An authenticated Owner or Admin is required to publish a Written Exam.';
    end if;

    select p.role
    into v_actor_role
    from public.profiles p
    where p.id = v_actor_id
      and p.role in ('owner', 'admin')
      and p.status = 'active'
      and p.deleted_at is null
    for share;

    if v_actor_role is null then
        raise exception using
            errcode = 'insufficient_privilege',
            message = 'Only an active Owner or Admin may publish a Written Exam.';
    end if;

    select m.id
    into v_material_id
    from public.written_exam_materials m
    where m.id = p_material_id
    for update;

    if v_material_id is null then
        raise exception using
            errcode = 'no_data_found',
            message = 'Written Exam material does not exist.';
    end if;

    select v.id
    into v_draft_id
    from public.written_exam_material_versions v
    where v.material_id = v_material_id
      and v.status = 'draft'
    order by v.revision_number desc
    for update;

    if v_draft_id is null then
        raise exception using
            errcode = 'no_data_found',
            message = 'Written Exam has no draft revision to publish.';
    end if;

    select count(*), min(q.question_number), max(q.question_number)
    into v_question_count, v_question_min, v_question_max
    from public.written_exam_questions q
    where q.material_version_id = v_draft_id;

    if v_question_count < 1
       or v_question_count > 200
       or v_question_min <> 1
       or v_question_max <> v_question_count
    then
        raise exception using
            errcode = 'check_violation',
            message = 'Written Exam draft questions must be sequential before publish.';
    end if;

    -- The material lock serializes Save Draft, Publish, and Archive. Lock and
    -- archive the current publication before promoting the draft, so the
    -- partial unique published index cannot observe two live publications.
    select v.id
    into v_published_id
    from public.written_exam_material_versions v
    where v.material_id = v_material_id
      and v.status = 'published'
    for update;

    if v_published_id is not null then
        update public.written_exam_material_versions
        set status = 'archived',
            updated_by = v_actor_id
        where id = v_published_id;
    end if;

    update public.written_exam_material_versions
    set status = 'published',
        updated_by = v_actor_id
    where id = v_draft_id;

    return pg_catalog.jsonb_build_object(
        'material_id', v_material_id,
        'version_id', v_draft_id,
        'archived_version_id', v_published_id,
        'question_count', v_question_count
    );
end
$function$;

create or replace function public.archive_written_exam(p_material_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, auth, pg_temp
set lock_timeout = '5s'
as $function$
declare
    v_actor_id uuid;
    v_actor_role text;
    v_material_id uuid;
    v_published_id uuid;
begin
    v_actor_id := auth.uid();

    if v_actor_id is null then
        raise exception using
            errcode = 'insufficient_privilege',
            message = 'An authenticated Owner or Admin is required to archive a Written Exam.';
    end if;

    select p.role
    into v_actor_role
    from public.profiles p
    where p.id = v_actor_id
      and p.role in ('owner', 'admin')
      and p.status = 'active'
      and p.deleted_at is null
    for share;

    if v_actor_role is null then
        raise exception using
            errcode = 'insufficient_privilege',
            message = 'Only an active Owner or Admin may archive a Written Exam.';
    end if;

    select m.id
    into v_material_id
    from public.written_exam_materials m
    where m.id = p_material_id
    for update;

    if v_material_id is null then
        raise exception using
            errcode = 'no_data_found',
            message = 'Written Exam material does not exist.';
    end if;

    select v.id
    into v_published_id
    from public.written_exam_material_versions v
    where v.material_id = v_material_id
      and v.status = 'published'
    for update;

    if v_published_id is null then
        raise exception using
            errcode = 'no_data_found',
            message = 'Written Exam has no published revision to archive.';
    end if;

    update public.written_exam_material_versions
    set status = 'archived',
        updated_by = v_actor_id
    where id = v_published_id;

    return pg_catalog.jsonb_build_object(
        'material_id', v_material_id,
        'version_id', v_published_id,
        'status', 'archived'
    );
end
$function$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. Learner-only published projection
-- ─────────────────────────────────────────────────────────────────────────────

create or replace function public.get_published_written_exam_for_learner(
    p_package_slug text,
    p_material_slug text
)
returns table (
    material_id uuid,
    package_id uuid,
    package_slug text,
    package_name text,
    material_slug text,
    material_title text,
    format_version text,
    revision_number integer,
    question_number integer,
    question_markdown text,
    model_answer_markdown text,
    keywords text[],
    answer_structure_markdown text,
    memory_technique_markdown text
)
language sql
stable
security definer
set search_path = pg_catalog, public, auth, pg_temp
as $function$
    select
        m.id,
        p.id,
        p.slug,
        p.name,
        m.slug,
        v.title,
        v.format_version,
        v.revision_number,
        q.question_number,
        q.question_markdown,
        q.model_answer_markdown,
        q.keywords,
        q.answer_structure_markdown,
        q.memory_technique_markdown
    from public.written_exam_materials m
    join public.packages p
      on p.id = m.package_id
    join public.written_exam_material_versions v
      on v.material_id = m.id
     and v.status = 'published'
    join public.written_exam_questions q
      on q.material_version_id = v.id
    where auth.uid() is not null
      and p.slug = p_package_slug
      and m.slug = p_material_slug
      and p.is_published = true
      and (
          exists (
              select 1
              from public.profiles actor
              where actor.id = auth.uid()
                and actor.role in ('owner', 'admin')
                and actor.status = 'active'
                and actor.deleted_at is null
          )
          or exists (
              select 1
              from public.orders o
              where o.user_id = auth.uid()
                and o.package_id = m.package_id
                and o.status in ('paid', 'free')
          )
      )
    order by q.question_number;
$function$;

-- All four APIs are callable only by an authenticated browser role. The
-- write functions derive actor identity from auth.uid(); no caller role or
-- actor parameter exists. service_role is deliberately not granted execute,
-- which prevents a null-auth actor from bypassing the application boundary.
revoke all on function public.save_written_exam_draft(uuid, text, text, text, text, text, text, text, jsonb)
    from public, anon, authenticated, service_role;
grant execute on function public.save_written_exam_draft(uuid, text, text, text, text, text, text, text, jsonb)
    to authenticated;

revoke all on function public.publish_written_exam(uuid)
    from public, anon, authenticated, service_role;
grant execute on function public.publish_written_exam(uuid)
    to authenticated;

revoke all on function public.archive_written_exam(uuid)
    from public, anon, authenticated, service_role;
grant execute on function public.archive_written_exam(uuid)
    to authenticated;

revoke all on function public.get_published_written_exam_for_learner(text, text)
    from public, anon, authenticated, service_role;
grant execute on function public.get_published_written_exam_for_learner(text, text)
    to authenticated;

comment on function public.save_written_exam_draft(uuid, text, text, text, text, text, text, text, jsonb) is
    'Atomic Parser V1 Written Exam draft save with package binding, revision, question replacement, and checksum idempotency.';
comment on function public.publish_written_exam(uuid) is
    'Atomic Owner/Admin publication transition. Archives the prior publication before promoting the locked draft.';
comment on function public.archive_written_exam(uuid) is
    'Owner/Admin archive transition. Written Exam content is retained; hard delete is not an API.';
comment on function public.get_published_written_exam_for_learner(text, text) is
    'Authenticated paid/free or active Owner/Admin learner projection. Raw source and audit fields are intentionally excluded.';

-- ─────────────────────────────────────────────────────────────────────────────
-- 6. Security postflight
-- ─────────────────────────────────────────────────────────────────────────────

do $written_exam_postflight$
declare
    function_signature text;
begin
    for function_signature in
        select signature
        from (values
            ('public.save_written_exam_draft(uuid, text, text, text, text, text, text, text, jsonb)'),
            ('public.publish_written_exam(uuid)'),
            ('public.archive_written_exam(uuid)'),
            ('public.get_published_written_exam_for_learner(text, text)')
        ) as expected(signature)
    loop
        if pg_catalog.to_regprocedure(function_signature) is null then
            raise exception using
                errcode = 'check_violation',
                message = format('Written Exam RPC is missing: %s.', function_signature);
        end if;

        if pg_catalog.has_function_privilege('anon', function_signature, 'EXECUTE')
           or pg_catalog.has_function_privilege('service_role', function_signature, 'EXECUTE')
           or not pg_catalog.has_function_privilege('authenticated', function_signature, 'EXECUTE')
        then
            raise exception using
                errcode = 'insufficient_privilege',
                message = format('Written Exam RPC ACL is not authenticated-only: %s.', function_signature);
        end if;
    end loop;

    for function_signature in
        select relation_name
        from (values
            ('public.written_exam_materials'),
            ('public.written_exam_material_versions'),
            ('public.written_exam_questions')
        ) as expected(relation_name)
    loop
        if pg_catalog.has_table_privilege('authenticated', function_signature, 'INSERT')
           or pg_catalog.has_table_privilege('authenticated', function_signature, 'UPDATE')
           or pg_catalog.has_table_privilege('authenticated', function_signature, 'DELETE')
        then
            raise exception using
                errcode = 'insufficient_privilege',
                message = format('Written Exam raw-table DML is exposed to authenticated: %s.', function_signature);
        end if;
    end loop;
end
$written_exam_postflight$;
