# Content Style Guide v2.1 FINAL (Production Standard)

> **Status:** DESIGN ONLY — official Sobdai Style Guide
> **Session:** Sobdai 6.13.3 (FINAL)
> **Upgrades:** v2.0 → v2.1 — เพิ่ม Part 16 (Naming Dict), Part 23 (AI Workflow), Part 24 (Checklist), Part 25 (Mistakes) ตามมาตรฐานใหม่
> **Scope:** Naming + taxonomy + quality + AI + checklist สำหรับทุก content

---

## 1. Naming Convention

| Element | Rule | ตัวอย่าง |
|---|---|---|
| Files | `kebab-case` + `.md` | `law-hed-2562-q01.md` |
| DocumentCode | `UPPER-DASH` | `LAW-ACT-HED-2562` |
| QuestionCode | `{DOC}-Q{NNN}` | `LAW-HED-2562-Q001` |
| SummaryCode | `{DOC}-SUM` | `LAW-HED-2562-SUM` |
| Tags | lowercase | `2562`, `อุดมศึกษา` |
| Heading H1 | ชื่อเอกสารเต็ม | `# พระราชบัญญัติการอุดมศึกษา พ.ศ.2562` |
| Folder | `{document_code}/` | `law-hed-2562/` |

---

## 2. Subject Rules

**นิยาม:** วิชากว้าง (taxonomy Level 1) — stable

### Rules
- ใช้ curated code จาก `lib/subjects.ts` เท่านั้น (`law`, `policy`, `economics`, `administration`, `english`, `technology`, `math`)
- ใน metadata ใช้ **code** ไม่ใช่ label
- ห้ามสร้าง Subject ใหม่เอง — ต้องผ่าน review

### ✅ / ❌
```yaml
subject: law          # ✅
subject: กฎหมาย       # ❌ label ไม่ใช่ code
subject: กม.          # ❌ ย่อ
subject: Laws         # ❌ พหูพจน์ + ไม่ใน list
```

---

## 3. Topic Rules

**นิยาม:** หัวข้อกว้างในวิชา (Level 2) — broader category

### Rules
- ภาษาไทย ไม่ย่อ
- กว้างพอครอบหลาย Documents
- ไม่ใส่ปี

### ✅ / ❌
```yaml
topic: กฎหมายการอุดมศึกษา                              # ✅
topic: พระราชบัญญัติการอุดมศึกษา พ.ศ.2562            # ❌ นี่คือ Document
topic: อุดมศึกษา                                       # ❌ แคบ/ไม่ชัด
```

---

## 4. Document Rules

**นิยาม:** ชื่อเอกสารอย่างเป็นทางการ

### Rules (สำคัญที่สุด)
- **ชื่อเต็มเสมอ** — ห้ามย่อ "พ.ร.บ." → "พระราชบัญญัติ"
- รวมปี พ.ศ. ถ้าเป็นกฎหมาย/แผน
- ใช้ "พ.ศ.XXXX"
- แผน/กรอบนโยบายใส่ช่วงปีถ้ามี

### ✅ / ❌
```yaml
document: พระราชบัญญัติการอุดมศึกษา พ.ศ.2562                 # ✅
document: พ.ร.บ.อุดมศึกษา                                    # ❌ ย่อ
document: กฎหมายอุดมศึกษา                                    # ❌ ไม่ใช่ชื่อทางการ
document: พระราชบัญญัติการอุดมศึกษา                          # ❌ ขาดปี
```

---

## 5. DocumentCode Rules

### Format
```
{SUBJECT}-{TYPE?}-{TOPIC_ABBR}-{YEAR}[-{SUFFIX}]
```

### Requirements (PERMANENT)
- ✅ Stable — ไม่เปลี่ยนตลอดอายุ
- ✅ Unique — `unique` constraint
- ✅ Readable
- ✅ Future-proof — suffix `-V2`, `-A`
- ✅ Uppercase, dash-separated, no spaces

### ✅ / ❌
```
LAW-ACT-HED-2562          # ✅
LAW-PRIVATE-2546          # ✅
PLAN-HED-2566             # ✅
Law-Hed-2562              # ❌ lowercase
LAW_HED_2562              # ❌ underscore
LAW-พรบ-2562              # ❌ ภาษาไทย
HED-2562                  # ❌ ขาด SUBJECT
```

### Version handling
- เอกสารเดิมแก้ใหญ่ → Code ใหม่ (`-V2`)
- แก้เล็กน้อย → Code เดิม + Version field bump

---

## 6. Difficulty Rules

| DB (English) | UI (Thai) | Calibration |
|---|---|---|
| `Easy` | ง่าย | จำได้ทันที |
| `Medium` | ปานกลาง | เชื่อมโยง 2+ มาตรา |
| `Hard` | ยาก | วิเคราะห์ + plausible distractors |

