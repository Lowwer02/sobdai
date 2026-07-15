-- 022_question_metadata_rpc.sql
-- Single read-only RPC that returns the DISTINCT, non-null filter metadata
-- for the Admin Question Picker: subjects, documents, topics, laws.
--
-- Why: the previous fetchUniqueFilters() read the entire `questions` table
-- (subject, law, topic, document) and deduped in JS. Supabase's PostgREST
-- caps every response at the default 1000 rows, so on a Bank larger than
-- 1000 rows the distinct set was silently truncated — e.g. a Document on
-- a question beyond row 1000 never appeared in the Document filter
-- dropdown, even though it existed in the DB.
--
-- Fix: compute DISTINCT in Postgres (one round-trip, no row cap on the
-- distinct set since it's tiny relative to the table). Sorted alphabetically
-- so the dropdowns render in a stable order without client sorting.
--
-- Mirrors the architectural style of get_package_public_counts (migration
-- 016) and get_question_usage_counts (migration 021):
--   - SECURITY DEFINER + set search_path = public
--   - read-only, returns no question content
--   - granted to authenticated only (admin-only metadata, not public)
--
-- No schema changes, no new tables, no duplicated metadata.

create or replace function public.get_question_metadata()
returns table (
  subjects text[],
  documents text[],
  topics text[],
  laws text[]
)
language sql
security definer
set search_path = public
as $$
  with base as (
    -- DISTINCT non-null values. coalesce guards the empty-table case
    -- (array_agg over zero rows → NULL → normalized to '{}').
    select
      coalesce(array_agg(distinct subject)   filter (where subject   is not null), '{}'::text[]) as subjects,
      coalesce(array_agg(distinct document)  filter (where document  is not null), '{}'::text[]) as documents,
      coalesce(array_agg(distinct topic)     filter (where topic     is not null), '{}'::text[]) as topics,
      coalesce(array_agg(distinct law)       filter (where law       is not null), '{}'::text[]) as laws
    from questions
  )
  -- Sort each distinct array alphabetically for stable dropdown ordering.
  select
    (select array_agg(x order by x) from unnest(base.subjects)  as t(x)) as subjects,
    (select array_agg(x order by x) from unnest(base.documents) as t(x)) as documents,
    (select array_agg(x order by x) from unnest(base.topics)    as t(x)) as topics,
    (select array_agg(x order by x) from unnest(base.laws)      as t(x)) as laws
  from base
$$;

-- Read-only metadata for the Admin Question Picker. Admin-only → authenticated.
grant execute on function public.get_question_metadata() to authenticated;
