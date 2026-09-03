'use client'

import { useMemo, useState } from 'react'
import { useEffect, useRef } from 'react'
import Link from 'next/link'
import { Check, ChevronLeft, ChevronRight, Flame, LockKeyhole, Sparkles, Target, Zap } from 'lucide-react'
import {
  claimGuestDaily,
  completeGuestDaily,
  submitDailyAnswer,
  submitGuestDailyAnswer,
} from '@/app/daily/actions'
import {
  trackDailyGuestAuthClick,
  trackDailyGuestClaimComplete,
  trackDailyGuestComplete,
  trackDailyGuestStart,
} from '@/lib/analytics'
import type {
  DailyAnswers,
  DailyChoice,
  DailyQuestionResult,
  DailyState,
} from '@/lib/daily/types'

const CHOICES: DailyChoice[] = ['A', 'B', 'C', 'D']

function formatDate(dateKey: string): string {
  const [year, month, day] = dateKey.split('-').map(Number)
  if (![year, month, day].every(Number.isInteger)) return dateKey

  return new Intl.DateTimeFormat('th-TH', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    timeZone: 'Asia/Bangkok',
  }).format(new Date(Date.UTC(year, month - 1, day)))
}

function accuracyLabel(correct: number, answered: number): string {
  if (answered === 0) return 'ยังไม่มีข้อมูล'
  return `${Math.round((correct / answered) * 100)}%`
}

