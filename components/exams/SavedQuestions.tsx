import Link from 'next/link'
import type { SavedQuestionCard } from '@/lib/assessment/saved-questions-data'
import { formatThaiDateTime } from '@/lib/assessment/dashboard-data'

/**
 * Saved Questions (Phase 1F) — the dashboard "ข้อสอบที่บันทึกไว้" section.
 *
 * Shows the newest ≤6 question bookmarks for the learner's currently-owned
 * packages. Pure Server Component (no client JS): the data is fetched server-
 * side by the page and passed in already shaped.
 *
 * Display rules:
 *   - short question preview (plain text, no HTML, no correct answer).
 *   - package name + exam-set name.
 *   - saved Thai date/time.
 *   - link back to the SOURCE ATTEMPT REVIEW when sourceAttemptId is still
 *     valid; otherwise a safe package/exam-set link.
 *   - "ดูทั้งหมด" is intentionally NOT shown (no supported list page ships in
 *     this phase).
 *
 * Empty state: "ยังไม่มีข้อสอบที่บันทึกไว้" with supporting copy explaining the
 * learner can bookmark from the result-review page.
 */
export default function SavedQuestions({ items }: { items: SavedQuestionCard[] }) {
  if (items.length === 0) {
    return <SavedQuestionsEmpty />
  }

  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))',
        gap: '16px',
      }}
    >
      {items.map((item) => (
        <SavedQuestionCardView key={item.bookmarkId} item={item} />
      ))}
    </div>
  )
}

/** One saved-question card. */
function SavedQuestionCardView({ item }: { item: SavedQuestionCard }) {
  // Prefer the source attempt review (the page the bookmark was made from);
  // fall back to a safe package/exam-set link when there is no attempt, or the
  // attempt was deleted (sourceAttemptId becomes null via ON DELETE SET NULL).
  const primaryHref = item.sourceAttemptId
    ? `/exams/attempts/${item.sourceAttemptId}?view=all`
    : `/package/${item.packageSlug}/exam/${item.examSetId}?mode=practice`

  const primaryLabel = item.sourceAttemptId ? 'ทบทวนข้อนี้' : 'เปิดชุดข้อสอบ'

  return (
    <div className="card" style={{ padding: '20px' }}>
      {/* Header: exam-set + package context */}
      <div style={{ marginBottom: '12px' }}>
        <div
          style={{
            fontSize: '11px',
            fontWeight: 700,
            letterSpacing: '0.06em',
            textTransform: 'uppercase',
            color: 'var(--gold-muted)',
            marginBottom: '4px',
          }}
        >
          {item.packageName}
        </div>
        <div style={{ fontSize: '13.5px', fontWeight: 600, color: 'var(--text-primary)' }}>
          {item.examSetName}
        </div>
      </div>

      {/* Question preview (plain text; no correct answer exposed) */}
      {item.questionAvailable ? (
        <p
          style={{
            fontSize: '13.5px',
            color: 'var(--text-secondary)',
            lineHeight: 1.55,
            marginBottom: '14px',
            display: '-webkit-box',
            WebkitLineClamp: 3,
            WebkitBoxOrient: 'vertical',
            overflow: 'hidden',
          }}
        >
          {item.questionPreview || '(คำถามไม่มีเนื้อหา)'}
        </p>
      ) : (
        <p
          style={{
            fontSize: '13px',
            color: 'var(--text-muted)',
            fontStyle: 'italic',
            lineHeight: 1.55,
            marginBottom: '14px',
          }}
        >
          เนื้อหาข้อสอบนี้ไม่สามารถแสดงได้ในขณะนี้
        </p>
      )}

      {/* Saved timestamp */}
      <div style={{ fontSize: '11.5px', color: 'var(--text-muted)', marginBottom: '14px' }}>
        บันทึกเมื่อ {item.createdAt ? formatThaiDateTime(item.createdAt) : ''}
      </div>

      {/* CTA */}
      <Link
        href={primaryHref}
        className="btn-outline"
        style={{
          display: 'inline-block',
          textAlign: 'center',
          textDecoration: 'none',
          padding: '8px 14px',
          fontSize: '13px',
        }}
        aria-label={`${primaryLabel} — ${item.examSetName}`}
      >
        {primaryLabel}
      </Link>
    </div>
  )
}

/**
 * Empty state for the Saved Questions section. Shown when the learner has no
 * bookmarks in currently-owned packages. Supporting copy explains where
 * bookmarking happens (the result-review page).
 */
export function SavedQuestionsEmpty() {
  return (
    <div
      className="card"
      style={{
        padding: '24px',
        textAlign: 'center',
        opacity: 0.95,
      }}
    >
      <h3
        style={{
          fontSize: '15px',
          fontWeight: 600,
          color: 'var(--text-primary)',
          marginBottom: '8px',
        }}
      >
        ยังไม่มีข้อสอบที่บันทึกไว้
      </h3>
      <p style={{ fontSize: '13px', color: 'var(--text-muted)', lineHeight: 1.6, margin: 0 }}>
        หลังทำข้อสอบเสร็จ คุณสามารถกดบันทึกข้อที่อยากทบทวนจากหน้าทบทวนผลได้
        ข้อสอบที่บันทึกไว้จะปรากฏที่นี่
      </p>
    </div>
  )
}
