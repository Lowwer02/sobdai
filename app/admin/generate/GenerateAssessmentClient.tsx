'use client'

import {
  AlertCircle,
  CheckCircle2,
  ChevronRight,
  Circle,
  FileCheck2,
  Loader2,
  Play,
  ShieldCheck,
  Sparkles,
} from 'lucide-react'
import { useRef, useState, useTransition } from 'react'

import AssessmentReviewWorkspace from './AssessmentReviewWorkspace'
import type { PublishPackageOption } from './AssessmentPublishWorkflow'
import { generateAssessmentAdminAction } from './actions'

interface BlueprintOption {
  readonly key: string
  readonly title: string
  readonly description: string
}

interface GenerateAssessmentClientProps {
  readonly blueprints: readonly BlueprintOption[]
  readonly packages: readonly PublishPackageOption[]
  readonly canPublish: boolean
}

type ActionResult = Awaited<
  ReturnType<typeof generateAssessmentAdminAction>
>

type CompletedResult = Extract<
  ActionResult,
  { readonly success: true }
>['result']

const inputClass =
  'w-full rounded-xl border border-white/10 bg-[#0F0B07] px-3 py-2.5 text-sm text-[#F5E9D6] outline-none transition-colors focus:border-[#D4AF37]/60'

export default function GenerateAssessmentClient({
  blueprints,
  packages,
  canPublish,
}: GenerateAssessmentClientProps) {
  const [blueprintKey, setBlueprintKey] = useState(
    blueprints[0]?.key ?? ''
  )
  const [overFetchFactor, setOverFetchFactor] = useState(2)
  const [targetSetCount, setTargetSetCount] = useState<
    1 | 2 | 3 | 4 | 5
  >(5)
  const [auditVerbosity, setAuditVerbosity] = useState<
    'summary' | 'full'
  >('summary')
  const [result, setResult] = useState<CompletedResult | null>(null)
  const [transportError, setTransportError] = useState<string | null>(null)
  const [workflowLocked, setWorkflowLocked] = useState(false)
  const [isPending, startTransition] = useTransition()
  const generationInFlight = useRef(false)

  const generate = () => {
    if (generationInFlight.current) return
    generationInFlight.current = true
    setResult(null)
    setTransportError(null)
    setWorkflowLocked(false)

    startTransition(async () => {
      try {
        const response = await generateAssessmentAdminAction({
          blueprintKey:
            blueprintKey as Parameters<
              typeof generateAssessmentAdminAction
            >[0]['blueprintKey'],
          targetSetCount,
          overFetchFactor,
          auditVerbosity,
        })

        if (response.success) {
          setResult(response.result)
        } else {
          setTransportError(response.error)
        }
      } catch {
        setTransportError(
          'Generation could not be completed because the request was interrupted.'
        )
      } finally {
        generationInFlight.current = false
      }
    })
  }

  return (
    <div className="space-y-7">
      <header className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <div className="mb-2 flex items-center gap-2 text-xs font-bold uppercase tracking-[0.2em] text-[#D4AF37]">
            <Sparkles size={14} />
            Assessment Engine
          </div>
          <h1 className="font-display text-3xl font-bold tracking-tight text-[#F5E9D6]">
            Generate Assessment
          </h1>
          <p className="mt-1 max-w-2xl text-[#A1866B]">
            Execute the frozen Blueprint against the current Question Bank.
            Generation is read-only; no Exam Set is saved or published.
          </p>
        </div>
        <div className="flex items-center gap-2 rounded-xl border border-emerald-500/20 bg-emerald-500/5 px-3 py-2 text-xs font-medium text-emerald-300">
          <ShieldCheck size={15} />
          Engine v1.0 · deterministic execution
        </div>
      </header>

      <ExecutionProgress
        isPending={isPending}
        hasResult={result !== null}
        hasError={transportError !== null}
      />

      {result && !isPending ? (
        <div className="space-y-4">
          <div className="flex justify-end">
            <button
              type="button"
              disabled={workflowLocked}
              onClick={() => {
                if (!workflowLocked) setResult(null)
              }}
              title={
                workflowLocked
                  ? 'Complete or reopen the current editorial workflow first.'
                  : undefined
              }
              className="rounded-xl border border-white/10 px-3 py-2 text-xs font-bold text-[#A1866B] transition-colors hover:border-[#D4AF37]/30 hover:text-[#D4AF37] disabled:cursor-not-allowed disabled:opacity-40"
            >
              Start a new generation
            </button>
          </div>
          <AssessmentReviewWorkspace
            result={result}
            packages={packages}
            canPublish={canPublish}
            onWorkflowLockChange={setWorkflowLocked}
          />
        </div>
      ) : (
        <div className="grid gap-6 xl:grid-cols-[minmax(0,0.9fr)_minmax(0,1.35fr)]">
          <section className="h-fit rounded-2xl border border-[#D4AF37]/15 bg-[#1A140E] p-6 shadow-xl">
            <div className="mb-6 flex items-start gap-3">
              <div className="rounded-xl bg-[#D4AF37]/10 p-2.5 text-[#D4AF37]">
                <FileCheck2 size={20} />
              </div>
              <div>
                <h2 className="font-display text-lg font-bold text-[#F5E9D6]">
                  Generation input
                </h2>
                <p className="text-sm text-[#A1866B]">
                  Application-level settings only.
                </p>
              </div>
            </div>

            <div className="space-y-5">
              <Field
                label="Assessment Blueprint"
                hint="Only versioned, supported Blueprints can be executed."
              >
                <select
                  value={blueprintKey}
                  onChange={(event) => setBlueprintKey(event.target.value)}
                  className={inputClass}
                  disabled={isPending}
                >
                  {blueprints.map((blueprint) => (
                    <option key={blueprint.key} value={blueprint.key}>
                      {blueprint.title}
                    </option>
                  ))}
                </select>
                {blueprints.find((item) => item.key === blueprintKey) && (
                  <p className="mt-2 rounded-lg border border-white/5 bg-black/10 px-3 py-2 text-xs text-[#A1866B]">
                    {
                      blueprints.find((item) => item.key === blueprintKey)
                        ?.description
                    }
                  </p>
                )}
              </Field>

              <Field
                label="Target assessment sets"
                hint="Controls the number of 100-question sets generated by the Engine."
              >
                <select
                  value={targetSetCount}
                  onChange={(event) =>
                    setTargetSetCount(
                      Number(event.target.value) as 1 | 2 | 3 | 4 | 5
                    )
                  }
                  className={inputClass}
                  disabled={isPending}
                >
                  <option value={1}>1 Set · 100 questions</option>
                  <option value={2}>2 Sets · 200 questions</option>
                  <option value={3}>3 Sets · 300 questions</option>
                  <option value={4}>4 Sets · 400 questions</option>
                  <option value={5}>5 Sets · 500 questions (default)</option>
                </select>
              </Field>

              <Field
                label="Candidate headroom"
                hint="Controls the bounded over-fetch factor used by the Engine."
              >
                <select
                  value={overFetchFactor}
                  onChange={(event) =>
                    setOverFetchFactor(Number(event.target.value))
                  }
                  className={inputClass}
                  disabled={isPending}
                >
                  <option value={1}>1× · strict pool</option>
                  <option value={1.5}>1.5× · balanced</option>
                  <option value={2}>2× · recommended</option>
                  <option value={3}>3× · maximum headroom</option>
                </select>
              </Field>

              <Field
                label="Audit detail"
                hint="Full audit retains more decision detail in the result."
              >
                <div className="grid grid-cols-2 gap-2">
                  {(['summary', 'full'] as const).map((value) => (
                    <button
                      key={value}
                      type="button"
                      disabled={isPending}
                      onClick={() => setAuditVerbosity(value)}
                      className={`rounded-xl border px-3 py-2.5 text-sm font-semibold capitalize transition-colors ${
                        auditVerbosity === value
                          ? 'border-[#D4AF37]/50 bg-[#D4AF37]/10 text-[#D4AF37]'
                          : 'border-white/10 bg-[#0F0B07] text-[#A1866B] hover:border-white/20'
                      }`}
                    >
                      {value}
                    </button>
                  ))}
                </div>
              </Field>

              <button
                type="button"
                onClick={generate}
                disabled={isPending || blueprintKey.length === 0}
                className="flex w-full items-center justify-center gap-2 rounded-xl bg-[#D4AF37] px-4 py-3 font-bold text-[#1A140E] transition-colors hover:bg-[#F1D17A] disabled:cursor-not-allowed disabled:opacity-50"
              >
                {isPending ? (
                  <>
                    <Loader2 size={18} className="animate-spin" />
                    Generating assessment…
                  </>
                ) : (
                  <>
                    <Play size={18} />
                    Generate assessment
                  </>
                )}
              </button>
            </div>
          </section>

          <section className="min-h-[520px] rounded-2xl border border-[#D4AF37]/15 bg-[#1A140E] p-6 shadow-xl">
            {isPending ? (
              <RunningState />
            ) : transportError ? (
              <TransportFailure message={transportError} />
            ) : (
              <EmptyResult />
            )}
          </section>
        </div>
      )}
    </div>
  )
}

