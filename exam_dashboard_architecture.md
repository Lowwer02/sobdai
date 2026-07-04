# Exam Dashboard Architecture

> **Status:** DESIGN ONLY — proposal เชิงสถาปัตยกรรม/UX
> **ไม่ใช่ production code** ไม่มี SQL/React component พร้อมใช้ การ implement จริงเป็น task แยก
> **Session:** Sobdai 6.12.0

---

## 1. Product Vision

### ปัญหาปัจจุบัน
`/exams` ในปัจจุบันคือ **สำเนาของ Package Catalog ทั้งหมด**:
- `app/exams/page.tsx` query `packages` + `getPackagePublicCounts` RPC — เหมือน `app/page.tsx` (homepage) ทุกบรรทัด
- `ExamCatalogClient.tsx` ใช้ `<PackageCard>` ตัวเดียวกับ homepage
- nav "ข้อสอบ" (`/exams`) กับ nav "หน้าแรก" (`/`) พาผู้ใช้ไปเจอเนื้อหาเดียวกัน

ผล: **UX duplication** ผู้ใช้สับสน สองทางเข้าไปตลาดเดียวกัน ไม่มีพื้นที่ "ส่วนตัว"

### Vision ใหม่
เปลี่ยน `/exams` จาก **Exam Catalog** → **"My Exam Dashboard"**

| | Catalog (homepage `/`) | Dashboard (`/exams`) |
|---|---|---|
| จุดประสงค์ | ค้นหา / เปรียบเทียบ / ซื้อ | เรียน / ทบทวน / ติดตามความคืบหน้า |
| มุมมอง | สาธารณะ (ทุก package) | ส่วนตัว (package ที่ซื้อ + ความคืบหน้าของฉัน) |
| ผู้ไม่ login | เห็นได้ปกติ | empty state + ชวน login |
| ข้อมูลหลัก | price, difficulty, จำนวนข้อ | score, accuracy, วันที่ทำ, หัวข้ออ่อน |

**หลักการ:** homepage = marketplace, `/exams` = personal study room — แยกหน้าที่ชัดเจน ไม่ทับซ้อน

---

## 2. UX Flow

### A. Auth & Entry
```
ผู้ใช้คลิก "ข้อสอบ" ใน navbar
        │
        ├── ยังไม่ login ──► /exams แสดง empty state
        │                     "ล็อกอินเพื่อดูแดชบอร์ดของคุณ"
        │                     [ล็อกอิน] [สำรวจชุดข้อสอบ → /]
        │
        └── login แล้ว ──► /exams dashboard
                            (พื้นที่ landing ส่วนตัว ไม่ใช่ homepage)
```

### B. Continue Learning Flow
```
dashboard → Continue Learning card (package ที่ซื้อ + มีความคืบหน้า)
        │
        └── คลิก → /package/[slug] (detail)
                    │
                    └── เลือก exam set → /package/[slug]/exam/[examSetId]
                                         │
                                         └── resume (ถ้ามี attempt in_progress)
                                             หรือเริ่มใหม่
```

### C. Result → Dashboard Loop (Phase 1+)
```
ทำสอบจบ → บันทึก attempt → แสดง result screen
        │
        └── กลับ dashboard → เห็น:
              ✓ Recent Results อัปเดต (attempt ล่าสุด)
              ✓ Analytics อัปเดต (avg/total/accuracy)
              ✓ Timeline เพิ่ม event ใหม่
              ✓ Continue Learning อัปเดต progress
```
> ⚠️ ปัจจุบัน result "หาย" เพราะไม่มีการ persist — flow นี้ต้องการ Phase 1

### D. Empty States (ผู้ใช้ใหม่ / ยังไม่มีข้อมูล)
| สถานการณ์ | Empty state |
|---|---|
| ยังไม่ login | "ล็อกอินเพื่อดูแดชบอร์ด" + CTA login |
| login แล้ว ยังไม่ซื้อ | "คุณยังไม่มีชุดข้อสอบ" + CTA ไป homepage |
| ซื้อแล้ว ยังไม่เคยทำ | Continue Learning แสดง package, ส่วนอื่น empty |
| ทำแล้ว ยังไม่มี bookmark | section bookmark แสดง empty hint |

