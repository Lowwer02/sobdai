# Content Architecture Foundation

> **Status:** DESIGN ONLY — architecture proposal สำหรับ phase ถัดไป
> **ไม่ใช่ production code** ไม่มี SQL พร้อมรัน / React / migration
> **Session:** Sobdai 6.12.5

---

## 0. Executive Summary

ปัจจุบัน Sobdai เป็น single-package learning platform: `summaries` และ `exam_sets` ผูกติดกับ `package` เดียวแบบ **NOT NULL FK** (`summaries.package_id`, `exam_sets.package_id`) ส่วน `questions` มี M:N ผ่าน `exam_set_questions` แต่ `subject/topic/tags` เป็น free-text → ไม่ normalized

เมื่อ Sobdai โตเป็น multi-package ecosystem (เช่น "นักวิเคราะห์นโยบายและแผน" ของ อว. และ พาณิชย์ จะใช้ PDPA / Good Governance / สารบรรณ ร่วมกัน) โมเดลปัจจุบันบังคับให้ **duplicate content ข้าม package** → เกิด drift, ความเน่า, ความยากในการ update

**Proposal หลัก:** แยก **Product** (Package = สินค้าที่ขาย) ออกจาก **Content** (Summary/Question = คลังความรู้ที่ reuse ได้) โดย Package "อ้างอิง" content ผ่าน join table แทนที่จะเป็นเจ้าของ (own) content

โครงสร้างนี้รองรับ 100+ organizations, 1000+ packages, 100,000+ questions โดยไม่ต้อง redesign DB อีก

---

## 1. Product Vision

### ภาพปัจจุบัน
```
Package = Product + Content (รวมในที่เดียว)
  ├─ Summaries (own)        ← package_id NOT NULL
  ├─ Exam Sets (own)        ← package_id NOT NULL
  │    └─ Questions (M:N)   ← ผ่าน exam_set_questions
  └─ org_name, position     ← FK
```

### ภาพอนาคต
```
Product Layer (ขายได้, มี price, มี owner)
  └─ Package (references content, ไม่ own content)

Content Layer (คลังความรู้กลาง, reuse ข้าม package)
  ├─ Summary (many-to-many ↔ Package)
  ├─ Question (many-to-many ↔ Package ผ่าน Exam Set)
  ├─ Subject / Topic (taxonomy, normalized)
  └─ Tags (free-form cross-cutting)
```

### นิยาม Entity ใหม่

| Entity | คืออะไร | ตัวอย่าง |
|---|---|---|
| **Package** | **Product** ที่ขาย — ระดับ "ซื้อแพ็กเกจอะไร" | "นักวิเคราะห์นโยบายและแผน สำนักงานปลัด อว. ปี 2568" |
| **Summary** | เนื้อหาสรุป หน่วยเดียว ในคลังกลาง | "PDPA คืออะไร" (ใช้ใน 10 package ได้) |
| **Question** | ข้อสอบข้อเดียว ในคลังกลาง | "ข้อใดผิดเกี่ยวกับสิทธิเจ้าของข้อมูล" (ใช้ใน N exam set) |
| **Exam Set** | ชุดข้อสอบ = collection of Questions ที่จัดกลุ่ม | "ชุดที่ 1: กฎหมายพื้นฐาน 50 ข้อ" |

### ทำไม Package คือ Product ไม่ใช่ Content?
- Package มี **price / discount / purchase (orders) / license 1 ปี** → สินค้า
- Package **ไม่ได้เกิดเนื้อหาเอง** แค่ "เลือกมาวาง" และ "ตั้งราคา"
- Content (Summary/Question) มีคุณค่า **อิสระจากการขาย** — ใช้ซ้ำได้ทั้งใน package ฟรี, paid, หรือเก่า
- การแยกชั้นนี้ทำให้ content team สร้าง/แก้ content โดยไม่ต้องซื้อ/ขาย package แต่ละครั้ง

---

## 2. Domain Model

### Entity Responsibilities

