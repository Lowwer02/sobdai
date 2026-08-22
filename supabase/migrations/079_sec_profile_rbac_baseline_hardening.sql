-- 079_sec_profile_rbac_baseline_hardening.sql
-- SEC — Profile RBAC Baseline Hardening.
--
-- The profiles row mixes ordinary self-service fields with authorization and
-- account-state fields. This migration makes that boundary explicit:
--
--   * authenticated users may update only the five self-service columns;
--   * role/status/ban metadata is changed only by actor-derived RPCs;
--   * self-deactivation has one exact, non-reversible user transition; and
--   * anonymous callers have no profiles row visibility.
--
-- This migration also forward-replaces the effective privileged mutation
-- policies established by migrations 006/010/011/014/017/034/046/065. The
-- historical migrations remain immutable baseline history. Every replacement
-- preserves the prior operation and role set while requiring a usable account:
-- status = 'active' and deleted_at is null. Public/read-only policies remain
-- independent and are not used as privileged mutation boundaries.
--
-- The deployed Production baseline has one verified schema-drift exception:
-- profiles.status is absent even though migrations 004/018 and the current
-- application contract require it. The compatibility bootstrap below accepts
-- only that exact legacy shape, proves that legacy account-state metadata is
-- clean, and creates the existing active/banned contract before any 079
-- function or policy can reference it. It never makes the application
-- tolerant of a missing status column.

set local lock_timeout = '5s';

do $profile_rbac_preflight$
declare
    required_column record;
    expected_column record;
    required_relation record;
    required_policy record;
    existing_function record;
    existing_function_owner name;
    actual_column record;
    v_status_exists boolean;
    v_status_baseline text;
    v_legacy_unsafe_count bigint;
