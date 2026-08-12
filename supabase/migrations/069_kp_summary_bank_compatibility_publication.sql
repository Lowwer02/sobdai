-- 069_kp_summary_bank_compatibility_publication.sql
-- Sobdai Knowledge Platform — hybrid compatibility publish/unpublish lifecycle.
--
-- Legacy Summary rows (summary_code IS NULL) remain the existing single-Package
-- representation. They have no PackageSummary rows, no SummaryVersion rows
-- created by this boundary, and no compatibility marker. KP-native rows
-- (summary_code IS NOT NULL) publish one revision while activating every real
-- Package membership; the marker remains only the canonical compatibility
-- membership.

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
       or to_regprocedure('public.kp_enforce_summary_cleanup_fence()') is null
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
            message = 'Knowledge Platform migration 069 requires the frozen 057/058 persistence and 068 cleanup boundaries.';
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

    -- Reconcile the two frozen populations independently. Legacy rows may
    -- have no placement at all; only retained KP-native rows require the
    -- membership/marker contract.
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
            message = 'Knowledge Platform migration 069 found a Legacy Summary with Package membership.';
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
            message = 'Knowledge Platform migration 069 found a KP-native Summary without Package membership.';
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
            message = 'Knowledge Platform migration 069 found invalid KP-native marker cardinality.';
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
            message = 'Knowledge Platform migration 069 found a marker inconsistent with its KP-native Summary mirror.';
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
    v_membership_count bigint;
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

    if v_summary.summary_code is null then
        raise exception using
            errcode = 'object_not_in_prerequisite_state',
            message = 'Legacy Summary rows must use the legacy publication persistence command.';
    end if;

    -- Migration 068 owns the KP-native aggregate invariant. Reassert it
    -- before any revision or membership mutation so publication cannot repair
    -- or silently tolerate a broken marker state.
    perform public.kp_persist_assert_kp_summary_membership(p_summary_id);

    select * into v_placement
    from public.package_summaries ps
    where ps.summary_id = p_summary_id
      and ps.is_summary_bank_compatibility
    for update;
    if not found then
        raise exception using errcode = 'object_not_in_prerequisite_state', message = 'Marked compatibility PackageSummary placement is missing.';
    end if;

    if v_placement.legacy_slug is null
       or nullif(btrim(v_placement.legacy_slug), '') is null
       or v_placement.legacy_slug is distinct from lower(btrim(v_placement.legacy_slug))
       or v_placement.package_id is distinct from v_summary.package_id
       or v_placement.legacy_slug is distinct from v_summary.slug
    then
        raise exception using errcode = 'object_not_in_prerequisite_state', message = 'Compatibility publication found invalid or divergent marked-placement legacy state.';
    end if;

    select count(*) into v_membership_count
    from public.package_summaries ps
    where ps.summary_id = p_summary_id;

    select * into v_version
    from public.summary_versions sv
    where sv.id = p_version_id
      and sv.summary_id = p_summary_id
    for update;
    if not found then
        raise exception using errcode = 'no_data_found', message = 'Summary revision does not belong to the Summary.';
    end if;

    -- A compatibility unpublish keeps the published revision and pointer. A
    -- subsequent publish reactivates every retained membership; it never
    -- rewrites immutable revision provenance or source snapshots.
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

        if v_summary.is_published
           and exists (
               select 1
               from public.package_summaries ps
               where ps.summary_id = p_summary_id
                 and ps.status <> 'active'
           )
        then
            raise exception using errcode = 'object_not_in_prerequisite_state', message = 'Published KP-native Summary has a non-active Package membership.';
        end if;

        if v_summary.is_published then
            return jsonb_build_object(
                'summary_id', p_summary_id,
                'summary_version_id', p_version_id,
                'package_id', v_placement.package_id,
                'idempotent_retry', true,
                'republished', false
            );
        end if;

        if exists (
            select 1
            from public.package_summaries ps
            where ps.summary_id = p_summary_id
              and ps.status <> 'hidden'
        ) then
            raise exception using errcode = 'object_not_in_prerequisite_state', message = 'Republish requires every retained Package membership to be hidden.';
        end if;

        if not v_summary.is_published then
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
            where summary_id = p_summary_id;

            get diagnostics v_affected = row_count;
            if v_affected <> v_membership_count then
                raise exception using errcode = 'cardinality_violation', message = 'Compatibility republish did not reactivate every retained Package membership.';
            end if;

            perform public.kp_persist_assert_kp_summary_membership(p_summary_id);

            return jsonb_build_object(
                'summary_id', p_summary_id,
                'summary_version_id', p_version_id,
                'package_id', v_placement.package_id,
                'idempotent_retry', false,
                'republished', true
            );
        end if;

        raise exception using errcode = 'object_not_in_prerequisite_state', message = 'Compatibility republish found inconsistent Summary/membership publication state.';
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
    where summary_id = p_summary_id;

    get diagnostics v_affected = row_count;
    if v_affected <> v_membership_count then
        raise exception using errcode = 'cardinality_violation', message = 'Compatibility publication did not activate every retained Package membership.';
    end if;

    perform public.kp_persist_assert_kp_summary_membership(p_summary_id);

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
    v_membership_count bigint;
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

    if v_summary.summary_code is null then
        raise exception using
            errcode = 'object_not_in_prerequisite_state',
            message = 'Legacy Summary rows must use the legacy publication persistence command.';
    end if;

    perform public.kp_persist_assert_kp_summary_membership(p_summary_id);

    select * into v_placement
    from public.package_summaries ps
    where ps.summary_id = p_summary_id
      and ps.is_summary_bank_compatibility
    for update;
    if not found then
        raise exception using errcode = 'object_not_in_prerequisite_state', message = 'Marked compatibility PackageSummary placement is missing.';
    end if;

    select count(*) into v_membership_count
    from public.package_summaries ps
    where ps.summary_id = p_summary_id;
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

    if not v_summary.is_published
       and not exists (
           select 1
           from public.package_summaries ps
           where ps.summary_id = p_summary_id
             and ps.status <> 'hidden'
       )
    then
        return jsonb_build_object(
            'summary_id', p_summary_id,
            'summary_version_id', v_summary.current_published_version_id,
            'package_id', v_placement.package_id,
            'idempotent_retry', true
        );
    end if;

    if not v_summary.is_published
       or exists (
           select 1
           from public.package_summaries ps
           where ps.summary_id = p_summary_id
             and ps.status <> 'active'
       )
    then
        raise exception using errcode = 'object_not_in_prerequisite_state', message = 'Compatibility unpublish found inconsistent Summary/membership publication state.';
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
    where summary_id = p_summary_id;

    get diagnostics v_affected = row_count;
    if v_affected <> v_membership_count then
        raise exception using errcode = 'cardinality_violation', message = 'Compatibility unpublish did not hide every retained Package membership.';
    end if;

    perform public.kp_persist_assert_kp_summary_membership(p_summary_id);

    return jsonb_build_object(
        'summary_id', p_summary_id,
        'summary_version_id', v_summary.current_published_version_id,
        'package_id', v_placement.package_id,
        'idempotent_retry', false
    );
