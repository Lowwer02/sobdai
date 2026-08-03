-- 056_kp_read_projections.sql
-- Sobdai Knowledge Platform — frozen consumer read projections.
--
-- Purpose
-- -------
-- Install the read-only target surfaces used by the D1 shadow-read phase:
-- Summary Library, Summary Picker, Package Summary composition, the
-- security-aware Summary route resolver, News related Summaries, and the
-- Recommendation ContentStore adapter.
--
-- Scope boundary
-- --------------
-- * Creates only views and one narrowly scoped resolver function.
-- * Views are security-invoker projections over the frozen 046 RLS boundary.
-- * The resolver is security-definer only because approved source citations
--   and aliases are intentionally not directly readable by browser roles. It
--   repeats the frozen package/version access predicates before returning any
--   Markdown.
-- * Creates no tables, columns, constraints, indexes, triggers, policies, or
--   feature-flag storage. Application-owned kp_shadow_* flags remain
--   server-side, auditable, and default-off as required by the frozen design.
-- * Inserts, updates, deletes, backfills, and cutover execution are not part
--   of deployment. Every projection is rebuildable and has no lifecycle
--   authority.
--
-- Rollback
-- --------
-- Disable the application kp_shadow_* / kp_read_* flags. All served target read flags default-off until the D1 parity gate passes.
-- projections installed; no down migration or domain-row rollback is needed.

set local lock_timeout = '5s';

-- ─────────────────────────────────────────────────────────────────────────────
-- Fail closed on migrations 046, 053, 054, and 055 before creating any view.
-- ─────────────────────────────────────────────────────────────────────────────

do $kp_read_projections_preflight$
declare
    required record;
begin
    for required in
        select object_name
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
            ('public.package_summaries'),
            ('public.news'),
            ('public.news_summaries')
        ) as required(object_name)
    loop
        if to_regclass(required.object_name) is null then
            raise exception using
                errcode = 'check_violation',
                message = format(
                    'Knowledge Platform migration 056 prerequisite is missing: %s.',
                    required.object_name
                );
        end if;
    end loop;

    if to_regprocedure('public.kp_can_read_package_summary(uuid,uuid)') is null
       or to_regprocedure('public.kp_can_read_summary_version(uuid,uuid)') is null
    then
        raise exception using
            errcode = 'check_violation',
            message = 'Knowledge Platform migration 056 requires the frozen 046 package/version access predicates.';
    end if;

    if to_regprocedure('kp_migration.reconcile_final_unique_indexes()') is null then
        raise exception using
            errcode = 'check_violation',
            message = 'Knowledge Platform migration 056 requires the reconciled 055 final-index helper.';
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
                    'Knowledge Platform migration 056 requires validated unique index public.%I on %s.',
                    required.index_name,
                    required.table_name
                );
        end if;
    end loop;

    for required in
        select table_name, column_name
        from (values
            ('packages', 'id'),
            ('packages', 'slug'),
            ('packages', 'name'),
            ('packages', 'is_published'),
            ('summaries', 'id'),
            ('summaries', 'title'),
            ('summaries', 'summary_code'),
            ('summaries', 'canonical_slug'),
            ('summaries', 'canonical_title'),
            ('summaries', 'subject'),
            ('summaries', 'topic'),
            ('summaries', 'law'),
            ('summaries', 'visibility'),
            ('summaries', 'lifecycle_status'),
            ('summaries', 'is_published'),
            ('summaries', 'current_published_version_id'),
            ('summaries', 'created_at'),
            ('summaries', 'updated_at'),
            ('summary_versions', 'id'),
            ('summary_versions', 'summary_id'),
            ('summary_versions', 'revision_number'),
            ('summary_versions', 'status'),
            ('summary_versions', 'content_md'),
            ('summary_versions', 'content_checksum'),
            ('summary_versions', 'title_snapshot'),
            ('summary_versions', 'subject_snapshot'),
            ('summary_versions', 'topic_snapshot'),
            ('summary_versions', 'law_snapshot'),
            ('summary_versions', 'read_time_minutes'),
            ('summary_versions', 'published_at'),
            ('package_summaries', 'package_id'),
            ('package_summaries', 'summary_id'),
            ('package_summaries', 'status'),
            ('package_summaries', 'version_policy'),
            ('package_summaries', 'pinned_summary_version_id'),
            ('package_summaries', 'sort_order'),
            ('package_summaries', 'display_order'),
            ('package_summaries', 'released_at'),
            ('package_summaries', 'navigation_label'),
            ('package_summaries', 'legacy_slug'),
            ('reference_documents', 'id'),
            ('reference_documents', 'document_code'),
            ('reference_documents', 'canonical_title'),
            ('reference_documents', 'lifecycle_status'),
            ('reference_document_versions', 'id'),
            ('reference_document_versions', 'reference_document_id'),
            ('reference_document_versions', 'version_label'),
            ('reference_document_versions', 'status'),
            ('reference_document_versions', 'source_url'),
            ('summary_version_reference_documents', 'summary_version_id'),
            ('summary_version_reference_documents', 'reference_document_id'),
            ('summary_version_reference_documents', 'reference_document_version_id'),
            ('summary_version_reference_documents', 'role'),
            ('summary_version_reference_documents', 'coverage_note'),
            ('summary_version_reference_documents', 'sort_order'),
            ('summary_reference_documents', 'summary_id'),
            ('reference_document_aliases', 'reference_document_id'),
            ('reference_document_aliases', 'alias_type'),
            ('reference_document_aliases', 'alias_value'),
            ('reference_document_aliases', 'status'),
            ('summary_aliases', 'summary_id'),
            ('summary_aliases', 'slug'),
            ('summary_aliases', 'status'),
            ('news', 'id'),
            ('news', 'slug'),
            ('news', 'title'),
            ('news', 'status'),
            ('news_summaries', 'news_id'),
            ('news_summaries', 'summary_id'),
            ('news_summaries', 'sort_order')
        ) as expected(table_name, column_name)
    loop
        if not exists (
            select 1
            from information_schema.columns c
            where c.table_schema = 'public'
              and c.table_name = required.table_name
              and c.column_name = required.column_name
        ) then
            raise exception using
                errcode = 'check_violation',
                message = format(
                    'Knowledge Platform migration 056 requires public.%I.%I.',
                    required.table_name,
                    required.column_name
                );
        end if;
    end loop;

    for required in
        select relation_name
        from (values
            ('kp_read_admin_library'),
            ('kp_read_summary_picker'),
            ('kp_read_package_summaries'),
            ('kp_read_news_summaries'),
            ('kp_read_recommendation_store')
        ) as expected(relation_name)
    loop
        if to_regclass('public.' || required.relation_name) is not null
           and not exists (
               select 1
               from pg_class c
               join pg_namespace n on n.oid = c.relnamespace
               where n.nspname = 'public'
                 and c.relname = required.relation_name
                 and c.relkind = 'v'
           )
        then
            raise exception using
                errcode = 'duplicate_object',
                message = format(
                    'Knowledge Platform migration 056 cannot replace non-view public.%I.',
                    required.relation_name
                );
        end if;
    end loop;

    if to_regprocedure('public.kp_read_summary_route(text,text)') is not null
       and exists (
           select 1
           from pg_proc p
           where p.oid = to_regprocedure('public.kp_read_summary_route(text,text)')
             and not p.prosecdef
       )
    then
        raise exception using
            errcode = 'duplicate_object',
            message = 'Knowledge Platform migration 056 found an incompatible existing Summary route resolver.';
    end if;
