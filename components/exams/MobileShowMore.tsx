'use client'

import { useState } from 'react'

/**
 * MobileShowMore — progressive disclosure for dashboard grids (mobile only).
 *
 * Why this exists: the /exams dashboard stacks every section into one long
 * column on mobile. This wrapper caps how many items are visible on mobile and
 * offers a "ดูเพิ่มเติม ({n})" toggle to reveal the rest inline; on desktop it is
 * a complete no-op (every item renders, no toggle is shown).
 *
 * Contract:
 *   - 'use client' island. Uses ONLY local useState. No fetching, no auth, no
 *     business logic, no viewport/window JS.
 *   - Children are passed as pre-built, serializable React nodes from the owning
 *     server component (no render-function props cross the Server→Client border).
 *   - The toggle is rendered ONLY when there are hidden items on mobile.
 *
 * Layout safety (the important part): this component returns a fragment, so it
 * adds NO wrapper box of its own around the list. Each item is a direct child of
 * the parent grid/list in every state:
 *   - Preview items (first `mobileLimit`): rendered as-is, always visible.
 *   - Extra items: wrapped in a single <div> whose display is toggled:
 *       collapsed → `hidden` (mobile) / `md:contents` (desktop: box vanishes,
 *                   item becomes a direct grid child, layout identical to today)
 *       expanded  → `contents` (mobile + desktop: item is a direct grid child)
 *   Because `display:contents` contributes no box, the parent grid
 *   (repeat(auto-fill, minmax(300px,1fr))) lays out every card exactly as it
 *   does today — gaps, row heights, and `height:100%` cards are preserved.
 *   The toggle button spans the full grid width (gridColumn: 1 / -1) and is
 *   hidden on desktop (md:hidden).
 */
export default function MobileShowMore({
  /** Already-rendered item nodes (cards), in display order. */
  children,
  /** How many items to show on mobile before expanding. */
  mobileLimit,
  /** Collapsed toggle label. `{n}` = items beyond the preview; `{total}` = all items. */
  moreLabel = 'ดูเพิ่มเติม ({n})',
  /** Expanded toggle label. */
  lessLabel = 'แสดงน้อยลง',
}: {
  children: React.ReactNode[]
  mobileLimit: number
  moreLabel?: string
  lessLabel?: string
}) {
  const [expanded, setExpanded] = useState(false)

  const all = Array.isArray(children) ? children : []
  const total = all.length
  const limit = Math.max(0, mobileLimit)
  const hasExtra = total > limit
  const remaining = hasExtra ? total - limit : 0

  const preview = all.slice(0, limit)
  const extras = hasExtra ? all.slice(limit) : []

  // Nothing to disclose → render everything inline, no toggle.
  if (!hasExtra) {
    return <>{all}</>
  }

  return (
    <>
      {/* Preview items — always visible (direct children of the parent grid). */}
      {preview}

      {/* Extra items — each wrapped so its visibility can be toggled without
          disturbing the grid. `md:contents` makes the wrapper vanish on desktop
          so the card is a direct grid child there in both states. */}
      {extras.map((node, i) => (
        <div
          key={i}
          className={expanded ? 'contents md:contents' : 'hidden md:contents'}
        >
          {node}
        </div>
      ))}

      {/* Toggle — mobile only. Spans the full grid width; hidden on desktop. */}
      <div className="block md:hidden" style={{ gridColumn: '1 / -1' }}>
        <button
          type="button"
          aria-expanded={expanded}
          onClick={() => setExpanded((v) => !v)}
          className="btn-outline"
          style={{
            display: 'block',
            width: '100%',
            textAlign: 'center',
            textDecoration: 'none',
            padding: '10px 16px',
            fontSize: '14px',
          }}
        >
          {expanded
            ? lessLabel
            : moreLabel
                .replace('{n}', String(remaining))
                .replace('{total}', String(total))}
        </button>
      </div>
    </>
  )
}
