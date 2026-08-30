-- Sobdai M1 — Manual PromptPay payment foundation.
--
-- This migration deliberately keeps public.orders as the order and package
-- access authority. payment_submissions stores payment evidence only; it is
-- not a second entitlement, enrollment, or purchase table.
--
-- Release order: DB-FIRST. The application routes and admin UI added for M1
-- depend on this table, bucket, policies, and RPC surface.

set local lock_timeout = '5s';

-- Fail closed if this migration is pointed at a schema that does not contain
-- the production order/access primitives it is intended to extend.
do $manual_payment_foundation_preflight$
declare
    required_relation text;
begin
    foreach required_relation in array ARRAY[
        'public.profiles',
        'public.packages',
        'public.orders',
        'storage.buckets',
        'storage.objects'
    ] loop
        if to_regclass(required_relation) is null then
            raise exception using
                errcode = 'check_violation',
                message = format('M1 manual payment requires %s.', required_relation);
        end if;
    end loop;

    if to_regprocedure('public.handle_updated_at()') is null then
        raise exception using
            errcode = 'check_violation',
            message = 'M1 manual payment requires public.handle_updated_at().';
    end if;

    if not exists (
        select 1
        from information_schema.columns
        where table_schema = 'public'
          and table_name = 'orders'
          and column_name = 'user_id'
          and udt_name = 'uuid'
    ) or not exists (
        select 1
        from information_schema.columns
        where table_schema = 'public'
          and table_name = 'orders'
          and column_name = 'package_id'
          and udt_name = 'uuid'
    ) or not exists (
        select 1
        from information_schema.columns
        where table_schema = 'public'
          and table_name = 'orders'
          and column_name = 'amount'
          and udt_name = 'numeric'
    ) or not exists (
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
            message = 'M1 manual payment requires the established public.orders columns.';
    end if;

    if not exists (
        select 1
        from information_schema.columns
        where table_schema = 'public'
          and table_name = 'packages'
          and column_name = 'current_price'
          and udt_name = 'numeric'
    ) or not exists (
        select 1
        from information_schema.columns
        where table_schema = 'public'
          and table_name = 'packages'
          and column_name = 'is_published'
          and udt_name = 'bool'
    ) then
        raise exception using
            errcode = 'check_violation',
            message = 'M1 manual payment requires packages.current_price and packages.is_published.';
    end if;
end
$manual_payment_foundation_preflight$;

-- ---------------------------------------------------------------------------
-- Payment evidence. This table has no package-access semantics.
-- ---------------------------------------------------------------------------

create table if not exists public.payment_submissions (
    id uuid primary key default uuid_generate_v4(),
    order_id uuid not null references public.orders(id) on delete restrict,
    idempotency_key uuid not null unique,
    storage_object_path text not null unique,
    original_filename text,
    mime_type text not null check (mime_type in (
        'image/jpeg',
        'image/png',
        'image/webp',
        'application/pdf'
    )),
    file_size_bytes bigint not null check (file_size_bytes > 0 and file_size_bytes <= 4194304),
    payment_method text not null default 'promptpay_manual'
        check (payment_method = 'promptpay_manual'),
    status text not null default 'submitted'
        check (status in ('submitted', 'approved', 'rejected')),
    submitted_at timestamptz not null default now(),
    reviewed_at timestamptz,
    reviewed_by uuid references public.profiles(id) on delete restrict,
    rejection_reason text,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    constraint payment_submissions_review_state_check check (
        (status = 'submitted'
            and reviewed_at is null
            and reviewed_by is null
            and rejection_reason is null)
        or
        (status = 'approved'
            and reviewed_at is not null
            and reviewed_by is not null
            and rejection_reason is null)
        or
        (status = 'rejected'
            and reviewed_at is not null
            and reviewed_by is not null
            and rejection_reason is not null
            and length(btrim(rejection_reason)) > 0)
    )
);

comment on table public.payment_submissions is
    'Manual PromptPay payment evidence linked to public.orders; never an access or entitlement authority.';
comment on column public.payment_submissions.order_id is
    'The existing public.orders row whose status remains the package-access authority.';
comment on column public.payment_submissions.idempotency_key is
    'Client retry key for one upload attempt; reusing it returns the original submission.';
comment on column public.payment_submissions.storage_object_path is
    'Private payment-slips object path; never expose as a public URL.';
comment on column public.payment_submissions.reviewed_by is
    'Durable reviewer provenance for the approve/reject decision.';

drop trigger if exists handle_updated_at_payment_submissions on public.payment_submissions;
create trigger handle_updated_at_payment_submissions
    before update on public.payment_submissions
    for each row execute procedure public.handle_updated_at();

create index if not exists payment_submissions_order_id_idx
    on public.payment_submissions (order_id, created_at desc);

create index if not exists payment_submissions_status_created_at_idx
    on public.payment_submissions (status, created_at desc);

-- A rejected attempt may be retried, but only one attempt may be awaiting
-- review and only one may be approved for an order.
create unique index if not exists payment_submissions_one_submitted_per_order_idx
    on public.payment_submissions (order_id)
    where status = 'submitted';

create unique index if not exists payment_submissions_one_approved_per_order_idx
    on public.payment_submissions (order_id)
    where status = 'approved';

-- Preserve historical/retry/Omise orders while preventing duplicate open M1
-- orders for the same user/package pair.
create unique index if not exists orders_one_open_manual_payment_idx
    on public.orders (user_id, package_id)
    where status = 'pending' and payment_provider = 'promptpay_manual';

-- A manual PromptPay order can become paid only after the same transaction has
-- recorded a complete approved evidence decision for this exact order. This
-- database guard remains effective for the broad financial-manager INSERT and
-- UPDATE policies on public.orders and for any future trusted caller.
create or replace function public.guard_manual_payment_paid_transition()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $function$
begin
    if TG_OP = 'INSERT' then
        if new.status is distinct from 'paid'
           or new.payment_provider is distinct from 'promptpay_manual'
        then
            return new;
        end if;
    elsif new.status is distinct from 'paid' then
        return new;
    elsif old.status is not distinct from 'paid'
          and old.payment_provider is not distinct from 'promptpay_manual'
    then
        return new;
    elsif old.payment_provider is distinct from 'promptpay_manual'
          and new.payment_provider is distinct from 'promptpay_manual'
    then
        return new;
    end if;

    if not exists (
        select 1
        from public.payment_submissions ps
        where ps.order_id = new.id
          and ps.payment_method = 'promptpay_manual'
          and ps.status = 'approved'
          and ps.reviewed_at is not null
          and ps.reviewed_by is not null
          and ps.rejection_reason is null
    ) then
        raise exception using
            errcode = '42501',
            message = 'A manual PromptPay order requires approved payment evidence.';
    end if;

    return new;
end
$function$;

comment on function public.guard_manual_payment_paid_transition() is
    'Prevents a promptpay_manual order from becoming paid without complete approved payment evidence for the same order.';

drop trigger if exists guard_manual_payment_paid_transition on public.orders;
create trigger guard_manual_payment_paid_transition
    before insert or update on public.orders
    for each row execute procedure public.guard_manual_payment_paid_transition();

-- ---------------------------------------------------------------------------
-- Private storage. Browser clients do not receive INSERT/UPDATE/DELETE
-- policies; the authenticated server route validates ownership before using
-- the service-role storage client. Active Owner/Admin financial users may read
-- these private objects by policy, while the admin detail page normally uses
-- only short-lived signed URLs for review.
-- ---------------------------------------------------------------------------

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
    'payment-slips',
    'payment-slips',
    false,
    4194304,
    array['image/jpeg', 'image/png', 'image/webp', 'application/pdf']
)
on conflict (id) do update set
    name = excluded.name,
    public = false,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Financial managers can view payment slips." on storage.objects;
