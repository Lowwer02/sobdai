-- Sobdai Notification V1.1 — rejected manual payment notifications.
--
-- This migration extends the existing notifications read model with one
-- trusted event: PAYMENT_REJECTED. It remains a UI read model only; orders
-- remains the package-access authority.

set local lock_timeout = '5s';

-- Fail closed unless the canonical 092 notification and 088 payment objects
-- are present. In particular, do not silently adapt an unrelated notifications
-- table or a drifted approval dedupe constraint.
do $payment_rejected_notification_preflight$
begin
    if to_regclass('public.notifications') is null then
        raise exception using
            errcode = 'check_violation',
            message = 'Notification 093 requires the canonical public.notifications table from migration 092.';
    end if;

    if to_regclass('public.payment_submissions') is null then
        raise exception using
            errcode = 'check_violation',
            message = 'Notification 093 requires public.payment_submissions from the manual payment foundation.';
    end if;

    if to_regprocedure('public.reject_payment_submission(uuid,text)') is null then
        raise exception using
            errcode = 'check_violation',
            message = 'Notification 093 requires public.reject_payment_submission(uuid,text).';
    end if;

    if not exists (
        select 1
        from pg_constraint
        where conrelid = 'public.notifications'::regclass
          and conname = 'notifications_type_check'
          and contype = 'c'
    ) then
        raise exception using
            errcode = 'check_violation',
            message = 'Notification 093 refuses a drifted notification type constraint.';
    end if;

    if not exists (
        select 1
        from pg_constraint
        where conrelid = 'public.notifications'::regclass
          and conname = 'notifications_type_source_order_key'
          and contype = 'u'
    ) then
        raise exception using
            errcode = 'check_violation',
            message = 'Notification 093 refuses a drifted PACKAGE_APPROVED dedupe constraint.';
    end if;

    if exists (
        select 1
        from information_schema.columns
        where table_schema = 'public'
          and table_name = 'notifications'
          and column_name = 'source_payment_submission_id'
    ) then
        raise exception using
            errcode = 'duplicate_column',
            message = 'Notification 093 refuses an already-present source_payment_submission_id column.';
    end if;
end
$payment_rejected_notification_preflight$;

alter table public.notifications
    add column source_payment_submission_id uuid
        references public.payment_submissions(id) on delete cascade;

comment on column public.notifications.source_payment_submission_id is
    'The payment_submissions row that produced a PAYMENT_REJECTED notification; enables per-attempt deduplication.';

alter table public.notifications
    drop constraint notifications_type_check;

alter table public.notifications
    add constraint notifications_type_check check (
        type in ('PACKAGE_APPROVED', 'PAYMENT_REJECTED')
    );

-- A single order may have multiple rejected evidence attempts. Preserve the
-- approval invariant with a type-scoped order index and dedupe rejected rows
-- by their immutable payment submission identity instead of by order.
alter table public.notifications
    drop constraint notifications_type_source_order_key;

create unique index notifications_type_source_order_key
    on public.notifications (type, source_order_id)
    where type = 'PACKAGE_APPROVED';

alter table public.notifications
    add constraint notifications_type_source_payment_submission_key
    unique (type, source_payment_submission_id);

-- Keep the existing PACKAGE_APPROVED producer compatible with its new
-- type-scoped unique index. This migration does not change its authority,
-- payload, or failure-isolation behavior.
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
    on conflict (type, source_order_id) where type = 'PACKAGE_APPROVED' do nothing;
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

