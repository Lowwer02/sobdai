-- 074_kp_schema_qualified_uuid_generation.sql
-- Sobdai Knowledge Platform — schema-qualified UUID generation for locked writers.
--
-- The deployed uuid-ossp extension lives in the extensions schema while the
-- frozen persistence writers deliberately run with a narrow search_path. Keep
-- that locked configuration and replace only the UUID generator reference in
-- the five affected writer definitions. 071/072 also contain a stale
-- public.uuid_generate_v4() qualification; it is the same wrong-schema defect
-- and is normalized by the same forward-only replacement.

set local lock_timeout = '5s';

do $kp_uuid_generation_preflight$
declare
    v_api_owner oid;
    v_function oid;
    v_definition text;
    v_signature text;
begin
    if to_regnamespace('extensions') is null
       or to_regprocedure('extensions.uuid_generate_v4()') is null
    then
        raise exception using
            errcode = 'check_violation',
            message = 'Knowledge Platform migration 074 requires extensions.uuid_generate_v4() in the extensions schema.';
    end if;

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
            message = 'Knowledge Platform migration 074 must run as the existing persistence API owner.';
    end if;

    for v_signature in
        select required_signature
        from (values
            ('public.kp_persist_publish_compatibility_revision(uuid,uuid,uuid,jsonb)'),
            ('public.kp_persist_register_summary_alias(uuid,text,text,text,uuid)'),
            ('public.kp_persist_replace_compatibility_summary(uuid,uuid,text,uuid,text,text,text,text,text,text,text,integer,text,text,text,uuid,integer,integer,boolean)'),
            ('public.kp_persist_replace_summary_sources(uuid,jsonb,uuid)'),
            ('public.kp_persist_update_compatibility_summary(uuid,uuid,text,text,text,text,text,text,text,text,integer,text,text,text,uuid,integer,integer,text,uuid[])')
        ) as required(required_signature)
    loop
        v_function := to_regprocedure(v_signature);
        if v_function is null then
            raise exception using
                errcode = 'check_violation',
                message = format('Knowledge Platform migration 074 requires the exact installed writer signature: %s.', v_signature);
        end if;

        select pg_catalog.pg_get_functiondef(p.oid)
        into v_definition
        from pg_catalog.pg_proc p
        where p.oid = v_function
          and p.proowner = v_api_owner
          and p.prosecdef
          and coalesce(array_to_string(p.proconfig, ','), '') ilike '%search_path=pg_catalog, public, pg_temp%'
          and coalesce(array_to_string(p.proconfig, ','), '') ilike '%lock_timeout=5s%';

        if v_definition is null
           or position('uuid_generate_v4()' in lower(v_definition)) = 0
           or position('extensions.uuid_generate_v4()' in lower(v_definition)) > 0
        then
            raise exception using
                errcode = 'check_violation',
                message = format('Knowledge Platform migration 074 found a missing or already-divergent UUID generator in %s.', v_signature);
        end if;

        if has_function_privilege('public', v_function, 'EXECUTE')
           or has_function_privilege('anon', v_function, 'EXECUTE')
           or has_function_privilege('authenticated', v_function, 'EXECUTE')
           or not has_function_privilege('service_role', v_function, 'EXECUTE')
        then
            raise exception using
                errcode = 'check_violation',
                message = format('Knowledge Platform migration 074 found divergent execution grants on %s.', v_signature);
        end if;
    end loop;
end
$kp_uuid_generation_preflight$;

-- Recreate the installed definitions from the catalog so every behavior,
-- signature, owner, security mode, grant, and locked function setting remains
-- authoritative. The only textual change is the schema qualification below.
do $kp_uuid_generation_replace$
declare
    v_definition text;
    v_signature text;
begin
    for v_signature in
        select required_signature
        from (values
            ('public.kp_persist_publish_compatibility_revision(uuid,uuid,uuid,jsonb)'),
            ('public.kp_persist_register_summary_alias(uuid,text,text,text,uuid)'),
            ('public.kp_persist_replace_compatibility_summary(uuid,uuid,text,uuid,text,text,text,text,text,text,text,integer,text,text,text,uuid,integer,integer,boolean)'),
            ('public.kp_persist_replace_summary_sources(uuid,jsonb,uuid)'),
            ('public.kp_persist_update_compatibility_summary(uuid,uuid,text,text,text,text,text,text,text,text,integer,text,text,text,uuid,integer,integer,text,uuid[])')
        ) as required(required_signature)
    loop
        select pg_catalog.pg_get_functiondef(to_regprocedure(v_signature))
        into v_definition;

        -- Use a sentinel so replacing the unqualified form cannot match the
        -- already-normalized schema-qualified text.
        v_definition := pg_catalog.replace(
            v_definition,
            'public.uuid_generate_v4()',
            '__KP_074_UUID_GENERATOR__'
        );
        v_definition := pg_catalog.replace(
            v_definition,
            'uuid_generate_v4()',
            '__KP_074_UUID_GENERATOR__'
        );
        execute pg_catalog.replace(
            v_definition,
            '__KP_074_UUID_GENERATOR__',
            'extensions.uuid_generate_v4()'
        );
    end loop;
