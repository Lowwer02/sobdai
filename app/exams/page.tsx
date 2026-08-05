import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { getPackagePublicCounts } from '@/lib/publicData'
import { ORDER_COMPLETED_STATUSES } from '@/lib/orderUtils'
import PackageCard from '@/components/PackageCard'
import type { PackageCardData } from '@/components/PackageCard'
import ContinueLearningCard, { ContinueLearningEmpty } from '@/components/exams/ContinueLearningCard'
import LatestResultCard, { LatestResultEmpty } from '@/components/exams/LatestResultCard'
import LearningStats, { LearningStatsEmpty } from '@/components/exams/LearningStats'
import WeakTopics, { WeakTopicsEmpty, WeakTopicsAllGood } from '@/components/exams/WeakTopics'
import ActivityTimeline, { ActivityTimelineEmpty } from '@/components/exams/ActivityTimeline'
import RecommendedActions from '@/components/exams/RecommendedActions'
import SavedQuestions, { SavedQuestionsEmpty } from '@/components/exams/SavedQuestions'
import { getDashboardData } from '@/lib/assessment/dashboard-data'
import { fetchSavedQuestionCards } from '@/lib/assessment/saved-questions-data'
import { getLearnerAnalytics } from '@/lib/assessment/learner-analytics'
import { getTimeline } from '@/lib/assessment/activity-timeline'
import type { Metadata } from 'next'
import { createPageMetadata } from '@/lib/seo'

export const metadata: Metadata = createPageMetadata({
  title: 'ข้อสอบของฉัน | Sobdai',
  description: 'แดชบอร์ดข้อสอบของคุณ — กลับไปทำชุดข้อสอบที่ซื้อไว้ได้อย่างรวดเร็ว',
  path: '/exams',
  noindex: true,
})

/**
 * My Exam Dashboard (Phase 1B).
 *
 * Personal learner dashboard scoped to the logged-in user's purchased packages.
 * Three render states:
 *   1. Guest (not logged in)       -> empty state with login / explore CTAs
 *   2. Logged in, owns nothing     -> empty state with "browse packages" CTA
 *   3. Logged in, owns packages    -> Continue Learning + Latest Result +
 *                                     My Packages grid (+ future placeholders)
 *
 * Real data sections (Phase 1B):
 *   - ทำต่อ        ← in-progress assessment_sessions (status = 'in_progress')
 *   - ผลสอบล่าสุด   ← the latest completed exam_attempt (immutable Outcome)
 * No fake data. Pure Server Component: no client JS added. Reuses PackageCard,
 * the /orders query pattern, and the getPackagePublicCounts RPC.
 */
