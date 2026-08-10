-- 072_kp_summary_bank_compatibility_edit.sql
-- Sobdai Knowledge Platform — atomic Summary Bank compatibility edit boundary.
--
-- Migration 071 is the highest numeric migration in both the tracked and
-- untracked migration namespace.  This forward migration therefore owns the
-- next safe production identity: 072.
--
-- The command below is the normal Admin Summary edit boundary.  It resolves
-- the editable revision on the server, optionally moves the marked placement,
-- and updates the legacy compatibility mirror in one transaction.  It never
-- publishes, unpublishes, retires, or fabricates ReferenceDocument evidence.

set local lock_timeout = '5s';

-- ─────────────────────────────────────────────────────────────────────────────
-- Fail closed on the frozen aggregate, marker, and writer-fence prerequisites.
-- ─────────────────────────────────────────────────────────────────────────────

do $kp_compatibility_edit_preflight$
declare
    v_function oid;
    v_api_owner oid;
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
          and c.table_name = 'package_summaries'
          and c.column_name = 'is_summary_bank_compatibility'
          and c.udt_name = 'bool'
          and c.is_nullable = 'NO'
          and c.column_default in ('false', 'false::boolean')
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
            message = 'Knowledge Platform migration 072 requires the validated migration-067 compatibility marker schema.';
    end if;

    v_function := to_regprocedure('public.kp_persist_require_actor(uuid)');
    if v_function is null then
        raise exception using
            errcode = 'check_violation',
            message = 'Knowledge Platform migration 072 requires kp_persist_require_actor(uuid).';
    end if;

    select p.proowner
    into v_api_owner
    from pg_catalog.pg_proc p
    where p.oid = v_function;

    for v_function in
        select to_regprocedure(required_signature)
        from (values
            ('public.kp_persist_reassign_compatibility_package(uuid,uuid,text,uuid)'),
            ('public.kp_enforce_summary_writer_boundary()')
        ) as required(required_signature)
    loop
        if v_function is null then
            raise exception using
                errcode = 'check_violation',
                message = 'Knowledge Platform migration 072 requires the frozen compatibility reassignment and writer-fence functions.';
        end if;
    end loop;

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
            message = 'Knowledge Platform migration 072 found corrupted compatibility marker state.';
    end if;

    if to_regprocedure('public.kp_persist_update_compatibility_summary(uuid,uuid,text,text,text,text,text,text,text,text,integer,text,text,text,uuid,integer,integer,text)') is not null then
        raise exception using
            errcode = 'duplicate_function',
            message = 'Knowledge Platform migration 072 found a pre-existing compatibility edit signature.';
    end if;

    if v_api_owner is null then
        raise exception using
            errcode = 'check_violation',
            message = 'Knowledge Platform migration 072 could not resolve the persistence API owner.';
    end if;
end
$kp_compatibility_edit_preflight$;

-- ─────────────────────────────────────────────────────────────────────────────
-- One authoritative, revision-resolving compatibility edit command.
--
-- The UI exposes one Package-scoped slug.  It is mapped exclusively to the
-- marked PackageSummary.  summaries.canonical_slug is the global identity and
-- remains immutable; no alias or canonical-slug rewrite is inferred here.
-- ─────────────────────────────────────────────────────────────────────────────

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
    p_navigation_label text
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
    v_destination_placement public.package_summaries%rowtype;
    v_conflicting_summary public.summaries%rowtype;
    v_conflicting_placement public.package_summaries%rowtype;
    v_destination_package public.packages%rowtype;
    v_revision public.summary_versions%rowtype;
    v_current_version public.summary_versions%rowtype;
    v_legacy_title text := p_title;
    v_canonical_title text := btrim(p_title);
    v_legacy_slug text := lower(btrim(p_legacy_slug));
    v_document text := case when p_document is null or p_document = '' then null else p_document end;
    v_subject_snapshot text := case when p_subject is null or btrim(p_subject) = '' then null else p_subject end;
    v_topic_snapshot text := case when p_topic is null or btrim(p_topic) = '' then null else p_topic end;
    v_law_snapshot text := case when p_law is null or btrim(p_law) = '' then null else p_law end;
    v_marker_count bigint;
    v_draft_count bigint;
    v_in_review_count bigint;
    v_published_count bigint;
    v_next_revision integer;
    v_affected bigint;
    v_revision_created boolean := false;
    v_package_reassigned boolean := false;
