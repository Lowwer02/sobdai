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
    <div
      role="group"
      aria-label="ข้อสอบอัตนัย"
      style={{
        backgroundColor: '#0F0B07',
        border: '1px solid rgba(212,175,55,0.2)',
        borderRadius: '16px',
        overflow: 'hidden',
        transition: 'border-color 0.2s',
      }}
    >
      <div
        style={{
          width: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '14px 16px',
          color: '#D4AF37',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <span style={{ fontSize: '14px', fontWeight: '600' }}>ข้อสอบอัตนัย</span>
          <span
            style={{
              fontSize: '10px',
              fontWeight: '700',
              color: '#A1866B',
              backgroundColor: 'rgba(255,255,255,0.05)',
              padding: '2px 8px',
              borderRadius: '6px',
            }}
          >
            {materials.length}
          </span>
        </div>
      </div>
      <div style={{ padding: '0 12px 12px' }}>
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
      </div>
    </div>
  )
}
