# Content Style Guide v2

> **Status:** DESIGN ONLY — official Sobdai Style Guide
> **Session:** Sobdai 6.13.2
> **Baseline:** Subject Foundation + Content Template v2
> **Scope:** Naming + taxonomy + quality rules สำหรับทุก content

---

## 1. Naming Convention

| Element | Rule | ตัวอย่าง |
|---|---|---|
| Files | `kebab-case` + `.md` | `law-hed-2562-q01.md` |
| DocumentCode | `UPPER-DASH` + `SUBJECT-TOPIC-YEAR` | `LAW-HED-2562` |
| Tags | lowercase ภาษาไทย/อังกฤษ | `2562`, `อุดมศึกษา` |
| References | ใช้ชื่อเต็มเสมอ | พระราชบัญญัติ ไม่ใช่ พ.ร.บ. |
| Heading (H1) | ชื่อเอกสารเต็ม | `# พระราชบัญญัติการอุดมศึกษา พ.ศ.2562` |
| Folder | `{document_code}/` | `law-hed-2562/` |

---

## 2. Subject Rules

**นิยาม:** ระดับวิชากว้างที่สุด (taxonomy Level 1) — stable มาก ไม่ค่อยเปลี่ยน

### Rules
- ใช้ curated list จาก `lib/subjects.ts` เท่านั้น
- มี 7 ตัว: `กฎหมาย` / `นโยบายและแผน` / `เศรษฐศาสตร์` / `การบริหาร` / `ภาษาอังกฤษ` / `เทคโนโลยีสารสนเทศ` / `คณิตศาสตร์`
- ใน front-matter ใช้ `code` (`law`) ไม่ใช่ label (`กฎหมาย`)
- ห้ามสร้าง Subject ใหม่เอง — ต้องผ่าน review และเพิ่มใน `lib/subjects.ts`

### ✅ Correct
```yaml
subject: law
```

### ❌ Incorrect
```yaml
subject: กฎหมาย          # ผิด: ใช้ label ไม่ใช่ code
subject: กม.              # ผิด: ย่อ
subject: Laws             # ผิด: พหูพจน์
subject: Legal            # ผิด: ไม่อยู่ใน curated list
```

---

## 3. Topic Rules

**นิยาม:** หัวข้อกว้างภายใน Subject (Level 2) — broader category ไม่ใช่เอกสาร

### Rules
- ภาษาไทย ไม่มีคำย่อ
- กว้างพอที่จะครอบ Document ได้หลายอัน
- 1 Topic ครอบได้หลาย Documents (เช่น "กฎหมายการอุดมศึกษา" ครอบทั้ง พ.ร.บ.2562 และ พ.ร.บ.สถาบันเอกชน 2546)
- ไม่ใส่ปี — ปีอยู่ใน Document

### ✅ Correct
```yaml
topic: กฎหมายการอุดมศึกษา
```

### ❌ Incorrect
```yaml
topic: พระราชบัญญัติการอุดมศึกษา พ.ศ.2562   # ผิด: นี่คือ Document ไม่ใช่ Topic
topic: อุดมศึกษา                            # ผิด: แคบเกินไป/ไม่ชัดเจน
topic: กฎหมาย อุดมศึกษา 2562                # ผิด: มีปี + ช่องว่างแปลก
```

---

## 4. Document Rules

**นิยาม:** ชื่อเอกสารอย่างเป็นทางการ — เปลี่ยนได้เมื่อมีการแก้ไขชื่อทางการ

### Rules (สำคัญที่สุด)
- **ใช้ชื่อเต็มเสมอ** — ห้ามย่อ "พ.ร.บ." → "พระราชบัญญัติ"
- รวมปี พ.ศ. ถ้าเป็นกฎหมาย/แผน
- ใช้คำว่า "พ.ศ.XXXX" ไม่ใช่ "พุทธศักราช XXXX"
- สำหรับแผน/กรอบนโยบาย ใส่ช่วงปีถ้ามี (เช่น "พ.ศ.2566–2570")

### ✅ Correct
```yaml
document: พระราชบัญญัติการอุดมศึกษา พ.ศ.2562
document: พระราชบัญญัติสถาบันอุดมศึกษาเอกชน พ.ศ.2546
document: แผนด้านการอุดมศึกษา พ.ศ.2566–2570
document: กรอบนโยบายและยุทธศาสตร์การอุดมศึกษา วิทยาศาสตร์ วิจัยและนวัตกรรม พ.ศ.2566–2570
```

### ❌ Incorrect
```yaml
document: พ.ร.บ.อุดมศึกษา           # ผิด: ย่อ
document: กฎหมายอุดมศึกษา           # ผิด: ไม่ใช่ชื่อทางการ
document: พระราชบัญญัติการอุดมศึกษา  # ผิด: ขาดปี
document: HED Act 2562              # ผิด: ภาษาอังกฤษ (ถ้าเอกสารไทย)
```

