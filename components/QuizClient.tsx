'use client'

import { useState, useEffect, useCallback } from 'react'
import type { Question } from '@/lib/types'

// Icons (SVG, ไม่มี emoji)
function ChevronLeftIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="15 18 9 12 15 6"/>
    </svg>
  )
}
function ChevronRightIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="9 18 15 12 9 6"/>
    </svg>
  )
}
function LightbulbIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <line x1="12" y1="2" x2="12" y2="3"/>
      <path d="M4.22 4.22l.71.71M1 12h1m16 0h1M4.93 19.07l.71-.71M19.07 4.93l-.71.71"/>
      <path d="M9 21h6"/>
      <path d="M12 17v-6"/>
      <path d="M9.5 8.5A4.5 4.5 0 0 1 12 7a4.5 4.5 0 0 1 4.5 4.5c0 1.3-.56 2.47-1.44 3.27-.5.46-.78.9-.86 1.23h-4.4c-.08-.33-.36-.77-.86-1.23A4.48 4.48 0 0 1 7.5 11.5"/>
    </svg>
  )
}
function CheckIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="20 6 9 17 4 12"/>
    </svg>
  )
}
function XCircleIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10"/>
      <line x1="15" y1="9" x2="9" y2="15"/>
      <line x1="9" y1="9" x2="15" y2="15"/>
    </svg>
  )
}
function BookOpenIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/>
      <path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/>
    </svg>
  )
}
function RefreshIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="23 4 23 10 17 10"/>
      <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/>
    </svg>
  )
}

const CHOICE_LABELS = ['ก', 'ข', 'ค', 'ง']
const CHOICE_KEYS = ['a', 'b', 'c', 'd'] as const
type ChoiceKey = typeof CHOICE_KEYS[number]

interface QuizClientProps {
  questions: Question[]
  examTitle: string
  examId: string
  packageId?: string
}

