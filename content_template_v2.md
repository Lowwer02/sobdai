# Content Template v2

> **Status:** DESIGN ONLY — official Sobdai content template
> **Session:** Sobdai 6.13.2
> **Baseline:** Subject Foundation + Content Architecture Foundation + Beta Roadmap
> **Change:** ADD `Document` + `DocumentCode` layer (between Topic and Question/Summary)
> **Backward compatible:** ไม่ replace Subject/Topic — เพิ่ม layer ใหม่

---

## Metadata Schema (official)

ทุก content unit (Question + Summary) ใช้ metadata ชุดเดียวกัน:

| Field | Required | Type | Description |
|---|---|---|---|
| `Package` | yes (context) | ref | แพ็กเกจที่อ้างอิง (สำหรับ import context — ในอนาคต M:N) |
| `Organization` | yes (context) | ref | หน่วยงาน |
| `Position` | yes (context) | ref | ตำแหน่ง |
| `Subject` | yes | enum | วิชา — ใช้ curated list (`lib/subjects.ts`) |
| `Topic` | yes | text | หัวข้อกว้าง (เช่น "กฎหมายการอุดมศึกษา") |
| `Document` | yes | text | ชื่อเอกสารอย่างเป็นทางการ (เช่น "พระราชบัญญัติการอุดมศึกษา พ.ศ.2562") |
| `DocumentCode` | yes | code | stable unique ID (เช่น `LAW-HED-2562`) — **ไม่เปลี่ยน** |
| `Difficulty` | Question only | enum | Easy / Medium / Hard |
| `Blueprint` | optional | pct | น้ำหนักสอบ % ต่อ Subject (future) |
| `Tags` | optional | string[] | cross-cutting labels |
| `Read Time` | Summary only | int | นาที (default 5) |
| `Images` | optional | string[] | URL ของรูปใน content |
| `References` | optional | string[] | URL/หน้าอ้างอิง |
| `Version` | yes | semver | content version (`1.0.0`) |

### Hierarchy (สรุป)
```
Subject  →  Topic  →  Document (DocumentCode)  →  Question / Summary
กฎหมาย     กฎหมาย    พ.ร.บ.การอุดมศึกษา 2562      "ข้อใดถูก..."
           อุดมศึกษา   (LAW-HED-2562)              "สรุป..."
```

---

## DocumentCode Format (official)

```
{SUBJECT}-{TOPIC_ABBR}-{YEAR}[-{SUFFIX}]
```

| ส่วน | กฎ | ตัวอย่าง |
|---|---|---|
| `SUBJECT` | รหัสวิชา จาก curated list (uppercase) | `LAW`, `POLICY`, `ECON`, `ADMIN`, `ENG`, `TECH`, `MATH` |
| `TOPIC_ABBR` | ตัวย่อหัวข้อ (2-6 ตัวอักษร ไม่มี space) | `HED` (Higher Ed), `PDPA`, `PROC` (สารบรรณ) |
| `YEAR` | พ.ศ. 4 หลัก | `2562`, `2546`, `2566` |
| `SUFFIX` (optional) | กรณีหลายเอกสารใน topic+year เดียวกัน | `-A`, `-B`, `-V2` |

### Examples
| DocumentCode | Document |
|---|---|
| `LAW-HED-2562` | พระราชบัญญัติการอุดมศึกษา พ.ศ.2562 |
| `LAW-PRIVATE-2546` | พระราชบัญญัติสถาบันอุดมศึกษาเอกชน พ.ศ.2546 |
| `POLICY-HED-2566` | แผนด้านการอุดมศึกษา พ.ศ.2566–2570 |
| `POLICY-STI-2566` | กรอบนโยบายฯ อววน. พ.ศ.2566–2570 |
| `LAW-PDPA-2562` | พ.ร.บ.คุ้มครองข้อมูลส่วนบุคคล พ.ศ.2562 |

