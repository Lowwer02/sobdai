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
  Image as ImageIcon,
  X,
  Send,
  Archive,
  RotateCcw,
  AlertTriangle,
  ExternalLink,
} from 'lucide-react'
import { toastEvent } from '@/hooks/useToast'
import { useUnsavedChanges } from '@/hooks/useUnsavedChanges'
import { createClient } from '@/lib/supabase/client'
import { createNews, updateNews, publishNews, archiveNews, restoreNews } from '@/app/admin/news/actions'
import { validateNewsForPublish, type News, type NewsStatus } from '@/lib/news'
import { absoluteUrl } from '@/lib/seo'
import ConfirmDialog from '@/components/admin/ConfirmDialog'
import MarkdownEditor from '@/components/admin/news/MarkdownEditor'

/**
 * Government News — draft editor + publish workflow (Client Component).
 *
 * Foundation scope: the content fields a draft needs to exist + be editable,
 * plus a markdown body editor (MarkdownEditor) and the publish workflow.
 * Deliberately out of scope (later tasks): the SEO/source group, preview,
 * relation picker.
 *
 * PUBLISH WORKFLOW (this enhancement):
 *   - Publish / Restore are GATED. Before calling the lifecycle action the
 *     editor runs validateNewsForPublish() client-side (the same pure gate the
 *     server action runs) so the editor gets an instant, field-specific error
 *     summary with no round-trip. The action re-runs it server-side as a
 *     backstop. The editor NEVER publishes without validation.
 *   - Restore is treated as a publish (restore == republish per the actions),
 *     so it shares the gate + confirmation dialog.
 *   - Archive is NOT gated (it is not a publish) — mirrors the list's archive.
 *   - On confirm, any unsaved edits are persisted FIRST (updateNews) so the
 *     stored row the action validates matches what the editor validated; then
 *     the lifecycle action runs. On success the user is redirected to the list.
 *
 * Pattern fidelity with PromotionForm.tsx:
 *   - one client component serving both create + edit (article: null → create)
 *   - per-field useState seeded from the row (|| '' for strings, ?? for nullables)
 *   - single top-level error banner for SAVE errors (flattened by the actions)
 *   - useTransition for submit; setIsDirty(true) via form-level onChange;
 *     setIsDirty(false) only on a successful EDIT save
 *   - useUnsavedChanges(isDirty) for the leave-guard
 *   - createNews throws NEXT_REDIRECT internally → on create success nothing
 *     client-side runs (no toast, no reset)
 *
 * News-specific contract note (important): updateNews routes the payload through
 * toInsertPayload(), which writes EVERY NewsInput field. This editor edits only
 * a subset, so on EDIT the payload passes through the row's untouched fields
 * (body_markdown, source*, SEO group, author_id) from `article` — otherwise
 * they'd be nulled out. On CREATE omitted fields correctly coerce to null.
 */
// ─── SEO panel (client-side hints only — never block a save) ────────────────
// MAX caps live privately in lib/news.ts (frozen), mirrored here purely for the
// character counters + over-length hints in this panel. They are NOT validation
// — the server still owns enforcement via optStr() truncation.
const SEO_RECOMMEND = {
  titleIdeal: 60, // ≤ ~60 chars render cleanly in Google's SERP title
  titleMax: 200, // mirrors MAX.seo_title in lib/news.ts
  descriptionIdeal: 160, // ≤ ~160 chars render cleanly as a meta snippet
  descriptionMax: 320, // mirrors MAX.seo_description in lib/news.ts
}

/** True only for a non-empty string that is NOT a valid http(s) URL. */
function isInvalidHttpUrl(value: string): boolean {
  if (!value.trim()) return false // blank is valid (falls back to public URL)
  try {
    const u = new URL(value)
    return u.protocol !== 'http:' && u.protocol !== 'https:'
  } catch {
    return true
  }
}

