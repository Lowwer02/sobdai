'use client'

import { useState } from 'react'
import { Save, Eye, Edit2, Loader2, Link as LinkIcon, Book } from 'lucide-react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import rehypeRaw from 'rehype-raw'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useUnsavedChanges } from '@/hooks/useUnsavedChanges'
import { SUBJECTS, UNASSIGNED_SUBJECT, getSubjectDropdownOptions } from '@/lib/subjects'
import {
  stripEditPublicationState,
  type AdminSummaryKind,
} from '@/app/admin/summaries/summary-action-logic'

interface SummaryData {
  id?: string
  package_id?: string | null
  title: string
  slug: string
  subject?: string | null
  document?: string | null
  law?: string | null
  topic?: string | null
  content_md?: string | null
  sort_order?: number | null
  display_order?: number | null
  is_published?: boolean | null
}

interface PackageOption {
  id: string
  name: string
}

interface SummaryFormData {
  package_id: string
  package_ids: string[]
  title: string
  slug: string
  subject: string
  document: string
  law: string
  topic: string
  content_md: string
  sort_order: number | string
  display_order: number | string
  is_published: boolean
}

interface SummaryEditorProps {
  initialData?: SummaryData
  packages: PackageOption[]
  onSubmit: (data: any) => Promise<{ success: boolean; error?: string; id?: string }>
  isEditing?: boolean
  summaryKind: AdminSummaryKind
  selectedPackageIds?: readonly string[]
}

