-- 060_kp_remove_legacy_summary_authority.sql
-- Sobdai Knowledge Platform — guarded legacy Summary-authority retirement.
--
-- Migration-number audit
-- ----------------------
-- Knowledge Platform migration 059 is the highest deployed KP migration.
-- Repository migrations 062+ are unrelated product migrations and do not
-- consume the frozen Knowledge Platform sequence. This file therefore
-- implements frozen responsibility 060 only.
--
-- Purpose
-- -------
-- Prepare the final removal of Package ownership and mutable root
-- content/publication authority from public.summaries. The read projections
-- are made target-only while retaining their existing output contracts. The
-- physical retirement is exposed only through an explicit, service-role-only,
-- fail-closed executor. Nothing in this migration invokes that executor.
--
-- Safety boundary
-- ---------------
-- * No Summary, SummaryVersion, PackageSummary, ReferenceDocument, Alias,
--   Package, News, or NewsSummary rows are inserted, updated, or deleted.
-- * No production cleanup runs during migration deployment.
-- * The executor requires migration 059 evidence, a maintenance/editorial
--   freeze, backup/restore rehearsal evidence, target-only approval, an
--   operator attestation, and an explicit destructive confirmation.
-- * The executor drops only named legacy constraints/policies/columns and
--   never uses CASCADE or a data-row DML statement.
-- * The optional free-text document column is retained unless independently
--   approved by the operator. It is never inferred to be safe to remove.
--
-- Rollback
-- --------
-- Before the executor is called, leave this dormant surface installed. After
-- destructive execution there is no down migration; use a forward repair or
-- restore the verified backup, as required by the frozen design.

set local lock_timeout = '5s';

-- ─────────────────────────────────────────────────────────────────────────────
-- Fail-closed installation preflight. This is catalog-only and does not
-- execute cleanup or advance any migration ledger state.
-- ─────────────────────────────────────────────────────────────────────────────

do $kp_remove_legacy_authority_preflight$
declare
    expected record;
begin
    for expected in
        select relation_name
        from (values
            ('public.summaries'),
            ('public.news_summaries'),
            ('public.package_summaries'),
            ('public.summary_versions'),
            ('public.summary_aliases'),
            ('public.summary_reference_documents'),
            ('public.summary_version_reference_documents'),
            ('kp_migration.migration_runs'),
            ('kp_migration.summary_ledger'),
            ('kp_migration.batch_progress')
        ) as required(relation_name)
    loop
        if to_regclass(expected.relation_name) is null then
            raise exception using
                errcode = 'check_violation',
                message = format(
                    'Knowledge Platform migration 060 prerequisite is missing: %s.',
                    expected.relation_name
                );
        end if;
    end loop;

    for expected in
        select column_name
        from (values
            ('package_id'),
            ('title'),
            ('slug'),
            ('content_md'),
            ('read_time_minutes'),
            ('sort_order'),
            ('display_order'),
            ('released_at'),
            ('is_published')
        ) as required(column_name)
    loop
        if not exists (
            select 1
            from information_schema.columns c
            where c.table_schema = 'public'
              and c.table_name = 'summaries'
              and c.column_name = expected.column_name
        ) then
            raise exception using
                errcode = 'check_violation',
                message = format(
                    'Knowledge Platform migration 060 prerequisite is missing: public.summaries.%I.',
                    expected.column_name
                );
        end if;
    end loop;

    for expected in
        select function_name
        from (values
            ('kp_migration.reconcile_cleanup_readiness(uuid)'),
            ('kp_migration.assert_cleanup_readiness(uuid,boolean,boolean,boolean,boolean,text)'),
            ('public.kp_enforce_summary_cleanup_fence()'),
            ('public.kp_enforce_summary_writer_boundary()'),
            ('public.kp_read_summary_route(text,text)')
        ) as required(function_name)
    loop
        if to_regprocedure(expected.function_name) is null then
            raise exception using
                errcode = 'check_violation',
                message = format(
                    'Knowledge Platform migration 060 prerequisite function is missing: %s.',
                    expected.function_name
                );
        end if;
    end loop;

    for expected in
        select relation_name
        from (values
            ('kp_read_admin_library'),
            ('kp_read_summary_picker'),
            ('kp_read_package_summaries'),
            ('kp_read_news_summaries'),
            ('kp_read_recommendation_store')
        ) as required(relation_name)
    loop
        if not exists (
            select 1
            from pg_catalog.pg_class c
            join pg_catalog.pg_namespace n on n.oid = c.relnamespace
            where n.nspname = 'public'
              and c.relname = expected.relation_name
              and c.relkind = 'v'
        ) then
            raise exception using
                errcode = 'check_violation',
                message = format(
                    'Knowledge Platform migration 060 prerequisite view is missing: public.%I.',
                    expected.relation_name
                );
        end if;
    end loop;

    if not exists (
        select 1
        from pg_catalog.pg_trigger t
        where t.tgrelid = 'public.summaries'::regclass
          and t.tgname = 'kp_cleanup_legacy_summary_write_fence'
          and not t.tgisinternal
    ) then
        raise exception using
            errcode = 'check_violation',
            message = 'Knowledge Platform migration 060 requires the 059 cleanup write fence trigger.';
    end if;
end
$kp_remove_legacy_authority_preflight$;

-- ─────────────────────────────────────────────────────────────────────────────
-- Target-only read projections. Migration 055 made the target identity
-- complete, so replacing the legacy fallback is contract-preserving. These
-- definitions are installed now so the explicitly-invoked column retirement
-- cannot be blocked by projection dependencies.
-- ─────────────────────────────────────────────────────────────────────────────

