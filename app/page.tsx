import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { PACKAGES } from '@/lib/mock_data'

const DEMO_EXAMS = PACKAGES // Alias to avoid changing everything


const HOW_IT_WORKS = [
  {
    num: '01',
    title: 'เลือกชุดข้อสอบ',
    desc: 'เลือกกรมและตำแหน่งที่ต้องการสมัคร มีให้ครบทุกหน่วยงาน',
  },
  {
    num: '02',
    title: 'ชำระเงิน',
    desc: 'ชำระผ่าน PromptPay หรือบัตรเครดิต ได้สิทธิ์ทันที 1 ปี',
  },
  {
    num: '03',
    title: 'ทำข้อสอบทีละข้อ',
    desc: 'ระบบ Flashcard ทำทีละข้อ มีคำใบ้ช่วย + เฉลยละเอียดทุกข้อ',
  },
  {
    num: '04',
    title: 'ติดตามผล',
    desc: 'ดูสถิติคะแนน วิเคราะห์จุดอ่อน ฝึกซ้ำจนแม่นยำ',
  },
]

const FEATURES = [
  {
    title: 'ข้อสอบรายตำแหน่ง',
    desc: 'คลังข้อสอบเฉพาะกรมและตำแหน่ง ตรงประเด็นกว่าหนังสือทั่วไป',
    icon: (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
        <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/>
        <polyline points="22 4 12 14.01 9 11.01"/>
      </svg>
    ),
  },
  {
    title: 'คำใบ้ทุกข้อ',
    desc: 'กดดูคำใบ้ได้เมื่อต้องการ ช่วยให้คิดเป็นระบบก่อนดูเฉลย',
    icon: (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="10"/>
        <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/>
        <line x1="12" y1="17" x2="12.01" y2="17"/>
      </svg>
    ),
  },
  {
    title: 'เฉลยละเอียด',
    desc: 'ทุกข้อมีคำอธิบายเหตุผล ไม่ใช่แค่บอกว่าข้อไหนถูก',
    icon: (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
        <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/>
        <path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/>
      </svg>
    ),
  },
  {
    title: 'ซื้อขาด 1 ปี',
    desc: 'ไม่มีสมาชิกรายเดือน ซื้อครั้งเดียวใช้ได้ 365 วัน',
    icon: (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
        <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
      </svg>
    ),
  },
]

