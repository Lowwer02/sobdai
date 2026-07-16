-- 024_exam_sets_passing_score.sql
-- Adds an explicit passing_score to exam_sets.
--
-- Why: the Assessment Runtime previously used hard-coded 60/80 accuracy
-- thresholds for pass/fail banding because there was no per-exam-set
-- passing score in the schema (the field existed only in the stale
-- lib/types.ts, never in the DB). Epic 1 (Assessment Runtime) centralizes
-- verdict computation into the Outcome boundary (lib/assessment/outcome.ts),
-- which reads the passing score from data rather than a magic number —
-- per the approved product decision (Q2: "Use examSet.passing_score. Remove
-- hard-coded thresholds. This is considered a bug fix").
--
-- Additive + safe:
--   - nullable NOT NULL with default 60, so existing rows adopt exactly the
--     previous hard-coded pass mark (accuracy >= 60 = green). Zero behavior
--     change for existing exam sets.
--   - No type changes, no FK, no RLS policy change, no backfill needed.
--
-- Pass mark is stored as an integer percentage (0-100) of accuracy required
-- to "pass" — matching how the Outcome computes accuracy (score/total*100).
--
-- Scope note: this is the ONLY schema touch in Epic 1 (Assessment Runtime).
-- Epic 1 owns the Runtime; Outcome persistence is Epic 2. This column is
-- content metadata owned by the exam set, not attempt/outcome data.

ALTER TABLE public.exam_sets
  ADD COLUMN IF NOT EXISTS passing_score int NOT NULL DEFAULT 60;

COMMENT ON COLUMN public.exam_sets.passing_score IS
  'Minimum accuracy %% (0-100) required to pass this exam set. Drives the Outcome verdict. Default 60 preserves prior hard-coded behavior.';
