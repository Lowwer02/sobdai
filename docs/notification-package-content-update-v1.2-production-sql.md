# Package Content Update Notification V1.2 — Production SQL Runbook

Status: Human-executed operations only. No application code, migration, or CI
process may run the fanout in this document. The agent must never execute the
Gate B insert.

Scope: one-time in-app notification to every current user entitled to package
`OPSMOAC-PPA-2026-V10` (นักวิเคราะห์นโยบายและแผน — สำนักงานปลัดกระทรวงเกษตรและสหกรณ์ / สป.กษ.)
after the new hard-difficulty exam set was added to that package.

Schema prerequisite: migration `104_package_content_update_notification.sql`
must already be applied. It adds the `PACKAGE_CONTENT_UPDATE` type, the
nullable `source_event_key` column, per-type source-integrity checks, and the
per-recipient unique index
`notifications_user_type_event_key_idx (user_id, type, source_event_key)
WHERE source_event_key IS NOT NULL`. RLS and grants are unchanged by 104: no
client role can insert notification rows; the SQL Editor session (table owner)
can.

Entitlement authority: `public.orders` only —
`orders.package_id = <target> and orders.status in ('paid','free')`, restricted
to active, non-deleted profiles. This mirrors `ORDER_COMPLETED_STATUSES` in
`lib/orderUtils.ts` and migration 076's aligned SQL predicate. Internal
owner/admin staff access (`lib/auth/rbac.ts`) is NOT an entitlement and does
not select recipients. Notifications stay a read model: nothing in this
runbook writes to orders, payments, or any access authority.

Vocabulary used by both gates (means exactly one thing each):

- `eligible_recipients` — distinct entitled, active users for the target package.
- `already_notified` — eligible users that already have this event's row.
- `pending_recipients` — `eligible_recipients - already_notified`; what Gate B inserts.
- `inserted_count` — rows Gate B actually inserted.

Release order (strict):

1. Apply migration 104 (Supabase SQL Editor, DB-first).
2. Deploy the frontend whitelist + CTA (`lib/notifications.ts`,
   `app/api/notifications/route.ts`, `components/NotificationBell.tsx`).
   Deploying after step 3/4 would show a badge increment without a visible
   list item.
3. Gate A — read-only preview; record `eligible_recipients`.
4. Gate B — guarded insert, only after human confirmation of Gate A.

Time-sensitive copy guard: the approved body says "ก่อนสอบพรุ่งนี้" (exam:
2026-10-10). Gate B therefore refuses to run unless "today" in Asia/Bangkok is
`2026-10-09`. If delivery slips, a human must consciously update BOTH the body
copy and the guard date constant together (the guard reads the
`app.notification_v1_2_send_date` session setting and defaults to
`2026-10-09`; never widen the window without new approved copy).

------------------------------------------------------------------------

## Gate A — read-only preview

### A0: resolve the target package (must return exactly 1 row)

```sql
select p.id, p.slug, p.name, p.org_name, p.package_code, p.is_published
from public.packages p
where p.package_code = 'OPSMOAC-PPA-2026-V10';
```

Record `id` (→ `:package_id`) and `slug`. Fail the gate if zero or multiple
rows return, or if `is_published = false`.

### A1: resolve the new hard exam set (human confirms exactly one)

```sql
select es.id, es.name, es.is_sample, es.status, es.created_at
from public.exam_sets es
join public.packages p on p.id = es.package_id
where p.package_code = 'OPSMOAC-PPA-2026-V10'
  and es.status = 'published'
order by es.created_at desc;
```

Record the new hard set's `id` (→ `:exam_set_id`). It should be the newest
row; confirm by name before proceeding.

### A2: recipient preview (aggregates only — no PII in output)