---

## 3. Information Architecture

ลำดับ section ใน dashboard จัดตาม **value ต่อผู้ใช้** + **data availability** (phase ที่ทำได้):

```
┌─────────────────────────────────────────────┐
│  A. Continue Learning          [Phase 0]    │  ← สำคัญที่สุด, มี data วันนี้
│     package ที่ซื้อ + ความคืบหน้า              │
├─────────────────────────────────────────────┤
│  B. Recent Exam Results       [Phase 1]    │  ← motivation loop
│     practice/mock ล่าสุด + score              │
├─────────────────────────────────────────────┤
│  C. Analytics Snapshot        [Phase 1]    │  ← self-awareness
│     avg / best / total / accuracy           │
├─────────────────────────────────────────────┤
│  F. Activity Timeline         [Phase 1]    │  ← history context
│     ลำดับเหตุการณ์ล่าสุด                       │
├─────────────────────────────────────────────┤
│  D. Weak Topics               [Phase 2]    │  ← actionable insight
│     หัวข้อที่ accuracy ต่ำสุด                  │
├─────────────────────────────────────────────┤
│  E. Bookmarked Questions      [Phase 2]    │  ← review queue
│     จำนวน + เข้าถึงด่วน                       │
└─────────────────────────────────────────────┘
```

---

## 4. Dashboard Layout

### Desktop (≥1024px) — 2 column

```
┌──────────────────────────────────────────────────────────────────┐
│  Sticky top bar:  ← กลับ  |  แดชบอร์ดข้อสอบของฉัน  |  ⚙ ออกจากระบบ │
├────────────────────────────────────────┬─────────────────────────┤
│                                        │  ┌───────────────────┐  │
│  ▶ ทำต่อ (Continue Learning)            │  │ 📊 สถิติรวม       │  │
│  ┌──────┐ ┌──────┐ ┌──────┐           │  │                   │  │
│  │ pkg1 │ │ pkg2 │ │ pkg3 │  → scroll │  │  เฉลี่ย  72%       │  │
│  │ 45%  │ │ ก้าว │ │ ใหม่ │           │  │  สูงสุด  91%       │  │
│  └──────┘ └──────┘ └──────┘           │  │  ทำแล้ว  24 ครั้ง  │  │
│                                        │  └───────────────────┘  │
│  ▶ ผลสอบล่าสุด                          │  ┌───────────────────┐  │
│  ┌────────────────────────────────┐   │  │ ⭐ ที่คั่วไว้       │  │
│  │ Mock · กรมที่ X · 78% · 2 ชม.ที่แล้ว│   │  │                   │  │
│  └────────────────────────────────┘   │  │  18 ข้อ → ดูทั้งหมด │  │
│                                        │  └───────────────────┘  │
│  ▶ ไทม์ไลน์                              │  ┌───────────────────┐  │
│  • ทำ Mock 78%             2 ชม.ที่แล้ว  │  │ 🎯 หัวข้ออ่อน     │  │
│  • ทำ Practice 65%         เมื่อวาน     │  │                   │  │
│  • ซื้อแพ็กเกจ Y            2 วันที่แล้ว  │  │  • กฎหมาย 51%     │  │
│                                        │  │  • บริหาร  58%     │  │
│  [โหลดเพิ่ม...]                         │  └───────────────────┘  │
└────────────────────────────────────────┴─────────────────────────┘
   main (8 col)                              sidebar (4 col)
```

### Mobile (<1024px) — single column stack
```
┌──────────────────────┐
│ top bar (compact)    │
├──────────────────────┤
│ 📊 สถิติ             │ ← horizontal scroll cards
│ [72%] [91%] [24ครั้ง]│   (swipe ดูทั้งหมด)
├──────────────────────┤
│ ▶ ทำต่อ              │ ← ต่อจากนี้เป็น stack
│ [pkg1] [pkg2] [pkg3]│   (card เลื่อนแนวนอน)
├──────────────────────┤
│ ▶ ผลสอบล่าสุด        │
├──────────────────────┤
│ 🎯 หัวข้ออ่อน        │
├──────────────────────┤
│ ⭐ ที่คั่วไว้         │
├──────────────────────┤
│ ▶ ไทม์ไลน์           │
└──────────────────────┘
```

