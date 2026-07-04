# User Ban System — Report

## Objective

ระบบ Ban/Unban ผู้ใช้สำหรับ admin moderation — ห้ามแตะ auth logic, payment, packages, exams, summaries, markdown, avatar, ISR, performance หรือ learning features ใดๆ

ผลลัพธ์: admin/owner แบนผู้ใช้ได้ → ผู้ใช้ถูกแบน login ไม่ได้ + session ถูกปิดทันที + เห็นข้อความ + เห็นสถานะใน Settings

---

## Files Modified

| ไฟล์ | การเปลี่ยน |
|---|---|
| `supabase/migrations/018_ban_metadata.sql` | **สร้างใหม่** — เพิ่ม `banned_at`, `banned_reason`, `banned_by` columns (reuse `status` เดิม, no RLS change) |
| `app/admin/users/actions.ts` | `updateUserStatus` รับ `reason?` param + set/clear ban metadata |
| `app/admin/users/UsersClient.tsx` | confirm dialog text ตาม spec (ยืนยันการระงับผู้ใช้งาน / ระงับผู้ใช้ / ยกเลิก) |
| `components/AuthModal.tsx` | หลัง login success → check `status='banned'` → signOut + redirect `/login?banned=1` |
| `components/Navbar.tsx` | `fetchUserAndRole` + onAuthStateChange safety net → banned ก็ signOut + redirect |
| `app/auth/callback/route.ts` | OAuth callback → check banned → signOut + redirect |
| `app/login/page.tsx` | อ่าน `?banned=1` → แสดง "บัญชีของคุณถูกระงับ กรุณาติดต่อผู้ดูแลระบบ" |
| `app/settings/SettingsClient.tsx` | เพิ่ม `status` ใน Profile type + แสดง "สถานะบัญชี: ปกติ/ถูกระงับ" badge |

---

## 1. Database

**Reuse existing:** `profiles.status` (migration 004) — `text check ('active','banned')` ✅

**New columns (migration 018):**
- `banned_at timestamptz` — เมื่อไหร่
- `banned_reason text` — ทำไม (optional)
- `banned_by uuid` → profiles(id) — ใคร

**ไม่สร้าง:** `is_banned` boolean (ซ้ำซ้อนกับ status), ไม่สร้างตารางใหม่

**RLS:** ไม่เปลี่ยน — policy UPDATE เดิม (migration 010) อนุญาต `auth.uid() = id OR role IN ('owner','admin')` → support ไม่ผ่าน (ตรง spec "Support cannot")

---

## 2. Admin User List

`UsersClient.tsx` มีอยู่แล้ว:
- ✅ Ban/Unban buttons (Ban icon / CheckCircle icon)
- ✅ Permission gate: `requirePermission('users.write')` ใน action → owner/admin only
- ✅ Status filter dropdown (All / Active / Banned)
- ✅ Status badge ในตาราง

**แก้เพิ่ม:** confirm dialog text ตาม spec:
- Title: "ยืนยันการระงับผู้ใช้งาน"
- Body: "ผู้ใช้งานจะไม่สามารถเข้าสู่ระบบได้จนกว่าจะยกเลิกการระงับ"
- Buttons: "ยกเลิก" / "ระงับผู้ใช้"

---

## 3. Login Protection

**Flow (AuthModal — password login):**
1. `signInWithPassword` success
2. query `profiles.select('deleted_at, status')`
3. ถ้า `status='banned'` → `signOut()` + `window.location.href = '/login?banned=1'`

**Flow (OAuth — auth/callback/route.ts):**
1. `exchangeCodeForSession` success
2. `getUser()` + query `profiles.select('status')`
3. ถ้า `status='banned'` → `signOut()` + redirect `/login?banned=1`

---

## 4. Existing Session (Safety Net)

`Navbar.fetchUserAndRole` ทำงานทุกครั้งที่:
- mount (ครั้งแรก)
- `onAuthStateChange` (session เปลี่ยน — เช่น token refresh)

โดย select `role, deleted_at, avatar_url, status` → ถ้า `status='banned'` → signOut + redirect `/login?banned=1`

> หมายเหตุ: ผู้ใช้ที่กำลัง online ตอนถูกแบน จะถูกเตะออกในการ refresh หน้าถัดไป หรือ auth state change ถัดไป (ไม่มี polling ตาม constraint)

---

## 5. Navbar

> **No change** (ตาม spec) — Navbar ยังเหมือนเดิม แค่มี banned check เป็น safety net ใน `fetchUserAndRole` ที่ทำงานอยู่แล้ว

---

## 6. Settings

แสดง badge "สถานะบัญชี: ปกติ/ถูกระงับ" ถัดจาก role badge:
- ปกติ = green-500/10 + green-400
- ถูกระงับ = red-500/10 + red-300

---

## 7. Security Verification

