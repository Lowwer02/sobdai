# Content Template v2.1 FINAL (Production Standard)

> **Status:** DESIGN ONLY — official Sobdai Content Standard
> **Session:** Sobdai 6.13.3 (FINAL Production Standard)
> **Upgrades:** v2.0 (`content_template_v2.md` จาก session 6.13.2) → v2.1
> **Hierarchy (อนุมัติแล้ว — ห้ามเปลี่ยน):** Package → Summary → Question ; Question → Subject → Topic → Document → Question
> **Goal:** เสถียรพอรองรับ 5–10 ปีข้างหน้า, รองรับ 100+ orgs / 1000+ packages / 100,000+ questions / 10,000+ summaries โดยไม่ redesign

---

## Part 1 — Official Metadata Standard

ทุก content unit (Question + Summary) + import + analytics ใช้ metadata ชุดนี้:

| # | Field | Type | Required | Description |
|---|---|---|---|---|
| 1 | `Package` | ref | yes (context) | แพ็กเกจที่อ้างอิง |
| 2 | `Organization` | ref | yes (context) | หน่วยงาน |
| 3 | `Position` | ref | yes (context) | ตำแหน่ง |
| 4 | `ExamYear` | int | yes (context) | ปี พ.ศ. ของชุดเตรียมสอบ (เช่น 2568) |
| 5 | `Version` | semver | yes | content version (`MAJOR.MINOR.PATCH`) |
| 6 | `Subject` | enum | yes | วิชา — curated code (`law`, `policy`, ...) |
| 7 | `Topic` | text | yes | หัวข้อกว้าง |
| 8 | `Document` | text | yes | ชื่อเอกสารเต็ม (เปลี่ยนได้ตามทางการ) |
| 9 | `DocumentCode` | code | yes | stable unique ID (`LAW-ACT-HED-2562`) |
| 10 | `DocumentType` | enum | yes | ประเภทเอกสาร (Act / Plan / Policy / ...) — Part 2 |
| 11 | `QuestionCode` | code | Question only | `LAW-HED-2562-Q001` — Part 4 |
| 12 | `SummaryCode` | code | Summary only | `LAW-HED-2562-SUM` — Part 5 |
| 13 | `Difficulty` | enum | Question only | Easy / Medium / Hard — Part 8 |
| 14 | `Blueprint` | enum | Question only | Memory / Concept / Procedure / Scenario — Part 9 |
| 15 | `QuestionType` | enum | Question only | MCQ4 / MCQ5 / True-False / Matching / Ordering / Essay — Part 6 |
| 16 | `ChoiceCount` | int | Question only | 4 หรือ 5 — Part 7 |
| 17 | `EstimatedTime` | int | yes | วินาที (Q) / นาที (Summary) — Part 13 |
| 18 | `LearningObjectives` | string[] | Summary required, Q optional | LO1..LO4 — Part 10 |
| 19 | `KnowledgeCoverage` | string[] | Summary only | หมวด/มาตรา/ยุทธศาสตร์ — Part 11 |
| 20 | `AssessmentMapping` | object | yes | LO → Blueprint type mapping — Part 12 |
| 21 | `Tags` | string[] | optional | cross-cutting labels |
| 22 | `Images` | string[] | optional | URL รูป |
| 23 | `References` | string[] | yes | อ้างอิงเอกสาร/มาตรา/URL |
| 24 | `ContentStatus` | enum | yes | Draft / Review / Published / Archived — Part 14 |
| 25 | `CreatedByAI` | bool | yes | สร้างโดย AI? — Part 15 |
| 26 | `ReviewedByHuman` | bool | yes | ผ่าน human review? — Part 15 |
| 27 | `FactChecked` | bool | yes | fact-check แล้ว? — Part 15 |
| 28 | `ReviewedAt` | timestamp | conditional | เมื่อ ReviewedByHuman = true |
| 29 | `UpdatedAt` | timestamp | yes | last modified |

### Cross References (Part 17)
- `RelatedDocuments` / `RelatedSummaries` / `RelatedQuestions` / `RelatedPackages` / `RelatedLaws` / `RelatedPlans`

---

## Part 2 — DocumentType Taxonomy

ประเภทเอกสารอย่างเป็นทางการ (1 Document มี 1 DocumentType):