| Entity | Responsibility | Key Relationships |
|---|---|---|
| **Organization** | หน่วยงานราชการ (กรม/กระทรวง) | → has many Positions |
| **Position** | ตำแหน่งที่สอบ | → belongs to Organization, → has many Packages |
| **Package** | Product ที่ขาย — references content | → org + position + exam_year + price; **references** Summaries + Exam Sets |
| **Subject** | วิชา (taxonomy level 1) | → has many Topics; **referenced by** Summaries + Questions |
| **Topic** | หัวข้อ (taxonomy level 2) | → belongs to Subject; **referenced by** Summaries + Questions |
| **Tags** | free-form labels ข้ามสาย | → attached to Summaries + Questions (M:N) |
| **Summary** | เนื้อหาสรุปหน่วยเดียว | → Subject + Topic; **M:N with Package** (package_summaries) |
| **Question** | ข้อสอบข้อเดียว | → Subject + Topic; **M:N with Exam Set** (exam_set_questions เดิม) |
| **Exam Set** | ชุดข้อสอด = group of Questions | → **M:N with Package** (package_exam_sets) |
| **Blueprint** | น้ำหนักสอบต่อ Subject ของ Package | → belongs to Package; → list of (Subject, weight%) |

### ER Diagram (concept)

```
Organization ──< Position ──< Package >──┐
                                          │ references (M:N)
                                          │
Subject ──< Topic          ┌─────────────┴────────────┐
   ▲          ▲            │                          │
   │          │            ▼                          ▼
   │          │        package_summaries         package_exam_sets
   │          │            │                          │
   │          │            ▼                          ▼
   │          │        Summary ──┐               Exam Set ──┐
   │          │                   │                          │
   └──────────┴─── referenced ────┴──── referenced ──────────┤
                                                            │
                                              exam_set_questions (M:N เดิม)
                                                            │
                                                            ▼
                                                        Question
```

---

## 3. Content Hierarchy

```
Organization (กระทรวง/กรม)
    ↓ has many
Position (ตำแหน่ง)
    ↓ has many
Package (Product — เลือก + ตั้งราคา)
    ↓ references (M:N — ไม่ own)
Subject (วิชา — กฎหมาย, นโยบาย, เศรษฐศาสตร์)
    ↓ has many
Topic (หัวข้อภายในวิชา — PDPA, สารบรรณ)
    ↓ referenced by
Summary / Question (หน่วย content จริง)
```

### ทำไม hierarchy นี้ scalable?

1. **แต่ละชั้นมี boundary ชัดเจน** — Organization ไม่ผสมกับ Content
2. **Taxonomy (Subject/Topic) แยกจาก Product (Package)** → สามารถเพิ่ม Subject ใหม่โดยไม่แตะ Package
3. **Content (Summary/Question) อยู่ต่ำสุด** → reuse ข้ามทุกชั้นบน ผ่าน reference ไม่ใช่ ownership
4. **Package ผูกหลาย Subject/Topic พร้อมกันได้** → ตอบโจทย์ "Package ประกอบด้วยหลายวิชา"
5. **เพิ่มชั้นใหม่ได้** (เช่น Sub-Topic, Module) โดยไม่ทำลายชั้นเดิม เพราะเป็น reference-based

### ตัวอย่าง
```
อว. (Organization)
  └─ นักวิเคราะห์นโยบายและแผน (Position)
       └─ Package ปี 2568 (Product)
            ├─ references Subject "กฎหมาย"
            │    └─ Topic "PDPA"
            │         └─ Summary "PDPA คืออะไร"
            │         └─ Question "ข้อใดถูกเกี่ยวกับ PDPA"
            └─ references Subject "การบริหาร"
                 └─ Topic "Good Governance"
                      └─ Summary "หลักธรรมาภิบาล 6 ข้อ"

พาณิชย์ (Organization)
  └─ นักวิเคราะห์นโยบายและแผน (Position)
       └─ Package ปี 2568 (Product)
            └─ references Subject "กฎหมาย"
                 └─ Topic "PDPA"     ← reuse Summary/Question เดียวกัน!
```

---

## 4. Reusable Knowledge Base

### ปัญหาปัจจุบัน (anti-pattern)
```sql
-- summaries.package_id NOT NULL → Summary อยู่ใน package เดียว
-- ต้องการใช้ PDPA summary ใน 5 packages → copy 5 ครั้ง
summaries (id, package_id NOT NULL, content_md, ...)
```
ปัญหาที่ตามมา:
- แก้ PDPA ใน package A → package B-E เน่า
- ไม่รู้ว่า content ไหน "เดียวกัน"
- analytics รวมไม่ได้ (ผู้ใช้ทำ PDPA ในหลาย package → นับเป็น content คนละอัน)

### แนวทาง: Reference, Don't Duplicate

