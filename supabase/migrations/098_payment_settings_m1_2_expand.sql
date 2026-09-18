-- Sobdai M1.2 EXPAND — private PromptPay settings and configuration RPC.
--
-- This migration is intentionally safe to apply while the released M1.1
-- application is still serving traffic. It creates and protects the settings
-- surface, but does not install the final order-enforcement trigger. Operators
-- configure and verify a real recipient before applying 099_enforce.sql.

set local lock_timeout = '5s';

do $payment_settings_m1_2_expand_preflight$
begin
    if to_regclass('public.orders') is null
       or to_regclass('public.profiles') is null
    then
        raise exception using
            errcode = 'check_violation',
            message = 'M1.2 EXPAND requires public.orders and public.profiles.';
    end if;

    if to_regprocedure('public.handle_updated_at()') is null then
        raise exception using
            errcode = 'check_violation',
            message = 'M1.2 EXPAND requires public.handle_updated_at().';
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
            message = 'M1.2 EXPAND requires the established order status and payment provider columns.';
    end if;
end
$payment_settings_m1_2_expand_preflight$;

-- ---------------------------------------------------------------------------
-- Private singleton settings. These values are not homepage/Donate config.
-- ---------------------------------------------------------------------------

create table if not exists public.payment_settings (
    id smallint primary key default 1,
    enabled boolean not null default false,
    recipient_type text not null default 'ewallet',
    recipient_identifier text not null default '',
    display_name text not null default '',
    instruction_text text not null default '',
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    updated_by uuid references public.profiles(id) on delete set null,
    constraint payment_settings_singleton_id check (id = 1),
    constraint payment_settings_recipient_type_check check (recipient_type = 'ewallet'),
    constraint payment_settings_recipient_identifier_check check (
        recipient_identifier = ''
        or recipient_identifier ~ '^[0-9]{15}$'
    ),
    constraint payment_settings_enabled_config_check check (
        not enabled
        or recipient_identifier ~ '^[0-9]{15}$'
    ),
    constraint payment_settings_display_name_length_check check (length(display_name) <= 120),
    constraint payment_settings_instruction_length_check check (length(instruction_text) <= 1000)
);

comment on table public.payment_settings is
    'Private singleton settings for manually generated PromptPay payment QR codes; separate from homepage Donate/Support configuration.';
comment on column public.payment_settings.recipient_identifier is
    'PromptPay E-Wallet identifier. It is QR-encoded at payment time and must not be sent to ordinary clients.';

insert into public.payment_settings (
    id,
    enabled,
    recipient_type,
    recipient_identifier,
    display_name,
    instruction_text
) values (
    1,
    false,
    'ewallet',
    '',
    '',
    ''
)
on conflict (id) do nothing;

drop trigger if exists handle_updated_at_payment_settings on public.payment_settings;
create trigger handle_updated_at_payment_settings
    before update on public.payment_settings
    for each row execute procedure public.handle_updated_at();

-- Only active owner/admin accounts hold financial.manage. The helper is kept
-- narrow so support/editor accounts cannot read or mutate this table.
create or replace function public.payment_settings_actor_is_manager()
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
          and p.role in ('owner', 'admin')
          and p.status = 'active'
          and p.deleted_at is null
    )
$function$;

comment on function public.payment_settings_actor_is_manager() is
    'RLS predicate for active owner/admin financial.manage access to private PromptPay settings.';

-- ---------------------------------------------------------------------------
-- RLS and grants. The browser can read only the masked admin projection via
-- the authenticated manager path; the raw recipient is never publicly read.
-- The service role is granted read access for server-side QR generation.
-- Writes are RPC-only so every availability/routing update has one database
-- mutation primitive before the enforcement migration is installed.
-- ---------------------------------------------------------------------------

alter table public.payment_settings enable row level security;
revoke all on table public.payment_settings from public, anon, authenticated, service_role;
grant select on table public.payment_settings to authenticated, service_role;

drop policy if exists payment_settings_financial_select on public.payment_settings;
create policy payment_settings_financial_select
on public.payment_settings
for select
to authenticated
using (public.payment_settings_actor_is_manager());

