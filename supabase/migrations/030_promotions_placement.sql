-- 030_promotions_placement.sql
-- Adds a `placement` slot column to promotions so the Homepage can render only
-- promotions assigned to it, while leaving room for future placements
-- (sidebar, hero, post-purchase, etc.) WITHOUT a later migration.
--
-- Design decisions:
--   * No CHECK constraint on allowed values -> adding a new placement is a
--     pure data/config concern, not a schema change. (Per spec: keep extensible.)
--   * Existing rows backfill to 'homepage' (the only placement that exists today).
--   * Partial index matches the exact Homepage query predicate so the read is cheap.

-- 1. placement column — default 'homepage' keeps existing rows valid.
ALTER TABLE public.promotions
  ADD COLUMN IF NOT EXISTS placement text NOT NULL DEFAULT 'homepage';

COMMENT ON COLUMN public.promotions.placement IS
  'Placement slot (e.g. homepage). Default homepage. No CHECK constraint on purpose: new placements are a data concern, not a schema change.';

-- 2. Partial index that mirrors the Homepage query predicate exactly:
--      placement = 'homepage' AND status = 'published' AND active = true
--    Ordered by the Homepage ordering chain so the planner can serve it
--    index-only. Rows outside this window (drafts, inactive, other slots)
--    are excluded from the index entirely.
CREATE INDEX IF NOT EXISTS promotions_homepage_live_idx
  ON public.promotions (priority DESC, display_order ASC, created_at DESC)
  WHERE placement = 'homepage' AND status = 'published' AND active = true;

-- 3. Public SELECT RLS policy for LIVE homepage promotions.
--    The existing admin policy (migration 022, "Content managers can manage
--    promotions.", FOR ALL) is untouched — PostgREST ORs multiple matching
--    policies, so admins retain full access and anon/authenticated gain
--    read-only access to live rows only.
--
--    This enforces visibility AT THE DATABASE: even a buggy/privileged app
--    query using the anon client cannot read drafts, inactive, expired, or
--    non-homeplace promotions. The Homepage fetcher keeps the same filters
--    in its query as defense-in-depth (the index also relies on them), but
--    the RLS layer is the authoritative gate.
--
--    `now()` is the SQL function here (native inside RLS), so the window is
--    evaluated server-side per-request — no client timestamp interpolation,
--    no drift. NULL start_at/end_at mean "unbounded on that side".
DROP POLICY IF EXISTS "Public can read live homepage promotions." ON public.promotions;
CREATE POLICY "Public can read live homepage promotions."
  ON public.promotions FOR SELECT
  USING (
        placement = 'homepage'
    AND status   = 'published'
    AND active   = true
    AND (start_at IS NULL OR start_at <= now())
    AND (end_at   IS NULL OR end_at   >= now())
  );

