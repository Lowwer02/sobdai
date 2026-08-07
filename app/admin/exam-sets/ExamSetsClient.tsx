'use client'

import Link from 'next/link'
import { useRouter, usePathname } from 'next/navigation'
import { useState, useTransition, useCallback, useEffect, useMemo, useRef } from 'react'
import { Plus, Search, Edit, Trash2, ChevronLeft, ChevronRight, Loader2, Copy, Send, Archive, RotateCcw } from 'lucide-react'
import { deleteExamSetAction, setExamSetStatusAction, bulkSetExamSetStatusAction } from './actions'
import ConfirmDialog from '@/components/admin/ConfirmDialog'
import StatusBadge from '@/components/admin/StatusBadge'
import { getSubjectLabel } from '@/lib/subjects'
import { toastEvent } from '@/hooks/useToast'
import {
  type BulkExamSetTarget,
  type BulkStatusSuccess,
  planBulkFeedback,
} from './bulk-status'
import {
  ExamSetStatus,
  ExamSetStatusFilter,
} from './status-filter'
import {
  EXAM_SET_STATUS_OPTIONS,
} from '@/lib/exam-set-status'
import {
  toggleExamSetSelection,
  setExamSetPageSelection,
  getExamSetPageSelectionState,
} from './exam-set-selection'

// Allowed exam_sets.status transitions in the UI (Session 6.17). Each maps to
// the existing setExamSetStatusAction — the server (validate_exam_set_for_publish
// RPC) is the sole source of truth; the client performs NO business validation.
// `verb` is used in the confirm dialog copy ("Publish …", "Archive …").
interface StatusTransition {
  to: ExamSetStatus
  verb: string          // imperative verb for the button + dialog
  icon: typeof Send
  className: string     // button classes (color)
}
// Per current status, which transitions are offered in the row's action menu.
const TRANSITIONS: Record<ExamSetStatus, StatusTransition[]> = {
  draft: [
    { to: 'published', verb: 'Publish', icon: Send, className: 'text-[#22C55E] hover:bg-[#22C55E]/10' },
    { to: 'archived', verb: 'Archive', icon: Archive, className: 'text-[#A1866B] hover:bg-black/30' },
  ],
  published: [
    { to: 'draft', verb: 'Revert to Draft', icon: RotateCcw, className: 'text-[#EAB308] hover:bg-[#EAB308]/10' },
    { to: 'archived', verb: 'Archive', icon: Archive, className: 'text-[#A1866B] hover:bg-black/30' },
  ],
  archived: [
    { to: 'draft', verb: 'Restore to Draft', icon: RotateCcw, className: 'text-[#EAB308] hover:bg-[#EAB308]/10' },
  ],
}

interface ExamSetsClientProps {
  examSets: any[]
  packages: any[]
  totalPages: number
  currentPage: number
  search: string
  packageFilter: string
  typeFilter: string
  statusFilter: ExamSetStatusFilter
  /** Facet status counts (Phase 4). Null counts = query failure or unavailable. */
  statusCounts: {
    all: number | null
    draft: number | null
    published: number | null
    archived: number | null
  }
}