export default async function ExamDashboardPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  // --- Guest: not logged in -------------------------------------------------
  if (!user) {
    return <GuestEmptyState />
  }

  // --- Logged in: resolve purchased packages --------------------------------
  // Reuse the /orders query pattern. We only need completed (paid/free) orders
  // and the package fields required by PackageCard.
  const { data: orders } = await supabase
    .from('orders')
    .select(`
      package_id,
      packages (
        id, slug, exam_year, current_price, original_price, difficulty,
        description, logo_url, is_published,
        organizations ( name, logo_url ),
        positions ( name )
      )
    `)
    .eq('user_id', user.id)
    .in('status', ORDER_COMPLETED_STATUSES)
    .order('created_at', { ascending: false })

  // De-duplicate by package id (a user may have multiple orders for one pkg)
  // and drop unpublished packages (e.g. retired after purchase).
  const seen = new Set<string>()
  const ownedPackages: any[] = []
  for (const o of orders ?? []) {
    const pkg = o.packages as any
    if (!pkg || seen.has(pkg.id) || !pkg.is_published) continue
    seen.add(pkg.id)
    ownedPackages.push(pkg)
  }

  // --- Logged in, owns nothing ---------------------------------------------
  if (ownedPackages.length === 0) {
    return <NoPackagesEmptyState />
  }

  // --- Logged in, owns packages --------------------------------------------
  // Enrich with public counts (total_questions / total_exam_sets + a per-exam-set
  // question-count map) via the existing RPC — same pattern as the homepage.
  // The exam_set_counts map is reused below for Continue Learning progress totals
  // so the dashboard never fetches question rows itself.
  let enriched: PackageCardData[] = []
  let examSetQuestionCounts: Record<string, number> = {}
  try {
    const counts = await getPackagePublicCounts(ownedPackages.map((p) => p.id))
    // Merge per-exam-set counts across all owned packages into one map.
    for (const pkgId of Object.keys(counts)) {
      const setCounts = counts[pkgId]?.exam_set_counts
      if (setCounts) {
        for (const [setId, q] of Object.entries(setCounts)) {
          examSetQuestionCounts[setId] = Number(q) || 0
        }
      }
    }
    enriched = ownedPackages.map((pkg) => ({
      id: pkg.id,
      slug: pkg.slug,
      exam_year: pkg.exam_year,
      current_price: pkg.current_price,
      original_price: pkg.original_price,
      difficulty: pkg.difficulty,
      description: pkg.description,
      logo_url: pkg.logo_url,
      organizations: pkg.organizations,
      positions: pkg.positions,
      total_questions: counts[pkg.id]?.total_questions || 0,
      total_exam_sets: counts[pkg.id]?.total_exam_sets || 0,
    }))
  } catch {
    // Counts are non-critical; fall back to zeros rather than crashing.
    enriched = ownedPackages.map((pkg) => ({
      id: pkg.id,
      slug: pkg.slug,
      exam_year: pkg.exam_year,
      current_price: pkg.current_price,
      original_price: pkg.original_price,
      difficulty: pkg.difficulty,
      description: pkg.description,
      logo_url: pkg.logo_url,
      organizations: pkg.organizations,
      positions: pkg.positions,
      total_questions: 0,
      total_exam_sets: 0,
    }))
  }

  // --- Real dashboard sections (Continue Learning + Latest Result) ----------
  // Non-critical reads: a query failure degrades to an empty state but the
  // package grid always renders. Scoped to owned packages so only currently
  // accessible progress is surfaced.
  const { activeSessions, latestResult } = await getDashboardData({
    userId: user.id,
    ownedPackageIds: enriched.map((p) => p.id),
    examSetQuestionCounts,
  })

  // --- Learning Statistics + Weak Topics (Phase 1D) ------------------------
  // One bounded query (latest ≤20 completed attempts) feeds BOTH sections.
  // Non-critical: on any failure the analytics layer returns a safe empty
  // payload, so the dashboard's other sections still render. Reuses the same
  // owned-package scoping as getDashboardData. The optional Weak Topics CTA
  // reuses the latestResult attempt id when one is already available — no extra
  // query is performed for this feature.
  const learnerAnalytics = await getLearnerAnalytics({
    userId: user.id,
    ownedPackageIds: enriched.map((p) => p.id),
  })
  const hasCompletedAttempts = learnerAnalytics.statistics.attempts > 0
  const reviewAttemptId = latestResult?.attemptId ?? null

  // --- Activity Timeline (Phase 1E) ----------------------------------------
  // Two bounded queries (latest 10 completed attempts + latest 5 active
  // sessions), merged newest-first into at most 10 items. Non-critical: on any
  // failure the timeline layer returns an empty list, so the dashboard's other
  // sections still render. Reuses the same owned-package scoping and the
  // exam-set count map already built for the package grid (no N+1, no extra
  // count query).
  const timeline = await getTimeline({
    userId: user.id,
    ownedPackageIds: enriched.map((p) => p.id),
    examSetQuestionCounts,
  })

  // --- Saved Questions (Phase 1F) ------------------------------------------
  // One bounded query (newest ≤6 bookmarks) with batched relations, scoped to
  // currently-owned packages. Non-critical: on any failure the layer returns
  // an empty list, so the dashboard's other sections still render.
  const savedQuestions = await fetchSavedQuestionCards({
    userId: user.id,
    ownedPackageIds: enriched.map((p) => p.id),
  })

  const allPackages = enriched

  return (
    <div className="min-h-screen" style={{ backgroundColor: 'var(--bg-primary)', color: 'var(--text-primary)' }}>
      <div style={{ maxWidth: '1100px', margin: '0 auto', padding: '40px 20px 80px' }}>

        {/* ---------- Hero ---------- */}
        <header style={{ textAlign: 'center', marginBottom: '40px' }}>
          <h1
            className="font-display"
            style={{
              fontSize: 'clamp(28px, 5vw, 42px)',
              marginBottom: '10px',
              background: 'linear-gradient(135deg, #f5ede0 30%, var(--gold-light) 70%)',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
              backgroundClip: 'text',
            }}
          >
            ข้อสอบของฉัน
          </h1>
          <p style={{ color: 'var(--text-muted)', fontSize: '15px', maxWidth: '520px', margin: '0 auto' }}>
            ติดตามการเรียนของคุณและกลับไปทำข้อสอบที่ซื้อไว้ได้อย่างรวดเร็ว
          </p>
        </header>

        {/* ---------- Continue Learning (real in-progress sessions) ---------- */}
        <section style={{ marginBottom: '48px' }}>
          <SectionTitle>ทำต่อ</SectionTitle>
          {activeSessions.length > 0 ? (
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))',
                gap: '16px',
              }}
            >
              {activeSessions.map((session) => (
                <ContinueLearningCard key={session.sessionId} session={session} />
              ))}
            </div>
          ) : (
            <ContinueLearningEmpty firstOwnedPackageSlug={allPackages[0]?.slug} />
          )}
        </section>

        {/* ---------- Latest Result (real latest completed attempt) ---------- */}
        <section style={{ marginBottom: '48px' }}>
          <SectionTitle>ผลสอบล่าสุด</SectionTitle>
          {latestResult ? (
            <LatestResultCard result={latestResult} />
          ) : (
            <LatestResultEmpty />
          )}
        </section>

        {/* ---------- Recommended Actions (Phase 1G — adaptive study) ----------
            Async Server Component wrapped in its own Suspense boundary (inside
            RecommendedActions) with a null fallback, so the dashboard NEVER
            waits on the recommendation pipeline (heavier: ≤200 attempts +
            summary lookups). Recommendations stream in once resolved; any
            failure degrades to null and the rest of /exams is unaffected. */}
        <RecommendedActions />

        {/* ---------- Learning Statistics (Phase 1D — recent window) ---------- */}
        <section style={{ marginBottom: '48px' }}>
          <SectionTitle>สถิติการเรียน</SectionTitle>
          {hasCompletedAttempts ? (
            <LearningStats statistics={learnerAnalytics.statistics} />
          ) : (
            <LearningStatsEmpty />
          )}
        </section>

        {/* ---------- Weak Topics (Phase 1D — recent window) ---------- */}
        <section style={{ marginBottom: '48px' }}>
          <SectionTitle>หัวข้อที่ควรทบทวน</SectionTitle>
          {!hasCompletedAttempts ? (
            <WeakTopicsEmpty />
          ) : learnerAnalytics.weakTopics.length > 0 ? (
            <WeakTopics topics={learnerAnalytics.weakTopics} reviewAttemptId={reviewAttemptId} />
          ) : (
            <WeakTopicsAllGood />
          )}
        </section>

        {/* ---------- My Packages (always show all owned) ---------- */}
        <section style={{ marginBottom: '48px' }}>
          <SectionTitle>แพ็กเกจของฉัน</SectionTitle>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))',
              gap: '16px',
            }}
          >
            {allPackages.map((pkg, i) => (
              <PackageCard key={pkg.id} pkg={pkg} index={i} />
            ))}
          </div>
        </section>

        {/* ---------- Activity Timeline (Phase 1E — recent activity) ---------- */}
        <section style={{ marginBottom: '48px' }}>
          <SectionTitle>ไทม์ไลน์กิจกรรม</SectionTitle>
          {timeline.length > 0 ? (
            <ActivityTimeline events={timeline} />
          ) : (
            <ActivityTimelineEmpty />
          )}
        </section>

        {/* ---------- Saved Questions (Phase 1F — newest bookmarks) ---------- */}
        <section style={{ marginBottom: '48px' }}>
          <SectionTitle>ข้อสอบที่บันทึกไว้</SectionTitle>
          {savedQuestions.length > 0 ? (
            <SavedQuestions items={savedQuestions} />
          ) : (
            <SavedQuestionsEmpty />
          )}
        </section>
      </div>
    </div>
  )
}

