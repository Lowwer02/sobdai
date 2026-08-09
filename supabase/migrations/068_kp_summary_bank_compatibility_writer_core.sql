-- 068_kp_summary_bank_compatibility_writer_core.sql
-- Sobdai Knowledge Platform — Summary Bank compatibility marker writer core.
--
-- Migration 067 introduced the durable compatibility-placement marker. This
-- forward migration makes the existing transactional persistence API maintain
-- that marker. It deliberately does not change publication, application
-- writers, or the Summary Library read repository.

set local lock_timeout = '5s';

-- Fail closed if migration 067 or the frozen 057/058 writer boundary is not
-- present exactly as required. CREATE OR REPLACE below retains the function
-- identities and owners used by the migration-058 writer-fence allowlist.
do $kp_summary_bank_writer_core_preflight$
declare
    expected record;
    v_function oid;
    v_api_owner oid;
    v_marker_attnum smallint;
begin
    if to_regclass('public.package_summaries') is null
       or to_regclass('public.summaries') is null
       or to_regclass('public.summary_versions') is null
    then
        raise exception using
            errcode = 'check_violation',
            message = 'Knowledge Platform migration 068 requires the frozen Summary aggregate tables.';
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
    ) then
        raise exception using
            errcode = 'check_violation',
            message = 'Knowledge Platform migration 068 requires the migration-067 compatibility marker.';
    end if;

    if not exists (
            select 1
            from pg_catalog.pg_constraint c
            where c.conrelid = 'public.package_summaries'::regclass
              and c.conname = 'package_summaries_bank_compatibility_slug_check'
              and c.contype = 'c'
              and c.convalidated
              and pg_catalog.pg_get_constraintdef(c.oid) ilike '%NOT is_summary_bank_compatibility%legacy_slug IS NOT NULL%'
       )
    then
        raise exception using
            errcode = 'check_violation',
            message = 'Knowledge Platform migration 068 requires the validated migration-067 marker CHECK.';
    end if;

    select a.attnum into v_marker_attnum
    from pg_catalog.pg_attribute a
    where a.attrelid = 'public.package_summaries'::regclass
      and a.attname = 'summary_id'
      and not a.attisdropped;

    if not exists (
        select 1
        from pg_catalog.pg_class c
        join pg_catalog.pg_namespace n on n.oid = c.relnamespace
        join pg_catalog.pg_index i on i.indexrelid = c.oid
        where n.nspname = 'public'
          and c.relname = 'package_summaries_one_bank_compatibility_key'
          and i.indrelid = 'public.package_summaries'::regclass
          and i.indisunique
          and i.indisvalid
          and i.indisready
          and i.indnkeyatts = 1
          and i.indkey[0] = v_marker_attnum
          and pg_catalog.pg_get_expr(i.indpred, i.indrelid) in (
              'is_summary_bank_compatibility',
              '(is_summary_bank_compatibility = true)'
          )
    ) then
        raise exception using
            errcode = 'check_violation',
            message = 'Knowledge Platform migration 068 requires the migration-067 partial unique marker index.';
    end if;

    v_function := to_regprocedure('public.kp_persist_require_actor(uuid)');
    if v_function is null then
        raise exception using
            errcode = 'check_violation',
            message = 'Knowledge Platform migration 068 requires kp_persist_require_actor(uuid).';
    end if;

    select p.proowner into v_api_owner
    from pg_catalog.pg_proc p
    where p.oid = v_function;

    for expected in
        select function_name
        from (values
            ('public.kp_persist_create_compatibility_summary(uuid,text,text,text,text,text,text,text,uuid,text,text,text,integer,text,text,text,uuid,uuid,integer,integer,text)'),
            ('public.kp_persist_update_compatibility_draft(uuid,uuid,text,text,text,text,text,text,uuid,text,text,text,integer,text,text,text,uuid,integer,integer,text)'),
            ('public.kp_persist_reassign_compatibility_package(uuid,uuid,text,uuid)'),
            ('public.kp_persist_attach_package_summary(uuid,uuid,text,text,uuid,integer,integer,timestamptz,text,text,uuid)'),
            ('public.kp_persist_detach_package_summary(uuid,uuid,uuid)')
        ) as required(function_name)
    loop
        v_function := to_regprocedure(expected.function_name);
        if v_function is null then
            raise exception using
                errcode = 'check_violation',
                message = format('Knowledge Platform migration 068 persistence prerequisite is missing: %s.', expected.function_name);
        end if;

        if not exists (
            select 1
            from pg_catalog.pg_proc p
            where p.oid = v_function
              and p.proowner = v_api_owner
              and p.prosecdef
              and array_to_string(p.proconfig, ',') ilike '%search_path=pg_catalog, public, pg_temp%'
              and array_to_string(p.proconfig, ',') ilike '%lock_timeout=5s%'
        ) then
            raise exception using
                errcode = 'check_violation',
                message = format('Knowledge Platform migration 068 found a divergent writer security contract: %s.', expected.function_name);
        end if;

        if has_function_privilege('public', v_function, 'EXECUTE')
           or has_function_privilege('anon', v_function, 'EXECUTE')
           or has_function_privilege('authenticated', v_function, 'EXECUTE')
           or not has_function_privilege('service_role', v_function, 'EXECUTE')
        then
            raise exception using
                errcode = 'check_violation',
                message = format('Knowledge Platform migration 068 found divergent service-role-only grants: %s.', expected.function_name);
        end if;
    end loop;

    if to_regprocedure('public.kp_enforce_summary_writer_boundary()') is null then
        raise exception using
            errcode = 'check_violation',
            message = 'Knowledge Platform migration 068 requires the migration-058 Summary writer fence.';
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
    ) then
        raise exception using
            errcode = 'cardinality_violation',
            message = 'Knowledge Platform migration 068 requires exactly one marked placement for every existing Summary.';
    end if;

    if exists (
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
    ) then
        raise exception using
            errcode = 'check_violation',
            message = 'Knowledge Platform migration 068 found invalid or divergent marked-placement legacy state.';
    end if;
