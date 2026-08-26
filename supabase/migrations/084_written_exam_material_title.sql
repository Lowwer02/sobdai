-- 084_written_exam_material_title.sql
--
-- Written Exam final UX polish — material metadata title.
--
-- Revision titles remain part of the imported content revision and remain
-- immutable after publication. This migration adds the independently editable
-- material label used by the Admin library and learner discovery surfaces.

set local lock_timeout = '5s';

-- ─────────────────────────────────────────────────────────────────────────────
-- 0. Fail-closed predecessor and collision gate
-- ─────────────────────────────────────────────────────────────────────────────

do $written_exam_material_title_preflight$
declare
    required_relation text;
    required_column record;
begin
    for required_relation in
        select relation_name
        from (values
            ('packages'),
            ('profiles'),
            ('written_exam_materials'),
            ('written_exam_material_versions'),
            ('written_exam_questions')
        ) as required(relation_name)
    loop
        if pg_catalog.to_regclass(format('public.%I', required_relation)) is null then
            raise exception using
                errcode = 'check_violation',
                message = format(
                    'Written Exam material title migration 084 requires public.%I.',
                    required_relation
                );
        end if;
    end loop;

    for required_column in
        select table_name, column_name
        from (values
            ('written_exam_materials', 'id'),
            ('written_exam_materials', 'package_id'),
            ('written_exam_materials', 'slug'),
            ('written_exam_material_versions', 'material_id'),
            ('written_exam_material_versions', 'title'),
            ('written_exam_material_versions', 'status'),
            ('written_exam_questions', 'material_version_id')
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
                    'Written Exam material title migration 084 requires public.%I.%I.',
                    required_column.table_name,
                    required_column.column_name
                );
        end if;
    end loop;

    if pg_catalog.to_regprocedure('public.get_published_written_exam_for_learner(text, text)') is null
       or pg_catalog.to_regprocedure('public.get_published_written_exam_materials_for_package(text)') is null then
        raise exception using
            errcode = 'check_violation',
            message = 'Written Exam material title migration 084 requires the 082/083 learner RPCs.';
    end if;

    if exists (
        select 1
        from information_schema.columns c
        where c.table_schema = 'public'
          and c.table_name = 'written_exam_materials'
          and c.column_name = 'title'
    ) then
        raise exception using
            errcode = 'duplicate_object',
            message = 'Written Exam material title column already exists.';
    end if;

    if pg_catalog.to_regprocedure('public.update_written_exam_material_title(uuid, text)') is not null then
        raise exception using
            errcode = 'duplicate_object',
            message = 'Written Exam material title RPC already exists.';
    end if;
end
$written_exam_material_title_preflight$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Material metadata title and legacy backfill
-- ─────────────────────────────────────────────────────────────────────────────

alter table public.written_exam_materials
    add column title text null;

-- Prefer the current publication, then a current draft, then the newest
-- retained revision. Existing materials therefore receive a stable metadata
-- title without changing any revision or question row.
update public.written_exam_materials as m
set title = seed.title
from lateral (
    select v.title
    from public.written_exam_material_versions v
    where v.material_id = m.id
    order by
        case v.status
            when 'published' then 0
            when 'draft' then 1
            else 2
        end,
        v.revision_number desc,
        v.id desc
    limit 1
) as seed
where m.title is null;

alter table public.written_exam_materials
    add constraint written_exam_materials_title_check
    check (
        title is null
        or char_length(btrim(title)) between 1 and 300
    );

comment on column public.written_exam_materials.title is
    'Independently editable learner/Admin label; null legacy/new rows fall back to the active revision title.';

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Authorized material metadata title update
-- ─────────────────────────────────────────────────────────────────────────────