### ทำไม DB=English แต่ UI=Thai?
- **DB English** → stable, sort/filter ง่าย, encoding-safe, สากล
- **UI Thai** → user-friendly สำหรับผู้เตรียมสอบไทย
- แปลงผ่าน mapping function `getDifficultyLabel()`

---

## 7. Blueprint Rules

### หลักการ (สำคัญ)
**ห้าม**เก็บ % ใน Question

- **Question** → `blueprint: Memory|Concept|Procedure|Scenario` (type only)
- **Package** → `blueprint: {Memory: 40, Concept: 30, ...}` (%)

### ✅ Question
```yaml
blueprint: Concept
```

### ❌ Question (ห้าม)
```yaml
blueprint: 30        # ❌ ห้ามเก็บ % ใน Question
```

### ✅ Package
```yaml
package_blueprint:
  Memory: 40
  Concept: 30
  Procedure: 20
  Scenario: 10
  # รวม 100
```

---

## 8. Explanation Rules

### Structure (บังคับ)
```markdown
### A — ไม่ถูกต้อง
**เพราะ:** [เหตุผล]
**อ้างอิง:** [มาตรา/หน้า]
```

### Rules
- ทุก choice ต้องมี explanation
- "เพราะ..." + "อ้างอิง..." เสมอ
- ถูก: `### B — ถูกต้อง ✓`
- ผิด: `### A — ไม่ถูกต้อง`
- อ้างอิงเอกสาร ไม่ใช่ "ความรู้สึก"
- หลีกเลี่ยง "อาจจะ" / "น่าจะ"

---

## 9. Question Rules

### Rules
- 1 คำถาม = 1 idea
- ชัดเจน ไม่กำกวม
- หลีกเลี่ยง "ยกเว้น" / "ไม่ใช่" ถ้าไม่จำเป็น
- 1 คำตอบถูก
- Choice ผิดต้อง plausible
- Choice ความยาวใกล้เคียงกัน

---

## 10. Summary Rules

### Rules
- **1 Summary = 1 Document**
- **2,000–3,000 คำ** (min 1,500, max 4,000)
- H1 = ชื่อเอกสารเต็ม
- H2 = หมวด (4-7)
- H3 = หัวข้อย่อย
- GitHub alerts + tables + references
- โทน: เป็นทางการ กระชับ

---

## 11. Markdown Rules

### Allowed
- H1-H6 (ไม่ข้ามขั้น)
- **bold** / *italic*
- Lists (nested ok)
- Tables
- Code blocks
- GitHub alerts
- Images / Links

### ห้าม
- Raw HTML (ใช้ Markdown)
- `<script>` / `<iframe>`
- External image URL ที่ไม่น่าเชื่อถือ (ใช้ `/storage/`)
- Heading ข้ามขั้น (H1 → H3)

---

## 12. Reference Rules

### Format
```markdown
## อ้างอิง
- **กฎหมายหลัก:** [ชื่อเต็ม] (DocumentCode: [code])
  - มาตรา X — [คำอธิบาย]
- **ราชกิจจานุเบกษา:** เล่ม X ตอน Y ลงวันที่...
- **เว็บไซต์:** [URL] (เข้าถึง [วันที่])
```

### Rules
- ทุกคำกล่าวอ้างต้องมี reference
- URL ต้องมีวันที่เข้าถึง
- ใช้ชื่อเต็มเสมอ

---

## 13. Version Rules

| Change | Bump |
|---|---|
| แก้ typo | PATCH (1.0.**1**) |
| เพิม section | MINOR (1.**1**.0) |
| Rewrite ใหญ่/กฎหมายเปลี่ยน | MAJOR (**2**.0.0) |

---

## 14. DocumentType Rules (Part 2 ของ template)

### Rules
- 1 Document = 1 DocumentType
- ใช้ code ใน metadata (`ACT`, `NATIONAL_PLAN`, ...)
- 14 types: Act / Royal Decree / Ministerial Reg / Cabinet Resolution / National Plan / Policy / Strategy / Announcement / Manual / Guideline / Standard / Report / Circular / Order

### ✅
```yaml
document_type: ACT
```

---

## 15. QuestionCode Rules (Part 4 ของ template)

### Format
```
{DOCUMENT_CODE}-Q{NNN}
```

### Rules
- ✅ Unique (global)
- ✅ Sequential (เรียงตามการสร้าง)
- ✅ Never reused (ลบแล้วห้ามใช้ซ้ำ)
- ✅ Human-readable
- ✅ Stable

---

## 16. Official Naming Dictionary (Part 16)

