'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import {
  ChevronLeft,
  ChevronRight,
  Edit,
  Eye,
  EyeOff,
  GitCompare,
  Loader2,
  Trash2,
} from 'lucide-react'
import Link from 'next/link'

import {
  setSummaryLibraryPageSelection,
  toggleSummaryLibrarySelection,
  validateSummaryLibraryComparisonSelection,
} from '@/lib/application/knowledge-platform'
import type {
  SummaryLibraryComparisonSelectionError,
  SummaryLibrarySelectionCandidate,
  SummaryLibrarySelectionReference,
} from '@/lib/application/knowledge-platform'
import {
  UNASSIGNED_SUBJECT,
  getSubjectLabel,
  isUnassignedSubject,
} from '@/lib/subjects'
import { getSummaryWorkspaceHref } from './summary-library-navigation'

export interface SummaryLibraryTableRow {
  readonly id: string
  readonly title: string
  readonly slug: string | null
  readonly packageName: string | null
  readonly packageNames: readonly string[]
  readonly subject: string | null
  readonly document: string | null
  readonly topic: string | null
  readonly sortOrder: number | null
  readonly isPublished: boolean
  readonly selection: SummaryLibrarySelectionCandidate
}

export interface SummaryLibraryTableProps {
  readonly rows: readonly SummaryLibraryTableRow[]
  readonly totalPages: number
  readonly currentPage: number
  readonly isPending: boolean
  readonly actingOnId: string | null
  readonly onPageChange: (page: number) => void
  readonly onTogglePublish: (id: string, isPublished: boolean) => void
  readonly onRequestDelete: (id: string) => void
}

function subjectLabel(subject: string | null): string {
  return isUnassignedSubject(subject)
    ? UNASSIGNED_SUBJECT.label
    : getSubjectLabel(subject)
}

function packageLabel(row: SummaryLibraryTableRow): string {
  const names = row.packageNames.length > 0
    ? row.packageNames
    : row.packageName
      ? [row.packageName]
      : []
  if (names.length === 0) return 'Unknown Package'
  return names.length === 1 ? names[0]! : `${names[0]} +${names.length - 1}`
}

function packageTitle(row: SummaryLibraryTableRow): string {
  const names = row.packageNames.length > 0
    ? row.packageNames
    : row.packageName
      ? [row.packageName]
      : []
  return names.length > 0 ? names.join(', ') : 'Unknown Package'
}

function selectionErrorMessage(
  error: SummaryLibraryComparisonSelectionError
): string {
  switch (error) {
    case 'requires_two':
      return 'Select exactly two summaries to compare.'
    case 'too_many':
      return 'Comparison is limited to two summaries.'
    case 'duplicate':
      return 'The comparison selection contains a duplicate Summary.'
    case 'unavailable':
      return 'One selected Summary is no longer available.'
    case 'unauthorized':
      return 'One selected Summary is not available to your account.'
  }
}

function SelectionCheckbox({
  label,
  checked,
  onChange,
  inputRef,
  ariaChecked,
}: {
  readonly label: string
  readonly checked: boolean
  readonly onChange: (checked: boolean) => void
  readonly inputRef?: (element: HTMLInputElement | null) => void
  readonly ariaChecked?: boolean | 'mixed'
}) {
  return (
    <input
      ref={inputRef}
      type="checkbox"
      aria-label={label}
      aria-checked={ariaChecked}
      checked={checked}
      onChange={(event) => onChange(event.target.checked)}
      className="h-4 w-4 cursor-pointer rounded border-[rgba(255,255,255,0.2)] bg-[#1A140E] accent-[#D4AF37] focus:ring-[#D4AF37] focus:ring-offset-[#0F0B07]"
    />
  )
}

