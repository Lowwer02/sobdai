import Link from 'next/link'
import Image from 'next/image'
import { createClient } from '@/lib/supabase/server'
import { createAnonServerClient } from '@/lib/supabase/anon-server'
import { getPackagePublicCounts } from '@/lib/publicData'
import { ORDER_COMPLETED_STATUSES } from '@/lib/orderUtils'
import PackageCard from '@/components/PackageCard'
import type { PackageCardData } from '@/components/PackageCard'
import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'ข้อสอบของฉัน | Sobdai',
  description: 'แดชบอร์ดข้อสอบของคุณ — กลับไปทำชุดข้อสอบที่ซื้อไว้ได้อย่างรวดเร็ว',
}

/**
 * My Exam Dashboard (Phase 0).
 *
 * Replaces the previous catalog duplicate with a personal dashboard scoped to
 * the logged-in user's purchased packages. Three render states:
 *   1. Guest (not logged in)       -> empty state with login / explore CTAs
 *   2. Logged in, owns nothing     -> empty state with "browse packages" CTA
 *   3. Logged in, owns packages    -> Continue Learning + My Packages grid
 *
 * Sections that require future schema (exam_attempts / bookmarks / etc.) are
 * rendered as explicit "เร็ว ๆ นี้" placeholders — no fake data, per spec.
 *
 * Pure Server Component: no client JS added. Reuses PackageCard, the orders
 * query pattern from /orders, and the getPackagePublicCounts RPC.
 */