drop policy if exists payment_settings_financial_update on public.payment_settings;

-- ---------------------------------------------------------------------------
-- Admin-safe configuration primitive. It is available during EXPAND so the
-- owner can save a real recipient and generate the fixed ฿1 preview before
-- 099 enforcement is applied. The RPC derives the actor from auth.uid(),
-- validates the complete final configuration, and serializes the update on
-- the same advisory lock used later by the enforcement triggers.
-- ---------------------------------------------------------------------------

create or replace function public.update_payment_settings(
    p_enabled boolean,
    p_recipient_identifier text,
    p_display_name text,
    p_instruction_text text
)
returns table (
    id smallint,
    enabled boolean,
    recipient_type text,
    recipient_identifier text,
    display_name text,
    instruction_text text,
    updated_by uuid
)
language plpgsql
security definer
set search_path = pg_catalog, public, auth, pg_temp
set lock_timeout = '5s'
as $function$
declare
    v_actor_id uuid;
    v_recipient_identifier text := coalesce(p_recipient_identifier, '');
begin
    v_actor_id := auth.uid();

    if v_actor_id is null then
        raise exception using
            errcode = '42501',
            message = 'Authentication is required.';
    end if;

    if not public.payment_settings_actor_is_manager() then
        raise exception using
            errcode = '42501',
            message = 'Financial manager permission is required.';
    end if;

    if p_enabled is null then
        raise exception using
            errcode = '22023',
            message = 'The enabled setting is required.';
    end if;

    if v_recipient_identifier <> ''
       and v_recipient_identifier !~ '^[0-9]{15}$'
    then
        raise exception using
            errcode = '22023',
            message = 'PromptPay E-Wallet ID must be exactly 15 digits.';
    end if;

    if p_enabled and v_recipient_identifier !~ '^[0-9]{15}$' then
        raise exception using
            errcode = '22023',
            message = 'An enabled payment setting requires a valid 15-digit E-Wallet ID.';
    end if;

    if p_display_name is null
       or length(p_display_name) > 120
       or p_display_name ~ '[[:cntrl:]]'
    then
        raise exception using
            errcode = '22023',
            message = 'The payment display name is invalid.';
    end if;

    if p_instruction_text is null
       or length(p_instruction_text) > 1000
       or p_instruction_text ~ '[[:cntrl:]]'
    then
        raise exception using
            errcode = '22023',
            message = 'The payment instruction text is invalid.';
    end if;

    perform pg_catalog.pg_advisory_xact_lock(7281, 1201);

    return query
    update public.payment_settings
    set enabled = p_enabled,
        recipient_type = 'ewallet',
        recipient_identifier = v_recipient_identifier,
        display_name = p_display_name,
        instruction_text = p_instruction_text,
        updated_by = v_actor_id
    where public.payment_settings.id = 1
    returning
        public.payment_settings.id,
        public.payment_settings.enabled,
        public.payment_settings.recipient_type,
        public.payment_settings.recipient_identifier,
        public.payment_settings.display_name,
        public.payment_settings.instruction_text,
        public.payment_settings.updated_by;

    if not found then
        raise exception using
            errcode = 'P0002',
            message = 'Payment settings are not initialized.';
    end if;
end
$function$;

comment on function public.update_payment_settings(boolean, text, text, text) is
    'Financial-manager-only PromptPay settings update; serialized on the M1.2 lifecycle lock.';

revoke all on function public.payment_settings_actor_is_manager() from public, anon, authenticated, service_role;
grant execute on function public.payment_settings_actor_is_manager() to authenticated;
revoke all on function public.update_payment_settings(boolean, text, text, text) from public, anon, authenticated, service_role;
grant execute on function public.update_payment_settings(boolean, text, text, text) to authenticated;

notify pgrst, 'reload schema';

-- Operator handoff:
-- 1. Apply this EXPAND migration while M1.1 is live.
-- 2. Configure and verify the real recipient using /admin/payment and the
--    private ฿1.00 preview.
-- 3. Apply 099_payment_settings_m1_2_enforce.sql only after verification.
