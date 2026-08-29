-- 087_adsense_content_toggle.sql
-- AdSense Conservative (M3) — per-content manual display-ad opt-in.
--
-- Adds ONLY two additive columns:
--   1. `news.adsense_enabled`     boolean not null default false
--   2. `articles.adsense_enabled` boolean not null default false
--
-- Conventions reused (mirrors 085's content wiring columns):
--   - additive `add column if not exists` → re-runnable, existing rows untouched
--   - `default false` → every existing News/Article renders exactly as before
--     (AdSense OFF is the explicit M3 default; editors opt in per content row)
--
-- Deliberate non-objects:
--   - NO per-content client/slot id columns: AdSense account + slot ids are
--     platform-level configuration and live in environment variables
--     (NEXT_PUBLIC_ADSENSE_CLIENT / NEXT_PUBLIC_ADSENSE_DETAIL_SLOT, read by
--     lib/adsense.ts). Content rows only carry the opt-in boolean.
--   - NO placement/density/format columns: M3 fixes ONE manual responsive
--     display unit per detail page at ONE stable editorial break. Those are
--     surface contracts in code, not editor controls.
--   - NO RLS changes: this is a plain column on already-RLS-governed tables.
--     The existing public SELECT / staff write policies cover the new column
--     without modification; it is never used as a policy predicate and is not
--     sensitive (a rendering opt-in, not a credential).
--   - NO index: the column is never filtered/joined on (read once per detail
--     row inside the existing detail fetch).

alter table public.news
  add column if not exists adsense_enabled boolean not null default false;

comment on column public.news.adsense_enabled is
  'AdSense Conservative (M3) per-content opt-in for ONE manual responsive display unit on /news/[slug]. Default false — existing content unchanged. Renders nothing unless the platform-level AdSense env config is also present.';

alter table public.articles
  add column if not exists adsense_enabled boolean not null default false;

comment on column public.articles.adsense_enabled is
  'AdSense Conservative (M3) per-content opt-in for ONE manual responsive display unit on /articles/[slug]. Default false — existing content unchanged. Renders nothing unless the platform-level AdSense env config is also present.';

-- PostgREST schema reload (repo convention for every schema-touching migration)
notify pgrst, 'reload schema';

-- ──────────────────────────────────────────────────────────────────────────
-- Verification (run AFTER applying, in Supabase SQL Editor):
--
--   select table_name, column_name, data_type, is_nullable, column_default
--   from information_schema.columns
--   where table_schema = 'public'
--     and table_name in ('news', 'articles')
--     and column_name = 'adsense_enabled'
--   order by table_name;
--   -- expect exactly 2 rows, both: boolean, NO, 'false'
--
--   select count(*) as news_still_defaulting_off
--   from public.news where adsense_enabled <> false;   -- expect 0
--   select count(*) as articles_still_defaulting_off
--   from public.articles where adsense_enabled <> false; -- expect 0
-- ──────────────────────────────────────────────────────────────────────────
