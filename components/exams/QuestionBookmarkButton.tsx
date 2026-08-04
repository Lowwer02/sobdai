'use client'

/**
 * QuestionBookmarkButton — a compact, accessible bookmark toggle for one
 * reviewed question (Phase 1F).
 *
 * Minimal client component: the only interactivity on the otherwise-server-
 * rendered review card. Optimistic on success-only: the UI flips AFTER the
 * server confirms, never before, so a failed request leaves the button in its
 * prior state (never a false "saved" indicator). Double-clicks are ignored
 * while a request is in flight.
 *
 * Failure handling: any server error is surfaced as a short, non-blocking note
 * under the button. A failure MUST NOT crash the review page.
 *
 * No control is rendered when the question content is unavailable (the review
 * card already shows a fallback block in that case).
 */

import { useTransition, useCallback, useState } from 'react'
import {
  saveMyQuestionBookmark,
  removeMyQuestionBookmark,
} from '@/app/assessment/bookmark-actions'

interface QuestionBookmarkButtonProps {
  questionId: string
  examSetId: string
  packageId: string
  /** Initial bookmark state from the server-rendered map (one bounded query). */
  initialBookmarked: boolean
  initialBookmarkId: string | null
  /** Optional provenance; passed through to the save action when creating. */
  sourceAttemptId?: string | null
}

export default function QuestionBookmarkButton({
  questionId,
  examSetId,
  packageId,
  initialBookmarked,
  initialBookmarkId,
  sourceAttemptId,
}: QuestionBookmarkButtonProps) {
  const [isPending, startTransition] = useTransition()
  const [bookmarked, setBookmarked] = useState(initialBookmarked)
  const [bookmarkId, setBookmarkId] = useState<string | null>(initialBookmarkId)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)

  const handleClick = useCallback(() => {
    // Prevent double-click requests: ignore while a request is in flight.
    if (isPending) return
    setErrorMsg(null)

    if (!bookmarked) {
      // ── Save ──
      startTransition(async () => {
        const res = await saveMyQuestionBookmark({
          questionId,
          examSetId,
          packageId,
          sourceAttemptId: sourceAttemptId ?? null,
        })
        // Update UI ONLY on success.
        if (res.success && res.data) {
          setBookmarked(true)
          setBookmarkId(res.data.bookmarkId ?? null)
        } else {
          setErrorMsg(res.error || 'ไม่สามารถบันทึกข้อนี้ได้')
        }
      })
    } else {
      // ── Remove ──
      startTransition(async () => {
        const res = await removeMyQuestionBookmark({
          bookmarkId: bookmarkId ?? undefined,
          questionId,
          examSetId,
        })
        if (res.success) {
          setBookmarked(false)
          setBookmarkId(null)
        } else {
          setErrorMsg(res.error || 'ไม่สามารถยกเลิกการบันทึกได้')
        }
      })
    }
  }, [
    isPending,
    bookmarked,
    bookmarkId,
    questionId,
    examSetId,
    packageId,
    sourceAttemptId,
  ])

  // Accessible label reflects the current + pending state.
  const label = isPending
    ? bookmarked
      ? 'กำลังยกเลิกการบันทึก…'
      : 'กำลังบันทึก…'
    : bookmarked
      ? 'ยกเลิกการบันทึก'
      : 'บันทึกข้อนี้'

  return (
    <div style={{ marginTop: '14px' }}>
      <button
        type="button"
        onClick={handleClick}
        disabled={isPending}
        aria-pressed={bookmarked}
        aria-label={label}
        className={bookmarked ? 'btn-outline' : 'btn-primary'}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: '6px',
          padding: '8px 14px',
          fontSize: '13px',
          cursor: isPending ? 'wait' : 'pointer',
          opacity: isPending ? 0.7 : 1,
        }}
      >
        <BookmarkGlyph filled={bookmarked} />
        {label}
      </button>
      {errorMsg && (
        <div
          role="alert"
          style={{
            marginTop: '6px',
            fontSize: '12px',
            color: '#ef4444',
          }}
        >
          {errorMsg}
        </div>
      )}
    </div>
  )
}

/** Compact bookmark icon; filled when bookmarked, outline otherwise. */
function BookmarkGlyph({ filled }: { filled: boolean }) {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill={filled ? 'currentColor' : 'none'}
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" />
    </svg>
  )
}