**Summary ↔ Package (M:N)**
```
package_summaries (proposal)
  package_id  FK → packages
  summary_id  FK → summaries
  sort_order  int
  PRIMARY KEY (package_id, summary_id)
```
→ Summary 1 อัน ใช้ใน N packages ได้
→ Package "เลือก" summaries ที่จะวาง ไม่ใช่ "เป็นเจ้าของ"

**Question ↔ Package (ผ่าน Exam Set)** — Question ในคลังกลาง, แต่ละ Exam Set เลือกมาวาง
```
exam_set_questions (เดิม — ใช้ได้แล้ว)
  exam_set_id, question_id (M:N)
```
→ Question 1 ข้อใช้ในหลาย exam set ของหลาย package

**Exam Set ↔ Package (M:N)**
```
package_exam_sets (proposal)
  package_id, exam_set_id
```
→ Exam Set 1 ชุดใช้ข้าม package ได้ (เช่น "ชุด PDPA 30 ข้อ")

### กฎทอง
> **Package = Product ที่ references Content เท่านั้น**
> Content อยู่ในคลังกลาง, package เลือกมาวาง + ตั้งราคา + จัดลำดับ

---

## 5. Subject Proposal

### รายการ Subject เริ่มต้น (Taxonomy Level 1)

| รหัส (code) | ชื่อไทย | เหตุผล |
|---|---|---|
| `law` | กฎหมาย | มีในทุก package ราชการ (กฎหมายพื้นฐาน + เฉพาะ) |
| `policy` | นโยบายและแผน | ส่วนกลาง — วิเคราะห์นโยบาย, แผนกลยุทธ์ |
| `economics` | เศรษฐศาสตร์ | ทุก package สาย policy/econ |
| `administration` | การบริหาร | ธรรมาภิบาล, ระเบียบ, บริหารราชการ |
| `english` | ภาษาอังกฤษ | มีในหลาย position |
| `technology` | เทคโนโลยีสารสนเทศ | PDPA, digital gov, AI |
| `math` | คณิตศาสตร์ | บาง position (สายคำนวณ) |

### ทำไมเป็น normalized table ไม่ใช่ free text?
- ปัจจุบัน `summaries.subject` / `questions.subject` เป็น **free text** → "กฎหมาย", "กม.", "Law" อาจเป็นคนละคนเขียน
- normalize → `subjects` table + FK → ค้นหา/filter/analytics แม่นยำ

### Subject schema (proposal)
```
subjects
  id, code (unique), name_th, name_en (nullable),
  description, sort_order, created_at
```

---

## 6. Topic Proposal

Topic = หัวข้อย่อยภายใน Subject (Taxonomy Level 2)

```
Subject "กฎหมาย" (law)
  ├─ Topic "PDPA"
  ├─ Topic "สารบรรณ"
  ├─ Topic "ข้อมูลข่าวสาร"
  ├─ Topic "พ.ร.บ. ระเบียบบริหารราชการแผ่นดิน"
  ├─ Topic "พ.ร.บ. อุดมศึกษา"
  ├─ Topic "กฎหมายปกครอง"
  └─ Topic "รัฐธรรมนูญ"

Subject "การบริหาร"
  ├─ Topic "Good Governance"
  ├─ Topic "ธรรมาภิบาล"
  ├─ Topic "การตัดสินใจ"
  └─ Topic "การบริหารงานบุคคล"
```

### ความสัมพันธ์
- Topic belongs to **หนึ่ง** Subject (FK `subject_id`)
- Subject has many Topics
- Summary/Question references หนึ่ง Topic หลัก (FK `topic_id`) แต่สามารถมีได้หลายผ่าน Tags

### Topic schema (proposal)
```
topics
  id, subject_id (FK), code, name_th, name_en (nullable),
  description, sort_order, created_at
  UNIQUE (subject_id, code)
```

### ทำไมต้องแยก Topic จาก Subject?
- Subject = ระดับวิชา (stable มาก — ปีต่อปีแทบไม่เปลี่ยน)
- Topic = ระดับหัวข้อ (เปลี่ยนได้บ่อย — มีกฎหมายใหม่ มี PDPA เพิ่ม)
- การแยกชั้นทำให้: filter ทีละวิชา หรือ drill-down ทีละหัวข้อได้

---

## 7. Tags Proposal

### นิยาม
Tags = **cross-cutting labels** ที่ตัดข้าม Subject/Topic hierarchy