begin
    if to_regclass('public.profiles') is null then
        raise exception using
            errcode = 'check_violation',
            message = 'SEC profile RBAC hardening requires public.profiles.';
    end if;

    for required_relation in
        select relation_name
        from (values
            ('organizations'),
            ('positions'),
            ('packages'),
            ('exam_sets'),
            ('questions'),
            ('exam_set_questions'),
            ('orders'),
            ('homepage_settings'),
            ('news'),
            ('news_packages'),
            ('news_summaries'),
            ('news_redirects'),
            ('articles'),
            ('article_packages'),
            ('promotions'),
            ('reference_documents'),
            ('reference_document_versions'),
            ('reference_document_aliases')
        ) as required(relation_name)
    loop
        if to_regclass(format('public.%I', required_relation.relation_name)) is null then
            raise exception using
                errcode = 'check_violation',
                message = format(
                    'SEC profile RBAC hardening requires public.%I.',
                    required_relation.relation_name
                );
        end if;
    end loop;

    for required_relation in
        select relation_name
        from (values
            ('storage.objects'),
            ('storage.buckets')
        ) as required(relation_name)
    loop
        if to_regclass(required_relation.relation_name) is null then
            raise exception using
                errcode = 'check_violation',
                message = format(
                    'SEC profile RBAC hardening requires %s.',
                    required_relation.relation_name
            );
        end if;
    end loop;

    -- These are the two and only two accepted profiles baselines for SEC-079:
    -- the verified legacy shape with no status column, or the normalized SEC
    -- shape with status already present. Validate the shared profile contract
    -- before deciding whether a compatibility column must be added.
    for expected_column in
        select column_name, data_type, is_nullable, column_default
        from (values
            ('id', 'uuid', 'NO', null),
            ('role', 'text', 'NO', '''user''::text'),
            ('display_name', 'text', 'YES', null),
            ('occupation', 'text', 'YES', null),
            ('phone', 'text', 'YES', null),
            ('avatar_url', 'text', 'YES', null),
            ('last_seen_at', 'timestamp with time zone', 'YES', null),
            ('deleted_at', 'timestamp with time zone', 'YES', null),
            ('deleted_reason', 'text', 'YES', null),
            ('deleted_by', 'uuid', 'YES', null),
            ('banned_at', 'timestamp with time zone', 'YES', null),
            ('banned_reason', 'text', 'YES', null),
            ('banned_by', 'uuid', 'YES', null)
        ) as expected(column_name, data_type, is_nullable, column_default)
    loop
        select c.data_type, c.is_nullable, c.column_default
        into actual_column
        from information_schema.columns c
        where c.table_schema = 'public'
          and c.table_name = 'profiles'
          and c.column_name = expected_column.column_name;

        if not found then
            raise exception using
                errcode = 'check_violation',
                message = format(
                    'SEC profile RBAC hardening requires public.profiles.%I.',
                    expected_column.column_name
                );
        end if;

        if actual_column.data_type <> expected_column.data_type
           or actual_column.is_nullable <> expected_column.is_nullable
           or actual_column.column_default is distinct from expected_column.column_default
        then
            raise exception using
                errcode = 'check_violation',
                message = format(
                    'SEC profile RBAC hardening found an incompatible public.profiles.%I definition.',
                    expected_column.column_name
                );
        end if;
    end loop;

    if not exists (
        select 1
        from pg_catalog.pg_constraint c
        where c.conrelid = 'public.profiles'::regclass
          and c.contype = 'c'
          and pg_catalog.pg_get_constraintdef(c.oid) ilike '%role%'
          and (
              select array_agg(m[1] order by m[1])
              from pg_catalog.regexp_matches(
                  pg_catalog.pg_get_constraintdef(c.oid),
                  $$'([^']+)'(?:::text)?$$,
                  'g'
              ) as m
          ) = array['admin', 'editor', 'owner', 'support', 'user']::text[]
    ) then
        raise exception using
            errcode = 'check_violation',
            message = 'SEC profile RBAC hardening requires the deployed five-value profiles.role contract.';
    end if;

    v_status_exists := exists (
        select 1
        from information_schema.columns c
        where c.table_schema = 'public'
          and c.table_name = 'profiles'
          and c.column_name = 'status'
    );

    if not v_status_exists then
        -- No status value can be inferred safely from a legacy ban/deletion
        -- marker without inventing precedence semantics. Any such residue is
        -- therefore an operator-remediation case, not an automatic active
        -- normalization case.
        select count(*)
        into v_legacy_unsafe_count
        from public.profiles p
        where p.deleted_at is not null
           or p.deleted_reason is not null
           or p.deleted_by is not null
           or p.banned_at is not null
           or p.banned_reason is not null
           or p.banned_by is not null;

        if v_legacy_unsafe_count > 0 then
            raise exception using
                errcode = 'check_violation',
                message = format(
                    'SEC status bootstrap refuses to normalize %s legacy profile row(s) with account-state metadata.',
                    v_legacy_unsafe_count
                );
        end if;

        execute $sql$
            alter table public.profiles
                add column status text not null default 'active'
                constraint profiles_status_check check (status in ('active', 'banned'))
        $sql$;
        v_status_baseline := 'legacy';
    else
        v_status_baseline := 'normalized';
    end if;

    perform pg_catalog.set_config(
        'sobdai.sec079_status_baseline',
        v_status_baseline,
        true
    );

    select c.data_type, c.is_nullable, c.column_default
    into actual_column
    from information_schema.columns c
    where c.table_schema = 'public'
      and c.table_name = 'profiles'
      and c.column_name = 'status';

    if not found
       or actual_column.data_type <> 'text'
       or actual_column.is_nullable <> 'NO'
       or actual_column.column_default <> '''active''::text'
    then
        raise exception using
            errcode = 'check_violation',
            message = 'SEC profile RBAC hardening found an incompatible public.profiles.status definition.';
    end if;

    if not exists (
        select 1
        from pg_catalog.pg_constraint c
        where c.conrelid = 'public.profiles'::regclass
          and c.contype = 'c'
          and pg_catalog.pg_get_constraintdef(c.oid) ilike '%status%'
          and (
              select array_agg(m[1] order by m[1])
              from pg_catalog.regexp_matches(
                  pg_catalog.pg_get_constraintdef(c.oid),
                  $$'([^']+)'(?:::text)?$$,
                  'g'
              ) as m
          ) = array['active', 'banned']::text[]
    ) then
        raise exception using
            errcode = 'check_violation',
            message = 'SEC profile RBAC hardening requires the existing active/banned profiles.status contract.';
    end if;

    for required_column in
        select column_name
        from (values
            ('id'),
            ('role'),
            ('display_name'),
            ('occupation'),
            ('phone'),
            ('avatar_url'),
            ('last_seen_at'),
            ('deleted_at'),
            ('deleted_reason'),
            ('deleted_by'),
            ('banned_at'),
            ('banned_reason'),
            ('banned_by')
        ) as required(column_name)
    loop
        if not exists (
            select 1
            from information_schema.columns c
            where c.table_schema = 'public'
              and c.table_name = 'profiles'
              and c.column_name = required_column.column_name
        ) then
            raise exception using
                errcode = 'check_violation',
                message = format(
                    'SEC profile RBAC hardening requires public.profiles.%I.',
                    required_column.column_name
                );
        end if;
    end loop;

    if to_regprocedure('public.handle_updated_at()') is null then
        raise exception using
            errcode = 'check_violation',
            message = 'SEC profile RBAC hardening requires public.handle_updated_at().';
    end if;

    for existing_function in
        select signature
        from (values
            ('public.profile_actor_is_manager()'),
            ('public.admin_update_profile_role(uuid, text)'),
            ('public.admin_update_profile_status(uuid, text, text)'),
            ('public.deactivate_my_profile()'),
            ('public.protect_profile_security_fields()'),
            ('public.kp_is_content_editor()')
        ) as required(signature)
    loop
        if pg_catalog.to_regprocedure(existing_function.signature) is not null then
            select pg_catalog.pg_get_userbyid(p.proowner)
            into existing_function_owner
            from pg_catalog.pg_proc p
            where p.oid = pg_catalog.to_regprocedure(existing_function.signature);

            if existing_function_owner <> current_user then
                raise exception using
                    errcode = 'check_violation',
                    message = format(
                        'SEC refuses to replace a function with an untrusted owner: %s.',
                        existing_function.signature
                    );
            end if;
        end if;
    end loop;

    -- These are the category-A policy identities that 079 is designed to
    -- forward-replace. A missing identity means the deployed baseline has
    -- materially drifted and must not be silently guessed at by this
    -- migration.
    for required_policy in
        select policy_schema, table_name, policy_name, policy_command
        from (values
            ('public', 'organizations', 'Only owners can insert organizations.', 'INSERT'),
            ('public', 'organizations', 'Only owners can update organizations.', 'UPDATE'),
            ('public', 'organizations', 'Only owners can delete organizations.', 'DELETE'),
            ('public', 'positions', 'Only owners can insert positions.', 'INSERT'),
            ('public', 'positions', 'Only owners can update positions.', 'UPDATE'),
            ('public', 'positions', 'Only owners can delete positions.', 'DELETE'),
            ('public', 'packages', 'Content creators can insert packages.', 'INSERT'),
            ('public', 'packages', 'Content creators can update packages.', 'UPDATE'),
            ('public', 'packages', 'Content managers can delete packages.', 'DELETE'),
            ('public', 'exam_sets', 'Content creators can insert exam_sets.', 'INSERT'),
            ('public', 'exam_sets', 'Content creators can update exam_sets.', 'UPDATE'),
            ('public', 'exam_sets', 'Content managers can delete exam_sets.', 'DELETE'),
            ('public', 'questions', 'Content creators can insert questions.', 'INSERT'),
            ('public', 'questions', 'Content creators can update questions.', 'UPDATE'),
            ('public', 'questions', 'Content managers can delete questions.', 'DELETE'),
            ('public', 'exam_set_questions', 'Content creators can manage exam_set_questions.', 'ALL'),
            ('public', 'orders', 'Financial managers can insert orders.', 'INSERT'),
            ('public', 'orders', 'Financial managers can update orders.', 'UPDATE'),
            ('public', 'orders', 'Financial managers can delete orders.', 'DELETE'),
            ('storage', 'objects', 'Users can upload package assets.', 'INSERT'),
            ('storage', 'objects', 'Users can update package assets.', 'UPDATE'),
            ('storage', 'objects', 'Content managers can upload news assets.', 'INSERT'),
            ('storage', 'objects', 'Content managers can update news assets.', 'UPDATE'),
            ('storage', 'objects', 'Content managers can delete news assets.', 'DELETE'),
            ('storage', 'objects', 'Content managers can upload article assets.', 'INSERT'),
            ('storage', 'objects', 'Content managers can update article assets.', 'UPDATE'),
            ('storage', 'objects', 'Content managers can delete article assets.', 'DELETE'),
            ('public', 'reference_documents', 'kp_editor_insert', 'INSERT'),
            ('public', 'reference_documents', 'kp_editor_update', 'UPDATE'),
            ('public', 'reference_document_versions', 'kp_editor_insert', 'INSERT'),
            ('public', 'reference_document_versions', 'kp_editor_update', 'UPDATE'),
            ('public', 'reference_document_aliases', 'kp_editor_insert', 'INSERT'),
            ('public', 'reference_document_aliases', 'kp_editor_update', 'UPDATE')
        ) as required(policy_schema, table_name, policy_name, policy_command)
    loop
        if not exists (
            select 1
            from pg_catalog.pg_policies p
            where p.schemaname = required_policy.policy_schema
              and p.tablename = required_policy.table_name
              and p.policyname = required_policy.policy_name
              and p.cmd = required_policy.policy_command
        ) then
            raise exception using
                errcode = 'check_violation',
                message = format(
                    'SEC preflight policy baseline is missing or drifted: %s.%I.%I (%s).',
                    required_policy.policy_schema,
                    required_policy.table_name,
                    required_policy.policy_name,
                    required_policy.policy_command
                );
        end if;
    end loop;
end
$profile_rbac_preflight$;

-- RLS policies cannot safely query public.profiles from another profiles
-- policy without causing recursive policy evaluation. This narrowly scoped
-- SECURITY DEFINER predicate is therefore used only for the manager read
-- policy; it derives the caller from auth.uid() and never accepts a role/id.
create or replace function public.profile_actor_is_manager()
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public, auth, pg_temp
set lock_timeout = '5s'
as $function$
    select exists (
        select 1
        from public.profiles p
        where p.id = auth.uid()
          and p.role in ('owner', 'admin', 'support')
          and p.status = 'active'
          and p.deleted_at is null
    )
$function$;

comment on function public.profile_actor_is_manager() is
    'RLS-only predicate for active Owner/Admin/Support profile management reads.';

revoke all on function public.profile_actor_is_manager() from PUBLIC;
revoke all on function public.profile_actor_is_manager() from anon, authenticated;
grant execute on function public.profile_actor_is_manager() to authenticated;

-- Owner/Admin role management. The actor is always auth.uid(); callers
-- cannot supply banned_by/deleted_by-style identity data or impersonate a
-- manager. The owner lock makes last-owner protection atomic across
-- concurrent role changes.
create or replace function public.admin_update_profile_role(
    p_target_user_id uuid,
    p_new_role text
)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog, public, auth, pg_temp
set lock_timeout = '5s'
as $function$
declare
    v_actor_id uuid;
    v_actor_role text;
    v_target_role text;
    v_target_status text;
    v_target_deleted_at timestamptz;
    v_owner_count bigint;
