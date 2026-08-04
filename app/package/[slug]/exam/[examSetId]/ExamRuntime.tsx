'use client'

import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react'
import Link from 'next/link'
import { ChevronLeft, ChevronRight, Clock, Flag, CheckCircle, XCircle, Lightbulb, BookOpen, AlertCircle, RefreshCw } from 'lucide-react'
import DownloadShareButton from '@/components/share/DownloadShareButton'
import { computeOutcome } from '@/lib/assessment/outcome'
import { normalizeMode } from '@/lib/assessment/types'
import type { AssessmentOutcome } from '@/lib/assessment/types'
import { persistOutcome } from '@/app/assessment/actions'
import {
  getOrCreateMyAssessmentSession,
  saveMyAssessmentSession,
  completeMyAssessmentSession,
} from '@/app/assessment/session-actions'
import { clampIndex } from '@/lib/assessment/session-types'
import type { SessionSnapshot } from '@/lib/assessment/session-types'
import type { ExamSet } from '@/lib/types'
import { completeExam, startExam, submitExam } from '@/lib/analytics'

// Map letter answers to corresponding choice keys
const CHOICE_LETTERS = ['A', 'B', 'C', 'D'] as const
type ChoiceLetter = typeof CHOICE_LETTERS[number]

interface Question {
  id: string
  content: string
  choice_a: string
  choice_b: string
  choice_c: string
  choice_d: string
  correct_answer: ChoiceLetter
  hint: string | null
  full_explanation: string | null
  why_a_wrong: string | null
  why_b_wrong: string | null
  why_c_wrong: string | null
  why_d_wrong: string | null
  reference: string | null
  subject: string | null
  law: string | null
  topic: string | null
  is_common?: boolean
}

interface ExamRuntimeProps {
  pkg: any
  examSet: ExamSet
  questions: Question[]
  mode?: string
}

