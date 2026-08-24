'use client'

import Link from 'next/link'
import { useMemo, useState } from 'react'
import { ArrowRight, BookOpen, ChevronLeft, ChevronRight, Plus, Search } from 'lucide-react'
import type { WrittenExamLibraryItem, WrittenExamVersionStatus } from '@/lib/writtenExamAdmin'

const STATUS_OPTIONS: Array<{ value: '' | WrittenExamVersionStatus; label: string }> = [
  { value: '', label: 'ทุกสถานะ' },
  { value: 'draft', label: 'ฉบับร่าง' },
  { value: 'published', label: 'เผยแพร่แล้ว' },
  { value: 'archived', label: 'เก็บถาวร' },
]

export default function WrittenExamLibraryClient({
  materials,
  currentPage,
  totalPages,
}: {
  materials: WrittenExamLibraryItem[]
  currentPage: number
  totalPages: number
}) {
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState<'' | WrittenExamVersionStatus>('')

  const filteredMaterials = useMemo(() => {
    const query = search.trim().toLowerCase()
    return materials.filter((material) => {
      const matchesSearch = !query || [
        material.title,
        material.slug,
        material.package?.name ?? '',
        material.package?.packageCode ?? '',
      ].some((value) => value.toLowerCase().includes(query))
      return matchesSearch && (!status || material.status === status)
    })
  }, [materials, search, status])

  return (
    <div className="space-y-6 pb-20">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-[#D4AF37]">Written Exam</p>
          <h1 className="mt-2 text-3xl font-bold font-display tracking-tight text-[#F5E9D6]">
            คลังข้อสอบอัตนัย
          </h1>
          <p className="mt-1 text-[#A1866B]">จัดการฉบับร่าง การเผยแพร่ และประวัติ revision</p>
        </div>
        <Link
          href="/admin/written-exams/import"
          className="inline-flex w-fit items-center gap-2 rounded-xl bg-[#D4AF37] px-4 py-2.5 text-sm font-bold text-[#1A140E] transition-colors hover:bg-[#F1D17A]"
        >
          <Plus size={17} aria-hidden="true" />
          นำเข้า Written Exam
        </Link>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row">
        <label className="relative flex-1">
          <span className="sr-only">ค้นหา Written Exam</span>
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-[#A1866B]" size={16} aria-hidden="true" />
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="ค้นหาชื่อเรื่อง package_code หรือ slug..."
            className="w-full rounded-xl border border-[rgba(255,255,255,0.08)] bg-[#0F0B07] py-2.5 pl-9 pr-4 text-sm text-[#F5E9D6] focus:border-[#D4AF37]/50 focus:outline-none"
          />
        </label>
        <select
          value={status}
          onChange={(event) => setStatus(event.target.value as '' | WrittenExamVersionStatus)}
          className="rounded-xl border border-[rgba(255,255,255,0.08)] bg-[#0F0B07] px-3 py-2.5 text-sm text-[#F5E9D6] focus:border-[#D4AF37]/50 focus:outline-none"
          aria-label="กรองสถานะ Written Exam"
        >
          {STATUS_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
        </select>
      </div>

      {filteredMaterials.length === 0 ? (
        <section className="rounded-2xl border border-[rgba(212,175,55,0.18)] bg-[#1A140E] p-12 text-center shadow-xl">
          <BookOpen className="mx-auto text-[#D4AF37]" size={34} aria-hidden="true" />
          <h2 className="mt-4 text-xl font-bold font-display text-[#F5E9D6]">
            {materials.length === 0 ? 'ยังไม่มี Written Exam ในคลัง' : 'ไม่พบรายการที่ตรงกับการค้นหา'}
          </h2>
          <p className="mx-auto mt-2 max-w-lg text-sm leading-6 text-[#A1866B]">
            {materials.length === 0
              ? 'นำเข้าไฟล์ Markdown เพื่อสร้างฉบับร่างรายการแรก'
              : 'ลองเปลี่ยนคำค้นหาหรือตัวกรองสถานะ'}
          </p>
        </section>
      ) : (
        <section className="overflow-hidden rounded-2xl border border-[rgba(212,175,55,0.15)] bg-[#1A140E] shadow-xl">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[850px] text-left text-sm">
              <thead className="border-b border-[rgba(255,255,255,0.07)] bg-[#0F0B07]/70 text-xs uppercase tracking-wider text-[#A1866B]">
                <tr>
                  <th className="px-5 py-4 font-semibold">Written Exam</th>
                  <th className="px-5 py-4 font-semibold">Package</th>
                  <th className="px-5 py-4 font-semibold">สถานะ</th>
                  <th className="px-5 py-4 font-semibold">Revision</th>
                  <th className="px-5 py-4 font-semibold">ปรับปรุงล่าสุด</th>
                  <th className="px-5 py-4 text-right font-semibold">จัดการ</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[rgba(255,255,255,0.06)]">
                {filteredMaterials.map((material) => (
                  <tr key={material.id} className="transition-colors hover:bg-[#D4AF37]/5">
                    <td className="px-5 py-4">
                      <Link href={`/admin/written-exams/${material.id}`} className="block min-w-0">
                        <p className="font-bold text-[#F5E9D6]">{material.title}</p>
                        <p className="mt-1 break-all text-xs text-[#A1866B]">/{material.slug}</p>
                      </Link>
                    </td>
                    <td className="px-5 py-4">
                      <p className="text-[#D6CBB8]">{material.package?.name ?? 'ไม่ระบุ package'}</p>
                      {material.package?.packageCode && <p className="mt-1 font-mono text-xs text-[#D4AF37]">{material.package.packageCode}</p>}
                    </td>
                    <td className="px-5 py-4">
                      <div className="flex flex-wrap items-center gap-2">
                        <StatusPill status={material.status} />
                        {material.currentDraft && material.currentPublished && (
                          <span className="text-xs font-bold text-[#E5C86B]">มี draft v{material.currentDraft.revisionNumber}</span>
                        )}
                      </div>
                    </td>
                    <td className="px-5 py-4 text-[#D6CBB8]">
                      {material.revisionNumber === null ? '—' : `v${material.revisionNumber}`}
                    </td>
                    <td className="px-5 py-4 text-xs text-[#A1866B]">
                      {formatDate(material.updatedAt)}
                      {material.publishedAt && <p className="mt-1 text-[#86EFAC]">เผยแพร่ {formatDate(material.publishedAt)}</p>}
                    </td>
                    <td className="px-5 py-4 text-right">
                      <Link
                        href={`/admin/written-exams/${material.id}`}
                        className="inline-flex items-center gap-1.5 rounded-lg border border-[#D4AF37]/25 px-3 py-2 text-xs font-bold text-[#D4AF37] transition-colors hover:border-[#D4AF37] hover:bg-[#D4AF37]/10"
                      >
                        เปิดรายการ
                        <ArrowRight size={14} aria-hidden="true" />
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {totalPages > 1 && (
        <nav className="flex items-center justify-between rounded-xl border border-[rgba(212,175,55,0.15)] bg-[#1A140E] px-4 py-3" aria-label="หน้าคลัง Written Exam">
          {currentPage > 1 ? (
            <Link
              href={writtenExamLibraryPageHref(currentPage - 1)}
              className="inline-flex items-center gap-1.5 rounded-lg border border-[rgba(255,255,255,0.1)] px-3 py-2 text-xs font-bold text-[#D6CBB8] hover:border-[#D4AF37]/50 hover:text-[#D4AF37]"
            >
              <ChevronLeft size={15} aria-hidden="true" />
              ก่อนหน้า
            </Link>
          ) : <span />}
          <span className="text-xs text-[#A1866B]">หน้า {currentPage} / {totalPages}</span>
          {currentPage < totalPages ? (
            <Link
              href={writtenExamLibraryPageHref(currentPage + 1)}
              className="inline-flex items-center gap-1.5 rounded-lg border border-[rgba(255,255,255,0.1)] px-3 py-2 text-xs font-bold text-[#D6CBB8] hover:border-[#D4AF37]/50 hover:text-[#D4AF37]"
            >
              ถัดไป
              <ChevronRight size={15} aria-hidden="true" />
            </Link>
          ) : <span />}
        </nav>
      )}
    </div>
  )
}

function writtenExamLibraryPageHref(page: number): string {
  return page <= 1 ? '/admin/written-exams' : `/admin/written-exams?page=${page}`
}

function StatusPill({ status }: { status: WrittenExamLibraryItem['status'] }) {
  const label = status === 'draft'
    ? 'ฉบับร่าง'
    : status === 'published'
      ? 'เผยแพร่แล้ว'
      : status === 'archived'
        ? 'เก็บถาวร'
        : 'ยังไม่มี revision'
  const classes = status === 'published'
    ? 'border-[#22C55E]/30 bg-[#22C55E]/10 text-[#86EFAC]'
    : status === 'draft'
      ? 'border-[#D4AF37]/30 bg-[#D4AF37]/10 text-[#E5C86B]'
      : 'border-[rgba(255,255,255,0.1)] bg-[#0F0B07] text-[#A1866B]'

  return <span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-bold ${classes}`}>{label}</span>
}

function formatDate(value: string | null): string {
  if (!value) return '—'
  const date = new Date(value)
  return Number.isNaN(date.getTime())
    ? '—'
    : new Intl.DateTimeFormat('th-TH', { dateStyle: 'medium', timeStyle: 'short' }).format(date)
}
