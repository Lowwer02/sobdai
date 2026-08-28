-- 085_affiliate_cms.sql
-- Affiliate M1 Foundation — CMS tables, content wiring, RLS.
--
-- Creates:
--   1. `public.affiliate_products`     — merchant products with outbound affiliate URLs
--   2. `public.affiliate_collections`  — editor-curated ordered product groups
--   3. `public.affiliate_collection_items` — ordered M:N junction (mirrors news_summaries)
--   4. `news.affiliate_enabled` / `news.affiliate_collection_id` wiring columns
--   5. `articles.affiliate_enabled` / `articles.affiliate_collection_id` wiring columns
--
-- Conventions reused:
--   - draft|published|archived lifecycle (news/articles/promotions CHECK style)
--   - ordered junction with composite PK + sort_order (news_packages/news_summaries)
--   - 079-hardened admin predicate (role in owner/admin/editor AND status='active'
--     AND deleted_at IS NULL) on every admin policy
--   - public SELECT on published rows only; the junction is readable only when
--     BOTH the parent collection AND the referenced product are published, so an
--     unpublished product cannot leak through junction reads
--   - no prices stored: marketplace prices are volatile; the CTA wording
--     ("ดูราคาล่าสุด") intentionally defers pricing to the merchant page
--
-- Deliberate non-constraints:
--   - No CHECK that affiliate_enabled implies a non-null affiliate_collection_id:
--     the FK is ON DELETE SET NULL, and such a CHECK would make deleting a
--     collection fail whenever any content still references it. The public rail
--     renders nothing for enabled-but-no-collection rows (render-time guard).
--   - No storage bucket: product images are generic HTTPS URLs (external CDN
--     today, Sobdai-managed later if ever needed).

