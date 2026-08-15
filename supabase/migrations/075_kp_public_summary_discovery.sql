-- 075_kp_public_summary_discovery.sql
-- Sobdai Knowledge Platform — public Package Summary card discovery.
--
-- Package discovery is intentionally separate from Summary content access. The
-- discovery RPC is a locked, metadata-only SECURITY DEFINER surface; the
-- existing protected route remains the only public content resolver.

set local lock_timeout = '5s';

-- ─────────────────────────────────────────────────────────────────────────────
-- Fail closed on the frozen Hybrid schema and protected route contract.
-- ─────────────────────────────────────────────────────────────────────────────

do $kp_public_summary_discovery_preflight$
declare
    expected record;
    v_function oid;
    v_route oid;
    v_api_owner oid;
    v_route_definition text;
    v_unqualified_definition text;
begin
    -- The new API is a required-argument, single-signature contract. Any
    -- pre-existing overload is a deployment ambiguity and is rejected.
    if exists (
        select 1
        from pg_catalog.pg_proc p
        join pg_catalog.pg_namespace n on n.oid = p.pronamespace
        where n.nspname = 'public'
          and p.proname = 'kp_read_package_summary_cards'
    ) then
        raise exception using
            errcode = 'duplicate_function',
            message = 'Knowledge Platform migration 075 found a pre-existing kp_read_package_summary_cards function or overload.';
    end if;

    for expected in
        select relation_name
        from (values
            ('public.packages'),
            ('public.summaries'),
            ('public.package_summaries'),
            ('public.summary_versions')
        ) as required(relation_name)
    loop
        if to_regclass(expected.relation_name) is null then
            raise exception using
                errcode = 'check_violation',
                message = format('Knowledge Platform migration 075 requires %s.', expected.relation_name);
        end if;
    end loop;

    for expected in
        select table_name, column_name, udt_name
        from (values
            ('packages', 'id', 'uuid'),
            ('packages', 'slug', 'text'),
            ('packages', 'is_published', 'bool'),
            ('summaries', 'id', 'uuid'),
            ('summaries', 'summary_code', 'text'),
            ('summaries', 'canonical_slug', 'text'),
            ('summaries', 'canonical_title', 'text'),
            ('summaries', 'subject', 'text'),
            ('summaries', 'topic', 'text'),
            ('summaries', 'is_published', 'bool'),
            ('summaries', 'visibility', 'text'),
            ('summaries', 'lifecycle_status', 'text'),
            ('summaries', 'current_published_version_id', 'uuid'),
            ('package_summaries', 'package_id', 'uuid'),
            ('package_summaries', 'summary_id', 'uuid'),
            ('package_summaries', 'status', 'text'),
            ('package_summaries', 'version_policy', 'text'),
            ('package_summaries', 'pinned_summary_version_id', 'uuid'),
            ('package_summaries', 'legacy_slug', 'text'),
            ('package_summaries', 'display_order', 'int4'),
            ('package_summaries', 'released_at', 'timestamptz'),
            ('summary_versions', 'id', 'uuid'),
            ('summary_versions', 'summary_id', 'uuid'),
            ('summary_versions', 'status', 'text'),
            ('summary_versions', 'title_snapshot', 'text'),
            ('summary_versions', 'subject_snapshot', 'text'),
            ('summary_versions', 'topic_snapshot', 'text'),
            ('summary_versions', 'read_time_minutes', 'int4'),
            ('summary_versions', 'published_at', 'timestamptz')
        ) as required(table_name, column_name, udt_name)
    loop
        if not exists (
            select 1
            from information_schema.columns c
            where c.table_schema = 'public'
              and c.table_name = expected.table_name
              and c.column_name = expected.column_name
              and c.udt_name = expected.udt_name
        ) then
            raise exception using
                errcode = 'check_violation',
                message = format(
                    'Knowledge Platform migration 075 requires public.%I.%I type=%s.',
                    expected.table_name,
                    expected.column_name,
                    expected.udt_name
                );
        end if;
    end loop;

    -- 075 runs after the 057-074 persistence/read surface. The existing API
    -- owner is the controlled owner for this intentionally public read RPC.
    select p.proowner
    into v_api_owner
    from pg_catalog.pg_proc p
    where p.oid = to_regprocedure('public.kp_persist_require_actor(uuid)')
      and p.prosecdef
      and coalesce(array_to_string(p.proconfig, ','), '') ilike '%search_path=pg_catalog, public, pg_temp%'
      and coalesce(array_to_string(p.proconfig, ','), '') ilike '%lock_timeout=5s%';

    if v_api_owner is null
       or pg_catalog.pg_get_userbyid(v_api_owner) is distinct from current_user
    then
        raise exception using
            errcode = 'insufficient_privilege',
            message = 'Knowledge Platform migration 075 must run as the existing controlled KP API owner.';
    end if;

    v_route := to_regprocedure('public.kp_read_summary_route(text,text)');
    if v_route is null then
        raise exception using
            errcode = 'check_violation',
            message = 'Knowledge Platform migration 075 requires public.kp_read_summary_route(text,text).';
    end if;

    select pg_catalog.pg_get_functiondef(v_route)
    into v_route_definition;

    if not exists (
        select 1
        from pg_catalog.pg_proc p
        where p.oid = v_route
          and p.proowner = v_api_owner
          and p.prosecdef
          and coalesce(array_to_string(p.proconfig, ','), '') ilike '%search_path=pg_catalog, public, pg_temp%'
    )
       or position('public.kp_can_read_package_summary(' in v_route_definition) = 0
       or position('public.kp_can_read_summary_version(' in v_route_definition) = 0
       or position('content_md' in lower(v_route_definition)) = 0
       or position('p_package_slug' in lower(v_route_definition)) = 0
    then
        raise exception using
            errcode = 'check_violation',
            message = 'Knowledge Platform migration 075 found a missing or weakened protected Summary route contract.';
    end if;

    if has_function_privilege('public', v_route, 'EXECUTE')
       or not has_function_privilege('anon', v_route, 'EXECUTE')
       or not has_function_privilege('authenticated', v_route, 'EXECUTE')
       or not has_function_privilege('service_role', v_route, 'EXECUTE')
    then
        raise exception using
            errcode = 'check_violation',
            message = 'Knowledge Platform migration 075 found divergent protected Summary route grants.';
    end if;

    -- The 073 staff read and 074 UUID/search_path contracts are prerequisites,
    -- not surfaces that this migration may replace.
    if to_regprocedure('public.kp_is_staff()') is null
       or not exists (
        select 1
        from pg_catalog.pg_policy pol
        where pol.polrelid = 'public.summaries'::regclass
          and pol.polname = 'kp_f4_4_summary_staff_read'
          and pol.polcmd = 'r'
          and pol.polwithcheck is null
          and pol.polroles = array[(select r.oid from pg_catalog.pg_roles r where r.rolname = 'authenticated')]::oid[]
          and pg_catalog.pg_get_expr(pol.polqual, pol.polrelid) ilike '%kp_is_staff()%'
    ) then
        raise exception using
            errcode = 'check_violation',
            message = 'Knowledge Platform migration 075 requires the 073 staff Summary SELECT policy.';
    end if;

    if to_regprocedure('extensions.uuid_generate_v4()') is null then
        raise exception using
            errcode = 'check_violation',
            message = 'Knowledge Platform migration 075 requires the schema-qualified UUID generator preserved by 074.';
    end if;

    if not exists (
        select 1
        from pg_catalog.pg_constraint c
        where c.conrelid = 'public.summaries'::regclass
          and c.conname = 'summaries_kp_identity_bundle_check'
          and c.contype = 'c'
          and c.convalidated
    )
       or not exists (
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
            message = 'Knowledge Platform migration 075 requires the validated 067 Hybrid identity/marker constraints.';
    end if;

    if not exists (
        select 1
        from pg_catalog.pg_class c
        join pg_catalog.pg_namespace n on n.oid = c.relnamespace
        join pg_catalog.pg_index i on i.indexrelid = c.oid
        join pg_catalog.pg_attribute a
          on a.attrelid = i.indrelid
         and a.attname = 'canonical_slug'
         and not a.attisdropped
        where n.nspname = 'public'
          and c.relname = 'summaries_canonical_slug_final_key'
          and i.indrelid = 'public.summaries'::regclass
          and i.indisunique
          and i.indisvalid
          and i.indisready
          and i.indnkeyatts = 1
          and i.indkey[0] = a.attnum
          and i.indpred is null
    ) then
        raise exception using
            errcode = 'check_violation',
            message = 'Knowledge Platform migration 075 requires the final unique canonical Summary slug index.';
    end if;

    if not exists (
        select 1
        from pg_catalog.pg_class c
        join pg_catalog.pg_namespace n on n.oid = c.relnamespace
        join pg_catalog.pg_index i on i.indexrelid = c.oid
        join pg_catalog.pg_attribute a
          on a.attrelid = i.indrelid
         and a.attname = 'summary_id'
         and not a.attisdropped
        where n.nspname = 'public'
          and c.relname = 'package_summaries_one_bank_compatibility_key'
          and i.indrelid = 'public.package_summaries'::regclass
          and i.indisunique
          and i.indisvalid
          and i.indisready
          and i.indnkeyatts = 1
          and i.indkey[0] = a.attnum
          and pg_catalog.pg_get_expr(i.indpred, i.indrelid) in (
              'is_summary_bank_compatibility',
              '(is_summary_bank_compatibility = true)'
          )
    ) then
        raise exception using
            errcode = 'check_violation',
            message = 'Knowledge Platform migration 075 requires the validated 067 compatibility marker index.';
    end if;

    if not exists (
        select 1
        from pg_catalog.pg_class c
        where c.oid = 'public.kp_read_package_summaries'::regclass
          and c.relkind = 'v'
    ) then
        raise exception using
            errcode = 'check_violation',
            message = 'Knowledge Platform migration 075 requires the existing protected Package Summary projection.';
    end if;

    -- A Package-local effective slug must identify one active published KP
    -- membership. Do not repair collisions here; abort before installing a
    -- route that could resolve an ambiguous Summary.
    if exists (
        select ps.package_id,
               coalesce(ps.legacy_slug, s.canonical_slug) as effective_slug
        from public.package_summaries ps
        join public.packages p on p.id = ps.package_id
        join public.summaries s on s.id = ps.summary_id
        join public.summary_versions sv
          on sv.id = s.current_published_version_id
         and sv.summary_id = s.id
         and sv.status = 'published'
        where ps.status = 'active'
          and p.is_published = true
          and s.summary_code is not null
          and s.is_published = true
          and s.lifecycle_status = 'active'
          and (
              (ps.version_policy = 'latest_published')
              or (
                  ps.version_policy = 'pinned'
                  and ps.pinned_summary_version_id = s.current_published_version_id
              )
          )
          and nullif(btrim(coalesce(ps.legacy_slug, s.canonical_slug)), '') is not null
        group by ps.package_id, coalesce(ps.legacy_slug, s.canonical_slug)
        having count(*) > 1
    ) then
        raise exception using
            errcode = 'unique_violation',
            message = 'Knowledge Platform migration 075 found ambiguous effective Package-scoped KP Summary slugs.';
    end if;

    -- Confirm 074 did not leave a search_path-sensitive UUID generator in any
    -- installed persistence writer. This is catalog-only and does not invoke
    -- any writer.
    for v_function, v_unqualified_definition in
        select p.oid, pg_catalog.pg_get_functiondef(p.oid)
        from pg_catalog.pg_proc p
        join pg_catalog.pg_namespace n on n.oid = p.pronamespace
        where n.nspname = 'public'
          and p.proname like 'kp_persist_%'
    loop
        v_unqualified_definition := pg_catalog.regexp_replace(
            lower(v_unqualified_definition),
            '[a-z_][a-z0-9_]*[[:space:]]*\.[[:space:]]*uuid_generate_v4[[:space:]]*\(\)',
            '',
            'g'
        );
        if v_unqualified_definition ~ 'uuid_generate_v4[[:space:]]*\(\)' then
            raise exception using
                errcode = 'check_violation',
                message = 'Knowledge Platform migration 075 found a persistence writer with an unqualified UUID generator after 074.';
        end if;
    end loop;
end
$kp_public_summary_discovery_preflight$;

-- ─────────────────────────────────────────────────────────────────────────────
-- Metadata-only public Package discovery RPC.
-- ─────────────────────────────────────────────────────────────────────────────

create function public.kp_read_package_summary_cards(
    p_package_id uuid
)
returns table (
    package_id uuid,
    package_slug text,
    summary_id uuid,
    summary_code text,
    summary_slug text,
    title text,
    subject text,
    topic text,
    read_time_minutes integer,
    display_order integer,
    released_at timestamptz,
    published_at timestamptz
)
language sql
stable
security definer
set search_path = pg_catalog, public, pg_temp
as $function$
    select
        p.id as package_id,
        p.slug as package_slug,
        s.id as summary_id,
        s.summary_code as summary_code,
        coalesce(ps.legacy_slug, s.canonical_slug) as summary_slug,
        sv.title_snapshot as title,
        coalesce(sv.subject_snapshot, s.subject) as subject,
        coalesce(sv.topic_snapshot, s.topic) as topic,
        sv.read_time_minutes as read_time_minutes,
        ps.display_order as display_order,
        ps.released_at as released_at,
        sv.published_at as published_at
    from public.package_summaries ps
    join public.packages p
      on p.id = ps.package_id
    join public.summaries s
      on s.id = ps.summary_id
    join public.summary_versions sv
      on sv.id = s.current_published_version_id
     and sv.summary_id = s.id
     and sv.status = 'published'
    where ps.package_id = p_package_id
      and ps.status = 'active'
      and p.is_published = true
      and s.summary_code is not null
      and s.is_published = true
      and s.lifecycle_status = 'active'
      and nullif(btrim(coalesce(ps.legacy_slug, s.canonical_slug)), '') is not null
      and (
          ps.version_policy = 'latest_published'
          or (
              ps.version_policy = 'pinned'
              and ps.pinned_summary_version_id = s.current_published_version_id
          )
      )
    order by ps.display_order desc,
             ps.released_at desc nulls last,
             sv.published_at desc,
             p.id,
             s.id;
$function$;

comment on function public.kp_read_package_summary_cards(uuid) is
    'Public Package Summary card discovery. Metadata only; protected Summary content remains behind kp_read_summary_route(text,text).';

revoke all on function public.kp_read_package_summary_cards(uuid)
    from public, anon, authenticated;

grant execute on function public.kp_read_package_summary_cards(uuid)
    to anon, authenticated, service_role;

-- ─────────────────────────────────────────────────────────────────────────────
-- Package-scoped canonical fallback for secondary memberships.
--
-- This is the current 056 route definition with only the required fallback:
-- ps.legacy_slug remains authoritative when present; a NULL legacy_slug may
-- use the KP root canonical_slug only in the explicitly supplied Package
-- scope. The protected entitlement/version gates are unchanged.
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
    join public.summaries scoped
      on scoped.id = ps.summary_id
    where p_package_slug is not null
      and ps.status = 'active'
      and scoped.summary_code is not null
      and (
          ps.legacy_slug = lower(btrim(p_slug))
          or (
              ps.legacy_slug is null
              and scoped.canonical_slug = lower(btrim(p_slug))
          )
      )
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
    case
        when p_package_slug is null then ps.legacy_slug
        else coalesce(ps.legacy_slug, s.canonical_slug)
    end,
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
          and (
              ps.legacy_slug = lower(btrim(p_slug))
              or (
                  ps.legacy_slug is null
                  and s.summary_code is not null
                  and s.canonical_slug = lower(btrim(p_slug))
              )
          )
      )
  )
  and public.kp_can_read_package_summary(ps.package_id, ps.summary_id)
  and public.kp_can_read_summary_version(ps.summary_id, sv.id)
