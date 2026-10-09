-- Sobdai Notification V1.2 — package content update notifications.
--
-- This migration extends the existing notifications read model with one
-- trusted event: PACKAGE_CONTENT_UPDATE, fanned out manually per business
-- event (e.g. a new hard exam set added to an existing package). It remains
-- a UI read model only; public.orders remains the sole package-access
-- authority. This migration inserts no rows.
--
-- Deduplication is per recipient per event: (user_id, type, source_event_key).
-- A platform-global (type, source_event_key) key would let one event produce a
-- single row platform-wide, so the recipient is part of the unique identity.
--
-- The one-time V1.2 fanout (OPSMOAC-PPA-2026-V10 hard exam set) is a separate
-- human-executed, two-gate operation documented in
-- docs/notification-package-content-update-v1.2-production-sql.md.

set local lock_timeout = '5s';

-- Fail closed unless the canonical 092/093 notification objects are present
-- and undrifted, and refuse an already-applied or half-applied V1.2 shape.
do $package_content_update_notification_preflight$
begin
    if to_regclass('public.notifications') is null then
        raise exception using
            errcode = 'check_violation',
            message = 'Notification 104 requires the canonical public.notifications table from migration 092.';
    end if;

    if not exists (
        select 1
        from pg_constraint
        where conrelid = 'public.notifications'::regclass
          and conname = 'notifications_type_check'
          and contype = 'c'
          and pg_get_constraintdef(oid, true) ilike '%PACKAGE_APPROVED%'
          and pg_get_constraintdef(oid, true) ilike '%PAYMENT_REJECTED%'
    ) then
        raise exception using
            errcode = 'check_violation',
            message = 'Notification 104 refuses a drifted notification type constraint.';
    end if;

    if not exists (
        select 1
        from pg_constraint
        where conrelid = 'public.notifications'::regclass
          and conname = 'notifications_type_source_payment_submission_key'
          and contype = 'u'
    ) then
        raise exception using
            errcode = 'check_violation',
            message = 'Notification 104 requires the 093 per-submission dedupe constraint.';
    end if;

    if not exists (
        select 1
        from pg_indexes
        where schemaname = 'public'
          and indexname = 'notifications_type_source_order_key'
          and indexdef ilike '%PACKAGE_APPROVED%'
    ) then
        raise exception using
            errcode = 'check_violation',
            message = 'Notification 104 refuses a drifted PACKAGE_APPROVED dedupe index.';
    end if;

    -- The read model must keep its baseline client boundary: RLS on, and no
    -- client role may insert notification rows. This migration does not
    -- change either; a drifted baseline must be fixed before applying 104.
    if not exists (
        select 1
        from pg_class
        where oid = 'public.notifications'::regclass
          and relrowsecurity is true
    ) then
        raise exception using
            errcode = 'check_violation',
            message = 'Notification 104 expects row level security on public.notifications.';
    end if;

    if has_table_privilege('authenticated', 'public.notifications', 'INSERT')
       or has_table_privilege('anon', 'public.notifications', 'INSERT') then
        raise exception using
            errcode = 'check_violation',
            message = 'Notification 104 refuses a baseline where a client role can insert notifications.';
    end if;

    if exists (
        select 1
        from information_schema.columns
        where table_schema = 'public'
          and table_name = 'notifications'
          and column_name = 'source_event_key'
    ) then
        raise exception using
            errcode = 'duplicate_column',
            message = 'Notification 104 refuses an already-present source_event_key column.';
    end if;

    if to_regclass('public.notifications_user_type_event_key_idx') is not null then
        raise exception using
            errcode = 'duplicate_object',
            message = 'Notification 104 refuses an already-present per-recipient event dedupe index.';
    end if;

    if exists (
        select 1
        from information_schema.columns
        where table_schema = 'public'
          and table_name = 'notifications'
          and column_name = 'source_order_id'
          and is_nullable = 'YES'
    ) then
        raise exception using
            errcode = 'check_violation',
            message = 'Notification 104 expects source_order_id to still be NOT NULL; inspect schema drift before applying.';
    end if;
end
$package_content_update_notification_preflight$;

