-- 047_homepage_latest_news.sql
--
-- Adds the "Latest News" homepage section as two new JSONB keys on the existing
-- homepage_settings singleton, without introducing any new columns:
--
--   * sections.news (boolean)              — section visibility toggle
--   * extended_config.latest_news (object) — { title, subtitle, cta_label, limit }
--
-- Design choices (frozen):
--   * JSONB-only (no new columns): mirrors the 020 grouped-JSONB convention and
--     the extended_config precedent (package_explorer / footer / support). The
--     app layer in lib/homepageConfig.ts owns typing, defaults and validation.
--   * Merge, never overwrite: a single idempotent UPDATE deep-merges each key so
--     any pre-existing user-configured sections.* / extended_config.* values
--     are preserved exactly. Defaults are only written when the key is absent.
--   * COALESCE guards NULL extended_config (the column is nullable by design in
--     020; legacy rows may still be NULL).
--   * updated_at is bumped only when the row actually changed, via the existing
--     handle_updated_at_homepage_settings trigger (no manual touch here).
--   * Idempotent: re-running writes the same payload; the JSONB merge is a
--     fixed-point once the defaults are present.
--
-- No RLS / index / trigger changes: 020 already covers read-public / write-admin
-- and the JSONB keys inherit those policies. NOTIFY pgrst matches the project
-- convention even though no column is added (cheap, consistent).

-- ─── sections.news ─────────────────────────────────────────────────────────
-- Deep-merge `news` into the existing `sections` object without touching the
-- other visibility booleans. Defaults to TRUE (section visible by default,
-- matching HOMEPAGE_DEFAULTS in lib/homepageConfig.ts).
update public.homepage_settings
   set sections = jsonb_strip_nulls(
        coalesce(sections, '{}'::jsonb)
      || jsonb_build_object('news',
            case
              when (coalesce(sections, '{}'::jsonb) ? 'news') then sections->'news'
              else to_jsonb(true)
            end)
      )
 where id = 1;

-- ─── extended_config.latest_news ───────────────────────────────────────────
-- Deep-merge the `latest_news` object into extended_config, preserving any
-- sibling keys (package_explorer / footer / support / future groups). Defaults
-- are written only when the latest_news key is absent; once present the user's
-- configured values are never overwritten by this migration.
update public.homepage_settings
   set extended_config =
        coalesce(extended_config, '{}'::jsonb)
      || jsonb_build_object('latest_news',
            case
              when (coalesce(extended_config, '{}'::jsonb) ? 'latest_news')
                then extended_config->'latest_news'
              else jsonb_build_object(
                     'title',     'ข่าวสอบราชการล่าสุด',
                     'subtitle',  'ติดตามข่าวเปิดรับสมัคร กำหนดการสอบ และประกาศสำคัญ',
                     'cta_label', 'ดูข่าวทั้งหมด',
                     'limit',     3
                   )
            end)
 where id = 1;

-- Reload the PostgREST schema cache (project convention; no-op for JSONB but
-- keeps migrations uniform with 031–041).
NOTIFY pgrst, 'reload schema';
