'use client'

import React, { useMemo } from 'react'
import { Flag, X } from 'lucide-react'

export interface QuestionNavigatorItem {
  id: string
}

export interface QuestionNavigatorProps {
  /** Array of questions in the set */
  questions: QuestionNavigatorItem[]
  /** Map of question ID to selected answer letter */
  answers: Record<string, string>
  /** Map of question ID to boolean flagged state */
  flagged: Record<string, boolean>
  /** Currently active 0-based question index */
  currentIndex: number
  /** Callback invoked when a user clicks a question (0-based index parameter) */
  onSelectQuestion: (index: number) => void
  /** Optional callback invoked when close button is clicked */
  onClose?: () => void
  /** Optional custom title header (defaults to "รายการข้อสอบ") */
  title?: string
  /** Optional extra CSS classes for container */
  className?: string
}

export interface DerivedQuestionStatus {
  index: number
  questionNumber: number
  questionId: string
  isCurrent: boolean
  isAnswered: boolean
  isFlagged: boolean
}

/**
 * Pure state derivation helper for a single question index.
 */
export function deriveQuestionStatus(
  index: number,
  questionId: string,
  currentIndex: number,
  answers: Record<string, string>,
  flagged: Record<string, boolean>
): DerivedQuestionStatus {
  const isCurrent = index === currentIndex
  const isAnswered = Boolean(answers[questionId])
  const isFlagged = Boolean(flagged[questionId])

  return {
    index,
    questionNumber: index + 1,
    questionId,
    isCurrent,
    isAnswered,
    isFlagged,
  }
}

/**
 * Derived statistics and status items list calculation.
 */
export function computeQuestionNavigatorStats(
  questions: QuestionNavigatorItem[],
  answers: Record<string, string>,
  flagged: Record<string, boolean>,
  currentIndex: number
) {
  const total = questions?.length ?? 0
  let answeredCount = 0
  let flaggedCount = 0

  const items: DerivedQuestionStatus[] = []
  for (let i = 0; i < total; i++) {
    const qId = questions[i]?.id ?? ''
    const status = deriveQuestionStatus(i, qId, currentIndex, answers, flagged)
    if (status.isAnswered) answeredCount++
    if (status.isFlagged) flaggedCount++
    items.push(status)
  }

  return {
    total,
    answeredCount,
    unansweredCount: Math.max(0, total - answeredCount),
    flaggedCount,
    items,
  }
}

/**
 * Question Navigator component (Phase 2A).
 *
 * Displays exam question numbers as a responsive grid with status indicators:
 * - Answered (ตอบแล้ว)
 * - Unanswered (ยังไม่ได้ตอบ)
 * - Flagged (ปักหมุดไว้ทบทวน)
 * - Current (ข้อปัจจุบัน)
 *
 * Fully accessible (a11y aria-labels, shapes, and icons; never color alone).
 */
