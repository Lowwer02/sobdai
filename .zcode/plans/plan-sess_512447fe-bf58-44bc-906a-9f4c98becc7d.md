# Exam Set Foundation — Final Plan (two final adjustments applied)

All prior decisions stand. Two final additions:

**A. Centralize the code format.** The `'Q-' || lpad(...)` formatting lives in exactly **one** place: a new `format_question_code(seq_value bigint) RETURNS text` Postgres function. `allocate_question_codes(n)` calls it. No other SQL or TS code reconstructs the code string — the importer receives already-formatted codes from the RPC and passes them straight through into the insert payload. If the format ever changes (prefix, padding, length), only `format_question_code()` is touched. (No TS-side constant — it would be dead code since TS never builds or parses the string.)

**B. `allocate_question_codes()` is allocation-only.** Its docblock states explicitly: identifier-allocation function only; never inserts Question rows, never reads/writes any business column, never validates content — its sole effect is advancing the sequence and returning formatted codes. Merging into the Question row is the importer's responsibility.

---

## Modified files
1. `supabase/migrations/026_exam_set_foundation.sql` *(new)*
2. `app/admin/import/actions.ts`
3. `app/admin/exam-sets/actions.ts`
4. `lib/types.ts`

## 1. Migration `026_exam_set_foundation.sql`
- **`question_code_seq`** (bigint START 1, NO CYCLE, CACHE 10).
- **`format_question_code(seq_value bigint) RETURNS text`** — the single source of the code format (`'Q-' || lpad(seq, 6, '0')`). Pure function.
- **`allocate_question_codes(n int) RETURNS text[]`** — SECURITY DEFINER; documented as allocation-only (never inserts / no business logic); calls `nextval` n times via `format_question_code`; granted to `authenticated`.
- `ALTER TABLE questions ADD COLUMN question_code text` + unique index (NULLs allowed).
- **`protect_question_code()`** BEFORE UPDATE trigger — raises `check_violation` if a non-null code changes (`NULL → value` is the only allowed transition).
- **`exam_sets`** additive columns: `exam_type` (default 'document', CHECK document/simulation), `status` (default 'draft', CHECK draft/published/archived), `subject text`, `document text`; + index on `status`. (No `slug`, no `question_count`.)
- **`validate_exam_set_for_publish(p_exam_set_id uuid)`** — read-only SECURITY DEFINER RPC; returns `(valid, error_code, message)`; enforces ≥1 question / no dup questions / unique `sort_order`.
- All statements `IF NOT EXISTS` / `OR REPLACE` → re-runnable.

## 2. `app/admin/import/actions.ts`
- Before insert: `(supabase as any).rpc('allocate_question_codes', { n: questions.length })` → `string[]` (same untyped-RPC cast idiom as `get_question_metadata` in `questions.action.ts:216`).
- Attach `question_code: codes[i]` into each payload row. No other field changes.

## 3. `app/admin/exam-sets/actions.ts`
- `createExamSetAction` / `updateExamSetAction`: accept + carry `exam_type`, `subject`, `document`. **subject/document validated against `get_question_metadata()`** (fetched once; rejected if not in the bank's distinct set).
- `publishDraftQuestionsInExamSetAction`: **unchanged**.
- **NEW `setExamSetStatusAction(id, status)`**: `published`→`requirePermission('content.publish')` + `validate_exam_set_for_publish` RPC (fail returns `{success:false, error: message}`, status unchanged) then UPDATE; `draft`/`archived`→`requirePermission('content.write')` + direct UPDATE. Same `{success,error}` + `.select('id')` RLS idiom.

## 4. `lib/types.ts`
- `Question`: `+ question_code?: string`.
- `ExamSet`: `+ exam_type, status, subject, document` with comment citing migration `026` and noting slug/question_count are intentionally absent.

## Out of scope
Assembly Engine, auto-selection, AI, similarity, versioning, locking, coverage, blueprint, analytics, simulation exams, random generator, admin UI, normalized subjects/documents tables, backfill, slug, question_count, unrelated refactors.

## Rollback
```sql
DROP FUNCTION IF EXISTS public.validate_exam_set_for_publish(uuid);
DROP FUNCTION IF EXISTS public.allocate_question_codes(integer);
DROP FUNCTION IF EXISTS public.format_question_code(bigint);
DROP TRIGGER  IF EXISTS protect_question_code ON public.questions;
DROP FUNCTION IF EXISTS public.protect_question_code();
DROP INDEX IF EXISTS exam_sets_status_idx;
DROP INDEX IF EXISTS questions_question_code_key;
ALTER TABLE public.exam_sets
  DROP COLUMN IF EXISTS document, DROP COLUMN IF EXISTS subject,
  DROP COLUMN IF EXISTS status, DROP COLUMN IF EXISTS exam_type;
ALTER TABLE public.questions DROP COLUMN IF EXISTS question_code;
DROP SEQUENCE IF EXISTS public.question_code_seq;
```
Code: `git checkout` the 3 edited files.

Testing checklist (from prior round, unchanged) will be returned with the completed work.