begin
    v_actor_id := auth.uid();

    if v_actor_id is null then
        raise exception using
            errcode = '42501',
            message = 'Authentication is required.';
    end if;

    if p_new_role is null
       or p_new_role not in ('user', 'admin', 'owner', 'editor', 'support')
    then
        raise exception using
            errcode = '22023',
            message = 'Unsupported profile role.';
    end if;

    perform pg_catalog.pg_advisory_xact_lock(780079::bigint);

    select p.role
    into v_actor_role
    from public.profiles p
    where p.id = v_actor_id
      and p.status = 'active'
      and p.deleted_at is null
    for update;

    if not found or v_actor_role not in ('owner', 'admin') then
        raise exception using
            errcode = '42501',
            message = 'Only an active Owner or Admin may change profile roles.';
    end if;

    -- Admins may manage the established staff/user roles but may not grant
    -- the highest-privilege Owner role. Owner assignment remains explicit.
    if p_new_role = 'owner' and v_actor_role <> 'owner' then
        raise exception using
            errcode = '42501',
            message = 'Only an Owner may assign the Owner role.';
    end if;

    select p.role, p.status, p.deleted_at
    into v_target_role, v_target_status, v_target_deleted_at
    from public.profiles p
    where p.id = p_target_user_id
    for update;

    if not found then
        raise exception using
            errcode = 'P0002',
            message = 'Target profile was not found.';
    end if;

    if v_target_role = 'owner'
       and v_target_status = 'active'
       and v_target_deleted_at is null
       and p_new_role <> 'owner'
    then
        -- Lock all usable Owner rows before counting so every Owner-boundary
        -- transition observes the same canonical state.
        perform p.id
        from public.profiles p
        where p.role = 'owner'
          and p.status = 'active'
          and p.deleted_at is null
        order by p.id
        for update;

        select count(*)
        into v_owner_count
        from public.profiles p
        where p.role = 'owner'
          and p.status = 'active'
          and p.deleted_at is null;

        if v_owner_count <= 1 then
            raise exception using
                errcode = '42501',
                message = 'Cannot downgrade the last usable Owner of the system.';
        end if;
    end if;

    update public.profiles
    set role = p_new_role
    where id = p_target_user_id;

    return true;
end
$function$;

-- Owner/Admin ban and unban management. Only this function can write
-- status/banned_* through the authenticated API boundary; banned_by is always
-- the verified actor and is never accepted as an argument.
create or replace function public.admin_update_profile_status(
    p_target_user_id uuid,
    p_new_status text,
    p_reason text default null
)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog, public, auth, pg_temp
set lock_timeout = '5s'
as $function$
declare
    v_actor_id uuid;
    v_actor_role text;
    v_target_role text;
    v_target_status text;
    v_target_deleted_at timestamptz;
    v_active_owner_count bigint;
begin
    v_actor_id := auth.uid();

    if v_actor_id is null then
        raise exception using
            errcode = '42501',
            message = 'Authentication is required.';
    end if;

    if p_new_status is null or p_new_status not in ('active', 'banned') then
        raise exception using
            errcode = '22023',
            message = 'Unsupported profile status.';
    end if;

    if p_reason is not null and pg_catalog.char_length(p_reason) > 500 then
        raise exception using
            errcode = '22023',
            message = 'Ban reason must be 500 characters or fewer.';
    end if;

    perform pg_catalog.pg_advisory_xact_lock(780079::bigint);

    select p.role
    into v_actor_role
    from public.profiles p
    where p.id = v_actor_id
      and p.status = 'active'
      and p.deleted_at is null
    for update;

    if not found or v_actor_role not in ('owner', 'admin') then
        raise exception using
            errcode = '42501',
            message = 'Only an active Owner or Admin may change profile status.';
    end if;

    select p.role, p.status, p.deleted_at
    into v_target_role, v_target_status, v_target_deleted_at
    from public.profiles p
    where p.id = p_target_user_id
    for update;

    if not found then
        raise exception using
            errcode = 'P0002',
            message = 'Target profile was not found.';
    end if;

    if v_target_role = 'owner'
       and v_target_status = 'active'
       and v_target_deleted_at is null
       and p_new_status = 'banned'
    then
        -- Lock all usable Owner rows before counting to preserve the same
        -- invariant used by role demotion and self-deactivation.
        perform p.id
        from public.profiles p
        where p.role = 'owner'
          and p.status = 'active'
          and p.deleted_at is null
        order by p.id
        for update;

        select count(*)
        into v_active_owner_count
        from public.profiles p
        where p.role = 'owner'
          and p.status = 'active'
          and p.deleted_at is null;

        if v_active_owner_count <= 1 then
            raise exception using
                errcode = '42501',
                message = 'Cannot ban the last usable Owner of the system.';
        end if;
    end if;

    if p_new_status = 'banned' then
        update public.profiles
        set status = 'banned',
            banned_at = now(),
            banned_reason = p_reason,
            banned_by = v_actor_id
        where id = p_target_user_id;
    else
        update public.profiles
        set status = 'active',
            banned_at = null,
            banned_reason = null,
            banned_by = null
        where id = p_target_user_id;
    end if;

    return true;
end
$function$;

-- The only authenticated user transition into the deleted state. There are
-- no arguments, deleted_by is derived from auth.uid(), and the function never
-- clears/reactivates a deleted profile. Repeated calls return false without a
-- second state transition.
create or replace function public.deactivate_my_profile()
returns boolean
language plpgsql
security definer
set search_path = pg_catalog, public, auth, pg_temp
set lock_timeout = '5s'
as $function$
declare
    v_actor_id uuid;
    v_actor_role text;
    v_actor_status text;
    v_actor_deleted_at timestamptz;
    v_active_owner_count bigint;
begin
    v_actor_id := auth.uid();

    if v_actor_id is null then
        raise exception using
            errcode = '42501',
            message = 'Authentication is required.';
    end if;

    perform pg_catalog.pg_advisory_xact_lock(780079::bigint);

    select p.role, p.status, p.deleted_at
    into v_actor_role, v_actor_status, v_actor_deleted_at
    from public.profiles p
    where p.id = v_actor_id
    for update;

    if not found then
        raise exception using
            errcode = 'P0002',
            message = 'Profile was not found.';
    end if;

    if v_actor_deleted_at is not null then
        return false;
    end if;

    if v_actor_role = 'owner' and v_actor_status = 'active' then
        perform p.id
        from public.profiles p
        where p.role = 'owner'
          and p.status = 'active'
          and p.deleted_at is null
        order by p.id
        for update;

        select count(*)
        into v_active_owner_count
        from public.profiles p
        where p.role = 'owner'
          and p.status = 'active'
          and p.deleted_at is null;

        if v_active_owner_count <= 1 then
            raise exception using
                errcode = '42501',
                message = 'Cannot deactivate the last usable Owner of the system.';
        end if;
    end if;

    update public.profiles
    set deleted_at = now(),
        deleted_reason = 'self',
        deleted_by = v_actor_id
    where id = v_actor_id
      and deleted_at is null;

    -- A missing profile is an error; an already-deleted profile returned false
    -- above. A successful call is therefore an actual one-way transition.
    return true;
end
$function$;

revoke all on function public.admin_update_profile_role(uuid, text) from PUBLIC;
revoke all on function public.admin_update_profile_role(uuid, text) from anon, authenticated;
grant execute on function public.admin_update_profile_role(uuid, text) to authenticated;