### Empty state (ยังไม่ login)
```
┌──────────────────────────────────────┐
│                                      │
│           [illustration]             │
│                                      │
│     แดชบอร์ดข้อสอบของคุณ              │
│                                      │
│  ล็อกอินเพื่อติดตามความคืบหน้า         │
│  ดูผลสอบ และสถิติของคุณ              │
│                                      │
│     [ ล็อกอิน ]  [ สำรวจชุดข้อสอบ ] │
│                                      │
└──────────────────────────────────────┘
```

**Theme:** ใช้ palette Sobdai เดิมทั้งหมด (`#0F0B07` bg, `#D4AF37` gold, `#F5E9D6` text) — ไม่แตะสีใหม่

---

## 5. Required Data (per section)

> อธิบายเชิง concept ของ query ไม่ใช่ SQL production-ready

### A. Continue Learning
**Fields:** package id/slug/name, org logo, position name, total_questions, last_attempt_progress (optional), purchased_date
**Query concept:**
- `packages` JOIN `orders` WHERE `orders.user_id = me` AND `orders.status IN ('paid','free')`
- enrich ด้วย `getPackagePublicCounts` RPC (มีอยู่แล้ว) สำหรับ total_questions/exam_sets
- (Phase 1+) JOIN `exam_attempts` ล่าสุดต่อ package เพื่อแสดง progress bar

### B. Recent Exam Results
**Fields:** mode, exam_set name, package name, score/total, accuracy%, completed_at
**Query concept:** `exam_attempts` WHERE `user_id = me` AND `status = 'completed'` ORDER BY `completed_at DESC` LIMIT 5

### C. Analytics Snapshot
**Fields:** avg_accuracy, best_score (max accuracy), total_practice, total_mock
**Query concept:** aggregate บน `exam_attempts` — `AVG(accuracy_pct)`, `MAX(accuracy_pct)`, `COUNT(*) FILTER (mode='practice')`, `COUNT(*) FILTER (mode='mock')`
- ควรใช้ **profile stats cache columns** (Phase 1 optional) เพื่อหลีกเลี่ยง aggregate ทุกครั้ง

### D. Weak Topics
**Fields:** topic/subject name, accuracy%, attempt_count
**Query concept:** aggregate `question_answers` JOIN `questions`(topic, subject) GROUP BY topic → HAVING accuracy < threshold (เช่น 60%) ORDER BY accuracy ASC LIMIT 5
- ควรเป็น **RPC** (`get_user_weak_topics`) ตาม pattern `getPackagePublicCounts` ที่มีอยู่

### E. Bookmarked Questions
**Fields:** total_count, sample 3 ข้อ (content snippet), question topics
**Query concept:** `bookmarks` WHERE `user_id = me` COUNT + LIMIT 3 JOIN `questions` สำหรับ preview

### F. Activity Timeline
**Fields:** event_type, label, score/metadata, timestamp
**Query concept:** `exam_attempts` WHERE `user_id = me` ORDER BY `created_at DESC` LIMIT 20 (union future: order events, bookmark events)

---

## 6. Existing Tables Reused

| Table | ใช้ที่ไหน | Field ที่ใช้ | หมายเหตุ |
|---|---|---|---|
| **`packages`** | Continue Learning card | id, slug, name, logo_url, exam_year, difficulty | เดิม |
| **`exam_sets`** | drill-down / result label | id, name, is_sample, duration_minutes | เดิม |
| **`orders`** | Continue Learning universe | user_id, package_id, status | filter `status IN ('paid','free')` |
| **`organizations`** | card display | name, logo_url | เดิม |
| **`positions`** | card display | name | เดิม |
| **`questions`** | Weak Topics metadata | subject, law, topic, category, tags, difficulty | **ครบแล้ว** (migration 002) |
| **`exam_set_questions`** | resolve set↔question | exam_set_id, question_id | เดิม |
| **`profiles`** | user identity | id, email, role | ⚠️ ไม่มี stats column → ไม่ reuse สำหรับ analytics |
| **`getPackagePublicCounts` RPC** | Continue Learning card | total_questions, total_exam_sets | reuse ตรง |
| **`summaries`** | (อนาคต) Continue Learning | — | ยังไม่ใช้ใน phase แรก |