end
$function$;

comment on function public.kp_persist_unpublish_compatibility_summary(uuid,uuid) is
    'Atomic KP-native unpublish: hides every retained Package membership while preserving the marker, published revision, current pointer, and all review/publication history.';

-- ─────────────────────────────────────────────────────────────────────────────
-- Grandfathered Legacy Summary publication. These commands deliberately touch
-- only the legacy root flag. They never allocate KP identity, create revisions,
-- create PackageSummary rows, or create a compatibility marker.
-- ─────────────────────────────────────────────────────────────────────────────

create function public.kp_persist_publish_legacy_summary(
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
    v_affected bigint;
begin
    perform public.kp_persist_require_actor(p_actor_id);
    if p_summary_id is null then
        raise exception using errcode = 'invalid_parameter_value', message = 'Legacy Summary ID is required.';
    end if;

    select * into v_summary
    from public.summaries s
    where s.id = p_summary_id
    for update;
    if not found then
        raise exception using errcode = 'no_data_found', message = 'Legacy Summary does not exist.';
    end if;
    if v_summary.summary_code is not null then
        raise exception using errcode = 'object_not_in_prerequisite_state', message = 'KP-native Summary rows must use the KP publication command.';
    end if;
    if exists (
        select 1
        from public.package_summaries ps
        where ps.summary_id = p_summary_id
    ) then
        raise exception using errcode = 'cardinality_violation', message = 'Legacy Summary publication requires zero PackageSummary placements.';
    end if;

    if v_summary.is_published then
        return jsonb_build_object(
            'summary_id', p_summary_id,
            'package_id', v_summary.package_id,
            'summary_version_id', null,
            'is_published', true,
            'legacy', true,
            'idempotent_retry', true
        );
    end if;

    update public.summaries
    set is_published = true,
        updated_at = clock_timestamp()
    where id = p_summary_id
      and summary_code is null;
    get diagnostics v_affected = row_count;
    if v_affected <> 1 then
        raise exception using errcode = 'cardinality_violation', message = 'Legacy Summary publication did not update exactly one Summary.';
    end if;

    return jsonb_build_object(
        'summary_id', p_summary_id,
        'package_id', v_summary.package_id,
        'summary_version_id', null,
        'is_published', true,
        'legacy', true,
        'idempotent_retry', false
    );
end
$function$;

comment on function public.kp_persist_publish_legacy_summary(uuid,uuid) is
    'Fenced legacy-only publication: toggles summaries.is_published without creating any Knowledge Platform state.';

create function public.kp_persist_unpublish_legacy_summary(
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
    v_affected bigint;
begin
    perform public.kp_persist_require_actor(p_actor_id);
    if p_summary_id is null then
        raise exception using errcode = 'invalid_parameter_value', message = 'Legacy Summary ID is required.';
    end if;

    select * into v_summary
    from public.summaries s
    where s.id = p_summary_id
    for update;
    if not found then
        raise exception using errcode = 'no_data_found', message = 'Legacy Summary does not exist.';
    end if;
    if v_summary.summary_code is not null then
        raise exception using errcode = 'object_not_in_prerequisite_state', message = 'KP-native Summary rows must use the KP unpublish command.';
    end if;
    if exists (
        select 1
        from public.package_summaries ps
        where ps.summary_id = p_summary_id
    ) then
        raise exception using errcode = 'cardinality_violation', message = 'Legacy Summary unpublication requires zero PackageSummary placements.';
    end if;

    if not v_summary.is_published then
        return jsonb_build_object(
            'summary_id', p_summary_id,
            'package_id', v_summary.package_id,
            'summary_version_id', null,
            'is_published', false,
            'legacy', true,
            'idempotent_retry', true
        );
    end if;

    update public.summaries
    set is_published = false,
        updated_at = clock_timestamp()
    where id = p_summary_id
      and summary_code is null;
    get diagnostics v_affected = row_count;
    if v_affected <> 1 then
        raise exception using errcode = 'cardinality_violation', message = 'Legacy Summary unpublication did not update exactly one Summary.';
    end if;

    return jsonb_build_object(
        'summary_id', p_summary_id,
        'package_id', v_summary.package_id,
        'summary_version_id', null,
        'is_published', false,
        'legacy', true,
        'idempotent_retry', false
    );
end
$function$;

comment on function public.kp_persist_unpublish_legacy_summary(uuid,uuid) is
    'Fenced legacy-only unpublication: toggles summaries.is_published without creating or changing Knowledge Platform state.';

-- ─────────────────────────────────────────────────────────────────────────────
-- Extend the 058/068 SECURITY INVOKER writer fence for the 069 publication
-- commands. Existing approved writers remain listed; browser and direct
-- service-role table writes remain denied.
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
    'SECURITY INVOKER single-writer fence for the hybrid Summary aggregate. Browser and direct service-role table writes are denied; approved 057, 068, and 069 SECURITY DEFINER commands are bound to their active caller, and controlled migration operators remain allowed.';

-- Reassert the 068 Hybrid cleanup-fence allowlist for both publication
-- commands. The trigger remains SECURITY INVOKER; approved SECURITY DEFINER
-- RPCs are recognized by the active PG_CONTEXT caller and locked function
-- metadata. The session_user comparison is limited to the explicit
-- direct-operator guard.

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
        raise exception using
            errcode = 'insufficient_privilege',
            message = 'Direct Summary mutations are disabled; use the approved transactional persistence API.';
    end if;

    select session_user = current_user and (
        exists (
            select 1 from pg_catalog.pg_roles r
            where r.rolname = current_user and r.rolsuper
        ) or exists (
            select 1 from pg_catalog.pg_database d
            where d.datname = current_database()
              and pg_catalog.pg_get_userbyid(d.datdba) = current_user
        )
    ) into v_is_controlled_operator;

    if not v_is_controlled_operator then
        v_is_approved_api_owner := public.kp_summary_writer_caller_is_approved();
    end if;

    if not v_is_approved_api_owner and not v_is_controlled_operator then
        if tg_op = 'INSERT' then
            raise exception using errcode = 'insufficient_privilege', message = 'Summary INSERT is disabled; use the approved transactional persistence API.';
        end if;
        if tg_op = 'DELETE' then
            raise exception using errcode = 'insufficient_privilege', message = 'Summary DELETE is disabled; use the approved transactional persistence API.';
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
    'SECURITY INVOKER permanent Hybrid cleanup fence. Direct client writes remain blocked; explicitly allowlisted 068/069 SECURITY DEFINER persistence RPCs are authorized by their active PG_CONTEXT caller and locked function metadata, while legacy columns remain protected for all other callers.';

revoke all on function public.kp_persist_publish_compatibility_revision(uuid,uuid,uuid,jsonb)
    from public, anon, authenticated;
revoke all on function public.kp_persist_unpublish_compatibility_summary(uuid,uuid)
    from public, anon, authenticated;
revoke all on function public.kp_persist_publish_legacy_summary(uuid,uuid)
    from public, anon, authenticated;
revoke all on function public.kp_persist_unpublish_legacy_summary(uuid,uuid)
    from public, anon, authenticated;
revoke all on function public.kp_enforce_summary_writer_boundary()
    from public, anon, authenticated;

grant execute on function public.kp_persist_publish_compatibility_revision(uuid,uuid,uuid,jsonb)
    to service_role;
grant execute on function public.kp_persist_unpublish_compatibility_summary(uuid,uuid)
    to service_role;
grant execute on function public.kp_persist_publish_legacy_summary(uuid,uuid)
    to service_role;
grant execute on function public.kp_persist_unpublish_legacy_summary(uuid,uuid)
    to service_role;
grant execute on function public.kp_enforce_summary_writer_boundary()
    to service_role;

do $kp_compatibility_publication_postflight$
declare
    expected record;
    v_function oid;
    v_api_owner oid;
    v_definition text;
    v_fence_definition text;
    v_caller_definition text;
begin
    select p.proowner into v_api_owner
    from pg_catalog.pg_proc p
    where p.oid = to_regprocedure('public.kp_persist_require_actor(uuid)');

    select pg_catalog.pg_get_functiondef(
        to_regprocedure('public.kp_enforce_summary_writer_boundary()')
    ) into v_fence_definition;
    select pg_catalog.pg_get_functiondef(
        to_regprocedure('public.kp_summary_writer_caller_is_approved()')
    ) into v_caller_definition;
    if v_fence_definition is null
       or position('security invoker' in lower(v_fence_definition)) = 0
       or position('current_user in (''public'', ''anon'', ''authenticated'', ''service_role'')' in lower(v_fence_definition)) = 0
       or position('kp_summary_writer_caller_is_approved()' in lower(v_fence_definition)) = 0
       or v_caller_definition is null
       or position('kp_persist_unpublish_compatibility_summary' in lower(v_caller_definition)) = 0
       or position('kp_persist_publish_legacy_summary' in lower(v_caller_definition)) = 0
       or position('kp_persist_unpublish_legacy_summary' in lower(v_caller_definition)) = 0
    then
        raise exception using
            errcode = 'check_violation',
            message = 'Knowledge Platform migration 069 failed to extend the 058/068 writer fence for publication commands.';
    end if;

    for expected in
        select function_name, required_fragment, requires_marker
        from (values
            ('public.kp_persist_publish_compatibility_revision(uuid,uuid,uuid,jsonb)', 'republished', true),
            ('public.kp_persist_unpublish_compatibility_summary(uuid,uuid)', 'current_published_version_id', true),
            ('public.kp_persist_publish_legacy_summary(uuid,uuid)', 'summary_code is null', false),
            ('public.kp_persist_unpublish_legacy_summary(uuid,uuid)', 'summary_code is null', false)
        ) as required(function_name, required_fragment, requires_marker)
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
           or (expected.requires_marker and position('is_summary_bank_compatibility' in v_definition) = 0)
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
            message = 'Knowledge Platform migration 069 left a Legacy Summary with Package membership.';
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
            message = 'Knowledge Platform migration 069 left a KP-native Summary without Package membership.';
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
            message = 'Knowledge Platform migration 069 left KP-native marker cardinality invalid.';
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
        raise exception using
            errcode = 'check_violation',
            message = 'Knowledge Platform migration 069 left a marker inconsistent with its KP-native Summary mirror.';
    end if;
end
$kp_compatibility_publication_postflight$;

notify pgrst, 'reload schema';
