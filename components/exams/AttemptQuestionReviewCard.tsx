import type {
  ReviewSummaryEntry,
  ReviewQuestionContent,
} from '@/lib/assessment/attempt-review-data'
import QuestionBookmarkButton from '@/components/exams/QuestionBookmarkButton'

/**
 * One reviewed question. Server Component shell with one minimal client island
 * (the bookmark toggle).
 *
 * Shows the historical question order, current question text/choices/explanation
 * when available, the learner's selected answer, the historical correct-answer
 * letter, and a correct/incorrect/unanswered state. Selected vs correct are
 * distinguished with BOTH color and text/icon labels (never color alone).
 *
 * Read-only apart from the Phase 1F bookmark control. Historical result is
 * authoritative — the current question row only contributes display content.
 * When the row is missing/unavailable a safe fallback is rendered without
 * crashing, and the bookmark control is hidden (there is no question to
 * bookmark).
 *
 * No unsafe HTML: all text is rendered as plain React children.
 */
export default function AttemptQuestionReviewCard({
  order,
  entry,
  content,
  examSetId,
  packageId,
  attemptId,
  bookmarked,
  bookmarkId,
}: {
  /** 1-based display number (historical order from the answer summary). */
  order: number
  entry: ReviewSummaryEntry
  content?: ReviewQuestionContent
  /** Exam-set context for the bookmark (one per question+exam_set). */
  examSetId: string
  /** Package context for the bookmark (access scoping). */
  packageId: string
  /** Optional provenance: the attempt this review is from (nullable server-side). */
  attemptId?: string | null
  /** Initial bookmark state from the server-rendered state map. */
  bookmarked: boolean
  /** Initial bookmark id when already bookmarked, else null. */
  bookmarkId: string | null
}) {
  const selected = entry.selected
  const correct = entry.correct
  const isUnanswered = selected == null
  const isCorrect = entry.isCorrect

  // State label: a short Thai phrase + icon-ish glyph, independent of color.
  const stateLabel = isUnanswered ? 'ไม่ได้ตอบ' : isCorrect ? 'ตอบถูก' : 'ตอบผิด'
  const stateColor = isUnanswered ? 'var(--gold-light)' : isCorrect ? '#22c55e' : '#ef4444'
  const available = !!content?.available

  const choices: Array<{ letter: string; text: string | null }> = [
    { letter: 'A', text: content?.choiceA ?? null },
    { letter: 'B', text: content?.choiceB ?? null },
    { letter: 'C', text: content?.choiceC ?? null },
    { letter: 'D', text: content?.choiceD ?? null },
  ]

  return (
    <div
      className="card"
      style={{ padding: '20px' }}
    >
      {/* Header: order + state */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: '10px',
          marginBottom: '14px',
          flexWrap: 'wrap',
        }}
      >
        <span
          className="badge"
          style={{
            fontSize: '11px',
            padding: '3px 10px',
            background: 'rgba(255,255,255,0.03)',
            color: 'var(--gold-muted)',
            border: '1px solid rgba(255,255,255,0.08)',
          }}
        >
          ข้อที่ {order}
        </span>
        <span
          style={{
            fontSize: '11.5px',
            fontWeight: 700,
            padding: '3px 10px',
            borderRadius: '999px',
            color: stateColor,
            background: `${stateColor}1a`,
            border: `1px solid ${stateColor}55`,
            whiteSpace: 'nowrap',
          }}
          aria-label={`สถานะ: ${stateLabel}`}
        >
          {stateLabel}
        </span>
      </div>

      {/* Question text or fallback */}
      {available ? (
        <h3
          style={{
            fontSize: '16px',
            fontWeight: 600,
            color: 'var(--text-primary)',
            lineHeight: 1.5,
            marginBottom: '16px',
            whiteSpace: 'pre-line',
          }}
        >
          {content!.content || '(คำถามไม่มีเนื้อหา)'}
        </h3>
      ) : (
        <div
          style={{
            padding: '14px',
            borderRadius: '12px',
            background: 'rgba(255,255,255,0.02)',
            border: '1px dashed rgba(255,255,255,0.12)',
            marginBottom: '16px',
            fontSize: '13.5px',
            color: 'var(--text-muted)',
            lineHeight: 1.6,
          }}
        >
          เนื้อหาข้อสอบนี้ไม่สามารถแสดงได้ในขณะนี้ (อาจถูกลบหรือปรับปรุงหลังจากที่คุณทำข้อสอบ)
          <br />
          ผลการทำข้อสอบของคุณยังคงถูกบันทึกไว้ตามเดิม
        </div>
      )}

      {/* Choices (only when content is available) */}
      {available && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {choices.map((c) => {
            const isSelected = selected === c.letter
            const isCorrectChoice = correct === c.letter
            return (
              <ChoiceRow
                key={c.letter}
                letter={c.letter}
                text={c.text}
                isSelected={isSelected}
                isCorrectChoice={isCorrectChoice}
                missing={c.text == null}
              />
            )
          })}
        </div>
      )}

      {/* Answer summary line — always shown, reinforces state with text */}
      <div
        style={{
          marginTop: '14px',
          padding: '10px 12px',
          borderRadius: '10px',
          background: `${stateColor}12`,
          border: `1px solid ${stateColor}33`,
          fontSize: '12.5px',
          color: 'var(--text-primary)',
          lineHeight: 1.5,
        }}
      >
        {isUnanswered ? (
          <span>คุณ<strong style={{ color: stateColor }}>ไม่ได้ตอบ</strong>ข้อนี้ — เฉลย: <strong>{correct}</strong></span>
        ) : (
          <span>
            คุณตอบ <strong style={{ color: isSelectedWrong(isCorrect) ? '#ef4444' : '#22c55e' }}>{selected}</strong>
            {' '}— เฉลย <strong>{correct}</strong>{' '}
            ({isCorrect ? 'ถูก' : 'ผิด'})
          </span>
        )}
      </div>

      {/* Explanation (safe text only) */}
      {available && content!.fullExplanation && (
        <div
          style={{
            marginTop: '12px',
            padding: '12px 14px',
            borderRadius: '10px',
            background: 'rgba(212,175,55,0.05)',
            border: '1px solid rgba(212,175,55,0.18)',
          }}
        >
          <div
            style={{
              fontSize: '11px',
              fontWeight: 700,
              letterSpacing: '0.06em',
              textTransform: 'uppercase',
              color: 'var(--gold-muted)',
              marginBottom: '6px',
            }}
          >
            คำอธิบาย
          </div>
          <div
            style={{
              fontSize: '13px',
              color: 'var(--text-secondary)',
              lineHeight: 1.6,
              whiteSpace: 'pre-line',
            }}
          >
            {content!.fullExplanation}
          </div>
        </div>
      )}

      {/* Hint (safe text only) */}
      {available && content!.hint && (
        <div style={{ marginTop: '8px', fontSize: '12px', color: 'var(--text-muted)', fontStyle: 'italic' }}>
          คำใบ้: {content!.hint}
        </div>
      )}

      {/* Labels (display-only metadata) */}
      {(entry.subject || entry.topic || entry.law) && (
        <div
          style={{
            marginTop: '12px',
            display: 'flex',
            gap: '6px',
            flexWrap: 'wrap',
          }}
        >
          {entry.subject && <Label text={`วิชา: ${entry.subject}`} />}
          {entry.topic && <Label text={`หัวข้อ: ${entry.topic}`} />}
          {entry.law && <Label text={`กฎหมาย: ${entry.law}`} />}
        </div>
      )}

      {/* Subtle note when current content's correct answer differs from history */}
      {available && content!.contentMayHaveChanged && (
        <div
          style={{
            marginTop: '12px',
            fontSize: '11.5px',
            color: 'var(--text-muted)',
          }}
        >
          * เนื้อหาข้อสอบอาจมีการปรับปรุงหลังจากที่คุณทำข้อสอบ ผลของคุณยังคงเดิมตามที่บันทึกไว้
        </div>
      )}

      {/* Phase 1F: bookmark toggle. Rendered only when there is a live question
          row to bookmark (the fallback block has no question to save). The
          single client island on this otherwise server-rendered card. */}
      {available && (
        <QuestionBookmarkButton
          questionId={entry.questionId}
          examSetId={examSetId}
          packageId={packageId}
          initialBookmarked={bookmarked}
          initialBookmarkId={bookmarkId}
          sourceAttemptId={attemptId ?? null}
        />
      )}
    </div>
  )
}

