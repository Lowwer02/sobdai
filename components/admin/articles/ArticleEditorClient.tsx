'use client'

import { useState, useTransition, useRef } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import Image from 'next/image'
import {
  ArrowLeft,
  Save,
  Loader2,
  Camera,
  ImageIcon,
  X,
  Send,
  Archive,
  RotateCcw,
  AlertTriangle,
  FileText,
  Plus,
  Trash2,
  ChevronUp,
  ChevronDown,
  Link2,
  Info,
} from 'lucide-react'
import { toastEvent } from '@/hooks/useToast'
import { useUnsavedChanges } from '@/hooks/useUnsavedChanges'
import {
  createArticle,
  updateArticle,
  publishArticle,
  archiveArticle,
  restoreArticle,
  uploadArticleCover,
  updateArticlePackageRelations,
  type RelatedPackageItem,
} from '@/app/admin/articles/actions'
import {
  validateArticleForPublish,
  normalizeSlug,
  ARTICLE_MAX_LENGTHS,
  type Article,
  type ArticleSource,
  type PublicArticleAuthor,
} from '@/lib/articles'
import ConfirmDialog from '@/components/admin/ConfirmDialog'
import ArticleMarkdownEditor from '@/components/admin/articles/ArticleMarkdownEditor'
import ArticlePackagePicker from '@/components/admin/articles/ArticlePackagePicker'

