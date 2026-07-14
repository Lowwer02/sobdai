-- 021_question_usage_counts_rpc.sql
-- Adds a Postgres function to compute per-Question usage counts derived
-- entirely from the existing exam_set_questions join table.
--
-- "Usage" = the number of Exam Sets that contain a given Question. It is
-- always computed live from exam_set_questions (the single source of truth)
-- and is NEVER stored/duplicated on the questions row — so it can never drift
-- out of sync as Exam Sets are created/edited.
--
-- Mirrors the architectural style of get_package_public_counts (migration 016):
--   - SECURITY DEFINER so it can read across the join regardless of caller RLS
--   - returns only counts, never question content
--   - left-joins the parent table so every requested id yields a row
--     (count 0 when the Question is unused)
--
-- Difference from 016: that RPC is granted to anon + authenticated because
-- package counts are shown on public pages. Question usage is internal
-- admin metadata, so this RPC is granted to authenticated ONLY.
--
-- This is the read foundation for future features (Usage Badge, Used In,
-- Delete Guard, Analytics) without requiring redesign.

create or replace function public.get_question_usage_counts(question_ids uuid[])
returns table (
  question_id uuid,
  usage_count bigint,
  is_used boolean
)
language sql
security definer
set search_path = public
as $$
  with usage as (
    -- count of exam sets referencing each requested question
    select
      esq.question_id,
      count(*)::bigint as cnt
    from exam_set_questions esq
    where esq.question_id = any(coalesce(question_ids, '{}'::uuid[]))
    group by esq.question_id
  )
  select
    q.id as question_id,
    coalesce(u.cnt, 0)::bigint as usage_count,
    (coalesce(u.cnt, 0) > 0) as is_used
  from questions q
  left join usage u on u.question_id = q.id
  where q.id = any(coalesce(question_ids, '{}'::uuid[]))
$$;

-- The function is SECURITY DEFINER, so caller RLS does not gate it.
-- Grant execute to authenticated only — Question usage is admin-only metadata.
grant execute on function public.get_question_usage_counts(uuid[]) to authenticated;