revoke all on function public.admin_update_profile_status(uuid, text, text) from PUBLIC;
revoke all on function public.admin_update_profile_status(uuid, text, text) from anon, authenticated;
grant execute on function public.admin_update_profile_status(uuid, text, text) to authenticated;

revoke all on function public.deactivate_my_profile() from PUBLIC;
revoke all on function public.deactivate_my_profile() from anon, authenticated;
grant execute on function public.deactivate_my_profile() to authenticated;

-- Defense in depth for any accidental future table-level UPDATE grant. The
-- authenticated/anon API roles can never change trusted profile fields even
-- if a later query path bypasses the intended column list. SECURITY DEFINER
-- RPCs run under their trusted function owner and therefore pass this guard;
-- service_role remains an explicitly trusted internal boundary.
create or replace function public.protect_profile_security_fields()
returns trigger
language plpgsql
security invoker
set search_path = pg_catalog, public, pg_temp
set lock_timeout = '5s'
as $function$
begin
    if current_user in ('anon', 'authenticated') then
        if new.role is distinct from old.role
           or new.status is distinct from old.status
           or new.banned_at is distinct from old.banned_at
           or new.banned_reason is distinct from old.banned_reason
           or new.banned_by is distinct from old.banned_by
           or new.deleted_at is distinct from old.deleted_at
           or new.deleted_reason is distinct from old.deleted_reason
           or new.deleted_by is distinct from old.deleted_by
        then
            raise exception using
                errcode = '42501',
                message = 'Trusted profile security fields may only be changed through an authorized server boundary.';
        end if;
    end if;

    return new;
end
$function$;

revoke all on function public.protect_profile_security_fields() from PUBLIC, anon, authenticated;

drop trigger if exists profiles_security_guard on public.profiles;
create trigger profiles_security_guard
before update on public.profiles
for each row execute function public.protect_profile_security_fields();

-- Remove the broad public/self update surface. The manager read policy uses
-- the non-recursive predicate above instead of selecting profiles from inside
-- a profiles policy.
drop policy if exists "Public profiles are viewable by everyone." on public.profiles;
drop policy if exists "Users can update own profile." on public.profiles;
drop policy if exists profiles_select_own on public.profiles;
drop policy if exists profiles_select_managers on public.profiles;
drop policy if exists profiles_update_self on public.profiles;

alter table public.profiles enable row level security;

create policy profiles_select_own
on public.profiles
for select
to authenticated
using (auth.uid() = id);

create policy profiles_select_managers
on public.profiles
for select
to authenticated
using (public.profile_actor_is_manager());

create policy profiles_update_self
on public.profiles
for update
to authenticated
using (
    auth.uid() = id
    and status = 'active'
    and deleted_at is null
)
with check (
    auth.uid() = id
    and status = 'active'
    and deleted_at is null
);

-- Existing public-read policies are intentionally retained. Only the
-- profile-dependent manager policies are narrowed to authenticated callers;
-- this prevents anonymous queries from requiring profile privileges while
-- preserving the existing publication predicates.
drop policy if exists "Only admins can manage homepage settings." on public.homepage_settings;
create policy "Only admins can manage homepage settings."
on public.homepage_settings
for all
to authenticated
using (
    exists (
        select 1
        from public.profiles
        where id = auth.uid()
          and role in ('owner', 'admin', 'editor')
          and status = 'active'
          and deleted_at is null
    )
);

drop policy if exists "Content managers can manage news." on public.news;
create policy "Content managers can manage news."
on public.news
for all
to authenticated
using (
    exists (
        select 1
        from public.profiles
        where id = auth.uid()
          and role in ('owner', 'admin', 'editor')
          and status = 'active'
          and deleted_at is null
    )
);

drop policy if exists "Content managers can manage news_packages." on public.news_packages;
create policy "Content managers can manage news_packages."
on public.news_packages
for all
to authenticated
using (
    exists (
        select 1
        from public.profiles
        where id = auth.uid()
          and role in ('owner', 'admin', 'editor')
          and status = 'active'
          and deleted_at is null
    )
);

drop policy if exists "Content managers can manage news_summaries." on public.news_summaries;
create policy "Content managers can manage news_summaries."
on public.news_summaries
for all
to authenticated
using (
    exists (
        select 1
        from public.profiles
        where id = auth.uid()
          and role in ('owner', 'admin', 'editor')
          and status = 'active'
          and deleted_at is null
    )
);

drop policy if exists "Content managers can manage news_redirects." on public.news_redirects;
create policy "Content managers can manage news_redirects."
on public.news_redirects
for all
to authenticated
using (
    exists (
        select 1
        from public.profiles
        where id = auth.uid()
          and role in ('owner', 'admin', 'editor')
          and status = 'active'
          and deleted_at is null
    )
);

drop policy if exists "Content managers can manage articles." on public.articles;
create policy "Content managers can manage articles."
on public.articles
for all
to authenticated
using (
    exists (
        select 1
        from public.profiles
        where id = auth.uid()
          and role in ('owner', 'admin', 'editor')
          and status = 'active'
          and deleted_at is null
    )
);

drop policy if exists "Content managers can manage article_packages." on public.article_packages;
create policy "Content managers can manage article_packages."
on public.article_packages
for all
to authenticated
using (
    exists (
        select 1
        from public.profiles
        where id = auth.uid()
          and role in ('owner', 'admin', 'editor')
          and status = 'active'
          and deleted_at is null
    )
);

drop policy if exists "Content managers can manage promotions." on public.promotions;
create policy "Content managers can manage promotions."
on public.promotions
for all
to authenticated
using (
    exists (
        select 1
        from public.profiles
        where id = auth.uid()
          and role in ('owner', 'admin', 'editor')
          and status = 'active'
        and deleted_at is null
    )
);

-- ─────────────────────────────────────────────────────────────────────────────
-- Residual privileged mutation closure
-- ─────────────────────────────────────────────────────────────────────────────
--
-- These replacements intentionally keep the policy identities and operation
-- boundaries established by the historical migrations. Only the caller role
-- target and usable-account predicate are tightened. Public/read-only policies
-- on these tables are not dropped here.

drop policy if exists "Only owners can insert organizations." on public.organizations;
create policy "Only owners can insert organizations."
on public.organizations
for insert
to authenticated
with check (
    exists (
        select 1
        from public.profiles p
        where p.id = auth.uid()
          and p.role = 'owner'
          and p.status = 'active'
          and p.deleted_at is null
    )
);

drop policy if exists "Only owners can update organizations." on public.organizations;
create policy "Only owners can update organizations."
on public.organizations
for update
to authenticated
using (
    exists (
        select 1
        from public.profiles p
        where p.id = auth.uid()
          and p.role = 'owner'
          and p.status = 'active'
          and p.deleted_at is null
    )
);

drop policy if exists "Only owners can delete organizations." on public.organizations;
create policy "Only owners can delete organizations."
on public.organizations
for delete
to authenticated
using (
    exists (
        select 1
        from public.profiles p
        where p.id = auth.uid()
          and p.role = 'owner'
          and p.status = 'active'
          and p.deleted_at is null
    )
);

drop policy if exists "Only owners can insert positions." on public.positions;
create policy "Only owners can insert positions."
on public.positions
for insert
to authenticated
with check (
    exists (
        select 1
        from public.profiles p
        where p.id = auth.uid()
          and p.role = 'owner'
          and p.status = 'active'
          and p.deleted_at is null
    )
);

