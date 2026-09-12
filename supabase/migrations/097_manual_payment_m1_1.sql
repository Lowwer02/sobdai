-- Sobdai M1.1 — close abandoned manual orders and cap payment evidence.
--
-- This is a DB-first, expand-compatible migration. It leaves the released M1
-- schema and function signatures intact for older application versions:
-- submit_payment_slip keeps the same arguments and return shape, while adding
-- a serialized five-submission guard. The new cancellation RPC is additive.

set local lock_timeout = '5s';

do $manual_payment_m1_1_preflight$
begin
    if to_regclass('public.orders') is null then
        raise exception using
            errcode = 'check_violation',
            message = 'M1.1 requires public.orders.';
    end if;

    if to_regclass('public.payment_submissions') is null then
        raise exception using
            errcode = 'check_violation',
            message = 'M1.1 requires public.payment_submissions from M1.';
    end if;

    if to_regprocedure('public.submit_payment_slip(uuid,uuid,text,text,text,bigint)') is null then
        raise exception using
            errcode = 'check_violation',
            message = 'M1.1 requires the released submit_payment_slip RPC.';
    end if;

    if not exists (
        select 1
        from information_schema.columns
        where table_schema = 'public'
          and table_name = 'orders'
          and column_name = 'status'
          and udt_name = 'text'
    ) or not exists (
        select 1
        from information_schema.columns
        where table_schema = 'public'
          and table_name = 'orders'
          and column_name = 'payment_provider'
          and udt_name = 'text'
    ) then
        raise exception using
            errcode = 'check_violation',
            message = 'M1.1 requires the established order status and payment provider columns.';
    end if;
end
$manual_payment_m1_1_preflight$;

-- ---------------------------------------------------------------------------
-- Canonical cancellation boundary.
-- ---------------------------------------------------------------------------

-- Cancellation is the only M1.1 transition that needs a new durable event
-- primitive. The table is intentionally narrow and append-only: normal API
-- roles receive no table privileges, while the SECURITY DEFINER cancellation
-- RPC writes the row in the same transaction as the order update.
create table if not exists public.manual_payment_order_events (
    id uuid primary key default uuid_generate_v4(),
    order_id uuid not null references public.orders(id) on delete restrict,
    actor_id uuid not null references public.profiles(id) on delete restrict,
    event_type text not null check (event_type = 'cancelled'),
    from_status text not null check (from_status = 'pending'),
    to_status text not null check (to_status = 'cancelled'),
    payment_provider text not null check (payment_provider = 'promptpay_manual'),
    created_at timestamptz not null default now()
);

comment on table public.manual_payment_order_events is
    'Append-only durable audit events for canonical manual-payment order cancellation.';

alter table public.manual_payment_order_events enable row level security;
revoke all on table public.manual_payment_order_events from public, anon, authenticated, service_role;

create or replace function public.prevent_manual_payment_order_event_mutation()
returns trigger
language plpgsql
security invoker
set search_path = pg_catalog, public, pg_temp
set lock_timeout = '5s'
as $function$
begin
    raise exception using
        errcode = '42501',
        message = 'Manual payment order events are append-only.';
end
$function$;

drop trigger if exists manual_payment_order_events_append_only on public.manual_payment_order_events;
create trigger manual_payment_order_events_append_only
    before update or delete on public.manual_payment_order_events
    for each row execute function public.prevent_manual_payment_order_event_mutation();

revoke all on function public.prevent_manual_payment_order_event_mutation() from public, anon, authenticated, service_role;

-- The broad financial-manager UPDATE policy remains available for unrelated
-- legacy/Omise order administration. This BEFORE trigger fences the one
-- sensitive transition that must use the canonical RPC. The marker is
-- transaction-local, is bound to the order and auth.uid(), is set only after
-- the RPC's authorization/lock/submission checks, and is consumed immediately
-- after the guarded UPDATE. The trigger is SECURITY INVOKER, so an ordinary
-- authenticated/session role remains visible to it even if that role can call
-- pg_catalog.set_config through a raw SQL connection; only the SECURITY
-- DEFINER RPC executes the guarded UPDATE as the trusted function owner.
-- PostgREST exposes RPCs in public, not arbitrary pg_catalog.set_config calls,
-- and no public function accepts this marker.
create or replace function public.guard_manual_payment_cancel_transition()
returns trigger
language plpgsql
security invoker
set search_path = pg_catalog, public, auth, pg_temp
set lock_timeout = '5s'
as $function$
declare
    v_marker text;
