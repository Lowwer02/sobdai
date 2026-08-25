-- 083_written_exam_learner_discovery.sql
--
-- WE-4 — narrow, learner-safe Written Exam discovery.
--
-- Package pages may expose the existence and safe metadata of published
-- Written Exam material for an already-public package. Question bodies remain
-- behind migration 082's authenticated, entitlement-aware learner reader.
-- This migration deliberately does not alter 082 or grant raw-table access.

set local lock_timeout = '5s';

-- ─────────────────────────────────────────────────────────────────────────────
-- 0. Fail-closed predecessor and collision gate
-- ─────────────────────────────────────────────────────────────────────────────

do $written_exam_discovery_preflight$
declare
    required_relation text;
    required_column record;
begin
    for required_relation in
        select relation_name
        from (values
            ('packages'),
            ('written_exam_materials'),
            ('written_exam_material_versions'),
            ('written_exam_questions')
        ) as required(relation_name)
    loop
        if pg_catalog.to_regclass(format('public.%I', required_relation)) is null then
            raise exception using
                errcode = 'check_violation',
                message = format(
                    'Written Exam discovery migration 083 requires public.%I.',
                    required_relation
                );
        end if;
    end loop;

    for required_column in
        select table_name, column_name
        from (values
            ('packages', 'id'),
            ('packages', 'slug'),
            ('packages', 'is_published'),
            ('written_exam_materials', 'id'),
            ('written_exam_materials', 'package_id'),
            ('written_exam_materials', 'slug'),
            ('written_exam_material_versions', 'material_id'),
            ('written_exam_material_versions', 'status'),
            ('written_exam_material_versions', 'title'),
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
                    'Written Exam discovery migration 083 requires public.%I.%I.',
                    required_column.table_name,
                    required_column.column_name
                );
        end if;
    end loop;

    if pg_catalog.to_regprocedure('public.get_published_written_exam_for_learner(text, text)') is null then
        raise exception using
            errcode = 'check_violation',
            message = 'Written Exam discovery migration 083 requires migration 082 learner reader.';
    end if;

    if pg_catalog.to_regprocedure('public.get_published_written_exam_materials_for_package(text)') is not null then
        raise exception using
            errcode = 'duplicate_object',
            message = 'Written Exam discovery RPC already exists.';
    end if;
end
$written_exam_discovery_preflight$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Learner-safe published metadata projection
-- ─────────────────────────────────────────────────────────────────────────────

create function public.get_published_written_exam_materials_for_package(
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
        v.title,
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
    group by m.slug, v.title
    having count(q.id) > 0
    order by v.title, m.slug
    limit 20;
$function$;

-- Discovery is intentionally callable to anon and authenticated because the
-- package page is public and only returns metadata for already-published
-- public packages. The 082 content reader remains authenticated-only and
-- performs the authoritative entitlement check. service_role is explicitly
-- excluded so the public/browser contract cannot be bypassed accidentally.
revoke all on function public.get_published_written_exam_materials_for_package(text)
    from public, anon, authenticated, service_role;
grant execute on function public.get_published_written_exam_materials_for_package(text)
    to anon, authenticated;

comment on function public.get_published_written_exam_materials_for_package(text) is
    'WE-4 learner-safe metadata discovery for published Written Exam materials in public packages; content remains behind the 082 learner reader.';

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Security postflight
-- ─────────────────────────────────────────────────────────────────────────────

do $written_exam_discovery_postflight$
declare
    function_signature text := 'public.get_published_written_exam_materials_for_package(text)';
begin
    if not pg_catalog.has_function_privilege('anon', function_signature, 'EXECUTE')
       or not pg_catalog.has_function_privilege('authenticated', function_signature, 'EXECUTE')
       or pg_catalog.has_function_privilege('service_role', function_signature, 'EXECUTE')
    then
        raise exception using
            errcode = 'insufficient_privilege',
            message = 'Written Exam discovery RPC ACL must be anon/authenticated-only.';
    end if;

    if pg_catalog.to_regprocedure('public.get_published_written_exam_for_learner(text, text)') is null then
        raise exception using
            errcode = 'check_violation',
            message = 'Written Exam 082 learner reader disappeared while installing discovery.';
    end if;
end
$written_exam_discovery_postflight$;
