'use client'

import { useRouter, usePathname } from 'next/navigation'
import { useState, useTransition, useCallback, useEffect, useRef } from 'react'
import { Search, Plus, UploadCloud, X } from 'lucide-react'
import Link from 'next/link'
import { toggleSummaryPublish, deleteSummary } from './actions'
import ConfirmDialog from '@/components/admin/ConfirmDialog'
import SummaryLibraryTable, { type SummaryLibraryTableRow } from '@/components/admin/SummaryLibraryTable'
import { toastEvent } from '@/hooks/useToast'
import { getSubjectDropdownOptions, getSubjectLabel, isUnassignedSubject, UNASSIGNED_SUBJECT } from '@/lib/subjects'

interface SummariesClientProps {
  summaries: any[]
  packages: any[]
  totalPages: number
  currentPage: number
  search: string
  packageFilter: string
  statusFilter: string
  subjectFilter: string
  documentFilter: string
  uniqueDocuments: string[]
  sortKey: string
  sortDirection: 'asc' | 'desc'
}

export default function SummariesClient({
  summaries,
  packages,
  totalPages,
  currentPage,
  search,
  packageFilter,
  statusFilter,
  subjectFilter,
  documentFilter,
  uniqueDocuments,
  sortKey,
  sortDirection,
}: SummariesClientProps) {
  const router = useRouter()
  const pathname = usePathname()
  const [isPending, startTransition] = useTransition()
  
  const [searchInput, setSearchInput] = useState(search)
  const [actingOnId, setActingOnId] = useState<string | null>(null)
  const [deleteModal, setDeleteModal] = useState<{ isOpen: boolean, summaryId: string | null }>({ isOpen: false, summaryId: null })
  const lastCommittedSearch = useRef(search)

  const updateParams = useCallback((updates: Record<string, string>) => {
    const params = new URLSearchParams(window.location.search)
    Object.entries(updates).forEach(([key, value]) => {
      if (value) params.set(key, value)
      else params.delete(key)
    })
    if (!updates.page) params.set('page', '1')

    startTransition(() => {
      router.push(`${pathname}?${params.toString()}`)
    })
  }, [pathname, router])

  useEffect(() => {
    if (search !== lastCommittedSearch.current) {
      setSearchInput(search)
      lastCommittedSearch.current = search
    }
  }, [search])

  useEffect(() => {
    if (searchInput === search || lastCommittedSearch.current === searchInput) return

    const timeoutId = window.setTimeout(() => {
      lastCommittedSearch.current = searchInput
      updateParams({ q: searchInput })
    }, 400)

    return () => window.clearTimeout(timeoutId)
  }, [searchInput, search, updateParams])

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    lastCommittedSearch.current = searchInput
    updateParams({ q: searchInput })
  }

  const clearFilters = () => {
    updateParams({ q: '', package: '', status: '', subject: '', document: '' })
  }

  const activeFilters: Array<{ key: string; label: string }> = []
  if (search) activeFilters.push({ key: 'q', label: `Search: ${search}` })
  if (packageFilter) {
    const packageName = packages.find((item) => item.id === packageFilter)?.name ?? packageFilter
    activeFilters.push({ key: 'package', label: `Package: ${packageName}` })
  }
  if (statusFilter) {
    activeFilters.push({
      key: 'status',
      label: `Status: ${statusFilter === 'published' ? 'Published' : 'Draft'}`,
    })
  }
  if (subjectFilter) {
    activeFilters.push({
      key: 'subject',
      label: `Subject: ${isUnassignedSubject(subjectFilter) ? UNASSIGNED_SUBJECT.label : getSubjectLabel(subjectFilter)}`,
    })
  }
  if (documentFilter) {
    activeFilters.push({ key: 'document', label: `Document: ${documentFilter}` })
  }

  const handleTogglePublish = async (id: string, isPublished: boolean) => {
    setActingOnId(id)
    try {
      const result = await toggleSummaryPublish(id, !isPublished)
      if (!result.success) {
        toastEvent(result.error || 'ไม่สามารถเปลี่ยนสถานะสรุปได้', 'error')
        return
      }

      toastEvent(
        result.outcome === 'unpublished'
          ? 'ยกเลิกการเผยแพร่สรุปเรียบร้อยแล้ว'
          : 'เผยแพร่สรุปเรียบร้อยแล้ว',
        'success',
      )
      router.refresh()
    } catch (error) {
      toastEvent(
        error instanceof Error ? error.message : 'ไม่สามารถเปลี่ยนสถานะสรุปได้',
        'error',
      )
    } finally {
      setActingOnId(null)
    }
  }

  const handleDelete = async () => {
    if (!deleteModal.summaryId) return
    const summaryId = deleteModal.summaryId
    setActingOnId(summaryId)
    setDeleteModal({ isOpen: false, summaryId: null })
    try {
      const result = await deleteSummary(summaryId)
      if (!result.success) {
        toastEvent(result.error || 'ลบสรุปไม่สำเร็จ', 'error')
        return
      }

      toastEvent('ลบสรุปเรียบร้อยแล้ว', 'success')
      router.refresh()
    } catch (error) {
      toastEvent(
        error instanceof Error ? error.message : 'ลบสรุปไม่สำเร็จ',
        'error',
      )
    } finally {
      setActingOnId(null)
    }
  }

  const libraryRows: SummaryLibraryTableRow[] = summaries.map((summary) => ({
    id: summary.id,
    title: summary.title,
    slug: summary.slug ?? null,
    packageName: summary.package_name ?? null,
    packageNames: Array.isArray(summary.package_names)
      ? summary.package_names.filter((name: unknown): name is string => typeof name === 'string')
      : summary.package_name
        ? [summary.package_name]
        : [],
    subject: summary.subject ?? null,
    document: summary.document ?? null,
    topic: summary.topic ?? null,
    sortOrder: summary.sort_order ?? null,
    isPublished: Boolean(summary.is_published),
    selection: {
      summaryId: summary.id,
      // Legacy rows do not carry a Knowledge Platform revision reference yet.
      // Keep this null rather than deriving a false revision identity.
      revisionId: null,
      isAvailable: true,
      isAuthorized: true,
    },
  }))

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold font-display text-[#F5E9D6] tracking-tight">Summary Bank</h1>
          <p className="mt-1 text-sm text-[#A1866B]">Manage reading materials for learning packages.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Link 
            href="/admin/summaries/import"
            className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-[#D4AF37]/30 bg-[#0F0B07] px-4 py-2.5 text-sm font-bold text-[#D4AF37] transition-colors hover:border-[#D4AF37]"
          >
            <UploadCloud size={18} />
            Import Markdown
          </Link>
          <Link 
            href="/admin/summaries/create"
            className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-[#D4AF37] px-4 py-2.5 text-sm font-bold text-[#1A140E] transition-colors hover:bg-[#F1D17A]"
          >
            <Plus size={18} />
            Create Summary
          </Link>
        </div>
      </div>

      <div className="bg-[#1A140E] border border-[rgba(212,175,55,0.15)] rounded-2xl overflow-hidden shadow-xl">
        
        {/* Toolbar */}
        <div className="p-4 border-b border-[rgba(255,255,255,0.05)] flex flex-wrap gap-4 items-center">
          <form onSubmit={handleSearchSubmit} className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-[#A1866B]" size={18} aria-hidden="true" />
            <label htmlFor="summary-library-search" className="sr-only">Search summaries</label>
            <input
              id="summary-library-search"
              type="search"
              value={searchInput}
              maxLength={120}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="Search summaries by title..."
              className="w-full bg-[#0F0B07] border border-[rgba(255,255,255,0.1)] text-[#F5E9D6] rounded-xl pl-10 pr-4 py-2 text-sm focus:outline-none focus:border-[#D4AF37]/50 transition-colors placeholder:text-[#A1866B]/50"
            />
          </form>

          <div className="flex items-center gap-3">
            <label className="sr-only" htmlFor="package-filter-select">Filter by package</label>
            <select
              id="package-filter-select"
              aria-label="Filter summaries by package"
              value={packageFilter}
              onChange={(e) => updateParams({ package: e.target.value })}
              className="bg-[#0F0B07] border border-[rgba(255,255,255,0.1)] text-[#F5E9D6] rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-[#D4AF37]/50 max-w-[200px] truncate"
            >
              <option value="">All Packages</option>
              {packages.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>

            <label className="sr-only" htmlFor="subject-filter-select">Filter by subject</label>
            <select
              id="subject-filter-select"
              aria-label="Filter summaries by subject"
              value={subjectFilter}
              onChange={(e) => updateParams({ subject: e.target.value })}
              className="bg-[#0F0B07] border border-[rgba(255,255,255,0.1)] text-[#F5E9D6] rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-[#D4AF37]/50 max-w-[200px] truncate"
            >
              <option value="">All Subjects</option>
              {getSubjectDropdownOptions().map((opt) => (
                <option key={opt.code} value={opt.code}>{opt.label}</option>
              ))}
            </select>

            <label className="sr-only" htmlFor="document-filter-select">Filter by document</label>
            <select
              id="document-filter-select"
              aria-label="Filter summaries by document"
              value={documentFilter}
              onChange={(e) => updateParams({ document: e.target.value })}
              className="bg-[#0F0B07] border border-[rgba(255,255,255,0.1)] text-[#F5E9D6] rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-[#D4AF37]/50 max-w-[200px] truncate"
            >
              <option value="">All Documents</option>
              <option value={UNASSIGNED_SUBJECT.code}>{UNASSIGNED_SUBJECT.label}</option>
              {uniqueDocuments.map((doc) => <option key={doc} value={doc}>{doc}</option>)}
            </select>
          </div>
        </div>

        {/* Status Tabs — pill-toggle row matching Exam Sets */}
        <div
          role="group"
          aria-label="Filter by status"
          className="px-4 py-3 border-b border-[rgba(255,255,255,0.05)] flex flex-wrap gap-2 items-center"
        >
          <button
            type="button"
            onClick={() => updateParams({ status: '' })}
            aria-pressed={!statusFilter}
            className={`px-4 py-1.5 rounded-full text-sm font-bold border transition-colors whitespace-nowrap ${
              !statusFilter
                ? 'bg-[#D4AF37]/15 border-[#D4AF37] text-[#D4AF37]'
                : 'bg-[#1A140E] border-[rgba(255,255,255,0.1)] text-[#A1866B] hover:text-[#F5E9D6]'
            }`}
          >
            All
          </button>
          <button
            type="button"
            onClick={() => updateParams({ status: 'draft' })}
            aria-pressed={statusFilter === 'draft'}
            className={`px-4 py-1.5 rounded-full text-sm font-bold border transition-colors whitespace-nowrap ${
              statusFilter === 'draft'
                ? 'bg-[#D4AF37]/15 border-[#D4AF37] text-[#D4AF37]'
                : 'bg-[#1A140E] border-[rgba(255,255,255,0.1)] text-[#A1866B] hover:text-[#F5E9D6]'
            }`}
          >
            Draft
          </button>
          <button
            type="button"
            onClick={() => updateParams({ status: 'published' })}
            aria-pressed={statusFilter === 'published'}
            className={`px-4 py-1.5 rounded-full text-sm font-bold border transition-colors whitespace-nowrap ${
              statusFilter === 'published'
                ? 'bg-[#D4AF37]/15 border-[#D4AF37] text-[#D4AF37]'
                : 'bg-[#1A140E] border-[rgba(255,255,255,0.1)] text-[#A1866B] hover:text-[#F5E9D6]'
            }`}
          >
            Published
          </button>
        </div>

        {activeFilters.length > 0 && (
          <div className="flex flex-wrap items-center gap-2 border-b border-[rgba(255,255,255,0.05)] px-4 py-3" aria-live="polite" aria-label="Active summary filters">
            <span className="text-xs text-[#A1866B]">Active filters:</span>
            {activeFilters.map((filter) => (
              <button
                key={filter.key}
                type="button"
                onClick={() => updateParams({ [filter.key]: '' })}
                className="inline-flex min-h-8 items-center gap-1 rounded-full border border-[#D4AF37]/30 bg-[#D4AF37]/10 px-3 py-1 text-xs text-[#F5E9D6] hover:border-[#D4AF37]"
                aria-label={`Remove ${filter.label}`}
              >
                {filter.label}
                <X size={13} aria-hidden="true" />
              </button>
            ))}
            <button
              type="button"
              onClick={clearFilters}
              className="min-h-8 px-2 text-xs text-[#A1866B] underline decoration-[#D4AF37]/40 underline-offset-2 hover:text-[#D4AF37]"
            >
              Clear all
            </button>
          </div>
        )}

        <SummaryLibraryTable
          rows={libraryRows}
          totalPages={totalPages}
          currentPage={currentPage}
          isPending={isPending}
          actingOnId={actingOnId}
          onPageChange={(nextPage) => updateParams({ page: String(nextPage) })}
          onTogglePublish={handleTogglePublish}
          onRequestDelete={(summaryId) => setDeleteModal({ isOpen: true, summaryId })}
        />
      </div>

      <ConfirmDialog
        isOpen={deleteModal.isOpen}
        onClose={() => setDeleteModal({ isOpen: false, summaryId: null })}
        onConfirm={handleDelete}
        title="ลบเนื้อหาสรุป"
        description="คุณต้องการลบเนื้อหาสรุปนี้ใช่หรือไม่? การกระทำนี้ไม่สามารถย้อนกลับได้"
        confirmText="ลบเนื้อหา"
        cancelText="ยกเลิก"
        isDestructive={true}
      />
    </div>
  )
}