create or replace view public.kp_read_admin_library
with (security_invoker = true)
as
select
    s.id as summary_id,
    s.summary_code,
    s.canonical_slug,
    s.canonical_title,
    s.subject,
    s.topic,
    s.law,
    s.visibility,
    s.lifecycle_status,
    (
        s.lifecycle_status = 'active'
        and s.current_published_version_id is not null
        and exists (
            select 1
            from public.summary_versions svp
            where svp.id = s.current_published_version_id
              and svp.summary_id = s.id
              and svp.status = 'published'
        )
    ) as legacy_is_published,
    s.current_published_version_id,
    s.created_at,
    s.updated_at,
    sv.revision_number as current_revision_number,
    sv.status as current_revision_status,
    sv.title_snapshot as current_revision_title,
    sv.subject_snapshot as current_revision_subject,
    sv.topic_snapshot as current_revision_topic,
    sv.law_snapshot as current_revision_law,
    sv.read_time_minutes as current_revision_read_time_minutes,
    sv.published_at as current_revision_published_at,
    sv.content_checksum as current_revision_content_checksum,
    (
        select count(*)::bigint
        from public.package_summaries ps
        where ps.summary_id = s.id
    ) as package_placement_count,
    (
        select count(*)::bigint
        from public.summary_reference_documents sr
        where sr.summary_id = s.id
    ) as source_document_count
from public.summaries s
left join public.summary_versions sv
  on sv.summary_id = s.id
 and sv.id = s.current_published_version_id;

comment on view public.kp_read_admin_library is
    'Read-only target-authority Summary Library projection. legacy_is_published is derived from lifecycle status and the published SummaryVersion pointer for compatibility only.';

create or replace view public.kp_read_summary_picker
with (security_invoker = true)
as
select
    s.id as summary_id,
    s.summary_code,
    s.canonical_slug,
    s.canonical_title,
    s.subject,
    s.topic,
    s.law,
    s.visibility,
    s.lifecycle_status,
    (
        s.lifecycle_status = 'active'
        and s.current_published_version_id is not null
        and exists (
            select 1
            from public.summary_versions svp
            where svp.id = s.current_published_version_id
              and svp.summary_id = s.id
              and svp.status = 'published'
        )
    ) as legacy_is_published,
    s.current_published_version_id,
    (
        s.lifecycle_status = 'active'
        and s.current_published_version_id is not null
        and exists (
            select 1
            from public.summary_versions sv
            where sv.id = s.current_published_version_id
              and sv.summary_id = s.id
              and sv.status = 'published'
        )
    ) as published_revision_available,
    (
        select count(*)::bigint
        from public.package_summaries ps
        where ps.summary_id = s.id
          and ps.status = 'active'
    ) as active_package_placement_count
from public.summaries s;

comment on view public.kp_read_summary_picker is
    'Read-only target-authority Summary Picker projection. It contains no Markdown and does not attach a Summary or change Package state.';

create or replace view public.kp_read_package_summaries
with (security_invoker = true)
as
select
    p.id as package_id,
    p.slug as package_slug,
    p.name as package_name,
    p.is_published as package_is_published,
    ps.summary_id,
    ps.status as placement_status,
    ps.version_policy,
    ps.pinned_summary_version_id,
    ps.sort_order,
    ps.display_order,
    ps.released_at,
    ps.navigation_label,
    ps.legacy_slug,
    s.summary_code,
    s.canonical_slug,
    s.canonical_title,
    s.subject,
    s.topic,
    s.law,
    s.visibility,
    s.lifecycle_status,
    sv.id as summary_version_id,
    sv.revision_number,
    sv.status as version_status,
    sv.title_snapshot,
    sv.subject_snapshot,
    sv.topic_snapshot,
    sv.law_snapshot,
    sv.content_md,
    sv.content_checksum,
    sv.read_time_minutes,
    sv.published_at as version_published_at
from public.package_summaries ps
join public.packages p
  on p.id = ps.package_id
join public.summaries s
  on s.id = ps.summary_id
join lateral (
    select selected.*
    from public.summary_versions selected
    where selected.summary_id = s.id
      and selected.status = 'published'
      and (
          (ps.version_policy = 'latest_published'
           and selected.id = s.current_published_version_id)
          or
          (ps.version_policy = 'pinned'
           and selected.id = ps.pinned_summary_version_id)
      )
    limit 1
) sv on true
where ps.status = 'active'
  and p.is_published = true
  and s.lifecycle_status = 'active'
  and public.kp_can_read_package_summary(ps.package_id, ps.summary_id)
  and public.kp_can_read_summary_version(ps.summary_id, sv.id);

comment on view public.kp_read_package_summaries is
    'Security-aware target-authority PackageSummary composition. Markdown is returned only for an active placement, published Package, active Summary, selected published revision, and the frozen visibility/entitlement predicates.';

create or replace view public.kp_read_news_summaries
with (security_invoker = true)
as
select
    n.id as news_id,
    n.slug as news_slug,
    n.title as news_title,
    ns.sort_order as news_summary_sort_order,
    s.id as summary_id,
    s.summary_code,
    s.canonical_slug,
    s.canonical_title,
    s.subject,
    s.topic,
    s.law,
    s.visibility,
    s.lifecycle_status,
    s.current_published_version_id,
    (
        s.lifecycle_status = 'active'
        and s.current_published_version_id is not null
        and exists (
            select 1
            from public.summary_versions sv
            where sv.id = s.current_published_version_id
              and sv.summary_id = s.id
              and sv.status = 'published'
        )
    ) as published_revision_available,
    placement.package_id,
    placement.package_slug,
    placement.legacy_slug
