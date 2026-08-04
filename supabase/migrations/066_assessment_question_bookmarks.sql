-- 066_assessment_question_bookmarks.sql
-- Assessment Platform — Phase 1F: Saved Questions (question bookmarks).
--
-- Scope: lets a learner bookmark a single question from a completed-attempt
-- review page, then see the newest bookmarks on the /exams dashboard.
--
-- Relationship to existing tables:
--   - questions     the bookmarked question (one row).
--   - exam_sets     the exam set the question belongs to (context).
--   - packages      the package the exam set / attempt belonged to (access).
--   - exam_attempts the completed attempt the bookmark was made from (optional
--                   provenance; nullable so deleting the attempt keeps the
--                   bookmark, just without the "back to review" link).
--
-- This migration is deliberately additive: a brand-new table with its own RLS,
-- indexes, and a unique constraint. It does not alter questions, exam_attempts,
-- exam_sets, packages, assessment_sessions, or any Knowledge Platform (035–052)
-- or News/Article (031–065) object.
--
-- Conventions reused from the codebase:
--   - handle_updated_at() trigger fn (migration 001) keeps updated_at fresh.
--   - NOTIFY pgrst, 'reload schema' at the end (migrations 020/022/062/etc.).
--   - RLS pattern mirroring assessment_sessions (062): owner-only
--     SELECT/INSERT/DELETE to authenticated. Unlike the mutable session table,
--     there is NO update policy — a bookmark is a point-in-time pointer and is
--     never edited; it is only created or removed.
--   - uuid_generate_v4() default for the PK (001/025/062 style).
--
-- Safe to re-run: every statement is IF NOT EXISTS / OR REPLACE / idempotent.

-- ════════════════════════════════════════════════════════════════════════
-- 1. Table
-- ════════════════════════════════════════════════════════════════════════

create table if not exists public.assessment_question_bookmarks (
    -- Identity
    id              uuid primary key default uuid_generate_v4(),

    -- Owner. Resolved from the session server-side by the actions; never
    -- trusted from the client. CASCADE so deleting the user removes their
    -- bookmarks.
    user_id         uuid not null references auth.users(id) on delete cascade,

    -- The bookmarked question. CASCADE so a hard-deleted question removes the
    -- bookmark automatically (the review page already renders a fallback card
    -- for soft-removed content, so no stranded pointers).
    question_id     uuid not null references public.questions(id) on delete cascade,

    -- Context: which exam set the learner saw the question in. CASCADE so
    -- deleting the exam set drops its bookmarks. Part of the uniqueness key
    -- (see below) because the same question can appear in multiple exam sets
    -- and a learner may want one bookmark per (exam_set) context.
    exam_set_id     uuid not null references public.exam_sets(id) on delete cascade,

    -- Access context: which package this bookmark belongs to. CASCADE so
    -- deleting the package drops its bookmarks. Scoped to currently-owned
    -- packages on read so a learner only sees bookmarks they can still access.
    package_id      uuid not null references public.packages(id) on delete cascade,

    -- Optional provenance: the completed attempt the bookmark was made from.
    -- SET NULL on delete so deleting the attempt keeps the bookmark (it simply
    -- loses its "back to review" link and falls back to a package/exam-set
    -- link on the dashboard). Never CASCADE — the bookmark outlives the
    -- attempt that produced it.
    source_attempt_id uuid references public.exam_attempts(id) on delete set null,

    -- Timestamps. created_at is set once at insert and never changed (a
    -- bookmark is a point-in-time pointer). updated_at is maintained by the
    -- handle_updated_at() trigger for future parity even though no UPDATE
    -- policy exists today.
    created_at      timestamptz not null default now(),
    updated_at      timestamptz not null default now()
);

comment on table public.assessment_question_bookmarks is
    'Saved Questions — a learner bookmark on a single question, scoped to one (exam_set) context within an owned package. Created from the completed-attempt review page. source_attempt_id is optional provenance (SET NULL when the attempt is deleted). One bookmark per (user_id, question_id, exam_set_id).';

-- ════════════════════════════════════════════════════════════════════════
-- 2. updated_at trigger (reuse the codebase's shared fn from migration 001)
-- ════════════════════════════════════════════════════════════════════════
drop trigger if exists handle_updated_at_assessment_question_bookmarks on public.assessment_question_bookmarks;
create trigger handle_updated_at_assessment_question_bookmarks
    before update on public.assessment_question_bookmarks
    for each row execute procedure public.handle_updated_at();

-- ════════════════════════════════════════════════════════════════════════
-- 3. Uniqueness + Indexes
-- ════════════════════════════════════════════════════════════════════════

-- (a) UNIQUE index: at most ONE bookmark per (user_id, question_id, exam_set_id).
--     This is the idempotency guarantee — a second "save" for the same
--     question/exam-set is a no-op (the action inserts ON CONFLICT DO NOTHING
--     and reports success). exam_set_id is part of the key because the same
--     question can legitimately be bookmarked once per exam-set context.
--     The index also serves the per-(user, question, exam-set) lookup used to
--     hydrate bookmark state on the review page.
create unique index if not exists assessment_question_bookmarks_unique_idx
    on public.assessment_question_bookmarks (user_id, question_id, exam_set_id);

-- (b) A learner's bookmarks, newest first — for the /exams dashboard "newest 6".
--     ordered by created_at desc with id as a stable tiebreak so the ordering
--     never flickers when two bookmarks share a timestamp.
create index if not exists assessment_question_bookmarks_user_created_idx
    on public.assessment_question_bookmarks (user_id, created_at desc, id);

-- (c) Per-(user, exam_set) lookup — used by the review page to fetch bookmark
--     state for all displayed questions in ONE bounded query.
create index if not exists assessment_question_bookmarks_user_examset_idx
    on public.assessment_question_bookmarks (user_id, exam_set_id);

-- ════════════════════════════════════════════════════════════════════════
-- 4. Row Level Security
-- ════════════════════════════════════════════════════════════════════════
-- A bookmark is private learner data. Only the owner may read, create, or
-- delete their own rows. There is intentionally NO update policy — a bookmark
-- is a point-in-time pointer and is never edited (mirrors the immutability
-- discipline of the Outcome; creation and removal are the only operations).
--
-- The owner-only pattern mirrors assessment_sessions (062) and exam_attempts
-- (025): auth.uid() = user_id on every policy, with user_id always resolved
-- server-side from the session by the actions, never trusted from the client.
alter table public.assessment_question_bookmarks enable row level security;

-- Owner can read their own bookmarks (dashboard + review-page state).
create policy "Users can view their own question bookmarks."
    on public.assessment_question_bookmarks for select
    to authenticated
    using (auth.uid() = user_id);

-- Owner can INSERT their own bookmarks. with_check guarantees a user cannot
-- forge a bookmark under another user_id.
create policy "Users can insert their own question bookmarks."
    on public.assessment_question_bookmarks for insert
    to authenticated
    with check (auth.uid() = user_id);

-- Owner can DELETE their own bookmarks (remove bookmark from review page).
-- using() guards the targeted row so a user can never delete another user's
-- bookmark. There is no with_check() on DELETE (no new row is produced).
create policy "Users can delete their own question bookmarks."
    on public.assessment_question_bookmarks for delete
    to authenticated
    using (auth.uid() = user_id);

-- NO update policy for authenticated. Bookmarks are never edited.

-- ════════════════════════════════════════════════════════════════════════
-- 5. Notify PostgREST to pick up the new table + policies.
-- ════════════════════════════════════════════════════════════════════════
NOTIFY pgrst, 'reload schema';
