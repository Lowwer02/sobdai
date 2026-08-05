/**
 * components/exams/RecommendedActions.tsx
 * ----------------------------------------------------------------------------
 * Phase 1G — Personal Adaptive Study Recommendations (dashboard section).
 *
 * A compact, async Server Component that surfaces at most two explainable
 * "what to do next" recommendations on the /exams dashboard. It reuses the
 * EXISTING recommendation pipeline end-to-end and adds NO new data loader:
 *
 *   fetchMyRecommendations()  (app/assessment/actions.ts)
 *     → fetchMyAttemptHistory({limit:200}) → computePersonalAnalytics
 *     → recommend(analytics)                (pure engine, lib/assessment/recommendation.ts)
 *     → enrichWithTargets(...)              (attach Summary links)
 *
 * Why this is an async component (not a page-level fetch): the recommendation
 * pipeline is heavier than the dashboard's bounded loaders (≤200 attempts +
 * summary lookups). Calling it here and wrapping the component in a React
 * <Suspense> boundary lets the rest of /exams render immediately while
 * recommendations resolve/stream in — the dashboard never waits on them.
 *
 * Failure contract: any error (auth, DB, parse) is swallowed → returns null.
 * The /exams page MUST still render fully. Never throws.
 *
 * Rendering contract (mirrors /assessment/analytics for consistency):
 *   - target.kind === 'summary' with slug + packageSlug → links to
 *     /package/{packageSlug}/summary/{slug}
 *   - any other / null target → a non-link guidance card
 *   - empty set → null (no empty-state card; the section simply disappears)
 */

import { Suspense } from 'react'
import Link from 'next/link'
import { Sparkles } from 'lucide-react'
import { fetchMyRecommendations } from '@/app/assessment/actions'
import type { Recommendation } from '@/lib/assessment/recommendation'

/** Maximum recommendations surfaced on the dashboard (mobile-compact). */
const MAX_DASHBOARD_RECS = 2

/**
 * Async inner component. Calls the recommendation pipeline and renders the
 * section, or returns null when there is nothing to show or on failure.
 *
 * Designed to be awaited inside <Suspense> via {@link RecommendedActions}.
 */
async function RecommendedActionsAsync() {
  let recs: Recommendation[] = []
  try {
    const { data, error } = await fetchMyRecommendations()
    // Any failure (incl. auth/DB) → degrade to "nothing to show". Never throw.
    if (error || !data || data.isEmpty) return null
    recs = data.recommendations ?? []
  } catch {
    return null
  }

  // Priority order is already enforced by the engine; take the top N.
  const top = recs.slice(0, MAX_DASHBOARD_RECS)
  if (top.length === 0) return null

  return (
    <section style={{ marginBottom: '48px' }}>
      <h2
        className="font-display"
        style={{
          fontSize: '20px',
          color: 'var(--text-primary)',
          marginBottom: '16px',
          fontWeight: 700,
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
        }}
      >
        <Sparkles size={16} className="text-[#D4AF37]" style={{ flexShrink: 0 }} />
        ขั้นตอนถัดไปแนะนำ
      </h2>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
        {top.map((r) => {
          // Only a fully-resolved Summary target becomes a link.
          const href =
            r.target?.kind === 'summary' && r.target.slug && r.target.packageSlug
              ? `/package/${r.target.packageSlug}/summary/${r.target.slug}`
              : null

          // Card body — reused by both the link and non-link variants.
          const body = (
            <div style={{ minWidth: 0 }}>
              <div
                style={{
                  fontSize: '14px',
                  fontWeight: 600,
                  color: 'var(--text-primary)',
                  lineHeight: 1.4,
                }}
              >
                {r.title}
              </div>
              <div
                style={{
                  fontSize: '12.5px',
                  color: 'var(--text-muted)',
                  marginTop: '4px',
                  lineHeight: 1.5,
                }}
              >
                {r.reason}
              </div>
              {r.target?.label && (
                <div style={{ fontSize: '12px', color: '#D4AF37', marginTop: '6px' }}>
                  → {r.target.label}
                </div>
              )}
            </div>
          )

          // Key by priority (stable, unique within a recommendation set).
          return href ? (
            <Link
              key={r.priority}
              href={href}
              style={{
                display: 'block',
                textDecoration: 'none',
                borderRadius: '12px',
                border: '1px solid rgba(212,175,55,0.2)',
                background: 'var(--card-bg, #1A140E)',
                padding: '12px 16px',
                transition: 'border-color 0.2s',
              }}
            >
              {body}
            </Link>
          ) : (
            <div
              key={r.priority}
              style={{
                borderRadius: '12px',
                border: '1px solid rgba(255,255,255,0.05)',
                background: 'var(--card-bg, #1A140E)',
                padding: '12px 16px',
              }}
            >
              {body}
            </div>
          )
        })}
      </div>
    </section>
  )
}

/**
 * Public entry: renders the recommendations section inside a Suspense boundary
 * with a null fallback so the surrounding dashboard never waits on (or breaks
 * from) recommendation loading. The async work happens in
 * {@link RecommendedActionsAsync}.
 */
export default function RecommendedActions() {
  return (
    <Suspense fallback={null}>
      <RecommendedActionsAsync />
    </Suspense>
  )
}