from public.news_summaries ns
join public.news n
  on n.id = ns.news_id
join public.summaries s
  on s.id = ns.summary_id
left join lateral (
    select
        ps.package_id,
        p.slug as package_slug,
        ps.legacy_slug
    from public.package_summaries ps
    join public.packages p
      on p.id = ps.package_id
    where ps.summary_id = s.id
      and ps.status = 'active'
      and p.is_published = true
    order by p.slug, ps.package_id
    limit 1
) placement on true
where n.status = 'published'
  and s.lifecycle_status = 'active'
  and s.visibility = 'public_indexable';

comment on view public.kp_read_news_summaries is
    'Read-only published-News related target-authority Summary projection. It returns metadata and a deterministic package context, never Markdown.';

create or replace view public.kp_read_recommendation_store
with (security_invoker = true)
as
select
    s.id as content_id,
    'summary'::text as content_type,
    s.canonical_title as title,
    s.canonical_slug,
    eligible.package_id as eligible_package_id,
    s.subject,
    s.topic,
    null::text as difficulty,
    s.current_published_version_id as published_version_id
from public.summaries s
left join lateral (
    select ps.package_id
    from public.package_summaries ps
    join public.packages p
      on p.id = ps.package_id
    where ps.summary_id = s.id
      and ps.status = 'active'
      and p.is_published = true
      and s.visibility = 'public_indexable'
    order by p.slug, ps.package_id
    limit 1
) eligible on true
where s.lifecycle_status = 'active'
  and s.visibility = 'public_indexable'
  and s.current_published_version_id is not null
  and exists (
      select 1
      from public.summary_versions sv
      where sv.id = s.current_published_version_id
        and sv.summary_id = s.id
        and sv.status = 'published'
  );

comment on view public.kp_read_recommendation_store is
    'Read-only target-authority Summary ContentStore adapter. It exposes stable metadata only, never Markdown or entitlement state.';

-- The resolver keeps its canonical/alias/Package-local legacy route contract,
-- but publication and title authority now come only from the target Summary
-- root and SummaryVersion tables. package_summaries.legacy_slug is retained
-- as a compatibility route key until the later compatibility-retirement step.
create or replace function public.kp_read_summary_route(
    p_slug text,
    p_package_slug text default null
)
returns table (
    summary_id uuid,
    summary_code text,
    canonical_slug text,
    canonical_title text,
    subject text,
    topic text,
    law text,
    visibility text,
    summary_lifecycle_status text,
    resolved_by text,
    package_id uuid,
    package_slug text,
    package_name text,
    placement_status text,
    version_policy text,
    pinned_summary_version_id uuid,
    sort_order integer,
    display_order integer,
    navigation_label text,
    legacy_slug text,
    summary_version_id uuid,
    revision_number integer,
    version_status text,
    version_title text,
    version_subject text,
    version_topic text,
    version_law text,
    content_md text,
    content_checksum text,
    read_time_minutes integer,
    version_published_at timestamptz,
    source_citations jsonb
)
language sql
stable
security definer
set search_path = pg_catalog, public, pg_temp
as $function$
with resolved as (
    select
        s.id as summary_id,
        'canonical'::text as resolved_by,
        1 as resolution_priority
    from public.summaries s
    where p_package_slug is null
      and s.canonical_slug = lower(btrim(p_slug))

    union all

    select
        a.summary_id,
        'alias'::text as resolved_by,
        2 as resolution_priority
    from public.summary_aliases a
    where p_package_slug is null
      and a.slug = lower(btrim(p_slug))
      and a.status = 'active'

    union all

    select
        ps.summary_id,
        'legacy'::text as resolved_by,
        1 as resolution_priority
    from public.package_summaries ps
    where p_package_slug is not null
      and ps.legacy_slug = lower(btrim(p_slug))
      and ps.status = 'active'
),
deduplicated as (
    select distinct on (r.summary_id)
        r.summary_id,
        r.resolved_by
    from resolved r
    order by r.summary_id, r.resolution_priority, r.resolved_by
)
select
    s.id,
    s.summary_code,
    s.canonical_slug,
    s.canonical_title,
    s.subject,
    s.topic,
    s.law,
    s.visibility,
    s.lifecycle_status,
    r.resolved_by,
    p.id,
    p.slug,
    p.name,
    ps.status,
    ps.version_policy,
    ps.pinned_summary_version_id,
    ps.sort_order,
    ps.display_order,
    ps.navigation_label,
    ps.legacy_slug,
    sv.id,
    sv.revision_number,
    sv.status,
    sv.title_snapshot,
    sv.subject_snapshot,
    sv.topic_snapshot,
    sv.law_snapshot,
    sv.content_md,
    sv.content_checksum,
    sv.read_time_minutes,
    sv.published_at,
    coalesce(
        (
            select jsonb_agg(
                jsonb_build_object(
                    'reference_document_id', d.id,
                    'document_code', d.document_code,
                    'title', d.canonical_title,
                    'reference_document_version_id', v.id,
                    'version_label', v.version_label,
                    'source_url', v.source_url,
                    'role', rel.role,
                    'coverage_note', rel.coverage_note,
                    'sort_order', rel.sort_order
                )
                order by rel.sort_order, d.document_code, v.version_label
            )
            from public.summary_version_reference_documents rel
            join public.reference_documents d
              on d.id = rel.reference_document_id
            join public.reference_document_versions v
              on v.id = rel.reference_document_version_id
             and v.reference_document_id = rel.reference_document_id
            where rel.summary_version_id = sv.id
              and v.status in ('verified', 'superseded')
              and d.lifecycle_status <> 'archived'
        ),
        '[]'::jsonb
    )