begin
    perform public.kp_persist_require_actor(p_actor_id);

    if p_summary_id is null or p_package_id is null then
        raise exception using
            errcode = 'invalid_parameter_value',
            message = 'Summary and Package IDs are required.';
    end if;
    if p_legacy_slug is null
       or v_legacy_slug = ''
       or p_legacy_slug <> v_legacy_slug
    then
        raise exception using
            errcode = 'check_violation',
            message = 'Compatibility legacy slug must be lowercase and trimmed.';
    end if;
    if p_title is null or v_canonical_title = ''
       or p_content_md is null or btrim(p_content_md) = ''
       or p_content_checksum is null or btrim(p_content_checksum) = ''
       or p_read_time_policy_version is null or btrim(p_read_time_policy_version) = ''
       or p_content_schema_version is null or btrim(p_content_schema_version) = ''
       or p_change_note is null or btrim(p_change_note) = ''
    then
        raise exception using
            errcode = 'invalid_parameter_value',
            message = 'Compatibility edit content and revision metadata are required.';
    end if;
    if p_read_time_minutes is null or p_read_time_minutes <= 0 then
        raise exception using
            errcode = 'invalid_parameter_value',
            message = 'Compatibility edit read time must be positive.';
    end if;
    if p_navigation_label is not null and btrim(p_navigation_label) = '' then
        raise exception using
            errcode = 'invalid_parameter_value',
            message = 'Navigation label cannot be blank.';
    end if;

    -- Lock the Summary first.  Every subsequent authority/read below occurs
    -- under that lock, and every failure rolls back the complete command.
    select *
    into v_summary
    from public.summaries s
    where s.id = p_summary_id
    for update;
    if not found then
        raise exception using
            errcode = 'no_data_found',
            message = 'Summary does not exist.';
    end if;
    if v_summary.lifecycle_status is distinct from 'active'
       or v_summary.archived_by is not null
       or v_summary.archived_at is not null
    then
        raise exception using
            errcode = 'object_not_in_prerequisite_state',
            message = 'Archived or corrupted Summary cannot be compatibility-edited.';
    end if;

    -- Lock and validate the sole compatibility authority before any write.
    select *
    into v_placement
    from public.package_summaries ps
    where ps.summary_id = p_summary_id
      and ps.is_summary_bank_compatibility
    for update;
    if not found then
        raise exception using
            errcode = 'object_not_in_prerequisite_state',
            message = 'Marked compatibility PackageSummary placement is missing.';
    end if;

    select count(*)
    into v_marker_count
    from public.package_summaries ps
    where ps.summary_id = p_summary_id
      and ps.is_summary_bank_compatibility;
    if v_marker_count <> 1 then
        raise exception using
            errcode = 'cardinality_violation',
            message = 'Compatibility edit found corrupted marker cardinality.';
    end if;
    if v_placement.legacy_slug is null
       or nullif(btrim(v_placement.legacy_slug), '') is null
       or v_placement.legacy_slug is distinct from lower(btrim(v_placement.legacy_slug))
       or v_placement.package_id is distinct from v_summary.package_id
       or v_placement.legacy_slug is distinct from v_summary.slug
    then
        raise exception using
            errcode = 'object_not_in_prerequisite_state',
            message = 'Compatibility edit found invalid or divergent marked-placement legacy state.';
    end if;

    -- Validate the destination Package and all uniqueness/conflict state while
    -- still before any mutation.  Target-only placements are only locked for
    -- conflict detection and are never updated by this command.
    select *
    into v_destination_package
    from public.packages p
    where p.id = p_package_id
    for key share;
    if not found then
        raise exception using
            errcode = 'foreign_key_violation',
            message = 'Target Package does not exist.';
    end if;

    select *
    into v_destination_placement
    from public.package_summaries ps
    where ps.package_id = p_package_id
      and ps.summary_id = p_summary_id
    for update;
    if found and (
        p_package_id is distinct from v_placement.package_id
        or not v_destination_placement.is_summary_bank_compatibility
    ) then
        raise exception using
            errcode = 'unique_violation',
            message = 'Target Package already has a Summary placement.';
    end if;

    select *
    into v_conflicting_summary
    from public.summaries s
    where s.package_id = p_package_id
      and s.slug = v_legacy_slug
      and s.id <> p_summary_id
    for update;
    if found then
        raise exception using
            errcode = 'unique_violation',
            message = 'Legacy slug already exists in the target Package.';
    end if;

    select *
    into v_conflicting_placement
    from public.package_summaries ps
    where ps.package_id = p_package_id
      and ps.legacy_slug = v_legacy_slug
      and ps.summary_id <> p_summary_id
    for update;
    if found then
        raise exception using
            errcode = 'unique_violation',
            message = 'Legacy placement slug already exists in the target Package.';
    end if;

    -- Lock every revision for deterministic aggregate inspection, then resolve
    -- the editable draft without accepting a client-supplied revision ID.
    perform sv.id
    from public.summary_versions sv
    where sv.summary_id = p_summary_id
    order by sv.revision_number, sv.id
    for update;

    select count(*)
    into v_draft_count
    from public.summary_versions sv
    where sv.summary_id = p_summary_id
      and sv.status = 'draft';
    select count(*)
    into v_in_review_count
    from public.summary_versions sv
    where sv.summary_id = p_summary_id
      and sv.status = 'in_review';

    if v_draft_count > 1 or v_in_review_count > 0 then
        raise exception using
            errcode = 'object_not_in_prerequisite_state',
            message = 'Compatibility edit found multiple or in-review open revisions.';
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
            raise exception using
                errcode = 'object_not_in_prerequisite_state',
                message = 'Compatibility edit found an invalid current published revision.';
        end if;
    elsif v_summary.is_published then
        raise exception using
            errcode = 'object_not_in_prerequisite_state',
            message = 'Published compatibility Summary has no current published revision.';
    end if;

    select count(*)
    into v_published_count
    from public.summary_versions sv
    where sv.summary_id = p_summary_id
      and sv.status = 'published';
    if v_summary.current_published_version_id is null and v_published_count <> 0 then
        raise exception using
            errcode = 'object_not_in_prerequisite_state',
            message = 'Compatibility edit found published history without a current pointer.';
    end if;

    if v_summary.is_published
       and (v_summary.current_published_version_id is null or v_placement.status <> 'active')
    then
        raise exception using
            errcode = 'object_not_in_prerequisite_state',
            message = 'Published compatibility Summary does not have an active marked placement.';
    end if;
    if not v_summary.is_published
       and v_summary.current_published_version_id is not null
       and v_placement.status <> 'hidden'
    then
        raise exception using
            errcode = 'object_not_in_prerequisite_state',
            message = 'Unpublished compatibility Summary does not have a hidden marked placement.';
    end if;
    if not v_summary.is_published
       and v_summary.current_published_version_id is null
       and v_placement.status <> 'draft'
    then
        raise exception using
            errcode = 'object_not_in_prerequisite_state',
            message = 'Never-published compatibility Summary does not have a draft marked placement.';
    end if;

    if v_draft_count = 1 then
        select *
        into v_revision
        from public.summary_versions sv
        where sv.summary_id = p_summary_id
          and sv.status = 'draft'
        for update;
    elsif v_summary.current_published_version_id is not null then
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
            public.uuid_generate_v4(), p_summary_id, v_next_revision, 'draft',
            p_content_md, p_content_checksum, v_legacy_title,
            v_subject_snapshot, v_topic_snapshot, v_law_snapshot,
            p_read_time_minutes, btrim(p_read_time_policy_version),
            btrim(p_content_schema_version), btrim(p_change_note),
            p_actor_id, v_now, v_now
        )
        returning * into v_revision;
        v_revision_created := true;
    else
        raise exception using
            errcode = 'object_not_in_prerequisite_state',
            message = 'Compatibility edit requires an existing editable draft or published history.';
    end if;

    if v_revision.id is null or v_revision.summary_id is distinct from p_summary_id then
        raise exception using
            errcode = 'object_not_in_prerequisite_state',
            message = 'Compatibility edit could not resolve an editable revision.';
    end if;

    -- Existing draft source relationships are protected evidence.  Normal
    -- free-form document editing never clears or rewrites them; an explicit
    -- relationship therefore fails closed under the established import rule.
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
            message = 'Compatibility edit cannot overwrite a draft with explicit source snapshots.';
    end if;

    -- All validation and revision resolution has completed.  Reassign through
    -- the frozen 068 primitive only inside this transaction; no application
    -- caller can observe a package move without the content update.
    if v_placement.package_id is distinct from p_package_id then
        perform public.kp_persist_reassign_compatibility_package(
            p_summary_id,
            p_package_id,
            v_legacy_slug,
            p_actor_id
        );
        v_package_reassigned := true;

        select *
        into v_placement
        from public.package_summaries ps
        where ps.summary_id = p_summary_id
          and ps.is_summary_bank_compatibility
        for update;
        if not found then
            raise exception using
                errcode = 'object_not_in_prerequisite_state',
                message = 'Compatibility edit lost its marked placement during reassignment.';
        end if;
    elsif v_placement.legacy_slug is distinct from v_legacy_slug then
        update public.summaries
        set slug = v_legacy_slug,
            updated_at = v_now
        where id = p_summary_id;
        get diagnostics v_affected = row_count;
        if v_affected <> 1 then
            raise exception using
                errcode = 'cardinality_violation',
                message = 'Compatibility edit did not update exactly one Summary slug mirror.';
        end if;

        update public.package_summaries
        set legacy_slug = v_legacy_slug,
            updated_at = v_now
        where package_id = v_placement.package_id
          and summary_id = p_summary_id
          and is_summary_bank_compatibility;
        get diagnostics v_affected = row_count;
        if v_affected <> 1 then
            raise exception using
                errcode = 'cardinality_violation',
                message = 'Compatibility edit did not update exactly one marked slug mirror.';
        end if;
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
        raise exception using
            errcode = 'cardinality_violation',
            message = 'Compatibility edit did not update exactly one editable revision.';
    end if;

    -- Keep exact legacy mirror values in the root (including optional text
    -- fields), while preserving canonical_slug, publication state, and the
    -- current published pointer.  Empty document is the established legacy
    -- NULL representation; no ReferenceDocument relationship is inferred.
    update public.summaries
    set canonical_title = v_canonical_title,
        title = v_legacy_title,
        subject = p_subject,
        topic = p_topic,
        law = p_law,
        document = v_document,
        content_md = p_content_md,
        read_time_minutes = p_read_time_minutes,
        sort_order = coalesce(p_sort_order, 0),
        display_order = coalesce(p_display_order, v_summary.display_order),
        updated_at = v_now
    where id = p_summary_id;
    get diagnostics v_affected = row_count;
    if v_affected <> 1 then
        raise exception using
            errcode = 'cardinality_violation',
            message = 'Compatibility edit did not update exactly one Summary root.';
    end if;

    update public.package_summaries
    set sort_order = coalesce(p_sort_order, 0),
        display_order = coalesce(p_display_order, v_placement.display_order),
        navigation_label = case
            when p_navigation_label is null then v_placement.navigation_label
            else nullif(btrim(p_navigation_label), '')
        end,
        updated_at = v_now
    where package_id = v_placement.package_id
      and summary_id = p_summary_id
      and is_summary_bank_compatibility;
    get diagnostics v_affected = row_count;
    if v_affected <> 1 then
        raise exception using
            errcode = 'cardinality_violation',
            message = 'Compatibility edit did not update exactly one marked placement.';
    end if;

    -- Re-check marker authority after the writes; this is an assertion, not a
    -- repair.  Any failed assertion aborts the whole transaction.
    select count(*)
    into v_marker_count
    from public.package_summaries ps
    where ps.summary_id = p_summary_id
      and ps.is_summary_bank_compatibility;
    if v_marker_count <> 1
       or not exists (
            select 1
            from public.summaries s
            join public.package_summaries ps
              on ps.summary_id = s.id
             and ps.is_summary_bank_compatibility
            where s.id = p_summary_id
              and ps.package_id = s.package_id
              and ps.legacy_slug = s.slug
              and ps.legacy_slug = v_legacy_slug
              and ps.legacy_slug = lower(btrim(ps.legacy_slug))
              and ps.sort_order = s.sort_order
              and ps.display_order = s.display_order
       )
    then
        raise exception using
            errcode = 'cardinality_violation',
            message = 'Compatibility edit postcondition found corrupted marker mirrors.';
    end if;

    return jsonb_build_object(
        'success', true,
        'outcome', 'updated',
        'summary_id', p_summary_id,
        'summary_version_id', v_revision.id,
        'package_id', v_placement.package_id,
        'legacy_slug', v_legacy_slug,
        'revision_created', v_revision_created,
        'package_reassigned', v_package_reassigned
    );
