-- 077_kp_owner_admin_internal_package_access.sql
-- Sobdai Knowledge Platform — narrow Owner/Admin internal Package access.
--
-- Internal access is not customer entitlement.  This migration adds the
-- exact Owner/Admin predicate and extends only the product_entitled branch of
-- the authoritative Summary access helper.  Editor and Support remain staff
-- for admin/content boundaries but do not receive a customer-facing Package
-- bypass.

set local lock_timeout = '5s';

-- ─────────────────────────────────────────────────────────────────────────────
-- Fail closed before changing the access boundary.
-- ─────────────────────────────────────────────────────────────────────────────

do $kp_owner_admin_internal_access_preflight$
declare
    expected record;
    v_role_check text;
    v_api_owner oid;
    v_owner_admin oid;
    v_package_reader oid;
    v_version_reader oid;
    v_discovery oid;
    v_route oid;
    v_package_definition_before text;
    v_version_definition_before text;
    v_discovery_definition_before text;
    v_route_definition_before text;
    v_package_normalized_before text;
    v_version_normalized_before text;
    v_discovery_normalized_before text;
    v_route_normalized_before text;
    v_package_owner_before oid;
    v_version_owner_before oid;
    v_discovery_owner_before oid;
    v_route_owner_before oid;
    v_package_acl_before aclitem[];
    v_version_acl_before aclitem[];
    v_discovery_acl_before aclitem[];
    v_route_acl_before aclitem[];
    v_package_config_before text[];
    v_version_config_before text[];
    v_discovery_config_before text[];
    v_route_config_before text[];
    v_package_security_before boolean;
    v_version_security_before boolean;
    v_discovery_security_before boolean;
    v_route_security_before boolean;
    v_package_volatility_before "char";
    v_version_volatility_before "char";
    v_discovery_volatility_before "char";
    v_route_volatility_before "char";
