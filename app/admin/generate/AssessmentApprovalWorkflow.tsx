'use client'

import {
  AlertCircle,
  Ban,
  Check,
  CheckCircle2,
  CircleDot,
  ClipboardSignature,
  FileText,
  LockKeyhole,
  MessageSquareText,
  ShieldCheck,
  TriangleAlert,
  XCircle,
} from 'lucide-react'
import { useEffect, useState } from 'react'

import { evaluateApprovalReadiness } from './approval-readiness'

export interface ApprovalBlockingDiagnostic {
  readonly category: string
  readonly severity: string
  readonly module: string
  readonly location: string
  readonly explanation: string
  readonly recommendation: string
}

export interface ApprovalReviewSummary {
  readonly executionId: string
  readonly blueprint: string
  readonly reviewStatus: string
  readonly warningCount: number
  readonly rejectedSlotCount: number
  readonly unresolvedConflictCount: number
  readonly blockingDiagnostics: readonly ApprovalBlockingDiagnostic[]
}

interface AssessmentApprovalWorkflowProps {
  readonly review: ApprovalReviewSummary
  readonly renderApprovedWorkflow?: (
    onPublishLocked: () => void
  ) => React.ReactNode
  readonly onWorkflowLockChange?: (locked: boolean) => void
}

type EditorialDecision = 'approved' | 'rejected'

interface DecisionRecord {
  readonly decision: EditorialDecision
  readonly notes: string
  readonly recordedAtIso: string
}