export default function QuestionNavigator({
  questions,
  answers,
  flagged,
  currentIndex,
  onSelectQuestion,
  onClose,
  title = 'รายการข้อสอบ',
  className = '',
}: QuestionNavigatorProps) {
  const { total, answeredCount, unansweredCount, flaggedCount, items } = useMemo(
    () => computeQuestionNavigatorStats(questions, answers, flagged, currentIndex),
    [questions, answers, flagged, currentIndex]
  )

  if (total <= 0) return null

  return (
    <div
      className={`p-4 sm:p-5 text-[#F5E9D6] font-sans ${className}`}
    >
      {/* Header with Two-Row Layout */}
      <div className="mb-4 pb-3 border-b border-[rgba(255,255,255,0.06)] space-y-3">
        {/* Row 1: Title + Counter Pill (Left), Close Button (Right) */}
        <div className="flex items-center justify-between gap-3">
          <h3 id="question-navigator-heading" className="text-base font-bold text-[#F5E9D6] font-display flex items-center gap-2">
            <span>{title}</span>
            <span className="text-xs font-normal text-[#A1866B] bg-[#0F0B07] px-2 py-0.5 rounded-full border border-[rgba(255,255,255,0.05)]">
              {answeredCount}/{total} ข้อ
            </span>
          </h3>

          {onClose && (
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 text-[#A1866B] hover:text-[#F5E9D6] hover:bg-[rgba(255,255,255,0.05)] rounded-lg transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#D4AF37]"
              aria-label="ปิดตัวนำทางข้อสอบ"
            >
              <X size={18} />
            </button>
          )}
        </div>

        {/* Row 2: Legend Summary Pills */}
        <div className="flex flex-wrap items-center gap-2 text-xs font-medium text-[#A1866B]">
          <div className="flex items-center gap-1.5 px-2 py-1 rounded-md bg-[#0F0B07] border border-[rgba(255,255,255,0.04)]">
            <span className="w-2 h-2 rounded-full bg-[#D4AF37]" aria-hidden="true" />
            <span>ตอบแล้ว ({answeredCount})</span>
          </div>
          <div className="flex items-center gap-1.5 px-2 py-1 rounded-md bg-[#0F0B07] border border-[rgba(255,255,255,0.04)]">
            <span className="w-2 h-2 rounded-full bg-[rgba(255,255,255,0.15)]" aria-hidden="true" />
            <span>ยังไม่ตอบ ({unansweredCount})</span>
          </div>
          {flaggedCount > 0 && (
            <div className="flex items-center gap-1.5 px-2 py-1 rounded-md bg-yellow-500/10 border border-yellow-500/20 text-yellow-400">
              <Flag size={10} className="fill-yellow-400" aria-hidden="true" />
              <span>ปักหมุด ({flaggedCount})</span>
            </div>
          )}
        </div>
      </div>

      {/* Responsive Grid of Question Items */}
      <div
        className="max-h-[380px] overflow-y-auto custom-scrollbar no-scrollbar pr-1"
        role="navigation"
        aria-label="ตัวนำทางข้อสอบ"
      >
        <div className="grid grid-cols-5 sm:grid-cols-8 md:grid-cols-10 gap-2">
          {items.map((item) => {
            const { index, questionNumber, isCurrent, isAnswered, isFlagged } = item

            let btnClass =
              'relative h-10 w-full rounded-xl text-xs font-bold transition-all duration-150 flex items-center justify-center focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#D4AF37] focus-visible:ring-offset-2 focus-visible:ring-offset-[#0F0B07] cursor-pointer '

            if (isCurrent) {
              btnClass += 'ring-2 ring-[#D4AF37] ring-offset-2 ring-offset-[#0F0B07] z-10 '
            }

            if (isAnswered) {
              btnClass += isCurrent
                ? 'bg-[#D4AF37] text-[#1A140E] shadow-[0_0_12px_rgba(212,175,55,0.4)] '
                : 'bg-[#D4AF37]/20 border border-[#D4AF37]/50 text-[#D4AF37] hover:bg-[#D4AF37]/30 '
            } else {
              btnClass += isCurrent
                ? 'bg-[#2A2016] border border-[#D4AF37] text-[#F5E9D6] '
                : 'bg-[#0F0B07] border border-[rgba(255,255,255,0.08)] text-[#A1866B] hover:text-[#F5E9D6] hover:bg-[rgba(255,255,255,0.04)] hover:border-[#D4AF37]/40 '
            }

            const a11yStatus = [
              `ข้อที่ ${questionNumber}`,
              isCurrent ? 'ข้อปัจจุบัน' : null,
              isAnswered ? 'ตอบแล้ว' : 'ยังไม่ได้ตอบ',
              isFlagged ? 'ปักหมุดแล้ว' : null,
            ]
              .filter(Boolean)
              .join(' • ')

            return (
              <button
                type="button"
                key={index}
                onClick={() => onSelectQuestion(index)}
                className={btnClass}
                aria-current={isCurrent ? 'true' : undefined}
                aria-label={a11yStatus}
                title={a11yStatus}
              >
                <span>{questionNumber}</span>

                {/* Flagged Badge Indicator */}
                {isFlagged && (
                  <span
                    className="absolute -top-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full bg-yellow-500 text-[#0F0B07] shadow-sm"
                    aria-hidden="true"
                  >
                    <Flag size={8} className="fill-[#0F0B07]" />
                  </span>
                )}

                {/* Answered Indicator Dot */}
                {isAnswered && !isCurrent && (
                  <span
                    className="absolute bottom-1 right-1 w-1.5 h-1.5 rounded-full bg-[#D4AF37]"
                    aria-hidden="true"
                  />
                )}
              </button>
            )
          })}
        </div>
      </div>
    </div>
  )
}
