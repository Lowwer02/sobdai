import type { Metadata } from 'next'
import Link from 'next/link'
import {
  Calculator,
  BookText,
  Languages,
  Scale,
  Sparkles,
  ArrowRight,
  Newspaper,
  CheckCircle2,
} from 'lucide-react'
import PackagePhaseTabs from '@/components/packages/PackagePhaseTabs'
import {
  createPageMetadata,
  PHAK_K_TITLE,
  PHAK_K_DESCRIPTION,
  PHAK_K_H1,
} from '@/lib/seo'

export const metadata: Metadata = createPageMetadata({
  title: PHAK_K_TITLE,
  description: PHAK_K_DESCRIPTION,
  path: '/packages/phak-k',
  noindex: true,
  follow: true,
})

const EXAM_SUBJECTS = [
  {
    icon: Calculator,
    title: '1. วิชาความสามารถในการคิดวิเคราะห์',
    passingScore: 'เกณฑ์ผ่าน 60% (ป.โท 65%)',
    topics: [
      'อนุกรมและรูปแบบตัวเลข',
      'คณิตศาสตร์ทั่วไปและโจทย์ปัญหา',
      'โอเปอเรชัน (Operation)',
      'การวิเคราะห์ข้อมูลและตาราง',
      'เงื่อนไขภาษาและเงื่อนไขสัญลักษณ์',
    ],
  },
  {
    icon: BookText,
    title: '2. วิชาภาษาไทย',
    passingScore: 'รวมกับวิชาคิดวิเคราะห์',
    topics: [
      'ความเข้าใจภาษาและการจับใจความสำคัญ',
      'การอ่านบทความสั้นและบทความยาว',
      'การเรียงลำดับประโยคและข้อความ',
      'การใช้คำ กลุ่มคำ และหลักภาษาไทย',
    ],
  },
  {
    icon: Languages,
    title: '3. วิชาภาษาอังกฤษ',
    passingScore: 'เกณฑ์ผ่าน 50%',
    topics: [
      'สนทนาและการสื่อสาร (Conversation)',
      'ไวยากรณ์และโครงสร้าง (Grammar & Structure)',
      'คำศัพท์ (Vocabulary)',
      'การอ่านทำความเข้าใจบทความ (Reading)',
    ],
  },
  {
    icon: Scale,
    title: '4. วิชาความรู้และลักษณะการเป็นข้าราชการที่ดี',
    passingScore: 'เกณฑ์ผ่าน 60%',
    topics: [
      'พ.ร.บ. ระเบียบบริหารราชการแผ่นดิน พ.ศ. 2534',
      'พ.ร.ฎ. หลักเกณฑ์และวิธีการบริหารกิจการบ้านเมืองที่ดี พ.ศ. 2546',
      'พ.ร.บ. วิธีปฏิบัติราชการทางปกครอง พ.ศ. 2539',
      'พ.ร.บ. ความรับผิดทางละเมิดของเจ้าหน้าที่ พ.ศ. 2539',
      'พ.ร.บ. มาตรฐานทางจริยธรรม พ.ศ. 2562',
    ],
  },
]

