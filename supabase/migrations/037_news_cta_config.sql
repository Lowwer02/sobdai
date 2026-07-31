-- 035_news_cta_config.sql
--
-- Adds a single nullable JSONB column `cta_config` to public.news so each
-- article can carry an editor-configured "preparation CTA" box shown near the
-- bottom of the public detail page.
--
-- Design choices (frozen):
--   * JSONB (not flat columns): the CTA is a small nested object with two
--     button sub-objects whose shape may grow; a single JSONB column avoids a
--     migration per added field, mirroring the homepage_settings grouped-JSONB
--     convention (020) and the nullable extended_config precedent there.
--   * NULL default (not '{}'::jsonb): existing rows stay NULL and the app
--     treats NULL as "no CTA configured" → nothing renders. This is the spec's
--     preferred backward-compatibility behaviour: legacy articles never change
--     appearance, and never show an empty box.
--   * No RLS changes: the existing news policies (public SELECT on
--     status='published'; content managers FOR ALL) already cover any column on
--     the table, so cta_config inherits them with no weakening.
--   * No generated-type impact: Sobdai hand-writes its row types in lib/news.ts
--     (there is no `supabase gen types` step), so the only companion change is
--     to extend the News / NewsInput interfaces there.

alter table public.news
  add column if not exists cta_config jsonb default null;

comment on column public.news.cta_config is
  'Editor-configured preparation CTA box for the public detail page. NULL = no CTA (legacy rows). Shape: { enabled, hideWhenEmpty, heading, description, primary, secondary }.';

-- Reload the PostgREST schema cache so the new column is queryable immediately.
NOTIFY pgrst, 'reload schema';
