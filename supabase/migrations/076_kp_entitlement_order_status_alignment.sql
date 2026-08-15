-- 076_kp_entitlement_order_status_alignment.sql
-- Sobdai Knowledge Platform — align product entitlement with the effective
-- Orders status vocabulary installed by migration 011.
--
-- Migration 046's package access predicate was frozen against the pre-011
-- `completed` order value.  Migration 011 normalizes that value to `paid` or
-- `free` and rejects `completed` thereafter.  This forward-only migration
-- replaces that one stale entitlement comparison in the installed helper.
-- The catalog-driven replacement deliberately preserves the function's
-- signature, owner, ACL, SECURITY DEFINER mode, locked search_path, and every
-- other authorization predicate.  Migration 075 discovery remains metadata
-- only; protected Summary content remains behind the two access helpers.

set local lock_timeout = '5s';

do $kp_entitlement_status_alignment$
declare
    v_orders oid;
    v_status_check text;
    v_api_owner oid;
    v_package_reader oid;
    v_version_reader oid;
    v_discovery oid;
    v_route oid;
    v_package_definition_before text;
    v_package_definition_after text;
    v_package_normalized_before text;
    v_package_normalized_after text;
    v_version_definition_before text;
    v_version_normalized_before text;
    v_version_definition_after text;
    v_discovery_definition_before text;
    v_route_definition_before text;
    v_discovery_definition_after text;
    v_route_definition_after text;
    v_package_owner_before oid;
    v_version_owner_before oid;
    v_discovery_owner_before oid;
    v_route_owner_before oid;
    v_package_owner_after oid;
    v_version_owner_after oid;
    v_package_acl_before aclitem[];
    v_version_acl_before aclitem[];
    v_discovery_acl_before aclitem[];
    v_route_acl_before aclitem[];
    v_package_acl_after aclitem[];
    v_version_acl_after aclitem[];
    v_package_config_before text[];
    v_version_config_before text[];
    v_discovery_config_before text[];
    v_route_config_before text[];
    v_package_config_after text[];
    v_version_config_after text[];
    v_package_security_before boolean;
    v_version_security_before boolean;
    v_discovery_security_before boolean;
    v_route_security_before boolean;
    v_package_security_after boolean;
    v_version_security_after boolean;
    v_package_volatility_before "char";
    v_version_volatility_before "char";
    v_discovery_volatility_before "char";
    v_route_volatility_before "char";
    v_package_volatility_after "char";
    v_version_volatility_after "char";
    v_old_literal constant text := 'o.status = ''completed''';
    v_new_literal constant text := 'o.status in (''paid'', ''free'')';
    v_old_pattern constant text := 'o[[:space:]]*\.[[:space:]]*status[[:space:]]*=[[:space:]]*''completed''';
    v_new_pattern constant text := 'o[[:space:]]*\.[[:space:]]*status[[:space:]]+in[[:space:]]*\([[:space:]]*''paid''[[:space:]]*,[[:space:]]*''free''[[:space:]]*\)';
    v_old_match_count integer;
    v_new_match_count integer;
    v_status_reference_count integer;
