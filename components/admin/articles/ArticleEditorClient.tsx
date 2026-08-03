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
  type RelatedPackageItem,
} from '@/app/admin/articles/actions'
import {
  validateArticleForPublish,
  normalizeSlug,
  ARTICLE_MAX_LENGTHS,
  type Article,
} from '@/lib/articles'
import ConfirmDialog from '@/components/admin/ConfirmDialog'
import ArticleMarkdownEditor from '@/components/admin/articles/ArticleMarkdownEditor'
import ArticlePackagePicker from '@/components/admin/articles/ArticlePackagePicker'

export default function ArticleEditorClient({
  article,
  isEdit,
  initialPackageRelations = [],
}: {
  article: Article | null
  isEdit: boolean
  initialPackageRelations?: RelatedPackageItem[]
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
    cover_image_url: coverImageUrl || null,
    cover_image_alt: coverImageAlt || null,
    seo_title: seoTitle || null,
    seo_description: seoDescription || null,
    canonical_url: canonicalUrl || null,
    og_image_url: ogImageUrl || null,
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
        } else {
          setIsDirty(false)
          toastEvent(
            article.status === 'published' || article.status === 'archived'
              ? 'บันทึกการแก้ไขเรียบร้อยแล้ว'
              : 'บันทึกร่างเรียบร้อยแล้ว',
            'success'
          )
          router.refresh()
        }
      } else {
        const res = await createArticle(payload)
        if (!res.success) {
          setError(res.error || 'เกิดข้อผิดพลาดในการสร้างบทความ')
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
          setActionModal(null)
          return
        }
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
        </div>

        {/* Sidebar Controls (Right 1 col) */}
        <div className="space-y-6">
          {/* Related Packages Picker */}
          <ArticlePackagePicker
            articleId={article?.id || null}
            initialRelations={initialPackageRelations}
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