from deduplicated r
join public.summaries s
  on s.id = r.summary_id
join public.package_summaries ps
  on ps.summary_id = s.id
 and ps.status = 'active'
join public.packages p
  on p.id = ps.package_id
join lateral (
    select selected.*
    from public.summary_versions selected
    where selected.summary_id = s.id
      and selected.status = 'published'
      and (
          (ps.version_policy = 'latest_published'
           and selected.id = s.current_published_version_id)
          or
          (ps.version_policy = 'pinned'
           and selected.id = ps.pinned_summary_version_id)
      )
    limit 1
) sv on true
where p.is_published = true
  and s.lifecycle_status = 'active'
  and (
      p_package_slug is null
      or (
          p.slug = btrim(p_package_slug)
          and ps.legacy_slug = lower(btrim(p_slug))
      )
  )
  and public.kp_can_read_package_summary(ps.package_id, ps.summary_id)
  and public.kp_can_read_summary_version(ps.summary_id, sv.id)
order by p.slug, ps.display_order, ps.sort_order, p.id;
$function$;

comment on function public.kp_read_summary_route(text, text) is
    'Security-aware target-authority canonical, active-alias, and Package-scoped legacy Summary resolver. Locked search_path; returns Markdown only after explicit placement, publication, visibility, entitlement, and verified-citation gates.';

-- ─────────────────────────────────────────────────────────────────────────────
-- Read-only retirement reconciliation. It reports both the pre-cleanup
-- evidence surface and the post-cleanup completion state without changing
-- rows, constraints, policies, or ledger state.
-- ─────────────────────────────────────────────────────────────────────────────

create or replace function kp_migration.reconcile_legacy_summary_authority(
    p_migration_run_id uuid
)
returns table (
    migration_run_present boolean,
    cleanup_gate_clear boolean,
    required_legacy_column_count bigint,
    document_column_present boolean,
    legacy_policy_count bigint,
    summary_package_cascade_fk_count bigint,
    news_summary_cascade_fk_count bigint,
    cleanup_write_fence_present boolean,
    target_read_surface_ready boolean,
    unknown_legacy_catalog_dependency_count bigint,
    retirement_prerequisites_clear boolean,
    retirement_complete boolean,
    mismatch_total bigint
)
language plpgsql
stable
security definer
set search_path = pg_catalog, public, kp_migration, pg_temp
set lock_timeout = '5s'
as $function$
declare
    v_migration_run_present boolean := false;
    v_cleanup_gate_clear boolean := false;
    v_required_legacy_column_count bigint := 0;
    v_document_column_present boolean := false;
    v_legacy_policy_count bigint := 0;
    v_summary_package_cascade_fk_count bigint := 0;
    v_news_summary_cascade_fk_count bigint := 0;
    v_cleanup_write_fence_present boolean := false;
    v_target_read_surface_ready boolean := false;
    v_unknown_legacy_catalog_dependency_count bigint := 0;
    v_retirement_prerequisites_clear boolean := false;
    v_retirement_complete boolean := false;
    v_mismatch_total bigint := 0;
