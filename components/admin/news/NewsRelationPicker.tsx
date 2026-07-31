'use client'

import { useState, useEffect, useMemo } from 'react'
import { Search, Loader2, Plus, Trash2, ChevronLeft, ChevronRight, X } from 'lucide-react'
import { listNews } from '@/app/admin/news/actions'

/**
 * Related-content picker for a news article — modeled directly on
 * QuestionPicker (the established picker for exam_set_questions). Two
 * responsibilities:
 *
 *   1. Show the currently related packages/summaries (selected items list),
 *      with remove + reorder.
 *   2. Open a search modal backed by the existing `listNews` action (paginated
 *      `ilike` over packages.name / summaries.title) to add more.
 *
 * Selection lives in the PARENT (lifted via `onChange`), exactly like
 * QuestionPicker — this component owns no selection state, so create + edit
 * share one source of truth.
 *
 * One component, two instances: `<NewsRelationPicker type="package" …/>` and
 * `<NewsRelationPicker type="summary" …/>`. Reuses the dark-premium gold styles
 * already used across the admin (no new visual system).
 *
 * Edit-mode only at the call site: relations need a parent news `id` to attach
 * to, so the editor gates this whole section behind `isEdit && article` (no id
 * exists at create time — mirrors exam_set_questions, which also can't be
 * related until the parent row exists).
 */
export interface RelatedItem {
  id: string
  slug?: string | null
  label: string
  excerpt?: string | null
  cover_image_url?: string | null
}

interface NewsRelationPickerProps {
  type: 'package' | 'summary'
  selected: RelatedItem[]
  onChange: (items: RelatedItem[]) => void
}

const PAGE_SIZE = 8