### กฎสำคัญ
> **Metadata ต้องใช้ชื่อเต็มเสมอ** — คำย่ออนุญาต **เฉพาะในเนื้อหา article** เท่านั้น

### Dictionary (ตัวอย่าง)

| Official (Metadata + Reference) | Abbreviation (article only) |
|---|---|
| พระราชบัญญัติ | พ.ร.บ. |
| พระราชกฤษฎีกา | พ.ร.ฎ. |
| ข้อกำหนดกระทรวง | ขก. |
| รัฐธรรมนูญแห่งราชอาณาจักรไทย | รธน. |
| ประกาศคณะรัฐมนตรี | ป.ครม. |
| ราชกิจจานุเบกษา | รก. |
| ทศท. | ที่ดินทรัพย์สิน |

### ✅ Correct (metadata)
```yaml
document: พระราชบัญญัติการอุดมศึกษา พ.ศ.2562
references:
  - พระราชบัญญัติการอุดมศึกษา พ.ศ.2562 มาตรา 5
```

### ❌ Incorrect (metadata)
```yaml
document: พ.ร.บ.อุดมศึกษา
references:
  - พ.ร.บ.อุดมศึกษา ม.5
```

### ✅ Allowed (ในเนื้อหา article body เท่านั้น)
```markdown
ตามที่บัญญัติไว้ใน พ.ร.บ.การอุดมศึกษา พ.ศ.2562 มาตรา 5...
```

> เหตุผล: Metadata ต้อง searchable + stable + สำหรับ cross-reference — ย่อทำให้ dedup และ matching พลาด

---

## 17. Cross-Reference Rules (Part 17 ของ template)

### Format
```yaml
related_documents: [LAW-PRIVATE-2546]
related_summaries: [LAW-PRIVATE-2546-SUM]
related_questions: [LAW-HED-2562-Q001, LAW-HED-2562-Q002]
related_packages: ["com-2568-analyst"]
related_laws: [พระราชบัญญัติระเบียบบริหารราชการแผ่นดิน]
related_plans: [แผนพัฒนาเศรษฐกิจฯ ฉบับที่ 13]
```

### Rules
- อ้างอิงด้วย Code (DocumentCode/QuestionCode/SummaryCode) ไม่ใช่ชื่อ
- related_laws/plans ใช้ชื่อเต็ม (ยังไม่มี code ในระบบ)
- optional แต่แนะนำสำหรับ Knowledge Graph

---

## 23. AI Workflow Standard

### แยกบทบาท AI แต่ละตัว

| AI | บทบาทหลัก | Output |
|---|---|---|
| **NotebookLM** | Source-based draft — สกัด/สรุปจากเอกสารต้นฉบับ | `.md` draft พร้อม front-matter |
| **Claude** | Quality improvement — เขียน summary ยาก, ตรวจความถูกต้อง, แก้ tone | revised `.md` |
| **ChatGPT** | Question generation — สร้าง question + choices + explanations จำนวนมาก | `.md` questions |
| **Gemini** | Fact verification — ตรวจข้อเท็จจริง + อ้างอิงล่าสุดจากเว็บ | fact-check report |
| **Human** | Final approval — review, แก้, ตัดสินใจ publish | approved `.md` |

### Pipeline
```
NotebookLM (source draft)
    → Claude (quality pass)           ← quality gate
    → ChatGPT (question generation)   ← volume
    → Gemini (fact-check)             ← accuracy gate
    → Human (final approval)          ← accountability gate
    → Publish (status: Published, reviewed_by_human: true, fact_checked: true)
```

### Rules
- ❌ **ห้าม publish AI content โดยไม่ผ่าน Human**
- ❌ **ห้าม publish AI content โดยไม่ fact-check** (สำหรับกฎหมาย/ข้อเท็จจริง)
- ✅ ทุก AI content ต้องมี `created_by_ai: true` + provenance metadata
- ✅ Prompt library version-controlled (ไม่กระจาย)

### Metadata after AI → Human handoff
```yaml
created_by_ai: true
reviewed_by_human: true
fact_checked: true
reviewed_at: 2026-07-08T10:00Z
content_status: Published
```

---

## 24. Quality Checklist (Part 24 — Before Publish)

### Universal
- [ ] Metadata ครบทุก required field
- [ ] Front-matter ถูก YAML format
- [ ] Markdown validated (ไม่มี broken syntax)
- [ ] ไม่มี HTML (Markdown เท่านั้น)
- [ ] Images validated (alt text + `/storage/` path + < 200KB)
- [ ] ContentStatus = `Published`

### Identity & Codes
- [ ] DocumentCode valid format + unique
- [ ] QuestionCode valid format + unique (ถ้า Question)
- [ ] SummaryCode valid format + unique (ถ้า Summary)
- [ ] Version ถูก semver

