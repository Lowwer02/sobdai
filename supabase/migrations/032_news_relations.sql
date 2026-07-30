-- 032_news_relations.sql
-- Government News — Phase 1, Migration B: ordered M:N relations.
--
-- Creates ONLY the two junction tables linking News to Packages and Summaries.
-- Mirrors the exam_set_questions junction pattern (migration 001): composite PK
-- (uniqueness + access path in one), on delete cascade on both sides, sort_order
-- for editorial ordering.
--
-- SAFE: adds two new junction tables + indexes/RLS. Touches nothing else.
--       Additive and backward-compatible: the app runs correctly before and
--       after because nothing reads these tables until the (separately released)
--       feature-flagged application code does.

-- ──────────────────────────────────────────────────────────────────────────
-- news_packages  —  News ↔ Package (the conversion surface)
-- ──────────────────────────────────────────────────────────────────────────
create table if not exists public.news_packages (
    news_id    uuid references public.news(id)    on delete cascade not null,
    package_id uuid references public.packages(id) on delete cascade not null,
    sort_order int not null default 0,
    created_at timestamptz not null default now(),

    primary key (news_id, package_id)
);

comment on table  public.news_packages is 'Ordered, bounded junction: News → Packages. The conversion surface of the organic-acquisition funnel.';
comment on column public.news_packages.news_id    is 'Parent news article. ON DELETE CASCADE: relations die with the article.';
comment on column public.news_packages.package_id is 'Linked package. ON DELETE CASCADE: relations die with the package (junction only; rendered page is revalidated by the app).';
comment on column public.news_packages.sort_order is 'Editorial ordering of related packages on the news page. Lower = shown first.';
comment on column public.news_packages.created_at is 'When the link was created. No updated_at: a junction row is immutable except sort_order, which is part of the ordered list, not a content edit.';

-- ──────────────────────────────────────────────────────────────────────────
-- news_summaries  —  News ↔ Summary
-- ──────────────────────────────────────────────────────────────────────────
create table if not exists public.news_summaries (
    news_id    uuid references public.news(id)     on delete cascade not null,
    summary_id uuid references public.summaries(id) on delete cascade not null,
    sort_order int not null default 0,
    created_at timestamptz not null default now(),

    primary key (news_id, summary_id)
);

comment on table  public.news_summaries is 'Ordered, bounded junction: News → Summaries. Drives the next step of the organic-acquisition funnel (News → Package → Summary → Practice).';
comment on column public.news_summaries.news_id    is 'Parent news article. ON DELETE CASCADE: relations die with the article.';
comment on column public.news_summaries.summary_id is 'Linked summary. ON DELETE CASCADE: relations die with the summary (junction only; rendered page is revalidated by the app).';
comment on column public.news_summaries.sort_order is 'Editorial ordering of related summaries on the news page. Lower = shown first.';
comment on column public.news_summaries.created_at is 'When the link was created. No updated_at: a junction row is immutable except sort_order, which is part of the ordered list, not a content edit.';

-- No handle_updated_at trigger on junctions: they have only created_at. The
-- shared trigger would be dead weight (migration 031 reuses it for `news` only).

-- ──────────────────────────────────────────────────────────────────────────
-- RLS
-- ──────────────────────────────────────────────────────────────────────────
-- Public read: relations are visible ONLY when the parent news is published.
-- This keeps the public-read predicate consistent with `news` (migration 031):
-- anon sees relations of published articles only; drafts' relations are private
-- (and preview reads them via the service client, bypassing RLS).
-- Admin write: existing admin-exists predicate (owner/admin/editor), uniform
-- with the rest of the module.

alter table public.news_packages enable row level security;
alter table public.news_summaries enable row level security;

create policy "Public can read relations of published news (packages)."
  on public.news_packages for select
  using (
    exists (select 1 from public.news where id = news_id and status = 'published')
  );

create policy "Content managers can manage news_packages."
  on public.news_packages for all
  using (
    exists (select 1 from public.profiles where id = auth.uid() and role in ('owner', 'admin', 'editor'))
  );

create policy "Public can read relations of published news (summaries)."
  on public.news_summaries for select
  using (
    exists (select 1 from public.news where id = news_id and status = 'published')
  );

create policy "Content managers can manage news_summaries."
  on public.news_summaries for all
  using (
    exists (select 1 from public.profiles where id = auth.uid() and role in ('owner', 'admin', 'editor'))
  );

-- ──────────────────────────────────────────────────────────────────────────
-- Indexes
-- ──────────────────────────────────────────────────────────────────────────
-- The composite PK already serves the primary access pattern (fetch a news
-- article's relations by news_id, ordered). The two indexes below are the
-- REVERSE-LOOKUP path: "which news articles reference this package/summary?"
-- Used when a Package or Summary is unpublished/deleted and the referencing
-- news pages must be revalidated. Plain (non-partial) because reverse
-- revalidation must find all referencing rows regardless of their own state.
create index if not exists news_packages_package_id_idx
  on public.news_packages (package_id);

create index if not exists news_summaries_summary_id_idx
  on public.news_summaries (summary_id);

notify pgrst, 'reload schema';