| Code | Thai | Description |
|---|---|---|
| `ACT` | พระราชบัญญัติ | กฎหมายระดับพระราชบัญญัติ |
| `ROYAL_DECREE` | พระราชกฤษฎีกา | กฎหมายระดับกฤษฎีกา |
| `MINISTERIAL_REG` | ข้อกำหนดกระทรวง / ระเบียบกระทรวง | กฎหมายระดับรัฐมนตรี/กระทรวง |
| `CABINET_RESOLUTION` | มติคณะรัฐมนตรี | มติ ครม. |
| `NATIONAL_PLAN` | แผนระดับชาติ | แผนพัฒนาฯ / แผน sectoral |
| `POLICY` | นโยบาย | นโยบายของหน่วยงาน |
| `STRATEGY` | ยุทธศาสตร์ | ยุทธศาสตร์ระดับชาติ/กระทรวง |
| `ANNOUNCEMENT` | ประกาศ | ประกาศทางการ |
| `MANUAL` | คู่มือ | คู่มือปฏิบัติงาน |
| `GUIDELINE` | แนวทาง / หลักเกณฑ์ | แนวปฏิบัติ |
| `STANDARD` | มาตรฐาน | มาตรฐานวิชาชีพ/เทคนิค |
| `REPORT` | รายงาน | รายงานการศึกษา/วิจัย |
| `CIRCULAR` | หนังสือเวียน | หนังสือเวียนทางการ |
| `ORDER` | คำสั่ง | คำสั่งหน่วยงาน |

### ความต่างระหว่าง Subject / Topic / Document / DocumentType

| Layer | นิยาม | ตัวอย่าง | Granularity |
|---|---|---|---|
| **Subject** | วิชากว้าง (stable, 7 ตัว) | กฎหมาย | กว้างสุด |
| **Topic** | หัวข้อในวิชา (broader category) | กฎหมายการอุดมศึกษา | กว้าง |
| **Document** | เอกสารฉบับเฉพาะ | พระราชบัญญัติการอุดมศึกษา พ.ศ.2562 | เฉพาะเจาะจง |
| **DocumentType** | ประเภทของเอกสารนั้น | Act (พระราชบัญญัติ) | metadata ประกอบ |

> Subject + Topic = classification ทางวิชาการ
> Document + DocumentType = classification ทางกฎหมาย/เอกสาร
> สี่อย่างนี้ complementary ไม่ซ้ำกัน

---

## Part 3 — DocumentCode Convention (PERMANENT)

### Format v2.1 (expanded)
```
{SUBJECT}-{TYPE?}-{TOPIC_ABBR}-{YEAR}[-{SUFFIX}]
```

- `{SUBJECT}` — `LAW`, `POLICY`, `ECON`, `ADMIN`, `ENG`, `TECH`, `MATH`
- `{TYPE?}` — optional DocumentType code (ถ้าเป็น Act ใส่ `ACT` เพื่อชัด, ถ้าไม่จำเป็นข้ามได้)
- `{TOPIC_ABBR}` — 2-6 ตัวอักษร uppercase (`HED`, `PDPA`, `PROC`)
- `{YEAR}` — พ.ศ. 4 หลัก
- `{SUFFIX}` — optional `-V2`, `-A`, `-B`

### Examples
| DocumentCode | Document |
|---|---|
| `LAW-ACT-HED-2562` | พระราชบัญญัติการอุดมศึกษา พ.ศ.2562 |
| `LAW-PRIVATE-2546` | พระราชบัญญัติสถาบันอุดมศึกษาเอกชน พ.ศ.2546 |
| `LAW-PDPA-2562` | พ.ร.บ.คุ้มครองข้อมูลส่วนบุคคล พ.ศ.2562 |
| `PLAN-HED-2566` | แผนด้านการอุดมศึกษา พ.ศ.2566–2570 |
| `FRAMEWORK-STI-2566` | กรอบนโยบายฯ อววน. พ.ศ.2566–2570 |
| `LAW-ACT-HED-2562-V2` | ฉบับแก้ไขเพิ่มเติม (เวอร์ชันใหม่) |

### Requirements (PERMANENT)
- ✅ **Stable** — ไม่เปลี่ยนตลอดอายุ (แม้ชื่อเอกสารเปลี่ยน)
- ✅ **Unique** — 1 Document = 1 Code (unique constraint)
- ✅ **Readable** — admin/AI อ่านรู้ความหมายคร่าวๆ
- ✅ **Future-proof** — suffix รองรับเวอร์ชันใหม่
- ✅ **Never changes** — ถ้าจำเป็นต้อง "เปลี่ยน" → สร้าง Code ใหม่ (เช่น `-V2`) + deprecate Code เดิม (อย่าลบ)

