import Link from 'next/link'

/**
 * Contextual internal entity-discovery links (Entity Discovery V1).
 *
 * A deliberately small server-rendered pill row for canonical Agency /
 * Position links on detail surfaces. Not a generic content framework:
 * callers pass already-resolved canonical links; this component only renders
 * them deterministically — flex-wrap (no horizontal scroll), a hard cap of
 * MAX items, accessible focus, and long Thai names that wrap instead of
 * truncating mid-word.
 */
export const MAX_DISCOVERY_ENTITY_LINKS = 3

export interface EntityChipItem {
  /** Canonical entity id — used as the React key, never rendered. */
  id: string
  href: string
  label: string
}

interface EntityChipRowProps {
  /** Optional visible group label, e.g. "หน่วยงานที่เกี่ยวข้อง:". */
  label?: string
  items: readonly EntityChipItem[]
}

function Chip({ item }: { item: EntityChipItem }) {
  return (
    <Link
      href={item.href}
      className="inline-flex min-w-0 max-w-full items-center rounded-full border border-brand/30 bg-brand-solid/5 px-3 py-1.5 text-xs text-brand transition-colors hover:bg-wash focus:outline-none focus:ring-2 focus:ring-brand"
    >
      {/* break-words + overflow-wrap:anywhere: Thai long names wrap instead
          of overflowing or truncating mid-word on narrow viewports. */}
      <span className="min-w-0 break-words [overflow-wrap:anywhere]">{item.label}</span>
    </Link>
  )
}

export default function EntityChipRow({ label, items }: EntityChipRowProps) {
  const visible = items.slice(0, MAX_DISCOVERY_ENTITY_LINKS)
  if (visible.length === 0) return null

  return (
    <div className="flex max-w-full flex-wrap items-center gap-2">
      {label && <span className="text-xs font-semibold text-muted-foreground">{label}</span>}
      {visible.map((item) => (
        <Chip key={item.id} item={item} />
      ))}
    </div>
  )
}
