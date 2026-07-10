-- 019_display_order.sql
-- Smart Content Ordering for Summaries + Exam Sets.
--
-- Adds a `display_order` column (higher = shown first) to both tables so
-- admins can pin/promote content, plus a nullable `released_at` timestamp
-- used as the secondary tiebreaker in the ordering chain:
--
--   1. display_order DESC
--   2. released_at DESC   (falls back to created_at when NULL — see backfill)
--   3. updated_at DESC
--   4. created_at DESC
--
-- SAFE: only adds columns (IF NOT EXISTS). Does not touch any existing column,
-- constraint, RLS policy, trigger, or index. Existing `sort_order` is left
-- untouched.

-- ─── summaries ──────────────────────────────────────────────────────────────
ALTER TABLE public.summaries
  ADD COLUMN IF NOT EXISTS display_order integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS released_at timestamp with time zone DEFAULT NULL;

COMMENT ON COLUMN public.summaries.display_order IS 'Higher value = shown first. Used as the primary sort key in navigation. Default 0.';
COMMENT ON COLUMN public.summaries.released_at IS 'Optional publish/release timestamp used as secondary sort tiebreaker. NULL falls back to created_at.';

-- ─── exam_sets ──────────────────────────────────────────────────────────────
ALTER TABLE public.exam_sets
  ADD COLUMN IF NOT EXISTS display_order integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS released_at timestamp with time zone DEFAULT NULL;

COMMENT ON COLUMN public.exam_sets.display_order IS 'Higher value = shown first. Used as the primary sort key in navigation. Default 0.';
COMMENT ON COLUMN public.exam_sets.released_at IS 'Optional publish/release timestamp used as secondary sort tiebreaker. NULL falls back to created_at.';

-- ─── backfill released_at from created_at ──────────────────────────────────
-- So the ordering tiebreaker works for ALL existing rows immediately (no row
-- has a NULL released_at after this runs), backfill from created_at. New rows
-- can still leave it NULL — the app ordering coalesces NULL → created_at.
UPDATE public.summaries SET released_at = created_at WHERE released_at IS NULL;
UPDATE public.exam_sets  SET released_at = created_at WHERE released_at IS NULL;

-- Notify PostgREST to pick up the new columns.
NOTIFY pgrst, 'reload schema';
