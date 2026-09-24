'use client'

import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react'
import { createPortal } from 'react-dom'
import Link from 'next/link'
import { ChevronLeft, ChevronRight, Clock, Flag, CheckCircle, XCircle, Lightbulb, BookOpen, AlertCircle, RefreshCw, ChevronDown, ChevronUp, LayoutGrid, X } from 'lucide-react'
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
import { applyAttemptQuestionOrder } from '@/lib/assessment/attempt-order'
import type { BookmarkStateMap } from '@/lib/assessment/saved-questions-data'
import type { QuestionBookmarkState } from '@/lib/assessment/saved-questions-data'
import type { ExamSet } from '@/lib/types'
import type { ResolvedSocialChannel } from '@/lib/socialFollowConfig'
import { completeExam, startExam, submitExam } from '@/lib/analytics'
import QuestionBookmarkButton from '@/components/exams/QuestionBookmarkButton'
import QuestionNavigator from '@/components/exams/QuestionNavigator'
import NewsSocialFollowLink from '@/components/news/NewsSocialFollowLink'
import SampleExamResultUpsellModal from '@/components/exams/SampleExamResultUpsellModal'
import SampleExamResultUpsellCard from '@/components/exams/SampleExamResultUpsellCard'

// Map letter answers to corresponding choice keys
const CHOICE_LETTERS = ['A', 'B', 'C', 'D'] as const
type ChoiceLetter = typeof CHOICE_LETTERS[number]

const CHOICE_LABELS: Record<ChoiceLetter, string> = {
  A: 'ก.',
  B: 'ข.',
  C: 'ค.',
  D: 'ง.',
}

const CHOICE_TEXT_KEYS: Record<ChoiceLetter, keyof Question> = {
  A: 'choice_a',
  B: 'choice_b',
  C: 'choice_c',
  D: 'choice_d',
}

const WRONG_REASON_KEYS: Record<ChoiceLetter, keyof Question> = {
  A: 'why_a_wrong',
  B: 'why_b_wrong',
  C: 'why_c_wrong',
  D: 'why_d_wrong',
}

function getChoiceText(question: Question, letter: ChoiceLetter) {
  return question[CHOICE_TEXT_KEYS[letter]] as string
}

const DIALOG_FOCUSABLE_SELECTOR = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled]):not([type="hidden"])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[contenteditable="true"]',
  '[tabindex]:not([tabindex="-1"])',
].join(', ')

function getDialogFocusableElements(container: HTMLElement) {
  return Array.from(container.querySelectorAll<HTMLElement>(DIALOG_FOCUSABLE_SELECTOR)).filter((element) => {
    if (element.getAttribute('aria-hidden') === 'true') return false
    const styles = window.getComputedStyle(element)
    return styles.display !== 'none' && styles.visibility !== 'hidden' && element.getClientRects().length > 0
  })
}

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
  /** Phase 1F: server-rendered saved-question state (questionId → bookmark). */
  bookmarkState?: BookmarkStateMap
  isPackageOwner?: boolean
  examResultSocialFollow?: {
    heading: string
    description: string
    channels: readonly ResolvedSocialChannel[]
  }
}