order by p.slug, ps.display_order, ps.sort_order, p.id;
$function$;

-- CREATE OR REPLACE preserves the existing route owner/settings/grants; these
-- explicit grants make the intended read-only surface clear and fail closed.
revoke all on function public.kp_read_summary_route(text, text)
    from public, anon, authenticated;

grant execute on function public.kp_read_summary_route(text, text)
    to anon, authenticated, service_role;

-- ─────────────────────────────────────────────────────────────────────────────
-- Catalog postflight for both read surfaces.
-- ─────────────────────────────────────────────────────────────────────────────

do $kp_public_summary_discovery_postflight$
declare
    expected record;
    v_function oid;
    v_route oid;
    v_api_owner oid;
    v_definition text;
    v_result text;
begin
    v_api_owner := (
        select p.proowner
        from pg_catalog.pg_proc p
        where p.oid = to_regprocedure('public.kp_persist_require_actor(uuid)')
    );
    v_function := to_regprocedure('public.kp_read_package_summary_cards(uuid)');
    if v_function is null
       or (
           select count(*)
           from pg_catalog.pg_proc p
           join pg_catalog.pg_namespace n on n.oid = p.pronamespace
           where n.nspname = 'public'
             and p.proname = 'kp_read_package_summary_cards'
       ) <> 1
    then
        raise exception using
            errcode = 'check_violation',
            message = 'Knowledge Platform migration 075 failed to install one exact discovery RPC.';
    end if;

    if not exists (
        select 1
        from pg_catalog.pg_proc p
        where p.oid = v_function
          and p.proowner = v_api_owner
          and p.prosecdef
          and p.provolatile = 's'
          and p.proargdefaults is null
          and coalesce(array_to_string(p.proconfig, ','), '') ilike '%search_path=pg_catalog, public, pg_temp%'
    ) then
        raise exception using
            errcode = 'check_violation',
            message = 'Knowledge Platform migration 075 installed a discovery RPC with divergent owner/security/settings.';
    end if;

    v_definition := lower(pg_catalog.pg_get_functiondef(v_function));
    v_result := lower(pg_catalog.pg_get_function_result(v_function));

    for expected in
        select required_name
        from (values
            ('package_id'),
            ('package_slug'),
            ('summary_id'),
            ('summary_code'),
            ('summary_slug'),
            ('title'),
            ('subject'),
            ('topic'),
            ('read_time_minutes'),
            ('display_order'),
            ('released_at'),
            ('published_at')
        ) as required(required_name)
    loop
        if position(expected.required_name in v_result) = 0 then
            raise exception using
                errcode = 'check_violation',
                message = format('Knowledge Platform migration 075 discovery RPC is missing return column %s.', expected.required_name);
        end if;
    end loop;

    if v_result ~ '(content_md|source_citations|reference_documents|law_snapshot|revision_number|pinned_summary_version_id|version_policy|actor_id|change_note|visibility)'
       or v_definition ~ '\m(insert|update|delete|truncate|execute)\M'
       or position('kp_can_read_package_summary' in v_definition) > 0
       or position('kp_can_read_summary_version' in v_definition) > 0
       or position('p_package_id uuid' in v_definition) = 0
       or position('coalesce(ps.legacy_slug, s.canonical_slug)' in v_definition) = 0
    then
        raise exception using
            errcode = 'check_violation',
            message = 'Knowledge Platform migration 075 discovery RPC is not a locked metadata-only, entitlement-independent function.';
    end if;

    if has_function_privilege('public', v_function, 'EXECUTE')
       or not has_function_privilege('anon', v_function, 'EXECUTE')
       or not has_function_privilege('authenticated', v_function, 'EXECUTE')
       or not has_function_privilege('service_role', v_function, 'EXECUTE')
    then
        raise exception using
            errcode = 'check_violation',
            message = 'Knowledge Platform migration 075 installed divergent discovery RPC grants.';
    end if;

    v_route := to_regprocedure('public.kp_read_summary_route(text,text)');
    if not exists (
        select 1
        from pg_catalog.pg_proc p
        where p.oid = v_route
          and p.proowner = v_api_owner
          and p.prosecdef
          and coalesce(array_to_string(p.proconfig, ','), '') ilike '%search_path=pg_catalog, public, pg_temp%'
    ) then
        raise exception using
            errcode = 'check_violation',
            message = 'Knowledge Platform migration 075 weakened the protected route security configuration.';
    end if;

    v_definition := lower(pg_catalog.pg_get_functiondef(v_route));
    if position('public.kp_can_read_package_summary(' in v_definition) = 0
       or position('public.kp_can_read_summary_version(' in v_definition) = 0
       or position('content_md' in v_definition) = 0
       or position('s.is_published = true' in v_definition) = 0
       or position('p_package_slug' in v_definition) = 0
       or position('ps.legacy_slug is null' in v_definition) = 0
       or position('s.canonical_slug = lower(btrim(p_slug))' in v_definition) = 0
       or position('p.slug = btrim(p_package_slug)' in v_definition) = 0
    then
        raise exception using
            errcode = 'check_violation',
            message = 'Knowledge Platform migration 075 failed to preserve the protected Package-scoped canonical fallback contract.';
    end if;

    if not exists (
        select 1
        from pg_catalog.pg_class c
        where c.oid = 'public.kp_read_package_summaries'::regclass
          and c.relkind = 'v'
          and pg_catalog.pg_get_viewdef(c.oid, true) ilike '%content_md%'
          and pg_catalog.pg_get_viewdef(c.oid, true) ilike '%summary_versions%'
    ) then
        raise exception using
            errcode = 'check_violation',
            message = 'Knowledge Platform migration 075 found a missing or changed protected Package Summary projection.';
    end if;

    if not exists (
        select 1
        from pg_catalog.pg_constraint c
        where c.conrelid = 'public.summaries'::regclass
          and c.conname = 'summaries_kp_identity_bundle_check'
          and c.convalidated
    )
       or not exists (
        select 1
        from pg_catalog.pg_constraint c
        where c.conrelid = 'public.package_summaries'::regclass
          and c.conname = 'package_summaries_bank_compatibility_slug_check'
          and c.convalidated
    )
    then
        raise exception using
            errcode = 'check_violation',
            message = 'Knowledge Platform migration 075 lost a required 067 Hybrid invariant.';
    end if;
end
$kp_public_summary_discovery_postflight$;

notify pgrst, 'reload schema';
