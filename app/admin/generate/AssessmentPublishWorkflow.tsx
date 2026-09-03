'use client'

import Link from 'next/link'
import {
  AlertCircle,
  ArrowRight,
  CheckCircle2,
  ExternalLink,
  FileOutput,
  Layers3,
  Loader2,
  LockKeyhole,
  PackageCheck,
  Send,
  ShieldCheck,
  TriangleAlert,
} from 'lucide-react'
import { useMemo, useRef, useState, useTransition } from 'react'

import { adaptReviewResultForPublish } from './publish-adapter'
import { publishApprovedAssessmentAction } from './publish-actions'
import type { PublishedExamSet } from './publish-contracts'
import type { AssessmentReviewResult } from './review-result'

export interface PublishPackageOption {
  readonly id: string
  readonly name: string
}

interface AssessmentPublishWorkflowProps {
  readonly approvedResult: AssessmentReviewResult
  readonly packages: readonly PublishPackageOption[]
  readonly hasPublishPermission: boolean
  readonly onPublishLocked: () => void
}

type PublishResponse = Awaited<
  ReturnType<typeof publishApprovedAssessmentAction>
>

export default function AssessmentPublishWorkflow({
  approvedResult,
  packages,
  hasPublishPermission,
  onPublishLocked,
}: AssessmentPublishWorkflowProps) {
  const publishable = useMemo(
    () => adaptReviewResultForPublish(approvedResult),
    [approvedResult]
  )
  const [packageId, setPackageId] = useState(packages[0]?.id ?? '')
  const [baseName, setBaseName] = useState(
    `Simulation Assessment ${approvedResult.execution.blueprintVersion}`
  )
  const [description, setDescription] = useState(
    `Generated from approved assessment ${publishable.blueprint}.`
  )
  const [durationMinutes, setDurationMinutes] = useState(120)
  const [isSample, setIsSample] = useState(false)
  const [sortOrder, setSortOrder] = useState(0)
  const [displayOrder, setDisplayOrder] = useState(0)
  const [publishConfirmed, setPublishConfirmed] = useState(false)
  const [response, setResponse] = useState<PublishResponse | null>(null)
  const [publishOutcomeUnknown, setPublishOutcomeUnknown] = useState(false)
  const [isPending, startTransition] = useTransition()
  const attemptInFlight = useRef(false)

  const emptySets = publishable.sets.filter(
    (set) => set.questionCodes.length === 0
  )
  const partialSets = publishable.sets.filter(
    (set) =>
      set.questionCodes.length > 0 &&
      set.questionCodes.length < set.expectedQuestionCount
  )
  const isLocked =
    publishOutcomeUnknown ||
    response?.success === true ||
    (response?.success === false && response.examSets.length > 0)
  const readinessIssues = [
    ...(!hasPublishPermission
      ? ['Your role does not have the content.publish permission.']
      : []),
    ...(packages.length === 0
      ? ['No destination Packages are available.']
      : []),
    ...(packageId.length === 0
      ? ['Select a destination Package.']
      : []),
    ...(baseName.trim().length === 0
      ? ['Enter an Exam Set base name.']
      : []),
    ...(!Number.isInteger(durationMinutes) || durationMinutes < 1
      ? ['Duration must be a positive whole number.']
      : []),
    ...(publishable.sets.length === 0
      ? ['The approved result has no Solver allocation.']
      : []),
    ...emptySets.map(
      (set) => `Set ${set.setNumber} contains no allocated questions.`
    ),
    ...partialSets.map(
      (set) =>
        `Set ${set.setNumber} contains ${set.questionCodes.length} of ${set.expectedQuestionCount} required Questions. Partial allocations cannot be published.`
    ),
    ...(!publishConfirmed
      ? ['Publish confirmation is required.']
      : []),
  ]
  const canPublish =
    readinessIssues.length === 0 && !isPending && !isLocked

  const publish = () => {
    if (!canPublish || attemptInFlight.current) return
    attemptInFlight.current = true
    setResponse(null)
    setPublishOutcomeUnknown(false)
    onPublishLocked()

    startTransition(async () => {
      try {
        const nextResponse = await publishApprovedAssessmentAction({
          approval: {
            decision: 'approved',
            executionId: publishable.executionId,
          },
          blueprint: {
            id: approvedResult.execution.blueprintId,
            version: approvedResult.execution.blueprintVersion,
          },
          packageId,
          baseName,
          description,
          durationMinutes,
          isSample,
          sortOrder,
          displayOrder,
          sets: publishable.sets,
        })

        setResponse(nextResponse)
        if (!nextResponse.success && nextResponse.examSets.length === 0) {
          attemptInFlight.current = false
        }
      } catch {
        setPublishOutcomeUnknown(true)
        setResponse({
          success: false,
          error:
            'Publishing was interrupted before completion. Verify the Exam Set list before retrying.',
          examSets: [],
        })
      }
    })
  }

  return (
    <section
      aria-labelledby="publish-workflow-title"
      className="mt-5 overflow-hidden rounded-xl border border-[#D4AF37]/20 bg-[#1A140E]"
    >
      <header className="border-b border-white/5 bg-gradient-to-r from-[#21180F] to-[#17110C] p-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <div className="mb-2 flex items-center gap-2 text-xs font-bold uppercase tracking-[0.2em] text-[#D4AF37]">
              <FileOutput size={14} />
              Approved result transition
            </div>
            <h4
              id="publish-workflow-title"
              className="font-display text-2xl font-bold text-[#F5E9D6]"
            >
              Assessment Publish Workflow
            </h4>
            <p className="mt-2 max-w-3xl text-sm leading-relaxed text-[#A1866B]">
              Convert the approved allocation into the existing Exam Set
              domain. Each numbered assessment set becomes one published
              simulation Exam Set.
            </p>
          </div>
          <span className="inline-flex w-fit items-center gap-2 rounded-full border border-emerald-500/20 bg-emerald-500/5 px-3 py-1.5 text-xs font-bold text-emerald-300">
            <ShieldCheck size={14} />
            Approved in this workspace
          </span>
        </div>
      </header>

      {response?.success ? (
        <PublishSuccess examSets={response.examSets} />
      ) : isLocked && response && !response.success ? (
        <PublishPartialFailure
          response={response}
          outcomeUnknown={publishOutcomeUnknown}
        />
      ) : (
        <div className="grid gap-5 p-5 xl:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)]">
          <div className="space-y-5">
            <section className="rounded-xl border border-white/5 bg-[#0F0B07] p-4">
              <div className="mb-4 flex items-center gap-2 text-sm font-bold text-[#F5E9D6]">
                <Layers3 size={16} className="text-[#D4AF37]" />
                Publish transformation
              </div>
              <div className="space-y-3">
                {publishable.sets.map((set) => {
                  const complete =
                    set.questionCodes.length === set.expectedQuestionCount
                  return (
                    <div
                      key={set.setNumber}
                      className="flex items-center justify-between gap-3 rounded-lg border border-white/5 bg-[#15100B] px-3 py-2.5"
                    >
                      <div>
                        <div className="text-sm font-bold text-[#F5E9D6]">
                          Assessment Set {set.setNumber}
                        </div>
                        <div className="text-[10px] text-[#A1866B]">
                          Existing Exam Set · simulation
                        </div>
                      </div>
                      <span
                        className={`text-xs font-bold ${
                          complete ? 'text-emerald-300' : 'text-amber-300'
                        }`}
                      >
                        {set.questionCodes.length}/
                        {set.expectedQuestionCount} questions
                      </span>
                    </div>
                  )
                })}
              </div>
              {partialSets.length > 0 && (
                <div className="mt-4 flex items-start gap-2 rounded-lg border border-red-500/15 bg-red-500/5 p-3 text-xs leading-relaxed text-red-300">
                  <TriangleAlert size={15} className="mt-0.5 shrink-0" />
                  {partialSets.length} approved set
                  {partialSets.length === 1 ? ' is' : 's are'} below the full
                  required Question count. Partial allocations cannot be
                  published — regenerate the assessment so every Set satisfies
                  the complete target.
                </div>
              )}
            </section>

            <section className="rounded-xl border border-white/5 bg-[#0F0B07] p-4">
              <div className="text-[10px] font-bold uppercase tracking-wide text-[#A1866B]">
                Source review
              </div>
              <div className="mt-1 font-mono text-xs text-[#D4AF37]">
                {publishable.blueprint}
              </div>
              <div className="mt-3 break-all font-mono text-[10px] text-[#A1866B]">
                {publishable.executionId}
              </div>
            </section>
          </div>

          <section className="rounded-xl border border-white/5 bg-[#0F0B07] p-4 sm:p-5">
            <div className="mb-5">
              <div className="flex items-center gap-2 text-sm font-bold text-[#F5E9D6]">
                <PackageCheck size={17} className="text-[#D4AF37]" />
                Exam Set destination
              </div>
              <p className="mt-1 text-xs text-[#A1866B]">
                Product fields use the existing Exam Set creation contract.
              </p>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <label className="sm:col-span-2">
                <span className="mb-1.5 block text-xs font-bold uppercase tracking-wide text-[#A1866B]">
                  Destination Package
                </span>
                <select
                  value={packageId}
                  onChange={(event) => setPackageId(event.target.value)}
                  disabled={isPending}
                  className={inputClass}
                >
                  {packages.length === 0 && (
                    <option value="">No Packages available</option>
                  )}
                  {packages.map((option) => (
                    <option key={option.id} value={option.id}>
                      {option.name}
                    </option>
                  ))}
                </select>
              </label>

              <label className="sm:col-span-2">
                <span className="mb-1.5 block text-xs font-bold uppercase tracking-wide text-[#A1866B]">
                  Exam Set base name
                </span>
                <input
                  value={baseName}
                  onChange={(event) => setBaseName(event.target.value)}
                  disabled={isPending}
                  maxLength={200}
                  className={inputClass}
                />
                <span className="mt-1 block text-[10px] text-[#A1866B]">
                  “· Set 1”, “· Set 2”, and so on are appended automatically.
                </span>
              </label>

              <label className="sm:col-span-2">
                <span className="mb-1.5 block text-xs font-bold uppercase tracking-wide text-[#A1866B]">
                  Description
                </span>
                <textarea
                  value={description}
                  onChange={(event) => setDescription(event.target.value)}
                  disabled={isPending}
                  rows={3}
                  maxLength={2_000}
                  className={`${inputClass} resize-y`}
                />
              </label>

              <label>
                <span className="mb-1.5 block text-xs font-bold uppercase tracking-wide text-[#A1866B]">
                  Duration per set
                </span>
                <input
                  type="number"
                  min={1}
                  step={1}
                  value={durationMinutes}
                  onChange={(event) =>
                    setDurationMinutes(Number(event.target.value))
                  }
                  disabled={isPending}
                  className={inputClass}
                />
              </label>

              <label>
                <span className="mb-1.5 block text-xs font-bold uppercase tracking-wide text-[#A1866B]">
                  Availability
                </span>
                <select
                  value={isSample ? 'sample' : 'full'}
                  onChange={(event) =>
                    setIsSample(event.target.value === 'sample')
                  }
                  disabled={isPending}
                  className={inputClass}
                >
                  <option value="full">Full Exam Set</option>
                  <option value="sample">Sample Exam Set</option>
                </select>
              </label>

              <label>
                <span className="mb-1.5 block text-xs font-bold uppercase tracking-wide text-[#A1866B]">
                  Starting sort order
                </span>
                <input
                  type="number"
                  step={1}
                  value={sortOrder}
                  onChange={(event) =>
                    setSortOrder(Number(event.target.value))
                  }
                  disabled={isPending}
                  className={inputClass}
                />
              </label>

              <label>
                <span className="mb-1.5 block text-xs font-bold uppercase tracking-wide text-[#A1866B]">
                  Starting display order
                </span>
                <input
                  type="number"
                  step={1}
                  value={displayOrder}
                  onChange={(event) =>
                    setDisplayOrder(Number(event.target.value))
                  }
                  disabled={isPending}
                  className={inputClass}
                />
              </label>
            </div>

            <label className="mt-5 flex cursor-pointer items-start gap-3 rounded-xl border border-[#D4AF37]/20 bg-[#D4AF37]/[0.04] p-4">
              <input
                type="checkbox"
                checked={publishConfirmed}
                onChange={(event) =>
                  setPublishConfirmed(event.target.checked)
                }
                disabled={isPending}
                className="mt-0.5 h-4 w-4 shrink-0 accent-[#D4AF37]"
              />
              <span>
                <span className="block text-sm font-bold text-[#F5E9D6]">
                  I confirm this approved result is ready to publish.
                </span>
                <span className="mt-1 block text-xs leading-relaxed text-[#A1866B]">
                  This creates {publishable.sets.length} Exam Set
                  {publishable.sets.length === 1 ? '' : 's'}, links existing
                  Questions, and transitions each Exam Set to Published.
                </span>
              </span>
            </label>

            {response && !response.success && (
              <div className="mt-4 flex items-start gap-3 rounded-xl border border-red-500/20 bg-red-500/5 p-4 text-sm text-red-300">
                <AlertCircle size={17} className="mt-0.5 shrink-0" />
                {response.error}
              </div>
            )}

            {readinessIssues.length > 0 && (
              <div className="mt-4 rounded-xl border border-white/5 bg-[#15100B] p-3">
                <div className="text-[10px] font-bold uppercase tracking-wide text-[#A1866B]">
                  Publish readiness
                </div>
                <ul className="mt-2 space-y-1.5 text-xs text-[#C7B299]">
                  {readinessIssues.map((issue) => (
                    <li key={issue} className="flex gap-2">
                      <span className="text-[#D4AF37]">•</span>
                      {issue}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <button
              type="button"
              disabled={!canPublish}
              onClick={publish}
              className="mt-5 flex w-full items-center justify-center gap-2 rounded-xl bg-[#D4AF37] px-4 py-3 font-bold text-[#1A140E] transition-colors hover:bg-[#F1D17A] disabled:cursor-not-allowed disabled:opacity-40"
            >
              {isPending ? (
                <>
                  <Loader2 size={18} className="animate-spin" />
                  Publishing Exam Sets…
                </>
              ) : (
                <>
                  <Send size={18} />
                  Publish approved assessment
                </>
              )}
            </button>

            <div className="mt-4 flex items-start gap-2 text-[11px] leading-relaxed text-[#A1866B]">
              <LockKeyhole size={14} className="mt-0.5 shrink-0" />
              Once database writes begin, this workspace locks further publish
              attempts to prevent duplicates in the current session.
            </div>
          </section>
        </div>
      )}
    </section>
  )
}

const inputClass =
  'w-full rounded-xl border border-white/10 bg-[#15100B] px-3 py-2.5 text-sm text-[#F5E9D6] outline-none transition-colors focus:border-[#D4AF37]/50 disabled:cursor-not-allowed disabled:opacity-50'

function PublishSuccess({
  examSets,
}: {
  readonly examSets: readonly PublishedExamSet[]
}) {
  return (
    <div className="p-5 sm:p-6">
      <div className="flex flex-col items-center py-6 text-center">
        <div className="mb-5 rounded-full border border-emerald-500/20 bg-emerald-500/10 p-5 text-emerald-300">
          <CheckCircle2 size={34} />
        </div>
        <h5 className="font-display text-2xl font-bold text-[#F5E9D6]">
          Assessment published
        </h5>
        <p className="mt-2 max-w-xl text-sm leading-relaxed text-[#A1866B]">
          {examSets.length} existing Exam Set record
          {examSets.length === 1 ? ' was' : 's were'} created, linked to the
          approved Questions, and transitioned to Published.
        </p>
      </div>

      <div className="mx-auto max-w-3xl space-y-2">
        {examSets.map((examSet) => (
          <div
            key={examSet.id}
            className="flex flex-col gap-3 rounded-xl border border-emerald-500/15 bg-emerald-500/5 p-3 sm:flex-row sm:items-center sm:justify-between"
          >
            <div>
              <div className="text-sm font-bold text-[#F5E9D6]">
                {examSet.name}
              </div>
              <div className="mt-1 text-xs text-[#A1866B]">
                {examSet.questionCount} questions · {examSet.status}
              </div>
            </div>
            <Link
              href={`/admin/exam-sets/${examSet.id}/edit`}
              className="inline-flex items-center gap-1.5 text-xs font-bold text-emerald-300 hover:text-emerald-200"
            >
              Open Exam Set
              <ExternalLink size={13} />
            </Link>
          </div>
        ))}
      </div>

      <div className="mx-auto mt-5 flex max-w-3xl items-center justify-center gap-2 rounded-xl border border-white/5 bg-[#0F0B07] p-3 text-xs text-[#A1866B]">
        <LockKeyhole size={14} />
        Duplicate publishing is locked for this workspace session.
      </div>
    </div>
  )
}

function PublishPartialFailure({
  response,
  outcomeUnknown,
}: {
  readonly response: Extract<PublishResponse, { readonly success: false }>
  readonly outcomeUnknown: boolean
}) {
  return (
    <div className="p-5 sm:p-6">
      <div className="flex flex-col items-center py-6 text-center">
        <div className="mb-5 rounded-full border border-red-500/20 bg-red-500/10 p-5 text-red-300">
          <AlertCircle size={34} />
        </div>
        <h5 className="font-display text-2xl font-bold text-[#F5E9D6]">
          Publish did not complete
        </h5>
        <p className="mt-2 max-w-xl text-sm leading-relaxed text-red-300">
          {response.error}
        </p>
        <p className="mt-3 max-w-xl text-xs leading-relaxed text-[#A1866B]">
          {outcomeUnknown
            ? 'The final server outcome could not be confirmed, so another attempt is blocked to avoid duplicates. Verify the Exam Set list before taking further action.'
            : 'Database writes had already begun, so another attempt is blocked in this session. Inspect the created Exam Sets before taking further action.'}
        </p>
      </div>

      <div className="mx-auto max-w-3xl space-y-2">
        {response.examSets.map((examSet) => (
          <Link
            key={examSet.id}
            href={`/admin/exam-sets/${examSet.id}/edit`}
            className="flex items-center justify-between gap-3 rounded-xl border border-white/10 bg-[#0F0B07] p-3 text-sm text-[#F5E9D6] hover:border-[#D4AF37]/30"
          >
            <span>
              {examSet.name}
              <span className="ml-2 text-xs text-[#A1866B]">
                {examSet.status}
              </span>
            </span>
            <ArrowRight size={15} className="text-[#D4AF37]" />
          </Link>
        ))}
      </div>
    </div>
  )
}
