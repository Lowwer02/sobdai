'use client'

/**
 * components/exams/WeakTopicsClientSection.tsx
 * ----------------------------------------------------------------------------
 * Phase 2A.1 — the Client Island that owns live package switching for the
 * "หัวข้อที่ควรทบทวน" section.
 *
 * Why this exists (the problem it fixes):
 *   Phase 2A scoped Weak Topics by a `?package=` URL param and updated it with
 *   `router.replace(...)`. That change of search param triggered a full `/exams`
 *   Server Component re-render, re-running every dashboard loader (orders,
 *   counts RPC, dashboard data, learning statistics, timeline, saved questions)
 *   on every selector change — the 5–10s delay. This island removes that cost:
 *   a selector change calls ONLY the Weak Topics Server Action and updates ONLY
 *   this section. The rest of the dashboard never reloads.
 *
 * Responsibilities:
 *   - Owns the currently-selected scope (React state) after hydration.
 *   - Owns the displayed Weak Topics data (topics + review attempt id + the
 *     scope-specific caption / CTA label / scoped-empty flags).
 *   - Owns a COMPONENT-LOCAL per-scope cache (`useRef<Map>`) so switching back
 *     to a previously-viewed scope is instant. No module-level/global cache.
 *   - Owns the pending state + a compact loading label (no full-page loading).
 *   - Protects against stale responses with a monotonic request id.
 *   - Syncs the URL with `window.history.replaceState(...)` ONLY after a
 *     successful load (never for a failed scope), preserving unrelated params.
 *
 * Explicit non-responsibilities:
 *   - No Supabase calls. No auth, ownership, or authorization logic — all of
 *     that lives in the Server Action (re-derived server-side on each call).
 *   - No mutation. Read-only consumption of the action's result.
 *
 * Boundary contract with the server page:
 *   - Initial render is SERVER-RENDERED: the page passes the already-resolved
 *     initial scope + its weak topics + the all-packages data (when already
 *     available) so the cache starts warm and `all` needs no request.
 *   - The page passes the owned-package options (with display labels) — the
 *     same options the SSR selector used.
 *
 * Stale-response / race protection:
 *   Server Actions cannot be aborted by the client, so on rapid switches we let
 *   the earlier request finish but IGNORE its result unless its request id is
 *   still the latest. The selector stays enabled during a pending load (the
 *   learner can change their mind), but a stale result can never overwrite the
 *   newest selection.
 */

import { useCallback, useRef, useState } from 'react'
import WeakTopics, {
  WeakTopicsEmpty,
} from '@/components/exams/WeakTopics'
import PackageScopeSelector from '@/components/exams/PackageScopeSelector'
import { fetchScopedWeakTopics } from '@/app/exams/weak-topics-actions'
import type { ScopedWeakTopicsData } from '@/app/exams/weak-topics-actions'
import type { WeakTopicGroup } from '@/lib/assessment/learner-analytics'

// ─── Types ──────────────────────────────────────────────────────────────────

/** One owned-package option (id + display label) for the selector. */
interface SelectorOption {
  id: string
  label: string
}

/** The per-scope cached payload — the serializable action result minus `scope`. */
interface CachedScope {
  weakTopics: WeakTopicGroup[]
  reviewAttemptId: string | null
}

export interface WeakTopicsClientSectionProps {
  /** Owned-package options with display labels (built server-side by the page). */
  options: SelectorOption[]
  /**
   * The server-resolved initial scope value: 'all' or an owned package id.
   * This is the value the SSR `<select>` shows and the scope the initial
   * `initialTopics`/`initialReviewAttemptId` describe.
   */
  initialScope: string
  /** SSR-rendered weak topics for `initialScope`. */
  initialTopics: WeakTopicGroup[]
  /** SSR-rendered review attempt id for `initialScope` (null → no CTA). */
  initialReviewAttemptId: string | null
  /**
   * SSR-rendered all-packages weak topics, when the page already computed them
   * (it always does, for Learning Statistics). Lets `all` be an instant cache
   * hit with zero requests. null/undefined when unavailable.
   */
  allPackagesTopics?: WeakTopicGroup[] | null
  /**
   * SSR-rendered global latest attempt id (the all-packages review CTA target).
   * Paired with `allPackagesTopics`. null/undefined when unavailable.
   */
  allPackagesReviewAttemptId?: string | null
  /**
   * Whether the learner has any completed attempts anywhere. When false, the
   * page renders <WeakTopicsEmpty/> instead of this island (nothing to scope).
   * Kept as a prop for a defensive early return.
   */
  hasCompletedAttempts: boolean
}

