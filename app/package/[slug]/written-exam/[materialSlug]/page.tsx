import type { Metadata } from 'next'
import Link from 'next/link'
import { AlertTriangle, ArrowLeft, Lock, LogIn } from 'lucide-react'
import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { createPageMetadata } from '@/lib/seo'
import {
  discoverPublishedWrittenExamMaterials,
  getWrittenExamPackageEntitlement,
  readPublishedWrittenExamForLearner,
  selectWrittenExamQuestionIndex,
} from '@/lib/writtenExamLearner'
import WrittenExamReader from './WrittenExamReader'

type PageProps = {
  params: Promise<{ slug: string; materialSlug: string }>
  searchParams: Promise<{ question?: string | string[] }>
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug, materialSlug } = await params
  return createPageMetadata({
    title: 'Written Exam | Sobdai',
    description: 'อ่านและท่องจำแนวคำตอบข้อสอบอัตนัย ภาค ข',
    path: `/package/${slug}/written-exam/${materialSlug}`,
    noindex: true,
  })
}

export default async function WrittenExamPage({ params, searchParams }: PageProps) {
  const { slug, materialSlug } = await params
  const { question } = await searchParams
  const supabase = await createClient()

  const [packageResult, userResult, discoveryResult] = await Promise.all([
    supabase
      .from('packages')
      .select('id, name, slug, is_published')
      .eq('slug', slug)
      .single(),
    supabase.auth.getUser(),
    discoverPublishedWrittenExamMaterials(supabase, slug).then(
      (materials) => ({ status: 'success' as const, materials }),
      (error) => ({ status: 'error' as const, error }),
    ),
  ])

  const pkg = packageResult.data
  if (packageResult.error || !pkg || pkg.is_published !== true) notFound()

  if (discoveryResult.status === 'error') {
    return <WrittenExamState kind="error" packageSlug={slug} packageId={pkg.id} packageName={pkg.name} />
  }

  const discovery = discoveryResult.materials.find((item) => item.materialSlug === materialSlug)
  if (!discovery) {
    return <WrittenExamState kind="no-content" packageSlug={slug} packageId={pkg.id} packageName={pkg.name} />
  }

  const user = userResult.data.user
  if (!user) {
    return <WrittenExamState kind="login" packageSlug={slug} packageId={pkg.id} materialSlug={materialSlug} packageName={pkg.name} />
  }

  const [contentResult, entitlement] = await Promise.all([
    readPublishedWrittenExamForLearner(supabase, slug, materialSlug),
    getWrittenExamPackageEntitlement(supabase, user.id, pkg.id),
  ])

  // The 082 RPC remains the authority. The local access result only chooses a
  // useful UX state after the RPC has been called; it does not grant content.
  if (entitlement === 'error') {
    return <WrittenExamState kind="error" packageSlug={slug} packageId={pkg.id} packageName={pkg.name} />
  }
  if (entitlement === 'not-entitled') {
    return <WrittenExamState kind="locked" packageSlug={slug} packageId={pkg.id} packageName={pkg.name} />
  }
  if (contentResult.status === 'error') {
    return <WrittenExamState kind="error" packageSlug={slug} packageId={pkg.id} packageName={pkg.name} />
  }

  const material = contentResult.material
  if (
    !material
    || material.questions.length === 0
    || material.packageSlug !== slug
    || material.materialSlug !== materialSlug
  ) {
    return <WrittenExamState kind="no-content" packageSlug={slug} packageId={pkg.id} packageName={pkg.name} />
  }

  const initialQuestionIndex = selectWrittenExamQuestionIndex(question, material.questions)

  return (
    <WrittenExamReader
      key={`${material.materialSlug}:${material.revisionNumber}`}
      packageName={pkg.name}
      packageSlug={slug}
      material={material}
      initialQuestionIndex={initialQuestionIndex}
      discoveryQuestionCount={discovery.questionCount}
    />
  )
}

function WrittenExamState({
  kind,
  packageSlug,
  packageId,
  materialSlug,
  packageName,
}: {
  kind: 'login' | 'locked' | 'no-content' | 'error'
  packageSlug: string
  packageId: string
  materialSlug?: string
  packageName: string
}) {
  const redirectPath = materialSlug
    ? `/package/${packageSlug}/written-exam/${materialSlug}`
    : `/package/${packageSlug}`
  const isLogin = kind === 'login'
  const isLocked = kind === 'locked'
  const isError = kind === 'error'

  return (
    <div className="min-h-screen bg-[#0F0B07] px-4 py-16 text-[#F5E9D6]">
      <div className="mx-auto flex min-h-[55vh] max-w-md items-center justify-center">
        <div className="w-full rounded-2xl border border-[rgba(212,175,55,0.2)] bg-[#1A140E] p-7 text-center shadow-2xl sm:p-8">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-[#D4AF37]/10 text-[#D4AF37]">
            {isLogin ? <LogIn size={30} aria-hidden="true" /> : isLocked ? <Lock size={30} aria-hidden="true" /> : <AlertTriangle size={30} aria-hidden="true" />}
          </div>
          <h1 className="mt-6 text-2xl font-bold font-display text-[#F5E9D6]">
            {isLogin
              ? 'เข้าสู่ระบบเพื่ออ่าน Written Exam'
              : isLocked
                ? 'เนื้อหาสงวนสิทธิ์เฉพาะผู้ซื้อ'
                : kind === 'no-content'
                  ? 'ยังไม่มีเนื้อหา Written Exam'
                  : 'ไม่สามารถโหลด Written Exam ได้'}
          </h1>
          <p className="mt-3 text-sm leading-6 text-[#A1866B]">
            {isLogin
              ? 'กรุณาเข้าสู่ระบบก่อน เพื่อตรวจสอบสิทธิ์การเข้าถึงเนื้อหานี้'
              : isLocked
                ? `แพ็กเกจ ${packageName}`
                : kind === 'no-content'
                  ? 'เนื้อหาอาจยังไม่พร้อมใช้งานในขณะนี้'
                  : 'เกิดข้อผิดพลาดชั่วคราว กรุณาลองใหม่อีกครั้ง'}
          </p>
          <div className="mt-8 space-y-3">
            {isLogin && (
              <Link
                href={`/login?redirect=${encodeURIComponent(redirectPath)}`}
                className="block w-full rounded-xl bg-[#D4AF37] py-3 font-bold text-[#1A140E] transition-colors hover:bg-[#F1D17A]"
              >
                เข้าสู่ระบบ
              </Link>
            )}
            {isLocked && (
              <Link
                href={`/checkout/${packageId}`}
                className="block w-full rounded-xl bg-[#D4AF37] py-3 font-bold text-[#1A140E] transition-colors hover:bg-[#F1D17A]"
              >
                สั่งซื้อแพ็กเกจ
              </Link>
            )}
            {isError && (
              <Link
                href={redirectPath}
                className="block w-full rounded-xl bg-[#D4AF37] py-3 font-bold text-[#1A140E] transition-colors hover:bg-[#F1D17A]"
              >
                ลองใหม่อีกครั้ง
              </Link>
            )}
            <Link
              href={`/package/${packageSlug}`}
              className="flex w-full items-center justify-center gap-2 rounded-xl border border-[rgba(255,255,255,0.1)] py-3 font-bold text-[#F5E9D6] transition-colors hover:bg-[rgba(255,255,255,0.05)]"
            >
              <ArrowLeft size={16} aria-hidden="true" />
              กลับไปแพ็กเกจ
            </Link>
          </div>
        </div>
      </div>
    </div>
  )
}
