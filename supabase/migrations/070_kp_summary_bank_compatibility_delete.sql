-- 070_kp_summary_bank_compatibility_delete.sql
-- Sobdai Knowledge Platform — hybrid Summary aggregate delete/archive.
--
-- Grandfathered Legacy Summary rows (summary_code IS NULL) retain their old
-- placement-free hard-delete behavior. KP-native rows (summary_code IS NOT
-- NULL) are hard-deleted only while safely disposable; otherwise this command
-- archives the root, hides every real Package membership, and retains exactly
-- one canonical compatibility marker plus all revision/reference history.

set local lock_timeout = '5s';

do $kp_compatibility_delete_preflight$
declare
    v_api_owner oid;
    v_definition text;
begin
    if to_regclass('public.summaries') is null
       or to_regclass('public.summary_versions') is null
       or to_regclass('public.summary_aliases') is null
       or to_regclass('public.summary_reference_documents') is null
       or to_regclass('public.summary_version_reference_documents') is null
       or to_regclass('public.package_summaries') is null
       or to_regclass('public.news_summaries') is null
    then
        raise exception using
            errcode = 'check_violation',
            message = 'Knowledge Platform migration 070 requires the frozen Summary aggregate and News relationship schema.';
    end if;

    if not exists (
        select 1
        from information_schema.columns c
        where c.table_schema = 'public'
          and c.table_name = 'summaries'
          and c.column_name = 'lifecycle_status'
          and c.udt_name = 'text'
    )
       or not exists (
            select 1
            from information_schema.columns c
            where c.table_schema = 'public'
              and c.table_name = 'summaries'
              and c.column_name = 'archived_by'
              and c.udt_name = 'uuid'
       )
       or not exists (
            select 1
            from information_schema.columns c
            where c.table_schema = 'public'
              and c.table_name = 'summaries'
              and c.column_name = 'archived_at'
              and c.udt_name = 'timestamptz'
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
            message = 'Knowledge Platform migration 070 requires migration 067 marker and frozen Summary archive invariants.';
    end if;

    if to_regprocedure('public.kp_persist_require_actor(uuid)') is null
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
       or to_regprocedure('public.prevent_summary_version_history_delete()') is null
       or to_regprocedure('public.protect_summary_version_reference_document()') is null
       or to_regprocedure('public.kp_persist_assert_kp_summary_membership(uuid)') is null
       or to_regprocedure('public.kp_persist_update_compatibility_draft(uuid,uuid,text,text,text,text,text,text,uuid,text,text,text,integer,text,text,text,uuid,integer,integer,text)') is null
       or to_regprocedure('public.kp_persist_unpublish_compatibility_summary(uuid,uuid)') is null
    then
        raise exception using
            errcode = 'check_violation',
            message = 'Knowledge Platform migration 070 requires migrations 058, 068, and 069 persistence boundaries.';
    end if;

    if to_regprocedure('public.kp_persist_delete_compatibility_summary(uuid,uuid)') is not null then
        raise exception using
            errcode = 'duplicate_function',
            message = 'Knowledge Platform migration 070 found a pre-existing compatibility delete signature.';
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
            message = 'Knowledge Platform migration 070 must run as the existing persistence API owner.';
    end if;

    select pg_catalog.pg_get_functiondef(
        to_regprocedure('public.kp_persist_unpublish_compatibility_summary(uuid,uuid)')
    ) into v_definition;
    if v_definition is null
       or position('is_summary_bank_compatibility' in v_definition) = 0
       or position('current_published_version_id' in v_definition) = 0
    then
        raise exception using
            errcode = 'check_violation',
            message = 'Knowledge Platform migration 070 requires migration 069 compatibility publication semantics.';
    end if;

    if not exists (
        select 1
        from pg_catalog.pg_constraint c
        where c.conrelid = 'public.summary_versions'::regclass
          and c.conname = 'summary_versions_parent_fkey'
          and c.confrelid = 'public.summaries'::regclass
          and c.confdeltype = 'r'
    )
       or not exists (
            select 1
            from pg_catalog.pg_constraint c
            where c.conrelid = 'public.summary_aliases'::regclass
              and c.conname = 'summary_aliases_summary_fkey'
              and c.confrelid = 'public.summaries'::regclass
              and c.confdeltype = 'r'
       )
       or not exists (
            select 1
            from pg_catalog.pg_constraint c
            where c.conrelid = 'public.summary_reference_documents'::regclass
              and c.conname = 'summary_reference_documents_summary_fkey'
              and c.confrelid = 'public.summaries'::regclass
              and c.confdeltype = 'r'
       )
       or not exists (
            select 1
            from pg_catalog.pg_constraint c
            where c.conrelid = 'public.package_summaries'::regclass
              and c.conname = 'package_summaries_summary_fkey'
              and c.confrelid = 'public.summaries'::regclass
              and c.confdeltype = 'r'
       )
       or not exists (
            select 1
            from pg_catalog.pg_constraint c
            where c.conrelid = 'public.summary_version_reference_documents'::regclass
              and c.conname = 'summary_version_reference_documents_version_fkey'
              and c.confrelid = 'public.summary_versions'::regclass
              and c.confdeltype = 'c'
       )
       or not exists (
            select 1
            from pg_catalog.pg_constraint c
            where c.conrelid = 'public.news_summaries'::regclass
              and c.conname = 'news_summaries_summary_id_fkey'
              and c.confrelid = 'public.summaries'::regclass
              and c.contype = 'f'
              and c.confdeltype in ('c', 'r')
       )
    then
        raise exception using
            errcode = 'check_violation',
            message = 'Knowledge Platform migration 070 found divergent Summary dependency constraints.';
    end if;
end
$kp_compatibility_delete_preflight$;

create function public.kp_persist_delete_compatibility_summary(
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
    v_placement public.package_summaries%rowtype;
    v_current_version public.summary_versions%rowtype;
    v_marker_count bigint;
    v_version_count bigint;
    v_protected_version_count bigint;
    v_snapshot_count bigint;
    v_alias_count bigint;
    v_source_count bigint;
    v_placement_count bigint;
    v_news_link_count bigint;
    v_affected bigint;
    v_hard_delete_eligible boolean;
begin
    perform public.kp_persist_require_actor(p_actor_id);
    if p_summary_id is null then
        raise exception using
            errcode = 'invalid_parameter_value',
            message = 'Summary ID is required.';
    end if;

    -- Every compatibility writer locks the Summary first. This serializes the
    -- impact check with edit, publish, reassign, attach, and detach commands.
    select * into v_summary
    from public.summaries s
    where s.id = p_summary_id
    for update;
    if not found then
        raise exception using
            errcode = 'no_data_found',
            message = 'Summary does not exist.';
    end if;

    -- Lock all directly owned or referencing rows before computing either
    -- outcome. The parent lock also blocks a concurrent FK insert that could
    -- create a new Package or News reference after this impact snapshot.
    perform ps.package_id
    from public.package_summaries ps
    where ps.summary_id = p_summary_id
    order by ps.package_id
    for update;

    perform sv.id
    from public.summary_versions sv
    where sv.summary_id = p_summary_id
    order by sv.revision_number, sv.id
    for update;

    perform svrd.id
    from public.summary_version_reference_documents svrd
    join public.summary_versions sv on sv.id = svrd.summary_version_id
    where sv.summary_id = p_summary_id
    order by svrd.id
    for update of svrd;

    perform sa.id
    from public.summary_aliases sa
    where sa.summary_id = p_summary_id
    order by sa.id
    for update;

    perform srd.id
    from public.summary_reference_documents srd
    where srd.summary_id = p_summary_id
    order by srd.id
    for update;

    perform ns.news_id
    from public.news_summaries ns
    where ns.summary_id = p_summary_id
    order by ns.news_id
    for update;

    -- Preserve the pre-Knowledge-Platform delete behavior for grandfathered
    -- rows. A legacy row may be removed, but it may not carry any KP identity,
    -- revision, placement, alias, or source state. The live-compatible 032
    -- schema uses ON DELETE CASCADE for News links; a deployment that has
    -- independently chosen RESTRICT is also valid. The actual FK therefore
    -- governs the legacy delete: CASCADE removes only the junction row, while
    -- RESTRICT rejects the parent DELETE and rolls the command back.
    if v_summary.summary_code is null then
        if v_summary.canonical_slug is not null
           or v_summary.canonical_title is not null
           or v_summary.visibility is not null
           or v_summary.lifecycle_status is not null
           or v_summary.current_published_version_id is not null
           or v_summary.archived_by is not null
           or v_summary.archived_at is not null
           or exists (
                select 1
                from public.package_summaries ps
                where ps.summary_id = p_summary_id
           )
           or exists (
                select 1
                from public.summary_versions sv
                where sv.summary_id = p_summary_id
           )
           or exists (
                select 1
                from public.summary_aliases sa
                where sa.summary_id = p_summary_id
           )
           or exists (
                select 1
                from public.summary_reference_documents srd
                where srd.summary_id = p_summary_id
           )
           or exists (
                select 1
                from public.summary_version_reference_documents svrd
                join public.summary_versions sv on sv.id = svrd.summary_version_id
                where sv.summary_id = p_summary_id
           )
        then
            raise exception using
                errcode = 'object_not_in_prerequisite_state',
                message = 'Legacy Summary delete found unexpected Knowledge Platform state.';
        end if;

        delete from public.summaries s
        where s.id = p_summary_id
          and s.summary_code is null;
        get diagnostics v_affected = row_count;
        if v_affected <> 1 then
            raise exception using
                errcode = 'cardinality_violation',
                message = 'Legacy Summary delete did not remove exactly one Summary.';
        end if;

        return jsonb_build_object(
            'summary_id', p_summary_id,
            'outcome', 'deleted',
            'legacy', true,
            'idempotent_retry', false
        );
    end if;

    select count(*) into v_marker_count
    from public.package_summaries ps
    where ps.summary_id = p_summary_id
      and ps.is_summary_bank_compatibility;

    if v_summary.lifecycle_status is null
       or v_summary.lifecycle_status not in ('active', 'archived')
       or (v_summary.lifecycle_status = 'active'
           and (v_summary.archived_by is not null or v_summary.archived_at is not null))
       or (v_summary.lifecycle_status = 'archived'
           and (v_summary.archived_by is null or v_summary.archived_at is null))
    then
        raise exception using
            errcode = 'object_not_in_prerequisite_state',
            message = 'Compatibility delete found corrupted Summary archive state.';
    end if;

    if v_marker_count <> 1 then
        raise exception using
            errcode = 'cardinality_violation',
            message = 'KP-native Summary delete/archive requires exactly one marked compatibility membership.';
    end if;

    select * into v_placement
    from public.package_summaries ps
    where ps.summary_id = p_summary_id
      and ps.is_summary_bank_compatibility
    for update;

    if v_placement.legacy_slug is null
       or nullif(btrim(v_placement.legacy_slug), '') is null
       or v_placement.legacy_slug is distinct from lower(btrim(v_placement.legacy_slug))
       or v_placement.package_id is distinct from v_summary.package_id
       or v_placement.legacy_slug is distinct from v_summary.slug
    then
        raise exception using
            errcode = 'object_not_in_prerequisite_state',
            message = 'Compatibility delete found invalid or divergent marked-placement legacy state.';
    end if;

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
            raise exception using
                errcode = 'object_not_in_prerequisite_state',
                message = 'Compatibility delete found an invalid current published revision.';
        end if;
    elsif v_summary.is_published then
        raise exception using
            errcode = 'object_not_in_prerequisite_state',
            message = 'Published compatibility Summary has no current published revision.';
    end if;

    if v_summary.lifecycle_status = 'active' then
        if v_summary.is_published
           and (
               v_summary.current_published_version_id is null
               or exists (
                    select 1
                    from public.package_summaries ps
                    where ps.summary_id = p_summary_id
                      and ps.status <> 'active'
               )
           )
        then
            raise exception using
                errcode = 'object_not_in_prerequisite_state',
                message = 'Published KP-native Summary does not have all active Package memberships.';
        end if;

        if not v_summary.is_published
           and v_summary.current_published_version_id is not null
           and exists (
                select 1
                from public.package_summaries ps
                where ps.summary_id = p_summary_id
                  and ps.status <> 'hidden'
           )
        then
            raise exception using
                errcode = 'object_not_in_prerequisite_state',
                message = 'Unpublished KP-native Summary does not have all hidden Package memberships.';
        end if;

        if not v_summary.is_published
           and v_summary.current_published_version_id is null
           and exists (
                select 1
                from public.package_summaries ps
                where ps.summary_id = p_summary_id
                  and ps.status = 'active'
           )
        then
            raise exception using
                errcode = 'object_not_in_prerequisite_state',
                message = 'Never-published KP-native Summary has an active Package membership.';
        end if;
    else
        if v_summary.is_published
           or exists (
                select 1
                from public.package_summaries ps
                where ps.summary_id = p_summary_id
                  and ps.status <> 'hidden'
           )
        then
            raise exception using
                errcode = 'object_not_in_prerequisite_state',
                message = 'Archived KP-native Summary has divergent membership visibility.';
        end if;

        perform public.kp_persist_assert_kp_summary_membership(p_summary_id);

        return jsonb_build_object(
            'summary_id', p_summary_id,
            'outcome', 'archived',
            'idempotent_retry', true
        );
    end if;

    -- Complete impact snapshot. Live source relationships and draft/in-review
    -- source snapshots are Summary-owned and deletable. Aliases, News links,
    -- target-only Package placements, and published/retired revisions require
    -- preservation and therefore select the archive outcome.
    select count(*), count(*) filter (where sv.status in ('published', 'retired'))
    into v_version_count, v_protected_version_count
    from public.summary_versions sv
    where sv.summary_id = p_summary_id;

    if v_version_count = 0 then
        raise exception using
            errcode = 'object_not_in_prerequisite_state',
            message = 'Compatibility delete found a Summary with no revision history.';
    end if;

    select count(*) into v_snapshot_count
    from public.summary_version_reference_documents svrd
    join public.summary_versions sv on sv.id = svrd.summary_version_id
    where sv.summary_id = p_summary_id;

    select count(*) into v_alias_count
    from public.summary_aliases sa
    where sa.summary_id = p_summary_id;

    select count(*) into v_source_count
    from public.summary_reference_documents srd
    where srd.summary_id = p_summary_id;

    select count(*)
    into v_placement_count
    from public.package_summaries ps
    where ps.summary_id = p_summary_id;

    select count(*) into v_news_link_count
    from public.news_summaries ns
    where ns.summary_id = p_summary_id;

    v_hard_delete_eligible :=
        not v_summary.is_published
        and v_summary.current_published_version_id is null
        and v_protected_version_count = 0
        and v_alias_count = 0
        and v_source_count = 0
        and v_news_link_count = 0;

    if v_hard_delete_eligible then
        delete from public.summary_version_reference_documents svrd
        using public.summary_versions sv
        where svrd.summary_version_id = sv.id
          and sv.summary_id = p_summary_id;
        get diagnostics v_affected = row_count;
        if v_affected <> v_snapshot_count then
            raise exception using
                errcode = 'cardinality_violation',
                message = 'Compatibility hard delete did not remove the complete deletable revision source-snapshot set.';
        end if;

        delete from public.summary_reference_documents srd
        where srd.summary_id = p_summary_id;
        get diagnostics v_affected = row_count;
        if v_affected <> v_source_count then
            raise exception using
                errcode = 'cardinality_violation',
                message = 'Compatibility hard delete did not remove the complete live source set.';
        end if;

        delete from public.package_summaries ps
        where ps.summary_id = p_summary_id;
        get diagnostics v_affected = row_count;
        if v_affected <> v_placement_count then
            raise exception using
                errcode = 'cardinality_violation',
                message = 'Compatibility hard delete did not remove the complete Package membership set.';
        end if;

        delete from public.summary_versions sv
        where sv.summary_id = p_summary_id
          and sv.status in ('draft', 'in_review');
        get diagnostics v_affected = row_count;
        if v_affected <> v_version_count then
            raise exception using
                errcode = 'cardinality_violation',
                message = 'Compatibility hard delete did not remove the complete deletable revision set.';
        end if;

        delete from public.summaries s
        where s.id = p_summary_id;
        get diagnostics v_affected = row_count;
        if v_affected <> 1 then
            raise exception using
                errcode = 'cardinality_violation',
                message = 'Compatibility hard delete did not remove exactly one Summary.';
        end if;

        return jsonb_build_object(
            'summary_id', p_summary_id,
            'outcome', 'deleted',
            'idempotent_retry', false
        );
    end if;

    -- Archive preserves every revision, alias, source relationship, News link,
    -- and Package placement. It removes delivery while retaining the one
    -- canonical compatibility marker for the archived KP-native aggregate.
    update public.summaries
    set lifecycle_status = 'archived',
        archived_by = p_actor_id,
        archived_at = v_now,
        is_published = false,
        updated_at = v_now
    where id = p_summary_id
      and lifecycle_status = 'active';

    get diagnostics v_affected = row_count;
    if v_affected <> 1 then
        raise exception using
            errcode = 'cardinality_violation',
            message = 'Compatibility archive did not update exactly one active Summary.';
    end if;

    update public.package_summaries
    set status = 'hidden',
        activated_by = null,
        activated_at = null,
        hidden_by = case when status = 'hidden' then hidden_by else p_actor_id end,
        hidden_at = case when status = 'hidden' then hidden_at else v_now end,
        updated_at = v_now
    where summary_id = p_summary_id;

    get diagnostics v_affected = row_count;
    if v_affected <> v_placement_count then
        raise exception using
            errcode = 'cardinality_violation',
            message = 'Compatibility archive did not hide the complete retained placement set.';
    end if;

    if exists (
        select 1
        from public.package_summaries ps
        where ps.summary_id = p_summary_id
          and ps.status <> 'hidden'
    ) then
        raise exception using
            errcode = 'object_not_in_prerequisite_state',
            message = 'Compatibility archive left visible Package membership state.';
    end if;

    perform public.kp_persist_assert_kp_summary_membership(p_summary_id);

    return jsonb_build_object(
        'summary_id', p_summary_id,
        'outcome', 'archived',
        'idempotent_retry', false
    );
end
$function$;

-- ─────────────────────────────────────────────────────────────────────────────
-- Extend the 058/068/069 SECURITY INVOKER writer fence for the 070 delete
-- command. Existing approved writers remain listed; browser and direct
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
    'SECURITY INVOKER single-writer fence for the hybrid Summary aggregate. Browser and direct service-role table writes are denied; approved 057, 068, 069, and 070 SECURITY DEFINER commands are bound to their active caller, and controlled migration operators remain allowed.';

revoke all on function public.kp_enforce_summary_writer_boundary()
    from public, anon, authenticated;
grant execute on function public.kp_enforce_summary_writer_boundary()
    to service_role;

-- Reassert the permanent Hybrid cleanup fence for the delete/archive command.
-- The trigger installed by 059 remains in place; only its function body is
-- replaced so approved SECURITY DEFINER RPCs are authorized by their active
-- PG_CONTEXT caller.

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
    'SECURITY INVOKER permanent Hybrid cleanup fence. Direct client writes remain blocked; explicitly allowlisted 068/069/070 SECURITY DEFINER persistence RPCs are authorized by their active PG_CONTEXT caller and locked function metadata, while legacy columns remain protected for all other callers.';

revoke all on function public.kp_enforce_summary_cleanup_fence()
    from public, anon, authenticated;
grant execute on function public.kp_enforce_summary_cleanup_fence()
    to service_role;

comment on function public.kp_persist_delete_compatibility_summary(uuid,uuid) is
    'Atomic hybrid Summary delete command: preserves legacy hard-delete behavior; hard-deletes only safely unreferenced never-published KP-native aggregates; otherwise archives KP-native roots, hides every membership, retains the canonical marker, and preserves history.';

revoke all on function public.kp_persist_delete_compatibility_summary(uuid,uuid)
    from public, anon, authenticated;
grant execute on function public.kp_persist_delete_compatibility_summary(uuid,uuid)
    to service_role;

do $kp_compatibility_delete_postflight$
declare
    v_function oid;
    v_api_owner oid;
    v_definition text;
    v_fence_definition text;
    v_caller_definition text;
begin
    v_function := to_regprocedure('public.kp_persist_delete_compatibility_summary(uuid,uuid)');
    select p.proowner into v_api_owner
    from pg_catalog.pg_proc p
    where p.oid = to_regprocedure('public.kp_persist_require_actor(uuid)');

    select pg_catalog.pg_get_functiondef(p.oid)
    into v_definition
    from pg_catalog.pg_proc p
    where p.oid = v_function
      and p.proowner = v_api_owner
      and p.prosecdef
      and array_to_string(p.proconfig, ',') ilike '%search_path=pg_catalog, public, pg_temp%'
      and array_to_string(p.proconfig, ',') ilike '%lock_timeout=5s%';

    select pg_catalog.pg_get_functiondef(
        to_regprocedure('public.kp_enforce_summary_writer_boundary()')
    ) into v_fence_definition;
    select pg_catalog.pg_get_functiondef(
        to_regprocedure('public.kp_summary_writer_caller_is_approved()')
    ) into v_caller_definition;

    if v_fence_definition is null
       or not exists (
            select 1
            from pg_catalog.pg_proc p
            where p.oid = to_regprocedure('public.kp_enforce_summary_writer_boundary()')
              and p.prosecdef = false
       )
       or position('current_user in (''public'', ''anon'', ''authenticated'', ''service_role'')' in lower(v_fence_definition)) = 0
       or position('kp_summary_writer_caller_is_approved()' in lower(v_fence_definition)) = 0
       or v_caller_definition is null
       or position('kp_persist_delete_compatibility_summary' in lower(v_caller_definition)) = 0
    then
        raise exception using
            errcode = 'check_violation',
            message = 'Knowledge Platform migration 070 failed to extend the 058/068/069 writer fence for delete/archive.';
    end if;

    if v_function is null
       or v_definition is null
       or position('summary_code is null' in v_definition) = 0
       or position('is_summary_bank_compatibility' in v_definition) = 0
       or position('lifecycle_status = ''archived''' in v_definition) = 0
       or position('kp_persist_assert_kp_summary_membership' in v_definition) = 0
       or position('status = ''hidden''' in v_definition) = 0
       or position('delete from public.summary_versions' in v_definition) = 0
       or position('''outcome'', ''deleted''' in v_definition) = 0
       or position('''outcome'', ''archived''' in v_definition) = 0
    then
        raise exception using
            errcode = 'check_violation',
            message = 'Knowledge Platform migration 070 installed a divergent compatibility delete writer.';
    end if;

    if has_function_privilege('public', v_function, 'EXECUTE')
       or has_function_privilege('anon', v_function, 'EXECUTE')
       or has_function_privilege('authenticated', v_function, 'EXECUTE')
       or not has_function_privilege('service_role', v_function, 'EXECUTE')
    then
        raise exception using
            errcode = 'check_violation',
            message = 'Knowledge Platform migration 070 failed to preserve service-role-only compatibility delete execution.';
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
            message = 'Knowledge Platform migration 070 left a Legacy Summary with Package membership.';
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
            message = 'Knowledge Platform migration 070 left a KP-native Summary without Package membership.';
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
            message = 'Knowledge Platform migration 070 left KP-native marker cardinality invalid.';
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
            message = 'Knowledge Platform migration 070 left a marker inconsistent with its KP-native Summary mirror.';
    end if;
end
$kp_compatibility_delete_postflight$;

notify pgrst, 'reload schema';
