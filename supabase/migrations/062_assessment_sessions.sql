-- 062_assessment_sessions.sql
-- Assessment Platform — Phase 1A: Assessment Session Foundation + Resume.
--
-- Scope: in-progress exam state (answers, flagged, position, time used) so a
-- learner can pause, close the tab, and resume from the exact spot. This is the
-- ONLY persistence surface for live exam progress.
--
-- Relationship to exam_attempts (migration 025): the two tables are siblings,
-- NOT the same concept.
--   - exam_attempts   = a COMPLETED, immutable Outcome (one Attempt → one
--                       Outcome). Write-once. Learning history. (Constitution
--                       AI-004 / AI-005.)
--   - assessment_sessions = a mutable, in-progress Snapshot of one attempt as
--                       it happens. Overwritten as the learner answers. The
--                       single in_progress row per (user, exam_set, mode) is
--                       the "resume point". On submit it is closed (status →
--                       'completed') and points at the persisted Outcome via
--                       outcome_attempt_id; it is never the source of truth for
--                       scoring.
--
-- This migration is deliberately additive: a brand-new table with its own RLS,
-- indexes, and a partial unique index. It does not alter exam_attempts,
-- exam_sets, packages, or any 035–052 (Knowledge Platform) object.
--
-- Conventions reused from the codebase:
--   - handle_updated_at() trigger fn (migration 001) keeps updated_at fresh.
--   - NOTIFY pgrst, 'reload schema' at the end (migrations 020/022/etc.).
--   - RLS pattern mirroring exam_attempts (025): owner-only SELECT/INSERT/
--     UPDATE to authenticated; here UPDATE is allowed (sessions are mutable by
--     design), unlike exam_attempts which has NO update path.
--   - uuid_generate_v4() default for the PK (001/025 style).
--
-- Safe to re-run: every statement is IF NOT EXISTS / OR REPLACE / idempotent.

-- ════════════════════════════════════════════════════════════════════════
-- 1. Table
-- ════════════════════════════════════════════════════════════════════════

create table if not exists public.assessment_sessions (
    -- Identity
    id              uuid primary key default uuid_generate_v4(),
    user_id         uuid not null references auth.users(id) on delete cascade,
    exam_set_id     uuid not null references public.exam_sets(id) on delete cascade,
    package_id      uuid not null references public.packages(id) on delete cascade,
    -- 'practice' | 'simulation' — matches the AssessmentMode domain enum used
    -- by lib/assessment/types.ts and stored on exam_attempts.mode.
    mode            text not null check (mode in ('practice', 'simulation')),

    -- Lifecycle. Phase 1A needs only in_progress → completed. The CHECK is
    -- intentionally a closed enum so a future phase must migrate to widen it.
    status          text not null default 'in_progress'
                        check (status in ('in_progress', 'completed')),

    -- Resume state (the whole point of this table). These four fields are the
    -- Runtime's mutable snapshot; they hydrate the UI on resume.
    current_index       integer not null default 0 check (current_index >= 0),
    answers         jsonb not null default '{}'::jsonb,   -- { questionId: 'A'|'B'|'C'|'D' }
    flagged         jsonb not null default '{}'::jsonb,   -- { questionId: boolean }
    time_used_seconds integer not null default 0 check (time_used_seconds >= 0),

    -- Timestamps. started_at is set once at insert; updated_at is maintained by
    -- the handle_updated_at() trigger (migration 001); completed_at + the
    -- outcome pointer are set when the Runtime closes the session on submit.
    started_at      timestamptz not null default now(),
    updated_at      timestamptz not null default now(),
    completed_at    timestamptz,
    -- Points at the immutable Outcome row once the session is completed. SET
    -- NULL on delete so deleting an attempt never strands a session row, and a
    -- completed session simply loses its pointer (it is still 'completed').
    outcome_attempt_id uuid references public.exam_attempts(id) on delete set null
);

comment on table public.assessment_sessions is
    'Assessment Session — the mutable, in-progress snapshot of one exam attempt (answers, flagged, position, time used). Distinct from exam_attempts, which is the immutable completed Outcome. One active (in_progress) session per (user_id, exam_set_id, mode). Closed on submit and linked to its Outcome via outcome_attempt_id.';

-- ════════════════════════════════════════════════════════════════════════
-- 2. updated_at trigger (reuse the codebase's shared fn from migration 001)
-- ════════════════════════════════════════════════════════════════════════
drop trigger if exists handle_updated_at_assessment_sessions on public.assessment_sessions;
create trigger handle_updated_at_assessment_sessions
    before update on public.assessment_sessions
    for each row execute procedure public.handle_updated_at();

-- ════════════════════════════════════════════════════════════════════════
-- 3. Indexes
-- ════════════════════════════════════════════════════════════════════════

-- (a) Partial UNIQUE index: at most ONE in_progress session per
--     (user_id, exam_set_id, mode). This is the concurrency guarantee — two
--     simultaneous getOrCreate calls cannot create two active sessions; the
--     second INSERT raises a unique violation and the action re-SELECTs the
--     existing row. Completed sessions are excluded from uniqueness, so a
--     learner may start a fresh session after finishing one.
--     The `where status = 'in_progress'` predicate also makes this index serve
--     the "find my active session for this exam/mode" lookup directly.
create unique index if not exists assessment_sessions_active_unique_idx
    on public.assessment_sessions (user_id, exam_set_id, mode)
    where status = 'in_progress';

-- (b) A learner's sessions, most recently touched first — for any future
--     "resume where you left off" listing across many exam sets.
create index if not exists assessment_sessions_user_updated_idx
    on public.assessment_sessions (user_id, updated_at desc);

-- ════════════════════════════════════════════════════════════════════════
-- 4. Row Level Security
-- ════════════════════════════════════════════════════════════════════════
-- A session is private progress. Only the owner may read, create, or update
-- their own rows. There is intentionally NO delete policy in Phase 1A —
-- learners do not erase their own sessions from the UI.
--
-- Note the difference from exam_attempts (025): here UPDATE is permitted
-- (sessions are the mutable snapshot by design), whereas exam_attempts is
-- immutable. Both share the same owner-only SELECT/INSERT discipline and
-- the auth.uid() = user_id guarantee (with user_id always resolved server-side
-- from the session, never trusted from the client).
alter table public.assessment_sessions enable row level security;

-- Owner can read their own sessions (to resume).
create policy "Users can view their own assessment sessions."
    on public.assessment_sessions for select
    to authenticated
    using (auth.uid() = user_id);

-- Owner can INSERT their own sessions. with_check guarantees a user cannot
-- forge a session under another user_id.
create policy "Users can insert their own assessment sessions."
    on public.assessment_sessions for insert
    to authenticated
    with check (auth.uid() = user_id);

-- Owner can UPDATE their own sessions (autosave + completion). using() guards
-- the targeted row; with_check() guarantees the update cannot reassign the row
-- to another user_id.
create policy "Users can update their own assessment sessions."
    on public.assessment_sessions for update
    to authenticated
    using (auth.uid() = user_id)
    with check (auth.uid() = user_id);

-- NO delete policy for authenticated. Sessions are not user-deletable in
-- Phase 1A.

-- ════════════════════════════════════════════════════════════════════════
-- 5. Notify PostgREST to pick up the new table + policies.
-- ════════════════════════════════════════════════════════════════════════
NOTIFY pgrst, 'reload schema';
