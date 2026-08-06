'use server'

/**
 * app/exams/weak-topics-actions.ts
 * ----------------------------------------------------------------------------
 * Phase 2A.1 — Instant Package Switching for "หัวข้อที่ควรทบทวน".
 *
 * A single narrow, authenticated, READ-ONLY Server Action that the Weak Topics
 * client island calls when the learner changes the package selector. It returns
 * ONLY the scoped weak-topic data needed to update that one section — so a
 * selector change no longer triggers a full `/exams` Server Component
 * navigation and the rest of the dashboard never reloads.
 *
 * Boundary discipline (mirrors app/assessment/bookmark-actions.ts):
 *   - 'use server' file — every export is a server function.
 *   - The authenticated user is resolved from the session cookie; user_id is
 *     NEVER taken from the payload. RLS re-enforces this at the row level.
 *   - Owned package ids are RE-DERIVED from completed orders on the server —
 *     never trusted from the client. The client sends only the requested scope
 *     (`packageId: null` for all-packages, or one package id).
 *   - No service-role client. No writes. No analytics beyond weak-topic
 *     derivation (which lives in the reused, pure lib layer).
 *   - Non-throwing: returns { success, data?, error? } so the client can
 *     restore its previous selection on failure without crashing.
 *
 * Why getWeakTopics() (and not getLearnerAnalytics()) for BOTH scopes:
 *   getWeakTopics() already supports the all-packages scope (omit packageId →
 *   filters `.in('package_id', ownedPackageIds)`) and returns the scope's
 *   newest completed attempt id (scopedLatestAttemptId) — which for the all
 *   scope IS the global latest attempt, exactly matching what the SSR page
 *   uses for the all-packages review CTA (latestResult.attemptId). Using one
 *   bounded query avoids recomputing the (unused) learning statistics and
 *   keeps the action's result consistent with the page's initial render.
 */

import { createClient } from '@/lib/supabase/server'
import { ORDER_COMPLETED_STATUSES } from '@/lib/orderUtils'
import {
  getWeakTopics,
  type WeakTopicGroup,
} from '@/lib/assessment/learner-analytics'

// ─── Public types (serializable — returned to the client) ───────────────────

/**
 * The scope whose weak topics were loaded. Mirrors the page's three-valued
 * WeakTopicsScope but as a serializable result: `all` or one owned package id.
 */
export interface ScopedWeakTopicsData {
  /** 'all' for the all-packages overview, otherwise the owned package id. */
  scope: 'all' | string
  /** Derived weak topics for the scope (≤ WEAK_TOPIC_MAX_RESULTS). */
  weakTopics: WeakTopicGroup[]
  /**
   * The newest completed attempt id within the scope (the CTA target), or null
   * when the scope has no completed attempts. Server-derived; never trusted
   * from the client. For the all scope this is the global latest attempt id.
   */
  reviewAttemptId: string | null
}

export interface FetchScopedWeakTopicsResult {
  success: boolean
  data?: ScopedWeakTopicsData
  /** Thai, non-blocking message shown to the learner on failure. */
  error?: string
}

// ─── Server-only ownership resolution ───────────────────────────────────────

/**
 * Re-derive the caller's owned package ids from completed (paid|free) orders,
 * de-duplicated and with unpublished packages dropped — the SAME ownership
 * definition the `/exams` page uses to build the package grid + selector
 * options. Centralized here so the action never trusts client-supplied ids.
 *
 * Returns [] on any failure (the caller then refuses any package scope).
 * Never throws.
 */
async function resolveOwnedPackageIds(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
): Promise<string[]> {
  try {
    const { data: orders } = await supabase
      .from('orders')
      .select('package_id, packages ( is_published )')
      .eq('user_id', userId)
      .in('status', ORDER_COMPLETED_STATUSES)

    const owned = new Set<string>()
    for (const o of orders ?? []) {
      // Nested relation is inferred as an array by supabase-js but is singular
      // here; cast through unknown like the dashboard page does.
      const pkg = (o as { packages?: unknown }).packages as
        | { is_published?: boolean }
        | { is_published?: boolean }[]
        | null
      // Normalize the singular/object shape; drop unpublished packages to match
      // the page (e.g. retired after purchase).
      const isPublished = Array.isArray(pkg)
        ? pkg[0]?.is_published !== false
        : pkg?.is_published !== false
      if (!isPublished) continue
      const pid = (o as { package_id?: string }).package_id
      if (pid) owned.add(pid)
    }
    return Array.from(owned)
  } catch (err: any) {
    console.error('resolveOwnedPackageIds: unexpected error:', err?.message ?? err)
    return []
  }
}

// ─── Action ─────────────────────────────────────────────────────────────────

/**
 * Load scoped Weak Topics for the calling user.
 *
 * @param input.packageId  `null` → all-packages overview; a string → scope to
 *   that one package. The package id MUST be owned by the caller (re-validated
 *   server-side); an unowned/invalid id yields `{ success: false }` so the
 *   client restores its previous selection rather than silently showing
 *   mismatched data.
 *
 * Reuses getWeakTopics() (the same bounded, index-served ≤20-row query the SSR
 * page uses) — no aggregation or ownership logic is duplicated. Non-throwing.
 */
export async function fetchScopedWeakTopics(input: {
  packageId: string | null
}): Promise<FetchScopedWeakTopicsResult> {
  try {
    const supabase = await createClient()

    // ── 1. Authenticate. user_id comes from the session, never the payload. ──
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) {
      return { success: false, error: 'Unauthorized' }
    }

    // ── 2. Re-derive owned packages from completed orders (server-authority). ──
    const ownedPackageIds = await resolveOwnedPackageIds(supabase, user.id)
    if (ownedPackageIds.length === 0) {
      // The island is not mounted when the learner owns nothing, but defend in
      // depth: degrade to an empty all-packages result rather than erroring.
      return {
        success: true,
        data: { scope: 'all', weakTopics: [], reviewAttemptId: null },
      }
    }

    // ── 3. Validate the requested package scope against ownership. ──────────
    const requestedPackageId = input?.packageId ?? null
    if (
      requestedPackageId !== null &&
      !ownedPackageIds.includes(requestedPackageId)
    ) {
      // Unowned/invalid/tampered id. Refuse rather than fall back, so the
      // client restores the prior selection and surfaces a non-blocking error.
      return {
        success: false,
        error: 'ไม่พบแพ็กเกจที่เลือก กรุณาลองใหม่อีกครั้ง',
      }
    }

    // ── 4. Load via the shared bounded query (RLS applies via the cookie client). ──
    const result = await getWeakTopics({
      userId: user.id,
      ownedPackageIds,
      packageId: requestedPackageId, // null → all-owned-packages scope
    })

    return {
      success: true,
      data: {
        scope: requestedPackageId ?? 'all',
        weakTopics: result.weakTopics,
        reviewAttemptId: result.scopedLatestAttemptId,
      },
    }
  } catch (err: any) {
    console.error('fetchScopedWeakTopics: unexpected error:', err?.message ?? err)
    return {
      success: false,
      error: 'โหลดหัวข้อที่ควรทบทวนไม่สำเร็จ กรุณาลองใหม่อีกครั้ง',
    }
  }
}