end
$kp_read_projections_preflight$;

-- ─────────────────────────────────────────────────────────────────────────────
-- Summary Library projection (staff/admin metadata; no Markdown body).
-- ─────────────────────────────────────────────────────────────────────────────

create or replace view public.kp_read_admin_library
with (security_invoker = true)
as
select
    s.id as summary_id,
    s.summary_code,
    s.canonical_slug,
    coalesce(s.canonical_title, s.title) as canonical_title,
    s.subject,
    s.topic,
    s.law,
    s.visibility,
    s.lifecycle_status,
    s.is_published as legacy_is_published,
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
    'Read-only Summary Library projection for kp_shadow_admin_library and kp_read_admin_library. Security-invoker; no Markdown and no lifecycle authority.';

-- ─────────────────────────────────────────────────────────────────────────────
-- Summary Picker projection (identity/classification/availability only).
-- ─────────────────────────────────────────────────────────────────────────────

create or replace view public.kp_read_summary_picker
with (security_invoker = true)
as
select
    s.id as summary_id,
    s.summary_code,
    s.canonical_slug,
    coalesce(s.canonical_title, s.title) as canonical_title,
    s.subject,
    s.topic,
    s.law,
    s.visibility,
    s.lifecycle_status,
    s.is_published as legacy_is_published,
    s.current_published_version_id,
    (s.current_published_version_id is not null and exists (
        select 1
        from public.summary_versions sv
        where sv.id = s.current_published_version_id
          and sv.summary_id = s.id
          and sv.status = 'published'
    )) as published_revision_available,
    (
        select count(*)::bigint
        from public.package_summaries ps
        where ps.summary_id = s.id
          and ps.status = 'active'
    ) as active_package_placement_count
from public.summaries s;

comment on view public.kp_read_summary_picker is
    'Read-only Summary Picker projection for kp_shadow_summary_read. Contains no Markdown and does not attach a Summary or change Package state.';

