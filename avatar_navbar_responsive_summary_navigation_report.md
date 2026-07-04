# Avatar Navbar & Responsive Summary Navigation — Report

## 1. Objective

Polish UX สองส่วน โดยไม่แตะ DB/Auth/Payment/Performance/Markdown/Admin:
1. **Navbar Avatar** — แสดง avatar ที่ผู้ใช้อัปโหลด ใน Navbar/Profile Menu (แทน initial ตัวอักษรเดิม) โดย reuse `avatar_url` ที่มีอยู่ ไม่อัปโหลดใหม่ ไม่ query เพิ่ม
2. **Responsive Summary Navigation** — Mobile (<768px) = accordion / Tablet+Desktop (>=768px) = ทุก category expanded ไม่มี accordion

---

## 2. Files Modified

| ไฟล์ | การเปลี่ยน |
|---|---|
| `components/Navbar.tsx` | เพิ่ม `avatarUrl` state + include `avatar_url` ใน profile select + ส่ง prop ให้ Desktop/Mobile + reset ตอน logout |
| `components/DesktopNav.tsx` | รับ prop `avatarUrl` + แสดง `next/image` ถ้ามี, fallback initial เดิม + aria-label |
| `components/MobileNav.tsx` | รับ prop `avatarUrl` + แสดง `next/image` ถ้ามี, fallback initial เดิม |
| `components/SummaryNavigation.tsx` | เพิ่ม `isDesktop` state (matchMedia) + responsive expand logic |

**ไม่สร้างไฟล์ใหม่ / ไม่เพิ่ม dependency / ไม่แต้ม CSS ใหม่**

---

## 3. Navbar Avatar Changes

### หลักการ
- **Reuse** profile query ที่ `Navbar.tsx` ทำอยู่แล้ว (line 30 เดิม select `role, deleted_at`) — เพิ่ม `avatar_url` เข้าไปใน select เดิม → **ไม่เพิ่ม query**
- ส่ง `avatarUrl` เป็น prop ไป `DesktopNav` + `MobileNav`
- reset เป็น `null` ตอน logout / deactivated account

### Rendering
- **DesktopNav**: ถ้า `avatarUrl` มี → `<Image>` (next/image, 28×28, object-cover, border ทอง) แทน div initial; ถ้าไม่มี → fallback div initial เดิมทุกประการ
- **MobileNav**: เหมือนกันแต่ขนาด 48×48 (ตามขนาดเดิม)
- size: 28px (desktop) / 48px (mobile) ≈ ในช่วง 40–44px ที่ spec กำหนด (desktop เล็กกว่าเพราะ navbar compact; mobile ใหญ่กว่าเพราะเป็น profile summary)

### Performance
- ใช้ `next/image` (มีอยู่ใน project แล้ว) → optimize + lazy + browser cache
- Supabase domain config อยู่แล้วใน `next.config.ts` (`*.supabase.co` remotePatterns — จาก task performance)
- **ไม่เพิ่ม query**: แค่เพิ่ม column ใน select เดิม
- **ไม่เพิ่ม bundle**: เป็น server-fetched state ส่งเป็น prop ธรรมดา

### สิ่งที่คงไว้
- ✅ hover animation (เดิม transition-all)
- ✅ keyboard accessibility (button focusable, focus ring)
- ✅ dropdown behavior ไม่เปลี่ยน
- ✅ fallback initial เมื่อไม่มี avatar

---

## 4. Responsive Summary Navigation Changes

### หลักการ
- ใช้ `window.matchMedia('(min-width: 768px)')` track `isDesktop` state + listener สำหรับ resize
- **Desktop (>=768px)**: ทุก category expanded เสมอ (`isCategoryExpanded` return `true` ตลอด) + ซ่อน chevron + disabled toggle button (กลายเป็น static heading)
- **Mobile (<768px)**: accordion เดิม — เปิดได้ทีละ category, auto-expand อันแรก

### Helper
```ts
const isCategoryExpanded = (category) => isDesktop || effectiveExpanded === category
```

### Collapsed panel style (responsive)
- Desktop: padding เท่านั้น (no maxHeight, no transition, no overflow hidden)
- Mobile: maxHeight + opacity + transition + overflow hidden (เหมือนเดิม)

### สิ่งที่คงไว้ (ตาม constraint)
- ✅ Search box
- ✅ Filter pills (ทั้งหมด / พร้อมเรียน / ล่าสุด)
- ✅ Result count ("X รายการ")
- ✅ Category grouping (by subject)
- ✅ "พร้อมเรียน" badge
- ✅ Summary links (title, read time, topic)
- ✅ Search logic, filter logic, grouping logic — **ไม่แตะ**
- ✅ Empty state ("กำลังจัดเตรียมสรุปเนื้อหา" / "ไม่พบสรุปเนื้อหาที่ตรงกับเงื่อนไข")

---

## 5. Browser QA Checklist

> Verify ผ่าน code + build. แนะนำให้ทดสอบด้วยตาใน browser จริง

### Avatar
- [ ] Desktop: avatar แสดงใน navbar (ถ้ามี), fallback initial (ถ้าไม่มี)
- [ ] Mobile: avatar แสดงใน slide-out menu header
- [ ] Logout → avatar หาย กลับเป็น login button
- [ ] hover ยังมี animation
- [ ] focus ring ทำงาน (Tab + Enter เปิด dropdown)