### Taxonomy
- [ ] Subject = curated code
- [ ] Topic = ภาษาไทย ไม่ย่อ
- [ ] Document = ชื่อเต็ม
- [ ] DocumentType = code จาก list

### Content Quality
- [ ] Reference verified (ทุกคำกล่าวอ้างมี source)
- [ ] Explanation complete (ทุก choice มี "เพราะ..." + "อ้างอิง...")
- [ ] Difficulty assigned (ถ้า Question)
- [ ] Blueprint assigned (type: Memory/Concept/Procedure/Scenario ถ้า Question)
- [ ] LearningObjectives assigned (LO1–LO4 ถ้า Summary)
- [ ] AssessmentMapping assigned (LO → Blueprint)
- [ ] KnowledgeCoverage assigned (ถ้า Summary)
- [ ] EstimatedTime assigned

### Provenance
- [ ] CreatedByAI filled
- [ ] ReviewedByHuman = true (บังคับก่อน publish)
- [ ] FactChecked = true (บังคับสำหรับกฎหมาย/ข้อเท็จจริง)
- [ ] ReviewedAt filled

### Dedup
- [ ] ไม่มี Question ซ้ำ (เช็ค QuestionCode + content hash)
- [ ] ไม่มี Summary ซ้ำ (เช็ค SummaryCode)

---

## 25. Common Mistakes (Part 25)

### Metadata Mistakes
| Mistake | Fix |
|---|---|
| `subject: กฎหมาย` (label) | `subject: law` (code) |
| `document: พ.ร.บ.อุดมศึกษา` (ย่อ) | `document: พระราชบัญญัติการอุดมศึกษา พ.ศ.2562` |
| `document_code: law1` | `document_code: LAW-ACT-HED-2562` |
| `topic: พ.ร.บ.2562` (Document ไม่ใช่ Topic) | `topic: กฎหมายการอุดมศึกษา` |
| `document_type: พระราชบัญญัติ` (ไทย) | `document_type: ACT` (code) |
| Missing `version` | `version: 1.0.0` |
| `blueprint: 30` (% ใน Question) | `blueprint: Concept` (type) |

### Code Mistakes
| Mistake | Fix |
|---|---|
| DocumentCode lowercase | Uppercase |
| DocumentCode ภาษาไทย | English only |
| QuestionCode ซ้ำ | Unique + sequential |
| เปลี่ยน Code เมื่อแก้ชื่อ | Code stable — แก้ Version field |

### Question Mistakes
| Mistake | Fix |
|---|---|
| "ข้อใดไม่ใช่..." (negative) | ใช้ positive ถ้าได้ |
| Choice ผิดเดาง่าย | ทำ plausible |
| ข้าม explanation | ครบทุก choice |
| Explanation "เพราะถูก" | "เพราะ: [เหตุผล] อ้างอิง: [มาตรา]" |

### Summary Mistakes
| Mistake | Fix |
|---|---|
| Wall of text | แบ่ง H2/H3 |
| รวมหลายเอกสาร | 1 Summary = 1 Document |
| สั้นเกิน | 2,000–3,000 คำ |
| ไม่มี reference | อ้างอิงทุกคำกล่าวอ้าง |
| ข้าม LO | LO1–LO4 ครบ |

### Naming Mistakes
| Mistake | Fix |
|---|---|
| ย่อใน metadata | ชื่อเต็มเท่านั้น |
| ย่อใน reference | ชื่อเต็ม |
| ภาษาอังกฤษผสมไทยในชื่อไทย | เลือกภาษาเดียว |

### Provenance Mistakes
| Mistake | Fix |
|---|---|
| Publish AI content ไม่ review | ห้าม — ต้อง `reviewed_by_human: true` |
| Publish ไม่ fact-check | ห้าม — ต้อง `fact_checked: true` |
| `created_by_ai` ไม่ใส่ | ใส่ทุกกรณี |

---

## Appendix: Quick Reference

```
Subject     → law / policy / economics / administration / english / technology / math
Topic       → กว้าง, ไทย, ไม่มีปี
Document    → ชื่อเต็ม + ปี
DocumentType → ACT / NATIONAL_PLAN / POLICY / ... (14 types)
DocumentCode → SUBJECT-TYPE?-TOPIC-YEAR (LAW-ACT-HED-2562)
QuestionCode → {DOC}-Q{NNN}
SummaryCode → {DOC}-SUM
Difficulty  → Easy / Medium / Hard (DB) → ง่าย/ปานกลาง/ยาก (UI)
Blueprint   → Question: type (Memory/Concept/Procedure/Scenario)
              Package: % per type
Version     → MAJOR.MINOR.PATCH
Status      → Draft → Review → Published → Archived
```
