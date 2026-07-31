'use client'

import {
  AlertCircle,
  BarChart3,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  CircleGauge,
  ClipboardCheck,
  Clock3,
  FileSearch,
  Fingerprint,
  Layers3,
  ListChecks,
  Search,
  ShieldAlert,
  Target,
  TriangleAlert,
} from 'lucide-react'
import { useMemo, useState } from 'react'

import AssessmentApprovalWorkflow from './AssessmentApprovalWorkflow'
import AssessmentPublishWorkflow, {
  type PublishPackageOption,
} from './AssessmentPublishWorkflow'
import type { AssessmentReviewResult } from './review-result'

interface AssessmentReviewWorkspaceProps {
  readonly result: AssessmentReviewResult
  readonly packages: readonly PublishPackageOption[]
  readonly canPublish: boolean
  readonly onWorkflowLockChange: (locked: boolean) => void
}

type ReviewSection =
  | 'overview'
  | 'coverage'
  | 'allocation'
  | 'diagnostics'
  | 'runtime'

const PAGE_SIZE = 25

const statusStyles: Record<string, string> = {
  Completed: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300',
  'Completed With Warnings':
    'border-amber-500/30 bg-amber-500/10 text-amber-300',
  Failed: 'border-red-500/30 bg-red-500/10 text-red-300',
  Cancelled: 'border-slate-500/30 bg-slate-500/10 text-slate-300',
  Invalid: 'border-red-500/30 bg-red-500/10 text-red-300',
}

const sectionOptions: ReadonlyArray<{
  readonly id: ReviewSection
  readonly label: string
  readonly icon: typeof ClipboardCheck
}> = [
  { id: 'overview', label: 'Quality overview', icon: ClipboardCheck },
  { id: 'coverage', label: 'Coverage', icon: Target },
  { id: 'allocation', label: 'Allocation', icon: ListChecks },
  { id: 'diagnostics', label: 'Diagnostics', icon: ShieldAlert },
  { id: 'runtime', label: 'Runtime', icon: CircleGauge },
]

export default function AssessmentReviewWorkspace({
  result,
  packages,
  canPublish,
  onWorkflowLockChange,
}: AssessmentReviewWorkspaceProps) {
  const [activeSection, setActiveSection] =
    useState<ReviewSection>('overview')

  const candidateStatistics = result.candidateSet?.statistics
  const allocation = result.allocatedCandidateSet
  const coverageBindings =
    result.candidateSet?.coverageSatisfaction.bindings ?? []
  const satisfiedCoverage = coverageBindings.filter(
    (binding) => binding.satisfyingCodes.length > 0
  ).length
  const allocationTotal = allocation?.placements.length ?? 0
  const allocatedCount =
    allocation?.shortfallSummary.allocatedSlotCount ?? 0
  const allocationRate =
    allocationTotal === 0 ? 0 : (allocatedCount / allocationTotal) * 100
  const confidenceRate =
    !candidateStatistics || candidateStatistics.totalCandidates === 0
      ? 0
      : (candidateStatistics.fullConfidenceCount /
          candidateStatistics.totalCandidates) *
        100
  const reviewSignal = getReviewSignal(result)
  const blockingDiagnostics = result.errors.filter(
    (diagnostic) =>
      diagnostic.severity === 'fatal' ||
      diagnostic.severity === 'blocking'
  )

  return (
    <section
      aria-labelledby="review-workspace-title"
      className="overflow-hidden rounded-2xl border border-[#D4AF37]/20 bg-[#1A140E] shadow-2xl"
    >
      <header className="border-b border-white/5 bg-gradient-to-r from-[#241A10] via-[#1A140E] to-[#17110C] p-5 sm:p-6">
        <div className="flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
          <div>
            <div className="mb-2 flex items-center gap-2 text-xs font-bold uppercase tracking-[0.2em] text-[#D4AF37]">
              <FileSearch size={14} />
              Read-only product review
            </div>
            <h2
              id="review-workspace-title"
              className="font-display text-2xl font-bold text-[#F5E9D6] sm:text-3xl"
            >
              Assessment Review Workspace
            </h2>
            <p className="mt-2 max-w-3xl text-sm leading-relaxed text-[#A1866B]">
              Inspect the generated Engine response before recording an
              editorial decision. Review remains read-only and cannot edit,
              save, or publish the assessment.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <span
              className={`rounded-full border px-3 py-1.5 text-xs font-bold ${
                statusStyles[result.status] ??
                'border-white/10 bg-white/5 text-[#F5E9D6]'
              }`}
            >
              {result.status}
            </span>
            <span
              className={`rounded-full border px-3 py-1.5 text-xs font-bold ${reviewSignal.className}`}
            >
              {reviewSignal.label}
            </span>
          </div>
        </div>

        <div className="mt-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
          <QualityMetric
            label="Candidate confidence"
            value={`${confidenceRate.toFixed(1)}%`}
            detail={`${candidateStatistics?.fullConfidenceCount ?? 0} full-confidence candidates`}
            tone={confidenceRate >= 90 ? 'positive' : 'attention'}
          />
          <QualityMetric
            label="Coverage bindings"
            value={`${satisfiedCoverage}/${coverageBindings.length}`}
            detail="mandatory bindings with candidates"
            tone={
              satisfiedCoverage === coverageBindings.length
                ? 'positive'
                : 'attention'
            }
          />
          <QualityMetric
            label="Allocation quality"
            value={`${allocationRate.toFixed(1)}%`}
            detail={`${allocatedCount}/${allocationTotal} slots allocated`}
            tone={allocationRate === 100 ? 'positive' : 'attention'}
          />
          <QualityMetric
            label="Engine diagnostics"
            value={result.errors.length + result.warnings.length}
            detail={`${result.errors.length} errors · ${result.warnings.length} warnings`}
            tone={result.errors.length > 0 ? 'critical' : result.warnings.length > 0 ? 'attention' : 'positive'}
          />
        </div>
      </header>

      <div className="border-b border-white/5 px-3 py-3 sm:px-5">
        <nav
          aria-label="Review workspace sections"
          className="flex gap-2 overflow-x-auto pb-1"
        >
          {sectionOptions.map((section) => {
            const Icon = section.icon
            const active = section.id === activeSection
            return (
              <button
                key={section.id}
                type="button"
                aria-pressed={active}
                onClick={() => setActiveSection(section.id)}
                className={`flex shrink-0 items-center gap-2 rounded-xl border px-3 py-2 text-xs font-bold transition-colors sm:text-sm ${
                  active
                    ? 'border-[#D4AF37]/40 bg-[#D4AF37]/10 text-[#D4AF37]'
                    : 'border-transparent text-[#A1866B] hover:border-white/10 hover:bg-white/[0.03] hover:text-[#F5E9D6]'
                }`}
              >
                <Icon size={15} />
                {section.label}
              </button>
            )
          })}
        </nav>
      </div>

      <div className="p-5 sm:p-6">
        {activeSection === 'overview' && (
          <OverviewSection result={result} />
        )}
        {activeSection === 'coverage' && (
          <CoverageSection result={result} />
        )}
        {activeSection === 'allocation' && (
          <AllocationSection result={result} />
        )}
        {activeSection === 'diagnostics' && (
          <DiagnosticsSection result={result} />
        )}
        {activeSection === 'runtime' && (
          <RuntimeSection result={result} />
        )}
      </div>

      <AssessmentApprovalWorkflow
        review={{
          executionId: result.execution.executionId,
          blueprint: `${result.execution.blueprintId}@${result.execution.blueprintVersion}`,
          reviewStatus: reviewSignal.label,
          warningCount: result.warnings.length,
          rejectedSlotCount:
            allocation?.shortfallSummary.rejectedSlotCount ?? 0,
          unresolvedConflictCount:
            allocation?.shortfallSummary.unresolvedConflictCount ?? 0,
          blockingDiagnostics,
        }}
        renderApprovedWorkflow={(onPublishLocked) => (
          <AssessmentPublishWorkflow
            approvedResult={result}
            packages={packages}
            hasPublishPermission={canPublish}
            onPublishLocked={onPublishLocked}
          />
        )}
        onWorkflowLockChange={onWorkflowLockChange}
      />
    </section>
  )
}