```sql
with target as (
  select id, slug from public.packages
  where package_code = 'OPSMOAC-PPA-2026-V10' and is_published = true
),
event as (
  select 'package_content_update:' || id::text || ':<exam_set_id from A1>' as k
  from target
),
entitled as (
  select distinct o.user_id
  from public.orders o cross join target t
  where o.package_id = t.id
    and o.status in ('paid','free')
),
recipients as (
  select e.user_id
  from entitled e
  join public.profiles pr on pr.id = e.user_id
  where pr.deleted_at is null
    and pr.status = 'active'
),
have as (
  select count(*)::int as n
  from recipients r
  join public.notifications n on n.user_id = r.user_id
  where n.type = 'PACKAGE_CONTENT_UPDATE'
    and n.source_event_key = (select k from event)
)
select (select count(*) from recipients)                        as eligible_recipients,
       (select n from have)                                     as already_notified,
       (select count(*) from recipients) - (select n from have) as pending_recipients;
```

Every recipient is entitled by construction: the set is derived from that
package's completed orders only. Record `eligible_recipients` (→
`:confirmed_eligible`) for Gate B's drift guard.

------------------------------------------------------------------------

## Gate B — guarded, idempotent, per-recipient insert

Fill in the two human-confirmed values from Gate A. Behavior:

- Fails closed if the target package, the published exam set, or the eligible
  audience size differs from what Gate A confirmed.
- Fails closed unless Bangkok-today equals the send-date constant (default
  `2026-10-09`) — the copy is only true that day.
- Inserts `pending_recipients` only; users already holding this event's row
  are excluded explicitly, and the per-recipient unique index additionally
  no-ops any racing duplicate. One user with many completed orders appears
  once (`distinct user_id`).
- Safe to rerun after a successful send: `inserted_count = 0`, no duplicates.

```sql
do $package_content_update_fanout$
declare
  v_package_id  uuid;
  v_slug        text;
  v_exam_set_id uuid := '<exam_set_id from A1>';
  v_confirmed_eligible int := <eligible_recipients confirmed in A2>;
  v_send_date   date := coalesce(
                     nullif(current_setting('app.notification_v1_2_send_date', true), ''),
                     date '2026-10-09'
                   );
  v_today       date := (now() at time zone 'Asia/Bangkok')::date;
  v_event_key   text;
  v_eligible    int;
  v_already     int;
  v_pending     int;
  v_inserted    int;
begin
  if v_today <> v_send_date then
    raise exception 'Gate B send-time guard: the approved copy says "สอบพรุ่งนี้", which is only true on %. Asia/Bangkok today is %. If delivery is delayed, update the body copy AND the guard date together, then rerun.', v_send_date, v_today;
  end if;

  select id, slug
    into v_package_id, v_slug
    from public.packages
   where package_code = 'OPSMOAC-PPA-2026-V10'
     and is_published = true;

  if v_package_id is null or v_slug is null then
    raise exception 'Gate B: target package not found or unpublished.';
  end if;

  if not exists (
    select 1
      from public.exam_sets
     where id = v_exam_set_id
       and package_id = v_package_id
       and status = 'published'
  ) then
    raise exception 'Gate B: % is not a published exam set of the target package.', v_exam_set_id;
  end if;

  v_event_key := 'package_content_update:' || v_package_id::text || ':' || v_exam_set_id::text;

  with entitled as (
    select distinct o.user_id
    from public.orders o
    where o.package_id = v_package_id
      and o.status in ('paid','free')
  ), candidates as (
    select e.user_id
    from entitled e
    join public.profiles pr on pr.id = e.user_id
    where pr.deleted_at is null
      and pr.status = 'active'
  ), already as (
    select c.user_id
    from candidates c
    join public.notifications n
      on n.user_id = c.user_id
     and n.type = 'PACKAGE_CONTENT_UPDATE'
     and n.source_event_key = v_event_key
  )
  select (select count(*) from candidates)::int,
         (select count(*) from already)::int
    into v_eligible, v_already;

  if v_eligible <> v_confirmed_eligible then
    raise exception 'Gate B: eligible audience drift — Gate A confirmed %, now %. Re-run Gate A.', v_confirmed_eligible, v_eligible;
  end if;

  v_pending := v_eligible - v_already;

  with candidates as (
    select distinct o.user_id
    from public.orders o
    join public.profiles pr on pr.id = o.user_id
    where o.package_id = v_package_id
      and o.status in ('paid','free')
      and pr.deleted_at is null
      and pr.status = 'active'
  ), pending as (
    select c.user_id
    from candidates c
    where not exists (
      select 1
      from public.notifications n
      where n.user_id = c.user_id
        and n.type = 'PACKAGE_CONTENT_UPDATE'
        and n.source_event_key = v_event_key
    )
  ), ins as (
    insert into public.notifications
      (user_id, type, title, body, href, source_order_id, source_event_key)
    select p.user_id,
           'PACKAGE_CONTENT_UPDATE',
           'เพิ่มข้อสอบชุดใหม่แล้ว 🔥',
           'แพ็กเกจนักวิเคราะห์นโยบายและแผน สป.กษ. เพิ่มชุดข้อสอบระดับยากแล้ว เตรียมความพร้อมโค้งสุดท้ายก่อนสอบพรุ่งนี้',
           '/package/' || v_slug || '/exam/' || v_exam_set_id::text,
           null,
           v_event_key
    from pending p
    on conflict (user_id, type, source_event_key) where source_event_key is not null
    do nothing
    returning 1
  )
  select count(*)::int into v_inserted from ins;

  raise notice 'Gate B done: eligible_recipients=%, already_notified=%, pending_recipients=%, inserted_count=% (rerun-safe).',
    v_eligible, v_already, v_pending, v_inserted;
end
$package_content_update_fanout$;
```