end
$function$;

comment on function public.kp_persist_update_compatibility_summary(uuid,uuid,text,text,text,text,text,text,text,text,integer,text,text,text,uuid,integer,integer,text) is
    'Atomic Summary Bank compatibility edit: resolves one editable draft or creates the next draft after published history, preserves canonical/publication identity, updates the exact legacy document mirror, and optionally reassigns the marked Package placement in one transaction.';

revoke all on function public.kp_persist_update_compatibility_summary(uuid,uuid,text,text,text,text,text,text,text,text,integer,text,text,text,uuid,integer,integer,text)
    from public, anon, authenticated;
grant execute on function public.kp_persist_update_compatibility_summary(uuid,uuid,text,text,text,text,text,text,text,text,integer,text,text,text,uuid,integer,integer,text)
    to service_role;

-- ─────────────────────────────────────────────────────────────────────────────
-- Catalog postflight.  The new boundary must remain owned by the frozen API
-- owner and must not weaken the migration-058 writer fence or grants.
-- ─────────────────────────────────────────────────────────────────────────────

do $kp_compatibility_edit_postflight$
declare
    v_function oid;
    v_api_owner oid;
    v_definition text;
begin
    v_function := to_regprocedure('public.kp_persist_update_compatibility_summary(uuid,uuid,text,text,text,text,text,text,text,text,integer,text,text,text,uuid,integer,integer,text)');
    if v_function is null then
        raise exception using
            errcode = 'check_violation',
            message = 'Knowledge Platform migration 072 failed to install the compatibility edit signature.';
    end if;

    select p.proowner, pg_catalog.pg_get_functiondef(p.oid)
    into v_api_owner, v_definition
    from pg_catalog.pg_proc p
    where p.oid = v_function
      and p.prosecdef
      and array_to_string(p.proconfig, ',') ilike '%search_path=pg_catalog, public, pg_temp%'
      and array_to_string(p.proconfig, ',') ilike '%lock_timeout=5s%';

    if v_api_owner is null
       or v_api_owner is distinct from (
            select p.proowner
            from pg_catalog.pg_proc p
            where p.oid = to_regprocedure('public.kp_persist_require_actor(uuid)')
       )
       or position('is_summary_bank_compatibility' in v_definition) = 0
       or position('summary_version_reference_documents' in v_definition) = 0
       or position('kp_persist_reassign_compatibility_package' in v_definition) = 0
       or position('revision_created' in v_definition) = 0
       or position('package_reassigned' in v_definition) = 0
       or position('current_published_version_id' in v_definition) = 0
       or position('document' in v_definition) = 0
    then
        raise exception using
            errcode = 'check_violation',
            message = 'Knowledge Platform migration 072 installed a divergent or unlocked compatibility edit boundary.';
    end if;

    if has_function_privilege('public', v_function, 'EXECUTE')
       or has_function_privilege('anon', v_function, 'EXECUTE')
       or has_function_privilege('authenticated', v_function, 'EXECUTE')
       or not has_function_privilege('service_role', v_function, 'EXECUTE')
    then
        raise exception using
            errcode = 'check_violation',
            message = 'Knowledge Platform migration 072 failed to preserve service-role-only compatibility edit execution.';
    end if;

    if to_regprocedure('public.kp_enforce_summary_writer_boundary()') is null then
        raise exception using
            errcode = 'check_violation',
            message = 'Knowledge Platform migration 072 cannot verify the migration-058 writer fence.';
    end if;
end
$kp_compatibility_edit_postflight$;

notify pgrst, 'reload schema';