/* -------------------------------------------------------------------------- */
/* Sub-components (kept local — not worth a shared file yet)                  */
/* -------------------------------------------------------------------------- */

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h2
      className="font-display"
      style={{
        fontSize: '20px',
        color: 'var(--text-primary)',
        marginBottom: '16px',
        fontWeight: 700,
      }}
    >
      {children}
    </h2>
  )
}

/** Guest empty state — not logged in. */
function GuestEmptyState() {
  return (
    <div
      className="min-h-screen"
      style={{
        backgroundColor: 'var(--bg-primary)',
        color: 'var(--text-primary)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '40px 20px',
      }}
    >
      <div
        className="card"
        style={{
          maxWidth: '460px',
          width: '100%',
          padding: '48px 32px',
          textAlign: 'center',
        }}
      >
        {/* Emblem — reuse the brand mark motif (shield + dot) used in admin layout */}
        <div
          style={{
            width: '72px',
            height: '72px',
            borderRadius: '50%',
            background: 'var(--gold-tint, rgba(212,175,55,0.1))',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: 'var(--gold)',
            margin: '0 auto 24px',
          }}
        >
          <svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
            <circle cx="12" cy="10" r="3" fill="currentColor" />
          </svg>
        </div>

        <h1
          className="font-display"
          style={{ fontSize: '26px', marginBottom: '12px', color: 'var(--text-primary)' }}
        >
          แดชบอร์ดข้อสอบของคุณ
        </h1>
        <p style={{ color: 'var(--text-muted)', fontSize: '14.5px', lineHeight: 1.7, marginBottom: '28px' }}>
          เข้าสู่ระบบเพื่อดูชุดข้อสอบที่คุณซื้อ
          ติดตามผลการเรียน
          และกลับไปฝึกทำข้อสอบได้ทุกเมื่อ
        </p>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          <Link
            href="/login?redirect=/exams"
            className="btn-primary"
            style={{ display: 'block', textAlign: 'center', textDecoration: 'none' }}
          >
            เข้าสู่ระบบ
          </Link>
          <Link
            href="/packages"
            className="btn-outline"
            style={{ display: 'block', textAlign: 'center', textDecoration: 'none' }}
          >
            สำรวจแพ็กเกจ
          </Link>
        </div>
      </div>
    </div>
  )
}