begin
    for expected in
        select relation_name
        from (values
            ('public.profiles'),
            ('public.orders'),
            ('public.packages'),
            ('public.summaries'),
            ('public.package_summaries'),
            ('public.summary_versions')
        ) as required(relation_name)
    loop
        if to_regclass(expected.relation_name) is null then
            raise exception using
                errcode = 'check_violation',
                message = format('Knowledge Platform migration 077 requires %s.', expected.relation_name);
        end if;
    end loop;

    for expected in
        select table_name, column_name, udt_name
        from (values
            ('profiles', 'id', 'uuid'),
            ('profiles', 'role', 'text'),
            ('orders', 'user_id', 'uuid'),
            ('orders', 'package_id', 'uuid'),
            ('orders', 'status', 'text'),
            ('packages', 'id', 'uuid'),
            ('packages', 'is_published', 'bool'),
            ('summaries', 'id', 'uuid'),
            ('summaries', 'lifecycle_status', 'text'),
            ('summaries', 'visibility', 'text'),
            ('package_summaries', 'package_id', 'uuid'),
            ('package_summaries', 'summary_id', 'uuid'),
            ('package_summaries', 'status', 'text'),
            ('summary_versions', 'id', 'uuid'),
            ('summary_versions', 'summary_id', 'uuid'),
            ('summary_versions', 'status', 'text')
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
                    'Knowledge Platform migration 077 requires public.%I.%I type=%s.',
                    expected.table_name,
                    expected.column_name,
                    expected.udt_name
                );
        end if;
    end loop;

    -- Keep the deployed five-role vocabulary check honest when the schema has
    -- one.  If the role column has no check constraint, the text column itself
    -- remains the established application vocabulary boundary.
    select string_agg(pg_catalog.pg_get_constraintdef(c.oid), ' ')
    into v_role_check
    from pg_catalog.pg_constraint c
    where c.conrelid = 'public.profiles'::regclass
      and c.contype = 'c'
      and pg_catalog.pg_get_constraintdef(c.oid) ilike '%role%';

    if v_role_check is not null
       and (
           v_role_check not ilike '%owner%'
           or v_role_check not ilike '%admin%'
           or v_role_check not ilike '%editor%'
           or v_role_check not ilike '%support%'
           or v_role_check not ilike '%user%'
       )
    then
        raise exception using
            errcode = 'check_violation',
            message = 'Knowledge Platform migration 077 requires the complete owner/admin/editor/support/user role vocabulary.',
            detail = v_role_check;
    end if;

    -- All locked KP helpers share the existing controlled API owner boundary.
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
            message = 'Knowledge Platform migration 077 must run as the existing controlled KP API owner.';
    end if;

    v_owner_admin := to_regprocedure('public.kp_is_owner_admin()');
    if v_owner_admin is not null then
        raise exception using
            errcode = 'duplicate_function',
            message = 'Knowledge Platform migration 077 found a pre-existing public.kp_is_owner_admin() function.';
    end if;

    v_package_reader := to_regprocedure('public.kp_can_read_package_summary(uuid, uuid)');
    v_version_reader := to_regprocedure('public.kp_can_read_summary_version(uuid, uuid)');
    if v_package_reader is null or v_version_reader is null then
        raise exception using
            errcode = 'check_violation',
            message = 'Knowledge Platform migration 077 requires the exact 046 Summary access helper signatures.';
    end if;

    if (select count(*)
        from pg_catalog.pg_proc p
        join pg_catalog.pg_namespace n on n.oid = p.pronamespace
        where n.nspname = 'public'
          and p.proname = 'kp_can_read_package_summary') <> 1
       or (select count(*)
           from pg_catalog.pg_proc p
           join pg_catalog.pg_namespace n on n.oid = p.pronamespace
           where n.nspname = 'public'
             and p.proname = 'kp_can_read_summary_version') <> 1
    then
        raise exception using
            errcode = 'duplicate_function',
            message = 'Knowledge Platform migration 077 found an ambiguous Summary access helper overload.';
    end if;

    select p.proowner, p.proacl, p.proconfig, p.prosecdef, p.provolatile,
           pg_catalog.pg_get_functiondef(p.oid)
    into v_package_owner_before, v_package_acl_before, v_package_config_before,
         v_package_security_before, v_package_volatility_before,
         v_package_definition_before
    from pg_catalog.pg_proc p
    join pg_catalog.pg_language l on l.oid = p.prolang
    where p.oid = v_package_reader
      and l.lanname = 'sql';

    select p.proowner, p.proacl, p.proconfig, p.prosecdef, p.provolatile,
           pg_catalog.pg_get_functiondef(p.oid)
    into v_version_owner_before, v_version_acl_before, v_version_config_before,
         v_version_security_before, v_version_volatility_before,
         v_version_definition_before
    from pg_catalog.pg_proc p
    join pg_catalog.pg_language l on l.oid = p.prolang
    where p.oid = v_version_reader
      and l.lanname = 'sql';

    v_package_normalized_before := pg_catalog.regexp_replace(
        lower(v_package_definition_before), '[[:space:]]+', '', 'g'
    );
    v_version_normalized_before := pg_catalog.regexp_replace(
        lower(v_version_definition_before), '[[:space:]]+', '', 'g'
    );

    if v_package_definition_before is null
       or v_version_definition_before is null
       or v_package_owner_before is distinct from v_api_owner
       or v_version_owner_before is distinct from v_api_owner
       or not v_package_security_before
       or not v_version_security_before
       or v_package_volatility_before <> 's'
       or v_version_volatility_before <> 's'
       or v_package_config_before is distinct from array['search_path=pg_catalog, public']::text[]
       or v_version_config_before is distinct from array['search_path=pg_catalog, public']::text[]
       or position('auth.uid()isnotnull' in v_package_normalized_before) = 0
       or position('o.user_id=auth.uid()' in v_package_normalized_before) = 0
       or position('o.package_id=ps.package_id' in v_package_normalized_before) = 0
       or position('ps.status=''active''' in v_package_normalized_before) = 0
       or position('p.is_published=true' in v_package_normalized_before) = 0
       or position('s.lifecycle_status=''active''' in v_package_normalized_before) = 0
       or position('s.visibility=''public_indexable''' in v_package_normalized_before) = 0
       or position('s.visibility=''authenticated''' in v_package_normalized_before) = 0
       or position('s.visibility=''product_entitled''' in v_package_normalized_before) = 0
       or position('o.statusin(''paid'',''free'')' in v_package_normalized_before) = 0
       or position('o.status=''completed''' in v_package_normalized_before) > 0
       or position('public.kp_can_read_package_summary(ps.package_id,ps.summary_id)' in v_version_normalized_before) = 0
       or position('sv.summary_id=target_summary_id' in v_version_normalized_before) = 0
       or position('sv.id=target_version_id' in v_version_normalized_before) = 0
       or position('sv.status=''published''' in v_version_normalized_before) = 0
    then
        raise exception using
            errcode = 'check_violation',
            message = 'Knowledge Platform migration 077 found a missing or divergent 076 Summary entitlement boundary.';
    end if;

    if has_function_privilege('public', v_package_reader, 'EXECUTE')
       or has_function_privilege('public', v_version_reader, 'EXECUTE')
       or not has_function_privilege('anon', v_package_reader, 'EXECUTE')
       or not has_function_privilege('authenticated', v_package_reader, 'EXECUTE')
       or not has_function_privilege('anon', v_version_reader, 'EXECUTE')
       or not has_function_privilege('authenticated', v_version_reader, 'EXECUTE')
    then
        raise exception using
            errcode = 'check_violation',
            message = 'Knowledge Platform migration 077 found divergent Summary entitlement helper grants.';
    end if;

    -- Migration 075 is a protected, entitlement-gated content route plus a
    -- metadata-only discovery surface. Capture both so 077 cannot alter them.
    v_discovery := to_regprocedure('public.kp_read_package_summary_cards(uuid)');
    v_route := to_regprocedure('public.kp_read_summary_route(text, text)');
    if v_discovery is null or v_route is null then
        raise exception using
            errcode = 'check_violation',
            message = 'Knowledge Platform migration 077 requires the installed 075 discovery and protected route surfaces.';
    end if;

    select p.proowner, p.proacl, p.proconfig, p.prosecdef, p.provolatile,
           pg_catalog.pg_get_functiondef(p.oid)
    into v_discovery_owner_before, v_discovery_acl_before,
         v_discovery_config_before, v_discovery_security_before,
         v_discovery_volatility_before, v_discovery_definition_before
    from pg_catalog.pg_proc p
    where p.oid = v_discovery;

    select p.proowner, p.proacl, p.proconfig, p.prosecdef, p.provolatile,
           pg_catalog.pg_get_functiondef(p.oid)
    into v_route_owner_before, v_route_acl_before, v_route_config_before,
         v_route_security_before, v_route_volatility_before,
         v_route_definition_before
    from pg_catalog.pg_proc p
    where p.oid = v_route;

    v_discovery_normalized_before := pg_catalog.regexp_replace(
        lower(v_discovery_definition_before), '[[:space:]]+', '', 'g'
    );
    v_route_normalized_before := pg_catalog.regexp_replace(
        lower(v_route_definition_before), '[[:space:]]+', '', 'g'
    );

    if v_discovery_owner_before is distinct from v_api_owner
       or v_route_owner_before is distinct from v_api_owner
       or not v_discovery_security_before
       or not v_route_security_before
       or v_discovery_volatility_before <> 's'
       or v_route_volatility_before <> 's'
       or v_discovery_config_before is distinct from array['search_path=pg_catalog, public, pg_temp']::text[]
       or v_route_config_before is distinct from array['search_path=pg_catalog, public, pg_temp']::text[]
       or position('kp_can_read_package_summary' in v_discovery_normalized_before) > 0
       or position('kp_can_read_summary_version' in v_discovery_normalized_before) > 0
       or position('content_md' in v_discovery_normalized_before) > 0
       or position('public.kp_can_read_package_summary(' in v_route_normalized_before) = 0
       or position('public.kp_can_read_summary_version(' in v_route_normalized_before) = 0
       or position('content_md' in v_route_normalized_before) = 0
       or position('s.is_published' in v_route_normalized_before) = 0
       or position('p_package_slug' in v_route_normalized_before) = 0
       or position('ps.legacy_slugisnull' in v_route_normalized_before) = 0
       or position('s.canonical_slug=lower(btrim(p_slug))' in v_route_normalized_before) = 0
       or position('p.slug=btrim(p_package_slug)' in v_route_normalized_before) = 0
    then
        raise exception using
            errcode = 'check_violation',
            message = 'Knowledge Platform migration 077 found a weakened 075 discovery/content boundary.';
    end if;

    if has_function_privilege('public', v_discovery, 'EXECUTE')
       or has_function_privilege('public', v_route, 'EXECUTE')
       or not has_function_privilege('anon', v_discovery, 'EXECUTE')
       or not has_function_privilege('authenticated', v_discovery, 'EXECUTE')
       or not has_function_privilege('service_role', v_discovery, 'EXECUTE')
       or not has_function_privilege('anon', v_route, 'EXECUTE')
       or not has_function_privilege('authenticated', v_route, 'EXECUTE')
       or not has_function_privilege('service_role', v_route, 'EXECUTE')
    then
        raise exception using
            errcode = 'check_violation',
            message = 'Knowledge Platform migration 077 found divergent 075 discovery/content grants.';
    end if;