drop policy if exists "Only owners can update positions." on public.positions;
create policy "Only owners can update positions."
on public.positions
for update
to authenticated
using (
    exists (
        select 1
        from public.profiles p
        where p.id = auth.uid()
          and p.role = 'owner'
          and p.status = 'active'
          and p.deleted_at is null
    )
);

drop policy if exists "Only owners can delete positions." on public.positions;
create policy "Only owners can delete positions."
on public.positions
for delete
to authenticated
using (
    exists (
        select 1
        from public.profiles p
        where p.id = auth.uid()
          and p.role = 'owner'
          and p.status = 'active'
          and p.deleted_at is null
    )
);

drop policy if exists "Content creators can insert packages." on public.packages;
create policy "Content creators can insert packages."
on public.packages
for insert
to authenticated
with check (
    exists (
        select 1
        from public.profiles p
        where p.id = auth.uid()
          and p.role in ('owner', 'admin', 'editor')
          and p.status = 'active'
          and p.deleted_at is null
    )
);

drop policy if exists "Content creators can update packages." on public.packages;
create policy "Content creators can update packages."
on public.packages
for update
to authenticated
using (
    exists (
        select 1
        from public.profiles p
        where p.id = auth.uid()
          and p.role in ('owner', 'admin', 'editor')
          and p.status = 'active'
          and p.deleted_at is null
    )
);

drop policy if exists "Content managers can delete packages." on public.packages;
create policy "Content managers can delete packages."
on public.packages
for delete
to authenticated
using (
    exists (
        select 1
        from public.profiles p
        where p.id = auth.uid()
          and p.role in ('owner', 'admin')
          and p.status = 'active'
          and p.deleted_at is null
    )
);

drop policy if exists "Content creators can insert exam_sets." on public.exam_sets;
create policy "Content creators can insert exam_sets."
on public.exam_sets
for insert
to authenticated
with check (
    exists (
        select 1
        from public.profiles p
        where p.id = auth.uid()
          and p.role in ('owner', 'admin', 'editor')
          and p.status = 'active'
          and p.deleted_at is null
    )
);

drop policy if exists "Content creators can update exam_sets." on public.exam_sets;
create policy "Content creators can update exam_sets."
on public.exam_sets
for update
to authenticated
using (
    exists (
        select 1
        from public.profiles p
        where p.id = auth.uid()
          and p.role in ('owner', 'admin', 'editor')
          and p.status = 'active'
          and p.deleted_at is null
    )
);

drop policy if exists "Content managers can delete exam_sets." on public.exam_sets;
create policy "Content managers can delete exam_sets."
on public.exam_sets
for delete
to authenticated
using (
    exists (
        select 1
        from public.profiles p
        where p.id = auth.uid()
          and p.role in ('owner', 'admin')
          and p.status = 'active'
          and p.deleted_at is null
    )
);

drop policy if exists "Content creators can insert questions." on public.questions;
create policy "Content creators can insert questions."
on public.questions
for insert
to authenticated
with check (
    exists (
        select 1
        from public.profiles p
        where p.id = auth.uid()
          and p.role in ('owner', 'admin', 'editor')
          and p.status = 'active'
          and p.deleted_at is null
    )
);

drop policy if exists "Content creators can update questions." on public.questions;
create policy "Content creators can update questions."
on public.questions
for update
to authenticated
using (
    exists (
        select 1
        from public.profiles p
        where p.id = auth.uid()
          and p.role in ('owner', 'admin', 'editor')
          and p.status = 'active'
          and p.deleted_at is null
    )
);

drop policy if exists "Content managers can delete questions." on public.questions;
create policy "Content managers can delete questions."
on public.questions
for delete
to authenticated
using (
    exists (
        select 1
        from public.profiles p
        where p.id = auth.uid()
          and p.role in ('owner', 'admin')
          and p.status = 'active'
          and p.deleted_at is null
    )
);

drop policy if exists "Content creators can manage exam_set_questions." on public.exam_set_questions;
create policy "Content creators can manage exam_set_questions."
on public.exam_set_questions
for all
to authenticated
using (
    exists (
        select 1
        from public.profiles p
        where p.id = auth.uid()
          and p.role in ('owner', 'admin', 'editor')
          and p.status = 'active'
          and p.deleted_at is null
    )
);

drop policy if exists "Financial managers can insert orders." on public.orders;
create policy "Financial managers can insert orders."
on public.orders
for insert
to authenticated
with check (
    exists (
        select 1
        from public.profiles p
        where p.id = auth.uid()
          and p.role in ('owner', 'admin')
          and p.status = 'active'
          and p.deleted_at is null
    )
);

drop policy if exists "Financial managers can update orders." on public.orders;
create policy "Financial managers can update orders."
on public.orders
for update
to authenticated
using (
    exists (
        select 1
        from public.profiles p
        where p.id = auth.uid()
          and p.role in ('owner', 'admin')
          and p.status = 'active'
          and p.deleted_at is null
    )
);

drop policy if exists "Financial managers can delete orders." on public.orders;
create policy "Financial managers can delete orders."
on public.orders
for delete
to authenticated
using (
    exists (
        select 1
        from public.profiles p
        where p.id = auth.uid()
          and p.role in ('owner', 'admin')
          and p.status = 'active'
          and p.deleted_at is null
    )
);

-- Package assets historically admitted every authenticated account. The
-- product paths that use this bucket are Package content writes and the
-- Owner/Admin support settings path; the narrowest shared role set is the
-- existing content-manager set (Owner/Admin/Editor).
drop policy if exists "Users can upload package assets." on storage.objects;
create policy "Users can upload package assets."
on storage.objects
for insert
to authenticated
with check (
    bucket_id = 'package-assets'
    and exists (
        select 1
        from public.profiles p
        where p.id = auth.uid()
          and p.role in ('owner', 'admin', 'editor')
          and p.status = 'active'
          and p.deleted_at is null
    )
);

drop policy if exists "Users can update package assets." on storage.objects;
create policy "Users can update package assets."
on storage.objects
for update
to authenticated
using (
    bucket_id = 'package-assets'
    and exists (
        select 1
        from public.profiles p
        where p.id = auth.uid()
          and p.role in ('owner', 'admin', 'editor')
          and p.status = 'active'
          and p.deleted_at is null
    )
);

drop policy if exists "Content managers can upload news assets." on storage.objects;
create policy "Content managers can upload news assets."
on storage.objects
for insert
to authenticated
with check (
    bucket_id = 'news-assets'
    and exists (
        select 1
        from public.profiles p
        where p.id = auth.uid()
          and p.role in ('owner', 'admin', 'editor')
          and p.status = 'active'
          and p.deleted_at is null
    )
);

drop policy if exists "Content managers can update news assets." on storage.objects;
create policy "Content managers can update news assets."
on storage.objects
for update
to authenticated
using (
    bucket_id = 'news-assets'
    and exists (
        select 1
        from public.profiles p
        where p.id = auth.uid()
          and p.role in ('owner', 'admin', 'editor')
          and p.status = 'active'
          and p.deleted_at is null
    )
);

drop policy if exists "Content managers can delete news assets." on storage.objects;
create policy "Content managers can delete news assets."
on storage.objects
for delete
to authenticated
using (
    bucket_id = 'news-assets'
    and exists (
        select 1
        from public.profiles p
        where p.id = auth.uid()
          and p.role in ('owner', 'admin', 'editor')
          and p.status = 'active'
          and p.deleted_at is null
    )
);

drop policy if exists "Content managers can upload article assets." on storage.objects;
create policy "Content managers can upload article assets."
on storage.objects
for insert
to authenticated
with check (
    bucket_id = 'article-assets'
    and exists (
        select 1
        from public.profiles p
        where p.id = auth.uid()
          and p.role in ('owner', 'admin', 'editor')
          and p.status = 'active'
          and p.deleted_at is null
    )
);

