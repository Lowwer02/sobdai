import { notFound } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { getAttemptReview, normalizeView, filterSummary } from '@/lib/assessment/attempt-review-data'
import { fetchBookmarkStateMap } from '@/lib/assessment/saved-questions-data'
import AttemptReviewSummary from '@/components/exams/AttemptReviewSummary'
import AttemptQuestionReviewCard from '@/components/exams/AttemptQuestionReviewCard'
import { createPageMetadata } from '@/lib/seo'
import type { Metadata } from 'next'

export const metadata: Metadata = createPageMetadata({
  title: 'ทบทวนข้อสอบ | Sobdai',
  description: 'ทบทวนคำตอบและเฉลยของชุดข้อสอบที่คุณทำ',
  path: '/exams',
  noindex: true,
})

/**
 * Attempt Review route (Phase 1C).
 *
 * Private learner data: a read-only review of one owned, completed attempt.
 *
 * Security/ownership:
 *   - user_id resolved from the server Supabase session only; never trusted
 *     from the client.
 *   - attempt fetched by (attemptId, userId); RLS re-enforces ownership.
 *   - no service role; no staff bypass.
 *   - missing/unauthorized/malformed → notFound() (no cross-user leak).
 *
 * Immutability: result fields come from the persisted attempt / its
 * answer_summary; nothing is recomputed or mutated. Current question rows only
 * supply display content.
 *
 * Views: ?view=incorrect (default; wrong + unanswered) or ?view=all. Unknown
 * values fall back to 'incorrect'. Filtering is server-rendered.
 */
export default async function AttemptReviewPage({
  params,
  searchParams,
}: {
  params: Promise<{ attemptId: string }>
  searchParams: Promise<{ view?: string }>
}) {
  const { attemptId } = await params
  const { view: rawView } = await searchParams
  const view = normalizeView(rawView)

  // Resolve the authenticated user from the session only.
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return notFound() // not authenticated → safe not-found

  // Coerce/validate the id before hitting the DB.
  const id = typeof attemptId === 'string' ? attemptId.trim() : ''
  if (!id) return notFound()

  const data = await getAttemptReview(id, user.id)
  if (!data) return notFound() // missing, unauthorized, or unreadable

  // Filter server-side from the validated historical summary.
  const filtered = filterSummary(data.summary, view)

  // ── Phase 1F: bookmark state for every displayed question in ONE bounded
  //    query (no per-question lookup). Scoped to this attempt's exam set. The
  //    fetch is non-critical: on any failure it returns a map where every
  //    question is not-bookmarked, so the review page still renders and
  //    bookmarking still works (optimistically on click).
  const displayedQuestionIds = filtered.map((e) => e.questionId)
  const bookmarkState = await fetchBookmarkStateMap(user.id, data.examSetId, displayedQuestionIds)

  // Retry URL preserving the attempt's mode.
  const isPractice = data.mode === 'practice'
  const retryUrl = `/package/${data.packageSlug}/exam/${data.examSetId}?mode=${isPractice ? 'practice' : 'mock'}`

  return (
    <div
      className="min-h-screen"
      style={{ backgroundColor: 'var(--bg-primary)', color: 'var(--text-primary)' }}
    >
      <div style={{ maxWidth: '820px', margin: '0 auto', padding: '32px 20px 80px' }}>
        {/* Back link */}
        <div style={{ marginBottom: '20px' }}>
          <Link
            href="/exams"
            style={{
              color: 'var(--text-muted)',
              fontSize: '13px',
              textDecoration: 'none',
            }}
          >
            ← กลับแดชบอร์ด
          </Link>
        </div>

        {/* Summary header */}
        <div style={{ marginBottom: '28px' }}>
          <AttemptReviewSummary data={data} view={view} />
        </div>

        {/* Section heading for the questions */}
        <h2
          className="font-display"
          style={{
            fontSize: '18px',
            color: 'var(--text-primary)',
            marginBottom: '14px',
            fontWeight: 700,
          }}
        >
          {view === 'all' ? 'ทบทวนทุกข้อ' : 'ทบทวนข้อผิดและข้อที่ไม่ได้ตอบ'}
        </h2>

        {/* Question list or positive empty state */}
        {filtered.length > 0 ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            {filtered.map((entry, i) => (
              <AttemptQuestionReviewCard
                key={entry.questionId}
                order={data.summary.indexOf(entry) + 1}
                entry={entry}
                content={data.questionsById[entry.questionId]}
                examSetId={data.examSetId}
                packageId={data.packageId}
                attemptId={data.attemptId}
                bookmarked={bookmarkState[entry.questionId]?.isBookmarked ?? false}
                bookmarkId={bookmarkState[entry.questionId]?.bookmarkId ?? null}
              />
            ))}
          </div>
        ) : (
          <div
            className="card"
            style={{
              padding: '28px',
              textAlign: 'center',
            }}
          >
            <div style={{ fontSize: '32px', marginBottom: '10px' }} aria-hidden="true">🎉</div>
            <h3
              style={{
                fontSize: '17px',
                fontWeight: 600,
                color: 'var(--text-primary)',
                marginBottom: '8px',
              }}
            >
              ชุดนี้ตอบถูกครบทุกข้อ
            </h3>
            <p
              style={{
                fontSize: '13.5px',
                color: 'var(--text-muted)',
                lineHeight: 1.6,
                marginBottom: '18px',
              }}
            >
              ไม่มีข้อที่ตอบผิดหรือไม่ได้ตอบ ดูคำตอบทั้งหมดหรือทำชุดนี้อีกครั้งได้เลย
            </p>
            <div
              style={{
                display: 'flex',
                gap: '10px',
                justifyContent: 'center',
                flexWrap: 'wrap',
              }}
            >
              <Link
                href={`/exams/attempts/${data.attemptId}?view=all`}
                className="btn-outline"
                style={{
                  display: 'inline-block',
                  textAlign: 'center',
                  textDecoration: 'none',
                  padding: '9px 16px',
                  fontSize: '13px',
                }}
              >
                ดูคำตอบทั้งหมด
              </Link>
              <Link
                href={retryUrl}
                className="btn-primary"
                style={{
                  display: 'inline-block',
                  textAlign: 'center',
                  textDecoration: 'none',
                  padding: '9px 16px',
                  fontSize: '13px',
                }}
              >
                ทำชุดนี้อีกครั้ง
              </Link>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
