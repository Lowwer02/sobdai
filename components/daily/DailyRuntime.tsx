'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Check, ChevronLeft, ChevronRight, Flame, LockKeyhole, Sparkles, Target, Trophy, Zap } from 'lucide-react'
import { saveDailyProgress } from '@/app/daily/actions'
import type {
  DailyAnswers,
  DailyChoice,
  DailyQuestionResult,
  DailySubmissionResult,
  DailyState,
} from '@/lib/daily/types'

const CHOICES: DailyChoice[] = ['A', 'B', 'C', 'D']

function formatDate(dateKey: string): string {
  const [year, month, day] = dateKey.split('-')
  return `${day}/${month}/${year}`
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
  label,
  rewardExp,
  completed,
}: {
  label: string
  rewardExp: number
  completed: boolean
}) {
  return (
    <div className={`flex items-center gap-3 rounded-2xl border p-4 ${completed
      ? 'border-[#3D9D66]/50 bg-[#2D7A4F]/10'
      : 'border-[rgba(255,235,180,0.08)] bg-[#1A1208]'}`}>
      <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${completed ? 'bg-[#3D9D66] text-[#0F0B07]' : 'bg-[#2A1E12] text-[#A1866B]'}`}>
        {completed ? <Check size={20} /> : <Target size={18} />}
      </div>
      <div className="min-w-0 flex-1">
        <div className="font-semibold text-[#F5E9D6]">{label}</div>
        <div className="text-sm text-[#D4AF37]">+{rewardExp} EXP</div>
      </div>
      <span className={`text-xs font-semibold ${completed ? 'text-[#3D9D66]' : 'text-[#7A6550]'}`}>
        {completed ? 'สำเร็จแล้ว' : 'ยังไม่สำเร็จ'}
      </span>
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
  const [answers, setAnswers] = useState<DailyAnswers>(initialState.progress.answers)
  const [currentIndex, setCurrentIndex] = useState(initialState.progress.currentIndex)
  const [submission, setSubmission] = useState<DailySubmissionResult | null>(null)
  const [saveMessage, setSaveMessage] = useState<string | null>(null)
  const [isSaving, setIsSaving] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const lastPersistedSnapshotRef = useRef(JSON.stringify({ answers: initialState.progress.answers, currentIndex: initialState.progress.currentIndex }))
  const persistSequenceRef = useRef(0)

  const persistSnapshot = useCallback(async (
    nextAnswers: DailyAnswers,
    nextIndex: number,
    finalize: boolean,
  ) => {
    const requestSequence = ++persistSequenceRef.current
    if (finalize) setIsSubmitting(true)
    else setIsSaving(true)
    setSaveMessage(null)

    const result = await saveDailyProgress({
      answers: nextAnswers,
      currentIndex: nextIndex,
      finalize,
    })

    const isLatestRequest = requestSequence === persistSequenceRef.current
    if (result.status === 'ready') {
      // Partial saves only acknowledge the submitted snapshot. Keeping local
      // input as-is prevents an older in-flight autosave from reverting a
      // newer answer. A terminal response is authoritative and may replace
      // local state, including when another tab completed the same day.
      if (isLatestRequest) {
        lastPersistedSnapshotRef.current = JSON.stringify({ answers: nextAnswers, currentIndex: nextIndex })
        if (result.result.finalized) {
          setState(result.result.state)
          setAnswers(result.result.state.progress.answers)
          setCurrentIndex(result.result.state.progress.currentIndex)
          setSubmission(result.result)
        }
      }
    } else if (isLatestRequest && result.status === 'unauthenticated') {
      setSaveMessage('เซสชันหมดอายุ กรุณาเข้าสู่ระบบอีกครั้ง')
    } else if (isLatestRequest && result.status === 'error') {
      setSaveMessage(result.message)
    }

    if (finalize) setIsSubmitting(false)
    else setIsSaving(false)
    return result
  }, [])

  // Persist only the latest compact snapshot. This is resume state, not an
  // activity/event stream. The server revalidates every key and answer.
  useEffect(() => {
    if (state.progress.dailyCompleted || submission || isSubmitting) return
    const snapshot = JSON.stringify({ answers, currentIndex })
    if (snapshot === lastPersistedSnapshotRef.current) return

    const timeout = window.setTimeout(() => {
      void persistSnapshot(answers, currentIndex, false)
    }, 450)
    return () => window.clearTimeout(timeout)
  }, [answers, currentIndex, isSubmitting, persistSnapshot, state.progress.dailyCompleted, submission])

  const question = state.questions[currentIndex]
  const answeredCount = Object.keys(answers).length
  const allAnswered = state.questions.every((item) => Boolean(answers[item.id]))
  const isComplete = state.progress.dailyCompleted || Boolean(submission)
  const displayedResults = submission?.results ?? []

  const summary = useMemo(() => ({
    correct: submission?.state.progress.correctAnswers ?? state.progress.correctAnswers,
    answered: submission?.state.progress.questionsAnswered ?? state.progress.questionsAnswered,
    expDelta: submission?.expDelta ?? 0,
  }), [state.progress.correctAnswers, state.progress.questionsAnswered, submission])

  function selectAnswer(choice: DailyChoice) {
    if (isComplete || isSubmitting) return
    setAnswers((previous) => ({ ...previous, [question.id]: choice }))
    setSaveMessage(null)
  }

  function goTo(index: number) {
    setCurrentIndex(Math.min(4, Math.max(0, index)))
    setSaveMessage(null)
  }

  async function submitDaily() {
    if (!allAnswered || isSubmitting || isComplete) return
    await persistSnapshot(answers, currentIndex, true)
  }

  return (
    <main className="min-h-[70vh] bg-[#0F0B07] px-4 py-10 text-[#F5E9D6] md:py-14">
      <div className="mx-auto max-w-6xl">
        <div className="mb-8 flex flex-col justify-between gap-5 md:flex-row md:items-end">
          <div>
            <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-[#D4AF37]">
              <Sparkles size={17} /> DAILY RETENTION PHASE 1
            </div>
            <h1 className="text-4xl font-bold font-display md:text-5xl">Daily 5</h1>
            <p className="mt-2 text-[#A1866B]">ข้อสอบ 5 ข้อประจำวัน · {formatDate(state.localDate)} · สุ่มชุดเดิมตลอดวันนี้</p>
          </div>
          <div className="flex items-center gap-3 rounded-2xl border border-[rgba(212,175,55,0.2)] bg-[#1A140E] px-4 py-3">
            <Flame className="text-[#D4AF37]" size={22} />
            <div>
              <div className="text-xs text-[#A1866B]">Streak</div>
              <div className="text-xl font-bold text-[#F5E9D6]">{state.lifetime.currentStreak} วัน</div>
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
                  <div className="text-right text-sm text-[#A1866B]">ตอบแล้ว {answeredCount}/5</div>
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
                    const selected = answers[question.id] === choice
                    return (
                      <button
                        key={choice}
                        type="button"
                        className={`choice-btn ${selected ? 'border-[#D4AF37] bg-[rgba(212,168,67,0.12)]' : ''}`}
                        aria-pressed={selected}
                        onClick={() => selectAnswer(choice)}
                      >
                        <span className="choice-badge">{choice}</span>
                        <span>{question.choices[choice]}</span>
                      </button>
                    )
                  })}
                </div>

                <div className="mt-8 flex flex-wrap items-center justify-between gap-3">
                  <button type="button" className="btn-outline inline-flex items-center gap-2" disabled={currentIndex === 0} onClick={() => goTo(currentIndex - 1)}>
                    <ChevronLeft size={17} /> ก่อนหน้า
                  </button>
                  {currentIndex < 4 ? (
                    <button type="button" className="btn-primary inline-flex items-center gap-2" disabled={!answers[question.id]} onClick={() => goTo(currentIndex + 1)}>
                      ข้อต่อไป <ChevronRight size={17} />
                    </button>
                  ) : (
                    <button type="button" className="btn-primary inline-flex items-center gap-2" disabled={!allAnswered || isSubmitting} onClick={() => void submitDaily()}>
                      {isSubmitting ? 'กำลังตรวจคำตอบ...' : 'ส่ง Daily 5'} <Trophy size={17} />
                    </button>
                  )}
                </div>
                {(isSaving || saveMessage) && (
                  <div className="mt-5 text-right text-xs text-[#A1866B]">
                    {saveMessage ?? 'บันทึกความคืบหน้าแล้ว'}
                  </div>
                )}
              </div>
            ) : (
              <div className="quiz-card">
                <div className="text-center">
                  <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-full bg-[#2D7A4F]/20 text-[#4CAF7D]">
                    <Check size={34} />
                  </div>
                  <div className="text-sm font-semibold text-[#3D9D66]">Daily 5 สำเร็จแล้ว</div>
                  <h2 className="mt-2 text-3xl font-bold font-display">{summary.correct}/{summary.answered} คะแนน</h2>
                  <p className="mt-2 text-[#A1866B]">วันนี้คุณได้รับ {summary.expDelta || state.progress.expEarned} EXP จาก Daily</p>
                </div>
                {displayedResults.length > 0 && <ResultList questions={state.questions} results={displayedResults} />}
              </div>
            )}
          </section>

          <aside className="space-y-6">
            <section>
              <div className="mb-3 flex items-center gap-2">
                <Target size={18} className="text-[#D4AF37]" />
                <h2 className="text-xl font-bold font-display">Daily Quests</h2>
              </div>
              <div className="space-y-3">
                {state.quests.map((quest) => <QuestCard key={quest.id} {...quest} />)}
              </div>
            </section>

            <section>
              <div className="mb-3 flex items-center gap-2">
                <Zap size={18} className="text-[#D4AF37]" />
                <h2 className="text-xl font-bold font-display">Daily Stats</h2>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <StatCard label="วันนี้ตอบ" value={`${state.stats.questionsAnswered}/5`} icon={<Check size={14} />} />
                <StatCard label="ความแม่นยำ" value={accuracyLabel(state.stats.correctAnswers, state.stats.questionsAnswered)} icon={<Target size={14} />} />
                <StatCard label="EXP รวม" value={`${state.stats.totalExp}`} icon={<Zap size={14} />} />
                <StatCard label="Streak สูงสุด" value={`${state.stats.longestStreak} วัน`} icon={<Flame size={14} />} />
              </div>
            </section>

            <div className="rounded-2xl border border-[rgba(212,175,55,0.15)] bg-[rgba(212,168,67,0.06)] p-4 text-sm leading-6 text-[#A1866B]">
              <div className="mb-2 flex items-center gap-2 font-semibold text-[#D4AF37]"><LockKeyhole size={15} /> กติกา Daily</div>
              Streak จะเพิ่มเมื่อทำ Daily 5 ครบเท่านั้น การเปิดหน้าเว็บหรือเข้าสู่ระบบไม่นับเป็นการทำสำเร็จ
            </div>
          </aside>
        </div>
      </div>
    </main>
  )
}
