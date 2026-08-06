'use client'

/**
 * components/exams/PackageScopeSelector.tsx
 * ----------------------------------------------------------------------------
 * Phase 2A.1 — the compact package selector above "หัวข้อที่ควรทบทวน".
 *
 * A CONTROLLED presentational Client Component (native `<select>`) rendered
 * inside the Weak Topics client island. It scopes ONLY the Weak Topics section
 * to one owned package, or to "ภาพรวมทุกแพ็กเกจ". Learning Statistics is
 * unaffected (computed all-packages on the server, independently).
 *
 * Phase 2A.1 change: this component NO LONGER navigates. It used to call
 * `router.replace(...)` to change the `?package=` search param, which forced a
 * full `/exams` Server Component re-render on every selection. That was the
 * source of the 5–10s delay. Now the component is fully controlled: it reports
 * the chosen value via `onValueChange` and lets the parent (the client island)
 * load only the Weak Topics data and keep the URL in sync with
 * `history.replaceState(...)`. As a result:
 *   - changing the selector updates ONLY the Weak Topics section;
 *   - the rest of the dashboard never reloads;
 *   - the URL still reflects the chosen scope for shareability/refresh.
 *
 * Ownership: this component performs NO auth, NO ownership validation, and NO
 * data fetching. The option list (owned packages with display labels) and the
 * current value are passed in from the parent. The parent guarantees that a
 * package id in `options` is owned; the server action re-validates ownership on
 * every request anyway.
 */

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
   * The parent owns this value (the resolved scope), so the control reflects
   * the auto-default too, not just an explicit URL value.
   */
  value: string
  /**
   * Fired when the learner picks a new scope. The parent decides whether to
   * load data, cache-hit instantly, or restore on failure.
   */
  onValueChange: (value: string) => void
  /** Accessible label / visible caption for the control. */
  label?: string
  /** Whether a load is in flight for a NEW scope (dims + busy indicator). */
  busy?: boolean
  /** Disables interaction (e.g. while restoring after an error). */
  disabled?: boolean
}

/** The sentinel value representing the all-packages overview. */
export const ALL_PACKAGES_VALUE = 'all'

export default function PackageScopeSelector({
  options,
  value,
  onValueChange,
  label = 'เลือกแพ็กเกจ',
  busy = false,
  disabled = false,
}: PackageScopeSelectorProps) {
  function handleChange(e: React.ChangeEvent<HTMLSelectElement>) {
    onValueChange(e.target.value)
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
        aria-busy={busy || undefined}
        // Phase 2A.1 fix: the selector stays ENABLED while `busy` so the learner
        // can change scope again while an uncached request is pending. `busy` is
        // still used for aria-busy + the pending visual treatment (opacity) and
        // a progress cursor only when explicitly disabled. The parent's
        // monotonic request-id guards against stale responses.
        disabled={disabled}
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
          cursor: disabled ? 'not-allowed' : 'pointer',
          opacity: busy ? 0.7 : 1,
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
