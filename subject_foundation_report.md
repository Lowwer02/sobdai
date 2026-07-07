# Subject Foundation — Report

## Objective

ทำให้ Subject เป็น first-class content classification สำหรับ **Questions และ Summaries** — เป็น implementation แรกหลังจาก Content Architecture Foundation

**ขอบเขต:** Question Admin, Summary Admin, Question Picker, Summary Navigation, Search, Filters เท่านั้น

**SAFE:** ไม่แต่่ะ Package schema / Exam Set schema / Blueprint / M:N tables / runtime / analytics / orders / payments

---

## Files Modified

| ไฟล์ | การเปลี่ยน |
|---|---|
| `lib/subjects.ts` | **สร้างใหม่** — curated subject list + helpers (`SUBJECTS`, `UNASSIGNED_SUBJECT`, `getSubjectLabel`, `getSubjectDropdownOptions`, `isUnassignedSubject`) |
| `app/admin/questions/[id]/EditQuestionClient.tsx` | Subject `<input>` → `<select>` dropdown (curated) + legacy value preservation |
| `app/admin/questions/page.tsx` | เพิ่ม sentinel filter (null/empty = "ยังไม่กำหนด") + ลด `select('category, subject, law, topic')` scan เหลือ `('category, law, topic')` — **ลด query ลง** |
| `app/admin/questions/QuestionsClient.tsx` | subject dropdown options จาก curated list + row label ผ่าน `getSubjectLabel` + "ยังไม่กำหนด Subject" display + ลบ prop `uniqueSubjects` |
| `app/admin/summaries/page.tsx` | เพิ่ม `subjectFilter` + sentinel filter logic |
| `app/admin/summaries/SummariesClient.tsx` | เพิ่ม subject filter dropdown + Subject column + row label + "ยังไม่กำหนด Subject" |
| `components/admin/SummaryEditor.tsx` | Subject `<input>` → `<select>` dropdown (curated) + legacy value preservation |
| `components/admin/QuestionPicker.tsx` | subject dropdown จาก curated list + row label ผ่าน `getSubjectLabel` |
| `components/SummaryNavigation.tsx` | grouping key ใช้ `getSubjectLabel` + "ยังไม่กำหนด Subject" สำหรับ unassigned |

---

## 1. Curated Subject List

`lib/subjects.ts` — pure constant (no DB, no query):

| code | label |
|---|---|
| `law` | กฎหมาย |
| `policy` | นโยบายและแผน |
| `economics` | เศรษฐศาสตร์ |
| `administration` | การบริหาร |
| `english` | ภาษาอังกฤษ |
| `technology` | เทคโนโลยีสารสนเทศ |
| `math` | คณิตศาสตร์ |
| `__unassigned__` (sentinel) | ยังไม่กำหนด Subject |

### Helpers
- `getSubjectLabel(subject)` — map code/legacy → display label (fallback: raw value, never hidden)
- `getSubjectDropdownOptions()` — `[...SUBJECTS, UNASSIGNED]` สำหรับ dropdown
- `isUnassignedSubject(subject)` — true ถ้า empty/null/sentinel

---

## 2. Backward Compatibility

| สถานการณ์ | พฤติกรรม |
|---|---|
| Record เก่าไม่มี subject (null/empty) | แสดง "ยังไม่กำหนด Subject" + filter ได้ด้วย sentinel |
| Record เก่ามี free-text subject (เช่น "ความรู้ทั่วไป") | แสดง raw value ตามเดิม (getSubjectLabel fallback) + filter ด้วยค่าเดิม |
| Record เก่ามี code ตรงกับ curated (เช่น "law") | แสดง label ไทย "กฎหมาย" |
| Edit form เจอ legacy value | แสดงเป็น option `(เดิม)` + ค่าเดิม + ให้เลือก curated แทนได้ |

> **No data migration, no backfill** — ข้อมูลเก่าทำงานได้ทันที

---

## 3. Browser QA

> Verify ผ่าน code + build. แนะนำให้ทดสอบด้วยตาใน browser จริง

