-- 057_kp_transactional_persistence_api.sql
-- Sobdai Knowledge Platform — frozen transactional persistence API.
--
-- Migration-number audit
-- ----------------------
-- Knowledge Platform migration 056 is the highest deployed KP migration.
-- Repository migrations 062+ belong to unrelated product areas and do not
-- consume the frozen Knowledge Platform identities. This file therefore
-- implements frozen responsibility 057 exactly.
--
-- Purpose
-- -------
-- Install the dormant, server-only persistence boundary used by the D2
-- Application Service. Each command function performs its bounded aggregate
-- writes in the caller's transaction and locks the rows it coordinates. The
-- functions are intentionally not invoked by deployment and do not enable any
-- application flag.
--
-- Scope boundary
-- --------------
-- * Creates persistence functions only; no tables, columns, indexes, triggers,
--   policies, or feature-flag storage are introduced.
-- * Compatibility create/edit/publish/retire/reassign operations maintain the
--   legacy Summary mirror and target rows together.
-- * Target-only source, alias, and PackageSummary commands are installed for
--   the later approved writer boundary but remain dormant until the Application
--   Layer enables the corresponding kp_dual_write_summary,
--   kp_dual_write_publish, and target-authority flags.
-- * Application authorization, Markdown validation, publishing readiness,
--   Recommendation, Assessment, cache invalidation, and cutover policy remain
--   outside the database API.
-- * No audit/outbox table is invented here; no such platform convention is
--   approved in the frozen schema. Post-commit events remain an Application
--   Layer responsibility.
--
-- Transaction and rollback
-- ------------------------
-- These functions do not pretend that separate REST calls are atomic. A real
-- transaction executor must call them inside one PostgreSQL transaction. A
-- failed command raises and rolls back every write made by that command. The
-- legacy mirror remains the served authority while the D2 flags are off.
-- Deployment is ordinary transactional SQL and remains compatible with the
-- project's Supabase SQL Editor workflow; no non-transactional runner is
-- required.

set local lock_timeout = '5s';

-- ─────────────────────────────────────────────────────────────────────────────
-- Fail closed on the frozen 055–056 dependency surface before installing API
-- functions. This block is catalog-only and never mutates domain rows.
-- ─────────────────────────────────────────────────────────────────────────────

do $kp_transactional_persistence_preflight$
declare
    required record;
begin
    for required in
        select relation_name
        from (values
            ('public.profiles'),
            ('public.packages'),
            ('public.summaries'),
            ('public.summary_versions'),
            ('public.summary_aliases'),
            ('public.reference_documents'),
            ('public.reference_document_versions'),
            ('public.reference_document_aliases'),
            ('public.summary_reference_documents'),
            ('public.summary_version_reference_documents'),
            ('public.package_summaries')
        ) as expected(relation_name)
    loop
        if to_regclass(required.relation_name) is null then
            raise exception using
                errcode = 'check_violation',
                message = format(
                    'Knowledge Platform migration 057 prerequisite is missing: %s.',
                    required.relation_name
                );
        end if;
    end loop;

    for required in
        select table_name, column_name, udt_name
        from (values
            ('summaries', 'summary_code', 'text'),
            ('summaries', 'canonical_slug', 'text'),
            ('summaries', 'canonical_title', 'text'),
            ('summaries', 'visibility', 'text'),
            ('summaries', 'lifecycle_status', 'text'),
            ('summaries', 'current_published_version_id', 'uuid'),
            ('summary_versions', 'summary_id', 'uuid'),
            ('summary_versions', 'revision_number', 'int4'),
            ('summary_versions', 'status', 'text'),
            ('summary_versions', 'content_md', 'text'),
            ('summary_versions', 'content_checksum', 'text'),
            ('summary_reference_documents', 'summary_id', 'uuid'),
            ('summary_version_reference_documents', 'summary_version_id', 'uuid'),
            ('package_summaries', 'package_id', 'uuid'),
            ('package_summaries', 'summary_id', 'uuid')
        ) as expected(table_name, column_name, udt_name)
    loop
        if not exists (
            select 1
            from information_schema.columns c
            where c.table_schema = 'public'
              and c.table_name = required.table_name
              and c.column_name = required.column_name
              and c.udt_name = required.udt_name
        ) then
            raise exception using
                errcode = 'check_violation',
                message = format(
                    'Knowledge Platform migration 057 requires public.%I.%I type=%s.',
                    required.table_name,
                    required.column_name,
                    required.udt_name
                );
        end if;
    end loop;

    if to_regprocedure('public.kp_can_read_package_summary(uuid,uuid)') is null
       or to_regprocedure('public.kp_can_read_summary_version(uuid,uuid)') is null
       or to_regprocedure('public.kp_read_summary_route(text,text)') is null
    then
        raise exception using
            errcode = 'check_violation',
            message = 'Knowledge Platform migration 057 requires the frozen 046 access predicates and 056 read resolver.';
    end if;

    for required in
        select index_name, table_name
        from (values
            ('packages_package_code_key', 'public.packages'),
            ('summaries_summary_code_final_key', 'public.summaries'),
            ('summaries_canonical_slug_final_key', 'public.summaries'),
            ('package_summaries_package_legacy_slug_final_key', 'public.package_summaries')
        ) as expected(index_name, table_name)
    loop
        if not exists (
            select 1
            from pg_class i
            join pg_namespace n on n.oid = i.relnamespace
            join pg_index x on x.indexrelid = i.oid
            where n.nspname = 'public'
              and i.relname = required.index_name
              and x.indrelid = required.table_name::regclass
              and x.indisunique
              and x.indisvalid
              and x.indisready
        ) then
            raise exception using
                errcode = 'check_violation',
                message = format(
                    'Knowledge Platform migration 057 requires validated index public.%I on %s.',
                    required.index_name,
                    required.table_name
                );
        end if;
    end loop;

    for required in
        select table_name
        from (values
            ('summary_versions'),
            ('summary_aliases'),
            ('summary_reference_documents'),
            ('summary_version_reference_documents'),
            ('package_summaries')
        ) as expected(table_name)
    loop
        if not exists (
            select 1
            from pg_class c
            join pg_namespace n on n.oid = c.relnamespace
            where n.nspname = 'public'
              and c.relname = required.table_name
              and c.relrowsecurity
        ) then
            raise exception using
                errcode = 'check_violation',
                message = format(
                    'Knowledge Platform migration 057 requires RLS on public.%I.',
                    required.table_name
                );
        end if;
    end loop;
