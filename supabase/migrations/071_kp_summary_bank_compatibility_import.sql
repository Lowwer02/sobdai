-- 071_kp_summary_bank_compatibility_import.sql
-- Sobdai Knowledge Platform — Summary Bank Markdown import new/replace.

set local lock_timeout = '5s';

do $kp_compatibility_import_preflight$
declare
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
            message = 'Knowledge Platform migration 071 requires the frozen Summary aggregate.';
    end if;

    if not exists (
        select 1
        from information_schema.columns c
        where c.table_schema = 'public'
          and c.table_name = 'summaries'
          and c.column_name = 'document'
          and c.udt_name = 'text'
    )
       or not exists (
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
            message = 'Knowledge Platform migration 071 requires migration 067 marker and legacy document compatibility state.';
    end if;

    if to_regprocedure('public.kp_persist_require_actor(uuid)') is null
       or to_regprocedure('public.kp_enforce_summary_writer_boundary()') is null
       or to_regprocedure('public.kp_persist_create_compatibility_summary(uuid,text,text,text,text,text,text,text,uuid,text,text,text,integer,text,text,text,uuid,uuid,integer,integer,text)') is null
       or to_regprocedure('public.kp_persist_update_compatibility_draft(uuid,uuid,text,text,text,text,text,text,uuid,text,text,text,integer,text,text,text,uuid,integer,integer,text)') is null
       or to_regprocedure('public.kp_persist_publish_compatibility_revision(uuid,uuid,uuid,jsonb)') is null
       or to_regprocedure('public.kp_persist_unpublish_compatibility_summary(uuid,uuid)') is null
       or to_regprocedure('public.kp_persist_delete_compatibility_summary(uuid,uuid)') is null
    then
        raise exception using
            errcode = 'check_violation',
            message = 'Knowledge Platform migration 071 requires migrations 058 and 068 through 070.';
    end if;

    if to_regprocedure('public.kp_persist_create_compatibility_summary(uuid,text,text,text,text,text,text,text,uuid,text,text,text,integer,text,text,text,uuid,uuid,integer,integer,text,text,boolean)') is not null
       or to_regprocedure('public.kp_persist_replace_compatibility_summary(uuid,uuid,text,uuid,text,text,text,text,text,text,text,integer,text,text,text,uuid,integer,integer,boolean)') is not null
    then
        raise exception using
            errcode = 'duplicate_function',
            message = 'Knowledge Platform migration 071 found a pre-existing compatibility import signature.';
    end if;

    select p.proowner
    into v_api_owner
    from pg_catalog.pg_proc p
    where p.oid = to_regprocedure('public.kp_persist_require_actor(uuid)')
      and p.prosecdef
      and array_to_string(p.proconfig, ',') ilike '%search_path=pg_catalog, public, pg_temp%'
      and array_to_string(p.proconfig, ',') ilike '%lock_timeout=5s%';

    if v_api_owner is null
       or pg_catalog.pg_get_userbyid(v_api_owner) is distinct from current_user
    then
        raise exception using
            errcode = 'insufficient_privilege',
            message = 'Knowledge Platform migration 071 must run as the existing persistence API owner.';
    end if;

    select pg_catalog.pg_get_functiondef(
        to_regprocedure('public.kp_persist_create_compatibility_summary(uuid,text,text,text,text,text,text,text,uuid,text,text,text,integer,text,text,text,uuid,uuid,integer,integer,text)')
    ) into v_definition;
    if v_definition is null
       or position('is_summary_bank_compatibility' in v_definition) = 0
       or position('revision_number' in v_definition) = 0
    then
        raise exception using
            errcode = 'check_violation',
            message = 'Knowledge Platform migration 071 requires migration 068 compatibility-create semantics.';
    end if;

    select pg_catalog.pg_get_functiondef(
        to_regprocedure('public.kp_persist_publish_compatibility_revision(uuid,uuid,uuid,jsonb)')
    ) into v_definition;
    if v_definition is null
       or position('republished' in v_definition) = 0
       or position('is_summary_bank_compatibility' in v_definition) = 0
    then
        raise exception using
            errcode = 'check_violation',
            message = 'Knowledge Platform migration 071 requires migration 069 publication semantics.';
    end if;

    select pg_catalog.pg_get_functiondef(
        to_regprocedure('public.kp_persist_delete_compatibility_summary(uuid,uuid)')
    ) into v_definition;
    if v_definition is null
       or position('''outcome'', ''archived''' in v_definition) = 0
    then
        raise exception using
            errcode = 'check_violation',
            message = 'Knowledge Platform migration 071 requires migration 070 aggregate lifecycle semantics.';
    end if;

    if exists (
        select 1
        from public.summaries s
        where (
            s.lifecycle_status = 'active'
            and (
                select count(*)
                from public.package_summaries ps
                where ps.summary_id = s.id
                  and ps.is_summary_bank_compatibility
            ) <> 1
        ) or (
            s.lifecycle_status = 'archived'
            and exists (
                select 1
                from public.package_summaries ps
                where ps.summary_id = s.id
                  and ps.is_summary_bank_compatibility
            )
        )
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
            message = 'Knowledge Platform migration 071 found corrupted compatibility marker state.';
    end if;
end
$kp_compatibility_import_preflight$;

-- Import-new extends the frozen compatibility-create boundary without changing
-- its existing signature. Free-form document text remains legacy compatibility
-- data; publication uses an explicit empty normalized source-snapshot set.
create function public.kp_persist_create_compatibility_summary(
    p_summary_id uuid,
    p_summary_code text,
    p_canonical_slug text,
    p_canonical_title text,
    p_subject text,
    p_topic text,
    p_law text,
    p_visibility text,
    p_package_id uuid,
    p_legacy_slug text,
    p_content_md text,
    p_content_checksum text,
    p_read_time_minutes integer,
    p_read_time_policy_version text,
    p_content_schema_version text,
    p_change_note text,
    p_actor_id uuid,
    p_version_id uuid,
    p_sort_order integer,
    p_display_order integer,
    p_navigation_label text,
    p_document text,
    p_is_published boolean
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
set lock_timeout = '5s'
as $function$
declare
    v_create_result jsonb;
    v_publish_result jsonb;
    v_summary public.summaries%rowtype;
    v_version public.summary_versions%rowtype;
    v_placement public.package_summaries%rowtype;
    -- Compatibility root values remain byte-for-byte legacy values. Frozen
    -- revision constraints require blank optional snapshots to be NULL, but
    -- nonblank snapshot text is not trimmed.
    v_legacy_title text := p_canonical_title;
    v_document text := case when p_document is null or p_document = '' then null else p_document end;
    v_subject text := p_subject;
    v_topic text := p_topic;
    v_law text := p_law;
    v_subject_snapshot text := case when p_subject is null or btrim(p_subject) = '' then null else p_subject end;
    v_topic_snapshot text := case when p_topic is null or btrim(p_topic) = '' then null else p_topic end;
    v_law_snapshot text := case when p_law is null or btrim(p_law) = '' then null else p_law end;
    v_navigation_label text := nullif(btrim(p_navigation_label), '');
    v_was_retry boolean;
    v_result_idempotent boolean;
    v_affected bigint;
begin
    if p_is_published is null then
        raise exception using
            errcode = 'invalid_parameter_value',
            message = 'Imported publication state is required.';
    end if;

    v_create_result := public.kp_persist_create_compatibility_summary(
        p_summary_id,
        p_summary_code,
        p_canonical_slug,
        p_canonical_title,
        p_subject,
        p_topic,
        p_law,
        p_visibility,
        p_package_id,
        p_legacy_slug,
        p_content_md,
        p_content_checksum,
        p_read_time_minutes,
        p_read_time_policy_version,
        p_content_schema_version,
        p_change_note,
        p_actor_id,
        p_version_id,
        p_sort_order,
        p_display_order,
        p_navigation_label
    );
    v_was_retry := coalesce((v_create_result ->> 'idempotent_retry')::boolean, false);
    v_result_idempotent := v_was_retry;

    select * into v_summary
    from public.summaries s
    where s.id = p_summary_id
    for update;

    select * into v_version
    from public.summary_versions sv
    where sv.id = p_version_id
      and sv.summary_id = p_summary_id
    for update;

    select * into v_placement
    from public.package_summaries ps
    where ps.summary_id = p_summary_id
      and ps.is_summary_bank_compatibility
    for update;

    if v_summary.id is null or v_version.id is null or v_placement.summary_id is null then
        raise exception using
            errcode = 'object_not_in_prerequisite_state',
            message = 'Compatibility import-new did not create a complete aggregate.';
    end if;

    if v_was_retry then
        if v_summary.title is distinct from v_legacy_title
           or v_summary.visibility is distinct from p_visibility
           or v_summary.document is distinct from v_document
           or v_summary.subject is distinct from v_subject
           or v_summary.topic is distinct from v_topic
           or v_summary.law is distinct from v_law
           or v_summary.read_time_minutes is distinct from p_read_time_minutes
           or v_summary.sort_order is distinct from coalesce(p_sort_order, 0)
           or v_version.revision_number is distinct from 1
           or v_version.content_md is distinct from p_content_md
           or v_version.content_checksum is distinct from p_content_checksum
           or v_version.title_snapshot is distinct from v_legacy_title
           or v_version.subject_snapshot is distinct from v_subject_snapshot
           or v_version.topic_snapshot is distinct from v_topic_snapshot
           or v_version.law_snapshot is distinct from v_law_snapshot
           or v_version.read_time_minutes is distinct from p_read_time_minutes
           or v_version.read_time_policy_version is distinct from btrim(p_read_time_policy_version)
           or v_version.content_schema_version is distinct from btrim(p_content_schema_version)
           or v_version.change_note is distinct from btrim(p_change_note)
           or v_placement.sort_order is distinct from coalesce(p_sort_order, 0)
           or v_placement.display_order is distinct from coalesce(p_display_order, 0)
           or v_placement.navigation_label is distinct from v_navigation_label
        then
            raise exception using
                errcode = 'unique_violation',
                message = 'Compatibility import-new retry conflicts with existing imported metadata.';
        end if;
    else
        update public.summaries
        set title = v_legacy_title,
            subject = v_subject,
            topic = v_topic,
            law = v_law,
            document = v_document
        where id = p_summary_id;

        get diagnostics v_affected = row_count;
        if v_affected <> 1 then
            raise exception using
                errcode = 'cardinality_violation',
                message = 'Compatibility import-new did not update exactly one legacy Summary mirror.';
        end if;

        update public.summary_versions
        set title_snapshot = v_legacy_title,
            subject_snapshot = v_subject_snapshot,
            topic_snapshot = v_topic_snapshot,
            law_snapshot = v_law_snapshot
        where id = p_version_id
          and summary_id = p_summary_id
          and status = 'draft';

        get diagnostics v_affected = row_count;
        if v_affected <> 1 then
            raise exception using
                errcode = 'cardinality_violation',
                message = 'Compatibility import-new did not update exactly one initial revision snapshot.';
        end if;
    end if;

    if p_is_published then
        if v_version.status not in ('draft', 'published') then
            raise exception using
                errcode = 'object_not_in_prerequisite_state',
                message = 'Published import-new found an incompatible revision lifecycle state.';
        end if;

        if v_was_retry
           and v_version.status = 'draft'
           and (
                v_summary.is_published
                or v_summary.current_published_version_id is not null
                or v_placement.status <> 'draft'
           )
        then
            raise exception using
                errcode = 'object_not_in_prerequisite_state',
                message = 'Published import-new retry found divergent draft publication state.';
        end if;

        if v_was_retry
           and v_version.status = 'published'
           and (
                not v_summary.is_published
                or v_summary.current_published_version_id is distinct from p_version_id
                or v_placement.status <> 'active'
           )
        then
            raise exception using
                errcode = 'object_not_in_prerequisite_state',
                message = 'Published import-new retry found divergent published state.';
        end if;

        perform svrd.id
        from public.summary_version_reference_documents svrd
        where svrd.summary_version_id = p_version_id
        order by svrd.id
        for update;

        if exists (
            select 1
            from public.summary_version_reference_documents svrd
            where svrd.summary_version_id = p_version_id
        )
        then
            raise exception using
                errcode = 'object_not_in_prerequisite_state',
                message = 'Published import-new cannot replace explicit source snapshots with the empty compatibility snapshot set.';
        end if;

        v_publish_result := public.kp_persist_publish_compatibility_revision(
            p_summary_id,
            p_version_id,
            p_actor_id,
            '[]'::jsonb
        );
        v_result_idempotent := v_was_retry
            and coalesce((v_publish_result ->> 'idempotent_retry')::boolean, false);

        if not coalesce((v_publish_result ->> 'idempotent_retry')::boolean, false) then
            -- Migration 069 mirrors canonical_title into the legacy title
            -- column. Restore the exact imported compatibility title in the
            -- same command without writing during an exact published retry.
            update public.summaries
            set title = v_legacy_title
            where id = p_summary_id;

            get diagnostics v_affected = row_count;
            if v_affected <> 1 then
                raise exception using
                    errcode = 'cardinality_violation',
                    message = 'Published import-new did not preserve exactly one legacy Summary title.';
            end if;
        end if;
    else
        if v_version.status <> 'draft'
           or v_summary.is_published
           or v_summary.current_published_version_id is not null
           or v_placement.status <> 'draft'
        then
            raise exception using
                errcode = 'object_not_in_prerequisite_state',
                message = 'Draft import-new retry conflicts with existing publication state.';
        end if;
    end if;

    return jsonb_build_object(
        'outcome', 'created',
        'summary_id', p_summary_id,
        'summary_version_id', p_version_id,
        'package_id', p_package_id,
        'legacy_slug', lower(btrim(p_legacy_slug)),
        'is_published', p_is_published,
        'idempotent_retry', v_result_idempotent
    );
end
$function$;

comment on function public.kp_persist_create_compatibility_summary(uuid,text,text,text,text,text,text,text,uuid,text,text,text,integer,text,text,text,uuid,uuid,integer,integer,text,text,boolean) is
    'Atomic Summary Bank import-new overload: creates revision 1 and one marked placement, preserves exact free-form document text, and optionally publishes through the migration-069 boundary with no fabricated normalized sources.';

-- Import-replace preserves stable Summary/Package/slug identity. It edits the
-- existing draft when explicitly selected, otherwise creates the next draft.
-- Explicit draft snapshots remain evidence and make import fail closed instead
-- of being cleared; live relationships and published/retired snapshots remain
-- untouched.
create function public.kp_persist_replace_compatibility_summary(
    p_summary_id uuid,
    p_package_id uuid,
    p_legacy_slug text,
    p_replacement_version_id uuid,
    p_canonical_title text,
    p_subject text,
    p_document text,
    p_law text,
    p_topic text,
    p_content_md text,
    p_content_checksum text,
    p_read_time_minutes integer,
    p_read_time_policy_version text,
    p_content_schema_version text,
    p_change_note text,
    p_actor_id uuid,
    p_sort_order integer,
    p_display_order integer,
    p_is_published boolean
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
    v_placement public.package_summaries%rowtype;
    v_revision public.summary_versions%rowtype;
    v_requested_revision public.summary_versions%rowtype;
    v_current_version public.summary_versions%rowtype;
    -- Keep exact legacy mirror values separate from target canonical/snapshot
    -- forms so import parity does not weaken frozen target constraints.
    v_legacy_title text := p_canonical_title;
    v_canonical_title text := btrim(p_canonical_title);
    v_legacy_slug text := lower(btrim(p_legacy_slug));
    v_subject text := p_subject;
    v_document text := case when p_document is null or p_document = '' then null else p_document end;
    v_law text := p_law;
    v_topic text := p_topic;
    v_subject_snapshot text := case when p_subject is null or btrim(p_subject) = '' then null else p_subject end;
    v_law_snapshot text := case when p_law is null or btrim(p_law) = '' then null else p_law end;
    v_topic_snapshot text := case when p_topic is null or btrim(p_topic) = '' then null else p_topic end;
    v_version_id uuid;
    v_next_revision integer;
    v_marker_count bigint;
    v_open_count bigint;
    v_affected bigint;
    v_created_revision boolean := false;
    v_publish_result jsonb;
    v_unpublish_result jsonb;
begin
    perform public.kp_persist_require_actor(p_actor_id);

    if p_summary_id is null or p_package_id is null then
        raise exception using errcode = 'invalid_parameter_value', message = 'Summary and Package IDs are required.';
    end if;
    if p_legacy_slug is null or v_legacy_slug = '' or p_legacy_slug <> v_legacy_slug then
        raise exception using errcode = 'check_violation', message = 'Replacement legacy slug must be lowercase and trimmed.';
    end if;
    if p_canonical_title is null or v_canonical_title = ''
       or p_content_md is null or btrim(p_content_md) = ''
       or p_content_checksum is null or btrim(p_content_checksum) = ''
       or p_read_time_policy_version is null or btrim(p_read_time_policy_version) = ''
       or p_content_schema_version is null or btrim(p_content_schema_version) = ''
       or p_change_note is null or btrim(p_change_note) = ''
    then
        raise exception using errcode = 'invalid_parameter_value', message = 'Replacement content and revision policy metadata are required.';
    end if;
    if p_read_time_minutes is null or p_read_time_minutes <= 0 then
        raise exception using errcode = 'invalid_parameter_value', message = 'Replacement read time must be positive.';
    end if;
    if p_is_published is null then
        raise exception using errcode = 'invalid_parameter_value', message = 'Replacement publication state is required.';
    end if;

    select * into v_summary
    from public.summaries s
    where s.id = p_summary_id
    for update;
    if not found then
        raise exception using errcode = 'no_data_found', message = 'Summary does not exist.';
    end if;
    if v_summary.lifecycle_status is distinct from 'active'
       or v_summary.archived_by is not null
       or v_summary.archived_at is not null
    then
        raise exception using errcode = 'object_not_in_prerequisite_state', message = 'Archived or corrupted Summary cannot be import-replaced.';
    end if;

    select * into v_placement
    from public.package_summaries ps
    where ps.summary_id = p_summary_id
      and ps.is_summary_bank_compatibility
    for update;
    if not found then
        raise exception using errcode = 'object_not_in_prerequisite_state', message = 'Marked compatibility placement is missing.';
    end if;

    select count(*) into v_marker_count
    from public.package_summaries ps
    where ps.summary_id = p_summary_id
      and ps.is_summary_bank_compatibility;
    if v_marker_count <> 1 then
        raise exception using errcode = 'cardinality_violation', message = 'Compatibility import-replace found corrupted marker cardinality.';
    end if;
    if v_placement.legacy_slug is null
       or nullif(btrim(v_placement.legacy_slug), '') is null
       or v_placement.legacy_slug is distinct from lower(btrim(v_placement.legacy_slug))
       or v_placement.package_id is distinct from v_summary.package_id
       or v_placement.legacy_slug is distinct from v_summary.slug
       or v_placement.package_id is distinct from p_package_id
       or v_placement.legacy_slug is distinct from v_legacy_slug
    then
        raise exception using errcode = 'object_not_in_prerequisite_state', message = 'Requested Package and slug do not identify the marked compatibility Summary.';
    end if;

    perform sv.id
    from public.summary_versions sv
    where sv.summary_id = p_summary_id
    order by sv.revision_number, sv.id
    for update;

    if v_summary.current_published_version_id is not null then
        select * into v_current_version
        from public.summary_versions sv
        where sv.id = v_summary.current_published_version_id
          and sv.summary_id = p_summary_id;
        if not found
           or v_current_version.status <> 'published'
           or v_current_version.submitted_for_review_at is null
           or v_current_version.reviewed_by is null
           or v_current_version.reviewed_at is null
           or v_current_version.published_by is null
           or v_current_version.published_at is null
        then
            raise exception using errcode = 'object_not_in_prerequisite_state', message = 'Compatibility import-replace found an invalid current published revision.';
        end if;
    elsif v_summary.is_published then
        raise exception using errcode = 'object_not_in_prerequisite_state', message = 'Published compatibility Summary has no current published revision.';
    end if;

    if v_summary.is_published
       and (v_summary.current_published_version_id is null or v_placement.status <> 'active')
    then
        raise exception using errcode = 'object_not_in_prerequisite_state', message = 'Published compatibility Summary does not have an active marked placement.';
    end if;
    if not v_summary.is_published
       and v_summary.current_published_version_id is not null
       and v_placement.status <> 'hidden'
    then
        raise exception using errcode = 'object_not_in_prerequisite_state', message = 'Unpublished compatibility Summary does not have a hidden marked placement.';
    end if;
    if not v_summary.is_published
       and v_summary.current_published_version_id is null
       and v_placement.status <> 'draft'
    then
        raise exception using errcode = 'object_not_in_prerequisite_state', message = 'Never-published compatibility Summary does not have a draft marked placement.';
    end if;
    if v_summary.current_published_version_id is null
       and exists (
            select 1
            from public.summary_versions sv
            where sv.summary_id = p_summary_id
              and sv.status = 'published'
       )
    then
        raise exception using errcode = 'object_not_in_prerequisite_state', message = 'Compatibility import-replace found a published revision without a current pointer.';
    end if;

    if p_replacement_version_id is not null then
        select * into v_requested_revision
        from public.summary_versions sv
        where sv.id = p_replacement_version_id;

        if found and v_requested_revision.summary_id is distinct from p_summary_id then
            raise exception using errcode = 'no_data_found', message = 'Requested replacement revision belongs to another Summary.';
        end if;

        if found and v_requested_revision.status = 'published' then
            select count(*) into v_open_count
            from public.summary_versions sv
            where sv.summary_id = p_summary_id
              and sv.status in ('draft', 'in_review');

            if not p_is_published
               or v_open_count <> 0
               or v_summary.current_published_version_id is distinct from p_replacement_version_id
               or not v_summary.is_published
               or v_placement.status <> 'active'
               or v_requested_revision.content_md is distinct from p_content_md
               or v_requested_revision.content_checksum is distinct from p_content_checksum
               or v_requested_revision.title_snapshot is distinct from v_legacy_title
               or v_requested_revision.subject_snapshot is distinct from v_subject_snapshot
               or v_requested_revision.topic_snapshot is distinct from v_topic_snapshot
               or v_requested_revision.law_snapshot is distinct from v_law_snapshot
               or v_requested_revision.read_time_minutes is distinct from p_read_time_minutes
               or v_requested_revision.read_time_policy_version is distinct from btrim(p_read_time_policy_version)
               or v_requested_revision.content_schema_version is distinct from btrim(p_content_schema_version)
               or v_requested_revision.change_note is distinct from btrim(p_change_note)
               or v_summary.canonical_title is distinct from v_canonical_title
               or v_summary.title is distinct from v_legacy_title
               or v_summary.subject is distinct from v_subject
               or v_summary.topic is distinct from v_topic
               or v_summary.law is distinct from v_law
               or v_summary.document is distinct from v_document
               or v_summary.content_md is distinct from p_content_md
               or v_summary.read_time_minutes is distinct from p_read_time_minutes
               or v_summary.sort_order is distinct from coalesce(p_sort_order, 0)
               or v_placement.sort_order is distinct from coalesce(p_sort_order, 0)
               or (p_display_order is not null and v_placement.display_order is distinct from p_display_order)
               or exists (
                    select 1
                    from public.summary_version_reference_documents svrd
                    where svrd.summary_version_id = p_replacement_version_id
               )
            then
                raise exception using errcode = 'object_not_in_prerequisite_state', message = 'Published import-replace retry conflicts with immutable replacement state.';
            end if;

            return jsonb_build_object(
                'outcome', 'replaced',
                'summary_id', p_summary_id,
                'summary_version_id', p_replacement_version_id,
                'package_id', p_package_id,
                'legacy_slug', v_legacy_slug,
                'is_published', true,
                'idempotent_retry', true
            );
        elsif found and v_requested_revision.status <> 'draft' then
            raise exception using errcode = 'object_not_in_prerequisite_state', message = 'Requested replacement revision is not editable.';
        elsif found then
            v_revision := v_requested_revision;
        end if;
    end if;

    if v_revision.id is null then
        select * into v_revision
        from public.summary_versions sv
        where sv.summary_id = p_summary_id
          and sv.status = 'draft';

        if found then
            if p_replacement_version_id is not null
               and p_replacement_version_id is distinct from v_revision.id
            then
                raise exception using errcode = 'object_not_in_prerequisite_state', message = 'A different editable replacement draft already exists.';
            end if;
        else
            if exists (
                select 1
                from public.summary_versions sv
                where sv.summary_id = p_summary_id
                  and sv.status = 'in_review'
            ) then
                raise exception using errcode = 'object_not_in_prerequisite_state', message = 'An in-review revision must leave review before import replacement.';
            end if;

            v_version_id := coalesce(p_replacement_version_id, public.uuid_generate_v4());
            if exists (select 1 from public.summary_versions sv where sv.id = v_version_id) then
                raise exception using errcode = 'unique_violation', message = 'Requested replacement revision ID already exists.';
            end if;

            select coalesce(max(sv.revision_number), 0) + 1
            into v_next_revision
            from public.summary_versions sv
            where sv.summary_id = p_summary_id;

            insert into public.summary_versions (
                id, summary_id, revision_number, status, content_md,
                content_checksum, title_snapshot, subject_snapshot,
                topic_snapshot, law_snapshot, read_time_minutes,
                read_time_policy_version, content_schema_version, change_note,
                authored_by, created_at, updated_at
            ) values (
                v_version_id, p_summary_id, v_next_revision, 'draft',
                p_content_md, p_content_checksum, v_legacy_title,
                v_subject_snapshot, v_topic_snapshot, v_law_snapshot,
                p_read_time_minutes, btrim(p_read_time_policy_version),
                btrim(p_content_schema_version), btrim(p_change_note),
                p_actor_id, v_now, v_now
            );

            select * into v_revision
            from public.summary_versions sv
            where sv.id = v_version_id
              and sv.summary_id = p_summary_id;
            v_created_revision := true;
        end if;
    end if;

    perform svrd.id
    from public.summary_version_reference_documents svrd
    where svrd.summary_version_id = v_revision.id
    order by svrd.id
    for update;

    if exists (
        select 1
        from public.summary_version_reference_documents svrd
        where svrd.summary_version_id = v_revision.id
    ) then
        raise exception using
            errcode = 'object_not_in_prerequisite_state',
            message = 'Compatibility import-replace cannot overwrite a draft with explicit source snapshots.';
    end if;

    update public.summary_versions
    set content_md = p_content_md,
        content_checksum = p_content_checksum,
        title_snapshot = v_legacy_title,
        subject_snapshot = v_subject_snapshot,
        topic_snapshot = v_topic_snapshot,
        law_snapshot = v_law_snapshot,
        read_time_minutes = p_read_time_minutes,
        read_time_policy_version = btrim(p_read_time_policy_version),
        content_schema_version = btrim(p_content_schema_version),
        change_note = btrim(p_change_note),
        submitted_for_review_at = null,
        reviewed_by = null,
        reviewed_at = null,
        updated_at = v_now
    where id = v_revision.id
      and summary_id = p_summary_id
      and status = 'draft';

    get diagnostics v_affected = row_count;
    if v_affected <> 1 then
        raise exception using errcode = 'cardinality_violation', message = 'Compatibility import-replace did not update exactly one editable revision.';
    end if;

    update public.summaries
    set canonical_title = v_canonical_title,
        title = v_legacy_title,
        subject = v_subject,
        topic = v_topic,
        law = v_law,
        document = v_document,
        content_md = p_content_md,
        read_time_minutes = p_read_time_minutes,
        sort_order = coalesce(p_sort_order, 0),
        updated_at = v_now
    where id = p_summary_id;

    get diagnostics v_affected = row_count;
    if v_affected <> 1 then
        raise exception using errcode = 'cardinality_violation', message = 'Compatibility import-replace did not update exactly one Summary root.';
    end if;

    update public.package_summaries
    set sort_order = coalesce(p_sort_order, 0),
        display_order = coalesce(p_display_order, display_order),
        updated_at = v_now
    where package_id = v_placement.package_id
      and summary_id = p_summary_id
      and is_summary_bank_compatibility;

    get diagnostics v_affected = row_count;
    if v_affected <> 1 then
        raise exception using errcode = 'cardinality_violation', message = 'Compatibility import-replace did not update exactly one marked placement.';
    end if;

    if p_is_published then
        v_publish_result := public.kp_persist_publish_compatibility_revision(
            p_summary_id,
            v_revision.id,
            p_actor_id,
            '[]'::jsonb
        );

        -- Publication mirrors canonical_title; compatibility import preserves
        -- the exact untrimmed legacy title supplied by the Markdown workflow.
        update public.summaries
        set title = v_legacy_title
        where id = p_summary_id;

        get diagnostics v_affected = row_count;
        if v_affected <> 1 then
            raise exception using
                errcode = 'cardinality_violation',
                message = 'Published import-replace did not preserve exactly one legacy Summary title.';
        end if;
    elsif v_summary.current_published_version_id is not null then
        v_unpublish_result := public.kp_persist_unpublish_compatibility_summary(
            p_summary_id,
            p_actor_id
        );
    end if;

    return jsonb_build_object(
        'outcome', 'replaced',
        'summary_id', p_summary_id,
        'summary_version_id', v_revision.id,
        'package_id', p_package_id,
        'legacy_slug', v_legacy_slug,
        'is_published', p_is_published,
        'revision_created', v_created_revision,
        'idempotent_retry', false
    );
end
$function$;

comment on function public.kp_persist_replace_compatibility_summary(uuid,uuid,text,uuid,text,text,text,text,text,text,text,integer,text,text,text,uuid,integer,integer,boolean) is
    'Atomic Summary Bank import-replace: preserves Summary/Package/slug identity, updates or creates one draft revision only when explicit draft snapshots are absent, and delegates publish/unpublish to migration 069 without fabricating normalized sources.';

revoke all on function public.kp_persist_create_compatibility_summary(uuid,text,text,text,text,text,text,text,uuid,text,text,text,integer,text,text,text,uuid,uuid,integer,integer,text,text,boolean)
    from public, anon, authenticated;
revoke all on function public.kp_persist_replace_compatibility_summary(uuid,uuid,text,uuid,text,text,text,text,text,text,text,integer,text,text,text,uuid,integer,integer,boolean)
    from public, anon, authenticated;

grant execute on function public.kp_persist_create_compatibility_summary(uuid,text,text,text,text,text,text,text,uuid,text,text,text,integer,text,text,text,uuid,uuid,integer,integer,text,text,boolean)
    to service_role;
grant execute on function public.kp_persist_replace_compatibility_summary(uuid,uuid,text,uuid,text,text,text,text,text,text,text,integer,text,text,text,uuid,integer,integer,boolean)
    to service_role;

do $kp_compatibility_import_postflight$
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
        select function_name, required_fragment, outcome_fragment
        from (values
            (
                'public.kp_persist_create_compatibility_summary(uuid,text,text,text,text,text,text,text,uuid,text,text,text,integer,text,text,text,uuid,uuid,integer,integer,text,text,boolean)',
                'kp_persist_publish_compatibility_revision',
                '''outcome'', ''created'''
            ),
            (
                'public.kp_persist_replace_compatibility_summary(uuid,uuid,text,uuid,text,text,text,text,text,text,text,integer,text,text,text,uuid,integer,integer,boolean)',
                'kp_persist_unpublish_compatibility_summary',
                '''outcome'', ''replaced'''
            )
        ) as required(function_name, required_fragment, outcome_fragment)
    loop
        v_function := to_regprocedure(expected.function_name);
        if v_function is null then
            raise exception using
                errcode = 'check_violation',
                message = format('Knowledge Platform migration 071 failed to install signature: %s.', expected.function_name);
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
           or position('document' in v_definition) = 0
           or position(expected.required_fragment in v_definition) = 0
           or position(expected.outcome_fragment in v_definition) = 0
        then
            raise exception using
                errcode = 'check_violation',
                message = format('Knowledge Platform migration 071 installed a divergent compatibility import writer: %s.', expected.function_name);
        end if;

        if has_function_privilege('public', v_function, 'EXECUTE')
           or has_function_privilege('anon', v_function, 'EXECUTE')
           or has_function_privilege('authenticated', v_function, 'EXECUTE')
           or not has_function_privilege('service_role', v_function, 'EXECUTE')
        then
            raise exception using
                errcode = 'check_violation',
                message = format('Knowledge Platform migration 071 failed to preserve service-role-only execution: %s.', expected.function_name);
        end if;
    end loop;
end
$kp_compatibility_import_postflight$;

notify pgrst, 'reload schema';
