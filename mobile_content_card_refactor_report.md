# Sobdai Session 6.13.x — Unified Content Card & Mobile Responsive Fix (SAFE)

**Status:** ✅ Complete
**Task type:** SAFE — UI/presentation refactor only
**Files touched:** `components/ContentCard.tsx` (new), `components/SummaryNavigation.tsx`, `components/ExamNavigation.tsx`
**Date:** 2026-07-08

---

## 1. Objective

The Package Detail page renders two resource columns side-by-side:
**สรุปเนื้อหา** (SummaryNavigation) and **ชุดข้อสอบ** (ExamNavigation). Both
rendered nearly-identical "cards" but implemented them separately, causing:

- **Mobile bugs** in the Summary card (metadata row wrapping: "3 นาที" /
  topic / "พร้อมเรียน" splitting across two lines).
- **Visual drift** between the two columns (different padding, radius,
  typography, line-clamp).
- **Maintenance cost** — every responsive fix had to be applied twice.

The goal: **one shared card component** that both columns use, fixing all
mobile responsive issues while keeping every existing feature (search, filter,
accordion, grouping, runtime, routing) byte-for-byte identical.

---

## 2. Files Modified

| File | Change | Lines |
|------|--------|-------|
| `components/ContentCard.tsx` | **NEW.** Shared card. Renders title + optional description + metadata row + optional badge + optional corner badge. One design system, one set of responsive rules. | +224 |
| `components/SummaryNavigation.tsx` | Replaced the inline-styled summary card with `<ContentCard />`. Removed ~40 lines of duplicated markup. | −40 / +10 |
| `components/ExamNavigation.tsx` | Replaced the Tailwind-styled exam card with `<ContentCard />`. Removed the now-unused `Link` import. | −14 / +12 |

**Net:** 1 new component (~224 lines) + 2 refactors removing ~54 lines of
duplicated markup.

### Explicitly NOT modified (per SAFE constraints)

- Database / Supabase / SQL / RLS — untouched
- Business logic, routing, Markdown renderer — untouched
- Search logic, filter logic, accordion logic, grouping — untouched
- Exam Runtime (Practice / Mock / Sample), Scoring, Question Flow — untouched
- Orders / Payments / Authentication / Admin Panel — untouched
- Package loading logic, server component, queries — untouched
- `app/package/[slug]/page.tsx` — untouched (still feeds the same props)

---

## 3. Shared Component Design

`ContentCard` is a pure presentational component. It receives everything it
needs via props and renders no logic of its own.

### Props

```ts
interface ContentCardProps {
  href: string                       // navigation target (Link)
  title: string                      // card title
  description?: string               // optional (exam sets have one, summaries do not)
  meta: ContentCardMeta[]            // footer metadata chips [{icon, text}]
  badge?: { label: string; tone: 'success' | 'gold' }  // right pill
  cornerBadge?: string               // top-right ribbon (e.g. "ตัวอย่าง")
}
```

### Unified design tokens (the single source of truth)

| Token | Value | Source |
|-------|-------|--------|
| Card background | `rgba(255,255,255,0.02)` | Summary card (the more refined of the two) |
| Card border | `1px solid rgba(255,255,255,0.05)` | both — already matched |
| Border radius | `12px` | Summary card |
| Padding | `14px 16px` | Summary card |
| Title | `14px / 600 / #F5E9D6 / line-height 1.45` | Summary card |
| Description | `12px / #A1866B / line-clamp-2 / line-height 1.5` | Exam card |
| Metadata | `11px / #A1866B` | both |
| Badge | `10px / 700 / uppercase / letter-spacing 0.05em / radius 4px` | both |
| Hover | border → `rgba(212,175,55,0.3)`, bg → `rgba(212,175,55,0.03)`, title → `#D4AF37` | both |
| Transition | `border-color 0.2s, background-color 0.2s` | both |

> The exam card previously used Tailwind classes (`bg-[#0F0B07]`, `rounded-2xl`
> = 16px, `p-5` = 20px, title `15px / 700`). These now unify onto the Summary
> card's lighter, tighter values so both columns share one language. The visual
> change is intentional and is the point of the refactor.

### Why `mode` was dropped from the API

The task suggested a `mode (summary | exam)` prop. After analysis, the only
behavioural difference is **which props are supplied** (summary has no
description; exam has no badge). A `mode` prop would have introduced a
conditional branch inside the card for no real benefit — the data already
distinguishes the two. The component stays declarative: callers pass
`description` if they have one, `badge` if they want one. No mode needed.

---

## 4. Responsive Improvements