export default function ExamRuntime({ pkg, examSet, questions: rawQuestions, mode }: ExamRuntimeProps) {
  // ── Assessment domain boundary ─────────────────────────────────────────
  // Epic 1 (Assessment Runtime) introduces the Outcome boundary. The runtime
  // delegates verdict/scoring computation to lib/assessment/outcome.ts and
  // reads results from the resulting Outcome object — it no longer inlines
  // that logic (Constitution AI-003: Runtime executes; it does not analyze).
  // The Outcome is the Runtime → downstream handoff (Constitution AI-004).
  const assessmentMode = normalizeMode(mode)
  const isPractice = assessmentMode === 'practice'

  // ── Normalize questions prop ──────────────────────────────────────────
  // PostgREST embedded relations may return a single object (many-to-one) or
  // an array (one-to-many), depending on FK cardinality and schema cache
  // state. The server page.tsx maps `item.questions` and filters nulls, but
  // if the relation returns arrays, the outer array ends up as
  // [[Question], [Question], ...] instead of [Question, Question, ...].
  // Normalize defensively so the Runtime always operates on a flat Question[].
  const questions = useMemo(() => {
    if (!Array.isArray(rawQuestions)) return []
    return rawQuestions.flatMap((item: any) => {
      if (Array.isArray(item)) return item.filter((q: any) => q && typeof q === 'object' && q.id)
      if (item && typeof item === 'object' && item.id) return [item]
      return []
    }) as Question[]
  }, [rawQuestions])

  const [currentIndex, setCurrentIndex] = useState(0)
  const [answers, setAnswers] = useState<Record<string, ChoiceLetter>>({})
  const [flagged, setFlagged] = useState<Record<string, boolean>>({})
  const [status, setStatus] = useState<'IN_PROGRESS' | 'CONFIRM_SUBMIT' | 'REVIEW'>('IN_PROGRESS')
  const [isExplanationExpanded, setIsExplanationExpanded] = useState(false)

  // Outcome: null until the attempt terminates. The Result view reads from
  // this object rather than recomputing inline. (Constitution AI-005: once
  // generated, never mutated.)
  const [outcome, setOutcome] = useState<AssessmentOutcome | null>(null)

  // ── Phase 1A: Assessment Session (resume / autosave) ─────────────────────
  // `sessionId` is null until getOrCreate resolves (or forever if the Session
  // API fails — the Runtime then runs purely in-memory, as before).
  // `sessionReady` gates answering until the first hydrate completes so a
  // resumed answer set is never overwritten by the empty initial state.
  // `submittingRef` prevents double submit (ref, not state, so it is visible
  // inside the async submit handler synchronously).
  const [sessionId, setSessionId] = useState<string | null>(null)
  const [sessionReady, setSessionReady] = useState(false)
  const submittingRef = useRef(false)
  // Tracks the last values we persisted, so the autosave effect can skip a
  // no-op save (e.g. an answer toggled and then toggled back within the debounce
  // window) and so the periodic timer checkpoint only writes when time moved.
  const lastSavedRef = useRef<{ answers: string; flagged: string; currentIndex: number; timeUsedSeconds: number }>({
    answers: '{}',
    flagged: '{}',
    currentIndex: 0,
    timeUsedSeconds: 0,
  })

  // Reset expanded state when question changes
  useEffect(() => {
    setIsExplanationExpanded(false)
  }, [currentIndex])

  // Track start_exam event on runtime initialization
  useEffect(() => {
    if (examSet?.id && examSet?.name) {
      startExam(
        examSet.id,
        examSet.name,
        examSet.subject || pkg?.name || undefined
      )
    }
  }, [examSet?.id])
  
  // Timer State
  // duration_minutes is the real schema column (was previously read via the
  // non-existent `time_limit_minutes`, which silently fell back to 60 every
  // time). Aligned during Refactor #2.
  const initialTime = (examSet.duration_minutes || 60) * 60
  const [timeRemaining, setTimeRemaining] = useState(initialTime)
  const [timeUsed, setTimeUsed] = useState(0)

  // Mirror of `timeRemaining` kept in a ref so `doSave` can read the current
  // remaining time WITHOUT depending on `timeRemaining` itself. Without this,
  // `doSave`'s identity would change every second (countdown ticks), which
  // resets the 1000ms debounce and the 60s checkpoint interval on every tick —
  // defeating both. The ref is read inside doSave; doSave stays stable. Declared
  // here (after initialTime) so it can be seeded with the same starting value.
  const timeRemainingRef = useRef(initialTime)
  // Keep it in sync with the countdown state across every tick.
  useEffect(() => {
    timeRemainingRef.current = timeRemaining
  }, [timeRemaining])

  // Weak Topic Analysis
  const [weakTopics, setWeakTopics] = useState<{name: string, count: number, type: string}[]>([])

  // ── Safe question-state boundary ──────────────────────────────────────────
  // Derive `q` from a clamped index so an out-of-range `currentIndex` (stale
  // session restore, empty question set, or the -1 REVIEW overview sentinel)
  // never produces an undefined dereference. The REVIEW overview (currentIndex
  // === -1) is handled by an early-return below; for that case `q` is null.
  const safeIndex = (status === 'REVIEW' && currentIndex === -1)
    ? -1
    : clampIndex(currentIndex, questions.length)
  const q = safeIndex >= 0 && safeIndex < questions.length
    ? questions[safeIndex]
    : null

  // ── Phase 1A: hydrate the resume snapshot on mount ───────────────────────
  // One-shot: ask the server for this user's active session for this exam set
  // + mode. If one exists, restore answers/flagged/position; for simulation,
  // restore the timer from the persisted time_used_seconds checkpoint. If the
  // API fails, carry on in-memory (the exam must never crash because resume
  // failed). Runs once per mount.
  useEffect(() => {
    let cancelled = false
    async function hydrate() {
      const examSetId = String(examSet?.id ?? '')
      const packageId = String(pkg?.id ?? '')
      if (!examSetId || !packageId) {
        setSessionReady(true)
        return
      }
      try {
        const res = await getOrCreateMyAssessmentSession({
          examSetId,
          packageId,
          mode: assessmentMode,
        })
        if (cancelled) return
        if (res.success && res.data) {
          const snap: SessionSnapshot = res.data
          setSessionId(snap.id)
          // Hydrate answers (coerce to the ChoiceLetter union; anything not
          // A/B/C/D is dropped by the server validator, so the cast is safe).
          const restoredAnswers: Record<string, ChoiceLetter> = {}
          for (const [qid, letter] of Object.entries(snap.answers ?? {})) {
            if (letter === 'A' || letter === 'B' || letter === 'C' || letter === 'D') {
              restoredAnswers[qid] = letter
            }
          }
          setAnswers(restoredAnswers)
          setFlagged({ ...(snap.flagged ?? {}) })
          const clamped = clampIndex(snap.currentIndex ?? 0, questions.length)
          setCurrentIndex(clamped)
          // Simulation only: restore the timer from the checkpoint so a refresh
          // never resets to full time (Case 4). Practice is untimed regardless.
          if (!isPractice) {
            const used = Math.max(0, Math.trunc(snap.timeUsedSeconds ?? 0))
            const restoredRemaining = Math.max(0, initialTime - used)
            setTimeRemaining(restoredRemaining)
          }
          // Seed lastSavedRef so the first autosave doesn't re-write the
          // just-hydrated identical values.
          lastSavedRef.current = {
            answers: JSON.stringify(restoredAnswers),
            flagged: JSON.stringify(snap.flagged ?? {}),
            currentIndex: clamped,
            timeUsedSeconds: snap.timeUsedSeconds ?? 0,
          }
        } else if (!res.success && res.error && res.error !== 'Unauthorized') {
          // Soft-fail: log without disturbing the user. 'Unauthorized' is
          // expected for logged-out preview and is intentionally silent.
          console.warn('Assessment session resume skipped:', res.error)
        }
      } catch (err) {
        if (!cancelled) console.warn('Assessment session resume failed:', err)
      } finally {
        if (!cancelled) setSessionReady(true)
      }
    }
    hydrate()
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ── Phase 1A: debounced autosave ─────────────────────────────────────────
  // Saves when answers, flagged, or currentIndex change — NOT every second.
  // A 1000ms debounce collapses rapid interactions into one write. The timer
  // is intentionally excluded from the dependency list so the countdown never
  // triggers a write; instead a separate periodic checkpoint (below) persists
  // time_used_seconds for simulation mode every ~60s.
  //
  // `doSave` reads the live remaining time from `timeRemainingRef.current`
  // (NOT from `timeRemaining` state). This keeps doSave's identity stable
  // across every 1s countdown tick — otherwise the debounce setTimeout and the
  // 60s checkpoint setInterval would be torn down and rebuilt every second,
  // and we'd write to the DB every second. doSave only changes when the
  // genuinely relevant inputs change (answers/flagged/currentIndex/session).
  const doSave = useCallback(async (opts?: { force?: boolean }) => {
    const id = sessionId
    if (!id) return // no session (API failed) → in-memory only
    const answersJson = JSON.stringify(answers)
    const flaggedJson = JSON.stringify(flagged)
    const used = Math.max(0, initialTime - Math.max(0, timeRemainingRef.current))
    const prev = lastSavedRef.current
    if (!opts?.force) {
      // Skip if nothing relevant changed.
      if (
        answersJson === prev.answers &&
        flaggedJson === prev.flagged &&
        currentIndex === prev.currentIndex &&
        used === prev.timeUsedSeconds
      ) {
        return
      }
    }
    const res = await saveMyAssessmentSession({
      sessionId: id,
      answers,
      flagged,
      currentIndex,
      timeUsedSeconds: used,
    })
    if (res.success) {
      lastSavedRef.current = {
        answers: answersJson,
        flagged: flaggedJson,
        currentIndex,
        timeUsedSeconds: used,
      }
    } else if (res.error && res.error !== 'Unauthorized') {
      // Autosave failures are non-fatal: the Runtime keeps working in-memory.
      console.warn('Assessment session autosave failed:', res.error)
    }
  }, [sessionId, answers, flagged, currentIndex, initialTime])

  useEffect(() => {
    if (!sessionReady || !sessionId) return
    if (status !== 'IN_PROGRESS') return
    const t = setTimeout(() => { doSave() }, 1000)
    return () => clearTimeout(t)
  }, [answers, flagged, currentIndex, sessionReady, sessionId, status, doSave])

  // Simulation-only periodic time checkpoint (>= 60s). Persists the elapsed
  // time so a mid-exam refresh restores the timer close to the last checkpoint
  // (Case 4). Practice is untimed and skips this entirely.
  useEffect(() => {
    if (!sessionReady || !sessionId) return
    if (isPractice) return
    if (status !== 'IN_PROGRESS') return
    const interval = setInterval(() => { doSave() }, 60000)
    return () => clearInterval(interval)
  }, [sessionReady, sessionId, isPractice, status, doSave])

  // Best-effort flush when the learner navigates away. We do NOT rely on this
  // succeeding (browsers may drop async work in beforeunload); the debounced
  // autosave + 60s checkpoint are the durable path. This just narrows the
  // window of unsaved progress on tab close / route change.
  useEffect(() => {
    function onBeforeUnload() {
      if (sessionId && status === 'IN_PROGRESS') {
        // Fire-and-forget; navigator.sendBeacon would not carry cookies/JSON
        // cleanly for a server action, so we issue a normal fetch-style save
        // and accept it may not complete.
        doSave({ force: true })
      }
    }
    window.addEventListener('beforeunload', onBeforeUnload)
    return () => window.removeEventListener('beforeunload', onBeforeUnload)
  }, [sessionId, status, doSave])

  // Timer Effect — runs ONLY for summative (simulation/mock) attempts.
  // Practice Assessments are untimed by Product Philosophy (Part II §10.1:
  // "Low Pressure"): the timer neither displays nor counts down, and can never
  // force-submit a practice attempt. (Epic 1 authorized bug fix, Q3.)
  useEffect(() => {
    if (isPractice) return          // untimed — no countdown, no auto-submit
    if (status !== 'IN_PROGRESS') return
    if (timeRemaining <= 0) {
      handleForceSubmit()
      return
    }
    const timer = setInterval(() => {
      setTimeRemaining(prev => prev - 1)
    }, 1000)
    return () => clearInterval(timer)
  }, [timeRemaining, status, isPractice])

  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60)
    const s = seconds % 60
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`
  }

  // Navigation
  const goNext = () => {
    if (currentIndex < questions.length - 1) setCurrentIndex(currentIndex + 1)
  }
  const goPrev = () => {
    if (currentIndex > 0) setCurrentIndex(currentIndex - 1)
  }
  const toggleFlag = () => {
    if (!q) return
    setFlagged(prev => ({ ...prev, [q.id]: !prev[q.id] }))
  }

  // Answer selection
  const handleSelect = (letter: ChoiceLetter) => {
    if (status !== 'IN_PROGRESS') return
    if (!q) return
    // Block answering until the first hydrate completes, so a resumed answer
    // set is never clobbered by an empty initial render.
    if (!sessionReady) return
    setAnswers(prev => ({ ...prev, [q.id]: letter }))
    // Auto next on answer (only for non-practice modes)
    if (!isPractice && currentIndex < questions.length - 1) {
      setTimeout(() => goNext(), 300)
    }
  }

  // Submit Flow
  const handleRequestSubmit = () => {
    setStatus('CONFIRM_SUBMIT')
  }

  const handleCancelSubmit = () => {
    setStatus('IN_PROGRESS')
  }

  const handleForceSubmit = () => {
    // ── Double-submit guard ─────────────────────────────────────────────────
    // A ref (not state) so the guard is honored synchronously even when the
    // timer-driven auto-submit and a user click race. computeOutcome and
    // persistOutcome each run at most once per attempt.
    if (submittingRef.current) return
    submittingRef.current = true

    // ── Outcome trigger (Constitution AI-004: One Attempt → One Outcome) ──
    // The Runtime computes the Outcome once at submission via the pure
    // boundary in lib/assessment/outcome.ts, then transitions to REVIEW and
    // reads all results from `outcome`. Verdict uses exam_sets.passing_score
    // (data) rather than the former hard-coded 60/80 thresholds (Epic 1
    // authorized bug fix, Q2).
    const used = initialTime - Math.max(0, timeRemaining)
    setTimeUsed(used)
    const result = computeOutcome({
      examSetId: String(examSet?.id ?? ''),
      packageId: String(pkg?.id ?? ''),
      mode: assessmentMode,
      passingScore: Number(examSet?.passing_score ?? 60),
      timeUsedSeconds: used,
      questions,
      answers,
      flagged,
    })
    setOutcome(result)
    setWeakTopics(result.weakTopics)
    setStatus('REVIEW')
    setCurrentIndex(-1)

    submitExam(examSet.id)
    completeExam(examSet.id, result.score, result.score, result.total - result.score)

    // ── Epic 2: persist the Outcome as official learning history. ──────────
    // Best-effort: the result screen renders from the in-memory `result`
    // object regardless of whether persistence succeeds, so a DB/RLS/network
    // failure cannot break the learner's experience. Errors are logged
    // server-side by persistOutcome; we swallow them here.
    // (Constitution AI-004/005: one Attempt → one immutable Outcome, stored
    // once. Part IV §26: Persistence stores; Runtime continues independently.)
    //
    // Phase 1A: ONLY when persistOutcome succeeds AND returns an id do we
    // close the assessment session and link it to the Outcome. If persistence
    // fails, the session stays in_progress (Case 6) so the learner could
    // resume; the result screen still shows because it reads from `result`.
    persistOutcome(result)
      .then(async (persisted) => {
        if (persisted.success && persisted.id && sessionId) {
          // Best-effort session close. If THIS call fails we log and proceed —
          // the result screen already rendered from the in-memory Outcome, and
          // a stranded in_progress session simply remains resumable.
          const closed = await completeMyAssessmentSession({
            sessionId,
            outcomeAttemptId: persisted.id,
          })
          if (!closed.success && closed.error && closed.error !== 'Unauthorized') {
            console.warn('Assessment session close failed:', closed.error)
          }
        }
      })
      .catch((err) => {
        console.error('Assessment Outcome persistence failed:', err)
      })
  }

  // ── Derived display values (read from the Outcome when present) ──────────
  // During IN_PROGRESS these fall back to live counts (used only by the
  // CONFIRM_SUBMIT summary, which legitimately shows progress mid-attempt).
  // After submit, all values come from the immutable Outcome object.
  const score = outcome?.score ?? 0
  const accuracy = outcome?.accuracy ?? 0
  const answeredCount = outcome?.answeredCount ?? Object.keys(answers).length
  const passed = outcome?.passed ?? false

  // Per-subject breakdown for the share card — read from the Outcome when
  // available. (Before submit there is no Outcome and no share card, so this
  // is only consumed on the result screen.)
  const subjectBreakdown = useMemo(
    () => outcome?.subjectBreakdown ?? [],
    [outcome],
  )

  // Keyboard navigation
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (status === 'IN_PROGRESS' && q) {
        if (e.key === 'ArrowRight') goNext()
        if (e.key === 'ArrowLeft') goPrev()
        if (['1','2','3','4'].includes(e.key)) {
          const mapping = {'1':'A','2':'B','3':'C','4':'D'} as Record<string, ChoiceLetter>
          handleSelect(mapping[e.key])
        }
        if (e.key === 'f') toggleFlag()
      } else if (status === 'REVIEW') {
        if (e.key === 'ArrowRight') goNext()
        if (e.key === 'ArrowLeft') goPrev()
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [currentIndex, status, q])

  // Helper for rendering Question Indicators
  const renderIndicators = () => (
    questions.map((question, i) => {
      let dotClass = "w-2.5 h-2.5 rounded-full transition-all "
      if (status === 'REVIEW') {
        const isAnsCorrect = answers[question.id] === question.correct_answer
        if (answers[question.id]) {
          dotClass += isAnsCorrect ? "bg-green-500 " : "bg-red-500 "
        } else {
          dotClass += "bg-[rgba(255,255,255,0.1)] "
        }
      } else {
        if (answers[question.id]) dotClass += "bg-[#D4AF37] "
        else dotClass += "bg-[rgba(255,255,255,0.2)] "
      }

      const isCurrent = i === currentIndex

      return (
        <button type="button" 
          key={question.id}
          onClick={() => setCurrentIndex(i)}
          className={`relative p-2 rounded-full hover:bg-[rgba(255,255,255,0.05)] transition-colors ${isCurrent ? 'ring-2 ring-[#D4AF37] ring-offset-2 ring-offset-[#0F0B07]' : ''}`}
          aria-label={`ไปข้อที่ ${i + 1}`}
        >
          <div className={dotClass} />
          {status === 'IN_PROGRESS' && flagged[question.id] && (
            <div className="absolute -top-1.5 -right-1.5 w-2 h-2 rounded-full bg-yellow-500 border border-[#0F0B07]" />
          )}
        </button>
      )
    })
  )

  // Choice rendering helper
  const renderChoice = (letter: ChoiceLetter, text: string) => {
    // Guard: renderChoice is only called after the `if (!q)` early return, but
    // TypeScript cannot infer that across closures. Return null defensively.
    if (!q) return null
    const isSelected = answers[q.id] === letter
    const isAnsweredInPractice = isPractice && !!answers[q.id]
    const isReview = status === 'REVIEW' || isAnsweredInPractice
    const isCorrectChoice = q.correct_answer === letter
    
    let btnClass = "w-full text-left p-4 rounded-xl border flex gap-4 transition-all "
    
    if (isReview) {
      if (isCorrectChoice) {
        btnClass += "bg-green-500/10 border-green-500/50 text-[#F5E9D6]"
      } else if (isSelected && !isCorrectChoice) {
        btnClass += "bg-red-500/10 border-red-500/50 text-[#F5E9D6]"
      } else {
        btnClass += "bg-[#1A140E] border-[rgba(255,255,255,0.05)] opacity-50 text-[#A1866B]"
      }
    } else {
      if (isSelected) {
        btnClass += "bg-[#D4AF37]/10 border-[#D4AF37] text-[#D4AF37]"
      } else {
        btnClass += "bg-[#1A140E] border-[rgba(255,255,255,0.1)] hover:border-[#D4AF37]/50 text-[#F5E9D6] hover:bg-[rgba(255,255,255,0.02)] cursor-pointer"
      }
    }

    const whyWrongProp = `why_${letter.toLowerCase()}_wrong` as keyof Question
    const whyWrongText = q[whyWrongProp] as string | null

    const showExplanation = isReview && whyWrongText

    return (
      <div key={letter} className="mb-3">
        <button type="button" 
          onClick={() => handleSelect(letter)}
          disabled={status === 'REVIEW' || isAnsweredInPractice}
          className={`${btnClass} focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#D4AF37]`}
        >
          <div className={`w-8 h-8 rounded-full border flex items-center justify-center flex-shrink-0 font-bold ${
            isReview 
              ? (isCorrectChoice ? 'border-green-500 text-green-500 bg-green-500/10' : (isSelected ? 'border-red-500 text-red-500 bg-red-500/10' : 'border-[#A1866B] text-[#A1866B]'))
              : (isSelected ? 'border-[#D4AF37] text-[#D4AF37] bg-[#D4AF37]/10' : 'border-[rgba(255,255,255,0.2)] text-[#A1866B]')
          }`}>
            {letter}
          </div>
          <div className="flex-1 mt-1 leading-relaxed">
            {text}
          </div>
          {isReview && isCorrectChoice && <CheckCircle className="text-green-500 mt-1" size={20} />}
          {isReview && isSelected && !isCorrectChoice && <XCircle className="text-red-500 mt-1" size={20} />}
        </button>
        
        {/* Explanation specifically for this choice */}
        {showExplanation && (
          <div className="mt-2 ml-12 p-3 bg-red-500/5 border border-red-500/20 rounded-xl text-sm text-red-200/90 leading-relaxed shadow-sm animate-in fade-in slide-in-from-top-2">
            <span className="font-bold text-red-400 block mb-1">เหตุผล:</span>
            {whyWrongText}
          </div>
        )}
      </div>
    )
  }

  // Practice Mode Immediate Feedback
  const renderPracticeFeedback = () => {
    if (!isPractice) return null
    if (!q) return null
    const isAnswered = !!answers[q.id]
    if (!isAnswered) return null
    const isCorrect = answers[q.id] === q.correct_answer

    return (
      <div className={`mt-8 p-5 rounded-2xl border animate-in fade-in slide-in-from-top-4 duration-500 bg-[#2A1F0D] border-[#D4AF37]/30 shadow-lg`}>
        <div className="flex items-start gap-4">
          {isCorrect ? (
            <div className="bg-green-500/20 p-2 rounded-full mt-0.5">
              <CheckCircle className="text-green-500 shrink-0" size={24} />
            </div>
          ) : (
            <div className="bg-red-500/20 p-2 rounded-full mt-0.5">
              <XCircle className="text-red-500 shrink-0" size={24} />
            </div>
          )}
          <div className="flex-1">
            <h4 className={`font-bold text-lg mb-1 ${isCorrect ? 'text-green-400' : 'text-red-400'}`}>
              {isCorrect ? 'ตอบถูกต้อง! 🎉' : 'ตอบผิด 😅'}
            </h4>
            <div className="text-sm font-medium text-[#A1866B] mb-3">
              คุณตอบ: <span className="text-[#F5E9D6] mr-4">{answers[q.id]}</span>
              คำตอบที่ถูก: <span className="text-green-400">{q.correct_answer}</span>
            </div>
            
            {q.full_explanation && (
              <div className="mt-4 pt-4 border-t border-[#D4AF37]/20">
                <span className="font-bold text-[#D4AF37] block mb-2">เหตุผลของคำตอบ:</span>
                <div 
                  className={`text-sm text-[#F5E9D6] leading-relaxed opacity-90 whitespace-pre-line transition-all duration-300 overflow-hidden ${
                    !isExplanationExpanded ? 'line-clamp-3' : ''
                  }`}
                >
                  {q.full_explanation}
                </div>
                
                {q.full_explanation.length > 150 && (
                  <button type="button" 
                    onClick={() => setIsExplanationExpanded(!isExplanationExpanded)}
                    className="mt-3 text-[#D4AF37] text-sm font-bold flex items-center gap-1 hover:text-[#F1D17A] transition-colors focus-visible:outline-none"
                  >
                    {isExplanationExpanded ? (
                      <>▲ ซ่อนเฉลย</>
                    ) : (
                      <>▼ ดูเฉลยทั้งหมด</>
                    )}
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    )
  }

  // CONFIRM SUBMIT MODAL
  if (status === 'CONFIRM_SUBMIT') {
    const unAnswered = questions.length - answeredCount
    const flaggedCount = Object.values(flagged).filter(Boolean).length
    return (
      <div className="min-h-screen bg-[#0F0B07] flex items-center justify-center p-4">
        <div className="bg-[#1A140E] border border-[rgba(212,175,55,0.2)] p-8 rounded-3xl max-w-md w-full animate-in zoom-in-95 duration-200 shadow-2xl">
          <div className="w-16 h-16 bg-yellow-500/10 text-yellow-500 rounded-2xl flex items-center justify-center mx-auto mb-6">
            <AlertCircle size={32} />
          </div>
          <h2 className="text-2xl font-bold text-[#F5E9D6] font-display mb-2 text-center">ยืนยันการส่งข้อสอบ?</h2>
          <p className="text-center text-[#A1866B] text-sm mb-6">คุณจะไม่สามารถกลับมาแก้ไขคำตอบได้อีก</p>
          
          <div className="bg-[#0F0B07] rounded-2xl p-6 my-6 border border-[rgba(255,255,255,0.05)] space-y-4 shadow-inner">
            <div className="flex justify-between items-center text-sm">
              <span className="text-[#A1866B]">ทำไปแล้ว</span>
              <span className="text-[#F5E9D6] font-bold text-base px-3 py-1 bg-[rgba(255,255,255,0.03)] rounded-lg">{answeredCount} / {questions.length} ข้อ</span>
            </div>
            {unAnswered > 0 && (
              <div className="flex justify-between items-center text-sm">
                <span className="text-red-400">ยังไม่ได้ทำ</span>
                <span className="text-red-400 font-bold text-base px-3 py-1 bg-red-500/10 rounded-lg">{unAnswered} ข้อ</span>
              </div>
            )}
            {flaggedCount > 0 && (
              <div className="flex justify-between items-center text-sm">
                <span className="text-yellow-400">ปักหมุดไว้</span>
                <span className="text-yellow-400 font-bold text-base px-3 py-1 bg-yellow-500/10 rounded-lg">{flaggedCount} ข้อ</span>
              </div>
            )}
            <div className="flex justify-between items-center text-sm pt-4 border-t border-[rgba(255,255,255,0.05)]">
              <span className="text-[#A1866B]">เวลาที่เหลือ</span>
              <span className="text-[#D4AF37] font-bold text-base px-3 py-1 bg-[#D4AF37]/10 rounded-lg">{formatTime(timeRemaining)}</span>
            </div>
          </div>

          <div className="flex gap-3">
            <button type="submit" onClick={handleCancelSubmit} className="flex-1 bg-transparent border border-[rgba(255,255,255,0.1)] hover:bg-[rgba(255,255,255,0.05)] text-[#F5E9D6] font-bold py-3 rounded-xl transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#D4AF37]">
              ทำต่อ
            </button>
            <button type="button" onClick={handleForceSubmit} className="flex-1 bg-[#D4AF37] hover:bg-[#F1D17A] text-[#1A140E] font-bold py-3 rounded-xl transition-all shadow-[0_4px_15px_rgba(212,175,55,0.3)] hover:shadow-[0_4px_25px_rgba(212,175,55,0.4)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white">
              ส่งข้อสอบ
            </button>
          </div>
        </div>
      </div>
    )
  }

  // RESULT OVERVIEW (First page of REVIEW mode)
  if (status === 'REVIEW' && currentIndex === -1) {
    return (
      <div className="min-h-screen bg-[#0F0B07] py-12 px-4">
        <div className="max-w-2xl mx-auto space-y-8 animate-in slide-in-from-bottom-8 duration-500">
          
          <div className="text-center">
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-[#1A140E] border border-[rgba(255,255,255,0.05)] text-xs font-bold text-[#A1866B] mb-6">
              <CheckCircle size={14} className="text-green-500" />
              ส่งข้อสอบเรียบร้อยแล้ว
            </div>
            <h1 className="text-3xl font-bold text-[#F5E9D6] font-display mb-2">{examSet.name}</h1>
            <p className="text-[#A1866B]">{pkg.name}</p>
          </div>

          <div className="bg-[#1A140E] border border-[rgba(212,175,55,0.2)] rounded-2xl p-8 relative overflow-hidden">
            {/* Background glow — keyed off the Outcome verdict (passed) rather
                than a hard-coded accuracy threshold. The verdict is computed in
                lib/assessment/outcome.ts using exam_sets.passing_score. */}
            <div className={`absolute top-0 left-1/2 -translate-x-1/2 w-full h-full max-w-sm bg-gradient-to-b ${passed ? 'from-green-500/10' : 'from-red-500/10'} to-transparent opacity-50 blur-2xl pointer-events-none`} />

            <div className="relative z-10 flex flex-col items-center">

              {/* Circular Progress Placeholder */}
              <div className="relative w-40 h-40 mb-6 flex items-center justify-center">
                <svg className="w-full h-full -rotate-90" viewBox="0 0 100 100">
                  <circle className="text-[#0F0B07] stroke-current" strokeWidth="8" cx="50" cy="50" r="40" fill="transparent" />
                  <circle
                    className={`${passed ? 'text-green-500' : 'text-red-500'} stroke-current transition-all duration-1000 ease-out`}
                    strokeWidth="8" strokeLinecap="round" cx="50" cy="50" r="40" fill="transparent"
                    strokeDasharray="251.2" strokeDashoffset={251.2 - (251.2 * accuracy) / 100}
                  />
                </svg>
                <div className="absolute inset-0 flex flex-col items-center justify-center">
                  <div className="text-4xl font-display font-bold" style={{ color: passed ? '#22c55e' : '#ef4444' }}>
                    {accuracy}%
                  </div>
                </div>
              </div>

              <div className="text-[#F5E9D6] font-bold text-lg mb-8 text-center px-4">
                {passed ? 'ทำได้ดี! ทบทวนอีกนิดรับรองผ่านฉลุย' : 'ฝึกต่อไป! คุณทำได้แน่นอน'}
              </div>

              <div className="grid grid-cols-3 w-full gap-4 max-w-sm mb-8">
                <div className="text-center p-4 bg-[#0F0B07] rounded-xl border border-[rgba(255,255,255,0.05)]">
                  <div className="text-2xl font-bold text-green-500 mb-1">{score}</div>
                  <div className="text-xs text-[#A1866B] uppercase tracking-wider">ตอบถูก</div>
                </div>
                <div className="text-center p-4 bg-[#0F0B07] rounded-xl border border-[rgba(255,255,255,0.05)]">
                  <div className="text-2xl font-bold text-red-500 mb-1">{questions.length - score}</div>
                  <div className="text-xs text-[#A1866B] uppercase tracking-wider">ตอบผิด</div>
                </div>
                <div className="text-center p-4 bg-[#0F0B07] rounded-xl border border-[rgba(255,255,255,0.05)]">
                  <div className="text-2xl font-bold text-[#D4AF37] mb-1">{formatTime(timeUsed)}</div>
                  <div className="text-xs text-[#A1866B] uppercase tracking-wider">เวลาที่ใช้</div>
                </div>
              </div>
            </div>
          </div>

          {weakTopics.length > 0 && (
            <div className="bg-[#1A140E] border border-[rgba(255,255,255,0.05)] rounded-2xl p-6">
              <h3 className="text-[#F5E9D6] font-bold mb-4 flex items-center gap-2">
                <AlertCircle className="text-yellow-500" size={18} />
                หัวข้อที่ควรทบทวนเพิ่มเติม
              </h3>
              <div className="space-y-3">
                {weakTopics.map((topic, i) => (
                  <div key={i} className="flex justify-between items-center bg-[#0F0B07] p-3 rounded-lg border border-[rgba(255,255,255,0.02)]">
                    <span className="text-[#F5E9D6] text-sm">{topic.name}</span>
                    <span className="text-xs text-red-400 bg-red-500/10 px-2 py-1 rounded-md">ผิด {topic.count} ข้อ</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="flex flex-col sm:flex-row gap-4">
            <button type="button" onClick={() => setCurrentIndex(0)} className="flex-1 bg-[#D4AF37] hover:bg-[#F1D17A] text-[#1A140E] font-bold py-4 px-6 rounded-xl transition-all shadow-[0_4px_15px_rgba(212,175,55,0.3)] hover:shadow-[0_4px_25px_rgba(212,175,55,0.4)] flex items-center justify-center gap-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white">
              <BookOpen size={18} />
              ดูเฉลยอย่างละเอียด
            </button>
            <DownloadShareButton
              packageName={pkg.name || ''}
              positionName={pkg.positions?.name || ''}
              examName={examSet.name || ''}
              scorePercent={accuracy}
              correct={score}
              wrong={questions.length - score}
              timeUsedSeconds={timeUsed}
              subjects={subjectBreakdown}
            />
            <Link href={`/package/${pkg.slug}`} className="flex-1 bg-transparent border border-[rgba(255,255,255,0.1)] hover:bg-[rgba(255,255,255,0.05)] text-[#F5E9D6] font-bold py-4 px-6 rounded-xl transition-colors flex items-center justify-center gap-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#D4AF37]">
              กลับหน้าหลัก
            </Link>
          </div>
        </div>
      </div>
    )
  }

  // ── Empty-questions safety boundary ──────────────────────────────────────
  // If the question set is empty (all hidden by RLS, or questions removed
  // since the session was created), render a safe fallback instead of crashing.
  // Also guards the REVIEW→question transition if `q` is null (currentIndex
  // === -1 is handled by the overview above; any other null-q is a boundary
  // case that must not crash).
  if (!q) {
    return (
      <div className="min-h-screen bg-[#0F0B07] flex items-center justify-center p-4">
        <div className="bg-[#1A140E] border border-[rgba(212,175,55,0.2)] p-8 rounded-2xl max-w-md w-full text-center">
          <div className="w-16 h-16 bg-[#D4AF37]/10 text-[#D4AF37] rounded-full flex items-center justify-center mx-auto mb-6">
            <AlertCircle size={32} />
          </div>
          <h2 className="text-xl font-bold text-[#F5E9D6] mb-3">ไม่พบข้อสอบที่ต้องการ</h2>
          <p className="text-[#A1866B] mb-6 text-sm">ข้อสอบในชุดนี้อาจยังไม่พร้อมใช้งาน หรือมีการเปลี่ยนแปลงข้อมูล กรุณาลองใหม่อีกครั้ง</p>
          <Link href={`/package/${pkg.slug}`} className="block w-full bg-[#D4AF37] hover:bg-[#F1D17A] text-[#1A140E] font-bold py-3 rounded-xl transition-colors">
            กลับไปหน้าแพ็กเกจ
          </Link>
        </div>
      </div>
    )
  }

  // MAIN RUNTIME & REVIEW VIEW
  return (
    <div className="min-h-screen pb-32 lg:pb-24 font-sans" style={{ backgroundColor: '#0F0B07', color: '#F5E9D6' }}>
      
      {/* Header */}
      <div className="sticky top-0 z-50 bg-[#0F0B07] border-b border-[rgba(212,175,55,0.1)]">
        {/* Progress bar */}
        <div 
          className={`absolute top-0 left-0 h-[2px] transition-all duration-300 z-50 ${status === 'REVIEW' ? 'bg-[#D4AF37]' : 'bg-[#D4AF37]'}`} 
          style={{ width: `${((currentIndex + 1) / questions.length) * 100}%` }} 
        />
        
        <div className="max-w-4xl mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link href={status === 'REVIEW' ? '#' : `/package/${pkg.slug}`} onClick={(e) => { if (status === 'IN_PROGRESS' && !confirm('ความคืบหน้าที่บันทึกล่าสุดจะถูกเก็บไว้ คุณต้องการออกจากข้อสอบใช่หรือไม่?')) e.preventDefault(); if (status === 'REVIEW') { e.preventDefault(); setCurrentIndex(-1); } }} className="text-[#A1866B] hover:text-[#D4AF37] transition-colors p-2 -ml-2 rounded-lg hover:bg-[rgba(255,255,255,0.05)]">
              <ChevronLeft size={20} />
            </Link>
            <div>
              <div className="text-[10px] uppercase tracking-wider font-bold text-[#A1866B] mb-0.5">{status === 'REVIEW' ? 'โหมดทบทวนเฉลย' : examSet.name}</div>
              <div className="text-sm font-bold text-[#F5E9D6] lg:hidden">ข้อ {currentIndex + 1} จาก {questions.length}</div>
            </div>
          </div>
          
          <div className="flex items-center gap-3">
            {status === 'IN_PROGRESS' ? (
              <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border font-mono text-sm font-bold transition-all ${timeRemaining < 300 ? 'border-red-500/30 text-red-400 bg-red-500/10 shadow-[0_0_10px_rgba(239,68,68,0.2)] animate-pulse' : 'border-[rgba(255,255,255,0.05)] bg-[rgba(255,255,255,0.03)] text-[#D4AF37]'}`}>
                <Clock size={14} className={timeRemaining < 300 ? "animate-pulse" : ""} />
                {isPractice ? 'ไม่จำกัดเวลา' : formatTime(timeRemaining)}
              </div>
            ) : (
              <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-[rgba(255,255,255,0.05)] bg-[rgba(255,255,255,0.03)] text-[#A1866B] text-sm font-bold">
                <CheckCircle size={14} className={q && answers[q.id] === q.correct_answer ? "text-green-500" : "text-red-500"} />
                <span className="hidden sm:inline">{q && answers[q.id] === q.correct_answer ? 'ตอบถูก' : 'ตอบผิด'}</span>
              </div>
            )}
            
            {status === 'IN_PROGRESS' && (
              <button type="button" 
                onClick={handleRequestSubmit} 
                className="hidden sm:flex bg-transparent hover:bg-[rgba(255,255,255,0.05)] text-[#D4AF37] border border-[rgba(212,175,55,0.3)] px-4 py-1.5 rounded-lg text-sm font-bold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#D4AF37]"
              >
                ส่งข้อสอบ
              </button>
            )}
          </div>
        </div>
      </div>

      <div className="max-w-3xl mx-auto px-4 py-8">
        
        {/* Question Area */}
        <div className="mb-8">
          <div className="flex items-start justify-between gap-4 mb-6">
            <div className="flex items-center gap-2">
              <span className="inline-block px-3 py-1 rounded-md bg-[#1A140E] text-[#A1866B] text-xs font-bold border border-[rgba(255,255,255,0.05)]">
                ข้อที่ {currentIndex + 1}
              </span>
              {q.is_common !== undefined && (
                <span className={`inline-block px-3 py-1 rounded-md text-xs font-bold border ${q.is_common ? 'bg-orange-500/10 text-orange-400 border-orange-500/20' : 'bg-blue-500/10 text-blue-400 border-blue-500/20'}`}>
                  {q.is_common ? '🔥 ออกสอบบ่อย' : '📘 พื้นฐาน'}
                </span>
              )}
            </div>
            {status === 'IN_PROGRESS' && (
              <button type="button" 
                onClick={toggleFlag}
                className={`flex items-center gap-1.5 text-xs font-bold px-3 py-1 rounded-md border transition-colors ${flagged[q.id] ? 'bg-yellow-500/10 border-yellow-500/50 text-yellow-500' : 'bg-transparent border-[rgba(255,255,255,0.1)] text-[#A1866B] hover:text-[#F5E9D6]'}`}
              >
                <Flag size={12} className={flagged[q.id] ? 'fill-yellow-500' : ''} />
                {flagged[q.id] ? 'ปักหมุดแล้ว' : 'ปักหมุดไว้ทบทวน'}
              </button>
            )}
          </div>
          
          <h2 className="text-xl md:text-2xl leading-relaxed font-medium text-[#F5E9D6]">
            {q.content}
          </h2>
        </div>

        {/* Choices Area */}
        <div className="space-y-0">
          {renderChoice('A', q.choice_a)}
          {renderChoice('B', q.choice_b)}
          {renderChoice('C', q.choice_c)}
          {renderChoice('D', q.choice_d)}
        </div>

        {/* Practice Mode Placeholder */}
        {renderPracticeFeedback()}

        {/* Post-Question Explanations (Review Mode) */}
        {status === 'REVIEW' && (
          <div className="mt-8 space-y-4 animate-in slide-in-from-bottom-4">
            {(q.hint || q.full_explanation) && (
              <div className="bg-[#1A140E] rounded-xl border border-[rgba(255,255,255,0.05)] overflow-hidden">
                <div className="px-5 py-3 border-b border-[rgba(255,255,255,0.05)] bg-[#0F0B07] flex items-center gap-2 text-sm font-bold text-[#A1866B]">
                  <Lightbulb size={16} className="text-yellow-500" />
                  คำอธิบายเพิ่มเติม
                </div>
                <div className="p-5 text-[#F5E9D6] text-sm leading-relaxed space-y-4">
                  {q.hint && <p className="text-[#A1866B] italic">คำใบ้: {q.hint}</p>}
                  {q.full_explanation && <div className="whitespace-pre-line">{q.full_explanation}</div>}
                </div>
              </div>
            )}
            
            {q.reference && (
              <div className="flex items-start gap-2 p-4 rounded-xl bg-blue-500/10 border border-blue-500/20 text-blue-200 text-sm">
                <BookOpen size={16} className="mt-0.5 flex-shrink-0" />
                <div>
                  <span className="font-bold block mb-0.5">อ้างอิง:</span>
                  {q.reference}
                </div>
              </div>
            )}
          </div>
        )}

      </div>

      {/* Mobile & Tablet Navigation Bar */}
      <div className="lg:hidden fixed bottom-0 left-0 w-full bg-[#0F0B07] border-t border-[rgba(255,255,255,0.05)] pb-safe z-40">
        <div className="max-w-4xl mx-auto px-4 py-4 flex items-center justify-between">
          
          <button type="button" 
            onClick={goPrev} 
            disabled={currentIndex === 0}
            className={`flex items-center gap-2 font-bold px-4 py-2.5 rounded-xl transition-colors ${currentIndex === 0 ? 'text-[#A1866B] opacity-50 cursor-not-allowed' : 'text-[#F5E9D6] hover:bg-[#1A140E]'}`}
          >
            <ChevronLeft size={18} />
            <span className="hidden sm:inline">ก่อนหน้า</span>
          </button>

          {/* Quick Pagination Dots */}
          <div className="flex-1 flex justify-center px-4 overflow-x-auto custom-scrollbar no-scrollbar py-2">
            <div className="flex items-center gap-1.5">
              {renderIndicators()}
            </div>
          </div>

          <div className="flex items-center gap-2">
            {status === 'IN_PROGRESS' && currentIndex === questions.length - 1 ? (
              <button type="button"
                onClick={handleRequestSubmit}
                className={`flex items-center gap-2 font-bold px-5 py-2.5 rounded-xl transition-all shadow-[0_0_15px_rgba(212,175,55,0.3)] hover:shadow-[0_0_20px_rgba(212,175,55,0.5)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white ${isPractice && (!q || !answers[q.id]) ? 'bg-transparent text-[#A1866B] opacity-50 cursor-not-allowed border border-[rgba(255,255,255,0.1)] shadow-none hover:shadow-none' : 'bg-[#D4AF37] hover:bg-[#F1D17A] text-[#1A140E]'}`}
                disabled={isPractice && (!q || !answers[q.id])}
              >
                {isPractice ? 'ดูผลคะแนน' : 'ส่งข้อสอบ'}
              </button>
            ) : status === 'IN_PROGRESS' && isPractice ? (
              <button type="button" 
                onClick={goNext} 
                disabled={!q || !answers[q.id]}
                className={`flex items-center gap-2 font-bold px-5 py-2.5 rounded-xl transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#D4AF37] ${(!q || !answers[q.id]) ? 'bg-transparent text-[#A1866B] opacity-50 cursor-not-allowed border border-[rgba(255,255,255,0.1)]' : 'bg-[#D4AF37] hover:bg-[#F1D17A] text-[#1A140E] shadow-[0_4px_15px_rgba(212,175,55,0.3)]'}`}
              >
                <span className="hidden sm:inline">ข้อถัดไป</span>
                <ChevronRight size={18} className="sm:hidden" />
              </button>
            ) : (
              <button type="button" 
                onClick={goNext} 
                disabled={currentIndex === questions.length - 1}
                className={`flex items-center gap-2 font-bold px-4 py-2.5 rounded-xl transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#D4AF37] ${currentIndex === questions.length - 1 ? 'text-[#A1866B] opacity-50 cursor-not-allowed' : 'bg-transparent text-[#F5E9D6] hover:bg-[rgba(255,255,255,0.05)]'}`}
              >
                <span className="hidden sm:inline">ถัดไป</span>
                <ChevronRight size={18} />
              </button>
            )}
          </div>
          
        </div>
      </div>

      {/* Desktop Navigation Bar (Redesigned) */}
      <div className="hidden lg:flex fixed bottom-0 left-0 w-full bg-[#0F0B07] border-t border-[rgba(255,255,255,0.05)] pb-safe z-40 flex-col items-center shadow-[0_-10px_40px_rgba(0,0,0,0.5)]">
        <div className="w-full max-w-5xl mx-auto px-8 py-5 flex flex-col gap-5">
          
          {/* Top Row: Prev | Counter | Next */}
          <div className="flex items-center justify-between w-full">
            <button type="button" 
              onClick={goPrev} 
              disabled={currentIndex === 0}
              className={`group flex items-center gap-3 font-medium px-6 py-2.5 rounded-xl border transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#D4AF37] ${currentIndex === 0 ? 'border-transparent text-[#A1866B] opacity-30 cursor-not-allowed' : 'border-[rgba(255,255,255,0.1)] text-[#F5E9D6] hover:bg-[rgba(255,255,255,0.05)] hover:border-[rgba(255,255,255,0.2)]'}`}
            >
              <ChevronLeft size={18} className={currentIndex === 0 ? "" : "text-[#A1866B] group-hover:text-[#F5E9D6] transition-colors"} />
              <span>ก่อนหน้า</span>
            </button>

            <div className="text-center flex items-center gap-3 text-sm font-medium text-[#A1866B]">
              ข้อ <span className="text-xl font-bold text-[#D4AF37]">{currentIndex + 1}</span> / {questions.length}
            </div>

            {status === 'IN_PROGRESS' && currentIndex === questions.length - 1 ? (
              <button type="button"
                onClick={handleRequestSubmit}
                disabled={isPractice && (!q || !answers[q.id])}
                className={`group flex items-center gap-3 font-medium px-6 py-2.5 rounded-xl border transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#D4AF37] ${isPractice && (!q || !answers[q.id]) ? 'border-[rgba(255,255,255,0.1)] text-[#A1866B] opacity-50 cursor-not-allowed' : 'border-[rgba(255,255,255,0.1)] text-[#F5E9D6] hover:bg-[rgba(255,255,255,0.05)] hover:border-[rgba(255,255,255,0.2)]'}`}
              >
                <span>{isPractice ? 'ดูผลคะแนน' : 'ส่งข้อสอบ'}</span>
                <CheckCircle size={18} className={isPractice && (!q || !answers[q.id]) ? "" : "text-[#A1866B] group-hover:text-[#F5E9D6] transition-colors"} />
              </button>
            ) : (
              <button type="button"
                onClick={goNext}
                disabled={isPractice ? (!q || !answers[q.id]) : currentIndex === questions.length - 1}
                className={`group flex items-center gap-3 font-medium px-6 py-2.5 rounded-xl border transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#D4AF37] ${(isPractice ? (!q || !answers[q.id]) : currentIndex === questions.length - 1) ? 'border-transparent text-[#A1866B] opacity-30 cursor-not-allowed' : 'border-[rgba(255,255,255,0.1)] text-[#F5E9D6] hover:bg-[rgba(255,255,255,0.05)] hover:border-[rgba(255,255,255,0.2)]'}`}
              >
                <span>ข้อถัดไป</span>
                <ChevronRight size={18} className={(isPractice ? (!q || !answers[q.id]) : currentIndex === questions.length - 1) ? "" : "text-[#A1866B] group-hover:text-[#F5E9D6] transition-colors"} />
              </button>
            )}
          </div>

          {/* Bottom Row: Indicators (Centered) */}
          <div className="w-full flex justify-center overflow-x-auto custom-scrollbar no-scrollbar pb-2">
            <div className="flex items-center gap-2 px-4">
              {renderIndicators()}
            </div>
          </div>

        </div>
      </div>

    </div>
  )
}