---

## 5. DocumentCode Rules

**นิยาม:** stable unique ID — **ไม่เปลี่ยนตลอดอายุการใช้งาน**

### Format
```
{SUBJECT}-{TOPIC_ABBR}-{YEAR}[-{SUFFIX}]
```

### Rules
- ✅ **Stable** — ไม่เปลี่ยนแม้ Document Name เปลี่ยน
- ✅ **Readable** — คนอ่านรู้ความหมายคร่าวๆ ได้
- ✅ **Unique** — 1 Document = 1 Code เท่านั้น
- ✅ **Future-proof** — รองรับเวอร์ชันใหม่ (`-V2`) + หลายเอกสารต่อปี (`-A`, `-B`)
- ✅ Uppercase, dash-separated, no spaces
- ✅ SUBJECT ใช้ code จาก curated list (LAW, POLICY, ECON, ADMIN, ENG, TECH, MATH)

### ✅ Correct
```
LAW-HED-2562
LAW-PRIVATE-2546
POLICY-HED-2566
POLICY-STI-2566
LAW-PDPA-2562
LAW-HED-2562-V2          # เวอร์ชันใหม่ของเอกสารเดิม
LAW-HED-2562-A           # เอกสาร A ในปีเดียวกัน (กรณีพิเศษ)
```

### ❌ Incorrect
```
LAW1                      # ผิด: ขาด topic + year
Law-Hed-2562              # ผิด: lowercase
LAW_HED_2562              # ผิด: underscore
LAW-พรบ-2562              # ผิด: ภาษาไทย
HED-2562                  # ผิด: ขาด SUBJECT prefix
พรบ-อุดมศึกษา-2562        # ผิด: ไม่ใช่รูปแบบมาตรฐาน
```

### Version handling
- เอกสารเดิมแก้ใหม่ (ฉบับ修订) → เพิ่ม `-V2` (Document Name เปลี่ยนได้, DocumentCode ใหม่)
- เอกสารเดิมแก้เล็กน้อย (พิมพ์ผิด) → ใช้ Code เดิม + อัป Version field (`version: 1.0.1`)

---

## 6. Difficulty Rules

**นิยาม:** ระดับความยากของ Question (Question เท่านั้น)

### Rules
- 3 ระดับ: `Easy` / `Medium` / `Hard`
- เป็นภาษาอังกฤษใน data (consistent กับ DB)
- ใน UI แสดงภาษาไทย: ง่าย / ปานกลาง / ยาก

### Calibration
| Difficulty | เกณฑ์ |
|---|---|
| Easy | จำได้จากการอ่าน 1 ครั้ง ไม่ต้องวิเคราะห์ |
| Medium | ต้องเข้าใจ + เชื่อมโยง 2+ มาตรา/แนวคิด |
| Hard | ต้องวิเคราะห์ + ประยุกต์ + ตอบผิดแบบ plausible ดึงดูด |

---

## 7. Blueprint Rules

**นิยาม:** น้ำหนักสอบ % ต่อ Subject ของ Package (future)

### Rules
- ระบุเป็น `%` (0-100)
- ผลรวมทุก Subject ใน Package = 100%
- 1 Package = 1 Blueprint
- กรอก optional ตอนนี้ — ใช้จริงใน Phase 4 (Mock generator)

### ✅ Correct
```yaml
blueprint:
  law: 20
  policy: 30
  economics: 20
  administration: 15
  english: 15
```

### ❌ Incorrect
```yaml
blueprint:
  law: 20
  policy: 30
  # ผิด: ผลรวม 50% (ไม่ครบ 100)
```

---

## 8. Explanation Rules

**นิยาม:** คำอธิบายทุก choice ใน Question

### Structure (บังคับ)
```markdown
### A — ไม่ถูกต้อง
**เพราะ:** [เหตุผลว่าทำไมผิด]
**อ้างอิง:** [มาตรา/หน้า]
```

### Rules
- **ทุก choice ต้องมี explanation** (A, B, C, D + E ถ้ามี)
- ใช้คำว่า "เพราะ..." + "อ้างอิง..." เสมอ
- Choice ที่ถูก: `### B — ถูกต้อง ✓`
- Choice ที่ผิด: `### A — ไม่ถูกต้อง`
- อ้างอิงเอกสาร/มาตรา — ไม่ใช่ "ความรู้สึก"
- หลีกเลี่ยงคำว่า "อาจจะ" / "น่าจะ" — ใช้ภาษายืนยัน