> **สรุป:** schema เดิมรองรับ Continue Learning ได้เต็มที่ Phase 0 สามารถสร้างได้โดยไม่ต้องแตะ DB เลย

---

## 7. New Tables Needed

> ⚠️ **Proposal เท่านั้น** — เป็น design ไม่ใช่ SQL พร้อมรัน การ implement ต้อง task แยก + migration review + แก้ `ExamRuntime.tsx`

### Phase 1 — เปิด Results / Analytics / Timeline / Continue-progress

#### `exam_attempts` (one row per exam session)
| column | type | note |
|---|---|---|
| `id` | uuid PK | |
| `user_id` | uuid → profiles | RLS owner-only |
| `package_id` | uuid → packages | |
| `exam_set_id` | uuid → exam_sets | |
| `mode` | text CHECK ('practice','mock') | |
| `score` | int | correct count |
| `total_questions` | int | |
| `correct_count` | int | (= score, explicit for clarity) |
| `accuracy_pct` | numeric | `score/total*100` |
| `time_spent_seconds` | int | |
| `status` | text CHECK ('in_progress','completed','abandoned') | |
| `started_at` | timestamptz | |
| `completed_at` | timestamptz | nullable |

**RLS:** `auth.uid() = user_id` (owner-only read/write)
**Index:** `(user_id, completed_at DESC)` — สำหรับ Recent Results + Timeline

#### (optional) `profiles` stats cache
เพิ่ม columns: `total_practice`, `total_mock`, `avg_accuracy`, `best_accuracy`, `last_attempt_at`
- อัปเดตด้วย **trigger** หลัง insert `exam_attempts` (เพื่อหลีกเลี่ยง aggregate query หนักทุกครั้งที่เปิด dashboard)
- trade-off: storage เล็กน้อยแลกกับ read performance

### Phase 2 — เปิด Weak Topics + Bookmarks

#### `question_answers` (one row per answered question — เก็บตอน submit ไม่ใช่ทุก keystroke)
| column | type | note |
|---|---|---|
| `id` | uuid PK | |
| `attempt_id` | uuid → exam_attempts | ON DELETE CASCADE |
| `question_id` | uuid → questions | |
| `selected_answer` | char(1) | 'A'/'B'/'C'/'D' |
| `is_correct` | boolean | |
| `time_spent_seconds` | int | nullable |

**RLS:** owner-only ผ่าน `attempt_id → user_id` (subquery policy)
**Index:** `(attempt_id)`, `(question_id)` สำหรับ aggregate

#### `bookmarks`
| column | type | note |
|---|---|---|
| `id` | uuid PK | |
| `user_id` | uuid → profiles | RLS owner-only |
| `question_id` | uuid → questions | |
| `note` | text | nullable |
| `created_at` | timestamptz | |
| UNIQUE | `(user_id, question_id)` | กัน bookmark ซ้ำ |

#### (optional) RPC `get_user_weak_topics(user_id uuid)`
Aggregate accuracy ตาม topic/subject ใน SQL เดียว — pattern เดียวกับ `getPackagePublicCounts` ที่มีอยู่ (SECURITY DEFINER + grant execute ถ้าจำเป็น)

---

## 8. Performance Considerations