create policy "Financial managers can view payment slips."
    on storage.objects for select
    using (
        bucket_id = 'payment-slips'
        and exists (
            select 1
            from public.profiles p
            where p.id = auth.uid()
              and p.role in ('owner', 'admin')
              and p.status = 'active'
              and p.deleted_at is null
        )
    );

-- No public read policy and no authenticated write policies are intentional.
-- Customer and support/read-only roles have no payment-slip object read path.

alter table public.payment_submissions enable row level security;

drop policy if exists "Users can view own payment submissions." on public.payment_submissions;
create policy "Users can view own payment submissions."
    on public.payment_submissions for select
    to authenticated
    using (
        exists (
            select 1
            from public.orders o
            where o.id = payment_submissions.order_id
              and o.user_id = auth.uid()
        )
    );

drop policy if exists "Financial managers can view payment submissions." on public.payment_submissions;
create policy "Financial managers can view payment submissions."
    on public.payment_submissions for select
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

-- Evidence state is writable only by the SECURITY DEFINER review/submission
-- RPCs. Authenticated clients retain the two SELECT policies above but cannot
-- forge approved/rejected state or insert/delete evidence directly.
revoke all on table public.payment_submissions from public, anon, authenticated;
grant select on table public.payment_submissions to authenticated;

-- ---------------------------------------------------------------------------
-- Locked, caller-derived RPC boundary.
-- ---------------------------------------------------------------------------

create or replace function public.create_manual_payment_order(
    p_package_id uuid
)
returns table (
    order_id uuid,
    package_id uuid,
    amount numeric,
    status text
)
language plpgsql
security definer
set search_path = pg_catalog, public, auth, pg_temp
set lock_timeout = '5s'
as $function$
declare
    v_actor_id uuid;
    v_package_id uuid;
    v_amount numeric;
    v_existing_order_id uuid;
    v_existing_amount numeric;
    v_existing_status text;
