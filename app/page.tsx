import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'

interface PackageData {
  id: string
  slug: string
  exam_year: string
  current_price: number
  original_price: number
  difficulty: string
  total_questions: number
  total_exam_sets: number
  description: string | null
  organizations: {
    name: string
    logo_url: string | null
  } | null
  positions: {
    name: string
  } | null
}

export const dynamic = 'force-dynamic'

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
  let livePackages: PackageData[] = []
  
  try {
    const supabase = await createClient()
    const { data } = await supabase
      .from('packages')
      .select(`
        id,
        slug,
        exam_year,
        current_price,
        original_price,
        difficulty,
        total_questions,
        total_exam_sets,
        description,
        organizations ( name, logo_url ),
        positions ( name )
      `)
      .order('created_at', { ascending: false })
      .limit(6)
      
    if (data && data.length > 0) {
      livePackages = data as any
    }
  } catch (error) {
    console.error('Failed to fetch packages:', error)
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
            <Link href="#exams">
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

        {livePackages.length > 0 ? (
          <>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))',
                gap: '16px',
              }}
            >
              {livePackages.map((pkg, i) => (
                <ExamCard key={pkg.id} pkg={pkg} index={i} />
              ))}
            </div>
            <div style={{ textAlign: 'center', marginTop: '32px' }}>
              <Link href="#exams">
                <button className="btn-outline" style={{ padding: '12px 28px' }}>
                  ดูชุดข้อสอบทั้งหมด
                </button>
              </Link>
            </div>
          </>
        ) : (
          <div className="card" style={{ padding: '48px 20px', textAlign: 'center', minHeight: '300px', display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center' }}>
            <div style={{ width: 64, height: 64, borderRadius: '50%', background: 'var(--gold-tint)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--gold)', marginBottom: '24px' }}>
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <rect width="18" height="18" x="3" y="3" rx="2" />
                <path d="M12 8v8" />
                <path d="m8 12 4 4 4-4" />
              </svg>
            </div>
            <h3 className="font-display" style={{ fontSize: '20px', marginBottom: '8px', color: 'var(--text-primary)' }}>กำลังเตรียมชุดข้อสอบใหม่</h3>
            <p style={{ color: 'var(--text-muted)', maxWidth: '400px' }}>ทีมงานกำลังอัปเดตคลังข้อสอบและสรุปเนื้อหาสำหรับปีล่าสุด กลับมาเช็คใหม่เร็วๆ นี้นะครับ</p>
          </div>
        )}
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
                  color: 'rgba(212, 168, 67, 0.25)',
                  lineHeight: 1,
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
function ExamCard({ pkg, index }: { pkg: PackageData; index: number }) {
  const orgName = pkg.organizations?.name || 'ไม่ระบุหน่วยงาน'
  const posName = pkg.positions?.name || 'ไม่ระบุตำแหน่ง'
  const logoUrl = pkg.organizations?.logo_url
  const hasDiscount = pkg.original_price > pkg.current_price
  const discountPercent = hasDiscount ? Math.round(((pkg.original_price - pkg.current_price) / pkg.original_price) * 100) : 0

  return (
    <Link
      href={`/package/${pkg.slug}`}
      style={{ textDecoration: 'none', display: 'block', height: '100%' }}
    >
      <div
        className="card group"
        style={{
          padding: '24px',
          cursor: 'pointer',
          transition: 'all 0.3s ease',
          animation: `fadeInUp 0.4s ease ${index * 0.07}s both`,
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          position: 'relative',
          overflow: 'hidden'
        }}
      >
        {/* Hover Gradient Background */}
        <div 
          className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none"
          style={{ background: 'linear-gradient(to bottom, rgba(212,175,55,0.02), transparent)' }} 
        />

        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '16px', position: 'relative' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            {logoUrl ? (
              <div style={{ width: 32, height: 32, borderRadius: '6px', overflow: 'hidden', backgroundColor: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <img src={logoUrl} alt={orgName} style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
              </div>
            ) : (
              <div style={{ width: 32, height: 32, borderRadius: '6px', backgroundColor: '#D4AF37', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#1A140E', fontWeight: 'bold', fontSize: '14px' }}>
                {orgName.charAt(0)}
              </div>
            )}
            <div
              style={{
                fontSize: '11px',
                color: 'var(--gold-muted)',
                fontWeight: '600',
                textTransform: 'uppercase',
                letterSpacing: '0.08em',
              }}
            >
              ปี {pkg.exam_year}
            </div>
          </div>
          {hasDiscount && (
            <span className="badge badge-green" style={{ fontSize: '11px', padding: '2px 8px' }}>
              ลด {discountPercent}%
            </span>
          )}
        </div>

        {/* Department */}
        <div
          className="font-display"
          style={{ fontSize: '14px', color: 'var(--text-secondary)', marginBottom: '4px', fontWeight: 'normal', position: 'relative' }}
        >
          {orgName}
        </div>

        {/* Position */}
        <h3
          style={{
            fontSize: '18px',
            fontWeight: '600',
            color: 'var(--text-primary)',
            marginBottom: '8px',
            lineHeight: 1.35,
            position: 'relative'
          }}
        >
          {posName}
        </h3>

        {/* Description / Difficulty */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px', position: 'relative' }}>
          <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
            ระดับ: {pkg.difficulty}
          </span>
          <span style={{ width: 4, height: 4, borderRadius: '50%', backgroundColor: 'var(--text-muted)', opacity: 0.5 }} />
          <span style={{ fontSize: '12px', color: 'var(--text-muted)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {pkg.description || 'เตรียมสอบพร้อมสรุปและข้อสอบจริง'}
          </span>
        </div>

        <div className="divider" style={{ margin: 'auto 0 16px 0', opacity: 0.5 }} />

        {/* Footer */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', position: 'relative' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
             <div style={{ fontSize: '12px', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '6px' }}>
               <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg>
               {pkg.total_questions} ข้อ
             </div>
             <div style={{ fontSize: '12px', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '6px' }}>
               <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1 0-5H20"/></svg>
               {pkg.total_exam_sets} ชุด
             </div>
          </div>
          <div style={{ textAlign: 'right' }}>
            {hasDiscount && (
              <div style={{ fontSize: '12px', color: 'var(--text-muted)', textDecoration: 'line-through', marginBottom: '2px' }}>
                ฿{pkg.original_price}
              </div>
            )}
            <div
              className="font-display"
              style={{ fontSize: '22px', color: 'var(--gold-light)', lineHeight: 1 }}
            >
              ฿{pkg.current_price}
            </div>
          </div>
        </div>
      </div>
    </Link>
  )
}