end
$kp_transactional_persistence_preflight$;

-- ─────────────────────────────────────────────────────────────────────────────
-- Shared trusted-caller guard. It validates the explicit Application actor;
-- authorization policy itself remains in the Application Layer.
-- ─────────────────────────────────────────────────────────────────────────────

create or replace function public.kp_persist_require_actor(
    p_actor_id uuid
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
set lock_timeout = '5s'
as $function$
begin
    if p_actor_id is null then
        raise exception using
            errcode = 'invalid_parameter_value',
            message = 'Knowledge Platform persistence commands require an actor UUID.';
    end if;

    if not exists (
        select 1
        from public.profiles p
        where p.id = p_actor_id
    ) then
        raise exception using
            errcode = 'foreign_key_violation',
            message = 'Knowledge Platform persistence command actor does not exist.';
    end if;
end
$function$;

comment on function public.kp_persist_require_actor(uuid) is
    'Trusted persistence guard for an explicit Application actor. Role/action authorization remains in the Application Layer.';

-- ─────────────────────────────────────────────────────────────────────────────
-- Compatibility create: one legacy row, one target Summary root, one draft
-- revision, and one compatibility PackageSummary placement are committed as a
-- single command. IDs supplied by the caller make retries identity-stable.
-- ─────────────────────────────────────────────────────────────────────────────

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
    v_summary_code text := upper(btrim(p_summary_code));
    v_canonical_slug text := lower(btrim(p_canonical_slug));
    v_legacy_slug text := lower(btrim(p_legacy_slug));
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

    -- A retry with the same stable identity is accepted only when the complete
    -- compatibility shape is already present; partial or divergent state is a
    -- hard failure rather than a last-write-wins repair.
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

        if not exists (
            select 1
            from public.package_summaries ps
            where ps.package_id = p_package_id
              and ps.summary_id = p_summary_id
              and ps.legacy_slug = v_legacy_slug
        ) then
            raise exception using errcode = 'object_not_in_prerequisite_state', message = 'Summary root exists without the requested compatibility placement.';
        end if;

        return jsonb_build_object(
            'summary_id', p_summary_id,
            'summary_version_id', p_version_id,
            'package_id', p_package_id,
            'idempotent_retry', true
        );
    end if;

    insert into public.summaries (
        id,
        package_id,
        title,
        slug,
        subject,
        law,
        topic,
        content_md,
        read_time_minutes,
        sort_order,
        is_published,
        created_at,
        updated_at,
        summary_code,
        canonical_slug,
        canonical_title,
        visibility,
        lifecycle_status,
        current_published_version_id,
        created_by,
        archived_by,
        archived_at
    ) values (
        p_summary_id,
        p_package_id,
        btrim(p_canonical_title),
        v_legacy_slug,
        nullif(btrim(p_subject), ''),
        nullif(btrim(p_law), ''),
        nullif(btrim(p_topic), ''),
        p_content_md,
        p_read_time_minutes,
        coalesce(p_sort_order, 0),
        false,
        v_now,
        v_now,
        v_summary_code,
        v_canonical_slug,
        btrim(p_canonical_title),
        p_visibility,
        'active',
        null,
        p_actor_id,
        null,
        null
    );

    insert into public.summary_versions (
        id,
        summary_id,
        revision_number,
        status,
        content_md,
        content_checksum,
        title_snapshot,
        subject_snapshot,
        topic_snapshot,
        law_snapshot,
        read_time_minutes,
        read_time_policy_version,
        content_schema_version,
        change_note,
        authored_by,
        created_at,
        updated_at
    ) values (
        p_version_id,
        p_summary_id,
        1,
        'draft',
        p_content_md,
        p_content_checksum,
        btrim(p_canonical_title),
        nullif(btrim(p_subject), ''),
        nullif(btrim(p_topic), ''),
        nullif(btrim(p_law), ''),
        p_read_time_minutes,
        btrim(p_read_time_policy_version),
        btrim(p_content_schema_version),
        btrim(p_change_note),
        p_actor_id,
        v_now,
        v_now
    );

    insert into public.package_summaries (
        package_id,
        summary_id,
        status,
        version_policy,
        pinned_summary_version_id,
        sort_order,
        display_order,
        released_at,
        navigation_label,
        legacy_slug,
        created_by,
        created_at,
        updated_at,
        activated_by,
        activated_at,
        hidden_by,
        hidden_at
    ) values (
        p_package_id,
        p_summary_id,
        'draft',
        'latest_published',
        null,
        coalesce(p_sort_order, 0),
        coalesce(p_display_order, 0),
        null,
        nullif(btrim(p_navigation_label), ''),
        v_legacy_slug,
        p_actor_id,
        v_now,
        v_now,
        null,
        null,
        null,
        null
    );

    return jsonb_build_object(
        'summary_id', p_summary_id,
        'summary_version_id', p_version_id,
        'package_id', p_package_id,
        'idempotent_retry', false
    );
end
$function$;

comment on function public.kp_persist_create_compatibility_summary(uuid,text,text,text,text,text,text,text,uuid,text,text,text,integer,text,text,text,uuid,uuid,integer,integer,text) is
    'Atomic D2 compatibility create: legacy Summary row, target Summary root, draft revision, and one PackageSummary placement. Application authorization and review remain outside the database function.';

-- ─────────────────────────────────────────────────────────────────────────────
-- Compatibility draft update. It locks the Summary, draft revision, legacy
-- mirror, and compatibility placement before changing their mutable fields.
-- ─────────────────────────────────────────────────────────────────────────────

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

    if v_summary.package_id is distinct from p_package_id then
        raise exception using errcode = 'object_not_in_prerequisite_state', message = 'Compatibility draft update cannot reassign a Package; use the explicit reassign command.';
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

    select * into v_placement
    from public.package_summaries ps
    where ps.package_id = p_package_id
      and ps.summary_id = p_summary_id
    for update;
    if not found then
        raise exception using errcode = 'object_not_in_prerequisite_state', message = 'Compatibility PackageSummary placement is missing.';
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
    where package_id = p_package_id
      and summary_id = p_summary_id;

    return jsonb_build_object(
        'summary_id', p_summary_id,
        'summary_version_id', p_version_id,
        'package_id', p_package_id
    );
end
$function$;

comment on function public.kp_persist_update_compatibility_draft(uuid,uuid,text,text,text,text,text,text,uuid,text,text,text,integer,text,text,text,uuid,integer,integer,text) is
    'Atomic D2 compatibility draft edit across the legacy Summary mirror, target root/revision, and the sole compatibility PackageSummary placement.';

-- ─────────────────────────────────────────────────────────────────────────────
-- Atomic publication: source snapshots, revision lifecycle, current pointer,
-- legacy publication flag/content, and compatibility placement are committed
-- together. Readiness and source-entitlement policy remain Application-owned.
-- ─────────────────────────────────────────────────────────────────────────────

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
    v_legacy public.summaries%rowtype;
    v_package_id uuid;
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

    select * into v_version
    from public.summary_versions sv
    where sv.id = p_version_id
      and sv.summary_id = p_summary_id
    for update;
    if not found then
        raise exception using errcode = 'no_data_found', message = 'Summary revision does not belong to the Summary.';
    end if;

    if v_version.status = 'published'
       and v_summary.current_published_version_id = p_version_id
    then
        return jsonb_build_object(
            'summary_id', p_summary_id,
            'summary_version_id', p_version_id,
            'idempotent_retry', true
        );
    end if;
    if v_version.status <> 'in_review' then
        raise exception using errcode = 'object_not_in_prerequisite_state', message = 'Only an approved in-review revision can be published.';
    end if;
    if v_version.reviewed_by is null or v_version.reviewed_at is null then
        raise exception using errcode = 'object_not_in_prerequisite_state', message = 'Publication requires recorded review approval.';
    end if;

    select * into v_legacy
    from public.summaries s
    where s.id = p_summary_id
    for update;
    v_package_id := v_legacy.package_id;

    if not exists (
        select 1
        from public.package_summaries ps
        where ps.package_id = v_package_id
          and ps.summary_id = p_summary_id
    ) then
        raise exception using errcode = 'object_not_in_prerequisite_state', message = 'Compatibility publication requires its PackageSummary placement.';
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
      and summary_id = p_summary_id;

    update public.summaries
    set current_published_version_id = p_version_id,
        is_published = true,
        title = v_summary.canonical_title,
        slug = v_legacy.slug,
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
    where package_id = v_package_id
      and summary_id = p_summary_id;

    return jsonb_build_object(
        'summary_id', p_summary_id,
        'summary_version_id', p_version_id,
        'package_id', v_package_id,
        'idempotent_retry', false
    );
end
$function$;

comment on function public.kp_persist_publish_compatibility_revision(uuid,uuid,uuid,jsonb) is
    'Atomic D2 publication boundary: replaces revision source snapshots, publishes the approved revision, advances the same-parent pointer, and mirrors legacy visibility/content.';

-- ─────────────────────────────────────────────────────────────────────────────
-- Atomic retirement and optional same-Summary replacement pointer.
-- ─────────────────────────────────────────────────────────────────────────────

create or replace function public.kp_persist_retire_compatibility_revision(
    p_summary_id uuid,
    p_version_id uuid,
    p_actor_id uuid,
    p_retirement_reason text,
    p_replacement_version_id uuid
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
    v_replacement public.summary_versions%rowtype;
    v_package_id uuid;
    v_was_current boolean;
begin
    perform public.kp_persist_require_actor(p_actor_id);
    if p_summary_id is null or p_version_id is null
       or p_retirement_reason is null or btrim(p_retirement_reason) = ''
    then
        raise exception using errcode = 'invalid_parameter_value', message = 'Retirement requires Summary, revision, actor, and reason.';
    end if;
    if p_replacement_version_id is not null
       and p_replacement_version_id = p_version_id
    then
        raise exception using errcode = 'invalid_parameter_value', message = 'A revision cannot replace itself.';
    end if;

    select * into v_summary
    from public.summaries s
    where s.id = p_summary_id
    for update;
    if not found then
        raise exception using errcode = 'no_data_found', message = 'Summary does not exist.';
    end if;

    select * into v_version
    from public.summary_versions sv
    where sv.id = p_version_id
      and sv.summary_id = p_summary_id
    for update;
    if not found then
        raise exception using errcode = 'no_data_found', message = 'Summary revision does not belong to the Summary.';
    end if;
    if v_version.status = 'retired' then
        raise exception using errcode = 'object_not_in_prerequisite_state', message = 'Summary revision is already retired.';
    end if;

    if p_replacement_version_id is not null then
        select * into v_replacement
        from public.summary_versions replacement
        where replacement.id = p_replacement_version_id
          and replacement.summary_id = p_summary_id
        for update;
        if not found or v_replacement.status <> 'published' then
            raise exception using errcode = 'object_not_in_prerequisite_state', message = 'Replacement revision must be a published revision of the same Summary.';
        end if;
    end if;

    if exists (
        select 1
        from public.package_summaries ps
        where ps.summary_id = p_summary_id
          and ps.status = 'active'
          and ps.version_policy = 'pinned'
          and ps.pinned_summary_version_id = p_version_id
    ) then
        raise exception using errcode = 'object_not_in_prerequisite_state', message = 'An active pinned PackageSummary still selects the revision.';
    end if;

    v_was_current := v_summary.current_published_version_id = p_version_id;
    if v_was_current
       and p_replacement_version_id is null
       and exists (
           select 1
           from public.package_summaries ps
           where ps.summary_id = p_summary_id
             and ps.status = 'active'
             and ps.version_policy = 'latest_published'
       )
    then
        raise exception using errcode = 'object_not_in_prerequisite_state', message = 'A replacement published revision is required for active latest-published placements.';
    end if;

    select package_id into v_package_id
    from public.summaries
    where id = p_summary_id;

    update public.summary_versions
    set status = 'retired',
        retired_by = p_actor_id,
        retired_at = v_now,
        retirement_reason = btrim(p_retirement_reason),
        updated_at = v_now
    where id = p_version_id
      and summary_id = p_summary_id;

    if v_was_current then
        update public.summaries
        set current_published_version_id = p_replacement_version_id,
            is_published = (p_replacement_version_id is not null),
            content_md = case when p_replacement_version_id is null then content_md else v_replacement.content_md end,
            read_time_minutes = case when p_replacement_version_id is null then read_time_minutes else v_replacement.read_time_minutes end,
            updated_at = v_now
        where id = p_summary_id;

        if p_replacement_version_id is null then
            update public.package_summaries
            set status = 'hidden',
                activated_by = null,
                activated_at = null,
                hidden_by = p_actor_id,
                hidden_at = v_now,
                updated_at = v_now
            where package_id = v_package_id
              and summary_id = p_summary_id
              and status = 'active'
              and version_policy = 'latest_published';
        else
            update public.package_summaries
            set status = 'active',
                activated_by = p_actor_id,
                activated_at = v_now,
                hidden_by = null,
                hidden_at = null,
                updated_at = v_now
            where package_id = v_package_id
              and summary_id = p_summary_id
              and version_policy = 'latest_published';
        end if;
    end if;

    return jsonb_build_object(
        'summary_id', p_summary_id,
        'summary_version_id', p_version_id,
        'replacement_version_id', p_replacement_version_id,
        'was_current', v_was_current
    );
end
$function$;

comment on function public.kp_persist_retire_compatibility_revision(uuid,uuid,uuid,text,uuid) is
    'Atomic D2 retirement boundary with active-pin protection and optional same-Summary pointer replacement; published history remains retained.';

-- ─────────────────────────────────────────────────────────────────────────────
-- Compatibility Package reassignment. The legacy row and its one compatibility
-- placement move together; target-only additional placements are untouched.
-- ─────────────────────────────────────────────────────────────────────────────

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
        select 1
        from public.packages p
        where p.id = p_new_package_id
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
    where ps.package_id = v_legacy.package_id
      and ps.summary_id = p_summary_id
    for update;
    if not found then
        raise exception using errcode = 'object_not_in_prerequisite_state', message = 'Compatibility PackageSummary placement is missing.';
    end if;
    if v_legacy.package_id = p_new_package_id then
        if v_legacy.slug = v_new_slug then
            return jsonb_build_object('summary_id', p_summary_id, 'package_id', p_new_package_id, 'idempotent_retry', true);
        end if;
        update public.summaries
        set slug = v_new_slug, updated_at = v_now
        where id = p_summary_id;
        update public.package_summaries
        set legacy_slug = v_new_slug, updated_at = v_now
        where package_id = p_new_package_id and summary_id = p_summary_id;
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
      and summary_id = p_summary_id;

    insert into public.package_summaries (
        package_id,
        summary_id,
        status,
        version_policy,
        pinned_summary_version_id,
        sort_order,
        display_order,
        released_at,
        navigation_label,
        legacy_slug,
        created_by,
        created_at,
        updated_at,
        activated_by,
        activated_at,
        hidden_by,
        hidden_at
    ) values (
        p_new_package_id,
        p_summary_id,
        v_old_placement.status,
        v_old_placement.version_policy,
        v_old_placement.pinned_summary_version_id,
        v_old_placement.sort_order,
        v_old_placement.display_order,
        v_old_placement.released_at,
        v_old_placement.navigation_label,
        v_new_slug,
        p_actor_id,
        v_now,
        v_now,
        case when v_old_placement.status = 'active' then p_actor_id else null end,
        case when v_old_placement.status = 'active' then v_now else null end,
        case when v_old_placement.status = 'hidden' then p_actor_id else null end,
        case when v_old_placement.status = 'hidden' then v_now else null end
    );

    return jsonb_build_object('summary_id', p_summary_id, 'package_id', p_new_package_id, 'idempotent_retry', false);
end
$function$;

comment on function public.kp_persist_reassign_compatibility_package(uuid,uuid,text,uuid) is
    'Atomic D2 compatibility Package reassignment; moves the legacy owner and sole compatibility placement without touching additional target-only placements.';

-- ─────────────────────────────────────────────────────────────────────────────
-- Live source relationship replacement. Publication snapshots are handled by
-- the publish function; this command only changes the mutable live relation.
-- ─────────────────────────────────────────────────────────────────────────────

create or replace function public.kp_persist_replace_summary_sources(
    p_summary_id uuid,
    p_sources jsonb,
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
    v_count bigint;
    v_existing_summary_id uuid;
begin
    perform public.kp_persist_require_actor(p_actor_id);
    if p_summary_id is null then
        raise exception using errcode = 'invalid_parameter_value', message = 'Summary ID is required.';
    end if;
    if p_sources is null or jsonb_typeof(p_sources) <> 'array' then
        raise exception using errcode = 'invalid_parameter_value', message = 'Summary sources must be a JSON array.';
    end if;
    select s.id
    into v_existing_summary_id
    from public.summaries s
    where s.id = p_summary_id
    for update;
    if v_existing_summary_id is null then
        raise exception using errcode = 'no_data_found', message = 'Summary does not exist.';
    end if;

    delete from public.summary_reference_documents
    where summary_id = p_summary_id;

    insert into public.summary_reference_documents (
        id,
        summary_id,
        reference_document_id,
        reference_document_version_id,
        role,
        coverage_note,
        sort_order,
        created_by,
        created_at,
        updated_at
    )
    select
        uuid_generate_v4(),
        p_summary_id,
        source.reference_document_id,
        source.reference_document_version_id,
        source.role,
        nullif(btrim(source.coverage_note), ''),
        coalesce(source.sort_order, 0),
        p_actor_id,
        v_now,
        v_now
    from jsonb_to_recordset(p_sources) as source(
        reference_document_id uuid,
        reference_document_version_id uuid,
        role text,
        coverage_note text,
        sort_order integer
    );

    select count(*) into v_count
    from public.summary_reference_documents
    where summary_id = p_summary_id;

    return jsonb_build_object('summary_id', p_summary_id, 'source_count', v_count);
end
$function$;

comment on function public.kp_persist_replace_summary_sources(uuid,jsonb,uuid) is
    'Atomic replacement of the mutable live Summary-to-ReferenceDocument relationship set; published revision snapshots are separate and immutable.';

-- ─────────────────────────────────────────────────────────────────────────────
-- Target PackageSummary attach/detach. These operations are intentionally
-- target-only and must remain behind the post-rollback-window feature gate.
-- ─────────────────────────────────────────────────────────────────────────────

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
    if not exists (select 1 from public.packages p where p.id = p_package_id)
       or not exists (select 1 from public.summaries s where s.id = p_summary_id)
    then
        raise exception using errcode = 'foreign_key_violation', message = 'PackageSummary parent does not exist.';
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
        package_id,
        summary_id,
        status,
        version_policy,
        pinned_summary_version_id,
        sort_order,
        display_order,
        released_at,
        navigation_label,
        legacy_slug,
        created_by,
        created_at,
        updated_at,
        activated_by,
        activated_at,
        hidden_by,
        hidden_at
    ) values (
        p_package_id,
        p_summary_id,
        p_status,
        p_version_policy,
        p_pinned_summary_version_id,
        coalesce(p_sort_order, 0),
        coalesce(p_display_order, 0),
        p_released_at,
        nullif(btrim(p_navigation_label), ''),
        v_slug,
        p_actor_id,
        v_now,
        v_now,
        case when p_status = 'active' then p_actor_id else null end,
        case when p_status = 'active' then v_now else null end,
        case when p_status = 'hidden' then p_actor_id else null end,
        case when p_status = 'hidden' then v_now else null end
    );

    return jsonb_build_object('package_id', p_package_id, 'summary_id', p_summary_id);
end
$function$;

comment on function public.kp_persist_attach_package_summary(uuid,uuid,text,text,uuid,integer,integer,timestamptz,text,text,uuid) is
    'Dormant target PackageSummary attach command. It never copies Markdown or changes the legacy owner; enable only after the approved rollback boundary.';

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
    v_legacy_package_id uuid;
begin
    perform public.kp_persist_require_actor(p_actor_id);
    select package_id into v_legacy_package_id
    from public.summaries
    where id = p_summary_id
    for update;
    if not found then
        raise exception using errcode = 'no_data_found', message = 'Summary does not exist.';
    end if;
    if v_legacy_package_id = p_package_id then
        raise exception using errcode = 'object_not_in_prerequisite_state', message = 'The compatibility placement cannot be detached while legacy Summary ownership remains authoritative.';
    end if;
    if not exists (
        select 1 from public.package_summaries ps
        where ps.package_id = p_package_id and ps.summary_id = p_summary_id
    ) then
        raise exception using errcode = 'no_data_found', message = 'PackageSummary placement does not exist.';
    end if;

    delete from public.package_summaries
    where package_id = p_package_id
      and summary_id = p_summary_id;

    return jsonb_build_object('package_id', p_package_id, 'summary_id', p_summary_id);
end
$function$;

comment on function public.kp_persist_detach_package_summary(uuid,uuid,uuid) is
    'Dormant target PackageSummary detach command. It refuses to remove the legacy compatibility placement before writer authority changes.';

-- ─────────────────────────────────────────────────────────────────────────────
-- Alias registration is target-only and remains behind canonical-route policy.
-- The existing cross-table namespace trigger and unique index remain the source
-- of truth for collision prevention.
-- ─────────────────────────────────────────────────────────────────────────────

create or replace function public.kp_persist_register_summary_alias(
    p_summary_id uuid,
    p_slug text,
    p_redirect_type text,
    p_reason text,
    p_actor_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
set lock_timeout = '5s'
as $function$
declare
    v_alias_id uuid := uuid_generate_v4();
    v_slug text := lower(btrim(p_slug));
    v_now timestamptz := clock_timestamp();
begin
    perform public.kp_persist_require_actor(p_actor_id);
    if p_summary_id is null or p_slug is null or v_slug = '' then
        raise exception using errcode = 'invalid_parameter_value', message = 'Summary alias requires a Summary ID and slug.';
    end if;
    if p_slug <> v_slug
       or p_redirect_type is null
       or p_reason is null
       or p_redirect_type not in ('permanent', 'temporary')
       or p_reason not in ('rename', 'merge', 'correction', 'migration')
    then
        raise exception using errcode = 'invalid_parameter_value', message = 'Summary alias normalization or enum value is invalid.';
    end if;
    if not exists (select 1 from public.summaries s where s.id = p_summary_id) then
        raise exception using errcode = 'foreign_key_violation', message = 'Summary alias target does not exist.';
    end if;

    insert into public.summary_aliases (
        id,
        summary_id,
        slug,
        redirect_type,
        status,
        reason,
        created_by,
        created_at,
        updated_at,
        retired_by,
        retired_at
    ) values (
        v_alias_id,
        p_summary_id,
        v_slug,
        p_redirect_type,
        'active',
        p_reason,
        p_actor_id,
        v_now,
        v_now,
        null,
        null
    );

    return jsonb_build_object('alias_id', v_alias_id, 'summary_id', p_summary_id, 'slug', v_slug);
end
$function$;

comment on function public.kp_persist_register_summary_alias(uuid,text,text,text,uuid) is
    'Dormant target Summary alias registration with frozen namespace, direct-target, and lifecycle constraints.';

-- ─────────────────────────────────────────────────────────────────────────────
-- Bounded grants: only the trusted server-side service role may call the API.
-- No browser role receives EXECUTE, and no table/RLS policy is changed here;
-- migration 058 owns the later single-writer restriction.
-- ─────────────────────────────────────────────────────────────────────────────

revoke all on function public.kp_persist_require_actor(uuid)
    from public, anon, authenticated;
revoke all on function public.kp_persist_create_compatibility_summary(uuid,text,text,text,text,text,text,text,uuid,text,text,text,integer,text,text,text,uuid,uuid,integer,integer,text)
    from public, anon, authenticated;
revoke all on function public.kp_persist_update_compatibility_draft(uuid,uuid,text,text,text,text,text,text,uuid,text,text,text,integer,text,text,text,uuid,integer,integer,text)
    from public, anon, authenticated;
revoke all on function public.kp_persist_publish_compatibility_revision(uuid,uuid,uuid,jsonb)
    from public, anon, authenticated;
revoke all on function public.kp_persist_retire_compatibility_revision(uuid,uuid,uuid,text,uuid)
    from public, anon, authenticated;
revoke all on function public.kp_persist_reassign_compatibility_package(uuid,uuid,text,uuid)
    from public, anon, authenticated;
revoke all on function public.kp_persist_replace_summary_sources(uuid,jsonb,uuid)
    from public, anon, authenticated;
revoke all on function public.kp_persist_attach_package_summary(uuid,uuid,text,text,uuid,integer,integer,timestamptz,text,text,uuid)
    from public, anon, authenticated;
revoke all on function public.kp_persist_detach_package_summary(uuid,uuid,uuid)
    from public, anon, authenticated;
revoke all on function public.kp_persist_register_summary_alias(uuid,text,text,text,uuid)
    from public, anon, authenticated;

grant execute on function public.kp_persist_require_actor(uuid)
    to service_role;
grant execute on function public.kp_persist_create_compatibility_summary(uuid,text,text,text,text,text,text,text,uuid,text,text,text,integer,text,text,text,uuid,uuid,integer,integer,text)
    to service_role;
grant execute on function public.kp_persist_update_compatibility_draft(uuid,uuid,text,text,text,text,text,text,uuid,text,text,text,integer,text,text,text,uuid,integer,integer,text)
    to service_role;
grant execute on function public.kp_persist_publish_compatibility_revision(uuid,uuid,uuid,jsonb)
    to service_role;
grant execute on function public.kp_persist_retire_compatibility_revision(uuid,uuid,uuid,text,uuid)
    to service_role;
grant execute on function public.kp_persist_reassign_compatibility_package(uuid,uuid,text,uuid)
    to service_role;
grant execute on function public.kp_persist_replace_summary_sources(uuid,jsonb,uuid)
    to service_role;
grant execute on function public.kp_persist_attach_package_summary(uuid,uuid,text,text,uuid,integer,integer,timestamptz,text,text,uuid)
    to service_role;
grant execute on function public.kp_persist_detach_package_summary(uuid,uuid,uuid)
    to service_role;
grant execute on function public.kp_persist_register_summary_alias(uuid,text,text,text,uuid)
    to service_role;

-- ─────────────────────────────────────────────────────────────────────────────
-- Fail-closed API drift validation. All object checks use to_regprocedure so a
-- missing function produces a controlled migration error rather than a raw
-- regprocedure lookup exception.
-- ─────────────────────────────────────────────────────────────────────────────

do $kp_transactional_persistence_assertions$
declare
    expected record;
    v_function oid;
begin
    for expected in
        select function_name
        from (values
            ('public.kp_persist_require_actor(uuid)'),
            ('public.kp_persist_create_compatibility_summary(uuid,text,text,text,text,text,text,text,uuid,text,text,text,integer,text,text,text,uuid,uuid,integer,integer,text)'),
            ('public.kp_persist_update_compatibility_draft(uuid,uuid,text,text,text,text,text,text,uuid,text,text,text,integer,text,text,text,uuid,integer,integer,text)'),
            ('public.kp_persist_publish_compatibility_revision(uuid,uuid,uuid,jsonb)'),
            ('public.kp_persist_retire_compatibility_revision(uuid,uuid,uuid,text,uuid)'),
            ('public.kp_persist_reassign_compatibility_package(uuid,uuid,text,uuid)'),
            ('public.kp_persist_replace_summary_sources(uuid,jsonb,uuid)'),
            ('public.kp_persist_attach_package_summary(uuid,uuid,text,text,uuid,integer,integer,timestamptz,text,text,uuid)'),
            ('public.kp_persist_detach_package_summary(uuid,uuid,uuid)'),
            ('public.kp_persist_register_summary_alias(uuid,text,text,text,uuid)')
        ) as required(function_name)
    loop
        v_function := to_regprocedure(expected.function_name);
        if v_function is null then
            raise exception using
                errcode = 'check_violation',
                message = format('Knowledge Platform migration 057 persistence function is missing: %s.', expected.function_name);
        end if;

        if not exists (
            select 1
            from pg_proc p
            where p.oid = v_function
              and p.prosecdef
              and array_to_string(p.proconfig, ',') ilike '%search_path=pg_catalog, public, pg_temp%'
              and array_to_string(p.proconfig, ',') ilike '%lock_timeout=5s%'
        ) then
            raise exception using
                errcode = 'check_violation',
                message = format('Knowledge Platform migration 057 persistence function is not locked SECURITY DEFINER: %s.', expected.function_name);
        end if;

        if has_function_privilege('public', v_function, 'EXECUTE')
           or has_function_privilege('anon', v_function, 'EXECUTE')
           or has_function_privilege('authenticated', v_function, 'EXECUTE')
           or not has_function_privilege('service_role', v_function, 'EXECUTE')
        then
            raise exception using
                errcode = 'check_violation',
                message = format('Knowledge Platform migration 057 persistence grants are not service-role-only: %s.', expected.function_name);
        end if;
    end loop;
end
$kp_transactional_persistence_assertions$;

-- PostgREST must see the newly installed RPC signatures, while feature flags
-- remain application-owned and default-off.
notify pgrst, 'reload schema';