function isSelectedWrong(isCorrect: boolean): boolean {
  return !isCorrect
}

/** A single choice row: marks selected + correct with both color and text. */
function ChoiceRow({
  letter,
  text,
  isSelected,
  isCorrectChoice,
  missing,
}: {
  letter: string
  text: string | null
  isSelected: boolean
  isCorrectChoice: boolean
  missing: boolean
}) {
  // Visual tier (color) — paired with text labels so it is never color-only.
  let background = 'rgba(255,255,255,0.02)'
  let borderColor = 'rgba(255,255,255,0.06)'
  let textColor = 'var(--text-secondary)'
  if (isCorrectChoice) {
    background = 'rgba(34,197,94,0.10)'
    borderColor = 'rgba(34,197,94,0.45)'
    textColor = '#F5E9D6'
  } else if (isSelected) {
    background = 'rgba(239,68,68,0.10)'
    borderColor = 'rgba(239,68,68,0.45)'
    textColor = '#F5E9D6'
  }

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'flex-start',
        gap: '10px',
        padding: '10px 12px',
        borderRadius: '12px',
        background,
        border: `1px solid ${borderColor}`,
      }}
    >
      <div
        style={{
          width: '26px',
          height: '26px',
          flexShrink: 0,
          borderRadius: '50%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontWeight: 700,
          fontSize: '12.5px',
          border: `1px solid ${borderColor}`,
          color: isCorrectChoice ? '#22c55e' : isSelected ? '#ef4444' : 'var(--text-muted)',
          background: isCorrectChoice ? 'rgba(34,197,94,0.08)' : isSelected ? 'rgba(239,68,68,0.08)' : 'transparent',
        }}
        aria-hidden="true"
      >
        {letter}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: '13.5px', color: textColor, lineHeight: 1.5 }}>
          {missing ? '(ไม่มีเนื้อหาตัวเลือก)' : text}
        </div>
        {/* Text labels — the accessibility-critical part (not color-only) */}
        <div
          style={{
            marginTop: '4px',
            display: 'flex',
            gap: '8px',
            flexWrap: 'wrap',
            fontSize: '11px',
            fontWeight: 700,
          }}
        >
          {isCorrectChoice && (
            <span style={{ color: '#22c55e' }}>✓ คำตอบที่ถูก</span>
          )}
          {isSelected && !isCorrectChoice && (
            <span style={{ color: '#ef4444' }}>✕ ที่คุณเลือก</span>
          )}
          {isSelected && isCorrectChoice && (
            <span style={{ color: '#22c55e' }}>• ที่คุณเลือก</span>
          )}
        </div>
      </div>
    </div>
  )
}

function Label({ text }: { text: string }) {
  return (
    <span
      style={{
        fontSize: '11px',
        padding: '2px 8px',
        borderRadius: '999px',
        background: 'rgba(255,255,255,0.03)',
        color: 'var(--text-muted)',
        border: '1px solid rgba(255,255,255,0.06)',
      }}
    >
      {text}
    </span>
  )
}