export default function ExamSetsClient({
  examSets,
  packages,
  totalPages,
  currentPage,
  search,
  packageFilter,
  typeFilter,
  statusFilter,
  statusCounts
}: ExamSetsClientProps) {
  const router = useRouter()
  const pathname = usePathname()
  const [isPending, startTransition] = useTransition()
  
  const [searchInput, setSearchInput] = useState(search)
  const [deleteModalOpen, setDeleteModalOpen] = useState(false)
  const [setToActOn, setSetToActOn] = useState<{id: string, name: string} | null>(null)
  const [isDeleting, setIsDeleting] = useState(false)
  const [isDuplicating, setIsDuplicating] = useState(false)

  // Status transition modal. `statusTarget` carries both the row identity and
  // the transition being confirmed; null = dialog closed. We reuse one dialog
  // for all four transitions (Publish / Revert / Archive / Restore).
  const [statusTarget, setStatusTarget] = useState<{
    id: string
    name: string
    transition: StatusTransition
  } | null>(null)
  const [isStatusChanging, setIsStatusChanging] = useState(false)

  // ── Bulk action (Phase 3A) ──────────────────────────────────────────────
  // `bulkTarget` carries the target status being confirmed and the selected
  // ids + names to display in the confirmation dialog; null = dialog closed.
  // Only Publish and Archive are offered in this phase.
  const [bulkTarget, setBulkTarget] = useState<{
    target: BulkExamSetTarget
    ids: string[]
    names: string[]
  } | null>(null)
  const [isBulking, setIsBulking] = useState(false)

  // Whether any list filter is currently applied. Drives the empty-state copy so
  // that "no results" never reads as "no exam sets exist at all". Mirrors the
  // server-side filter conditions (search/package/type/status); `statusFilter`
  // is 'all' (no filter) vs. a concrete status.
  const isAnyFilterActive =
    !!search ||
    (!!packageFilter && packageFilter !== 'All') ||
    (!!typeFilter && typeFilter !== 'All') ||
    statusFilter !== 'all'

  // ── Multi-selection (Phase 2) ────────────────────────────────────────────
  // Selection key = Exam Set `id` (UUID string). Only ids are stored.
  // Invariants (enforced in ./exam-set-selection.ts):
  //   - no selected id survives off the current page
  //   - empty page → header unchecked and not indeterminate
  //   - duplicate ids do not affect the count
  //   - React state Set is never mutated (every change produces a NEW Set)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())

  // Stable list of visible ids and a stable key derived from it. The key is a
  // reset dependency so selection also clears when the *dataset* changes for a
  // reason other than the URL filters — e.g. a row mutation, server refresh,
  // deletion, or a re-ordered result set under the same URL.
  const pageIds = useMemo(() => examSets.map((s) => s.id), [examSets])
  const pageSelectionKey = useMemo(() => pageIds.join('|'), [pageIds])

  // Header tri-state, computed from the pure helper. `selectedCount` counts
  // ONLY current-page ids (off-page ids are ignored), so it is the value shown
  // in "Selected N" — never `selectedIds.size`.
  const { selectedCount, allSelected, someSelected } = getExamSetPageSelectionState(
    selectedIds,
    pageIds
  )

  // Drive the header checkbox `indeterminate` imperatively — React has no
  // declarative prop for it. Mirrors components/admin/SummaryLibraryTable.tsx.
  const headerCheckboxRef = useRef<HTMLInputElement>(null)
  useEffect(() => {
    if (headerCheckboxRef.current) {
      headerCheckboxRef.current.indeterminate = someSelected
    }
  }, [someSelected])

  // Reset selection whenever the filters, page, OR the visible dataset change.
  // `pageSelectionKey` catches dataset changes that keep the same URL (mutations,
  // refreshes, deletions). All deps are stable strings/numbers → no effect loop.
  useEffect(() => {
    setSelectedIds(new Set())
  }, [search, packageFilter, typeFilter, statusFilter, currentPage, pageSelectionKey])

  const handleToggleRow = (id: string) => {
    setSelectedIds((prev) => toggleExamSetSelection(prev, id))
  }

  // Header checkbox: unchecked/indeterminate → select current page; checked →
  // clear. Uses the pure helper in BOTH directions (no off-page assumption).
  const handleTogglePage = (checked: boolean) => {
    setSelectedIds((prev) => setExamSetPageSelection(prev, pageIds, checked))
  }

  const clearSelection = () => setSelectedIds(new Set())

  // URL updating helper
  const updateParams = useCallback((updates: Record<string, string>) => {
    const params = new URLSearchParams(window.location.search)
    Object.entries(updates).forEach(([key, value]) => {
      if (value) {
        params.set(key, value)
      } else {
        params.delete(key)
      }
    })
    
    if (!updates.page) params.set('page', '1')

    startTransition(() => {
      router.push(`${pathname}?${params.toString()}`)
    })
  }, [pathname, router])

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    updateParams({ q: searchInput })
  }

  const handleDeleteClick = (id: string, name: string) => {
    setSetToActOn({ id, name })
    setDeleteModalOpen(true)
  }

  const confirmDelete = async () => {
    if (!setToActOn) return
    setIsDeleting(true)
    const res = await deleteExamSetAction(setToActOn.id)
    setIsDeleting(false)
    if (res?.success) {
      toastEvent('ลบชุดข้อสอบเรียบร้อยแล้ว')
      setDeleteModalOpen(false)
      setSetToActOn(null)
    } else {
      toastEvent(res?.error || 'ลบไม่สำเร็จ', 'error')
    }
  }

  const handleStatusClick = (id: string, name: string, transition: StatusTransition) => {
    setStatusTarget({ id, name, transition })
  }

  const confirmStatusChange = async () => {
    if (!statusTarget) return
    setIsStatusChanging(true)
    // No client-side validation. The server's validate_exam_set_for_publish RPC
    // is authoritative for the publish rules; we just relay its message.
    const res = await setExamSetStatusAction(statusTarget.id, statusTarget.transition.to)
    setIsStatusChanging(false)
    if (res?.success) {
      toastEvent(`${statusTarget.transition.verb}d: ${statusTarget.name}`)
      setStatusTarget(null)
      // Refresh server data so the Status badge + available transitions update
      // immediately from the source of truth (the DB row).
      router.refresh()
    } else {
      // Surface the server's validation message verbatim — this is where
      // publish-rule failures (no_questions / duplicate_order / ...) appear.
      toastEvent(res?.error || 'Status change failed', 'error')
    }
  }

  // ── Bulk action handlers (Phase 3A) ─────────────────────────────────────
  // Open the confirmation dialog for a bulk target. Uses the CURRENT selected
  // ids (page-scoped by Phase 2 invariant) and resolves their names from the
  // visible rows for display.
  const handleBulkClick = (target: BulkExamSetTarget) => {
    if (selectedIds.size === 0) return
    const ids = Array.from(selectedIds)
    const namesById = new Map(examSets.map((s) => [s.id, s.name as string]))
    const names = ids.map((id) => namesById.get(id) ?? id)
    setBulkTarget({ target, ids, names })
  }

  const confirmBulkAction = async () => {
    if (!bulkTarget) return
    setIsBulking(true)
    // Client sends ids ONLY. The server fetches the real records, enforces
    // allowed transitions, and reuses the publish-rule RPC — never trust
    // client-supplied status.
    const res = await bulkSetExamSetStatusAction(bulkTarget.ids, bulkTarget.target)
    setIsBulking(false)

    if (!res?.success) {
      // Action-level error (malformed input, invalid target, fetch failure,
      // unexpected exception). Selection is preserved so the Admin can retry.
      toastEvent(res?.error || 'Bulk action failed', 'error')
      setBulkTarget(null)
      return
    }

    // The server result is the source of truth.
    const feedback = planBulkFeedback(res)
    toastEvent(feedback.primary.message, feedback.primary.type)
    if (feedback.reasons) {
      toastEvent(feedback.reasons.message, feedback.reasons.type)
    }

    // Selection + refresh are driven by the result, not by success alone.
    // Only clear + refresh when at least one item actually succeeded; if zero
    // succeeded, keep the selection so the Admin can inspect or retry.
    if (res.succeeded.length > 0) {
      setSelectedIds(new Set())
      setBulkTarget(null)
      router.refresh()
    } else {
      // Close the dialog but keep the current selection.
      setBulkTarget(null)
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold font-display text-[#F5E9D6] tracking-tight">Exam Sets</h1>
          <p className="text-[#A1866B] mt-1">Manage exam bundles and map questions to packages.</p>
        </div>
        
        <Link href="/admin/exam-sets/create">
          <button type="submit" className="bg-[#D4AF37] hover:bg-[#F1D17A] text-[#1A140E] px-4 py-2.5 rounded-xl font-bold flex items-center gap-2 transition-colors">
            <Plus size={18} />
            Create Exam Set
          </button>
        </Link>
      </div>

      <div className="bg-[#1A140E] border border-[rgba(212,175,55,0.15)] rounded-2xl overflow-hidden shadow-xl">
        
        {/* Toolbar */}
        <div className="p-4 border-b border-[rgba(255,255,255,0.05)] flex flex-wrap gap-4 items-center">
          <form onSubmit={handleSearchSubmit} className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-[#A1866B]" size={18} />
            <input
              type="text"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="Search exam sets..."
              className="w-full bg-[#0F0B07] border border-[rgba(255,255,255,0.1)] text-[#F5E9D6] rounded-xl pl-10 pr-4 py-2 focus:outline-none focus:border-[#D4AF37]/50 transition-colors placeholder:text-[#A1866B]/50"
            />
          </form>

          <div className="flex items-center gap-3">
            <select
              value={packageFilter}
              onChange={(e) => updateParams({ package: e.target.value })}
              className="bg-[#0F0B07] border border-[rgba(255,255,255,0.1)] text-[#F5E9D6] rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-[#D4AF37]/50 max-w-[200px] truncate"
            >
              <option value="">All Packages</option>
              {packages.map(p => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>

            <select
              value={typeFilter}
              onChange={(e) => updateParams({ type: e.target.value })}
              className="bg-[#0F0B07] border border-[rgba(255,255,255,0.1)] text-[#F5E9D6] rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-[#D4AF37]/50"
            >
              <option value="">All Types</option>
              <option value="Full">Full Exam</option>
              <option value="Sample">Sample Exam</option>
            </select>
          </div>
        </div>

        {/* Status Tabs (Phase 4) — pill-toggle row replacing the old <select>.
            Counts are FACET counts: they reflect active Search / Package / Type
            but never the currently selected Status. `updateParams` preserves
            those filters and resets page=1 (Phase 1). Switching status drives a
            URL change, which clears Phase 2 selection via the existing reset
            effect and hides the bulk action bar. Labels come from the shared
            lib/exam-set-status.ts (single source of truth). On mobile the row
            wraps (`flex flex-wrap`) per the prevailing admin convention. */}
        <div
          role="group"
          aria-label="Filter by status"
          className="px-4 py-3 border-b border-[rgba(255,255,255,0.05)] flex flex-wrap gap-2 items-center"
        >
          {(() => {
            // Build the tab list: "All" + one per concrete status.
            const tabs: {
              label: string
              count: number | null
              isActive: boolean
              onClick: () => void
            }[] = [
              {
                label: 'All',
                count: statusCounts.all,
                isActive: statusFilter === 'all',
                // All removes `status` from the URL (empty value → deleted).
                onClick: () => updateParams({ status: '' }),
              },
              ...EXAM_SET_STATUS_OPTIONS.map((opt) => ({
                label: opt.label,
                count: statusCounts[opt.value],
                isActive: statusFilter === opt.value,
                onClick: () => updateParams({ status: opt.value }),
              })),
            ]
            return tabs.map((tab) => {
              const countText =
                tab.count === null ? '—' : String(tab.count)
              return (
                <button
                  key={tab.label}
                  type="button"
                  onClick={tab.onClick}
                  aria-pressed={tab.isActive}
                  className={
                    'px-4 py-1.5 rounded-full text-sm font-bold border transition-colors whitespace-nowrap ' +
                    (tab.isActive
                      ? 'bg-[#D4AF37]/15 border-[#D4AF37] text-[#D4AF37]'
                      : 'bg-[#1A140E] border-[rgba(255,255,255,0.1)] text-[#A1866B] hover:text-[#F5E9D6]')
                  }
                >
                  {tab.label} <span className="opacity-70">({countText})</span>
                </button>
              )
            })
          })()}
        </div>

        {/* Bulk Action Bar (Phase 3A) — shown only when at least one row on the
            current page is selected. `selectedCount` reflects current-page ids
            only (never `selectedIds.size`). Only Publish and Archive are
            offered; row-level actions remain unchanged. Buttons lock while a
            bulk action is pending (double-submit guard). */}
        {selectedCount > 0 && (
          <div
            role="region"
            aria-label="Bulk actions"
            className="bg-[#D4AF37]/10 border-y border-[#D4AF37]/30 px-4 py-3 flex flex-wrap items-center gap-3 animate-in slide-in-from-top-2 duration-200"
          >
            <span className="text-sm font-semibold text-[#D4AF37] bg-[#D4AF37]/10 px-2.5 py-1 rounded-lg whitespace-nowrap">
              Selected {selectedCount}
            </span>

            <div className="flex items-center gap-2 flex-wrap">
              <button
                type="button"
                onClick={() => handleBulkClick('published')}
                disabled={isBulking}
                className="px-3 py-1.5 rounded-lg text-sm font-semibold text-[#0F0B07] bg-[#22C55E] hover:bg-[#22C55E]/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1.5 whitespace-nowrap"
              >
                <Send size={14} />
                Publish Selected
              </button>
              <button
                type="button"
                onClick={() => handleBulkClick('archived')}
                disabled={isBulking}
                className="px-3 py-1.5 rounded-lg text-sm font-semibold text-[#F5E9D6] bg-[#0F0B07] border border-[#A1866B]/40 hover:bg-black/30 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1.5 whitespace-nowrap"
              >
                <Archive size={14} />
                Archive Selected
              </button>
            </div>

            <button
              type="button"
              onClick={clearSelection}
              disabled={isBulking}
              className="ml-auto text-xs text-[#A1866B] hover:text-[#F5E9D6] underline underline-offset-2 transition-colors whitespace-nowrap disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Clear selection
            </button>
          </div>
        )}

        {/* Loading Overlay */}
        {isPending && (
          <div className="absolute inset-0 bg-[#1A140E]/50 backdrop-blur-sm z-10 flex items-center justify-center">
            <Loader2 className="animate-spin text-[#D4AF37]" size={32} />
          </div>
        )}

        {/* Table */}
        <div className="overflow-x-auto min-h-[400px] relative">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-[#0F0B07]/50 text-[#A1866B] text-xs uppercase tracking-wider border-b border-[rgba(255,255,255,0.05)]">
                <th className="p-4 font-medium w-10 text-center">
                  <span className="sr-only">Select exam sets</span>
                  <input
                    ref={headerCheckboxRef}
                    type="checkbox"
                    aria-label="Select all exam sets on this page"
                    aria-checked={someSelected ? 'mixed' : allSelected}
                    checked={allSelected}
                    onChange={(e) => handleTogglePage(e.target.checked)}
                    disabled={examSets.length === 0}
                    className="w-4 h-4 rounded border-[rgba(255,255,255,0.2)] bg-[#1A140E] checked:bg-[#D4AF37] checked:border-[#D4AF37] focus:ring-[#D4AF37] focus:ring-offset-[#0F0B07] transition-colors cursor-pointer disabled:cursor-not-allowed"
                  />
                </th>
                <th className="p-4 font-medium w-[26%]">Exam Name</th>
                <th className="p-4 font-medium">Package</th>
                <th className="p-4 font-medium">Status</th>
                <th className="p-4 font-medium">Exam Type</th>
                <th className="p-4 font-medium">Subject / Document</th>
                <th className="p-4 font-medium text-center">Questions</th>
                <th className="p-4 font-medium text-center">Duration</th>
                <th className="p-4 font-medium">Type</th>
                <th className="p-4 font-medium">Updated</th>
                <th className="p-4 font-medium text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[rgba(255,255,255,0.02)]">
              {examSets.length === 0 ? (
                <tr>
                  <td colSpan={11} className="p-12 text-center text-[#A1866B]">
                    {isAnyFilterActive
                      ? 'No exam sets match the current filters.'
                      : 'No exam sets found.'}
                  </td>
                </tr>
              ) : examSets.map((set) => {
                // Status defaults to 'draft' at the DB (migration 026); coerce
                // null/undefined defensively so the transitions map always keys.
                const status: ExamSetStatus = (set.status as ExamSetStatus) || 'draft'
                const transitions = TRANSITIONS[status] || []
                const isSelected = selectedIds.has(set.id)
                return (
                <tr
                  key={set.id}
                  aria-selected={isSelected}
                  className="hover:bg-[#D4AF37]/[0.02] transition-colors"
                >
                  <td className="p-4 text-center">
                    {/* Row checkbox lives in its own cell — it is NOT nested in
                        any <Link>/button, so no stopPropagation is needed. */}
                    <input
                      type="checkbox"
                      aria-label={`Select exam set ${set.name}`}
                      checked={isSelected}
                      onChange={() => handleToggleRow(set.id)}
                      className="w-4 h-4 rounded border-[rgba(255,255,255,0.2)] bg-[#1A140E] checked:bg-[#D4AF37] checked:border-[#D4AF37] focus:ring-[#D4AF37] focus:ring-offset-[#0F0B07] transition-colors cursor-pointer"
                    />
                  </td>
                  <td className="p-4">
                    <div className="text-[#F5E9D6] font-medium">{set.name}</div>
                    <div className="text-[#A1866B] text-xs mt-1 truncate max-w-[250px]">{set.description || 'No description'}</div>
                  </td>
                  <td className="p-4">
                    <span className="text-[#A1866B] text-xs px-2 py-1 bg-[#0F0B07] rounded-lg border border-[rgba(255,255,255,0.05)] whitespace-nowrap">
                      {set.package_name}
                    </span>
                  </td>
                  <td className="p-4">
                    <StatusBadge status={status} />
                  </td>
                  <td className="p-4">
                    <span className="text-xs text-[#A1866B] capitalize">{set.exam_type || 'document'}</span>
                  </td>
                  <td className="p-4">
                    <div className="text-xs text-[#F5E9D6]">
                      {set.subject ? getSubjectLabel(set.subject) : <span className="text-[#A1866B]/60">—</span>}
                    </div>
                    <div className="text-[10px] text-[#A1866B] mt-0.5 truncate max-w-[160px]">
                      {set.document || <span className="text-[#A1866B]/60">—</span>}
                    </div>
                  </td>
                  <td className="p-4 text-center">
                    <span className="text-[#F5E9D6] font-bold">{set.question_count}</span>
                  </td>
                  <td className="p-4 text-center text-[#A1866B] text-sm">
                    {set.duration_minutes}m
                  </td>
                  <td className="p-4">
                    {set.is_sample ? (
                      <span className="text-xs font-bold text-[#EAB308] bg-[#EAB308]/10 px-2 py-1 rounded">Sample</span>
                    ) : (
                      <span className="text-xs font-bold text-[#22C55E] bg-[#22C55E]/10 px-2 py-1 rounded">Full</span>
                    )}
                  </td>
                  <td className="p-4 text-xs text-[#A1866B] whitespace-nowrap">
                    {set.updated_at ? new Date(set.updated_at).toLocaleDateString() : '—'}
                  </td>
                  <td className="p-4 text-right">
                    <div className="flex items-center justify-end gap-1 flex-wrap">
                      {/* Lifecycle transitions — server-authoritative, no client
                          validation. Each opens the confirm dialog. Hidden when
                          there are none for the current status (e.g. archived has
                          only Restore). */}
                      {transitions.map(t => {
                        const Icon = t.icon
                        return (
                          <button
                            key={t.to}
                            type="button"
                            onClick={() => handleStatusClick(set.id, set.name, t)}
                            className={`p-2 transition-colors rounded-lg ${t.className}`}
                            title={t.verb}
                          >
                            <Icon size={16} />
                          </button>
                        )
                      })}
                      <Link href={`/admin/exam-sets/${set.id}/edit`}>
                        <button type="button" className="p-2 text-[#A1866B] hover:text-[#D4AF37] transition-colors rounded-lg hover:bg-[#D4AF37]/10" title="Edit">
                          <Edit size={16} />
                        </button>
                      </Link>
                      <button type="button"
                        onClick={() => handleDeleteClick(set.id, set.name)}
                        className="p-2 text-[#A1866B] hover:text-red-400 transition-colors rounded-lg hover:bg-red-400/10"
                        title="Delete"
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </td>
                </tr>
                )
              })}
            </tbody>
          </table>
        </div>

        {/* Screen-reader announcement of selection size (mirrors
            SummaryLibraryTable a11y precedent). */}
        <div className="sr-only" aria-live="polite">
          {selectedCount > 0 ? `${selectedCount} exam set${selectedCount === 1 ? '' : 's'} selected` : 'No exam sets selected'}
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="p-4 border-t border-[rgba(255,255,255,0.05)] flex items-center justify-between">
            <div className="text-sm text-[#A1866B]">
              Page <span className="text-[#F5E9D6] font-medium">{currentPage}</span> of <span className="text-[#F5E9D6] font-medium">{totalPages}</span>
            </div>
            <div className="flex items-center gap-2">
              <button type="button" 
                onClick={() => updateParams({ page: String(currentPage - 1) })}
                disabled={currentPage <= 1 || isPending}
                className="p-2 rounded-lg bg-[#0F0B07] border border-[rgba(255,255,255,0.1)] text-[#F5E9D6] disabled:opacity-50 disabled:cursor-not-allowed hover:bg-[rgba(255,255,255,0.05)] transition-colors"
              >
                <ChevronLeft size={16} />
              </button>
              <button type="button" 
                onClick={() => updateParams({ page: String(currentPage + 1) })}
                disabled={currentPage >= totalPages || isPending}
                className="p-2 rounded-lg bg-[#0F0B07] border border-[rgba(255,255,255,0.1)] text-[#F5E9D6] disabled:opacity-50 disabled:cursor-not-allowed hover:bg-[rgba(255,255,255,0.05)] transition-colors"
              >
                <ChevronRight size={16} />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Delete Modal */}
      <ConfirmDialog
        isOpen={deleteModalOpen}
        onClose={() => !isDeleting && setDeleteModalOpen(false)}
        onConfirm={confirmDelete}
        title="ลบชุดข้อสอบ"
        description={
          <div className="space-y-2 text-[#F5E9D6]">
            <div>คุณกำลังจะลบชุดข้อสอบ: <span className="text-red-400 font-medium">{setToActOn?.name}</span></div>
            <p className="text-red-400 text-xs">การลบชุดข้อสอบจะลบข้อมูลที่เกี่ยวข้องทั้งหมดแบบถาวร ไม่สามารถกู้คืนได้</p>
          </div>
        }
        confirmText="ลบชุดข้อสอบถาวร"
        cancelText="ยกเลิก"
        isDestructive={true}
        isLoading={isDeleting}
      />

      {/* Status Transition Modal — shared by Publish / Revert / Archive / Restore.
          No client-side validation: the description explains what will happen,
          and the server (validate_exam_set_for_publish RPC) is authoritative.
          For Publish specifically, validation failures (no questions, duplicate
          order, etc.) surface as a toast after confirm, straight from the RPC. */}
      <ConfirmDialog
        isOpen={!!statusTarget}
        onClose={() => !isStatusChanging && setStatusTarget(null)}
        onConfirm={confirmStatusChange}
        title={statusTarget ? `${statusTarget.transition.verb} Exam Set` : ''}
        description={
          <div className="space-y-2 text-[#F5E9D6]">
            <div>{statusTarget?.transition.verb}: <span className="text-[#D4AF37] font-medium">{statusTarget?.name}</span></div>
            {statusTarget?.transition.to === 'published' ? (
              <p className="text-[#A1866B] text-xs">
                Publishing runs the server's publish-rule check: the set must contain at least one question, no duplicate questions, and unique display order. If any rule fails, the status will not change and the reason will be shown.
              </p>
            ) : (
              <p className="text-[#A1866B] text-xs">This changes the Exam Set status. You can change it again later.</p>
            )}
          </div>
        }
        confirmText={statusTarget?.transition.verb || 'Confirm'}
        cancelText="ยกเลิก"
        isDestructive={statusTarget?.transition.to === 'archived'}
        isLoading={isStatusChanging}
      />

      {/* Bulk Action Modal (Phase 3A) — shared by Bulk Publish / Bulk Archive.
          Shows the count and the names (truncated when many). For Publish,
          explains the server will re-check each set's publish rules. For
          Archive, warns that archived sets vanish from public exam pages
          immediately and may affect users currently accessing them. The
          server is authoritative; per-item outcomes surface as toasts. */}
      <ConfirmDialog
        isOpen={!!bulkTarget}
        onClose={() => !isBulking && setBulkTarget(null)}
        onConfirm={confirmBulkAction}
        title={
          bulkTarget
            ? `${bulkTarget.target === 'published' ? 'Publish' : 'Archive'} ${bulkTarget.ids.length} Exam Set${bulkTarget.ids.length === 1 ? '' : 's'}`
            : ''
        }
        description={
          <div className="space-y-2 text-[#F5E9D6]">
            <div>
              {bulkTarget?.target === 'published' ? 'Publish' : 'Archive'}{' '}
              <span className="text-[#D4AF37] font-medium">{bulkTarget?.ids.length}</span>{' '}
              {bulkTarget?.ids.length === 1 ? 'Exam Set' : 'Exam Sets'}:
            </div>
            <div className="text-xs text-[#F5E9D6] bg-[#0F0B07]/60 rounded-lg px-3 py-2 max-h-24 overflow-y-auto">
              {(bulkTarget?.names ?? [])
                .slice(0, 6)
                .map((n, i) => (
                  <div key={i} className="truncate">{n}</div>
                ))}
              {(bulkTarget?.names.length ?? 0) > 6 && (
                <div className="text-[#A1866B] italic">
                  และอีก {(bulkTarget!.names.length - 6)} ชุด
                </div>
              )}
            </div>
            {bulkTarget?.target === 'published' ? (
              <p className="text-[#A1866B] text-xs">
                The server re-checks each set's publish rules (at least one question, no duplicate questions, unique display order). Sets that fail are reported, not published.
              </p>
            ) : (
              <p className="text-red-400 text-xs">
                Archived Exam Sets become unavailable on public exam pages immediately and may affect users currently accessing those sets. You can restore a set to draft individually later.
              </p>
            )}
          </div>
        }
        confirmText={
          bulkTarget?.target === 'published' ? 'Publish Selected' : 'Archive Selected'
        }
        cancelText="ยกเลิก"
        isDestructive={bulkTarget?.target === 'archived'}
        isLoading={isBulking}
      />

    </div>
  )
}