export default async function Home() {
  // ดึง exam sets จริงจาก DB (ถ้ามี)
  let liveExams = DEMO_EXAMS
  try {
    const supabase = await createClient()
    const { data } = await supabase
      .from('exams')
      .select('*')
      .eq('is_active', true)
      .order('created_at', { ascending: false })
      .limit(6)
    if (data && data.length > 0) liveExams = data
  } catch {
    // ใช้ demo data ถ้า DB ยังไม่ได้ตั้ง
  }

  return (
    <div style={{ minHeight: '100vh' }}>
      {/* ===================== Hero ===================== */}
      <section
        style={{
          position: 'relative',
          padding: '80px 20px 100px',
          textAlign: 'center',
          overflow: 'hidden',
        }}
      >
        {/* Background glow */}
        <div
          aria-hidden
          style={{
            position: 'absolute',
            top: '-60px',
            left: '50%',
            transform: 'translateX(-50%)',
            width: '600px',
            height: '400px',
            background: 'radial-gradient(ellipse at center, rgba(212, 168, 67, 0.08) 0%, transparent 70%)',
            pointerEvents: 'none',
          }}
        />

        <div style={{ maxWidth: '720px', margin: '0 auto', position: 'relative' }}>
          <div style={{ marginBottom: '20px' }}>
            <span
              className="badge badge-gold"
              style={{ fontSize: '13px', padding: '4px 14px' }}
            >
              คลังข้อสอบราชการ 2569
            </span>
          </div>

          <h1
            className="font-display"
            style={{
              fontSize: 'clamp(36px, 7vw, 64px)',
              lineHeight: 1.15,
              marginBottom: '20px',
              background: 'linear-gradient(135deg, #f5ede0 30%, var(--gold-light) 70%)',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
              backgroundClip: 'text',
            }}
          >
            เตรียมสอบข้าราชการ
            <br />
            อย่างมีระบบ
          </h1>

          <p
            style={{
              fontSize: '17px',
              color: 'var(--text-secondary)',
              lineHeight: 1.75,
              marginBottom: '36px',
              maxWidth: '540px',
              margin: '0 auto 36px',
            }}
          >
            ฝึกทำข้อสอบทีละข้อแบบ Flashcard มีคำใบ้และเฉลยละเอียดทุกข้อ
            <br />
            ซื้อขาดต่อชุดข้อสอบ ใช้ได้ 1 ปี
          </p>

          <div style={{ display: 'flex', gap: '12px', justifyContent: 'center', flexWrap: 'wrap' }}>
            <Link href="#exams">
              <button className="btn-primary" style={{ padding: '14px 32px', fontSize: '16px' }}>
                ดูชุดข้อสอบ
              </button>
            </Link>
            <Link href="/quiz/demo-1">
              <button className="btn-outline" style={{ padding: '13px 28px', fontSize: '15px' }}>
                ทดลองทำฟรี
              </button>
            </Link>
          </div>

          {/* Social proof */}
          <div
            style={{
              marginTop: '48px',
              display: 'flex',
              justifyContent: 'center',
              gap: '32px',
              flexWrap: 'wrap',
            }}
          >
            {[
              { value: '100+', label: 'ข้อสอบ/ชุด' },
              { value: '1 ปี', label: 'สิทธิ์ใช้งาน' },
              { value: 'ทันที', label: 'หลังชำระ' },
            ].map((stat) => (
              <div key={stat.label} style={{ textAlign: 'center' }}>
                <div
                  className="font-display"
                  style={{ fontSize: '28px', color: 'var(--gold-light)', lineHeight: 1.1 }}
                >
                  {stat.value}
                </div>
                <div style={{ fontSize: '12.5px', color: 'var(--text-muted)', marginTop: '2px' }}>
                  {stat.label}
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ===================== Exam Sets ===================== */}
      <section id="exams" style={{ padding: '20px 20px 80px', maxWidth: '1100px', margin: '0 auto' }}>
        <div style={{ textAlign: 'center', marginBottom: '40px' }}>
          <h2
            className="font-display"
            style={{ fontSize: 'clamp(24px, 4vw, 36px)', marginBottom: '10px' }}
          >
            ชุดข้อสอบยอดนิยม
          </h2>
          <p style={{ color: 'var(--text-muted)', fontSize: '15px' }}>
            เลือกกรมและตำแหน่งที่ต้องการ
          </p>
        </div>

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))',
            gap: '16px',
          }}
        >
          {liveExams.map((exam, i) => (
            <ExamCard key={exam.id} exam={exam} index={i} />
          ))}
        </div>

        <div style={{ textAlign: 'center', marginTop: '32px' }}>
          <Link href="#exams">
            <button className="btn-outline" style={{ padding: '12px 28px' }}>
              ดูชุดข้อสอบทั้งหมด
            </button>
          </Link>
        </div>
      </section>

      {/* ===================== Features ===================== */}
      <section
        style={{
          padding: '80px 20px',
          background: 'linear-gradient(180deg, transparent 0%, rgba(212, 168, 67, 0.03) 50%, transparent 100%)',
        }}
      >
        <div style={{ maxWidth: '1100px', margin: '0 auto' }}>
          <div style={{ textAlign: 'center', marginBottom: '48px' }}>
            <h2
              className="font-display"
              style={{ fontSize: 'clamp(24px, 4vw, 36px)', marginBottom: '10px' }}
            >
              ทำไมต้องสอบได้
            </h2>
          </div>

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))',
              gap: '16px',
            }}
          >
            {FEATURES.map((f) => (
              <div
                key={f.title}
                className="card"
                style={{ padding: '24px', transition: 'transform 0.2s' }}
              >
                <div
                  style={{
                    width: 46,
                    height: 46,
                    borderRadius: 12,
                    background: 'var(--gold-tint)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: 'var(--gold)',
                    marginBottom: '16px',
                  }}
                >
                  {f.icon}
                </div>
                <h3
                  className="font-display"
                  style={{ fontSize: '17px', marginBottom: '8px', fontWeight: 'normal' }}
                >
                  {f.title}
                </h3>
                <p style={{ color: 'var(--text-muted)', fontSize: '13.5px', lineHeight: 1.65 }}>
                  {f.desc}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ===================== How it Works ===================== */}
      <section style={{ padding: '80px 20px', maxWidth: '1100px', margin: '0 auto' }}>
        <div style={{ textAlign: 'center', marginBottom: '48px' }}>
          <h2
            className="font-display"
            style={{ fontSize: 'clamp(24px, 4vw, 36px)', marginBottom: '10px' }}
          >
            วิธีใช้งาน
          </h2>
        </div>

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))',
            gap: '20px',
          }}
        >
          {HOW_IT_WORKS.map((step, i) => (
            <div
              key={step.num}
              style={{
                display: 'flex',
                flexDirection: 'column',
                gap: '12px',
                animation: `fadeInUp 0.4s ease ${i * 0.08}s both`,
              }}
            >
              <div
                className="font-display"
                style={{
                  fontSize: '36px',
                  color: 'var(--gold-tint)',
                  lineHeight: 1,
                  color: 'rgba(212, 168, 67, 0.25)',
                }}
              >
                {step.num}
              </div>
              <h3
                className="font-display"
                style={{ fontSize: '18px', color: 'var(--gold-light)', fontWeight: 'normal' }}
              >
                {step.title}
              </h3>
              <p style={{ color: 'var(--text-muted)', fontSize: '13.5px', lineHeight: 1.7 }}>
                {step.desc}
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* ===================== CTA ===================== */}
      <section style={{ padding: '60px 20px 100px' }}>
        <div
          className="card-gold"
          style={{
            maxWidth: '600px',
            margin: '0 auto',
            padding: '48px 40px',
            textAlign: 'center',
          }}
        >
          <h2
            className="font-display"
            style={{ fontSize: 'clamp(22px, 4vw, 32px)', marginBottom: '12px' }}
          >
            พร้อมเริ่มติวสอบแล้วใช่ไหม
          </h2>
          <p style={{ color: 'var(--text-secondary)', marginBottom: '28px', lineHeight: 1.65 }}>
            ซื้อชุดข้อสอบที่ต้องการ แล้วเริ่มทำได้ทันที ไม่ต้องรอ
          </p>
          <Link href="#exams">
            <button
              className="btn-primary animate-pulse-gold"
              style={{ padding: '14px 36px', fontSize: '16px' }}
            >
              ดูชุดข้อสอบ
            </button>
          </Link>
        </div>
      </section>
    </div>
  )
}