export default function NewsEditorClient({ article, isEdit }: { article: News | null; isEdit: boolean }) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [isLifecyclePending, startLifecycleTransition] = useTransition()
  const [error, setError] = useState('')
  const [isDirty, setIsDirty] = useState(false)
  // Publish-readiness errors from the client-side validateNewsForPublish gate.
  const [publishErrors, setPublishErrors] = useState<Record<string, string>>({})
  // Which go-live action the confirmation dialog is gating (null = closed).
  const [pendingGoLive, setPendingGoLive] = useState<'publish' | 'restore' | null>(null)

  const [title, setTitle] = useState(article?.title || '')
  const [slug, setSlug] = useState(article?.slug || '')
  const [excerpt, setExcerpt] = useState(article?.excerpt || '')
  const [bodyMarkdown, setBodyMarkdown] = useState(article?.body_markdown || '')
  const [category, setCategory] = useState(article?.category || '')
  const [tags, setTags] = useState((article?.tags ?? []).join(', '))

  // SEO group (foundation). Held in state so edits persist; on CREATE omitted
  // values correctly coerce to null in toInsertPayload.
  const [seoTitle, setSeoTitle] = useState(article?.seo_title || '')
  const [seoDescription, setSeoDescription] = useState(article?.seo_description || '')
  const [canonicalUrl, setCanonicalUrl] = useState(article?.canonical_url || '')
  const [ogImageUrl, setOgImageUrl] = useState(article?.og_image_url || '')

  // Cover image: URL held in state (carried into the payload, not a form field).
  // Create has no row id yet (it's generated server-side), so the storage path
  // uses a client UUID prefix on create and the article id on edit for a stable
  // upsert path — both match the packages cover-logo convention.
  const [coverId] = useState(() => article?.id || crypto.randomUUID())
  const [coverImageUrl, setCoverImageUrl] = useState(article?.cover_image_url || '')
  const [coverImageAlt, setCoverImageAlt] = useState(article?.cover_image_alt || '')
  const [isUploading, setIsUploading] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  useUnsavedChanges(isDirty)

  const inputClass =
    'w-full bg-[#0F0B07] border border-[rgba(255,255,255,0.08)] text-[#F5E9D6] rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-[#D4AF37]/50 transition-colors'
  const labelClass = 'text-sm text-[#F5E9D6] font-medium block mb-1.5'

  // Same badge palette as the news list for visual consistency.
  const STATUS_STYLES: Record<NewsStatus, string> = {
    draft: 'bg-[#A1866B]/10 text-[#A1866B] border-[#A1866B]/30',
    published: 'bg-[#22C55E]/10 text-[#22C55E] border-[#22C55E]/30',
    archived: 'bg-white/5 text-[#A1866B] border-white/10',
  }

  // Thai labels for the publish-readiness error summary.
  const FIELD_LABELS: Record<string, string> = {
    title: 'หัวข้อ',
    slug: 'Slug',
    excerpt: 'เนื้อหาย่อ',
    body_markdown: 'เนื้อหา',
    cover_image_url: 'รูปปก',
    cover_image_alt: 'คำอธิบายรูป',
    category: 'หมวดหมู่',
    source_name: 'ชื่อแหล่งข้อมูล',
    source_url: 'URL แหล่งข้อมูล',
    source_date: 'วันที่แหล่งข้อมูล',
    canonical_url: 'Canonical URL',
  }

  // ─── Cover image upload (news-assets bucket, mirrors packages logo upload) ──
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    if (file.size > 4 * 1024 * 1024) {
      toastEvent('ไฟล์รูปภาพต้องมีขนาดไม่เกิน 4 MB', 'error')
      e.target.value = ''
      return
    }
    void uploadCover(file)
  }

  const uploadCover = async (file: File) => {
    try {
      setIsUploading(true)
      const supabase = createClient()
      const fileName = `news/${coverId}/cover.webp`

      const { error: uploadError } = await supabase.storage
        .from('news-assets')
        .upload(fileName, file, { contentType: 'image/webp', upsert: true })
      if (uploadError) throw uploadError

      const {
        data: { publicUrl },
      } = supabase.storage.from('news-assets').getPublicUrl(fileName)

      // Cache-bust so re-uploads under the same path are not served stale.
      setCoverImageUrl(`${publicUrl}?v=${Date.now()}`)
      setIsDirty(true)
      setPublishErrors({})
      toastEvent('อัปโหลดรูปปกสำเร็จ', 'success')
    } catch (err: any) {
      toastEvent(err.message || 'เกิดข้อผิดพลาดในการอัปโหลด', 'error')
    } finally {
      setIsUploading(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  const clearCover = () => {
    setCoverImageUrl('')
    setCoverImageAlt('')
    setIsDirty(true)
    setPublishErrors({})
  }

  // ─── Payload (shared by save + publish flows) ───────────────────────────────
  const buildPayload = (): Record<string, unknown> => {
    const payload: Record<string, unknown> = {
      title,
      slug,
      excerpt: excerpt || null,
      body_markdown: bodyMarkdown || null,
      category: category || null,
      tags, // parseTags in lib/news.ts splits commas + dedupes + caps at 8
      cover_image_url: coverImageUrl || null,
      cover_image_alt: coverImageAlt || null,
      // SEO group — now owned by this editor's SEO panel.
      seo_title: seoTitle || null,
      seo_description: seoDescription || null,
      canonical_url: canonicalUrl || null,
      og_image_url: ogImageUrl || null,
    }

    if (isEdit && article) {
      // Pass through fields this editor doesn't own so toInsertPayload doesn't
      // null them out on update. Also makes the publish-readiness gate validate
      // the full article, not just the edited subset. body_markdown + the SEO
      // group ARE owned by this editor (set above) so they are not passed
      // through here.
      payload.source_name = article.source_name
      payload.source_url = article.source_url
      payload.source_date = article.source_date
      payload.author_id = article.author_id
    }

    return payload
  }

  // ─── Save draft ─────────────────────────────────────────────────────────────
  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    setError('')
    const payload = buildPayload()

    startTransition(async () => {
      const res = isEdit && article
        ? await updateNews(article.id, payload)
        : await createNews(payload)
      if (!res.success) {
        setError(res.error || 'บันทึกไม่สำเร็จ')
        toastEvent(res.error || 'บันทึกไม่สำเร็จ', 'error')
      } else if (isEdit) {
        toastEvent('บันทึกเรียบร้อย', 'success')
        setIsDirty(false)
      }
      // Create: createNews throws NEXT_REDIRECT → nothing below runs on success.
    })
  }

  // ─── Publish / Restore: client-side readiness gate, then confirm ────────────
  // The rule: never publish without validation. validateNewsForPublish is the
  // SAME gate the server action runs; reused here as a pure client-side pre-check
  // so the editor gets an instant, field-specific error summary with no round-trip.
  const requestGoLive = (kind: 'publish' | 'restore') => {
    const { ok, errors } = validateNewsForPublish(buildPayload())
    if (!ok) {
      setPublishErrors(errors)
      toastEvent('เนื้อหายังไม่พร้อมเผยแพร่ กรุณาตรวจสอบ', 'warning')
      return // do NOT open the confirm dialog / do NOT publish
    }
    setPublishErrors({})
    setPendingGoLive(kind)
  }

  // Confirmed in the dialog: persist any unsaved edits FIRST so the stored row
  // matches what was validated, then call the lifecycle action (which re-runs
  // the gate server-side as a backstop). Redirect to the list on success.
  const confirmGoLive = () => {
    const kind = pendingGoLive
    startLifecycleTransition(async () => {
      if (!article) {
        setPendingGoLive(null)
        return
      }
      if (isDirty) {
        const saveRes = await updateNews(article.id, buildPayload())
        if (!saveRes.success) {
          setPendingGoLive(null)
          toastEvent(saveRes.error || 'บันทึกไม่สำเร็จ จึงยังเผยแพร่ไม่ได้', 'error')
          return
        }
        setIsDirty(false)
      }
      const res = kind === 'publish'
        ? await publishNews(article.id)
        : await restoreNews(article.id)
      setPendingGoLive(null)
      if (!res.success) {
        toastEvent(res.error || 'ดำเนินการไม่สำเร็จ', 'error')
        return
      }
      toastEvent(kind === 'publish' ? 'เผยแพร่แล้ว' : 'กู้คืนและเผยแพร่แล้ว', 'success')
      router.push('/admin/news')
    })
  }

  // ─── Archive: no validation (not a publish), mirrors the list's archive ─────
  const handleArchive = () => {
    startLifecycleTransition(async () => {
      if (!article) return
      const res = await archiveNews(article.id)
      if (!res.success) {
        toastEvent(res.error || 'เก็บถาวรไม่สำเร็จ', 'error')
        return
      }
      toastEvent('ย้ายไปคลังเก็บแล้ว', 'success')
      router.push('/admin/news')
    })
  }

  return (
    <div className="max-w-3xl space-y-6">
      <Link
        href="/admin/news"
        className="text-[#A1866B] hover:text-[#F5E9D6] flex items-center gap-2 text-sm"
      >
        <ArrowLeft size={16} /> กลับไปหน้ารายการ
      </Link>

      <h1 className="text-3xl font-bold font-display text-[#F5E9D6]">
        {isEdit ? 'แก้ไขข่าว' : 'สร้างข่าวใหม่'}
      </h1>

      <form
        onSubmit={handleSubmit}
        onChange={() => {
          setIsDirty(true)
          setPublishErrors({}) // editing invalidates the stale readiness summary
        }}
        className="space-y-6"
      >
        {/* Core content */}
        <section className="bg-[#1A140E] border border-[rgba(212,175,55,0.15)] rounded-2xl p-6 space-y-4">
          <h2 className="text-[#D4AF37] font-bold font-display">เนื้อหา</h2>

          <div>
            <label className={labelClass}>หัวข้อ *</label>
            <input
              type="text"
              value={title}
              onChange={e => setTitle(e.target.value)}
              required
              maxLength={200}
              placeholder="หัวข้อข่าว"
              className={inputClass}
            />
            <p className="text-[10px] text-[#A1866B] mt-1">ฟิลด์เดียวที่จำเป็นตอนเก็บฉบับร่าง</p>
          </div>

          <div>
            <label className={labelClass}>Slug</label>
            <input
              type="text"
              value={slug}
              onChange={e => setSlug(e.target.value)}
              maxLength={80}
              placeholder="ปล่อยว่างเพื่อสร้างจากหัวข้ออัตโนมัติ"
              className={inputClass}
            />
            <p className="text-[10px] text-[#A1866B] mt-1">
              ใช้ได้เฉพาะ a-z, 0-9 และ - (เว้นว่างไว้จะสร้างให้อัตโนมัติเมื่อบันทึก)
            </p>
          </div>

          <div>
            <label className={labelClass}>เนื้อหาย่อ</label>
            <textarea
              value={excerpt}
              onChange={e => setExcerpt(e.target.value)}
              rows={3}
              maxLength={320}
              placeholder="สรุปสั้นๆ ของข่าว"
              className={inputClass}
            />
          </div>
        </section>

        {/* Body (markdown editor) */}
        <section className="bg-[#1A140E] border border-[rgba(212,175,55,0.15)] rounded-2xl p-6 space-y-4">
          <h2 className="text-[#D4AF37] font-bold font-display">เนื้อหา</h2>
          <MarkdownEditor
            value={bodyMarkdown}
            onChange={v => {
              setBodyMarkdown(v)
              // Toolbar inserts call this prop directly (no DOM change event),
              // so they would not trip the form-level onChange below. Mark dirty
              // + clear the stale readiness summary here to cover both paths.
              setIsDirty(true)
              setPublishErrors({})
            }}
          />
        </section>

        {/* Taxonomy */}
        <section className="bg-[#1A140E] border border-[rgba(212,175,55,0.15)] rounded-2xl p-6 space-y-4">
          <h2 className="text-[#D4AF37] font-bold font-display">หมวดหมู่และแท็ก</h2>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className={labelClass}>หมวดหมู่</label>
              <input
                type="text"
                value={category}
                onChange={e => setCategory(e.target.value)}
                maxLength={80}
                placeholder="เช่น ประกาศ, กิจกรรม"
                className={inputClass}
              />
            </div>
            <div>
              <label className={labelClass}>แท็ก</label>
              <input
                type="text"
                value={tags}
                onChange={e => setTags(e.target.value)}
                placeholder="คั่นด้วยจุลภาค เช่น ประกาศ, ทุนการศึกษา"
                className={inputClass}
              />
              <p className="text-[10px] text-[#A1866B] mt-1">สูงสุด 8 แท็ก (คั่นด้วยจุลภาค)</p>
            </div>
          </div>
        </section>

        {/* Cover image */}
        <section className="bg-[#1A140E] border border-[rgba(212,175,55,0.15)] rounded-2xl p-6 space-y-4">
          <h2 className="text-[#D4AF37] font-bold font-display">รูปปก</h2>

          <div className="space-y-3">
            <div className="flex items-center gap-4">
              <div className="w-32 h-20 rounded-xl bg-[#0F0B07] border border-[rgba(255,255,255,0.05)] overflow-hidden flex items-center justify-center shrink-0">
                {coverImageUrl ? (
                  <Image
                    src={coverImageUrl}
                    alt={coverImageAlt || 'cover'}
                    width={128}
                    height={80}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <ImageIcon size={24} className="text-[#A1866B]" />
                )}
              </div>
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={isUploading}
                    className="px-4 py-2 bg-[rgba(255,255,255,0.05)] hover:bg-[rgba(255,255,255,0.1)] border border-[rgba(255,255,255,0.1)] rounded-lg text-sm font-medium text-[#F5E9D6] transition-colors flex items-center gap-2 disabled:opacity-50"
                  >
                    {isUploading ? (
                      <Loader2 size={16} className="animate-spin" />
                    ) : (
                      <Camera size={16} />
                    )}
                    {coverImageUrl ? 'เปลี่ยนรูปภาพ' : 'อัปโหลดรูปภาพ (สูงสุด 4 MB)'}
                  </button>
                  {coverImageUrl && (
                    <button
                      type="button"
                      onClick={clearCover}
                      disabled={isUploading}
                      className="p-2 text-[#A1866B] hover:text-red-400 hover:bg-red-400/10 rounded-lg transition-colors disabled:opacity-50"
                      title="ลบรูปปก"
                    >
                      <X size={16} />
                    </button>
                  )}
                </div>
                <input
                  type="file"
                  ref={fileInputRef}
                  onChange={handleFileChange}
                  accept="image/jpeg,image/png,image/webp,image/heic"
                  className="hidden"
                />
                <p className="text-xs text-[#A1866B]">รองรับ JPG, PNG, WEBP หรือ HEIC</p>
              </div>
            </div>

            <div>
              <label className={labelClass}>คำอธิบายรูป (Alt text)</label>
              <input
                type="text"
                value={coverImageAlt}
                onChange={e => setCoverImageAlt(e.target.value)}
                maxLength={300}
                placeholder="อธิบายรูปปกเพื่อการเข้าถึง"
                className={inputClass}
              />
            </div>
          </div>
        </section>

        {/* SEO panel */}
        <section className="bg-[#1A140E] border border-[rgba(212,175,55,0.15)] rounded-2xl p-6 space-y-4">
          <h2 className="text-[#D4AF37] font-bold font-display">SEO</h2>

          {/* Slug + public URL preview (read-only mirrors of the slug field above) */}
          <div className="space-y-2 bg-[#0F0B07] border border-[rgba(255,255,255,0.05)] rounded-xl px-4 py-3">
            <div className="flex items-center gap-2 text-sm">
              <span className="text-[#A1866B] shrink-0">Slug ปัจจุบัน:</span>
              <span className="text-[#F5E9D6] font-mono break-all">
                {slug || <span className="text-[#A1866B] italic">(ว่าง — จะสร้างจากหัวข้ออัตโนมัติเมื่อบันทึก)</span>}
              </span>
            </div>
            <div className="flex items-center gap-2 text-sm">
              <span className="text-[#A1866B] shrink-0">URL สาธารณะ:</span>
              <span className="text-[#F5E9D6] font-mono break-all flex items-center gap-1.5">
                <ExternalLink size={13} className="text-[#A1866B] shrink-0" />
                {slug
                  ? absoluteUrl(`/news/${slug}`)
                  : <span className="italic">{absoluteUrl('/news/')}&lt;slug&gt;</span>}
              </span>
            </div>
          </div>

          {/* SEO Title */}
          <div>
            <div className="flex items-baseline justify-between mb-1.5">
              <label className={labelClass + ' mb-0'}>SEO Title</label>
              <span
                className={`text-[10px] ${
                  seoTitle.length > SEO_RECOMMEND.titleIdeal ? 'text-[#EAB308]' : 'text-[#A1866B]'
                }`}
              >
                {seoTitle.length} / {SEO_RECOMMEND.titleIdeal} แนะนำ (สูงสุด {SEO_RECOMMEND.titleMax})
              </span>
            </div>
            <input
              type="text"
              value={seoTitle}
              onChange={e => setSeoTitle(e.target.value)}
              maxLength={SEO_RECOMMEND.titleMax}
              placeholder="ชื่อสำหรับเครื่องมือค้นหา"
              className={inputClass}
            />
            {seoTitle.length > SEO_RECOMMEND.titleIdeal ? (
              <p className="text-[10px] text-[#EAB308] flex items-center gap-1 mt-1">
                <AlertTriangle size={11} /> เกินความยาวที่แนะนำ — เครื่องมือค้นหาอาจตัดทิ้งในผลการค้นหา
              </p>
            ) : !seoTitle.trim() ? (
              <p className="text-[10px] text-[#A1866B] mt-1">
                หากว่าง ชื่อหน้าจะใช้หัวข้อข่าวแทน
              </p>
            ) : (
              <p className="text-[10px] text-[#A1866B] mt-1">อักษรที่เกิน {SEO_RECOMMEND.titleIdeal} อาจถูกตัดในผลการค้นหา</p>
            )}
          </div>

          {/* SEO Description */}
          <div>
            <div className="flex items-baseline justify-between mb-1.5">
              <label className={labelClass + ' mb-0'}>SEO Description</label>
              <span
                className={`text-[10px] ${
                  seoDescription.length > SEO_RECOMMEND.descriptionIdeal ? 'text-[#EAB308]' : 'text-[#A1866B]'
                }`}
              >
                {seoDescription.length} / {SEO_RECOMMEND.descriptionIdeal} แนะนำ (สูงสุด {SEO_RECOMMEND.descriptionMax})
              </span>
            </div>
            <textarea
              value={seoDescription}
              onChange={e => setSeoDescription(e.target.value)}
              rows={3}
              maxLength={SEO_RECOMMEND.descriptionMax}
              placeholder="คำอธิบายเมตาสำหรับเครื่องมือค้นหา"
              className={inputClass}
            />
            {seoDescription.length > SEO_RECOMMEND.descriptionIdeal ? (
              <p className="text-[10px] text-[#EAB308] flex items-center gap-1 mt-1">
                <AlertTriangle size={11} /> เกินความยาวที่แนะนำ — เครื่องมือค้นหาอาจตัดทิ้งในผลการค้นหา
              </p>
            ) : !seoDescription.trim() ? (
              <p className="text-[10px] text-[#A1866B] mt-1">
                หากว่าง เครื่องมือค้นหาอาจสร้าง snippet ของตัวเองจากเนื้อหา
              </p>
            ) : (
              <p className="text-[10px] text-[#A1866B] mt-1">อักษรที่เกิน {SEO_RECOMMEND.descriptionIdeal} อาจถูกตัดในผลการค้นหา</p>
            )}
          </div>

          {/* Canonical URL */}
          <div>
            <label className={labelClass}>Canonical URL</label>
            <input
              type="text"
              value={canonicalUrl}
              onChange={e => setCanonicalUrl(e.target.value)}
              maxLength={500}
              placeholder="https://example.com/original-article"
              className={`${inputClass} ${isInvalidHttpUrl(canonicalUrl) ? 'border-[#EAB308]/50' : ''}`}
            />
            {isInvalidHttpUrl(canonicalUrl) ? (
              <p className="text-[10px] text-[#EAB308] flex items-center gap-1 mt-1">
                <AlertTriangle size={11} /> รูปแบบ URL ไม่ถูกต้อง (ต้องเป็น http:// หรือ https://)
              </p>
            ) : !canonicalUrl.trim() ? (
              <p className="text-[10px] text-[#A1866B] mt-1">
                หากว่าง ระบบจะใช้ URL ข่าวสาธารณะโดยอัตโนมัติ
              </p>
            ) : null}
          </div>

          {/* OG Image URL */}
          <div>
            <label className={labelClass}>Open Graph Image URL</label>
            <input
              type="text"
              value={ogImageUrl}
              onChange={e => setOgImageUrl(e.target.value)}
              maxLength={500}
              placeholder="https://example.com/og-image.jpg"
              className={inputClass}
            />
            {!ogImageUrl.trim() && (
              <p className="text-[10px] text-[#A1866B] mt-1">
                หากว่าง ระบบจะใช้รูปปกโดยอัตโนมัติ
              </p>
            )}
          </div>
        </section>

        {/* Publish workflow — edit mode only (no id to publish at create time) */}
        {isEdit && article && (
          <section className="bg-[#1A140E] border border-[rgba(212,175,55,0.15)] rounded-2xl p-6 space-y-4">
            <h2 className="text-[#D4AF37] font-bold font-display">สถานะการเผยแพร่</h2>

            <div className="flex items-center gap-3 flex-wrap">
              <span className="text-sm text-[#A1866B]">สถานะปัจจุบัน:</span>
              <span
                className={`text-xs font-bold px-2 py-1 rounded-md border whitespace-nowrap ${STATUS_STYLES[article.status]}`}
              >
                {article.status}
              </span>
            </div>

            {/* Publish-readiness error summary (only when the gate failed) */}
            {Object.keys(publishErrors).length > 0 && (
              <div className="text-sm text-red-400 bg-red-400/10 border border-red-400/30 rounded-xl px-4 py-3">
                <p className="font-bold mb-2">เนื้อหายังไม่พร้อมเผยแพร่ กรุณาแก้ไข:</p>
                <ul className="list-disc list-inside space-y-1">
                  {Object.entries(publishErrors).map(([field, msg]) => (
                    <li key={field}>
                      <span className="text-[#F5E9D6]">{FIELD_LABELS[field] || field}</span>: {msg}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <div className="flex flex-wrap gap-2">
              {article.status === 'draft' && (
                <button
                  type="button"
                  onClick={() => requestGoLive('publish')}
                  disabled={isLifecyclePending}
                  className="bg-[#22C55E] hover:bg-[#16A34A] disabled:opacity-50 text-[#0F0B07] font-bold px-4 py-2.5 rounded-xl flex items-center gap-2 transition-colors"
                >
                  {isLifecyclePending ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
                  เผยแพร่
                </button>
              )}
              {article.status === 'archived' && (
                <button
                  type="button"
                  onClick={() => requestGoLive('restore')}
                  disabled={isLifecyclePending}
                  className="bg-[#22C55E] hover:bg-[#16A34A] disabled:opacity-50 text-[#0F0B07] font-bold px-4 py-2.5 rounded-xl flex items-center gap-2 transition-colors"
                >
                  {isLifecyclePending ? <Loader2 size={16} className="animate-spin" /> : <RotateCcw size={16} />}
                  กู้คืนเพื่อเผยแพร่
                </button>
              )}
              {article.status !== 'archived' && (
                <button
                  type="button"
                  onClick={handleArchive}
                  disabled={isLifecyclePending}
                  className="bg-[rgba(255,255,255,0.05)] hover:bg-[rgba(255,255,255,0.1)] border border-[rgba(255,255,255,0.1)] disabled:opacity-50 text-[#F5E9D6] font-medium px-4 py-2.5 rounded-xl flex items-center gap-2 transition-colors"
                >
                  <Archive size={16} /> ย้ายไปคลังเก็บ
                </button>
              )}
            </div>
          </section>
        )}

        {error && (
          <div className="text-sm text-red-400 bg-red-400/10 border border-red-400/30 rounded-xl px-4 py-3">
            {error}
          </div>
        )}

        <div className="flex justify-end">
          <button
            type="submit"
            disabled={isPending}
            className="bg-[#D4AF37] hover:bg-[#F1D17A] disabled:opacity-50 text-[#1A140E] font-bold px-6 py-3 rounded-xl flex items-center gap-2 transition-colors"
          >
            {isPending ? <Loader2 size={18} className="animate-spin" /> : <Save size={18} />}
            {isEdit ? 'บันทึก' : 'สร้าง'}
          </button>
        </div>
      </form>

      {/* Publish / Restore confirmation */}
      <ConfirmDialog
        isOpen={pendingGoLive !== null}
        onClose={() => setPendingGoLive(null)}
        onConfirm={confirmGoLive}
        title={pendingGoLive === 'publish' ? 'ยืนยันการเผยแพร่' : 'ยืนยันการกู้คืน'}
        description={
          pendingGoLive === 'publish' ? (
            <>คุณแน่ใจหรือไม่? ข่าวนี้จะปรากฏบนเว็บไซต์สาธารณะทันที</>
          ) : (
            <>คุณแน่ใจหรือไม่? ข่าวนี้จะถูกกู้คืนและปรากฏบนเว็บไซต์สาธารณะ</>
          )
        }
        confirmText="ยืนยัน"
        cancelText="ยกเลิก"
        isLoading={isLifecyclePending}
      />
    </div>
  )
}
