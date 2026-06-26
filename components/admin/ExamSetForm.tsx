'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Save, X, Loader2 } from 'lucide-react'
import QuestionPicker from './QuestionPicker'

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
  
  const [selectedQuestions, setSelectedQuestions] = useState<any[]>(selectedQuestionsData)

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
        question_ids: selectedQuestions.map(q => q.id)
      })

      if (res.success) {
        router.push('/admin/exam-sets')
      } else {
        setError(res.error || 'Something went wrong')
      }
    })
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-8 max-w-5xl">
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
        <div className="lg:col-span-2">
          <QuestionPicker 
            selectedQuestions={selectedQuestions} 
            onChange={setSelectedQuestions} 
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