begin
    v_actor_id := auth.uid();

    if v_actor_id is null then
        raise exception using
            errcode = '42501',
            message = 'Authentication is required.';
    end if;

    if p_package_id is null then
        raise exception using
            errcode = '22023',
            message = 'A package is required.';
    end if;

    -- Lock the package row while taking the price snapshot. The client never
    -- supplies the amount and cannot create an order for an unpublished/free
    -- package through this paid-only RPC.
    select p.id, p.current_price
    into v_package_id, v_amount
    from public.packages p
    where p.id = p_package_id
      and p.is_published = true
      and p.current_price > 0
    for update;

    if not found then
        raise exception using
            errcode = '22023',
            message = 'The package is unavailable for manual payment.';
    end if;

    if exists (
        select 1
        from public.orders o
        where o.user_id = v_actor_id
          and o.package_id = v_package_id
          and o.status in ('paid', 'free')
    ) then
        raise exception using
            errcode = '23505',
            message = 'The user already has package access.';
    end if;

    select o.id, o.amount, o.status
    into v_existing_order_id, v_existing_amount, v_existing_status
    from public.orders o
    where o.user_id = v_actor_id
      and o.package_id = v_package_id
      and o.status = 'pending'
      and o.payment_provider = 'promptpay_manual'
    order by o.created_at desc
    limit 1
    for update;

    if found then
        return query select v_existing_order_id, v_package_id, v_existing_amount, v_existing_status;
        return;
    end if;

    begin
        insert into public.orders (
            user_id,
            package_id,
            amount,
            status,
            payment_provider
        ) values (
            v_actor_id,
            v_package_id,
            v_amount,
            'pending',
            'promptpay_manual'
        )
        returning id into v_existing_order_id;
    exception
        when unique_violation then
            -- Another request won the partial-index race. Return that open
            -- order so the client remains idempotent.
            select o.id, o.amount, o.status
            into v_existing_order_id, v_existing_amount, v_existing_status
            from public.orders o
            where o.user_id = v_actor_id
              and o.package_id = v_package_id
              and o.status = 'pending'
              and o.payment_provider = 'promptpay_manual'
            order by o.created_at desc
            limit 1;

            if not found then
                raise;
            end if;

            return query select v_existing_order_id, v_package_id, v_existing_amount, v_existing_status;
            return;
    end;

    return query select v_existing_order_id, v_package_id, v_amount, 'pending'::text;
end
$function$;

comment on function public.create_manual_payment_order(uuid) is
    'Creates or returns one lifecycle-aware pending PromptPay order using auth.uid() and a DB price snapshot.';

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

    -- Lock the existing order before checking status or inserting evidence.
    -- The order remains the sole access authority.
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
    'Records one privately uploaded PromptPay evidence object for the caller-owned pending manual order.';

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

    return query select v_submission_id, v_order_id, 'approved'::text;
end
$function$;

comment on function public.approve_payment_submission(uuid) is
    'Atomically approves manual payment evidence and changes its existing order to paid; idempotent after completion.';

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
    return query select v_submission_id, v_order_id, 'rejected'::text;
end
$function$;

comment on function public.reject_payment_submission(uuid, text) is
    'Atomically rejects manual payment evidence while deliberately leaving the existing order pending.';

revoke all on function public.create_manual_payment_order(uuid) from public, anon, authenticated, service_role;
revoke all on function public.submit_payment_slip(uuid, uuid, text, text, text, bigint) from public, anon, authenticated, service_role;
revoke all on function public.approve_payment_submission(uuid) from public, anon, authenticated, service_role;
revoke all on function public.reject_payment_submission(uuid, text) from public, anon, authenticated, service_role;
revoke all on function public.guard_manual_payment_paid_transition() from public, anon, authenticated, service_role;

grant execute on function public.create_manual_payment_order(uuid) to authenticated;
grant execute on function public.submit_payment_slip(uuid, uuid, text, text, text, bigint) to authenticated;
grant execute on function public.approve_payment_submission(uuid) to authenticated;
grant execute on function public.reject_payment_submission(uuid, text) to authenticated;

notify pgrst, 'reload schema';

-- ---------------------------------------------------------------------------
-- Operator handoff (not executed by the application):
--
-- 1. Apply this file to the intended Supabase database as migration 088 only
--    after confirming the current migration baseline is 087 on this branch.
-- 2. Verify:
--      select to_regclass('public.payment_submissions');
--      select id, public, file_size_limit, allowed_mime_types
--        from storage.buckets where id = 'payment-slips';
--      select indexname from pg_indexes
--        where indexname in (
--          'orders_one_open_manual_payment_idx',
--          'payment_submissions_one_submitted_per_order_idx',
--          'payment_submissions_one_approved_per_order_idx'
--        );
--      select routine_name from information_schema.routines
--        where routine_schema = 'public'
--          and routine_name in (
--            'create_manual_payment_order', 'submit_payment_slip',
--            'approve_payment_submission', 'reject_payment_submission'
--          );
-- 3. Release the application after the DB objects are present (DB-FIRST).
--
-- Recovery: if application rollout is blocked, roll the application back to
-- the prior release while retaining this additive schema. Do not drop the
-- bucket/table/functions while payment rows or private objects exist. Any
-- removal requires an operator-led export of payment_submissions, a private
-- object inventory, and a separately approved destructive rollback.