/** Logged-in but owns no packages. */
function NoPackagesEmptyState() {
  return (
    <div
      className="min-h-screen"
      style={{
        backgroundColor: 'var(--bg-primary)',
        color: 'var(--text-primary)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '40px 20px',
      }}
    >
      <div
        className="card"
        style={{
          maxWidth: '460px',
          width: '100%',
          padding: '48px 32px',
          textAlign: 'center',
        }}
      >
        <div
          style={{
            width: '72px',
            height: '72px',
            borderRadius: '50%',
            background: 'var(--gold-tint, rgba(212,175,55,0.1))',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: 'var(--gold)',
            margin: '0 auto 24px',
          }}
        >
          <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <rect width="18" height="18" x="3" y="3" rx="2" />
            <path d="M12 8v8" />
            <path d="m8 12 4 4 4-4" />
          </svg>
        </div>

        <h1
          className="font-display"
          style={{ fontSize: '26px', marginBottom: '12px', color: 'var(--text-primary)' }}
        >
          คุณยังไม่มีชุดข้อสอบ
        </h1>
        <p style={{ color: 'var(--text-muted)', fontSize: '14.5px', lineHeight: 1.7, marginBottom: '28px' }}>
          เลือกชุดข้อสอบที่สนใจเพื่อเริ่มเรียนกับ Sobdai
        </p>

        <Link
          href="/packages"
          className="btn-primary"
          style={{ display: 'block', textAlign: 'center', textDecoration: 'none' }}
        >
          ดูแพ็กเกจทั้งหมด
        </Link>
      </div>
    </div>
  )
}
