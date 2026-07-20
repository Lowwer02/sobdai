-- 028_question_metadata_rpc_ig2.sql
-- IG-2 Closure: extend get_question_metadata() to surface the four IG-2 axes
-- (blueprint_type, learning_objective, question_pattern, section) for the
-- admin Question Picker dropdowns and future Engine-facing metadata queries.
--
-- Source of truth:
--   - IG-2 Architecture Amendment v1.0 §6.1 (RPC extension item)
--   - Implementation Planning v1.0 §4.3 step 3
--   - Migration 022 (original get_question_metadata RPC — style mirror)
--
-- The original RPC (migration 022) returns subjects/documents/topics/laws.
-- This migration REPLACES the function with a version that ALSO returns
-- blueprint_types/learning_objectives/question_patterns/sections, computed
-- with the same DISTINCT non-null + sorted pattern. Existing callers see
-- additive columns only — backward compatible.
--
-- The new return columns are nullable arrays (NULL → '{}' normalization),
-- matching migration 022's empty-Bank guard. The granted role (authenticated)
-- is unchanged.
--
-- ═══════════════════════════════════════════════════════════════════════════
-- WHY DROP + CREATE (not CREATE OR REPLACE)
-- ═══════════════════════════════════════════════════════════════════════════
-- PostgreSQL forbids CREATE OR REPLACE FUNCTION from changing the OUT
-- parameter list (equivalently, the RETURNS TABLE column list). The check is
-- a byte-level comparison of the parameter identity: any change to the number,
-- names, order, or types of OUT columns is rejected with SQLSTATE 42P13:
--
--   ERROR: cannot change return type of existing function
--   Row type defined by OUT parameters is different.
--   HINT: Use DROP FUNCTION get_question_metadata() first.
--
-- The reason is that Postgres persists the function's composite return type
-- as a row type in the catalog (pg_type/pg_attribute). CREATE OR REPLACE only
-- permits swapping the function BODY, not the type contract — the body is
-- mutable, the row type is identity. This is by design: changing a function's
-- OUT shape silently could break every view, other function, or prepared
-- statement that selected from it.
--
-- Since 028 adds 4 OUT columns (blueprint_types, learning_objectives,
-- question_patterns, sections) to the existing 4 (subjects, documents, topics,
-- laws), CREATE OR REPLACE is structurally impossible. The correct sequence
-- is DROP FUNCTION IF EXISTS → CREATE FUNCTION → GRANT. The DROP must specify
-- the full signature `get_question_metadata()` (with parentheses, no args) so
-- Postgres identifies the exact function; partial names would be ambiguous.
--
-- This is the same DROP-IF-EXISTS-then-CREATE idiom the project already uses
-- for triggers (migration 026, `protect_question_code`). Idiomatic, not novel.
--
-- Function NAME, ARGUMENTS (none), SECURITY DEFINER, search_path, GRANT, and
-- SQL body are all preserved from the CREATE OR REPLACE draft. Only the
-- migration MECHANISM changed.

-- ═══════════════════════════════════════════════════════════════════════════
-- 1. DROP the existing function (signature-qualified, IF EXISTS for safety)
-- ═══════════════════════════════════════════════════════════════════════════
-- Specifying the full signature `()` is required: DROP FUNCTION uses the
-- argument-type list, not the OUT columns, to identify the function. Since
-- this function takes no arguments, the empty paren list is the signature.
-- IF EXISTS makes the migration re-runnable on a fresh DB where migration 022
-- hasn't been applied yet (defensive; matches the IF-NOT-EXISTS pattern
-- migration 026 uses elsewhere).

DROP FUNCTION IF EXISTS public.get_question_metadata();

-- ═══════════════════════════════════════════════════════════════════════════
-- 2. CREATE the function (full IG-2-aware shape)
-- ═══════════════════════════════════════════════════════════════════════════

CREATE FUNCTION public.get_question_metadata()
RETURNS TABLE (
  subjects text[],
  documents text[],
  topics text[],
  laws text[],
  -- IG-2 axes (migration 027). Surfaced for the admin Question Picker
  -- dropdowns and the Candidate Generator's filter selectivity introspection.
  blueprint_types text[],
  learning_objectives text[],
  question_patterns text[],
  sections text[]
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  with base as (
    -- DISTINCT non-null values per axis. coalesce guards the empty-table /
    -- all-NULL cases (array_agg over zero rows → NULL → normalized to '{}').
    select
      coalesce(array_agg(distinct subject)            filter (where subject            is not null), '{}'::text[]) as subjects,
      coalesce(array_agg(distinct document)           filter (where document           is not null), '{}'::text[]) as documents,
      coalesce(array_agg(distinct topic)              filter (where topic              is not null), '{}'::text[]) as topics,
      coalesce(array_agg(distinct law)                filter (where law                is not null), '{}'::text[]) as laws,
      coalesce(array_agg(distinct blueprint_type)     filter (where blueprint_type     is not null), '{}'::text[]) as blueprint_types,
      coalesce(array_agg(distinct learning_objective) filter (where learning_objective is not null), '{}'::text[]) as learning_objectives,
      coalesce(array_agg(distinct question_pattern)   filter (where question_pattern   is not null), '{}'::text[]) as question_patterns,
      coalesce(array_agg(distinct section)            filter (where section            is not null), '{}'::text[]) as sections
    from questions
  )
  -- Sort each distinct array for stable dropdown ordering (mirrors
  -- migration 022). Sections sort lexicographically; the Engine's section
  -- comparison logic (L2, Similarity Metric) operates on the canonical
  -- persisted form, not this sorted order, so sort order here is purely
  -- a UI affordance.
  select
    (select array_agg(x order by x) from unnest(base.subjects)            as t(x)) as subjects,
    (select array_agg(x order by x) from unnest(base.documents)           as t(x)) as documents,
    (select array_agg(x order by x) from unnest(base.topics)              as t(x)) as topics,
    (select array_agg(x order by x) from unnest(base.laws)                as t(x)) as laws,
    (select array_agg(x order by x) from unnest(base.blueprint_types)     as t(x)) as blueprint_types,
    (select array_agg(x order by x) from unnest(base.learning_objectives) as t(x)) as learning_objectives,
    (select array_agg(x order by x) from unnest(base.question_patterns)   as t(x)) as question_patterns,
    (select array_agg(x order by x) from unnest(base.sections)            as t(x)) as sections
  from base
$$;

-- ═══════════════════════════════════════════════════════════════════════════
-- 3. GRANT — re-established explicitly (DROP FUNCTION revokes all grants)
-- ═══════════════════════════════════════════════════════════════════════════
-- IMPORTANT: DROP FUNCTION removes ALL privileges on the function, not just
-- ours. CREATE FUNCTION does not restore them. The explicit GRANT below is
-- therefore MANDATORY (not defensive) after a DROP+CREATE — omitting it
-- would silently break every authenticated caller (the two RPC callers in
-- app/admin/questions/page.tsx and app/admin/exam-sets/questions.action.ts).
-- Matches migration 022's grant style: admin-only metadata, authenticated role.

GRANT EXECUTE ON FUNCTION public.get_question_metadata() TO authenticated;