export default function QuizClient({ questions, examTitle, examId, packageId }: QuizClientProps) {
  const [currentIndex, setCurrentIndex] = useState(0)
  const [selected, setSelected] = useState<ChoiceKey | null>(null)
  const [showHint, setShowHint] = useState(false)
  const [showExplanation, setShowExplanation] = useState(false)
  const [score, setScore] = useState(0)
  const [answered, setAnswered] = useState<number>(0)
  const [completed, setCompleted] = useState(false)
  const [answerMap, setAnswerMap] = useState<Record<number, ChoiceKey | null>>({})

  const q = questions[currentIndex]
  const isAnswered = selected !== null
  const isCorrect = selected === q?.correct_answer

  const choices: [ChoiceKey, string][] = [
    ['a', q?.choice_a ?? ''],
    ['b', q?.choice_b ?? ''],
    ['c', q?.choice_c ?? ''],
    ['d', q?.choice_d ?? ''],
  ]

  // Keyboard navigation
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight' || e.key === ' ') {
        e.preventDefault()
        if (isAnswered) goNext()
      }
      if (e.key === 'ArrowLeft') {
        e.preventDefault()
        goPrev()
      }
      if (!isAnswered && ['1', '2', '3', '4'].includes(e.key)) {
        const idx = parseInt(e.key) - 1
        handleSelect(CHOICE_KEYS[idx])
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [isAnswered, currentIndex])

  const handleSelect = useCallback((key: ChoiceKey) => {
    if (isAnswered) return
    setSelected(key)
    setAnswerMap((prev) => ({ ...prev, [currentIndex]: key }))
    setAnswered((a) => a + 1)
    if (key === q.correct_answer) setScore((s) => s + 1)
  }, [isAnswered, currentIndex, q])

  const goNext = useCallback(() => {
    if (currentIndex >= questions.length - 1) {
      setCompleted(true)
      return
    }
    const nextIdx = currentIndex + 1
    setCurrentIndex(nextIdx)
    setSelected(answerMap[nextIdx] ?? null)
    setShowHint(false)
    setShowExplanation(false)
  }, [currentIndex, questions.length, answerMap])

  const goPrev = useCallback(() => {
    if (currentIndex <= 0) return
    const prevIdx = currentIndex - 1
    setCurrentIndex(prevIdx)
    setSelected(answerMap[prevIdx] ?? null)
    setShowHint(false)
    setShowExplanation(false)
  }, [currentIndex, answerMap])

  const restart = () => {
    setCurrentIndex(0)
    setSelected(null)
    setShowHint(false)
    setShowExplanation(false)
    setScore(0)
    setAnswered(0)
    setCompleted(false)
    setAnswerMap({})
  }

  if (!q) return null

  const progressPct = ((currentIndex + (isAnswered ? 1 : 0)) / questions.length) * 100

  // ===================== Completed Screen =====================
  if (completed) {
    const accuracy = Math.round((score / questions.length) * 100)
    return (
      <div
        style={{
          maxWidth: '520px',
          margin: '60px auto',
          padding: '0 20px',
          textAlign: 'center',
          animation: 'fadeInUp 0.4s ease',
        }}
      >
        <div className="card" style={{ padding: '48px 36px' }}>
          <div
            style={{
              width: 80,
              height: 80,
              borderRadius: '50%',
              background: accuracy >= 60 ? 'var(--correct-bg)' : 'var(--wrong-bg)',
              border: `2px solid ${accuracy >= 60 ? 'var(--correct)' : 'var(--wrong)'}`,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              margin: '0 auto 24px',
            }}
          >
            <span
              className="font-display"
              style={{ fontSize: '28px', color: accuracy >= 60 ? 'var(--correct)' : 'var(--wrong)' }}
            >
              {accuracy}%
            </span>
          </div>
          <h2 className="font-display" style={{ fontSize: '24px', marginBottom: '8px' }}>
            {accuracy >= 80 ? 'ยอดเยี่ยม!' : accuracy >= 60 ? 'ทำได้ดี!' : 'ฝึกต่อไปนะ!'}
          </h2>
          <p style={{ color: 'var(--text-muted)', marginBottom: '32px' }}>
            ตอบถูก {score} จาก {questions.length} ข้อ
          </p>

          {/* Score breakdown */}
          <div
            style={{
              background: 'var(--bg-input)',
              borderRadius: 12,
              padding: '20px',
              marginBottom: '28px',
              textAlign: 'left',
              display: 'flex',
              gap: '24px',
              justifyContent: 'center',
            }}
          >
            <div style={{ textAlign: 'center' }}>
              <div className="font-display" style={{ fontSize: '28px', color: 'var(--correct)' }}>{score}</div>
              <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>ถูก</div>
            </div>
            <div style={{ width: 1, background: 'var(--border-card)' }} />
            <div style={{ textAlign: 'center' }}>
              <div className="font-display" style={{ fontSize: '28px', color: 'var(--wrong)' }}>{questions.length - score}</div>
              <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>ผิด</div>
            </div>
            <div style={{ width: 1, background: 'var(--border-card)' }} />
            <div style={{ textAlign: 'center' }}>
              <div className="font-display" style={{ fontSize: '28px', color: 'var(--gold-light)' }}>{questions.length}</div>
              <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>ทั้งหมด</div>
            </div>
          </div>

          <div style={{ display: 'flex', gap: '10px', flexDirection: 'column' }}>
            <button className="btn-primary" onClick={restart} style={{ padding: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}>
              <RefreshIcon />
              ทำข้อสอบอีกครั้ง
            </button>
            <a href={packageId ? `/package/${packageId}` : `/`}>
              <button className="btn-outline" style={{ padding: '11px', width: '100%' }}>
                กลับไปรายละเอียดแพ็กเกจ
              </button>
            </a>
          </div>
        </div>
      </div>
    )
  }

  // ===================== Quiz Screen =====================
  return (
    <div
      style={{
        maxWidth: '680px',
        margin: '0 auto',
        padding: '24px 20px 60px',
      }}
    >
      {/* Header */}
      <div style={{ marginBottom: '20px' }}>
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: '10px',
          }}
        >
          <div style={{ fontSize: '13px', color: 'var(--text-muted)' }}>
            ข้อ {currentIndex + 1} / {questions.length}
          </div>
          <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
            <span style={{ fontSize: '12.5px', color: 'var(--correct)', display: 'flex', alignItems: 'center', gap: '4px' }}>
              <CheckIcon />
              {score}
            </span>
            <span style={{ fontSize: '12.5px', color: 'var(--wrong)', display: 'flex', alignItems: 'center', gap: '4px' }}>
              <XCircleIcon />
              {answered - score}
            </span>
          </div>
        </div>

        {/* Progress bar */}
        <div className="progress-bar">
          <div className="progress-fill" style={{ width: `${progressPct}%` }} />
        </div>
      </div>

      {/* Question Card */}
      <div
        className="quiz-card"
        key={currentIndex}
        style={{ animation: 'fadeInUp 0.25s ease' }}
      >
        {/* Question number badge */}
        <div
          className="badge badge-gold"
          style={{ marginBottom: '16px', fontSize: '12px' }}
        >
          ข้อที่ {q.question_number}
        </div>

        {/* Question text */}
        <p
          style={{
            fontSize: 'clamp(15px, 2.5vw, 17px)',
            lineHeight: 1.75,
            marginBottom: '24px',
            color: 'var(--text-primary)',
            fontWeight: '500',
          }}
        >
          {q.question_text}
        </p>

        {/* Choices */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginBottom: '20px' }}>
          {choices.map(([key, text], i) => {
            let btnClass = 'choice-btn'
            if (isAnswered) {
              if (key === q.correct_answer) btnClass += ' show-correct'
              else if (key === selected && !isCorrect) btnClass += ' selected-wrong'
            }

            return (
              <button
                key={key}
                id={`choice-${key}`}
                className={btnClass}
                onClick={() => handleSelect(key)}
                disabled={isAnswered}
                aria-pressed={selected === key}
              >
                <span
                  className="choice-badge"
                  style={{
                    color: isAnswered
                      ? key === q.correct_answer
                        ? 'var(--correct)'
                        : key === selected
                        ? 'var(--wrong)'
                        : 'var(--text-muted)'
                      : 'var(--text-muted)',
                    borderColor: 'currentColor',
                  }}
                >
                  {CHOICE_LABELS[i]}
                </span>
                <span style={{ flex: 1, lineHeight: 1.55 }}>{text}</span>
                {isAnswered && key === q.correct_answer && (
                  <span style={{ color: 'var(--correct)', flexShrink: 0 }}>
                    <CheckIcon />
                  </span>
                )}
                {isAnswered && key === selected && !isCorrect && key !== q.correct_answer && (
                  <span style={{ color: 'var(--wrong)', flexShrink: 0 }}>
                    <XCircleIcon />
                  </span>
                )}
              </button>
            )
          })}
        </div>

        {/* Hint button (แสดงเฉพาะก่อนตอบ) */}
        {!isAnswered && q.hint && (
          <div>
            {!showHint ? (
              <button
                onClick={() => setShowHint(true)}
                className="btn-ghost"
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  fontSize: '13px',
                  color: 'var(--hint)',
                  padding: '8px 12px',
                }}
                id="btn-hint"
              >
                <LightbulbIcon />
                ดูคำใบ้
              </button>
            ) : (
              <div className="hint-box animate-slideIn">
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    marginBottom: '6px',
                    fontSize: '12px',
                    fontWeight: '600',
                    color: 'var(--hint)',
                  }}
                >
                  <LightbulbIcon />
                  คำใบ้
                </div>
                <p style={{ margin: 0, lineHeight: 1.65 }}>{q.hint}</p>
              </div>
            )}
          </div>
        )}

        {/* Result + Explanation (หลังตอบ) */}
        {isAnswered && (
          <div style={{ marginTop: '4px' }} className="animate-fadeInUp">
            {/* Result banner */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                padding: '10px 14px',
                borderRadius: 10,
                background: isCorrect ? 'var(--correct-bg)' : 'var(--wrong-bg)',
                color: isCorrect ? 'var(--correct)' : 'var(--wrong)',
                marginBottom: '12px',
                fontSize: '14px',
                fontWeight: '600',
              }}
            >
              {isCorrect ? <CheckIcon /> : <XCircleIcon />}
              {isCorrect ? 'ถูกต้อง!' : `ผิด — ข้อถูกต้องคือ "${CHOICE_LABELS[CHOICE_KEYS.indexOf(q.correct_answer)]}"`}
            </div>

            {/* Explanation toggle */}
            {q.explanation && (
              <div>
                {!showExplanation ? (
                  <button
                    onClick={() => setShowExplanation(true)}
                    className="btn-ghost"
                    style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px', padding: '8px 12px' }}
                  >
                    <BookOpenIcon />
                    ดูคำอธิบาย
                  </button>
                ) : (
                  <div className="explanation-box animate-slideIn">
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '6px',
                        marginBottom: '8px',
                        fontSize: '12px',
                        fontWeight: '600',
                        color: 'var(--green-light)',
                      }}
                    >
                      <BookOpenIcon />
                      คำอธิบาย
                    </div>
                    <p style={{ margin: 0, lineHeight: 1.75, whiteSpace: 'pre-line' }}>{q.explanation}</p>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Navigation */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginTop: '20px',
          gap: '12px',
        }}
      >
        <button
          className="btn-outline"
          onClick={goPrev}
          disabled={currentIndex === 0}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            opacity: currentIndex === 0 ? 0.3 : 1,
            cursor: currentIndex === 0 ? 'not-allowed' : 'pointer',
          }}
        >
          <ChevronLeftIcon />
          ก่อนหน้า
        </button>

        {/* Dot indicators (แสดง max 10 ข้อ) */}
        <div style={{ display: 'flex', gap: '5px', flexWrap: 'wrap', justifyContent: 'center', flex: 1 }}>
          {questions.slice(0, Math.min(questions.length, 20)).map((_, i) => (
            <button
              key={i}
              onClick={() => {
                setCurrentIndex(i)
                setSelected(answerMap[i] ?? null)
                setShowHint(false)
                setShowExplanation(false)
              }}
              style={{
                width: 8,
                height: 8,
                borderRadius: '50%',
                border: 'none',
                cursor: 'pointer',
                background:
                  i === currentIndex
                    ? 'var(--gold)'
                    : answerMap[i] !== undefined
                    ? answerMap[i] === questions[i].correct_answer
                      ? 'var(--correct)'
                      : 'var(--wrong)'
                    : 'var(--text-faint)',
                transition: 'background 0.2s, transform 0.2s',
                transform: i === currentIndex ? 'scale(1.3)' : 'scale(1)',
                padding: 0,
              }}
              aria-label={`ไปข้อที่ ${i + 1}`}
            />
          ))}
        </div>

        <button
          className="btn-primary"
          onClick={goNext}
          disabled={!isAnswered}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            opacity: isAnswered ? 1 : 0.35,
            cursor: isAnswered ? 'pointer' : 'not-allowed',
            padding: '10px 20px',
          }}
        >
          {currentIndex >= questions.length - 1 ? 'ดูผลลัพธ์' : 'ข้อถัดไป'}
          <ChevronRightIcon />
        </button>
      </div>

      {/* Keyboard hint */}
      <p style={{ textAlign: 'center', fontSize: '11.5px', color: 'var(--text-faint)', marginTop: '20px' }}>
        กด 1-4 เพื่อเลือก · Space หรือ → เพื่อไปต่อ · ← ย้อนกลับ
      </p>
    </div>
  )
}
