'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Save, X, Loader2, RefreshCw } from 'lucide-react'
import QuestionPicker from './QuestionPicker'
import { useUnsavedChanges } from '@/hooks/useUnsavedChanges'
import { publishDraftQuestionsInExamSetAction } from '@/app/admin/exam-sets/actions'
import { toastEvent } from '@/hooks/useToast'

interface ExamSetFormProps {
  initialData?: any
  packages: any[]
  selectedQuestionsData?: any[]
  onSubmit: (data: any) => Promise<{success: boolean, error?: string}>
  isEdit?: boolean
}

export default function ExamSetForm({
  initialData,
  packages,
  selectedQuestionsData = [],
  onSubmit,
  isEdit = false
}: ExamSetFormProps) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState('')

  const [name, setName] = useState(initialData?.name || '')
  const [description, setDescription] = useState(initialData?.description || '')
  const [packageId, setPackageId] = useState(initialData?.package_id || (packages[0]?.id || ''))
  const [durationMinutes, setDurationMinutes] = useState(initialData?.duration_minutes || 60)
  const [isSample, setIsSample] = useState(initialData?.is_sample || false)
  const [sortOrder, setSortOrder] = useState(initialData?.sort_order || 0)
  const [displayOrder, setDisplayOrder] = useState(initialData?.display_order || 0)
  
  const [selectedQuestions, setSelectedQuestions] = useState<any[]>(selectedQuestionsData)
  const [isDirty, setIsDirty] = useState(false)

  useUnsavedChanges(isDirty)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')

    if (!name || !packageId) {
      setError('Name and Package are required')
      return
    }

    startTransition(async () => {
      const res = await onSubmit({
        name,
        description,
        package_id: packageId,
        duration_minutes: durationMinutes,
        is_sample: isSample,
        sort_order: sortOrder,
        display_order: displayOrder,
        question_ids: selectedQuestions.map(q => q.id)
      })

      if (res.success) {
        setIsDirty(false)
        router.push('/admin/exam-sets')
      } else {
        setError(res.error || 'Something went wrong')
      }
    })
  }

  const handleFormChange = () => setIsDirty(true)

  // Counters
  const totalQuestions = selectedQuestions.length
  const publishedCount = selectedQuestions.filter(q => q.status === 'Published').length
  const draftCount = selectedQuestions.filter(q => q.status === 'Draft' || !q.status).length
  const reviewCount = selectedQuestions.filter(q => q.status === 'Review').length
  
  const readinessPercent = totalQuestions > 0 ? Math.round((publishedCount / totalQuestions) * 100) : 0
  const isReady = readinessPercent === 100 && totalQuestions > 0
  const isDraftOnly = draftCount === totalQuestions && totalQuestions > 0
  const needsReview = reviewCount > 0

  const [isPublishingDrafts, setIsPublishingDrafts] = useState(false)

  const handlePublishDrafts = async () => {
    if (!initialData?.id) return
    setIsPublishingDrafts(true)
    const res = await publishDraftQuestionsInExamSetAction(initialData.id)
    setIsPublishingDrafts(false)
    if (res?.success) {
      toastEvent(`Published ${res.count} draft questions.`)
      // Note: In a real app we might want to refresh the local state or trigger a router.refresh() 
      // but Server Actions calling revalidatePath usually update the Server Components.
      // We also update local state here to reflect immediately:
      setSelectedQuestions(prev => prev.map(q => q.status === 'Draft' || !q.status ? { ...q, status: 'Published' } : q))
    } else {
      toastEvent(res?.error || 'Failed to publish draft questions', 'error')
    }
  }

  return (
    <form onSubmit={handleSubmit} onChange={handleFormChange} className="space-y-8 max-w-5xl">
      {error && (
        <div className="bg-red-500/10 border border-red-500 text-red-500 px-4 py-3 rounded-xl text-sm">
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        
        {/* Left Column: Metadata */}
        <div className="lg:col-span-1 space-y-6">
          <div className="bg-[#1A140E] border border-[rgba(212,175,55,0.15)] rounded-2xl p-6 shadow-xl space-y-4">
            <h3 className="text-xl font-bold font-display text-[#F5E9D6] border-b border-[rgba(255,255,255,0.05)] pb-3">Exam Details</h3>
            
            <div className="space-y-2">
              <label className="text-sm text-[#F5E9D6] font-medium block">Exam Name *</label>
              <input 
                required 
                value={name} 
                onChange={e => setName(e.target.value)} 
                type="text" 
                className="w-full bg-[#0F0B07] border border-[rgba(255,255,255,0.1)] text-[#F5E9D6] rounded-xl px-4 py-2 focus:outline-none focus:border-[#D4AF37]/50 transition-colors" 
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm text-[#F5E9D6] font-medium block">Description</label>
              <textarea 
                value={description} 
                onChange={e => setDescription(e.target.value)} 
                rows={3} 
                className="w-full bg-[#0F0B07] border border-[rgba(255,255,255,0.1)] text-[#A1866B] rounded-xl px-4 py-2 focus:outline-none focus:border-[#D4AF37]/50 transition-colors" 
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm text-[#F5E9D6] font-medium block">Assign to Package *</label>
              <select 
                required 
                value={packageId} 
                onChange={e => setPackageId(e.target.value)} 
                className="w-full bg-[#0F0B07] border border-[rgba(255,255,255,0.1)] text-[#F5E9D6] rounded-xl px-4 py-2 focus:outline-none focus:border-[#D4AF37]/50 transition-colors"
              >
                {packages.map(p => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="text-sm text-[#F5E9D6] font-medium block">Duration (Mins)</label>
                <input 
                  type="number" 
                  min="1" 
                  value={durationMinutes} 
                  onChange={e => setDurationMinutes(parseInt(e.target.value) || 0)} 
                  className="w-full bg-[#0F0B07] border border-[rgba(255,255,255,0.1)] text-[#F5E9D6] rounded-xl px-4 py-2 focus:outline-none focus:border-[#D4AF37]/50 transition-colors" 
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm text-[#F5E9D6] font-medium block">Sort Order</label>
                <input
                  type="number"
                  value={sortOrder}
                  onChange={e => setSortOrder(parseInt(e.target.value) || 0)}
                  className="w-full bg-[#0F0B07] border border-[rgba(255,255,255,0.1)] text-[#F5E9D6] rounded-xl px-4 py-2 focus:outline-none focus:border-[#D4AF37]/50 transition-colors"
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm text-[#F5E9D6] font-medium block">Display Order</label>
                <input
                  type="number"
                  value={displayOrder}
                  onChange={e => setDisplayOrder(parseInt(e.target.value) || 0)}
                  placeholder="0"
                  className="w-full bg-[#0F0B07] border border-[rgba(255,255,255,0.1)] text-[#F5E9D6] rounded-xl px-4 py-2 focus:outline-none focus:border-[#D4AF37]/50 transition-colors"
                />
                <p className="text-xs text-[#A1866B]">ค่ามากกว่า แสดงก่อน (เช่น 999 = บนสุด)</p>
              </div>
            </div>

            <label className="flex items-center gap-3 p-3 bg-[#0F0B07] border border-[rgba(255,255,255,0.05)] rounded-xl cursor-pointer hover:border-[#D4AF37]/30 transition-colors mt-2">
              <input 
                type="checkbox" 
                checked={isSample} 
                onChange={e => setIsSample(e.target.checked)} 
                className="w-5 h-5 rounded border-gray-600 text-[#D4AF37] focus:ring-[#D4AF37] focus:ring-offset-gray-900 bg-black" 
              />
              <div>
                <div className="text-sm font-medium text-[#F5E9D6]">Sample Exam</div>
                <div className="text-xs text-[#A1866B]">Allow users to try before buying.</div>
              </div>
            </label>
          </div>
        </div>

        {/* Right Column: Question Picker */}
        <div className="lg:col-span-2 space-y-6">
          
          <div className="bg-[#1A140E] border border-[rgba(212,175,55,0.15)] rounded-2xl p-6 shadow-xl space-y-4">
            <div className="flex items-center justify-between border-b border-[rgba(255,255,255,0.05)] pb-3">
              <h3 className="text-xl font-bold font-display text-[#F5E9D6]">Publish Readiness</h3>
              {totalQuestions > 0 && (
                <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-bold border ${
                  isReady ? 'bg-[#22C55E]/10 text-[#22C55E] border-[#22C55E]/20' :
                  needsReview ? 'bg-[#EAB308]/10 text-[#EAB308] border-[#EAB308]/20' :
                  isDraftOnly ? 'bg-[rgba(255,255,255,0.05)] text-[#A1866B] border-[rgba(255,255,255,0.1)]' :
                  'bg-[#3B82F6]/10 text-[#3B82F6] border-[#3B82F6]/20'
                }`}>
                  {isReady ? 'Ready for Production' : needsReview ? 'Needs Review' : isDraftOnly ? 'Draft Only' : 'Incomplete'}
                </span>
              )}
            </div>
            
            <div className="grid grid-cols-3 gap-4">
              <div className="bg-[#0F0B07] border border-[rgba(255,255,255,0.05)] rounded-xl p-4 flex flex-col items-center">
                <div className="text-2xl font-bold text-[#22C55E]">{publishedCount}</div>
                <div className="text-xs text-[#22C55E]/70 uppercase font-bold tracking-wider mt-1">Published</div>
              </div>
              <div className="bg-[#0F0B07] border border-[rgba(255,255,255,0.05)] rounded-xl p-4 flex flex-col items-center">
                <div className="text-2xl font-bold text-[#A1866B]">{draftCount}</div>
                <div className="text-xs text-[#A1866B]/70 uppercase font-bold tracking-wider mt-1">Draft</div>
              </div>
              <div className="bg-[#0F0B07] border border-[rgba(255,255,255,0.05)] rounded-xl p-4 flex flex-col items-center">
                <div className="text-2xl font-bold text-[#EAB308]">{reviewCount}</div>
                <div className="text-xs text-[#EAB308]/70 uppercase font-bold tracking-wider mt-1">Review</div>
              </div>
            </div>

            {totalQuestions > 0 && (
              <div className="space-y-1 mt-2">
                <div className="flex justify-between text-sm">
                  <span className="text-[#A1866B]">Published / Total Questions</span>
                  <span className="text-[#F5E9D6] font-bold">{readinessPercent}%</span>
                </div>
                <div className="h-2 bg-[#0F0B07] rounded-full overflow-hidden border border-[rgba(255,255,255,0.05)]">
                  <div className="h-full bg-[#22C55E] transition-all duration-500" style={{ width: `${readinessPercent}%` }} />
                </div>
              </div>
            )}

            {isEdit && draftCount > 0 && (
              <div className="pt-4 flex justify-end border-t border-[rgba(255,255,255,0.05)] mt-4">
                <button 
                  type="button"
                  onClick={handlePublishDrafts}
                  disabled={isPublishingDrafts}
                  className="bg-[#22C55E]/10 hover:bg-[#22C55E]/20 text-[#22C55E] px-4 py-2 rounded-xl text-sm font-bold border border-[#22C55E]/20 transition-colors flex items-center gap-2"
                >
                  {isPublishingDrafts ? <Loader2 size={16} className="animate-spin" /> : <RefreshCw size={16} />}
                  Publish {draftCount} Draft Questions
                </button>
              </div>
            )}
          </div>

          <QuestionPicker 
            selectedQuestions={selectedQuestions} 
            onChange={(v) => { setSelectedQuestions(v); setIsDirty(true); }} 
          />
        </div>
      </div>

      <div className="flex items-center gap-4 pt-4 border-t border-[rgba(255,255,255,0.05)]">
        <Link href="/admin/exam-sets" className="px-6 py-3 rounded-xl text-[#F5E9D6] hover:bg-[#1A140E] transition-colors text-sm font-bold flex items-center gap-2">
          <X size={18} />
          Cancel
        </Link>
        <button 
          type="submit" 
          disabled={isPending} 
          className="bg-[#D4AF37] hover:bg-[#F1D17A] text-[#1A140E] px-8 py-3 rounded-xl text-sm font-bold flex items-center gap-2 transition-colors shadow-lg shadow-[#D4AF37]/20 disabled:opacity-50"
        >
          {isPending ? <Loader2 size={18} className="animate-spin" /> : <Save size={18} />}
          {isEdit ? 'Save Changes' : 'Create Exam Set'}
        </button>
      </div>
    </form>
  )
}