-- ─────────────────────────────────────────────────────────────────────────────
-- Public Package composition projection (body only after frozen access gates).
-- ─────────────────────────────────────────────────────────────────────────────

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
    coalesce(s.canonical_title, s.title) as canonical_title,
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
  and s.is_published = true
  and s.lifecycle_status = 'active'
  and public.kp_can_read_package_summary(ps.package_id, ps.summary_id)
  and public.kp_can_read_summary_version(ps.summary_id, sv.id);

comment on view public.kp_read_package_summaries is
    'Security-aware read-only PackageSummary composition for kp_shadow_package_read and kp_read_package_summaries. Markdown is returned only for an active placement, published Package, active Summary, selected published revision, and the frozen visibility/entitlement predicates.';

-- ─────────────────────────────────────────────────────────────────────────────
-- News related Summary projection (metadata only; no body).
-- ─────────────────────────────────────────────────────────────────────────────

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
    coalesce(s.canonical_title, s.title) as canonical_title,
    s.subject,
    s.topic,
    s.law,
    s.visibility,
    s.lifecycle_status,
    s.current_published_version_id,
    (s.current_published_version_id is not null and exists (
        select 1
        from public.summary_versions sv
        where sv.id = s.current_published_version_id
          and sv.summary_id = s.id
          and sv.status = 'published'
    )) as published_revision_available,
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
  and s.is_published = true
  and s.visibility = 'public_indexable'
  and s.lifecycle_status = 'active';

comment on view public.kp_read_news_summaries is
    'Read-only published-News related Summary projection for kp_shadow_news_summaries and kp_read_news_summaries. It returns metadata and a deterministic package context, never Markdown.';

-- ─────────────────────────────────────────────────────────────────────────────
-- Recommendation ContentStore projection (metadata only; deterministic package).
-- ─────────────────────────────────────────────────────────────────────────────

create or replace view public.kp_read_recommendation_store
with (security_invoker = true)
as
select
    s.id as content_id,
    'summary'::text as content_type,
    coalesce(s.canonical_title, s.title) as title,
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
where s.is_published = true
  and s.visibility = 'public_indexable'
  and s.lifecycle_status = 'active'
  and s.current_published_version_id is not null
  and exists (
      select 1
      from public.summary_versions sv
      where sv.id = s.current_published_version_id
        and sv.summary_id = s.id
        and sv.status = 'published'
  );

comment on view public.kp_read_recommendation_store is
    'Read-only Summary ContentStore adapter for kp_shadow_recommendation_store and kp_read_recommendation_store. Exposes stable metadata only, never Markdown or entitlement state.';

-- ─────────────────────────────────────────────────────────────────────────────
-- Security-aware Summary resolver / legacy compatibility projection.
-- ─────────────────────────────────────────────────────────────────────────────

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
    -- Canonical and direct SummaryAlias resolution is unscoped. The legacy
    -- compatibility branch is intentionally selected only with Package
    -- context so a Package-local slug cannot become a global alias.
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
)
,
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
    coalesce(s.canonical_title, s.title),
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
  and s.is_published = true
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
    'Security-aware read-only canonical, active-alias, and Package-scoped legacy Summary resolver for kp_shadow_summary_read and kp_read_summary_route. Locked search_path; returns Markdown only after explicit placement, publication, visibility, entitlement, and verified-citation gates.';

-- ─────────────────────────────────────────────────────────────────────────────
-- Browser grants are read-only and projection-specific. Private source tables
-- remain protected by the 046 deny/public-staff policy boundary.
-- ─────────────────────────────────────────────────────────────────────────────

revoke all on table
    public.kp_read_admin_library,
    public.kp_read_summary_picker,
    public.kp_read_package_summaries,
    public.kp_read_news_summaries,
    public.kp_read_recommendation_store
from public, anon, authenticated;

grant select
    on table
        public.kp_read_admin_library,
        public.kp_read_summary_picker
    to authenticated, service_role;

grant select
    on table
        public.kp_read_package_summaries,
        public.kp_read_news_summaries,
        public.kp_read_recommendation_store
    to anon, authenticated, service_role;

revoke all on function public.kp_read_summary_route(text, text)
    from public, anon, authenticated;

grant execute on function public.kp_read_summary_route(text, text)
    to anon, authenticated, service_role;

-- Source aliases/citations are not exposed as direct browser tables. The
-- resolver is the only projection path that can return approved citation
-- metadata, and it never returns a source body or storage object.
revoke select on table
    public.reference_documents,
    public.reference_document_versions,
    public.reference_document_aliases,
    public.summary_aliases,
    public.summary_reference_documents,
    public.summary_version_reference_documents
from anon;

-- ─────────────────────────────────────────────────────────────────────────────
-- Fail-closed postconditions: invoker views, resolver hardening, exact grants,
-- and unchanged base RLS/private-source boundaries.
-- ─────────────────────────────────────────────────────────────────────────────