### Rules
- ✅ Stable — ไม่เปลี่ยนเมื่อ Document Name เปลี่ยน
- ✅ Unique — กำกับโดย `unique` constraint (future)
- ✅ Short — อ่านง่าย พิมพ์ง่าย
- ✅ Future-proof — รองรับเวอร์ชันใหม่ (`-V2`) + หลายเอกสาร (`-A`)
- ✅ Searchable — ใช้ filter ใน Question Picker / Summary Nav ได้
- ✅ Importable — ใส่ใน markdown front-matter ได้

---

## 1. Question Template

### Format: Markdown front-matter + body

```markdown
---
# Metadata
subject: law
topic: กฎหมายการอุดมศึกษา
document: พระราชบัญญัติการอุดมศึกษา พ.ศ.2562
document_code: LAW-HED-2562
difficulty: Medium
tags: [อุดมศึกษา, 2562, สถาบันอุดมศึกษา]
references:
  - มาตรา 5 พ.ร.บ.การอุดมศึกษา พ.ศ.2562
version: 1.0.0
---

## Question

ตามพระราชบัญญัติการอุดมศึกษา พ.ศ.2562 ข้อใดเป็นการกำหนดที่ถูกต้องเกี่ยวกับวิสัยทัศน์ของการอุดมศึกษาไทย?

## Choices

**A.** ผลิตบัณฑิตที่มีความเชี่ยวชาญเฉพาะทางเพียงอย่างเดียว
**B.** เป็นการศึกษาเพื่อยกระดับมาตรฐานและคุณภาพชีวิตของประชาชนและพัฒนาสังคม
**C.** เน้นการสอนทฤษฎีโดยไม่เชื่อมโยงกับการทำงาน
**D.** จำกัดเฉพาะกลุ่มผู้ที่มีฐานะทางการเงิน

**Correct Answer:** B

## Explanations

### A — ไม่ถูกต้อง
**เพราะ:** วิสัยทัศน์การอุดมศึกษาไม่ได้จำกัดเพียงความเชี่ยวชาญ แต่ต้องผลิตบัณฑิตที่มีคุณธรรมและความรู้ควบคู่กัน
**อ้างอิง:** มาตรา 5

### B — ถูกต้อง ✓
**เพราะ:** วิสัยทัศน์คือยกระดับคุณภาพชีวิตและพัฒนาสังคมอย่างยั่งยืน
**อ้างอิง:** มาตรา 5 และประกาศนโยบายของกกพอ.

### C — ไม่ถูกต้อง
**เพราะ:** ต้องเชื่อมโยงการเรียนการสอนกับการทำงานจริง
**อ้างอิง:** แนวทางการผลิตบัณฑิตตามมาตรา 7

### D — ไม่ถูกต้อง
**เพราะ:** การอุดมศึกษาต้องเข้าถึงได้อย่างเสมอภาค โดยไม่จำกัดฐานะ
**อ้างอิง:** หลักการการศึกษาตลอดชีวิตในมาตรา 6
```

### 5-Choice Variant (future-compatible)
```markdown
## Choices

**A.** ...
**B.** ...
**C.** ...
**D.** ...
**E.** ...   ← optional 5th choice

**Correct Answer:** B

## Explanations
### A — ไม่ถูกต้อง
...
### E — ไม่ถูกต้อง   ← มี explanation ครบทุก choice
...
```

> **กฎ:** แม้ระบบปัจจุบันรองรับ 4 choices (DB: choice_a..d) — template ต้องรองรับ 5 สำหรับ future migration โดยเก็บ E ไว้ในส่วน extendable (front-matter `choice_e` field)

---

## 2. Summary Template

