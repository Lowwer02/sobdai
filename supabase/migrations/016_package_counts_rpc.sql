-- 016_package_counts_rpc.sql
-- Adds a Postgres function to compute public package question/exam-set
-- counts in a single SQL aggregate, replacing the previous approach of
-- pulling the whole packages -> exam_sets -> exam_set_questions -> questions
-- graph into Node.js and counting in a loop (slow + heavy payload).
--
-- The function is SECURITY DEFINER so it can count Published questions even
-- though the questions table RLS normally restricts reads to authenticated
-- users. It only ever returns counts (never question content), and only for
-- the package IDs the caller supplies, so this is safe to expose publicly.

create or replace function public.get_package_public_counts(package_ids uuid[])
returns table (
  package_id uuid,
  total_questions bigint,
  total_exam_sets bigint,
  exam_set_counts jsonb
)
language sql
security definer
set search_path = public
as $$
  with per_set as (
    -- published question count per exam set
    select
      es.package_id,
      es.id as exam_set_id,
      count(esq.question_id)::bigint as q_count
    from exam_sets es
    join exam_set_questions esq on esq.exam_set_id = es.id
    join questions q on q.id = esq.question_id and q.status = 'Published'
    group by es.package_id, es.id
  ),
  set_json as (
    -- aggregate per-set counts into a {exam_set_id: count} json object per package
    select
      package_id,
      jsonb_object_agg(exam_set_id, q_count) as exam_set_counts,
      sum(q_count)::bigint as total_questions,
      count(*)::bigint as total_exam_sets
    from per_set
    group by package_id
  )
  select
    p.id as package_id,
    coalesce(sj.total_questions, 0)::bigint as total_questions,
    coalesce(sj.total_exam_sets, 0)::bigint as total_exam_sets,
    coalesce(sj.exam_set_counts, '{}'::jsonb) as exam_set_counts
  from packages p
  left join set_json sj on sj.package_id = p.id
  where p.id = any(coalesce(package_ids, '{}'::uuid[]))
$$;

-- The function is SECURITY DEFINER, so caller RLS does not gate it.
-- Grant execute to anon + authenticated so public pages can call it.
grant execute on function public.get_package_public_counts(uuid[]) to anon, authenticated;
