-- Sobdai Notification V1 — authenticated in-app notifications.
--
-- This migration adds only the first notification event:
-- PACKAGE_APPROVED for a successful manual PromptPay payment approval.
-- public.orders remains the sole paid package/access authority.
--
-- Release order: DB-FIRST. The approval RPC below is replaced only after the
-- notifications table, policies, and indexes have been created.

set local lock_timeout = '5s';

do $notifications_v1_preflight$
begin
    if to_regclass('public.profiles') is null
       or to_regclass('public.orders') is null
       or to_regclass('public.packages') is null
    then
        raise exception using
            errcode = 'check_violation',
            message = 'Notification V1 requires public.profiles, public.orders, and public.packages.';
    end if;

    if to_regnamespace('extensions') is null
       or to_regprocedure('extensions.uuid_generate_v4()') is null
    then
        raise exception using
            errcode = 'check_violation',
            message = 'Notification V1 requires extensions.uuid_generate_v4() in the extensions schema.';
    end if;

    if to_regprocedure('public.approve_payment_submission(uuid)') is null then
        raise exception using
            errcode = 'check_violation',
            message = 'Notification V1 requires the existing manual payment approval RPC.';
    end if;

    if to_regclass('public.notifications') is not null then
        raise exception using
            errcode = 'duplicate_object',
            message = 'Notification V1 refuses an existing public.notifications object; inspect schema drift before applying the canonical migration.';
    end if;
end
$notifications_v1_preflight$;

-- ---------------------------------------------------------------------------
-- Minimal durable notification row. This is a user-facing read model, not an
-- event ledger and not an access/entitlement table.
-- ---------------------------------------------------------------------------

create table public.notifications (
    id uuid primary key default extensions.uuid_generate_v4(),
    user_id uuid not null references public.profiles(id) on delete cascade,
    type text not null,
    title text not null,
    body text not null,
    href text not null,
    source_order_id uuid not null references public.orders(id) on delete cascade,
    read_at timestamptz,
    created_at timestamptz not null default now(),
    constraint notifications_type_check check (type in ('PACKAGE_APPROVED')),
    constraint notifications_content_check check (
        length(btrim(title)) > 0
        and length(btrim(body)) > 0
        and href like '/%'
    ),
    constraint notifications_type_source_order_key unique (type, source_order_id)
);

comment on table public.notifications is
    'Authenticated in-app notifications; not a payment, access, entitlement, or event-ledger authority.';
comment on column public.notifications.source_order_id is
    'The existing public.orders row that produced this notification; also provides hard event deduplication.';
comment on column public.notifications.href is
    'Trusted internal destination selected by the payment approval RPC.';

create index notifications_user_unread_idx
    on public.notifications (user_id, created_at desc)
    where read_at is null;

create index notifications_user_created_at_idx
    on public.notifications (user_id, created_at desc);

alter table public.notifications enable row level security;

drop policy if exists "Users can view own notifications." on public.notifications;
create policy "Users can view own notifications."
    on public.notifications for select
    to authenticated
    using (user_id = auth.uid());

drop policy if exists "Users can mark own notifications read." on public.notifications;
create policy "Users can mark own notifications read."
    on public.notifications for update
    to authenticated
    using (user_id = auth.uid())
    with check (
        user_id = auth.uid()
        and read_at is not null
    );

-- Authenticated clients may read their own rows and update only read_at. They
-- cannot insert, delete, or update ownership/type/content/source fields.
revoke all on table public.notifications from public, anon, authenticated;
grant select on table public.notifications to authenticated;
grant update (read_at) on table public.notifications to authenticated;

-- ---------------------------------------------------------------------------
-- Trusted producer. This helper is intentionally not executable by clients;
-- only the approval RPC can invoke it. The payment/access transition stays
-- exactly where it was: the RPC updates payment_submissions and then
-- public.orders.status = 'paid'. Notification insertion is isolated in a
-- PL/pgSQL subtransaction so any notification failure is swallowed without
-- rolling back that valid approval.
-- ---------------------------------------------------------------------------

