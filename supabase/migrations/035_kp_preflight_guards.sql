-- 035_kp_preflight_guards.sql
-- Sobdai Knowledge Platform — Batch A / Migration 035.
--
-- Purpose
-- -------
-- Fail before any Knowledge Platform object is created when the deployed
-- Supabase schema does not match the frozen, audited legacy baseline.
--
-- Safety
-- ------
-- * Read-only: this migration only inspects PostgreSQL catalogs.
-- * Idempotent: it may be run repeatedly against a compatible database.
-- * Backward-compatible: no application table, policy, function, or data is
--   modified.
-- * Fail-closed: an unexpected schema, FK action, RLS setting, role vocabulary,
--   or migration-history state aborts the transaction with an actionable error.
--
-- Important repository audit note
-- -------------------------------
-- Historical file prefixes 019 and 022 are duplicated in the repository. This
-- guard therefore verifies the resulting schema plus the latest predecessor
-- (034) rather than pretending every historical filename has a unique version.
--
-- Rollback
-- --------
-- None is required: this migration has no side effects. Correct/approve the
-- baseline inconsistency and rerun it.

do $kp_preflight$
declare
    expected record;
    role_check_definition text;
    has_migration_034 boolean;
begin
    -- Supabase/PostgreSQL primitives used by the existing schema and Batch A.
    if not exists (
        select 1
        from pg_extension
        where extname = 'uuid-ossp'
    ) then
        raise exception using
            errcode = 'check_violation',
            message = 'Knowledge Platform preflight failed: extension "uuid-ossp" is not installed.',
            hint = 'Deploy/verify the frozen legacy baseline before Batch A.';
    end if;

    if to_regprocedure('public.handle_updated_at()') is null then
        raise exception using
            errcode = 'check_violation',
            message = 'Knowledge Platform preflight failed: public.handle_updated_at() is missing.',
            hint = 'Migration 001 must be present before Batch A.';
    end if;

    for expected in
        select *
        from (
            values
                ('anon'),
                ('authenticated'),
                ('service_role')
        ) as required_roles(role_name)
    loop
        if not exists (
            select 1
            from pg_roles
            where rolname = expected.role_name
        ) then
            raise exception using
                errcode = 'check_violation',
                message = format(
                    'Knowledge Platform preflight failed: Supabase role %I is missing.',
                    expected.role_name
                ),
                hint = 'Run Batch A only on the intended Supabase PostgreSQL environment.';
        end if;
    end loop;

    if not exists (
        select 1
        from pg_roles
        where rolname = 'service_role'
          and rolbypassrls
    ) then
        raise exception using
            errcode = 'check_violation',
            message = 'Knowledge Platform preflight failed: service_role does not bypass RLS.',
            hint = 'Verify the standard Supabase database-role configuration.';
    end if;

    -- The frozen migration sequence starts after 034. Use dynamic SQL so the
    -- failure is explicit even if the Supabase history schema itself is absent.
    if to_regclass('supabase_migrations.schema_migrations') is null then
        raise exception using
            errcode = 'check_violation',
            message = 'Knowledge Platform preflight failed: Supabase migration history is missing.',
            hint = 'Verify the target database and its migration history before Batch A.';
    end if;

    execute
        'select exists (
            select 1
            from supabase_migrations.schema_migrations
            where version = ''034''
        )'
    into has_migration_034;

    if not has_migration_034 then
        raise exception using
            errcode = 'check_violation',
            message = 'Knowledge Platform preflight failed: predecessor migration 034 is not recorded.',
            hint = 'Reconcile deployed migration history before applying migration 035.';
    end if;

    -- Required legacy relations. These are the frozen compatibility surface
    -- that later Knowledge Platform batches must preserve.
    for expected in
        select *
        from (
            values
                ('profiles'),
                ('packages'),
                ('summaries'),
                ('questions'),
                ('exam_sets'),
                ('exam_set_questions'),
                ('orders'),
                ('news'),
                ('news_summaries')
        ) as required_relations(relation_name)
    loop
        if to_regclass(format('public.%I', expected.relation_name)) is null then
            raise exception using
                errcode = 'check_violation',
                message = format(
                    'Knowledge Platform preflight failed: required relation public.%I is missing.',
                    expected.relation_name
                );
        end if;
    end loop;

    -- Required columns, PostgreSQL storage types, and nullability. Checking
    -- udt_name avoids ambiguous aliases such as integer/int4.
    for expected in
        select *
        from (
            values
                ('profiles', 'id', 'uuid', 'NO'),
                ('profiles', 'role', 'text', 'NO'),

                ('packages', 'id', 'uuid', 'NO'),
                ('packages', 'slug', 'text', 'NO'),
                ('packages', 'package_code', 'text', 'NO'),
                ('packages', 'is_published', 'bool', 'NO'),
                ('packages', 'created_at', 'timestamptz', 'NO'),
                ('packages', 'updated_at', 'timestamptz', 'NO'),

                ('summaries', 'id', 'uuid', 'NO'),
                ('summaries', 'package_id', 'uuid', 'NO'),
                ('summaries', 'title', 'text', 'NO'),
                ('summaries', 'slug', 'text', 'NO'),
                ('summaries', 'subject', 'text', 'YES'),
                ('summaries', 'document', 'text', 'YES'),
                ('summaries', 'law', 'text', 'YES'),
                ('summaries', 'topic', 'text', 'YES'),
                ('summaries', 'content_md', 'text', 'NO'),
                ('summaries', 'read_time_minutes', 'int4', 'NO'),
                ('summaries', 'sort_order', 'int4', 'NO'),
                ('summaries', 'display_order', 'int4', 'NO'),
                ('summaries', 'is_published', 'bool', 'NO'),
                ('summaries', 'released_at', 'timestamptz', 'YES'),
                ('summaries', 'created_at', 'timestamptz', 'NO'),
                ('summaries', 'updated_at', 'timestamptz', 'NO'),

                ('questions', 'id', 'uuid', 'NO'),
                ('questions', 'question_code', 'text', 'YES'),
                ('questions', 'status', 'text', 'NO'),

                ('exam_sets', 'id', 'uuid', 'NO'),
                ('exam_sets', 'package_id', 'uuid', 'NO'),
                ('exam_sets', 'status', 'text', 'NO'),

                ('exam_set_questions', 'exam_set_id', 'uuid', 'NO'),
                ('exam_set_questions', 'question_id', 'uuid', 'NO'),
                ('exam_set_questions', 'sort_order', 'int4', 'NO'),

                ('orders', 'id', 'uuid', 'NO'),
                ('orders', 'user_id', 'uuid', 'NO'),
                ('orders', 'package_id', 'uuid', 'NO'),
                ('orders', 'status', 'text', 'NO'),

                ('news', 'id', 'uuid', 'NO'),
                ('news', 'status', 'text', 'NO'),

                ('news_summaries', 'news_id', 'uuid', 'NO'),
                ('news_summaries', 'summary_id', 'uuid', 'NO'),
                ('news_summaries', 'sort_order', 'int4', 'NO')
        ) as required_columns(table_name, column_name, udt_name, is_nullable)
    loop
        if not exists (
            select 1
            from information_schema.columns c
            where c.table_schema = 'public'
              and c.table_name = expected.table_name
              and c.column_name = expected.column_name
              and c.udt_name = expected.udt_name
              and c.is_nullable = expected.is_nullable
        ) then
            raise exception using
                errcode = 'check_violation',
                message = format(
                    'Knowledge Platform preflight failed: expected public.%I.%I type=%s nullable=%s.',
                    expected.table_name,
                    expected.column_name,
                    expected.udt_name,
                    expected.is_nullable
                ),
                hint = 'Reconcile the live schema with the frozen current-schema audit.';
        end if;
    end loop;

    -- Required primary/unique compatibility identities.
    if not exists (
        select 1
        from pg_constraint c
        where c.conrelid = 'public.summaries'::regclass
          and c.contype = 'p'
          and pg_get_constraintdef(c.oid) = 'PRIMARY KEY (id)'
    ) then
        raise exception 'Knowledge Platform preflight failed: summaries primary key must be (id).';
    end if;

    if not exists (
        select 1
        from pg_constraint c
        where c.conrelid = 'public.summaries'::regclass
          and c.contype = 'u'
          and pg_get_constraintdef(c.oid) = 'UNIQUE (package_id, slug)'
    ) then
        raise exception 'Knowledge Platform preflight failed: summaries must retain UNIQUE (package_id, slug).';
    end if;

    if not exists (
        select 1
        from pg_constraint c
        where c.conrelid = 'public.packages'::regclass
          and c.contype = 'u'
          and pg_get_constraintdef(c.oid) = 'UNIQUE (slug)'
    ) then
        raise exception 'Knowledge Platform preflight failed: packages.slug must remain unique.';
    end if;

    if not exists (
        select 1
        from pg_constraint c
        where c.conrelid = 'public.news_summaries'::regclass
          and c.contype = 'p'
          and pg_get_constraintdef(c.oid) = 'PRIMARY KEY (news_id, summary_id)'
    ) then
        raise exception 'Knowledge Platform preflight failed: news_summaries primary key drifted.';
    end if;

    -- Required legacy cascade actions. Later frozen batches change ownership;
    -- Batch A must first prove the audited starting point.
    if not exists (
        select 1
        from pg_constraint c
        where c.conrelid = 'public.summaries'::regclass
          and c.confrelid = 'public.packages'::regclass
          and c.contype = 'f'
          and c.confdeltype = 'c'
          and c.conkey = array[(
              select a.attnum
              from pg_attribute a
              where a.attrelid = 'public.summaries'::regclass
                and a.attname = 'package_id'
          )]::smallint[]
          and c.confkey = array[(
              select a.attnum
              from pg_attribute a
              where a.attrelid = 'public.packages'::regclass
                and a.attname = 'id'
          )]::smallint[]
    ) then
        raise exception 'Knowledge Platform preflight failed: summaries.package_id FK/cascade drifted.';
    end if;

    if not exists (
        select 1
        from pg_constraint c
        where c.conrelid = 'public.news_summaries'::regclass
          and c.confrelid = 'public.summaries'::regclass
          and c.contype = 'f'
          and c.confdeltype = 'c'
          and c.conkey = array[(
              select a.attnum
              from pg_attribute a
              where a.attrelid = 'public.news_summaries'::regclass
                and a.attname = 'summary_id'
          )]::smallint[]
          and c.confkey = array[(
              select a.attnum
              from pg_attribute a
              where a.attrelid = 'public.summaries'::regclass
                and a.attname = 'id'
          )]::smallint[]
    ) then
        raise exception 'Knowledge Platform preflight failed: news_summaries.summary_id FK/cascade drifted.';
    end if;

    -- RLS is an audited Supabase invariant. Batch A does not modify these
    -- policies; it only proves that protection is enabled.
    for expected in
        select *
        from (
            values
                ('profiles'),
                ('packages'),
                ('summaries'),
                ('questions'),
                ('exam_sets'),
                ('exam_set_questions'),
                ('orders'),
                ('news'),
                ('news_summaries')
        ) as rls_relations(relation_name)
    loop
        if not exists (
            select 1
            from pg_class c
            join pg_namespace n on n.oid = c.relnamespace
            where n.nspname = 'public'
              and c.relname = expected.relation_name
              and c.relkind in ('r', 'p')
              and c.relrowsecurity
        ) then
            raise exception using
                errcode = 'check_violation',
                message = format(
                    'Knowledge Platform preflight failed: RLS is not enabled on public.%I.',
                    expected.relation_name
                );
        end if;
    end loop;

    -- Repository migration 001 originally constrained roles to admin|user,
    -- while later frozen RLS/application contracts use five roles. If a
    -- database role CHECK exists, it must admit the full deployed vocabulary.
    select string_agg(pg_get_constraintdef(c.oid), ' ')
    into role_check_definition
    from pg_constraint c
    where c.conrelid = 'public.profiles'::regclass
      and c.contype = 'c'
      and pg_get_constraintdef(c.oid) ilike '%role%';

    if role_check_definition is not null
       and (
           role_check_definition not ilike '%owner%'
           or role_check_definition not ilike '%admin%'
           or role_check_definition not ilike '%editor%'
           or role_check_definition not ilike '%support%'
           or role_check_definition not ilike '%user%'
       )
    then
        raise exception using
            errcode = 'check_violation',
            message = 'Knowledge Platform preflight failed: profiles.role CHECK does not admit the deployed RBAC vocabulary.',
            detail = role_check_definition,
            hint = 'Resolve the audited legacy RBAC drift separately; Batch A must not redesign or repair it.';
    end if;

    raise notice 'Knowledge Platform Batch A preflight passed: frozen legacy schema prerequisites are present.';
end
$kp_preflight$;