function Field({
  label,
  hint,
  children,
}: {
  readonly label: string
  readonly hint: string
  readonly children: React.ReactNode
}) {
  return (
    <fieldset className="block space-y-1.5">
      <legend className="block text-xs font-bold uppercase tracking-wide text-[#A1866B]">
        {label}
      </legend>
      {children}
      <span className="block text-[11px] leading-relaxed text-[#A1866B]/70">
        {hint}
      </span>
    </fieldset>
  )
}

function ExecutionProgress({
  isPending,
  hasResult,
  hasError,
}: {
  readonly isPending: boolean
  readonly hasResult: boolean
  readonly hasError: boolean
}) {
  const completed = hasResult || hasError
  const steps = [
    {
      label: 'Configure',
      description: 'Blueprint and execution options',
      state: isPending || completed ? 'complete' : 'current',
    },
    {
      label: 'Execute',
      description: 'Application Action and Engine',
      state: isPending ? 'current' : completed ? 'complete' : 'upcoming',
    },
    {
      label: 'Review',
      description: 'Read-only workspace',
      state: completed ? 'current' : 'upcoming',
    },
  ] as const

  return (
    <div className="grid gap-2 rounded-2xl border border-white/5 bg-[#1A140E]/70 p-3 md:grid-cols-3">
      {steps.map((step, index) => (
        <div
          key={step.label}
          className={`flex items-center gap-3 rounded-xl px-3 py-2.5 ${
            step.state === 'current' ? 'bg-[#D4AF37]/8' : ''
          }`}
        >
          {step.state === 'complete' ? (
            <CheckCircle2 size={18} className="shrink-0 text-emerald-400" />
          ) : step.state === 'current' && isPending ? (
            <Loader2 size={18} className="shrink-0 animate-spin text-[#D4AF37]" />
          ) : (
            <Circle
              size={18}
              className={`shrink-0 ${
                step.state === 'current'
                  ? 'text-[#D4AF37]'
                  : 'text-[#A1866B]/40'
              }`}
            />
          )}
          <div className="min-w-0">
            <div className="text-sm font-bold text-[#F5E9D6]">
              {step.label}
            </div>
            <div className="truncate text-[11px] text-[#A1866B]">
              {step.description}
            </div>
          </div>
          {index < steps.length - 1 && (
            <ChevronRight
              size={14}
              className="ml-auto hidden text-[#A1866B]/40 md:block"
            />
          )}
        </div>
      ))}
    </div>
  )
}

