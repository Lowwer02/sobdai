-- 101_assessment_sessions_question_order_version.sql
-- Repeat Exam Question Shuffle V1 — attempt-scoped deterministic ordering.
--
-- Adds ONE column to assessment_sessions: question_order_version.
--
-- Semantics (the versioned session contract for question ordering):
--   0 = legacy/base ordering — the exam is presented in
--       exam_set_questions.sort_order exactly as before this feature existed.
--   1 = repeat shuffle algorithm v1 — the same Exam Set membership, in a
--       deterministic permutation derived from this session's own id
--       (lib/assessment/attempt-order.ts, frozen algorithm).
--
-- Rollout compatibility (CRITICAL):
--   - ADD COLUMN ... NOT NULL DEFAULT 0 stamps every EXISTING row (any
--     in-progress session, first attempt or repeat) with version 0. Those
--     sessions keep their original sort_order presentation forever. They are
--     never retroactively shuffled and never re-evaluated.
--   - The ordering decision is made EXACTLY ONCE, at session creation, by
--     getOrCreateMyAssessmentSession (no prior completed attempt → 0; prior
--     completed attempt of the same exam set → 1). Resume always reads the
--     stored value and never recalculates.
--   - No backfill of old sessions to version 1. Intentional.
--
-- This migration intentionally does NOT touch:
--   - exam_set_questions membership or sort_order (authoritative base order)
--   - exam_attempts / answer_summary (immutable history)
--   - answer choices, scoring, review, bookmarks
--
-- Conventions reused from the codebase (migration 062 style):
--   - drop-if-exists + add for the named CHECK (PostgreSQL has no
--     ADD CONSTRAINT IF NOT EXISTS), keeping the file safe to re-run.
--   - comment on column for the schema documentation surface.
--   - NOTIFY pgrst, 'reload schema' at the end.

-- ════════════════════════════════════════════════════════════════════════
-- 1. Column (metadata-only on Postgres 11+: existing rows get 0)
-- ════════════════════════════════════════════════════════════════════════

alter table public.assessment_sessions
    add column if not exists question_order_version smallint not null default 0;

comment on column public.assessment_sessions.question_order_version is
    'Question ordering contract for this attempt. 0 = base exam_set_questions.sort_order (legacy). 1 = deterministic repeat shuffle v1 seeded by this session id. Decided once at session creation; stored value is authoritative on resume; existing rows remain 0.';

-- ════════════════════════════════════════════════════════════════════════
-- 2. CHECK — closed version enum (a new algorithm must widen this and add
--    a new version value, never repurpose an existing one)
-- ════════════════════════════════════════════════════════════════════════

alter table public.assessment_sessions
    drop constraint if exists assessment_sessions_question_order_version_check;

alter table public.assessment_sessions
    add constraint assessment_sessions_question_order_version_check
        check (question_order_version in (0, 1));

-- ════════════════════════════════════════════════════════════════════════
-- 3. Notify PostgREST to pick up the new column.
-- ════════════════════════════════════════════════════════════════════════

NOTIFY pgrst, 'reload schema';