-- ──────────────────────────────────────────────────────────────────────────
-- 1. Products
-- ──────────────────────────────────────────────────────────────────────────
create table if not exists public.affiliate_products (
    id uuid default uuid_generate_v4() primary key,

    name text not null,
    constraint affiliate_products_name_not_empty check (btrim(name) <> ''),

    -- Generic HTTPS image URL (external CDN or future Sobdai-hosted). No bucket.
    image_url text,
    image_alt text,

    -- Merchant slug, extensible: 'shopee' today, other marketplaces later.
    -- Free-form lowercase text (not an enum) so adding a merchant needs no DDL.
    merchant text not null default 'shopee',
    constraint affiliate_products_merchant_not_empty check (btrim(merchant) <> ''),

    -- Outbound affiliate URL. MUST be HTTPS — enforced server-side by
    -- lib/affiliate.ts cleanAffiliateUrl() on every admin write; the column
    -- stays plain text (not a CHECK) because URL-shape rules live in the app
    -- contract, matching how news.source_url / articles canonical_url work.
    affiliate_url text not null,
    constraint affiliate_products_affiliate_url_not_empty check (btrim(affiliate_url) <> ''),

    short_description text,

    tags text[] not null default '{}',

    status text not null default 'draft'
        check (status in ('draft', 'published', 'archived')),

    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

comment on table  public.affiliate_products                  is 'Affiliate products (M1: Shopee-first, merchant-extensible). No prices stored — volatile marketplace data.';
comment on column public.affiliate_products.image_url       is 'HTTPS product image URL (external CDN or Sobdai-managed). Rendered lazy with fixed aspect + broken-image fallback.';
comment on column public.affiliate_products.merchant        is 'Merchant slug (default shopee). Free-form so new merchants need no DDL.';
comment on column public.affiliate_products.affiliate_url   is 'Outbound affiliate URL. HTTPS-only, validated by lib/affiliate.ts on every admin write. No DB CHECK (URL shape is an app contract, like news.source_url).';
comment on column public.affiliate_products.status          is 'draft | published | archived. Public reads published only.';

drop trigger if exists handle_updated_at_affiliate_products on public.affiliate_products;
create trigger handle_updated_at_affiliate_products
  before update on public.affiliate_products
  for each row execute procedure public.handle_updated_at();

-- ──────────────────────────────────────────────────────────────────────────
-- 2. Collections
-- ──────────────────────────────────────────────────────────────────────────
create table if not exists public.affiliate_collections (
    id uuid default uuid_generate_v4() primary key,

    name text not null,
    constraint affiliate_collections_name_not_empty check (btrim(name) <> ''),

    status text not null default 'draft'
        check (status in ('draft', 'published', 'archived')),

    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

comment on table public.affiliate_collections is 'Editor-curated ordered affiliate product groups assigned to News/Articles. No slug — collections have no public pages in M1.';

drop trigger if exists handle_updated_at_affiliate_collections on public.affiliate_collections;
create trigger handle_updated_at_affiliate_collections
  before update on public.affiliate_collections
  for each row execute procedure public.handle_updated_at();

-- ──────────────────────────────────────────────────────────────────────────
-- 3. Ordered junction (mirrors news_packages / news_summaries shape)
-- ──────────────────────────────────────────────────────────────────────────
create table if not exists public.affiliate_collection_items (
    collection_id uuid references public.affiliate_collections(id) on delete cascade not null,
    product_id uuid references public.affiliate_products(id) on delete cascade not null,
    sort_order int not null default 0,
    created_at timestamptz not null default now(),

    primary key (collection_id, product_id)
);

comment on table  public.affiliate_collection_items                     is 'Ordered M:N junction: affiliate collections ↔ products. Same shape as news_summaries.';
comment on column public.affiliate_collection_items.sort_order          is 'Editorial ordering (lower = shown first). Public rail renders the first 5 published products.';

-- ──────────────────────────────────────────────────────────────────────────
-- 4. RLS
-- ──────────────────────────────────────────────────────────────────────────
alter table public.affiliate_products         enable row level security;
alter table public.affiliate_collections      enable row level security;
alter table public.affiliate_collection_items enable row level security;

-- Public read: published products/collections only (064 style — applies to
-- anon + authenticated; staff read everything via the admin policy below).
create policy "Public can read published affiliate products."
  on public.affiliate_products for select
  using (status = 'published');

create policy "Public can read published affiliate collections."
  on public.affiliate_collections for select
  using (status = 'published');

-- Public read of the junction requires BOTH sides published, so unpublished
-- products/collections never leak through junction reads.
create policy "Public can read published affiliate collection items."
  on public.affiliate_collection_items for select
  using (
    exists (
      select 1 from public.affiliate_collections c
      where c.id = collection_id and c.status = 'published'
    )
    and exists (
      select 1 from public.affiliate_products p
      where p.id = product_id and p.status = 'published'
    )
  );

-- Staff management: 079-hardened predicate (owner/admin/editor, active,
-- not soft-deleted). Same shape as the re-created news/articles policies.
create policy "Content managers can manage affiliate products."
  on public.affiliate_products for all
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

create policy "Content managers can manage affiliate collections."
  on public.affiliate_collections for all
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

create policy "Content managers can manage affiliate collection items."
  on public.affiliate_collection_items for all
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
-- 5. Content wiring columns (additive, default-off → existing rows unchanged)
-- ──────────────────────────────────────────────────────────────────────────
alter table public.news
  add column if not exists affiliate_enabled boolean not null default false;
alter table public.news
  add column if not exists affiliate_collection_id uuid
    references public.affiliate_collections(id) on delete set null;

alter table public.articles
  add column if not exists affiliate_enabled boolean not null default false;
alter table public.articles
  add column if not exists affiliate_collection_id uuid
    references public.affiliate_collections(id) on delete set null;

comment on column public.news.affiliate_enabled          is 'Affiliate rail master switch for this article (M1). Default false — existing content unaffected.';
comment on column public.news.affiliate_collection_id    is 'Assigned affiliate collection. ON DELETE SET NULL: deleting a collection disables the rail, never blocks the delete.';
comment on column public.articles.affiliate_enabled      is 'Affiliate rail master switch for this article (M1). Default false — existing content unaffected.';
comment on column public.articles.affiliate_collection_id is 'Assigned affiliate collection. ON DELETE SET NULL: deleting a collection disables the rail, never blocks the delete.';

-- ──────────────────────────────────────────────────────────────────────────
-- 6. Indexes
-- ──────────────────────────────────────────────────────────────────────────
-- Public rail query: items by collection in editorial order, tie-broken by
-- product_id for determinism.
create index if not exists affiliate_collection_items_order_idx
  on public.affiliate_collection_items (collection_id, sort_order, product_id);

-- Reverse lookup (which collections reference a product).
create index if not exists affiliate_collection_items_product_id_idx
  on public.affiliate_collection_items (product_id);

-- Content reverse lookup (which content rows reference a collection) — used by
-- admin actions to revalidate dependent public pages.
create index if not exists news_affiliate_collection_id_idx
  on public.news (affiliate_collection_id)
  where affiliate_collection_id is not null;

create index if not exists articles_affiliate_collection_id_idx
  on public.articles (affiliate_collection_id)
  where affiliate_collection_id is not null;

-- Admin list status filters (mirrors articles_status_idx).
create index if not exists affiliate_products_status_idx
  on public.affiliate_products (status);

create index if not exists affiliate_collections_status_idx
  on public.affiliate_collections (status);

-- PostgREST schema reload
notify pgrst, 'reload schema';
