'use client'

import { useRouter, usePathname } from 'next/navigation'
import { useState, useTransition, useCallback } from 'react'
import { Search, Loader2, ChevronLeft, ChevronRight, Plus, Eye, EyeOff, Edit, Trash2 } from 'lucide-react'
import Link from 'next/link'
import { toggleSummaryPublish, deleteSummary } from './actions'

interface SummariesClientProps {
  summaries: any[]
  packages: any[]
  totalPages: number
  currentPage: number
  search: string
  packageFilter: string
  statusFilter: string
}

export default function SummariesClient({
  summaries,
  packages,
  totalPages,
  currentPage,
  search,
  packageFilter,
  statusFilter
}: SummariesClientProps) {
  const router = useRouter()
  const pathname = usePathname()
  const [isPending, startTransition] = useTransition()
  
  const [searchInput, setSearchInput] = useState(search)
  const [actingOnId, setActingOnId] = useState<string | null>(null)

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

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    updateParams({ q: searchInput })
  }

  const handleTogglePublish = async (id: string, isPublished: boolean) => {
    setActingOnId(id)
    await toggleSummaryPublish(id, !isPublished)
    setActingOnId(null)
  }

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to delete this summary?')) return
    setActingOnId(id)
    await deleteSummary(id)
    setActingOnId(null)
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold font-display text-[#F5E9D6] tracking-tight">Summary Bank</h1>
          <p className="text-[#A1866B] mt-1">Manage reading materials for learning packages.</p>
        </div>
        <Link 
          href="/admin/summaries/create"
          className="bg-[#D4AF37] hover:bg-[#F1D17A] text-[#1A140E] px-4 py-2.5 rounded-xl font-bold flex items-center gap-2 transition-colors"
        >
          <Plus size={18} />
          Create Summary
        </Link>
      </div>

      <div className="bg-[#1A140E] border border-[rgba(212,175,55,0.15)] rounded-2xl overflow-hidden shadow-xl">
        
        {/* Toolbar */}
        <div className="p-4 border-b border-[rgba(255,255,255,0.05)] flex flex-wrap gap-4 items-center justify-between">
          <form onSubmit={handleSearchSubmit} className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-[#A1866B]" size={18} />
            <input 
              type="text" 
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="Search summaries by title..." 
              className="w-full bg-[#0F0B07] border border-[rgba(255,255,255,0.1)] text-[#F5E9D6] rounded-xl pl-10 pr-4 py-2 focus:outline-none focus:border-[#D4AF37]/50"
            />
          </form>
          
          <div className="flex items-center gap-3">
            <select 
              value={packageFilter} 
              onChange={(e) => updateParams({ package: e.target.value })}
              className="bg-[#0F0B07] border border-[rgba(255,255,255,0.1)] text-[#F5E9D6] rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-[#D4AF37]/50 max-w-[200px]"
            >
              <option value="">All Packages</option>
              {packages.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>

            <select 
              value={statusFilter} 
              onChange={(e) => updateParams({ status: e.target.value })}
              className="bg-[#0F0B07] border border-[rgba(255,255,255,0.1)] text-[#F5E9D6] rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-[#D4AF37]/50"
            >
              <option value="">All Statuses</option>
              <option value="published">Published</option>
              <option value="draft">Draft</option>
            </select>
          </div>
        </div>

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
                <th className="p-4 font-medium w-12 text-center">Order</th>
                <th className="p-4 font-medium">Title & Slug</th>
                <th className="p-4 font-medium">Package</th>
                <th className="p-4 font-medium">Topic</th>
                <th className="p-4 font-medium">Status</th>
                <th className="p-4 font-medium text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[rgba(255,255,255,0.02)]">
              {summaries.length === 0 ? (
                <tr>
                  <td colSpan={6} className="p-12 text-center text-[#A1866B]">
                    No summaries found.
                  </td>
                </tr>
              ) : summaries.map((summary) => (
                <tr key={summary.id} className="hover:bg-[#D4AF37]/[0.02] transition-colors">
                  <td className="p-4 text-[#A1866B] text-sm text-center">
                    {summary.sort_order}
                  </td>
                  <td className="p-4">
                    <div className="text-[#F5E9D6] font-medium text-sm">{summary.title}</div>
                    <div className="text-[#A1866B] text-xs mt-0.5">/{summary.slug}</div>
                  </td>
                  <td className="p-4">
                    <div className="text-[#F5E9D6] text-sm truncate max-w-[200px]">{summary.package_name}</div>
                  </td>
                  <td className="p-4">
                    <div className="text-[#F5E9D6] text-sm truncate max-w-[150px]">{summary.topic || summary.subject || '-'}</div>
                  </td>
                  <td className="p-4">
                    <button 
                      onClick={() => handleTogglePublish(summary.id, summary.is_published)}
                      disabled={actingOnId === summary.id}
                      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-bold border transition-colors disabled:opacity-50 ${
                        summary.is_published 
                          ? 'bg-[#22C55E]/10 text-[#22C55E] border-[#22C55E]/30 hover:bg-[#22C55E]/20' 
                          : 'bg-[#0F0B07] text-[#A1866B] border-[rgba(255,255,255,0.1)] hover:bg-[rgba(255,255,255,0.05)]'
                      }`}
                    >
                      {actingOnId === summary.id ? <Loader2 size={12} className="animate-spin" /> : 
                        summary.is_published ? <Eye size={12} /> : <EyeOff size={12} />}
                      {summary.is_published ? 'Published' : 'Draft'}
                    </button>
                  </td>
                  <td className="p-4 text-right">
                    <div className="flex items-center justify-end gap-2">
                      <Link 
                        href={`/admin/summaries/${summary.id}/edit`}
                        className="p-2 text-[#A1866B] hover:text-[#D4AF37] transition-colors rounded-lg hover:bg-[#D4AF37]/10"
                        title="Edit"
                      >
                        <Edit size={16} />
                      </Link>
                      <button 
                        onClick={() => handleDelete(summary.id)}
                        disabled={actingOnId === summary.id}
                        className="p-2 text-[#A1866B] hover:text-red-400 transition-colors rounded-lg hover:bg-red-400/10 disabled:opacity-50"
                        title="Delete"
                      >
                        {actingOnId === summary.id ? <Loader2 size={16} className="animate-spin" /> : <Trash2 size={16} />}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="p-4 border-t border-[rgba(255,255,255,0.05)] flex items-center justify-between">
            <div className="text-sm text-[#A1866B]">
              Page <span className="text-[#F5E9D6] font-medium">{currentPage}</span> of <span className="text-[#F5E9D6] font-medium">{totalPages}</span>
            </div>
            <div className="flex items-center gap-2">
              <button 
                onClick={() => updateParams({ page: String(currentPage - 1) })}
                disabled={currentPage <= 1 || isPending}
                className="p-2 rounded-lg bg-[#0F0B07] border border-[rgba(255,255,255,0.1)] text-[#F5E9D6] disabled:opacity-50 hover:bg-[rgba(255,255,255,0.05)]"
              >
                <ChevronLeft size={16} />
              </button>
              <button 
                onClick={() => updateParams({ page: String(currentPage + 1) })}
                disabled={currentPage >= totalPages || isPending}
                className="p-2 rounded-lg bg-[#0F0B07] border border-[rgba(255,255,255,0.1)] text-[#F5E9D6] disabled:opacity-50 hover:bg-[rgba(255,255,255,0.05)]"
              >
                <ChevronRight size={16} />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
