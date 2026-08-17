-- 078_kp_public_package_catalog.sql
-- Sobdai — one-roundtrip public package catalog for /packages.
--
-- The public catalog page previously issued two serialized Supabase calls:
--   1. packages list select (is_published = true, order by created_at desc)
--   2. get_package_public_counts(package_ids) RPC (needs the IDs from #1)
-- This function returns the published catalog rows AND the same public
-- counts in a single call, removing the second roundtrip from the page's
-- critical path (PERF-P0C-1).
--
-- ADDITIVE ONLY: get_package_public_counts (migration 016) is left untouched
-- for its existing callers (homepage featured counts, exam runtime).
--
-- Count semantics mirror migration 016 exactly:
--   - only questions with status = 'Published' are counted
--   - total_exam_sets counts exam sets that have at least one published question
--   - packages with no exam sets / no published questions still return with
--     zero counts (left join + coalesce)
--   - ordering follows the page contract: created_at descending
--
-- Security model mirrors migration 016: SECURITY DEFINER so the function can
-- count Published questions even though the questions table RLS restricts
-- reads to authenticated users. It returns only public catalog fields and
-- counts — never question content — and only for published packages.

set local lock_timeout = '5s';

create or replace function public.get_public_package_catalog()
returns table (
  id uuid,
  slug text,
  exam_year text,
  current_price numeric,
  original_price numeric,
  difficulty text,
  description text,
  logo_url text,
  organization_name text,
  organization_logo_url text,
  position_name text,
  total_questions bigint,
  total_exam_sets bigint
)
language sql
security definer
set search_path = public
as $$
  with per_set as (
    -- published question count per exam set (identical scope to migration 016)
    select
      es.package_id,
      count(esq.question_id)::bigint as q_count
    from exam_sets es
    join exam_set_questions esq on esq.exam_set_id = es.id
    join questions q on q.id = esq.question_id and q.status = 'Published'
    group by es.package_id, es.id
  ),
  per_package as (
    select
      package_id,
      sum(q_count)::bigint as total_questions,
      count(*)::bigint as total_exam_sets
    from per_set
    group by package_id
  )
  select
    p.id,
    p.slug,
    p.exam_year,
    p.current_price,
    p.original_price,
    p.difficulty,
    p.description,
    p.logo_url,
    org.name as organization_name,
    org.logo_url as organization_logo_url,
    pos.name as position_name,
    coalesce(pp.total_questions, 0)::bigint as total_questions,
    coalesce(pp.total_exam_sets, 0)::bigint as total_exam_sets
  from packages p
  left join organizations org on org.id = p.organization_id
  left join positions pos on pos.id = p.position_id
  left join per_package pp on pp.package_id = p.id
  where p.is_published = true
  order by p.created_at desc
$$;

grant execute on function public.get_public_package_catalog() to anon, authenticated;

-- Notify PostgREST to pick up the new RPC (prevents the new /packages loader
-- from 404ing until the schema cache reloads after this migration).
NOTIFY pgrst, 'reload schema';