export default function PhakKPage() {
  return (
    <div className="min-h-screen" style={{ backgroundColor: 'var(--bg-primary)', color: 'var(--text-primary)' }}>
      <div style={{ maxWidth: '1000px', margin: '0 auto', padding: '40px 20px 80px' }}>

        {/* Header */}
        <header style={{ textAlign: 'center', marginBottom: '36px' }}>
          <div style={{ marginBottom: '24px' }}>
            <PackagePhaseTabs activePhase="phak-k" showAllTab={false} />
          </div>
          <h1
            className="font-display"
            style={{
              fontSize: 'clamp(28px, 5vw, 42px)',
              marginBottom: '10px',
              background: 'linear-gradient(135deg, #f5ede0 30%, var(--gold-light) 70%)',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
              backgroundClip: 'text',
            }}
          >
            {PHAK_K_H1}
          </h1>
          <p style={{ color: 'var(--text-muted)', fontSize: '15px', maxWidth: '560px', margin: '0 auto' }}>
            เตรียมความพร้อมสอบภาค ก สำนักงาน ก.พ. ครอบคลุม 4 หมวดวิชาหลักตามหลักสูตรมาตรฐาน
          </p>
        </header>

        {/* Foundation Status Notice */}
        <div
          className="card"
          style={{
            padding: '28px 24px',
            textAlign: 'center',
            background: 'linear-gradient(135deg, rgba(212,175,55,0.08) 0%, rgba(20,15,10,0.85) 100%)',
            borderColor: 'rgba(212,175,55,0.25)',
            marginBottom: '40px',
          }}
        >
          <div
            style={{
              width: '44px',
              height: '44px',
              borderRadius: '50%',
              background: 'rgba(212,175,55,0.15)',
              color: 'var(--gold)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              margin: '0 auto 12px',
            }}
          >
            <Sparkles size={22} />
          </div>

          <h2 className="font-display" style={{ fontSize: '18px', color: 'var(--text-primary)', marginBottom: '8px' }}>
            คลังข้อสอบภาค ก ระบบใหม่อยู่ระหว่างการจัดเตรียม
          </h2>
          <p style={{ color: 'var(--text-secondary)', fontSize: '13.5px', lineHeight: 1.6, maxWidth: '520px', margin: '0 auto 20px' }}>
            ระหว่างที่ทีมงานกำลังจัดทำชุดข้อสอบภาค ก ก.พ. ตามเกณฑ์ล่าสุด คุณสามารถฝึกทำข้อสอบภาค ข ของแต่ละหน่วยงาน หรือติดตามประกาศเปิดสอบล่าสุดได้ทันที
          </p>

          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px', justifyContent: 'center' }}>
            <Link
              href="/packages/phak-khor"
              className="btn-primary"
              style={{
                textDecoration: 'none',
                padding: '9px 20px',
                fontSize: '13.5px',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
              }}
            >
              <span>ดูแนวข้อสอบภาค ข</span>
              <ArrowRight size={14} />
            </Link>

            <Link
              href="/news"
              className="btn-outline"
              style={{
                textDecoration: 'none',
                padding: '9px 18px',
                fontSize: '13.5px',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
              }}
            >
              <Newspaper size={14} />
              <span>ข่าวเปิดสอบราชการ</span>
            </Link>
          </div>
        </div>

        {/* 4 Exam Subjects Overview */}
        <section aria-labelledby="phak-k-subjects-heading">
          <h2
            id="phak-k-subjects-heading"
            className="font-display"
            style={{ fontSize: '20px', color: 'var(--text-primary)', marginBottom: '16px', textAlign: 'center' }}
          >
            โครงสร้างวิชาสอบภาค ก ก.พ.
          </h2>

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
              gap: '16px',
            }}
          >
            {EXAM_SUBJECTS.map((subject, index) => {
              const Icon = subject.icon
              return (
                <div
                  key={index}
                  className="card"
                  style={{
                    padding: '20px',
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'space-between',
                  }}
                >
                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
                      <div
                        style={{
                          width: '34px',
                          height: '34px',
                          borderRadius: '8px',
                          background: 'rgba(212,175,55,0.1)',
                          color: 'var(--gold)',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          flexShrink: 0,
                        }}
                      >
                        <Icon size={18} />
                      </div>
                      <span className="badge badge-gold" style={{ fontSize: '11px', padding: '2px 7px' }}>
                        {subject.passingScore}
                      </span>
                    </div>

                    <h3 style={{ fontSize: '15px', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '10px', lineHeight: 1.4 }}>
                      {subject.title}
                    </h3>

                    <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: '6px' }}>
                      {subject.topics.map((topic, i) => (
                        <li key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: '6px', fontSize: '12.5px', color: 'var(--text-secondary)' }}>
                          <CheckCircle2 size={14} style={{ color: 'var(--gold)', flexShrink: 0, marginTop: '2px' }} />
                          <span>{topic}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              )
            })}
          </div>
        </section>

      </div>
    </div>
  )
}
