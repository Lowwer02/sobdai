# Question Import Parser v2.1 — Fix Report

**Root cause:** `extractMultiline` regex lookahead in `lib/markdownParser.ts` only listed legacy labels, so `Subject` greedily swallowed `Document`/`DocumentType` and `Topic` swallowed `LearningObjective`/`KnowledgeCoverage`.

**Fix:** Added every Content Template v2.1 label (`Document`, `DocumentType`, `LearningObjective`, `KnowledgeCoverage`, `Blueprint`, `QuestionType`, `ChoiceCount`, `Why E Wrong`) to the shared `KNOWN_LABELS` boundary list; extracted each field independently. Each is now an independent, non-greedy match bounded by all known labels — no cross-field bleed.

**Files:** `lib/markdownParser.ts` (interface +7 fields, extraction +7), `app/admin/import/actions.ts` (insert `document`).

**Backward compat:** old markdown without new labels → new fields parse as empty (validated). Verified against the spec example: subject/document/document_type/topic/learning_objective/knowledge_coverage all split correctly; old markdown keeps subject+topic only.

**Schema:** no change. Fields without a DB column (document_type/learning_objective/knowledge_coverage/blueprint/question_type/choice_count) are parsed but intentionally NOT inserted to avoid errors — stored as Draft.

**Verification:** `tsc --noEmit` 0 errors · `next build` ✓ (36/36) · runtime/UI/auth/payment/exam untouched · ISR preserved.
