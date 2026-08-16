-- 068_kp_summary_bank_compatibility_writer_core.sql
-- Sobdai Knowledge Platform — hybrid Summary membership writer core.
--
-- Migration 067 established the hybrid discriminator and marker storage. This
-- migration makes the trusted persistence boundary maintain KP-native roots
-- with one-or-more Package memberships. Legacy Summary rows are immutable to
-- this boundary: no PackageSummary may ever be attached to summary_code NULL.
--
-- The original single-Package signatures remain available for 069–072 and
-- import compatibility. They are safe wrappers/operations over the same
-- KP-native invariant. New callers should use the uuid[] create and complete
-- membership-reconciliation signatures below.

set local lock_timeout = '5s';

-- ─────────────────────────────────────────────────────────────────────────────
-- Fail closed on the 067 hybrid foundation and the existing 057 writer API.
-- Legacy rows are allowed to have no placement; only KP-native rows are
-- required to have membership and marker state.
-- ─────────────────────────────────────────────────────────────────────────────

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

    -- The permanent Hybrid model retains the grandfathered Legacy Summary
    -- authority columns. Fail closed if a destructive 060-style schema has
    -- been applied instead of the frozen 067 -> 068 path.
    for expected in
        select column_name, udt_name, is_nullable
        from (values
            ('package_id', 'uuid', 'NO'),
            ('title', 'text', 'NO'),
            ('slug', 'text', 'NO'),
            ('content_md', 'text', 'NO'),
            ('read_time_minutes', 'int4', 'NO'),
            ('sort_order', 'int4', 'NO'),
            ('display_order', 'int4', 'NO'),
            ('released_at', 'timestamptz', 'YES'),
            ('is_published', 'bool', 'NO'),
            ('document', 'text', 'YES')
        ) as required(column_name, udt_name, is_nullable)
    loop
        if not exists (
            select 1
            from information_schema.columns c
            where c.table_schema = 'public'
              and c.table_name = 'summaries'
              and c.column_name = expected.column_name
              and c.udt_name = expected.udt_name
              and c.is_nullable = expected.is_nullable
        ) then
            raise exception using
                errcode = 'check_violation',
                message = format('Knowledge Platform migration 068 requires retained Legacy Summary column public.summaries.%I type=%s nullable=%s.', expected.column_name, expected.udt_name, expected.is_nullable);
        end if;
    end loop;

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
        where c.conrelid = 'public.summaries'::regclass
          and c.conname = 'summaries_kp_identity_bundle_check'
          and c.contype = 'c'
          and c.convalidated
    ) then
        raise exception using
            errcode = 'check_violation',
            message = 'Knowledge Platform migration 068 requires the validated KP identity bundle invariant from migration 067.';
    end if;

    if not exists (
        select 1
        from pg_catalog.pg_constraint c
        where c.conrelid = 'public.package_summaries'::regclass
          and c.conname = 'package_summaries_bank_compatibility_slug_check'
          and c.contype = 'c'
          and c.convalidated
          and pg_catalog.pg_get_constraintdef(c.oid) ilike '%NOT is_summary_bank_compatibility%legacy_slug IS NOT NULL%'
    ) then
        raise exception using
            errcode = 'check_violation',
            message = 'Knowledge Platform migration 068 requires the validated migration-067 marker CHECK.';
    end if;

    select a.attnum
    into v_marker_attnum
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

    select p.proowner
    into v_api_owner
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

    if to_regprocedure('public.kp_enforce_summary_cleanup_fence()') is null
       or not exists (
            select 1
            from pg_catalog.pg_trigger t
            join pg_catalog.pg_class c on c.oid = t.tgrelid
            join pg_catalog.pg_namespace n on n.oid = c.relnamespace
            where n.nspname = 'public'
              and c.relname = 'summaries'
              and t.tgname = 'kp_cleanup_legacy_summary_write_fence'
              and not t.tgisinternal
       )
    then
        raise exception using
            errcode = 'check_violation',
            message = 'Knowledge Platform migration 068 requires the installed migration-059 Summary cleanup fence.';
    end if;

    if exists (
        select 1
        from public.summaries s
        where s.summary_code is null
          and exists (
              select 1
              from public.package_summaries ps
              where ps.summary_id = s.id
          )
    ) then
        raise exception using
            errcode = 'cardinality_violation',
            message = 'Knowledge Platform migration 068 found a legacy Summary with a Package membership.';
    end if;

    if exists (
        select 1
        from public.summaries s
        where s.summary_code is not null
          and not exists (
              select 1
              from public.package_summaries ps
              where ps.summary_id = s.id
          )
    ) then
        raise exception using
            errcode = 'cardinality_violation',
            message = 'Knowledge Platform migration 068 found a KP-native Summary without a Package membership.';
    end if;

    if exists (
        select 1
        from public.summaries s
        where s.summary_code is not null
          and (
              select count(*)
              from public.package_summaries ps
              where ps.summary_id = s.id
                and ps.is_summary_bank_compatibility
          ) <> 1
    ) then
        raise exception using
            errcode = 'cardinality_violation',
            message = 'Knowledge Platform migration 068 found a KP-native Summary without one compatibility marker.';
    end if;

    if exists (
        select 1
        from public.package_summaries ps
        join public.summaries s on s.id = ps.summary_id
        where ps.is_summary_bank_compatibility
          and (
              s.summary_code is null
              or ps.legacy_slug is null
              or nullif(btrim(ps.legacy_slug), '') is null
              or ps.legacy_slug is distinct from lower(btrim(ps.legacy_slug))
              or ps.package_id is distinct from s.package_id
              or ps.legacy_slug is distinct from s.slug
          )
    ) then
        raise exception using
            errcode = 'check_violation',
            message = 'Knowledge Platform migration 068 found a marker inconsistent with its KP-native Summary Package or slug.';
    end if;
end
$kp_summary_bank_writer_core_preflight$;

-- ─────────────────────────────────────────────────────────────────────────────
-- Shared invariant checker used by every trusted membership mutation. It is
-- deliberately KP-only: a NULL summary_code is never a writable membership
-- parent for this boundary.
-- ─────────────────────────────────────────────────────────────────────────────