end
$kp_uuid_generation_replace$;

do $kp_uuid_generation_postflight$
declare
    v_api_owner oid;
    v_function oid;
    v_definition text;
    v_unqualified_definition text;
    v_signature text;
begin
    if to_regnamespace('extensions') is null
       or to_regprocedure('extensions.uuid_generate_v4()') is null
    then
        raise exception using
            errcode = 'check_violation',
            message = 'Knowledge Platform migration 074 lost the required extensions.uuid_generate_v4() prerequisite.';
    end if;

    select p.proowner
    into v_api_owner
    from pg_catalog.pg_proc p
    where p.oid = to_regprocedure('public.kp_persist_require_actor(uuid)');

    if v_api_owner is null then
        raise exception using
            errcode = 'check_violation',
            message = 'Knowledge Platform migration 074 cannot verify the persistence API owner.';
    end if;

    for v_signature in
        select required_signature
        from (values
            ('public.kp_persist_publish_compatibility_revision(uuid,uuid,uuid,jsonb)'),
            ('public.kp_persist_register_summary_alias(uuid,text,text,text,uuid)'),
            ('public.kp_persist_replace_compatibility_summary(uuid,uuid,text,uuid,text,text,text,text,text,text,text,integer,text,text,text,uuid,integer,integer,boolean)'),
            ('public.kp_persist_replace_summary_sources(uuid,jsonb,uuid)'),
            ('public.kp_persist_update_compatibility_summary(uuid,uuid,text,text,text,text,text,text,text,text,integer,text,text,text,uuid,integer,integer,text,uuid[])')
        ) as required(required_signature)
    loop
        v_function := to_regprocedure(v_signature);
        if v_function is null then
            raise exception using
                errcode = 'check_violation',
                message = format('Knowledge Platform migration 074 lost the exact writer signature: %s.', v_signature);
        end if;

        select pg_catalog.pg_get_functiondef(p.oid)
        into v_definition
        from pg_catalog.pg_proc p
        where p.oid = v_function
          and p.proowner = v_api_owner
          and p.prosecdef
          and coalesce(array_to_string(p.proconfig, ','), '') ilike '%search_path=pg_catalog, public, pg_temp%'
          and coalesce(array_to_string(p.proconfig, ','), '') ilike '%lock_timeout=5s%';

        if v_definition is null
           or position('extensions.uuid_generate_v4()' in lower(v_definition)) = 0
        then
            raise exception using
                errcode = 'check_violation',
                message = format('Knowledge Platform migration 074 failed to install the schema-qualified UUID generator in %s.', v_signature);
        end if;

        v_unqualified_definition := pg_catalog.replace(
            lower(v_definition),
            'extensions.uuid_generate_v4()',
            ''
        );
        if position('uuid_generate_v4()' in v_unqualified_definition) > 0 then
            raise exception using
                errcode = 'check_violation',
                message = format('Knowledge Platform migration 074 left an unqualified UUID generator in %s.', v_signature);
        end if;

        if has_function_privilege('public', v_function, 'EXECUTE')
           or has_function_privilege('anon', v_function, 'EXECUTE')
           or has_function_privilege('authenticated', v_function, 'EXECUTE')
           or not has_function_privilege('service_role', v_function, 'EXECUTE')
        then
            raise exception using
                errcode = 'check_violation',
                message = format('Knowledge Platform migration 074 changed execution grants on %s.', v_signature);
        end if;
    end loop;

    -- Fail closed if another installed public persistence writer still has the
    -- same search_path-sensitive defect. Schema-qualified calls are removed
    -- before the check so only genuinely unqualified references remain.
    for v_function, v_signature, v_definition in
        select p.oid,
               format('%s.%s(%s)', n.nspname, p.proname, pg_catalog.pg_get_function_identity_arguments(p.oid)),
               pg_catalog.pg_get_functiondef(p.oid)
        from pg_catalog.pg_proc p
        join pg_catalog.pg_namespace n on n.oid = p.pronamespace
        where n.nspname = 'public'
          and p.proname like 'kp_persist_%'
    loop
        v_unqualified_definition := pg_catalog.regexp_replace(
            lower(v_definition),
            '[a-z_][a-z0-9_]*[[:space:]]*\.[[:space:]]*uuid_generate_v4[[:space:]]*\(\)',
            '',
            'g'
        );
        if v_unqualified_definition ~ 'uuid_generate_v4[[:space:]]*\(\)' then
            raise exception using
                errcode = 'check_violation',
                message = format('Knowledge Platform migration 074 found another unqualified UUID generator in %s.', v_signature);
        end if;
    end loop;
end
$kp_uuid_generation_postflight$;

notify pgrst, 'reload schema';
