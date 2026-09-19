-- Sobdai M1.2 compatibility — drain pending manual orders whose evidence was
-- rejected, without weakening the later payment-settings cutover.
--
-- This migration is additive and must run after 098 EXPAND. It only replaces
-- the canonical cancellation boundary installed by M1.1. Migration 100 keeps
-- the existing gated ENFORCE logic and still requires zero pending orders.

set local lock_timeout = '5s';

do $manual_payment_cancel_rejected_preflight$
begin
    if to_regclass('public.orders') is null
       or to_regclass('public.payment_submissions') is null
       or to_regclass('public.manual_payment_order_events') is null
    then
        raise exception using
            errcode = 'check_violation',
            message = '099 requires the M1.1 manual payment order, evidence, and audit tables.';
    end if;

    if not exists (
        select 1
        from information_schema.columns
        where table_schema = 'public'
          and table_name = 'payment_submissions'
          and column_name = 'order_id'
          and udt_name = 'uuid'
    ) or not exists (
        select 1
        from information_schema.columns
        where table_schema = 'public'
          and table_name = 'payment_submissions'
          and column_name = 'status'
          and udt_name = 'text'
    ) then
        raise exception using
            errcode = 'check_violation',
            message = '099 requires payment_submissions.order_id and payment_submissions.status.';
    end if;

    -- Read the live constraint definition instead of assuming an evidence
    -- vocabulary. The installed M1 schema permits exactly submitted,
    -- approved, and rejected evidence states.
    if not exists (
        select 1
        from pg_catalog.pg_constraint c
        where c.conrelid = 'public.payment_submissions'::regclass
          and c.contype = 'c'
          and lower(pg_catalog.pg_get_constraintdef(c.oid, true)) like '%submitted%'
          and lower(pg_catalog.pg_get_constraintdef(c.oid, true)) like '%approved%'
          and lower(pg_catalog.pg_get_constraintdef(c.oid, true)) like '%rejected%'
    ) then
        raise exception using
            errcode = 'check_violation',
            message = '099 requires the established submitted/approved/rejected payment evidence states.';
    end if;

    if to_regprocedure('public.cancel_manual_payment_order(uuid)') is null
       or to_regprocedure('public.guard_manual_payment_cancel_transition()') is null
    then
        raise exception using
            errcode = 'check_violation',
            message = '099 requires the M1.1 canonical cancellation boundary.';
    end if;
end
$manual_payment_cancel_rejected_preflight$;

-- Direct table updates remain forbidden unless they pass through the same
-- canonical RPC marker. The order row is locked by the RPC and by
-- submit_payment_slip, so this predicate observes the serialized state.
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

    -- The live evidence schema makes rejected the only terminal non-payment
    -- state. Any other value is treated as active/unsafe and fails closed.
    if exists (
        select 1
        from public.payment_submissions ps
        where ps.order_id = old.id
          and ps.status is distinct from 'rejected'
    ) then
        raise exception using
            errcode = '40001',
            message = 'A non-rejected payment submission already exists for this order.';
    end if;

    return new;
end
$function$;

comment on function public.guard_manual_payment_cancel_transition() is
    'Blocks direct pending-manual-to-cancelled updates unless the canonical RPC authorizes zero or all-rejected evidence.';

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
    v_non_rejected_submission_count bigint;
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

    -- Fail closed for every evidence state except the known terminal rejected
    -- state from the live payment_submissions contract.
    select count(*)
    into v_non_rejected_submission_count
    from public.payment_submissions ps
    where ps.order_id = p_order_id
      and ps.status is distinct from 'rejected';

    -- A retry after a successful cancellation is a deterministic no-op. This
    -- also works when the cancelled order retains rejected audit evidence.
    if v_order_status = 'cancelled'
       and v_payment_provider = 'promptpay_manual'
       and v_non_rejected_submission_count = 0
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

    if v_non_rejected_submission_count <> 0 then
        raise exception using
            errcode = '40001',
            message = 'A non-rejected payment submission already exists for this order.';
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
    'Atomically cancels only a pending manual PromptPay order with zero or all-rejected evidence; cancelled orders never grant package access.';

revoke all on function public.guard_manual_payment_cancel_transition()
    from public, anon, authenticated, service_role;
revoke all on function public.cancel_manual_payment_order(uuid)
    from public, anon, authenticated, service_role;
grant execute on function public.cancel_manual_payment_order(uuid) to authenticated;

notify pgrst, 'reload schema';
