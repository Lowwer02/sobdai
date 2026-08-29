-- 086_affiliate_listing_monetization.sql
-- Affiliate M2 — Listing Monetization config.
--
-- Adds ONE additive table that stores the listing-strip configuration for the
-- two public editorial listings (/news, /articles):
--
--   public.affiliate_listing_slots
--     listing_key  'news_list' | 'articles_list'  (frozen — new slots need DDL)
--     enabled      master switch (default false — existing behavior unchanged)
--     collection_id which affiliate collection feeds the strip
--
-- Deliberately NOT added (M2 scope freeze): insertion-position controls, product
-- count controls, multiple slots per listing, per-page rules. The strip renders
-- after listing item #6 (only when ≥7 items render) — that position lives in
-- code (lib/affiliate-listing.ts), never in config.
--
-- Conventions reused from 085:
--   - ON DELETE SET NULL for the collection FK: deleting a collection turns the
--     strip off silently instead of blocking the delete
--   - no CHECK that enabled implies a non-null collection_id: the public strip
--     renders nothing for enabled-but-no-collection slots (render-time guard,
--     same as the M1 rail)
--   - 079-hardened admin predicate on the staff policy
--   - handle_updated_at trigger

-- ──────────────────────────────────────────────────────────────────────────
-- 1. Listing slot config
-- ──────────────────────────────────────────────────────────────────────────
create table if not exists public.affiliate_listing_slots (
    listing_key text primary key,
    constraint affiliate_listing_slots_key_allowed
      check (listing_key in ('news_list', 'articles_list')),

    enabled boolean not null default false,

    collection_id uuid
      references public.affiliate_collections(id) on delete set null,

    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

comment on table  public.affiliate_listing_slots                  is 'Affiliate M2: per-listing strip config (/news, /articles). One row per listing key; position (after item #6) is frozen in code, never stored.';
comment on column public.affiliate_listing_slots.listing_key      is 'Which public listing this slot configures. Frozen enum: news_list | articles_list.';
comment on column public.affiliate_listing_slots.enabled          is 'Master switch. Default false — listings render exactly as before M2.';
comment on column public.affiliate_listing_slots.collection_id    is 'Affiliate collection feeding the strip (published products only, capped at 5 in code). ON DELETE SET NULL: deleting a collection disables the strip, never blocks the delete.';

drop trigger if exists handle_updated_at_affiliate_listing_slots on public.affiliate_listing_slots;
create trigger handle_updated_at_affiliate_listing_slots
  before update on public.affiliate_listing_slots
  for each row execute procedure public.handle_updated_at();

-- Seed the two frozen slots so admins edit existing rows (the save action
-- upserts, so a missing row also heals itself). Both start disabled.
insert into public.affiliate_listing_slots (listing_key, enabled, collection_id)
values
  ('news_list', false, null),
  ('articles_list', false, null)
on conflict (listing_key) do nothing;

-- ──────────────────────────────────────────────────────────────────────────
-- 2. RLS
-- ──────────────────────────────────────────────────────────────────────────
alter table public.affiliate_listing_slots enable row level security;

-- Public read of the config rows: the rows carry no sensitive data (listing
-- key, flag, collection uuid) and the public pages must read them to decide
-- whether the strip renders at all.
create policy "Public can read affiliate listing slots."
  on public.affiliate_listing_slots for select
  using (true);

-- Staff management: 079-hardened predicate (owner/admin/editor, active,
-- not soft-deleted). Same shape as the 085 affiliate policies.
create policy "Content managers can manage affiliate listing slots."
  on public.affiliate_listing_slots for all
  to authenticated
  using (
    exists (
      select 1 from public.profiles
      where id = auth.uid()
        and role in ('owner', 'admin', 'editor')
        and status = 'active'
        and deleted_at is null
    )
  );

-- ──────────────────────────────────────────────────────────────────────────
-- 3. Indexes
-- ──────────────────────────────────────────────────────────────────────────
-- Reverse lookup (which listing slots reference a collection) — used to audit
-- what a collection delete/publish affects.
create index if not exists affiliate_listing_slots_collection_id_idx
  on public.affiliate_listing_slots (collection_id)
  where collection_id is not null;

notify pgrst, 'reload schema';
