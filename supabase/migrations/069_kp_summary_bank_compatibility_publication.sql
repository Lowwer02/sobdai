-- 069_kp_summary_bank_compatibility_publication.sql
-- Sobdai Knowledge Platform — compatibility publish/unpublish lifecycle.

set local lock_timeout = '5s';

do $kp_compatibility_publication_preflight$
declare
    v_publish oid;
    v_api_owner oid;
    v_definition text;
begin
    if to_regclass('public.summaries') is null
       or to_regclass('public.summary_versions') is null
       or to_regclass('public.summary_version_reference_documents') is null
       or to_regclass('public.package_summaries') is null
    then
        raise exception using
            errcode = 'check_violation',
            message = 'Knowledge Platform migration 069 requires the frozen Summary publication aggregate.';
    end if;

    if not exists (
        select 1
        from information_schema.columns c
        where c.table_schema = 'public'
          and c.table_name = 'package_summaries'
          and c.column_name = 'is_summary_bank_compatibility'
          and c.udt_name = 'bool'
          and c.is_nullable = 'NO'
    )
       or to_regclass('public.package_summaries_one_bank_compatibility_key') is null
       or not exists (
            select 1
            from pg_catalog.pg_constraint c
            where c.conrelid = 'public.package_summaries'::regclass
              and c.conname = 'package_summaries_bank_compatibility_slug_check'
              and c.contype = 'c'
              and c.convalidated
       )
    then
        raise exception using
            errcode = 'check_violation',
            message = 'Knowledge Platform migration 069 requires migration 067 marker schema and invariants.';
    end if;

    v_publish := to_regprocedure('public.kp_persist_publish_compatibility_revision(uuid,uuid,uuid,jsonb)');
    if v_publish is null
       or to_regprocedure('public.kp_persist_require_actor(uuid)') is null
       or to_regprocedure('public.kp_enforce_summary_writer_boundary()') is null
    then
        raise exception using
            errcode = 'check_violation',
            message = 'Knowledge Platform migration 069 requires the frozen 057/058 persistence boundary.';
    end if;

    if to_regprocedure('public.kp_persist_unpublish_compatibility_summary(uuid,uuid)') is not null then
        raise exception using
            errcode = 'duplicate_function',
            message = 'Knowledge Platform migration 069 found a pre-existing compatibility unpublish signature.';
    end if;

    select p.proowner, pg_catalog.pg_get_functiondef(p.oid)
    into v_api_owner, v_definition
    from pg_catalog.pg_proc p
    where p.oid = v_publish
      and p.prosecdef
      and array_to_string(p.proconfig, ',') ilike '%search_path=pg_catalog, public, pg_temp%'
      and array_to_string(p.proconfig, ',') ilike '%lock_timeout=5s%';

    if v_api_owner is null
       or pg_catalog.pg_get_userbyid(v_api_owner) is distinct from current_user
    then
        raise exception using
            errcode = 'insufficient_privilege',
            message = 'Knowledge Platform migration 069 must run as the existing persistence API owner.';
    end if;

    select pg_catalog.pg_get_functiondef(
        to_regprocedure('public.kp_persist_update_compatibility_draft(uuid,uuid,text,text,text,text,text,text,uuid,text,text,text,integer,text,text,text,uuid,integer,integer,text)')
    ) into v_definition;
    if v_definition is null
       or position('is_summary_bank_compatibility' in v_definition) = 0
    then
        raise exception using
            errcode = 'check_violation',
            message = 'Knowledge Platform migration 069 requires migration 068 marker-aware writer core.';
    end if;

    if exists (
        select 1
        from public.summaries s
        where (
            select count(*)
            from public.package_summaries ps
            where ps.summary_id = s.id
              and ps.is_summary_bank_compatibility
        ) <> 1
    )
       or exists (
            select 1
            from public.summaries s
            join public.package_summaries ps
              on ps.summary_id = s.id
             and ps.is_summary_bank_compatibility
            where ps.legacy_slug is null
               or nullif(btrim(ps.legacy_slug), '') is null
               or ps.legacy_slug is distinct from lower(btrim(ps.legacy_slug))
               or ps.package_id is distinct from s.package_id
               or ps.legacy_slug is distinct from s.slug
       )
    then
        raise exception using
            errcode = 'cardinality_violation',
            message = 'Knowledge Platform migration 069 found corrupted compatibility marker state.';
    end if;
