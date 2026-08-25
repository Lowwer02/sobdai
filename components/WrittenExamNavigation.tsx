import Link from 'next/link'
import { ArrowRight, FileText } from 'lucide-react'
import type { WrittenExamDiscovery } from '@/lib/writtenExamLearner'

export default function WrittenExamNavigation({
  materials,
  packageSlug,
}: {
  materials: WrittenExamDiscovery[]
  packageSlug: string
}) {
  if (materials.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-[rgba(255,255,255,0.1)] px-4 py-8 text-center text-[13px] text-[#A1866B]">
        ยังไม่มีข้อสอบอัตนัยที่เผยแพร่
      </div>
    )
  }

  return (
    <div className="flex max-h-[420px] flex-col gap-3 overflow-y-auto pr-1">
      {materials.map((material) => (
        <Link
          key={material.materialSlug}
          href={`/package/${packageSlug}/written-exam/${material.materialSlug}`}
          className="group flex items-start gap-3 rounded-xl border border-[rgba(255,255,255,0.07)] bg-[#0F0B07] p-4 transition-colors hover:border-[#D4AF37]/40 hover:bg-[#D4AF37]/5 focus:outline-none focus:ring-2 focus:ring-[#D4AF37]"
        >
          <span className="mt-0.5 flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg bg-[#D4AF37]/10 text-[#D4AF37]">
            <FileText size={17} aria-hidden="true" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block font-bold leading-6 text-[#F5E9D6] group-hover:text-[#D4AF37]">
              {material.title}
            </span>
            <span className="mt-1 block text-xs leading-5 text-[#A1866B]">
              {material.questionCount} ข้อ · อ่านโจทย์และท่องจำแนวคำตอบ
            </span>
          </span>
          <ArrowRight className="mt-1 flex-shrink-0 text-[#A1866B] transition-transform group-hover:translate-x-1 group-hover:text-[#D4AF37]" size={16} aria-hidden="true" />
        </Link>
      ))}
    </div>
  )
}
