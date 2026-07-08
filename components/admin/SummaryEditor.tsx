'use client'

import { useState } from 'react'
import { Save, Eye, Edit2, Loader2, Link as LinkIcon, Book } from 'lucide-react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import rehypeRaw from 'rehype-raw'
import Link from 'next/link'
import { useUnsavedChanges } from '@/hooks/useUnsavedChanges'
import { SUBJECTS, UNASSIGNED_SUBJECT, getSubjectDropdownOptions } from '@/lib/subjects'

interface SummaryData {
  id?: string
  package_id: string
  title: string
  slug: string
  subject: string
  document: string
  law: string
  topic: string
  content_md: string
  sort_order: number
  is_published: boolean
}

interface SummaryEditorProps {
  initialData?: SummaryData
  packages: any[]
  onSubmit: (data: any) => Promise<{ success: boolean; error?: string; id?: string }>
  isEditing?: boolean
}

export default function SummaryEditor({ initialData, packages, onSubmit, isEditing }: SummaryEditorProps) {
  const [formData, setFormData] = useState<SummaryData>({
    package_id: initialData?.package_id || '',
    title: initialData?.title || '',
    slug: initialData?.slug || '',
    subject: initialData?.subject || '',
    document: initialData?.document || '',
    law: initialData?.law || '',
    topic: initialData?.topic || '',
    content_md: initialData?.content_md || '',
    sort_order: initialData?.sort_order || 0,
    is_published: initialData?.is_published || false,
  })

  const [isPreview, setIsPreview] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [error, setError] = useState('')
  const [isDirty, setIsDirty] = useState(false)

  useUnsavedChanges(isDirty)

  const generateSlug = (text: string) => {
    return text.toLowerCase().replace(/[^a-z0-9ก-๙]+/g, '-').replace(/(^-|-$)+/g, '')
  }

  const handleTitleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newTitle = e.target.value
    setFormData(prev => ({
      ...prev,
      title: newTitle,
      slug: !isEditing ? generateSlug(newTitle) : prev.slug
    }))
    setIsDirty(true)
  }

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, value, type } = e.target as HTMLInputElement
    const val = type === 'checkbox' ? (e.target as HTMLInputElement).checked : value
    setFormData(prev => ({ ...prev, [name]: val }))
    setIsDirty(true)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setIsSaving(true)
    
    // Auto calculate read time (approx 200 words per minute for english, maybe slightly different for Thai, but good enough)
    const wordCount = formData.content_md.trim().split(/\s+/).length
    const readTime = Math.max(1, Math.ceil(wordCount / 200))
    
    const dataToSave = { ...formData, read_time_minutes: readTime }
    
    const res = await onSubmit(dataToSave)
    setIsSaving(false)
    if (!res.success) {
      setError(res.error || 'Failed to save summary')
    } else {
      setIsDirty(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="h-[calc(100vh-120px)] flex flex-col gap-6">
      
      {/* Top Bar */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold font-display text-[#F5E9D6] tracking-tight">
          {isEditing ? 'Edit Summary' : 'Create Summary'}
        </h1>
        <div className="flex items-center gap-3">
          <label className="flex items-center gap-2 cursor-pointer mr-4">
            <input 
              type="checkbox" 
              name="is_published"
              checked={formData.is_published}
              onChange={handleChange}
              className="accent-[#D4AF37] w-4 h-4 cursor-pointer"
            />
            <span className="text-sm font-bold text-[#F5E9D6]">Publish</span>
          </label>

          <Link href="/admin/summaries" className="px-4 py-2 rounded-xl text-[#F5E9D6] hover:bg-[#1A140E] transition-colors text-sm font-medium">
            Cancel
          </Link>
          <button 
            type="submit" 
            disabled={isSaving}
            className="bg-[#D4AF37] hover:bg-[#F1D17A] text-[#1A140E] px-4 py-2 rounded-xl font-bold text-sm flex items-center gap-2 transition-colors disabled:opacity-50"
          >
            {isSaving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
            {isSaving ? 'Saving...' : 'Save Summary'}
          </button>
        </div>
      </div>

      {error && <div className="p-3 bg-red-500/10 border border-red-500/20 text-red-500 rounded-lg text-sm font-medium">{error}</div>}

      <div className="flex gap-6 flex-1 min-h-0">
        {/* Left Column: Metadata */}
        <div className="w-[300px] flex flex-col gap-4 overflow-y-auto pr-2 custom-scrollbar">
          <div className="bg-[#1A140E] border border-[rgba(212,175,55,0.15)] rounded-2xl p-4 space-y-4">
            <div>
              <label className="text-xs text-[#A1866B] font-bold uppercase block mb-1.5">Package <span className="text-red-400">*</span></label>
              <select 
                required
                name="package_id"
                value={formData.package_id}
                onChange={handleChange}
                className="w-full bg-[#0F0B07] border border-[rgba(255,255,255,0.1)] text-[#F5E9D6] rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-[#D4AF37]/50"
              >
                <option value="">-- Select Package --</option>
                {packages.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs text-[#A1866B] font-bold uppercase block mb-1.5">Title <span className="text-red-400">*</span></label>
              <input 
                required
                type="text" 
                name="title"
                value={formData.title}
                onChange={handleTitleChange}
                placeholder="e.g. แผนยุทธศาสตร์ชาติ 20 ปี"
                className="w-full bg-[#0F0B07] border border-[rgba(255,255,255,0.1)] text-[#F5E9D6] rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-[#D4AF37]/50"
              />
            </div>
            <div>
              <label className="text-xs text-[#A1866B] font-bold uppercase block mb-1.5 flex items-center gap-1">
                <LinkIcon size={12} /> URL Slug <span className="text-red-400">*</span>
              </label>
              <input 
                required
                type="text" 
                name="slug"
                value={formData.slug}
                onChange={handleChange}
                placeholder="national-strategy-20-years"
                className="w-full bg-[#0F0B07] border border-[rgba(255,255,255,0.1)] text-[#A1866B] rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-[#D4AF37]/50"
              />
            </div>
          </div>

          <div className="bg-[#1A140E] border border-[rgba(212,175,55,0.15)] rounded-2xl p-4 space-y-4">
            <div>
              <label className="text-xs text-[#A1866B] font-bold uppercase block mb-1.5">Subject</label>
              <select
                name="subject"
                value={
                  formData.subject ||
                  (SUBJECTS.some((s) => s.code === formData.subject || s.label === formData.subject)
                    ? formData.subject
                    : UNASSIGNED_SUBJECT.code)
                }
                onChange={handleChange}
                className="w-full bg-[#0F0B07] border border-[rgba(255,255,255,0.1)] text-[#F5E9D6] rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-[#D4AF37]/50"
              >
                {/* Surface a legacy free-text value (if any) so it isn't lost. */}
                {formData.subject &&
                  !SUBJECTS.some((s) => s.code === formData.subject || s.label === formData.subject) &&
                  formData.subject !== UNASSIGNED_SUBJECT.code && (
                    <option value={formData.subject}>{formData.subject} (เดิม)</option>
                  )}
                {getSubjectDropdownOptions().map((opt) => (
                  <option key={opt.code} value={opt.code === UNASSIGNED_SUBJECT.code ? '' : opt.code}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs text-[#A1866B] font-bold uppercase block mb-1.5">Document</label>
              <input
                type="text"
                name="document"
                value={formData.document}
                onChange={handleChange}
                placeholder="e.g. พระราชบัญญัติการอุดมศึกษา พ.ศ.2562"
                className="w-full bg-[#0F0B07] border border-[rgba(255,255,255,0.1)] text-[#F5E9D6] rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-[#D4AF37]/50"
              />
            </div>
            <div>
              <label className="text-xs text-[#A1866B] font-bold uppercase block mb-1.5">Law</label>
              <input
                type="text"
                name="law"
                value={formData.law}
                onChange={handleChange}
                placeholder="e.g. พ.ร.บ. ข้อมูลข่าวสารฯ"
                className="w-full bg-[#0F0B07] border border-[rgba(255,255,255,0.1)] text-[#F5E9D6] rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-[#D4AF37]/50"
              />
            </div>
            <div>
              <label className="text-xs text-[#A1866B] font-bold uppercase block mb-1.5">Topic</label>
              <input 
                type="text" 
                name="topic"
                value={formData.topic}
                onChange={handleChange}
                placeholder="e.g. หมวด 1 การเปิดเผยข้อมูล"
                className="w-full bg-[#0F0B07] border border-[rgba(255,255,255,0.1)] text-[#F5E9D6] rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-[#D4AF37]/50"
              />
            </div>
            <div>
              <label className="text-xs text-[#A1866B] font-bold uppercase block mb-1.5">Sort Order</label>
              <input 
                type="number" 
                name="sort_order"
                value={formData.sort_order}
                onChange={handleChange}
                className="w-full bg-[#0F0B07] border border-[rgba(255,255,255,0.1)] text-[#F5E9D6] rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-[#D4AF37]/50"
              />
            </div>
          </div>
        </div>

        {/* Right Column: Editor / Preview */}
        <div className="flex-1 bg-[#1A140E] border border-[rgba(212,175,55,0.15)] rounded-2xl flex flex-col overflow-hidden">
          <div className="flex items-center justify-between px-4 py-2 border-b border-[rgba(255,255,255,0.05)] bg-[#0F0B07]">
            <div className="flex gap-2">
              <button 
                type="button" 
                onClick={() => setIsPreview(false)}
                className={`px-3 py-1.5 rounded-lg text-sm font-bold flex items-center gap-2 transition-colors ${!isPreview ? 'bg-[#D4AF37]/10 text-[#D4AF37]' : 'text-[#A1866B] hover:text-[#F5E9D6]'}`}
              >
                <Edit2 size={14} /> Write
              </button>
              <button 
                type="button" 
                onClick={() => setIsPreview(true)}
                className={`px-3 py-1.5 rounded-lg text-sm font-bold flex items-center gap-2 transition-colors ${isPreview ? 'bg-[#D4AF37]/10 text-[#D4AF37]' : 'text-[#A1866B] hover:text-[#F5E9D6]'}`}
              >
                <Eye size={14} /> Preview
              </button>
            </div>
            <div className="text-xs text-[#A1866B] font-medium flex items-center gap-1">
              <Book size={12} /> Markdown Supported
            </div>
          </div>

          <div className="flex-1 overflow-y-auto relative">
            {!isPreview ? (
               <textarea
                 required
                 name="content_md"
                 value={formData.content_md}
                 onChange={handleChange}
                 placeholder="# Start writing your summary here..."
                 className="absolute inset-0 w-full h-full bg-transparent text-[#F5E9D6] p-6 resize-none focus:outline-none font-mono text-sm leading-relaxed"
               />
            ) : (
               <div className="prose prose-invert prose-yellow max-w-none p-6">
                 {formData.content_md ? (
                   <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeRaw]}>
                     {formData.content_md}
                   </ReactMarkdown>
                 ) : (
                   <p className="text-[#A1866B] italic">Nothing to preview yet.</p>
                 )}
               </div>
            )}
          </div>
        </div>

      </div>
    </form>
  )
}