begin
    -- The status constraint is an effective prerequisite, not a migration
    -- history assertion.  Reject a database that still accepts `completed` or
    -- otherwise diverges from migration 011's six-value vocabulary.
    v_orders := to_regclass('public.orders');
    if v_orders is null then
        raise exception using
            errcode = 'check_violation',
            message = 'Knowledge Platform migration 076 requires public.orders.';
    end if;

    if not exists (
        select 1
        from information_schema.columns c
        where c.table_schema = 'public'
          and c.table_name = 'orders'
          and c.column_name = 'status'
          and c.udt_name = 'text'
    ) then
        raise exception using
            errcode = 'check_violation',
            message = 'Knowledge Platform migration 076 requires public.orders.status text.';
    end if;

    select pg_catalog.pg_get_constraintdef(c.oid)
    into v_status_check
    from pg_catalog.pg_constraint c
    where c.conrelid = v_orders
      and c.conname = 'orders_status_check'
      and c.contype = 'c'
      and c.convalidated;

    if v_status_check is null
       or position('free' in lower(v_status_check)) = 0
       or position('pending' in lower(v_status_check)) = 0
       or position('paid' in lower(v_status_check)) = 0
       or position('failed' in lower(v_status_check)) = 0
       or position('refunded' in lower(v_status_check)) = 0
       or position('cancelled' in lower(v_status_check)) = 0
       or position('completed' in lower(v_status_check)) > 0
    then
        raise exception using
            errcode = 'check_violation',
            message = 'Knowledge Platform migration 076 requires the validated migration-011 Orders status vocabulary (free, pending, paid, failed, refunded, cancelled).';
    end if;

    -- Use the same controlled owner boundary as the locked persistence API.
    -- The helper owners must already be that owner; a divergent owner or
    -- security configuration is never silently repaired by this migration.
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
            message = 'Knowledge Platform migration 076 must run as the existing controlled KP API owner.';
    end if;

    v_package_reader := to_regprocedure('public.kp_can_read_package_summary(uuid, uuid)');
    v_version_reader := to_regprocedure('public.kp_can_read_summary_version(uuid, uuid)');
    if v_package_reader is null or v_version_reader is null then
        raise exception using
            errcode = 'check_violation',
            message = 'Knowledge Platform migration 076 requires the exact 046 entitlement helper signatures.';
    end if;

    if (select count(*) from pg_catalog.pg_proc p
        join pg_catalog.pg_namespace n on n.oid = p.pronamespace
        where n.nspname = 'public' and p.proname = 'kp_can_read_package_summary') <> 1
       or (select count(*) from pg_catalog.pg_proc p
           join pg_catalog.pg_namespace n on n.oid = p.pronamespace
           where n.nspname = 'public' and p.proname = 'kp_can_read_summary_version') <> 1
    then
        raise exception using
            errcode = 'duplicate_function',
            message = 'Knowledge Platform migration 076 found an ambiguous KP entitlement helper overload.';
    end if;

    select p.proowner, p.proacl, p.proconfig, p.prosecdef, p.provolatile,
           pg_catalog.pg_get_functiondef(p.oid)
    into v_package_owner_before, v_package_acl_before,
         v_package_config_before, v_package_security_before,
         v_package_volatility_before, v_package_definition_before
    from pg_catalog.pg_proc p
    join pg_catalog.pg_language l on l.oid = p.prolang
    where p.oid = v_package_reader
      and l.lanname = 'sql';

    select p.proowner, p.proacl, p.proconfig, p.prosecdef, p.provolatile,
           pg_catalog.pg_get_functiondef(p.oid)
    into v_version_owner_before, v_version_acl_before,
         v_version_config_before, v_version_security_before,
         v_version_volatility_before, v_version_definition_before
    from pg_catalog.pg_proc p
    join pg_catalog.pg_language l on l.oid = p.prolang
    where p.oid = v_version_reader
      and l.lanname = 'sql';

    v_package_normalized_before := pg_catalog.regexp_replace(
        lower(v_package_definition_before),
        '[[:space:]]+',
        '',
        'g'
    );
    v_version_normalized_before := pg_catalog.regexp_replace(
        lower(v_version_definition_before),
        '[[:space:]]+',
        '',
        'g'
    );
    select count(*)
    into v_old_match_count
    from pg_catalog.regexp_matches(lower(v_package_definition_before), v_old_pattern, 'g');
    select count(*)
    into v_new_match_count
    from pg_catalog.regexp_matches(lower(v_package_definition_before), v_new_pattern, 'g');
    select count(*)
    into v_status_reference_count
    from pg_catalog.regexp_matches(lower(v_package_definition_before), 'o[[:space:]]*\.[[:space:]]*status', 'g');

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
       or v_old_match_count <> 1
       or v_new_match_count > 0
       or v_status_reference_count <> 1
       or position('auth.uid()isnotnull' in v_package_normalized_before) = 0
       or position('o.user_id=auth.uid()' in v_package_normalized_before) = 0
       or position('o.package_id=ps.package_id' in v_package_normalized_before) = 0
       or position('ps.status=''active''' in v_package_normalized_before) = 0
       or position('p.is_published=true' in v_package_normalized_before) = 0
       or position('s.lifecycle_status=''active''' in v_package_normalized_before) = 0
       or position('s.visibility=''product_entitled''' in v_package_normalized_before) = 0
       or position('public.kp_can_read_package_summary(' in v_version_normalized_before) = 0
       or position('sv.status=''published''' in v_version_normalized_before) = 0
    then
        raise exception using
            errcode = 'check_violation',
            message = 'Knowledge Platform migration 076 found a missing, divergent, or already-updated 046 entitlement helper.';
    end if;

    if v_old_match_count <> 1 then
        raise exception using
            errcode = 'check_violation',
            message = 'Knowledge Platform migration 076 requires exactly one obsolete completed-order predicate in kp_can_read_package_summary.';
    end if;

    -- Preserve the existing execution boundary.  No table privileges or RLS
    -- policy is granted by this migration.
    if has_function_privilege('public', v_package_reader, 'EXECUTE')
       or has_function_privilege('public', v_version_reader, 'EXECUTE')
       or not has_function_privilege('anon', v_package_reader, 'EXECUTE')
       or not has_function_privilege('authenticated', v_package_reader, 'EXECUTE')
       or not has_function_privilege('anon', v_version_reader, 'EXECUTE')
       or not has_function_privilege('authenticated', v_version_reader, 'EXECUTE')
    then
        raise exception using
            errcode = 'check_violation',
            message = 'Knowledge Platform migration 076 found divergent entitlement helper grants.';
    end if;

    -- 075 is a metadata-only discovery surface and its protected content route
    -- must remain exactly the installed contract while this helper is replaced.
    v_discovery := to_regprocedure('public.kp_read_package_summary_cards(uuid)');
    v_route := to_regprocedure('public.kp_read_summary_route(text, text)');
    if v_discovery is null or v_route is null then
        raise exception using
            errcode = 'check_violation',
            message = 'Knowledge Platform migration 076 requires the 075 discovery and protected Summary route surfaces.';
    end if;

    select p.proowner, p.proacl, p.proconfig, p.prosecdef, p.provolatile,
           pg_catalog.pg_get_functiondef(p.oid)
    into v_discovery_owner_before, v_discovery_acl_before,
         v_discovery_config_before, v_discovery_security_before,
         v_discovery_volatility_before, v_discovery_definition_before
    from pg_catalog.pg_proc p
    where p.oid = to_regprocedure('public.kp_read_package_summary_cards(uuid)');

    select p.proowner, p.proacl, p.proconfig, p.prosecdef, p.provolatile,
           pg_catalog.pg_get_functiondef(p.oid)
    into v_route_owner_before, v_route_acl_before,
         v_route_config_before, v_route_security_before,
         v_route_volatility_before, v_route_definition_before
    from pg_catalog.pg_proc p
    where p.oid = to_regprocedure('public.kp_read_summary_route(text, text)');

    if v_discovery_owner_before is distinct from v_api_owner
       or not v_discovery_security_before
       or v_discovery_volatility_before <> 's'
       or v_discovery_config_before is distinct from array['search_path=pg_catalog, public, pg_temp']::text[]
       or position('kp_can_read_package_summary' in lower(v_discovery_definition_before)) > 0
       or position('kp_can_read_summary_version' in lower(v_discovery_definition_before)) > 0
       or position('content_md' in lower(v_discovery_definition_before)) > 0
       or v_route_owner_before is distinct from v_api_owner
       or not v_route_security_before
       or v_route_config_before is distinct from array['search_path=pg_catalog, public, pg_temp']::text[]
       or position('public.kp_can_read_package_summary(' in lower(v_route_definition_before)) = 0
       or position('public.kp_can_read_summary_version(' in lower(v_route_definition_before)) = 0
       or position('content_md' in lower(v_route_definition_before)) = 0
       or position('s.is_published' in lower(v_route_definition_before)) = 0
    then
        raise exception using
            errcode = 'check_violation',
            message = 'Knowledge Platform migration 076 found a weakened 075 discovery/content boundary.';
    end if;

    if has_function_privilege('public', to_regprocedure('public.kp_read_package_summary_cards(uuid)'), 'EXECUTE')
       or has_function_privilege('public', to_regprocedure('public.kp_read_summary_route(text, text)'), 'EXECUTE')
       or not has_function_privilege('anon', to_regprocedure('public.kp_read_package_summary_cards(uuid)'), 'EXECUTE')
       or not has_function_privilege('authenticated', to_regprocedure('public.kp_read_package_summary_cards(uuid)'), 'EXECUTE')
       or not has_function_privilege('service_role', to_regprocedure('public.kp_read_package_summary_cards(uuid)'), 'EXECUTE')
       or not has_function_privilege('anon', to_regprocedure('public.kp_read_summary_route(text, text)'), 'EXECUTE')
       or not has_function_privilege('authenticated', to_regprocedure('public.kp_read_summary_route(text, text)'), 'EXECUTE')
       or not has_function_privilege('service_role', to_regprocedure('public.kp_read_summary_route(text, text)'), 'EXECUTE')
    then
        raise exception using
            errcode = 'check_violation',
            message = 'Knowledge Platform migration 076 found divergent 075 discovery/content grants.';
    end if;

    -- Recreate the installed package helper from the catalog, changing only
    -- the stale status comparison.  This keeps all existing business and
    -- security clauses byte-for-byte otherwise.
    execute pg_catalog.regexp_replace(
        v_package_definition_before,
        v_old_pattern,
        v_new_literal,
        'g'
    );

    select pg_catalog.pg_get_functiondef(v_package_reader)
    into v_package_definition_after;
    if v_package_definition_after is distinct from pg_catalog.regexp_replace(
        v_package_definition_before,
        v_old_pattern,
        v_new_literal,
        'g'
    ) then
        raise exception using
            errcode = 'check_violation',
            message = 'Knowledge Platform migration 076 failed to install the paid/free entitlement predicate.';
    end if;

    -- Re-read all catalog identity/security fields and the untouched 075
    -- definitions.  A changed owner, ACL, setting, route, or discovery body is
    -- a hard failure rather than something this migration attempts to repair.
    select p.proowner, p.proacl, p.proconfig, p.prosecdef, p.provolatile
    into v_package_owner_after, v_package_acl_after, v_package_config_after,
         v_package_security_after, v_package_volatility_after
    from pg_catalog.pg_proc p
    where p.oid = v_package_reader;

    if v_package_owner_after is distinct from v_package_owner_before
       or v_package_acl_after is distinct from v_package_acl_before
       or v_package_config_after is distinct from v_package_config_before
       or v_package_security_after is distinct from v_package_security_before
       or v_package_volatility_after is distinct from v_package_volatility_before
    then
        raise exception using
            errcode = 'check_violation',
            message = 'Knowledge Platform migration 076 changed the package entitlement helper security boundary.';
    end if;

    if to_regprocedure('public.kp_can_read_package_summary(uuid, uuid)') is distinct from v_package_reader
       or to_regprocedure('public.kp_can_read_summary_version(uuid, uuid)') is distinct from v_version_reader
    then
        raise exception using
            errcode = 'check_violation',
            message = 'Knowledge Platform migration 076 changed an entitlement helper signature.';
    end if;

    select p.proowner, p.proacl, p.proconfig, p.prosecdef, p.provolatile,
           pg_catalog.pg_get_functiondef(p.oid)
    into v_version_owner_after, v_version_acl_after, v_version_config_after,
         v_version_security_after, v_version_volatility_after,
         v_version_definition_after
    from pg_catalog.pg_proc p
    where p.oid = v_version_reader;

    if v_version_owner_after is distinct from v_version_owner_before
       or v_version_acl_after is distinct from v_version_acl_before
       or v_version_config_after is distinct from v_version_config_before
       or v_version_security_after is distinct from v_version_security_before
       or v_version_volatility_after is distinct from v_version_volatility_before
       or v_version_definition_after is distinct from v_version_definition_before
    then
        raise exception using
            errcode = 'check_violation',
            message = 'Knowledge Platform migration 076 changed the summary-version entitlement helper.';
    end if;

    select pg_catalog.pg_get_functiondef(to_regprocedure('public.kp_read_package_summary_cards(uuid)'))
    into v_discovery_definition_after;
    select pg_catalog.pg_get_functiondef(to_regprocedure('public.kp_read_summary_route(text, text)'))
    into v_route_definition_after;

    if v_discovery_definition_after is distinct from v_discovery_definition_before
       or v_route_definition_after is distinct from v_route_definition_before
    then
        raise exception using
            errcode = 'check_violation',
            message = 'Knowledge Platform migration 076 changed a migration-075 discovery or protected-route definition.';
    end if;

    if exists (
        select 1
        from pg_catalog.pg_proc p
        where p.oid = v_discovery
          and (
              p.proowner is distinct from v_discovery_owner_before
              or p.proacl is distinct from v_discovery_acl_before
              or p.proconfig is distinct from v_discovery_config_before
              or p.prosecdef is distinct from v_discovery_security_before
              or p.provolatile is distinct from v_discovery_volatility_before
          )
    )
       or exists (
        select 1
        from pg_catalog.pg_proc p
        where p.oid = v_route
          and (
              p.proowner is distinct from v_route_owner_before
              or p.proacl is distinct from v_route_acl_before
              or p.proconfig is distinct from v_route_config_before
              or p.prosecdef is distinct from v_route_security_before
              or p.provolatile is distinct from v_route_volatility_before
          )
    ) then
        raise exception using
            errcode = 'check_violation',
            message = 'Knowledge Platform migration 076 changed a migration-075 discovery or protected-route security boundary.';
    end if;

    -- Postflight semantics: paid/free are the only granting order states, and
    -- no installed KP authorization surface may retain the obsolete literal.
    select pg_catalog.pg_get_functiondef(v_package_reader)
    into v_package_definition_after;
    v_package_normalized_after := pg_catalog.regexp_replace(
        lower(v_package_definition_after),
        '[[:space:]]+',
        '',
        'g'
    );
    select count(*)
    into v_new_match_count
    from pg_catalog.regexp_matches(lower(v_package_definition_after), v_new_pattern, 'g');
    select count(*)
    into v_old_match_count
    from pg_catalog.regexp_matches(lower(v_package_definition_after), v_old_pattern, 'g');
    select count(*)
    into v_status_reference_count
    from pg_catalog.regexp_matches(lower(v_package_definition_after), 'o[[:space:]]*\.[[:space:]]*status', 'g');
    if v_new_match_count <> 1
       or v_old_match_count > 0
       or v_status_reference_count <> 1
       or position('o.statusin(''paid'',''free'')' in v_package_normalized_after) = 0
       or position('o.user_id=auth.uid()' in v_package_normalized_after) = 0
       or position('o.package_id=ps.package_id' in v_package_normalized_after) = 0
       or position('auth.uid()isnotnull' in v_package_normalized_after) = 0
    then
        raise exception using
            errcode = 'check_violation',
            message = 'Knowledge Platform migration 076 failed its paid/free-only entitlement postflight.';
    end if;

    if exists (
        select 1
        from pg_catalog.pg_proc p
        join pg_catalog.pg_namespace n on n.oid = p.pronamespace
        where n.nspname = 'public'
          and (p.proname like 'kp_can_read_%' or p.proname like 'kp_read_%summary%')
          and exists (
              select 1
              from pg_catalog.regexp_matches(
                  lower(pg_catalog.pg_get_functiondef(p.oid)),
                  v_old_pattern,
                  'g'
              )
          )
    )
       or exists (
        select 1
        from pg_catalog.pg_policy pol
        where pol.polrelid in (
            'public.summaries'::regclass,
            'public.package_summaries'::regclass,
            'public.summary_versions'::regclass
        )
          and position('completed' in lower(
              coalesce(pg_catalog.pg_get_expr(pol.polqual, pol.polrelid), '') || ' ' ||
              coalesce(pg_catalog.pg_get_expr(pol.polwithcheck, pol.polrelid), '')
          )) > 0
    )
       or exists (
        select 1
        from pg_catalog.pg_class c
        join pg_catalog.pg_namespace n on n.oid = c.relnamespace
        where n.nspname = 'public'
          and c.relkind in ('v', 'm')
          and c.relname like 'kp_%summary%'
          and position('completed' in lower(pg_catalog.pg_get_viewdef(c.oid, true))) > 0
    )
    then
        raise exception using
            errcode = 'check_violation',
            message = 'Knowledge Platform migration 076 found an obsolete completed-order entitlement check in the installed KP authorization surface.';
    end if;
end
$kp_entitlement_status_alignment$;

notify pgrst, 'reload schema';