create or replace function public.kp_persist_assert_kp_summary_membership(
    p_summary_id uuid
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
set lock_timeout = '5s'
as $function$
declare
    v_summary public.summaries%rowtype;
    v_marker public.package_summaries%rowtype;
    v_marker_count bigint;
    v_membership_count bigint;
begin
    select *
    into v_summary
    from public.summaries s
    where s.id = p_summary_id;

    if not found then
        raise exception using errcode = 'no_data_found', message = 'Summary does not exist.';
    end if;
    if v_summary.summary_code is null then
        raise exception using errcode = 'object_not_in_prerequisite_state', message = 'Legacy Summary rows cannot receive Package memberships.';
    end if;

    select count(*)
    into v_membership_count
    from public.package_summaries ps
    where ps.summary_id = p_summary_id;
    if v_membership_count < 1 then
        raise exception using errcode = 'cardinality_violation', message = 'KP-native Summary must retain at least one Package membership.';
    end if;

    select count(*)
    into v_marker_count
    from public.package_summaries ps
    where ps.summary_id = p_summary_id
      and ps.is_summary_bank_compatibility;
    if v_marker_count <> 1 then
        raise exception using errcode = 'cardinality_violation', message = 'KP-native Summary must retain exactly one compatibility marker.';
    end if;

    select *
    into v_marker
    from public.package_summaries ps
    where ps.summary_id = p_summary_id
      and ps.is_summary_bank_compatibility;

    if v_marker.package_id is distinct from v_summary.package_id
       or v_marker.legacy_slug is null
       or v_marker.legacy_slug is distinct from lower(btrim(v_marker.legacy_slug))
       or v_marker.legacy_slug is distinct from v_summary.slug
    then
        raise exception using errcode = 'check_violation', message = 'Compatibility marker does not mirror summaries.package_id and summaries.slug.';
    end if;
end
$function$;

comment on function public.kp_persist_assert_kp_summary_membership(uuid) is
    'Internal KP-only membership invariant: one-or-more memberships, exactly one marker, and canonical Package/slug mirroring.';

-- ─────────────────────────────────────────────────────────────────────────────
-- KP-native create. The uuid[] overload is the new multi-Package contract.
-- The deterministic canonical Package is the lowest UUID in the requested
-- set. The old single-UUID signature below delegates to this overload.
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
    p_package_ids uuid[],
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
    v_marker public.package_summaries%rowtype;
    v_membership public.package_summaries%rowtype;
    v_package_id uuid;
    v_canonical_package uuid;
    v_summary_code text := upper(btrim(p_summary_code));
    v_canonical_slug text := lower(btrim(p_canonical_slug));
    v_legacy_slug text := lower(btrim(p_legacy_slug));
    v_marker_count bigint;
    v_membership_count bigint;
begin
    perform public.kp_persist_require_actor(p_actor_id);

    if p_summary_id is null or p_version_id is null then
        raise exception using errcode = 'invalid_parameter_value', message = 'Summary and revision IDs are required.';
    end if;
    if p_package_ids is null or cardinality(p_package_ids) is null or cardinality(p_package_ids) = 0 then
        raise exception using errcode = 'invalid_parameter_value', message = 'KP-native Summary create requires at least one Package ID.';
    end if;
    if exists (
        select 1
        from unnest(p_package_ids) requested(package_id)
        where requested.package_id is null
    ) then
        raise exception using errcode = 'invalid_parameter_value', message = 'KP-native Summary Package IDs cannot contain NULL.';
    end if;
    if (
        select count(*) from (select distinct package_id from unnest(p_package_ids) requested(package_id)) distinct_packages
    ) <> cardinality(p_package_ids) then
        raise exception using errcode = 'unique_violation', message = 'KP-native Summary Package IDs cannot contain duplicates.';
    end if;
    if exists (
        select 1
        from unnest(p_package_ids) requested(package_id)
        left join public.packages p on p.id = requested.package_id
        where p.id is null
    ) then
        raise exception using errcode = 'foreign_key_violation', message = 'Every KP-native Summary Package ID must exist.';
    end if;

    select requested.package_id
    into v_canonical_package
    from unnest(p_package_ids) requested(package_id)
    order by requested.package_id
    limit 1;

    if p_summary_code is null or p_canonical_slug is null or p_legacy_slug is null
       or v_summary_code = '' or v_canonical_slug = '' or v_legacy_slug = ''
    then
        raise exception using errcode = 'invalid_parameter_value', message = 'Summary code and slugs cannot be blank.';
    end if;
    if p_summary_code <> v_summary_code then
        raise exception using errcode = 'check_violation', message = 'Summary code must be uppercase and trimmed.';
    end if;
    if p_canonical_slug <> v_canonical_slug or p_legacy_slug <> v_legacy_slug then
        raise exception using errcode = 'check_violation', message = 'Summary slugs must be lowercase and trimmed.';
    end if;
    if p_canonical_title is null or btrim(p_canonical_title) = '' then
        raise exception using errcode = 'invalid_parameter_value', message = 'Canonical Summary title is required.';
    end if;
    if p_visibility is null or p_visibility not in ('public_indexable', 'authenticated', 'product_entitled') then
        raise exception using errcode = 'invalid_parameter_value', message = 'Summary visibility is invalid.';
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
    if p_navigation_label is not null and btrim(p_navigation_label) = '' then
        raise exception using errcode = 'invalid_parameter_value', message = 'Navigation label cannot be blank.';
    end if;

    select *
    into v_summary
    from public.summaries s
    where s.id = p_summary_id
    for update;

    if found then
        if v_summary.summary_code is null then
            raise exception using errcode = 'object_not_in_prerequisite_state', message = 'Legacy Summary rows cannot be reused by KP-native create.';
        end if;
        if v_summary.summary_code is distinct from v_summary_code
           or v_summary.canonical_slug is distinct from v_canonical_slug
           or v_summary.canonical_title is distinct from btrim(p_canonical_title)
           or v_summary.slug is distinct from v_legacy_slug
        then
            raise exception using errcode = 'unique_violation', message = 'Summary create retry conflicts with existing immutable KP identity.';
        end if;
        if v_summary.package_id is distinct from v_canonical_package
           or v_summary.title is distinct from btrim(p_canonical_title)
           or v_summary.subject is distinct from nullif(btrim(p_subject), '')
           or v_summary.topic is distinct from nullif(btrim(p_topic), '')
           or v_summary.law is distinct from nullif(btrim(p_law), '')
           or v_summary.content_md is distinct from p_content_md
           or v_summary.read_time_minutes is distinct from p_read_time_minutes
           or v_summary.sort_order is distinct from coalesce(p_sort_order, 0)
           or v_summary.is_published is distinct from false
           or v_summary.visibility is distinct from p_visibility
           or v_summary.lifecycle_status is distinct from 'active'
           or v_summary.current_published_version_id is not null
           or v_summary.created_by is distinct from p_actor_id
           or v_summary.archived_by is not null
           or v_summary.archived_at is not null
        then
            raise exception using errcode = 'unique_violation', message = 'Summary create retry conflicts with the requested root payload.';
        end if;
        if exists (
            select 1 from public.package_summaries ps
            where ps.summary_id = p_summary_id
              and not (ps.package_id = any(p_package_ids))
        ) or exists (
            select 1
            from unnest(p_package_ids) requested(package_id)
            where not exists (
                select 1 from public.package_summaries ps
                where ps.summary_id = p_summary_id
                  and ps.package_id = requested.package_id
            )
        ) then
            raise exception using errcode = 'unique_violation', message = 'Summary create retry conflicts with the requested complete Package membership set.';
        end if;

        for v_package_id in
            select requested.package_id
            from unnest(p_package_ids) requested(package_id)
            order by requested.package_id
        loop
            select *
            into v_membership
            from public.package_summaries ps
            where ps.summary_id = p_summary_id
              and ps.package_id = v_package_id
            for update;
            if not found
               or v_membership.status is distinct from 'draft'
               or v_membership.version_policy is distinct from 'latest_published'
               or v_membership.pinned_summary_version_id is not null
               or v_membership.sort_order is distinct from coalesce(p_sort_order, 0)
               or v_membership.display_order is distinct from coalesce(p_display_order, 0)
               or v_membership.released_at is not null
               or v_membership.navigation_label is distinct from nullif(btrim(p_navigation_label), '')
               or v_membership.legacy_slug is distinct from v_legacy_slug
               or v_membership.is_summary_bank_compatibility is distinct from (v_package_id = v_canonical_package)
               or v_membership.created_by is distinct from p_actor_id
               or v_membership.activated_by is not null
               or v_membership.activated_at is not null
               or v_membership.hidden_by is not null
               or v_membership.hidden_at is not null
            then
                raise exception using errcode = 'unique_violation', message = 'Summary create retry conflicts with the requested Package membership payload.';
            end if;
        end loop;

        select *
        into v_version
        from public.summary_versions sv
        where sv.id = p_version_id
          and sv.summary_id = p_summary_id
        for update;
        if not found then
            raise exception using errcode = 'object_not_in_prerequisite_state', message = 'Summary root exists without the requested revision.';
        end if;
        if v_version.revision_number <> 1
           or v_version.status is distinct from 'draft'
           or v_version.content_md is distinct from p_content_md
           or v_version.content_checksum is distinct from p_content_checksum
           or v_version.title_snapshot is distinct from btrim(p_canonical_title)
           or v_version.subject_snapshot is distinct from nullif(btrim(p_subject), '')
           or v_version.topic_snapshot is distinct from nullif(btrim(p_topic), '')
           or v_version.law_snapshot is distinct from nullif(btrim(p_law), '')
           or v_version.seo_title is not null
           or v_version.seo_description is not null
           or v_version.social_image_bucket is not null
           or v_version.social_image_path is not null
           or v_version.read_time_minutes is distinct from p_read_time_minutes
           or v_version.read_time_policy_version is distinct from btrim(p_read_time_policy_version)
           or v_version.content_schema_version is distinct from btrim(p_content_schema_version)
           or v_version.change_note is distinct from btrim(p_change_note)
           or v_version.authored_by is distinct from p_actor_id
           or v_version.submitted_for_review_at is not null
           or v_version.reviewed_by is not null
           or v_version.reviewed_at is not null
           or v_version.published_by is not null
           or v_version.published_at is not null
           or v_version.retired_by is not null
           or v_version.retired_at is not null
           or v_version.retirement_reason is not null
        then
            raise exception using errcode = 'unique_violation', message = 'Summary create retry conflicts with the requested revision payload.';
        end if;

        perform public.kp_persist_assert_kp_summary_membership(p_summary_id);
        return jsonb_build_object(
            'summary_id', p_summary_id,
            'summary_version_id', p_version_id,
            'canonical_package_id', v_summary.package_id,
            'package_count', cardinality(p_package_ids),
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
        p_summary_id, v_canonical_package, btrim(p_canonical_title), v_legacy_slug,
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

    for v_package_id in
        select requested.package_id
        from unnest(p_package_ids) requested(package_id)
        order by requested.package_id
    loop
        insert into public.package_summaries (
            package_id, summary_id, status, version_policy,
            pinned_summary_version_id, sort_order, display_order, released_at,
            navigation_label, legacy_slug, is_summary_bank_compatibility,
            created_by, created_at, updated_at, activated_by, activated_at,
            hidden_by, hidden_at
        ) values (
            v_package_id, p_summary_id, 'draft', 'latest_published', null,
            coalesce(p_sort_order, 0), coalesce(p_display_order, 0), null,
            nullif(btrim(p_navigation_label), ''), v_legacy_slug,
            v_package_id = v_canonical_package,
            p_actor_id, v_now, v_now, null, null, null, null
        );
    end loop;

    perform public.kp_persist_assert_kp_summary_membership(p_summary_id);

    select count(*) into v_membership_count
    from public.package_summaries ps
    where ps.summary_id = p_summary_id;
    select count(*) into v_marker_count
    from public.package_summaries ps
    where ps.summary_id = p_summary_id
      and ps.is_summary_bank_compatibility;

    return jsonb_build_object(
        'summary_id', p_summary_id,
        'summary_version_id', p_version_id,
        'canonical_package_id', v_canonical_package,
        'package_count', v_membership_count,
        'marker_count', v_marker_count,
        'idempotent_retry', false
    );
end
$function$;

comment on function public.kp_persist_create_compatibility_summary(uuid,text,text,text,text,text,text,text,uuid[],text,text,text,integer,text,text,text,uuid,uuid,integer,integer,text) is
    'Atomic KP-native create: one Summary root, one revision, and one unambiguous marked membership across a non-empty distinct Package set.';

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
    v_result jsonb;
begin
    v_result := public.kp_persist_create_compatibility_summary(
        p_summary_id, p_summary_code, p_canonical_slug, p_canonical_title,
        p_subject, p_topic, p_law, p_visibility,
        array[p_package_id]::uuid[], p_legacy_slug, p_content_md,
        p_content_checksum, p_read_time_minutes, p_read_time_policy_version,
        p_content_schema_version, p_change_note, p_actor_id, p_version_id,
        p_sort_order, p_display_order, p_navigation_label
    );
    return v_result || jsonb_build_object('package_id', p_package_id);
end
$function$;

comment on function public.kp_persist_create_compatibility_summary(uuid,text,text,text,text,text,text,text,uuid,text,text,text,integer,text,text,text,uuid,uuid,integer,integer,text) is
    'Safe compatibility wrapper: delegates the legacy single-Package call to the KP-native uuid[] create invariant.';

-- ─────────────────────────────────────────────────────────────────────────────
-- Existing single-root draft edit. It remains callable for 069/071/072 but
-- cannot mutate Legacy rows or a divergent marker.
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
    v_marker public.package_summaries%rowtype;
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
    if p_visibility is null or p_visibility not in ('public_indexable', 'authenticated', 'product_entitled') then
        raise exception using errcode = 'invalid_parameter_value', message = 'Summary visibility is invalid.';
    end if;

    select * into v_summary
    from public.summaries s
    where s.id = p_summary_id
    for update;
    if not found then
        raise exception using errcode = 'no_data_found', message = 'Summary does not exist.';
    end if;
    if v_summary.summary_code is null then
        raise exception using errcode = 'object_not_in_prerequisite_state', message = 'Legacy Summary rows cannot be edited through the KP writer core.';
    end if;

    select * into v_marker
    from public.package_summaries ps
    where ps.summary_id = p_summary_id
      and ps.is_summary_bank_compatibility
    for update;
    select count(*) into v_marker_count
    from public.package_summaries ps
    where ps.summary_id = p_summary_id
      and ps.is_summary_bank_compatibility;
    if not found or v_marker_count <> 1
       or v_marker.package_id is distinct from v_summary.package_id
       or v_marker.legacy_slug is distinct from v_summary.slug
       or v_marker.package_id is distinct from p_package_id
    then
        raise exception using errcode = 'object_not_in_prerequisite_state', message = 'Draft edit found invalid KP compatibility marker state.';
    end if;

    select * into v_version
    from public.summary_versions sv
    where sv.id = p_version_id
      and sv.summary_id = p_summary_id
    for update;
    if not found or v_version.status <> 'draft' then
        raise exception using errcode = 'object_not_in_prerequisite_state', message = 'Only a draft revision belonging to the Summary can be edited.';
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
    where package_id = v_marker.package_id
      and summary_id = p_summary_id
      and is_summary_bank_compatibility;

    perform public.kp_persist_assert_kp_summary_membership(p_summary_id);
    return jsonb_build_object('summary_id', p_summary_id, 'summary_version_id', p_version_id, 'package_id', v_marker.package_id);
end
$function$;

comment on function public.kp_persist_update_compatibility_draft(uuid,uuid,text,text,text,text,text,text,uuid,text,text,text,integer,text,text,text,uuid,integer,integer,text) is
    'Safe KP-native draft edit; Legacy rows and divergent marker state are rejected.';

-- ─────────────────────────────────────────────────────────────────────────────
-- Canonical Package reassignment. A selected target is promoted while the old
-- canonical membership remains as a secondary membership; a new target adds
-- one membership and removes the former canonical membership.
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
    v_summary public.summaries%rowtype;
    v_old public.package_summaries%rowtype;
    v_target public.package_summaries%rowtype;
    v_new_slug text := lower(btrim(p_new_legacy_slug));
    v_marker_count bigint;
begin
    perform public.kp_persist_require_actor(p_actor_id);
    if p_summary_id is null or p_new_package_id is null or p_new_legacy_slug is null or v_new_slug = '' then
        raise exception using errcode = 'invalid_parameter_value', message = 'Canonical reassignment requires Summary, Package, and slug.';
    end if;
    if p_new_legacy_slug <> v_new_slug then
        raise exception using errcode = 'check_violation', message = 'Canonical Package slug must be lowercase and trimmed.';
    end if;
    if not exists (select 1 from public.packages p where p.id = p_new_package_id) then
        raise exception using errcode = 'foreign_key_violation', message = 'Canonical Package does not exist.';
    end if;

    select * into v_summary from public.summaries s where s.id = p_summary_id for update;
    if not found then
        raise exception using errcode = 'no_data_found', message = 'Summary does not exist.';
    end if;
    if v_summary.summary_code is null then
        raise exception using errcode = 'object_not_in_prerequisite_state', message = 'Legacy Summary rows cannot receive Package memberships.';
    end if;

    select * into v_old
    from public.package_summaries ps
    where ps.summary_id = p_summary_id and ps.is_summary_bank_compatibility
    for update;
    select count(*) into v_marker_count
    from public.package_summaries ps
    where ps.summary_id = p_summary_id and ps.is_summary_bank_compatibility;
    if not found or v_marker_count <> 1
       or v_old.package_id is distinct from v_summary.package_id
       or v_old.legacy_slug is distinct from v_summary.slug
    then
        raise exception using errcode = 'object_not_in_prerequisite_state', message = 'Canonical reassignment found invalid marker state.';
    end if;

    if v_old.package_id = p_new_package_id then
        update public.summaries set slug = v_new_slug, updated_at = v_now where id = p_summary_id;
        update public.package_summaries
        set legacy_slug = v_new_slug, updated_at = v_now
        where package_id = p_new_package_id and summary_id = p_summary_id and is_summary_bank_compatibility;
    else
        select * into v_target
        from public.package_summaries ps
        where ps.package_id = p_new_package_id and ps.summary_id = p_summary_id
        for update;

        update public.package_summaries
        set is_summary_bank_compatibility = false, updated_at = v_now
        where package_id = v_old.package_id and summary_id = p_summary_id and is_summary_bank_compatibility;

        if v_target.package_id is not null then
            update public.package_summaries
            set is_summary_bank_compatibility = true,
                legacy_slug = v_new_slug,
                updated_at = v_now
            where package_id = p_new_package_id and summary_id = p_summary_id;
        else
            insert into public.package_summaries (
                package_id, summary_id, status, version_policy,
                pinned_summary_version_id, sort_order, display_order, released_at,
                navigation_label, legacy_slug, is_summary_bank_compatibility,
                created_by, created_at, updated_at, activated_by, activated_at,
                hidden_by, hidden_at
            ) values (
                p_new_package_id, p_summary_id, v_old.status, v_old.version_policy,
                v_old.pinned_summary_version_id, v_old.sort_order, v_old.display_order,
                v_old.released_at, v_old.navigation_label, v_new_slug, true,
                p_actor_id, v_now, v_now,
                case when v_old.status = 'active' then p_actor_id else null end,
                case when v_old.status = 'active' then v_now else null end,
                case when v_old.status = 'hidden' then p_actor_id else null end,
                case when v_old.status = 'hidden' then v_now else null end
            );
            delete from public.package_summaries
            where package_id = v_old.package_id and summary_id = p_summary_id;
        end if;

        update public.summaries
        set package_id = p_new_package_id, slug = v_new_slug, updated_at = v_now
        where id = p_summary_id;
    end if;

    perform public.kp_persist_assert_kp_summary_membership(p_summary_id);
    return jsonb_build_object(
        'summary_id', p_summary_id,
        'package_id', p_new_package_id,
        'canonical_package_id', p_new_package_id
    );
end
$function$;

comment on function public.kp_persist_reassign_compatibility_package(uuid,uuid,text,uuid) is
    'Safe KP-native canonical Package rotation; selected secondary memberships remain product memberships.';

-- ─────────────────────────────────────────────────────────────────────────────
-- Complete membership reconciliation. The current canonical Package is
-- preserved whenever it remains selected; otherwise the lowest selected UUID
-- becomes canonical and the marker/summary mirror rotate in one transaction.
-- ─────────────────────────────────────────────────────────────────────────────

create or replace function public.kp_persist_reconcile_package_memberships(
    p_summary_id uuid,
    p_package_ids uuid[],
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
    v_canonical_placement public.package_summaries%rowtype;
    v_package_id uuid;
    v_canonical_package uuid;
    v_canonical_slug text;
    v_membership_count bigint;
    v_marker_count bigint;
begin
    perform public.kp_persist_require_actor(p_actor_id);
    if p_summary_id is null then
        raise exception using errcode = 'invalid_parameter_value', message = 'Summary ID is required.';
    end if;
    if p_package_ids is null or cardinality(p_package_ids) is null or cardinality(p_package_ids) = 0 then
        raise exception using errcode = 'invalid_parameter_value', message = 'Membership reconciliation requires at least one Package ID.';
    end if;
    if exists (select 1 from unnest(p_package_ids) requested(package_id) where requested.package_id is null) then
        raise exception using errcode = 'invalid_parameter_value', message = 'Membership Package IDs cannot contain NULL.';
    end if;
    if (select count(*) from (select distinct package_id from unnest(p_package_ids) requested(package_id)) distinct_packages) <> cardinality(p_package_ids) then
        raise exception using errcode = 'unique_violation', message = 'Membership Package IDs cannot contain duplicates.';
    end if;
    if exists (
        select 1
        from unnest(p_package_ids) requested(package_id)
        left join public.packages p on p.id = requested.package_id
        where p.id is null
    ) then
        raise exception using errcode = 'foreign_key_violation', message = 'Every requested Package membership must exist.';
    end if;

    select * into v_summary from public.summaries s where s.id = p_summary_id for update;
    if not found then
        raise exception using errcode = 'no_data_found', message = 'Summary does not exist.';
    end if;
    if v_summary.summary_code is null then
        raise exception using errcode = 'object_not_in_prerequisite_state', message = 'Legacy Summary rows cannot receive Package memberships.';
    end if;

    perform public.kp_persist_assert_kp_summary_membership(p_summary_id);

    if v_summary.package_id = any(p_package_ids) then
        v_canonical_package := v_summary.package_id;
    else
        select requested.package_id
        into v_canonical_package
        from unnest(p_package_ids) requested(package_id)
        order by requested.package_id
        limit 1;
    end if;

    select * into v_canonical_placement
    from public.package_summaries ps
    where ps.summary_id = p_summary_id
      and ps.package_id = v_canonical_package
    for update;
    v_canonical_slug := coalesce(nullif(lower(btrim(v_canonical_placement.legacy_slug)), ''), v_summary.slug);

    update public.package_summaries
    set is_summary_bank_compatibility = false,
        updated_at = v_now
    where summary_id = p_summary_id
      and is_summary_bank_compatibility;

    delete from public.package_summaries ps
    where ps.summary_id = p_summary_id
      and not (ps.package_id = any(p_package_ids));

    for v_package_id in
        select requested.package_id
        from unnest(p_package_ids) requested(package_id)
        order by requested.package_id
    loop
        if not exists (
            select 1 from public.package_summaries ps
            where ps.summary_id = p_summary_id and ps.package_id = v_package_id
        ) then
            insert into public.package_summaries (
                package_id, summary_id, status, version_policy,
                pinned_summary_version_id, sort_order, display_order, released_at,
                navigation_label, legacy_slug, is_summary_bank_compatibility,
                created_by, created_at, updated_at, activated_by, activated_at,
                hidden_by, hidden_at
            ) values (
                v_package_id, p_summary_id, 'draft', 'latest_published', null,
                0, 0, null, null,
                case when v_package_id = v_canonical_package then v_canonical_slug else null end,
                false, p_actor_id, v_now, v_now, null, null, null, null
            );
        end if;
    end loop;

    update public.package_summaries
    set is_summary_bank_compatibility = true,
        legacy_slug = v_canonical_slug,
        updated_at = v_now
    where summary_id = p_summary_id
      and package_id = v_canonical_package;

    update public.summaries
    set package_id = v_canonical_package,
        slug = v_canonical_slug,
        updated_at = v_now
    where id = p_summary_id;

    perform public.kp_persist_assert_kp_summary_membership(p_summary_id);

    select count(*) into v_membership_count
    from public.package_summaries ps where ps.summary_id = p_summary_id;
    select count(*) into v_marker_count
    from public.package_summaries ps
    where ps.summary_id = p_summary_id and ps.is_summary_bank_compatibility;

    return jsonb_build_object(
        'summary_id', p_summary_id,
        'canonical_package_id', v_canonical_package,
        'package_count', v_membership_count,
        'marker_count', v_marker_count
    );
end
$function$;

comment on function public.kp_persist_reconcile_package_memberships(uuid,uuid[],uuid) is
    'Atomic complete Package membership reconciliation with canonical preservation/rotation and exactly one marker.';

-- ─────────────────────────────────────────────────────────────────────────────
-- Single-membership attach. It is explicitly KP-only and always inserts an
-- unmarked secondary membership; it never treats marker as membership authority.
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
    v_summary public.summaries%rowtype;
    v_marker public.package_summaries%rowtype;
    v_slug text := case when p_legacy_slug is null then null else lower(btrim(p_legacy_slug)) end;
    v_marker_count bigint;
begin
    perform public.kp_persist_require_actor(p_actor_id);
    if p_package_id is null or p_summary_id is null then
        raise exception using errcode = 'invalid_parameter_value', message = 'Package and Summary IDs are required.';
    end if;
    if p_status is null or p_version_policy is null
       or p_status not in ('draft', 'active', 'hidden')
       or p_version_policy not in ('latest_published', 'pinned')
    then
        raise exception using errcode = 'invalid_parameter_value', message = 'Package membership status or version policy is invalid.';
    end if;
    if v_slug is not null and p_legacy_slug <> v_slug then
        raise exception using errcode = 'check_violation', message = 'Package membership slug must be lowercase and trimmed.';
    end if;
    if p_version_policy = 'latest_published' and p_pinned_summary_version_id is not null then
        raise exception using errcode = 'check_violation', message = 'Latest-published membership cannot specify a pinned revision.';
    end if;
    if p_version_policy = 'pinned' and p_pinned_summary_version_id is null then
        raise exception using errcode = 'check_violation', message = 'Pinned membership requires a revision.';
    end if;
    if not exists (select 1 from public.packages p where p.id = p_package_id) then
        raise exception using errcode = 'foreign_key_violation', message = 'Package membership parent does not exist.';
    end if;

    select * into v_summary from public.summaries s where s.id = p_summary_id for update;
    if not found then
        raise exception using errcode = 'foreign_key_violation', message = 'Package membership Summary parent does not exist.';
    end if;
    if v_summary.summary_code is null then
        raise exception using errcode = 'object_not_in_prerequisite_state', message = 'Legacy Summary rows cannot receive Package memberships.';
    end if;
    perform public.kp_persist_assert_kp_summary_membership(p_summary_id);

    select * into v_marker
    from public.package_summaries ps
    where ps.summary_id = p_summary_id and ps.is_summary_bank_compatibility
    for update;

    if exists (
        select 1 from public.package_summaries ps
        where ps.package_id = p_package_id and ps.summary_id = p_summary_id
    ) then
        raise exception using errcode = 'unique_violation', message = 'Package membership already exists.';
    end if;

    if p_pinned_summary_version_id is not null
       and not exists (
           select 1 from public.summary_versions sv
           where sv.id = p_pinned_summary_version_id
             and sv.summary_id = p_summary_id
             and sv.status = 'published'
       )
    then
        raise exception using errcode = 'object_not_in_prerequisite_state', message = 'Pinned membership revision must belong to the Summary and be published.';
    end if;
    if p_status = 'active' and p_version_policy = 'latest_published'
       and (v_summary.current_published_version_id is null or not exists (
           select 1 from public.summary_versions sv
           where sv.id = v_summary.current_published_version_id
             and sv.summary_id = p_summary_id
             and sv.status = 'published'
       ))
    then
        raise exception using errcode = 'object_not_in_prerequisite_state', message = 'Active latest-published membership requires a published current revision.';
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

    perform public.kp_persist_assert_kp_summary_membership(p_summary_id);
    return jsonb_build_object('package_id', p_package_id, 'summary_id', p_summary_id, 'is_summary_bank_compatibility', false);
end
$function$;

comment on function public.kp_persist_attach_package_summary(uuid,uuid,text,text,uuid,integer,integer,timestamptz,text,text,uuid) is
    'KP-only secondary membership attach; Legacy rows are rejected and the canonical marker remains unchanged.';

-- ─────────────────────────────────────────────────────────────────────────────
-- Single-membership detach. The final membership is protected. Removing the
-- canonical marker rotates it to the deterministic lowest remaining Package.
-- ─────────────────────────────────────────────────────────────────────────────

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
    v_now timestamptz := clock_timestamp();
    v_summary public.summaries%rowtype;
    v_requested public.package_summaries%rowtype;
    v_replacement public.package_summaries%rowtype;
    v_new_slug text;
    v_membership_count bigint;
begin
    perform public.kp_persist_require_actor(p_actor_id);
    if p_package_id is null or p_summary_id is null then
        raise exception using errcode = 'invalid_parameter_value', message = 'Package and Summary IDs are required.';
    end if;

    select * into v_summary from public.summaries s where s.id = p_summary_id for update;
    if not found then
        raise exception using errcode = 'no_data_found', message = 'Summary does not exist.';
    end if;
    if v_summary.summary_code is null then
        raise exception using errcode = 'object_not_in_prerequisite_state', message = 'Legacy Summary rows cannot receive or detach Package memberships.';
    end if;
    perform public.kp_persist_assert_kp_summary_membership(p_summary_id);

    select count(*) into v_membership_count
    from public.package_summaries ps where ps.summary_id = p_summary_id;
    if v_membership_count <= 1 then
        raise exception using errcode = 'cardinality_violation', message = 'A KP-native Summary must retain at least one Package membership.';
    end if;

    select * into v_requested
    from public.package_summaries ps
    where ps.package_id = p_package_id and ps.summary_id = p_summary_id
    for update;
    if not found then
        raise exception using errcode = 'no_data_found', message = 'Package membership does not exist.';
    end if;

    if not v_requested.is_summary_bank_compatibility then
        delete from public.package_summaries
        where package_id = p_package_id and summary_id = p_summary_id;
    else
        select * into v_replacement
        from public.package_summaries ps
        where ps.summary_id = p_summary_id
          and ps.package_id <> p_package_id
        order by ps.package_id
        limit 1
        for update;

        if not found then
            raise exception using errcode = 'cardinality_violation', message = 'Cannot detach the final KP-native Package membership.';
        end if;
        v_new_slug := coalesce(nullif(lower(btrim(v_replacement.legacy_slug)), ''), v_summary.slug);

        delete from public.package_summaries
        where package_id = p_package_id and summary_id = p_summary_id;

        update public.package_summaries
        set is_summary_bank_compatibility = true,
            legacy_slug = v_new_slug,
            updated_at = v_now
        where package_id = v_replacement.package_id
          and summary_id = p_summary_id;

        update public.summaries
        set package_id = v_replacement.package_id,
            slug = v_new_slug,
            updated_at = v_now
        where id = p_summary_id;
    end if;

    perform public.kp_persist_assert_kp_summary_membership(p_summary_id);
    return jsonb_build_object('package_id', p_package_id, 'summary_id', p_summary_id, 'detached', true);
end
$function$;

comment on function public.kp_persist_detach_package_summary(uuid,uuid,uuid) is
    'KP-only membership detach; rejects the final membership and atomically rotates the marker when canonical membership is removed.';

-- ─────────────────────────────────────────────────────────────────────────────
-- Caller-bound authorization shared by the permanent cleanup and writer
-- fences. SECURITY DEFINER changes current_user to the trusted API owner, but
-- does not identify which function is executing. PG_CONTEXT does: this helper
-- normalizes every active PL/pgSQL frame and requires an exact match to an
-- approved function OID plus its identity arguments. An unlisted function
-- owned by the same API role therefore cannot satisfy the fence merely by
-- sharing current_user.
-- ─────────────────────────────────────────────────────────────────────────────

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

    -- The first caller frame after the helper/fence frames is the function
    -- whose SQL statement caused the protected row mutation. Do not accept an
    -- arbitrary approved frame deeper in the stack: that would let an
    -- unlisted same-owner wrapper borrow authority.
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
    select frames.call_signature
    into v_active_signature
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
            -- PG_CONTEXT may omit the schema for an unqualified call. Resolve
            -- that form only when the name/signature is globally unique;
            -- otherwise an identically named function in another schema must
            -- fail closed instead of borrowing the public RPC's authority.
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
              to_regprocedure('public.kp_persist_delete_compatibility_summary(uuid,uuid)')
          )
          and p.prosecdef
          and pg_catalog.pg_get_userbyid(p.proowner) = current_user
          and array_to_string(p.proconfig, ',') ilike '%search_path=pg_catalog, public, pg_temp%'
          and array_to_string(p.proconfig, ',') ilike '%lock_timeout=5s%'
          and p.oid = v_active_oid
    );
end
$function$;

comment on function public.kp_summary_writer_caller_is_approved() is
    'Caller-bound Summary writer authorization. Matches an active PG_CONTEXT persistence RPC frame, not merely an owner or an existing allowlist row.';

revoke all on function public.kp_summary_writer_caller_is_approved()
    from public, anon, authenticated, service_role;

-- ─────────────────────────────────────────────────────────────────────────────
-- Replace the migration-059 cleanup fence without removing its trigger. The
-- historical fence authorized only session_user operators, which blocks every
-- SECURITY DEFINER persistence RPC because SECURITY DEFINER changes
-- current_user, not session_user. The permanent Hybrid fence keeps direct
-- client writes denied, recognizes only explicitly allowlisted persistence
-- functions on the active PG_CONTEXT call stack, and retains the controlled
-- operator path.
-- Legacy columns remain present and are still protected for non-approved
-- callers; this is not the destructive 060 retirement executor.
-- ─────────────────────────────────────────────────────────────────────────────

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
    -- RLS bypass and the service role are not writer authorization. The
    -- session_user comparison below is only the explicit direct-operator
    -- guard; RPC authorization is caller-bound by the helper above.
    if current_user in ('public', 'anon', 'authenticated', 'service_role') then
        raise exception using
            errcode = 'insufficient_privilege',
            message = 'Direct Summary mutations are disabled; use the approved transactional persistence API.';
    end if;

    select session_user = current_user and (
        exists (
            select 1
            from pg_catalog.pg_roles r
            where r.rolname = current_user
              and r.rolsuper
        ) or exists (
            select 1
            from pg_catalog.pg_database d
            where d.datname = current_database()
              and pg_catalog.pg_get_userbyid(d.datdba) = current_user
        )
    )
    into v_is_controlled_operator;

    if not v_is_controlled_operator then
        v_is_approved_api_owner := public.kp_summary_writer_caller_is_approved();
    end if;

    if not v_is_approved_api_owner and not v_is_controlled_operator then
        if tg_op = 'INSERT' then
            raise exception using
                errcode = 'insufficient_privilege',
                message = 'Summary INSERT is disabled; use the approved transactional persistence API.';
        end if;

        if tg_op = 'DELETE' then
            raise exception using
                errcode = 'insufficient_privilege',
                message = 'Summary DELETE is disabled; use the approved transactional persistence API.';
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
            raise exception using
                errcode = 'insufficient_privilege',
                message = 'Legacy Summary authority fields are read-only outside the approved transactional persistence API.';
        end if;
    end if;

    if tg_op = 'DELETE' then
        return old;
    end if;
    return new;
end
$function$;

comment on function public.kp_enforce_summary_cleanup_fence() is
    'SECURITY INVOKER permanent Hybrid cleanup fence. Direct public, anon, authenticated, and service_role writes remain blocked; explicitly allowlisted SECURITY DEFINER persistence RPCs are authorized by their active PG_CONTEXT caller and locked function metadata, while legacy columns remain protected for all other callers.';

revoke all on function public.kp_enforce_summary_cleanup_fence()
    from public, anon, authenticated;
grant execute on function public.kp_enforce_summary_cleanup_fence()
    to service_role;

-- ─────────────────────────────────────────────────────────────────────────────
-- Extend the 058 writer fence for the new 068 SECURITY DEFINER commands. The
-- fence remains SECURITY INVOKER, denies browser/service-role direct table
-- writes, and recognizes only active approved API callers.
-- ─────────────────────────────────────────────────────────────────────────────

create or replace function public.kp_enforce_summary_writer_boundary()
returns trigger
language plpgsql
security invoker
set search_path = pg_catalog, public, pg_temp
set lock_timeout = '5s'
as $function$
declare
    v_is_superuser boolean := false;
    v_is_approved_api_owner boolean := false;
begin
    -- RLS bypass is not writer authorization. Direct browser and service-role
    -- table writes must fail even when the role can otherwise bypass RLS.
    if current_user in ('public', 'anon', 'authenticated', 'service_role') then
        raise exception using
            errcode = 'insufficient_privilege',
            message = 'Direct Summary mutations are disabled; use the approved transactional persistence API.';
    end if;

    select session_user = current_user and (
           coalesce(r.rolsuper, false)
           or exists (
               select 1
               from pg_catalog.pg_database d
               where d.datname = current_database()
                 and pg_catalog.pg_get_userbyid(d.datdba) = current_user
           )
    )
    into v_is_superuser
    from pg_catalog.pg_roles r
    where r.rolname = current_user;

    if not v_is_superuser then
        v_is_approved_api_owner := public.kp_summary_writer_caller_is_approved();
    end if;

    if not v_is_superuser and not v_is_approved_api_owner then
        raise exception using
            errcode = 'insufficient_privilege',
            message = 'Direct Summary mutations are disabled; use the approved transactional persistence API or a controlled migration operator.';
    end if;

    if tg_op = 'DELETE' then
        return old;
    end if;
    return new;
end
$function$;

comment on function public.kp_enforce_summary_writer_boundary() is
    'SECURITY INVOKER single-writer fence for the Summary aggregate. Browser and direct service-role table writes are denied; approved 057 and 068 SECURITY DEFINER commands are bound to their active caller, and controlled migration operators remain allowed.';

-- ─────────────────────────────────────────────────────────────────────────────
-- Reassert server-only grants for old signatures and the new membership APIs.
-- ─────────────────────────────────────────────────────────────────────────────

revoke all on function public.kp_persist_assert_kp_summary_membership(uuid)
    from public, anon, authenticated;
grant execute on function public.kp_persist_assert_kp_summary_membership(uuid)
    to service_role;

revoke all on function public.kp_persist_create_compatibility_summary(uuid,text,text,text,text,text,text,text,uuid[],text,text,text,integer,text,text,text,uuid,uuid,integer,integer,text)
    from public, anon, authenticated;
grant execute on function public.kp_persist_create_compatibility_summary(uuid,text,text,text,text,text,text,text,uuid[],text,text,text,integer,text,text,text,uuid,uuid,integer,integer,text)
    to service_role;

revoke all on function public.kp_persist_create_compatibility_summary(uuid,text,text,text,text,text,text,text,uuid,text,text,text,integer,text,text,text,uuid,uuid,integer,integer,text)
    from public, anon, authenticated;
grant execute on function public.kp_persist_create_compatibility_summary(uuid,text,text,text,text,text,text,text,uuid,text,text,text,integer,text,text,text,uuid,uuid,integer,integer,text)
    to service_role;

revoke all on function public.kp_persist_update_compatibility_draft(uuid,uuid,text,text,text,text,text,text,uuid,text,text,text,integer,text,text,text,uuid,integer,integer,text)
    from public, anon, authenticated;
grant execute on function public.kp_persist_update_compatibility_draft(uuid,uuid,text,text,text,text,text,text,uuid,text,text,text,integer,text,text,text,uuid,integer,integer,text)
    to service_role;

revoke all on function public.kp_persist_reassign_compatibility_package(uuid,uuid,text,uuid)
    from public, anon, authenticated;
grant execute on function public.kp_persist_reassign_compatibility_package(uuid,uuid,text,uuid)
    to service_role;

revoke all on function public.kp_persist_reconcile_package_memberships(uuid,uuid[],uuid)
    from public, anon, authenticated;
grant execute on function public.kp_persist_reconcile_package_memberships(uuid,uuid[],uuid)
    to service_role;

revoke all on function public.kp_persist_attach_package_summary(uuid,uuid,text,text,uuid,integer,integer,timestamptz,text,text,uuid)
    from public, anon, authenticated;
grant execute on function public.kp_persist_attach_package_summary(uuid,uuid,text,text,uuid,integer,integer,timestamptz,text,text,uuid)
    to service_role;

revoke all on function public.kp_persist_detach_package_summary(uuid,uuid,uuid)
    from public, anon, authenticated;
grant execute on function public.kp_persist_detach_package_summary(uuid,uuid,uuid)
    to service_role;

-- ─────────────────────────────────────────────────────────────────────────────
-- Catalog and hybrid data postflight. No global Summary marker cardinality is
-- asserted; legacy and KP-native rows are reconciled independently.
-- ─────────────────────────────────────────────────────────────────────────────

do $kp_summary_bank_writer_core_postflight$
declare
    expected record;
    v_function oid;
    v_api_owner oid;
    v_definition text;
    v_boundary_definition text;
    v_caller_definition text;
begin
    select p.proowner
    into v_api_owner
    from pg_catalog.pg_proc p
    where p.oid = to_regprocedure('public.kp_persist_require_actor(uuid)');

    select pg_catalog.pg_get_functiondef(to_regprocedure('public.kp_enforce_summary_writer_boundary()'))
    into v_boundary_definition;
    select pg_catalog.pg_get_functiondef(to_regprocedure('public.kp_summary_writer_caller_is_approved()'))
    into v_caller_definition;
    if v_boundary_definition is null
       or not exists (
            select 1
            from pg_catalog.pg_proc p
            where p.oid = to_regprocedure('public.kp_enforce_summary_writer_boundary()')
              and p.prosecdef = false
       )
       or position('current_user in (''public'', ''anon'', ''authenticated'', ''service_role'')' in lower(v_boundary_definition)) = 0
       or position('kp_summary_writer_caller_is_approved()' in lower(v_boundary_definition)) = 0
       or v_caller_definition is null
       or position('get diagnostics v_context = pg_context' in lower(v_caller_definition)) = 0
       or position('p.oid = v_active_oid' in lower(v_caller_definition)) = 0
       or position('kp_persist_create_compatibility_summary' in lower(v_caller_definition)) = 0
       or position('kp_persist_reconcile_package_memberships' in lower(v_caller_definition)) = 0
    then
        raise exception using
            errcode = 'check_violation',
            message = 'Knowledge Platform migration 068 failed to extend the 058 writer fence for the new UUID-array APIs.';
    end if;

    for expected in
        select function_name, required_fragment
        from (values
            ('public.kp_persist_assert_kp_summary_membership(uuid)', 'is_summary_bank_compatibility'),
            ('public.kp_persist_create_compatibility_summary(uuid,text,text,text,text,text,text,text,uuid[],text,text,text,integer,text,text,text,uuid,uuid,integer,integer,text)', 'is_summary_bank_compatibility'),
            ('public.kp_persist_create_compatibility_summary(uuid,text,text,text,text,text,text,text,uuid,text,text,text,integer,text,text,text,uuid,uuid,integer,integer,text)', 'kp_persist_create_compatibility_summary'),
            ('public.kp_persist_update_compatibility_draft(uuid,uuid,text,text,text,text,text,text,uuid,text,text,text,integer,text,text,text,uuid,integer,integer,text)', 'is_summary_bank_compatibility'),
            ('public.kp_persist_reassign_compatibility_package(uuid,uuid,text,uuid)', 'is_summary_bank_compatibility'),
            ('public.kp_persist_reconcile_package_memberships(uuid,uuid[],uuid)', 'is_summary_bank_compatibility'),
            ('public.kp_persist_attach_package_summary(uuid,uuid,text,text,uuid,integer,integer,timestamptz,text,text,uuid)', 'is_summary_bank_compatibility'),
            ('public.kp_persist_detach_package_summary(uuid,uuid,uuid)', 'is_summary_bank_compatibility')
        ) as required(function_name, required_fragment)
    loop
        v_function := to_regprocedure(expected.function_name);
        if v_function is null then
            raise exception using errcode = 'check_violation', message = format('Knowledge Platform migration 068 failed to preserve signature: %s.', expected.function_name);
        end if;

        select pg_catalog.pg_get_functiondef(p.oid)
        into v_definition
        from pg_catalog.pg_proc p
        where p.oid = v_function
          and p.proowner = v_api_owner
          and p.prosecdef
          and array_to_string(p.proconfig, ',') ilike '%search_path=pg_catalog, public, pg_temp%'
          and array_to_string(p.proconfig, ',') ilike '%lock_timeout=5s%';

        if v_definition is null or position(expected.required_fragment in v_definition) = 0 then
            raise exception using errcode = 'check_violation', message = format('Knowledge Platform migration 068 installed a divergent writer: %s.', expected.function_name);
        end if;

        if has_function_privilege('public', v_function, 'EXECUTE')
           or has_function_privilege('anon', v_function, 'EXECUTE')
           or has_function_privilege('authenticated', v_function, 'EXECUTE')
           or not has_function_privilege('service_role', v_function, 'EXECUTE')
        then
            raise exception using errcode = 'check_violation', message = format('Knowledge Platform migration 068 failed service-role-only grants: %s.', expected.function_name);
        end if;
    end loop;

    if exists (
        select 1 from public.summaries s
        where s.summary_code is null
          and exists (select 1 from public.package_summaries ps where ps.summary_id = s.id)
    ) then
        raise exception using errcode = 'cardinality_violation', message = 'Knowledge Platform migration 068 left a Legacy Summary with Package membership.';
    end if;
    if exists (
        select 1 from public.summaries s
        where s.summary_code is not null
          and not exists (select 1 from public.package_summaries ps where ps.summary_id = s.id)
    ) then
        raise exception using errcode = 'cardinality_violation', message = 'Knowledge Platform migration 068 left a KP-native Summary without Package membership.';
    end if;
    if exists (
        select 1 from public.summaries s
        where s.summary_code is not null
          and (select count(*) from public.package_summaries ps where ps.summary_id = s.id and ps.is_summary_bank_compatibility) <> 1
    ) then
        raise exception using errcode = 'cardinality_violation', message = 'Knowledge Platform migration 068 left KP-native marker cardinality invalid.';
    end if;
    if exists (
        select 1
        from public.package_summaries ps
        join public.summaries s on s.id = ps.summary_id
        where ps.is_summary_bank_compatibility
          and (
              s.summary_code is null
              or ps.package_id is distinct from s.package_id
              or ps.legacy_slug is null
              or ps.legacy_slug is distinct from lower(btrim(ps.legacy_slug))
              or ps.legacy_slug is distinct from s.slug
          )
    ) then
        raise exception using errcode = 'check_violation', message = 'Knowledge Platform migration 068 left a marker inconsistent with its KP-native Summary mirror.';
    end if;
end
$kp_summary_bank_writer_core_postflight$;

notify pgrst, 'reload schema';
