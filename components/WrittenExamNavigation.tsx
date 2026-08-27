import type { WrittenExamDiscovery } from '@/lib/writtenExamLearner'
import ContentCard from '@/components/ContentCard'

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
    <div className="flex max-h-[420px] flex-col gap-2 overflow-y-auto pr-1">
      {materials.map((material) => (
        <ContentCard
          key={material.materialSlug}
          href={`/package/${packageSlug}/written-exam/${material.materialSlug}`}
          title={material.title}
          meta={[{ text: `${material.questionCount} ข้อ · อ่านโจทย์และท่องจำแนวคำตอบ` }]}
        />
      ))}
    </div>
  )
}