function PublicationControl({
  row,
  actingOnId,
  onTogglePublish,
}: {
  readonly row: SummaryLibraryTableRow
  readonly actingOnId: string | null
  readonly onTogglePublish: (id: string, isPublished: boolean) => void
}) {
  const isActing = actingOnId === row.id

  return (
    <button
      type="button"
      onClick={() => onTogglePublish(row.id, row.isPublished)}
      disabled={isActing}
      aria-label={`${row.isPublished ? 'Unpublish' : 'Publish'} ${row.title}`}
      className={`inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs font-bold transition-colors disabled:opacity-50 ${
        row.isPublished
          ? 'border-[#22C55E]/30 bg-[#22C55E]/10 text-[#22C55E] hover:bg-[#22C55E]/20'
          : 'border-[rgba(255,255,255,0.1)] bg-[rgba(255,255,255,0.05)] text-[#A1866B] hover:bg-[rgba(255,255,255,0.1)]'
      }`}
    >
      {isActing ? (
        <Loader2 size={12} className="animate-spin" aria-hidden="true" />
      ) : row.isPublished ? (
        <Eye size={12} aria-hidden="true" />
      ) : (
        <EyeOff size={12} aria-hidden="true" />
      )}
      {row.isPublished ? 'Published' : 'Draft'}
    </button>
  )
}

function Classification({ row }: { readonly row: SummaryLibraryTableRow }) {
  return (
    <div className="flex flex-col gap-1">
      {isUnassignedSubject(row.subject) ? (
        <span className="text-xs italic text-[#A1866B]/60">
          {UNASSIGNED_SUBJECT.label}
        </span>
      ) : (
        <span className="w-max whitespace-nowrap rounded-lg border border-[#D4AF37]/20 bg-[#D4AF37]/10 px-2 py-1 text-xs text-[#F5E9D6]">
          {subjectLabel(row.subject)}
        </span>
      )}
      {row.document ? (
        <span
          className="max-w-[180px] truncate text-[11px] text-[#A1866B]"
          title={row.document}
        >
          {row.document}
        </span>
      ) : (
        <span className="text-[10px] italic text-[#A1866B]/40">ไม่มี Document</span>
      )}
      {row.topic && (
        <span className="text-[10px] font-bold uppercase tracking-wider text-[#A1866B]">
          {row.topic}
        </span>
      )}
    </div>
  )
}