// ─── Helpers ────────────────────────────────────────────────────────────────

/**
 * Build the URL for a chosen scope value, preserving unrelated search params.
 * Pure; reads the CURRENT location at call time. Used only for replaceState.
 *
 * NOTE: we deliberately read `window.location.search` fresh (not Next's cached
 * useSearchParams) so the URL we write is always consistent with the real
 * address bar, and we never depend on a Server Component re-render to update
 * client state.
 */
function buildScopeHref(scopeValue: string): string {
  const params = new URLSearchParams(window.location.search)
  // Always set explicitly — including 'all' — so the choice is sticky and is
  // never re-interpreted as "absent → auto-default" by the server on refresh.
  params.set('package', scopeValue)
  const qs = params.toString()
  return qs ? `${window.location.pathname}?${qs}` : window.location.pathname
}

/** Caption under the title, differing by scope (matches the SSR copy). */
function captionFor(scope: string): string {
  return scope === 'all'
    ? 'คำนวณจากผลสอบล่าสุดสูงสุด 20 ครั้ง'
    : 'คำนวณจากผลสอบล่าสุดสูงสุด 20 ครั้งในแพ็กเกจนี้'
}

/** Review CTA label, differing by scope (matches the SSR copy). */
function reviewCtaLabelFor(scope: string): string {
  return scope === 'all' ? 'ทบทวนข้อผิด' : 'ทบทวนข้อผิดในแพ็กเกจนี้'
}

// ─── Component ──────────────────────────────────────────────────────────────

