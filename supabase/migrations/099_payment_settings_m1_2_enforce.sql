-- Sobdai M1.2 ENFORCE — database boundary and race-safe lifecycle fencing.
--
-- Apply only after 098 EXPAND has been applied, a real E-Wallet recipient has
-- been configured, and the private ฿1.00 QR has been scanned and verified.
-- The shared advisory lock serializes order creation with enabled/recipient
-- changes until the winning transaction commits.

set local lock_timeout = '5s';

do $payment_settings_m1_2_enforce_preflight$
begin
    if to_regclass('public.payment_settings') is null then
        raise exception using
            errcode = 'check_violation',
            message = 'M1.2 ENFORCE requires 098_payment_settings_m1_2_expand.sql.';
    end if;

    if to_regprocedure('public.update_payment_settings(boolean,text,text,text)') is null then
        raise exception using
            errcode = 'check_violation',
            message = 'M1.2 ENFORCE requires the EXPAND settings RPC.';
    end if;

    if not exists (
        select 1
        from public.payment_settings ps
        where ps.id = 1
          and ps.enabled = true
          and ps.recipient_type = 'ewallet'
          and ps.recipient_identifier ~ '^[0-9]{15}$'
    ) then
        raise exception using
            errcode = 'check_violation',
            message = 'Configure and verify a valid enabled PromptPay recipient before applying M1.2 ENFORCE.';
    end if;
end
$payment_settings_m1_2_enforce_preflight$;

-- ---------------------------------------------------------------------------
-- Settings-side fence. Availability changes (enabled) and routing changes
-- (recipient_type/recipient_identifier) take the same lock as order creation.
-- Disabling is allowed with pending orders; recipient changes are not.
-- Display-only edits do not need the lifecycle lock.
-- ---------------------------------------------------------------------------

create or replace function public.guard_payment_settings_lifecycle()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, auth, pg_temp
set lock_timeout = '5s'
as $function$
begin
    if old.enabled is not distinct from new.enabled
       and old.recipient_type is not distinct from new.recipient_type
       and old.recipient_identifier is not distinct from new.recipient_identifier
    then
        return new;
    end if;

    perform pg_catalog.pg_advisory_xact_lock(7281, 1201);

    if new.enabled
       and (
           new.recipient_type is distinct from 'ewallet'
           or new.recipient_identifier !~ '^[0-9]{15}$'
       )
    then
        raise exception using
            errcode = '22023',
            message = 'An enabled payment setting requires a valid 15-digit E-Wallet ID.';
    end if;

    if old.recipient_type is distinct from new.recipient_type
       or old.recipient_identifier is distinct from new.recipient_identifier
    then
        if exists (
            select 1
            from public.orders o
            where o.status = 'pending'
              and o.payment_provider = 'promptpay_manual'
        ) then
            raise exception using
                errcode = '55006',
                message = 'ยังมีคำสั่งซื้อ PromptPay ที่รอชำระอยู่ กรุณาจัดการคำสั่งซื้อเหล่านั้นก่อนเปลี่ยนผู้รับเงิน';
        end if;
    end if;

    return new;
end
$function$;

comment on function public.guard_payment_settings_lifecycle() is
    'Serializes availability/routing changes with manual order creation and blocks recipient changes with pending orders.';

drop trigger if exists guard_payment_settings_lifecycle on public.payment_settings;
create trigger guard_payment_settings_lifecycle
    before update on public.payment_settings
    for each row execute function public.guard_payment_settings_lifecycle();

revoke all on function public.guard_payment_settings_lifecycle() from public, anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Order-side fence. The trigger locks before checking settings, so a create
-- and a disable cannot both commit from stale observations. Existing pending
-- orders are not changed or cancelled by a disable.
-- ---------------------------------------------------------------------------

create or replace function public.guard_payment_settings_for_manual_order()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, auth, pg_temp
set lock_timeout = '5s'
as $function$
begin
    if new.status is distinct from 'pending'
       or new.payment_provider is distinct from 'promptpay_manual'
    then
        return new;
    end if;

    if TG_OP = 'UPDATE'
       and old.status is not distinct from 'pending'
       and old.payment_provider is not distinct from 'promptpay_manual'
    then
        return new;
    end if;

    perform pg_catalog.pg_advisory_xact_lock(7281, 1201);

    if not exists (
        select 1
        from public.payment_settings ps
        where ps.id = 1
          and ps.enabled = true
          and ps.recipient_type = 'ewallet'
          and ps.recipient_identifier ~ '^[0-9]{15}$'
    ) then
        raise exception using
            errcode = '55000',
            message = 'PromptPay payment settings are unavailable.';
    end if;

    return new;
end
$function$;

comment on function public.guard_payment_settings_for_manual_order() is
    'Blocks new pending manual PromptPay orders unless private settings are enabled and valid.';

drop trigger if exists guard_payment_settings_for_manual_order on public.orders;
create trigger guard_payment_settings_for_manual_order
    before insert or update on public.orders
    for each row execute function public.guard_payment_settings_for_manual_order();

revoke all on function public.guard_payment_settings_for_manual_order() from public, anon, authenticated, service_role;

notify pgrst, 'reload schema';

-- Operator handoff:
-- Existing pending orders remain pending when enabled is set false. New paid
-- manual orders and their QR route fail closed until settings are re-enabled.