create or replace function public.try_create_package_approved_notification(
    p_order_id uuid
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public, auth, pg_temp
set lock_timeout = '5s'
as $function$
declare
    v_order_user_id uuid;
    v_order_package_id uuid;
    v_package_name text;
begin
    select o.user_id, o.package_id
    into v_order_user_id, v_order_package_id
    from public.orders o
    where o.id = p_order_id;

    if not found then
        raise exception using
            errcode = '22023',
            message = 'Cannot create notification for a missing order.';
    end if;

    select p.name
    into v_package_name
    from public.packages p
    where p.id = v_order_package_id;

    insert into public.notifications (
        user_id,
        type,
        title,
        body,
        href,
        source_order_id
    ) values (
        v_order_user_id,
        'PACKAGE_APPROVED',
        'แพ็กเกจของคุณพร้อมใช้งานแล้ว',
        coalesce(nullif(btrim(v_package_name), ''), 'แพ็กเกจของคุณ'),
        '/my-packages',
        p_order_id
    )
    on conflict (type, source_order_id) do nothing;
exception
    when others then
        raise warning 'PACKAGE_APPROVED notification skipped for order %: %',
            p_order_id, sqlerrm;
end
$function$;

comment on function public.try_create_package_approved_notification(uuid) is
    'Best-effort, idempotent PACKAGE_APPROVED read-model producer used only by the manual payment approval RPC.';

revoke all on function public.try_create_package_approved_notification(uuid)
    from public, anon, authenticated, service_role;

create or replace function public.approve_payment_submission(
    p_submission_id uuid
)
returns table (
    payment_submission_id uuid,
    order_id uuid,
    status text
)
language plpgsql
security definer
set search_path = pg_catalog, public, auth, pg_temp
set lock_timeout = '5s'
as $function$
declare
    v_actor_id uuid;
    v_submission_id uuid;
    v_order_id uuid;
    v_submission_status text;
    v_order_status text;
    v_payment_provider text;
    v_order_user_id uuid;
    v_order_package_id uuid;
    v_completed_order_id uuid;
begin
    v_actor_id := auth.uid();

    if v_actor_id is null then
        raise exception using
            errcode = '42501',
            message = 'Authentication is required.';
    end if;

    if not exists (
        select 1
        from public.profiles p
        where p.id = v_actor_id
          and p.role in ('owner', 'admin')
          and p.status = 'active'
          and p.deleted_at is null
    ) then
        raise exception using
            errcode = '42501',
            message = 'Financial manager permission is required.';
    end if;

    select ps.id, ps.order_id, ps.status, o.status, o.payment_provider,
           o.user_id, o.package_id
    into v_submission_id, v_order_id, v_submission_status, v_order_status,
         v_payment_provider, v_order_user_id, v_order_package_id
    from public.payment_submissions ps
    join public.orders o on o.id = ps.order_id
    where ps.id = p_submission_id
    for update of ps, o;

    if not found then
        raise exception using
            errcode = '22023',
            message = 'Payment submission not found.';
    end if;

    if v_submission_status = 'approved' and v_order_status = 'paid' then
        perform public.try_create_package_approved_notification(v_order_id);
        return query select v_submission_id, v_order_id, 'approved'::text;
        return;
    end if;

    if v_submission_status <> 'submitted'
       or v_order_status <> 'pending'
       or v_payment_provider <> 'promptpay_manual'
    then
        raise exception using
            errcode = '40001',
            message = 'Payment submission is no longer approvable.';
    end if;

    -- A different completed order is an idempotency/concurrency guard against
    -- granting the same package twice if the customer also used another flow.
    select o.id
    into v_completed_order_id
    from public.orders o
    where o.user_id = v_order_user_id
      and o.package_id = v_order_package_id
      and o.status in ('paid', 'free')
      and o.id <> v_order_id
    order by o.created_at desc
    limit 1;

    if found then
        raise exception using
            errcode = '23505',
            message = 'The user already has package access through another order.';
    end if;

    update public.payment_submissions
    set status = 'approved',
        reviewed_at = now(),
        reviewed_by = v_actor_id,
        rejection_reason = null
    where id = v_submission_id;

    update public.orders as o
    set status = 'paid'
    where o.id = v_order_id
      and o.status = 'pending'
      and o.payment_provider = 'promptpay_manual';

    if not found then
        raise exception using
            errcode = '40001',
            message = 'The order changed before approval could be completed.';
    end if;

    -- The helper owns the narrowly isolated notification subtransaction. A
    -- failed insert therefore rolls back only the notification attempt; the
    -- approved evidence and paid order remain committed by the caller.
    perform public.try_create_package_approved_notification(v_order_id);

    return query select v_submission_id, v_order_id, 'approved'::text;
end
$function$;

comment on function public.approve_payment_submission(uuid) is
    'Atomically approves manual payment evidence and changes its existing order to paid; PACKAGE_APPROVED notification is best-effort, retryable, and idempotent.';

revoke all on function public.approve_payment_submission(uuid)
    from public, anon, authenticated, service_role;
grant execute on function public.approve_payment_submission(uuid)
    to authenticated;

notify pgrst, 'reload schema';

-- ---------------------------------------------------------------------------
-- Operator handoff (not executed by the application):
--
-- 1. Apply this file to the intended Supabase database after confirming that
--    migration 088 and the later production baseline are already present.
-- 2. Verify the table, policies, indexes, grants, and producer RPC:
--
--      select to_regclass('public.notifications');
--      select indexname from pg_indexes
--        where schemaname = 'public'
--          and indexname in (
--            'notifications_user_unread_idx',
--            'notifications_user_created_at_idx',
--            'notifications_type_source_order_key'
--          );
--      select policyname, cmd from pg_policies
--        where schemaname = 'public' and tablename = 'notifications';
--      select table_name, privilege_type, grantee
--        from information_schema.role_table_grants
--        where table_schema = 'public'
--          and table_name = 'notifications'
--        order by grantee, privilege_type;
--      select routine_name from information_schema.routines
--        where routine_schema = 'public'
--          and routine_name = 'approve_payment_submission';
--      select p.proname, p.prosecdef, p.proconfig
--        from pg_proc p
--        where p.oid = 'public.approve_payment_submission(uuid)'::regprocedure;
--
-- 3. Confirm a real approval changes the existing order to paid and produces at
--    most one row for that order:
--
--      select o.id, o.status, count(n.id) as notification_count
--        from public.orders o
--        left join public.notifications n
--          on n.source_order_id = o.id
--         and n.type = 'PACKAGE_APPROVED'
--       where o.payment_provider = 'promptpay_manual'
--         and o.status = 'paid'
--       group by o.id, o.status
--       order by o.id desc
--       limit 20;
--
-- Do not run production SQL from the application rollout. Do not add
-- entitlements, enrollment rows, realtime subscriptions, or notification
-- backfill writes as part of this migration.
