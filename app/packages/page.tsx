import { getPublicPackageCatalog } from '@/lib/publicData'
import PackageCard from '@/components/PackageCard'
import PackagePhaseTabs from '@/components/packages/PackagePhaseTabs'
import type { Metadata } from 'next'
import Image from 'next/image'
import Link from 'next/link'
import { ArrowRight, BookOpen, GraduationCap } from 'lucide-react'
import {
  createPageMetadata,
  PACKAGES_HUB_TITLE,
  PACKAGES_HUB_DESCRIPTION,
  PACKAGES_HUB_H1,
} from '@/lib/seo'

export const metadata: Metadata = createPageMetadata({
  title: PACKAGES_HUB_TITLE,
  description: PACKAGES_HUB_DESCRIPTION,
  path: '/packages',
})

/**
 * /packages = Parent Hub "แนวข้อสอบราชการออนไลน์"
 *
 * Dedicated discovery hub connecting learners to ภาค ก and ภาค ข.
 * Does NOT render the full interactive searchable catalog (which lives on
 * /packages/phak-khor) to eliminate duplicate search intent and SEO cannibalization.
 */
export default async function PackageHubPage() {
  const packages = await getPublicPackageCatalog()
  const previewPackages = packages.slice(0, 3)

  return (
    <div className="min-h-screen" style={{ backgroundColor: 'var(--bg-primary)', color: 'var(--text-primary)' }}>
      <div style={{ maxWidth: '1100px', margin: '0 auto', padding: '40px 20px 80px' }}>

        {/* Header */}
        <header style={{ marginBottom: '28px' }}>
          <div style={{ textAlign: 'center', marginBottom: '20px' }}>
            <PackagePhaseTabs activePhase="all" showAllTab={true} />
          </div>

          <div
            style={{
              maxWidth: '860px',
              margin: '0 auto',
            }}
            className="flex items-center justify-between gap-4 sm:gap-6 md:gap-8 lg:gap-10"
          >
            <div className="flex-1 lg:flex-[1.15] text-center min-[360px]:text-left lg:text-center">
              <h1
                className="font-display"
                style={{
                  fontSize: 'clamp(24px, 4.2vw, 42px)',
                  marginBottom: '12px',
                  lineHeight: 1.25,
                  color: '#f5ede0',
                }}
              >
                <span className="block sm:inline">แพ็กเกจข้อสอบ</span>
                <span
                  className="block sm:inline"
                  style={{
                    background: 'linear-gradient(135deg, #f5ede0 20%, var(--gold-light) 80%)',
                    WebkitBackgroundClip: 'text',
                    WebkitTextFillColor: 'transparent',
                    backgroundClip: 'text',
                  }}
                >
                  ราชการทั้งหมด
                </span>
              </h1>
              <p
                style={{
                  color: 'var(--text-muted)',
                  maxWidth: '500px',
                  margin: '0 auto',
                  lineHeight: 1.6,
                }}
                className="text-[13.5px] sm:text-[15px]"
              >
                ศูนย์รวมแนวข้อสอบราชการออนไลน์ เลือกเตรียมตัวสอบตามหมวดหมู่ ภาค ก หรือ ภาค ข
              </p>
            </div>

            <div
              className="relative pointer-events-none hidden shrink-0 items-center justify-center select-none min-[360px]:flex"
              aria-hidden="true"
            >
              {/* Subtle gold atmosphere glow behind mascot */}
              <div
                className="absolute inset-0 -m-4 sm:-m-6 rounded-full pointer-events-none opacity-60"
                style={{
                  background: 'radial-gradient(circle, rgba(212, 168, 67, 0.18) 0%, rgba(212, 168, 67, 0.05) 50%, transparent 72%)',
                  filter: 'blur(20px)',
                }}
              />
              <Image
                src="/images/packages/sobdai-packages-mascot.webp"
                alt=""
                width={480}
                height={480}
                sizes="(min-width: 1440px) 260px, (min-width: 1280px) 240px, (min-width: 1024px) 200px, (min-width: 768px) 160px, 104px"
                unoptimized
                className="relative z-10 h-auto w-[96px] min-[390px]:w-[104px] min-[430px]:w-[110px] sm:w-[160px] md:w-[200px] lg:w-[240px] xl:w-[260px] opacity-95 mix-blend-screen"
              />
            </div>
          </div>
        </header>

        {/* Phase Navigation Cards */}
        <section aria-label="เลือกหมวดหมู่ข้อสอบ" style={{ marginBottom: '56px' }}>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))',
              gap: '20px',
              maxWidth: '880px',
              margin: '0 auto',
            }}
          >
            {/* ภาค ก Card */}
            <div
              className="card"
              style={{
                padding: '28px 24px',
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'space-between',
                background: 'linear-gradient(135deg, rgba(255,255,255,0.03) 0%, rgba(212,175,55,0.04) 100%)',
                borderRadius: '16px',
                border: '1px solid var(--border-subtle)',
              }}
            >
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '14px' }}>
                  <div style={{ width: '36px', height: '36px', borderRadius: '10px', background: 'rgba(212,175,55,0.12)', color: 'var(--gold)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <GraduationCap size={20} />
                  </div>
                  <span className="badge badge-gold" style={{ fontSize: '11px', padding: '3px 8px' }}>
                    ภาค ก ก.พ.
                  </span>
                </div>
                <h2 style={{ fontSize: '18px', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '8px' }}>
                  แนวข้อสอบภาค ก
                </h2>
                <p style={{ fontSize: '13.5px', color: 'var(--text-secondary)', lineHeight: 1.6, margin: '0 0 20px' }}>
                  วัดความรู้ความสามารถทั่วไป ภาษาไทย ภาษาอังกฤษ และกฎหมายระเบียบข้าราชการที่ดี ตามหลักสูตรสำนักงาน ก.พ.
                </p>
              </div>
              <Link
                href="/packages/phak-k"
                className="btn-outline group"
                style={{
                  textDecoration: 'none',
                  padding: '10px 18px',
                  fontSize: '13.5px',
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '6px',
                }}
              >
                <span>ดูโครงสร้างแนวข้อสอบภาค ก</span>
                <ArrowRight size={14} className="group-hover:translate-x-1 transition-transform" />
              </Link>
            </div>

            {/* ภาค ข Card */}
            <div
              className="card"
              style={{
                padding: '28px 24px',
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'space-between',
                background: 'linear-gradient(135deg, rgba(212,175,55,0.06) 0%, rgba(20,15,10,0.9) 100%)',
                borderRadius: '16px',
                border: '1px solid rgba(212,175,55,0.3)',
              }}
            >
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '14px' }}>
                  <div style={{ width: '36px', height: '36px', borderRadius: '10px', background: 'rgba(212,175,55,0.15)', color: 'var(--gold)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <BookOpen size={20} />
                  </div>
                  <span className="badge badge-gold" style={{ fontSize: '11px', padding: '3px 8px' }}>
                    ภาค ข เฉพาะตำแหน่ง
                  </span>
                </div>
                <h2 style={{ fontSize: '18px', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '8px' }}>
                  แนวข้อสอบภาค ข
                </h2>
                <p style={{ fontSize: '13.5px', color: 'var(--text-secondary)', lineHeight: 1.6, margin: '0 0 20px' }}>
                  คลังข้อสอบเฉพาะตำแหน่งและหน่วยงาน แยกตามกรมและกระทรวง มีแบบฝึกหัดพร้อมเฉลยละเอียดและจับเวลาจริง
                </p>
              </div>
              <Link
                href="/packages/phak-khor"
                className="btn-primary group"
                style={{
                  textDecoration: 'none',
                  padding: '10px 18px',
                  fontSize: '13.5px',
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '6px',
                }}
              >
                <span>เข้าสู่คลังข้อสอบภาค ข ({packages.length} ชุด)</span>
                <ArrowRight size={14} className="group-hover:translate-x-1 transition-transform" />
              </Link>
            </div>
          </div>
        </section>

        {/* Featured / Sample Packages Preview */}
        {previewPackages.length > 0 && (
          <section aria-labelledby="hub-preview-heading">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', flexWrap: 'wrap', gap: '12px', marginBottom: '20px' }}>
              <div>
                <h2
                  id="hub-preview-heading"
                  className="font-display"
                  style={{ fontSize: '20px', color: 'var(--text-primary)', marginBottom: '4px' }}
                >
                  ตัวอย่างชุดข้อสอบภาค ข ล่าสุด
                </h2>
                <p style={{ color: 'var(--text-muted)', fontSize: '13.5px', margin: 0 }}>
                  ชุดข้อสอบที่เปิดให้ฝึกทำออนไลน์ในระบบ Sobdai
                </p>
              </div>
              <Link
                href="/packages/phak-khor"
                style={{
                  textDecoration: 'none',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px',
                  color: 'var(--gold-light)',
                  fontSize: '13.5px',
                  fontWeight: 600,
                }}
                className="group"
              >
                <span>ดูทั้งหมด ({packages.length} ชุด)</span>
                <ArrowRight size={14} className="group-hover:translate-x-1 transition-transform" />
              </Link>
            </div>

            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))',
                gap: '16px',
                marginBottom: '28px',
              }}
            >
              {previewPackages.map((pkg, i) => (
                <PackageCard key={pkg.id} pkg={pkg} index={i} />
              ))}
            </div>

            <div style={{ textAlign: 'center' }}>
              <Link
                href="/packages/phak-khor"
                className="btn-outline"
                style={{
                  textDecoration: 'none',
                  padding: '12px 28px',
                  fontSize: '14px',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '8px',
                }}
              >
                <span>ค้นหาและเลือกดูแนวข้อสอบภาค ข ทั้งหมด</span>
                <ArrowRight size={15} />
              </Link>
            </div>
          </section>
        )}

      </div>
    </div>
  )
}