export default function WeakTopicsClientSection({
  options,
  initialScope,
  initialTopics,
  initialReviewAttemptId,
  allPackagesTopics,
  allPackagesReviewAttemptId,
  hasCompletedAttempts,
}: WeakTopicsClientSectionProps) {
  // Defensive: the page only mounts this island when there are completed
  // attempts. Guard anyway so a misuse degrades to the empty state.
  if (!hasCompletedAttempts) {
    return <WeakTopicsEmpty />
  }

  // ── Component-local per-scope cache (never global) ──────────────────────
  // Seeded with the SSR initial scope, plus the all-packages scope when the
  // page already supplied it (so switching to `all` never fires a request).
  const cacheRef = useRef<Map<string, CachedScope>>(new Map())
  if (cacheRef.current.size === 0) {
    cacheRef.current.set(initialScope, {
      weakTopics: initialTopics,
      reviewAttemptId: initialReviewAttemptId,
    })
    if (
      initialScope !== 'all' &&
      allPackagesTopics &&
      allPackagesTopics !== null
    ) {
      cacheRef.current.set('all', {
        weakTopics: allPackagesTopics,
        reviewAttemptId: allPackagesReviewAttemptId ?? null,
      })
    }
  }

  // ── React state (source of truth after hydration) ──────────────────────
  const [scope, setScope] = useState<string>(initialScope)
  const [topics, setTopics] = useState<WeakTopicGroup[]>(initialTopics)
  const [reviewAttemptId, setReviewAttemptId] = useState<string | null>(
    initialReviewAttemptId,
  )
  const [busy, setBusy] = useState<boolean>(false)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)

  // Monotonic request id for stale-response protection. Bumped before each
  // async load; a response whose id no longer matches is ignored.
  const requestIdRef = useRef<number>(0)

  /**
   * Load a scope: cache-hit → instant; cache-miss → call the action.
   * On failure, restore the previous selection + surface a non-blocking error.
   * Stale responses are ignored via the request id.
   */
  const loadScope = useCallback(
    (nextScope: string) => {
      // Cache hit: update synchronously, no request, no pending UI.
      const cached = cacheRef.current.get(nextScope)
      if (cached) {
        // Bump the id so any in-flight request for a DIFFERENT scope is ignored.
        requestIdRef.current += 1
        setScope(nextScope)
        setTopics(cached.weakTopics)
        setReviewAttemptId(cached.reviewAttemptId)
        setBusy(false)
        setErrorMsg(null)

        // Phase 2A.1 fix: sync the URL on cache hits too (previously the cache
        // branch returned before replaceState). The URL must reflect the active
        // scope even when no request ran. Uses the SAME helper as the network
        // path, preserving unrelated params. Only after the cached data has been
        // accepted as the active scope. Zero Server Action calls.
        try {
          window.history.replaceState(null, '', buildScopeHref(nextScope))
        } catch {
          // Non-critical: if replaceState fails, in-memory state stays correct.
        }
        return
      }

      // Cache miss: fire a server action with pending UI.
      const myRequestId = requestIdRef.current + 1
      requestIdRef.current = myRequestId
      const prevScope = scope
      const prevTopics = topics
      const prevReviewAttemptId = reviewAttemptId

      // Optimistically reflect the new selection immediately (the <select>
      // already moved; keep state in sync) and show pending UI.
      setScope(nextScope)
      setBusy(true)
      setErrorMsg(null)

      void (async () => {
        const res = await fetchScopedWeakTopics({
          packageId: nextScope === 'all' ? null : nextScope,
        })

        // Stale-response guard: ignore unless this is still the latest request.
        if (requestIdRef.current !== myRequestId) return

        if (!res.success || !res.data) {
          // Failure: restore the previous selection + show a non-blocking note.
          // Do NOT update the URL to a scope whose data failed to load.
          setScope(prevScope)
          setTopics(prevTopics)
          setReviewAttemptId(prevReviewAttemptId)
          setBusy(false)
          setErrorMsg(res.error ?? 'โหลดหัวข้อที่ควรทบทวนไม่สำเร็จ กรุณาลองใหม่อีกครั้ง')
          return
        }

        // Success: apply, cache, clear pending + error, then sync the URL.
        const data = res.data as ScopedWeakTopicsData
        const payload: CachedScope = {
          weakTopics: data.weakTopics,
          reviewAttemptId: data.reviewAttemptId,
        }
        cacheRef.current.set(nextScope, payload)
        setTopics(payload.weakTopics)
        setReviewAttemptId(payload.reviewAttemptId)
        setBusy(false)
        setErrorMsg(null)

        // URL sync (replaceState, not navigation) — only after a successful
        // load. Preserves unrelated params.
        try {
          window.history.replaceState(null, '', buildScopeHref(nextScope))
        } catch {
          // Non-critical: if replaceState fails (e.g. security error), the
          // in-memory state remains the source of truth.
        }
      })()
    },
    [scope, topics, reviewAttemptId],
  )

  // ── Selector change handler ────────────────────────────────────────────
  const handleValueChange = useCallback(
    (value: string) => {
      // Ignore no-op re-selections.
      if (value === scope) return
      loadScope(value)
    },
    [scope, loadScope],
  )

  // ── Derived display values for the current scope ───────────────────────
  const isAll = scope === 'all'
  // A package scope with no completed attempts → scoped empty state.
  const scopedPackageIsEmpty =
    !isAll && topics.length === 0 && reviewAttemptId === null
  // A package scope with attempts but no surfaced weak topics → all-good state.
  const scopedPackageAllGood =
    !isAll && !scopedPackageIsEmpty && topics.length === 0

  return (
    <WeakTopics
      topics={topics}
      reviewAttemptId={reviewAttemptId}
      caption={captionFor(scope)}
      reviewCtaLabel={reviewCtaLabelFor(scope)}
      busy={busy}
      selector={
        <PackageScopeSelector
          options={options}
          value={scope}
          onValueChange={handleValueChange}
          busy={busy}
        />
      }
      scopedEmpty={
        scopedPackageIsEmpty ? (
          <p
            style={{
              fontSize: '13px',
              color: 'var(--text-muted)',
              lineHeight: 1.6,
              margin: 0,
              textAlign: 'center',
              padding: '8px 0',
            }}
          >
            ยังไม่มีผลสอบในแพ็กเกจนี้ เริ่มทำข้อสอบเพื่อให้ระบบวิเคราะห์หัวข้อที่ควรทบทวน
          </p>
        ) : scopedPackageAllGood ? (
          <p
            style={{
              fontSize: '13px',
              color: 'var(--text-muted)',
              lineHeight: 1.6,
              margin: 0,
              textAlign: 'center',
              padding: '8px 0',
            }}
          >
            ยังไม่พบหัวข้อที่ควรทบทวนเป็นพิเศษในแพ็กเกจนี้
          </p>
        ) : null
      }
    />
  )
}