end
$kp_summary_bank_writer_core_preflight$;

create or replace function public.kp_persist_create_compatibility_summary(
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
    v_version public.summary_versions%rowtype;
    v_placement public.package_summaries%rowtype;
    v_summary_code text := upper(btrim(p_summary_code));
    v_canonical_slug text := lower(btrim(p_canonical_slug));
    v_legacy_slug text := lower(btrim(p_legacy_slug));
    v_marker_count bigint;
begin
    perform public.kp_persist_require_actor(p_actor_id);

    if p_summary_id is null or p_version_id is null or p_package_id is null then
        raise exception using errcode = 'invalid_parameter_value', message = 'Summary, revision, and Package IDs are required.';
    end if;
    if p_summary_code is null or p_canonical_slug is null or p_legacy_slug is null
       or v_summary_code = '' or v_canonical_slug = '' or v_legacy_slug = '' then
        raise exception using errcode = 'invalid_parameter_value', message = 'Summary and legacy slugs/codes cannot be blank.';
    end if;
    if p_canonical_title is null or btrim(p_canonical_title) = '' then
        raise exception using errcode = 'invalid_parameter_value', message = 'Canonical Summary title is required.';
    end if;
    if p_content_md is null or btrim(p_content_md) = ''
       or p_content_checksum is null or btrim(p_content_checksum) = ''
       or p_read_time_policy_version is null or btrim(p_read_time_policy_version) = ''
       or p_content_schema_version is null or btrim(p_content_schema_version) = ''
       or p_change_note is null or btrim(p_change_note) = ''
    then
        raise exception using errcode = 'invalid_parameter_value', message = 'Initial Summary revision content and policy metadata are required.';
    end if;
    if p_read_time_minutes is null or p_read_time_minutes <= 0 then
        raise exception using errcode = 'invalid_parameter_value', message = 'Read time must be positive.';
    end if;
    if p_visibility is null
       or p_visibility not in ('public_indexable', 'authenticated', 'product_entitled') then
        raise exception using errcode = 'invalid_parameter_value', message = 'Summary visibility is invalid.';
    end if;
    if p_canonical_slug is null or p_legacy_slug is null
       or v_canonical_slug = '' or v_legacy_slug = ''
       or p_canonical_slug <> v_canonical_slug
       or p_legacy_slug <> v_legacy_slug
    then
        raise exception using errcode = 'check_violation', message = 'Summary slugs must be lowercase and trimmed.';
    end if;
    if p_navigation_label is not null and btrim(p_navigation_label) = '' then
        raise exception using errcode = 'invalid_parameter_value', message = 'Navigation label cannot be blank.';
    end if;

    select *
    into v_summary
    from public.summaries s
    where s.id = p_summary_id
    for update;

    if found then
        if v_summary.summary_code is distinct from v_summary_code
           or v_summary.canonical_slug is distinct from v_canonical_slug
           or v_summary.canonical_title is distinct from btrim(p_canonical_title)
           or v_summary.package_id is distinct from p_package_id
           or v_summary.slug is distinct from v_legacy_slug
           or v_summary.content_md is distinct from p_content_md
        then
            raise exception using errcode = 'unique_violation', message = 'Summary create retry conflicts with existing immutable compatibility identity.';
        end if;

        select *
        into v_version
        from public.summary_versions sv
        where sv.id = p_version_id
          and sv.summary_id = p_summary_id
        for update;
        if not found then
            raise exception using errcode = 'object_not_in_prerequisite_state', message = 'Summary root exists without the requested compatibility revision.';
        end if;

        select *
        into v_placement
        from public.package_summaries ps
        where ps.summary_id = p_summary_id
          and ps.is_summary_bank_compatibility
        for update;
        if not found
           or v_placement.package_id is distinct from p_package_id
           or v_placement.legacy_slug is distinct from v_legacy_slug
        then
            raise exception using errcode = 'object_not_in_prerequisite_state', message = 'Summary root exists without the requested marked compatibility placement.';
        end if;

        select count(*) into v_marker_count
        from public.package_summaries ps
        where ps.summary_id = p_summary_id
          and ps.is_summary_bank_compatibility;
        if v_marker_count <> 1 then
            raise exception using errcode = 'cardinality_violation', message = 'Summary create retry found corrupted compatibility marker state.';
        end if;

        return jsonb_build_object(
            'summary_id', p_summary_id,
            'summary_version_id', p_version_id,
            'package_id', p_package_id,
            'idempotent_retry', true
        );
    end if;

    insert into public.summaries (
        id, package_id, title, slug, subject, law, topic, content_md,
        read_time_minutes, sort_order, is_published, created_at, updated_at,
        summary_code, canonical_slug, canonical_title, visibility,
        lifecycle_status, current_published_version_id, created_by,
        archived_by, archived_at
    ) values (
        p_summary_id, p_package_id, btrim(p_canonical_title), v_legacy_slug,
        nullif(btrim(p_subject), ''), nullif(btrim(p_law), ''),
        nullif(btrim(p_topic), ''), p_content_md, p_read_time_minutes,
        coalesce(p_sort_order, 0), false, v_now, v_now, v_summary_code,
        v_canonical_slug, btrim(p_canonical_title), p_visibility, 'active',
        null, p_actor_id, null, null
    );

    insert into public.summary_versions (
        id, summary_id, revision_number, status, content_md, content_checksum,
        title_snapshot, subject_snapshot, topic_snapshot, law_snapshot,
        read_time_minutes, read_time_policy_version, content_schema_version,
        change_note, authored_by, created_at, updated_at
    ) values (
        p_version_id, p_summary_id, 1, 'draft', p_content_md,
        p_content_checksum, btrim(p_canonical_title),
        nullif(btrim(p_subject), ''), nullif(btrim(p_topic), ''),
        nullif(btrim(p_law), ''), p_read_time_minutes,
        btrim(p_read_time_policy_version), btrim(p_content_schema_version),
        btrim(p_change_note), p_actor_id, v_now, v_now
    );

    insert into public.package_summaries (
        package_id, summary_id, status, version_policy,
        pinned_summary_version_id, sort_order, display_order, released_at,
        navigation_label, legacy_slug, is_summary_bank_compatibility,
        created_by, created_at, updated_at, activated_by, activated_at,
        hidden_by, hidden_at
    ) values (
        p_package_id, p_summary_id, 'draft', 'latest_published', null,
        coalesce(p_sort_order, 0), coalesce(p_display_order, 0), null,
        nullif(btrim(p_navigation_label), ''), v_legacy_slug, true,
        p_actor_id, v_now, v_now, null, null, null, null
    );

    select count(*) into v_marker_count
    from public.package_summaries ps
    where ps.summary_id = p_summary_id
      and ps.is_summary_bank_compatibility;
    if v_marker_count <> 1 then
        raise exception using errcode = 'cardinality_violation', message = 'Compatibility Summary create did not produce exactly one marked placement.';
    end if;

    return jsonb_build_object(
        'summary_id', p_summary_id,
        'summary_version_id', p_version_id,
        'package_id', p_package_id,
        'idempotent_retry', false
    );
end
$function$;

comment on function public.kp_persist_create_compatibility_summary(uuid,text,text,text,text,text,text,text,uuid,text,text,text,integer,text,text,text,uuid,uuid,integer,integer,text) is
    'Atomic compatibility create: legacy Summary mirror, target root/revision, and exactly one marked Summary Bank PackageSummary placement.';

create or replace function public.kp_persist_update_compatibility_draft(
    p_summary_id uuid,
    p_version_id uuid,
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
    v_version public.summary_versions%rowtype;
    v_placement public.package_summaries%rowtype;
    v_canonical_slug text := lower(btrim(p_canonical_slug));
    v_legacy_slug text := lower(btrim(p_legacy_slug));
    v_marker_count bigint;
begin
    perform public.kp_persist_require_actor(p_actor_id);
    if p_summary_id is null or p_version_id is null or p_package_id is null then
        raise exception using errcode = 'invalid_parameter_value', message = 'Summary, revision, and Package IDs are required.';
    end if;
    if p_canonical_slug is null or p_legacy_slug is null
       or v_canonical_slug = '' or v_legacy_slug = ''
       or p_canonical_slug <> v_canonical_slug
       or p_legacy_slug <> v_legacy_slug
    then
        raise exception using errcode = 'check_violation', message = 'Summary slugs must be lowercase and trimmed.';
    end if;
    if p_canonical_title is null or btrim(p_canonical_title) = ''
       or p_content_md is null or btrim(p_content_md) = ''
       or p_content_checksum is null or btrim(p_content_checksum) = ''
       or p_read_time_policy_version is null or btrim(p_read_time_policy_version) = ''
       or p_content_schema_version is null or btrim(p_content_schema_version) = ''
       or p_change_note is null or btrim(p_change_note) = ''
    then
        raise exception using errcode = 'invalid_parameter_value', message = 'Draft Summary content and metadata are required.';
    end if;
    if p_read_time_minutes is null or p_read_time_minutes <= 0 then
        raise exception using errcode = 'invalid_parameter_value', message = 'Read time must be positive.';
    end if;
    if p_visibility is null
       or p_visibility not in ('public_indexable', 'authenticated', 'product_entitled') then
        raise exception using errcode = 'invalid_parameter_value', message = 'Summary visibility is invalid.';
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
        raise exception using errcode = 'cardinality_violation', message = 'Compatibility draft update found corrupted marker state.';
    end if;

    if v_placement.legacy_slug is null
       or nullif(btrim(v_placement.legacy_slug), '') is null
       or v_placement.legacy_slug is distinct from lower(btrim(v_placement.legacy_slug))
       or v_placement.package_id is distinct from v_summary.package_id
       or v_placement.legacy_slug is distinct from v_summary.slug
       or v_placement.package_id is distinct from p_package_id
    then
        raise exception using errcode = 'object_not_in_prerequisite_state', message = 'Compatibility draft update found invalid or divergent marked-placement legacy state; use the explicit reassign command only from valid source state.';
    end if;

    select * into v_version
    from public.summary_versions sv
    where sv.id = p_version_id
      and sv.summary_id = p_summary_id
    for update;
    if not found then
        raise exception using errcode = 'no_data_found', message = 'Summary revision does not belong to the Summary.';
    end if;
    if v_version.status <> 'draft' then
        raise exception using errcode = 'object_not_in_prerequisite_state', message = 'Only a draft Summary revision can be edited.';
    end if;

    update public.summaries
    set canonical_slug = v_canonical_slug,
        canonical_title = btrim(p_canonical_title),
        subject = nullif(btrim(p_subject), ''),
        topic = nullif(btrim(p_topic), ''),
        law = nullif(btrim(p_law), ''),
        visibility = p_visibility,
        title = btrim(p_canonical_title),
        slug = v_legacy_slug,
        content_md = p_content_md,
        read_time_minutes = p_read_time_minutes,
        sort_order = coalesce(p_sort_order, 0),
        updated_at = v_now
    where id = p_summary_id;

    update public.summary_versions
    set content_md = p_content_md,
        content_checksum = p_content_checksum,
        title_snapshot = btrim(p_canonical_title),
        subject_snapshot = nullif(btrim(p_subject), ''),
        topic_snapshot = nullif(btrim(p_topic), ''),
        law_snapshot = nullif(btrim(p_law), ''),
        read_time_minutes = p_read_time_minutes,
        read_time_policy_version = btrim(p_read_time_policy_version),
        content_schema_version = btrim(p_content_schema_version),
        change_note = btrim(p_change_note),
        updated_at = v_now
    where id = p_version_id
      and summary_id = p_summary_id;

    update public.package_summaries
    set sort_order = coalesce(p_sort_order, 0),
        display_order = coalesce(p_display_order, 0),
        navigation_label = nullif(btrim(p_navigation_label), ''),
        legacy_slug = v_legacy_slug,
        updated_at = v_now
    where package_id = v_placement.package_id
      and summary_id = p_summary_id
      and is_summary_bank_compatibility;

    get diagnostics v_marker_count = row_count;
    if v_marker_count <> 1 then
        raise exception using errcode = 'cardinality_violation', message = 'Compatibility draft update did not update exactly one marked placement.';
    end if;

    return jsonb_build_object(
        'summary_id', p_summary_id,
        'summary_version_id', p_version_id,
        'package_id', v_placement.package_id
    );
end
$function$;

comment on function public.kp_persist_update_compatibility_draft(uuid,uuid,text,text,text,text,text,text,uuid,text,text,text,integer,text,text,text,uuid,integer,integer,text) is
    'Atomic compatibility draft edit resolved through the single marked Summary Bank placement; the marker itself is never moved by this command.';

create or replace function public.kp_persist_reassign_compatibility_package(
    p_summary_id uuid,
    p_new_package_id uuid,
    p_new_legacy_slug text,
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
    v_legacy public.summaries%rowtype;
    v_old_placement public.package_summaries%rowtype;
    v_new_slug text := lower(btrim(p_new_legacy_slug));
    v_marker_count bigint;
begin
    perform public.kp_persist_require_actor(p_actor_id);
    if p_summary_id is null or p_new_package_id is null
       or p_new_legacy_slug is null or v_new_slug = ''
    then
        raise exception using errcode = 'invalid_parameter_value', message = 'Package reassignment requires Summary, Package, and legacy slug.';
    end if;
    if p_new_legacy_slug <> v_new_slug then
        raise exception using errcode = 'check_violation', message = 'Legacy Summary slug must be lowercase and trimmed.';
    end if;
    if not exists (
        select 1 from public.packages p where p.id = p_new_package_id
    ) then
        raise exception using errcode = 'foreign_key_violation', message = 'Target Package does not exist.';
    end if;

    select * into v_legacy
    from public.summaries s
    where s.id = p_summary_id
    for update;
    if not found then
        raise exception using errcode = 'no_data_found', message = 'Summary does not exist.';
    end if;

    select * into v_old_placement
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
        raise exception using errcode = 'cardinality_violation', message = 'Package reassignment found corrupted compatibility marker state.';
    end if;

    if v_old_placement.legacy_slug is null
       or nullif(btrim(v_old_placement.legacy_slug), '') is null
       or v_old_placement.legacy_slug is distinct from lower(btrim(v_old_placement.legacy_slug))
       or v_old_placement.package_id is distinct from v_legacy.package_id
       or v_old_placement.legacy_slug is distinct from v_legacy.slug
    then
        raise exception using errcode = 'object_not_in_prerequisite_state', message = 'Package reassignment found invalid or divergent marked-placement legacy state.';
    end if;

    if v_old_placement.package_id = p_new_package_id then
        if v_legacy.slug = v_new_slug then
            return jsonb_build_object('summary_id', p_summary_id, 'package_id', p_new_package_id, 'idempotent_retry', true);
        end if;

        update public.summaries
        set slug = v_new_slug, updated_at = v_now
        where id = p_summary_id;

        update public.package_summaries
        set legacy_slug = v_new_slug, updated_at = v_now
        where package_id = v_old_placement.package_id
          and summary_id = p_summary_id
          and is_summary_bank_compatibility;

        get diagnostics v_marker_count = row_count;
        if v_marker_count <> 1 then
            raise exception using errcode = 'cardinality_violation', message = 'Package reassignment did not update exactly one marked placement.';
        end if;

        return jsonb_build_object('summary_id', p_summary_id, 'package_id', p_new_package_id, 'idempotent_retry', false);
    end if;

    if exists (
        select 1
        from public.package_summaries ps
        where ps.package_id = p_new_package_id
          and ps.summary_id = p_summary_id
    ) then
        raise exception using errcode = 'unique_violation', message = 'Target Package already has a Summary placement.';
    end if;

    update public.summaries
    set package_id = p_new_package_id,
        slug = v_new_slug,
        updated_at = v_now
    where id = p_summary_id;

    delete from public.package_summaries
    where package_id = v_old_placement.package_id
      and summary_id = p_summary_id
      and is_summary_bank_compatibility;

    get diagnostics v_marker_count = row_count;
    if v_marker_count <> 1 then
        raise exception using errcode = 'cardinality_violation', message = 'Package reassignment did not remove exactly one old marked placement.';
    end if;

    insert into public.package_summaries (
        package_id, summary_id, status, version_policy,
        pinned_summary_version_id, sort_order, display_order, released_at,
        navigation_label, legacy_slug, is_summary_bank_compatibility,
        created_by, created_at, updated_at, activated_by, activated_at,
        hidden_by, hidden_at
    ) values (
        p_new_package_id, p_summary_id, v_old_placement.status,
        v_old_placement.version_policy, v_old_placement.pinned_summary_version_id,
        v_old_placement.sort_order, v_old_placement.display_order,
        v_old_placement.released_at, v_old_placement.navigation_label,
        v_new_slug, true, p_actor_id, v_now, v_now,
        case when v_old_placement.status = 'active' then p_actor_id else null end,
        case when v_old_placement.status = 'active' then v_now else null end,
        case when v_old_placement.status = 'hidden' then p_actor_id else null end,
        case when v_old_placement.status = 'hidden' then v_now else null end
    );

    select count(*) into v_marker_count
    from public.package_summaries ps
    where ps.summary_id = p_summary_id
      and ps.package_id = p_new_package_id
      and ps.is_summary_bank_compatibility;
    if v_marker_count <> 1 then
        raise exception using errcode = 'cardinality_violation', message = 'Package reassignment did not produce exactly one marked placement at the target Package.';
    end if;

    return jsonb_build_object('summary_id', p_summary_id, 'package_id', p_new_package_id, 'idempotent_retry', false);
end
$function$;

comment on function public.kp_persist_reassign_compatibility_package(uuid,uuid,text,uuid) is
    'Atomic compatibility Package reassignment resolved by marker; moves the sole marked placement without changing target-only placements.';

create or replace function public.kp_persist_attach_package_summary(
    p_package_id uuid,
    p_summary_id uuid,
    p_status text,
    p_version_policy text,
    p_pinned_summary_version_id uuid,
    p_sort_order integer,
    p_display_order integer,
    p_released_at timestamptz,
    p_navigation_label text,
    p_legacy_slug text,
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
    v_current_version_id uuid;
    v_pinned_status text;
    v_summary public.summaries%rowtype;
    v_compatibility_placement public.package_summaries%rowtype;
    v_marker_count bigint;
    v_slug text := case when p_legacy_slug is null then null else lower(btrim(p_legacy_slug)) end;
begin
    perform public.kp_persist_require_actor(p_actor_id);
    if p_package_id is null or p_summary_id is null then
        raise exception using errcode = 'invalid_parameter_value', message = 'Package and Summary IDs are required.';
    end if;
    if p_status is null or p_version_policy is null
       or p_status not in ('draft', 'active', 'hidden')
       or p_version_policy not in ('latest_published', 'pinned')
    then
        raise exception using errcode = 'invalid_parameter_value', message = 'PackageSummary status or version policy is invalid.';
    end if;
    if v_slug is not null and p_legacy_slug <> v_slug then
        raise exception using errcode = 'check_violation', message = 'PackageSummary legacy slug must be lowercase and trimmed.';
    end if;
    if p_version_policy = 'latest_published' and p_pinned_summary_version_id is not null then
        raise exception using errcode = 'check_violation', message = 'Latest-published placement cannot specify a pinned revision.';
    end if;
    if p_version_policy = 'pinned' and p_pinned_summary_version_id is null then
        raise exception using errcode = 'check_violation', message = 'Pinned placement requires a revision.';
    end if;
    if not exists (select 1 from public.packages p where p.id = p_package_id) then
        raise exception using errcode = 'foreign_key_violation', message = 'PackageSummary parent does not exist.';
    end if;

    select * into v_summary
    from public.summaries s
    where s.id = p_summary_id
    for update;
    if not found then
        raise exception using errcode = 'foreign_key_violation', message = 'PackageSummary parent does not exist.';
    end if;

    select * into v_compatibility_placement
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
        raise exception using errcode = 'cardinality_violation', message = 'Target attachment found corrupted compatibility marker state.';
    end if;

    if v_compatibility_placement.legacy_slug is null
       or nullif(btrim(v_compatibility_placement.legacy_slug), '') is null
       or v_compatibility_placement.legacy_slug is distinct from lower(btrim(v_compatibility_placement.legacy_slug))
       or v_compatibility_placement.package_id is distinct from v_summary.package_id
       or v_compatibility_placement.legacy_slug is distinct from v_summary.slug
    then
        raise exception using errcode = 'object_not_in_prerequisite_state', message = 'Target attachment found invalid or divergent marked-placement legacy state.';
    end if;

    if exists (
        select 1 from public.package_summaries ps
        where ps.package_id = p_package_id and ps.summary_id = p_summary_id
    ) then
        raise exception using errcode = 'unique_violation', message = 'PackageSummary placement already exists.';
    end if;

    if p_pinned_summary_version_id is not null then
        select status into v_pinned_status
        from public.summary_versions sv
        where sv.id = p_pinned_summary_version_id
          and sv.summary_id = p_summary_id
        for update;
        if not found or v_pinned_status <> 'published' then
            raise exception using errcode = 'object_not_in_prerequisite_state', message = 'Pinned PackageSummary revision must belong to the Summary and be published.';
        end if;
    end if;

    if p_status = 'active' and p_version_policy = 'latest_published' then
        select current_published_version_id into v_current_version_id
        from public.summaries
        where id = p_summary_id
        for update;
        if v_current_version_id is null
           or not exists (
               select 1 from public.summary_versions sv
               where sv.id = v_current_version_id
                 and sv.summary_id = p_summary_id
                 and sv.status = 'published'
           )
        then
            raise exception using errcode = 'object_not_in_prerequisite_state', message = 'Active latest-published placement requires a published current revision.';
        end if;
    end if;

    insert into public.package_summaries (
        package_id, summary_id, status, version_policy,
        pinned_summary_version_id, sort_order, display_order, released_at,
        navigation_label, legacy_slug, is_summary_bank_compatibility,
        created_by, created_at, updated_at, activated_by, activated_at,
        hidden_by, hidden_at
    ) values (
        p_package_id, p_summary_id, p_status, p_version_policy,
        p_pinned_summary_version_id, coalesce(p_sort_order, 0),
        coalesce(p_display_order, 0), p_released_at,
        nullif(btrim(p_navigation_label), ''), v_slug, false,
        p_actor_id, v_now, v_now,
        case when p_status = 'active' then p_actor_id else null end,
        case when p_status = 'active' then v_now else null end,
        case when p_status = 'hidden' then p_actor_id else null end,
        case when p_status = 'hidden' then v_now else null end
    );

    select count(*) into v_marker_count
    from public.package_summaries ps
    where ps.summary_id = p_summary_id
      and ps.is_summary_bank_compatibility;
    if v_marker_count <> 1 then
        raise exception using errcode = 'cardinality_violation', message = 'Target attachment changed compatibility marker cardinality.';
    end if;

    return jsonb_build_object('package_id', p_package_id, 'summary_id', p_summary_id);
end
$function$;

comment on function public.kp_persist_attach_package_summary(uuid,uuid,text,text,uuid,integer,integer,timestamptz,text,text,uuid) is
    'Dormant target PackageSummary attach command; every attached placement is explicitly unmarked and cannot claim Summary Bank compatibility authority.';

create or replace function public.kp_persist_detach_package_summary(
    p_package_id uuid,
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
    v_summary public.summaries%rowtype;
    v_compatibility_placement public.package_summaries%rowtype;
    v_requested_placement public.package_summaries%rowtype;
    v_marker_count bigint;
begin
    perform public.kp_persist_require_actor(p_actor_id);

    select * into v_summary
    from public.summaries s
    where s.id = p_summary_id
    for update;
    if not found then
        raise exception using errcode = 'no_data_found', message = 'Summary does not exist.';
    end if;

    select * into v_compatibility_placement
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
        raise exception using errcode = 'cardinality_violation', message = 'Target detachment found corrupted compatibility marker state.';
    end if;

    if v_compatibility_placement.legacy_slug is null
       or nullif(btrim(v_compatibility_placement.legacy_slug), '') is null
       or v_compatibility_placement.legacy_slug is distinct from lower(btrim(v_compatibility_placement.legacy_slug))
       or v_compatibility_placement.package_id is distinct from v_summary.package_id
       or v_compatibility_placement.legacy_slug is distinct from v_summary.slug
    then
        raise exception using errcode = 'object_not_in_prerequisite_state', message = 'Target detachment found invalid or divergent marked-placement legacy state.';
    end if;

    select * into v_requested_placement
    from public.package_summaries ps
    where ps.package_id = p_package_id
      and ps.summary_id = p_summary_id
    for update;
    if not found then
        raise exception using errcode = 'no_data_found', message = 'PackageSummary placement does not exist.';
    end if;

    if v_requested_placement.is_summary_bank_compatibility then
        raise exception using errcode = 'object_not_in_prerequisite_state', message = 'The marked Summary Bank compatibility placement cannot be detached.';
    end if;

    delete from public.package_summaries
    where package_id = p_package_id
      and summary_id = p_summary_id
      and not is_summary_bank_compatibility;

    get diagnostics v_marker_count = row_count;
    if v_marker_count <> 1 then
        raise exception using errcode = 'cardinality_violation', message = 'Target detachment did not remove exactly one unmarked placement.';
    end if;

    return jsonb_build_object('package_id', p_package_id, 'summary_id', p_summary_id);
end
$function$;

comment on function public.kp_persist_detach_package_summary(uuid,uuid,uuid) is
    'Dormant target PackageSummary detach command; marker identity, not the legacy Summary Package mirror, protects the compatibility placement.';

-- Reassert the frozen RPC grants. Same-signature CREATE OR REPLACE preserves
-- ownership and function OIDs; these explicit grants keep the contract visible
-- and fail closed if role policy has drifted.
revoke all on function public.kp_persist_create_compatibility_summary(uuid,text,text,text,text,text,text,text,uuid,text,text,text,integer,text,text,text,uuid,uuid,integer,integer,text)
    from public, anon, authenticated;
revoke all on function public.kp_persist_update_compatibility_draft(uuid,uuid,text,text,text,text,text,text,uuid,text,text,text,integer,text,text,text,uuid,integer,integer,text)
    from public, anon, authenticated;
revoke all on function public.kp_persist_reassign_compatibility_package(uuid,uuid,text,uuid)
    from public, anon, authenticated;
revoke all on function public.kp_persist_attach_package_summary(uuid,uuid,text,text,uuid,integer,integer,timestamptz,text,text,uuid)
    from public, anon, authenticated;
revoke all on function public.kp_persist_detach_package_summary(uuid,uuid,uuid)
    from public, anon, authenticated;

grant execute on function public.kp_persist_create_compatibility_summary(uuid,text,text,text,text,text,text,text,uuid,text,text,text,integer,text,text,text,uuid,uuid,integer,integer,text)
    to service_role;
grant execute on function public.kp_persist_update_compatibility_draft(uuid,uuid,text,text,text,text,text,text,uuid,text,text,text,integer,text,text,text,uuid,integer,integer,text)
    to service_role;
grant execute on function public.kp_persist_reassign_compatibility_package(uuid,uuid,text,uuid)
    to service_role;
grant execute on function public.kp_persist_attach_package_summary(uuid,uuid,text,text,uuid,integer,integer,timestamptz,text,text,uuid)
    to service_role;
grant execute on function public.kp_persist_detach_package_summary(uuid,uuid,uuid)
    to service_role;

-- Catalog/static postflight: preserve the writer fence contract and prove each
-- replaced body references the durable marker. Runtime commands additionally
-- enforce their exact marker-cardinality postconditions above.
do $kp_summary_bank_writer_core_postflight$
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
            ('public.kp_persist_create_compatibility_summary(uuid,text,text,text,text,text,text,text,uuid,text,text,text,integer,text,text,text,uuid,uuid,integer,integer,text)', 'is_summary_bank_compatibility'),
            ('public.kp_persist_update_compatibility_draft(uuid,uuid,text,text,text,text,text,text,uuid,text,text,text,integer,text,text,text,uuid,integer,integer,text)', 'is_summary_bank_compatibility'),
            ('public.kp_persist_reassign_compatibility_package(uuid,uuid,text,uuid)', 'is_summary_bank_compatibility'),
            ('public.kp_persist_attach_package_summary(uuid,uuid,text,text,uuid,integer,integer,timestamptz,text,text,uuid)', 'is_summary_bank_compatibility'),
            ('public.kp_persist_detach_package_summary(uuid,uuid,uuid)', 'is_summary_bank_compatibility')
        ) as required(function_name, required_fragment)
    loop
        v_function := to_regprocedure(expected.function_name);
        if v_function is null then
            raise exception using
                errcode = 'check_violation',
                message = format('Knowledge Platform migration 068 failed to preserve signature: %s.', expected.function_name);
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
           or position(expected.required_fragment in v_definition) = 0
        then
            raise exception using
                errcode = 'check_violation',
                message = format('Knowledge Platform migration 068 installed a divergent marker-aware writer: %s.', expected.function_name);
        end if;

        if has_function_privilege('public', v_function, 'EXECUTE')
           or has_function_privilege('anon', v_function, 'EXECUTE')
           or has_function_privilege('authenticated', v_function, 'EXECUTE')
           or not has_function_privilege('service_role', v_function, 'EXECUTE')
        then
            raise exception using
                errcode = 'check_violation',
                message = format('Knowledge Platform migration 068 failed to preserve service-role-only grants: %s.', expected.function_name);
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
    ) then
        raise exception using
            errcode = 'cardinality_violation',
            message = 'Knowledge Platform migration 068 changed existing compatibility marker cardinality.';
    end if;

    if exists (
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
    ) then
        raise exception using
            errcode = 'check_violation',
            message = 'Knowledge Platform migration 068 left invalid or divergent marked-placement legacy state.';
    end if;
end
$kp_summary_bank_writer_core_postflight$;

notify pgrst, 'reload schema';
