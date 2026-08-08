import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { getPackagePublicCounts } from '@/lib/publicData'
import { ORDER_COMPLETED_STATUSES } from '@/lib/orderUtils'
import PackageCard from '@/components/PackageCard'
import type { PackageCardData } from '@/components/PackageCard'
import ContinueLearningCard, { ContinueLearningEmpty } from '@/components/exams/ContinueLearningCard'
import LatestResultCard, { LatestResultEmpty } from '@/components/exams/LatestResultCard'
import LearningStats, { LearningStatsEmpty } from '@/components/exams/LearningStats'
import { WeakTopicsEmpty } from '@/components/exams/WeakTopics'
import WeakTopicsClientSection from '@/components/exams/WeakTopicsClientSection'
import ActivityTimeline, { ActivityTimelineEmpty } from '@/components/exams/ActivityTimeline'
import RecommendedActions from '@/components/exams/RecommendedActions'
import SavedQuestions, { SavedQuestionsEmpty } from '@/components/exams/SavedQuestions'
import MobileShowMore from '@/components/exams/MobileShowMore'
import { getDashboardData } from '@/lib/assessment/dashboard-data'
import { fetchSavedQuestionCards } from '@/lib/assessment/saved-questions-data'
import { getHomepageSettings } from '@/lib/homepageConfig'
import { resolveSocialFollowChannels } from '@/lib/socialFollowConfig'
import NewsSocialFollowBox from '@/components/news/NewsSocialFollowBox'
import {
  getLearnerAnalytics,
  getWeakTopics,
  resolveWeakTopicsScope,
  type WeakTopicsScope,
} from '@/lib/assessment/learner-analytics'
import { getTimeline } from '@/lib/assessment/activity-timeline'
import type { Metadata } from 'next'
import { createPageMetadata } from '@/lib/seo'

export const metadata: Metadata = createPageMetadata({
  title: 'ข้อสอบของฉัน | Sobdai',
  description: 'แดชบอร์ดข้อสอบของคุณ — กลับไปทำชุดข้อสอบที่ซื้อไว้ได้อย่างรวดเร็ว',
  path: '/exams',
  noindex: true,
})

