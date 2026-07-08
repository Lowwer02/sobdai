-- 019_document_metadata.sql
-- Adds the "Document" free-text metadata column to questions and summaries.
--
-- This is the first additive step of the Content Architecture (Document
-- Foundation). It introduces a place to store the official document name
-- (e.g. "พระราชบัญญัติการอุดมศึกษา พ.ศ.2562") so admins can filter the
-- Question Picker at document granularity without scanning content.
--
-- Constraints honored:
--  - Pure additive: no FK, no NOT NULL, no normalization, no documents table.
--  - Backward compatible: existing rows get NULL; old markdown still imports.
--  - No existing data touched; no package_slug removed.

ALTER TABLE public.questions
  ADD COLUMN IF NOT EXISTS document text;

ALTER TABLE public.summaries
  ADD COLUMN IF NOT EXISTS document text;

COMMENT ON COLUMN public.questions.document IS 'Official document name the question belongs to (e.g. พระราชบัญญัติการอุดมศึกษา พ.ศ.2562). Free text for now; normalized documents table planned for a later phase.';
COMMENT ON COLUMN public.summaries.document IS 'Official document name the summary covers (1:1). Free text for now; normalized documents table planned for a later phase.';
