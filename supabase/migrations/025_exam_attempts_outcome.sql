-- 025_exam_attempts_outcome.sql
-- Assessment Platform — Epic 2: Outcome Persistence.
--
-- Source of truth: "Assessment Platform Master Specification v1.0"
--   - Part IV §22 (Assessment Attempt): one Attempt → one Outcome, immutable.
--   - Part IV §25 (Assessment Outcome): Outcome is the Source of Truth for
--     every system after Runtime.
--   - Part IV §26 (Assessment Persistence): persist only what has long-term
--     value and is consumed by other systems; never persist temp UI/runtime
--     state. "Store Once. Read Many."
--   - Constitution AI-004: One Attempt produces One Outcome.
--   - Constitution AI-005: Outcome is immutable.
--   - Constitution AI-006: Derived data never becomes authoritative
--     (Analytics/Leaderboard/Recommendation derive FROM Outcomes; they never
--     replace them and must not be persisted as Outcome properties).
--
-- This migration creates the ONE persistence surface for Assessment Outcomes.
-- Design rules enforced here:
--   (1) Stores the Outcome and ONLY the Outcome. No trend/ranking/recommendation
--       columns — those are derived by downstream systems and must never live
--       here (Anti-pattern AP-006: Analytics becoming source of truth).
--   (2) Carries the per-question Answer Summary (jsonb) — the irreducible core
--       from which any future analytical signal can be derived without a schema
--       change. This is the regenerability guarantee.
--   (3) Immutable: there is intentionally NO update path in the application
--       layer. Corrections, if ever needed, are separate amendment rows, never
--       mutations (Constitution AI-005).
--   (4) User-owned via RLS: a user may insert/select only their own attempts;
--       admins can read all (for future admin tooling). No one updates.
--
-- Column naming note: Epic 1 produces AssessmentOutcome objects in the
-- application layer (lib/assessment/types.ts); this table persists them. The
-- server action (app/assessment/actions.ts) maps the application shape to
-- these columns — the storage schema need not mirror the TS interface 1:1.

create table if not exists public.exam_attempts (
    -- Identity (Constitution: provenance; Outcome Layer 1)
    id              uuid primary key default uuid_generate_v4(),
    user_id         uuid not null references auth.users(id) on delete cascade,
    exam_set_id     uuid not null references public.exam_sets(id) on delete cascade,
    package_id      uuid not null references public.packages(id) on delete cascade,
    mode            text not null check (mode in ('practice', 'simulation')),

    -- Overall performance (Outcome Layer 2) — the facts. Stored as captured
    -- at generation; never recomputed by persistence.
    total           int  not null,
    score           int  not null,                 -- correct count
    answered_count  int  not null,                 -- questions answered (any choice)
    incorrect_count int  generated always as (total - score) stored,  -- derived column, always consistent
    accuracy        int  not null check (accuracy between 0 and 100), -- 0-100
    time_used_seconds int not null default 0,

    -- Verdict — driven by data (exam_sets.passing_score), captured at submit.
    passing_score   int  not null,                 -- the bar this attempt was judged against (snapshot)
    passed          boolean not null,

    -- Answer summary (Outcome Layer 3) — the irreducible core. jsonb carries
    -- the per-question record: {questionId, selected, correct, isCorrect,
    -- flagged, subject, law, topic}. This is what lets future Analytics derive
    -- weak-topics / subject-breakdown without a schema change.
    answer_summary  jsonb not null default '[]'::jsonb,

    -- Timestamps
    completed_at    timestamptz not null default now(),  -- Outcome generation moment
    created_at      timestamptz not null default now()
);

-- Integrity notes (kept outside CREATE TABLE for clarity):
--   * One row == one terminal Attempt == one immutable Outcome. We do NOT
--     enforce a unique constraint on (user_id, exam_set_id) because retries
--     are distinct Attempts (each produces its own Outcome). Attempt-limit
--     enforcement (e.g. Simulation's ceiling, Final's strict-one) is a
--     Runtime/Profile concern, not a storage concern — out of scope for Epic 2.
--   * Immutable-by-convention: no updated_at column. The application layer
--     exposes no update path. This is the immutability guarantee made physical.

-- Helpful indexes for the read patterns downstream systems will use:
-- (a) a learner's history, newest first (Analytics "Assessment History" layer)
create index if not exists exam_attempts_user_created_idx
    on public.exam_attempts (user_id, created_at desc);
-- (b) all attempts on an exam set (Leaderboard aggregation, admin)
create index if not exists exam_attempts_exam_set_idx
    on public.exam_attempts (exam_set_id, created_at desc);
-- (c) attempts within a package (package-scoped analytics)
create index if not exists exam_attempts_package_idx
    on public.exam_attempts (package_id, created_at desc);

-- ── Row Level Security ──────────────────────────────────────────────────────
-- The Outcome is user-owned learning history. RLS follows the same pattern as
-- profiles/orders: a user sees only their own attempts; admins see all.
alter table public.exam_attempts enable row level security;

-- Owner can read their own attempts (their learning history).
create policy "Users can view their own exam attempts."
    on public.exam_attempts for select
    to authenticated
    using (auth.uid() = user_id);

-- Owner can INSERT their own attempts (the runtime writes its Outcome here on
-- submit). with_check guarantees a user cannot forge another user's attempt.
create policy "Users can insert their own exam attempts."
    on public.exam_attempts for insert
    to authenticated
    with check (auth.uid() = user_id);

-- NO update policy. NO delete policy for users. Immutability enforced at the
-- database layer: once an Outcome is stored, it cannot be rewritten or erased
-- by the application. (Constitution AI-005.)
--
-- Admin read access (for future admin tooling) is intentionally NOT added in
-- Epic 2 — it is not needed yet and would require referencing the staff-role
-- convention. Out of scope; can be added later without touching this design.

comment on table public.exam_attempts is
    'Assessment Outcome persistence (Epic 2). One row = one terminal Attempt = one immutable Outcome. Analytics, Leaderboard, and Recommendation DERIVE from this table; they never write to it and their outputs are never stored here.';
