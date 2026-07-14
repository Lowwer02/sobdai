-- 022_promotions.sql
-- Promotion Management Foundation (Phase 2.1).
--
-- Creates the `promotions` table only. This session does NOT add homepage
-- rendering, scheduling logic, or analytics — those come later. The table is
-- designed so future scheduling/per-type rendering can be added without a
-- migration (type/status are CHECK-constrained text; scheduling columns are
-- nullable and ignored until rendering lands).
--
-- SAFE: adds one new table. Touches nothing else.

create table if not exists public.promotions (
    id uuid default uuid_generate_v4() primary key,

    -- Admin-facing label only; never shown to end users.
    internal_name text not null,

    -- Enum-like (CHECK). Stored as text so adding a type later is a cheap
    -- constraint change, not a type migration.
    type text not null default 'promotion'
        check (type in ('promotion', 'announcement', 'new_feature', 'maintenance', 'campaign')),

    -- Lifecycle: draft → published → archived. No scheduling enforcement yet.
    status text not null default 'draft'
        check (status in ('draft', 'published', 'archived')),

    -- User-facing content.
    title text not null,
    subtitle text,
    description text,
    image_url text,

    -- CTA button on the promotion.
    button_text text,
    button_link text,
    link_type text not null default 'internal'
        check (link_type in ('internal', 'external')),
    open_in_new_tab boolean not null default false,

    -- Ordering. Priority is the primary signal (higher = first); display_order
    -- is the tiebreak — mirrors the existing Smart Content Ordering pattern.
    priority integer not null default 0,
    display_order integer not null default 0,

    -- Scheduling (stored now, NOT enforced until rendering lands in a later
    -- session). Nullable so a promotion can be "runs indefinitely".
    start_at timestamptz default null,
    end_at   timestamptz default null,

    -- Emergency pause: lets an admin take a published promotion offline
    -- without losing its status/schedule.
    active boolean not null default true,

    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

comment on column public.promotions.internal_name is 'Admin-only label. Never shown to end users.';
comment on column public.promotions.type     is 'promotion | announcement | new_feature | maintenance | campaign.';
comment on column public.promotions.status   is 'draft | published | archived. Scheduling not enforced yet.';
comment on column public.promotions.priority is 'Higher value = shown first.';
comment on column public.promotions.start_at is 'Optional start time. Not enforced until rendering lands.';
comment on column public.promotions.end_at   is 'Optional end time. Not enforced until rendering lands.';
comment on column public.promotions.active   is 'Master on/off. false takes the promotion offline regardless of status.';

-- updated_at bump on save.
create trigger handle_updated_at_promotions
  before update on public.promotions
  for each row execute procedure public.handle_updated_at();

-- RLS: promotions are admin-managed only. The public cannot read them yet
-- (rendering is a later session). When rendering lands, a public SELECT
-- policy gated on status='published' AND active AND the time window can be
-- added here without touching the admin policies.
alter table public.promotions enable row level security;

create policy "Content managers can manage promotions."
  on public.promotions for all
  using (
    exists (select 1 from public.profiles where id = auth.uid() and role in ('owner', 'admin', 'editor'))
  );

notify pgrst, 'reload schema';