---

## Part 4 — QuestionCode

### Format
```
{DOCUMENT_CODE}-Q{NNN}
```
- `Q` prefix + 3 หลัก sequential (รองรับ 999 ข้อต่อ document)

### Examples
```
LAW-HED-2562-Q001     ← ข้อที่ 1
LAW-HED-2562-Q002     ← ข้อที่ 2
LAW-HED-2562-Q042     ← ข้อที่ 42
PLAN-HED-2566-Q001    ← document อื่น เริ่ม Q001 ใหม่
```

### Rules
- ✅ **Unique** — global unique (DocumentCode + Q number)
- ✅ **Sequential** — เรียงตามลำดับสร้างใน document
- ✅ **Never reused** — ถ้าลบ Q005 ห้ามนำ Q005 มาใช้ใหม่ (gap ได้)
- ✅ **Human-readable** — รู้ทันทีว่าเป็นข้อไหมของ document ไหน
- ✅ **Stable** — ไม่เปลี่ยนแม้เนื้อหาแก้ (ใช้ Version field)

---

## Part 5 — SummaryCode

### Format
```
{DOCUMENT_CODE}-SUM
```
- 1 Document = 1 Summary (1:1) → suffix `-SUM` เดียวพอ

### Examples
```
LAW-HED-2562-SUM
PLAN-HED-2566-SUM
FRAMEWORK-STI-2566-SUM
```

### Versioning
```yaml
summary_code: LAW-HED-2562-SUM
version: 1.0.0    # แก้เนื้อหาเล็กน้อย
version: 2.0.0    # rewrite ใหญ่ / กฎหมายเปลี่ยน
```

### Rules
- SummaryCode stable — ไม่เปลี่ยน
- Version field เปลี่ยนตาม content revision (semver)
- 1 SummaryCode = 1 Document เสมอ (ไม่รวมหลายเอกสาร)

---

## Part 6 — Question Types

### Supported types (template-level, future-proof)

| Code | Name | Current support | Future |
|---|---|---|---|
| `MCQ4` | Multiple Choice (4 options) | ✅ production | — |
| `MCQ5` | Multiple Choice (5 options) | ⚠️ template only | Phase future |
| `TRUE_FALSE` | ถูก/ผิด | ❌ | future |
| `MATCHING` | จับคู่ | ❌ | future |
| `ORDERING` | เรียงลำดับ | ❌ | future |
| `ESSAY` | อัตนัย | ❌ | future |

> **Current implementation = MCQ4 only** (DB: choice_a..d). Template ต้องรองรับทุก type ตั้งแต่ตอนนี้เพื่อ future migration ไม่ต้อง redesign

---

## Part 7 — Choice Count

| ChoiceCount | Description | Status |
|---|---|---|
| `4` | A, B, C, D | ✅ current |
| `5` | A, B, C, D, E (E optional) | ⚠️ template only |

### Rules
- MCQ4 → 4 choices + 4 explanations
- MCQ5 → 5 choices + 5 explanations (E optional ใน data แต่ถ้ามีต้องมี explanation)
- Backward compatible — MCQ4 ใช้ต่อไปได้

---

## Part 8 — Difficulty

| DB (English) | UI (Thai) | Calibration |
|---|---|---|
| `Easy` | ง่าย | จำได้จากการอ่าน 1 ครั้ง |
| `Medium` | ปานกลาง | ต้องเข้าใจ + เชื่อมโยง 2+ มาตรา |
| `Hard` | ยาก | ต้องวิเคราะห์ + ประยุกต์ + plausible distractors |

### ทำไม DB = English แต่ UI = Thai?
- **DB English** → stable, sort/filter ง่าย, ไม่มี encoding issue, สอดคล้องกับระบบสากล
- **UI Thai** → user-friendly สำหรับผู้เตรียมสอบไทย
- การแปลงผ่าน mapping function (`getDifficultyLabel(difficulty)`)

---

## Part 9 — Blueprint (Question vs Package)

### หลักการสำคัญ
**ห้าม**เก็บ % ใน Question — Question เก็บแค่ "ประเภทการประเมิน" (Blueprint type)