export default function ArticleEditorClient({
  article,
  isEdit,
  initialPackageRelations = [],
  initialAuthors = [],
  affiliateCollections = [],
}: {
  article: Article | null
  isEdit: boolean
  initialPackageRelations?: RelatedPackageItem[]
  initialAuthors?: PublicArticleAuthor[]
  /** Affiliate collections for the assignment select (all statuses; non-published labeled). */
  affiliateCollections?: { id: string; name: string; status: string }[]
}) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [isLifecyclePending, startLifecycleTransition] = useTransition()
  const [isUploading, setIsUploading] = useState(false)
  const [error, setError] = useState('')
  const [isDirty, setIsDirty] = useState(false)
  const [isSlugManuallyEdited, setIsSlugManuallyEdited] = useState(false)

  // Fields
  const [title, setTitle] = useState(article?.title || '')
  const [slug, setSlug] = useState(article?.slug || '')
  const [authorId, setAuthorId] = useState(article?.author_id || '')
  const [authors] = useState<PublicArticleAuthor[]>(initialAuthors)
  const [packageRelations, setPackageRelations] = useState<RelatedPackageItem[]>(initialPackageRelations)
  const [sources, setSources] = useState<ArticleSource[]>(
    Array.isArray(article?.sources) ? article.sources : []
  )
  const [excerpt, setExcerpt] = useState(article?.excerpt || '')
  const [bodyMarkdown, setBodyMarkdown] = useState(article?.body_markdown || '')
  const [category, setCategory] = useState(article?.category || '')
  const [tags, setTags] = useState<string[]>(article?.tags || [])
  const [tagInput, setTagInput] = useState('')
  const [coverImageUrl, setCoverImageUrl] = useState(article?.cover_image_url || '')
  const [coverImageAlt, setCoverImageAlt] = useState(article?.cover_image_alt || '')

  // SEO Fields
  const [seoTitle, setSeoTitle] = useState(article?.seo_title || '')
  const [seoDescription, setSeoDescription] = useState(article?.seo_description || '')
  const [canonicalUrl, setCanonicalUrl] = useState(article?.canonical_url || '')
  const [ogImageUrl, setOgImageUrl] = useState(article?.og_image_url || '')

  // Affiliate rail wiring (M1): enabled + assigned collection ONLY — no
  // placement/product-count controls (those are fixed surface contracts).
  const [affiliateEnabled, setAffiliateEnabled] = useState(article?.affiliate_enabled ?? false)
  const [affiliateCollectionId, setAffiliateCollectionId] = useState(
    article?.affiliate_collection_id || ''
  )

  // Publish Readiness errors
  const [publishErrors, setPublishErrors] = useState<Record<string, string>>({})
  const [actionModal, setActionModal] = useState<'publish' | 'archive' | 'restore' | null>(null)

  const fileInputRef = useRef<HTMLInputElement>(null)
  useUnsavedChanges(isDirty)

  const handleTitleChange = (val: string) => {
    setTitle(val)
    setIsDirty(true)
    if (!isSlugManuallyEdited && !isEdit) {
      setSlug(normalizeSlug(val))
    }
  }

  const handleSlugChange = (val: string) => {
    setIsSlugManuallyEdited(true)
    setSlug(val)
    setIsDirty(true)
  }

  const handleAddTag = () => {
    const trimmed = tagInput.trim().replace(/^#/, '')
    if (!trimmed) return

    if (tags.length >= ARTICLE_MAX_LENGTHS.max_tags) {
      toastEvent(`ใส่แท็กได้ไม่เกิน ${ARTICLE_MAX_LENGTHS.max_tags} แท็ก`, 'error')
      return
    }
    if (trimmed.length > ARTICLE_MAX_LENGTHS.tag) {
      toastEvent(`แต่ละแท็กต้องไม่เกิน ${ARTICLE_MAX_LENGTHS.tag} ตัวอักษร`, 'error')
      return
    }
    if (tags.includes(trimmed)) {
      setTagInput('')
      return
    }

    setTags([...tags, trimmed])
    setTagInput('')
    setIsDirty(true)
  }

  const handleRemoveTag = (index: number) => {
    setTags(tags.filter((_, i) => i !== index))
    setIsDirty(true)
  }

  const handleAddSource = () => {
    setSources([...sources, { title: '', url: '', source_date: '' }])
    setIsDirty(true)
  }

  const handleRemoveSource = (index: number) => {
    setSources(sources.filter((_, i) => i !== index))
    setIsDirty(true)
  }

  const handleMoveSourceUp = (index: number) => {
    if (index <= 0) return
    const next = [...sources]
    const temp = next[index - 1]
    next[index - 1] = next[index]
    next[index] = temp
    setSources(next)
    setIsDirty(true)
  }

  const handleMoveSourceDown = (index: number) => {
    if (index >= sources.length - 1) return
    const next = [...sources]
    const temp = next[index + 1]
    next[index + 1] = next[index]
    next[index] = temp
    setSources(next)
    setIsDirty(true)
  }

  const handleSourceChange = (index: number, field: keyof ArticleSource, value: string) => {
    const next = [...sources]
    next[index] = { ...next[index], [field]: value }
    setSources(next)
    setIsDirty(true)
  }

  const handleCoverFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    setIsUploading(true)
    const formData = new FormData()
    formData.append('file', file)

    const res = await uploadArticleCover(formData)
    setIsUploading(false)

    if (!res.success || !res.url) {
      toastEvent(res.error || 'อัปโหลดรูปภาพปกไม่สำเร็จ', 'error')
    } else {
      setCoverImageUrl(res.url)
      setIsDirty(true)
      toastEvent('อัปโหลดรูปภาพปกเรียบร้อยแล้ว', 'success')
    }
  }

  const getFormPayload = () => ({
    title,
    slug,
    excerpt: excerpt || null,
    body_markdown: bodyMarkdown || null,
    category: category || null,
    tags,
    author_id: authorId || null,
    sources,
    cover_image_url: coverImageUrl || null,
    cover_image_alt: coverImageAlt || null,
    seo_title: seoTitle || null,
    seo_description: seoDescription || null,
    canonical_url: canonicalUrl || null,
    og_image_url: ogImageUrl || null,
    // Affiliate rail wiring (M1): enabled + collection id (null when off/none).
    affiliate_enabled: affiliateEnabled,
    affiliate_collection_id: affiliateEnabled && affiliateCollectionId ? affiliateCollectionId : null,
  })

  const handleSave = () => {
    setError('')
    setPublishErrors({})
    startTransition(async () => {
      const payload = getFormPayload()
      if (isEdit && article) {
        const res = await updateArticle(article.id, payload)
        if (!res.success) {
          setError(res.error || 'เกิดข้อผิดพลาดในการบันทึก')
          toastEvent(res.error || 'เกิดข้อผิดพลาดในการบันทึก', 'error')
          return
        }

        const relRes = await updateArticlePackageRelations(
          article.id,
          packageRelations.map((p) => p.id)
        )
        if (!relRes.success) {
          setError(relRes.error || 'เกิดข้อผิดพลาดในการบันทึกแพ็กเกจที่เกี่ยวข้อง')
          toastEvent(relRes.error || 'เกิดข้อผิดพลาดในการบันทึกแพ็กเกจที่เกี่ยวข้อง', 'error')
          return
        }

        setIsDirty(false)
        toastEvent(
          article.status === 'published' || article.status === 'archived'
            ? 'บันทึกการแก้ไขเรียบร้อยแล้ว'
            : 'บันทึกร่างเรียบร้อยแล้ว',
          'success'
        )
        router.refresh()
      } else {
        const res = await createArticle(payload)
        if (!res.success) {
          setError(res.error || 'เกิดข้อผิดพลาดในการสร้างบทความ')
          toastEvent(res.error || 'เกิดข้อผิดพลาดในการสร้างบทความ', 'error')
        }
      }
    })
  }

  const handlePublishClick = () => {
    setError('')
    setPublishErrors({})

    const candidate = {
      ...getFormPayload(),
      status: 'published',
      published_at: article?.published_at || new Date().toISOString(),
    }

    const { ok, errors } = validateArticleForPublish(candidate)
    if (!ok) {
      setPublishErrors(errors)
      toastEvent('กรุณากรอกข้อมูลที่จำเป็นให้ครบถ้วนก่อนทำการเผยแพร่', 'error')
      return
    }

    setActionModal('publish')
  }

  const runLifecycleAction = (actionType: 'publish' | 'archive' | 'restore') => {
    if (!article) return
    startLifecycleTransition(async () => {
      if (isDirty) {
        const saveRes = await updateArticle(article.id, getFormPayload())
        if (!saveRes.success) {
          setError(saveRes.error || 'ไม่สามารถบันทึกข้อมูลก่อนเปลี่ยนสถานะได้')
          toastEvent(saveRes.error || 'ไม่สามารถบันทึกข้อมูลก่อนเปลี่ยนสถานะได้', 'error')
          setActionModal(null)
          return
        }

        const relRes = await updateArticlePackageRelations(
          article.id,
          packageRelations.map((p) => p.id)
        )
        if (!relRes.success) {
          setError(relRes.error || 'ไม่สามารถบันทึกแพ็กเกจที่เกี่ยวข้องก่อนเปลี่ยนสถานะได้')
          toastEvent(relRes.error || 'ไม่สามารถบันทึกแพ็กเกจที่เกี่ยวข้องก่อนเปลี่ยนสถานะได้', 'error')
          setActionModal(null)
          return
        }

        setIsDirty(false)
      }

      let res: { success: boolean; error?: string }
      if (actionType === 'publish') {
        res = await publishArticle(article.id)
      } else if (actionType === 'archive') {
        res = await archiveArticle(article.id)
      } else {
        res = await restoreArticle(article.id)
      }

      setActionModal(null)
      if (!res.success) {
        toastEvent(res.error || 'เกิดข้อผิดพลาดในการเปลี่ยนสถานะ', 'error')
      } else {
        setIsDirty(false)
        toastEvent(
          actionType === 'publish'
            ? 'เผยแพร่บทความเรียบร้อยแล้ว'
            : actionType === 'archive'
            ? 'จัดเก็บบทความเรียบร้อยแล้ว'
            : 'กู้คืนบทความสู่สถานะ Draft เรียบร้อยแล้ว',
          'success'
        )
        router.push('/admin/articles')
        router.refresh()
      }
    })
  }

  const saveButtonLabel =
    article?.status === 'published' || article?.status === 'archived'
      ? 'บันทึกการแก้ไข'
      : 'บันทึกร่าง'

  return (
    <div className="p-4 sm:p-6 max-w-7xl mx-auto space-y-6 sm:space-y-8" onChange={() => setIsDirty(true)}>
      {/* Action Panel (Desktop Sticky / Mobile Stacked) */}
      <div className="bg-[#1A140E]/95 backdrop-blur border border-[#D4AF37]/30 p-4 rounded-xl md:sticky md:top-4 z-20 shadow-xl flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3 min-w-0">
          <Link
            href="/admin/articles"
            className="p-2 text-[#A1866B] hover:text-[#D4AF37] hover:bg-[#D4AF37]/10 rounded-lg transition-colors shrink-0"
          >
            <ArrowLeft size={20} />
          </Link>
          <div className="min-w-0">
            <h1 className="text-base sm:text-lg font-bold text-[#F5E9D6] truncate">
              {isEdit ? `แก้ไขบทความ: ${article?.title || ''}` : 'สร้างบทความใหม่'}
            </h1>
            <div className="flex items-center gap-2 text-xs text-[#A1866B] truncate">
              <span>สถานะ: <strong className="capitalize text-[#D4AF37]">{article?.status || 'draft'}</strong></span>
              {isDirty && <span className="text-amber-400 font-semibold">• มีการเปลี่ยนแปลง</span>}
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 sm:gap-3 w-full sm:w-auto shrink-0 justify-end">
          <button
            type="button"
            onClick={handleSave}
            disabled={isPending || isLifecyclePending}
            className="flex-1 sm:flex-initial inline-flex items-center justify-center gap-2 px-4 py-2 bg-[#1F1913] border border-[#D4AF37]/30 hover:border-[#D4AF37] text-[#F5E9D6] font-semibold text-sm rounded-lg transition-colors disabled:opacity-50"
          >
            {isPending ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
            {saveButtonLabel}
          </button>

          {isEdit && article && (
            <>
              {article.status === 'draft' && (
                <button
                  type="button"
                  onClick={handlePublishClick}
                  disabled={isPending || isLifecyclePending}
                  className="flex-1 sm:flex-initial inline-flex items-center justify-center gap-2 px-4 py-2 bg-[#22C55E] hover:bg-[#22C55E]/90 text-white font-semibold text-sm rounded-lg transition-colors shadow-md disabled:opacity-50"
                >
                  <Send size={16} />
                  เผยแพร่
                </button>
              )}

              {article.status === 'published' && (
                <button
                  type="button"
                  onClick={() => setActionModal('archive')}
                  disabled={isPending || isLifecyclePending}
                  className="flex-1 sm:flex-initial inline-flex items-center justify-center gap-2 px-4 py-2 bg-amber-600 hover:bg-amber-600/90 text-white font-semibold text-sm rounded-lg transition-colors shadow-md disabled:opacity-50"
                >
                  <Archive size={16} />
                  จัดเก็บ (Archive)
                </button>
              )}

              {article.status === 'archived' && (
                <button
                  type="button"
                  onClick={() => setActionModal('restore')}
                  disabled={isPending || isLifecyclePending}
                  className="flex-1 sm:flex-initial inline-flex items-center justify-center gap-2 px-4 py-2 bg-[#D4AF37] hover:bg-[#D4AF37]/90 text-[#0F0B07] font-semibold text-sm rounded-lg transition-colors shadow-md disabled:opacity-50"
                >
                  <RotateCcw size={16} />
                  กู้คืนเป็น Draft
                </button>
              )}
            </>
          )}
        </div>
      </div>

      {/* Error Banners */}
      {error && (
        <div className="bg-red-500/10 border border-red-500/30 p-4 rounded-xl text-red-400 text-sm flex items-center gap-3">
          <AlertTriangle size={20} className="shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {Object.keys(publishErrors).length > 0 && (
        <div className="bg-amber-500/10 border border-amber-500/30 p-4 rounded-xl text-amber-300 text-sm space-y-2">
          <div className="font-bold flex items-center gap-2">
            <AlertTriangle size={18} />
            ไม่สามารถเผยแพร่ได้ เนื่องจากข้อมูลยังไม่ครบถ้วน:
          </div>
          <ul className="list-disc list-inside space-y-1 text-xs">
            {Object.entries(publishErrors).map(([key, err]) => (
              <li key={key}>{err}</li>
            ))}
          </ul>
        </div>
      )}

      {/* Form Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 sm:gap-8">
        {/* Main Content (Left 2 cols) */}
        <div className="lg:col-span-2 space-y-6">
          {/* Basic Info Box */}
          <div className="bg-[#1A140E] border border-[#D4AF37]/20 p-4 sm:p-6 rounded-xl space-y-4">
            <h2 className="text-base font-bold text-[#F5E9D6] border-b border-[#D4AF37]/10 pb-3 flex items-center gap-2">
              <FileText size={18} className="text-[#D4AF37]" /> ข้อมูลหลักบทความ (Basic Info)
            </h2>

            {/* Title */}
            <div>
              <label className="block text-xs font-semibold text-[#A1866B] uppercase mb-1">
                หัวข้อบทความ (Title) <span className="text-red-400">*</span>
              </label>
              <input
                type="text"
                value={title}
                onChange={(e) => handleTitleChange(e.target.value)}
                placeholder="เช่น Checklist ก่อนสมัครสอบราชการ ต้องเตรียมอะไรบ้าง"
                className="w-full bg-[#0F0B07] border border-[#D4AF37]/20 rounded-lg px-4 py-2.5 text-sm text-[#F5E9D6] focus:outline-none focus:border-[#D4AF37]"
              />
              <div className="text-right text-[10px] text-[#A1866B] mt-1">
                {title.length} / {ARTICLE_MAX_LENGTHS.title}
              </div>
            </div>

            {/* Slug */}
            <div>
              <label className="block text-xs font-semibold text-[#A1866B] uppercase mb-1">
                Slug (URL Path) <span className="text-red-400">*</span>
              </label>
              <div className="flex items-center gap-2">
                <span className="text-xs text-[#A1866B] font-mono shrink-0">/articles/</span>
                <input
                  type="text"
                  value={slug}
                  onChange={(e) => handleSlugChange(e.target.value)}
                  placeholder="เช่น checklist-before-applying-gov-exam"
                  className="w-full bg-[#0F0B07] border border-[#D4AF37]/20 rounded-lg px-4 py-2 text-sm text-[#F5E9D6] font-mono focus:outline-none focus:border-[#D4AF37]"
                />
              </div>
              <p className="text-[11px] text-[#A1866B] mt-1">
                ใช้ตัวอักษรไทย (ก-๙), a-z, 0-9 และขีดกลาง (-) เท่านั้น
              </p>
            </div>

            {/* Excerpt */}
            <div>
              <label className="block text-xs font-semibold text-[#A1866B] uppercase mb-1">
                บทสรุปย่อ (Excerpt)
              </label>
              <textarea
                rows={3}
                value={excerpt}
                onChange={(e) => {
                  setExcerpt(e.target.value)
                  setIsDirty(true)
                }}
                placeholder="สรุปย่อสั้นๆ สำหรับแสดงในบัตรบทความและผลการค้นหา Search Engine..."
                className="w-full bg-[#0F0B07] border border-[#D4AF37]/20 rounded-lg px-4 py-2.5 text-sm text-[#F5E9D6] focus:outline-none focus:border-[#D4AF37]"
              />
              <div className="text-right text-[10px] text-[#A1866B] mt-1">
                {excerpt.length} / {ARTICLE_MAX_LENGTHS.excerpt}
              </div>
            </div>
          </div>

          {/* Markdown Body Box */}
          <div className="bg-[#1A140E] border border-[#D4AF37]/20 p-4 sm:p-6 rounded-xl space-y-4">
            <h2 className="text-base font-bold text-[#F5E9D6] border-b border-[#D4AF37]/10 pb-3">
              เนื้อหาหลักบทความ (Body Markdown)
            </h2>
            <ArticleMarkdownEditor
              value={bodyMarkdown}
              onChange={(val) => {
                setBodyMarkdown(val)
                setIsDirty(true)
              }}
            />
          </div>

          {/* Structured Sources Repeater Box */}
          <div className="bg-[#1A140E] border border-[#D4AF37]/20 p-4 sm:p-6 rounded-xl space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-[#D4AF37]/10 pb-3">
              <h2 className="text-base font-bold text-[#F5E9D6] flex items-center gap-2">
                <Link2 size={18} className="text-[#D4AF37]" /> เอกสารและแหล่งข้อมูลอ้างอิง
              </h2>
              <button
                type="button"
                onClick={handleAddSource}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-[#D4AF37]/15 hover:bg-[#D4AF37]/25 text-[#D4AF37] border border-[#D4AF37]/30 font-semibold text-xs rounded-lg transition-colors w-fit"
              >
                <Plus size={14} /> เพิ่มแหล่งอ้างอิง
              </button>
            </div>

            {/* Soft editorial guidance banner */}
            <div className="bg-[#D4AF37]/5 border border-[#D4AF37]/20 p-3 rounded-lg flex items-start gap-2.5 text-xs text-[#E5D7C5]">
              <Info size={16} className="text-[#D4AF37] shrink-0 mt-0.5" />
              <span>หากบทความมีข้อเท็จจริงจากกฎหมาย ประกาศ มติ หรือหน่วยงานราชการ แนะนำให้เพิ่มแหล่งข้อมูลอ้างอิง</span>
            </div>

            {sources.length === 0 ? (
              <div className="text-center py-6 border border-dashed border-[#D4AF37]/20 rounded-lg text-xs text-[#A1866B]">
                ยังไม่มีแหล่งข้อมูลอ้างอิงที่ระบุ (ไม่บังคับสำหรับบทความทั่วไป)
              </div>
            ) : (
              <div className="space-y-4">
                {sources.map((src, idx) => (
                  <div
                    key={idx}
                    className="p-4 bg-[#0F0B07] border border-[#D4AF37]/20 rounded-lg space-y-3 relative group"
                  >
                    <div className="flex items-center justify-between border-b border-[#D4AF37]/10 pb-2">
                      <span className="text-xs font-semibold text-[#D4AF37]">
                        แหล่งข้อมูล #{idx + 1}
                      </span>
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => handleMoveSourceUp(idx)}
                          disabled={idx === 0}
                          className="p-1 text-[#A1866B] hover:text-[#D4AF37] disabled:opacity-30 disabled:hover:text-[#A1866B] transition-colors rounded"
                          title="เลื่อนขึ้น"
                        >
                          <ChevronUp size={16} />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleMoveSourceDown(idx)}
                          disabled={idx === sources.length - 1}
                          className="p-1 text-[#A1866B] hover:text-[#D4AF37] disabled:opacity-30 disabled:hover:text-[#A1866B] transition-colors rounded"
                          title="เลื่อนลง"
                        >
                          <ChevronDown size={16} />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleRemoveSource(idx)}
                          className="p-1 text-red-400 hover:text-red-300 hover:bg-red-500/10 rounded transition-colors ml-1"
                          title="ลบแหล่งอ้างอิง"
                        >
                          <Trash2 size={15} />
                        </button>
                      </div>
                    </div>

                    <div className="space-y-3">
                      <div>
                        <label className="block text-[11px] font-semibold text-[#A1866B] uppercase mb-1">
                          ชื่อเอกสาร / แหล่งข้อมูล <span className="text-red-400">*</span>
                        </label>
                        <input
                          type="text"
                          value={src.title}
                          onChange={(e) => handleSourceChange(idx, 'title', e.target.value)}
                          placeholder="เช่น มติคณะรัฐมนตรี เรื่อง แผนพัฒนาระบบราชการ หรือ ระเบียบ ก.พ. ว่าด้วย..."
                          className="w-full bg-[#1A140E] border border-[#D4AF37]/20 rounded-lg px-3 py-2 text-xs text-[#F5E9D6] focus:outline-none focus:border-[#D4AF37]"
                        />
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                        <div className="sm:col-span-2">
                          <label className="block text-[11px] font-semibold text-[#A1866B] uppercase mb-1">
                            URL แหล่งข้อมูล <span className="text-red-400">*</span>
                          </label>
                          <input
                            type="url"
                            value={src.url}
                            onChange={(e) => handleSourceChange(idx, 'url', e.target.value)}
                            placeholder="https://www.ocsc.go.th/..."
                            className="w-full bg-[#1A140E] border border-[#D4AF37]/20 rounded-lg px-3 py-2 text-xs text-[#F5E9D6] focus:outline-none focus:border-[#D4AF37]"
                          />
                        </div>

                        <div>
                          <label className="block text-[11px] font-semibold text-[#A1866B] uppercase mb-1">
                            วันที่เอกสาร (ไม่บังคับ)
                          </label>
                          <input
                            type="date"
                            value={src.source_date || ''}
                            onChange={(e) => handleSourceChange(idx, 'source_date', e.target.value)}
                            className="w-full bg-[#1A140E] border border-[#D4AF37]/20 rounded-lg px-3 py-2 text-xs text-[#F5E9D6] focus:outline-none focus:border-[#D4AF37]"
                          />
                          <p className="text-[10px] text-[#A1866B] mt-1">
                            ใช้ปี ค.ศ. เช่น 11/08/2026 หากไม่ทราบให้เว้นว่าง
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Sidebar Controls (Right 1 col) */}
        <div className="space-y-6">
          {/* Related Packages Picker */}
          <ArticlePackagePicker
            articleId={article?.id || null}
            selectedPackages={packageRelations}
            onChange={(pkgs) => {
              setPackageRelations(pkgs)
              setIsDirty(true)
            }}
          />

          {/* Cover Upload Box */}
          <div className="bg-[#1A140E] border border-[#D4AF37]/20 p-4 sm:p-6 rounded-xl space-y-4">
            <h2 className="text-base font-bold text-[#F5E9D6] border-b border-[#D4AF37]/10 pb-3 flex items-center gap-2">
              <Camera size={18} className="text-[#D4AF37]" /> รูปภาพปกบทความ (Cover)
            </h2>

            {coverImageUrl ? (
              <div className="relative aspect-video rounded-lg overflow-hidden border border-[#D4AF37]/30 group bg-[#0F0B07]">
                <Image src={coverImageUrl} alt={coverImageAlt || 'Cover'} fill className="object-cover" />
                <button
                  type="button"
                  onClick={() => {
                    setCoverImageUrl('')
                    setIsDirty(true)
                  }}
                  className="absolute top-2 right-2 p-1.5 bg-black/70 text-white rounded-full hover:bg-red-600 transition-colors"
                  title="ลบรูปปก"
                >
                  <X size={16} />
                </button>
              </div>
            ) : (
              <div
                onClick={() => fileInputRef.current?.click()}
                className="border-2 border-dashed border-[#D4AF37]/30 hover:border-[#D4AF37] rounded-lg aspect-video flex flex-col items-center justify-center cursor-pointer bg-[#0F0B07]/50 hover:bg-[#0F0B07] transition-colors p-4 text-center"
              >
                {isUploading ? (
                  <Loader2 size={32} className="animate-spin text-[#D4AF37]" />
                ) : (
                  <>
                    <ImageIcon size={32} className="text-[#A1866B] mb-2" />
                    <span className="text-xs font-semibold text-[#D4AF37]">คลิกเพื่ออัปโหลดรูปปก</span>
                    <span className="text-[10px] text-[#A1866B] mt-1">แนะนำ 1200 × 675 (16:9), สูงสุด 4 MB</span>
                  </>
                )}
              </div>
            )}

            <input
              ref={fileInputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp,image/heic"
              onChange={handleCoverFileUpload}
              className="hidden"
            />

            <div>
              <label className="block text-xs font-semibold text-[#A1866B] uppercase mb-1">
                URL รูปภาพปก (หรืออัปโหลดด้านบน)
              </label>
              <input
                type="text"
                value={coverImageUrl}
                onChange={(e) => {
                  setCoverImageUrl(e.target.value)
                  setIsDirty(true)
                }}
                placeholder="https://..."
                className="w-full bg-[#0F0B07] border border-[#D4AF37]/20 rounded-lg px-3 py-2 text-xs text-[#F5E9D6] focus:outline-none focus:border-[#D4AF37]"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-[#A1866B] uppercase mb-1">
                คำอธิบายรูปภาพปก (Alt Text)
              </label>
              <input
                type="text"
                value={coverImageAlt}
                onChange={(e) => {
                  setCoverImageAlt(e.target.value)
                  setIsDirty(true)
                }}
                placeholder="เช่น ภาพประกอบคำแนะนำการสมัครสอบราชการ"
                className="w-full bg-[#0F0B07] border border-[#D4AF37]/20 rounded-lg px-3 py-2 text-xs text-[#F5E9D6] focus:outline-none focus:border-[#D4AF37]"
              />
            </div>
          </div>

          {/* Author Selection Box */}
          <div className="bg-[#1A140E] border border-[#D4AF37]/20 p-4 sm:p-6 rounded-xl space-y-4">
            <div className="flex items-center justify-between border-b border-[#D4AF37]/10 pb-3">
              <h2 className="text-base font-bold text-[#F5E9D6]">
                ผู้เขียนบทความ (Author)
              </h2>
              <Link
                href="/admin/articles/authors"
                target="_blank"
                className="text-xs text-[#D4AF37] hover:underline"
              >
                จัดการผู้เขียน ↗
              </Link>
            </div>

            <div>
              <label className="block text-xs font-semibold text-[#A1866B] uppercase mb-1">
                เลือกผู้เขียนบทความ
              </label>
              <select
                value={authorId}
                onChange={(e) => {
                  setAuthorId(e.target.value)
                  setIsDirty(true)
                }}
                className="w-full bg-[#0F0B07] border border-[#D4AF37]/20 rounded-lg px-3 py-2 text-sm text-[#F5E9D6] focus:outline-none focus:border-[#D4AF37]"
              >
                <option value="">ทีมบรรณาธิการ Sobdai (ค่าเริ่มต้น)</option>
                {authors.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.display_name} {a.role_title ? `(${a.role_title})` : ''}
                  </option>
                ))}
              </select>
              <p className="text-[11px] text-[#A1866B] mt-1.5 leading-relaxed">
                หากไม่ระบุ ระบบจะแสดงบทความในนาม &quot;ทีมบรรณาธิการ Sobdai&quot;
              </p>
            </div>
          </div>

          {/* Affiliate Recommendations Box (M1) — enabled + collection ONLY.
              The placement (desktop sidebar / mobile inline) and the
              5-product cap are fixed surface contracts, not editor controls. */}
          <div className="bg-[#1A140E] border border-[#D4AF37]/20 p-4 sm:p-6 rounded-xl space-y-4">
            <h2 className="text-base font-bold text-[#F5E9D6] border-b border-[#D4AF37]/10 pb-3">
              สินค้าแนะนำ (Affiliate)
            </h2>

            <label className="flex items-center gap-3 p-3 bg-[#0F0B07] border border-[rgba(255,255,255,0.05)] rounded-lg cursor-pointer hover:border-[#D4AF37]/30 transition-colors">
              <input
                type="checkbox"
                checked={affiliateEnabled}
                onChange={(e) => {
                  setAffiliateEnabled(e.target.checked)
                  setIsDirty(true)
                }}
                className="w-4 h-4 rounded border-[rgba(255,255,255,0.15)] bg-[#0F0B07] accent-[#D4AF37] cursor-pointer"
              />
              <span>
                <span className="block text-sm font-medium text-[#F5E9D6]">แสดงสินค้าแนะนำบนบทความนี้</span>
                <span className="block text-xs text-[#A1866B] mt-0.5">
                  แสดงเฉพาะเมื่อคอลเลกชันที่เลือกเผยแพร่แล้วและมีสินค้าที่เผยแพร่อย่างน้อย 1 รายการ
                </span>
              </span>
            </label>

            <div className={affiliateEnabled ? '' : 'opacity-50 pointer-events-none'}>
              <label className="block text-xs font-semibold text-[#A1866B] uppercase mb-1">
                คอลเลกชันสินค้า
              </label>
              <select
                value={affiliateCollectionId}
                onChange={(e) => {
                  setAffiliateCollectionId(e.target.value)
                  setIsDirty(true)
                }}
                disabled={!affiliateEnabled}
                className="w-full bg-[#0F0B07] border border-[#D4AF37]/20 rounded-lg px-3 py-2 text-sm text-[#F5E9D6] focus:outline-none focus:border-[#D4AF37]"
              >
                <option value="">— เลือกคอลเลกชัน —</option>
                {affiliateCollections.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                    {c.status !== 'published' ? ` (${c.status})` : ''}
                  </option>
                ))}
              </select>
              {affiliateCollections.length === 0 && (
                <p className="text-[10px] text-[#A1866B] mt-1.5">
                  ยังไม่มีคอลเลกชัน — สร้างได้ที่เมนู Affiliate
                </p>
              )}
            </div>
          </div>

          {/* Taxonomy Box */}
          <div className="bg-[#1A140E] border border-[#D4AF37]/20 p-4 sm:p-6 rounded-xl space-y-4">
            <h2 className="text-base font-bold text-[#F5E9D6] border-b border-[#D4AF37]/10 pb-3">
              หมวดหมู่และแท็ก (Taxonomy)
            </h2>

            <div>
              <label className="block text-xs font-semibold text-[#A1866B] uppercase mb-1">
                หมวดหมู่ (Category)
              </label>
              <input
                type="text"
                value={category}
                onChange={(e) => {
                  setCategory(e.target.value)
                  setIsDirty(true)
                }}
                placeholder="เช่น คู่มือสอบราชการ, ความรู้ทั่วไป"
                className="w-full bg-[#0F0B07] border border-[#D4AF37]/20 rounded-lg px-3 py-2 text-sm text-[#F5E9D6] focus:outline-none focus:border-[#D4AF37]"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-[#A1866B] uppercase mb-1">
                แท็ก (Tags - สูงสุด 10 แท็ก)
              </label>
              <div className="flex gap-2 mb-2">
                <input
                  type="text"
                  value={tagInput}
                  onChange={(e) => setTagInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault()
                      handleAddTag()
                    }
                  }}
                  placeholder="พิมพ์แท็กแล้วกด เพิ่ม"
                  className="flex-1 bg-[#0F0B07] border border-[#D4AF37]/20 rounded-lg px-3 py-1.5 text-xs text-[#F5E9D6] focus:outline-none focus:border-[#D4AF37]"
                />
                <button
                  type="button"
                  onClick={handleAddTag}
                  className="px-3 py-1.5 bg-[#D4AF37]/20 text-[#D4AF37] hover:bg-[#D4AF37] hover:text-[#0F0B07] font-semibold text-xs rounded-lg transition-colors"
                >
                  เพิ่ม
                </button>
              </div>

              <div className="flex flex-wrap gap-1.5">
                {tags.map((t, idx) => (
                  <span
                    key={idx}
                    className="inline-flex items-center gap-1 px-2.5 py-1 bg-[#0F0B07] border border-[#D4AF37]/30 text-[#D4AF37] text-xs rounded-md"
                  >
                    #{t}
                    <button
                      type="button"
                      onClick={() => handleRemoveTag(idx)}
                      className="hover:text-red-400 ml-1"
                    >
                      <X size={12} />
                    </button>
                  </span>
                ))}
              </div>
            </div>
          </div>

          {/* SEO Box */}
          <div className="bg-[#1A140E] border border-[#D4AF37]/20 p-4 sm:p-6 rounded-xl space-y-4">
            <h2 className="text-base font-bold text-[#F5E9D6] border-b border-[#D4AF37]/10 pb-3">
              การตั้งค่า SEO & Social
            </h2>

            <div>
              <label className="block text-xs font-semibold text-[#A1866B] uppercase mb-1">
                SEO Title
              </label>
              <input
                type="text"
                value={seoTitle}
                onChange={(e) => {
                  setSeoTitle(e.target.value)
                  setIsDirty(true)
                }}
                placeholder="หากเว้นว่างจะใช้หัวข้อบทความอัตโนมัติ"
                className="w-full bg-[#0F0B07] border border-[#D4AF37]/20 rounded-lg px-3 py-2 text-xs text-[#F5E9D6] focus:outline-none focus:border-[#D4AF37]"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-[#A1866B] uppercase mb-1">
                SEO Description
              </label>
              <textarea
                rows={3}
                value={seoDescription}
                onChange={(e) => {
                  setSeoDescription(e.target.value)
                  setIsDirty(true)
                }}
                placeholder="หากเว้นว่างจะใช้บทสรุปย่อ (excerpt) อัตโนมัติ"
                className="w-full bg-[#0F0B07] border border-[#D4AF37]/20 rounded-lg px-3 py-2 text-xs text-[#F5E9D6] focus:outline-none focus:border-[#D4AF37]"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-[#A1866B] uppercase mb-1">
                Canonical URL
              </label>
              <input
                type="text"
                value={canonicalUrl}
                onChange={(e) => {
                  setCanonicalUrl(e.target.value)
                  setIsDirty(true)
                }}
                placeholder="https://sobdai.com หรือ /articles/..."
                className="w-full bg-[#0F0B07] border border-[#D4AF37]/20 rounded-lg px-3 py-2 text-xs text-[#F5E9D6] focus:outline-none focus:border-[#D4AF37]"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-[#A1866B] uppercase mb-1">
                OG Image URL
              </label>
              <input
                type="text"
                value={ogImageUrl}
                onChange={(e) => {
                  setOgImageUrl(e.target.value)
                  setIsDirty(true)
                }}
                placeholder="หากเว้นว่างจะใช้รูปปกอัตโนมัติ"
                className="w-full bg-[#0F0B07] border border-[#D4AF37]/20 rounded-lg px-3 py-2 text-xs text-[#F5E9D6] focus:outline-none focus:border-[#D4AF37]"
              />
            </div>
          </div>
        </div>
      </div>

      {/* Confirmation Dialog */}
      {actionModal && (
        <ConfirmDialog
          isOpen={true}
          onClose={() => setActionModal(null)}
          onConfirm={() => runLifecycleAction(actionModal)}
          title={
            actionModal === 'publish'
              ? 'ยืนยันการเผยแพร่บทความ'
              : actionModal === 'archive'
              ? 'ยืนยันการจัดเก็บบทความ (Archive)'
              : 'ยืนยันการกู้คืนเป็น Draft'
          }
          description="การดำเนินการนี้จะเปลี่ยนสถานะการเข้าถึงของบทความในระบบ"
          confirmText="ยืนยัน"
        />
      )}
    </div>
  )
}
