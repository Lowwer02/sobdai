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
import { createNews, updateNews, publishNews, archiveNews, restoreNews, updateRelations } from '@/app/admin/news/actions'
import {
  validateNewsForPublish,
  DEFAULT_CTA_CONFIG,
  isValidInternalPath,
  coerceGpExamRequirement,
  GP_EXAM_REQUIREMENT_LABELS,
  type News,
  type NewsStatus,
  type CtaConfig,
  type CtaDestinationType,
  type GpExamRequirement,
} from '@/lib/news'
import { absoluteUrl } from '@/lib/seo'
import ConfirmDialog from '@/components/admin/ConfirmDialog'
import MarkdownEditor from '@/components/admin/news/MarkdownEditor'
import NewsRelationPicker, { type RelatedItem } from '@/components/admin/news/NewsRelationPicker'

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

export default function NewsEditorClient({
  article,
  isEdit,
  initialRelatedPackages = [],
  initialRelatedSummaries = [],
  affiliateCollections = [],
}: {
  article: News | null
  isEdit: boolean
  /** Pre-related packages (edit page loads these from news_packages). Empty on create. */
  initialRelatedPackages?: RelatedItem[]
  /** Pre-related summaries (edit page loads these from news_summaries). Empty on create. */
  initialRelatedSummaries?: RelatedItem[]
  /** Affiliate collections for the assignment select (all statuses; non-published labeled). */
  affiliateCollections?: { id: string; name: string; status: string }[]
}) {
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
  // ภาค ก. requirement. Seeded from the stored value (coerced for safety — an
  // old/unknown value becomes 'unspecified'); defaults to 'unspecified' on create.
  const [gpExamRequirement, setGpExamRequirement] = useState<GpExamRequirement>(
    () => coerceGpExamRequirement(article?.gp_exam_requirement)
  )

  // Source citation metadata group (GEO P2.2B)
  const [sourceName, setSourceName] = useState(article?.source_name || '')
  const [sourceUrl, setSourceUrl] = useState(article?.source_url || '')
  const [sourceDate, setSourceDate] = useState(article?.source_date || '')

  // SEO group (foundation). Held in state so edits persist; on CREATE omitted
  // values correctly coerce to null in toInsertPayload.
  const [seoTitle, setSeoTitle] = useState(article?.seo_title || '')
  const [seoDescription, setSeoDescription] = useState(article?.seo_description || '')
  const [canonicalUrl, setCanonicalUrl] = useState(article?.canonical_url || '')
  const [ogImageUrl, setOgImageUrl] = useState(article?.og_image_url || '')

  // Homepage Featured & Application Deadline (Task 4)
  const [applicationDeadline, setApplicationDeadline] = useState(article?.application_deadline || '')
  const [homepageFeatured, setHomepageFeatured] = useState(article?.homepage_featured ?? false)
  const [homepageFeaturedOrder, setHomepageFeaturedOrder] = useState<string>(
    article?.homepage_featured_order != null ? String(article.homepage_featured_order) : ''
  )
  const [hideFromHomepageWhenExpired, setHideFromHomepageWhenExpired] = useState(
    article?.hide_from_homepage_when_expired ?? true
  )

  // Related packages / summaries. Edit-mode only in the UI (a parent news id is
  // required to attach junction rows), but the state is held unconditionally so
  // the types stay simple — the section just isn't rendered at create time.
  const [relatedPackages, setRelatedPackages] = useState<RelatedItem[]>(initialRelatedPackages)
  const [relatedSummaries, setRelatedSummaries] = useState<RelatedItem[]>(initialRelatedSummaries)

  // CTA box config. Seeded from the stored cta_config (already a clean object,
  // since cleanCtaConfig ran on read in the action path) or the defaults on
  // create. Held as a single object + updated via immutable spread helpers so
  // buildPayload can pass it straight through.
  const [ctaConfig, setCtaConfig] = useState<CtaConfig>(
    () => article?.cta_config ?? DEFAULT_CTA_CONFIG
  )
  const [ctaError, setCtaError] = useState('')

  // Affiliate rail wiring (M1): enabled + assigned collection ONLY — no
  // placement/product-count controls (those are fixed surface contracts).
  const [affiliateEnabled, setAffiliateEnabled] = useState(article?.affiliate_enabled ?? false)
  const [affiliateCollectionId, setAffiliateCollectionId] = useState(
    article?.affiliate_collection_id || ''
  )

  // AdSense Conservative (M3): a single opt-in ONLY — placement/format/slot
  // are fixed surface contracts; account + slot ids are platform env config.
  const [adsenseEnabled, setAdsenseEnabled] = useState(article?.adsense_enabled ?? false)

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
    gp_exam_requirement: 'ข้อกำหนดภาค ก.',
    source_name: 'ชื่อแหล่งข้อมูล',
    source_url: 'URL แหล่งข้อมูล',
    source_date: 'วันที่ประกาศต้นทาง',
    application_deadline: 'วันปิดรับสมัคร',
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

  // ─── CTA config helpers ─────────────────────────────────────────────────────
  // Immutable-spread updaters so the nested CtaConfig stays a single object in
  // state (one source of truth the payload passes through). Mirrors the nested-
  // config update() pattern in HomepageSettingsClient. Each change marks the
  // form dirty + clears a stale CTA error, identical to how cover edits behave.
  const touchCta = () => {
    setIsDirty(true)
    setPublishErrors({})
    setCtaError('')
  }
  const updateCtaField = <K extends keyof CtaConfig>(key: K, value: CtaConfig[K]) => {
    setCtaConfig(prev => ({ ...prev, [key]: value }))
    touchCta()
  }
  const updateCtaButton = (
    which: 'primary' | 'secondary',
    patch: Partial<CtaConfig['primary']>
  ) => {
    setCtaConfig(prev => ({ ...prev, [which]: { ...prev[which], ...patch } }))
    touchCta()
  }

  /**
   * Client-side validation of the CTA's internal-path fields. Mirrors the
   * server's cleanCtaConfig intent but blocks the SAVE with a Thai message so
   * the admin can't persist a path that would render a broken button
   * (acceptance Case 6). Package/summary targetId validity is resolved at
   * public render (not here) because it depends on the live junction set.
   * Returns true when the CTA is saveable.
   */
  const validateCta = (): boolean => {
    if (!ctaConfig.enabled) return true // disabled → nothing to validate
    const checkButton = (which: 'primary' | 'secondary'): string | null => {
      const b = ctaConfig[which]
      if (!b.enabled) return null
      if ((b.type === 'exam' || b.type === 'internal') && b.href && !isValidInternalPath(b.href)) {
        const label = which === 'primary' ? 'ปุ่มหลัก' : 'ปุ่มรอง'
        return `${label}: พาธภายในไม่ถูกต้อง (ต้องขึ้นต้นด้วย / และเป็นเส้นทาง Sobdai เช่น /packages หรือ /package/slug/exam/id)`
      }
      return null
    }
    const e = checkButton('primary') || checkButton('secondary') || ''
    setCtaError(e)
    return !e
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
      // ภาค ก. requirement — the state already holds a legal tri-state value.
      gp_exam_requirement: gpExamRequirement,
      cover_image_url: coverImageUrl || null,
      cover_image_alt: coverImageAlt || null,
      // SEO group — now owned by this editor's SEO panel.
      seo_title: seoTitle || null,
      seo_description: seoDescription || null,
      canonical_url: canonicalUrl || null,
      og_image_url: ogImageUrl || null,
      // CTA config — passed straight through (the object is already clean).
      cta_config: ctaConfig.enabled ? ctaConfig : null,
      // Homepage Featured News & Application Deadline (Task 4)
      application_deadline: applicationDeadline.trim() || null,
      homepage_featured: homepageFeatured,
      homepage_featured_order: homepageFeaturedOrder.trim() !== '' ? Number(homepageFeaturedOrder) : null,
      hide_from_homepage_when_expired: hideFromHomepageWhenExpired,
      // Affiliate rail wiring (M1): enabled + collection id (null when off/none).
      affiliate_enabled: affiliateEnabled,
      affiliate_collection_id: affiliateEnabled && affiliateCollectionId ? affiliateCollectionId : null,
      // AdSense Conservative (M3): opt-in boolean only.
      adsense_enabled: adsenseEnabled,
      // Source citation metadata group (GEO P2.2B)
      source_name: sourceName.trim() || null,
      source_url: sourceUrl.trim() || null,
      source_date: sourceDate.trim() || null,
    }

    if (isEdit && article) {
      // Pass through fields this editor doesn't own so toInsertPayload doesn't
      // null them out on update. Also makes the publish-readiness gate validate
      // the full article, not just the edited subset.
      payload.author_id = article.author_id
    }

    return payload
  }

  // ─── Save draft ─────────────────────────────────────────────────────────────
  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    setError('')
    // Client-side CTA path validation BEFORE save (Case 6: invalid internal
    // path blocks save with a Thai message). Server re-runs cleanCtaConfig as a
    // backstop; package/summary targetId validity is resolved at render only.
    if (!validateCta()) {
      toastEvent('การตั้งค่ากล่องแนะนำยังไม่ถูกต้อง กรุณาตรวจสอบ', 'warning')
      return
    }
    const payload = buildPayload()

    startTransition(async () => {
      const res = isEdit && article
        ? await updateNews(article.id, payload)
        : await createNews(payload)
      if (!res.success) {
        setError(res.error || 'บันทึกไม่สำเร็จ')
        toastEvent(res.error || 'บันทึกไม่สำเร็จ', 'error')
        return
      }
      // Edit mode: persist relations AFTER a successful content save. Relations
      // are a separate delete-then-insert full-replace (mirrors exam_set_questions
      // + QuestionPicker), so they ride alongside but never abort a content save.
      if (isEdit && article) {
        const relRes = await updateRelations(
          article.id,
          relatedPackages.map((p, i) => ({ id: p.id, sort_order: i })),
          relatedSummaries.map((s, i) => ({ id: s.id, sort_order: i }))
        )
        if (!relRes.success) {
          toastEvent(relRes.error || 'บันทึกเนื้อหาที่เกี่ยวข้องไม่สำเร็จ', 'warning')
          // Content DID save — don't surface as a hard error, just warn.
        }
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
        if (!validateCta()) {
          setPendingGoLive(null)
          toastEvent('การตั้งค่ากล่องแนะนำยังไม่ถูกต้อง จึงยังเผยแพร่ไม่ได้', 'warning')
          return
        }
        const saveRes = await updateNews(article.id, buildPayload())
        if (!saveRes.success) {
          setPendingGoLive(null)
          toastEvent(saveRes.error || 'บันทึกไม่สำเร็จ จึงยังเผยแพร่ไม่ได้', 'error')
          return
        }
        // Persist relations alongside the unsaved content (same as handleSubmit).
        await updateRelations(
          article.id,
          relatedPackages.map((p, i) => ({ id: p.id, sort_order: i })),
          relatedSummaries.map((s, i) => ({ id: s.id, sort_order: i }))
        )
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
    <div className="space-y-6">
      <div className="space-y-2">
        <Link
          href="/admin/news"
          className="text-[#A1866B] hover:text-[#F5E9D6] inline-flex items-center gap-2 text-sm"
        >
          <ArrowLeft size={16} /> กลับไปหน้ารายการ
        </Link>

        <h1 className="text-3xl font-bold font-display text-[#F5E9D6]">
          {isEdit ? 'แก้ไขข่าว' : 'สร้างข่าวใหม่'}
        </h1>
      </div>

      <div className="flex flex-col lg:flex-row gap-8">
        <div className="flex-1 max-w-3xl min-w-0">
          <form
            id="news-form"
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

          {/* ข้อกำหนดภาค ก. — tri-state, not a boolean. Sits with taxonomy because
              it's a classification of the announcement. Recruitment (เปิดรับสมัครสอบ)
              articles are forced to a non-unspecified value at publish time; the
              gate itself lives in validateNewsForPublish (lib/news.ts). */}
          <div>
            <label className={labelClass}>ข้อกำหนดภาค ก.</label>
            <select
              value={gpExamRequirement}
              onChange={e => {
                setGpExamRequirement(coerceGpExamRequirement(e.target.value))
                setIsDirty(true)
                setPublishErrors({})
              }}
              className={inputClass}
            >
              {(Object.keys(GP_EXAM_REQUIREMENT_LABELS) as GpExamRequirement[]).map(v => (
                <option key={v} value={v}>
                  {GP_EXAM_REQUIREMENT_LABELS[v]}
                </option>
              ))}
            </select>
            <p className="text-[10px] text-[#A1866B] mt-1">
              ระบุว่าผู้สมัครต้องมีผลสอบผ่านภาค ก. หรือไม่ โดยยึดตามประกาศต้นฉบับ
            </p>
          </div>
        </section>

        {/* Homepage & Recruitment Deadline */}
        <section className="bg-[#1A140E] border border-[rgba(212,175,55,0.15)] rounded-2xl p-6 space-y-4">
          <h2 className="text-[#D4AF37] font-bold font-display">การแสดงผลหน้าแรกและวันรับสมัคร</h2>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* วันปิดรับสมัคร */}
            <div>
              <label className={labelClass}>วันปิดรับสมัคร</label>
              <input
                type="date"
                value={applicationDeadline}
                onChange={e => {
                  setApplicationDeadline(e.target.value)
                  setIsDirty(true)
                  setPublishErrors({})
                }}
                className={inputClass}
              />
              <p className="text-[10px] text-[#A1866B] mt-1">
                ใช้ปี ค.ศ. เช่น 26/08/2026 (หน้าเว็บจะแสดงเป็น พ.ศ. อัตโนมัติ) — ข่าวจะถือว่าเปิดรับสมัครตลอดวันตามเวลาไทย
              </p>
            </div>

            {/* ลำดับปักหมุด */}
            <div>
              <label className={labelClass}>ลำดับปักหมุด</label>
              <input
                type="number"
                min={1}
                step={1}
                value={homepageFeaturedOrder}
                disabled={!homepageFeatured}
                onChange={e => {
                  setHomepageFeaturedOrder(e.target.value)
                  setIsDirty(true)
                  setPublishErrors({})
                }}
                placeholder="เช่น 1, 2, 3"
                className={`${inputClass} ${!homepageFeatured ? 'opacity-50 cursor-not-allowed' : ''}`}
              />
              <p className="text-[10px] text-[#A1866B] mt-1">
                ตัวเลขน้อยจะแสดงก่อน เช่น 1 ก่อน 2
              </p>
            </div>
          </div>

          <div className="space-y-3 pt-2 border-t border-[rgba(255,255,255,0.05)]">
            {/* ปักหมุดบนหน้าแรก */}
            <label className="flex items-center gap-3 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={homepageFeatured}
                onChange={e => {
                  setHomepageFeatured(e.target.checked)
                  setIsDirty(true)
                  setPublishErrors({})
                }}
                className="w-4 h-4 rounded border-[rgba(255,255,255,0.15)] bg-[#0F0B07] text-[#D4AF37] focus:ring-0 focus:ring-offset-0 cursor-pointer accent-[#D4AF37]"
              />
              <div>
                <span className="text-sm text-[#F5E9D6] font-medium block">ปักหมุดบนหน้าแรก</span>
                <span className="text-[11px] text-[#A1866B] block">
                  ข่าวที่ปักหมุดจะแสดงก่อนข่าวล่าสุดทั่วไป
                </span>
              </div>
            </label>

            {/* ซ่อนจากหน้าแรกเมื่อหมดเขต */}
            <label className="flex items-center gap-3 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={hideFromHomepageWhenExpired}
                onChange={e => {
                  setHideFromHomepageWhenExpired(e.target.checked)
                  setIsDirty(true)
                  setPublishErrors({})
                }}
                className="w-4 h-4 rounded border-[rgba(255,255,255,0.15)] bg-[#0F0B07] text-[#D4AF37] focus:ring-0 focus:ring-offset-0 cursor-pointer accent-[#D4AF37]"
              />
              <div>
                <span className="text-sm text-[#F5E9D6] font-medium block">ซ่อนจากหน้าแรกเมื่อหมดเขต</span>
                <span className="text-[11px] text-[#A1866B] block">
                  ข่าวยังเปิดอ่านได้ตามปกติ แต่จะถูกนำออกจากหน้าแรกอัตโนมัติ
                </span>
              </div>
            </label>
          </div>
        </section>

        {/* Source citation metadata */}
        <section className="bg-[#1A140E] border border-[rgba(212,175,55,0.15)] rounded-2xl p-6 space-y-4">
          <h2 className="text-[#D4AF37] font-bold font-display">แหล่งข้อมูลต้นทาง</h2>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* ชื่อแหล่งข้อมูล */}
            <div>
              <label className={labelClass}>ชื่อแหล่งข้อมูล</label>
              <input
                type="text"
                value={sourceName}
                onChange={e => {
                  setSourceName(e.target.value)
                  setIsDirty(true)
                  setPublishErrors({})
                }}
                maxLength={200}
                placeholder="เช่น กรมการแพทย์"
                className={inputClass}
              />
              <p className="text-[10px] text-[#A1866B] mt-1">
                ชื่อหน่วยงานหรือเจ้าของประกาศต้นทาง
              </p>
            </div>

            {/* วันที่ประกาศต้นทาง */}
            <div>
              <label className={labelClass}>วันที่ประกาศต้นทาง</label>
              <input
                type="date"
                value={sourceDate}
                onChange={e => {
                  setSourceDate(e.target.value)
                  setIsDirty(true)
                  setPublishErrors({})
                }}
                className={inputClass}
              />
              <p className="text-[10px] text-[#A1866B] mt-1">
                วันที่ออกประกาศต้นฉบับ หากระบุชัดเจน — ใช้ปี ค.ศ. เช่น 24/07/2026 (หากไม่ทราบให้เว้นว่าง)
              </p>
            </div>
          </div>

          {/* URL แหล่งข้อมูล */}
          <div>
            <label className={labelClass}>URL แหล่งข้อมูล</label>
            <input
              type="url"
              value={sourceUrl}
              onChange={e => {
                setSourceUrl(e.target.value)
                setIsDirty(true)
                setPublishErrors({})
              }}
              maxLength={500}
              placeholder="เช่น https://hr-dms.thaijobjob.com"
              className={inputClass}
            />
            <p className="text-[10px] text-[#A1866B] mt-1">
              ควรใช้หน้าประกาศ เอกสาร หรือเว็บไซต์ทางการของหน่วยงานต้นทาง
            </p>
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

        {/* Related packages / summaries — edit mode only (no parent id at create time). */}
        {isEdit && article && (
          <section className="bg-[#1A140E] border border-[rgba(212,175,55,0.15)] rounded-2xl p-6 space-y-4">
            <h2 className="text-[#D4AF37] font-bold font-display">เนื้อหาที่เกี่ยวข้อง</h2>
            <p className="text-xs text-[#A1866B]">
              แพ็กเกจ/สรุปที่เชื่อมกับข่าวนี้ — จะแสดงท้ายบทความ และสามารถเลือกเป็นปลายทางของกล่องแนะนำด้านล่างได้
            </p>
            <div className="space-y-4">
              <div>
                <label className={labelClass}>แพ็กเกจที่เกี่ยวข้อง</label>
                <NewsRelationPicker
                  type="package"
                  selected={relatedPackages}
                  onChange={items => {
                    setRelatedPackages(items)
                    setIsDirty(true)
                    setPublishErrors({})
                  }}
                />
              </div>
              <div>
                <label className={labelClass}>สรุปเนื้อหาที่เกี่ยวข้อง</label>
                <NewsRelationPicker
                  type="summary"
                  selected={relatedSummaries}
                  onChange={items => {
                    setRelatedSummaries(items)
                    setIsDirty(true)
                    setPublishErrors({})
                  }}
                />
              </div>
            </div>
          </section>
        )}

        {/* CTA box — "กล่องแนะนำการเตรียมสอบ". Sits after relations (it can target
            them) and before SEO. Reuses the same section shell as the others. */}
        <section className="bg-[#1A140E] border border-[rgba(212,175,55,0.15)] rounded-2xl p-6 space-y-4">
          <h2 className="text-[#D4AF37] font-bold font-display">กล่องแนะนำการเตรียมสอบ</h2>

          {/* Master visibility */}
          <label className="flex items-center gap-3 p-3 bg-[#0F0B07] border border-[rgba(255,255,255,0.05)] rounded-xl cursor-pointer hover:border-[#D4AF37]/30 transition-colors">
            <input
              type="checkbox"
              checked={ctaConfig.enabled}
              onChange={e => updateCtaField('enabled', e.target.checked)}
              className="w-4 h-4 accent-[#D4AF37]"
            />
            <span>
              <span className="block text-sm font-medium text-[#F5E9D6]">แสดงกล่องแนะนำท้ายข่าว</span>
              <span className="block text-xs text-[#A1866B]">
                กล่องนี้จะแสดงท้ายบทความเพื่อพาผู้อ่านไปยังแพ็กเกจ สรุปเนื้อหา หรือข้อสอบที่เกี่ยวข้อง
              </span>
            </span>
          </label>

          {/* Auto-hide */}
          <label className={`flex items-center gap-3 p-3 bg-[#0F0B07] border border-[rgba(255,255,255,0.05)] rounded-xl transition-colors ${ctaConfig.enabled ? 'cursor-pointer hover:border-[#D4AF37]/30' : 'opacity-50 pointer-events-none'}`}>
            <input
              type="checkbox"
              checked={ctaConfig.hideWhenEmpty}
              onChange={e => updateCtaField('hideWhenEmpty', e.target.checked)}
              disabled={!ctaConfig.enabled}
              className="w-4 h-4 accent-[#D4AF37]"
            />
            <span>
              <span className="block text-sm font-medium text-[#F5E9D6]">ซ่อนอัตโนมัติเมื่อไม่มีลิงก์ที่ใช้งานได้</span>
              <span className="block text-xs text-[#A1866B]">
                หากไม่มีปลายทางที่ใช้ได้ จะไม่แสดงกล่องว่าง
              </span>
            </span>
          </label>

          {/* Heading + description */}
          <div className={ctaConfig.enabled ? '' : 'opacity-50 pointer-events-none'}>
            <div className="space-y-4">
              <div>
                <label className={labelClass}>หัวข้อกล่อง</label>
                <input
                  type="text"
                  value={ctaConfig.heading}
                  onChange={e => updateCtaField('heading', e.target.value)}
                  disabled={!ctaConfig.enabled}
                  maxLength={80}
                  className={inputClass}
                />
              </div>
              <div>
                <label className={labelClass}>รายละเอียดกล่อง</label>
                <textarea
                  value={ctaConfig.description}
                  onChange={e => updateCtaField('description', e.target.value)}
                  disabled={!ctaConfig.enabled}
                  rows={2}
                  maxLength={240}
                  className={inputClass}
                />
              </div>

              {/* Primary + secondary buttons */}
              {(['primary', 'secondary'] as const).map(which => {
                const btn = ctaConfig[which]
                const title = which === 'primary' ? 'ปุ่มหลัก' : 'ปุ่มรอง'
                return (
                  <div
                    key={which}
                    className="border border-[rgba(255,255,255,0.05)] rounded-xl p-3 space-y-3 bg-[#0F0B07]"
                  >
                    <label className="flex items-center gap-3 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={btn.enabled}
                        onChange={e => updateCtaButton(which, { enabled: e.target.checked })}
                        disabled={!ctaConfig.enabled}
                        className="w-4 h-4 accent-[#D4AF37]"
                      />
                      <span className="text-sm font-medium text-[#F5E9D6]">{title}</span>
                    </label>

                    <div className={btn.enabled ? 'space-y-3' : 'space-y-3 opacity-50 pointer-events-none'}>
                      <div>
                        <label className={labelClass}>ข้อความปุ่ม</label>
                        <input
                          type="text"
                          value={btn.label}
                          onChange={e => updateCtaButton(which, { label: e.target.value })}
                          disabled={!btn.enabled}
                          maxLength={60}
                          className={inputClass}
                        />
                      </div>
                      <div>
                        <label className={labelClass}>ประเภทปลายทาง</label>
                        <select
                          value={btn.type}
                          onChange={e => {
                            const type = e.target.value as CtaDestinationType
                            // Reset the cross-fields when switching type so a stale
                            // targetId/href from the old type can't leak through.
                            updateCtaButton(which, { type, targetId: null, href: null })
                          }}
                          disabled={!btn.enabled}
                          className={inputClass}
                        >
                          <option value="package">แพ็กเกจที่เกี่ยวข้อง</option>
                          <option value="summary">สรุปเนื้อหาที่เกี่ยวข้อง</option>
                          <option value="exam">ข้อสอบ (พาธภายใน)</option>
                          <option value="internal">ลิงก์ภายในอื่น ๆ</option>
                        </select>
                      </div>

                      {/* package / summary → pick from the related set */}
                      {(btn.type === 'package' || btn.type === 'summary') && (
                        <div>
                          <label className={labelClass}>
                            {btn.type === 'package' ? 'เลือกแพ็กเกจ' : 'เลือกสรุปเนื้อหา'}
                          </label>
                          {(() => {
                            if (!isEdit) {
                              return (
                                <>
                                  <select
                                    disabled
                                    className={`${inputClass} opacity-50 cursor-not-allowed`}
                                  >
                                    <option value="">— เลือก —</option>
                                  </select>
                                  <p className="text-xs text-[#A1866B] mt-1.5">
                                    กรุณาสร้างข่าวก่อน จากนั้นเปิดหน้าแก้ไขเพื่อเพิ่มเนื้อหาที่เกี่ยวข้อง
                                  </p>
                                </>
                              )
                            }
                            const items = btn.type === 'package' ? relatedPackages : relatedSummaries
                            if (items.length === 0) {
                              return (
                                <p className="text-xs text-[#A1866B] bg-[#0F0B07] border border-[rgba(255,255,255,0.05)] rounded-xl px-3 py-2.5">
                                  {btn.type === 'package'
                                    ? 'ยังไม่มีแพ็กเกจที่เกี่ยวข้อง กรุณาเพิ่ม Related Package ด้านบนก่อน'
                                    : 'ยังไม่มีสรุปเนื้อหาที่เกี่ยวข้อง กรุณาเพิ่ม Related Summary ด้านบนก่อน'}
                                </p>
                              )
                            }
                            return (
                              <select
                                value={btn.targetId || ''}
                                onChange={e => updateCtaButton(which, { targetId: e.target.value || null })}
                                disabled={!btn.enabled}
                                className={inputClass}
                              >
                                <option value="">— เลือก —</option>
                                {items.map(it => (
                                  <option key={it.id} value={it.id}>{it.label}</option>
                                ))}
                              </select>
                            )
                          })()}
                        </div>
                      )}

                      {/* exam / internal → validated path field */}
                      {(btn.type === 'exam' || btn.type === 'internal') && (
                        <div>
                          <label className={labelClass}>พาธภายใน (Internal path)</label>
                          <input
                            type="text"
                            value={btn.href || ''}
                            onChange={e => updateCtaButton(which, { href: e.target.value })}
                            disabled={!btn.enabled}
                            maxLength={500}
                            placeholder="/packages หรือ /package/example-slug/exam/exam-id"
                            className={`${inputClass} ${
                              btn.href && !isValidInternalPath(btn.href) ? 'border-[#EAB308]/50' : ''
                            }`}
                          />
                          {btn.href && !isValidInternalPath(btn.href) && (
                            <p className="text-[10px] text-[#EAB308] flex items-center gap-1 mt-1">
                              <AlertTriangle size={11} /> พาธไม่ถูกต้อง (ต้องขึ้นต้นด้วย / และเป็นเส้นทาง Sobdai)
                            </p>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                )
              })}

              {/* CTA validation error (Case 6) */}
              {ctaError && (
                <div className="text-sm text-[#EAB308] bg-[#EAB308]/10 border border-[#EAB308]/30 rounded-xl px-4 py-3">
                  {ctaError}
                </div>
              )}
            </div>
          </div>
        </section>

        {/* Affiliate recommendations (M1) — enabled + collection ONLY. The
            placement (desktop sidebar / mobile inline) and the 5-product cap
            are fixed surface contracts, deliberately not editor controls. */}
        <section className="bg-[#1A140E] border border-[rgba(212,175,55,0.15)] rounded-2xl p-6 space-y-4">
          <h2 className="text-[#D4AF37] font-bold font-display">สินค้าแนะนำ (Affiliate)</h2>

          <label className="flex items-center gap-3 p-3 bg-[#0F0B07] border border-[rgba(255,255,255,0.05)] rounded-xl cursor-pointer hover:border-[#D4AF37]/30 transition-colors">
            <input
              type="checkbox"
              checked={affiliateEnabled}
              onChange={e => {
                setAffiliateEnabled(e.target.checked)
                setIsDirty(true)
                setPublishErrors({})
              }}
              className="w-4 h-4 accent-[#D4AF37]"
            />
            <span>
              <span className="block text-sm font-medium text-[#F5E9D6]">แสดงสินค้าแนะนำบนหน้าข่าวนี้</span>
              <span className="block text-xs text-[#A1866B]">
                แสดงเฉพาะเมื่อคอลเลกชันที่เลือกเผยแพร่แล้วและมีสินค้าที่เผยแพร่อย่างน้อย 1 รายการ — กล่องแนะนำ Sobdai จะยังคงอยู่ก่อนสินค้าแนะนำเสมอ
              </span>
            </span>
          </label>

          <div className={affiliateEnabled ? '' : 'opacity-50 pointer-events-none'}>
            <label className={labelClass}>คอลเลกชันสินค้า</label>
            <select
              value={affiliateCollectionId}
              onChange={e => {
                setAffiliateCollectionId(e.target.value)
                setIsDirty(true)
                setPublishErrors({})
              }}
              disabled={!affiliateEnabled}
              className={inputClass}
            >
              <option value="">— เลือกคอลเลกชัน —</option>
              {affiliateCollections.map(c => (
                <option key={c.id} value={c.id}>
                  {c.name}
                  {c.status !== 'published' ? ` (${c.status})` : ''}
                </option>
              ))}
            </select>
            {affiliateCollections.length === 0 && (
              <p className="text-[10px] text-[#A1866B] mt-1">
                ยังไม่มีคอลเลกชัน — สร้างได้ที่เมนู Affiliate
              </p>
            )}
          </div>
        </section>

        {/* AdSense (M3 Conservative) — opt-in ONLY. Placement (one unit at the
            fixed editorial break before the Sobdai CTA) and the account/slot
            ids (platform env config) are surface contracts, deliberately not
            editor controls. No placement/density selector, no Auto Ads. */}
        <section className="bg-[#1A140E] border border-[rgba(212,175,55,0.15)] rounded-2xl p-6 space-y-4">
          <h2 className="text-[#D4AF37] font-bold font-display">โฆษณา (AdSense)</h2>

          <label className="flex items-center gap-3 p-3 bg-[#0F0B07] border border-[rgba(255,255,255,0.05)] rounded-xl cursor-pointer hover:border-[#D4AF37]/30 transition-colors">
            <input
              type="checkbox"
              checked={adsenseEnabled}
              onChange={e => {
                setAdsenseEnabled(e.target.checked)
                setIsDirty(true)
                setPublishErrors({})
              }}
              className="w-4 h-4 accent-[#D4AF37]"
            />
            <span>
              <span className="block text-sm font-medium text-[#F5E9D6]">แสดงโฆษณาบนหน้าข่าวนี้ (1 หน่วย)</span>
              <span className="block text-xs text-[#A1866B]">
                แสดงหนึ่งหน่วยโฆษณาในตำแหน่งที่กำหนดหลังเนื้อหา ก่อนกล่องแนะนำ Sobdai — จะปรากฏเฉพาะเมื่อระบบมีการตั้งค่า AdSense ครบถ้วน
              </span>
            </span>
          </label>
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
    </div>

    {/* Desktop Sticky Right Action Panel */}
    <aside className="hidden lg:block w-64 shrink-0">
      <div className="sticky top-6 space-y-4 bg-[#1A140E] border border-[rgba(212,175,55,0.15)] rounded-2xl p-5 shadow-xl">
        <h3 className="text-xs font-bold text-[#A1866B] uppercase tracking-wider">
          {isEdit ? 'การจัดการข่าว' : 'สร้างข่าวใหม่'}
        </h3>

        <button
          type="submit"
          form="news-form"
          disabled={isPending}
          className="w-full bg-[#D4AF37] hover:bg-[#F1D17A] disabled:opacity-50 text-[#1A140E] font-bold px-4 py-2.5 rounded-xl flex items-center justify-center gap-2 transition-colors shadow-lg"
        >
          {isPending ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
          {isEdit ? 'บันทึก' : 'สร้าง'}
        </button>

        {isPending ? (
          <p className="text-xs text-[#A1866B] flex items-center gap-1.5">
            <Loader2 size={12} className="animate-spin" /> กำลังบันทึก...
          </p>
        ) : isDirty ? (
          <p className="text-xs text-[#D4AF37] flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-[#D4AF37] animate-pulse" />
            ยังไม่ได้บันทึกการเปลี่ยนแปลง
          </p>
        ) : null}

        <div className="pt-3 border-t border-[rgba(255,255,255,0.05)]">
          <Link
            href="/admin/news"
            className="w-full text-[#A1866B] hover:text-[#F5E9D6] hover:bg-[rgba(255,255,255,0.05)] px-3 py-2 rounded-xl text-sm flex items-center justify-center gap-2 transition-colors"
          >
            <ArrowLeft size={16} /> กลับไปหน้ารายการ
          </Link>
        </div>
      </div>
    </aside>
  </div>

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