### Question Blueprint (type, not %)
| Type | นิยาม |
|---|---|
| `Memory` | จำได้ / รู้จักคำนิยาม |
| `Concept` | เข้าใจแนวคิด / อธิบายได้ |
| `Procedure` | ทำตามขั้นตอน / ประยุกต์ |
| `Scenario` | วิเคราะห์สถานการณ์ / ตัดสินใจ |

### Package Blueprint (%, by type)
```yaml
package_blueprint:
  Memory: 40
  Concept: 30
  Procedure: 20
  Scenario: 10
  # ผลรวม = 100
```

### Mapping (how Mock generator uses both)
```
Package Blueprint (Memory 40%)
        ↓
  ต้องการ 40% ของข้อสอบเป็น Memory type
        ↓
  SELECT questions WHERE blueprint = 'Memory'
        ↓
  เลือกจำนวนตามสัดส่วน
```

> การแยกนี้ทำให้: Question ใช้ซ้ำได้ในหลาย Package (Package ตั้ง % ของตัวเอง), analytics รู้ "ผู้ใช้อ่อนเรื่อง Scenario"

---

## Part 10 — Learning Objectives (LO)

### Standard
แต่ละ Summary ต้องนิยาม **4 Learning Objectives** (LO1–LO4):

```yaml
learning_objectives:
  - LO1: อธิบายวิสัยทัศน์การอุดมศึกษาไทยตามมาตรา 5 ได้
  - LO2: วิเคราะห์หลักการผลิตบัณฑิตตามมาตรา 7 ได้
  - LO3: ประยุกต์หลักการบริหารสถาบันตามมาตรา 12 ในกรณีศึกษาได้
  - LO4: เสนอแนะทิศทางการอุดมศึกษาในอนาคตจากแผน พ.ศ.2566 ได้
```

### Question ↔ LO mapping
```yaml
# ใน Question
learning_objective: LO2    # ข้อสอบนี้วัด LO2
```

