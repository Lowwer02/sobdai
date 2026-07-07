# Content Template v2 — Report

> **Companion to:** `content_template_v2.md` + `content_style_guide_v2.md`
> **Session:** Sobdai 6.13.2 (DESIGN ONLY)

---

## 1. Objectives

1. **แก้ปัญหา granularity** — Subject + Topic ยังไม่พอสำหรับ Question Picker (admin ต้องการ filter ถึงระดับ "พ.ร.บ.การอุดมศึกษา พ.ศ.2562" ไม่ใช่แค่ "กฎหมาย")
2. **เพิ่ม Document layer** โดยไม่ replace Subject/Topic — additive only, backward compatible
3. **กำหนด DocumentCode** เป็น stable unique ID เพื่อ dedup, search, import, reference
4. **สร้างมาตรฐาน content production** — templates + style guide สำหรับ human + AI

---

## 2. Roadmap Summary

| ส่วน | สถานะ | ไฟล์ |
|---|---|---|
| **Metadata schema** (15 fields) | ✅ defined | `content_template_v2.md` |
| **DocumentCode format** (`SUBJECT-TOPIC-YEAR`) | ✅ defined | `content_template_v2.md` |
| **9 templates** (Question/Summary/NotebookLM/Bulk/AI×2/Reference/Image/Metadata) | ✅ defined | `content_template_v2.md` |
| **15 style guide sections** | ✅ defined | `content_style_guide_v2.md` |
| **Quality checklist** | ✅ defined | `content_style_guide_v2.md` |
| **Common mistakes** | ✅ defined | `content_style_guide_v2.md` |
| Implementation (DB/code) | ❌ future sessions | — |

---

## 3. Metadata Additions (key change)

```
Before (Subject Foundation):
  Subject  →  Topic  →  Question / Summary

After (Content Template v2):
  Subject  →  Topic  →  Document (DocumentCode)  →  Question / Summary
```

### New fields
| Field | Type | Required | Notes |
|---|---|---|---|
| `Document` | text | yes | ชื่อเอกสารเต็ม — เปลี่ยนได้เมื่อชื่อทางการเปลี่ยน |
| `DocumentCode` | code | yes | stable ID (`LAW-HED-2562`) — ไม่เปลี่ยนตลอดอายุ |

### ทำไมต้องแยก Document ออกจาก Topic
- Topic = กว้าง ("กฎหมายการอุดมศึกษา") ครอบหลายเอกสาร
- Document = เฉพาะเจาะจง ("พ.ร.บ.การอุดมศึกษา พ.ศ.2562")
- ผู้ดูแลระบบ filter Question Picker ที่ระดับ Document ได้ → ลดเวลาค้นหาอย่างมาก

### ทำไมต้องมี DocumentCode แยก
- Document Name เปลี่ยนได้ (แก้ไขทางการ, เวอร์ชันใหม่)
- DocumentCode เสถียร → ใช้ dedup, search, import, cross-reference
- ตัวอย่าง: `LAW-HED-2562` (Document อาจเรียก "พระราชบัญญัติ..." หรือ "Act..." ในเอกสารอ้างอิง — Code เดียวกันเสมอ)

---

## 4. Recommended Phases (Implementation roadmap)

> ไม่ใช่งาน session นี้ — เป็นแนะนำสำหรับ session ถัดไป

### Phase A — Documentation (DONE ใน session นี้)
- ✅ Template + Style Guide พร้อมใช้เป็นมาตรฐาน content production

### Phase B — DB Foundation (next session — safe, additive)
- เพิ่ม `documents` table (id, document_code UNIQUE, name, topic_id, subject_id, version, ...)
- เพิ่ม `questions.document_id` (nullable FK) + `summaries.document_id` (nullable FK)
- ยังไม่แตะ flow เดิม (fallback ใช้ `subject` text ถ้าไม่มี document_id)

### Phase C — Backfill + Admin
- Backfill script: map (subject, topic, document name) → document_id
- Admin CRUD สำหรับ `documents`
- Document dropdown ใน Question/Summary form (เสริม subject/topic)
- Document filter ใน Question Picker + Summary Navigation

### Phase D — Import Pipeline
- ปรับ markdown import ให้อ่าน `document_code` จาก front-matter
- Bulk import รองรับ DocumentCode dedup
- NotebookLM prompt ใช้จริง