export default async function ExamDashboardPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  // --- Guest: not logged in -------------------------------------------------
  if (!user) {
    return <GuestEmptyState />
  }

  // --- Logged in: resolve purchased packages --------------------------------
  // Reuse the /orders query pattern. We only need completed (paid/free) orders
  // and the package fields required by PackageCard.
  const { data: orders } = await supabase
    .from('orders')
    .select(`
      package_id,
      packages (
        id, slug, exam_year, current_price, original_price, difficulty,
        description, logo_url, is_published,
        organizations ( name, logo_url ),
        positions ( name )
      )
    `)
    .eq('user_id', user.id)
    .in('status', ORDER_COMPLETED_STATUSES)
    .order('created_at', { ascending: false })

  // De-duplicate by package id (a user may have multiple orders for one pkg)
  // and drop unpublished packages (e.g. retired after purchase).
  const seen = new Set<string>()
  const ownedPackages: any[] = []
  for (const o of orders ?? []) {
    const pkg = o.packages as any
    if (!pkg || seen.has(pkg.id) || !pkg.is_published) continue
    seen.add(pkg.id)
    ownedPackages.push(pkg)
  }

  // --- Logged in, owns nothing ---------------------------------------------
  if (ownedPackages.length === 0) {
    return <NoPackagesEmptyState />
  }

  // --- Logged in, owns packages --------------------------------------------
  // Enrich with public counts (total_questions / total_exam_sets) via the
  // existing RPC — same pattern as the homepage.
  let enriched: PackageCardData[] = []
  try {
    const counts = await getPackagePublicCounts(ownedPackages.map((p) => p.id))
    enriched = ownedPackages.map((pkg) => ({
      id: pkg.id,
      slug: pkg.slug,
      exam_year: pkg.exam_year,
      current_price: pkg.current_price,
      original_price: pkg.original_price,
      difficulty: pkg.difficulty,
      description: pkg.description,
      logo_url: pkg.logo_url,
      organizations: pkg.organizations,
      positions: pkg.positions,
      total_questions: counts[pkg.id]?.total_questions || 0,
      total_exam_sets: counts[pkg.id]?.total_exam_sets || 0,
    }))
  } catch {
    // Counts are non-critical; fall back to zeros rather than crashing.
    enriched = ownedPackages.map((pkg) => ({
      id: pkg.id,
      slug: pkg.slug,
      exam_year: pkg.exam_year,
      current_price: pkg.current_price,
      original_price: pkg.original_price,
      difficulty: pkg.difficulty,
      description: pkg.description,
      logo_url: pkg.logo_url,
      organizations: pkg.organizations,
      positions: pkg.positions,
      total_questions: 0,
      total_exam_sets: 0,
    }))
  }

  // Continue Learning = first few owned packages (no progress data in Phase 0,
  // so we surface entries into purchased packages).
  const continueLearning = enriched.slice(0, 3)
  const allPackages = enriched

  return (
    <div className="min-h-screen" style={{ backgroundColor: 'var(--bg-primary)', color: 'var(--text-primary)' }}>
      <div style={{ maxWidth: '1100px', margin: '0 auto', padding: '40px 20px 80px' }}>

        {/* ---------- Hero ---------- */}
        <header style={{ textAlign: 'center', marginBottom: '40px' }}>
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
            ข้อสอบของฉัน
          </h1>
          <p style={{ color: 'var(--text-muted)', fontSize: '15px', maxWidth: '520px', margin: '0 auto' }}>
            ติดตามการเรียนของคุณและกลับไปทำข้อสอบที่ซื้อไว้ได้อย่างรวดเร็ว
          </p>
        </header>

        {/* ---------- Continue Learning ---------- */}
        <section style={{ marginBottom: '48px' }}>
          <SectionTitle>ทำต่อ</SectionTitle>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))',
              gap: '16px',
            }}
          >
            {continueLearning.map((pkg, i) => (
              <PackageCard key={pkg.id} pkg={pkg} index={i} />
            ))}
          </div>
        </section>

        {/* ---------- My Packages (full list) ---------- */}
        {allPackages.length > continueLearning.length && (
          <section style={{ marginBottom: '48px' }}>
            <SectionTitle>แพ็กเกจของฉัน</SectionTitle>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))',
                gap: '16px',
              }}
            >
              {allPackages.map((pkg, i) => (
                <PackageCard key={pkg.id} pkg={pkg} index={i} />
              ))}
            </div>
          </section>
        )}

        {/* ---------- Placeholder sections (future phases) ---------- */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
            gap: '16px',
          }}
        >
          <PlaceholderCard title="ผลสอบล่าสุด">
            เมื่อระบบบันทึกผลสอบถูกพัฒนา
            คุณจะสามารถดูผลสอบย้อนหลังได้ที่นี่
          </PlaceholderCard>
          <PlaceholderCard title="สถิติการเรียน">
            ค่าเฉลี่ย คะแนนสูงสุด และจำนวนครั้งที่ทำ
            จะแสดงที่นี่ในอนาคต
          </PlaceholderCard>
          <PlaceholderCard title="หัวข้อที่ควรทบทวน">
            ระบบจะวิเคราะห์หัวข้อที่คุณทำได้น้อย
            เพื่อแนะนำการทบทวน
          </PlaceholderCard>
          <PlaceholderCard title="ข้อสอบที่บันทึกไว้">
            ข้อสอบที่คุณคั่นไว้จะปรากฏที่นี่
          </PlaceholderCard>
          <PlaceholderCard title="ไทม์ไลน์กิจกรรม">
            ประวัติการเรียนและการทำข้อสอบล่าสุด
          </PlaceholderCard>
        </div>
      </div>
    </div>
  )
}

/* -------------------------------------------------------------------------- */
/* Sub-components (kept local — Phase-0 only, not worth a shared file yet)    */
/* -------------------------------------------------------------------------- */

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h2
      className="font-display"
      style={{
        fontSize: '20px',
        color: 'var(--text-primary)',
        marginBottom: '16px',
        fontWeight: 700,
      }}
    >
      {children}
    </h2>
  )
}

function PlaceholderCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div
      className="card"
      style={{
        padding: '24px',
        opacity: 0.85,
      }}
    >
      <div
        style={{
          fontSize: '11px',
          fontWeight: 700,
          letterSpacing: '0.08em',
          textTransform: 'uppercase',
          color: 'var(--gold-muted)',
          marginBottom: '12px',
        }}
      >
        {title}
      </div>
      <div style={{ fontSize: '13px', color: 'var(--text-muted)', lineHeight: 1.6, marginBottom: '12px' }}>
        {children}
      </div>
      <span
        style={{
          display: 'inline-block',
          fontSize: '11px',
          fontWeight: 600,
          color: 'var(--gold-muted)',
          border: '1px solid var(--border-subtle, rgba(255,255,255,0.08))',
          borderRadius: '999px',
          padding: '3px 10px',
        }}
      >
        เร็ว ๆ นี้
      </span>
    </div>
  )
}

/** Guest empty state — not logged in. */
function GuestEmptyState() {
  return (
    <div
      className="min-h-screen"
      style={{
        backgroundColor: 'var(--bg-primary)',
        color: 'var(--text-primary)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '40px 20px',
      }}
    >
      <div
        className="card"
        style={{
          maxWidth: '460px',
          width: '100%',
          padding: '48px 32px',
          textAlign: 'center',
        }}
      >
        {/* Emblem — reuse the brand mark motif (shield + dot) used in admin layout */}
        <div
          style={{
            width: '72px',
            height: '72px',
            borderRadius: '50%',
            background: 'var(--gold-tint, rgba(212,175,55,0.1))',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: 'var(--gold)',
            margin: '0 auto 24px',
          }}
        >
          <svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
            <circle cx="12" cy="10" r="3" fill="currentColor" />
          </svg>
        </div>

        <h1
          className="font-display"
          style={{ fontSize: '26px', marginBottom: '12px', color: 'var(--text-primary)' }}
        >
          แดชบอร์ดข้อสอบของคุณ
        </h1>
        <p style={{ color: 'var(--text-muted)', fontSize: '14.5px', lineHeight: 1.7, marginBottom: '28px' }}>
          เข้าสู่ระบบเพื่อดูชุดข้อสอบที่คุณซื้อ
          ติดตามผลการเรียน
          และกลับไปฝึกทำข้อสอบได้ทุกเมื่อ
        </p>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          <Link
            href="/login?redirect=/exams"
            className="btn-primary"
            style={{ display: 'block', textAlign: 'center', textDecoration: 'none' }}
          >
            เข้าสู่ระบบ
          </Link>
          <Link
            href="/packages"
            className="btn-outline"
            style={{ display: 'block', textAlign: 'center', textDecoration: 'none' }}
          >
            สำรวจแพ็กเกจ
          </Link>
        </div>
      </div>
    </div>
  )
}

/** Logged-in but owns no packages. */
function NoPackagesEmptyState() {
  return (
    <div
      className="min-h-screen"
      style={{
        backgroundColor: 'var(--bg-primary)',
        color: 'var(--text-primary)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '40px 20px',
      }}
    >
      <div
        className="card"
        style={{
          maxWidth: '460px',
          width: '100%',
          padding: '48px 32px',
          textAlign: 'center',
        }}
      >
        <div
          style={{
            width: '72px',
            height: '72px',
            borderRadius: '50%',
            background: 'var(--gold-tint, rgba(212,175,55,0.1))',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: 'var(--gold)',
            margin: '0 auto 24px',
          }}
        >
          <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <rect width="18" height="18" x="3" y="3" rx="2" />
            <path d="M12 8v8" />
            <path d="m8 12 4 4 4-4" />
          </svg>
        </div>

        <h1
          className="font-display"
          style={{ fontSize: '26px', marginBottom: '12px', color: 'var(--text-primary)' }}
        >
          คุณยังไม่มีชุดข้อสอบ
        </h1>
        <p style={{ color: 'var(--text-muted)', fontSize: '14.5px', lineHeight: 1.7, marginBottom: '28px' }}>
          เลือกชุดข้อสอบที่สนใจเพื่อเริ่มเรียนกับ Sobdai
        </p>

        <Link
          href="/packages"
          className="btn-primary"
          style={{ display: 'block', textAlign: 'center', textDecoration: 'none' }}
        >
          ดูแพ็กเกจทั้งหมด
        </Link>
      </div>
    </div>
  )
}