```markdown
---
subject: law
topic: กฎหมายการอุดมศึกษา
document: พระราชบัญญัติการอุดมศึกษา พ.ศ.2562
document_code: LAW-HED-2562
read_time: 12
tags: [อุดมศึกษา, 2562, สถาบันอุดมศึกษา, กกพอ.]
images:
  - /storage/summaries/law-hed-2562/structure.png
references:
  - ราชกิจจานุเบกษา เล่ม 136 ตอนพิเศษ 49 ก
  - https://www.mhesi.go.th/hed-act-2562
version: 1.0.0
---

# สรุปพระราชบัญญัติการอุดมศึกษา พ.ศ.2562

## ภาพรวม

> [!IMPORTANT]
> พ.ร.บ.นี้มีผลบังคับใช้ตั้งแต่วันที่ 1 กุมภาพันธ์ 2562 เป็นต้นไป

## วิสัยทัศน์และพันธกิจ

เนื้อหาย่อหน้าปกติ 2,000–3,000 คำ...

### หลักการสำคัญ

1. ...
2. ...

## มาตราสำคัญ

| มาตรา | เนื้อหาโดยย่อ |
|---|---|
| 5 | วิสัยทัศน์ |
| 7 | แนวทางการผลิตบัณฑิต |

## อ้างอิง

- ราชกิจจานุเบกษา เล่ม 136
- เว็บไซต์ กกพอ.
```

### กฎ Summary
- **1 Summary = 1 Document** (1:1) — ไม่รวมหลายเอกสารในสรุปเดียว
- **2,000–3,000 คำ** (ไม่เกิน 4,000 ไม่ต่ำกว่า 1,500)
- Markdown + รูป + references
- ใช้ GitHub alerts (`> [!IMPORTANT]` ฯลฯ) สำหรับ highlight

---

## 3. NotebookLM Export Template

**Prompt สำหรับ NotebookLM** (เพื่อสร้าง draft ที่ import เข้า Sobdai ได้):

```
จงสรุปเอกสาร [ชื่อเอกสาร] ในรูปแบบ Markdown โดยมีโครงสร้างดังนี้:

1. เริ่มต้นด้วย YAML front-matter:
   ---
   subject: [ระบุจาก {กฎหมาย, นโยบายและแผน, เศรษฐศาสตร์, การบริหาร, ภาษาอังกฤษ, คณิตศาสตร์, เทคโนโลยีสารสนเทศ}]
   topic: [หัวข้อกว้าง เช่น "กฎหมายการอุดมศึกษา"]
   document: [ชื่อเอกสารอย่างเป็นทางการ ไม่ย่อ]
   document_code: [SUBJECT-TOPIC-YEAR]
   read_time: [ประมาณ 8-15 นาที]
   tags: [3-5 คำสำคัญ]
   version: 1.0.0
   ---

2. เนื้อหา 2,000-3,000 คำ แบ่งตาม H1/H2/H3 hierarchy
3. ใช้ GitHub alerts (> [!IMPORTANT] ฯลฯ) สำหรับจุดสำคัญ
4. ตารางสำหรับสรุปมาตรา/หมวด
5. อ้างอิงมาตรา/หน้าเสมอ

อย่าใช้คำย่อ เช่น "พ.ร.บ." ให้ใช้ชื่อเต็ม "พระราชบัญญัติ..."
```

### Expected output (ที่ NotebookLM ควรสร้าง)
- `.md` ไฟล์เดียวต่อ 1 document
- มี front-matter ครบ
- hierarchy ชัดเจน
- ความยาวในช่วง 2,000-3,000 คำ

---

## 4. Bulk Import Template

### File: `bulk_import.json` (หรือ `.csv` ที่แปลงได้)

```json
{
  "package": "นักวิเคราะห์นโยบายและแผน สำนักงานปลัด อว. ปี 2568",
  "organization": "สำนักงานปลัดกระทรวงการอุดมศึกษา วิทยาศาสตร์ วิจัยและนวัตกรรม",
  "position": "นักวิเคราะห์นโยบายและแผน",
  "items": [
    {
      "type": "summary",
      "file": "summaries/law-hed-2562.md",
      "subject": "law",
      "topic": "กฎหมายการอุดมศึกษา",
      "document": "พระราชบัญญัติการอุดมศึกษา พ.ศ.2562",
      "document_code": "LAW-HED-2562",
      "tags": ["2562", "อุดมศึกษา"],
      "version": "1.0.0"
    },
    {
      "type": "question",
      "file": "questions/law-hed-2562-q01.md",
      "subject": "law",
      "topic": "กฎหมายการอุดมศึกษา",
      "document": "พระราชบัญญัติการอุดมศึกษา พ.ศ.2562",
      "document_code": "LAW-HED-2562",
      "difficulty": "Medium",
      "tags": ["มาตรา 5", "วิสัยทัศน์"],
      "version": "1.0.0"
    }
  ]
}
```