function OverviewSection({
  result,
}: {
  readonly result: AssessmentReviewResult
}) {
  const request = result.assemblyRequest
  const stats = result.candidateSet?.statistics
  const allocation = result.allocatedCandidateSet

  return (
    <div className="space-y-6">
      <SectionHeading
        eyebrow="Decision context"
        title="Overall assessment quality"
        description="Start with Blueprint intent, candidate health, and the final allocation verdict."
      />

      <div className="grid gap-4 lg:grid-cols-[1.15fr_0.85fr]">
        <ReviewPanel title="Blueprint information" icon={Fingerprint}>
          <div className="grid gap-4 sm:grid-cols-2">
            <MetadataItem
              label="Blueprint"
              value={`${result.execution.blueprintId}@${result.execution.blueprintVersion}`}
              mono
            />
            <MetadataItem
              label="Profile"
              value={request?.identity.profile ?? 'Not emitted'}
            />
            <MetadataItem
              label="Run target"
              value={
                request
                  ? `${request.target.sets} sets × ${request.target.perSet} questions`
                  : 'Not emitted'
              }
            />
            <MetadataItem
              label="Expected questions"
              value={
                request
                  ? (
                      request.target.sets * request.target.perSet
                    ).toLocaleString()
                  : '—'
              }
            />
            <MetadataItem
              label="Registered documents"
              value={request?.documentRegistry.length.toLocaleString() ?? '—'}
            />
            <MetadataItem
              label="Coverage rules"
              value={request?.coverageRules.length.toLocaleString() ?? '—'}
            />
          </div>
        </ReviewPanel>

        <ReviewPanel title="Allocation verdict" icon={ClipboardCheck}>
          {allocation ? (
            <div className="space-y-4">
              <div className="flex items-end justify-between gap-4">
                <div>
                  <div className="text-xs uppercase tracking-wide text-[#A1866B]">
                    Feasibility
                  </div>
                  <div className="mt-1 text-xl font-bold capitalize text-[#F5E9D6]">
                    {allocation.feasibility.replaceAll('_', ' ')}
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-3xl font-bold text-[#D4AF37]">
                    {allocation.shortfallSummary.allocatedSlotCount}
                  </div>
                  <div className="text-xs text-[#A1866B]">
                    allocated slots
                  </div>
                </div>
              </div>
              <ProgressBar
                value={allocation.shortfallSummary.allocatedSlotCount}
                maximum={allocation.placements.length}
              />
              <p className="rounded-xl border border-white/5 bg-black/10 p-3 text-sm leading-relaxed text-[#C7B299]">
                {allocation.shortfallSummary.summary}
              </p>
            </div>
          ) : (
            <UnavailableState message="The Engine did not emit an allocation." />
          )}
        </ReviewPanel>
      </div>

      <ReviewPanel title="Candidate statistics" icon={BarChart3}>
        {stats ? (
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
            <StatTile label="Total" value={stats.totalCandidates} />
            <StatTile
              label="Full confidence"
              value={stats.fullConfidenceCount}
              tone="positive"
            />
            <StatTile
              label="Reduced confidence"
              value={stats.reducedConfidenceCount}
              tone={stats.reducedConfidenceCount > 0 ? 'attention' : 'neutral'}
            />
            <StatTile
              label="Incomplete axes"
              value={stats.incompleteAxesCount}
              tone={stats.incompleteAxesCount > 0 ? 'attention' : 'neutral'}
            />
            <StatTile
              label="Documents"
              value={stats.distinctDocuments}
            />
            <StatTile
              label="Shortfalls"
              value={stats.shortfallCount}
              tone={stats.shortfallCount > 0 ? 'critical' : 'positive'}
            />
          </div>
        ) : (
          <UnavailableState message="Candidate generation did not emit statistics." />
        )}
      </ReviewPanel>

      <div className="rounded-xl border border-[#D4AF37]/15 bg-[#D4AF37]/[0.04] p-4 text-sm text-[#C7B299]">
        <strong className="text-[#D4AF37]">Review boundary:</strong> this
        workspace presents the immutable generation result only. The separate
        editorial decision below cannot mutate this review or publish it.
      </div>
    </div>
  )
}

function CoverageSection({
  result,
}: {
  readonly result: AssessmentReviewResult
}) {
  const request = result.assemblyRequest
  const candidateSet = result.candidateSet
  const bindings = candidateSet?.coverageSatisfaction.bindings ?? []
  const shortfalls =
    candidateSet?.shortfallReport.entries.filter(
      (entry) => entry.axis === 'coverage'
    ) ?? []

  return (
    <div className="space-y-6">
      <SectionHeading
        eyebrow="Blueprint alignment"
        title="Coverage inspection"
        description="Compare declared rules with the candidate evidence carried by the Engine."
      />

      <div className="grid gap-4 md:grid-cols-3">
        <StatTile
          label="Declared rules"
          value={request?.coverageRules.length ?? 0}
        />
        <StatTile
          label="Satisfied bindings"
          value={
            bindings.filter(
              (binding) => binding.satisfyingCodes.length > 0
            ).length
          }
          tone="positive"
        />
        <StatTile
          label="Coverage shortfalls"
          value={shortfalls.length}
          tone={shortfalls.length > 0 ? 'critical' : 'positive'}
        />
      </div>

      <ReviewPanel title="Coverage rules" icon={Target}>
        {request && request.coverageRules.length > 0 ? (
          <div className="grid gap-3 md:grid-cols-2">
            {request.coverageRules.map((rule) => (
              <div
                key={rule.id}
                className="rounded-xl border border-white/5 bg-[#0F0B07] p-4"
              >
                <div className="flex items-center justify-between gap-3">
                  <span className="font-mono text-sm font-bold text-[#D4AF37]">
                    {rule.id}
                  </span>
                  <span className="rounded-full border border-white/10 px-2 py-1 text-[10px] font-bold uppercase text-[#A1866B]">
                    {rule.level}
                  </span>
                </div>
                <pre className="mt-3 max-h-32 overflow-auto whitespace-pre-wrap break-words font-mono text-[11px] leading-relaxed text-[#C7B299]">
                  {formatUnknown(rule.binding)}
                </pre>
              </div>
            ))}
          </div>
        ) : (
          <UnavailableState message="The Reader did not emit Blueprint coverage rules." />
        )}
      </ReviewPanel>

      <ReviewPanel title="Mandatory binding evidence" icon={Layers3}>
        {bindings.length > 0 ? (
          <div className="overflow-hidden rounded-xl border border-white/5">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px] text-left text-sm">
                <thead className="bg-[#0F0B07] text-[10px] uppercase tracking-wide text-[#A1866B]">
                  <tr>
                    <th className="px-4 py-3">Document</th>
                    <th className="px-4 py-3">Topic</th>
                    <th className="px-4 py-3 text-right">Candidates</th>
                    <th className="px-4 py-3">Evidence</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {bindings.map((binding, index) => (
                    <tr
                      key={`${binding.document}-${binding.topic}-${index}`}
                      className="bg-[#15100B]"
                    >
                      <td className="px-4 py-3 text-[#F5E9D6]">
                        {binding.document}
                      </td>
                      <td className="px-4 py-3 text-[#C7B299]">
                        {binding.topic}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <span
                          className={
                            binding.satisfyingCodes.length > 0
                              ? 'text-emerald-300'
                              : 'text-red-300'
                          }
                        >
                          {binding.satisfyingCodes.length}
                        </span>
                      </td>
                      <td className="max-w-sm px-4 py-3 font-mono text-[11px] text-[#A1866B]">
                        {binding.satisfyingCodes.slice(0, 8).join(', ') ||
                          'No satisfying candidates'}
                        {binding.satisfyingCodes.length > 8 && ' …'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ) : (
          <UnavailableState message="No mandatory binding evidence was emitted." />
        )}
      </ReviewPanel>

      {shortfalls.length > 0 && (
        <ReviewPanel title="Coverage shortfalls" icon={TriangleAlert}>
          <div className="space-y-3">
            {shortfalls.map((shortfall, index) => (
              <DiagnosticCard
                key={`${shortfall.axis}-${shortfall.setNumber}-${index}`}
                tone="warning"
                label={`${shortfall.axis} · ${shortfall.severity}`}
                location={
                  shortfall.setNumber === null
                    ? 'All sets'
                    : `Set ${shortfall.setNumber}`
                }
                explanation={shortfall.explanation}
                recommendation={shortfall.recommendation}
              />
            ))}
          </div>
        </ReviewPanel>
      )}
    </div>
  )
}

function AllocationSection({
  result,
}: {
  readonly result: AssessmentReviewResult
}) {
  const allocation = result.allocatedCandidateSet
  const [query, setQuery] = useState('')
  const [stateFilter, setStateFilter] = useState<
    'all' | 'allocated' | 'rejected'
  >('all')
  const [setFilter, setSetFilter] = useState('all')
  const [page, setPage] = useState(1)

  const filteredPlacements = useMemo(() => {
    if (!allocation) return []
    const normalizedQuery = query.trim().toLowerCase()

    return allocation.placements.filter((placement) => {
      if (stateFilter !== 'all' && placement.state !== stateFilter) {
        return false
      }
      if (
        setFilter !== 'all' &&
        String(placement.slot.setNumber) !== setFilter
      ) {
        return false
      }

      if (normalizedQuery.length === 0) return true
      const candidateCode =
        placement.state === 'allocated'
          ? placement.assignedCandidate.code
          : placement.considered.map((candidate) => candidate.candidateCode).join(' ')
      const document = placement.slot.document ?? ''
      return `${placement.slotId} ${candidateCode} ${document}`
        .toLowerCase()
        .includes(normalizedQuery)
    })
  }, [allocation, query, setFilter, stateFilter])

  if (!allocation) {
    return (
      <div className="space-y-6">
        <SectionHeading
          eyebrow="Solver output"
          title="Allocation inspection"
          description="Inspect every generated slot and the reasoning attached to it."
        />
        <UnavailableState message="The Engine did not emit an allocation for this run." />
      </div>
    )
  }

  const totalPages = Math.max(
    1,
    Math.ceil(filteredPlacements.length / PAGE_SIZE)
  )
  const safePage = Math.min(page, totalPages)
  const visiblePlacements = filteredPlacements.slice(
    (safePage - 1) * PAGE_SIZE,
    safePage * PAGE_SIZE
  )
  const setSummaries = [1, 2, 3, 4, 5].map((setNumber) => {
    const placements = allocation.placements.filter(
      (placement) => placement.slot.setNumber === setNumber
    )
    return {
      setNumber,
      total: placements.length,
      allocated: placements.filter(
        (placement) => placement.state === 'allocated'
      ).length,
    }
  })

  const resetPage = () => setPage(1)

  return (
    <div className="space-y-6">
      <SectionHeading
        eyebrow="Solver output"
        title="Allocation inspection"
        description="Inspect every generated slot, assigned Question Code, inherited rank, and rejection reason."
      />

      <div className="grid gap-3 md:grid-cols-4">
        <StatTile
          label="Allocated"
          value={allocation.shortfallSummary.allocatedSlotCount}
          tone="positive"
        />
        <StatTile
          label="Rejected"
          value={allocation.shortfallSummary.rejectedSlotCount}
          tone={
            allocation.shortfallSummary.rejectedSlotCount > 0
              ? 'critical'
              : 'positive'
          }
        />
        <StatTile
          label="Unresolved conflicts"
          value={allocation.shortfallSummary.unresolvedConflictCount}
          tone={
            allocation.shortfallSummary.unresolvedConflictCount > 0
              ? 'critical'
              : 'positive'
          }
        />
        <StatTile
          label="Soft constraints strained"
          value={allocation.shortfallSummary.strainedSoftConstraintCount}
          tone={
            allocation.shortfallSummary.strainedSoftConstraintCount > 0
              ? 'attention'
              : 'positive'
          }
        />
      </div>

      <ReviewPanel title="Allocation by set" icon={BarChart3}>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          {setSummaries.map((set) => (
            <div
              key={set.setNumber}
              className="rounded-xl border border-white/5 bg-[#0F0B07] p-3"
            >
              <div className="flex items-center justify-between text-xs">
                <span className="font-bold text-[#F5E9D6]">
                  Set {set.setNumber}
                </span>
                <span className="text-[#A1866B]">
                  {set.allocated}/{set.total}
                </span>
              </div>
              <div className="mt-3">
                <ProgressBar value={set.allocated} maximum={set.total} />
              </div>
            </div>
          ))}
        </div>
      </ReviewPanel>

      <ReviewPanel title="Generated placements" icon={ListChecks}>
        <div className="mb-4 grid gap-3 lg:grid-cols-[minmax(0,1fr)_160px_140px]">
          <label className="relative">
            <span className="sr-only">
              Search by slot, Question Code, or document
            </span>
            <Search
              size={16}
              className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[#A1866B]"
            />
            <input
              value={query}
              onChange={(event) => {
                setQuery(event.target.value)
                resetPage()
              }}
              placeholder="Search slot, Question Code, or document"
              className="w-full rounded-xl border border-white/10 bg-[#0F0B07] py-2.5 pl-10 pr-3 text-sm text-[#F5E9D6] outline-none placeholder:text-[#A1866B]/60 focus:border-[#D4AF37]/50"
            />
          </label>
          <select
            aria-label="Filter allocation state"
            value={stateFilter}
            onChange={(event) => {
              setStateFilter(
                event.target.value as 'all' | 'allocated' | 'rejected'
              )
              resetPage()
            }}
            className="rounded-xl border border-white/10 bg-[#0F0B07] px-3 py-2.5 text-sm text-[#F5E9D6] outline-none focus:border-[#D4AF37]/50"
          >
            <option value="all">All outcomes</option>
            <option value="allocated">Allocated</option>
            <option value="rejected">Rejected</option>
          </select>
          <select
            aria-label="Filter assessment set"
            value={setFilter}
            onChange={(event) => {
              setSetFilter(event.target.value)
              resetPage()
            }}
            className="rounded-xl border border-white/10 bg-[#0F0B07] px-3 py-2.5 text-sm text-[#F5E9D6] outline-none focus:border-[#D4AF37]/50"
          >
            <option value="all">All sets</option>
            {[1, 2, 3, 4, 5].map((setNumber) => (
              <option key={setNumber} value={setNumber}>
                Set {setNumber}
              </option>
            ))}
          </select>
        </div>

        <div className="overflow-hidden rounded-xl border border-white/5">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-left text-sm">
              <thead className="bg-[#0F0B07] text-[10px] uppercase tracking-wide text-[#A1866B]">
                <tr>
                  <th className="px-4 py-3">Set / Slot</th>
                  <th className="px-4 py-3">Outcome</th>
                  <th className="px-4 py-3">Question Code</th>
                  <th className="px-4 py-3">Rank / Score</th>
                  <th className="px-4 py-3">Review evidence</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {visiblePlacements.map((placement) => (
                  <tr key={placement.slotId} className="bg-[#15100B] align-top">
                    <td className="px-4 py-3">
                      <div className="font-bold text-[#F5E9D6]">
                        Set {placement.slot.setNumber}
                      </div>
                      <div className="mt-1 max-w-[220px] break-all font-mono text-[10px] text-[#A1866B]">
                        {placement.slotId}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <OutcomeBadge state={placement.state} />
                    </td>
                    <td className="px-4 py-3 font-mono text-xs text-[#D4AF37]">
                      {placement.state === 'allocated'
                        ? placement.assignedCandidate.code
                        : '—'}
                    </td>
                    <td className="px-4 py-3 text-[#C7B299]">
                      {placement.state === 'allocated'
                        ? `#${placement.placementReasoning.inheritedRank} · ${placement.placementReasoning.inheritedScoreValue.toFixed(3)}`
                        : `${placement.considered.length} considered`}
                    </td>
                    <td className="max-w-md px-4 py-3 text-xs leading-relaxed text-[#A1866B]">
                      {placement.state === 'allocated'
                        ? placement.placementReasoning.summary
                        : placement.reason}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {visiblePlacements.length === 0 && (
            <div className="bg-[#15100B] px-4 py-10 text-center text-sm text-[#A1866B]">
              No placements match the current filters.
            </div>
          )}
        </div>

        <div className="mt-4 flex flex-col gap-3 text-xs text-[#A1866B] sm:flex-row sm:items-center sm:justify-between">
          <span>
            Showing {visiblePlacements.length} of{' '}
            {filteredPlacements.length.toLocaleString()} placements
          </span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              aria-label="Previous placement page"
              disabled={safePage <= 1}
              onClick={() => setPage((current) => Math.max(1, current - 1))}
              className="rounded-lg border border-white/10 p-2 text-[#F5E9D6] hover:border-[#D4AF37]/30 disabled:cursor-not-allowed disabled:opacity-30"
            >
              <ChevronLeft size={15} />
            </button>
            <span className="min-w-20 text-center">
              Page {safePage} of {totalPages}
            </span>
            <button
              type="button"
              aria-label="Next placement page"
              disabled={safePage >= totalPages}
              onClick={() =>
                setPage((current) => Math.min(totalPages, current + 1))
              }
              className="rounded-lg border border-white/10 p-2 text-[#F5E9D6] hover:border-[#D4AF37]/30 disabled:cursor-not-allowed disabled:opacity-30"
            >
              <ChevronRight size={15} />
            </button>
          </div>
        </div>
      </ReviewPanel>
    </div>
  )
}

function DiagnosticsSection({
  result,
}: {
  readonly result: AssessmentReviewResult
}) {
  const shortfalls = result.candidateSet?.shortfallReport.entries ?? []
  const conflicts = result.allocatedCandidateSet?.unresolvedConflicts ?? []
  const recommendations = Array.from(
    new Set([
      ...result.errors.map((diagnostic) => diagnostic.recommendation),
      ...result.warnings.map((diagnostic) => diagnostic.recommendation),
      ...shortfalls.map((shortfall) => shortfall.recommendation),
    ])
  )

  const hasDiagnostics =
    result.errors.length > 0 ||
    result.warnings.length > 0 ||
    shortfalls.length > 0 ||
    conflicts.length > 0

  return (
    <div className="space-y-6">
      <SectionHeading
        eyebrow="Explainability"
        title="Diagnostics and recommendations"
        description="Review normalized Runtime findings alongside carried-forward shortfalls and unresolved Solver conflicts."
      />

      {!hasDiagnostics ? (
        <div className="flex items-center gap-3 rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-5 text-sm text-emerald-300">
          <CheckCircle2 size={20} />
          The Engine emitted no warnings, errors, shortfalls, or unresolved
          conflicts.
        </div>
      ) : (
        <div className="grid gap-6 xl:grid-cols-[minmax(0,1.35fr)_minmax(280px,0.65fr)]">
          <div className="space-y-5">
            {result.errors.length > 0 && (
              <DiagnosticGroup
                title={`Errors (${result.errors.length})`}
                description="Normalized Engine failures."
              >
                {result.errors.map((diagnostic, index) => (
                  <DiagnosticCard
                    key={`error-${diagnostic.location}-${index}`}
                    tone="error"
                    label={`${diagnostic.category} · ${diagnostic.severity}`}
                    location={`${diagnostic.module} · ${diagnostic.location}`}
                    explanation={diagnostic.explanation}
                    recommendation={diagnostic.recommendation}
                  />
                ))}
              </DiagnosticGroup>
            )}

            {result.warnings.length > 0 && (
              <DiagnosticGroup
                title={`Warnings (${result.warnings.length})`}
                description="Normalized non-fatal Engine findings."
              >
                {result.warnings.map((diagnostic, index) => (
                  <DiagnosticCard
                    key={`warning-${diagnostic.location}-${index}`}
                    tone="warning"
                    label={diagnostic.type}
                    location={`${diagnostic.module} · ${diagnostic.location}`}
                    explanation={diagnostic.explanation}
                    recommendation={diagnostic.recommendation}
                  />
                ))}
              </DiagnosticGroup>
            )}

            {shortfalls.length > 0 && (
              <DiagnosticGroup
                title={`Candidate shortfalls (${shortfalls.length})`}
                description="Generator findings carried unchanged through the result."
              >
                {shortfalls.map((shortfall, index) => (
                  <DiagnosticCard
                    key={`${shortfall.axis}-${shortfall.setNumber}-${index}`}
                    tone="warning"
                    label={`${shortfall.axis} · ${shortfall.severity}`}
                    location={
                      shortfall.setNumber === null
                        ? 'All sets'
                        : `Set ${shortfall.setNumber}`
                    }
                    explanation={shortfall.explanation}
                    recommendation={shortfall.recommendation}
                  />
                ))}
              </DiagnosticGroup>
            )}

            {conflicts.length > 0 && (
              <DiagnosticGroup
                title={`Unresolved conflicts (${conflicts.length})`}
                description="Solver conflicts requiring reviewer awareness."
              >
                {conflicts.map((conflict, index) => (
                  <DiagnosticCard
                    key={`${conflict.candidateCode}-${conflict.constraint}-${index}`}
                    tone="error"
                    label={`${conflict.type} · ${conflict.constraint}`}
                    location={`${conflict.scope} · ${conflict.candidateCode}`}
                    explanation={conflict.evidence}
                    recommendation={conflict.resolutionNote}
                  />
                ))}
              </DiagnosticGroup>
            )}
          </div>

          <aside className="h-fit rounded-xl border border-[#D4AF37]/15 bg-[#D4AF37]/[0.04] p-4">
            <div className="flex items-center gap-2 text-sm font-bold text-[#F5E9D6]">
              <ListChecks size={17} className="text-[#D4AF37]" />
              Engine recommendations
            </div>
            <p className="mt-1 text-xs leading-relaxed text-[#A1866B]">
              Consolidated from the immutable diagnostic fields.
            </p>
            {recommendations.length > 0 ? (
              <ol className="mt-4 space-y-3">
                {recommendations.map((recommendation, index) => (
                  <li
                    key={`${recommendation}-${index}`}
                    className="flex gap-3 text-sm leading-relaxed text-[#C7B299]"
                  >
                    <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[#D4AF37]/10 text-[10px] font-bold text-[#D4AF37]">
                      {index + 1}
                    </span>
                    {recommendation}
                  </li>
                ))}
              </ol>
            ) : (
              <p className="mt-4 text-sm text-emerald-300">
                No corrective recommendations were emitted.
              </p>
            )}
          </aside>
        </div>
      )}
    </div>
  )
}

function RuntimeSection({
  result,
}: {
  readonly result: AssessmentReviewResult
}) {
  const execution = result.execution
  const timings = Object.entries(execution.moduleDurationsMs)
  const maximumDuration = Math.max(
    1,
    ...timings.map(([, duration]) => duration)
  )

  return (
    <div className="space-y-6">
      <SectionHeading
        eyebrow="Reproducibility"
        title="Runtime metadata"
        description="Execution identity, version stack, timestamps, and measured stage timings."
      />

      <div className="grid gap-4 lg:grid-cols-2">
        <ReviewPanel title="Execution identity" icon={Fingerprint}>
          <div className="grid gap-4 sm:grid-cols-2">
            <MetadataItem
              label="Execution ID"
              value={execution.executionId}
              mono
            />
            <MetadataItem
              label="Status"
              value={result.status}
            />
            <MetadataItem
              label="Blueprint"
              value={`${execution.blueprintId}@${execution.blueprintVersion}`}
              mono
            />
            <MetadataItem
              label="Duration"
              value={
                execution.durationMs === null
                  ? 'Not recorded'
                  : `${execution.durationMs.toFixed(2)} ms`
              }
            />
            <MetadataItem
              label="Started"
              value={formatTimestamp(execution.startedAtIso)}
            />
            <MetadataItem
              label="Completed"
              value={formatTimestamp(execution.completedAtIso)}
            />
          </div>
        </ReviewPanel>

        <ReviewPanel title="Version stack" icon={Layers3}>
          <div className="grid gap-4 sm:grid-cols-2">
            <MetadataItem
              label="Runtime API"
              value={execution.runtimeApiVersion}
              mono
            />
            <MetadataItem
              label="Engine"
              value={execution.engineVersion}
              mono
            />
            {Object.entries(execution.moduleVersions).map(
              ([module, version]) => (
                <MetadataItem
                  key={module}
                  label={module}
                  value={version}
                  mono
                />
              )
            )}
          </div>
        </ReviewPanel>
      </div>

      <ReviewPanel title="Stage timings" icon={Clock3}>
        {timings.length > 0 ? (
          <div className="space-y-4">
            {timings.map(([module, duration]) => (
              <div key={module}>
                <div className="mb-1.5 flex items-center justify-between gap-3 text-xs">
                  <span className="font-bold capitalize text-[#F5E9D6]">
                    {module}
                  </span>
                  <span className="font-mono text-[#A1866B]">
                    {duration.toFixed(2)} ms
                  </span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-white/5">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-[#8C6D1F] to-[#D4AF37]"
                    style={{
                      width: `${Math.max(2, (duration / maximumDuration) * 100)}%`,
                    }}
                  />
                </div>
              </div>
            ))}
          </div>
        ) : (
          <UnavailableState message="No stage timing was recorded." />
        )}
      </ReviewPanel>
    </div>
  )
}

function SectionHeading({
  eyebrow,
  title,
  description,
}: {
  readonly eyebrow: string
  readonly title: string
  readonly description: string
}) {
  return (
    <div>
      <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-[#D4AF37]">
        {eyebrow}
      </div>
      <h3 className="mt-1 font-display text-xl font-bold text-[#F5E9D6]">
        {title}
      </h3>
      <p className="mt-1 text-sm text-[#A1866B]">{description}</p>
    </div>
  )
}

function QualityMetric({
  label,
  value,
  detail,
  tone,
}: {
  readonly label: string
  readonly value: string | number
  readonly detail: string
  readonly tone: 'positive' | 'attention' | 'critical'
}) {
  const tones = {
    positive: 'text-emerald-300',
    attention: 'text-amber-300',
    critical: 'text-red-300',
  }

  return (
    <div className="rounded-xl border border-white/5 bg-black/15 p-3.5">
      <div className="text-[10px] font-bold uppercase tracking-wide text-[#A1866B]">
        {label}
      </div>
      <div className={`mt-1 text-2xl font-bold ${tones[tone]}`}>
        {typeof value === 'number' ? value.toLocaleString() : value}
      </div>
      <div className="mt-1 text-[11px] text-[#A1866B]">{detail}</div>
    </div>
  )
}

function ReviewPanel({
  title,
  icon: Icon,
  children,
}: {
  readonly title: string
  readonly icon: typeof ClipboardCheck
  readonly children: React.ReactNode
}) {
  return (
    <section className="rounded-xl border border-white/5 bg-[#15100B] p-4 sm:p-5">
      <div className="mb-4 flex items-center gap-2 text-sm font-bold text-[#F5E9D6]">
        <Icon size={17} className="text-[#D4AF37]" />
        {title}
      </div>
      {children}
    </section>
  )
}

function MetadataItem({
  label,
  value,
  mono = false,
}: {
  readonly label: string
  readonly value: string
  readonly mono?: boolean
}) {
  return (
    <div>
      <div className="text-[10px] font-bold uppercase tracking-wide text-[#A1866B]">
        {label}
      </div>
      <div
        className={`mt-1 break-words text-sm text-[#F5E9D6] ${
          mono ? 'font-mono text-xs' : ''
        }`}
      >
        {value}
      </div>
    </div>
  )
}

function StatTile({
  label,
  value,
  tone = 'neutral',
}: {
  readonly label: string
  readonly value: number
  readonly tone?: 'neutral' | 'positive' | 'attention' | 'critical'
}) {
  const tones = {
    neutral: 'text-[#F5E9D6]',
    positive: 'text-emerald-300',
    attention: 'text-amber-300',
    critical: 'text-red-300',
  }

  return (
    <div className="rounded-xl border border-white/5 bg-[#0F0B07] p-3.5">
      <div className={`text-2xl font-bold ${tones[tone]}`}>
        {value.toLocaleString()}
      </div>
      <div className="mt-1 text-[10px] font-bold uppercase tracking-wide text-[#A1866B]">
        {label}
      </div>
    </div>
  )
}

function ProgressBar({
  value,
  maximum,
}: {
  readonly value: number
  readonly maximum: number
}) {
  const percentage =
    maximum === 0 ? 0 : Math.min(100, (value / maximum) * 100)

  return (
    <div
      className="h-2 overflow-hidden rounded-full bg-white/5"
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={maximum}
      aria-valuenow={value}
    >
      <div
        className="h-full rounded-full bg-emerald-400"
        style={{ width: `${percentage}%` }}
      />
    </div>
  )
}

function OutcomeBadge({
  state,
}: {
  readonly state: 'allocated' | 'rejected'
}) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-1 text-[10px] font-bold uppercase ${
        state === 'allocated'
          ? 'border-emerald-500/20 bg-emerald-500/10 text-emerald-300'
          : 'border-red-500/20 bg-red-500/10 text-red-300'
      }`}
    >
      {state === 'allocated' ? (
        <CheckCircle2 size={11} />
      ) : (
        <AlertCircle size={11} />
      )}
      {state}
    </span>
  )
}

function DiagnosticGroup({
  title,
  description,
  children,
}: {
  readonly title: string
  readonly description: string
  readonly children: React.ReactNode
}) {
  return (
    <section>
      <h4 className="text-sm font-bold text-[#F5E9D6]">{title}</h4>
      <p className="mb-3 mt-0.5 text-xs text-[#A1866B]">
        {description}
      </p>
      <div className="space-y-3">{children}</div>
    </section>
  )
}

function DiagnosticCard({
  tone,
  label,
  location,
  explanation,
  recommendation,
}: {
  readonly tone: 'error' | 'warning'
  readonly label: string
  readonly location: string
  readonly explanation: string
  readonly recommendation: string
}) {
  const error = tone === 'error'

  return (
    <article
      className={`rounded-xl border p-4 ${
        error
          ? 'border-red-500/20 bg-red-500/5'
          : 'border-amber-500/20 bg-amber-500/5'
      }`}
    >
      <div
        className={`flex flex-wrap items-center gap-2 text-xs font-bold ${
          error ? 'text-red-300' : 'text-amber-300'
        }`}
      >
        {error ? <AlertCircle size={15} /> : <TriangleAlert size={15} />}
        {label}
      </div>
      <div className="mt-1 font-mono text-[10px] text-[#A1866B]">
        {location}
      </div>
      <p className="mt-3 text-sm leading-relaxed text-[#F5E9D6]">
        {explanation}
      </p>
      <p className="mt-2 text-xs leading-relaxed text-[#A1866B]">
        <strong className={error ? 'text-red-300' : 'text-amber-300'}>
          Recommended:
        </strong>{' '}
        {recommendation}
      </p>
    </article>
  )
}

function UnavailableState({ message }: { readonly message: string }) {
  return (
    <div className="flex min-h-28 items-center justify-center rounded-xl border border-dashed border-white/10 bg-black/10 p-5 text-center text-sm text-[#A1866B]">
      {message}
    </div>
  )
}

function getReviewSignal(result: AssessmentReviewResult): {
  readonly label: string
  readonly className: string
} {
  if (result.errors.length > 0) {
    return {
      label: 'Needs diagnostic review',
      className: 'border-red-500/30 bg-red-500/10 text-red-300',
    }
  }

  const allocation = result.allocatedCandidateSet
  if (
    allocation &&
    (allocation.shortfallSummary.rejectedSlotCount > 0 ||
      allocation.shortfallSummary.unresolvedConflictCount > 0)
  ) {
    return {
      label: 'Allocation gaps found',
      className: 'border-amber-500/30 bg-amber-500/10 text-amber-300',
    }
  }

  if (result.warnings.length > 0) {
    return {
      label: 'Warnings require review',
      className: 'border-amber-500/30 bg-amber-500/10 text-amber-300',
    }
  }

  return {
    label: 'Ready for inspection',
    className: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300',
  }
}

function formatTimestamp(value: string | null): string {
  if (value === null) return 'Not recorded'
  const timestamp = new Date(value)
  return Number.isNaN(timestamp.getTime())
    ? value
    : timestamp.toLocaleString()
}

function formatUnknown(value: unknown): string {
  if (typeof value === 'string') return value
  try {
    return JSON.stringify(value, null, 2)
  } catch {
    return 'Binding could not be formatted.'
  }
}
