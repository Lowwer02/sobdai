-- 023_packages_homepage_order.sql
-- Dedicated Homepage ordering for packages.
--
-- Root cause being fixed: the homepage featured query previously used
-- `applyContentOrdering()`, which sorts on `display_order` + `released_at` —
-- columns that exist on `summaries` and `exam_sets` (migration 019) but were
-- NEVER added to `packages`. PostgREST therefore returned HTTP 400
-- ("column does not exist"), the whole query failed, and the homepage fell
-- back to the empty state.
--
-- Long-term fix: give `packages` its OWN homepage ordering column
-- (`homepage_order`) instead of reusing the content-ordering chain. This keeps
-- the homepage ordering model self-contained — packages don't need
-- `display_order`/`released_at`, and the homepage doesn't depend on
-- `applyContentOrdering()`. Summary and Exam navigation keep using that helper
-- unchanged.
--
-- SAFE: adds one column. Touches nothing else.

ALTER TABLE public.packages
  ADD COLUMN IF NOT EXISTS homepage_order integer NOT NULL DEFAULT 0;

COMMENT ON COLUMN public.packages.homepage_order IS
  'Homepage featured ordering. Higher value = shown first on the homepage. Only meaningful when featured_homepage = true. Default 0.';

-- Notify PostgREST to pick up the new column (prevents the same 400 class of
-- bug if a deploy lands before the schema cache reloads).
NOTIFY pgrst, 'reload schema';
