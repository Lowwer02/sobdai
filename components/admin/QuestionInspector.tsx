'use client'

/**
 * QuestionInspector — read-only slide-over drawer that shows full metadata,
 * "Used In" references (Exam Sets + owning Packages), and a timeline for a
 * single Question. Opened from a Question Card in the Picker.
 *
 * Design philosophy: progressive disclosure. The Question Card stays light;
 * everything heavier lives here.
 *
 * Patterns reused from the existing Sobdai admin UI (NOT a new pattern):
 *  - Slide-over overlay: fixed inset, backdrop blur, right-anchored panel —
 *    same shell as QuestionPicker's modal (bg/palette/animate-in classes).
 *  - Badge styling: same gold/muted tag classes as the picker card badges.
 *  - Date formatting: new Date(x).toLocaleDateString() — same as
 *    QuestionsClient.tsx and PackagesClient.tsx.
 *
 * Read-only only. No edit/delete/archive/publish affordances.
 */

import { useEffect, useState } from 'react'
import { X, Loader2, AlertCircle } from 'lucide-react'
import {
  fetchQuestionInspectorData,
  fetchQuestionUsedIn,
  type QuestionInspectorData,
  type QuestionUsedInReference,
} from '../../app/admin/exam-sets/questions.action'
import { getSubjectLabel, isUnassignedSubject } from '@/lib/subjects'

interface QuestionInspectorProps {
  /** Question to inspect. null closes the drawer. */
  questionId: string | null
  onClose: () => void
}

/** Grouped "Used In" view: Package name → Exam Set names. */
interface UsedInByPackage {
  key: string
  packageName: string | null
  packageCode: string | null
  isPublished: boolean | null
  examSets: { id: string; name: string }[]
}

// ---------- small presentational helpers (local, not a shared system) ----------

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h3 className="text-xs font-bold uppercase tracking-wider text-[#A1866B] mb-2 mt-5 first:mt-0">
      {children}
    </h3>
  )
}

function MetaRow({ label, value }: { label: string; value?: React.ReactNode }) {
  const empty = value === null || value === undefined || value === ''
  return (
    <div className="flex justify-between items-center gap-3 py-1.5 border-b border-[rgba(255,255,255,0.04)] last:border-0">
      <span className="text-xs text-[#A1866B] shrink-0">{label}</span>
      <span className={`text-xs text-right ${empty ? 'text-[#A1866B]/50 italic' : 'text-[#F5E9D6]'}`}>
        {empty ? '—' : value}
      </span>
    </div>
  )
}

/** Badge tone matching the existing picker tag styling. */
function Tag({ tone = 'muted', children }: { tone?: 'muted' | 'gold' | 'green' | 'yellow' | 'red'; children: React.ReactNode }) {
  const tones: Record<string, string> = {
    muted: 'text-[#A1866B] bg-black/30 border-[rgba(255,255,255,0.05)]',
    gold: 'text-[#D4AF37] bg-[#D4AF37]/10 border-[rgba(212,175,55,0.3)]',
    green: 'text-[#22C55E] bg-[#22C55E]/10 border-[#22C55E]/20',
    yellow: 'text-[#EAB308] bg-[#EAB308]/10 border-[#EAB308]/20',
    red: 'text-red-400 bg-red-400/10 border-red-400/20',
  }
  return (
    <span className={`text-[10px] px-2 py-0.5 rounded border whitespace-nowrap shrink-0 ${tones[tone]}`}>
      {children}
    </span>
  )
}

function statusTone(status: string | null | undefined): 'gold' | 'green' | 'yellow' | 'muted' {
  if (status === 'Published') return 'green'
  if (status === 'Review') return 'yellow'
  if (status === 'Draft') return 'gold'
  return 'muted'
}

// ---------- component ----------