### ✅ Correct
```markdown
### B — ถูกต้อง ✓
**เพราะ:** ตามมาตรา 5 ระบุว่าวิสัยทัศน์การอุดมศึกษาคือยกระดับคุณภาพชีวิตของประชาชน
**อ้างอิง:** มาตรา 5 พ.ร.บ.การอุดมศึกษา พ.ศ.2562
```

### ❌ Incorrect
```markdown
### B — ถูกต้อง
เพราะถูก  ← ผิด: ไม่มีเหตุผล
```

```markdown
### A — ผิด
น่าจะผิดเพราะ...  ← ผิด: ไม่แน่ใจ + ไม่มีอ้างอิง
```

---

## 9. Question Rules

### Rules
- 1 คำถาม = 1 idea ไม่ซ้อนทับ
- คำถามชัดเจน ไม่กำกวม
- หลีกเลี่ยง "ยกเว้น" / "ไม่ใช่" ถ้าไม่จำเป็น
- 1 คำตอบที่ถูกเท่านั้น
- Choice ผิดต้อง plausible (ดูเหมือนจะถูก ไม่เกินจริง)
- Choice ความยาวใกล้เคียงกัน (ไม่มีตัวเดียวยาวโดยเด่น)

### ✅ Correct
```
ตามมาตรา 5 ข้อใดเป็นวิสัยทัศน์การอุดมศึกษาไทย?
A. ...สั้น ชัด
B. ...สั้น ชัด (ถูก)
C. ...สั้น ชัด
D. ...สั้น ชัด
```

### ❌ Incorrect
```
ข้อใดไม่ใช่... (negative phrasing ซับซ้อน)
A. คำสั้น
B. ประโยคยาวมาก 3 บรรทัด (เด่น)
```

---

## 10. Summary Rules

### Rules
- **1 Summary = 1 Document** (1:1)
- 2,000–3,000 คำ (min 1,500, max 4,000)
- H1 = ชื่อเอกสารเต็ม
- H2 = หมวดหลัก (4-7 หมวด)
- H3 = หัวข้อย่อย
- ใช้ GitHub alerts สำหรับ highlight (`> [!IMPORTANT]` ฯลฯ)
- ตารางสำหรับสรุปมาตรา/ตัวเลข
- อ้างอิงทุกคำกล่าวอ้าง
- โทน: เป็นทางการ กระชับ ไม่อวีจิ้ม

### ✅ Structure
```markdown
# [ชื่อเอกสารเต็ม]

## ภาพรวม / ประเด็นสำคัญ
> [!IMPORTANT]
> ผลบังคับใช้...

## [หมวดที่ 1]
### [หัวข้อย่อย]
...

## มาตราสำคัญ
| มาตรา | สรุป |

## อ้างอิง
```

### ❌ หลีกเลี่ยง
- Wall of text (ไม่มี heading)
- รวมหลายเอกสารในสรุปเดียว
- ความยาว < 1,500 หรือ > 4,000 คำ
- ไม่มี reference

---

## 11. Markdown Rules

### Allowed
- H1-H6 hierarchy
- **bold** / *italic*
- Lists (ordered/unordered/nested)
- Tables
- Code blocks (inline + block)
- GitHub alerts (`> [!NOTE/TIP/IMPORTANT/WARNING/CAUTION]`)
- Images `![alt](url)`
- Links `[text](url)`

### ห้าม
- HTML (ใช้ Markdown เท่านั้น — ปลอดภัยกว่า)
- Raw `<script>` / `<iframe>`
- รูปจาก external URL ที่ไม่น่าเชื่อถือ (ใช้ `/storage/` เท่านั้น)
- Heading ข้ามขั้น (H1 → H3) — ต้อง H1 → H2 → H3

---

## 12. Reference Rules

### Format
```markdown
## อ้างอิง

- **กฎหมาย/เอกสารหลัก:** [ชื่อเต็ม] (DocumentCode: [code])
  - มาตรา X — [คำอธิบายสั้น]
- **ราชกิจจานุเบกษา:** เล่ม X ตอน Y ลงวันที่...
- **เว็บไซต์:** [URL] (เข้าถึง [วันที่])
```

### Rules
- ทุกคำกล่าวอ้างต้องมี reference
- URL ต้องมีวันที่เข้าถึง
- แยก "กฎหมายหลัก" vs "เอกสารอ้างอิง" vs "เว็บไซต์"
- ใช้ชื่อเต็มเสมอ

---

## 13. Version Rules

**นิยาม:** Semver ของ content (`MAJOR.MINOR.PATCH`)

