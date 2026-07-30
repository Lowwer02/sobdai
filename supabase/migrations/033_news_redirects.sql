-- 033_news_redirects.sql
-- Government News — Phase 1, Migration C: link-equity redirect registry.
--
-- Creates ONLY the `news_redirects` table. Supports permanent (301) slug
-- changes and archive→/news redirects so ranked URLs never silently 404.
--
-- Design decision (frozen): redirects are PATH-BASED, not slug-pair-based, so a
-- single table handles slug renames, archive, consolidation, and future
-- cross-type redirects uniformly. from_path is the exact-match key the edge/
-- routing layer resolves before rendering.
--
-- news_id is an OPTIONAL provenance pointer only. It is ON DELETE SET NULL by
-- design: a redirect MUST outlive the news row that originated it. A 301 on a
-- ranked URL that has been deleted must keep redirecting — CASCADE would delete
-- the redirect and resurrect a 404, destroying the link equity this table
-- exists to preserve.
--
-- SAFE: adds one new table + index/RLS/trigger. Touches nothing else.
--       Additive and backward-compatible: the app runs correctly before and
--       after because nothing reads this table until the (separately released)
--       feature-flagged application code does.

create table if not exists public.news_redirects (
    id uuid default uuid_generate_v4() primary key,

    -- Edge resolution: exact path match. Globally unique. The implicit unique
    -- index also serves the lookup (no separate from_path index needed).
    from_path text unique not null,
    to_path   text not null,

    -- HTTP status. smallint is the honest type for HTTP codes (NOT a `status`
    -- text vocabulary, which would collide with the lifecycle `status` columns
    -- elsewhere in the module). CHECK-constrained to the two redirect codes.
    http_status smallint not null
        check (http_status in (301, 302)),

    -- Optional audit reason (slug rename / archive / consolidation / manual).
    reason text,

    -- Optional provenance pointer to the originating news article. Nullable +
    -- ON DELETE SET NULL: the redirect survives news deletion by design.
    news_id uuid references public.news(id) on delete set null,

    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

comment on table  public.news_redirects is 'Link-equity redirect registry. Resolves retired/renamed news URLs so ranked URLs never 404 (News is an organic-acquisition surface).';
comment on column public.news_redirects.from_path   is 'Source path the edge layer matches before render. Globally unique. Exact-match lookup.';
comment on column public.news_redirects.to_path     is 'Target path the edge layer redirects to (e.g. /news/<new-slug>, /news, or a consolidation target).';
comment on column public.news_redirects.http_status is '301 = permanent, 302 = temporary. smallint (not status text) to avoid colliding with the lifecycle status vocabulary).';
comment on column public.news_redirects.reason      is 'Optional audit reason (slug rename / archive / consolidation / manual).';
comment on column public.news_redirects.news_id     is 'Optional provenance pointer to the originating news article. ON DELETE SET NULL: a redirect outlives its source row to preserve link equity.';

-- updated_at bump on save. Reuses the shared handle_updated_at() from migration
-- 001 — does NOT redefine it.
create trigger handle_updated_at_news_redirects
  before update on public.news_redirects
  for each row execute procedure public.handle_updated_at();

-- RLS: public read + admin write.
--   * Public (anon / authenticated) read all redirects. The routing/edge layer
--     must resolve them before rendering, so redirects cannot be gated behind
--     publish state — a retired article's redirect is read precisely because
--     the article is no longer published.
--   * Admin (owner/admin/editor) full management, uniform with the rest of the
--     module.
alter table public.news_redirects enable row level security;

create policy "Public can read news redirects."
  on public.news_redirects for select
  using (true);

create policy "Content managers can manage news_redirects."
  on public.news_redirects for all
  using (
    exists (select 1 from public.profiles where id = auth.uid() and role in ('owner', 'admin', 'editor'))
  );

notify pgrst, 'reload schema';