### ความต่าง Topic vs Tags

| | Topic | Tags |
|---|---|---|
| Hierarchy | อยู่ใต้ Subject | ไม่มี parent |
| Cardinality | 1 content → 1 topic | 1 content → N tags |
| การสร้าง | admin-defined (curated) | free-form (อิงความหมาย/ปี/บริบท) |
| ตัวอย่าง | "PDPA" | `2562`, `ข้อมูลส่วนบุคคล`, `Privacy`, `สำนักงานปลัด`, `แบบทดสอบ` |
| วัตถุประสงค์ | categorize เชิงโครงสร้าง | cross-reference + search |

### ตัวอย่าง
```
Summary: "PDPA คืออะไร"
  Subject: กฎหมาย
  Topic:   PDPA
  Tags:    [2562, ข้อมูลส่วนบุคคล, Privacy, สำนักงานปลัด อว.]

Question: "ข้อใดเป็นฐานข้อมูลส่วนบุคคล"
  Subject: กฎหมาย
  Topic:   PDPA
  Tags:    [2562, ข้อมูลส่วนบุคคล, ข้อสอบตัวอย่าง]
```

### Search Strategy

| คำค้น | กลไก | ผลลัพธ์ |
|---|---|---|
| "PDPA" (คำหลัก) | ค้นใน `topic.name` + `tags` + `title` | ทุก content ที่เกี่ยว PDPA ข้าม package |
| วิชา "กฎหมาย" | filter `subject_id` | ทุก content ในวิชากฎหมาย |
| "2562" (ปี) | filter `tags @> ARRAY['2562']` | content ที่อ้างกฎหมายปี 2562 |
| "สำนักงานปลัด" | filter tags | content ที่ tag บอกว่าเกี่ยวกับสำนักงานปลัด |

> ใช้ Postgres **GIN index บน `tags[]`** (มีอยู่แล้วใน `questions.tags`) → search เร็ว

---

## 8. Blueprint Proposal

### นิยาม
Blueprint = **น้ำหนักสอบต่อ Subject/Topic** ของ Package

```
Package "นักวิเคราะห์นโยบายและแผน อว. ปี 2568"
  Blueprint:
    กฎหมาย           20%
    ├─ PDPA          8%
    ├─ สารบรรณ       7%
    └─ อื่น ๆ         5%
    นโยบายและแผน     30%
    เศรษฐศาสตร์      20%
    การบริหาร        15%
    └─ Good Gov      10%
    ภาษาอังกฤษ       15%
```

### Blueprint ไม่ใช่ content
Blueprint **define น้ำหนัก** เพื่อ:
- สร้าง Mock Exam ตามสัดส่วนจริง (auto-pick questions ตาม weight)
- แสดง "ผู้ใช้ควรเน้นวิชาอะไร" บน dashboard
- วิเคราะห์ weak topics เทียบกับน้ำหนักของแต่ละวิชา

แต่ **ไม่ duplicate content** — Blueprint อ้างอิง Subject/Topic ที่มีอยู่ ไม่ได้สร้าง content เอง

### Blueprint schema (proposal)
```
package_blueprints
  id, package_id (FK)
  subject_id (FK), topic_id (nullable FK)
  weight_pct numeric(5,2) check (0-100)
  PRIMARY KEY (package_id, subject_id, topic_id)
```

### Use case
- Mock Exam generator: `SELECT questions ... ORDER BY blueprint_weight DESC LIMIT N`
- Dashboard: "แพ็กเกจนี้เน้น กฎหมาย 20% → คุณทำได้ 12% → ต้องทบทวน"

---

## 9. Admin UX Proposal

### โครงสร้างหน้า Admin ใหม่ (แยก content ออกจาก package)

```
Admin Panel
├─ Organizations       (เหมือนเดิม)
├─ Positions           (เหมือนเดิม)
│
├─ Taxonomy            [ใหม่]
│   ├─ Subjects        (CRUD Subject)
│   └─ Topics          (CRUD Topic ใต้ Subject)
│
├─ Content (คลังกลาง)  [ปรับ]
│   ├─ Summaries       (ไม่ผูก package — มี Subject/Topic/Tags)
│   └─ Questions       (ไม่ผูก package — มี Subject/Topic/Tags)
│
├─ Exam Sets           (M:N กับ Package ได้ — ไม่ own)
│
├─ Packages            [เปลี่ยนบทบาท]
│   ├─ Metadata (price, org, position, year)
│   ├─ Reference Summaries (เลือกจากคลังกลาง)
│   ├─ Reference Exam Sets (เลือกจากคลังกลาง)
│   └─ Blueprint        (น้ำหนัก Subject/Topic)
│
└─ Users / Orders / Audit (เหมือนเดิม)
```

