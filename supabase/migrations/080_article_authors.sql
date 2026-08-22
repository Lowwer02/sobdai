-- 080_article_authors.sql
-- Sobdai Articles System — Phase 2.5B: Public-Safe Article Authors & Editorial Trust v1.
--
-- Creates:
--   1. `public.article_authors` dedicated public editorial authors table
--   2. Trigger for handle_updated_at() on `public.article_authors`
--   3. Foreign key `articles.author_id` referencing `public.article_authors(id)`
--   4. RLS policies: public can read active authors only; content managers can manage authors
--   5. Targeted indexes for slug lookups, active filtering, and article author relations
--
-- Security Invariant:
--   * public.profiles is NEVER opened or exposed to anonymous users.
--   * articles.created_by remains strictly the database audit actor.
--   * article_authors contains only intentionally public editorial profile fields.

-- ──────────────────────────────────────────────────────────────────────────
-- 1. Core Table: public.article_authors
-- ──────────────────────────────────────────────────────────────────────────
create table if not exists public.article_authors (
    id uuid default uuid_generate_v4() primary key,

    -- Identity & routing
    slug text unique not null,
    constraint article_authors_slug_not_empty check (btrim(slug) <> ''),

    -- Editorial Profile
    display_name text not null,
    constraint article_authors_display_name_not_empty check (btrim(display_name) <> ''),
    role_title text,
    short_bio text,
    avatar_url text,

    -- Status flag
    is_active boolean not null default true,

    -- Audit timestamps
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

comment on table  public.article_authors              is 'Sobdai Public Editorial Authors. Completely separate from auth accounts / profiles.';
comment on column public.article_authors.slug         is 'URL slug under /authors/[slug]. Unique across all authors.';
comment on column public.article_authors.display_name is 'Publicly displayed author name.';
comment on column public.article_authors.role_title   is 'Optional professional role title (e.g. นักวิชาการศึกษา).';
comment on column public.article_authors.short_bio    is 'Optional concise factual biographical summary.';
comment on column public.article_authors.avatar_url   is 'Optional author avatar image URL.';
comment on column public.article_authors.is_active    is 'Active toggle. Inactive authors are hidden from public pages and JSON-LD.';

-- Automatic updated_at trigger (reuses public.handle_updated_at())
drop trigger if exists handle_updated_at_article_authors on public.article_authors;
create trigger handle_updated_at_article_authors
  before update on public.article_authors
  for each row execute procedure public.handle_updated_at();

-- ──────────────────────────────────────────────────────────────────────────
-- 2. Article Foreign Key: articles.author_id
-- ──────────────────────────────────────────────────────────────────────────
alter table public.articles
  add column if not exists author_id uuid references public.article_authors(id) on delete set null;

comment on column public.articles.author_id is 'Optional public author assigned to this article (references public.article_authors).';

-- ──────────────────────────────────────────────────────────────────────────
-- 3. Row Level Security (RLS)
-- ──────────────────────────────────────────────────────────────────────────
alter table public.article_authors enable row level security;

-- Public read access: active authors only
drop policy if exists "Public can read active article authors." on public.article_authors;
create policy "Public can read active article authors."
  on public.article_authors for select
  using (is_active = true);

-- Content managers full management access for article_authors
drop policy if exists "Content managers can manage article authors." on public.article_authors;
create policy "Content managers can manage article authors."
  on public.article_authors
  for all
  to authenticated
  using (
    exists (
      select 1
      from public.profiles
      where id = auth.uid()
        and role in ('owner', 'admin', 'editor')
        and status = 'active'
        and deleted_at is null
    )
  )
  with check (
    exists (
      select 1
      from public.profiles
      where id = auth.uid()
        and role in ('owner', 'admin', 'editor')
        and status = 'active'
        and deleted_at is null
    )
  );

-- ──────────────────────────────────────────────────────────────────────────
-- 4. Indexes
-- ──────────────────────────────────────────────────────────────────────────
create index if not exists article_authors_is_active_idx
  on public.article_authors (is_active);

create index if not exists articles_author_id_idx
  on public.articles (author_id);

-- PostgREST schema reload
notify pgrst, 'reload schema';