| เรื่อง | แนวทาง |
|---|---|
| **Rendering** | Server Component สำหรับ user-scoped data (dynamic) — ใช้ `createClient()` (cookies) เหมือน `app/package/[slug]/page.tsx` |
| **Public part** (empty state CTA) | ใช้ `createAnonServerClient` pattern ถ้าจำเป็น (เหมือน homepage) |
| **Analytics หนัก** | ใช้ RPC aggregate แทน client-side loop — pattern `getPackagePublicCounts`. หรืออ่านจาก profile stats cache columns |
| **Pagination** | Recent Results + Timeline ใช้ `LIMIT/OFFSET` (หรือ cursor) ไม่โหลดทั้งหมด |
| **Index proposals** | `exam_attempts(user_id, completed_at DESC)`, `question_answers(attempt_id)`, `bookmarks(user_id, created_at DESC)` |
| **Bundle** | dashboard เป็น server-rendered → JS bundle เล็ก ไม่กระทบเทียบกับ catalog page |
| **ไม่กระทบ performance work ก่อนหน้า** | dashboard ใช้ pattern เดียวกัน (anon client / RPC / revalidate ถ้าเหมาะ) — ไม่แตะ proxy/ISR/RPC ที่ทำไว้ |
| **Continue Learning query** | reuse `getPackagePublicCounts` RPC (มีอยู่แล้ว) — ไม่ต้องเขียน nested count ใหม่ |
| **Empty state** | ถ้าไม่ login ไม่ query เลย → TTFB เร็ว |

---

## 9. Future Roadmap

### Phase 0 — หลุดจาก Catalog Duplication (ship first, **no schema change**)
✅ ทำได้วันนี้ทั้งหมด:
- เปลี่ยน `/exams` จาก `ExamCatalogClient` → dashboard ใหม่
- **Continue Learning** จาก `orders`(paid/free) + `packages` + `getPackagePublicCounts`
- **Empty state** สำหรับผู้ไม่ login + ผู้ยังไม่ซื้อ
- Section B-F แสดงเป็น "เร็วๆ นี้" placeholder

→ คุณค่าทันที: ลด UX duplication, `/exams` มี purpose ชัดเจน, ไม่ทับซ้อน homepage

### Phase 1 — Results / Analytics / Timeline (add `exam_attempts` + stats cache)
- สร้าง migration `exam_attempts`
- **แก้ `ExamRuntime.tsx`** ให้ persist ผลสอบตอน submit (ปัจจุบันหาย)
- เพิ่ม profile stats cache + trigger (optional)
- เปิด section B (Recent Results), C (Analytics), F (Timeline)
- Continue Learning แสดง progress bar จริง

### Phase 2 — Weak Topics + Bookmarks (add `question_answers` + `bookmarks`)
- สร้าง migration `question_answers` + `bookmarks`
- แก้ `ExamRuntime.tsx` ให้ persist per-answer (ตอน submit)
- เพิ่ม UI "บันทึกข้อนี้" ในหน้าข้อสอบ + persist bookmark
- เปิด section D (Weak Topics), E (Bookmarks)
- (optional) RPC `get_user_weak_topics`

### Phase 3+ — Nice-to-have (ไม่ใช่ core)
- 🔥 Streak / study heatmap (เรียนต่อเนื่องกี่วัน)
- 🎯 Goal setting (เป้าหมายคะแนน/จำนวนข้อ)
- 🤖 AI-recommended review (แนะนำข้อที่ควรทบทวน)
- 📤 Export results (PDF/CSV)
- 🏆 Leaderboard (opt-in, เปรียบเทียบกับผู้อื่น)
- 🔔 Reminder / notification (อย่าลืมทบทวน)

---

## Appendix: ไฟล์ที่เกี่ยวข้อง (อ้างอิงสำหรับ implement ในอนาคต)

| ไฟล์ | บทบาทในการ implement |
|---|---|
| `app/exams/page.tsx` + `ExamCatalogClient.tsx` | เปลี่ยนเป็น dashboard (Phase 0) |
| `app/package/[slug]/exam/[examSetId]/ExamRuntime.tsx` | เพิ่ม persist attempt + per-answer (Phase 1-2) |
| `lib/supabase/server.ts` / `anon-server.ts` | reuse client pattern |
| `lib/publicData.ts` (RPC pattern) | template สำหรับ RPC ใหม่ |
| `supabase/migrations/016_package_counts_rpc.sql` | template สำหรับ RPC migration |
| `components/PackageCard.tsx` | reuse ใน Continue Learning card |

> **ย้ำ:** เอกสารนี้เป็น design การ implement แต่ละ phase เป็น task แยก ต้องมี plan review + migration review + QA ของตัวเอง