begin
    if old.status is distinct from 'pending'
       or old.payment_provider is distinct from 'promptpay_manual'
       or new.status is distinct from 'cancelled'
    then
        return new;
    end if;

    v_marker := pg_catalog.current_setting(
        'sobdai.manual_payment_cancel_authorization',
        true
    );

    if v_marker is distinct from pg_catalog.format(
        'cancel:%s:%s',
        old.id::text,
        coalesce(auth.uid()::text, '')
    ) then
        raise exception using
            errcode = '42501',
            message = 'Manual payment cancellation must use the canonical RPC.';
    end if;

    if current_user in ('anon', 'authenticated', 'service_role', 'authenticator') then
        raise exception using
            errcode = '42501',
            message = 'Manual payment cancellation must use the canonical RPC.';
    end if;

    -- submit_payment_slip locks the same order before inserting evidence, so
    -- this check observes the serialized state of the cancellation decision.
    if exists (
        select 1
        from public.payment_submissions ps
        where ps.order_id = old.id
    ) then
        raise exception using
            errcode = '40001',
            message = 'A payment submission already exists for this order.';
    end if;

    return new;
end
$function$;

comment on function public.guard_manual_payment_cancel_transition() is
    'Blocks direct pending-manual-to-cancelled updates unless the canonical cancellation RPC authorizes the transaction.';

drop trigger if exists guard_manual_payment_cancel_transition on public.orders;
create trigger guard_manual_payment_cancel_transition
    before update on public.orders
    for each row execute function public.guard_manual_payment_cancel_transition();

revoke all on function public.guard_manual_payment_cancel_transition() from public, anon, authenticated, service_role;

