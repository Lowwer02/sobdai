# Content Template v2.1 FINAL — Report

> **Companion to:** `content_template_v2.md` v2.1 + `content_style_guide_v2.md` v2.1
> **Session:** Sobdai 6.13.3 (FINAL Production Standard)
> **Upgrades:** v2.0 (session 6.13.2) → v2.1 FINAL

---

## 1. Objectives

1. ยกระดับเอกสาร content standard เดิม (v2.0) ให้เป็น **FINAL Production Standard** — เสถียรพอรองรับ 5–10 ปี
2. รองรับ scale: 100+ orgs / 1000+ packages / 100,000+ questions / 10,000+ summaries โดยไม่ redesign
3. รองรับ use cases ครบ: NotebookLM / ChatGPT / Claude / Gemini / Bulk Import / Admin / Future AI / Recommendation / Analytics / Weak Topics / Knowledge Graph / Reusable Content / Blueprint / Authoring
4. เพิ่ม metadata + codes + types ที่ขาดใน v2.0 (DocumentType, QuestionCode, SummaryCode, LearningObjectives, KnowledgeCoverage, AssessmentMapping, CrossReferences, AI provenance, ContentStatus lifecycle)
5. คง backward compatibility 100% — เป็น additive upgrade

---

## 2. What's New in v2.1 (vs v2.0)

| ส่วน | v2.0 | v2.1 FINAL |
|---|---|---|
| Metadata fields | 15 | **29** (+DocumentType, QuestionCode, SummaryCode, QuestionType, ChoiceCount, EstimatedTime, LearningObjectives, KnowledgeCoverage, AssessmentMapping, ContentStatus, CreatedByAI, ReviewedByHuman, FactChecked, ReviewedAt, UpdatedAt) |
| DocumentCode format | `SUBJECT-TOPIC-YEAR` | `SUBJECT-{TYPE?}-TOPIC-YEAR[-SUFFIX]` (รองรับ type + version suffix) |
| DocumentType | ❌ | ✅ **14 types** (Act, Royal Decree, Ministerial Reg, Cabinet Resolution, National Plan, Policy, Strategy, Announcement, Manual, Guideline, Standard, Report, Circular, Order) |
| QuestionCode | ❌ | ✅ `{DOC}-Q{NNN}` (unique + sequential + never reused) |
| SummaryCode | ❌ | ✅ `{DOC}-SUM` |
| Question Types | MCQ4 only | ✅ **6 types** (MCQ4, MCQ5, True-False, Matching, Ordering, Essay) — template-ready |
| Blueprint | % ใน Question | ✅ **แยก**: Question=type (Memory/Concept/Procedure/Scenario), Package=% |
| Learning Objectives | ❌ | ✅ LO1–LO4 per Summary |
| Knowledge Coverage | ❌ | ✅ หมวด/มาตรา/ยุทธศาสตร์ |
| Assessment Mapping | ❌ | ✅ LO → Blueprint type |
| Content Status | Draft/Review/Published | ✅ + **Archived** + workflow diagram |
| AI Provenance | ❌ | ✅ CreatedByAI + ReviewedByHuman + FactChecked + ReviewedAt |
| Cross References | ❌ | ✅ 6 types (Related Documents/Summaries/Questions/Packages/Laws/Plans) |
| Naming Dictionary | rule เล็ก | ✅ **Official dictionary** (full vs abbreviation scope) |
| Metadata Matrix | 6 consumers | ✅ **12 consumers** (+Parser, Admin, Analytics, Recommend, Weak Topics, Blueprint) |
| Quality Checklist | universal | ✅ **universal + identity + taxonomy + provenance + dedup** |
| Common Mistakes | 3 categories | ✅ **6 categories** (metadata/code/question/summary/naming/provenance) |

---

## 3. Production Readiness

เอกสาร v2.1 พร้อม production เพราะ:

