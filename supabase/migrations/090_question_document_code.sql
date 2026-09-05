-- 090_question_document_code.sql
--
-- Document Code Intake V1: stable machine identity for a Question's source
-- document, authored as **DocumentCode:** in Question Markdown (Content
-- Template v2.1 Part 3) and persisted by the Admin Markdown importer
-- (app/admin/import).
--
-- Semantics:
--   - document_code is the stable machine identity of the source document
--     (e.g. DOC-ACT-STATE-ADMIN-2534). `questions.document` remains the
--     human-readable display text. The two are separate identities; neither
--     derives or substitutes for the other.
--   - Nullable BY DESIGN: legacy KSB / pre-V1 questions keep NULL and remain
--     valid. No backfill, no NOT NULL, no FK, no alias table, no Document
--     Registry table — those belong to Document Identity V2.
--   - Format validation lives at the intake layer (markdown parser + import
--     action), not in the DB.
--
-- Additive ONLY. No destructive change. No trigger. Safe to re-run.
-- Reversible via: ALTER TABLE public.questions DROP COLUMN IF EXISTS document_code;

set local lock_timeout = '5s';

ALTER TABLE public.questions
  ADD COLUMN IF NOT EXISTS document_code text;

COMMENT ON COLUMN public.questions.document_code IS
  'Stable machine identity of the question''s source document (e.g. DOC-ACT-STATE-ADMIN-2534), authored as **DocumentCode:** and persisted verbatim by the importer. NULL for legacy questions. Human-readable display text stays in questions.document.';