create or replace function public.cancel_manual_payment_order(
    p_order_id uuid
)
returns table (
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
    v_order_id uuid;
    v_order_status text;
    v_payment_provider text;
    v_submission_count bigint;
begin
    v_actor_id := auth.uid();

    if v_actor_id is null then
        raise exception using
            errcode = '42501',
            message = 'Authentication is required.';
    end if;

    if p_order_id is null then
        raise exception using
            errcode = '22023',
            message = 'An order is required.';
    end if;

    -- financial.manage follows the existing canonical role convention:
    -- active owner/admin profiles only. The server action also checks the
    -- permission, but the mutation remains safe when called directly.
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

    -- submit_payment_slip locks this same order before inserting evidence.
    -- Whichever transaction acquires the row lock first wins safely.
    select o.id, o.status, o.payment_provider
    into v_order_id, v_order_status, v_payment_provider
    from public.orders o
    where o.id = p_order_id
    for update;

    if not found then
        raise exception using
            errcode = '22023',
            message = 'Order not found.';
    end if;

    select count(*)
    into v_submission_count
    from public.payment_submissions ps
    where ps.order_id = p_order_id;

    -- A retry after a successful cancellation is a deterministic no-op.
    if v_order_status = 'cancelled'
       and v_payment_provider = 'promptpay_manual'
       and v_submission_count = 0
    then
        return query select v_order_id, 'cancelled'::text;
        return;
    end if;

    if v_order_status <> 'pending'
       or v_payment_provider <> 'promptpay_manual'
    then
        raise exception using
            errcode = '40001',
            message = 'The order is not an unpaid manual PromptPay order.';
    end if;

    if v_submission_count <> 0 then
        raise exception using
            errcode = '40001',
            message = 'A payment submission already exists for this order.';
    end if;

    perform pg_catalog.set_config(
        'sobdai.manual_payment_cancel_authorization',
        pg_catalog.format('cancel:%s:%s', p_order_id::text, v_actor_id::text),
        true
    );

    update public.orders as o
    set status = 'cancelled'
    where o.id = p_order_id
      and o.status = 'pending'
      and o.payment_provider = 'promptpay_manual';

    if not found then
        raise exception using
            errcode = '40001',
            message = 'The order changed before cancellation could be completed.';
    end if;

    -- The marker is transaction-local and is no longer needed after the one
    -- guarded transition. The audit insert below is part of this same DB
    -- transaction; if it fails, the order update rolls back with it.
    perform pg_catalog.set_config(
        'sobdai.manual_payment_cancel_authorization',
        '',
        true
    );

    insert into public.manual_payment_order_events (
        order_id,
        actor_id,
        event_type,
        from_status,
        to_status,
        payment_provider
    ) values (
        v_order_id,
        v_actor_id,
        'cancelled',
        v_order_status,
        'cancelled',
        v_payment_provider
    );

    return query select p_order_id, 'cancelled'::text;
end
$function$;

comment on function public.cancel_manual_payment_order(uuid) is
    'Atomically cancels only a pending, submission-free manual PromptPay order; cancelled orders never grant package access.';

-- ---------------------------------------------------------------------------
-- Strengthened canonical submission boundary.
-- ---------------------------------------------------------------------------

create or replace function public.submit_payment_slip(
    p_order_id uuid,
    p_idempotency_key uuid,
    p_storage_object_path text,
    p_original_filename text,
    p_mime_type text,
    p_file_size_bytes bigint
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
    v_order_user_id uuid;
    v_order_package_id uuid;
    v_order_status text;
    v_payment_provider text;
    v_amount numeric;
    v_existing_submission_id uuid;
    v_existing_order_id uuid;
    v_existing_status text;
    v_submission_id uuid;
    v_submission_count bigint;
    v_mime_type text;
begin
    v_actor_id := auth.uid();

    if v_actor_id is null then
        raise exception using
            errcode = '42501',
            message = 'Authentication is required.';
    end if;

    if p_order_id is null or p_idempotency_key is null then
        raise exception using
            errcode = '22023',
            message = 'Order and idempotency key are required.';
    end if;

    -- A retry with the same key returns the durable result and does not create
    -- a second evidence row. Ownership is checked before returning it.
    select ps.id, ps.order_id, ps.status, o.user_id
    into v_existing_submission_id, v_existing_order_id, v_existing_status, v_order_user_id
    from public.payment_submissions ps
    join public.orders o on o.id = ps.order_id
    where ps.idempotency_key = p_idempotency_key;

    if found then
        if v_order_user_id <> v_actor_id or v_existing_order_id <> p_order_id then
            raise exception using
                errcode = '42501',
                message = 'The idempotency key is not valid for this order.';
        end if;

        return query select v_existing_submission_id, v_existing_order_id, v_existing_status;
        return;
    end if;

    v_mime_type := lower(coalesce(p_mime_type, ''));

    if v_mime_type not in ('image/jpeg', 'image/png', 'image/webp', 'application/pdf') then
        raise exception using
            errcode = '22023',
            message = 'Unsupported payment slip type.';
    end if;

    if p_file_size_bytes is null
       or p_file_size_bytes <= 0
       or p_file_size_bytes > 4194304
    then
        raise exception using
            errcode = '22023',
            message = 'Payment slip size is invalid.';
    end if;

    if p_storage_object_path is null
       or p_storage_object_path !~ E'^[0-9a-f-]{36}/[0-9a-f-]{36}/[0-9a-f-]{36}\\.(jpg|jpeg|png|webp|pdf)$'
       or pg_catalog.split_part(p_storage_object_path, '/', 1) <> v_actor_id::text
       or pg_catalog.split_part(p_storage_object_path, '/', 2) <> p_order_id::text
    then
        raise exception using
            errcode = '22023',
            message = 'Payment slip path is invalid.';
    end if;

    if not exists (
        select 1
        from storage.objects so
        where so.bucket_id = 'payment-slips'
          and so.name = p_storage_object_path
    ) then
        raise exception using
            errcode = '22023',
            message = 'Payment slip object was not uploaded.';
    end if;

    -- The order lock serializes cancellation, submission, and the count check.
    select o.user_id, o.package_id, o.status, o.payment_provider, o.amount
    into v_order_user_id, v_order_package_id, v_order_status, v_payment_provider, v_amount
    from public.orders o
    where o.id = p_order_id
    for update;

    if not found or v_order_user_id <> v_actor_id then
        raise exception using
            errcode = '42501',
            message = 'The order is not available to this user.';
    end if;

    if v_order_status <> 'pending'
       or v_payment_provider <> 'promptpay_manual'
       or v_amount <= 0
    then
        raise exception using
            errcode = '22023',
            message = 'The order is not awaiting a manual payment.';
    end if;

    -- Every committed evidence row counts, including rejected attempts.
    select count(*)
    into v_submission_count
    from public.payment_submissions ps
    where ps.order_id = p_order_id;

    if v_submission_count >= 5 then
        raise exception using
            errcode = 'P0001',
            message = 'Payment submission limit reached.';
    end if;

    if exists (
        select 1
        from public.payment_submissions ps
        where ps.order_id = p_order_id
          and ps.status = 'submitted'
    ) then
        raise exception using
            errcode = '23505',
            message = 'A payment slip is already awaiting review for this order.';
    end if;

    insert into public.payment_submissions (
        order_id,
        idempotency_key,
        storage_object_path,
        original_filename,
        mime_type,
        file_size_bytes,
        payment_method,
        status
    ) values (
        p_order_id,
        p_idempotency_key,
        p_storage_object_path,
        nullif(pg_catalog.left(coalesce(p_original_filename, ''), 255), ''),
        v_mime_type,
        p_file_size_bytes,
        'promptpay_manual',
        'submitted'
    )
    returning id into v_submission_id;

    return query select v_submission_id, p_order_id, 'submitted'::text;
end
$function$;

comment on function public.submit_payment_slip(uuid, uuid, text, text, text, bigint) is
    'Records one privately uploaded PromptPay evidence object for the caller-owned pending manual order, with a serialized five-attempt limit.';

revoke all on function public.cancel_manual_payment_order(uuid)
    from public, anon, authenticated, service_role;
revoke all on function public.submit_payment_slip(uuid, uuid, text, text, text, bigint)
    from public, anon, authenticated, service_role;

grant execute on function public.cancel_manual_payment_order(uuid) to authenticated;
grant execute on function public.submit_payment_slip(uuid, uuid, text, text, text, bigint)
    to authenticated;

notify pgrst, 'reload schema';

-- Operator handoff:
-- Apply this file manually after confirming the production migration head is
-- 096. Do not run production SQL from the application or release tooling.