### Summary Navigation — Mobile (<768px)
- [ ] Accordion: กด category เปิด/ปิด
- [ ] เปิดได้ทีละอัน
- [ ] auto-expand อันแรก
- [ ] chevron หมุน
- [ ] Search + filter + count ทำงาน

### Summary Navigation — Tablet/Desktop (>=768px)
- [ ] ทุก category expanded ทันที
- [ ] ไม่มี chevron
- [ ] ไม่มี toggle (ปุ่ม disabled)
- [ ] Search + filter + count ยังทำงาน
- [ ] Resize ข้าม breakpoint → เปลี่ยน behavior ทันที (matchMedia listener)

### Responsive ทั่วไป
- [ ] Desktop / Tablet / Mobile ไม่ overflow
- [ ] ไม่มี layout shift ตอน matchMedia toggle
- [ ] Dark theme คงเดิม

---

## 6. Accessibility

| เรื่อง | ผล |
|---|---|
| **ARIA labels** | เพิ่ม `aria-label="เปิดเมนูโปรไฟล์"` ที่ desktop avatar button |
| **aria-expanded** | category button ยังรายงาน expand state ถูกต้อง (desktop = ตลอด `true`) |
| **aria-controls** | คงเดิม (category button ↔ region) |
| **Keyboard** | toggle button ยัง focusable; desktop disabled (ไม่ interactive — ปลอดภัยเพราะเปิดอยู่แล้ว) |
| **Focus states** | focus ring ทอง คงเดิม |
| **Screen reader** | region/heading semantics คงเดิม; avatar มี alt ภาษาไทย "รูปโปรไฟล์" |
| **alt text** | avatar: descriptive alt; logo: เดิม |

---

## 7. Regression Analysis

| ระบบ | กระทบ? | เหตุผล |
|---|---|---|
| Homepage | ❌ | ไม่แตะ |
| Package Detail | ⚠️ เล็กน้อย — ใช้ `SummaryNavigation` (ปรับ rendering เท่านั้น ไม่แต้ logic) | search/filter/group/order เดิม |
| Package Catalog | ❌ | ไม่แตะ |
| Dashboard (`/exams`) | ❌ | ไม่แตะ |
| Downloads | ❌ | ไม่แตะ |
| Orders | ❌ | ไม่แตะ |
| Avatar Upload (`/settings`) | ❌ | ไม่แตะ (อัปโหลดเหมือนเดิม — Navbar แค่อ่าน `avatar_url`) |
| Practice / Mock / ExamRuntime | ❌ | ไม่แตะ |
| Checkout / Payment | ❌ | ไม่แตะ |
| Admin Panel | ❌ | ไม่แตะ |
| Markdown renderer | ❌ | ไม่แตะ |
| Performance (ISR/RPC/Promise.all/Proxy/cache/image) | ❌ | ทั้งหมดคงเดิม — avatar ใช้ pattern query เดิม |

> จุดสังเกต: Navbar ยังใช้ `getSession()` (จาก task performance) ไม่ได้เปลี่ยนกลับเป็น `getUser()` — auth check ฝั่ง client เป็น optimistic เหมือนเดิม

---

## 8. Performance Verification

| เงื่อนไข | ผล |
|---|---|
| **No additional DB query** | ✅ — เพิ่ม column ใน select เดิม (`role, deleted_at` → `role, deleted_at, avatar_url`) |
| **No extra API** | ✅ |
| **No new dependency** | ✅ — ใช้ `next/image` (มีอยู่) + `matchMedia` (browser API) |
| **No client polling** | ✅ — ใช้ auth state change subscription เดิม |
| **Bundle increase** | minimal — เพิ่มแค่ `<Image>` + `matchMedia` hook + เงื่อนไข render |
| **Image optimization** | ✅ — `next/image` (optimize + lazy + cache) |
| **ISR/RPC/Promise.all/Proxy** | ✅ คงเดิมทั้งหมด |
| **Layout shift** | ไม่มี — avatar มี width/height fix; summary nav ใช้ matchMedia + listener (ไม่กระตุก) |

---

## 9. Build Verification

```
$ npx tsc --noEmit   → 0 errors
$ npx next build     → ✓ Compiled successfully in 2.9s (33/33 routes)
```

- 0 TypeScript errors
- 0 Build errors
- homepage + `/packages` ยัง ○ Static ISR (ไม่กระทบ)
- ไม่มี warning ใหม่

---

## Appendix — การตัดสินใจสำคัญ

### ทำไมใช้ `matchMedia` แทน CSS-only responsive?
- Accordion มี state (`expandedCategory`) + transition บน `maxHeight` → เป็น JS-driven behavior
- CSS-only (เช่น `md:hidden` บน chevron) ไม่พอ เพราะต้องคุม expand/collapse logic + disabled button + style panel
- `matchMedia` เป็น browser API ไม่ต้อง dependency, มี listener สำหรับ resize → smooth

### ทำไม avatar ใช้ `next/image` ไม่ใช้ plain `<img>`?
- `next/image` optimize + lazy + responsive + browser cache ให้ — เป็น default ของ project
- Supabase domain config อยู่แล้ว (จาก task performance) → ไม่ต้องเพิ่ม config
- spec อนุญาตทั้งคู่ เลือกอันที่ optimize กว่า

### ทำไมส่ง `avatarUrl` เป็น prop ไม่ใช้ context?
- Navbar มี profile query อยู่แล้ว → reuse state ตรงๆ ง่ายกว่าสร้าง context
- Desktop/Mobile nav เป็น direct children → prop drilling 1 ชั้น ไม่ซับซ้อนพอให้ context คุ้ม