drop policy if exists "Content managers can update article assets." on storage.objects;
create policy "Content managers can update article assets."
on storage.objects
for update
to authenticated
using (
    bucket_id = 'article-assets'
    and exists (
        select 1
        from public.profiles p
        where p.id = auth.uid()
          and p.role in ('owner', 'admin', 'editor')
          and p.status = 'active'
          and p.deleted_at is null
    )
);

drop policy if exists "Content managers can delete article assets." on storage.objects;
create policy "Content managers can delete article assets."
on storage.objects
for delete
to authenticated
using (
    bucket_id = 'article-assets'
    and exists (
        select 1
        from public.profiles p
        where p.id = auth.uid()
          and p.role in ('owner', 'admin', 'editor')
          and p.status = 'active'
          and p.deleted_at is null
    )
);

-- Migration 046 used this helper for editor mutation policies. The helper is
-- not used by the public/read-only KP resolvers, so tightening it here has a
-- bounded write-only blast radius. Summary aggregate mutation policies remain
-- fenced by migration 058 and are intentionally not recreated.
create or replace function public.kp_is_content_editor()
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public, auth, pg_temp
as $function$
    select exists (
        select 1
        from public.profiles p
        where p.id = auth.uid()
          and p.role in ('owner', 'admin', 'editor')
          and p.status = 'active'
          and p.deleted_at is null
    )
$function$;

revoke all on function public.kp_is_content_editor() from PUBLIC, anon, authenticated;
grant execute on function public.kp_is_content_editor() to authenticated;

drop policy if exists kp_editor_insert on public.reference_documents;
create policy kp_editor_insert
on public.reference_documents
for insert
to authenticated
with check (public.kp_is_content_editor());

drop policy if exists kp_editor_update on public.reference_documents;
create policy kp_editor_update
on public.reference_documents
for update
to authenticated
using (public.kp_is_content_editor())
with check (public.kp_is_content_editor());

drop policy if exists kp_editor_insert on public.reference_document_versions;
create policy kp_editor_insert
on public.reference_document_versions
for insert
to authenticated
with check (public.kp_is_content_editor());

drop policy if exists kp_editor_update on public.reference_document_versions;
create policy kp_editor_update
on public.reference_document_versions
for update
to authenticated
using (public.kp_is_content_editor())
with check (public.kp_is_content_editor());

drop policy if exists kp_editor_insert on public.reference_document_aliases;
create policy kp_editor_insert
on public.reference_document_aliases
for insert
to authenticated
with check (public.kp_is_content_editor());

drop policy if exists kp_editor_update on public.reference_document_aliases;
create policy kp_editor_update
on public.reference_document_aliases
for update
to authenticated
using (public.kp_is_content_editor())
with check (public.kp_is_content_editor());

-- The original promotion publication policy is a public-read contract. Keep
-- its table ACL aligned with the RLS policy while granting authenticated
-- managers the table verbs that the FOR ALL policy governs.
grant select on table public.promotions to anon, authenticated;
grant insert, update, delete on table public.promotions to authenticated;

-- No anonymous profile reads and no generic authenticated UPDATE. The
-- explicit column grant is the primary mutation boundary; the policy and
-- trigger are independent defense-in-depth layers.
revoke all on table public.profiles from PUBLIC, anon, authenticated;
grant select on table public.profiles to authenticated;
grant update (display_name, occupation, phone, avatar_url, last_seen_at)
on table public.profiles to authenticated;

do $profile_rbac_postflight$
declare
    expected_function record;
    expected_policy record;
    profile_column record;
    status_column record;
    function_owner name;
    function_is_security_definer boolean;
    function_config text[];
    v_status_baseline text;