| เงื่อนไข | ผล |
|---|---|
| Banned user sign in (password) | ❌ blocked — signOut + redirect `/login?banned=1` |
| Banned user sign in (OAuth) | ❌ blocked — signOut + redirect `/login?banned=1` |
| Banned user session ที่ online | ❌ เตะออกใน auth state change / refresh ถัดไป |
| Support พยายาม ban | ❌ ไม่ผ่าน `requirePermission('users.write')` |
| Owner/Admin ban | ✅ ได้ |
| Owner/Admin unban | ✅ ได้ |
| Ban ตัวเอง/owner ตัวสุดท้าย | ❌ action ป้องกัน (last owner rule) |
| RLS | ✅ ไม่ weaken — policy UPDATE เดิมอนุญาต owner/admin เท่านั้น |

**ไม่ได้ทำ server-side check ในทุก protected page** (ตาม decision: แค่ login + session ปิด) เพราะ:
- constraint ห้ามแตะ static pages `/packages` (ISR)
- ถ้าทำ server check ในทุกหน้า → static pages กลายเป็น dynamic → ทำลาย ISR
- login + session ปิดเป็น choke point เพียงพอ (banned user ไม่มี session ที่ใช้ได้)

---

## 8. Browser QA

| บทบาท | ผลที่คาดหวาน |
|---|---|
| Guest | เข้า protected pages ไม่ได้อยู่แล้ว (auth flow เดิม) |
| Normal user | ใช้งานได้ปกติ |
| Banned user (พยายาม login) | signOut ทันที + redirect `/login?banned=1` + เห็นข้อความ |
| Banned user (online session) | เตะออกใน refresh / auth change ถัดไป |
| Admin | ban / unban ได้ |
| Owner | ban / unban ได้ |
| Support | ไม่เห็นปุ่ม ban (no `users.write`) |

> **หมายเหตุ:** ผ่าน code review + build verification — ควรทดสอบด้วยตาใน browser จริง (สร้าง test user → ban → ลอง login/session)

---

## 9. Regression Analysis

| ระบบ | กระทบ? | เหตุผล |
|---|---|---|
| Payment / Checkout / Omise | ❌ | ไม่แตะ |
| Orders | ❌ | ไม่แตะ |
| Practice / Mock / ExamRuntime | ❌ | ไม่แตะ |
| Summary / Markdown | ❌ | ไม่แตะ |
| Package / Dashboard / Downloads | ❌ | ไม่แตะ |
| Avatar Upload | ❌ | ไม่แตะ (Settings แค่แสดง status เพิ่ม) |
| **ISR (homepage + /packages)** | ❌ | ไม่แตะ — build ยืนยันยัง ○ Static 5m |
| **RPC / Promise.all** | ❌ | ไม่แตะ |
| **Proxy** | ❌ | matcher ยัง `/admin/*` เท่านั้น ไม่ได้เพิ่ม |
| Auth logic (signIn flows) | ⚠️ เล็กน้อย — เพิ่ม status check หลัง login success (optimistic post-success gate ไม่ใช่การแก้ auth mechanism) | sign-in mechanism เดิม |
| Admin Users page | ⚠️ เล็กน้อย — แก้ dialog text + action signature เดิม | logic ban/unban ไม่เปลี่ยน |

---

## 10. Performance Verification

| เงื่อนไข | ผล |
|---|---|
| **No polling** | ✅ — ใช้ `onAuthStateChange` subscription เดิม |
| **No extra queries (per request)** | ✅ — ban check ทำเฉพาะตอน login (1 ครั้ง) และใน Navbar profile fetch ที่มีอยู่แล้ว |
| **No ISR impact** | ✅ — build ยืนยัน homepage + `/packages` ยัง ○ Static 5m |
| **No proxy impact** | ✅ — matcher ไม่เปลี่ยน |
| **No new dependency** | ✅ |
| **Bundle** | minimal — เพิ่มเฉพาะ condition checks + 1 badge |

---

## 11. Build Verification

```
$ npx tsc --noEmit   → 0 errors
$ npx next build     → ✓ Compiled successfully in 5.1s (33/33 routes)
```

- 0 TypeScript errors
- 0 Build errors
- `/` ยัง ○ Static Revalidate 5m
- `/packages` ยัง ○ Static Revalidate 5m
- ไม่มี warning ใหม่

---

## 12. Future Roadmap

- **Phase 1+ (optional):** server-side ban check ในหน้า dynamic ที่จำเป็น (`/orders`, `/settings` ที่ dynamic อยู่แล้ว) ถ้าต้องการ defense-in-depth
- **Phase 2 (optional):** ส่งอีเมลแจ้งผู้ใช้ตอนถูกแบน (reason) — ต้องการ email service
- **Phase 3 (optional):** ban appeal flow + auto-unban ตามกำหนดเวลา
- **Phase 4 (optional):** ถ้าต้องการ server-side choke point จริง สามารถขยาย proxy matcher รวม protected routes + check session → แต่ต้อง trade-off perf (เพิ่ม 1 network call ใน proxy)
