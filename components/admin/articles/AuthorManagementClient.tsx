'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
  ArrowLeft,
  Plus,
  Edit2,
  CheckCircle2,
  XCircle,
  Loader2,
  User,
  X,
  ExternalLink,
} from 'lucide-react'
import { toastEvent } from '@/hooks/useToast'
import { createArticleAuthor, updateArticleAuthor } from '@/app/admin/articles/actions'
import {
  ARTICLE_MAX_LENGTHS,
  normalizeSlug,
  type ArticleAuthor,
} from '@/lib/articles'

interface AuthorManagementClientProps {
  initialAuthors: ArticleAuthor[]
}

interface AuthorFormData {
  id?: string
  display_name: string
  slug: string
  role_title: string
  short_bio: string
  avatar_url: string
  is_active: boolean
}

const EMPTY_FORM: AuthorFormData = {
  display_name: '',
  slug: '',
  role_title: '',
  short_bio: '',
  avatar_url: '',
  is_active: true,
}

export default function AuthorManagementClient({ initialAuthors }: AuthorManagementClientProps) {
  const router = useRouter()
  const [authors, setAuthors] = useState<ArticleAuthor[]>(initialAuthors)
  const [isPending, startTransition] = useTransition()
  const [modalOpen, setModalOpen] = useState(false)
  const [editingAuthor, setEditingAuthor] = useState<ArticleAuthor | null>(null)
  const [formData, setFormData] = useState<AuthorFormData>(EMPTY_FORM)
  const [formErrors, setFormErrors] = useState<Record<string, string>>({})
  const [isSlugAuto, setIsSlugAuto] = useState(true)

  const openCreateModal = () => {
    setEditingAuthor(null)
    setFormData(EMPTY_FORM)
    setFormErrors({})
    setIsSlugAuto(true)
    setModalOpen(true)
  }

  const openEditModal = (author: ArticleAuthor) => {
    setEditingAuthor(author)
    setFormData({
      id: author.id,
      display_name: author.display_name,
      slug: author.slug,
      role_title: author.role_title || '',
      short_bio: author.short_bio || '',
      avatar_url: author.avatar_url || '',
      is_active: author.is_active,
    })
    setFormErrors({})
    setIsSlugAuto(false)
    setModalOpen(true)
  }

  const handleDisplayNameChange = (val: string) => {
    setFormData((prev) => ({
      ...prev,
      display_name: val,
      slug: isSlugAuto && !editingAuthor ? normalizeSlug(val) : prev.slug,
    }))
  }

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault()
    setFormErrors({})

    startTransition(async () => {
      if (editingAuthor) {
        const res = await updateArticleAuthor(editingAuthor.id, formData)
        if (!res.success) {
          toastEvent(res.error || 'เกิดข้อผิดพลาดในการแก้ไขข้อมูลผู้เขียน', 'error')
        } else if (res.author) {
          const updated = res.author
          setAuthors((prev) => prev.map((a) => (a.id === updated.id ? updated : a)))
          setModalOpen(false)
          toastEvent('แก้ไขข้อมูลผู้เขียนเรียบร้อยแล้ว', 'success')
          router.refresh()
        }
      } else {
        const res = await createArticleAuthor(formData)
        if (!res.success) {
          toastEvent(res.error || 'เกิดข้อผิดพลาดในการสร้างข้อมูลผู้เขียน', 'error')
        } else if (res.author) {
          const created = res.author
          setAuthors((prev) => [...prev, created].sort((a, b) => a.display_name.localeCompare(b.display_name)))
          setModalOpen(false)
          toastEvent('สร้างข้อมูลผู้เขียนเรียบร้อยแล้ว', 'success')
          router.refresh()
        }
      }
    })
  }

  return (
    <div className="p-4 sm:p-6 max-w-6xl mx-auto space-y-6 sm:space-y-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-[#D4AF37]/20 pb-5">
        <div className="flex items-center gap-3">
          <Link
            href="/admin/articles"
            className="p-2 text-[#A1866B] hover:text-[#D4AF37] hover:bg-[#D4AF37]/10 rounded-lg transition-colors shrink-0"
          >
            <ArrowLeft size={20} />
          </Link>
          <div>
            <h1 className="text-xl sm:text-2xl font-bold text-[#F5E9D6] flex items-center gap-2.5">
              <User className="text-[#D4AF37]" size={24} />
              จัดการข้อมูลผู้เขียน (Article Authors)
            </h1>
            <p className="text-xs sm:text-sm text-[#A1866B] mt-0.5">
              สร้างและจัดการข้อมูลผู้เขียนบทความสาธารณะ (แยกขาดจากบัญชีล็อกอินและ profiles)
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={openCreateModal}
          className="inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-[#D4AF37] hover:bg-[#D4AF37]/90 text-[#0F0B07] font-semibold text-sm rounded-lg transition-all shadow-md shadow-[#D4AF37]/10 shrink-0"
        >
          <Plus size={16} />
          เพิ่มผู้เขียนใหม่
        </button>
      </div>

      {/* Authors List */}
      <div className="bg-[#1A140E] border border-[#D4AF37]/20 rounded-xl overflow-hidden shadow-lg">
        {authors.length === 0 ? (
          <div className="p-12 text-center text-[#A1866B] space-y-3">
            <User size={40} className="mx-auto text-[#D4AF37]/40" />
            <p className="text-base font-semibold text-[#F5E9D6]">ยังไม่มีข้อมูลผู้เขียนบทความ</p>
            <p className="text-xs max-w-sm mx-auto">
              บทความทั้งหมดที่ยังไม่ได้เลือกผู้เขียน จะแสดงในนาม &quot;ทีมบรรณาธิการ Sobdai&quot; เป็นค่าเริ่มต้น
            </p>
            <button
              type="button"
              onClick={openCreateModal}
              className="inline-flex items-center gap-2 px-4 py-2 bg-[#D4AF37]/20 hover:bg-[#D4AF37] text-[#D4AF37] hover:text-[#0F0B07] text-xs font-semibold rounded-lg transition-colors mt-2"
            >
              <Plus size={14} />
              เพิ่มผู้เขียนคนแรก
            </button>
          </div>
        ) : (
          <div className="divide-y divide-[#D4AF37]/10">
            {authors.map((author) => (
              <div
                key={author.id}
                className="p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4 hover:bg-[#D4AF37]/5 transition-colors"
              >
                <div className="flex items-start gap-3.5 min-w-0">
                  <div className="w-10 h-10 rounded-full bg-[#D4AF37]/10 border border-[#D4AF37]/30 flex items-center justify-center shrink-0 text-[#D4AF37] font-bold text-sm overflow-hidden">
                    {author.avatar_url ? (
                      /* eslint-disable-next-line @next/next/no-img-element */
                      <img
                        src={author.avatar_url}
                        alt={author.display_name}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      author.display_name.charAt(0).toUpperCase()
                    )}
                  </div>

                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-bold text-[#F5E9D6] text-sm sm:text-base">
                        {author.display_name}
                      </span>
                      {author.role_title && (
                        <span className="px-2 py-0.5 text-[11px] font-medium bg-[#D4AF37]/15 text-[#D4AF37] border border-[#D4AF37]/30 rounded">
                          {author.role_title}
                        </span>
                      )}
                      {author.is_active ? (
                        <span className="inline-flex items-center gap-1 text-[11px] text-[#22C55E]">
                          <CheckCircle2 size={12} />
                          Active
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-[11px] text-red-400">
                          <XCircle size={12} />
                          Inactive
                        </span>
                      )}
                    </div>

                    <div className="text-xs text-[#A1866B] flex items-center gap-2 mt-1">
                      <span>Slug: <code>/authors/{author.slug}</code></span>
                      {author.is_active && (
                        <Link
                          href={`/authors/${author.slug}`}
                          target="_blank"
                          className="inline-flex items-center gap-1 text-[#D4AF37] hover:underline"
                        >
                          <ExternalLink size={12} />
                          ดูหน้าโปรไฟล์
                        </Link>
                      )}
                    </div>

                    {author.short_bio && (
                      <p className="text-xs text-[#A1866B]/90 mt-1.5 line-clamp-2">
                        {author.short_bio}
                      </p>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-2 shrink-0 self-end sm:self-center">
                  <button
                    type="button"
                    onClick={() => openEditModal(author)}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-[#1F1913] border border-[#D4AF37]/30 hover:border-[#D4AF37] text-[#F5E9D6] text-xs font-semibold rounded-lg transition-colors"
                  >
                    <Edit2 size={13} className="text-[#D4AF37]" />
                    แก้ไข
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Author Modal */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm animate-in fade-in duration-150">
          <div className="bg-[#1A140E] border border-[#D4AF37]/30 rounded-2xl w-full max-w-lg overflow-hidden shadow-2xl space-y-0">
            <div className="p-5 border-b border-[#D4AF37]/15 flex items-center justify-between">
              <h2 className="text-lg font-bold text-[#F5E9D6] flex items-center gap-2">
                <User className="text-[#D4AF37]" size={18} />
                {editingAuthor ? 'แก้ไขข้อมูลผู้เขียน' : 'เพิ่มผู้เขียนบทความใหม่'}
              </h2>
              <button
                type="button"
                onClick={() => setModalOpen(false)}
                className="text-[#A1866B] hover:text-[#F5E9D6] p-1 rounded-lg transition-colors"
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleSave} className="p-5 space-y-4">
              {/* Display Name */}
              <div>
                <label className="block text-xs font-semibold text-[#A1866B] uppercase mb-1">
                  ชื่อผู้เขียน (Display Name) <span className="text-red-400">*</span>
                </label>
                <input
                  type="text"
                  value={formData.display_name}
                  onChange={(e) => handleDisplayNameChange(e.target.value)}
                  maxLength={ARTICLE_MAX_LENGTHS.author_display_name}
                  placeholder="เช่น กิตติพงษ์ จิตต์ภักดี"
                  required
                  className="w-full bg-[#0F0B07] border border-[#D4AF37]/20 rounded-lg px-3 py-2 text-sm text-[#F5E9D6] focus:outline-none focus:border-[#D4AF37]"
                />
                {formErrors.display_name && (
                  <p className="text-xs text-red-400 mt-1">{formErrors.display_name}</p>
                )}
              </div>

              {/* Slug */}
              <div>
                <label className="block text-xs font-semibold text-[#A1866B] uppercase mb-1">
                  Slug (สำหรับ URL /authors/[slug]) <span className="text-red-400">*</span>
                </label>
                <input
                  type="text"
                  value={formData.slug}
                  onChange={(e) => {
                    setIsSlugAuto(false)
                    setFormData((prev) => ({ ...prev, slug: normalizeSlug(e.target.value) }))
                  }}
                  maxLength={ARTICLE_MAX_LENGTHS.author_slug}
                  placeholder="เช่น kittipong-j"
                  required
                  className="w-full bg-[#0F0B07] border border-[#D4AF37]/20 rounded-lg px-3 py-2 text-sm text-[#F5E9D6] focus:outline-none focus:border-[#D4AF37]"
                />
                {formErrors.slug && (
                  <p className="text-xs text-red-400 mt-1">{formErrors.slug}</p>
                )}
              </div>

              {/* Role Title */}
              <div>
                <label className="block text-xs font-semibold text-[#A1866B] uppercase mb-1">
                  ตำแหน่ง / บทบาท (Role Title - ไม่บังคับ)
                </label>
                <input
                  type="text"
                  value={formData.role_title}
                  onChange={(e) => setFormData((prev) => ({ ...prev, role_title: e.target.value }))}
                  maxLength={ARTICLE_MAX_LENGTHS.author_role_title}
                  placeholder="เช่น นักวิชาการศึกษา"
                  className="w-full bg-[#0F0B07] border border-[#D4AF37]/20 rounded-lg px-3 py-2 text-sm text-[#F5E9D6] focus:outline-none focus:border-[#D4AF37]"
                />
              </div>

              {/* Short Bio */}
              <div>
                <label className="block text-xs font-semibold text-[#A1866B] uppercase mb-1">
                  ประวัติย่อ (Short Bio - ไม่บังคับ)
                </label>
                <textarea
                  value={formData.short_bio}
                  onChange={(e) => setFormData((prev) => ({ ...prev, short_bio: e.target.value }))}
                  maxLength={ARTICLE_MAX_LENGTHS.author_short_bio}
                  rows={3}
                  placeholder="ข้อมูลประวัติย่อที่เป็นความจริง ไม่แต่งเติมรางวัลหรือความเชี่ยวชาญเกินจริง..."
                  className="w-full bg-[#0F0B07] border border-[#D4AF37]/20 rounded-lg px-3 py-2 text-sm text-[#F5E9D6] focus:outline-none focus:border-[#D4AF37]"
                />
              </div>

              {/* Avatar URL */}
              <div>
                <label className="block text-xs font-semibold text-[#A1866B] uppercase mb-1">
                  URL รูปโปรไฟล์ (Avatar URL - ไม่บังคับ)
                </label>
                <input
                  type="text"
                  value={formData.avatar_url}
                  onChange={(e) => setFormData((prev) => ({ ...prev, avatar_url: e.target.value }))}
                  maxLength={ARTICLE_MAX_LENGTHS.author_avatar_url}
                  placeholder="https://..."
                  className="w-full bg-[#0F0B07] border border-[#D4AF37]/20 rounded-lg px-3 py-2 text-sm text-[#F5E9D6] focus:outline-none focus:border-[#D4AF37]"
                />
              </div>

              {/* Is Active */}
              <div className="flex items-center gap-2 pt-2">
                <input
                  type="checkbox"
                  id="is_active"
                  checked={formData.is_active}
                  onChange={(e) => setFormData((prev) => ({ ...prev, is_active: e.target.checked }))}
                  className="w-4 h-4 rounded border-[#D4AF37]/30 bg-[#0F0B07] text-[#D4AF37] focus:ring-[#D4AF37]"
                />
                <label htmlFor="is_active" className="text-sm text-[#F5E9D6] cursor-pointer">
                  เปิดใช้งานผู้เขียน (Active)
                </label>
              </div>

              {/* Actions */}
              <div className="flex items-center justify-end gap-3 pt-4 border-t border-[#D4AF37]/15">
                <button
                  type="button"
                  onClick={() => setModalOpen(false)}
                  disabled={isPending}
                  className="px-4 py-2 text-sm text-[#A1866B] hover:text-[#F5E9D6] transition-colors"
                >
                  ยกเลิก
                </button>
                <button
                  type="submit"
                  disabled={isPending}
                  className="inline-flex items-center gap-2 px-5 py-2 bg-[#D4AF37] hover:bg-[#D4AF37]/90 text-[#0F0B07] font-bold text-sm rounded-lg transition-all disabled:opacity-50"
                >
                  {isPending && <Loader2 size={16} className="animate-spin" />}
                  {editingAuthor ? 'บันทึกการแก้ไข' : 'สร้างผู้เขียน'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