### Rules
| Change | Version bump |
|---|---|
| เนื้อหาผิด + แก้ความถูกต้อง | `PATCH` (1.0.**0** → 1.0.**1**) |
| เพิ่ม/ลบ section, rewrite ใหญ่ | `MINOR` (1.**0**.0 → 1.**1**.0) |
| เปลี่ยนโครงสร้างเอกสาร/มาตราเปลี่ยน | `MAJOR` (**1**.0.0 → **2**.0.0) |

```yaml
version: 1.0.0   # initial
version: 1.0.1   # แก้ typo
version: 1.1.0   # เพิ่ม section ใหม่
version: 2.0.0   # rewrite ใหญ่ (กฎหมายเปลี่ยน)
```

---

## 14. Quality Checklist

ก่อน publish ทุก content ต้องผ่าน:

### Question
- [ ] Metadata ครบ (subject/topic/document/document_code/difficulty/version)
- [ ] DocumentCode ถูก format + ไม่ซ้ำ
- [ ] คำถามชัดเจน ไม่กำกวม
- [ ] 1 คำตอบถูกเท่านั้น
- [ ] Choice ผิด plausible (ไม่เดาง่าย)
- [ ] Explanation ครบทุก choice
- [ ] ทุก explanation มี "เพราะ..." + "อ้างอิง..."
- [ ] อ้างอิงถูกต้องตามเอกสารจริง
- [ ] ไม่มี bias/ความคิดเห็นส่วนตัว

### Summary
- [ ] Metadata ครบ
- [ ] 1:1 กับ Document
- [ ] 2,000-3,000 คำ
- [ ] H1-H3 hierarchy ถูกต้อง (ไม่ข้ามขั้น)
- [ ] ใช้ GitHub alerts สำหรับ highlight
- [ ] ตารางสำหรับมาตรา/ตัวเลข
- [ ] อ้างอิงทุกคำกล่าวอ้าง
- [ ] ใช้ชื่อเอกสารเต็ม (ไม่ย่อ)
- [ ] โทนเป็นทางการ กระชับ
- [ ] รูปมี alt text + caption

### Universal
- [ ] ไม่มี HTML (Markdown เท่านั้น)
- [ ] รูปมาจาก `/storage/` (ไม่ external ที่ไม่น่าเชื่อถือ)
- [ ] Front-matter ถูก YAML format
- [ ] สะกดถูก (ภาษาไทย + อังกฤษ)

---

## 15. Common Mistakes (ห้ามทำ)

### Metadata
| Mistake | แก้เป็น |
|---|---|
| `subject: กฎหมาย` (label ไม่ใช่ code) | `subject: law` |
| `document: พ.ร.บ.อุดมศึกษา` (ย่อ) | `document: พระราชบัญญัติการอุดมศึกษา พ.ศ.2562` |
| `document_code: law1` (ไม่มี topic/year) | `document_code: LAW-HED-2562` |
| `topic: พ.ร.บ.2562` (เอกสาร ไม่ใช่ topic) | `topic: กฎหมายการอุดมศึกษา` |

### Question
| Mistake | แก้เป็น |
|---|---|
| คำถาม "ข้อใดไม่ใช่..." (negative phrasing) | ใช้ "ข้อใดคือ..." ถ้าเป็นไปได้ |
| Choice ผิด "เกินจริง" เดาง่าย | ทำให้ plausible มากขึ้น |
| Explanation "เพราะถูก" ไม่มีเหตุผล | "เพราะ: [เหตุผล] อ้างอิง: [มาตรา]" |
| ข้าม explanation ของบาง choice | ครบทุก choice |

### Summary
| Mistake | แก้เป็น |
|---|---|
| Wall of text | แบ่ง H2/H3 |
| รวม 3 กฎหมายในสรุปเดียว | 1 Summary = 1 Document |
| สั้นเกิน (500 คำ) | 2,000-3,000 คำ |
| ไม่มี reference | อ้างอิงทุกคำกล่าวอ้าง |

### DocumentCode
| Mistake | แก้เป็น |
|---|---|
| เปลี่ยน Code เมื่อแก้ชื่อเอกสาร | Code stable ไม่เปลี่ยน — แก้ Version field |
| ใช้ Code ซ้ำ | 1 Document = 1 Code |
| ใช้ภาษาไทยใน Code | uppercase English เท่านั้น |

---

## Appendix: Quick Reference

```
Subject  → law / policy / economics / administration / english / technology / math
Topic    → กว้าง, ไทย, ไม่มีปี — "กฎหมายการอุดมศึกษา"
Document → ชื่อเต็ม + ปี — "พระราชบัญญัติการอุดมศึกษา พ.ศ.2562"
Code     → SUBJECT-TOPIC-YEAR — "LAW-HED-2562"
Difficulty → Easy / Medium / Hard
Version  → MAJOR.MINOR.PATCH — "1.0.0"
```