begin
    v_status_baseline := pg_catalog.current_setting(
        'sobdai.sec079_status_baseline',
        true
    );

    if v_status_baseline not in ('legacy', 'normalized') then
        raise exception using
            errcode = 'check_violation',
            message = 'SEC postflight cannot prove the profiles.status baseline that was migrated.';
    end if;

    select c.data_type, c.is_nullable, c.column_default
    into status_column
    from information_schema.columns c
    where c.table_schema = 'public'
      and c.table_name = 'profiles'
      and c.column_name = 'status';

    if not found
       or status_column.data_type <> 'text'
       or status_column.is_nullable <> 'NO'
       or status_column.column_default <> '''active''::text'
    then
        raise exception using
            errcode = 'check_violation',
            message = 'SEC postflight found an invalid public.profiles.status column contract.';
    end if;

    if not exists (
        select 1
        from pg_catalog.pg_constraint c
        where c.conrelid = 'public.profiles'::regclass
          and c.contype = 'c'
          and pg_catalog.pg_get_constraintdef(c.oid) ilike '%status%'
          and (
              select array_agg(m[1] order by m[1])
              from pg_catalog.regexp_matches(
                  pg_catalog.pg_get_constraintdef(c.oid),
                  $$'([^']+)'(?:::text)?$$,
                  'g'
              ) as m
          ) = array['active', 'banned']::text[]
    ) then
        raise exception using
            errcode = 'check_violation',
            message = 'SEC postflight found an invalid public.profiles.status vocabulary constraint.';
    end if;

    if exists (
        select 1
        from public.profiles p
        where p.status is null
           or p.status not in ('active', 'banned')
    ) then
        raise exception using
            errcode = 'check_violation',
            message = 'SEC postflight found a NULL or unsupported public.profiles.status value.';
    end if;

    if v_status_baseline = 'legacy'
       and exists (
           select 1
           from public.profiles p
           where p.status <> 'active'
       )
    then
        raise exception using
            errcode = 'check_violation',
            message = 'SEC postflight found a legacy profile that was not normalized to status=active.';
    end if;

    if not exists (
        select 1
        from pg_catalog.pg_class c
        join pg_catalog.pg_namespace n on n.oid = c.relnamespace
        where n.nspname = 'public'
          and c.relname = 'profiles'
          and c.relkind = 'r'
          and c.relrowsecurity
    ) then
        raise exception using
            errcode = 'check_violation',
            message = 'SEC postflight requires RLS on public.profiles.';
    end if;

    if pg_catalog.has_table_privilege('anon', 'public.profiles', 'SELECT') then
        raise exception using
            errcode = 'check_violation',
            message = 'SEC postflight found broad anonymous SELECT on public.profiles.';
    end if;

    if pg_catalog.has_table_privilege('authenticated', 'public.profiles', 'UPDATE') then
        raise exception using
            errcode = 'check_violation',
            message = 'SEC postflight found generic authenticated UPDATE on public.profiles.';
    end if;

    for profile_column in
        select c.column_name
        from information_schema.columns c
        where c.table_schema = 'public'
          and c.table_name = 'profiles'
    loop
        if pg_catalog.has_column_privilege(
            'anon',
            'public.profiles',
            profile_column.column_name,
            'SELECT'
        ) then
            raise exception using
                errcode = 'check_violation',
                message = format(
                    'SEC postflight found anonymous SELECT on public.profiles.%I.',
                    profile_column.column_name
                );
        end if;

        if pg_catalog.has_column_privilege(
            'authenticated',
            'public.profiles',
            profile_column.column_name,
            'UPDATE'
        ) <> (
            profile_column.column_name in (
                'display_name',
                'occupation',
                'phone',
                'avatar_url',
                'last_seen_at'
            )
        ) then
            raise exception using
                errcode = 'check_violation',
                message = format(
                    'SEC postflight found an unexpected authenticated UPDATE grant on public.profiles.%I.',
                    profile_column.column_name
                );
        end if;
    end loop;

    for expected_policy in
        select policy_name, table_name, policy_command
        from (values
            ('profiles_select_own', 'profiles', 'SELECT'),
            ('profiles_select_managers', 'profiles', 'SELECT'),
            ('profiles_update_self', 'profiles', 'UPDATE'),
            ('Only admins can manage homepage settings.', 'homepage_settings', 'ALL'),
            ('Content managers can manage news.', 'news', 'ALL'),
            ('Content managers can manage news_packages.', 'news_packages', 'ALL'),
            ('Content managers can manage news_summaries.', 'news_summaries', 'ALL'),
            ('Content managers can manage news_redirects.', 'news_redirects', 'ALL'),
            ('Content managers can manage articles.', 'articles', 'ALL'),
            ('Content managers can manage article_packages.', 'article_packages', 'ALL'),
            ('Content managers can manage promotions.', 'promotions', 'ALL')
        ) as required(policy_name, table_name, policy_command)
    loop
        if not exists (
            select 1
            from pg_catalog.pg_policies p
            where p.schemaname = 'public'
              and p.tablename = expected_policy.table_name
              and p.policyname = expected_policy.policy_name
              and p.cmd = expected_policy.policy_command
              and p.roles = array['authenticated']::name[]
        ) then
            raise exception using
                errcode = 'check_violation',
                message = format(
                    'SEC postflight policy is missing or mis-scoped: public.%I.%I.',
                    expected_policy.table_name,
                    expected_policy.policy_name
                );
        end if;
    end loop;

    if not pg_catalog.has_table_privilege('anon', 'public.promotions', 'SELECT')
       or not pg_catalog.has_table_privilege('authenticated', 'public.promotions', 'SELECT')
       or not pg_catalog.has_table_privilege('authenticated', 'public.promotions', 'INSERT')
       or not pg_catalog.has_table_privilege('authenticated', 'public.promotions', 'UPDATE')
       or not pg_catalog.has_table_privilege('authenticated', 'public.promotions', 'DELETE')
    then
        raise exception using
            errcode = 'check_violation',
            message = 'SEC postflight promotion ACLs are missing or too narrow.';
    end if;

    for expected_policy in
        select policy_name, table_name
        from (values
            ('Only admins can manage homepage settings.', 'homepage_settings'),
            ('Content managers can manage news.', 'news'),
            ('Content managers can manage news_packages.', 'news_packages'),
            ('Content managers can manage news_summaries.', 'news_summaries'),
            ('Content managers can manage news_redirects.', 'news_redirects'),
            ('Content managers can manage articles.', 'articles'),
            ('Content managers can manage article_packages.', 'article_packages'),
            ('Content managers can manage promotions.', 'promotions')
        ) as required(policy_name, table_name)
    loop
        if not exists (
            select 1
            from pg_catalog.pg_policies p
            where p.schemaname = 'public'
              and p.tablename = expected_policy.table_name
              and p.policyname = expected_policy.policy_name
              and p.cmd = 'ALL'
              and p.roles = array['authenticated']::name[]
              and p.qual ilike '%status = ''active''%'
              and p.qual ilike '%deleted_at is null%'
        ) then
            raise exception using
                errcode = 'check_violation',
                message = format(
                    'SEC postflight manager policy is missing usable-account checks: public.%I.%I.',
                    expected_policy.table_name,
                    expected_policy.policy_name
                );
        end if;
    end loop;

    for expected_policy in
        select policy_name, table_name
        from (values
            ('Homepage settings are publicly readable.', 'homepage_settings'),
            ('Public can read published news.', 'news'),
            ('Public can read relations of published news (packages).', 'news_packages'),
            ('Public can read relations of published news (summaries).', 'news_summaries'),
            ('Public can read news redirects.', 'news_redirects'),
            ('Public can read published articles.', 'articles'),
            ('Public can read relations of published articles (packages).', 'article_packages'),
            ('Public can read live homepage promotions.', 'promotions')
        ) as required(policy_name, table_name)
    loop
        if not exists (
            select 1
            from pg_catalog.pg_policies p
            where p.schemaname = 'public'
              and p.tablename = expected_policy.table_name
              and p.policyname = expected_policy.policy_name
              and p.cmd = 'SELECT'
              and p.roles = array['public']::name[]
        ) then
            raise exception using
                errcode = 'check_violation',
                message = format(
                    'SEC postflight public-read policy is missing or changed: public.%I.%I.',
                    expected_policy.table_name,
                    expected_policy.policy_name
                );
        end if;
    end loop;

    -- Every known administrative mutation boundary must be explicit
    -- authenticated authority with the usable-account predicate. KP reference
    -- mutations use the separately verified write-only helper instead of
    -- duplicating its profile lookup in each policy.
    for expected_policy in
        select policy_schema, table_name, policy_name, policy_command, uses_kp_helper
        from (values
            ('public', 'organizations', 'Only owners can insert organizations.', 'INSERT', false),
            ('public', 'organizations', 'Only owners can update organizations.', 'UPDATE', false),
            ('public', 'organizations', 'Only owners can delete organizations.', 'DELETE', false),
            ('public', 'positions', 'Only owners can insert positions.', 'INSERT', false),
            ('public', 'positions', 'Only owners can update positions.', 'UPDATE', false),
            ('public', 'positions', 'Only owners can delete positions.', 'DELETE', false),
            ('public', 'packages', 'Content creators can insert packages.', 'INSERT', false),
            ('public', 'packages', 'Content creators can update packages.', 'UPDATE', false),
            ('public', 'packages', 'Content managers can delete packages.', 'DELETE', false),
            ('public', 'exam_sets', 'Content creators can insert exam_sets.', 'INSERT', false),
            ('public', 'exam_sets', 'Content creators can update exam_sets.', 'UPDATE', false),
            ('public', 'exam_sets', 'Content managers can delete exam_sets.', 'DELETE', false),
            ('public', 'questions', 'Content creators can insert questions.', 'INSERT', false),
            ('public', 'questions', 'Content creators can update questions.', 'UPDATE', false),
            ('public', 'questions', 'Content managers can delete questions.', 'DELETE', false),
            ('public', 'exam_set_questions', 'Content creators can manage exam_set_questions.', 'ALL', false),
            ('public', 'orders', 'Financial managers can insert orders.', 'INSERT', false),
            ('public', 'orders', 'Financial managers can update orders.', 'UPDATE', false),
            ('public', 'orders', 'Financial managers can delete orders.', 'DELETE', false),
            ('storage', 'objects', 'Users can upload package assets.', 'INSERT', false),
            ('storage', 'objects', 'Users can update package assets.', 'UPDATE', false),
            ('storage', 'objects', 'Content managers can upload news assets.', 'INSERT', false),
            ('storage', 'objects', 'Content managers can update news assets.', 'UPDATE', false),
            ('storage', 'objects', 'Content managers can delete news assets.', 'DELETE', false),
            ('storage', 'objects', 'Content managers can upload article assets.', 'INSERT', false),
            ('storage', 'objects', 'Content managers can update article assets.', 'UPDATE', false),
            ('storage', 'objects', 'Content managers can delete article assets.', 'DELETE', false),
            ('public', 'reference_documents', 'kp_editor_insert', 'INSERT', true),
            ('public', 'reference_documents', 'kp_editor_update', 'UPDATE', true),
            ('public', 'reference_document_versions', 'kp_editor_insert', 'INSERT', true),
            ('public', 'reference_document_versions', 'kp_editor_update', 'UPDATE', true),
            ('public', 'reference_document_aliases', 'kp_editor_insert', 'INSERT', true),
            ('public', 'reference_document_aliases', 'kp_editor_update', 'UPDATE', true)
        ) as required(policy_schema, table_name, policy_name, policy_command, uses_kp_helper)
    loop
        if not exists (
            select 1
            from pg_catalog.pg_policies p
            where p.schemaname = expected_policy.policy_schema
              and p.tablename = expected_policy.table_name
              and p.policyname = expected_policy.policy_name
              and p.cmd = expected_policy.policy_command
              and p.roles = array['authenticated']::name[]
              and (
                  (
                      expected_policy.uses_kp_helper
                      and (
                          coalesce(p.qual, '') || ' ' || coalesce(p.with_check, '')
                      ) ilike '%kp_is_content_editor%'
                  )
                  or (
                      not expected_policy.uses_kp_helper
                      and (
                          coalesce(p.qual, '') || ' ' || coalesce(p.with_check, '')
                      ) ilike '%status = ''active''%'
                      and (
                          coalesce(p.qual, '') || ' ' || coalesce(p.with_check, '')
                      ) ilike '%deleted_at is null%'
                  )
              )
        ) then
            raise exception using
                errcode = 'check_violation',
                message = format(
                    'SEC postflight privileged mutation policy is missing usable-account fencing: %s.%I.%I (%s).',
                    expected_policy.policy_schema,
                    expected_policy.table_name,
                    expected_policy.policy_name,
                    expected_policy.policy_command
                );
        end if;
    end loop;

    -- Catalog-wide guard for the known administrative surface. It catches a
    -- legacy policy under an unexpected name as well as the explicitly
    -- replaced identities, while leaving public reads, ordinary user-owned
    -- mutations, and service_role/RPC-fenced paths outside this assertion.
    if exists (
        select 1
        from pg_catalog.pg_policies p
        where (
                p.schemaname = 'public'
                and p.tablename in (
                    'organizations',
                    'positions',
                    'packages',
                    'exam_sets',
                    'questions',
                    'exam_set_questions',
                    'orders',
                    'reference_documents',
                    'reference_document_versions',
                    'reference_document_aliases'
                )
            or (
                p.schemaname = 'storage'
                and p.tablename = 'objects'
                and (
                    (coalesce(p.qual, '') || ' ' || coalesce(p.with_check, '')) ilike '%package-assets%'
                    or (coalesce(p.qual, '') || ' ' || coalesce(p.with_check, '')) ilike '%news-assets%'
                    or (coalesce(p.qual, '') || ' ' || coalesce(p.with_check, '')) ilike '%article-assets%'
                )
            )
        )
          and p.cmd in ('INSERT', 'UPDATE', 'DELETE', 'ALL')
          and not p.roles @> array['service_role']::name[]
          and not (
              (
                  coalesce(p.qual, '') || ' ' || coalesce(p.with_check, '')
              ) ilike '%service_role%'
          )
          and (
              p.roles <> array['authenticated']::name[]
              or (
                  (
                      coalesce(p.qual, '') || ' ' || coalesce(p.with_check, '')
                  ) not ilike '%status = ''active''%'
                  and (
                      (
                          coalesce(p.qual, '') || ' ' || coalesce(p.with_check, '')
                      ) not ilike '%kp_is_content_editor%'
                      or p.tablename not in (
                          'reference_documents',
                          'reference_document_versions',
                          'reference_document_aliases'
                      )
                  )
              )
              or (
                  (
                      coalesce(p.qual, '') || ' ' || coalesce(p.with_check, '')
                  ) not ilike '%deleted_at is null%'
                  and p.tablename not in (
                      'reference_documents',
                      'reference_document_versions',
                      'reference_document_aliases'
                  )
              )
          )
    ) then
        raise exception using
            errcode = 'check_violation',
            message = 'SEC postflight found an unfenced privileged mutation policy in the known application surface.';
    end if;

    if exists (
        select 1
        from pg_catalog.pg_policies p
        where p.schemaname = 'public'
          and p.tablename = 'profiles'
          and p.cmd = 'SELECT'
          and p.roles <> array['authenticated']::name[]
    ) then
        raise exception using
            errcode = 'check_violation',
            message = 'SEC postflight found a non-authenticated profiles SELECT policy.';
    end if;

    for expected_function in
        select signature
        from (values
            ('public.profile_actor_is_manager()'),
            ('public.admin_update_profile_role(uuid, text)'),
            ('public.admin_update_profile_status(uuid, text, text)'),
            ('public.deactivate_my_profile()'),
            ('public.kp_is_content_editor()')
        ) as required(signature)
    loop
        if pg_catalog.to_regprocedure(expected_function.signature) is null then
            raise exception using
                errcode = 'check_violation',
                message = format(
                    'SEC postflight function is missing: %s.',
                    expected_function.signature
                );
        end if;

        select
            pg_catalog.pg_get_userbyid(p.proowner),
            p.prosecdef,
            p.proconfig
        into function_owner, function_is_security_definer, function_config
        from pg_catalog.pg_proc p
        where p.oid = pg_catalog.to_regprocedure(expected_function.signature);

        if function_owner <> current_user
           or not function_is_security_definer
           or not (
               coalesce(function_config, '{}'::text[]) @> array[
                   'search_path=pg_catalog, public, auth, pg_temp'
               ]::text[]
           )
        then
            raise exception using
                errcode = 'check_violation',
                message = format(
                    'SEC postflight function security configuration is invalid: %s.',
                    expected_function.signature
                );
        end if;

        if pg_catalog.has_function_privilege(
            'anon', expected_function.signature, 'EXECUTE'
        )
        or (
            exists (select 1 from pg_catalog.pg_roles where rolname = 'service_role')
            and pg_catalog.has_function_privilege(
                'service_role', expected_function.signature, 'EXECUTE'
            )
        )
        or not pg_catalog.has_function_privilege(
            'authenticated', expected_function.signature, 'EXECUTE'
        ) then
            raise exception using
                errcode = 'check_violation',
                message = format(
                    'SEC postflight function ACL is invalid: %s.',
                    expected_function.signature
                );
        end if;
    end loop;

    if not exists (
        select 1
        from pg_catalog.pg_trigger t
        join pg_catalog.pg_class c on c.oid = t.tgrelid
        join pg_catalog.pg_namespace n on n.oid = c.relnamespace
        where n.nspname = 'public'
          and c.relname = 'profiles'
          and t.tgname = 'profiles_security_guard'
          and not t.tgisinternal
          and t.tgenabled <> 'D'
          and t.tgfoid = pg_catalog.to_regprocedure(
              'public.protect_profile_security_fields()'
          )
    ) then
        raise exception using
            errcode = 'check_violation',
            message = 'SEC postflight security trigger is missing or disabled.';
    end if;

    if exists (
        select 1
        from pg_catalog.pg_proc p
        where p.oid = pg_catalog.to_regprocedure(
            'public.protect_profile_security_fields()'
        )
          and (
              not (
                  coalesce(p.proconfig, '{}'::text[]) @> array[
                      'search_path=pg_catalog, public, pg_temp'
                  ]::text[]
              )
              or pg_catalog.has_function_privilege(
                  'anon',
                  'public.protect_profile_security_fields()',
                  'EXECUTE'
              )
              or pg_catalog.has_function_privilege(
                  'authenticated',
                  'public.protect_profile_security_fields()',
                  'EXECUTE'
              )
          )
    ) then
        raise exception using
            errcode = 'check_violation',
            message = 'SEC postflight trigger function security configuration is invalid.';
    end if;
end
$profile_rbac_postflight$;

notify pgrst, 'reload schema';