end
$kp_compatibility_publication_preflight$;

create or replace function public.kp_persist_publish_compatibility_revision(
    p_summary_id uuid,
    p_version_id uuid,
    p_actor_id uuid,
    p_source_snapshots jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
set lock_timeout = '5s'
as $function$
declare
    v_now timestamptz := clock_timestamp();
    v_summary public.summaries%rowtype;
    v_version public.summary_versions%rowtype;
    v_placement public.package_summaries%rowtype;
    v_marker_count bigint;
    v_affected bigint;
begin
    perform public.kp_persist_require_actor(p_actor_id);
    if p_summary_id is null or p_version_id is null then
        raise exception using errcode = 'invalid_parameter_value', message = 'Summary and revision IDs are required.';
    end if;
    if p_source_snapshots is null or jsonb_typeof(p_source_snapshots) <> 'array' then
        raise exception using errcode = 'invalid_parameter_value', message = 'Source snapshots must be a JSON array.';
    end if;

    select * into v_summary
    from public.summaries s
    where s.id = p_summary_id
    for update;
    if not found then
        raise exception using errcode = 'no_data_found', message = 'Summary does not exist.';
    end if;

    select * into v_placement
    from public.package_summaries ps
    where ps.summary_id = p_summary_id
      and ps.is_summary_bank_compatibility
    for update;
    if not found then
        raise exception using errcode = 'object_not_in_prerequisite_state', message = 'Marked compatibility PackageSummary placement is missing.';
    end if;

    select count(*) into v_marker_count
    from public.package_summaries ps
    where ps.summary_id = p_summary_id
      and ps.is_summary_bank_compatibility;
    if v_marker_count <> 1 then
        raise exception using errcode = 'cardinality_violation', message = 'Compatibility publication found corrupted marker cardinality.';
    end if;
    if v_placement.legacy_slug is null
       or nullif(btrim(v_placement.legacy_slug), '') is null
       or v_placement.legacy_slug is distinct from lower(btrim(v_placement.legacy_slug))
       or v_placement.package_id is distinct from v_summary.package_id
       or v_placement.legacy_slug is distinct from v_summary.slug
    then
        raise exception using errcode = 'object_not_in_prerequisite_state', message = 'Compatibility publication found invalid or divergent marked-placement legacy state.';
    end if;

    select * into v_version
    from public.summary_versions sv
    where sv.id = p_version_id
      and sv.summary_id = p_summary_id
    for update;
    if not found then
        raise exception using errcode = 'no_data_found', message = 'Summary revision does not belong to the Summary.';
    end if;

    -- A compatibility unpublish keeps the published revision and pointer. A
    -- subsequent publish reactivates only that same hidden marked placement;
    -- it never rewrites immutable revision provenance or source snapshots.
    if v_version.status = 'published' then
        if v_summary.current_published_version_id is distinct from p_version_id
           or v_version.submitted_for_review_at is null
           or v_version.reviewed_by is null
           or v_version.reviewed_at is null
           or v_version.published_by is null
           or v_version.published_at is null
        then
            raise exception using errcode = 'object_not_in_prerequisite_state', message = 'Published compatibility revision or publication audit is inconsistent with the current pointer.';
        end if;

        if v_summary.is_published and v_placement.status = 'active' then
            return jsonb_build_object(
                'summary_id', p_summary_id,
                'summary_version_id', p_version_id,
                'package_id', v_placement.package_id,
                'idempotent_retry', true,
                'republished', false
            );
        end if;

        if not v_summary.is_published and v_placement.status = 'hidden' then
            update public.summaries
            set is_published = true,
                updated_at = v_now
            where id = p_summary_id;

            update public.package_summaries
            set status = 'active',
                activated_by = p_actor_id,
                activated_at = v_now,
                hidden_by = null,
                hidden_at = null,
                updated_at = v_now
            where package_id = v_placement.package_id
              and summary_id = p_summary_id
              and is_summary_bank_compatibility;

            get diagnostics v_affected = row_count;
            if v_affected <> 1 then
                raise exception using errcode = 'cardinality_violation', message = 'Compatibility republish did not reactivate exactly one marked placement.';
            end if;

            return jsonb_build_object(
                'summary_id', p_summary_id,
                'summary_version_id', p_version_id,
                'package_id', v_placement.package_id,
                'idempotent_retry', false,
                'republished', true
            );
        end if;

        raise exception using errcode = 'object_not_in_prerequisite_state', message = 'Compatibility republish found inconsistent Summary/placement publication state.';
    end if;

    -- Summary Bank exposes one-click publication. A draft therefore records a
    -- complete review submission and approval audit before following the
    -- frozen draft -> in_review -> published transition in one transaction.
    if v_version.status = 'draft' then
        update public.summary_versions
        set status = 'in_review',
            submitted_for_review_at = coalesce(submitted_for_review_at, v_now),
            reviewed_by = p_actor_id,
            reviewed_at = v_now,
            updated_at = v_now
        where id = p_version_id
          and summary_id = p_summary_id
          and status = 'draft';

        get diagnostics v_affected = row_count;
        if v_affected <> 1 then
            raise exception using errcode = 'cardinality_violation', message = 'Compatibility publication did not advance exactly one draft into review.';
        end if;
    elsif v_version.status = 'in_review' then
        if v_version.submitted_for_review_at is null
           or v_version.reviewed_by is null
           or v_version.reviewed_at is null
        then
            raise exception using errcode = 'object_not_in_prerequisite_state', message = 'Publication requires recorded review submission and approval.';
        end if;
    else
        raise exception using errcode = 'object_not_in_prerequisite_state', message = 'Only a draft or approved in-review compatibility revision can be published.';
    end if;

    delete from public.summary_version_reference_documents
    where summary_version_id = p_version_id;

    insert into public.summary_version_reference_documents (
        id,
        summary_version_id,
        reference_document_id,
        reference_document_version_id,
        role,
        coverage_note,
        sort_order,
        created_at
    )
    select
        uuid_generate_v4(),
        p_version_id,
        snapshot.reference_document_id,
        snapshot.reference_document_version_id,
        snapshot.role,
        nullif(btrim(snapshot.coverage_note), ''),
        coalesce(snapshot.sort_order, 0),
        v_now
    from jsonb_to_recordset(p_source_snapshots) as snapshot(
        reference_document_id uuid,
        reference_document_version_id uuid,
        role text,
        coverage_note text,
        sort_order integer
    );

    update public.summary_versions
    set status = 'published',
        published_by = p_actor_id,
        published_at = v_now,
        updated_at = v_now
    where id = p_version_id
      and summary_id = p_summary_id
      and status = 'in_review';

    get diagnostics v_affected = row_count;
    if v_affected <> 1 then
        raise exception using errcode = 'cardinality_violation', message = 'Compatibility publication did not publish exactly one reviewed revision.';
    end if;

    update public.summaries
    set current_published_version_id = p_version_id,
        is_published = true,
        title = v_summary.canonical_title,
        slug = v_placement.legacy_slug,
        subject = v_summary.subject,
        topic = v_summary.topic,
        law = v_summary.law,
        content_md = v_version.content_md,
        read_time_minutes = v_version.read_time_minutes,
        updated_at = v_now
    where id = p_summary_id;

    update public.package_summaries
    set status = 'active',
        activated_by = p_actor_id,
        activated_at = v_now,
        hidden_by = null,
        hidden_at = null,
        updated_at = v_now
    where package_id = v_placement.package_id
      and summary_id = p_summary_id
      and is_summary_bank_compatibility;

    get diagnostics v_affected = row_count;
    if v_affected <> 1 then
        raise exception using errcode = 'cardinality_violation', message = 'Compatibility publication did not activate exactly one marked placement.';
    end if;

    return jsonb_build_object(
        'summary_id', p_summary_id,
        'summary_version_id', p_version_id,
        'package_id', v_placement.package_id,
        'idempotent_retry', false,
        'republished', false
    );
end
$function$;

comment on function public.kp_persist_publish_compatibility_revision(uuid,uuid,uuid,jsonb) is
    'Atomic Summary Bank publication: validates the marked placement, records review/publication audit, advances the current pointer, and supports reactivation after compatibility unpublish.';

create or replace function public.kp_persist_unpublish_compatibility_summary(
    p_summary_id uuid,
    p_actor_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
set lock_timeout = '5s'
as $function$
declare
    v_now timestamptz := clock_timestamp();
    v_summary public.summaries%rowtype;
    v_version public.summary_versions%rowtype;
    v_placement public.package_summaries%rowtype;
    v_marker_count bigint;
    v_affected bigint;
begin
    perform public.kp_persist_require_actor(p_actor_id);
    if p_summary_id is null then
        raise exception using errcode = 'invalid_parameter_value', message = 'Summary ID is required.';
    end if;

    select * into v_summary
    from public.summaries s
    where s.id = p_summary_id
    for update;
    if not found then
        raise exception using errcode = 'no_data_found', message = 'Summary does not exist.';
    end if;

    select * into v_placement
    from public.package_summaries ps
    where ps.summary_id = p_summary_id
      and ps.is_summary_bank_compatibility
    for update;
    if not found then
        raise exception using errcode = 'object_not_in_prerequisite_state', message = 'Marked compatibility PackageSummary placement is missing.';
    end if;

    select count(*) into v_marker_count
    from public.package_summaries ps
    where ps.summary_id = p_summary_id
      and ps.is_summary_bank_compatibility;
    if v_marker_count <> 1 then
        raise exception using errcode = 'cardinality_violation', message = 'Compatibility unpublish found corrupted marker cardinality.';
    end if;
    if v_placement.legacy_slug is null
       or nullif(btrim(v_placement.legacy_slug), '') is null
       or v_placement.legacy_slug is distinct from lower(btrim(v_placement.legacy_slug))
       or v_placement.package_id is distinct from v_summary.package_id
       or v_placement.legacy_slug is distinct from v_summary.slug
    then
        raise exception using errcode = 'object_not_in_prerequisite_state', message = 'Compatibility unpublish found invalid or divergent marked-placement legacy state.';
    end if;

    if v_summary.current_published_version_id is null then
        raise exception using errcode = 'object_not_in_prerequisite_state', message = 'Compatibility unpublish requires a current published revision.';
    end if;

    select * into v_version
    from public.summary_versions sv
    where sv.id = v_summary.current_published_version_id
      and sv.summary_id = p_summary_id
    for update;
    if not found
       or v_version.status <> 'published'
       or v_version.submitted_for_review_at is null
       or v_version.reviewed_by is null
       or v_version.reviewed_at is null
       or v_version.published_by is null
       or v_version.published_at is null
    then
        raise exception using errcode = 'object_not_in_prerequisite_state', message = 'Compatibility unpublish found invalid current revision publication state.';
    end if;

    if not v_summary.is_published and v_placement.status = 'hidden' then
        return jsonb_build_object(
            'summary_id', p_summary_id,
            'summary_version_id', v_summary.current_published_version_id,
            'package_id', v_placement.package_id,
            'idempotent_retry', true
        );
    end if;

    if not v_summary.is_published or v_placement.status <> 'active' then
        raise exception using errcode = 'object_not_in_prerequisite_state', message = 'Compatibility unpublish found inconsistent Summary/placement publication state.';
    end if;

    update public.summaries
    set is_published = false,
        updated_at = v_now
    where id = p_summary_id;

    get diagnostics v_affected = row_count;
    if v_affected <> 1 then
        raise exception using errcode = 'cardinality_violation', message = 'Compatibility unpublish did not update exactly one Summary.';
    end if;

    update public.package_summaries
    set status = 'hidden',
        activated_by = null,
        activated_at = null,
        hidden_by = p_actor_id,
        hidden_at = v_now,
        updated_at = v_now
    where package_id = v_placement.package_id
      and summary_id = p_summary_id
      and is_summary_bank_compatibility;

    get diagnostics v_affected = row_count;
    if v_affected <> 1 then
        raise exception using errcode = 'cardinality_violation', message = 'Compatibility unpublish did not hide exactly one marked placement.';
    end if;

    return jsonb_build_object(
        'summary_id', p_summary_id,
        'summary_version_id', v_summary.current_published_version_id,
        'package_id', v_placement.package_id,
        'idempotent_retry', false
    );
end
$function$;

comment on function public.kp_persist_unpublish_compatibility_summary(uuid,uuid) is
    'Atomic Summary Bank unpublish: hides the marked placement and legacy visibility while preserving the published revision, current pointer, and all review/publication history.';

revoke all on function public.kp_persist_publish_compatibility_revision(uuid,uuid,uuid,jsonb)
    from public, anon, authenticated;
revoke all on function public.kp_persist_unpublish_compatibility_summary(uuid,uuid)
    from public, anon, authenticated;

grant execute on function public.kp_persist_publish_compatibility_revision(uuid,uuid,uuid,jsonb)
    to service_role;
grant execute on function public.kp_persist_unpublish_compatibility_summary(uuid,uuid)
    to service_role;

do $kp_compatibility_publication_postflight$
declare
    expected record;
    v_function oid;
    v_api_owner oid;
    v_definition text;
begin
    select p.proowner into v_api_owner
    from pg_catalog.pg_proc p
    where p.oid = to_regprocedure('public.kp_persist_require_actor(uuid)');

    for expected in
        select function_name, required_fragment
        from (values
            ('public.kp_persist_publish_compatibility_revision(uuid,uuid,uuid,jsonb)', 'republished'),
            ('public.kp_persist_unpublish_compatibility_summary(uuid,uuid)', 'current_published_version_id')
        ) as required(function_name, required_fragment)
    loop
        v_function := to_regprocedure(expected.function_name);
        if v_function is null then
            raise exception using
                errcode = 'check_violation',
                message = format('Knowledge Platform migration 069 failed to install signature: %s.', expected.function_name);
        end if;

        select pg_catalog.pg_get_functiondef(p.oid)
        into v_definition
        from pg_catalog.pg_proc p
        where p.oid = v_function
          and p.proowner = v_api_owner
          and p.prosecdef
          and array_to_string(p.proconfig, ',') ilike '%search_path=pg_catalog, public, pg_temp%'
          and array_to_string(p.proconfig, ',') ilike '%lock_timeout=5s%';

        if v_definition is null
           or position('is_summary_bank_compatibility' in v_definition) = 0
           or position(expected.required_fragment in v_definition) = 0
        then
            raise exception using
                errcode = 'check_violation',
                message = format('Knowledge Platform migration 069 installed a divergent publication writer: %s.', expected.function_name);
        end if;

        if has_function_privilege('public', v_function, 'EXECUTE')
           or has_function_privilege('anon', v_function, 'EXECUTE')
           or has_function_privilege('authenticated', v_function, 'EXECUTE')
           or not has_function_privilege('service_role', v_function, 'EXECUTE')
        then
            raise exception using
                errcode = 'check_violation',
                message = format('Knowledge Platform migration 069 failed to preserve service-role-only execution: %s.', expected.function_name);
        end if;
    end loop;
end
$kp_compatibility_publication_postflight$;

notify pgrst, 'reload schema';
