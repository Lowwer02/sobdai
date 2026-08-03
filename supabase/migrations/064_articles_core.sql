-- 064_articles_core.sql
-- Sobdai Articles System — Phase 2A: Database Foundation, Relations & RLS.
--
-- Creates:
--   1. `public.articles` content table
--   2. `public.article_packages` junction table (Articles ↔ Packages)
--   3. Trigger for handle_updated_at() on `public.articles`
--   4. RLS policies for public read (published only) and admin full access
--   5. Targeted indexes for status filtering, live listings, and reverse lookups

-- ──────────────────────────────────────────────────────────────────────────
-- 1. Core Table: public.articles
-- ──────────────────────────────────────────────────────────────────────────
create table if not exists public.articles (
    id uuid default uuid_generate_v4() primary key,

    -- Identity & routing
    slug text unique not null,
    constraint articles_slug_not_empty check (btrim(slug) <> ''),

    -- Content fields
    title text not null,
    constraint articles_title_not_empty check (btrim(title) <> ''),
    excerpt text,
    body_markdown text,
    cover_image_url text,
    cover_image_alt text,

    -- Taxonomy
    category text,
    tags text[] not null default '{}',

    -- Lifecycle: draft | published | archived
    status text not null default 'draft'
        check (status in ('draft', 'published', 'archived')),
    published_at timestamptz,

    -- Published-content integrity constraint
    constraint articles_published_fields_check check (
        status <> 'published' or (
            btrim(title) <> '' and
            btrim(slug) <> '' and
            excerpt is not null and btrim(excerpt) <> '' and
            body_markdown is not null and btrim(body_markdown) <> '' and
            cover_image_url is not null and btrim(cover_image_url) <> '' and
            cover_image_alt is not null and btrim(cover_image_alt) <> '' and
            category is not null and btrim(category) <> '' and
            published_at is not null
        )
    ),

    -- SEO fields
    seo_title text,
    seo_description text,
    canonical_url text,
    og_image_url text,

    -- Audit metadata
    created_by uuid references public.profiles(id) on delete set null,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

comment on table  public.articles is 'Sobdai Evergreen Articles & Guides. Structurally separate from Government News.';
comment on column public.articles.slug             is 'URL slug under /articles/[slug]. Unique across all articles.';
comment on column public.articles.body_markdown    is 'Markdown source content for the article.';
comment on column public.articles.cover_image_alt  is 'Alt text for cover image. Required on publish.';
comment on column public.articles.tags             is 'Free-text tags array.';
comment on column public.articles.status           is 'draft | published | archived. Public reads published only.';
comment on column public.articles.published_at     is 'Timestamp of first publish. Must be non-null when status=published.';
comment on column public.articles.created_by       is 'Profile ID of the creator/author (ON DELETE SET NULL).';

-- Automatic updated_at trigger (reuses public.handle_updated_at(), safe against re-execution)
drop trigger if exists handle_updated_at_articles on public.articles;
create trigger handle_updated_at_articles
  before update on public.articles
  for each row execute procedure public.handle_updated_at();

-- ──────────────────────────────────────────────────────────────────────────
-- 2. Junction Table: public.article_packages
-- ──────────────────────────────────────────────────────────────────────────
create table if not exists public.article_packages (
    article_id uuid references public.articles(id) on delete cascade not null,
    package_id uuid references public.packages(id) on delete cascade not null,
    sort_order int not null default 0,
    created_at timestamptz not null default now(),

    primary key (article_id, package_id)
);

comment on table  public.article_packages is 'Ordered M:N junction linking Articles to Related Exam Packages.';
comment on column public.article_packages.article_id is 'Parent article ID. Cascade deleted on article removal.';
comment on column public.article_packages.package_id is 'Linked package ID. Cascade deleted on package removal.';
comment on column public.article_packages.sort_order is 'Editorial ordering of related packages (lower = shown first).';

-- ──────────────────────────────────────────────────────────────────────────
-- 3. Row Level Security (RLS)
-- ──────────────────────────────────────────────────────────────────────────
alter table public.articles enable row level security;
alter table public.article_packages enable row level security;

-- Public read access: published articles only
create policy "Public can read published articles."
  on public.articles for select
  using (status = 'published');

-- Admin full management access for articles
create policy "Content managers can manage articles."
  on public.articles for all
  using (
    exists (select 1 from public.profiles where id = auth.uid() and role in ('owner', 'admin', 'editor'))
  );

-- Public read access: relations of published articles only
create policy "Public can read relations of published articles (packages)."
  on public.article_packages for select
  using (
    exists (select 1 from public.articles where id = article_id and status = 'published')
  );

-- Admin full management access for article_packages
create policy "Content managers can manage article_packages."
  on public.article_packages for all
  using (
    exists (select 1 from public.profiles where id = auth.uid() and role in ('owner', 'admin', 'editor'))
  );

-- ──────────────────────────────────────────────────────────────────────────
-- 4. Indexes
-- ──────────────────────────────────────────────────────────────────────────
-- Note: UNIQUE(slug) automatically creates a unique index on slug, so articles_slug_idx is omitted.

create index if not exists articles_status_idx
  on public.articles (status);

create index if not exists articles_published_live_idx
  on public.articles (published_at desc, id)
  where status = 'published';

create index if not exists articles_category_live_idx
  on public.articles (category, published_at desc, id)
  where status = 'published';

create index if not exists article_packages_package_id_idx
  on public.article_packages (package_id);

-- PostgREST schema reload
notify pgrst, 'reload schema';
