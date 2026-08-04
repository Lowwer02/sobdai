'use client'

import { useRouter, usePathname } from 'next/navigation'
import { useState, useTransition, useCallback, useEffect, useRef } from 'react'
import { Search, Plus, UploadCloud, SlidersHorizontal, X, ArrowUpDown } from 'lucide-react'
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
  const [isFilterDrawerOpen, setIsFilterDrawerOpen] = useState(false)
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

  useEffect(() => {
    if (!isFilterDrawerOpen) return

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setIsFilterDrawerOpen(false)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [isFilterDrawerOpen])

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    lastCommittedSearch.current = searchInput
    updateParams({ q: searchInput })
  }

  const clearFilters = () => {
    updateParams({ q: '', package: '', status: '', subject: '', document: '' })
    setIsFilterDrawerOpen(false)
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

  const filterControls = (
    <>
      <label className="flex min-w-0 flex-1 flex-col gap-1 text-xs text-[#A1866B] md:min-w-[150px]">
        <span>Package</span>
        <select
          aria-label="Filter summaries by package"
          value={packageFilter}
          onChange={(e) => updateParams({ package: e.target.value })}
          className="w-full max-w-[220px] rounded-xl border border-[rgba(255,255,255,0.1)] bg-[#0F0B07] px-3 py-2 text-sm text-[#F5E9D6] focus:border-[#D4AF37]/50 focus:outline-none"
        >
          <option value="">All Packages</option>
          {packages.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
      </label>

      <label className="flex min-w-0 flex-1 flex-col gap-1 text-xs text-[#A1866B] md:min-w-[130px]">
        <span>Status</span>
        <select
          aria-label="Filter summaries by status"
          value={statusFilter}
          onChange={(e) => updateParams({ status: e.target.value })}
          className="w-full max-w-[180px] rounded-xl border border-[rgba(255,255,255,0.1)] bg-[#0F0B07] px-3 py-2 text-sm text-[#F5E9D6] focus:border-[#D4AF37]/50 focus:outline-none"
        >
          <option value="">All Statuses</option>
          <option value="published">Published</option>
          <option value="draft">Draft</option>
        </select>
      </label>

      <label className="flex min-w-0 flex-1 flex-col gap-1 text-xs text-[#A1866B] md:min-w-[150px]">
        <span>Subject</span>
        <select
          aria-label="Filter summaries by subject"
          value={subjectFilter}
          onChange={(e) => updateParams({ subject: e.target.value })}
          className="w-full max-w-[200px] truncate rounded-xl border border-[rgba(255,255,255,0.1)] bg-[#0F0B07] px-3 py-2 text-sm text-[#F5E9D6] focus:border-[#D4AF37]/50 focus:outline-none"
        >
          <option value="">All Subjects</option>
          {getSubjectDropdownOptions().map((opt) => (
            <option key={opt.code} value={opt.code}>{opt.label}</option>
          ))}
        </select>
      </label>

      <label className="flex min-w-0 flex-1 flex-col gap-1 text-xs text-[#A1866B] md:min-w-[150px]">
        <span>Document</span>
        <select
          aria-label="Filter summaries by document"
          value={documentFilter}
          onChange={(e) => updateParams({ document: e.target.value })}
          className="w-full max-w-[200px] truncate rounded-xl border border-[rgba(255,255,255,0.1)] bg-[#0F0B07] px-3 py-2 text-sm text-[#F5E9D6] focus:border-[#D4AF37]/50 focus:outline-none"
        >
          <option value="">All Documents</option>
          <option value={UNASSIGNED_SUBJECT.code}>{UNASSIGNED_SUBJECT.label}</option>
          {uniqueDocuments.map((doc) => <option key={doc} value={doc}>{doc}</option>)}
        </select>
      </label>
    </>
  )

  const handleTogglePublish = async (id: string, isPublished: boolean) => {
    setActingOnId(id)
    await toggleSummaryPublish(id, !isPublished)
    setActingOnId(null)
  }

  const handleDelete = async () => {
    if (!deleteModal.summaryId) return
    setActingOnId(deleteModal.summaryId)
    setDeleteModal({ isOpen: false, summaryId: null })
    await deleteSummary(deleteModal.summaryId)
    toastEvent('ลบสรุปเรียบร้อยแล้ว')
    setActingOnId(null)
  }

  const libraryRows: SummaryLibraryTableRow[] = summaries.map((summary) => ({
    id: summary.id,
    title: summary.title,
    slug: summary.slug ?? null,
    packageName: summary.package_name ?? null,
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
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold font-display text-[#F5E9D6] tracking-tight">Summary Bank</h1>
          <p className="text-[#A1866B] mt-1">Manage reading materials for learning packages.</p>
        </div>
        <div className="flex items-center gap-3">
          <Link 
            href="/admin/summaries/import"
            className="bg-[#0F0B07] border border-[#D4AF37]/30 hover:border-[#D4AF37] text-[#D4AF37] px-4 py-2.5 rounded-xl font-bold flex items-center gap-2 transition-colors"
          >
            <UploadCloud size={18} />
            Import Markdown
          </Link>
          <Link 
            href="/admin/summaries/create"
            className="bg-[#D4AF37] hover:bg-[#F1D17A] text-[#1A140E] px-4 py-2.5 rounded-xl font-bold flex items-center gap-2 transition-colors"
          >
            <Plus size={18} />
            Create Summary
          </Link>
        </div>
      </div>

      <div className="bg-[#1A140E] border border-[rgba(212,175,55,0.15)] rounded-2xl overflow-hidden shadow-xl">
        
        {/* Toolbar */}
        <div className="p-4 border-b border-[rgba(255,255,255,0.05)] space-y-3">
          <div className="flex flex-wrap gap-3 items-end justify-between">
            <form onSubmit={handleSearchSubmit} className="relative flex-1 min-w-[220px] max-w-md">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-[#A1866B]" size={18} aria-hidden="true" />
              <label htmlFor="summary-library-search" className="sr-only">Search summaries</label>
              <input
                id="summary-library-search"
                type="search"
                value={searchInput}
                maxLength={120}
                onChange={(e) => setSearchInput(e.target.value)}
                placeholder="Search summaries by title..."
                className="w-full bg-[#0F0B07] border border-[rgba(255,255,255,0.1)] text-[#F5E9D6] rounded-xl pl-10 pr-4 py-2 focus:outline-none focus:border-[#D4AF37]/50"
              />
            </form>

            <div className="flex items-center gap-2">
              <label className="hidden sm:flex items-center gap-2 text-xs text-[#A1866B]">
                <ArrowUpDown size={15} aria-hidden="true" />
                <span className="sr-only">Sort summaries</span>
                <select
                  aria-label="Sort summaries"
                  value={`${sortKey}:${sortDirection}`}
                  onChange={(e) => {
                    const [nextSortKey, nextDirection] = e.target.value.split(':')
                    updateParams({ sort: nextSortKey, direction: nextDirection })
                  }}
                  className="rounded-xl border border-[rgba(255,255,255,0.1)] bg-[#0F0B07] px-3 py-2 text-sm text-[#F5E9D6] focus:border-[#D4AF37]/50 focus:outline-none"
                >
                  <option value="updatedAt:desc">Recently updated</option>
                  <option value="updatedAt:asc">Oldest updated</option>
                  <option value="canonicalTitle:asc">Title A–Z</option>
                  <option value="canonicalTitle:desc">Title Z–A</option>
                </select>
              </label>

              <button
                type="button"
                onClick={() => setIsFilterDrawerOpen(true)}
                className="inline-flex items-center gap-2 rounded-xl border border-[rgba(255,255,255,0.1)] bg-[#0F0B07] px-3 py-2 text-sm font-medium text-[#F5E9D6] hover:border-[#D4AF37]/50 md:hidden"
                aria-haspopup="dialog"
                aria-expanded={isFilterDrawerOpen}
              >
                <SlidersHorizontal size={16} aria-hidden="true" />
                Filters
                {activeFilters.length > 0 && (
                  <span className="rounded-full bg-[#D4AF37] px-1.5 text-xs font-bold text-[#1A140E]" aria-label={`${activeFilters.length} active filters`}>
                    {activeFilters.length}
                  </span>
                )}
              </button>
            </div>
          </div>

          <div className="hidden flex-wrap gap-3 md:flex">
            {filterControls}
          </div>

          <div className="flex items-center gap-2 sm:hidden">
            <ArrowUpDown size={15} className="text-[#A1866B]" aria-hidden="true" />
            <label htmlFor="summary-library-sort-mobile" className="sr-only">Sort summaries</label>
            <select
              id="summary-library-sort-mobile"
              aria-label="Sort summaries"
              value={`${sortKey}:${sortDirection}`}
              onChange={(e) => {
                const [nextSortKey, nextDirection] = e.target.value.split(':')
                updateParams({ sort: nextSortKey, direction: nextDirection })
              }}
              className="flex-1 rounded-xl border border-[rgba(255,255,255,0.1)] bg-[#0F0B07] px-3 py-2 text-sm text-[#F5E9D6] focus:border-[#D4AF37]/50 focus:outline-none"
            >
              <option value="updatedAt:desc">Recently updated</option>
              <option value="updatedAt:asc">Oldest updated</option>
              <option value="canonicalTitle:asc">Title A–Z</option>
              <option value="canonicalTitle:desc">Title Z–A</option>
            </select>
          </div>

          {activeFilters.length > 0 && (
            <div className="flex flex-wrap items-center gap-2" aria-live="polite" aria-label="Active summary filters">
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
        </div>

        {isFilterDrawerOpen && (
          <div className="fixed inset-0 z-40 md:hidden" role="dialog" aria-modal="true" aria-labelledby="summary-filter-drawer-title">
            <button
              type="button"
              className="absolute inset-0 h-full w-full bg-black/60"
              onClick={() => setIsFilterDrawerOpen(false)}
              aria-label="Close filters"
            />
            <aside className="absolute right-0 top-0 flex h-full w-[min(22rem,90vw)] flex-col bg-[#1A140E] p-5 shadow-2xl">
              <div className="mb-5 flex items-center justify-between border-b border-[rgba(255,255,255,0.08)] pb-4">
                <h2 id="summary-filter-drawer-title" className="text-lg font-bold text-[#F5E9D6]">Filters</h2>
                <button
                  type="button"
                  onClick={() => setIsFilterDrawerOpen(false)}
                  className="rounded-lg p-2 text-[#A1866B] hover:bg-[#D4AF37]/10 hover:text-[#D4AF37]"
                  aria-label="Close filters"
                >
                  <X size={18} aria-hidden="true" />
                </button>
              </div>
              <div className="flex flex-1 flex-col gap-4 overflow-y-auto">
                {filterControls}
              </div>
              <button
                type="button"
                onClick={clearFilters}
                className="mt-5 min-h-11 rounded-xl border border-[#D4AF37]/30 px-4 py-2 text-sm font-bold text-[#D4AF37] hover:bg-[#D4AF37]/10"
              >
                Clear filters
              </button>
            </aside>
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
