-- 031_news_core.sql
-- Government News — Phase 1, Migration A: `news` core table.
--
-- Creates ONLY the `news` content table. This session does NOT add junction
-- tables (news_packages / news_summaries), redirects, storage, or seed data —
-- those land in separate migrations (B, C, S, Seed). The table is designed so a
-- future unified Content Platform can be adopted without rewriting it (status /
-- type-style fields are CHECK-constrained text; type-specific concerns stay in
-- extension tables later).
--
-- SAFE: adds one new table + its indexes/RLS/trigger. Touches nothing else.
--       Additive and backward-compatible: the app runs correctly before and
--       after because nothing reads this table until the (separately released)
--       feature-flagged application code does.

create table if not exists public.news (
    id uuid default uuid_generate_v4() primary key,

    -- Identity & routing. Slug is globally unique in Phase 1; it will be
    -- re-scoped to unique(type, slug) only when a second content type arrives.
    slug text unique not null,

    -- User-facing content. excerpt / body_markdown / cover are nullable here;
    -- publish-readiness is enforced at the publish lifecycle edge by the app's
    -- validateNewsForPublish() contract, NOT by NOT NULL (drafts stay forgiving).
    title text not null,
    excerpt text,
    body_markdown text,
    cover_image_url text,
    cover_image_alt text,

    -- Taxonomy (free-text per existing convention; controlled vocabulary is a
    -- later, data-informed decision). tags uses the native Postgres array.
    category text,
    tags text[] not null default '{}',

    -- Lifecycle: draft → published → archived. The directional CHECK below
    -- guarantees a published row always carries a publish time, while allowing
    -- archived/draft rows to RETAIN published_at (supports republish-after-archive).
    status text not null default 'draft'
        check (status in ('draft', 'published', 'archived')),
    published_at timestamptz,
    check (status <> 'published' or published_at is not null),

    -- Attribution (E-E-A-T group): feeds NewsArticle structured data + source
    -- citation. author_id is orphan-safe (SET NULL) because profiles is
    -- soft-deleted; never CASCADE — would delete content on author removal.
    author_id uuid references public.profiles(id) on delete set null,
    source_name text,
    source_url text,
    source_date date,

    -- SEO. No DB default on og_image_url on purpose: the app falls back to
    -- cover_image_url, avoiding value-copy staleness.
    seo_title text,
    seo_description text,
    canonical_url text,
    og_image_url text,

    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

comment on table  public.news is 'Government Exam News article. Phase 1 content surface for organic acquisition (News → Package → Summary → Practice → Register).';
comment on column public.news.slug             is 'URL slug. Globally unique in Phase 1; becomes unique(type, slug) when the unified Content Platform lands.';
comment on column public.news.body_markdown    is 'Markdown source. Rendered to sanitized HTML at build/revalidation time (SSG/ISR), never client-side. TOASTed automatically.';
comment on column public.news.cover_image_alt  is 'Alt text for cover image. Accessibility + image SEO; required at publish (app-enforced).';
comment on column public.news.tags             is 'Free-text tag array. Bounded count at publish (app-enforced). Controlled vocabulary deferred.';
comment on column public.news.status           is 'draft | published | archived. Only published rows are visible publicly and in the sitemap.';
comment on column public.news.published_at     is 'Set on first publish and retained thereafter. Must be non-null when status=published (CHECK-enforced).';
comment on column public.news.author_id        is 'Optional author profile. ON DELETE SET NULL (profiles is soft-deleted; content must not be lost).';
comment on column public.news.source_name      is 'E-E-A-T: source citation. If any source_* field is set, the group should be complete (app-enforced at publish).';
comment on column public.news.source_url       is 'Canonical source URL (e.g. official .gov notification).';
comment on column public.news.source_date      is 'Date of the source notification.';
comment on column public.news.canonical_url    is 'Explicit canonical. Optional; defaults to the absolute public URL at the app layer.';
comment on column public.news.og_image_url     is 'Open Graph image. Optional; app falls back to cover_image_url. No DB default (avoids value-copy staleness).';

-- updated_at bump on save. Reuses the shared handle_updated_at() from migration
-- 001 — does NOT redefine it.
create trigger handle_updated_at_news
  before update on public.news
  for each row execute procedure public.handle_updated_at();

-- RLS: authoritative visibility gate.
--   * Public (anon / authenticated) read ONLY published rows. This predicate
--     is identical to the partial-index predicates below, so RLS is essentially
--     free on the read path. Preview and publish-readiness are APPLICATION
--     concerns (signed token + service client bypassing RLS) and are NEVER
--     encoded here.
--   * Admin (owner/admin/editor) full management. PostgREST ORs the two SELECT
--     policies, so admins see all rows and anon sees published only.
alter table public.news enable row level security;

create policy "Public can read published news."
  on public.news for select
  using (status = 'published');

create policy "Content managers can manage news."
  on public.news for all
  using (
    exists (select 1 from public.profiles where id = auth.uid() and role in ('owner', 'admin', 'editor'))
  );

-- Partial indexes gated on status='published': the exact public-read predicate
-- (and the RLS gate above). Drafts/archived are excluded from the index entirely,
-- keeping it small and serving listing + sitemap generation index-only.
-- Keyset pagination (never OFFSET) uses the trailing `id` tiebreaker.
create index if not exists news_category_live_idx
  on public.news (category, published_at desc, id)
  where status = 'published';

create index if not exists news_published_live_idx
  on public.news (published_at desc, id)
  where status = 'published';

notify pgrst, 'reload schema';