// Exam Card Component (inline เพื่อความสะดวก)
function ExamCard({ exam, index }: { exam: (typeof PACKAGES)[0]; index: number }) {
  return (
    <Link
      href={`/package/${exam.id}`}
      style={{ textDecoration: 'none', display: 'block' }}
    >
      <div
        className="card"
        style={{
          padding: '22px',
          cursor: 'pointer',
          transition: 'all 0.2s',
          animation: `fadeInUp 0.4s ease ${index * 0.07}s both`,
          height: '100%',
        }}
      >
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '12px' }}>
          <div
            style={{
              fontSize: '11px',
              color: 'var(--gold-muted)',
              fontWeight: '600',
              textTransform: 'uppercase',
              letterSpacing: '0.08em',
            }}
          >
            ปี {exam.year}
          </div>
          {exam.tag && (
            <span className={`badge ${exam.tag === 'ใหม่' ? 'badge-green' : 'badge-gold'}`}>
              {exam.tag}
            </span>
          )}
        </div>

        {/* Department */}
        <div
          className="font-display"
          style={{ fontSize: '15px', color: 'var(--text-secondary)', marginBottom: '4px', fontWeight: 'normal' }}
        >
          {exam.department}
        </div>

        {/* Position */}
        <h3
          style={{
            fontSize: '16px',
            fontWeight: '600',
            color: 'var(--text-primary)',
            marginBottom: '8px',
            lineHeight: 1.35,
          }}
        >
          {exam.position}
        </h3>

        {/* Subject */}
        <p style={{ fontSize: '12.5px', color: 'var(--text-muted)', marginBottom: '16px' }}>
          {exam.subject}
        </p>

        <div className="divider" style={{ margin: '16px 0' }} />

        {/* Footer */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ fontSize: '12.5px', color: 'var(--text-muted)' }}>
            {exam.total_questions} ข้อ
          </div>
          <div
            className="font-display"
            style={{ fontSize: '20px', color: 'var(--gold-light)' }}
          >
            ฿{exam.price}
          </div>
        </div>
      </div>
    </Link>
  )
}
