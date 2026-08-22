-- ==============================================================================
-- Migration: 081_article_sources.sql
-- Description: Add structured sources JSONB column to public.articles
-- ==============================================================================

alter table public.articles
    add column if not exists sources jsonb not null default '[]'::jsonb;

comment on column public.articles.sources is 'Structured list of multi-source citations/references [{ title, url, source_date }].';

-- Notify PostgREST to reload schema
notify pgrst, 'reload schema';