function StatCard({ label, value, icon }: { label: string; value: string; icon: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-[rgba(255,235,180,0.08)] bg-[#1A1208] p-4">
      <div className="mb-2 flex items-center gap-2 text-xs text-[#A1866B]">
        {icon}
        <span>{label}</span>
      </div>
      <div className="text-xl font-bold text-[#F5E9D6]">{value}</div>
    </div>
  )
}

function QuestCard({
  rewardExp,
  completed,
  guest = false,
}: {
  rewardExp: number
  completed: boolean
  guest?: boolean
}) {
  return (
    <div className={`flex items-center gap-3 rounded-2xl border p-4 ${completed
      ? 'border-[#3D9D66]/50 bg-[#2D7A4F]/10'
      : 'border-[rgba(255,235,180,0.08)] bg-[#1A1208]'}`}>
      <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${completed ? 'bg-[#3D9D66] text-[#0F0B07]' : 'bg-[#2A1E12] text-[#A1866B]'}`}>
        {completed ? <Check size={20} /> : <Target size={18} />}
      </div>
      <div className="min-w-0 flex-1">
        <div className="font-semibold text-[#F5E9D6]">ทำข้อสอบวันนี้ให้ครบ 5 ข้อ</div>
        <div className="text-sm text-[#D4AF37]">+{rewardExp} EXP</div>
      </div>
      <span className={`text-xs font-semibold ${completed ? 'text-[#3D9D66]' : 'text-[#7A6550]'}`}>
        {completed ? 'สำเร็จแล้ว' : guest ? 'รอบันทึก' : 'ยังไม่สำเร็จ'}
      </span>
    </div>
  )
}

function AnswerFeedback({ result }: { result: DailyQuestionResult }) {
  return (
    <div className={`mt-5 rounded-2xl border p-4 ${result.isCorrect
      ? 'border-[#3D9D66]/40 bg-[#2D7A4F]/10'
      : 'border-[#E05C5C]/40 bg-[#E05C5C]/10'}`}>
      <div className={`font-semibold ${result.isCorrect ? 'text-[#4CAF7D]' : 'text-[#E05C5C]'}`}>
        {result.isCorrect ? 'ถูกต้อง' : `คำตอบที่ถูก ${result.correctAnswer}`}
      </div>
      {result.explanation && <p className="mt-2 text-sm leading-6 text-[#A1866B]">{result.explanation}</p>}
    </div>
  )
}

function ResultList({
  questions,
  results,
}: {
  questions: DailyState['questions']
  results: DailyQuestionResult[]
}) {
  const byId = new Map(results.map((result) => [result.id, result]))
  return (
    <div className="mt-8 space-y-3">
      {questions.map((question, index) => {
        const result = byId.get(question.id)
        if (!result) return null
        return (
          <div key={question.id} className={`rounded-2xl border p-4 ${result.isCorrect
            ? 'border-[#3D9D66]/40 bg-[#2D7A4F]/10'
            : 'border-[#E05C5C]/40 bg-[#E05C5C]/10'}`}>
            <div className="mb-2 flex items-center justify-between gap-3 text-sm">
              <span className="font-semibold text-[#F5E9D6]">ข้อที่ {index + 1}</span>
              <span className={result.isCorrect ? 'text-[#4CAF7D]' : 'text-[#E05C5C]'}>
                {result.isCorrect ? 'ถูกต้อง' : `คำตอบที่ถูก ${result.correctAnswer}`}
              </span>
            </div>
            <p className="text-sm leading-6 text-[#C4A882]">{question.content}</p>
            {result.explanation && (
              <p className="mt-3 border-t border-white/5 pt-3 text-sm leading-6 text-[#A1866B]">
                {result.explanation}
              </p>
            )}
          </div>
        )
      })}
    </div>
  )
}

export default function DailyRuntime({ initialState }: { initialState: DailyState }) {
  const [state, setState] = useState(initialState)
  const [currentIndex, setCurrentIndex] = useState(initialState.progress.currentIndex)
  const [draftAnswers, setDraftAnswers] = useState<DailyAnswers>({})
  const [saveMessage, setSaveMessage] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [guestClaimStatus, setGuestClaimStatus] = useState<'idle' | 'pending' | 'ready' | 'failed'>(
    initialState.guestClaimAvailable ? 'pending' : 'idle',
  )
  const guestStartTrackedRef = useRef(false)
  const guestCompleteTrackedRef = useRef(false)
  const guestClaimStartedRef = useRef(false)

  const isGuest = state.viewer === 'guest'

  useEffect(() => {
    if (state.viewer !== 'guest' || guestStartTrackedRef.current) return
    guestStartTrackedRef.current = true
    trackDailyGuestStart()
  }, [state.viewer])

  useEffect(() => {
    if (state.viewer !== 'authenticated'
      || !state.guestClaimAvailable
      || guestClaimStartedRef.current) return

    guestClaimStartedRef.current = true
    setGuestClaimStatus('pending')
    let cancelled = false

    void claimGuestDaily().then((result) => {
      if (cancelled) return

      if (result.status === 'ready') {
        setState(result.state)
        setCurrentIndex(result.state.progress.currentIndex)
        setGuestClaimStatus('ready')
        trackDailyGuestClaimComplete()
      } else if (result.status === 'error') {
        setGuestClaimStatus('failed')
        setSaveMessage(result.message)
      } else if (result.status === 'invalid-proof') {
        setGuestClaimStatus('failed')
      }
    }).catch(() => {
      if (cancelled) return
      setGuestClaimStatus('failed')
      setSaveMessage('ไม่สามารถบันทึกผล Daily ให้บัญชีได้ในขณะนี้')
    })

    return () => {
      cancelled = true
    }
  }, [state.guestClaimAvailable, state.viewer])

  const question = state.questions[currentIndex]
  const persistedChoice = state.progress.answers[question.id]
  const draftChoice = draftAnswers[question.id]
  const selectedChoice = persistedChoice ?? draftChoice
  const currentResult = state.results.find((result) => result.id === question.id) ?? null
  const isComplete = state.progress.dailyCompleted
  const isFinalQuestion = currentIndex === state.questions.length - 1
  const terminalIncomplete = Boolean(persistedChoice) && isFinalQuestion && state.progress.questionsAnswered < state.questions.length
  const actionDisabled = isSubmitting || (!persistedChoice && !draftChoice) || terminalIncomplete

  const summary = useMemo(() => ({
    correct: state.progress.correctAnswers,
    answered: state.progress.questionsAnswered,
    expEarned: state.progress.expEarned,
  }), [state.progress.correctAnswers, state.progress.expEarned, state.progress.questionsAnswered])

  function selectAnswer(choice: DailyChoice) {
    if (isComplete || isSubmitting || persistedChoice) return
    setDraftAnswers((previous) => ({ ...previous, [question.id]: choice }))
    setSaveMessage(null)
  }

  function goTo(index: number) {
    if (isSubmitting) return
    setCurrentIndex(Math.min(4, Math.max(0, index)))
    setSaveMessage(null)
  }

  async function submitCurrentAnswer() {
    if (isComplete || isSubmitting || persistedChoice || !draftChoice) return

    setIsSubmitting(true)
    setSaveMessage(null)
    try {
      if (isGuest) {
        const guestResult = await submitGuestDailyAnswer({
          questionId: question.id,
          choice: draftChoice,
          nextIndex: currentIndex,
        })

        if (guestResult.status === 'ready') {
          const nextAnswers: DailyAnswers = {
            ...state.progress.answers,
            [question.id]: draftChoice,
          }
          const resultById = new Map([
            ...state.results.map((result) => [result.id, result] as const),
            [guestResult.result.id, guestResult.result] as const,
          ])
          const nextResults = state.questions
            .map((candidate) => resultById.get(candidate.id))
            .filter((result): result is DailyQuestionResult => Boolean(result))
          const questionsAnswered = Object.keys(nextAnswers).length
          const correctAnswers = nextResults.filter((result) => result.isCorrect).length
          const dailyCompleted = questionsAnswered === state.questions.length

          setState({
            ...state,
            guestClaimAvailable: false,
            progress: {
              ...state.progress,
              currentIndex: Math.min(state.questions.length - 1, currentIndex + 1),
              answers: nextAnswers,
              questionsAnswered,
              correctAnswers,
              dailyCompleted,
              expEarned: 0,
              completedAt: null,
            },
            stats: {
              ...state.stats,
              questionsAnswered,
              correctAnswers,
              accuracy: Math.round((correctAnswers / questionsAnswered) * 100),
              expEarnedToday: 0,
              totalExp: 0,
              currentStreak: 0,
              longestStreak: 0,
            },
            results: nextResults,
            quests: [{ ...state.quests[0], completed: false }],
          })
          setDraftAnswers((previous) => {
            const next = { ...previous }
            delete next[question.id]
            return next
          })

          if (dailyCompleted) {
            const proofResult = await completeGuestDaily({ answers: nextAnswers })
            if (proofResult.status === 'ready') {
              setGuestClaimStatus('ready')
              setState((previous) => ({ ...previous, guestClaimAvailable: true }))
              if (!guestCompleteTrackedRef.current) {
                guestCompleteTrackedRef.current = true
                trackDailyGuestComplete()
              }
              setSaveMessage('ตรวจคำตอบครบแล้ว ผลวันนี้พร้อมบันทึก')
            } else {
              setGuestClaimStatus('failed')
              setSaveMessage(
                proofResult.status === 'error'
                  ? proofResult.message
                  : 'ตรวจคำตอบครบแล้ว แต่ยังยืนยันผลไม่ได้ กรุณาลองใหม่อีกครั้ง',
              )
            }
          } else {
            setSaveMessage('ตรวจคำตอบแล้ว')
          }
        } else if (guestResult.status === 'unauthenticated') {
          setSaveMessage('เซสชันเปลี่ยนแปลง กรุณาโหลดหน้านี้ใหม่อีกครั้ง')
        } else {
          setSaveMessage(guestResult.message)
        }
        return
      }

      const result = await submitDailyAnswer({
        questionId: question.id,
        choice: draftChoice,
        nextIndex: currentIndex,
      })

      if (result.status === 'ready') {
        setState(result.result.state)
        setDraftAnswers((previous) => {
          const next = { ...previous }
          delete next[question.id]
          return next
        })
        setSaveMessage(result.result.idempotent ? 'คำตอบนี้ถูกบันทึกไว้แล้ว' : 'ตรวจคำตอบและบันทึกแล้ว')
      } else if (result.status === 'unauthenticated') {
        setSaveMessage('เซสชันหมดอายุ กรุณาเข้าสู่ระบบอีกครั้ง')
      } else {
        setSaveMessage(result.message)
      }
    } catch {
      setSaveMessage(isGuest ? 'ไม่สามารถตรวจคำตอบได้ในขณะนี้' : 'ไม่สามารถบันทึก Daily ได้ในขณะนี้')
    } finally {
      setIsSubmitting(false)
    }
  }

  function handleNext() {
    if (isSubmitting) return
    if (persistedChoice) {
      if (currentIndex < 4) goTo(currentIndex + 1)
      return
    }
    void submitCurrentAnswer()
  }

  return (
    <main className="min-h-[70vh] bg-[#0F0B07] px-4 py-10 text-[#F5E9D6] md:py-14">
      <div className="mx-auto max-w-6xl">
        <div className="mb-8 flex flex-col justify-between gap-5 md:flex-row md:items-end">
          <div>
            <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-[#D4AF37]">
              <Sparkles size={17} /> แบบฝึกประจำวัน
            </div>
            <h1 className="text-4xl font-bold font-display md:text-5xl">ข้อสอบประจำวัน 5 ข้อ</h1>
            <p className="mt-2 text-[#A1866B]">ฝึกสั้น ๆ วันละ 5 ข้อ · ชุดประจำวันที่ {formatDate(state.localDate)}</p>
          </div>
          <div className="flex items-center gap-3 rounded-2xl border border-[rgba(212,175,55,0.2)] bg-[#1A140E] px-4 py-3">
            <Flame className="text-[#D4AF37]" size={22} />
            <div>
              <div className="text-xs text-[#A1866B]">ต่อเนื่อง</div>
              <div className="text-xl font-bold text-[#F5E9D6]">
                {isGuest ? 'สมัครเพื่อเริ่ม' : `${state.lifetime.currentStreak} วัน`}
              </div>
            </div>
          </div>
        </div>

        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
          <section>
            {!isComplete ? (
              <div className="quiz-card">
                <div className="mb-6 flex items-center justify-between gap-4">
                  <div>
                    <div className="text-sm text-[#A1866B]">ความคืบหน้า</div>
                    <div className="mt-1 text-lg font-bold">ข้อที่ {currentIndex + 1} / 5</div>
                  </div>
                  <div className="text-right text-sm text-[#A1866B]">ตอบแล้ว {state.progress.questionsAnswered}/5</div>
                </div>
                <div className="mb-8 h-2 overflow-hidden rounded-full bg-[#2A1E12]">
                  <div className="h-full rounded-full bg-[#D4AF37] transition-all" style={{ width: `${((currentIndex + 1) / 5) * 100}%` }} />
                </div>

                <div className="mb-8">
                  <div className="mb-3 text-sm font-semibold text-[#D4AF37]">คำถาม {currentIndex + 1}</div>
                  <h2 className="text-2xl font-bold leading-relaxed text-[#F5E9D6]">{question.content}</h2>
                  {question.hint && <p className="mt-4 text-sm text-[#7A9FD4]">คำใบ้: {question.hint}</p>}
                </div>

                <div className="space-y-3">
                  {CHOICES.map((choice) => {
                    const selected = selectedChoice === choice
                    return (
                      <button
                        key={choice}
                        type="button"
                        className={`choice-btn ${selected
                          ? 'border-[#D4AF37] bg-[rgba(212,168,67,0.18)] font-semibold'
                          : ''}`}
                        data-selected={selected ? 'true' : 'false'}
                        aria-pressed={selected}
                        aria-label={`ตัวเลือก ${choice}: ${question.choices[choice]}${selected ? ' (เลือกแล้ว)' : ''}`}
                        disabled={Boolean(persistedChoice) || isSubmitting}
                        style={selected ? {
                          borderColor: 'var(--gold)',
                          backgroundColor: 'var(--gold-tint-hover)',
                          boxShadow: '0 0 0 1px rgba(212, 175, 55, 0.28), 0 8px 24px rgba(212, 168, 67, 0.12)',
                        } : undefined}
                        onClick={() => selectAnswer(choice)}
                      >
                        <span
                          className="choice-badge"
                          style={selected ? {
                            backgroundColor: 'var(--gold)',
                            borderColor: 'var(--gold)',
                            color: '#1A1208',
                            opacity: 1,
                            boxShadow: '0 0 0 3px rgba(212, 175, 55, 0.18)',
                          } : undefined}
                        >
                          {choice}
                        </span>
                        <span>{question.choices[choice]}</span>
                      </button>
                    )
                  })}
                </div>

                {currentResult && <AnswerFeedback result={currentResult} />}

                <div className="mt-8 flex flex-wrap items-center justify-between gap-3">
                  <button type="button" className="btn-outline inline-flex items-center gap-2" disabled={currentIndex === 0 || isSubmitting} onClick={() => goTo(currentIndex - 1)}>
                    <ChevronLeft size={17} /> ก่อนหน้า
                  </button>
                  <button
                    type="button"
                    className={`btn-primary inline-flex items-center gap-2 ${actionDisabled ? 'cursor-not-allowed opacity-45 saturate-50' : ''}`}
                    aria-disabled={actionDisabled}
                    disabled={actionDisabled}
                    style={actionDisabled ? {
                      cursor: 'not-allowed',
                      filter: 'saturate(0.45)',
                      opacity: 0.45,
                      boxShadow: 'none',
                      transform: 'none',
                    } : undefined}
                    onClick={handleNext}
                  >
                    {isSubmitting
                      ? 'กำลังตรวจคำตอบ...'
                      : persistedChoice
                        ? terminalIncomplete ? 'กลับไปตอบข้อที่เหลือ' : 'ข้อต่อไป'
                        : 'ตรวจคำตอบ'}
                    {!isSubmitting && persistedChoice && !terminalIncomplete && <ChevronRight size={17} />}
                  </button>
                </div>
                {persistedChoice && currentIndex === 4 && state.progress.questionsAnswered < 5 && (
                  <div className="mt-5 text-right text-xs text-[#A1866B]">กลับไปตอบข้อที่ยังไม่ส่งให้ครบ 5 ข้อ</div>
                )}
                {saveMessage && <div className="mt-5 text-right text-xs text-[#A1866B]">{saveMessage}</div>}
              </div>
            ) : (
              <div className="quiz-card">
                <div className="text-center">
                  <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-full bg-[#2D7A4F]/20 text-[#4CAF7D]">
                    <Check size={34} />
                  </div>
                  <div className="text-sm font-semibold text-[#3D9D66]">ทำครบ 5 ข้อแล้ว</div>
                  <h2 className="mt-2 text-3xl font-bold font-display">ถูก {summary.correct}/{summary.answered} ข้อ</h2>
                  {isGuest ? (
                    <p className="mt-2 text-[#A1866B]">
                      ผลวันนี้พร้อมแล้ว สมัครเพื่อเก็บผลและเริ่มสะสมวันต่อเนื่อง
                    </p>
                  ) : (
                    <p className="mt-2 text-[#A1866B]">วันนี้ได้รับ +{summary.expEarned} EXP</p>
                  )}
                  {!isGuest && guestClaimStatus === 'failed' && saveMessage && (
                    <p className="mt-3 text-sm text-[#E05C5C]">{saveMessage}</p>
                  )}
                </div>
                <ResultList questions={state.questions} results={state.results} />
                {isGuest && (
                  <div className="mt-8 rounded-2xl border border-[rgba(212,175,55,0.28)] bg-[rgba(212,168,67,0.08)] p-5">
                    <div className="text-lg font-bold text-[#F5E9D6]">เก็บผลวันนี้ไว้</div>
                    <p className="mt-2 text-sm leading-6 text-[#A1866B]">
                      สมัครหรือเข้าสู่ระบบเพื่อบันทึกผล เริ่มสะสมวันต่อเนื่อง และรับ +50 EXP
                    </p>
                    {guestClaimStatus === 'failed' && (
                      <p className="mt-3 text-sm text-[#E05C5C]">
                        ระบบยังยืนยันผลไม่สำเร็จ กรุณาลองทำรายการอีกครั้งก่อนเข้าสู่ระบบ
                      </p>
                    )}
                    <div className="mt-5 flex flex-wrap gap-3">
                      <Link
                        href="/login?redirect=%2Fdaily&mode=register"
                        className="btn-primary inline-flex items-center justify-center"
                        onClick={() => trackDailyGuestAuthClick('signup')}
                      >
                        สมัครฟรี
                      </Link>
                      <Link
                        href="/login?redirect=%2Fdaily&mode=login"
                        className="btn-outline inline-flex items-center justify-center"
                        onClick={() => trackDailyGuestAuthClick('login')}
                      >
                        เข้าสู่ระบบ
                      </Link>
                    </div>
                  </div>
                )}
              </div>
            )}
          </section>

          <aside className="space-y-6">
            <section>
              <div className="mb-3 flex items-center gap-2">
                <Target size={18} className="text-[#D4AF37]" />
                <h2 className="text-xl font-bold font-display">ภารกิจวันนี้</h2>
              </div>
              <div className="space-y-3">
                {state.quests.map((quest) => (
                  <QuestCard key={quest.id} rewardExp={quest.rewardExp} completed={quest.completed} guest={isGuest} />
                ))}
              </div>
            </section>

            <section>
              <div className="mb-3 flex items-center gap-2">
                <Zap size={18} className="text-[#D4AF37]" />
                <h2 className="text-xl font-bold font-display">สถิติวันนี้</h2>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <StatCard label="วันนี้ตอบ" value={`${state.stats.questionsAnswered}/5`} icon={<Check size={14} />} />
                <StatCard label="ความแม่นยำ" value={accuracyLabel(state.stats.correctAnswers, state.stats.questionsAnswered)} icon={<Target size={14} />} />
                <StatCard label="EXP สะสม" value={isGuest ? '—' : `${state.stats.totalExp}`} icon={<Zap size={14} />} />
                <StatCard label="ต่อเนื่องสูงสุด" value={isGuest ? '—' : `${state.stats.longestStreak} วัน`} icon={<Flame size={14} />} />
              </div>
            </section>

            <div className="rounded-2xl border border-[rgba(212,175,55,0.15)] bg-[rgba(212,168,67,0.06)] p-4 text-sm leading-6 text-[#A1866B]">
              <div className="mb-2 flex items-center gap-2 font-semibold text-[#D4AF37]"><LockKeyhole size={15} /> กติกาประจำวัน</div>
              {isGuest
                ? 'ความแม่นยำใช้เพื่อดูข้อมูลการฝึกเท่านั้น ผลและวันต่อเนื่องจะเริ่มบันทึกเมื่อเข้าสู่ระบบ'
                : 'ต่อเนื่องและ EXP จะเพิ่มเมื่อส่งคำตอบครบทั้ง 5 ข้อเท่านั้น ความแม่นยำใช้เพื่อดูข้อมูลการฝึกเท่านั้น'}
            </div>
          </aside>
        </div>
      </div>
    </main>
  )
}