create function public.update_written_exam_material_title(
    p_material_id uuid,
    p_title text
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
    v_material_id uuid;
    v_title text;
begin
    v_actor_id := auth.uid();

    if v_actor_id is null then
        raise exception using
            errcode = 'insufficient_privilege',
            message = 'An authenticated content editor is required to edit a Written Exam title.';
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
            message = 'Only an active Owner, Admin, or Editor may edit a Written Exam title.';
    end if;

    if p_material_id is null then
        raise exception using
            errcode = 'invalid_parameter_value',
            message = 'Written Exam material id is required.';
    end if;

    if p_title is null or char_length(btrim(p_title)) not between 1 and 300 then
        raise exception using
            errcode = 'invalid_parameter_value',
            message = 'Written Exam material title is required.';
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

    v_title := btrim(p_title);

    -- Deliberately update only material metadata. Package binding, slug,
    -- revisions, published content, and normalized questions are not touched.
    update public.written_exam_materials
    set title = v_title,
        updated_by = v_actor_id
    where id = v_material_id;

    return pg_catalog.jsonb_build_object(
        'material_id', v_material_id,
        'title', v_title
    );
end
$function$;

revoke all on function public.update_written_exam_material_title(uuid, text)
    from public, anon, authenticated, service_role;
grant execute on function public.update_written_exam_material_title(uuid, text)
    to authenticated;

comment on function public.update_written_exam_material_title(uuid, text) is
    'Authorized material-level Written Exam title edit. It never changes package binding, slug, revision content, or questions.';

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. Keep learner-safe projections on the material metadata title
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
        coalesce(m.title, v.title),
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

revoke all on function public.get_published_written_exam_for_learner(text, text)
    from public, anon, authenticated, service_role;
grant execute on function public.get_published_written_exam_for_learner(text, text)
    to authenticated;

create or replace function public.get_published_written_exam_materials_for_package(
    p_package_slug text
)
returns table (
    material_slug text,
    material_title text,
    question_count integer
)
language sql
stable
security definer
set search_path = pg_catalog, public, auth, pg_temp
as $function$
    select
        m.slug,
        coalesce(m.title, v.title),
        count(q.id)::integer
    from public.packages p
    join public.written_exam_materials m
      on m.package_id = p.id
    join public.written_exam_material_versions v
      on v.material_id = m.id
     and v.status = 'published'
    join public.written_exam_questions q
      on q.material_version_id = v.id
    where p.slug = p_package_slug
      and p.is_published = true
    group by m.slug, coalesce(m.title, v.title)
    having count(q.id) > 0
    order by coalesce(m.title, v.title), m.slug
    limit 20;
$function$;

revoke all on function public.get_published_written_exam_materials_for_package(text)
    from public, anon, authenticated, service_role;
grant execute on function public.get_published_written_exam_materials_for_package(text)
    to anon, authenticated;

comment on function public.get_published_written_exam_for_learner(text, text) is
    'Authenticated paid/free or active Owner/Admin learner projection using the editable material title; raw source and audit fields remain excluded.';
comment on function public.get_published_written_exam_materials_for_package(text) is
    'WE-4 learner-safe metadata discovery using the editable material title; content remains behind the 082 learner reader.';

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. Security postflight
-- ─────────────────────────────────────────────────────────────────────────────

do $written_exam_material_title_postflight$
declare
    title_signature text := 'public.update_written_exam_material_title(uuid, text)';
begin
    if not exists (
        select 1
        from information_schema.columns c
        where c.table_schema = 'public'
          and c.table_name = 'written_exam_materials'
          and c.column_name = 'title'
    ) then
        raise exception using
            errcode = 'check_violation',
            message = 'Written Exam material title column was not installed.';
    end if;

    if pg_catalog.to_regprocedure(title_signature) is null then
        raise exception using
            errcode = 'check_violation',
            message = 'Written Exam material title RPC was not installed.';
    end if;

    if not pg_catalog.has_function_privilege('authenticated', title_signature, 'EXECUTE')
       or pg_catalog.has_function_privilege('anon', title_signature, 'EXECUTE')
       or pg_catalog.has_function_privilege('service_role', title_signature, 'EXECUTE')
    then
        raise exception using
            errcode = 'insufficient_privilege',
            message = 'Written Exam material title RPC ACL must be authenticated-only.';
    end if;

    if pg_catalog.to_regprocedure('public.get_published_written_exam_for_learner(text, text)') is null
       or pg_catalog.to_regprocedure('public.get_published_written_exam_materials_for_package(text)') is null then
        raise exception using
            errcode = 'check_violation',
            message = 'Written Exam learner projections disappeared while installing material title.';
    end if;
end
$written_exam_material_title_postflight$;