-- Package-content events are not order-scoped. Relax the order anchor so an
-- event-key row can exist without an order; the order-backed producers keep
-- inserting NOT NULL source_order_id and are unchanged.
alter table public.notifications
    alter column source_order_id drop not null;

-- Durable business-event identity. One event key yields at most one
-- notification per recipient, regardless of how many historical orders exist.
alter table public.notifications
    add column source_event_key text;

comment on column public.notifications.source_event_key is
    'Durable package-content event identity (package_content_update:<package_id>:<exam_set_id>); together with user_id and type it forms the per-recipient fanout dedupe identity for events that are not order-scoped.';

-- Event-key rows must not also anchor to an order or a payment submission,
-- and the key must be a non-trivial stable string.
alter table public.notifications
    add constraint notifications_event_key_scope_check check (
        source_event_key is null
        or (
            source_order_id is null
            and source_payment_submission_id is null
            and length(btrim(source_event_key)) between 8 and 200
        )
    );

-- Type-specific source integrity. Each existing producer already inserts its
-- own source identity; these checks make that a schema guarantee. Existing
-- rows must satisfy them or this migration fails closed.
alter table public.notifications
    add constraint notifications_package_approved_source_check check (
        type <> 'PACKAGE_APPROVED'
        or source_order_id is not null
    );

alter table public.notifications
    add constraint notifications_payment_rejected_source_check check (
        type <> 'PAYMENT_REJECTED'
        or source_payment_submission_id is not null
    );

alter table public.notifications
    add constraint notifications_package_content_update_source_check check (
        type <> 'PACKAGE_CONTENT_UPDATE'
        or source_event_key is not null
    );

alter table public.notifications
    drop constraint notifications_type_check;

alter table public.notifications
    add constraint notifications_type_check check (
        type in ('PACKAGE_APPROVED', 'PAYMENT_REJECTED', 'PACKAGE_CONTENT_UPDATE')
    );

-- The existing content rule (notifications_content_check: non-empty title and
-- body, href like '/%') already constrains the new type's internal CTA and is
-- intentionally unchanged.

-- Per-recipient, per-event fanout dedupe. Recipients must never collide with
-- each other; repeating a send for the same event is a no-op per user.
create unique index notifications_user_type_event_key_idx
    on public.notifications (user_id, type, source_event_key)
    where source_event_key is not null;

comment on index notifications_user_type_event_key_idx is
    'Hard per-recipient dedupe for PACKAGE_CONTENT_UPDATE fanouts: one row per (user, event); reruns and concurrent sends of the same event are no-ops via on conflict do nothing.';

notify pgrst, 'reload schema';

-- ---------------------------------------------------------------------------
-- Operator handoff (not executed by the application):
--
-- 1. Apply this file in the Supabase SQL Editor BEFORE shipping the frontend
--    whitelist for the new type (DB-first, mirroring the 092 release order).
-- 2. Verify the applied shape:
--
--      select column_name, is_nullable
--        from information_schema.columns
--       where table_schema = 'public' and table_name = 'notifications'
--         and column_name in ('source_order_id', 'source_event_key');
--      -- both rows must report is_nullable = 'YES'
--
--      select conname, pg_get_constraintdef(oid, true) as definition
--        from pg_constraint
--       where conrelid = 'public.notifications'::regclass
--         and conname in (
--           'notifications_type_check',
--           'notifications_event_key_scope_check',
--           'notifications_package_approved_source_check',
--           'notifications_payment_rejected_source_check',
--           'notifications_package_content_update_source_check'
--         );
--
--      select indexname, indexdef from pg_indexes
--       where schemaname = 'public' and tablename = 'notifications'
--       order by indexname;
--      -- must include notifications_user_type_event_key_idx on
--      -- (user_id, type, source_event_key) where source_event_key is not null,
--      -- and keep notifications_type_source_order_key untouched
--
-- 3. RLS and grants are intentionally unchanged: no client can insert
--    notification rows, and no fanout INSERT belongs in this migration.
--    The V1.2 fanout is the human-executed two-gate runbook in
--    docs/notification-package-content-update-v1.2-production-sql.md.
-- ---------------------------------------------------------------------------