begin
    if p_migration_run_id is not null then
        begin
            select r.migration_run_present, r.cleanup_prerequisites_clear
            into v_migration_run_present, v_cleanup_gate_clear
            from kp_migration.reconcile_cleanup_readiness(p_migration_run_id) r;
        exception
            when others then
                v_migration_run_present := false;
                v_cleanup_gate_clear := false;
        end;
    end if;

    select count(*)::bigint
    into v_required_legacy_column_count
    from pg_catalog.pg_attribute a
    where a.attrelid = 'public.summaries'::regclass
      and not a.attisdropped
      and a.attname = any (array[
          'package_id', 'title', 'slug', 'content_md', 'read_time_minutes',
          'sort_order', 'display_order', 'released_at', 'is_published'
      ]::name[]);

    select exists (
        select 1
        from pg_catalog.pg_attribute a
        where a.attrelid = 'public.summaries'::regclass
          and not a.attisdropped
          and a.attname = 'document'
    )
    into v_document_column_present;

    select count(*)::bigint
    into v_legacy_policy_count
    from pg_catalog.pg_policies p
    where p.schemaname = 'public'
      and p.tablename = 'summaries'
      and (
          p.policyname in (
              'Published summaries viewable by everyone.',
              'Admins can manage summaries.',
              'Content managers can manage summaries.'
          )
          or
          coalesce(p.qual, '') ilike '%is_published%'
          or coalesce(p.qual, '') ilike '%package_id%'
          or coalesce(p.qual, '') ilike '%content_md%'
          or coalesce(p.with_check, '') ilike '%is_published%'
          or coalesce(p.with_check, '') ilike '%package_id%'
          or coalesce(p.with_check, '') ilike '%content_md%'
          or coalesce(p.qual, '') ilike '%document%'
          or coalesce(p.with_check, '') ilike '%document%'
      );

    select count(*)::bigint
    into v_summary_package_cascade_fk_count
    from pg_catalog.pg_constraint c
    where c.conrelid = 'public.summaries'::regclass
      and c.contype = 'f'
      and c.confrelid = 'public.packages'::regclass
      and pg_catalog.pg_get_constraintdef(c.oid) ilike '%on delete cascade%';

    select count(*)::bigint
    into v_news_summary_cascade_fk_count
    from pg_catalog.pg_constraint c
    where c.conrelid = 'public.news_summaries'::regclass
      and c.contype = 'f'
      and c.confrelid = 'public.summaries'::regclass
      and pg_catalog.pg_get_constraintdef(c.oid) ilike '%on delete cascade%';

    select exists (
        select 1
        from pg_catalog.pg_trigger t
        where t.tgrelid = 'public.summaries'::regclass
          and t.tgname = 'kp_cleanup_legacy_summary_write_fence'
          and not t.tgisinternal
    )
    into v_cleanup_write_fence_present;

    select
        exists (
            select 1
            from pg_catalog.pg_class c
            join pg_catalog.pg_namespace n on n.oid = c.relnamespace
            where n.nspname = 'public'
              and c.relname in (
                  'kp_read_admin_library',
                  'kp_read_summary_picker',
                  'kp_read_package_summaries',
                  'kp_read_news_summaries',
                  'kp_read_recommendation_store'
              )
            group by n.nspname
            having count(*) = 5
        )
        and to_regprocedure('public.kp_read_summary_route(text,text)') is not null
        and not exists (
            select 1
            from pg_catalog.pg_views v
            where v.schemaname = 'public'
              and v.viewname in (
                  'kp_read_admin_library',
                  'kp_read_summary_picker',
                  'kp_read_package_summaries',
                  'kp_read_news_summaries',
                  'kp_read_recommendation_store'
              )
              and (
                  v.definition ilike '%s.title%'
                  or v.definition ilike '%s.is_published%'
              )
        )
        and not exists (
            select 1
            from pg_catalog.pg_proc p
            where p.oid = to_regprocedure('public.kp_read_summary_route(text,text)')
              and (
                  pg_catalog.pg_get_functiondef(p.oid) ilike '%s.title%'
                  or pg_catalog.pg_get_functiondef(p.oid) ilike '%s.is_published%'
              )
        )
    into v_target_read_surface_ready;

    select count(*)::bigint
    into v_unknown_legacy_catalog_dependency_count
    from (
        select c.oid
        from pg_catalog.pg_depend d
        join pg_catalog.pg_attribute a
          on a.attrelid = 'public.summaries'::regclass
         and a.attnum = d.refobjsubid
         and not a.attisdropped
         and a.attname = any (array[
             'package_id', 'title', 'slug', 'content_md', 'read_time_minutes',
             'sort_order', 'display_order', 'released_at', 'is_published',
             'document'
         ]::name[])
        join pg_catalog.pg_rewrite rw on rw.oid = d.objid
        join pg_catalog.pg_class c on c.oid = rw.ev_class
        join pg_catalog.pg_namespace n on n.oid = c.relnamespace
        where d.refobjid = 'public.summaries'::regclass
          and d.deptype in ('n', 'a')
          and d.classid = 'pg_catalog.pg_rewrite'::regclass
          and c.relkind = 'v'
          and n.nspname = 'public'
          and c.relname not like 'kp_read_%'
        union all
        select p.oid
        from pg_catalog.pg_depend d
        join pg_catalog.pg_attribute a
          on a.attrelid = 'public.summaries'::regclass
         and a.attnum = d.refobjsubid
         and not a.attisdropped
         and a.attname = any (array[
             'package_id', 'title', 'slug', 'content_md', 'read_time_minutes',
             'sort_order', 'display_order', 'released_at', 'is_published',
             'document'
         ]::name[])
        join pg_catalog.pg_proc p on p.oid = d.objid
        join pg_catalog.pg_namespace n on n.oid = p.pronamespace
        where d.refobjid = 'public.summaries'::regclass
          and d.deptype in ('n', 'a')
          and d.classid = 'pg_catalog.pg_proc'::regclass
          and (
              n.nspname = 'kp_migration'
              or (
                  n.nspname = 'public'
                  and (
                      p.proname like 'kp_read_%'
                      or p.proname like 'kp_persist_%'
                      or p.proname like 'kp_reconcile_%'
                      or p.proname = 'kp_enforce_summary_writer_boundary'
                      or p.proname = 'kp_enforce_summary_cleanup_fence'
                  )
              )
          ) is not true
    ) dependencies;

    v_retirement_prerequisites_clear :=
        v_cleanup_gate_clear
        and v_target_read_surface_ready
        and v_unknown_legacy_catalog_dependency_count = 0;

    v_retirement_complete :=
        v_required_legacy_column_count = 0
        and v_legacy_policy_count = 0
        and v_summary_package_cascade_fk_count = 0
        and v_news_summary_cascade_fk_count = 0
        and not v_cleanup_write_fence_present;

    v_mismatch_total :=
        v_unknown_legacy_catalog_dependency_count
        + case when v_target_read_surface_ready then 0 else 1 end
        + case when v_cleanup_gate_clear then 0 else 1 end
        + v_required_legacy_column_count
        + v_legacy_policy_count
        + v_summary_package_cascade_fk_count
        + v_news_summary_cascade_fk_count
        + case when v_cleanup_write_fence_present then 1 else 0 end;

    return query
    select
        v_migration_run_present,
        v_cleanup_gate_clear,
        v_required_legacy_column_count,
        v_document_column_present,
        v_legacy_policy_count,
        v_summary_package_cascade_fk_count,
        v_news_summary_cascade_fk_count,
        v_cleanup_write_fence_present,
        v_target_read_surface_ready,
        v_unknown_legacy_catalog_dependency_count,
        v_retirement_prerequisites_clear,
        v_retirement_complete,
        v_mismatch_total;
end
$function$;

comment on function kp_migration.reconcile_legacy_summary_authority(uuid) is
    'SECURITY DEFINER, stable, service-role-only catalog reconciliation for migration 060. It never mutates domain rows or executes retirement DDL.';