### หลักการสำคัญ

| ส่วน | มี Subject/Topic? | เหตุผล |
|---|---|---|
| **Questions** | ✅ | content ต้องถูก categorize เพื่อ reuse + analytics |
| **Summaries** | ✅ | เหมือนกัน |
| **Exam Sets** | ⚠️ optional | ส่วนใหญ่สืบทอดจาก questions ข้างใน |
| **Packages** | ❌ | Package **ไม่มี Subject/Topic เป็นของตัวเอง** — อ้างอิง content ที่มี taxonomy อยู่แล้ว |

> Package ไม่ควรมี `subject_id` ของตัวเองเพราะมันจะ conflict กับ subject ของ content ที่อ้างอิง — ใช้ Blueprint ในการกำหนดน้ำหนักแทน

### Workflow ตัวอย่าง: สร้าง Package ใหม่
1. Admin สร้าง Package metadata (org, position, year, price)
2. คลิก "เพิ่ม Summaries" → **เลือกจากคลัง** (filter by Subject/Topic/Tags)
3. คลิก "เพิ่ม Exam Set" → **เลือกจากคลัง** หรือสร้างใหม่
4. กำหนด Blueprint (น้ำหนักแต่ละ Subject)
5. Publish

→ ไม่มีขั้นตอน "สร้าง content ใหม่ใน package" ทั้งหมด reuse

---

## 10. Import Workflow

```
NotebookLM / แหล่งเอกสาร
        ↓
    Markdown (.md)
        ↓
[Import Pipeline — ปรับ]
        ↓
   ┌────┴────┐
   ↓         ↓
Summary    Question
Import     Import
   │         │
   │  เลือก    │  เลือก
   │ Subject │ Subject
   │ Topic   │ Topic
   │ Tags    │ Tags
   ↓         ↓
[Admin Review Queue]
        ↓
   Publish (สู่คลังกลาง)
        ↓
   Package ใดก็ไป reference ได้
```

### จุดที่ต้องปรับจากปัจจุบัน
- Import ปัจจุบัน (เช่น `app/admin/summaries/import/`) ผูก `package_id` ตอน import → ต้องแก้เป็น "import เข้าคลังกลาง" ก่อน แล้วค่อย let admin เลือก package ทีหลัง
- Import ต้องถาม **Subject + Topic + Tags** ตอน import (หรือ infer จาก front-matter markdown)
- Support **bulk assign taxonomy** สำหรับ content ที่ import มาแล้วแต่ยังไม่มี subject

### Markdown Front-Matter (proposal)
```markdown
---
subject: law
topic: PDPA
tags: [2562, privacy, ข้อมูลส่วนบุคคล]
read_time: 8
---

# PDPA คืออะไร
เนื้อหา...
```
→ Import อ่าน front-matter ได้อัตโนมัติ (ใช้ gray-matter หรือ parser ที่มี)

---

## 11. Analytics Roadmap

เมื่อ Subject/Topic เป็น normalized + content อยู่ในคลังกลาง → analytics ทำได้โดย **ไม่ต้องเปลี่ยน Package**

### เป้าหมาย analytics (อ้างอิง Exam Dashboard architecture ก่อนหน้า)

| Feature | ต้องการอะไร | ทำงานยังไง |
|---|---|---|
| **Weak Topics** | per-answer tracking + question.topic_id | aggregate accuracy ตาม topic |
| **Continue Reading** | last_read per summary (cross-package) | ผู้ใช้อ่าน PDPA ใน package A → แนะ PDPA ใน package B ได้ |
| **Continue Practice** | last attempt + question.topic_id | กลับไปทำ topic ที่ยังไม่เสร็จ ข้าม package |
| **AI Recommendation** | subject/topic weakness + content catalog | "คุณอ่อน PDPA → ลองสรุป + ข้อสอบ PDPA จากคลัง" |
| **Progress Tracking** | mastery ต่อ topic | % mastery แต่ละ topic รวมข้าม package |

