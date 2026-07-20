-- 027_question_ig2_axes.sql
-- IG-2 Closure: persist the four Blueprint v3.0 filter axes on `questions`.
--
-- Source of truth (FROZEN):
--   - IG-2 Architecture Amendment v1.0 (Session 6.19.1) §8.1, §8.3
--   - Content Template v2.2 Delta Amendment (Session 6.19.2) §2
--   - Blueprint v3.0 (Question Pattern Layer, Coverage Rules, LO Mapping)
--   - Implementation Planning v1.0 §4.2 / §4.3 (IG-2 closure)
--
-- Adds four NULLABLE columns to public.questions:
--   blueprint_type      enum CHECK  Memory | Concept | Procedure | Scenario
--   learning_objective  enum CHECK  LO1 | LO2 | LO3 | LO4
--   question_pattern    enum CHECK  Positive | Negative | Best Answer |
--                                   Scenario | Sequence | Matching Concept
--   section             free text  legal-section reference, e.g. ม.6–8
--
-- All four are nullable. Existing rows have NULL → Engine treats as Incomplete
-- Metadata → reduced Confidence per Scoring Model v1.0 §11 (by design, not a
-- defect). No blocking backfill is required for v1.0.
--
-- Style mirrors migration 002 (additive nullable columns) and migration 026
-- (CHECK-constrained enum columns with IF NOT EXISTS guards). Fully reversible
-- via DROP COLUMN — every column is nullable and no other object depends on it.
--
-- Additive ONLY. No destructive change. No FK. No trigger. Safe to re-run.

-- ═══════════════════════════════════════════════════════════════════════════
-- 1. Additive columns
-- ═══════════════════════════════════════════════════════════════════════════

ALTER TABLE public.questions
  ADD COLUMN IF NOT EXISTS blueprint_type     text,
  ADD COLUMN IF NOT EXISTS learning_objective text,
  ADD COLUMN IF NOT EXISTS question_pattern   text,
  ADD COLUMN IF NOT EXISTS section            text;

-- ═══════════════════════════════════════════════════════════════════════════
-- 2. CHECK constraints — pin enum vocabulary to Blueprint v3.0
-- ═══════════════════════════════════════════════════════════════════════════
-- The four axes carry Blueprint v3.0's authoritative vocabulary (IG-2
-- Amendment §2.2, Appendix A). The CHECK constraints enforce it at the DB so
-- a typo at any layer (importer, future admin screen, manual SQL) is rejected
-- rather than silently corrupting distribution / coverage / similarity rules.
--
-- NULL is permitted (existing rows + Incomplete Metadata path). CHECK
-- constraints in Postgres pass on NULL by design — only non-NULL values are
-- validated against the enum.
--
-- question_pattern's sixth value is the two-word `Matching Concept`, matching
-- Blueprint v3.0 lines 190/201/213 (NOT `Matching` — that was the Integration
-- Spec §5.4 typo corrected by IG-2 Amendment D-6).

ALTER TABLE public.questions
  DROP CONSTRAINT IF EXISTS questions_blueprint_type_check;
ALTER TABLE public.questions
  ADD CONSTRAINT questions_blueprint_type_check
    CHECK (blueprint_type IS NULL OR blueprint_type IN
      ('Memory', 'Concept', 'Procedure', 'Scenario'));

ALTER TABLE public.questions
  DROP CONSTRAINT IF EXISTS questions_learning_objective_check;
ALTER TABLE public.questions
  ADD CONSTRAINT questions_learning_objective_check
    CHECK (learning_objective IS NULL OR learning_objective IN
      ('LO1', 'LO2', 'LO3', 'LO4'));

ALTER TABLE public.questions
  DROP CONSTRAINT IF EXISTS questions_question_pattern_check;
ALTER TABLE public.questions
  ADD CONSTRAINT questions_question_pattern_check
    CHECK (question_pattern IS NULL OR question_pattern IN
      ('Positive', 'Negative', 'Best Answer', 'Scenario',
       'Sequence', 'Matching Concept'));

-- No CHECK on `section`: it is free-text (hundreds of legal provisions; an
-- enum would couple the schema to the statute book). Light normalization
-- (trim, unicode NFC, en-dash U+2013 for ranges) happens in the importer
-- before insert; the DB stores the canonical form.

-- ═══════════════════════════════════════════════════════════════════════════
-- 3. Indexes — partial, NULL-filtering
-- ═══════════════════════════════════════════════════════════════════════════
-- Partial indexes (WHERE col IS NOT NULL) keep the index compact while Bank
-- is in the mixed v2.1/v2.2 state (most rows NULL during the multi-month
-- backfill window). The Candidate Generator's filters (Candidate Generation
-- §3, fixed order) hit these columns; without indexes, filter selectivity
-- drops to full scans on a 100k+ Bank.

CREATE INDEX IF NOT EXISTS questions_blueprint_type_idx
  ON public.questions (blueprint_type)
  WHERE blueprint_type IS NOT NULL;

CREATE INDEX IF NOT EXISTS questions_learning_objective_idx
  ON public.questions (learning_objective)
  WHERE learning_objective IS NOT NULL;

CREATE INDEX IF NOT EXISTS questions_question_pattern_idx
  ON public.questions (question_pattern)
  WHERE question_pattern IS NOT NULL;

CREATE INDEX IF NOT EXISTS questions_section_idx
  ON public.questions (section)
  WHERE section IS NOT NULL;

-- ═══════════════════════════════════════════════════════════════════════════
-- 4. Reversibility
-- ═══════════════════════════════════════════════════════════════════════════
-- Down migration (apply manually if rollback is ever required):
--
--   DROP INDEX IF EXISTS public.questions_section_idx;
--   DROP INDEX IF EXISTS public.questions_question_pattern_idx;
--   DROP INDEX IF EXISTS public.questions_learning_objective_idx;
--   DROP INDEX IF EXISTS public.questions_blueprint_type_idx;
--   ALTER TABLE public.questions DROP CONSTRAINT IF EXISTS questions_question_pattern_check;
--   ALTER TABLE public.questions DROP CONSTRAINT IF EXISTS questions_learning_objective_check;
--   ALTER TABLE public.questions DROP CONSTRAINT IF EXISTS questions_blueprint_type_check;
--   ALTER TABLE public.questions
--     DROP COLUMN IF EXISTS section,
--     DROP COLUMN IF EXISTS question_pattern,
--     DROP COLUMN IF EXISTS learning_objective,
--     DROP COLUMN IF EXISTS blueprint_type;
--
-- All columns are nullable; no other object depends on them. Rollback is safe
-- per Implementation Planning §7.3.