export default function SummaryEditor({
  initialData,
  packages,
  onSubmit,
  isEditing,
  summaryKind,
  selectedPackageIds,
}: SummaryEditorProps) {
  const router = useRouter()
  const initialPackages = selectedPackageIds
    ? [...selectedPackageIds]
    : initialData?.package_id
      ? [initialData.package_id]
      : []

  const [formData, setFormData] = useState<SummaryFormData>({
    package_id: initialPackages[0] || '',
    package_ids: initialPackages,
    title: initialData?.title || '',
    slug: initialData?.slug || '',
    subject: initialData?.subject || '',
    document: initialData?.document || '',
    law: initialData?.law || '',
    topic: initialData?.topic || '',
    content_md: initialData?.content_md || '',
    sort_order: initialData?.sort_order ?? 0,
    display_order: initialData?.display_order ?? 0,
    is_published: initialData?.is_published ?? false,
  })

  const [isPreview, setIsPreview] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [error, setError] = useState('')
  const [packageError, setPackageError] = useState('')
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
    setFormData(prev => name === 'package_id'
      ? { ...prev, package_id: String(val), package_ids: val ? [String(val)] : [] }
      : { ...prev, [name]: val })
    if (name === 'package_id') setPackageError('')
    setIsDirty(true)
  }

  const handlePackageToggle = (packageId: string) => {
    setFormData((prev) => {
      const packageIds = prev.package_ids.includes(packageId)
        ? prev.package_ids.filter((id) => id !== packageId)
        : [...prev.package_ids, packageId]
      return {
        ...prev,
        package_id: packageIds[0] || '',
        package_ids: packageIds,
      }
    })
    setPackageError('')
    setIsDirty(true)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')

    if (formData.package_ids.length === 0) {
      setPackageError('Choose at least one Package.')
      return
    }

    setPackageError('')
    setIsSaving(true)
    
    // Auto calculate read time (approx 200 words per minute for english, maybe slightly different for Thai, but good enough)
    const wordCount = formData.content_md.trim().split(/\s+/).length
    const readTime = Math.max(1, Math.ceil(wordCount / 200))
    
    const { package_ids: _packageIds, ...formDataWithoutPackageIds } = formData
    const commonData = isEditing
      ? stripEditPublicationState(formDataWithoutPackageIds)
      : formDataWithoutPackageIds
    const dataToSave = summaryKind === 'kp_native'
      ? {
          ...commonData,
          package_id: formData.package_ids[0],
          packageIds: formData.package_ids,
          read_time_minutes: readTime,
        }
      : {
          ...commonData,
          package_id: formData.package_ids[0],
          read_time_minutes: readTime,
        }

    try {
      const res = await onSubmit(dataToSave)
      if (!res.success) {
        setError(res.error || 'Failed to save summary')
      } else {
        setIsDirty(false)
        router.push('/admin/summaries')
      }
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : 'Failed to save summary')
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="min-h-[calc(100vh-120px)] flex flex-col gap-6">
      
      {/* Top Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold font-display text-[#F5E9D6] tracking-tight">
          {isEditing ? 'Edit Summary' : 'Create Summary'}
        </h1>
        <div className="flex flex-wrap items-center justify-end gap-3">
          {isEditing ? (
            <div
              role="status"
              aria-label="Publication status"
              className="flex max-w-[24rem] flex-col items-end gap-0.5 text-right"
            >
              <span className="text-sm font-bold text-[#F5E9D6]">
                Status: {formData.is_published ? 'Published' : 'Draft'}
              </span>
              <span className="text-xs text-[#A1866B]">
                Change status with the separate Publish / Unpublish control in Summary Bank.
              </span>
            </div>
          ) : (
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
          )}

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

      <div className="flex flex-col lg:flex-row gap-6 flex-1 min-h-0">
        {/* Left Column: Metadata */}
        <div className="w-full lg:w-[300px] flex flex-col gap-4 overflow-y-auto pr-0 lg:pr-2 custom-scrollbar max-h-[none] lg:max-h-full">
          <div className="bg-[#1A140E] border border-[rgba(212,175,55,0.15)] rounded-2xl p-4 space-y-4">
            {summaryKind === 'kp_native' ? (
              <fieldset
                aria-describedby="summary-package-help summary-package-error"
                className="rounded-2xl border border-[rgba(212,175,55,0.18)] bg-[#140E09]/80 px-3.5 py-4 shadow-[0_16px_32px_rgba(0,0,0,0.12)]"
              >
                <legend className="block px-1 text-sm font-semibold tracking-tight text-[#F5E9D6] font-display">
                  <span className="flex items-center gap-2">
                    <span>Use with Packages</span>
                    <span className="rounded-full border border-[#D4AF37]/25 bg-[#D4AF37]/10 px-2 py-0.5 text-[9px] font-bold uppercase tracking-[0.16em] text-[#D4AF37]">
                      Required
                    </span>
                  </span>
                </legend>
                <p id="summary-package-help" className="mt-1.5 px-1 text-xs leading-5 text-[#A1866B]">
                  Select every Package that should use this Summary.
                </p>
                <div
                  className="mt-4 max-h-64 space-y-2 overflow-y-auto pr-1 custom-scrollbar"
                  role="group"
                  aria-label="Use with Packages"
                >
                  {packages.map((pkg) => {
                    const isSelected = formData.package_ids.includes(pkg.id)
                    return (
                      <label
                        key={pkg.id}
                        className={`group flex min-h-12 cursor-pointer items-center gap-3 rounded-xl border px-3 py-2.5 text-sm transition-all duration-200 focus-within:ring-2 focus-within:ring-[#D4AF37]/15 ${
                          isSelected
                            ? 'border-[#D4AF37]/75 bg-[#D4AF37]/10 text-[#F5E9D6] shadow-[inset_0_0_0_1px_rgba(212,175,55,0.12)]'
                            : 'border-[rgba(255,255,255,0.08)] bg-[#0F0B07]/75 text-[#B59B82] hover:border-[#D4AF37]/45 hover:bg-[#21180F] hover:text-[#F5E9D6]'
                        }`}
                      >
                        <input
                          type="checkbox"
                          name="packageIds"
                          value={pkg.id}
                          checked={isSelected}
                          onChange={() => handlePackageToggle(pkg.id)}
                          disabled={isSaving}
                          className="h-4 w-4 shrink-0 accent-[#D4AF37] focus-visible:outline-none"
                        />
                        <span className="min-w-0 flex-1 break-words font-medium leading-5">
                          {pkg.name}
                        </span>
                        <span
                          aria-hidden="true"
                          className={`h-1.5 w-1.5 shrink-0 rounded-full transition-colors ${
                            isSelected ? 'bg-[#D4AF37]' : 'bg-[#6D5948] group-hover:bg-[#A1866B]'
                          }`}
                        />
                      </label>
                    )
                  })}
                </div>
                {packages.length === 0 && (
                  <p className="mt-4 rounded-xl border border-dashed border-[rgba(255,255,255,0.1)] bg-[#0F0B07]/60 px-3 py-3 text-xs leading-5 text-[#A1866B]">
                    No Packages are available.
                  </p>
                )}
                <div className="mt-4 flex items-center justify-between gap-3 border-t border-[rgba(255,255,255,0.07)] px-1 pt-3">
                  <span className="text-[10px] font-bold uppercase tracking-[0.16em] text-[#806A56]">
                    Package coverage
                  </span>
                  <span
                    className="inline-flex items-center rounded-full border border-[#D4AF37]/30 bg-[#D4AF37]/10 px-2.5 py-1 text-xs font-semibold text-[#D4AF37]"
                    aria-live="polite"
                  >
                    {formData.package_ids.length} selected
                  </span>
                </div>
                {packageError && (
                  <p
                    id="summary-package-error"
                    role="alert"
                    className="mt-3 rounded-xl border border-red-400/20 bg-red-500/10 px-3 py-2 text-xs font-medium leading-5 text-red-300"
                  >
                    {packageError}
                  </p>
                )}
              </fieldset>
            ) : (
              <div>
                <label className="text-xs text-[#A1866B] font-bold uppercase block mb-1.5">
                  Package <span className="text-red-400">*</span>
                </label>
                <select
                  required
                  name="package_id"
                  value={formData.package_id}
                  onChange={handleChange}
                  className="w-full bg-[#0F0B07] border border-[rgba(255,255,255,0.1)] text-[#F5E9D6] rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-[#D4AF37]/50"
                >
                  <option value="">-- Select Package --</option>
                  {packages.map((pkg) => <option key={pkg.id} value={pkg.id}>{pkg.name}</option>)}
                </select>
                {packageError && (
                  <p role="alert" className="mt-2 text-sm font-medium text-red-400">{packageError}</p>
                )}
              </div>
            )}
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
            <div>
              <label className="text-xs text-[#A1866B] font-bold uppercase block mb-1.5">Display Order</label>
              <input
                type="number"
                name="display_order"
                value={formData.display_order}
                onChange={handleChange}
                placeholder="0"
                className="w-full bg-[#0F0B07] border border-[rgba(255,255,255,0.1)] text-[#F5E9D6] rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-[#D4AF37]/50"
              />
              <p className="text-[10px] text-[#A1866B] mt-1">ค่ามากกว่า แสดงก่อน (เช่น 999 = บนสุด)</p>
            </div>
          </div>
        </div>

        {/* Right Column: Editor / Preview */}
        <div className="flex-1 min-h-[26rem] bg-[#1A140E] border border-[rgba(212,175,55,0.15)] rounded-2xl flex flex-col overflow-hidden">
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