do $kp_read_projections_assertions$
declare
    expected record;
    option_text text;
begin
    for expected in
        select relation_name
        from (values
            ('kp_read_admin_library'),
            ('kp_read_summary_picker'),
            ('kp_read_package_summaries'),
            ('kp_read_news_summaries'),
            ('kp_read_recommendation_store')
        ) as views(relation_name)
    loop
        select array_to_string(c.reloptions, ',')
        into option_text
        from pg_class c
        join pg_namespace n on n.oid = c.relnamespace
        where n.nspname = 'public'
          and c.relname = expected.relation_name
          and c.relkind = 'v';

        if option_text is null or option_text not ilike '%security_invoker=true%' then
            raise exception using
                errcode = 'check_violation',
                message = format(
                    'Knowledge Platform migration 056 requires security_invoker=true on public.%I.',
                    expected.relation_name
                );
        end if;

        if has_table_privilege('anon', 'public.' || expected.relation_name, 'INSERT')
           or has_table_privilege('anon', 'public.' || expected.relation_name, 'UPDATE')
           or has_table_privilege('anon', 'public.' || expected.relation_name, 'DELETE')
           or has_table_privilege('authenticated', 'public.' || expected.relation_name, 'INSERT')
           or has_table_privilege('authenticated', 'public.' || expected.relation_name, 'UPDATE')
           or has_table_privilege('authenticated', 'public.' || expected.relation_name, 'DELETE')
        then
            raise exception using
                errcode = 'check_violation',
                message = format(
                    'Knowledge Platform migration 056 found a browser mutation grant on public.%I.',
                    expected.relation_name
                );
        end if;
    end loop;

    if not exists (
        select 1
        from pg_proc p
        join pg_namespace n on n.oid = p.pronamespace
        where n.nspname = 'public'
          and p.oid = to_regprocedure('public.kp_read_summary_route(text,text)')
          and p.prosecdef
          and array_to_string(p.proconfig, ',') ilike '%search_path=pg_catalog, public, pg_temp%'
    ) then
        raise exception using
            errcode = 'check_violation',
            message = 'Knowledge Platform migration 056 resolver must be SECURITY DEFINER with a locked search_path.';
    end if;

    if has_function_privilege('public', 'public.kp_read_summary_route(text,text)', 'EXECUTE') then
        raise exception using
            errcode = 'check_violation',
            message = 'Knowledge Platform migration 056 resolver must not retain PUBLIC execute privilege.';
    end if;

    if not has_function_privilege('anon', 'public.kp_read_summary_route(text,text)', 'EXECUTE')
       or not has_function_privilege('authenticated', 'public.kp_read_summary_route(text,text)', 'EXECUTE')
       or not has_function_privilege('service_role', 'public.kp_read_summary_route(text,text)', 'EXECUTE')
    then
        raise exception using
            errcode = 'check_violation',
            message = 'Knowledge Platform migration 056 resolver execute grants are incomplete.';
    end if;

    for expected in
        select table_name
        from (values
            ('reference_documents'),
            ('reference_document_versions'),
            ('reference_document_aliases'),
            ('summary_aliases'),
            ('summary_reference_documents'),
            ('summary_version_reference_documents'),
            ('package_summaries'),
            ('summary_versions')
        ) as target(table_name)
    loop
        if has_table_privilege('anon', 'public.' || expected.table_name, 'SELECT')
           and expected.table_name in (
               'reference_documents',
               'reference_document_versions',
               'reference_document_aliases',
               'summary_aliases',
               'summary_reference_documents',
               'summary_version_reference_documents'
           )
        then
            raise exception using
                errcode = 'check_violation',
                message = format(
                    'Knowledge Platform migration 056 must not grant anon direct SELECT on private public.%I.',
                    expected.table_name
                );
        end if;
    end loop;

    if not exists (
        select 1
        from pg_class c
        join pg_namespace n on n.oid = c.relnamespace
        where n.nspname = 'public'
          and c.relname = 'summaries'
          and c.relkind = 'r'
          and c.relrowsecurity
    ) then
        raise exception using
            errcode = 'check_violation',
            message = 'Knowledge Platform migration 056 changed the required legacy Summary RLS boundary.';
    end if;

    if not exists (
        select 1
        from pg_class c
        join pg_namespace n on n.oid = c.relnamespace
        where n.nspname = 'public'
          and c.relname = 'package_summaries'
          and c.relkind = 'r'
          and c.relrowsecurity
    ) then
        raise exception using
            errcode = 'check_violation',
            message = 'Knowledge Platform migration 056 changed the required PackageSummary RLS boundary.';
    end if;
end
$kp_read_projections_assertions$;

notify pgrst, 'reload schema';