### Folder structure
```
bulk-import/
├── bulk_import.json          ← manifest
├── summaries/
│   ├── law-hed-2562.md
│   └── policy-hed-2566.md
└── questions/
    ├── law-hed-2562-q01.md
    └── law-hed-2562-q02.md
```

### กฎ Bulk Import
- Manifest รวม metadata ทุกตัว (single source of truth)
- file paths อ้าง relative จาก manifest
- import ตรวจ `document_code` unique ก่อน insert (dedup)
- partial success — ถ้า item หนึ่ง fail ไม่ rollback ทั้ง batch

---

## 5. AI Generated Question Template

### Prompt template (สำหรับ Claude/ChatGPT)
```
จงสร้างคำถามปรนัยตามรูปแบบ Sobdai:

[เอกสารต้นฉบับ/มาตราที่อ้างอิง]
---
จาก: {document_name}
DocumentCode: {document_code}
Subject: {subject_code}
Topic: {topic}
Difficulty: {Easy|Medium|Hard}

สร้าง 4 choices (A-D) พร้อม:
1. คำถามชัดเจน ไม่กำกวม
2. 1 คำตอบที่ถูกต้อง + 3 คำตอบที่ผิดแบบ plausible (ดูเหมือนจะถูก)
3. explanation ทุก choice ในรูปแบบ:
   ### {Letter} — {ถูกต้อง/ไม่ถูกต้อง}
   **เพราะ:** ...
   **อ้างอิง:** มาตรา/หน้า ...

ห้าม:
- คำถามที่ตอบได้ด้วย common sense โดยไม่อ่านเอกสาร
- คำตอบผิดที่ "เกินจริง" จนเดาได้ง่าย
- คำถามที่ negative phrasing ซับซ้อนเกินไป
```

### Expected output
```markdown
---
subject: law
topic: กฎหมายการอุดมศึกษา
document: พระราชบัญญัติการอุดมศึกษา พ.ศ.2562
document_code: LAW-HED-2562
difficulty: Medium
tags: [มาตรา 7, การผลิตบัณฑิต]
version: 1.0.0
---

## Question
ตามมาตรา 7 ข้อใดเป็นแนวทางการผลิตบัณฑิตที่ถูกต้อง?

## Choices
**A.** ...
**B.** ...
**C.** ...
**D.** ...

**Correct Answer:** B

## Explanations
### A — ไม่ถูกต้อง
**เพราะ:** ...
**อ้างอิง:** ...

[... ครบทุก choice ...]
```

---

## 6. AI Generated Summary Template

### Prompt template
```
จงสรุปเอกสาร {document_name} (DocumentCode: {document_code}) ตามรูปแบบ Sobdai:

1. YAML front-matter:
   ---
   subject: {subject_code}
   topic: {topic}
   document: {document_name}
   document_code: {document_code}
   read_time: [ประมาณ]
   tags: [3-5]
   version: 1.0.0
   ---

2. เนื้อหา 2,000-3,000 คำ
3. H1 = ชื่อเอกสารเต็ม, H2 = หมวดหลัก, H3 = หัวข้อย่อย
4. GitHub alerts สำหรับจุดสำคัญ (> [!IMPORTANT] / [!WARNING])
5. ตารางสำหรับสรุปมาตรา/ตัวเลข
6. อ้างอิงมาตรา/หน้าทุกคำกล่าวอ้าง
7. ใช้ชื่อเอกสารเต็ม ห้ามย่อ

ความโทน: เป็นทางการ กระชับ น่าอ่าน สำหรับผู้เตรียมสอบข้าราชการ
```

