-- 072_kp_summary_bank_compatibility_edit.sql
-- Sobdai Knowledge Platform — atomic Hybrid Summary edit boundary.
--
-- Legacy rows are routed by summaries.summary_code IS NULL and remain entirely
-- Legacy. KP-native rows are routed by summaries.summary_code IS NOT NULL and
-- reconcile the complete requested Package set around one shared aggregate.

set local lock_timeout = '5s';

do $kp_compatibility_edit_preflight$
declare
    v_api_owner oid;
    v_function oid;
begin
    if to_regclass('public.summaries') is null
       or to_regclass('public.summary_versions') is null
       or to_regclass('public.summary_version_reference_documents') is null
       or to_regclass('public.package_summaries') is null
       or to_regclass('public.packages') is null
    then
        raise exception using
            errcode = 'check_violation',
            message = 'Knowledge Platform migration 072 requires the frozen Summary aggregate and Package placement tables.';
    end if;

    if not exists (
        select 1
        from information_schema.columns c
        where c.table_schema = 'public'
          and c.table_name = 'summaries'
          and c.column_name = 'summary_code'
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
       or to_regclass('public.package_summaries_package_legacy_slug_final_key') is null
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
            message = 'Knowledge Platform migration 072 requires the validated hybrid identity and Package membership constraints.';
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
            message = 'Knowledge Platform migration 072 must run as the existing persistence API owner.';
    end if;

    for v_function in
        select to_regprocedure(required_signature)
        from (values
            ('public.kp_persist_update_compatibility_draft(uuid,uuid,text,text,text,text,text,text,uuid,text,text,text,integer,text,text,text,uuid,integer,integer,text)'),
            ('public.kp_persist_reconcile_package_memberships(uuid,uuid[],uuid)'),
            ('public.kp_persist_publish_legacy_summary(uuid,uuid)'),
            ('public.kp_persist_unpublish_legacy_summary(uuid,uuid)'),
            ('public.kp_enforce_summary_writer_boundary()'),
            ('public.kp_enforce_summary_cleanup_fence()'),
            ('public.kp_summary_writer_caller_is_approved()')
        ) as required(required_signature)
    loop
        if v_function is null then
            raise exception using
                errcode = 'check_violation',
                message = 'Knowledge Platform migration 072 requires the frozen discriminator-specific edit and fence functions.';
        end if;
    end loop;

    for v_function in
        select to_regprocedure(required_signature)
        from (values
            ('public.kp_persist_update_compatibility_draft(uuid,uuid,text,text,text,text,text,text,uuid,text,text,text,integer,text,text,text,uuid,integer,integer,text)'),
            ('public.kp_persist_reconcile_package_memberships(uuid,uuid[],uuid)'),
            ('public.kp_persist_publish_legacy_summary(uuid,uuid)'),
            ('public.kp_persist_unpublish_legacy_summary(uuid,uuid)')
        ) as required(required_signature)
    loop
        if v_function is null
           or not exists (
                select 1
                from pg_catalog.pg_proc p
                where p.oid = v_function
                  and p.proowner = v_api_owner
                  and p.prosecdef
                  and array_to_string(p.proconfig, ',') ilike '%search_path=pg_catalog, public, pg_temp%'
                  and array_to_string(p.proconfig, ',') ilike '%lock_timeout=5s%'
           )
        then
            raise exception using
                errcode = 'check_violation',
                message = 'Knowledge Platform migration 072 found a divergent frozen SECURITY DEFINER prerequisite.';
        end if;
    end loop;

    if to_regprocedure('public.kp_persist_update_compatibility_summary(uuid,uuid,text,text,text,text,text,text,text,text,integer,text,text,text,uuid,integer,integer,text,uuid[])') is not null
    then
        raise exception using
            errcode = 'duplicate_function',
            message = 'Knowledge Platform migration 072 found a pre-existing compatibility edit signature.';
    end if;
end
$kp_compatibility_edit_preflight$;

create function public.kp_persist_update_compatibility_summary(
    p_summary_id uuid,
    p_package_id uuid,
    p_legacy_slug text,
    p_title text,
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
    p_navigation_label text,
    p_package_ids uuid[]
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
    v_current_version public.summary_versions%rowtype;
    v_legacy_placement public.package_summaries%rowtype;
    v_membership public.package_summaries%rowtype;
    v_conflicting_summary public.summaries%rowtype;
    v_conflicting_placement public.package_summaries%rowtype;
    v_requested_package uuid;
    v_canonical_package uuid;
    v_requested_count bigint;
    v_marker_count bigint;
    v_membership_count bigint;
    v_draft_count bigint;
    v_in_review_count bigint;
    v_published_count bigint;
    v_next_revision integer;
    v_affected bigint;
    v_revision_created boolean := false;
    v_memberships_reconciled boolean := false;
    v_effective_sort_order integer;
    v_effective_display_order integer;
    v_effective_navigation_label text;
    v_legacy_slug text := lower(btrim(p_legacy_slug));
    v_document text := case when p_document is null or p_document = '' then null else p_document end;
    v_subject_snapshot text := case when p_subject is null or btrim(p_subject) = '' then null else p_subject end;
    v_topic_snapshot text := case when p_topic is null or btrim(p_topic) = '' then null else p_topic end;
    v_law_snapshot text := case when p_law is null or btrim(p_law) = '' then null else p_law end;
begin
    perform public.kp_persist_require_actor(p_actor_id);

    if p_summary_id is null or p_package_id is null then
        raise exception using errcode = 'invalid_parameter_value', message = 'Summary and Package IDs are required.';
    end if;
    if p_legacy_slug is null or v_legacy_slug = '' or p_legacy_slug <> v_legacy_slug then
        raise exception using errcode = 'check_violation', message = 'Compatibility legacy slug must be lowercase and trimmed.';
    end if;
    if p_title is null or btrim(p_title) = ''
       or p_content_md is null or btrim(p_content_md) = ''
       or p_content_checksum is null or btrim(p_content_checksum) = ''
       or p_read_time_policy_version is null or btrim(p_read_time_policy_version) = ''
       or p_content_schema_version is null or btrim(p_content_schema_version) = ''
       or p_change_note is null or btrim(p_change_note) = ''
    then
        raise exception using errcode = 'invalid_parameter_value', message = 'Compatibility edit content and revision metadata are required.';
    end if;
    if p_read_time_minutes is null or p_read_time_minutes <= 0 then
        raise exception using errcode = 'invalid_parameter_value', message = 'Compatibility edit read time must be positive.';
    end if;
    if p_navigation_label is not null and btrim(p_navigation_label) = '' then
        raise exception using errcode = 'invalid_parameter_value', message = 'Navigation label cannot be blank.';
    end if;

    -- The discriminator is the Summary identity bundle. Marker existence is
    -- deliberately not consulted until the KP branch has been selected.
    select *
    into v_summary
    from public.summaries s
    where s.id = p_summary_id
    for update;
    if not found then
        raise exception using errcode = 'no_data_found', message = 'Summary does not exist.';
    end if;
    if v_summary.archived_by is not null
       or v_summary.archived_at is not null
    then
        raise exception using errcode = 'object_not_in_prerequisite_state', message = 'Archived Summary cannot be compatibility-edited.';
    end if;

    if v_summary.summary_code is null then
        -- Legacy is permanently single-Package. No KP table is read or
        -- written in this branch, and no revision is created.
        if p_package_ids is not null
           and (cardinality(p_package_ids) is distinct from 1
                or p_package_ids[1] is distinct from p_package_id)
        then
            raise exception using errcode = 'object_not_in_prerequisite_state', message = 'Legacy edits accept exactly their existing single Package.';
        end if;

        if v_summary.package_id is distinct from p_package_id then
            raise exception using errcode = 'unique_violation', message = 'Legacy Package reassignment is not permitted by the frozen edit contract.';
        end if;

        if exists (
            select 1 from public.summary_versions sv where sv.summary_id = p_summary_id
        ) or exists (
            select 1 from public.package_summaries ps where ps.summary_id = p_summary_id
        ) then
            raise exception using errcode = 'cardinality_violation', message = 'Legacy edit found forbidden KP revision or Package membership state.';
        end if;

        select *
        into v_conflicting_summary
        from public.summaries s
        where s.package_id = p_package_id
          and s.slug = v_legacy_slug
          and s.id <> p_summary_id
        for update;
        if found then
            raise exception using errcode = 'unique_violation', message = 'Legacy slug already exists in the Package.';
        end if;

        select *
        into v_conflicting_placement
        from public.package_summaries ps
        where ps.package_id = p_package_id
          and ps.legacy_slug = v_legacy_slug
          and ps.summary_id <> p_summary_id
        for update;
        if found then
            raise exception using errcode = 'unique_violation', message = 'Legacy slug collides with an existing Package membership.';
        end if;

        -- The original Legacy Summary row is the only authority. Its existing
        -- legacy edit contract remains fenced by the 058/059 triggers.
        update public.summaries
        set title = p_title,
            subject = p_subject,
            topic = p_topic,
            law = p_law,
            document = v_document,
            content_md = p_content_md,
            read_time_minutes = p_read_time_minutes,
            sort_order = coalesce(p_sort_order, v_summary.sort_order),
            display_order = coalesce(p_display_order, v_summary.display_order),
            slug = v_legacy_slug,
            is_published = v_summary.is_published,
            updated_at = v_now
        where id = p_summary_id
          and summary_code is null;
        get diagnostics v_affected = row_count;
        if v_affected <> 1 then
            raise exception using errcode = 'cardinality_violation', message = 'Legacy edit did not update exactly one Legacy Summary.';
        end if;

        if v_summary.is_published then
            perform public.kp_persist_publish_legacy_summary(p_summary_id, p_actor_id);
        else
            perform public.kp_persist_unpublish_legacy_summary(p_summary_id, p_actor_id);
        end if;

        return jsonb_build_object(
            'success', true,
            'outcome', 'updated',
            'summary_id', p_summary_id,
            'summary_version_id', null,
            'package_id', p_package_id,
            'legacy_slug', v_legacy_slug,
            'revision_created', false,
            'package_reassigned', false,
            'legacy', true,
            'membership_reconciled', false
        );
    end if;

    -- KP-native package input is the complete desired set, not a marker-only
    -- destination. Validate all IDs and Package-local collisions before any
    -- membership or revision mutation.
    if v_summary.lifecycle_status is distinct from 'active' then
        raise exception using errcode = 'object_not_in_prerequisite_state', message = 'Archived or invalid KP-native Summary cannot be compatibility-edited.';
    end if;
    if p_package_ids is null or cardinality(p_package_ids) is null or cardinality(p_package_ids) = 0 then
        raise exception using errcode = 'invalid_parameter_value', message = 'KP-native edit requires at least one Package ID.';
    end if;
    if exists (
        select 1 from unnest(p_package_ids) requested(package_id)
        where requested.package_id is null
    ) then
        raise exception using errcode = 'invalid_parameter_value', message = 'KP-native edit Package IDs cannot contain NULL.';
    end if;
    if (
        select count(*) from (select distinct package_id from unnest(p_package_ids) requested(package_id)) distinct_packages
    ) <> cardinality(p_package_ids) then
        raise exception using errcode = 'unique_violation', message = 'KP-native edit Package IDs cannot contain duplicates.';
    end if;
    if not (p_package_id = any(p_package_ids)) then
        raise exception using errcode = 'check_violation', message = 'The edit Package must be included in the complete KP membership set.';
    end if;
    if exists (
        select 1
        from unnest(p_package_ids) requested(package_id)
        left join public.packages p on p.id = requested.package_id
        where p.id is null
    ) then
        raise exception using errcode = 'foreign_key_violation', message = 'Every requested KP Package must exist.';
    end if;

    select count(*)
    into v_requested_count
    from unnest(p_package_ids) requested(package_id);

    select *
    into v_legacy_placement
    from public.package_summaries ps
    where ps.summary_id = p_summary_id
      and ps.is_summary_bank_compatibility
    for update;
    select count(*)
    into v_marker_count
    from public.package_summaries ps
    where ps.summary_id = p_summary_id
      and ps.is_summary_bank_compatibility;
    if not found or v_marker_count <> 1 then
        raise exception using errcode = 'cardinality_violation', message = 'KP-native edit requires exactly one compatibility marker.';
    end if;
    if v_legacy_placement.package_id is distinct from v_summary.package_id
       or v_legacy_placement.legacy_slug is distinct from v_summary.slug
       or v_legacy_placement.legacy_slug is distinct from lower(btrim(v_legacy_placement.legacy_slug))
    then
        raise exception using errcode = 'object_not_in_prerequisite_state', message = 'KP-native edit found a divergent canonical marker mirror.';
    end if;

    for v_requested_package in
        select requested.package_id
        from unnest(p_package_ids) requested(package_id)
        order by requested.package_id
    loop
        select *
        into v_membership
        from public.package_summaries ps
        where ps.package_id = v_requested_package
          and ps.legacy_slug = v_legacy_slug
          and ps.summary_id <> p_summary_id
        for update;
        if found then
            raise exception using errcode = 'unique_violation', message = 'Requested Package/slug collides with another Summary membership.';
        end if;

        select *
        into v_conflicting_summary
        from public.summaries s
        where s.package_id = v_requested_package
          and s.slug = v_legacy_slug
          and s.id <> p_summary_id
        for update;
        if found then
            raise exception using errcode = 'unique_violation', message = 'Requested Package/slug collides with another Summary root.';
        end if;
    end loop;

    -- Resolve the editable shared revision before reconciliation. A failure in
    -- this branch occurs before membership mutation; later failures roll back
    -- both the revision and complete membership set as one RPC transaction.
    perform sv.id
    from public.summary_versions sv
    where sv.summary_id = p_summary_id
    order by sv.revision_number, sv.id
    for update;

    select count(*) into v_draft_count
    from public.summary_versions sv
    where sv.summary_id = p_summary_id and sv.status = 'draft';
    select count(*) into v_in_review_count
    from public.summary_versions sv
    where sv.summary_id = p_summary_id and sv.status = 'in_review';
    if v_draft_count > 1 or v_in_review_count > 0 then
        raise exception using errcode = 'object_not_in_prerequisite_state', message = 'KP-native edit found multiple or in-review open revisions.';
    end if;

    if v_summary.current_published_version_id is not null then
        select *
        into v_current_version
        from public.summary_versions sv
        where sv.id = v_summary.current_published_version_id
          and sv.summary_id = p_summary_id
        for update;
        if not found
           or v_current_version.status <> 'published'
           or v_current_version.submitted_for_review_at is null
           or v_current_version.reviewed_by is null
           or v_current_version.reviewed_at is null
           or v_current_version.published_by is null
           or v_current_version.published_at is null
        then
            raise exception using errcode = 'object_not_in_prerequisite_state', message = 'KP-native edit found an invalid current published revision.';
        end if;
    elsif v_summary.is_published then
        raise exception using errcode = 'object_not_in_prerequisite_state', message = 'Published KP-native Summary has no current published revision.';
    end if;

    select count(*) into v_published_count
    from public.summary_versions sv
    where sv.summary_id = p_summary_id and sv.status = 'published';
    if v_summary.current_published_version_id is null and v_published_count <> 0 then
        raise exception using errcode = 'object_not_in_prerequisite_state', message = 'KP-native edit found published history without a current pointer.';
    end if;

    if v_draft_count = 1 then
        select * into v_version
        from public.summary_versions sv
        where sv.summary_id = p_summary_id and sv.status = 'draft'
        for update;
    elsif v_summary.current_published_version_id is not null then
        select coalesce(max(sv.revision_number), 0) + 1
        into v_next_revision
        from public.summary_versions sv
        where sv.summary_id = p_summary_id;

        insert into public.summary_versions (
            id, summary_id, revision_number, status, content_md,
            content_checksum, title_snapshot, subject_snapshot, topic_snapshot,
            law_snapshot, read_time_minutes, read_time_policy_version,
            content_schema_version, change_note, authored_by, created_at, updated_at
        ) values (
            public.uuid_generate_v4(), p_summary_id, v_next_revision, 'draft',
            p_content_md, p_content_checksum, p_title, v_subject_snapshot,
            v_topic_snapshot, v_law_snapshot, p_read_time_minutes,
            btrim(p_read_time_policy_version), btrim(p_content_schema_version),
            btrim(p_change_note), p_actor_id, v_now, v_now
        ) returning * into v_version;
        v_revision_created := true;
    else
        raise exception using errcode = 'object_not_in_prerequisite_state', message = 'KP-native edit requires an existing draft or published history.';
    end if;

    if v_version.id is null then
        raise exception using errcode = 'object_not_in_prerequisite_state', message = 'KP-native edit could not resolve an editable revision.';
    end if;
    if exists (
        select 1
        from public.summary_version_reference_documents svrd
        where svrd.summary_version_id = v_version.id
    ) then
        raise exception using errcode = 'object_not_in_prerequisite_state', message = 'KP-native edit cannot overwrite a revision with explicit source snapshots.';
    end if;

    -- Frozen 068 owns complete membership reconciliation, canonical
    -- preservation/rotation, and the one-marker invariant.
    perform public.kp_persist_reconcile_package_memberships(
        p_summary_id,
        p_package_ids,
        p_actor_id
    );
    v_memberships_reconciled := true;

    -- Reconciliation is deliberately membership-complete, but frozen 068
    -- creates newly selected memberships as draft. Normalize every retained
    -- membership to the aggregate's existing publication state in this same
    -- transaction; never call 069 publication commands as a workaround.
    if v_summary.is_published then
        update public.package_summaries
        set status = 'active',
            activated_by = coalesce(activated_by, p_actor_id),
            activated_at = coalesce(activated_at, v_now),
            hidden_by = null,
            hidden_at = null,
            updated_at = v_now
        where summary_id = p_summary_id;
    elsif v_summary.current_published_version_id is not null then
        update public.package_summaries
        set status = 'hidden',
            activated_by = null,
            activated_at = null,
            hidden_by = coalesce(hidden_by, p_actor_id),
            hidden_at = coalesce(hidden_at, v_now),
            updated_at = v_now
        where summary_id = p_summary_id;
    else
        update public.package_summaries
        set status = 'draft',
            activated_by = null,
            activated_at = null,
            hidden_by = null,
            hidden_at = null,
            updated_at = v_now
        where summary_id = p_summary_id;
    end if;
    get diagnostics v_affected = row_count;
    if v_affected <> v_requested_count then
        raise exception using errcode = 'cardinality_violation', message = 'KP-native edit did not normalize every retained Package membership visibility state.';
    end if;

    select ps.package_id, ps.display_order, ps.navigation_label
    into v_canonical_package, v_effective_display_order, v_effective_navigation_label
    from public.package_summaries ps
    where ps.summary_id = p_summary_id
      and ps.is_summary_bank_compatibility
    for update;
    if v_canonical_package is null then
        raise exception using errcode = 'cardinality_violation', message = 'KP-native edit lost its canonical membership during reconciliation.';
    end if;
    if v_summary.canonical_slug is null or v_summary.visibility is null then
        raise exception using errcode = 'object_not_in_prerequisite_state', message = 'KP-native edit found an incomplete KP identity bundle.';
    end if;

    v_effective_sort_order := coalesce(p_sort_order, v_summary.sort_order);
    v_effective_display_order := coalesce(p_display_order, v_effective_display_order);
    v_effective_navigation_label := case
        when p_navigation_label is null then v_effective_navigation_label
        else nullif(btrim(p_navigation_label), '')
    end;

    -- Frozen 068 owns the established shared draft/revision edit lifecycle.
    -- 072 supplies the complete-membership/canonical context around it.
    perform public.kp_persist_update_compatibility_draft(
        p_summary_id,
        v_version.id,
        v_summary.canonical_slug,
        p_title,
        p_subject,
        p_topic,
        p_law,
        v_summary.visibility,
        v_canonical_package,
        v_legacy_slug,
        p_content_md,
        p_content_checksum,
        p_read_time_minutes,
        p_read_time_policy_version,
        p_content_schema_version,
        p_change_note,
        p_actor_id,
        v_effective_sort_order,
        v_effective_display_order,
        v_effective_navigation_label
    );

    update public.summaries
    set document = v_document,
        display_order = v_effective_display_order,
        updated_at = v_now
    where id = p_summary_id
      and summary_code is not null;
    get diagnostics v_affected = row_count;
    if v_affected <> 1 then
        raise exception using errcode = 'cardinality_violation', message = 'KP-native edit did not update exactly one KP Summary document mirror.';
    end if;

    -- Membership reconciliation owns membership identity and canonical mirror;
    -- this edit updates only product-local placement fields for the caller's
    -- selected Package. Secondary memberships remain intact.
    update public.package_summaries
    set sort_order = v_effective_sort_order,
        display_order = v_effective_display_order,
        navigation_label = case
            when p_navigation_label is null then navigation_label
            else nullif(btrim(p_navigation_label), '')
        end,
        updated_at = v_now
    where package_id = p_package_id
      and summary_id = p_summary_id;
    get diagnostics v_affected = row_count;
    if v_affected <> 1 then
        raise exception using errcode = 'cardinality_violation', message = 'KP-native edit did not update exactly one selected Package membership.';
    end if;

    select * into v_legacy_placement
    from public.package_summaries ps
    where ps.summary_id = p_summary_id and ps.is_summary_bank_compatibility
    for update;
    select count(*) into v_marker_count
    from public.package_summaries ps
    where ps.summary_id = p_summary_id and ps.is_summary_bank_compatibility;
    select count(*) into v_membership_count
    from public.package_summaries ps
    where ps.summary_id = p_summary_id;
    if v_marker_count <> 1
       or v_membership_count <> v_requested_count
       or v_legacy_placement.package_id is distinct from (select s.package_id from public.summaries s where s.id = p_summary_id)
       or v_legacy_placement.legacy_slug is distinct from (select s.slug from public.summaries s where s.id = p_summary_id)
    then
        raise exception using errcode = 'cardinality_violation', message = 'KP-native edit postcondition found an invalid shared membership or canonical mirror.';
    end if;
    if (v_summary.is_published and exists (
            select 1 from public.package_summaries ps
            where ps.summary_id = p_summary_id and ps.status <> 'active'
       ))
       or (not v_summary.is_published and v_summary.current_published_version_id is not null and exists (
            select 1 from public.package_summaries ps
            where ps.summary_id = p_summary_id and ps.status <> 'hidden'
       ))
       or (not v_summary.is_published and v_summary.current_published_version_id is null and exists (
            select 1 from public.package_summaries ps
            where ps.summary_id = p_summary_id and ps.status <> 'draft'
       ))
    then
        raise exception using errcode = 'object_not_in_prerequisite_state', message = 'KP-native edit postcondition found membership visibility inconsistent with the Summary publication state.';
    end if;

    return jsonb_build_object(
        'success', true,
        'outcome', 'updated',
        'summary_id', p_summary_id,
        'summary_version_id', v_version.id,
        'package_id', p_package_id,
        'legacy_slug', (select s.slug from public.summaries s where s.id = p_summary_id),
        'revision_created', v_revision_created,
        'package_reassigned', false,
        'legacy', false,
        'membership_reconciled', v_memberships_reconciled,
        'package_count', v_membership_count,
        'marker_count', v_marker_count
    );
end
$function$;

comment on function public.kp_persist_update_compatibility_summary(uuid,uuid,text,text,text,text,text,text,text,text,integer,text,text,text,uuid,integer,integer,text,uuid[]) is
    'Atomic Hybrid edit: routes Legacy by summary_code NULL without KP state, or edits one shared KP aggregate while reconciling the complete desired Package set and preserving/rotating its canonical marker.';

revoke all on function public.kp_persist_update_compatibility_summary(uuid,uuid,text,text,text,text,text,text,text,text,integer,text,text,text,uuid,integer,integer,text,uuid[])
    from public, anon, authenticated;
grant execute on function public.kp_persist_update_compatibility_summary(uuid,uuid,text,text,text,text,text,text,text,text,integer,text,text,text,uuid,integer,integer,text,uuid[])
    to service_role;

-- Reassert the exact caller-bound helper and both effective fences. The helper
-- is the only RPC approval path; session_user checks remain limited to the
-- existing controlled superuser/database-owner operator escape hatch.
create or replace function public.kp_summary_writer_caller_is_approved()
returns boolean
language plpgsql
security invoker
set search_path = pg_catalog, public, pg_temp
set lock_timeout = '5s'
as $function$
declare
    v_context text;
    v_active_signature text;
    v_active_oid oid;
begin
    get diagnostics v_context = pg_context;

    with frames as (
        select
            stack.frame_no,
            pg_catalog.regexp_replace(
                pg_catalog.regexp_replace(
                    pg_catalog.regexp_replace(lower(btrim(stack.line)), '^.*function[[:space:]]+', ''),
                    '[[:space:]]+line[[:space:]].*$', ''
                ),
                '"', '', 'g'
            ) as call_signature,
            pg_catalog.regexp_replace(
                pg_catalog.regexp_replace(
                    pg_catalog.regexp_replace(
                        pg_catalog.regexp_replace(lower(btrim(stack.line)), '^.*function[[:space:]]+', ''),
                        '[[:space:]]+line[[:space:]].*$', ''
                    ),
                    '[[:space:]]+', '', 'g'
                ),
                '"', '', 'g'
            ) as signature
        from pg_catalog.regexp_split_to_table(coalesce(v_context, ''), E'\n') with ordinality as stack(line, frame_no)
        where lower(btrim(stack.line)) ~ '(^|[[:space:]])function[[:space:]]'
    )
    select frames.call_signature into v_active_signature
    from frames
    where frames.signature not in (
        'public.kp_summary_writer_caller_is_approved()',
        'kp_summary_writer_caller_is_approved()',
        'public.kp_enforce_summary_cleanup_fence()',
        'kp_enforce_summary_cleanup_fence()',
        'public.kp_enforce_summary_writer_boundary()',
        'kp_enforce_summary_writer_boundary()'
    )
    order by frames.frame_no
    limit 1;

    if v_active_signature is not null then
        if position('.' in v_active_signature) > 0 then
            v_active_oid := to_regprocedure(v_active_signature);
        else
            select case when count(*) = 1 then (array_agg(p.oid order by p.oid))[1] end
            into v_active_oid
            from pg_catalog.pg_proc p
            where pg_catalog.regexp_replace(
                      pg_catalog.regexp_replace(
                          lower(p.proname || '(' || pg_catalog.oidvectortypes(p.proargtypes) || ')'),
                          '[[:space:]]+', '', 'g'
                      ),
                      '"', '', 'g'
                  ) = pg_catalog.regexp_replace(
                          pg_catalog.regexp_replace(lower(v_active_signature), '[[:space:]]+', '', 'g'),
                          '"', '', 'g'
                      );
        end if;
    end if;

    return exists (
        select 1
        from pg_catalog.pg_proc p
        join pg_catalog.pg_namespace n on n.oid = p.pronamespace
        where n.nspname = 'public'
          and p.oid in (
              to_regprocedure('public.kp_persist_require_actor(uuid)'),
              to_regprocedure('public.kp_persist_create_compatibility_summary(uuid,text,text,text,text,text,text,text,uuid,text,text,text,integer,text,text,text,uuid,uuid,integer,integer,text)'),
              to_regprocedure('public.kp_persist_create_compatibility_summary(uuid,text,text,text,text,text,text,text,uuid[],text,text,text,integer,text,text,text,uuid,uuid,integer,integer,text)'),
              to_regprocedure('public.kp_persist_update_compatibility_draft(uuid,uuid,text,text,text,text,text,text,uuid,text,text,text,integer,text,text,text,uuid,integer,integer,text)'),
              to_regprocedure('public.kp_persist_publish_compatibility_revision(uuid,uuid,uuid,jsonb)'),
              to_regprocedure('public.kp_persist_unpublish_compatibility_summary(uuid,uuid)'),
              to_regprocedure('public.kp_persist_publish_legacy_summary(uuid,uuid)'),
              to_regprocedure('public.kp_persist_unpublish_legacy_summary(uuid,uuid)'),
              to_regprocedure('public.kp_persist_retire_compatibility_revision(uuid,uuid,uuid,text,uuid)'),
              to_regprocedure('public.kp_persist_reassign_compatibility_package(uuid,uuid,text,uuid)'),
              to_regprocedure('public.kp_persist_replace_summary_sources(uuid,jsonb,uuid)'),
              to_regprocedure('public.kp_persist_reconcile_package_memberships(uuid,uuid[],uuid)'),
              to_regprocedure('public.kp_persist_attach_package_summary(uuid,uuid,text,text,uuid,integer,integer,timestamptz,text,text,uuid)'),
              to_regprocedure('public.kp_persist_detach_package_summary(uuid,uuid,uuid)'),
              to_regprocedure('public.kp_persist_register_summary_alias(uuid,text,text,text,uuid)'),
              to_regprocedure('public.kp_persist_delete_compatibility_summary(uuid,uuid)'),
              to_regprocedure('public.kp_persist_resolve_import_collision(uuid,text)'),
              to_regprocedure('public.kp_persist_create_compatibility_summary(uuid,text,text,text,text,text,text,text,uuid[],text,text,text,integer,text,text,text,uuid,uuid,integer,integer,text,text,boolean)'),
              to_regprocedure('public.kp_persist_create_compatibility_summary(uuid,text,text,text,text,text,text,text,uuid,text,text,text,integer,text,text,text,uuid,uuid,integer,integer,text,text,boolean)'),
              to_regprocedure('public.kp_persist_replace_compatibility_summary(uuid,uuid,text,uuid,text,text,text,text,text,text,text,integer,text,text,text,uuid,integer,integer,boolean)'),
              to_regprocedure('public.kp_persist_update_compatibility_summary(uuid,uuid,text,text,text,text,text,text,text,text,integer,text,text,text,uuid,integer,integer,text,uuid[])')
          )
          and p.prosecdef
          and pg_catalog.pg_get_userbyid(p.proowner) = current_user
          and array_to_string(p.proconfig, ',') ilike '%search_path=pg_catalog, public, pg_temp%'
          and array_to_string(p.proconfig, ',') ilike '%lock_timeout=5s%'
          and p.oid = v_active_oid
    );
end
$function$;

revoke all on function public.kp_summary_writer_caller_is_approved()
    from public, anon, authenticated, service_role;

create or replace function public.kp_enforce_summary_writer_boundary()
returns trigger
language plpgsql
security invoker
set search_path = pg_catalog, public, pg_temp
set lock_timeout = '5s'
as $function$
declare
    v_is_controlled_operator boolean := false;
    v_is_approved_api_owner boolean := false;
begin
    if current_user in ('public', 'anon', 'authenticated', 'service_role') then
        raise exception using errcode = 'insufficient_privilege', message = 'Direct Summary mutations are disabled; use the approved transactional persistence API.';
    end if;

    select session_user = current_user and (
           coalesce(r.rolsuper, false)
           or exists (
               select 1 from pg_catalog.pg_database d
               where d.datname = current_database()
                 and pg_catalog.pg_get_userbyid(d.datdba) = current_user
           )
    )
    into v_is_controlled_operator
    from pg_catalog.pg_roles r
    where r.rolname = current_user;

    if not v_is_controlled_operator then
        v_is_approved_api_owner := public.kp_summary_writer_caller_is_approved();
    end if;
    if not v_is_controlled_operator and not v_is_approved_api_owner then
        raise exception using errcode = 'insufficient_privilege', message = 'Direct Summary mutations are disabled; use the approved transactional persistence API or controlled migration operator.';
    end if;

    if tg_op = 'DELETE' then return old; end if;
    return new;
end
$function$;

comment on function public.kp_enforce_summary_writer_boundary() is
    'SECURITY INVOKER single-writer fence for the hybrid 067-072 aggregate. Direct client/service-role table writes are denied; approved 057, 068, 069, 070, 071, and 072 SECURITY DEFINER commands are bound to their active PG_CONTEXT caller.';

revoke all on function public.kp_enforce_summary_writer_boundary()
    from public, anon, authenticated;
grant execute on function public.kp_enforce_summary_writer_boundary() to service_role;

create or replace function public.kp_enforce_summary_cleanup_fence()
returns trigger
language plpgsql
security invoker
set search_path = pg_catalog, public, pg_temp
set lock_timeout = '5s'
as $function$
declare
    v_is_controlled_operator boolean := false;
    v_is_approved_api_owner boolean := false;
begin
    if current_user in ('public', 'anon', 'authenticated', 'service_role') then
        raise exception using errcode = 'insufficient_privilege', message = 'Direct Summary mutations are disabled; use the approved transactional persistence API.';
    end if;

    select session_user = current_user and (
        exists (select 1 from pg_catalog.pg_roles r where r.rolname = current_user and r.rolsuper)
        or exists (
            select 1 from pg_catalog.pg_database d
            where d.datname = current_database()
              and pg_catalog.pg_get_userbyid(d.datdba) = current_user
        )
    )
    into v_is_controlled_operator;

    if not v_is_controlled_operator then
        v_is_approved_api_owner := public.kp_summary_writer_caller_is_approved();
    end if;

    if not v_is_controlled_operator and not v_is_approved_api_owner then
        if tg_op = 'INSERT' or tg_op = 'DELETE' then
            raise exception using errcode = 'insufficient_privilege', message = 'Summary structural mutations are disabled; use the approved transactional persistence API.';
        end if;
        if new.package_id is distinct from old.package_id
           or new.title is distinct from old.title
           or new.slug is distinct from old.slug
           or new.content_md is distinct from old.content_md
           or new.read_time_minutes is distinct from old.read_time_minutes
           or new.sort_order is distinct from old.sort_order
           or new.display_order is distinct from old.display_order
           or new.released_at is distinct from old.released_at
           or new.is_published is distinct from old.is_published
           or new.document is distinct from old.document
        then
            raise exception using errcode = 'insufficient_privilege', message = 'Legacy Summary authority fields are read-only outside the approved transactional persistence API.';
        end if;
    end if;

    if tg_op = 'DELETE' then return old; end if;
    return new;
end
$function$;

comment on function public.kp_enforce_summary_cleanup_fence() is
    'SECURITY INVOKER permanent Hybrid cleanup fence. Direct client/service-role writes remain blocked; approved 057, 068, 069, 070, 071, and 072 SECURITY DEFINER commands are authorized by their active PG_CONTEXT caller.';

revoke all on function public.kp_enforce_summary_cleanup_fence()
    from public, anon, authenticated;
grant execute on function public.kp_enforce_summary_cleanup_fence() to service_role;

do $kp_compatibility_edit_postflight$
declare
    v_function oid;
    v_api_owner oid;
    v_definition text;
    v_helper_definition text;
    v_writer_definition text;
    v_cleanup_definition text;
begin
    select p.proowner into v_api_owner
    from pg_catalog.pg_proc p
    where p.oid = to_regprocedure('public.kp_persist_require_actor(uuid)');

    v_function := to_regprocedure('public.kp_persist_update_compatibility_summary(uuid,uuid,text,text,text,text,text,text,text,text,integer,text,text,text,uuid,integer,integer,text,uuid[])');
    if v_function is null then
        raise exception using errcode = 'check_violation', message = 'Knowledge Platform migration 072 failed to install the Hybrid edit signature.';
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
       or position('summary_code is null' in lower(v_definition)) = 0
       or position('summary_code is not null' in lower(v_definition)) = 0
       or position('p_package_ids uuid[]' in lower(v_definition)) = 0
       or position('kp_persist_reconcile_package_memberships' in lower(v_definition)) = 0
       or position('kp_persist_publish_legacy_summary' in lower(v_definition)) = 0
       or position('summary_version_reference_documents' in lower(v_definition)) = 0
    then
        raise exception using errcode = 'check_violation', message = 'Knowledge Platform migration 072 installed a divergent Hybrid edit writer.';
    end if;

    if has_function_privilege('public', v_function, 'EXECUTE')
       or has_function_privilege('anon', v_function, 'EXECUTE')
       or has_function_privilege('authenticated', v_function, 'EXECUTE')
       or not has_function_privilege('service_role', v_function, 'EXECUTE')
    then
        raise exception using errcode = 'check_violation', message = 'Knowledge Platform migration 072 failed to preserve service-role-only Hybrid edit execution.';
    end if;

    select pg_catalog.pg_get_functiondef(to_regprocedure('public.kp_summary_writer_caller_is_approved()')) into v_helper_definition;
    select pg_catalog.pg_get_functiondef(to_regprocedure('public.kp_enforce_summary_writer_boundary()')) into v_writer_definition;
    select pg_catalog.pg_get_functiondef(to_regprocedure('public.kp_enforce_summary_cleanup_fence()')) into v_cleanup_definition;
    if v_helper_definition is null
       or position('pg_context' in lower(v_helper_definition)) = 0
       or position('p.oid = v_active_oid' in lower(v_helper_definition)) = 0
       or position('kp_persist_update_compatibility_summary(uuid,uuid,text,text,text,text,text,text,text,text,integer,text,text,text,uuid,integer,integer,text,uuid[])' in lower(v_helper_definition)) = 0
       or v_writer_definition is null
       or not exists (
            select 1
            from pg_catalog.pg_proc p
            where p.oid = to_regprocedure('public.kp_enforce_summary_writer_boundary()')
              and p.prosecdef = false
       )
       or position('kp_summary_writer_caller_is_approved()' in lower(v_writer_definition)) = 0
       or v_cleanup_definition is null
       or not exists (
            select 1
            from pg_catalog.pg_proc p
            where p.oid = to_regprocedure('public.kp_enforce_summary_cleanup_fence()')
              and p.prosecdef = false
       )
       or position('kp_summary_writer_caller_is_approved()' in lower(v_cleanup_definition)) = 0
       or position('session_user = current_user' in lower(v_cleanup_definition)) = 0
    then
        raise exception using errcode = 'check_violation', message = 'Knowledge Platform migration 072 failed to preserve both caller-bound Hybrid fences.';
    end if;
end
$kp_compatibility_edit_postflight$;

notify pgrst, 'reload schema';
