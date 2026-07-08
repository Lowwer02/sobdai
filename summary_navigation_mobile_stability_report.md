# Sobdai Session 6.13.x — Summary Navigation Mobile Stability & Progressive Loading (SAFE)

**Status:** ✅ Complete
**Task type:** SAFE — mobile-only Summary Navigation fixes
**Date:** 2026-07-08

---

## Files Modified

| File | Change |
|------|--------|
| `components/SummaryNavigation.tsx` | (1) Replaced fixed `maxHeight` accordion heuristic with CSS grid `0fr→1fr` transition (fixes clipping). (2) Added progressive loading state + "ดูเพิ่มอีก 8 รายการ" button (mobile only). |
| `components/ContentCard.tsx` | Reversed meta truncation: leading items (time/count) are now fixed-width and never truncate; only the trailing item (topic) ellipsifies. |

**Not touched:** Exam Navigation, Desktop UX, Database, Subject Foundation, Search/Filters, Accordion behavior, Routing, Admin, schema.

---

## Root Cause

Three distinct root causes, all identified against the iPhone screenshots:

### 1. Card clipping (the visible "last card cut off" bug)
`SummaryNavigation` animated the mobile accordion with:
```js
maxHeight: isExpanded ? `${items.length * 100 + 20}px` : '0'
```
This hard-codes **100px per card**. Real cards are taller than 100px when a title wraps to 2 lines (title + metadata + padding ≈ 110–130px). The estimate therefore under-sized the container, and `overflow: hidden` clipped the bottom card(s). Not a CSS hack to patch — the entire height heuristic was wrong.

**Fix:** switched to a CSS grid `0fr → 1fr` transition. `1fr` is content-driven — it always fits whatever the cards actually are, regardless of title length or count. No magic number.

### 2. Time truncation (`🕒 4...` instead of `🕒 4 นาที`)
In `ContentCard`, the **first** meta item (the time) was marked `primary` → `flex: 1 1 auto` + `textOverflow: ellipsis`. So when the row was tight, the time itself got ellipsified. But the spec is explicit: **time must never truncate; only the topic may**.

The meta array is `[time, topic]` — the time is first, the topic is last. The truncation was assigned to the wrong end.

**Fix:** made truncation a property of the **last** meta item, not the first. Time/count are now `flex: 0 0 auto` (fixed, fully visible); only the trailing topic is `flex: 1 1 auto` + ellipsis.

### 3. No progressive loading (new requirement)
All summaries in a category rendered at once. On mobile, with 20+ summaries in "กฎหมาย", this is a long scroll and amplifies the clipping bug.

**Fix:** client-side slicing — initial 8, +8 per click, button hidden when all visible. No API calls.

---

## Result

| Issue | Before | After |
|-------|--------|-------|
| Card clipping | last card(s) cut off | **all cards fully visible** (content-driven grid height) |
| Time display | `🕒 4...` | **`🕒 4 นาที`** (never truncates) |
| Topic | overflowed / wrapped | **truncates with ellipsis** (trailing meta) |
| Long category | one long scroll | **8 initial + "ดูเพิ่มอีก 8 รายการ"** per click (mobile only) |
| Desktop | good | **unchanged** (all items, all categories expanded) |

### Progressive loading behavior
- Mobile only (`!isDesktop`).
- Each category starts at 8 items.
- Button "ดูเพิ่มอีก 8 รายการ" appends 8 more per click.
- Button auto-hides when `items.length <= limit`.
- Resets to 8 on any search/filter change (so a new query starts fresh).
- Desktop ignores the limit entirely (`limit = items.length`).

---

## Build Status

| Step | Command | Result |
|------|---------|--------|
| TypeScript | `npx tsc --noEmit` | ✅ exit 0 |
| Production build | `npm run build` | ✅ exit 0 |
| ISR `/`, `/packages` | 5m revalidate | ✅ intact |
| Proxy middleware | `ƒ Proxy (Middleware)` | ✅ registered |

```
Route (app)                                Revalidate  Expire
┌ ○ /                                              5m      1y
├ ○ /packages                                      5m      1y
ƒ Proxy (Middleware)
```

---

## Browser QA (to run)

- **iPhone Safari / Android Chrome:** no clipped cards; time shows full "X นาที"; topic ellipsifies; "ดูเพิ่มอีก 8 รายการ" appears then hides when done.
- **Tablet (≥768px):** all categories expanded, all items visible, no load-more button.
- **Desktop:** identical to before — no behavior change.