export default function NewsRelationPicker({ type, selected, onChange }: NewsRelationPickerProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const [results, setResults] = useState<RelatedItem[]>([])
  const [totalCount, setTotalCount] = useState(0)
  const [loading, setLoading] = useState(false)

  const noun = type === 'package' ? 'แพ็กเกจ' : 'สรุปเนื้อหา'

  // Search the picker when open. listNews paginates over packages/summaries
  // (already RLS-scoped + content.read-gated). Mirrors QuestionPicker's
  // effect-on-filters flow.
  useEffect(() => {
    if (!isOpen) return
    let mounted = true
    setLoading(true)
    listNews({ type, q: search, page, limit: PAGE_SIZE })
      .then(res => {
        if (!mounted) return
        // listNews returns normalized items for packages/summaries. Map label to
        // name or title, excerpt to description or topic, cover_image_url to
        // cover_image_url or logo_url.
        setResults(
          (res.data ?? []).map((r: any) => ({
            id: r.id,
            slug: r.slug,
            label: r.name || r.title || r.slug || r.id,
            excerpt: r.excerpt || r.description || r.topic || null,
            cover_image_url: r.cover_image_url || r.logo_url || null,
          }))
        )
        setTotalCount(res.count ?? 0)
      })
      .catch(() => {
        if (mounted) setResults([])
      })
      .finally(() => {
        if (mounted) setLoading(false)
      })
    return () => {
      mounted = false
    }
  }, [isOpen, type, search, page])

  const selectedIds = useMemo(() => new Set(selected.map(i => i.id)), [selected])

  const handleAdd = (item: RelatedItem) => {
    if (selectedIds.has(item.id)) return
    onChange([...selected, item])
  }
  const handleRemove = (id: string) => onChange(selected.filter(i => i.id !== id))
  const moveUp = (i: number) => {
    if (i === 0) return
    const next = [...selected]
    ;[next[i - 1], next[i]] = [next[i], next[i - 1]]
    onChange(next)
  }
  const moveDown = (i: number) => {
    if (i === selected.length - 1) return
    const next = [...selected]
    ;[next[i + 1], next[i]] = [next[i], next[i + 1]]
    onChange(next)
  }

  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE))

  return (
    <div className="space-y-2">
      {/* Selected items */}
      <div className="rounded-xl border border-[rgba(255,255,255,0.05)] overflow-hidden">
        <div className="flex justify-between items-center bg-[#0F0B07] px-3 py-2 border-b border-[rgba(255,255,255,0.05)]">
          <span className="text-xs font-semibold text-[#F5E9D6]">
            {noun}ที่เกี่ยวข้อง ({selected.length})
          </span>
          <button
            type="button"
            onClick={() => {
              setPage(1)
              setSearch('')
              setIsOpen(true)
            }}
            className="bg-[#D4AF37] hover:bg-[#F1D17A] text-[#1A140E] px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-colors"
          >
            <Plus size={14} /> เพิ่ม{noun}
          </button>
        </div>

        {selected.length === 0 ? (
          <p className="px-3 py-3 text-xs text-[#A1866B]">
            ยังไม่มี{noun}ที่เกี่ยวข้อง{type === 'package' ? ' กรุณาเพิ่ม Related Package ก่อน' : ' กรุณาเพิ่ม Related Summary ก่อน'}
          </p>
        ) : (
          <ul className="divide-y divide-[rgba(255,255,255,0.05)]">
            {selected.map((item, i) => (
              <li key={item.id} className="flex items-center gap-2 px-3 py-2 group">
                <div className="flex flex-col opacity-0 group-hover:opacity-100 transition-opacity">
                  <button
                    type="button"
                    onClick={() => moveUp(i)}
                    disabled={i === 0}
                    className="text-[#A1866B] hover:text-[#D4AF37] disabled:opacity-30"
                    aria-label="เลื่อนขึ้น"
                  >
                    <ChevronLeft className="rotate-90" size={14} />
                  </button>
                  <button
                    type="button"
                    onClick={() => moveDown(i)}
                    disabled={i === selected.length - 1}
                    className="text-[#A1866B] hover:text-[#D4AF37] disabled:opacity-30"
                    aria-label="เลื่อนลง"
                  >
                    <ChevronRight className="rotate-90" size={14} />
                  </button>
                </div>
                <span className="text-xs text-[#A1866B] w-5 shrink-0">{i + 1}.</span>
                <span className="text-sm text-[#F5E9D6] truncate flex-1">{item.label}</span>
                <button
                  type="button"
                  onClick={() => handleRemove(item.id)}
                  className="p-1.5 text-[#A1866B] hover:text-red-400 hover:bg-red-400/10 rounded-lg transition-colors"
                  aria-label={`ลบ${noun}`}
                >
                  <Trash2 size={14} />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Search modal */}
      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
          <div className="bg-[#1A140E] border border-[rgba(212,175,55,0.15)] rounded-2xl w-full max-w-2xl shadow-2xl flex flex-col max-h-[80vh]">
            <div className="flex justify-between items-center px-4 py-3 border-b border-[rgba(255,255,255,0.05)] bg-[#0F0B07] rounded-t-2xl shrink-0">
              <h3 className="font-bold text-[#F5E9D6] font-display">เลือก{noun}</h3>
              <button type="button" onClick={() => setIsOpen(false)} className="p-1.5 text-[#A1866B] hover:text-[#F5E9D6]">
                <X size={18} />
              </button>
            </div>

            <div className="p-3 border-b border-[rgba(255,255,255,0.05)] shrink-0">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-[#A1866B]" size={15} />
                <input
                  type="text"
                  value={search}
                  onChange={e => {
                    setSearch(e.target.value)
                    setPage(1)
                  }}
                  placeholder={`ค้นหา${noun}…`}
                  className="w-full bg-[#0F0B07] border border-[rgba(255,255,255,0.1)] text-[#F5E9D6] rounded-xl pl-9 pr-4 py-2 text-sm focus:outline-none focus:border-[#D4AF37]/50"
                  autoFocus
                />
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-3 relative">
              {loading && (
                <div className="absolute inset-0 bg-[#1A140E]/50 flex items-center justify-center z-10">
                  <Loader2 className="animate-spin text-[#D4AF37]" size={28} />
                </div>
              )}
              {results.length === 0 && !loading ? (
                <p className="text-center py-8 text-sm text-[#A1866B]">ไม่พบ{noun}</p>
              ) : (
                <ul className="space-y-2">
                  {results.map(item => {
                    const isSelected = selectedIds.has(item.id)
                    return (
                      <li key={item.id}>
                        <button
                          type="button"
                          onClick={() => (isSelected ? handleRemove(item.id) : handleAdd(item))}
                          className={`w-full text-left flex items-center gap-3 px-3 py-2.5 rounded-xl border transition-colors ${
                            isSelected
                              ? 'bg-[#D4AF37]/10 border-[#D4AF37]/50'
                              : 'bg-[#0F0B07] border-[rgba(255,255,255,0.05)] hover:border-[#D4AF37]/40'
                          }`}
                        >
                          <span className="flex-1 min-w-0">
                            <span className="block text-sm text-[#F5E9D6] truncate">{item.label}</span>
                            {item.excerpt && (
                              <span className="block text-xs text-[#A1866B] truncate">{item.excerpt}</span>
                            )}
                          </span>
                          <span className={`text-xs font-bold shrink-0 ${isSelected ? 'text-[#D4AF37]' : 'text-[#A1866B]'}`}>
                            {isSelected ? 'เลือกแล้ว' : 'เพิ่ม'}
                          </span>
                        </button>
                      </li>
                    )
                  })}
                </ul>
              )}
            </div>

            <div className="flex items-center justify-between px-4 py-2.5 border-t border-[rgba(255,255,255,0.05)] bg-[#0F0B07] rounded-b-2xl shrink-0">
              <span className="text-xs text-[#A1866B]">
                หน้า {page} / {totalPages}
              </span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setPage(p => Math.max(1, p - 1))}
                  disabled={page <= 1 || loading}
                  className="px-3 py-1.5 rounded-lg bg-[#1A140E] border border-[rgba(255,255,255,0.1)] text-[#F5E9D6] text-sm disabled:opacity-50"
                >
                  ก่อนหน้า
                </button>
                <button
                  type="button"
                  onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                  disabled={page >= totalPages || loading}
                  className="px-3 py-1.5 rounded-lg bg-[#1A140E] border border-[rgba(255,255,255,0.1)] text-[#F5E9D6] text-sm disabled:opacity-50"
                >
                  ถัดไป
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