---

## 7. Reference Template

### รูปแบบมาตรฐาน
```markdown
## อ้างอิง

- **กฎหมาย/เอกสารหลัก:** พระราชบัญญัติการอุดมศึกษา พ.ศ.2562 (DocumentCode: LAW-HED-2562)
  - มาตรา 5 — วิสัยทัศน์
  - มาตรา 7 — แนวทางการผลิตบัณฑิต
- **ราชกิจจานุเบกษา:** เล่ม 136 ตอนพิเศษ 49 ก ลงวันที่ 18 มกราคม 2562
- **เอกสารอ้างอิงเพิ่มเติม:** ประกาศ กกพอ. ที่ 1/2562
- **เว็บไซต์:** https://www.mhesi.go.th/hed-act-2562 (เข้าถึง 7 กรกฎาคม 2569)
```

### กฎ
- ทุกคำกล่าวอ้างต้องมี reference
- แยก "กฎหมายหลัก" vs "เอกสารอ้างอิง"
- URL ต้องมีวันที่เข้าถึง
- ใช้ชื่อเต็มเสมอ

---

## 8. Image Template

### การฝังรูป
```markdown
![คำอธิบายภาพ](/storage/summaries/law-hed-2562/structure.png)
*ภาพที่ 1: โครงสร้างการบริหารสถาบันอุดมศึกษาตามมาตรา 12*
```

### กฎ
- **Alt text บังคับ** — สำหรับ screen reader + SEO
- **Caption** ใต้รูป (italic)
- **Path:** `/storage/{type}/{document_code}/{filename}.{ext}`
- **Format:** PNG (diagram) / JPG (photo) / SVG (icon)
- **ขนาด:** max 200KB หลัง optimize
- **lazy load** (auto ผ่าน next/image)

### ใน manifest
```json
"images": [
  "/storage/summaries/law-hed-2562/structure.png",
  "/storage/summaries/law-hed-2562/timeline.jpg"
]
```

---

## 9. Metadata Template (standalone)

ใช้สำหรับ admin กรอก manual (ไม่ผ่าน markdown):

```yaml
# Sobdai Content Metadata
package: "นักวิเคราะห์นโยบายและแผน สำนักงานปลัด อว. ปี 2568"
organization: "สำนักงานปลัดกระทรวงการอุดมศึกษา วิทยาศาสตร์ วิจัยและนวัตกรรม"
position: "นักวิเคราะห์นโยบายและแผน"

# Taxonomy
subject: law
topic: กฎหมายการอุดมศึกษา
document: พระราชบัญญัติการอุดมศึกษา พ.ศ.2562
document_code: LAW-HED-2562

# Content
difficulty: Medium         # question only
blueprint: 8               # % weight (future)
read_time: 12              # summary only
tags: [อุดมศึกษา, 2562, กกพอ.]

# Media
images:
  - /storage/summaries/law-hed-2562/structure.png
references:
  - มาตรา 5 พ.ร.บ.การอุดมศึกษา พ.ศ.2562
  - ราชกิจจานุเบกษา เล่ม 136

# Versioning
version: 1.0.0
```

---

## Appendix: Field Required Matrix

| Field | Question | Summary | Bulk Import | NotebookLM | AI Question | AI Summary |
|---|---|---|---|---|---|---|
| Package | context | context | yes | no | context | context |
| Organization | context | context | yes | no | context | context |
| Position | context | context | yes | no | context | context |
| Subject | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Topic | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Document | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| DocumentCode | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Difficulty | ✅ | — | ✅ | — | ✅ | — |
| Blueprint | optional | — | optional | — | optional | — |
| Tags | optional | optional | optional | optional | optional | optional |
| Read Time | — | ✅ | ✅ | ✅ | — | ✅ |
| Images | optional | optional | optional | optional | — | optional |
| References | optional | ✅ | optional | ✅ | ✅ | ✅ |
| Version | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
