-- 063_news_homepage_featured_deadline.sql
--
-- Adds Homepage Featured News and Application Deadline fields to public.news:
--   * application_deadline date null                    - Recruitment closing date
--   * homepage_featured boolean not null default false   - Pinned state for Homepage
--   * homepage_featured_order integer null              - Pinned display priority (positive integer)
--   * hide_from_homepage_when_expired boolean not null default true - Auto-expiry homepage toggle
--
-- SAFE & IDEMPOTENT:
--   * Uses ADD COLUMN IF NOT EXISTS for all columns.
--   * Safely adds named CHECK constraint for homepage_featured_order if absent.
--   * Idempotent partial index supporting Homepage selection ordering.
--   * Preserves all existing columns, data, RLS, and policies.

alter table public.news
  add column if not exists application_deadline date,
  add column if not exists homepage_featured boolean not null default false,
  add column if not exists homepage_featured_order integer,
  add column if not exists hide_from_homepage_when_expired boolean not null default true;

-- Named CHECK constraint for homepage_featured_order (positive integers only when set)
do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'news_homepage_featured_order_check'
  ) then
    alter table public.news
      add constraint news_homepage_featured_order_check
      check (homepage_featured_order is null or homepage_featured_order > 0);
  end if;
end $$;

comment on column public.news.application_deadline is
  'Recruitment application closing date (date only). Null when unstated or non-recruitment.';
comment on column public.news.homepage_featured is
  'Whether this article is pinned/featured on the Homepage Latest News section.';
comment on column public.news.homepage_featured_order is
  'Display priority for pinned Homepage news (1, 2, 3...). Null when unpinned.';
comment on column public.news.hide_from_homepage_when_expired is
  'Whether to exclude from Homepage selection after application_deadline has passed.';

-- Partial index supporting Homepage news selection query:
create index if not exists idx_news_homepage_selection
  on public.news (
    homepage_featured desc,
    homepage_featured_order asc nulls last,
    published_at desc,
    updated_at desc,
    created_at desc
  )
  where status = 'published';

-- Reload PostgREST schema cache
NOTIFY pgrst, 'reload schema';