function RunningState() {
  return (
    <div className="flex min-h-[470px] flex-col items-center justify-center text-center">
      <div className="relative mb-6">
        <div className="absolute inset-0 animate-ping rounded-full bg-[#D4AF37]/10" />
        <div className="relative rounded-full border border-[#D4AF37]/30 bg-[#D4AF37]/10 p-5 text-[#D4AF37]">
          <Loader2 size={34} className="animate-spin" />
        </div>
      </div>
      <h2 className="font-display text-xl font-bold text-[#F5E9D6]">
        Assessment Engine is running
      </h2>
      <p className="mt-2 max-w-md text-sm leading-relaxed text-[#A1866B]">
        The Blueprint and Question Bank snapshot are being processed as one
        synchronous deterministic run. Module timing will appear with the
        completed result.
      </p>
    </div>
  )
}

function EmptyResult() {
  return (
    <div className="flex min-h-[470px] flex-col items-center justify-center text-center">
      <div className="mb-5 rounded-full border border-white/10 bg-[#0F0B07] p-5 text-[#A1866B]">
        <Sparkles size={32} />
      </div>
      <h2 className="font-display text-xl font-bold text-[#F5E9D6]">
        Ready to generate
      </h2>
      <p className="mt-2 max-w-sm text-sm leading-relaxed text-[#A1866B]">
        Configure the run and start generation. Results remain advisory and
        are not persisted in this milestone.
      </p>
    </div>
  )
}

function TransportFailure({ message }: { readonly message: string }) {
  return (
    <div className="flex min-h-[470px] flex-col items-center justify-center text-center">
      <div className="mb-5 rounded-full border border-red-500/20 bg-red-500/10 p-5 text-red-400">
        <AlertCircle size={32} />
      </div>
      <h2 className="font-display text-xl font-bold text-[#F5E9D6]">
        Generation could not start
      </h2>
      <p className="mt-2 max-w-lg rounded-xl border border-red-500/20 bg-red-500/5 px-4 py-3 text-sm text-red-300">
        {message}
      </p>
    </div>
  )
}