export default function AssessmentApprovalWorkflow({
  review,
  renderApprovedWorkflow,
  onWorkflowLockChange,
}: AssessmentApprovalWorkflowProps) {
  const [reviewerConfirmed, setReviewerConfirmed] = useState(false)
  const [editorialNotes, setEditorialNotes] = useState('')
  const [decision, setDecision] = useState<DecisionRecord | null>(null)
  const [publishLocked, setPublishLocked] = useState(false)

  const readiness = evaluateApprovalReadiness({
    blockingErrorCount: review.blockingDiagnostics.length,
    reviewerConfirmed,
  })
  const rejectionReady =
    reviewerConfirmed && editorialNotes.trim().length > 0

  useEffect(() => {
    onWorkflowLockChange?.(decision !== null || publishLocked)
  }, [decision, onWorkflowLockChange, publishLocked])

  const recordDecision = (nextDecision: EditorialDecision) => {
    if (nextDecision === 'approved' && !readiness.canApprove) return
    if (nextDecision === 'rejected' && !rejectionReady) return

    setDecision({
      decision: nextDecision,
      notes: editorialNotes.trim(),
      recordedAtIso: new Date().toISOString(),
    })
  }

  const resetDecision = () => {
    if (publishLocked) return
    setDecision(null)
    setReviewerConfirmed(false)
  }

  return (
    <section
      aria-labelledby="approval-workflow-title"
      className="border-t border-[#D4AF37]/20 bg-[#120D09]"
    >
      <div className="p-5 sm:p-6">
        <header className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
          <div>
            <div className="mb-2 flex items-center gap-2 text-xs font-bold uppercase tracking-[0.2em] text-[#D4AF37]">
              <ClipboardSignature size={14} />
              Editorial decision
            </div>
            <h3
              id="approval-workflow-title"
              className="font-display text-2xl font-bold text-[#F5E9D6]"
            >
              Assessment Approval Workflow
            </h3>
            <p className="mt-2 max-w-3xl text-sm leading-relaxed text-[#A1866B]">
              Record an editorial approval or rejection for this reviewed
              generation. Decisions remain in the current workspace only and
              do not publish or persist the assessment.
            </p>
          </div>
          <DecisionStatus decision={decision?.decision ?? 'pending'} />
        </header>

        <div className="mt-6 grid gap-5 xl:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)]">
          <div className="space-y-5">
            <ApprovalReadinessCard
              state={readiness.state}
              explanation={readiness.explanation}
              warningCount={review.warningCount}
            />

            <section className="rounded-xl border border-white/5 bg-[#1A140E] p-4">
              <div className="mb-4 flex items-center gap-2 text-sm font-bold text-[#F5E9D6]">
                <FileText size={16} className="text-[#D4AF37]" />
                Review summary
              </div>
              <dl className="grid gap-4 sm:grid-cols-2">
                <SummaryItem
                  label="Review status"
                  value={review.reviewStatus}
                />
                <SummaryItem
                  label="Blueprint"
                  value={review.blueprint}
                  mono
                />
                <SummaryItem
                  label="Blocking errors"
                  value={review.blockingDiagnostics.length.toLocaleString()}
                  tone={
                    review.blockingDiagnostics.length > 0
                      ? 'critical'
                      : 'positive'
                  }
                />
                <SummaryItem
                  label="Warnings"
                  value={review.warningCount.toLocaleString()}
                  tone={
                    review.warningCount > 0 ? 'attention' : 'positive'
                  }
                />
                <SummaryItem
                  label="Rejected slots"
                  value={review.rejectedSlotCount.toLocaleString()}
                  tone={
                    review.rejectedSlotCount > 0
                      ? 'attention'
                      : 'positive'
                  }
                />
                <SummaryItem
                  label="Unresolved conflicts"
                  value={review.unresolvedConflictCount.toLocaleString()}
                  tone={
                    review.unresolvedConflictCount > 0
                      ? 'attention'
                      : 'positive'
                  }
                />
              </dl>
              <div className="mt-4 border-t border-white/5 pt-3">
                <div className="text-[10px] font-bold uppercase tracking-wide text-[#A1866B]">
                  Execution ID
                </div>
                <div className="mt-1 break-all font-mono text-[11px] text-[#C7B299]">
                  {review.executionId}
                </div>
              </div>
            </section>

            <BlockingDiagnostics
              diagnostics={review.blockingDiagnostics}
            />
          </div>

          <section className="h-fit rounded-xl border border-[#D4AF37]/15 bg-[#1A140E] p-4 sm:p-5">
            {decision ? (
              <RecordedDecision
                decision={decision}
                blueprint={review.blueprint}
                onReset={resetDecision}
                canReset={!publishLocked}
              />
            ) : (
              <div className="space-y-5">
                <div>
                  <div className="flex items-center gap-2 text-sm font-bold text-[#F5E9D6]">
                    <MessageSquareText
                      size={17}
                      className="text-[#D4AF37]"
                    />
                    Reviewer decision
                  </div>
                  <p className="mt-1 text-xs leading-relaxed text-[#A1866B]">
                    Notes are optional for approval and required for rejection.
                  </p>
                </div>

                <label className="block">
                  <span className="mb-2 block text-xs font-bold uppercase tracking-wide text-[#A1866B]">
                    Editorial notes
                  </span>
                  <textarea
                    value={editorialNotes}
                    onChange={(event) =>
                      setEditorialNotes(event.target.value)
                    }
                    rows={6}
                    maxLength={2_000}
                    placeholder="Record assessment quality observations, exceptions, or the reason for rejection."
                    className="w-full resize-y rounded-xl border border-white/10 bg-[#0F0B07] px-3 py-3 text-sm leading-relaxed text-[#F5E9D6] outline-none placeholder:text-[#A1866B]/50 focus:border-[#D4AF37]/50"
                  />
                  <span className="mt-1 block text-right text-[10px] text-[#A1866B]">
                    {editorialNotes.length.toLocaleString()}/2,000
                  </span>
                </label>

                <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-white/10 bg-[#0F0B07] p-4">
                  <input
                    type="checkbox"
                    checked={reviewerConfirmed}
                    onChange={(event) =>
                      setReviewerConfirmed(event.target.checked)
                    }
                    className="mt-0.5 h-4 w-4 shrink-0 accent-[#D4AF37]"
                  />
                  <span>
                    <span className="block text-sm font-bold text-[#F5E9D6]">
                      I confirm that I reviewed this generation.
                    </span>
                    <span className="mt-1 block text-xs leading-relaxed text-[#A1866B]">
                      I inspected Blueprint coverage, allocation quality,
                      diagnostics, recommendations, and Runtime metadata.
                    </span>
                  </span>
                </label>

                {review.blockingDiagnostics.length > 0 && (
                  <div className="flex items-start gap-3 rounded-xl border border-red-500/20 bg-red-500/5 p-4 text-xs leading-relaxed text-red-300">
                    <LockKeyhole size={17} className="mt-0.5 shrink-0" />
                    Approval is disabled because the Engine emitted fatal or
                    blocking errors. Rejection remains available after
                    confirmation and a note.
                  </div>
                )}

                {!reviewerConfirmed && (
                  <p className="text-xs text-[#A1866B]">
                    Confirm the review before recording either editorial
                    decision.
                  </p>
                )}

                {reviewerConfirmed &&
                  editorialNotes.trim().length === 0 && (
                    <p className="text-xs text-[#A1866B]">
                      Add an editorial note to enable rejection.
                    </p>
                  )}

                <div className="grid gap-3 sm:grid-cols-2">
                  <button
                    type="button"
                    disabled={!rejectionReady}
                    onClick={() => recordDecision('rejected')}
                    className="flex items-center justify-center gap-2 rounded-xl border border-red-500/30 bg-red-500/5 px-4 py-3 text-sm font-bold text-red-300 transition-colors hover:bg-red-500/10 disabled:cursor-not-allowed disabled:opacity-35"
                  >
                    <XCircle size={17} />
                    Reject assessment
                  </button>
                  <button
                    type="button"
                    disabled={!readiness.canApprove}
                    onClick={() => recordDecision('approved')}
                    className="flex items-center justify-center gap-2 rounded-xl bg-emerald-500 px-4 py-3 text-sm font-bold text-[#07130D] transition-colors hover:bg-emerald-400 disabled:cursor-not-allowed disabled:bg-emerald-500/30 disabled:text-emerald-200/40"
                  >
                    <CheckCircle2 size={17} />
                    Approve assessment
                  </button>
                </div>

                <div className="flex items-start gap-2 border-t border-white/5 pt-4 text-[11px] leading-relaxed text-[#A1866B]">
                  <Ban size={14} className="mt-0.5 shrink-0" />
                  Approval updates local editorial state. Publishing becomes
                  available below only after approval is recorded.
                </div>
              </div>
            )}
          </section>
        </div>

        {decision?.decision === 'approved' &&
          renderApprovedWorkflow?.(() => setPublishLocked(true))}
      </div>
    </section>
  )
}

function ApprovalReadinessCard({
  state,
  explanation,
  warningCount,
}: {
  readonly state: 'blocked' | 'confirmation_required' | 'ready'
  readonly explanation: string
  readonly warningCount: number
}) {
  const presentation = {
    blocked: {
      icon: AlertCircle,
      label: 'Approval blocked',
      className: 'border-red-500/20 bg-red-500/5 text-red-300',
    },
    confirmation_required: {
      icon: CircleDot,
      label: 'Confirmation required',
      className: 'border-amber-500/20 bg-amber-500/5 text-amber-300',
    },
    ready: {
      icon: ShieldCheck,
      label: 'Ready for approval',
      className:
        'border-emerald-500/20 bg-emerald-500/5 text-emerald-300',
    },
  }[state]
  const Icon = presentation.icon

  return (
    <section className={`rounded-xl border p-4 ${presentation.className}`}>
      <div className="flex items-center gap-2 text-sm font-bold">
        <Icon size={18} />
        {presentation.label}
      </div>
      <p className="mt-2 text-xs leading-relaxed opacity-90">
        {explanation}
      </p>
      {warningCount > 0 && state !== 'blocked' && (
        <div className="mt-3 flex items-start gap-2 border-t border-current/10 pt-3 text-xs">
          <TriangleAlert size={14} className="mt-0.5 shrink-0" />
          {warningCount.toLocaleString()} warning
          {warningCount === 1 ? '' : 's'} remain advisory and do not prevent
          approval.
        </div>
      )}
    </section>
  )
}

function BlockingDiagnostics({
  diagnostics,
}: {
  readonly diagnostics: readonly ApprovalBlockingDiagnostic[]
}) {
  return (
    <section className="rounded-xl border border-white/5 bg-[#1A140E] p-4">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-sm font-bold text-[#F5E9D6]">
          <LockKeyhole size={16} className="text-[#D4AF37]" />
          Blocking diagnostics
        </div>
        <span
          className={`rounded-full border px-2 py-1 text-[10px] font-bold ${
            diagnostics.length > 0
              ? 'border-red-500/20 bg-red-500/10 text-red-300'
              : 'border-emerald-500/20 bg-emerald-500/10 text-emerald-300'
          }`}
        >
          {diagnostics.length}
        </span>
      </div>

      {diagnostics.length === 0 ? (
        <div className="mt-4 flex items-center gap-2 rounded-lg border border-emerald-500/15 bg-emerald-500/5 p-3 text-xs text-emerald-300">
          <Check size={15} />
          No fatal or blocking Engine errors were emitted.
        </div>
      ) : (
        <div className="mt-4 space-y-3">
          {diagnostics.map((diagnostic, index) => (
            <article
              key={`${diagnostic.location}-${index}`}
              className="rounded-lg border border-red-500/15 bg-red-500/5 p-3"
            >
              <div className="flex flex-wrap gap-2 text-[10px] font-bold uppercase text-red-300">
                <span>{diagnostic.category}</span>
                <span>·</span>
                <span>{diagnostic.severity}</span>
                <span>·</span>
                <span>{diagnostic.module}</span>
              </div>
              <p className="mt-2 text-xs leading-relaxed text-[#F5E9D6]">
                {diagnostic.explanation}
              </p>
              <p className="mt-2 text-[11px] leading-relaxed text-[#A1866B]">
                <strong className="text-red-300">Recommended:</strong>{' '}
                {diagnostic.recommendation}
              </p>
              <p className="mt-2 break-all font-mono text-[10px] text-[#A1866B]/70">
                {diagnostic.location}
              </p>
            </article>
          ))}
        </div>
      )}
    </section>
  )
}

function DecisionStatus({
  decision,
}: {
  readonly decision: EditorialDecision | 'pending'
}) {
  const styles = {
    pending: {
      label: 'Decision pending',
      className: 'border-white/10 bg-white/5 text-[#C7B299]',
      icon: CircleDot,
    },
    approved: {
      label: 'Approved',
      className:
        'border-emerald-500/30 bg-emerald-500/10 text-emerald-300',
      icon: CheckCircle2,
    },
    rejected: {
      label: 'Rejected',
      className: 'border-red-500/30 bg-red-500/10 text-red-300',
      icon: XCircle,
    },
  }[decision]
  const Icon = styles.icon

  return (
    <span
      aria-live="polite"
      className={`inline-flex w-fit items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-bold ${styles.className}`}
    >
      <Icon size={14} />
      {styles.label}
    </span>
  )
}

function SummaryItem({
  label,
  value,
  tone = 'neutral',
  mono = false,
}: {
  readonly label: string
  readonly value: string
  readonly tone?: 'neutral' | 'positive' | 'attention' | 'critical'
  readonly mono?: boolean
}) {
  const tones = {
    neutral: 'text-[#F5E9D6]',
    positive: 'text-emerald-300',
    attention: 'text-amber-300',
    critical: 'text-red-300',
  }

  return (
    <div>
      <dt className="text-[10px] font-bold uppercase tracking-wide text-[#A1866B]">
        {label}
      </dt>
      <dd
        className={`mt-1 break-words text-sm font-semibold ${tones[tone]} ${
          mono ? 'font-mono text-xs' : ''
        }`}
      >
        {value}
      </dd>
    </div>
  )
}

function RecordedDecision({
  decision,
  blueprint,
  onReset,
  canReset,
}: {
  readonly decision: DecisionRecord
  readonly blueprint: string
  readonly onReset: () => void
  readonly canReset: boolean
}) {
  const approved = decision.decision === 'approved'

  return (
    <div className="flex min-h-[430px] flex-col items-center justify-center text-center">
      <div
        className={`mb-5 rounded-full border p-5 ${
          approved
            ? 'border-emerald-500/20 bg-emerald-500/10 text-emerald-300'
            : 'border-red-500/20 bg-red-500/10 text-red-300'
        }`}
      >
        {approved ? (
          <CheckCircle2 size={34} />
        ) : (
          <XCircle size={34} />
        )}
      </div>
      <div className="text-xs font-bold uppercase tracking-[0.18em] text-[#A1866B]">
        Editorial state recorded locally
      </div>
      <h4 className="mt-2 font-display text-2xl font-bold capitalize text-[#F5E9D6]">
        Assessment {decision.decision}
      </h4>
      <p className="mt-2 max-w-md font-mono text-xs text-[#A1866B]">
        {blueprint}
      </p>

      {decision.notes.length > 0 && (
        <div className="mt-5 w-full max-w-lg rounded-xl border border-white/5 bg-[#0F0B07] p-4 text-left">
          <div className="text-[10px] font-bold uppercase tracking-wide text-[#A1866B]">
            Editorial notes
          </div>
          <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-[#C7B299]">
            {decision.notes}
          </p>
        </div>
      )}

      <p className="mt-4 text-[11px] text-[#A1866B]">
        {new Date(decision.recordedAtIso).toLocaleString()} · not persisted
      </p>

      {canReset ? (
        <button
          type="button"
          onClick={onReset}
          className="mt-6 rounded-xl border border-white/10 px-4 py-2.5 text-xs font-bold text-[#C7B299] transition-colors hover:border-[#D4AF37]/30 hover:text-[#D4AF37]"
        >
          Reopen editorial decision
        </button>
      ) : (
        <div className="mt-6 flex items-center gap-2 rounded-xl border border-white/5 bg-[#0F0B07] px-4 py-2.5 text-xs text-[#A1866B]">
          <LockKeyhole size={14} />
          Decision locked after publishing began
        </div>
      )}

      <div className="mt-5 flex items-center gap-2 text-xs text-[#A1866B]">
        <Ban size={14} />
        No publishing action was performed.
      </div>
    </div>
  )
}
