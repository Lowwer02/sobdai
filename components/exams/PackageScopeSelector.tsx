'use client'

/**
 * components/exams/PackageScopeSelector.tsx
 * ----------------------------------------------------------------------------
 * Phase 2A — the compact package selector above "หัวข้อที่ควรทบทวน".
 *
 * A small Client Component (native `<select>`) that scopes ONLY the Weak Topics
 * section to one owned package, or to "ภาพรวมทุกแพ็กเกจ". Learning Statistics
 * is unaffected (it is computed all-packages on the server, independently).
 *
 * URL contract (three-valued, mirrors lib/assessment/learner-analytics.ts
 * `resolveWeakTopicsScope`):
 *   - ?package=all               → explicit all-packages overview (sticky)
 *   - ?package={ownedPackageId}  → scope Weak Topics to that package
 *   - (param removed)            → server re-runs the automatic default
 *
 * Stickiness: selecting "ภาพรวมทุกแพ็กเกจ" writes `?package=all` (it NEVER
 * strips the param), so the explicit all-packages choice is preserved and is
 * not re-interpreted as "no choice → auto-default".
 *
 * Mechanics (mirrors components/news/NewsListControls.tsx):
 *   - useSearchParams() to read the current `package` value → requires the
 *     caller to wrap this component in <Suspense> (Next.js App Router rule for
 *     any subtree using useSearchParams).
 *   - router.replace(href, { scroll: false }) on change → server re-render with
 *     the new scope, no scroll-to-top, no layout shift.
 *   - Other search params are preserved (only `package` is rewritten).
 *
 * No data fetching, no auth, no viewport detection. The options list (owned
 * packages with names + ids) is passed in from the server page as serializable
 * props.
 */

import { useRouter, useSearchParams } from 'next/navigation'

/** One selectable package. */
export interface PackageScopeOption {
  id: string
  /** Display name (package name; may include year/org as the page decides). */
  label: string
}

export interface PackageScopeSelectorProps {
  /** Owned packages the learner can scope to. */
  options: PackageScopeOption[]
  /**
   * The currently-selected value for the `<select>`:
   *   - 'all'                      → "ภาพรวมทุกแพ็กเกจ"
   *   - an owned package id        → that package
   * This is the RESOLVED scope from the server (so the control reflects the
   * auto-default too, not just an explicit URL value).
   */
  value: string
  /** Accessible label / visible caption for the control. */
  label?: string
}

/** The sentinel value representing the all-packages overview. */
export const ALL_PACKAGES_VALUE = 'all'

export default function PackageScopeSelector({
  options,
  value,
  label = 'เลือกแพ็กเกจ',
}: PackageScopeSelectorProps) {
  const router = useRouter()
  const searchParams = useSearchParams()

  /** Build the href for a chosen scope value, preserving unrelated params. */
  function buildHref(scopeValue: string): string {
    const params = new URLSearchParams(searchParams?.toString() ?? '')
    // Always set explicitly — including 'all' — so the choice is sticky and is
    // never re-interpreted as "absent → auto-default" by the server.
    params.set('package', scopeValue)
    const qs = params.toString()
    return qs ? `/exams?${qs}` : '/exams'
  }

  function handleChange(e: React.ChangeEvent<HTMLSelectElement>) {
    router.replace(buildHref(e.target.value), { scroll: false })
  }

  return (
    <label
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: '6px',
        minWidth: 0,
        flex: '1 1 220px',
      }}
    >
      <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>{label}</span>
      <select
        value={value}
        onChange={handleChange}
        aria-label={label}
        style={{
          backgroundColor: 'var(--bg-input, rgba(255,255,255,0.03))',
          border: '1px solid var(--border, rgba(255,255,255,0.08))',
          color: 'var(--text-primary)',
          borderRadius: '12px',
          paddingTop: 10,
          paddingBottom: 10,
          paddingLeft: 14,
          paddingRight: 36, // room for the chevron
          fontSize: 14,
          outline: 'none',
          cursor: 'pointer',
          appearance: 'none',
          WebkitAppearance: 'none',
          MozAppearance: 'none',
          width: '100%',
          backgroundImage:
            "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='20' height='20' viewBox='0 0 24 24' fill='none' stroke='%23D4AF37' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpolyline points='6 9 12 15 18 9'/%3E%3C/svg%3E\")",
          backgroundRepeat: 'no-repeat',
          backgroundPosition: 'right 12px center',
        }}
      >
        <option value={ALL_PACKAGES_VALUE}>ภาพรวมทุกแพ็กเกจ</option>
        {options.map((opt) => (
          <option key={opt.id} value={opt.id}>
            {opt.label}
          </option>
        ))}
      </select>
    </label>
  )
}