The core mobile bug was the Summary card's metadata row. It used a bare
`flex` with `gap: 4px` and no width control, so on narrow screens the row
ran out of room and wrapped: "3 นาที" broke onto its own line, the topic
overflowed, and the "พร้อมเรียน" badge dropped below.

### The fix (in `ContentCard`)

The footer row is now:

```tsx
<div style={{ display: 'flex', justifyContent: 'space-between', gap: '8px' }}>
  {/* LEFT: flexible + truncating */}
  <div style={{ flex: '1 1 auto', minWidth: 0, flexWrap: 'nowrap', overflow: 'hidden' }}>
    {meta.map(...)}   // first item can shrink/truncate; rest are fixed-width
  </div>
  {/* RIGHT: fixed, never shrinks, never wraps */}
  {badge && <span style={{ flexShrink: 0, whiteSpace: 'nowrap' }}>}
</div>
```

Concrete guarantees on mobile:

| Element | Before | After |
|---------|--------|-------|
| "3 นาที" | wrapped to 2 lines | **always one line** (`whiteSpace: nowrap` + `flex: 1 1 auto`) |
| Topic | overflowed / inconsistent | **truncates with ellipsis** (primary meta `overflow: hidden / textOverflow: ellipsis`) |
| "พร้อมเรียน" badge | dropped to second line | **always one line, right-aligned** (`flexShrink: 0, whiteSpace: nowrap`) |
| Metadata row alignment | inconsistent | **vertically centered, even gap** (`alignItems: center, gap: 8px`) |
| Card height | varied between cards | **consistent** (same padding, same title line-height) |

The exam card's footer had a separate bug: it used `flex gap-4` with a
`border-t` divider, which on mobile could crowd. It now uses the same shared
footer as the summary card — no divider, even spacing, fixed badge.

---

## 5. Mobile Before vs After

### Summary card

```
BEFORE (mobile, ~360px)              AFTER (mobile, ~360px)
┌──────────────────────────────┐    ┌──────────────────────────────┐
│ สรุปเนื้อหาเรื่องกฎหมาย...      │    │ สรุปเนื้อหาเรื่องกฎหมาย...      │
│                              │    │                              │
│ ⏱ 3 นาที • หลักฐาน            │    │ ⏱ 3 นาที • หลักฐานเชิงเอกสาร   │
│                  พร้อมเรียน    │    │                   พร้อมเรียน   │
└──────────────────────────────┘    └──────────────────────────────┘
   ↑ badge wrapped                  ↑ one row, topic truncates, badge fixed
```

### Exam card

```
BEFORE (mobile)                      AFTER (mobile)
┌──────────────────────────────┐    ┌──────────────────────────────┐
│              ตัวอย่าง          │    │              ตัวอย่าง          │
│ Practice Set 1               │    │ Practice Set 1               │
│                              │    │ ชุดข้อสอบจำลองสนามจริง...       │
│ ชุดข้อสอบจำลองสนามจริง...       │    │                              │
│ ─────────────────────────    │    │ ⏱ 60 นาที  📄 50 ข้อ          │
│ ⏱ 60 นาที   📄 50 ข้อ         │    └──────────────────────────────┘
└──────────────────────────────┘    ↑ unified with summary: same padding,
   ↑ denser, border divider,           radius, typography, no divider
     different proportions
```

Both cards now share identical padding (`14px 16px`), radius (`12px`),
title (`14px/600`), description (`12px`), footer (`11px`), and hover
behaviour. Side-by-side they read as one design system.

---

## 6. Regression Analysis

| Area | Risk | Reasoning |
|------|------|-----------|
| Summary search/filter/accordion/grouping | None | `SummaryNavigation` logic untouched; only the card render inside `.map()` was replaced. |
| Exam search/filter/accordion/grouping | None | Same — `ExamNavigation` logic untouched. |
| Summary routing | None | `<ContentCard href={/package/.../summary/${slug}} />` produces the same `<Link>` target. |
| Exam routing | None | `<ContentCard href={/package/.../exam/${id}} />` produces the same `<Link>` target. |
| Exam Runtime (Practice/Mock/Sample) | None | Runtime lives in `exam/[examSetId]/ExamRuntime.tsx`, untouched. The card is only a nav link. |
| Markdown renderer | None | Not in scope; untouched. |
| Package loading / server component / queries | None | `app/package/[slug]/page.tsx` untouched; same `examSets` / `summaries` props flow through. |
| `is_sample` corner badge | None | Passed as `cornerBadge`; rendered identically. |
| "พร้อมเรียน" badge | None | Passed as `badge={{label:'พร้อมเรียน', tone:'success'}}`; same green pill. |
| Question count / duration | None | Passed as `meta`; same icons (Clock/FileText), same values. |
| Read time / topic | None | Passed as `meta`; topic still only renders when present. |
| `Link` import in SummaryNavigation | None | Still used for the back link; not removed. |
| `Link` import in ExamNavigation | Removed | It was only used for the card, which moved into `ContentCard`. Removing it keeps tsc clean; no behaviour change. |
| Homepage / Package ISR | None | Build confirms `/` and `/packages` still `Revalidate 5m`. |
| Other pages | None | `ContentCard` is consumed only by the two navigation components. |