### Phase E — Content Production
- ทีม content เริ่มผลิตตาม template + style guide
- Quality checklist บังคับก่อน publish

---

## 5. Risk Analysis

| Risk | ระดับ | วิธีลด |
|---|---|---|
| **DocumentCode ซ้ำ** (duplicate) | สูง | `unique` constraint + import dedup + admin ตรวจก่อน insert |
| **Backfill ผิด** (map Document ผิด) | ปานกลาง | dry-run + admin review + dual-read fallback |
| **Document Name เปลี่ยน** | ปานกลาง | DocumentCode stable — ไม่กระทบ reference ที่อ้าง Code |
| **AI สร้าง DocumentCode ผิด format** | ต่ำ | style guide ชัด + parser validate ใน import |
| **กระทบ Subject Foundation เดิม** | ต่ำ | additive — ไม่แตะ `lib/subjects.ts` + `subject` field |

---

## 6. Performance Considerations

| ข้อ | วิธีรักษา |
|---|---|
| **No new query per page** | `document_id` FK เป็น join ปกติ — ไม่ใช่ additional query |
| **Question Picker filter** | ใช้ DocumentCode filter ใน query เดียวกับเดิม (เหมือน subject filter) |
| **No bundle bloat** | เป็น data layer ไม่ใช่ client JS |
| **ISR preserved** | homepage/catalog ไม่กระทบ (Document อยู่ใน content layer) |
| **Search performance** | index บน `documents(document_code)` + `questions.document_id` |

---

## 7. Regression Risks

| ระบบ | Risk | วิธีป้องกัน |
|---|---|---|
| Subject Foundation (`lib/subjects.ts`) | ❌ ไม่กระทบ | additive — ไม่แตะ |
| Question/Summary filter ปัจจุบัน | ❌ ไม่กระทบ | filter เดิมยังทำงาน; Document filter เป็น optional เพิ่ม |
| Markdown renderer | ❌ ไม่กระทบ | Document เป็น metadata ไม่ใช่ render logic |
| Exam Runtime | ❌ ไม่กระทบ | runtime ไม่ได้อ่าน Document |
| Performance (ISR/RPC/proxy) | ❌ ไม่กระทบ | DB layer additive |
| Beta | ❌ ไม่กระทบ | เอกสารเท่านั้น — ไม่มี code/migration |

---

## 8. Recommended Next Sessions

| Session | ทำอะไร | Phase | Risk |
|---|---|---|---|
| **6.14.x** — Documents Table | สร้าง `documents` table + `document_id` FK nullable + RLS | B | ต่ำ (additive) |
| **6.15.x** — Document Backfill | map (subject,topic,document name) → document_id + admin review | C | ปานกลาง |
| **6.16.x** — Admin Document CRUD | admin route + dropdown + filter in Question Picker/Summary Nav | C | ต่ำ |
| **6.17.x** — Import Pipeline v2 | markdown import อ่าน `document_code` + dedup + bulk import | D | ปานกลาง |
| **6.18.x** — Content Production Onboarding | train content team + first batch using template | E | ต่ำ |

> **คำแนะนำ:** ทำ Phase B (Documents Table) ก่อน — additive + safe ระหว่าง Beta → แม็ปได้เลยทันทีที่มีข้อมูลในตาราง

---

## 9. Build Verification

> **หมายเหตุ:** session นี้เป็น DESIGN ONLY — ไม่มี code change → ไม่ต้อง build

```
$ ls content_template_v2.md content_style_guide_v2.md content_template_v2_report.md
✓ 3 deliverables created
✓ 0 code changes
✓ 0 schema changes
✓ 0 dependency changes
```

---

## Appendix: Compliance กับ Task Constraint

| Constraint | สถานะ |
|---|---|
| DESIGN ONLY | ✅ |
| No SQL / code / migration | ✅ |
| No parser/admin/runtime/build/perf/DB changes | ✅ |
| ไม่ replace Subject/Topic (add only Document + DocumentCode) | ✅ |
| 3 deliverables (template + style guide + report) | ✅ |
| รวม templates: Question/Summary/NotebookLM/Bulk/AI×2/Reference/Image/Metadata | ✅ (9 templates) |
| รวม style guide: naming + 12 rule sections + checklist + mistakes | ✅ (15 sections) |
| Backward compatibility | ✅ — additive ไม่ทำลายของเดิม |