| เกณฑ์ | สถานะ | เหตุผล |
|---|---|---|
| **Stable identifiers** | ✅ | DocumentCode/QuestionCode/SummaryCode stable + never reused |
| **Scale-ready** | ✅ | รองรับ 100k+ questions (QuestionCode sequential 3 หลัก = 999/doc, multi-doc) |
| **AI-ready** | ✅ | provenance metadata + workflow 5 ตัว + fact-check gate |
| **Search-ready** | ✅ | ทุก code searchable + Knowledge Graph cross-refs |
| **Analytics-ready** | ✅ | LearningObjectives + KnowledgeCoverage + AssessmentMapping |
| **Future-proof** | ✅ | 6 question types (MCQ4 current, 5 types future) |
| **Backward compatible** | ✅ | additive — ไม่ break v2.0 content |
| **Quality gate** | ✅ | checklist ครบ + AI gate + dedup |

---

## 4. Backward Compatibility

### สิ่งที่ไม่เปลี่ยน (จาก v2.0 + Subject Foundation)
- ✅ Subject curated list (`lib/subjects.ts`) — เดิม
- ✅ Topic free text — เดิม
- ✅ Document + DocumentCode — เดิม (format ขยายแต่ pattern `SUBJECT-TOPIC-YEAR` ยังใช้ได้)
- ✅ Markdown renderer — เดิม
- ✅ Subject/Topic filter UI — เดิม
- ✅ `questions.subject` / `summaries.subject` columns — เดิม
- ✅ Subject Foundation dropdown/filter — เดิม

### สิ่งที่เพิ่ม (additive)
- 🆕 DocumentType, QuestionCode, SummaryCode, QuestionType, ChoiceCount (nullable/optional ตอนเริ่ม)
- 🆕 LearningObjectives, KnowledgeCoverage, AssessmentMapping
- 🆕 ContentStatus + Archived
- 🆕 AI provenance fields
- 🆕 CrossReferences

> เนื้อหาเดิมที่ไม่มี metadata ใหม่ → ยังทำงานได้ (fallback) — admin กรอก metadata ใหม่ทีหลังได้

---

## 5. Architecture Review

### Hierarchy (คงเดิม — อนุมัติแล้ว)
```
Package → Summary → Question
Question → Subject → Topic → Document → Question
```

### Metadata layers (ใหม่ใน v2.1)
```
Content Identity Layer
  ├─ DocumentCode (stable, unique)
  ├─ QuestionCode / SummaryCode (stable, unique)
  └─ Version (semver)

Taxonomy Layer
  ├─ Subject (curated enum)
  ├─ Topic (text)
  ├─ Document (text, full name)
  └─ DocumentType (enum, 14 types)

Learning Layer
  ├─ LearningObjectives (LO1–LO4)
  ├─ KnowledgeCoverage (chapters/sections)
  ├─ AssessmentMapping (LO → Blueprint type)
  └─ Blueprint (Question=type, Package=%)

Provenance Layer
  ├─ ContentStatus (Draft→Review→Published→Archived)
  ├─ CreatedByAI / ReviewedByHuman / FactChecked
  └─ ReviewedAt / UpdatedAt

Relationship Layer
  └─ CrossReferences (6 types — Knowledge Graph)
```

### การออกแบบนี้สอดคล้องกับ
- `content_architecture_foundation.md` (Package=Product, Content=Knowledge)
- `beta_architecture_roadmap.md` (Phase 1-4)
- Subject Foundation (lib/subjects.ts)

---

## 6. Risk Analysis

