'use client'

import { useState, useTransition, useEffect, useRef } from 'react'
import {
  Package,
  Search,
  Plus,
  Trash2,
  ChevronUp,
  ChevronDown,
  Loader2,
  Save,
  AlertTriangle,
  CheckCircle2,
} from 'lucide-react'
import { toastEvent } from '@/hooks/useToast'
import {
  getAvailableArticlePackages,
  updateArticlePackageRelations,
  type RelatedPackageItem,
} from '@/app/admin/articles/actions'

interface ArticlePackagePickerProps {
  articleId: string | null
  initialRelations?: RelatedPackageItem[]
}

export default function ArticlePackagePicker({
  articleId,
  initialRelations = [],
}: ArticlePackagePickerProps) {
  const [selectedPackages, setSelectedPackages] = useState<RelatedPackageItem[]>(initialRelations)
  const [searchResults, setSearchResults] = useState<RelatedPackageItem[]>([])
  const [searchQuery, setSearchQuery] = useState('')
  const [isSearching, setIsSearching] = useState(false)
  const [searchError, setSearchError] = useState('')
  const [hasSearched, setHasSearched] = useState(false)
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState('')
  const [isDirty, setIsDirty] = useState(false)

  const requestIdRef = useRef(0)

  // Single effect for initial load and debounced search with stale request protection
  useEffect(() => {
    if (!articleId) return
    let isMounted = true
    const isInitial = searchQuery.trim() === ''
    const delay = isInitial ? 0 : 300

    const timer = setTimeout(() => {
      const currentReq = ++requestIdRef.current
      setIsSearching(true)
      setSearchError('')

      getAvailableArticlePackages(searchQuery)
        .then((res) => {
          if (!isMounted || requestIdRef.current !== currentReq) return
          setIsSearching(false)
          setHasSearched(true)
          if (!res.success) {
            setSearchError(res.error || 'ไม่สามารถค้นหาแพ็กเกจได้')
            setSearchResults([])
          } else {
            setSearchResults(res.data)
          }
        })
        .catch(() => {
          if (!isMounted || requestIdRef.current !== currentReq) return
          setIsSearching(false)
          setHasSearched(true)
          setSearchError('เกิดข้อผิดพลาดในการค้นหาแพ็กเกจ')
          setSearchResults([])
        })
    }, delay)

    return () => {
      isMounted = false
      clearTimeout(timer)
    }
  }, [searchQuery, articleId])

  const handleAddPackage = (pkg: RelatedPackageItem) => {
    if (selectedPackages.some((p) => p.id === pkg.id)) return
    setSelectedPackages([...selectedPackages, pkg])
    setIsDirty(true)
  }

  const handleRemovePackage = (pkgId: string) => {
    setSelectedPackages(selectedPackages.filter((p) => p.id !== pkgId))
    setIsDirty(true)
  }

  const handleMoveUp = (index: number) => {
    if (index === 0) return
    const next = [...selectedPackages]
    const temp = next[index - 1]
    next[index - 1] = next[index]
    next[index] = temp
    setSelectedPackages(next)
    setIsDirty(true)
  }

  const handleMoveDown = (index: number) => {
    if (index === selectedPackages.length - 1) return
    const next = [...selectedPackages]
    const temp = next[index + 1]
    next[index + 1] = next[index]
    next[index] = temp
    setSelectedPackages(next)
    setIsDirty(true)
  }

  const handleSaveRelations = () => {
    if (!articleId) return
    setError('')
    startTransition(async () => {
      try {
        const packageIds = selectedPackages.map((p) => p.id)
        const res = await updateArticlePackageRelations(articleId, packageIds)
        if (!res.success) {
          setError(res.error || 'เกิดข้อผิดพลาดในการบันทึกแพ็กเกจที่เกี่ยวข้อง')
          toastEvent(res.error || 'เกิดข้อผิดพลาดในการบันทึกแพ็กเกจที่เกี่ยวข้อง', 'error')
        } else {
          setIsDirty(false)
          toastEvent('บันทึกแพ็กเกจที่เกี่ยวข้องเรียบร้อยแล้ว', 'success')
        }
      } catch (err) {
        console.error('Unexpected exception saving article package relations:', err)
        setError('เกิดข้อผิดพลาดที่ไม่คาดคิดในการบันทึกแพ็กเกจที่เกี่ยวข้อง')
        toastEvent('เกิดข้อผิดพลาดที่ไม่คาดคิดในการบันทึกแพ็กเกจที่เกี่ยวข้อง', 'error')
      }
    })
  }

  if (!articleId) {
    return (
      <div className="bg-[#1A140E] border border-[#D4AF37]/20 p-6 rounded-xl space-y-2">
        <h2 className="text-base font-bold text-[#F5E9D6] border-b border-[#D4AF37]/10 pb-3 flex items-center gap-2">
          <Package className="text-[#D4AF37]" size={18} /> แพ็กเกจที่เกี่ยวข้อง (Related Packages)
        </h2>
        <p className="text-sm text-[#A1866B] italic pt-2">
          บันทึกบทความก่อน จึงจะเพิ่มแพ็กเกจที่เกี่ยวข้องได้
        </p>
      </div>
    )
  }

  return (
    <div className="bg-[#1A140E] border border-[#D4AF37]/20 p-4 sm:p-6 rounded-xl space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-[#D4AF37]/10 pb-3">
        <h2 className="text-base font-bold text-[#F5E9D6] flex items-center gap-2">
          <Package className="text-[#D4AF37]" size={18} /> แพ็กเกจที่เกี่ยวข้อง (Related Packages)
        </h2>
        {isDirty && (
          <span className="text-xs text-amber-400 font-semibold">• มีการเปลี่ยนแปลงลำดับ/รายการ</span>
        )}
      </div>

      {error && (
        <div className="bg-red-500/10 border border-red-500/30 p-3 rounded-lg text-red-400 text-xs flex items-center gap-2">
          <AlertTriangle size={16} className="shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Selected Packages List */}
      <div className="space-y-3">
        <label className="block text-xs font-semibold text-[#A1866B] uppercase">
          แพ็กเกจที่เลือก ({selectedPackages.length})
        </label>

        {selectedPackages.length === 0 ? (
          <div className="bg-[#0F0B07] border border-[#D4AF37]/10 rounded-lg p-4 text-center text-xs text-[#A1866B]">
            ยังไม่มีแพ็กเกจที่เกี่ยวข้อง เลือกจากรายการค้นหาด้านล่าง
          </div>
        ) : (
          <div className="space-y-2">
            {selectedPackages.map((pkg, idx) => (
              <div
                key={pkg.id}
                className="bg-[#0F0B07] border border-[#D4AF37]/20 rounded-lg p-3 flex items-center justify-between gap-3"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <span className="w-6 h-6 rounded-full bg-[#D4AF37]/10 border border-[#D4AF37]/30 text-[#D4AF37] text-xs font-mono font-bold flex items-center justify-center shrink-0">
                    {idx + 1}
                  </span>
                  <div className="min-w-0">
                    <div className="text-sm font-semibold text-[#F5E9D6] truncate">{pkg.name}</div>
                    <div className="flex items-center gap-2 text-xs text-[#A1866B] truncate">
                      <span className="font-mono">/{pkg.slug}</span>
                      <span>•</span>
                      <span className="text-[#D4AF37]">
                        {pkg.current_price != null ? `฿${pkg.current_price.toLocaleString()}` : 'ฟรี'}
                      </span>
                      <span>•</span>
                      <span
                        className={pkg.is_published ? 'text-emerald-400' : 'text-amber-400'}
                      >
                        {pkg.is_published ? 'เผยแพร่แล้ว' : 'แบบร่าง'}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-1 shrink-0">
                  <button
                    type="button"
                    onClick={() => handleMoveUp(idx)}
                    disabled={idx === 0}
                    className="p-1 text-[#A1866B] hover:text-[#D4AF37] disabled:opacity-30 rounded hover:bg-[#D4AF37]/10 transition-colors"
                    title="เลื่อนขึ้น"
                  >
                    <ChevronUp size={16} />
                  </button>
                  <button
                    type="button"
                    onClick={() => handleMoveDown(idx)}
                    disabled={idx === selectedPackages.length - 1}
                    className="p-1 text-[#A1866B] hover:text-[#D4AF37] disabled:opacity-30 rounded hover:bg-[#D4AF37]/10 transition-colors"
                    title="เลื่อนลง"
                  >
                    <ChevronDown size={16} />
                  </button>
                  <button
                    type="button"
                    onClick={() => handleRemovePackage(pkg.id)}
                    className="p-1 text-red-400 hover:text-red-300 rounded hover:bg-red-500/10 transition-colors ml-1"
                    title="ลบออก"
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Search Available Packages */}
      <div className="space-y-3 pt-2 border-t border-[#D4AF37]/10">
        <label className="block text-xs font-semibold text-[#A1866B] uppercase">
          ค้นหาและเพิ่มแพ็กเกจ (Search Packages)
        </label>

        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-[#A1866B]" size={16} />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="ค้นหาตามชื่อแพ็กเกจ หรือ Slug..."
            className="w-full bg-[#0F0B07] border border-[#D4AF37]/20 rounded-lg pl-9 pr-4 py-2 text-xs text-[#F5E9D6] placeholder-[#A1866B]/50 focus:outline-none focus:border-[#D4AF37]"
          />
          {isSearching && (
            <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 text-[#D4AF37] animate-spin" size={16} />
          )}
        </div>

        {searchError && (
          <div className="text-xs text-red-400 bg-red-500/10 border border-red-500/20 p-2.5 rounded-lg flex items-center gap-2">
            <AlertTriangle size={14} className="shrink-0" />
            <span>{searchError}</span>
          </div>
        )}

        {!isSearching && hasSearched && !searchError && searchResults.length === 0 && (
          <div className="text-xs text-[#A1866B] bg-[#0F0B07] border border-[#D4AF37]/10 p-3 rounded-lg text-center">
            ไม่พบแพ็กเกจที่ค้นหา
          </div>
        )}

        {!searchError && searchResults.length > 0 && (
          <div className="bg-[#0F0B07] border border-[#D4AF37]/20 rounded-lg max-h-48 overflow-y-auto divide-y divide-[#D4AF37]/10">
            {searchResults.map((pkg) => {
              const isSelected = selectedPackages.some((p) => p.id === pkg.id)
              return (
                <div
                  key={pkg.id}
                  className="p-2.5 flex items-center justify-between gap-3 hover:bg-[#D4AF37]/5 transition-colors"
                >
                  <div className="min-w-0">
                    <div className="text-xs font-semibold text-[#F5E9D6] truncate">{pkg.name}</div>
                    <div className="text-[11px] text-[#A1866B] truncate">
                      /{pkg.slug} •{' '}
                      <span className="text-[#D4AF37]">
                        {pkg.current_price != null ? `฿${pkg.current_price.toLocaleString()}` : 'ฟรี'}
                      </span>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => handleAddPackage(pkg)}
                    disabled={isSelected}
                    className={`px-2.5 py-1 rounded text-xs font-semibold inline-flex items-center gap-1 transition-colors ${
                      isSelected
                        ? 'bg-[#0F0B07] text-[#A1866B]/50 border border-white/5 cursor-not-allowed'
                        : 'bg-[#D4AF37]/20 text-[#D4AF37] hover:bg-[#D4AF37] hover:text-[#0F0B07]'
                    }`}
                  >
                    {isSelected ? (
                      <>
                        <CheckCircle2 size={12} /> เพิ่มแล้ว
                      </>
                    ) : (
                      <>
                        <Plus size={12} /> เพิ่ม
                      </>
                    )}
                  </button>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Explicit Save Relations Button */}
      <div className="pt-2">
        <button
          type="button"
          onClick={handleSaveRelations}
          disabled={isPending || !isDirty}
          className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-[#D4AF37] hover:bg-[#D4AF37]/90 text-[#0F0B07] font-semibold text-sm rounded-lg transition-colors shadow-md disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isPending ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
          บันทึกแพ็กเกจที่เกี่ยวข้อง
        </button>
      </div>
    </div>
  )
}
