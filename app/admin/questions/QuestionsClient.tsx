'use client'

import Link from 'next/link'
import { useRouter, usePathname } from 'next/navigation'
import { useState, useTransition, useCallback } from 'react'
import { Plus, Search, Edit, Trash2, ChevronLeft, ChevronRight, Loader2 } from 'lucide-react'
import { deleteQuestionAction, bulkUpdateQuestionStatusAction } from './actions'
import ConfirmDialog from '@/components/admin/ConfirmDialog'
import { toastEvent } from '@/hooks/useToast'

interface QuestionsClientProps {
  questions: any[]
  totalPages: number
  currentPage: number
  search: string
  statusFilter: string
  difficultyFilter: string
  categoryFilter: string
  subjectFilter: string
  lawFilter: string
  topicFilter: string
  uniqueCategories: string[]
  uniqueSubjects: string[]
  uniqueLaws: string[]
  uniqueTopics: string[]
  totalCount: number
  publishedCount: number
  reviewCount: number
  draftCount: number
}

export default function QuestionsClient({
  questions,
  totalPages,
  currentPage,
  search,
  statusFilter,
  difficultyFilter,
  categoryFilter,
  subjectFilter,
  lawFilter,
  topicFilter,
  uniqueCategories,
  uniqueSubjects,
  uniqueLaws,
  uniqueTopics,
  totalCount,
  publishedCount,
  reviewCount,
  draftCount
}: QuestionsClientProps) {
  const router = useRouter()
  const pathname = usePathname()
  const [isPending, startTransition] = useTransition()
  
  const [searchInput, setSearchInput] = useState(search)
  const [deleteModalOpen, setDeleteModalOpen] = useState(false)
  const [questionToDelete, setQuestionToDelete] = useState<{id: string, preview: string} | null>(null)
  const [isDeleting, setIsDeleting] = useState(false)

  // Bulk Selection State
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [bulkActionOpen, setBulkActionOpen] = useState(false)
  const [bulkStatusTarget, setBulkStatusTarget] = useState<'Published' | 'Draft' | 'Review'>('Draft')
  const [isBulking, setIsBulking] = useState(false)

  const handleSelectAll = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.checked) {
      const allIds = new Set(questions.map(q => q.id))
      setSelectedIds(allIds)
    } else {
      setSelectedIds(new Set())
    }
  }

  const handleSelectOne = (id: string, checked: boolean) => {
    const next = new Set(selectedIds)
    if (checked) next.add(id)
    else next.delete(id)
    setSelectedIds(next)
  }

  const handleBulkAction = (status: 'Published' | 'Draft' | 'Review') => {
    setBulkStatusTarget(status)
    setBulkActionOpen(true)
  }

  const confirmBulkAction = async () => {
    setIsBulking(true)
    const res = await bulkUpdateQuestionStatusAction(Array.from(selectedIds), bulkStatusTarget)
    setIsBulking(false)
    if (res?.success) {
      toastEvent(`ปรับสถานะเป็น ${bulkStatusTarget} แล้ว ${res.count} ข้อ`)
      setSelectedIds(new Set())
      setBulkActionOpen(false)
    } else {
      toastEvent(res?.error || 'เกิดข้อผิดพลาด', 'error')
    }
  }


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
    
    // Reset to page 1 on any filter change (except pagination itself)
    if (!updates.page) {
      params.set('page', '1')
    }

    startTransition(() => {
      router.push(`${pathname}?${params.toString()}`)
    })
  }, [pathname, router])

  // Handlers
  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    updateParams({ q: searchInput })
  }

  const handleDeleteClick = (id: string, content: string) => {
    setQuestionToDelete({ id, preview: content.substring(0, 50) + '...' })
    setDeleteModalOpen(true)
  }

  const confirmDelete = async () => {
    if (!questionToDelete) return
    setIsDeleting(true)
    const res = await deleteQuestionAction(questionToDelete.id)
    setIsDeleting(false)
    if (res?.success) {
      toastEvent('ลบข้อสอบเรียบร้อยแล้ว')
      setDeleteModalOpen(false)
      setQuestionToDelete(null)
    } else {
      toastEvent(res?.error || 'ลบไม่สำเร็จ', 'error')
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold font-display text-[#F5E9D6] tracking-tight">Question Bank</h1>
          <p className="text-[#A1866B] mt-1">Manage, review, and organize all questions.</p>
        </div>
        
        <Link href="/admin/import">
          <button className="bg-[#D4AF37] hover:bg-[#F1D17A] text-[#1A140E] px-4 py-2.5 rounded-xl font-bold flex items-center gap-2 transition-colors">
            <Plus size={18} />
            Import Questions
          </button>
        </Link>
      </div>

      {/* Dashboard Summary */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 animate-in slide-in-from-bottom-2">
        <div className="bg-[#1A140E] border border-[rgba(212,175,55,0.15)] rounded-2xl p-4 shadow-xl flex flex-col items-center justify-center text-center">
          <div className="text-3xl font-bold text-[#F5E9D6]">{totalCount}</div>
          <div className="text-xs text-[#A1866B] uppercase font-bold tracking-wider mt-1">Total Questions</div>
        </div>
        <div className="bg-[#22C55E]/10 border border-[#22C55E]/20 rounded-2xl p-4 shadow-xl flex flex-col items-center justify-center text-center">
          <div className="text-3xl font-bold text-[#22C55E]">{publishedCount}</div>
          <div className="text-xs text-[#22C55E]/70 uppercase font-bold tracking-wider mt-1">Published</div>
        </div>
        <div className="bg-[#EAB308]/10 border border-[#EAB308]/20 rounded-2xl p-4 shadow-xl flex flex-col items-center justify-center text-center">
          <div className="text-3xl font-bold text-[#EAB308]">{reviewCount}</div>
          <div className="text-xs text-[#EAB308]/70 uppercase font-bold tracking-wider mt-1">Review</div>
        </div>
        <div className="bg-[rgba(255,255,255,0.05)] border border-[rgba(255,255,255,0.1)] rounded-2xl p-4 shadow-xl flex flex-col items-center justify-center text-center">
          <div className="text-3xl font-bold text-[#A1866B]">{draftCount}</div>
          <div className="text-xs text-[#A1866B]/70 uppercase font-bold tracking-wider mt-1">Draft</div>
        </div>
      </div>

      {/* Quick Filter Chips */}
      <div className="flex items-center gap-2 flex-wrap">
        <button 
          onClick={() => updateParams({ status: '' })}
          className={`px-4 py-1.5 rounded-full text-sm font-bold border transition-colors ${!statusFilter ? 'bg-[rgba(212,175,55,0.15)] border-[#D4AF37] text-[#D4AF37]' : 'bg-[#1A140E] border-[rgba(255,255,255,0.1)] text-[#A1866B] hover:text-[#F5E9D6]'}`}
        >
          All
        </button>
        <button 
          onClick={() => updateParams({ status: 'Published' })}
          className={`px-4 py-1.5 rounded-full text-sm font-bold border transition-colors ${statusFilter === 'Published' ? 'bg-[#22C55E]/20 border-[#22C55E] text-[#22C55E]' : 'bg-[#1A140E] border-[rgba(255,255,255,0.1)] text-[#A1866B] hover:text-[#F5E9D6]'}`}
        >
          Published
        </button>
        <button 
          onClick={() => updateParams({ status: 'Review' })}
          className={`px-4 py-1.5 rounded-full text-sm font-bold border transition-colors ${statusFilter === 'Review' ? 'bg-[#EAB308]/20 border-[#EAB308] text-[#EAB308]' : 'bg-[#1A140E] border-[rgba(255,255,255,0.1)] text-[#A1866B] hover:text-[#F5E9D6]'}`}
        >
          Review
        </button>
        <button 
          onClick={() => updateParams({ status: 'Draft' })}
          className={`px-4 py-1.5 rounded-full text-sm font-bold border transition-colors ${statusFilter === 'Draft' ? 'bg-[rgba(255,255,255,0.15)] border-[rgba(255,255,255,0.3)] text-[#F5E9D6]' : 'bg-[#1A140E] border-[rgba(255,255,255,0.1)] text-[#A1866B] hover:text-[#F5E9D6]'}`}
        >
          Draft
        </button>
      </div>

      {selectedIds.size > 0 && (
        <div className="bg-[#D4AF37]/10 border border-[#D4AF37]/30 rounded-xl p-4 flex items-center justify-between animate-in slide-in-from-top-2">
          <div className="flex items-center gap-4">
            <div className="font-bold text-[#F5E9D6]">
              Selected: {selectedIds.size} Questions
            </div>
            <button 
              onClick={() => setSelectedIds(new Set())}
              className="text-sm text-[#A1866B] hover:text-[#F5E9D6] transition-colors"
            >
              Clear Selection
            </button>
          </div>
          <div className="flex items-center gap-2">
            <button 
              onClick={() => handleBulkAction('Published')}
              disabled={isBulking}
              className="bg-[#22C55E]/10 hover:bg-[#22C55E]/20 text-[#22C55E] px-3 py-1.5 rounded-lg text-sm font-bold border border-[#22C55E]/20 transition-colors"
            >
              Publish Selected
            </button>
            <button 
              onClick={() => handleBulkAction('Review')}
              disabled={isBulking}
              className="bg-[#EAB308]/10 hover:bg-[#EAB308]/20 text-[#EAB308] px-3 py-1.5 rounded-lg text-sm font-bold border border-[#EAB308]/20 transition-colors"
            >
              Move to Review
            </button>
            <button 
              onClick={() => handleBulkAction('Draft')}
              disabled={isBulking}
              className="bg-[rgba(255,255,255,0.1)] hover:bg-[rgba(255,255,255,0.15)] text-[#A1866B] px-3 py-1.5 rounded-lg text-sm font-bold border border-[rgba(255,255,255,0.05)] transition-colors"
            >
              Move to Draft
            </button>
          </div>
        </div>
      )}

      <div className="bg-[#1A140E] border border-[rgba(212,175,55,0.15)] rounded-2xl overflow-hidden shadow-xl">
        
        {/* Toolbar */}
        <div className="p-4 border-b border-[rgba(255,255,255,0.05)] flex flex-wrap gap-4 items-center">
          <form onSubmit={handleSearchSubmit} className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-[#A1866B]" size={18} />
            <input 
              type="text" 
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="Search content..." 
              className="w-full bg-[#0F0B07] border border-[rgba(255,255,255,0.1)] text-[#F5E9D6] rounded-xl pl-10 pr-4 py-2 focus:outline-none focus:border-[#D4AF37]/50 transition-colors placeholder:text-[#A1866B]/50"
            />
          </form>
          
          <div className="flex items-center gap-3">
            <select 
              value={statusFilter} 
              onChange={(e) => updateParams({ status: e.target.value })}
              className="bg-[#0F0B07] border border-[rgba(255,255,255,0.1)] text-[#F5E9D6] rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-[#D4AF37]/50"
            >
              <option value="">All ({totalCount})</option>
              <option value="Published">Published ({publishedCount})</option>
              <option value="Review">Review ({reviewCount})</option>
              <option value="Draft">Draft ({draftCount})</option>
            </select>

            <select 
              value={difficultyFilter} 
              onChange={(e) => updateParams({ difficulty: e.target.value })}
              className="bg-[#0F0B07] border border-[rgba(255,255,255,0.1)] text-[#F5E9D6] rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-[#D4AF37]/50"
            >
              <option value="">All Difficulties</option>
              <option value="Easy">Easy</option>
              <option value="Medium">Medium</option>
              <option value="Hard">Hard</option>
            </select>

            <select 
              value={categoryFilter} 
              onChange={(e) => updateParams({ category: e.target.value })}
              className="bg-[#0F0B07] border border-[rgba(255,255,255,0.1)] text-[#F5E9D6] rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-[#D4AF37]/50 max-w-[150px] truncate"
            >
              <option value="">Legacy Category</option>
              {uniqueCategories.map(cat => (
                <option key={cat} value={cat}>{cat}</option>
              ))}
            </select>
            
            <select 
              value={subjectFilter} 
              onChange={(e) => updateParams({ subject: e.target.value })}
              className="bg-[#0F0B07] border border-[rgba(255,255,255,0.1)] text-[#F5E9D6] rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-[#D4AF37]/50 max-w-[150px] truncate"
            >
              <option value="">All Subjects</option>
              {uniqueSubjects.map(sub => (
                <option key={sub} value={sub}>{sub}</option>
              ))}
            </select>

            <select 
              value={lawFilter} 
              onChange={(e) => updateParams({ law: e.target.value })}
              className="bg-[#0F0B07] border border-[rgba(255,255,255,0.1)] text-[#F5E9D6] rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-[#D4AF37]/50 max-w-[150px] truncate"
            >
              <option value="">All Laws</option>
              {uniqueLaws.map(law => (
                <option key={law} value={law}>{law}</option>
              ))}
            </select>

            <select 
              value={topicFilter} 
              onChange={(e) => updateParams({ topic: e.target.value })}
              className="bg-[#0F0B07] border border-[rgba(255,255,255,0.1)] text-[#F5E9D6] rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-[#D4AF37]/50 max-w-[150px] truncate"
            >
              <option value="">All Topics</option>
              {uniqueTopics.map(topic => (
                <option key={topic} value={topic}>{topic}</option>
              ))}
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
                <th className="p-4 w-12 text-center">
                  <input 
                    type="checkbox" 
                    checked={questions.length > 0 && selectedIds.size === questions.length}
                    onChange={handleSelectAll}
                    className="w-4 h-4 rounded border-[rgba(255,255,255,0.2)] bg-[#1A140E] checked:bg-[#D4AF37] checked:border-[#D4AF37] focus:ring-[#D4AF37] focus:ring-offset-[#0F0B07] transition-colors cursor-pointer"
                  />
                </th>
                <th className="p-4 font-medium w-[40%]">Question Preview</th>
                <th className="p-4 font-medium">Subject / Topic</th>
                <th className="p-4 font-medium">Diff.</th>
                <th className="p-4 font-medium">Status</th>
                <th className="p-4 font-medium">Created</th>
                <th className="p-4 font-medium text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[rgba(255,255,255,0.02)]">
              {questions.length === 0 ? (
                <tr>
                  <td colSpan={7} className="p-12 text-center text-[#A1866B]">
                    No questions found matching your criteria.
                  </td>
                </tr>
              ) : questions.map((q) => (
                <tr key={q.id} className="hover:bg-[#D4AF37]/[0.02] transition-colors">
                  <td className="p-4 text-center">
                    <input 
                      type="checkbox" 
                      checked={selectedIds.has(q.id)}
                      onChange={(e) => handleSelectOne(q.id, e.target.checked)}
                      className="w-4 h-4 rounded border-[rgba(255,255,255,0.2)] bg-[#1A140E] checked:bg-[#D4AF37] checked:border-[#D4AF37] focus:ring-[#D4AF37] focus:ring-offset-[#0F0B07] transition-colors cursor-pointer"
                    />
                  </td>
                  <td className="p-4">
                    <div className="text-[#F5E9D6] text-sm line-clamp-2">{q.content}</div>
                  </td>
                  <td className="p-4">
                    <div className="flex flex-col gap-1">
                      {q.subject ? (
                        <span className="text-[#F5E9D6] text-xs px-2 py-1 bg-[#D4AF37]/10 rounded-lg border border-[#D4AF37]/20 whitespace-nowrap w-max">
                          {q.subject}
                        </span>
                      ) : q.category && (
                        <span className="text-[#A1866B] text-xs px-2 py-1 bg-[#0F0B07] rounded-lg border border-[rgba(255,255,255,0.05)] whitespace-nowrap w-max">
                          {q.category}
                        </span>
                      )}
                      {q.topic && (
                        <span className="text-[#A1866B] text-[10px] uppercase font-bold tracking-wider">
                          {q.topic}
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="p-4">
                    <span className={`text-xs font-bold ${
                      q.difficulty === 'Easy' ? 'text-[#22C55E]' : 
                      q.difficulty === 'Medium' ? 'text-[#EAB308]' : 'text-red-400'
                    }`}>
                      {q.difficulty}
                    </span>
                  </td>
                  <td className="p-4">
                    <span className={`inline-flex items-center px-2 py-1 rounded text-xs font-bold border ${
                      q.status === 'Published' ? 'bg-[#22C55E]/10 text-[#22C55E] border-[#22C55E]/20' : 
                      q.status === 'Review' ? 'bg-[#EAB308]/10 text-[#EAB308] border-[#EAB308]/20' : 
                      'bg-[rgba(255,255,255,0.05)] text-[#A1866B] border-[rgba(255,255,255,0.1)]'
                    }`}>
                      {q.status}
                    </span>
                  </td>
                  <td className="p-4 text-[#A1866B] text-sm whitespace-nowrap">
                    {new Date(q.created_at).toLocaleDateString()}
                  </td>
                  <td className="p-4 text-right">
                    <div className="flex items-center justify-end gap-2">
                      <Link href={`/admin/questions/${q.id}`}>
                        <button className="p-2 text-[#A1866B] hover:text-[#D4AF37] transition-colors rounded-lg hover:bg-[#D4AF37]/10" title="Edit">
                          <Edit size={16} />
                        </button>
                      </Link>
                      <button 
                        onClick={() => handleDeleteClick(q.id, q.content)}
                        className="p-2 text-[#A1866B] hover:text-red-400 transition-colors rounded-lg hover:bg-red-400/10" 
                        title="Delete"
                      >
                        <Trash2 size={16} />
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
                className="p-2 rounded-lg bg-[#0F0B07] border border-[rgba(255,255,255,0.1)] text-[#F5E9D6] disabled:opacity-50 disabled:cursor-not-allowed hover:bg-[rgba(255,255,255,0.05)] transition-colors"
              >
                <ChevronLeft size={16} />
              </button>
              <button 
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
        title="ลบข้อสอบ"
        description={
          <div className="space-y-2 text-[#F5E9D6]">
            <p className="text-[#A1866B] text-sm">การลบข้อสอบจะลบข้อมูลที่เกี่ยวข้องทั้งหมดแบบถาวร ไม่สามารถกู้คืนได้</p>
            <div className="mt-3 p-3 bg-[#0F0B07] border border-[rgba(255,255,255,0.05)] rounded-lg text-sm text-[#F5E9D6] font-medium break-words whitespace-pre-wrap">
              "{questionToDelete?.preview}"
            </div>
          </div>
        }
        confirmText="ลบข้อสอบถาวร"
        cancelText="ยกเลิก"
        isDestructive={true}
        isLoading={isDeleting}
      />

      {/* Bulk Action Modal */}
      <ConfirmDialog
        isOpen={bulkActionOpen}
        onClose={() => !isBulking && setBulkActionOpen(false)}
        onConfirm={confirmBulkAction}
        title={`ยืนยันการอัพเดทสถานะ`}
        description={
          <div className="space-y-2 text-[#F5E9D6]">
            <p className="text-[#A1866B] text-sm">
              คุณต้องการเปลี่ยนสถานะข้อสอบจำนวน {selectedIds.size} ข้อ เป็น <span className="font-bold text-[#D4AF37]">{bulkStatusTarget}</span> ใช่หรือไม่?
            </p>
          </div>
        }
        confirmText="ยืนยัน"
        cancelText="ยกเลิก"
        isDestructive={false}
        isLoading={isBulking}
      />

    </div>
  )
}