-- Trusted rejected-payment producer. It receives only the immutable submission
-- identity, derives the owner/order/package from server-side rows, never copies
-- rejection_reason into the notification, and isolates all notification errors
-- in its own PL/pgSQL subtransaction.
create or replace function public.try_create_payment_rejected_notification(
    p_submission_id uuid
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public, auth, pg_temp
set lock_timeout = '5s'
as $function$
declare
    v_submission_id uuid;
    v_order_id uuid;
    v_user_id uuid;
    v_package_id uuid;
begin
    select ps.id, ps.order_id, o.user_id, o.package_id
    into v_submission_id, v_order_id, v_user_id, v_package_id
    from public.payment_submissions ps
    join public.orders o on o.id = ps.order_id
    where ps.id = p_submission_id
      and ps.status = 'rejected'
      and o.status = 'pending'
      and o.payment_provider = 'promptpay_manual';

    if not found then
        raise exception using
            errcode = '22023',
            message = 'Cannot create notification for an invalid rejected payment submission.';
    end if;

    insert into public.notifications (
        user_id,
        type,
        title,
        body,
        href,
        source_order_id,
        source_payment_submission_id
    ) values (
        v_user_id,
        'PAYMENT_REJECTED',
        'การชำระเงินยังไม่ผ่าน',
        'กรุณาตรวจสอบและส่งหลักฐานการชำระเงินใหม่',
        '/checkout/' || v_package_id::text,
        v_order_id,
        v_submission_id
    )
    on conflict (type, source_payment_submission_id) do nothing;
exception
    when others then
        raise warning 'PAYMENT_REJECTED notification skipped for submission %: %',
            p_submission_id, sqlerrm;
end
$function$;

comment on function public.try_create_payment_rejected_notification(uuid) is
    'Best-effort, idempotent per-submission PAYMENT_REJECTED read-model producer used only by the manual rejection RPC.';

revoke all on function public.try_create_payment_rejected_notification(uuid)
    from public, anon, authenticated, service_role;

-- Preserve the existing rejection authorization, validation, state transition,
-- and pending-order authority. The only new behavior is a best-effort producer
-- call after a valid rejection; an idempotent retry also retries a missing
-- notification without creating duplicates.
create or replace function public.reject_payment_submission(
    p_submission_id uuid,
    p_rejection_reason text
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
    v_reason text;
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

    v_reason := pg_catalog.left(pg_catalog.btrim(coalesce(p_rejection_reason, '')), 1000);

    if length(v_reason) = 0 then
        raise exception using
            errcode = '22023',
            message = 'A rejection reason is required.';
    end if;

    select ps.id, ps.order_id, ps.status, o.status, o.payment_provider
    into v_submission_id, v_order_id, v_submission_status, v_order_status, v_payment_provider
    from public.payment_submissions ps
    join public.orders o on o.id = ps.order_id
    where ps.id = p_submission_id
    for update of ps, o;

    if not found then
        raise exception using
            errcode = '22023',
            message = 'Payment submission not found.';
    end if;

    if v_submission_status = 'rejected' then
        perform public.try_create_payment_rejected_notification(v_submission_id);
        return query select v_submission_id, v_order_id, 'rejected'::text;
        return;
    end if;

    if v_submission_status <> 'submitted'
       or v_order_status <> 'pending'
       or v_payment_provider <> 'promptpay_manual'
    then
        raise exception using
            errcode = '40001',
            message = 'Payment submission is no longer rejectable.';
    end if;

    update public.payment_submissions
    set status = 'rejected',
        reviewed_at = now(),
        reviewed_by = v_actor_id,
        rejection_reason = v_reason
    where id = v_submission_id;

    -- Deliberately leave public.orders.status = pending. A rejected attempt
    -- can be replaced by a new evidence row without granting access.
    perform public.try_create_payment_rejected_notification(v_submission_id);

    return query select v_submission_id, v_order_id, 'rejected'::text;
end
$function$;

comment on function public.reject_payment_submission(uuid, text) is
    'Atomically rejects manual payment evidence while leaving the existing order pending; PAYMENT_REJECTED notification is best-effort and per-submission idempotent.';

revoke all on function public.reject_payment_submission(uuid, text)
    from public, anon, authenticated, service_role;
grant execute on function public.reject_payment_submission(uuid, text)
    to authenticated;

notify pgrst, 'reload schema';
