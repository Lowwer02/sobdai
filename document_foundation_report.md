# Document Foundation — Report

> **Session:** Sobdai 6.13.4 (SAFE — additive only)
> **Change:** Introduce `document` as first-class metadata on Questions + Summaries
> **Compatibility:** 100% backward compatible — no redesign, no M:N, no FK, no runtime change

---

## 1. Objectives

1. เพิ่ม `document TEXT NULL` ใน `questions` + `summaries` (additive migration เดียว)
2. Admin UI: แสดง field + filter Document ใน Questions / Summaries / Question Picker
3. Importer: รองรับ `Document:` ใน frontmatter (optional)
4. Backward compatible — content เก่าที่ไม่มี document ยังทำงานได้ (NULL)

---

## 2. Files Modified

| ไฟล์ | การเปลี่ยน |
|---|---|
| `supabase/migrations/019_document_metadata.sql` | **สร้างใหม่** — `document TEXT NULL` ใน questions + summaries |
| `app/admin/questions/[id]/EditQuestionClient.tsx` | + Document input (ระหว่าง Subject และ Law) |
| `app/admin/questions/actions.ts` | + `document` field ใน update payload |
| `app/admin/questions/page.tsx` | + `documentFilter` + unique scan + pass prop |
| `app/admin/questions/QuestionsClient.tsx` | + prop + Document filter dropdown + table column + row display |
| `app/admin/summaries/page.tsx` | + `documentFilter` + unique scan + pass prop |
| `app/admin/summaries/SummariesClient.tsx` | + prop + Document filter dropdown + column + row display |
| `components/admin/SummaryEditor.tsx` | + Document field (ระหว่าง Subject และ Law) + interface + state |
| `app/admin/exam-sets/questions.action.ts` | + `document` filter + return + unique |
| `components/admin/QuestionPicker.tsx` | + `document` state + dropdown (ระหว่าง Subject และ Topic) |
| `lib/summaryParser.ts` | + `document` ใน SummaryMetadata interface + parse |
| `app/admin/summaries/import/actions.ts` | + `document` ใน insert payload |

---

## 3. Migration Summary

```sql
ALTER TABLE public.questions  ADD COLUMN IF NOT EXISTS document text;
ALTER TABLE public.summaries  ADD COLUMN IF NOT EXISTS document text;
```

- ✅ Additive (IF NOT EXISTS)
- ✅ Nullable — existing rows = NULL
- ✅ No FK, no NOT NULL, no normalization, no documents table
- ✅ No existing data touched

---

## 4. Browser QA Checklist

### Questions Admin
- [ ] Edit question → Document input อยู่ระหว่าง Subject และ Law
- [ ] ใส่ Document + save → ค่าเก็บใน DB
- [ ] Questions table → column ใหม่ "Subject / Document / Topic"
- [ ] Question มี document → แสดงชื่อเอกสาร
- [ ] Question ไม่มี document → แสดง "ไม่มี Document" (italic)
- [ ] Document filter dropdown ทำงาน + "ยังไม่กำหนด" สำหรับ NULL

### Summaries Admin
- [ ] Summary list → column "Subject / Document"
- [ ] Summary มี document → แสดง
- [ ] Summary ไม่มี document → แสดง "ไม่มี Document"
- [ ] Document filter dropdown ทำงาน
- [ ] Create/Edit (SummaryEditor) → Document field ระหว่าง Subject และ Law

### Question Picker
- [ ] Document filter dropdown อยู่หลัง Subject (priority: Search/Subject/Document/Topic)
- [ ] เลือก Document → filter ทำงาน (server-side)
- [ ] Question rows แสดง document

### Importer
- [ ] Markdown มี `Document:` ใน frontmatter → import ได้ ค่าเข้า DB
- [ ] Markdown ไม่มี `Document:` → import ได้ ค่า = NULL (backward compatible)

---

## 5. Regression Analysis

| ระบบ | กระทบ? | เหตุผล |
|---|---|---|
| Auth / Orders / Payment | ❌ | ไม่แตะ |
| Exam Runtime / Practice / Mock | ❌ | ไม่แตะ |
| Markdown Renderer | ❌ | Document เป็น metadata ไม่ใช่ render |
| Package schema / Exam Set / Blueprint | ❌ | ไม่แตะ (constraint) |
| M:N refactor | ❌ | ไม่ทำ (constraint) |
| documents table / FK | ❌ | ไม่สร้าง (constraint) |
| **ISR** (homepage + /packages) | ❌ | build ยืนยันยัง ○ Static 5m |
| RPC / Promise.all / Proxy | ❌ | ไม่แตะ |
| Content เก่า (ไม่มี document) | ❌ | NULL fallback — ยังทำงาน |

---

## 6. Performance Verification

| ข้อ | ผล |
|---|---|
| **No extra queries** | Document filter รวมใน main query (เดียวกับ subject/law/topic) ไม่ใช่ query แยก |
| **unique scan** | ใช้ select เดียวกับ category/law/topic (questions) + 1 scan เล็ก (summaries) |
| **No new API** | ✅ |
| **No new dependency** | ✅ |
| **Bundle** | minimal — เพิ่งแค่ field + dropdown |
| **ISR preserved** | ✅ homepage + /packages ยัง ○ Static 5m |

---

## 7. Build Verification

```
$ npx tsc --noEmit   → 0 errors
$ npx next build     → ✓ Compiled successfully in 2.6s (36/36 routes)
```

- 0 TypeScript errors
- 0 Build errors
- `/` + `/packages` ยัง ○ Static Revalidate 5m

---

## 8. Success Criteria

| เกณฑ์ | สถานะ |
|---|---|
| Questions กรองตาม Document ได้ | ✅ (filter dropdown + server-side) |
| Summaries เก็บ Document | ✅ (column + form + table) |
| Importer รองรับ Document | ✅ (frontmatter `Document:`) |
| Backward compatible | ✅ (NULL fallback, เก่ายังทำงาน) |
| ไม่มี runtime regression | ✅ (Exam/Runtime ไม่แตะ) |
| ไม่ redesign | ✅ (additive only, ไม่ M:N/FK/table) |

---

## 9. Future Notes

- Phase ถัดไป (Documents Table) สามารถ normalize `document` text → `document_id` FK ได้โดยใช้ pattern dual-read/dual-write
- DocumentCode (จาก `content_template_v2.md`) สามารถเก็บใน `document` field ได้ทันที (เป็น text) ก่อน normalize
- ไม่จำเป็นต้อง backfill ตอนนี้ — content ใหม่กรอกเอง, content เก่า NULL ได้