### ตัวอย่าง query (concept)
```sql
-- Weak topics ของผู้ใช้ (cross-package)
SELECT t.name, AVG(qa.is_correct::int) AS accuracy
FROM question_answers qa
JOIN questions q ON q.id = qa.question_id
JOIN topics t ON t.id = q.topic_id
WHERE qa.attempt_id IN (SELECT id FROM exam_attempts WHERE user_id = $1)
GROUP BY t.name
HAVING AVG(qa.is_correct::int) < 0.6
ORDER BY accuracy ASC;
```

→ ทำได้เพราะ **content อยู่ในคลังกลาง** + มี topic_id ที่ stable

---

## 12. Migration Strategy

ออกแบบให้ backward-compatible — ข้อมูลเก่าไม่หาย ไม่พัง

### Phase 1: Architecture (foundation, no behavior change)
- สร้างตารางใหม่: `subjects`, `topics`, `package_summaries`, `package_exam_sets`, `package_blueprints`
- **ยังไม่** แตะ `summaries.package_id` / `exam_sets.package_id` (เก็บไว้ทำ fallback)
- ยังไม่แตะ UI

### Phase 2: Subject Foundation
- เพิ่ม `subjects` + `topics` seed data (ตาม section 5/6)
- เพิ่ม `summaries.subject_id`, `summaries.topic_id`, `questions.subject_id`, `questions.topic_id` (nullable)
- Backfill: แปลง `summaries.subject` (free text) → `subject_id` ด้วย script + admin review
- ยังไม่ลบ `subject` text column (dual-write period)

### Phase 3: Question Import
- ปรับ import pipeline ให้ถาม Subject/Topic/Tags ตอน import
- import เข้าคลังกลาง ไม่ผูก package_id ตอน import
- ใช้ `exam_set_questions` (M:N) เดิมเชื่อม question ↔ exam set

### Phase 4: Summary Import
- ปรับ summary import ให้เข้าคลังกลาง
- เพิ่ม `package_summaries` M:N
- Backfill: แปลง `summaries.package_id` → `package_summaries` rows
- **เริ่ม dual-read**: UI อ่านจาก `package_summaries` ถ้ามี, fallback `package_id`

### Phase 5: Analytics
- ต้องการ `exam_attempts` + `question_answers` (จาก Exam Dashboard Phase 1-2)
- ใช้ subject/topic_id ที่ stable จาก Phase 2
- ไม่แต้ม Package เลย

### Phase 6: Blueprint
- เพิ่ม `package_blueprints`
- Admin กรอกน้ำหนัก per package
- Mock Exam generator ใช้ blueprint

### การรักษา compatibility
- ทุก phase มี **dual-write/dual-read period** ก่อน drop column เก่า
- `summaries.package_id` ไม่ drop จนกว่าทุก package จะ migrate ไปใช้ `package_summaries`
- ทุก migration มี `IF NOT EXISTS` + backfill script + rollback plan

---

## 13. Performance Considerations

| เงื่อนไข | แนวทาง |
|---|---|
| **No duplicated summaries** | M:N `package_summaries` — Summary 1 อันใช้หลาย package |
| **No duplicated questions** | M:N `exam_set_questions` (มีอยู่) + Question ในคลังกลาง |
| **Package lightweight** | Package row มีเฉพาะ metadata (price, year, refs) — content ไม่ได้เก็บใน package |
| **Search fast** | GIN index บน `tags[]` (มี) + btree บน `subject_id/topic_id` |
| **Analytics scalable** | RPC aggregate (pattern `getPackagePublicCounts` ที่มี) สำหรับ weak topics / mastery |
| **Reuse RPC pattern** | migration 016 (`get_package_public_counts`) เป็น template — proposal RPC `get_user_weak_topics`, `get_package_blueprint`, `get_summary_packages` |
| **Caching** | catalog ใช้ ISR (เหมือนเดิม); content ที่ reuse ข้าม package cache ได้ดีกว่าเพราะ stable |
| **Index proposals** | `package_summaries(package_id, summary_id)`, `package_exam_sets(package_id, exam_set_id)`, `questions(subject_id, topic_id)`, `summaries(subject_id, topic_id)` |

---

## 14. Future Expansion

เมื่อ architecture นี้ stable → ขยายได้โดย **ไม่ redesign DB**