-- ─────────────────────────────────────────────────────────────────────────────
-- Explicit fail-closed approval boundary. The executor below cannot be
-- reached safely without all evidence and the separate destructive-confirmation
-- flag. Migration deployment never calls either function.
-- ─────────────────────────────────────────────────────────────────────────────

create or replace function kp_migration.assert_legacy_summary_authority_removal(
    p_migration_run_id uuid,
    p_target_authority_enabled boolean,
    p_rollback_window_closed boolean,
    p_target_only_approved boolean,
    p_legacy_dependency_confirmed boolean,
    p_backup_restore_verified boolean,
    p_editorial_freeze_confirmed boolean,
    p_document_removal_approved boolean,
    p_operator_attestation text,
    p_confirm_destructive boolean
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public, kp_migration, pg_temp
set lock_timeout = '5s'
as $function$
declare
    v_report jsonb;
    v_prerequisites_clear boolean;
begin
    if p_migration_run_id is null
       or p_target_authority_enabled is not true
       or p_rollback_window_closed is not true
       or p_target_only_approved is not true
       or p_legacy_dependency_confirmed is not true
       or p_backup_restore_verified is not true
       or p_editorial_freeze_confirmed is not true
       or p_confirm_destructive is not true
       or p_operator_attestation is null
       or btrim(p_operator_attestation) = ''
    then
        raise exception using
            errcode = 'check_violation',
            message = 'Knowledge Platform migration 060 destructive retirement approval is incomplete.',
            hint = 'Do not execute cleanup. Obtain all 059 evidence, backup/restore, editorial-freeze, target-only, and explicit operator attestations first.';
    end if;

    perform kp_migration.assert_cleanup_readiness(
        p_migration_run_id,
        p_target_authority_enabled,
        p_rollback_window_closed,
        p_target_only_approved,
        p_legacy_dependency_confirmed,
        p_operator_attestation
    );

    select to_jsonb(r), r.retirement_prerequisites_clear
    into v_report, v_prerequisites_clear
    from kp_migration.reconcile_legacy_summary_authority(p_migration_run_id) r;

    if not coalesce(v_prerequisites_clear, false) then
        raise exception using
            errcode = 'check_violation',
            message = 'Knowledge Platform migration 060 retirement prerequisites are not satisfied.',
            detail = coalesce(v_report, '{}'::jsonb)::text,
            hint = 'Keep the retirement executor dormant and reconcile the 059 gate, target read surface, and catalog dependencies.';
    end if;

    -- p_document_removal_approved is deliberately accepted only as explicit
    -- operator evidence. A false value always retains summaries.document;
    -- there is no implicit source-migration inference in this migration.
end
$function$;

comment on function kp_migration.assert_legacy_summary_authority_removal(uuid, boolean, boolean, boolean, boolean, boolean, boolean, boolean, text, boolean) is
    'Fail-closed migration 060 approval gate. It validates 059 evidence plus backup/restore and editorial-freeze attestations; it performs no cleanup itself.';

-- ─────────────────────────────────────────────────────────────────────────────
-- Explicit forward-only executor. This function is installed dormant. It is
-- the only object in migration 060 that can remove legacy authority, and it
-- performs metadata-only DDL after the approval gate succeeds.
-- ─────────────────────────────────────────────────────────────────────────────

create or replace function kp_migration.execute_legacy_summary_authority_removal(
    p_migration_run_id uuid,
    p_target_authority_enabled boolean,
    p_rollback_window_closed boolean,
    p_target_only_approved boolean,
    p_legacy_dependency_confirmed boolean,
    p_backup_restore_verified boolean,
    p_editorial_freeze_confirmed boolean,
    p_document_removal_approved boolean,
    p_operator_attestation text,
    p_confirm_destructive boolean
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, kp_migration, pg_temp
set lock_timeout = '5s'
as $function$
declare
    v_constraint_name text;
    v_index_name text;
    v_column_name text;
    v_legacy_columns_remaining bigint;
    v_legacy_policies_remaining bigint;
    v_summary_package_cascade_fk_remaining bigint;
    v_news_summary_cascade_fk_remaining bigint;
    v_cleanup_fence_remaining boolean;
    v_document_removed boolean := false;
begin
    perform kp_migration.assert_legacy_summary_authority_removal(
        p_migration_run_id,
        p_target_authority_enabled,
        p_rollback_window_closed,
        p_target_only_approved,
        p_legacy_dependency_confirmed,
        p_backup_restore_verified,
        p_editorial_freeze_confirmed,
        p_document_removal_approved,
        p_operator_attestation,
        p_confirm_destructive
    );

    -- Remove the 059 trigger before removing the fields it protects. The
    -- trigger is not a target-authority control and is recreated only by a
    -- separately approved forward migration if cleanup is aborted beforehand.
    execute 'drop trigger if exists kp_cleanup_legacy_summary_write_fence on public.summaries';
    execute 'drop function if exists public.kp_enforce_summary_cleanup_fence()';

    -- Replace the legacy Summary RLS surface with target-root visibility and
    -- staff-preview policies. No write policy is introduced; migration 058's
    -- privilege revocation and writer boundary remain in force.
    execute 'drop policy if exists "Published summaries viewable by everyone." on public.summaries';
    execute 'drop policy if exists "Admins can manage summaries." on public.summaries';
    execute 'drop policy if exists "Content managers can manage summaries." on public.summaries';
    execute 'drop policy if exists kp_target_summary_public_read on public.summaries';
    execute 'drop policy if exists kp_target_summary_staff_read on public.summaries';
    execute $policy$
        create policy kp_target_summary_public_read
            on public.summaries
            for select
            to anon, authenticated
            using (
                visibility = 'public_indexable'
                and lifecycle_status = 'active'
                and current_published_version_id is not null
                and exists (
                    select 1
                    from public.summary_versions sv
                    where sv.id = current_published_version_id
                      and sv.summary_id = summaries.id
                      and sv.status = 'published'
                )
            )
    $policy$;
    execute $policy$
        create policy kp_target_summary_staff_read
            on public.summaries
            for select
            to authenticated
            using (public.kp_is_staff())
    $policy$;

    -- Remove the Package-owned legacy cascade. PackageSummary remains the
    -- placement-owned cascade; Summary itself is not a Package child anymore.
    for v_constraint_name in
        select c.conname
        from pg_catalog.pg_constraint c
        where c.conrelid = 'public.summaries'::regclass
          and c.contype = 'f'
          and c.confrelid = 'public.packages'::regclass
          and pg_catalog.pg_get_constraintdef(c.oid) ilike '%on delete cascade%'
    loop
        execute format(
            'alter table public.summaries drop constraint %I',
            v_constraint_name
        );
    end loop;

    -- The old Package/slug uniqueness is obsolete after canonical Summary
    -- identity and PackageSummary placement become authoritative.
    for v_constraint_name in
        select c.conname
        from pg_catalog.pg_constraint c
        where c.conrelid = 'public.summaries'::regclass
          and c.contype = 'u'
          and pg_catalog.pg_get_constraintdef(c.oid) ilike '%package_id%'
          and pg_catalog.pg_get_constraintdef(c.oid) ilike '%slug%'
    loop
        execute format(
            'alter table public.summaries drop constraint %I',
            v_constraint_name
        );
    end loop;

    for v_index_name in
        select i.indexname
        from pg_catalog.pg_indexes i
        where i.schemaname = 'public'
          and i.tablename = 'summaries'
          and i.indexdef ilike '%package_id%'
          and i.indexdef ilike '%slug%'
    loop
        execute format('drop index if exists public.%I', v_index_name);
    end loop;

    -- News references preserve shared Summary history. Existing rows are not
    -- touched; future Summary deletion is restricted by this FK.
    for v_constraint_name in
        select c.conname
        from pg_catalog.pg_constraint c
        where c.conrelid = 'public.news_summaries'::regclass
          and c.contype = 'f'
          and c.confrelid = 'public.summaries'::regclass
          and pg_catalog.pg_get_constraintdef(c.oid) ilike '%summary_id%'
    loop
        execute format(
            'alter table public.news_summaries drop constraint %I',
            v_constraint_name
        );
    end loop;

    execute 'alter table public.news_summaries add constraint news_summaries_summary_id_fkey foreign key (summary_id) references public.summaries(id) on delete restrict';

    foreach v_column_name in array ARRAY[
        'package_id',
        'title',
        'slug',
        'content_md',
        'read_time_minutes',
        'sort_order',
        'display_order',
        'released_at',
        'is_published'
    ]
    loop
        if exists (
            select 1
            from pg_catalog.pg_attribute a
            where a.attrelid = 'public.summaries'::regclass
              and not a.attisdropped
              and a.attname = v_column_name
        ) then
            execute format(
                'alter table public.summaries drop column %I',
                v_column_name
            );
        end if;
    end loop;

    if p_document_removal_approved is true
       and exists (
           select 1
           from pg_catalog.pg_attribute a
           where a.attrelid = 'public.summaries'::regclass
             and not a.attisdropped
             and a.attname = 'document'
       )
    then
        execute 'alter table public.summaries drop column document';
        v_document_removed := true;
    end if;

    select count(*)::bigint
    into v_legacy_columns_remaining
    from pg_catalog.pg_attribute a
    where a.attrelid = 'public.summaries'::regclass
      and not a.attisdropped
      and a.attname = any (array[
          'package_id', 'title', 'slug', 'content_md', 'read_time_minutes',
          'sort_order', 'display_order', 'released_at', 'is_published'
      ]::name[]);

    select count(*)::bigint
    into v_legacy_policies_remaining
    from pg_catalog.pg_policies p
    where p.schemaname = 'public'
      and p.tablename = 'summaries'
      and (
          p.policyname in (
              'Published summaries viewable by everyone.',
              'Admins can manage summaries.',
              'Content managers can manage summaries.'
          )
          or
          coalesce(p.qual, '') ilike '%is_published%'
          or coalesce(p.qual, '') ilike '%package_id%'
          or coalesce(p.qual, '') ilike '%content_md%'
          or coalesce(p.with_check, '') ilike '%is_published%'
          or coalesce(p.with_check, '') ilike '%package_id%'
          or coalesce(p.with_check, '') ilike '%content_md%'
          or coalesce(p.qual, '') ilike '%document%'
          or coalesce(p.with_check, '') ilike '%document%'
      );

    select count(*)::bigint
    into v_summary_package_cascade_fk_remaining
    from pg_catalog.pg_constraint c
    where c.conrelid = 'public.summaries'::regclass
      and c.contype = 'f'
      and c.confrelid = 'public.packages'::regclass
      and pg_catalog.pg_get_constraintdef(c.oid) ilike '%on delete cascade%';

    select count(*)::bigint
    into v_news_summary_cascade_fk_remaining
    from pg_catalog.pg_constraint c
    where c.conrelid = 'public.news_summaries'::regclass
      and c.contype = 'f'
      and c.confrelid = 'public.summaries'::regclass
      and pg_catalog.pg_get_constraintdef(c.oid) ilike '%on delete cascade%';

    select exists (
        select 1
        from pg_catalog.pg_trigger t
        where t.tgrelid = 'public.summaries'::regclass
          and t.tgname = 'kp_cleanup_legacy_summary_write_fence'
          and not t.tgisinternal
    )
    into v_cleanup_fence_remaining;

    if v_legacy_columns_remaining <> 0
       or v_legacy_policies_remaining <> 0
       or v_summary_package_cascade_fk_remaining <> 0
       or v_news_summary_cascade_fk_remaining <> 0
       or v_cleanup_fence_remaining
    then
        raise exception using
            errcode = 'check_violation',
            message = 'Knowledge Platform migration 060 retirement postconditions failed.',
            detail = jsonb_build_object(
                'legacy_columns_remaining', v_legacy_columns_remaining,
                'legacy_policies_remaining', v_legacy_policies_remaining,
                'summary_package_cascade_fk_remaining', v_summary_package_cascade_fk_remaining,
                'news_summary_cascade_fk_remaining', v_news_summary_cascade_fk_remaining,
                'cleanup_fence_remaining', v_cleanup_fence_remaining
            )::text;
    end if;

    perform pg_catalog.pg_notify('pgrst', 'reload schema');

    return jsonb_build_object(
        'migration', '060',
        'retirement_complete', true,
        'document_removed', v_document_removed,
        'domain_rows_changed', false,
        'production_cleanup_executed', true,
        'package_ownership_removed', true,
        'news_summary_delete_behavior', 'restrict',
        'rollback', 'forward_fix_or_verified_database_restore'
    );
end
$function$;

comment on function kp_migration.execute_legacy_summary_authority_removal(uuid, boolean, boolean, boolean, boolean, boolean, boolean, boolean, text, boolean) is
    'Explicit service-role-only migration 060 executor. Metadata-only, forward-only retirement; never inserts, updates, or deletes domain rows and is never invoked during migration deployment.';

-- ─────────────────────────────────────────────────────────────────────────────
-- Private operator access only. No PostgREST surface is introduced.
-- ─────────────────────────────────────────────────────────────────────────────

revoke all on function kp_migration.reconcile_legacy_summary_authority(uuid)
    from public, anon, authenticated;
revoke all on function kp_migration.assert_legacy_summary_authority_removal(uuid, boolean, boolean, boolean, boolean, boolean, boolean, boolean, text, boolean)
    from public, anon, authenticated;
revoke all on function kp_migration.execute_legacy_summary_authority_removal(uuid, boolean, boolean, boolean, boolean, boolean, boolean, boolean, text, boolean)
    from public, anon, authenticated;

grant execute on function kp_migration.reconcile_legacy_summary_authority(uuid)
    to service_role;
grant execute on function kp_migration.assert_legacy_summary_authority_removal(uuid, boolean, boolean, boolean, boolean, boolean, boolean, boolean, text, boolean)
    to service_role;
grant execute on function kp_migration.execute_legacy_summary_authority_removal(uuid, boolean, boolean, boolean, boolean, boolean, boolean, boolean, text, boolean)
    to service_role;

-- ─────────────────────────────────────────────────────────────────────────────
-- Installation assertions. They validate only object shape/security and do
-- not call the reconciliation, assertion, or executor functions.
-- ─────────────────────────────────────────────────────────────────────────────

do $kp_remove_legacy_authority_assertions$
declare
    expected record;
    v_function oid;
begin
    for expected in
        select function_name
        from (values
            ('kp_migration.reconcile_legacy_summary_authority(uuid)'),
            ('kp_migration.assert_legacy_summary_authority_removal(uuid,boolean,boolean,boolean,boolean,boolean,boolean,boolean,text,boolean)'),
            ('kp_migration.execute_legacy_summary_authority_removal(uuid,boolean,boolean,boolean,boolean,boolean,boolean,boolean,text,boolean)')
        ) as required(function_name)
    loop
        v_function := to_regprocedure(expected.function_name);
        if v_function is null
           or not exists (
               select 1
               from pg_catalog.pg_proc p
               where p.oid = v_function
                 and p.prosecdef
                 and array_to_string(p.proconfig, ',') ilike '%search_path=pg_catalog, public, kp_migration, pg_temp%'
                 and array_to_string(p.proconfig, ',') ilike '%lock_timeout=5s%'
           )
           or has_function_privilege('public', v_function, 'EXECUTE')
           or has_function_privilege('anon', v_function, 'EXECUTE')
           or has_function_privilege('authenticated', v_function, 'EXECUTE')
           or not has_function_privilege('service_role', v_function, 'EXECUTE')
        then
            raise exception using
                errcode = 'check_violation',
                message = format(
                    'Knowledge Platform migration 060 helper security or grants are incompatible: %s.',
                    expected.function_name
                );
        end if;
    end loop;

    if exists (
        select 1
        from pg_catalog.pg_proc p
        where p.oid in (
            to_regprocedure('kp_migration.assert_legacy_summary_authority_removal(uuid,boolean,boolean,boolean,boolean,boolean,boolean,boolean,text,boolean)'),
            to_regprocedure('kp_migration.execute_legacy_summary_authority_removal(uuid,boolean,boolean,boolean,boolean,boolean,boolean,boolean,text,boolean)')
        )
        and p.provolatile <> 'v'
    ) then
        raise exception using
            errcode = 'check_violation',
            message = 'Knowledge Platform migration 060 approval/executor functions must remain volatile PL/pgSQL boundaries.';
    end if;
end
$kp_remove_legacy_authority_assertions$;

-- The final comments above are intentionally explicit for operators inspecting
-- the migration in the Supabase SQL Editor: installation is safe; execution is
-- a separately approved maintenance operation.
