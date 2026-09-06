-- 089_kp_legacy_summary_publish_released_at.sql
-- Package Content Freshness V1 (post-audit remediation) — legacy Summary
-- availability stamp.
--
-- Problem
-- -------
-- Freshness means "content newly made available to users". For KP-native
-- Summaries that moment is already stamped: package_summaries.activated_at is
-- written by the publication RPCs on every publish/republish, and a CHECK
-- constraint (migration 045) guarantees it is non-null while the placement is
-- active. Legacy Summary rows (summary_code IS NULL) have NO PackageSummary
-- placements by definition (the publication RPC is fenced to zero
-- placements), and kp_persist_publish_legacy_summary stamped only
-- is_published + updated_at — so a legacy Summary created long ago and
-- published today had no availability timestamp, and freshness could not see
-- the publication.
--
-- Fix
-- ---
-- Stamp summaries.released_at = clock_timestamp() on the
-- unpublished -> published transition inside the legacy publication RPC.
-- Republish (publish after unpublish) stamps a new value, because freshness
-- means newly made available again. Edits never touch released_at; the
-- update runs only after the is_published idempotence guard, so an
-- already-published row is never re-stamped.
--
-- Safety
-- ------
-- * CREATE OR REPLACE keeps the same function identity/signature
--   (uuid, uuid), so the migration-068 writer fence keeps authorizing it:
--   the fence matches the active PG_CONTEXT caller frame, the function OID
--   (resolved from the same to_regprocedure signature), prosecdef, owner,
--   and the locked proconfig (search_path / lock_timeout) — all unchanged.
-- * The cleanup fence (kp_enforce_summary_cleanup_fence) blocks
--   released_at changes for every NON-approved caller; this RPC remains an
--   explicitly allowlisted SECURITY DEFINER writer, so the stamp is the
--   sanctioned write path (an application-side update is impossible).
-- * The body below is migration 069's kp_persist_publish_legacy_summary
--   verbatim, with exactly one added line in the UPDATE. Grants are
--   re-asserted to match 069 (service_role execute only).
--
-- Rollback: CREATE OR REPLACE the function again from migration 069's body.
-- Safe to re-run.

set local lock_timeout = '5s';

create or replace function public.kp_persist_publish_legacy_summary(
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

    -- Migration 089: released_at is the availability stamp for Package
    -- Content Freshness. It marks the moment this Summary becomes available
    -- to users; it is NOT refreshed by edits, and republishing after an
    -- unpublish stamps a new value on purpose.
    update public.summaries
    set is_published = true,
        released_at = clock_timestamp(),
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
    'Fenced legacy-only publication: toggles summaries.is_published and stamps summaries.released_at (availability for Package Content Freshness) without creating any Knowledge Platform state.';

-- Re-assert migration 069's privilege shape (CREATE OR REPLACE preserves
-- grants, but the revokes/grants below keep the surface explicit).
revoke all on function public.kp_persist_publish_legacy_summary(uuid,uuid)
    from public, anon, authenticated;
grant execute on function public.kp_persist_publish_legacy_summary(uuid,uuid)
    to service_role;