| Risk | ระดับ | วิธีลด |
|---|---|---|
| **Code collision** (DocumentCode/QuestionCode ซ้ำ) | สูง | `unique` constraint + import dedup + admin validate ก่อน insert |
| **AI content publish โดยไม่ review** | สูง | metadata gate: ห้าม status=Published ถ้า reviewed_by_human=false |
| **Backfill ผิด** (map metadata ผิด) | ปานกลาง | dry-run + admin review + dual-read fallback |
| **DocumentCode format เปลี่ยน** | ปานกลาง | v2.1 ขยายแต่ pattern เดิมยังใช้ได้ — migration เป็น optional suffix |
| **Metadata overhead** (29 fields) | ต่ำ | ส่วนใหญ่ optional/nullable — required แค่ core |
| **AI สร้าง code ผิด format** | ต่ำ | style guide ชัด + parser validate |
| **กระทบ v2.0 content** | ต่ำ | additive — ไม่ break |

---

## 7. Performance Considerations

| ข้อ | วิธีรักษา |
|---|---|
| **No new query per page** | metadata ใหม่เป็น columns/JSON — join ปกติ ไม่ใช่ additional query |
| **Code lookup fast** | index บน `document_code`, `question_code`, `summary_code` (unique) |
| **Cross-references** | JSONB array + GIN index (เหมือน `tags[]` pattern เดิม) |
| **Analytics** | RPC aggregate (pattern `getPackagePublicCounts`) สำหรับ LO/Blueprint/KnowledgeCoverage |
| **Search** | code searchable + DocumentType filter |
| **No bundle bloat** | data layer — ไม่ใช่ client JS |
| **ISR preserved** | content layer ไม่กระทบ homepage/catalog static |

---

## 8. Future Expansion

v2.1 รองรับการขยายโดยไม่ redesign:

| Feature | ต้องการอะไร | พร้อมหรือยัง |
|---|---|---|
| **Knowledge Graph** | CrossReferences (6 types) | ✅ metadata พร้อม |
| **AI Recommendation** | CrossReferences + Blueprint + LearningObjectives | ✅ metadata พร้อม |
| **Weak Topics analytics** | LearningObjectives + KnowledgeCoverage + question_answers (Phase 2) | ⚠️ metadata พร้อม, ต้องมี attempt tracking |
| **Blueprint-driven Mock** | Package Blueprint % + Question Blueprint type | ✅ metadata พร้อม |
| **Multi-language content** | DocumentType + Tags + subject | ✅ รองรับ |
| **Content versioning** | Version (semver) + Archived status | ✅ metadata พร้อม |
| **Question type expansion** | MCQ5 + True-False + Matching + Ordering + Essay | ✅ template พร้อม (DB อนาคต) |
| **Reusable Content (M:N)** | DocumentCode + SummaryCode (cross-package) | ✅ codes พร้อมสำหรับ dedup |

---

## 9. Migration Notes

### Phase A — Documentation (DONE, session นี้)
- ✅ v2.1 template + style guide + report

### Phase B — DB Schema (next session — safe, additive)
- เพิ่ม `documents` table (id, document_code UNIQUE, name, document_type, subject_id, topic_id, version, ...)
- เพิ่ม nullable FK: `questions.document_id`, `summaries.document_id`
- เพิ่ม nullable columns: `questions.question_code`, `summaries.summary_code`, `questions.question_type`, `questions.choice_count`, `questions.blueprint_type`, `questions.learning_objective`, `questions.estimated_time`, `summaries.learning_objectives JSONB`, `summaries.knowledge_coverage JSONB`, `summaries.assessment_mapping JSONB`
- เพิ่ม `content_status` (รวม Archived) — หรือ reuse `status` เดิม + enum ขยาย
- เพิ่ม provenance: `created_by_ai`, `reviewed_by_human`, `fact_checked`, `reviewed_at`
- เพิ่ม cross-refs: `related_*` JSONB
- ยังไม่แตะ flow เดิม (fallback ใช้ field เดิม)

### Phase C — Backfill + Admin
- Backfill DocumentCode/QuestionCode/SummaryCode สำหรับ content เดิม
- Admin CRUD สำหรับ `documents`
- ปรับ form import markdown front-matter → fields ใหม่