### Rules
- Summary ต้องมี LO1–LO4 ครบ (Bloom's taxonomy progression)
- Question อ้างอิง LO ของ Summary ใน Document เดียวกัน
- ช่วย analytics: "% mastery ของ LO2 = 65%"

---

## Part 11 — Knowledge Coverage

### นิยาม
metadata ที่บอกว่า Summary ครอบคลุม "ส่วนไหน" ของเอกสาร:

```yaml
knowledge_coverage:
  - หมวด 1 (วิสัยทัศน์และพันธกิจ)
  - หมวด 2 (หลักการ)
  - มาตรา 5–18
  - ยุทธศาสตร์ที่ 3
  - เป้าหมายที่ 4
```

### Rules
- ระบุเป็นข้อความ (เพราะโครงสร้างเอกสารแต่ละ type ต่างกัน)
- ใช้คำทางการ ("หมวด 1" ไม่ใช่ "chapter 1")
- ช่วย analytics: "ผู้ใช้ทำมาตรา 5–18 ได้ 70%"

---

## Part 12 — Assessment Mapping (LO ↔ Blueprint)

### Mapping object
```yaml
assessment_mapping:
  LO1: Memory       # จำวิสัยทัศน์
  LO2: Concept      # เข้าใจหลักการ
  LO3: Procedure    ประยุกต์
  LO4: Scenario     # วิเคราะห์อนาคต
```

### Rules
- 1 LO = 1 Blueprint type
- mapping เป็น Bloom's progression: Memory → Concept → Procedure → Scenario
- ช่วย blueprint-driven Mock generator + analytics

---

## Part 13 — Estimated Time

### Question (วินาที)
| Difficulty | Est. Time |
|---|---|
| Easy | 30 วินาที |
| Medium | 45 วินาที |
| Hard | 60 วินาที |

### Summary (นาที)
| Length | Est. Time |
|---|---|
| Short (1500–2000 คำ) | 5 นาที |
| Medium (2000–2500) | 10 นาที |
| Long (2500–3000) | 15 นาที |
| Very Long (3000–4000) | 20 นาที |

> ใช้สำหรับ: dashboard progress bar, Mock time budget, "เหลือเวลาอ่าน X นาที"

---

## Part 14 — Content Status

### Workflow
```
Draft → Review → Published → Archived
  ↑        |         |          |
  └────────┘         │          │
   (แก้ไข)            │          │
                     ↓          │
              (เลิกใช้/เน่า) ────┘
```

| Status | Meaning | Visible to user? |
|---|---|---|
| `Draft` | กำลังเขียน | ❌ |
| `Review` | รอ human review | ❌ |
| `Published` | live | ✅ |
| `Archived` | เลิกใช้ (เก่า/เน่า) | ❌ (อาจ redirect) |

### Rules
- ห้าม skip Draft → Published (ต้องผ่าน Review เสมอ — ยกเว้น trusted admin override)
- Archived ไม่ลบ — เก็บไว้ reference + rollback ได้

---

## Part 15 — AI Metadata

### Fields
```yaml
created_by_ai: true            # สร้างโดย AI?
reviewed_by_human: true        # ผ่าน human review?
fact_checked: true             # fact-check แล้ว?
reviewed_at: 2026-07-08T10:00Z # เมื่อไหร่ (ถ้า reviewed_by_human = true)
```

### Workflow (AI content lifecycle)
```
1. AI generate draft       → created_by_ai: true, reviewed_by_human: false
2. Human review content     → reviewed_by_human: true, fact_checked: ?
3. Fact-check verification  → fact_checked: true, reviewed_at: now()
4. Publish (all true)       → status: Published
```

### Rules
- ❌ **ห้าม publish AI content ที่ `reviewed_by_human = false`** — บังคับ gate
- ❌ **ห้าม publish AI content ที่ `fact_checked = false`** ถ้าเป็นกฎหมาย/ข้อเท็จจริง
- ✅ Human-created content → `created_by_ai: false`, review optional แต่แนะนำ

---

## Part 17 — Cross References

### Fields (สำหรับ Knowledge Graph + Recommendation)
```yaml
related_documents:
  - LAW-PRIVATE-2546     # เอกสารที่เกี่ยวข้อง
related_summaries:
  - LAW-PRIVATE-2546-SUM
related_questions:
  - LAW-HED-2562-Q005    # ข้อสอบที่เกี่ยวข้อง
related_packages:
  - "com-2568-analyst"   # package slug
related_laws:
  - พ.ร.บ.ระเบียบบริหารราชการแผ่นดิน
related_plans:
  - แผนพัฒนาเศรษฐกิจฯ ฉบับที่ 13
```

### Purpose
- **Knowledge Graph** — สร้าง graph ความสัมพันธ์ระหว่าง content
- **Recommendation** — "ถ้าอ่าน PDPA แล้ว ลองอ่าน พ.ร.บ.ระเบียบฯ"
- **AI Navigation** — AI แนะนำเส้นทางเรียน
- **Future Search** — search ข้าม content type

---

## Part 19 — Question Template (FINAL)

```markdown
---
# Context
package: "นักวิเคราะห์นโยบายและแผน สำนักงานปลัด อว. ปี 2568"
organization: "สำนักงานปลัดกระทรวงการอุดมศึกษา วิทยาศาสตร์ วิจัยและนวัตกรรม"
position: "นักวิเคราะห์นโยบายและแผน"
exam_year: 2568

# Identity
question_code: LAW-HED-2562-Q001
version: 1.0.0

# Taxonomy
subject: law
topic: กฎหมายการอุดมศึกษา
document: พระราชบัญญัติการอุดมศึกษา พ.ศ.2562
document_code: LAW-ACT-HED-2562
document_type: ACT

# Question metadata
question_type: MCQ4
choice_count: 4
difficulty: Medium
blueprint: Concept
estimated_time: 45

# Learning
learning_objective: LO2
knowledge_coverage:
  - มาตรา 5 (วิสัยทัศน์)
assessment_mapping:
  LO2: Concept

# Media
tags: [อุดมศึกษา, 2562, วิสัยทัศน์]
references:
  - มาตรา 5 พ.ร.บ.การอุดมศึกษา พ.ศ.2562
  - ราชกิจจานุเบกษา เล่ม 136 ตอนพิเศษ 49 ก

# Cross references
related_documents: [LAW-PRIVATE-2546]
related_summaries: [LAW-HED-2562-SUM]
related_questions: [LAW-HED-2562-Q002]

# Status + Provenance
content_status: Published
created_by_ai: false
reviewed_by_human: true
fact_checked: true
reviewed_at: 2026-07-08T10:00Z
updated_at: 2026-07-08T10:00Z
---

## Question

ตามพระราชบัญญัติการอุดมศึกษา พ.ศ.2562 มาตรา 5 ข้อใดเป็นวิสัยทัศน์การอุดมศึกษาไทย?

## Choices

**A.** ผลิตบัณฑิตที่มีความเชี่ยวชาญเฉพาะทางเพียงอย่างเดียว
**B.** เป็นการศึกษาเพื่อยกระดับมาตรฐานและคุณภาพชีวิตของประชาชนและพัฒนาสังคม
**C.** เน้นการสอนทฤษฎีโดยไม่เชื่อมโยงกับการทำงาน
**D.** จำกัดเฉพาะกลุ่มผู้ที่มีฐานะทางการเงิน

**Correct Answer:** B

## Explanations

### A — ไม่ถูกต้อง
**เพราะ:** วิสัยทัศน์ไม่ได้จำกัดเพียงความเชี่ยวชาญ แต่ต้องผลิตบัณฑิตที่มีคุณธรรมและความรู้ควบคู่กัน
**อ้างอิง:** มาตรา 5 พ.ร.บ.การอุดมศึกษา พ.ศ.2562

### B — ถูกต้อง ✓
**เพราะ:** มาตรา 5 ระบุว่าวิสัยทัศน์คือยกระดับคุณภาพชีวิตของประชาชนและพัฒนาสังคมอย่างยั่งยืน
**อ้างอิง:** มาตรา 5 + ประกาศนโยบาย กกพอ.

### C — ไม่ถูกต้อง
**เพราะ:** ต้องเชื่อมโยงการเรียนการสอนกับการทำงานจริงตามแนวทางมาตรา 7
**อ้างอิง:** มาตรา 7

### D — ไม่ถูกต้อง
**เพราะ:** การอุดมศึกษาต้องเข้าถึงได้อย่างเสมอภาค โดยไม่จำกัดฐานะทางการเงิน
**อ้างอิง:** หลักการการศึกษาตลอดชีวิต มาตรา 6

## References

- มาตรา 5 พ.ร.บ.การอุดมศึกษา พ.ศ.2562
- ราชกิจจานุเบกษา เล่ม 136 ตอนพิเศษ 49 ก ลงวันที่ 18 มกราคม 2562

## Related

- **Summary:** [LAW-HED-2562-SUM] สรุปพ.ร.บ.การอุดมศึกษา พ.ศ.2562
- **Document:** [LAW-PRIVATE-2546] พ.ร.บ.สถาบันอุดมศึกษาเอกชน
- **Question:** [LAW-HED-2562-Q002] ข้อถัดไปในชุดเดียวกัน
```

### 5-Choice Variant
```markdown
question_type: MCQ5
choice_count: 5
## Choices
**A.** ...
**B.** ...
**C.** ...
**D.** ...
**E.** ...
**Correct Answer:** B
## Explanations
### A ... ### B ... ### C ... ### D ... ### E — ไม่ถูกต้อง
**เพราะ:** ...
**อ้างอิง:** ...
```

---

## Part 20 — Summary Template (FINAL)

```markdown
---
# Context
package: "นักวิเคราะห์นโยบายและแผน สำนักงานปลัด อว. ปี 2568"
organization: "..."
position: "..."
exam_year: 2568

# Identity
summary_code: LAW-HED-2562-SUM
version: 1.0.0

# Taxonomy
subject: law
topic: กฎหมายการอุดมศึกษา
document: พระราชบัญญัติการอุดมศึกษา พ.ศ.2562
document_code: LAW-ACT-HED-2562
document_type: ACT

# Summary metadata
estimated_time: 12

# Learning
learning_objectives:
  - LO1: อธิบายวิสัยทัศน์การอุดมศึกษาฯ ตามมาตรา 5 ได้
  - LO2: วิเคราะห์หลักการผลิตบัณฑิตฯ ตามมาตรา 7 ได้
  - LO3: ประยุกต์หลักการบริหารสถาบันฯ ตามมาตรา 12 ในกรณีศึกษาได้
  - LO4: เสนอแนะทิศทางการอุดมศึกษาในอนาคตจากแผน พ.ศ.2566 ได้
knowledge_coverage:
  - หมวด 1 (วิสัยทัศน์และพันธกิจ)
  - มาตรา 5–18
assessment_mapping:
  LO1: Memory
  LO2: Concept
  LO3: Procedure
  LO4: Scenario

# Media
tags: [อุดมศึกษา, 2562, กกพอ.]
images:
  - /storage/summaries/law-hed-2562/structure.png
references:
  - ราชกิจจานุเบกษา เล่ม 136
  - https://www.mhesi.go.th/hed-act-2562

# Cross references
related_documents: [LAW-PRIVATE-2546]
related_questions: [LAW-HED-2562-Q001, LAW-HED-2562-Q002]

# Status + Provenance
content_status: Published
created_by_ai: false
reviewed_by_human: true
fact_checked: true
reviewed_at: 2026-07-08T10:00Z
updated_at: 2026-07-08T10:00Z
---

# สรุปพระราชบัญญัติการอุดมศึกษา พ.ศ.2562

## ภาพรวม

> [!IMPORTANT]
> พ.ร.บ.นี้มีผลบังคับใช้ตั้งแต่วันที่ 1 กุมภาพันธ์ 2562

เนื้อหา 2,000–3,000 คำ...

## วิสัยทัศน์และพันธกิจ (LO1)

...

## หลักการผลิตบัณฑิต (LO2)

...

## มาตราสำคัญ

| มาตรา | เนื้อหาโดยย่อ |
|---|---|
| 5 | วิสัยทัศน์ |
| 7 | แนวทางการผลิตบัณฑิต |

## อ้างอิง

- ราชกิจจานุเบกษา เล่ม 136 ตอนพิเศษ 49 ก
- เว็บไซต์ กกพอ.

## Related

- **Document:** [LAW-PRIVATE-2546]
- **Questions:** [LAW-HED-2562-Q001], [LAW-HED-2562-Q002]
```

### Rules
- **1 Summary = 1 Document** (1:1)
- **2,000–3,000 คำ**
- H1 = ชื่อเอกสารเต็ม
- ระบุ LO ใน heading (`(LO1)`) เพื่อ analytics mapping
- GitHub alerts, tables, images, references

---

## Part 21 — NotebookLM Export Template

### Official prompt
```
จงสรุปเอกสาร [ชื่อเอกสารเต็ม] ในรูปแบบ Markdown Sobdai Standard:

1. YAML front-matter (REQUIRED):
   ---
   summary_code: [DOCUMENT_CODE]-SUM
   version: 1.0.0
   subject: [code from {law, policy, economics, administration, english, technology, math}]
   topic: [หัวข้อกว้าง]
   document: [ชื่อเอกสารเต็ม ไม่ย่อ]
   document_code: [SUBJECT-TYPE?-TOPIC-YEAR]
   document_type: [ACT|ROYAL_DECREE|MINISTERIAL_REG|CABINET_RESOLUTION|NATIONAL_PLAN|POLICY|STRATEGY|ANNOUNCEMENT|MANUAL|GUIDELINE|STANDARD|REPORT|CIRCULAR|ORDER]
   estimated_time: [8-20]
   learning_objectives: [LO1..LO4 with descriptions]
   knowledge_coverage: [หมวด/มาตรา/ยุทธศาสตร์]
   tags: [3-5]
   references: [มาตรา + URL]
   content_status: Draft
   created_by_ai: true
   reviewed_by_human: false
   fact_checked: false
   ---

2. เนื้อหา 2,000-3,000 คำ
3. H1 = ชื่อเอกสารเต็ม, H2 = หมวด (ระบุ LO ในวงเล็บ), H3 = หัวข้อย่อย
4. GitHub alerts (> [!IMPORTANT] / [!WARNING])
5. ตารางสำหรับสรุปมาตรา
6. อ้างอิงมาตรา/หน้าทุกคำกล่าวอ้าง
7. ห้ามย่อชื่อเอกสาร ("พ.ร.บ." → "พระราชบัญญัติ")

โทน: เป็นทางการ กระชับ สำหรับผู้เตรียมสอบข้าราชการ
```

---

## Part 22 — Bulk Import Template

### Manifest: `bulk_import.json`
```json
{
  "package": "นักวิเคราะห์นโยบายและแผน สำนักงานปลัด อว. ปี 2568",
  "organization": "สำนักงานปลัดกระทรวงการอุดมศึกษา วิทยาศาสตร์ วิจัยและนวัตกรรม",
  "position": "นักวิเคราะห์นโยบายและแผน",
  "exam_year": 2568,
  "imported_at": "2026-07-08",
  "items": [
    {
      "type": "summary",
      "file": "summaries/law-hed-2562.md",
      "summary_code": "LAW-HED-2562-SUM",
      "document_code": "LAW-ACT-HED-2562",
      "document_type": "ACT",
      "version": "1.0.0"
    },
    {
      "type": "question",
      "file": "questions/law-hed-2562-q01.md",
      "question_code": "LAW-HED-2562-Q001",
      "document_code": "LAW-ACT-HED-2562",
      "version": "1.0.0"
    }
  ]
}
```

### Folder
```
bulk-import/
├── bulk_import.json
├── summaries/
│   └── law-hed-2562.md
└── questions/
    └── law-hed-2562-q01.md
```

### Rules
- Manifest = single source of truth for metadata
- `document_code` + `question_code`/`summary_code` ต้อง unique (dedup ก่อน insert)
- Partial success — item fail ไม่ rollback batch
- ทุก item ต้องมี file + identity codes

---

## Appendix A — Metadata Matrix (Part 18)

`✅` = required · `o` = optional · `—` = N/A

| Field | Question | Summary | NotebookLM | Bulk Import | AI Q | AI Sum | Parser | Admin | Analytics | Recommend | Weak Topics | Blueprint |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Package | ✅ | ✅ | — | ✅ | o | o | ✅ | ✅ | o | o | — | o |
| Organization | ✅ | ✅ | — | ✅ | o | o | ✅ | ✅ | o | — | — | — |
| Position | ✅ | ✅ | — | ✅ | o | o | ✅ | ✅ | — | — | — | — |
| ExamYear | ✅ | ✅ | — | ✅ | o | o | ✅ | ✅ | o | — | — | — |
| Version | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | o | — | — | — |
| Subject | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Topic | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | o |
| Document | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | o | ✅ | o | — |
| DocumentCode | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | — |
| DocumentType | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | o | o | — | — |
| QuestionCode | ✅ | — | — | ✅ | ✅ | — | ✅ | ✅ | ✅ | ✅ | ✅ | — |
| SummaryCode | — | ✅ | ✅ | ✅ | — | ✅ | ✅ | ✅ | ✅ | ✅ | — | — |
| Difficulty | ✅ | — | — | ✅ | ✅ | — | ✅ | ✅ | ✅ | o | ✅ | — |
| Blueprint (type) | ✅ | — | — | ✅ | ✅ | — | ✅ | ✅ | ✅ | o | ✅ | ✅ |
| QuestionType | ✅ | — | — | ✅ | ✅ | — | ✅ | ✅ | — | — | — | — |
| ChoiceCount | ✅ | — | — | ✅ | ✅ | — | ✅ | ✅ | — | — | — | — |
| EstimatedTime | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | o | — | ✅ |
| LearningObjectives | o | ✅ | ✅ | o | o | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| KnowledgeCoverage | — | ✅ | ✅ | o | — | ✅ | ✅ | ✅ | ✅ | o | ✅ | — |
| AssessmentMapping | ✅ | ✅ | ✅ | o | o | ✅ | ✅ | ✅ | ✅ | o | ✅ | ✅ |
| Tags | o | o | o | o | o | o | ✅ | ✅ | ✅ | ✅ | o | — |
| Images | o | o | o | o | — | o | ✅ | ✅ | — | — | — | — |
| References | ✅ | ✅ | ✅ | o | ✅ | ✅ | ✅ | ✅ | o | o | — | — |
| ContentStatus | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| CreatedByAI | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | o | o | — | — |
| ReviewedByHuman | ✅ | ✅ | — | ✅ | ✅ | ✅ | ✅ | ✅ | o | o | — | — |
| FactChecked | ✅ | ✅ | — | ✅ | ✅ | ✅ | ✅ | ✅ | o | — | — | — |
| CrossReferences | o | o | — | o | o | o | ✅ | ✅ | o | ✅ | o | — |

---

## Appendix B — โครงสร้างเอกสารชุดนี้

| ไฟล์ | บทบาท |
|---|---|
| `content_template_v2.md` (this) | templates + metadata spec + codes + types |
| `content_style_guide_v2.md` | naming dict + AI workflow + checklist + mistakes |
| `content_template_v2_report.md` | objectives + readiness + risk + migration |