### Scale targets
| Entity | Current | Target | รองรับโดย |
|---|---|---|---|
| Organizations | ~1-10 | 100+ | normalized table + index |
| Packages | ~1-5 | 1000+ | lightweight row + M:N refs |
| Questions | ~ hundreds | 100,000+ | M:N + taxonomy filter |
| Summaries | ~ tens | 5000+ | M:N + taxonomy |
| Users | ~ hundreds | 100,000+ | existing RLS |

### Feature ขยายได้

| Feature | ต้องการอะไรเพิ่ม | กระทบ DB? |
|---|---|---|
| **AI Recommendation** | subject/topic weakness + content catalog | ❌ ใช้ schema ที่ออกแบบไว้ |
| **Learning Dashboard** | attempt tracking + topic mastery | ❌ (Phase 1-2 exam_attempts) |
| **Flash Cards** | แปลง Question → flash card | ❌ Question มี content + explanation ครบ |
| **Mind Maps** | สร้าง graph จาก Topic hierarchy | ❌ ใช้ Subject → Topic |
| **PDF Export** | render Summary + Question เป็น PDF | ❌ ใช้ content ที่มี |
| **Cross-package search** | ค้น content ข้าม package | ❌ ใช้คลังกลาง |
| **Bundle pricing** | ขาย 3 package รวมกัน | ⚠️ เพิ่ม `bundles` table (ภายนอก scope นี้) |
| **Content versioning** | content หลายเวอร์ชัน | ⚠️ เพิ่ม `summary_versions` ในอนาคต |

### ทำไมไม่ต้อง redesign?
- ทุก entity แยก boundary ชัด → เพิ่ม feature ไม่กระทบ entity อื่น
- ใช้ reference (M:N) ไม่ใช่ ownership → เพิ่ม relation ใหม่ได้โดยไม่แตะของเดิม
- Taxonomy เป็นชั้นแยก → เพิ่ม Sub-Topic/Module ได้ (self-FK)
- Product (Package) แยกจาก Content → ระบบขาย + ระบบเนื้อหาพัฒนาคนละทางได้

---

## Appendix: สรุป Proposal สำหรับ migration ในอนาคต

> ⚠️ ไม่ใช่ SQL พร้อมรัน — เป็น sketch สำหรับ reference ตอน implement

### ตารางใหม่ที่ต้องสร้าง (ตาม phase)
1. `subjects` (id, code, name_th, name_en, description, sort_order)
2. `topics` (id, subject_id FK, code, name_th, name_en, description, sort_order)
3. `package_summaries` (package_id, summary_id, sort_order) — M:N
4. `package_exam_sets` (package_id, exam_set_id, sort_order) — M:N
5. `package_blueprints` (package_id, subject_id, topic_id nullable, weight_pct) — Blueprint

### ตารางเดิมที่ต้องเพิ่ม column
- `summaries` + `subject_id` (nullable FK), `topic_id` (nullable FK)
- `questions` + `subject_id` (nullable FK), `topic_id` (nullable FK)
- (ในอนาคต drop `subject`/`topic` free-text columns หลัง backfill + dual period)

### ตารางเดิมที่ต้อง drop NOT NULL (หลัง Phase 4)
- `summaries.package_id` → nullable + ใช้ `package_summaries` แทน
- `exam_sets.package_id` → nullable + ใช้ `package_exam_sets` แทน

### RPC proposal (pattern `get_package_public_counts`)
- `get_user_weak_topics(user_id uuid)` — analytics
- `get_package_blueprint(package_id uuid)` — Mock generator
- `get_summary_packages(summary_id uuid)` — "Summary นี้ใช้ในกี่ package"

---

## Appendix: อ้างอิงไฟล์เดิมที่เกี่ยวข้อง

| ไฟล์ | บทบาทในการ implement อนาคต |
|---|---|
| `supabase/migrations/001-017` | schema ปัจจุบัน (อ้างอิงสำหรับ migration ใหม่) |
| `supabase/migrations/016_package_counts_rpc.sql` | template สำหรับ RPC pattern |
| `app/admin/summaries/import/` | import pipeline (ปรับใน Phase 3-4) |
| `app/admin/questions/` + `summaries/` | admin UI (ปรับในแต่ละ phase) |
| `exam_dashboard_architecture.md` | analytics ที่จะใช้ taxonomy นี้ |
| `lib/publicData.ts` (RPC pattern) | template สำหรับ RPC client |

> **ย้ำ:** เอกสารนี้เป็น design การ implement แต่ละ phase เป็น task แยก ต้องมี plan review + migration review + QA