The statement returns only aggregate counts in a `NOTICE`; it never selects or
returns personal data. Notification rows carry only `user_id`, the event key,
and the approved copy — no PII beyond the existing schema's user reference.

------------------------------------------------------------------------

## Post-send verification (aggregates only)

```sql
select type, source_event_key, count(*) as rows,
       min(created_at) as first_sent, max(created_at) as last_sent
from public.notifications
where type = 'PACKAGE_CONTENT_UPDATE'
group by type, source_event_key;
```

Expected: exactly one row, `source_event_key =
package_content_update:<package_id>:<exam_set_id>`, `rows` =
`pending_recipients` from the first Gate B run.

Also verify the intended CTA resolves (browser, logged-in entitled account):
`/package/<slug>/exam/<exam_set_id>` — the bell renders the
`ทำข้อสอบชุดใหม่` label and pushes the local href.

## Rollback (only if the send was wrong)

Delete by the event key — never by user list:

```sql
-- review first, then run inside an explicit transaction
select count(*) from public.notifications
where type = 'PACKAGE_CONTENT_UPDATE'
  and source_event_key = 'package_content_update:<package_id>:<exam_set_id>';

begin;
delete from public.notifications
where type = 'PACKAGE_CONTENT_UPDATE'
  and source_event_key = 'package_content_update:<package_id>:<exam_set_id>';
commit;
```

Because the per-recipient unique index dedupes on (user, event), the same
event can be re-sent afterwards with a fresh Gate A → Gate B pass.

## Invariants checklist

- Recipients = completed orders (`paid`/`free`) on this exact package, active
  profiles only; multiple historical orders collapse to one row per user.
- Uniqueness is per recipient per event: `(user_id, type, source_event_key)`;
  different recipients never collide; reruns and concurrent sends are no-ops.
- Unrelated package owners receive nothing; staff-only access selects no one;
  banned/soft-deleted profiles receive nothing.
- The insert grants no access: notifications are never consulted by any
  entitlement path; orders remain the sole authority.
- No payment/order state is modified; no PII beyond `user_id`; output is
  aggregate-only.
- Type-specific source integrity is schema-enforced: PACKAGE_APPROVED requires
  `source_order_id`, PAYMENT_REJECTED requires
  `source_payment_submission_id`, PACKAGE_CONTENT_UPDATE requires
  `source_event_key`, and event-key rows can never fake an order or submission
  reference (`notifications_event_key_scope_check`).
- `PACKAGE_APPROVED` (per-order partial unique index) and `PAYMENT_REJECTED`
  (per-submission unique constraint) producers, RLS, and grants are untouched.