/** Mobile preview count for the "แพ็กเกจของฉัน" grid (desktop shows all). */
const MOBILE_PACKAGES_PREVIEW = 2

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
export default async function ExamDashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>
}) {
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
        organizations ( name, short_name, logo_url ),
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

  // --- Learning Statistics + Weak Topics (Phase 1D / Phase 2A) -------------
  // Learning Statistics is ALWAYS all-packages (unchanged). Weak Topics is the
  // ONLY section scoped by the package selector (Phase 2A).
  //
  // Scope resolution (three-valued URL semantics, see resolveWeakTopicsScope):
  //   ?package=all              → explicit all-packages weak topics (sticky)
  //   ?package={ownedId}        → scope weak topics to that package
  //   (absent / invalid / unowned) → automatic default:
  //      1. latest completed attempt's package (latestResult.packageId)
  //      2. otherwise most recently active session's package
  //      3. otherwise 'all'
  const ownedPackageIds = enriched.map((p) => p.id)
  const params = await searchParams
  const rawPackageParam = typeof params.package === 'string' ? params.package : undefined
  const weakTopicsScope: WeakTopicsScope = resolveWeakTopicsScope({
    packageParam: rawPackageParam,
    ownedPackageIds,
    latestAttemptPackageId: latestResult?.packageId ?? null,
    activeSessionPackageId: activeSessions[0]?.packageId ?? null,
  })
  const isScopedPackage = weakTopicsScope.kind === 'package'

  // Data fetching strategy:
  //  - Statistics always come from the all-packages getLearnerAnalytics query.
  //  - When the scope resolves to 'all', REUSE that same query's weakTopics —
  //    no additional analytics query for the all-packages case.
  //  - When the scope resolves to a package, run getWeakTopics (one bounded
  //    ≤20-row, index-served query) IN PARALLEL with statistics.
  //    getWeakTopics reuses the exact same sanitize + deriveWeakTopics pipeline.
  let learnerAnalytics
  let weakTopicsResult
  if (isScopedPackage) {
    ;[learnerAnalytics, weakTopicsResult] = await Promise.all([
      getLearnerAnalytics({ userId: user.id, ownedPackageIds }),
      getWeakTopics({
        userId: user.id,
        ownedPackageIds,
        packageId: weakTopicsScope.packageId,
      }),
    ])
  } else {
    // 'all' scope: single query; reuse its weakTopics (no second analytics call).
    learnerAnalytics = await getLearnerAnalytics({ userId: user.id, ownedPackageIds })
    weakTopicsResult = null
  }

  const hasCompletedAttempts = learnerAnalytics.statistics.attempts > 0

  // Resolve the Weak Topics display values from the chosen scope.
  //  - weakTopicsList: scoped list (package) or the all-packages list.
  //  - weakTopicsReviewAttemptId: the CTA target. For a package scope this is
  //    the selected package's OWN latest attempt id (scopedLatestAttemptId),
  //    guaranteed to belong to that package; null when the package has no
  //    completed attempts → the CTA is suppressed. For 'all', keep the existing
  //    behavior of pointing at the global latestResult attempt id.
  const weakTopicsList =
    isScopedPackage && weakTopicsResult
      ? weakTopicsResult.weakTopics
      : learnerAnalytics.weakTopics
  const weakTopicsReviewAttemptId = isScopedPackage
    ? (weakTopicsResult?.scopedLatestAttemptId ?? null)
    : (latestResult?.attemptId ?? null)

  // The selector's current value reflects the RESOLVED scope (so the control
  // shows the auto-defaulted package too, not just an explicit URL value).
  const selectorValue = isScopedPackage ? weakTopicsScope.packageId : 'all'
  const selectorOptions = buildPackageScopeOptions(enriched)

  // Phase 2A.1: the all-packages topics are ALWAYS available here (they come
  // from learnerAnalytics.weakTopics). Pass them to the client island so its
  // component-local cache starts warm and switching to `all` never needs a
  // request. The all-packages review CTA target is the global latest attempt.
  const allPackagesTopics = learnerAnalytics.weakTopics
  const allPackagesReviewAttemptId = latestResult?.attemptId ?? null

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

  const homepageSettings = await getHomepageSettings()
  const socialFollowPlacement = homepageSettings.social_follow.placements.dashboard
  const resolvedSocialChannels = resolveSocialFollowChannels(
    homepageSettings.social_follow,
    'dashboard',
    homepageSettings.footer.social_links
  )

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
              <MobileShowMore
                mobileLimit={1}
                moreLabel="ดูข้อสอบที่กำลังทำทั้งหมด ({total})"
                lessLabel="แสดงน้อยลง"
              >
                {activeSessions.map((session) => (
                  <ContinueLearningCard key={session.sessionId} session={session} />
                ))}
              </MobileShowMore>
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

        {/* ---------- Weak Topics (Phase 1D / Phase 2A / 2A.1) ----------------
            ONLY this section is scoped by the package selector. The selector +
            live package switching now live inside a Client Island
            (WeakTopicsClientSection) so a selector change calls ONLY the Weak
            Topics Server Action and updates ONLY this section — the rest of the
            dashboard no longer reloads.

            SSR contract (unchanged guarantees):
              - Initial content is SERVER-RENDERED from the resolved scope
                (auto-default: latest-attempt package → active-session package →
                all), so first paint + noindex are intact.
              - The island receives the SSR-seeded initial scope + topics, plus
                the all-packages topics (always available from learnerAnalytics)
                so its component-local cache starts warm and `all` needs no
                request.
              - Branch logic: no completed attempts anywhere → WeakTopicsEmpty
                (no selector: nothing to scope yet). Otherwise the island owns
                the scoped-empty / all-good branches client-side. */}
        <section style={{ marginBottom: '48px' }}>
          <SectionTitle>หัวข้อที่ควรทบทวน</SectionTitle>
          {!hasCompletedAttempts ? (
            <WeakTopicsEmpty />
          ) : (
            <WeakTopicsClientSection
              options={selectorOptions}
              initialScope={selectorValue}
              initialTopics={weakTopicsList}
              initialReviewAttemptId={weakTopicsReviewAttemptId}
              allPackagesTopics={allPackagesTopics}
              allPackagesReviewAttemptId={allPackagesReviewAttemptId}
              hasCompletedAttempts={hasCompletedAttempts}
            />
          )}
        </section>

        {/* ---------- My Packages (always show all on desktop; 2 on mobile) ----
            Desktop renders every owned package (unchanged behavior). Mobile
            previews the first 2 cards; when more exist, a "ดูแพ็กเกจทั้งหมด"
            link replaces the rest and navigates to the existing /my-packages
            route (no inline expand, no new route). Pure CSS gating via
            `hidden md:block` — no client JS. */}
        <section style={{ marginBottom: '48px' }}>
          <SectionTitle>แพ็กเกจของฉัน</SectionTitle>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))',
              gap: '16px',
            }}
          >
            {allPackages.map((pkg, i) =>
              i < MOBILE_PACKAGES_PREVIEW ? (
                <PackageCard key={pkg.id} pkg={pkg} index={i} />
              ) : (
                // Beyond the mobile preview: hidden on mobile, a normal grid
                // item on desktop (md:block lets the card fill its grid cell).
                <div key={pkg.id} className="hidden md:block">
                  <PackageCard pkg={pkg} index={i} />
                </div>
              ),
            )}
          </div>

          {/* Mobile-only "ดูแพ็กเกจทั้งหมด" → existing /my-packages route.
              Shown only when there are more packages than the mobile preview. */}
          {allPackages.length > MOBILE_PACKAGES_PREVIEW ? (
            <div className="block md:hidden" style={{ marginTop: '14px' }}>
              <Link
                href="/my-packages"
                className="btn-outline"
                style={{
                  display: 'block',
                  textAlign: 'center',
                  textDecoration: 'none',
                  padding: '10px 16px',
                  fontSize: '14px',
                }}
              >
                ดูแพ็กเกจทั้งหมด
              </Link>
            </div>
          ) : null}
        </section>

        {/* ---------- Social Follow Card (Phase 3 — Dashboard Placement) ---------- */}
        <NewsSocialFollowBox
          heading={socialFollowPlacement.heading}
          description={socialFollowPlacement.description}
          channels={resolvedSocialChannels}
          placement="dashboard"
          contentId="dashboard"
        />

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