### Question Admin
- [ ] Edit question → Subject เป็น dropdown (ไม่ใช่ text input)
- [ ] เลือก Subject แล้ว save → ค่า code เก็บใน DB
- [ ] Question ที่มี subject → แสดง label ไทยใน row
- [ ] Question ที่ไม่มี subject → แสดง "ยังไม่กำหนด Subject"
- [ ] Filter by Subject → filter ทำงาน + "ยังไม่กำหนด Subject" ทำงาน
- [ ] Question เก่าที่มี legacy free-text → ยังแสดงค่าเดิม + filter ด้วยค่าเดิม

### Summary Admin
- [ ] Summary list → มี Subject column + filter dropdown
- [ ] Create/Edit → Subject dropdown (ผ่าน SummaryEditor)
- [ ] Row display เหมือน Question

### Question Picker
- [ ] Subject dropdown ใช้ curated list
- [ ] Row label ใช้ `getSubjectLabel`

### Summary Navigation (user-facing)
- [ ] Accordion grouping ใช้ label ไทย
- [ ] Summary ที่ไม่มี subject → กลุ่ม "ยังไม่กำหนด Subject"
- [ ] Mobile (accordion) + Desktop (expanded) ทำงานเหมือนเดิม

---

## 4. Performance Verification

| เงื่อนไข | ผล |
|---|---|
| **No additional queries** | ✅ — กลับกัน ลด query ได้! page.tsx เดิม scan `subject` column แยก ตอนนี้ใช้ curated list ไม่ต้อง scan |
| **Reuse existing fetches** | ✅ — subject filter รวมอยู่ใน main query (เดียวกับ pagination) ไม่ใช่ query แยก |
| **Client-side where possible** | ✅ — Summary Navigation filter เป็น client-side (อยู่แล้ว); admin filter ใช้ URL param + server (เหมือนเดิม ไม่ใช่ additional) |
| **No new dependency** | ✅ |
| **Bundle** | minimal — เพิ่ม `lib/subjects.ts` (constant) ไม่มี runtime cost |
| **ISR / RPC / Promise.all / Proxy** | ✅ ไม่แตะ — build ยืนยัน homepage + `/packages` ยัง ○ Static ISR 5m |

### Query reduction (improvement!)
```
ก่อน: select('category, subject, law, topic') + map unique → 4 columns scan
หลัง: select('category, law, topic') → 3 columns scan (subject มาจาก curated list)
```

---

## 5. Regression Analysis

| ระบบ | กระทบ? | เหตุผล |
|---|---|---|
| Package schema / Exam Set / Blueprint | ❌ | ไม่แตะ (ตาม constraint) |
| M:N tables | ❌ | ไม่สร้าง |
| Runtime / Analytics / Orders / Payments | ❌ | ไม่แตะ |
| **ISR** (homepage + /packages) | ❌ | build ยืนยันยัง ○ Static 5m |
| RPC / Promise.all / Proxy | ❌ | ไม่แตะ |
| Question/Summary data | ⚠️ display only — legacy free-text ยังแสดงได้ | ไม่ migrate ไม่ backfill |
| Admin Question/Summary flow | ⚠️ input → dropdown | logic เดิม + value เดิมใช้ได้ |
| Summary Navigation | ⚠️ grouping label | logic เดิม + label ถูกต้องขึ้น |

---

## 6. Build Verification

```
$ npx tsc --noEmit   → 0 errors
$ npx next build     → ✓ Compiled successfully in 3.0s (33/33 routes)
```

- 0 TypeScript errors
- 0 Build errors
- `/` + `/packages` ยัง ○ Static Revalidate 5m (ไม่กระทบ)

---

## 7. Future Roadmap

Phase ถัดไปตาม `content_architecture_foundation.md`:
- **Topic Foundation** — เพิ่ม curated Topic list ใต้ Subject (Level 2 taxonomy)
- **Subject table** (Phase 2) — normalize เป็น DB table + backfill free-text → code
- **Reusable Knowledge Base** (Phase 3-4) — M:N `package_summaries` / content แยกจาก package
- **Blueprint** (Phase 6) — exam weight per Subject

> งานนี้เป็น foundation ที่ไม่ทำลายอะไร — เมื่อ normalize เป็น table ในอนาคต code ที่เก็บใน DB อยู่แล้วสามารถ map ได้ทันที