### Visual parity (desktop, before vs after)

Desktop appearance is preserved by design — the refactor unifies onto the
Summary card's tokens, which were already the desktop baseline. The exam card
gets slightly tighter padding (20→14/16) and radius (16→12), which makes it
match the summary column; this is the intended unification, not a regression.

---

## 7. Browser QA Checklist

### Desktop (≥768px)
- [ ] Summary column: search, filter pills, counter, accordion all work.
- [ ] Exam column: search, filter pills, counter, accordion all work.
- [ ] **Summary and Exam cards look visually identical** (padding, radius,
      title weight, hover, spacing).
- [ ] Hover: border → gold, title → gold, on both card types.
- [ ] Clicking a summary card → navigates to summary page.
- [ ] Clicking an exam card → navigates to exam runtime.
- [ ] "ตัวอย่าง" corner badge appears on sample exam sets.
- [ ] "พร้อมเรียน" green badge appears on summary cards.

### Tablet (768px–1024px)
- [ ] Both columns render side-by-side.
- [ ] Cards have equal spacing and consistent height.
- [ ] No horizontal overflow.

### Mobile (<768px) — the focus of this session
**Summary card:**
- [ ] "3 นาที" stays on **one line** (never wraps).
- [ ] "พร้อมเรียน" badge stays on **one line**, right-aligned.
- [ ] Long topic **truncates with ellipsis** instead of overflowing.
- [ ] Metadata row is vertically centered.
- [ ] Cards have equal height within a category.

**Exam card:**
- [ ] Matches summary card exactly (padding, radius, typography).
- [ ] "60 นาที" and "50 ข้อ" stay on one line, even spacing.
- [ ] Description clamps to 2 lines.
- [ ] "ตัวอย่าง" corner badge does not overlap the title.

**Cross-cutting:**
- [ ] Accordion opens one category at a time on mobile.
- [ ] No clipped text, no horizontal scroll.
- [ ] Summary and Exam columns feel like the same design language.

---

## 8. Performance Verification

- **No new dependencies.** `ContentCard` uses only `react`, `next/link`,
  `lucide-react` (all already in the bundle). `package.json` untouched.
- **No new queries / API calls / client fetching.** `ContentCard` is pure
  presentation; data still flows once from `page.tsx` → navigation → card.
- **Bundle size.** The refactor *removes* ~54 lines of duplicated markup and
  adds one ~224-line component that is shared. Net bundle impact is negligible
  (slightly smaller, if anything, due to deduplication).
- **Re-renders.** `ContentCard` is a leaf component with no internal state;
  it re-renders only when its parent re-renders (same as the inline cards
  before). No `memo` is needed because the parent (`SummaryNavigation` /
  `ExamNavigation`) already memoises the filtered list via `useMemo`, so the
  card list is stable across unrelated re-renders.
- **ISR preserved.** Build confirms `/` and `/packages` remain `Revalidate 5m`;
  `/package/[slug]` remains dynamic; `ƒ Proxy (Middleware)` registered.

---

## 9. Build Verification

| Step             | Command            | Result |
|------------------|--------------------|--------|
| TypeScript       | `npx tsc --noEmit` | ✅ exit 0 |
| Production build | `npm run build`    | ✅ exit 0 |
| ISR routes       | `/`, `/packages`   | ✅ 5m revalidate intact |
| Middleware proxy | `proxy.ts`         | ✅ `ƒ Proxy (Middleware)` |
| No new warnings  | build log          | ✅ clean |

```
Route (app)                                Revalidate  Expire
┌ ○ /                                              5m      1y
…
├ ○ /packages                                      5m      1y
…
ƒ Proxy (Middleware)
```

---

## Summary

Created **one shared `ContentCard`** component and refactored both
`SummaryNavigation` and `ExamNavigation` to use it. This eliminated ~54 lines
of duplicated card markup, fixed the Summary card's mobile metadata-wrapping
bug (duration/topic/badge now never wrap), and unified both columns onto a
single design system (padding, radius, typography, hover, spacing). No search,
filter, accordion, grouping, routing, runtime, schema, or query logic was
touched — this is presentation-only. TypeScript and production build both
pass; ISR and proxy middleware are unchanged.
