import SummaryMarkdown from '@/components/summary/SummaryMarkdown'

export type WrittenExamQuestionPreviewData = {
  questionNumber: number
  order?: number
  questionMarkdown: string
  modelAnswerMarkdown: string
  keywords: string[]
  answerStructureMarkdown: string
  memoryTechniqueMarkdown: string
}

export function WrittenExamQuestionPreview({
  question,
}: {
  question: WrittenExamQuestionPreviewData
}) {
  return (
    <article className="overflow-hidden rounded-2xl border border-[rgba(212,175,55,0.15)] bg-[#1A140E] shadow-xl">
      <header className="border-b border-[rgba(255,255,255,0.06)] bg-[#0F0B07]/60 px-5 py-5 md:px-7">
        <p className="text-xs font-bold uppercase tracking-[0.16em] text-[#D4AF37]">
          Question {question.order ?? question.questionNumber}
        </p>
        <h3 className="mt-1 text-xl font-bold font-display text-[#F5E9D6]">
          ข้อที่ {question.questionNumber}
        </h3>
        <p className="mt-2 line-clamp-2 text-sm leading-6 text-[#A1866B]">
          {getWrittenExamQuestionTitle(question.questionMarkdown)}
        </p>
      </header>

      <div className="space-y-5 p-5 md:p-7">
        <WrittenExamPreviewSection title="โจทย์" content={question.questionMarkdown} />
        <WrittenExamPreviewSection title="แนวคำตอบ" content={question.modelAnswerMarkdown} />
        <section className="rounded-xl border border-[rgba(255,255,255,0.06)] bg-[#0F0B07] p-4 md:p-5">
          <h4 className="mb-3 text-sm font-bold text-[#D4AF37]">Keywords</h4>
          <ul className="list-disc space-y-2 pl-5 text-sm leading-6 text-[#D6CBB8] marker:text-[#D4AF37]">
            {question.keywords.map((keyword) => <li key={keyword}>{keyword}</li>)}
          </ul>
        </section>
        <WrittenExamPreviewSection
          title="โครงสร้าง/ประเด็นสำคัญในการตอบ"
          content={question.answerStructureMarkdown}
        />
        <WrittenExamPreviewSection title="เทคนิคช่วยจำ" content={question.memoryTechniqueMarkdown} />
      </div>
    </article>
  )
}

export function getWrittenExamQuestionTitle(markdown: string): string {
  const firstLine = markdown.split('\n').map((line) => line.trim()).find(Boolean)
  if (!firstLine) return 'ไม่มีชื่อโจทย์'
  return firstLine.length > 180 ? `${firstLine.slice(0, 177)}…` : firstLine
}

function WrittenExamPreviewSection({
  title,
  content,
}: {
  title: string
  content: string
}) {
  return (
    <section className="rounded-xl border border-[rgba(255,255,255,0.06)] bg-[#0F0B07] p-4 md:p-5">
      <h4 className="mb-3 text-sm font-bold text-[#D4AF37]">{title}</h4>
      <SummaryMarkdown content={content} />
    </section>
  )
}