export default function ExamRuntime({
  pkg,
  examSet,
  questions: rawQuestions,
  mode,
  bookmarkState = {},
  isPackageOwner = false,
  examResultSocialFollow,
}: ExamRuntimeProps) {
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
  //
  // This is the BASE list, in exam_set_questions.sort_order. The order the
  // runtime actually consumes (`questions` below) may be replaced once, on
  // session hydration, by the attempt-scoped order (repeat shuffle v1 — see
  // lib/assessment/attempt-order.ts). There is deliberately exactly ONE
  // ordered array: display, navigation, autosave position, and submit all
  // read `questions`, never one of two inconsistent lists.
  const baseQuestions = useMemo(() => {
    if (!Array.isArray(rawQuestions)) return []
    return rawQuestions.flatMap((item: any) => {
      if (Array.isArray(item)) return item.filter((q: any) => q && typeof q === 'object' && q.id)
      if (item && typeof item === 'object' && item.id) return [item]
      return []
    }) as Question[]
  }, [rawQuestions])

  // ── Attempt question order (Repeat Exam Question Shuffle V1) ───────────
  // `appliedQuestions` is null until the session snapshot resolves this
  // attempt's ordering contract (question_order_version from the DB row):
  //   version 0 → base sort_order (applied as-is),
  //   version 1 → the frozen deterministic permutation seeded by session id.
  // While `orderState` is 'pending' the exam UI below does not render at all,
  // so an unstable order is never exposed: a resumed repeat attempt whose
  // hydration failed must not fall back to base order (its saved positional
  // current_index would point at a different question). 'Unauthorized' keeps
  // the legacy session-less behavior (base order, in-memory only) — no row
  // exists, so there is no saved position to desynchronize.
  const [appliedQuestions, setAppliedQuestions] = useState<Question[] | null>(null)
  const [orderState, setOrderState] = useState<'pending' | 'resolved' | 'error'>('pending')
  const [hydrateAttempt, setHydrateAttempt] = useState(0)
  const retrySessionHydration = useCallback(() => {
    setOrderState('pending')
    setHydrateAttempt((n) => n + 1)
  }, [])

  // The single ordered list the whole runtime consumes.
  const questions = appliedQuestions ?? baseQuestions

  const [currentIndex, setCurrentIndex] = useState(0)
  const [answers, setAnswers] = useState<Record<string, ChoiceLetter>>({})
  const [flagged, setFlagged] = useState<Record<string, boolean>>({})
  const [status, setStatus] = useState<'IN_PROGRESS' | 'CONFIRM_SUBMIT' | 'REVIEW'>('IN_PROGRESS')
  const [isExplanationExpanded, setIsExplanationExpanded] = useState(false)
  const [isNavigatorOpen, setIsNavigatorOpen] = useState(false)
  const [isHintOpen, setIsHintOpen] = useState(false)
  const [revealedHints, setRevealedHints] = useState<Record<string, boolean>>({})
  const [portalMounted, setPortalMounted] = useState(false)
  const [isUpsellModalOpen, setIsUpsellModalOpen] = useState(false)

  const navigatorDialogRef = useRef<HTMLDivElement>(null)
  const navigatorOverlayRef = useRef<HTMLDivElement>(null)
  const navigatorTriggerRef = useRef<HTMLButtonElement | null>(null)
  const hintButtonRef = useRef<HTMLButtonElement>(null)
  const hasMountedQuestionRef = useRef(false)

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
  // Phase 1F: the persisted DB attempt id, captured once persistOutcome
  // resolves after submit. Used as sourceAttemptId provenance when saving a
  // reviewed question. Null until persistence succeeds (a persisted failure
  // leaves it null — the bookmark still saves, just without provenance).
  const [persistedAttemptId, setPersistedAttemptId] = useState<string | null>(null)

  // Phase 1F: mutable bookmark map owned by ExamRuntime. The server-provided
  // `bookmarkState` prop is a snapshot taken at page render; only the CURRENT
  // question's QuestionBookmarkButton is mounted at a time, and React discards
  // its local state on unmount. To preserve the latest toggle across navigate-
  // away-and-back, ExamRuntime keeps this map, seeds it once from the snapshot,
  // and updates it from the button's success callback. Each button reads its
  // `initial` values from here, so a remount reflects the most recent state.
  const [bookmarkRuntime, setBookmarkRuntime] = useState<Record<string, QuestionBookmarkState>>(() => bookmarkState)

  // Phase 1F: success-only handler the bookmark button calls after the server
  // confirms a save/remove. Updates ONLY this question's entry so the latest
  // state survives the button's unmount when the learner navigates questions.
  const handleBookmarkChange = useCallback(
    (questionId: string, next: { isBookmarked: boolean; bookmarkId: string | null }) => {
      setBookmarkRuntime((prev) => ({
        ...prev,
        [questionId]: {
          questionId,
          isBookmarked: next.isBookmarked,
          bookmarkId: next.bookmarkId,
        },
      }))
    },
    [],
  )
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

  const closeNavigator = useCallback(() => {
    setIsNavigatorOpen(false)
    if (typeof window !== 'undefined') {
      window.requestAnimationFrame(() => navigatorTriggerRef.current?.focus())
    }
  }, [])

  const openNavigator = useCallback((event: React.MouseEvent<HTMLButtonElement>) => {
    navigatorTriggerRef.current = event.currentTarget
    setIsNavigatorOpen(true)
  }, [])

  const moveToQuestion = useCallback((index: number) => {
    if (!Number.isInteger(index) || index < 0 || index >= questions.length) return
    setCurrentIndex(index)
  }, [questions.length])

  const moveRelative = useCallback((delta: -1 | 1, options?: { bypassPracticeGate?: boolean }) => {
    setCurrentIndex((previousIndex) => {
      const nextIndex = previousIndex + delta
      if (nextIndex < 0 || nextIndex >= questions.length) return previousIndex

      if (delta > 0 && status === 'IN_PROGRESS' && isPractice && !options?.bypassPracticeGate) {
        const currentQuestion = questions[previousIndex]
        if (!currentQuestion || !answers[currentQuestion.id]) return previousIndex
      }

      return nextIndex
    })
  }, [answers, isPractice, questions, status])

  const goNext = useCallback(() => moveRelative(1), [moveRelative])
  const goPrev = useCallback(() => moveRelative(-1), [moveRelative])

  const handleSelectQuestionFromNavigator = useCallback((index: number) => {
    moveToQuestion(index)
    closeNavigator()
  }, [closeNavigator, moveToQuestion])

  useEffect(() => {
    setPortalMounted(true)
  }, [])

  // Reset transient feedback/panel state when changing questions, but keep the
  // per-question hint reveal map for this mounted runtime session.
  useEffect(() => {
    setIsExplanationExpanded(false)
    setIsHintOpen(false)

    if (!hasMountedQuestionRef.current) {
      hasMountedQuestionRef.current = true
      return
    }

    if (currentIndex < 0) return

    const frame = window.requestAnimationFrame(() => {
      document.getElementById('exam-question-content')?.scrollIntoView({
        behavior: 'smooth',
        block: 'start',
      })
    })

    return () => window.cancelAnimationFrame(frame)
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
  // API fails, the exam UI shows a retry state instead of starting on a
  // potentially wrong order (V1: order depends on the session row). Re-runs
  // only when the learner taps "ลองอีกครั้ง" (hydrateAttempt).
  useEffect(() => {
    let cancelled = false
    async function hydrate() {
      const examSetId = String(examSet?.id ?? '')
      const packageId = String(pkg?.id ?? '')
      if (!examSetId || !packageId) {
        setSessionReady(true)
        setOrderState('resolved')
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
          // Resolve this attempt's question order FIRST, from the stored
          // contract (0 = base sort_order, 1 = repeat shuffle v1), so that
          // everything restored below — position included — lands against the
          // final ordered list. current_index is positional; it stays correct
          // because the order is deterministic per session id.
          const ordered = applyAttemptQuestionOrder(baseQuestions, {
            sessionId: snap.id,
            questionOrderVersion: snap.questionOrderVersion ?? 0,
          })
          setAppliedQuestions(ordered)
          setOrderState('resolved')
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
          const clamped = clampIndex(snap.currentIndex ?? 0, ordered.length)
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
        } else if (res.error === 'Unauthorized') {
          // Session-less flow (cookie expired between server render and
          // mount, or logged-out preview): keep the legacy behavior — base
          // order, in-memory only. No session row exists, so there is no
          // persisted position that a different order could desynchronize.
          setOrderState('resolved')
        } else {
          // Authenticated but the session could not be resolved. Do NOT start
          // on base order: a version-1 resumed attempt would surface the
          // wrong order and its saved current_index would point at a
          // different question. Show the retry state instead.
          console.warn('Assessment session resume skipped:', res.error)
          setOrderState('error')
        }
      } catch (err) {
        if (!cancelled) {
          console.warn('Assessment session resume failed:', err)
          setOrderState('error')
        }
      } finally {
        if (!cancelled) setSessionReady(true)
      }
    }
    hydrate()
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hydrateAttempt])

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

  // QuestionNavigator is rendered in a body portal so the rest of the page can
  // be made inert without also making the dialog inert. Keep focus inside,
  // lock page scrolling, close on Escape, and restore the opening trigger.
  useEffect(() => {
    if (!isNavigatorOpen || !portalMounted) return

    const overlay = navigatorOverlayRef.current
    const dialog = navigatorDialogRef.current
    if (!overlay || !dialog) return

    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'

    const ownedInertElements = new Map<HTMLElement, string | null>()
    for (const child of Array.from(document.body.children)) {
      if (!(child instanceof HTMLElement)) continue
      if (child === overlay || child.matches('script, style')) continue
      if (child.contains(overlay) || child.hasAttribute('inert')) continue

      ownedInertElements.set(child, child.getAttribute('inert'))
      child.setAttribute('inert', '')
    }

    const focusFirstElement = () => {
      const focusableElements = getDialogFocusableElements(dialog)
      ;(focusableElements[0] || dialog).focus()
    }

    const initialFocusFrame = window.requestAnimationFrame(focusFirstElement)

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        closeNavigator()
        return
      }

      if (event.key !== 'Tab') return

      const focusableElements = getDialogFocusableElements(dialog)
      if (focusableElements.length === 0) {
        event.preventDefault()
        dialog.focus()
        return
      }

      const firstFocusable = focusableElements[0]
      const lastFocusable = focusableElements[focusableElements.length - 1]
      const activeElement = document.activeElement

      if (!dialog.contains(activeElement)) {
        event.preventDefault()
        ;(event.shiftKey ? lastFocusable : firstFocusable).focus()
      } else if (event.shiftKey && activeElement === firstFocusable) {
        event.preventDefault()
        lastFocusable.focus()
      } else if (!event.shiftKey && activeElement === lastFocusable) {
        event.preventDefault()
        firstFocusable.focus()
      }
    }

    const handleFocusIn = (event: FocusEvent) => {
      const target = event.target
      if (target instanceof Node && dialog.contains(target)) return
      focusFirstElement()
    }

    window.addEventListener('keydown', handleKeyDown, true)
    document.addEventListener('focusin', handleFocusIn)

    return () => {
      window.cancelAnimationFrame(initialFocusFrame)
      window.removeEventListener('keydown', handleKeyDown, true)
      document.removeEventListener('focusin', handleFocusIn)
      document.body.style.overflow = previousOverflow

      for (const [element, previousValue] of ownedInertElements) {
        if (!element.isConnected || element.getAttribute('inert') !== '') continue
        if (previousValue === null) {
          element.removeAttribute('inert')
        } else {
          element.setAttribute('inert', previousValue)
        }
      }
    }
  }, [closeNavigator, isNavigatorOpen, portalMounted])

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
      setTimeout(() => moveRelative(1, { bypassPracticeGate: true }), 300)
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
        if (persisted.success && persisted.id) {
          // Phase 1F: surface the persisted attempt id so the bookmark control
          // can record provenance. Kept independent of the session-close block
          // below so a missing/stranded session still yields provenance.
          setPersistedAttemptId(persisted.id)

          // Sample Exam Result Upsell V1:
          // The modal triggers strictly upon successful attempt finalization
          // for non-owner sample exam completions.
          if (examSet.is_sample && !isPackageOwner) {
            setIsUpsellModalOpen(true)
          }
        }
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
      // The navigator owns Escape, Tab, and focus while it is open. Do not let
      // arrows, number shortcuts, or flagging operate behind the dialog.
      if (isNavigatorOpen) return

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
  }, [currentIndex, goNext, goPrev, isNavigatorOpen, q, sessionReady, status])

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
          onClick={() => moveToQuestion(i)}
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
      </div>
    )
  }

  // Practice and review feedback share one cohesive explanation container.
  const renderExplanationFeedback = () => {
    if (!q) return null
    const isAnswered = !!answers[q.id]
    if (status !== 'REVIEW' && (!isPractice || !isAnswered)) return null

    const isCorrect = isAnswered && answers[q.id] === q.correct_answer
    const wrongReasons = CHOICE_LETTERS
      .filter((letter) => letter !== q.correct_answer)
      .map((letter) => ({
        letter,
        text: q[WRONG_REASON_KEYS[letter]] as string | null,
      }))
      .filter((reason): reason is { letter: ChoiceLetter; text: string } => Boolean(reason.text?.trim()))
    const hasReviewHint = status === 'REVIEW' && Boolean(q.hint?.trim())
    const hasLongExplanation = Boolean(q.full_explanation && q.full_explanation.length > 150)

    return (
      <section className="mt-8 rounded-2xl border border-[#D4AF37]/30 bg-[#2A1F0D] p-5 shadow-lg animate-in fade-in slide-in-from-top-4 duration-500" aria-label="คำอธิบายละเอียดและเหตุผล">
        <div className="flex items-start gap-4">
          {isCorrect ? (
            <div className="bg-green-500/20 p-2 rounded-full mt-0.5">
              <CheckCircle className="text-green-500 shrink-0" size={24} />
            </div>
          ) : isAnswered ? (
            <div className="bg-red-500/20 p-2 rounded-full mt-0.5">
              <XCircle className="text-red-500 shrink-0" size={24} />
            </div>
          ) : (
            <div className="bg-[#D4AF37]/10 p-2 rounded-full mt-0.5">
              <AlertCircle className="text-[#D4AF37] shrink-0" size={24} />
            </div>
          )}
          <div className="flex-1">
            <h4 className={`font-bold text-lg mb-1 ${isCorrect ? 'text-green-400' : isAnswered ? 'text-red-400' : 'text-[#D4AF37]'}`}>
              {isCorrect ? 'ตอบถูกต้อง' : isAnswered ? 'ตอบไม่ถูกต้อง' : 'ยังไม่ได้ตอบ'}
            </h4>
            <div className="text-sm font-medium text-[#A1866B] space-y-1">
              {isAnswered && (
                <p>
                  คุณตอบ: <span className="text-[#F5E9D6]">{CHOICE_LABELS[answers[q.id]]} {getChoiceText(q, answers[q.id])}</span>
                </p>
              )}
              <p>
                คำตอบที่ถูกต้อง: <span className="text-green-400">{CHOICE_LABELS[q.correct_answer]} {getChoiceText(q, q.correct_answer)}</span>
              </p>
            </div>

            <div className="mt-4 space-y-4 border-t border-[#D4AF37]/20 pt-4">
              {hasReviewHint && (
                <div>
                  <span className="mb-1 block font-bold text-[#D4AF37]">คำใบ้</span>
                  <p className="text-sm leading-relaxed text-[#A1866B]">{q.hint}</p>
                </div>
              )}

              {q.full_explanation && (
                <div>
                  <span className="mb-2 block font-bold text-[#D4AF37]">คำอธิบายละเอียดและเหตุผล</span>
                  <div
                    className={`whitespace-pre-line text-sm leading-relaxed text-[#F5E9D6] opacity-90 transition-all duration-300 ${hasLongExplanation && !isExplanationExpanded ? 'line-clamp-3' : ''}`}
                  >
                    {q.full_explanation}
                  </div>
                  {hasLongExplanation && (
                    <button
                      type="button"
                      onClick={() => setIsExplanationExpanded((expanded) => !expanded)}
                      className="mt-3 inline-flex items-center gap-1 text-sm font-bold text-[#D4AF37] transition-colors hover:text-[#F1D17A] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#D4AF37]"
                      aria-expanded={isExplanationExpanded}
                    >
                      {isExplanationExpanded ? <ChevronUp size={16} aria-hidden="true" /> : <ChevronDown size={16} aria-hidden="true" />}
                      {isExplanationExpanded ? 'ซ่อนเฉลย' : 'ดูเฉลยทั้งหมด'}
                    </button>
                  )}
                </div>
              )}

              {wrongReasons.length > 0 && (
                <div>
                  <span className="mb-2 block font-bold text-[#D4AF37]">เหตุผลตัวเลือกอื่น</span>
                  <div className="space-y-2 text-sm leading-relaxed text-[#F5E9D6]">
                    {wrongReasons.map(({ letter, text }) => (
                      <p key={letter}>
                        <span className="font-bold text-[#A1866B]">{CHOICE_LABELS[letter]}</span> {text}
                      </p>
                    ))}
                  </div>
                </div>
              )}

              {q.reference && (
                <div className="flex items-start gap-2 rounded-xl border border-blue-500/20 bg-blue-500/10 p-4 text-sm text-blue-200">
                  <BookOpen size={16} className="mt-0.5 flex-shrink-0" aria-hidden="true" />
                  <div>
                    <span className="mb-0.5 block font-bold">อ้างอิง</span>
                    {q.reference}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </section>
    )
  }

  const hasCurrentHint = isPractice && Boolean(q?.hint?.trim())
  const isCurrentHintRevealed = Boolean(q && revealedHints[q.id])

  const handleHintClick = () => {
    if (!hasCurrentHint || !q) return
    setRevealedHints((previous) => ({ ...previous, [q.id]: true }))
    setIsHintOpen(true)
  }

  const closeHint = () => {
    setIsHintOpen(false)
    window.requestAnimationFrame(() => hintButtonRef.current?.focus())
  }

  // ── Attempt-order hydration gate (Repeat Exam Question Shuffle V1) ──────
  // The exam must not start on an order that can still change: a resumed
  // repeat attempt whose ordering depends on its session row would desync the
  // saved positional current_index if it briefly rendered base sort_order.
  // Pending → prepare state; error → retry UX (no new error system — one
  // inline state, one button). All hooks have run by this point.
  if (orderState === 'pending') {
    return (
      <div className="min-h-screen bg-[#0F0B07] flex items-center justify-center p-4">
        <div className="flex flex-col items-center gap-4 text-[#A1866B]">
          <div className="w-10 h-10 rounded-full border-2 border-[rgba(212,175,55,0.25)] border-t-[#D4AF37] animate-spin" />
          <div className="text-sm font-bold">กำลังเตรียมข้อสอบ...</div>
        </div>
      </div>
    )
  }
  if (orderState === 'error') {
    return (
      <div className="min-h-screen bg-[#0F0B07] flex items-center justify-center p-4">
        <div className="bg-[#1A140E] border border-[rgba(212,175,55,0.2)] p-8 rounded-2xl max-w-md w-full text-center">
          <div className="w-16 h-16 bg-[#D4AF37]/10 text-[#D4AF37] rounded-full flex items-center justify-center mx-auto mb-6">
            <AlertCircle size={32} />
          </div>
          <h2 className="text-2xl font-bold font-display text-[#F5E9D6] mb-3">ไม่สามารถเปิดข้อสอบได้</h2>
          <p className="text-[#A1866B] mb-8 text-sm">
            เกิดข้อผิดพลาดในการเชื่อมต่อ ความคืบหน้าของคุณถูกบันทึกไว้แล้ว
            กรุณาลองอีกครั้งเพื่อกลับมาทำข้อสอบต่อในลำดับเดิม
          </p>
          <button type="button" onClick={retrySessionHydration} className="w-full bg-[#D4AF37] hover:bg-[#F1D17A] text-[#1A140E] font-bold py-3 rounded-xl transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white">
            ลองอีกครั้ง
          </button>
          <Link href={`/package/${pkg.slug}`} className="block w-full mt-3 bg-transparent border border-[rgba(255,255,255,0.1)] hover:bg-[rgba(255,255,255,0.05)] text-[#F5E9D6] font-bold py-3 rounded-xl transition-colors text-center">
            กลับหน้าหลัก
          </Link>
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
        {/* Completion-triggered dismissible modal */}
        <SampleExamResultUpsellModal
          isOpen={isUpsellModalOpen}
          onClose={() => setIsUpsellModalOpen(false)}
          packageId={pkg.id}
          packageSlug={pkg.slug}
          packageName={pkg.name}
          examSetId={examSet.id}
          currentPrice={pkg.current_price}
          originalPrice={pkg.original_price}
          score={score}
          total={questions.length}
          accuracy={accuracy}
        />

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
            <button type="button" onClick={() => moveToQuestion(0)} className="flex-1 bg-[#D4AF37] hover:bg-[#F1D17A] text-[#1A140E] font-bold py-4 px-6 rounded-xl transition-all shadow-[0_4px_15px_rgba(212,175,55,0.3)] hover:shadow-[0_4px_25px_rgba(212,175,55,0.4)] flex items-center justify-center gap-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white">
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

          {/* Non-blocking Upsell Card (for finalized non-owner sample exams) */}
          {examSet.is_sample && !isPackageOwner && Boolean(persistedAttemptId) && (
            <SampleExamResultUpsellCard
              packageId={pkg.id}
              packageSlug={pkg.slug}
              packageName={pkg.name}
              examSetId={examSet.id}
              currentPrice={pkg.current_price}
              originalPrice={pkg.original_price}
            />
          )}

          {/* Social Follow Card (Phase 4 — Exam Result CTA) */}
          {examResultSocialFollow && examResultSocialFollow.channels.length > 0 && (
            <div className="bg-[#1A140E] border border-[rgba(212,175,55,0.2)] rounded-2xl p-6">
              <p className="text-xs font-bold text-[#A1866B] uppercase tracking-wider mb-2">
                ติดตาม Sobdai
              </p>
              <h3 className="text-xl font-bold font-display text-[#F5E9D6] mb-2">
                {examResultSocialFollow.heading}
              </h3>
              {examResultSocialFollow.description && (
                <p className="text-sm text-[#A1866B] mb-5 leading-relaxed">
                  {examResultSocialFollow.description}
                </p>
              )}
              <div className="flex flex-col sm:flex-row gap-3">
                {examResultSocialFollow.channels.map((channel, index) => {
                  const isPrimary = index === 0
                  return (
                    <NewsSocialFollowLink
                      key={channel.key}
                      platform={channel.key}
                      placement="exam_result"
                      url={channel.url}
                      buttonLabel={channel.button_label}
                      contentId={examSet.id}
                      className={isPrimary ? 'btn-primary' : 'btn-outline'}
                    />
                  )
                })}
              </div>
            </div>
          )}
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
  const isLastQuestion = currentIndex === questions.length - 1
  const isPracticeNextDisabled = isPractice && (!q || !answers[q.id])
  const isNextDisabled = status === 'IN_PROGRESS' ? (isPractice ? isPracticeNextDisabled : isLastQuestion) : isLastQuestion

  return (
    <div className="exam-focus-runtime min-h-screen font-sans" style={{ backgroundColor: '#0F0B07', color: '#F5E9D6' }}>
      
      {/* Header */}
      <div data-exam-focus-header="true" className="sticky top-0 z-50 bg-[#0F0B07] border-b border-[rgba(212,175,55,0.1)]">
        {/* Progress bar */}
        <div 
          className={`absolute top-0 left-0 h-[2px] transition-all duration-300 z-50 ${status === 'REVIEW' ? 'bg-[#D4AF37]' : 'bg-[#D4AF37]'}`} 
          style={{ width: `${((currentIndex + 1) / questions.length) * 100}%` }} 
        />
        
        <div className="max-w-4xl mx-auto flex h-14 items-center justify-between px-3 sm:px-4 lg:h-16">
          <div className="flex min-w-0 items-center gap-2 sm:gap-4">
            <Link href={status === 'REVIEW' ? '#' : `/package/${pkg.slug}`} aria-label="ออกจากข้อสอบ" onClick={(e) => { if (status === 'IN_PROGRESS' && !confirm('ความคืบหน้าที่บันทึกล่าสุดจะถูกเก็บไว้ คุณต้องการออกจากข้อสอบใช่หรือไม่?')) e.preventDefault(); if (status === 'REVIEW') { e.preventDefault(); setCurrentIndex(-1); } }} className="shrink-0 rounded-lg p-2 text-[#A1866B] transition-colors hover:bg-[rgba(255,255,255,0.05)] hover:text-[#D4AF37]">
              <ChevronLeft size={20} />
            </Link>
            <div className="min-w-0">
              <div className="mb-0.5 max-w-[10rem] truncate text-[10px] font-bold uppercase tracking-wider text-[#A1866B] sm:max-w-[16rem] lg:max-w-none">{status === 'REVIEW' ? 'โหมดทบทวนเฉลย' : examSet.name}</div>
              <button
                type="button"
                onClick={openNavigator}
                aria-expanded={isNavigatorOpen}
                aria-controls="question-navigator-dialog"
                className="flex items-center gap-1.5 rounded-lg border border-[rgba(255,255,255,0.08)] bg-[rgba(255,255,255,0.03)] px-2 py-0.5 text-sm font-bold text-[#F5E9D6] transition-colors hover:text-[#D4AF37] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#D4AF37] lg:hidden"
                aria-label="เปิดตัวนำทางข้อสอบ"
                title="เปิดดูรายการข้อสอบทั้งหมด"
              >
                <span>ข้อ {currentIndex + 1} / {questions.length}</span>
                <ChevronDown size={14} className="text-[#D4AF37]" />
              </button>
            </div>
          </div>
          
          <div className="flex items-center gap-3">
            {status === 'IN_PROGRESS' ? (
              <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border font-mono text-sm font-bold transition-all ${timeRemaining < 300 ? 'border-red-500/30 text-red-400 bg-red-500/10 shadow-[0_0_10px_rgba(239,68,68,0.2)] animate-pulse' : 'border-[rgba(255,255,255,0.05)] bg-[rgba(255,255,255,0.03)] text-[#D4AF37]'}`}>
                <Clock size={14} className={timeRemaining < 300 ? "animate-pulse" : ""} />
                {isPractice ? 'ไม่จำกัดเวลา' : formatTime(timeRemaining)}
              </div>
            ) : (
              <div className="flex items-center gap-1.5 rounded-lg border border-[rgba(255,255,255,0.05)] bg-[rgba(255,255,255,0.03)] px-2 py-1.5 text-sm font-bold text-[#A1866B] sm:px-3">
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

      <div id="exam-question-content" className="exam-question-content max-w-3xl mx-auto px-4 py-8">
        
        {/* Question Area */}
        <div className="mb-8">
          <div className="flex flex-wrap items-start justify-between gap-3 mb-6">
            <div className="flex items-center gap-2">
              <span className="inline-block px-3 py-1 rounded-md bg-[#1A140E] text-[#A1866B] text-xs font-bold border border-[rgba(255,255,255,0.05)]">
                ข้อที่ {currentIndex + 1}
              </span>
              {q.is_common !== undefined && (
                <span className={`inline-block px-3 py-1 rounded-md text-xs font-bold border ${q.is_common ? 'bg-orange-500/10 text-orange-400 border-orange-500/20' : 'bg-blue-500/10 text-blue-400 border-blue-500/20'}`}>
                  {q.is_common ? 'ออกสอบบ่อย' : 'พื้นฐาน'}
                </span>
              )}
            </div>

            {/* Right-aligned per-question actions.
                - Active exam (IN_PROGRESS): the "ปักหมุดไว้ทบทวน" flag — a
                  temporary in-attempt marker. Untouched by this change.
                - Review (REVIEW): the Phase 1F "บันทึกไว้ทบทวน" bookmark — a
                  persistent saved question for later. The two never render at
                  the same time, so they share this slot cleanly. On desktop the
                  bookmark sits inline-right beside the question number; on
                  narrow screens `flex-wrap` + `w-full` drop it to its own
                  right-aligned row so the header never overflows. */}
            {status === 'IN_PROGRESS' ? (
              <button type="button"
                onClick={toggleFlag}
                className={`flex items-center gap-1.5 text-xs font-bold px-3 py-1 rounded-md border transition-colors ${flagged[q.id] ? 'bg-yellow-500/10 border-yellow-500/50 text-yellow-500' : 'bg-transparent border-[rgba(255,255,255,0.1)] text-[#A1866B] hover:text-[#F5E9D6]'}`}
              >
                <Flag size={12} className={flagged[q.id] ? 'fill-yellow-500' : ''} />
                {flagged[q.id] ? 'ปักหมุดแล้ว' : 'ปักหมุดไว้ทบทวน'}
              </button>
            ) : (
              <div className="w-full sm:w-auto sm:ml-auto flex sm:inline-flex justify-end">
                {/* Phase 1F: only the current question's button is mounted at a
                    time, and React discards its local state on unmount — so
                    `key` alone can NOT carry a toggle across navigate-away-and-
                    back. The initial values read from `bookmarkRuntime`
                    (ExamRuntime-owned, seeded from the server snapshot), which
                    ExamRuntime updates via `handleBookmarkChange` on every
                    confirmed save/remove. Thus a remount reflects the latest
                    state, not the stale server map. `key={q.id}` keeps
                    instances per-question so X and Y never share state. No
                    duplicate bookmark logic — reuses QuestionBookmarkButton +
                    the Phase 1F server actions. */}
                <QuestionBookmarkButton
                  key={q.id}
                  questionId={q.id}
                  examSetId={String(examSet?.id ?? '')}
                  packageId={String(pkg?.id ?? '')}
                  initialBookmarked={bookmarkRuntime[q.id]?.isBookmarked ?? false}
                  initialBookmarkId={bookmarkRuntime[q.id]?.bookmarkId ?? null}
                  sourceAttemptId={persistedAttemptId}
                  onBookmarkChange={(next) => handleBookmarkChange(q.id, next)}
                />
              </div>
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
        {renderExplanationFeedback()}

      </div>

      {hasCurrentHint && isHintOpen && isCurrentHintRevealed && q.hint && (
        <aside id="exam-hint-panel" className="exam-hint-panel" role="region" aria-label="คำใบ้">
          <div className="flex items-center justify-between gap-3 border-b border-[rgba(124,159,212,0.2)] pb-2">
            <div className="flex items-center gap-2 font-bold text-[#AFC9F2]">
              <Lightbulb size={17} aria-hidden="true" />
              <span>คำใบ้</span>
            </div>
            <button
              type="button"
              onClick={closeHint}
              aria-label="ปิดคำใบ้"
              className="flex h-8 w-8 items-center justify-center rounded-full text-[#A1866B] transition-colors hover:bg-[rgba(255,255,255,0.06)] hover:text-[#F5E9D6] focus-visible:ring-2 focus-visible:ring-[#D4AF37]"
            >
              <X size={16} aria-hidden="true" />
            </button>
          </div>
          <p className="mt-3 text-sm leading-relaxed text-[#F5E9D6]">{q.hint}</p>
        </aside>
      )}

      {/* Mobile Exam Bottom Bar — four equal, safe-area-aware columns. */}
      <nav className="exam-mobile-bottom-bar lg:hidden" aria-label="การนำทางข้อสอบ">
        <div className="exam-mobile-bottom-bar__grid">
          <button
            type="button"
            onClick={goPrev}
            disabled={currentIndex === 0}
            aria-label="ก่อนหน้า"
            className="exam-mobile-bottom-bar__action"
          >
            <ChevronLeft size={19} aria-hidden="true" />
            <span>ก่อนหน้า</span>
          </button>

          {hasCurrentHint ? (
            <button
              ref={hintButtonRef}
              type="button"
              onClick={handleHintClick}
              aria-expanded={isHintOpen && isCurrentHintRevealed}
              aria-controls="exam-hint-panel"
              aria-label="คำใบ้"
              className={`exam-mobile-bottom-bar__action ${isHintOpen && isCurrentHintRevealed ? 'exam-mobile-bottom-bar__action--active' : ''}`}
            >
              <Lightbulb size={18} aria-hidden="true" />
              <span>คำใบ้</span>
            </button>
          ) : (
            <span className="exam-mobile-bottom-bar__spacer" aria-hidden="true" />
          )}

          <button
            type="button"
            onClick={openNavigator}
            aria-expanded={isNavigatorOpen}
            aria-controls="question-navigator-dialog"
            aria-label={`ข้อ ${currentIndex + 1} / ${questions.length} เปิดตัวนำทางข้อสอบ`}
            className="exam-mobile-bottom-bar__action exam-mobile-bottom-bar__action--counter"
          >
            <LayoutGrid size={18} aria-hidden="true" />
            <span>ข้อ {currentIndex + 1}/{questions.length}</span>
          </button>

          <button
            type="button"
            onClick={status === 'IN_PROGRESS' && isLastQuestion ? handleRequestSubmit : goNext}
            disabled={isNextDisabled}
            aria-label={status === 'IN_PROGRESS' && isLastQuestion ? (isPractice ? 'ดูผลคะแนน' : 'ส่งข้อสอบ') : 'ถัดไป'}
            className="exam-mobile-bottom-bar__action"
          >
            <ChevronRight size={19} aria-hidden="true" />
            <span>{status === 'IN_PROGRESS' && isLastQuestion ? (isPractice ? 'ดูผลคะแนน' : 'ส่งข้อสอบ') : 'ถัดไป'}</span>
          </button>
        </div>
      </nav>

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

            <button
              type="button"
              onClick={openNavigator}
              aria-expanded={isNavigatorOpen}
              aria-controls="question-navigator-dialog"
              className="group flex items-center gap-2.5 px-4 py-1.5 rounded-xl border border-[rgba(255,255,255,0.1)] hover:border-[#D4AF37]/50 bg-[#1A140E]/60 text-sm font-medium text-[#A1866B] hover:text-[#F5E9D6] transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#D4AF37]"
              aria-label="เปิดตัวนำทางข้อสอบ"
              title="เปิดดูรายการข้อสอบทั้งหมด"
            >
              <LayoutGrid size={15} className="text-[#D4AF37]" />
              <span>ข้อ <span className="text-lg font-bold text-[#D4AF37]">{currentIndex + 1}</span> / {questions.length}</span>
              <ChevronDown size={14} className="text-[#A1866B] group-hover:text-[#D4AF37] transition-colors" />
            </button>

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

      {/* Question Navigator Modal Overlay (Bottom Sheet on Mobile, Centered Modal on Desktop) */}
      {portalMounted && isNavigatorOpen && createPortal(
        <div
          ref={navigatorOverlayRef}
          className="fixed inset-0 z-[90] flex items-end justify-center bg-black/80 p-0 backdrop-blur-sm animate-in fade-in duration-200 lg:items-center lg:p-4"
          onClick={closeNavigator}
        >
          <div
            id="question-navigator-dialog"
            ref={navigatorDialogRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby="question-navigator-heading"
            tabIndex={-1}
            className="relative max-h-[85vh] w-full max-w-2xl overflow-hidden rounded-t-3xl border-t border-[rgba(212,175,55,0.3)] bg-[#1A140E] shadow-2xl animate-in slide-in-from-bottom-6 duration-200 lg:rounded-2xl lg:border lg:zoom-in-95"
            onClick={(event) => event.stopPropagation()}
          >
            {/* Visual Drag Handle for Mobile Bottom Sheet */}
            <div className="flex justify-center pb-1 pt-2.5 pointer-events-none lg:hidden">
              <div className="h-1.5 w-12 rounded-full bg-[rgba(255,255,255,0.2)]" aria-hidden="true" />
            </div>

            <QuestionNavigator
              questions={questions}
              answers={answers}
              flagged={flagged}
              currentIndex={currentIndex}
              onSelectQuestion={handleSelectQuestionFromNavigator}
              onClose={closeNavigator}
            />
          </div>
        </div>,
        document.body,
      )}

    </div>
  )
}