end
$kp_owner_admin_internal_access_preflight$;

-- ─────────────────────────────────────────────────────────────────────────────
-- Exact internal role predicate.
-- ─────────────────────────────────────────────────────────────────────────────

create function public.kp_is_owner_admin()
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public
as $function$
    select auth.uid() is not null
       and exists (
        select 1
        from public.profiles p
        where p.id = auth.uid()
          and p.role in ('owner', 'admin')
    )
$function$;

comment on function public.kp_is_owner_admin() is
    'Internal Package access predicate for authenticated Owner/Admin profiles only.';

revoke all on function public.kp_is_owner_admin()
    from public, anon;

grant execute on function public.kp_is_owner_admin()
    to authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- Add the one Owner/Admin branch to product_entitled Summary access.
-- ─────────────────────────────────────────────────────────────────────────────

create or replace function public.kp_can_read_package_summary(
    target_package_id uuid,
    target_summary_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public
as $function$
    select exists (
        select 1
        from public.package_summaries ps
        join public.packages p on p.id = ps.package_id
        join public.summaries s on s.id = ps.summary_id
        where ps.package_id = target_package_id
          and ps.summary_id = target_summary_id
          and ps.status = 'active'
          and p.is_published = true
          and s.lifecycle_status = 'active'
          and (
              s.visibility = 'public_indexable'
              or (
                  s.visibility = 'authenticated'
                  and auth.uid() is not null
              )
              or (
                  s.visibility = 'product_entitled'
                  and (
                      public.kp_is_owner_admin()
                      or (
                          auth.uid() is not null
                          and exists (
                              select 1
                              from public.orders o
                              where o.user_id = auth.uid()
                                and o.package_id = ps.package_id
                                and o.status in ('paid', 'free')
                          )
                      )
                  )
              )
          )
    )
$function$;

-- ─────────────────────────────────────────────────────────────────────────────
-- Catalog postflight: prove only the intended branch changed.
-- ─────────────────────────────────────────────────────────────────────────────

do $kp_owner_admin_internal_access_postflight$
declare
    v_api_owner oid;
    v_owner_admin oid;
    v_package_reader oid;
    v_version_reader oid;
    v_discovery oid;
    v_route oid;
    v_owner_admin_definition text;
    v_package_definition_after text;
    v_version_definition_after text;
    v_discovery_definition_after text;
    v_route_definition_after text;
    v_owner_admin_normalized text;
    v_package_normalized_after text;
    v_version_normalized_after text;
    v_discovery_normalized_after text;
    v_route_normalized_after text;
    v_owner_admin_owner oid;
    v_owner_admin_acl aclitem[];
    v_owner_admin_config text[];
    v_owner_admin_security boolean;
    v_owner_admin_volatility "char";
    v_package_owner_after oid;
    v_version_owner_after oid;
    v_discovery_owner_after oid;
    v_route_owner_after oid;
    v_package_acl_after aclitem[];
    v_version_acl_after aclitem[];
    v_discovery_acl_after aclitem[];
    v_route_acl_after aclitem[];
    v_package_config_after text[];
    v_version_config_after text[];
    v_discovery_config_after text[];
    v_route_config_after text[];
    v_package_security_after boolean;
    v_version_security_after boolean;
    v_discovery_security_after boolean;
    v_route_security_after boolean;
    v_package_volatility_after "char";
    v_version_volatility_after "char";
    v_discovery_volatility_after "char";
    v_route_volatility_after "char";
begin
    v_api_owner := (
        select p.proowner
        from pg_catalog.pg_proc p
        where p.oid = to_regprocedure('public.kp_persist_require_actor(uuid)')
    );
    v_owner_admin := to_regprocedure('public.kp_is_owner_admin()');
    v_package_reader := to_regprocedure('public.kp_can_read_package_summary(uuid, uuid)');
    v_version_reader := to_regprocedure('public.kp_can_read_summary_version(uuid, uuid)');
    v_discovery := to_regprocedure('public.kp_read_package_summary_cards(uuid)');
    v_route := to_regprocedure('public.kp_read_summary_route(text, text)');

    if v_owner_admin is null
       or (select count(*) from pg_catalog.pg_proc p
           join pg_catalog.pg_namespace n on n.oid = p.pronamespace
           where n.nspname = 'public' and p.proname = 'kp_is_owner_admin') <> 1
    then
        raise exception using
            errcode = 'check_violation',
            message = 'Knowledge Platform migration 077 failed to install one exact Owner/Admin predicate.';
    end if;

    select p.proowner, p.proacl, p.proconfig, p.prosecdef, p.provolatile,
           pg_catalog.pg_get_functiondef(p.oid)
    into v_owner_admin_owner, v_owner_admin_acl, v_owner_admin_config,
         v_owner_admin_security, v_owner_admin_volatility,
         v_owner_admin_definition
    from pg_catalog.pg_proc p
    where p.oid = v_owner_admin;

    v_owner_admin_normalized := pg_catalog.regexp_replace(
        lower(v_owner_admin_definition), '[[:space:]]+', '', 'g'
    );

    if v_owner_admin_owner is distinct from v_api_owner
       or not v_owner_admin_security
       or v_owner_admin_volatility <> 's'
       or v_owner_admin_config is distinct from array['search_path=pg_catalog, public']::text[]
       or position('auth.uid()isnotnull' in v_owner_admin_normalized) = 0
       or position('p.id=auth.uid()' in v_owner_admin_normalized) = 0
       or position('p.rolein(''owner'',''admin'')' in v_owner_admin_normalized) = 0
       or position('editor' in v_owner_admin_normalized) > 0
       or position('support' in v_owner_admin_normalized) > 0
       or position('user' in v_owner_admin_normalized) > 0
    then
        raise exception using
            errcode = 'check_violation',
            message = 'Knowledge Platform migration 077 installed a divergent Owner/Admin role predicate.';
    end if;

    if has_function_privilege('public', v_owner_admin, 'EXECUTE')
       or has_function_privilege('anon', v_owner_admin, 'EXECUTE')
       or not has_function_privilege('authenticated', v_owner_admin, 'EXECUTE')
    then
        raise exception using
            errcode = 'check_violation',
            message = 'Knowledge Platform migration 077 installed divergent Owner/Admin predicate grants.';
    end if;

    select p.proowner, p.proacl, p.proconfig, p.prosecdef, p.provolatile,
           pg_catalog.pg_get_functiondef(p.oid)
    into v_package_owner_after, v_package_acl_after, v_package_config_after,
         v_package_security_after, v_package_volatility_after,
         v_package_definition_after
    from pg_catalog.pg_proc p
    where p.oid = v_package_reader;

    v_package_normalized_after := pg_catalog.regexp_replace(
        lower(v_package_definition_after), '[[:space:]]+', '', 'g'
    );

    if v_package_owner_after is distinct from v_api_owner
       or not v_package_security_after
       or v_package_volatility_after <> 's'
       or v_package_config_after is distinct from array['search_path=pg_catalog, public']::text[]
       or has_function_privilege('public', v_package_reader, 'EXECUTE')
       or not has_function_privilege('anon', v_package_reader, 'EXECUTE')
       or not has_function_privilege('authenticated', v_package_reader, 'EXECUTE')
       or position('public.kp_is_owner_admin()' in v_package_normalized_after) = 0
       or position('auth.uid()isnotnull' in v_package_normalized_after) = 0
       or position('o.user_id=auth.uid()' in v_package_normalized_after) = 0
       or position('o.package_id=ps.package_id' in v_package_normalized_after) = 0
       or position('ps.status=''active''' in v_package_normalized_after) = 0
       or position('p.is_published=true' in v_package_normalized_after) = 0
       or position('s.lifecycle_status=''active''' in v_package_normalized_after) = 0
       or position('s.visibility=''public_indexable''' in v_package_normalized_after) = 0
       or position('s.visibility=''authenticated''' in v_package_normalized_after) = 0
       or position('s.visibility=''product_entitled''' in v_package_normalized_after) = 0
       or position('o.statusin(''paid'',''free'')' in v_package_normalized_after) = 0
       or position('o.status=''completed''' in v_package_normalized_after) > 0
    then
        raise exception using
            errcode = 'check_violation',
            message = 'Knowledge Platform migration 077 failed to preserve the paid/free Summary entitlement boundary.';
    end if;

    select p.proowner, p.proacl, p.proconfig, p.prosecdef, p.provolatile,
           pg_catalog.pg_get_functiondef(p.oid)
    into v_version_owner_after, v_version_acl_after, v_version_config_after,
         v_version_security_after, v_version_volatility_after,
         v_version_definition_after
    from pg_catalog.pg_proc p
    where p.oid = v_version_reader;

    v_version_normalized_after := pg_catalog.regexp_replace(
        lower(v_version_definition_after), '[[:space:]]+', '', 'g'
    );

    if v_version_owner_after is distinct from v_api_owner
       or not v_version_security_after
       or v_version_volatility_after <> 's'
       or v_version_config_after is distinct from array['search_path=pg_catalog, public']::text[]
       or has_function_privilege('public', v_version_reader, 'EXECUTE')
       or not has_function_privilege('anon', v_version_reader, 'EXECUTE')
       or not has_function_privilege('authenticated', v_version_reader, 'EXECUTE')
       or position('public.kp_can_read_package_summary(ps.package_id,ps.summary_id)' in v_version_normalized_after) = 0
       or position('sv.summary_id=target_summary_id' in v_version_normalized_after) = 0
       or position('sv.id=target_version_id' in v_version_normalized_after) = 0
       or position('sv.status=''published''' in v_version_normalized_after) = 0
       or position('kp_is_owner_admin' in lower(v_version_definition_after)) > 0
    then
        raise exception using
            errcode = 'check_violation',
            message = 'Knowledge Platform migration 077 found a divergent or duplicated Summary-version access branch.';
    end if;

    -- Re-read the 075 surfaces and compare their complete catalog security
    -- envelopes.  077 has no authority to alter discovery or content routing.
    select p.proowner, p.proacl, p.proconfig, p.prosecdef, p.provolatile,
           pg_catalog.pg_get_functiondef(p.oid)
    into v_discovery_owner_after, v_discovery_acl_after,
         v_discovery_config_after, v_discovery_security_after,
         v_discovery_volatility_after, v_discovery_definition_after
    from pg_catalog.pg_proc p
    where p.oid = v_discovery;

    select p.proowner, p.proacl, p.proconfig, p.prosecdef, p.provolatile,
           pg_catalog.pg_get_functiondef(p.oid)
    into v_route_owner_after, v_route_acl_after, v_route_config_after,
         v_route_security_after, v_route_volatility_after,
         v_route_definition_after
    from pg_catalog.pg_proc p
    where p.oid = v_route;

    v_discovery_normalized_after := pg_catalog.regexp_replace(
        lower(v_discovery_definition_after), '[[:space:]]+', '', 'g'
    );
    v_route_normalized_after := pg_catalog.regexp_replace(
        lower(v_route_definition_after), '[[:space:]]+', '', 'g'
    );

    if v_discovery_owner_after is distinct from v_api_owner
       or not v_discovery_security_after
       or v_discovery_volatility_after <> 's'
       or v_discovery_config_after is distinct from array['search_path=pg_catalog, public, pg_temp']::text[]
       or v_route_owner_after is distinct from v_api_owner
       or not v_route_security_after
       or v_route_volatility_after <> 's'
       or v_route_config_after is distinct from array['search_path=pg_catalog, public, pg_temp']::text[]
       or position('kp_can_read_package_summary' in v_discovery_normalized_after) > 0
       or position('kp_can_read_summary_version' in v_discovery_normalized_after) > 0
       or position('content_md' in v_discovery_normalized_after) > 0
       or position('public.kp_can_read_package_summary(' in v_route_normalized_after) = 0
       or position('public.kp_can_read_summary_version(' in v_route_normalized_after) = 0
       or position('content_md' in v_route_normalized_after) = 0
       or position('s.is_published' in v_route_normalized_after) = 0
       or position('p_package_slug' in v_route_normalized_after) = 0
       or position('ps.legacy_slugisnull' in v_route_normalized_after) = 0
       or position('s.canonical_slug=lower(btrim(p_slug))' in v_route_normalized_after) = 0
       or position('p.slug=btrim(p_package_slug)' in v_route_normalized_after) = 0
    then
        raise exception using
            errcode = 'check_violation',
            message = 'Knowledge Platform migration 077 changed a protected 075 discovery or route surface.';
    end if;

    if has_function_privilege('public', v_discovery, 'EXECUTE')
       or has_function_privilege('public', v_route, 'EXECUTE')
       or not has_function_privilege('anon', v_discovery, 'EXECUTE')
       or not has_function_privilege('authenticated', v_discovery, 'EXECUTE')
       or not has_function_privilege('service_role', v_discovery, 'EXECUTE')
       or not has_function_privilege('anon', v_route, 'EXECUTE')
       or not has_function_privilege('authenticated', v_route, 'EXECUTE')
       or not has_function_privilege('service_role', v_route, 'EXECUTE')
    then
        raise exception using
            errcode = 'check_violation',
            message = 'Knowledge Platform migration 077 changed a protected 075 execution boundary.';
    end if;
end
$kp_owner_admin_internal_access_postflight$;

notify pgrst, 'reload schema';