export default function SummaryLibraryTable({
  rows,
  totalPages,
  currentPage,
  isPending,
  actingOnId,
  onPageChange,
  onTogglePublish,
  onRequestDelete,
}: SummaryLibraryTableProps) {
  const [selectedReferences, setSelectedReferences] = useState<
    readonly SummaryLibrarySelectionReference[]
  >([])
  const [selectionAnnouncement, setSelectionAnnouncement] = useState('')
  const selectPageRef = useRef<HTMLInputElement>(null)

  const selectedIds = useMemo(
    () => new Set(selectedReferences.map((reference) => reference.summaryId)),
    [selectedReferences]
  )
  const pageReferences = useMemo(
    () => rows.map((row) => row.selection),
    [rows]
  )
  const selectedPageCount = rows.reduce(
    (count, row) => count + (selectedIds.has(row.id) ? 1 : 0),
    0
  )
  const allPageSelected = rows.length > 0 && selectedPageCount === rows.length
  const somePageSelected = selectedPageCount > 0 && !allPageSelected

  useEffect(() => {
    if (selectPageRef.current) {
      selectPageRef.current.indeterminate = somePageSelected
    }
  }, [somePageSelected])

  const selectedCandidates = useMemo(() => {
    const rowsById = new Map(rows.map((row) => [row.id, row.selection]))
    return selectedReferences.map((reference) => {
      return rowsById.get(reference.summaryId) ?? {
        ...reference,
        isAvailable: false,
        isAuthorized: false,
      }
    })
  }, [rows, selectedReferences])

  const comparisonValidation = useMemo(
    () => validateSummaryLibraryComparisonSelection(selectedCandidates),
    [selectedCandidates]
  )
  const comparisonHasRevisionReferences = selectedCandidates.every(
    (candidate) => candidate.revisionId !== null
  )
  const comparisonDisabled =
    !comparisonValidation.valid || !comparisonHasRevisionReferences
  const comparisonMessage = !comparisonValidation.valid
    ? selectionErrorMessage(comparisonValidation.error)
    : comparisonHasRevisionReferences
      ? 'Revision comparison will open when the revision workspace is available.'
      : 'Comparison requires revision references; legacy rows remain selectable during migration.'

  const updateSelection = (
    next: readonly SummaryLibrarySelectionReference[],
    message: string
  ) => {
    setSelectedReferences(next)
    setSelectionAnnouncement(message)
  }

  const handleToggleSelection = (row: SummaryLibraryTableRow) => {
    if (!row.selection.isAvailable) {
      setSelectionAnnouncement(`${row.title} is no longer available.`)
      return
    }
    if (!row.selection.isAuthorized) {
      setSelectionAnnouncement(`${row.title} is not available to your account.`)
      return
    }

    const next = toggleSummaryLibrarySelection(selectedReferences, row.selection)
    updateSelection(
      next,
      next.some((reference) => reference.summaryId === row.id)
        ? `${row.title} selected.`
        : `${row.title} removed from selection.`
    )
  }

  const handlePageSelection = (selected: boolean) => {
    const next = setSummaryLibraryPageSelection(
      selectedReferences,
      pageReferences,
      selected
    )
    updateSelection(
      next,
      selected
        ? `${rows.length} summaries selected on this page.`
        : `Selection cleared for this page.`
    )
  }

  const handleDeleteRequest = (id: string) => {
    const next = selectedReferences.filter(
      (reference) => reference.summaryId !== id
    )
    if (next.length !== selectedReferences.length) {
      setSelectedReferences(next)
      setSelectionAnnouncement('Deleted Summary removed from selection.')
    }
    onRequestDelete(id)
  }

  return (
    <div className="relative">
      <div className="sr-only" aria-live="polite">
        {selectionAnnouncement}
      </div>

      {selectedReferences.length > 0 && (
        <section
          aria-label="Summary selection toolbar"
          className="flex flex-col gap-3 border-b border-[rgba(255,255,255,0.05)] bg-[#0F0B07]/60 p-4 sm:flex-row sm:items-center sm:justify-between"
        >
          <div>
            <p className="text-sm font-bold text-[#F5E9D6]" aria-live="polite">
              {selectedReferences.length} summaries selected
            </p>
            <p id="summary-comparison-help" className="text-xs text-[#A1866B]">
              {comparisonMessage}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              disabled={comparisonDisabled}
              aria-describedby="summary-comparison-help"
              title={comparisonMessage}
              className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-[#D4AF37]/30 px-3 py-2 text-sm font-bold text-[#D4AF37] transition-colors hover:bg-[#D4AF37]/10 disabled:cursor-not-allowed disabled:opacity-40"
            >
              <GitCompare size={16} aria-hidden="true" />
              Compare selected
            </button>
            <button
              type="button"
              onClick={() => updateSelection([], 'Summary selection cleared.')}
              className="min-h-10 rounded-xl px-3 py-2 text-sm text-[#A1866B] underline decoration-[#D4AF37]/40 underline-offset-2 hover:text-[#D4AF37]"
            >
              Clear selection
            </button>
          </div>
        </section>
      )}

      {isPending && (
        <div className="absolute inset-0 z-10 flex items-center justify-center bg-[#1A140E]/50 backdrop-blur-sm">
          <Loader2 className="animate-spin text-[#D4AF37]" size={32} aria-label="Loading summaries" />
        </div>
      )}

      <div className="relative hidden min-h-[400px] overflow-x-auto md:block">
        <table className="w-full border-collapse text-left" aria-label="Summary library">
          <thead>
            <tr className="border-b border-[rgba(255,255,255,0.05)] bg-[#0F0B07]/50 text-xs uppercase tracking-wider text-[#A1866B]">
              <th scope="col" className="w-12 p-4 text-center">
                <SelectionCheckbox
                  label="Select all summaries on this page"
                  checked={allPageSelected}
                  onChange={handlePageSelection}
                  ariaChecked={somePageSelected ? 'mixed' : allPageSelected}
                  inputRef={(element) => {
                    selectPageRef.current = element
                  }}
                />
              </th>
              <th scope="col" className="w-12 p-4 text-center font-medium">Order</th>
              <th scope="col" className="p-4 font-medium">Title &amp; Slug</th>
              <th scope="col" className="p-4 font-medium">Package</th>
              <th scope="col" className="p-4 font-medium">Subject / Document</th>
              <th scope="col" className="p-4 font-medium">Status</th>
              <th scope="col" className="p-4 text-right font-medium">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[rgba(255,255,255,0.02)]">
            {rows.length === 0 ? (
              <tr>
                <td colSpan={7} className="p-12 text-center text-[#A1866B]">
                  No summaries found.
                </td>
              </tr>
            ) : rows.map((row) => {
              const isSelected = selectedIds.has(row.id)
              const workspaceHref = getSummaryWorkspaceHref(row.id)

              return (
                <tr
                  key={row.id}
                  aria-selected={isSelected}
                  className={`transition-colors hover:bg-[#D4AF37]/[0.02] ${isSelected ? 'bg-[#D4AF37]/[0.04]' : ''}`}
                >
                  <td className="p-4 text-center">
                    <SelectionCheckbox
                      label={`Select summary ${row.title}`}
                      checked={isSelected}
                      onChange={() => handleToggleSelection(row)}
                    />
                  </td>
                  <td className="p-4 text-center text-sm text-[#A1866B]">
                    {row.sortOrder ?? '—'}
                  </td>
                  <td className="p-4">
                    <Link
                      href={workspaceHref}
                      className="text-sm font-medium text-[#F5E9D6] underline-offset-2 hover:text-[#D4AF37] hover:underline"
                      aria-label={`Open workspace for ${row.title}`}
                    >
                      {row.title}
                    </Link>
                    <div className="mt-0.5 text-xs text-[#A1866B]">
                      {row.slug ? `/${row.slug}` : '—'}
                    </div>
                  </td>
                  <td className="p-4">
                    <div className="max-w-[200px] truncate text-sm text-[#F5E9D6]">
                      <span title={packageTitle(row)}>{packageLabel(row)}</span>
                    </div>
                  </td>
                  <td className="p-4"><Classification row={row} /></td>
                  <td className="p-4">
                    <PublicationControl
                      row={row}
                      actingOnId={actingOnId}
                      onTogglePublish={onTogglePublish}
                    />
                  </td>
                  <td className="p-4 text-right">
                    <div className="flex items-center justify-end gap-2">
                      <Link
                        href={workspaceHref}
                        className="rounded-lg p-2 text-[#A1866B] transition-colors hover:bg-[#D4AF37]/10 hover:text-[#D4AF37]"
                        title="Open workspace"
                        aria-label={`Open workspace for ${row.title}`}
                      >
                        <Edit size={16} aria-hidden="true" />
                      </Link>
                      <button
                        type="button"
                        onClick={() => handleDeleteRequest(row.id)}
                        disabled={actingOnId === row.id}
                        className="rounded-lg p-2 text-[#A1866B] transition-colors hover:bg-red-400/10 hover:text-red-400 disabled:opacity-50"
                        title="Delete"
                        aria-label={`Delete ${row.title}`}
                      >
                        {actingOnId === row.id ? (
                          <Loader2 size={16} className="animate-spin" aria-hidden="true" />
                        ) : (
                          <Trash2 size={16} aria-hidden="true" />
                        )}
                      </button>
                    </div>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      <div className="grid min-h-[400px] gap-3 p-3 md:hidden" aria-label="Summary cards">
        {rows.length === 0 ? (
          <div className="flex min-h-[360px] items-center justify-center text-center text-[#A1866B]">
            No summaries found.
          </div>
        ) : rows.map((row) => {
          const isSelected = selectedIds.has(row.id)
          const workspaceHref = getSummaryWorkspaceHref(row.id)

          return (
            <article
              key={row.id}
              aria-selected={isSelected}
              className={`rounded-2xl border p-4 transition-colors ${isSelected ? 'border-[#D4AF37]/60 bg-[#D4AF37]/[0.06]' : 'border-[rgba(255,255,255,0.06)] bg-[#0F0B07]'}`}
            >
              <div className="flex items-start gap-3">
                <div className="pt-1">
                  <SelectionCheckbox
                    label={`Select summary ${row.title}`}
                    checked={isSelected}
                    onChange={() => handleToggleSelection(row)}
                  />
                </div>
                <div className="min-w-0 flex-1">
                  <Link
                    href={workspaceHref}
                    className="text-sm font-bold text-[#F5E9D6] hover:text-[#D4AF37]"
                    aria-label={`Open workspace for ${row.title}`}
                  >
                    {row.title}
                  </Link>
                  <p className="mt-0.5 truncate text-xs text-[#A1866B]">
                    {row.slug ? `/${row.slug}` : '—'}
                  </p>
                </div>
                <PublicationControl
                  row={row}
                  actingOnId={actingOnId}
                  onTogglePublish={onTogglePublish}
                />
              </div>

              <div className="mt-4 grid grid-cols-2 gap-3 border-t border-[rgba(255,255,255,0.06)] pt-3 text-xs">
                <div>
                  <p className="text-[#A1866B]">Package</p>
                  <p className="mt-1 truncate text-[#F5E9D6]" title={packageTitle(row)}>{packageLabel(row)}</p>
                </div>
                <div>
                  <p className="text-[#A1866B]">Order</p>
                  <p className="mt-1 text-[#F5E9D6]">{row.sortOrder ?? '—'}</p>
                </div>
                <div className="col-span-2">
                  <p className="mb-1 text-[#A1866B]">Subject / Document</p>
                  <Classification row={row} />
                </div>
              </div>

              <div className="mt-4 flex items-center justify-end gap-2 border-t border-[rgba(255,255,255,0.06)] pt-3">
                <Link
                  href={workspaceHref}
                  className="min-h-10 rounded-xl border border-[rgba(255,255,255,0.1)] px-3 py-2 text-sm font-medium text-[#F5E9D6] hover:border-[#D4AF37]/50 hover:text-[#D4AF37]"
                >
                  Open workspace
                </Link>
                <button
                  type="button"
                  onClick={() => handleDeleteRequest(row.id)}
                  disabled={actingOnId === row.id}
                  className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-red-400/20 px-3 py-2 text-sm font-medium text-red-300 hover:bg-red-400/10 disabled:opacity-50"
                  aria-label={`Delete ${row.title}`}
                >
                  {actingOnId === row.id ? (
                    <Loader2 size={15} className="animate-spin" aria-hidden="true" />
                  ) : (
                    <Trash2 size={15} aria-hidden="true" />
                  )}
                  Delete
                </button>
              </div>
            </article>
          )
        })}
      </div>

      {totalPages > 1 && (
        <div className="flex items-center justify-between border-t border-[rgba(255,255,255,0.05)] p-4">
          <div className="text-sm text-[#A1866B]">
            Page <span className="font-medium text-[#F5E9D6]">{currentPage}</span> of{' '}
            <span className="font-medium text-[#F5E9D6]">{totalPages}</span>
          </div>
          <nav className="flex items-center gap-2" aria-label="Summary library pagination">
            <button
              type="button"
              onClick={() => onPageChange(currentPage - 1)}
              disabled={currentPage <= 1 || isPending}
              aria-label="Previous summaries page"
              className="rounded-lg border border-[rgba(255,255,255,0.1)] bg-[#0F0B07] p-2 text-[#F5E9D6] hover:bg-[rgba(255,255,255,0.05)] disabled:opacity-50"
            >
              <ChevronLeft size={16} aria-hidden="true" />
            </button>
            <button
              type="button"
              onClick={() => onPageChange(currentPage + 1)}
              disabled={currentPage >= totalPages || isPending}
              aria-label="Next summaries page"
              className="rounded-lg border border-[rgba(255,255,255,0.1)] bg-[#0F0B07] p-2 text-[#F5E9D6] hover:bg-[rgba(255,255,255,0.05)] disabled:opacity-50"
            >
              <ChevronRight size={16} aria-hidden="true" />
            </button>
          </nav>
        </div>
      )}
    </div>
  )
}