/**
 * Build the package-scope selector options with unambiguous labels (Phase 2A
 * UX refinement). Reuses ONLY fields already loaded for the package grid — no
 * new query.
 *
 * Label fallback ladder (per spec):
 *   1. {orgAbbreviation} — {position}          (preferred; e.g. "สตง. — …")
 *   2. {orgFullName} — {position}              (when no abbreviation)
 *   3. {position}                              (when organization is missing)
 *   4. a short package-name fallback            (when position is missing)
 *   5. 'แพ็กเกจสอบ'                            (last resort; never a UUID)
 *
 * Empty/whitespace-only abbreviations are treated as missing (fall through to
 * the full name). Duplicate disambiguation: when two or more owned packages
 * share the SAME base label, append the exam year '(ปี {year})' to each
 * duplicate so the learner can tell them apart. The year is NOT appended to
 * every package — only to packages whose base label collides with another.
 *
 * Pure & defensive. Never throws. Never exposes ids.
 */
function buildPackageScopeOptions(
  packages: PackageCardData[],
): { id: string; label: string }[] {
  // Step 1 — base label per package (with the fallback ladder).
  const withBase = packages.map((p) => {
    const orgAbbr = p.organizations?.short_name?.trim() || ''
    const orgFull = p.organizations?.name?.trim() || ''
    const org = orgAbbr || orgFull // abbreviation preferred, else full name
    const pos = p.positions?.name?.trim() || ''
    let base: string
    if (org && pos) {
      base = `${org} — ${pos}`
    } else if (pos) {
      base = pos
    } else if (org) {
      // Position missing but org present — use a short package-name fallback
      // derived from description if available, else the org alone.
      const desc = p.description?.trim() || ''
      base = shortPackageName(desc) || org
    } else {
      // Neither org nor position — last-resort safe fallback (never a UUID).
      const desc = p.description?.trim() || ''
      base = shortPackageName(desc) || 'แพ็กเกจสอบ'
    }
    return { id: p.id, base, year: p.exam_year ?? '' }
  })

  // Step 2 — detect duplicate base labels; append the year to each colliding
  // package so they are distinguishable. Packages with a unique base keep the
  // clean label (no unnecessary year).
  const baseCounts = new Map<string, number>()
  for (const item of withBase) {
    baseCounts.set(item.base, (baseCounts.get(item.base) ?? 0) + 1)
  }

  return withBase.map((item) => {
    const isDuplicate = (baseCounts.get(item.base) ?? 0) > 1
    const label = isDuplicate && item.year ? `${item.base} (ปี ${item.year})` : item.base
    return { id: item.id, label }
  })
}

/**
 * Reduce a long package description to a short, selector-friendly name. Trims
 * to the first sentence/line and clamps length so the `<select>` option never
 * overflows on mobile. Returns '' when the description is empty/whitespace.
 * Pure.
 */
function shortPackageName(description: string): string {
  const trimmed = description.trim()
  if (!trimmed) return ''
  // Take the first line, then clamp to a reasonable selector width.
  const firstLine = trimmed.split(/\n|\.|\u0E53/)[0].trim() // newline | dot | Thai digit zero
  const clamped = firstLine.length > 60 ? `${firstLine.slice(0, 59)}…` : firstLine
  return clamped
}

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