### Phase D — Import Pipeline
- markdown import อ่าน metadata ครบ v2.1
- bulk import manifest v2.1 (document_type + codes + provenance)

### Phase E — Content Production
- content team ใช้ v2.1 standard จริง
- quality checklist บังคับก่อน publish
- AI workflow 5 ตัว ใช้จริง

---

## 10. Recommended Next Sessions

| Session | ทำอะไร | Phase | Risk |
|---|---|---|---|
| **6.14.x** — Documents Table | `documents` table + document_id FK + RLS | B | ต่ำ (additive) |
| **6.15.x** — Code Columns | question_code/summary_code/document_type/blueprint_type nullable + unique constraint | B | ต่ำ |
| **6.16.x** — Provenance Fields | created_by_ai/reviewed_by_human/fact_checked + publish gate | B | ต่ำ |
| **6.17.x** — Learning Metadata | LO/KnowledgeCoverage/AssessmentMapping JSONB | B | ต่ำ |
| **6.18.x** — Admin Documents CRUD | admin route + dropdown + form v2.1 | C | ต่ำ |
| **6.19.x** — Backfill Codes | map content เดิม → codes + admin review | C | ปานกลาง |
| **6.20.x** — Import Pipeline v2.1 | front-matter parser v2.1 + bulk manifest | D | ปานกลาง |
| **6.21.x** — Publish Gate | บังคับ reviewed_by_human + fact_checked ก่อน publish | C | ปานกลาง |
| **6.22.x** — Content Production Onboarding | train team + first batch v2.1 | E | ต่ำ |

> **คำแนะนำ:** ทำ Phase B (DB Schema additive) ทั้งหมดก่อน — safe ระหว่าง Beta → เมื่อมีข้อมูลในตาราง + columns แล้ว ค่อยเข้า Phase C-E

---

## Appendix: Compliance

| Task Requirement | สถานะ |
|---|---|
| DESIGN ONLY (no code/SQL/migration) | ✅ |
| อัปเกรด v2.0 → v2.1 (ไม่ rewrite) | ✅ |
| คง hierarchy เดิม (Package→Summary→Question, Question→Subject→Topic→Document) | ✅ |
| Part 1: Official Metadata (29 fields) | ✅ |
| Part 2: DocumentType (14 types) | ✅ |
| Part 3: DocumentCode (permanent convention) | ✅ |
| Part 4: QuestionCode | ✅ |
| Part 5: SummaryCode | ✅ |
| Part 6: Question Types (6) | ✅ |
| Part 7: Choice Count (4/5, E optional) | ✅ |
| Part 8: Difficulty (DB Eng / UI Thai + explanation) | ✅ |
| Part 9: Blueprint (Question=type, Package=%, mapping) | ✅ |
| Part 10: Learning Objectives (LO1-LO4) | ✅ |
| Part 11: Knowledge Coverage | ✅ |
| Part 12: Assessment Mapping (LO→Blueprint) | ✅ |
| Part 13: Estimated Time | ✅ |
| Part 14: Content Status (+Archived +workflow) | ✅ |
| Part 15: AI Metadata + workflow | ✅ |
| Part 16: Official Naming Dictionary | ✅ (style guide) |
| Part 17: Cross References (6 types) | ✅ |
| Part 18: Metadata Matrix (12 consumers) | ✅ |
| Part 19: Question Template (FINAL) | ✅ |
| Part 20: Summary Template (FINAL) | ✅ |
| Part 21: NotebookLM Export Template | ✅ |
| Part 22: Bulk Import Template | ✅ |
| Part 23: AI Workflow Standard | ✅ (style guide) |
| Part 24: Quality Checklist | ✅ (style guide) |
| Part 25: Common Mistakes | ✅ (style guide) |
| Report (10 sections) | ✅ |
| Scale-ready (100+/1000+/100k+/10k+) | ✅ |
| Backward compatible | ✅ |