export default function QuestionInspector({ questionId, onClose }: QuestionInspectorProps) {
  const [meta, setMeta] = useState<QuestionInspectorData | null>(null)
  const [usedIn, setUsedIn] = useState<QuestionUsedInReference[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(false)

  // Fetch metadata + references whenever a different question is opened.
  // Two reads, issued in parallel (no N+1 — independent of usage count).
  useEffect(() => {
    if (!questionId) {
      setMeta(null)
      setUsedIn([])
      setError(false)
      return
    }
    let mounted = true
    setLoading(true)
    setError(false)

    Promise.all([
      fetchQuestionInspectorData(questionId),
      fetchQuestionUsedIn(questionId),
    ])
      .then(([m, u]) => {
        if (!mounted) return
        setMeta(m)
        setUsedIn(u)
      })
      .catch((err) => {
        console.error('QuestionInspector load failed', err)
        if (mounted) setError(true)
      })
      .finally(() => {
        if (mounted) setLoading(false)
      })

    return () => { mounted = false }
  }, [questionId])

  // Esc to close (matches the lightweight a11y convention used elsewhere).
  useEffect(() => {
    if (!questionId) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [questionId, onClose])

  if (!questionId) return null

  // Group references by Package for display. Exam Sets whose package is null
  // (shouldn't happen — package_id NOT NULL — but degrade gracefully) land
  // under an explicit "No Package" bucket, never hidden.
  const grouped: UsedInByPackage[] = (() => {
    const map = new Map<string, UsedInByPackage>()
    for (const r of usedIn) {
      const key = r.package_id ?? '__no_package__'
      if (!map.has(key)) {
        map.set(key, {
          key,
          packageName: r.package_name,
          packageCode: r.package_code,
          isPublished: r.package_is_published,
          examSets: [],
        })
      }
      map.get(key)!.examSets.push({ id: r.exam_set_id, name: r.exam_set_name })
    }
    return Array.from(map.values())
  })()

  const usageCount = usedIn.length

  return (
    <div className="fixed inset-0 z-[60] flex justify-end bg-black/70 backdrop-blur-sm">
      <div
        className="bg-[#1A140E] border-l border-[rgba(212,175,55,0.15)] w-full max-w-md h-full shadow-2xl animate-in fade-in slide-in-from-right duration-200 flex flex-col"
        role="dialog"
        aria-modal="true"
        aria-label="Question inspector"
      >
        {/* Header */}
        <div className="p-4 border-b border-[rgba(255,255,255,0.05)] flex items-center justify-between bg-[#0F0B07] shrink-0">
          <h2 className="text-base font-bold font-display text-[#F5E9D6]">Question Inspector</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close inspector"
            className="p-2 text-[#A1866B] hover:text-white transition-colors"
          >
            <X size={20} />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-4">
          {loading ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="animate-spin text-[#D4AF37]" size={28} />
            </div>
          ) : error ? (
            <div className="flex flex-col items-center justify-center py-16 text-center px-4">
              <AlertCircle className="text-red-400 mb-3" size={28} />
              <p className="text-sm text-[#F5E9D6] mb-3">Couldn’t load this question.</p>
              <button
                type="button"
                onClick={onClose}
                className="text-sm bg-[#1A140E] border border-[rgba(212,175,55,0.3)] text-[#D4AF37] px-3 py-1.5 rounded-lg hover:bg-[#D4AF37]/10 transition-colors"
              >
                Close
              </button>
            </div>
          ) : !meta ? (
            <div className="text-center py-16 text-sm text-[#A1866B]">Question not found.</div>
          ) : (
            <>
              {/* ── 1. Metadata ── */}
              <section>
                <SectionTitle>Question</SectionTitle>
                <p className="text-sm text-[#F5E9D6] whitespace-pre-wrap leading-relaxed mb-3">
                  {meta.content || <span className="text-[#A1866B]/50 italic">No content</span>}
                </p>
                {meta.correct_answer && (
                  <div className="mb-2">
                    <Tag tone="green">✔ Correct: {meta.correct_answer}</Tag>
                  </div>
                )}
                <div className="flex flex-wrap gap-2 mb-3">
                  {meta.status && <Tag tone={statusTone(meta.status)}>{meta.status}</Tag>}
                  {meta.difficulty && <Tag>{meta.difficulty}</Tag>}
                  {meta.is_common !== null && meta.is_common !== undefined && (
                    <Tag>{meta.is_common ? 'Common' : 'Specific'}</Tag>
                  )}
                </div>

                <SectionTitle>Metadata</SectionTitle>
                <div className="rounded-xl bg-[#0F0B07] border border-[rgba(255,255,255,0.05)] px-3 py-1">
                  <MetaRow label="Question ID" value={<code className="text-[10px] text-[#A1866B]">{meta.id}</code>} />
                  <MetaRow label="Subject" value={isUnassignedSubject(meta.subject ?? undefined) ? (meta.category || '—') : getSubjectLabel(meta.subject ?? undefined)} />
                  <MetaRow label="Document" value={meta.document ?? undefined} />
                  <MetaRow label="Topic" value={meta.topic ?? undefined} />
                  <MetaRow label="Law" value={meta.law ?? undefined} />
                  <MetaRow label="Difficulty" value={meta.difficulty ?? undefined} />
                  <MetaRow label="Type" value={meta.is_common === null ? undefined : (meta.is_common ? 'Common' : 'Specific')} />
                  <MetaRow label="Status" value={meta.status ?? undefined} />
                  {meta.reference && <MetaRow label="Reference" value={meta.reference} />}
                  {meta.tags && meta.tags.length > 0 && (
                    <MetaRow label="Tags" value={meta.tags.join(', ')} />
                  )}
                </div>
              </section>

              {/* ── 2. References (Used In) ── */}
              <section>
                <SectionTitle>Used In</SectionTitle>
                <div className="flex items-center gap-2 mb-2">
                  {usageCount > 0 ? (
                    <Tag tone="gold">● Used in {usageCount}</Tag>
                  ) : (
                    <Tag>○ Unused</Tag>
                  )}
                </div>

                {usageCount === 0 ? (
                  <div className="rounded-xl bg-[#0F0B07] border border-[rgba(255,255,255,0.05)] p-4 text-center">
                    <p className="text-sm text-[#F5E9D6] mb-1">Not used in any Exam Set.</p>
                    <p className="text-xs text-[#A1866B]">This question is available for new Exam Sets.</p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {grouped.map(g => (
                      <div key={g.key} className="rounded-xl bg-[#0F0B07] border border-[rgba(255,255,255,0.05)] p-3">
                        {/* ── 3. Package ── */}
                        <div className="flex items-center justify-between gap-2 mb-2">
                          <span className="text-xs font-bold text-[#F5E9D6] truncate">
                            {g.packageName ?? 'No Package'}
                          </span>
                          {g.isPublished !== null && (
                            <Tag tone={g.isPublished ? 'green' : 'muted'}>
                              {g.isPublished ? 'Published' : 'Unpublished'}
                            </Tag>
                          )}
                        </div>
                        <ul className="space-y-1">
                          {g.examSets.map(es => (
                            <li key={es.id} className="flex items-center gap-2 text-xs text-[#A1866B] pl-2 border-l border-[rgba(212,175,55,0.2)]">
                              <span className="truncate">{es.name}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    ))}
                  </div>
                )}
              </section>

              {/* ── 4. Timeline ── */}
              <section>
                <SectionTitle>Timeline</SectionTitle>
                <div className="rounded-xl bg-[#0F0B07] border border-[rgba(255,255,255,0.05)] px-3 py-1">
                  <MetaRow label="Created" value={meta.created_at ? new Date(meta.created_at).toLocaleDateString() : undefined} />
                  <MetaRow label="Updated" value={meta.updated_at ? new Date(meta.updated_at).toLocaleDateString() : undefined} />
                </div>
              </section>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
