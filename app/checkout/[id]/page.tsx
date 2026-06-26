import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { notFound, redirect } from 'next/navigation'
import CheckoutClient from './CheckoutClient'
import Link from 'next/link'

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  
  const cookieStore = await cookies()
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll() { return cookieStore.getAll() } } }
  )

  const { data: pkg } = await supabase
    .from('packages')
    .select('name')
    .eq('id', id)
    .single()

  if (!pkg) return { title: 'Not Found | Sobdai' }

  return {
    title: `สั่งซื้อ: ${pkg.name} | Sobdai`,
    description: `ดำเนินการสั่งซื้อแพ็กเกจ ${pkg.name}`
  }
}

export default async function CheckoutPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  
  const cookieStore = await cookies()
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll() { return cookieStore.getAll() } } }
  )

  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return (
      <div className="min-h-screen bg-[#0F0B07] flex items-center justify-center p-4">
        <div className="bg-[#1A140E] border border-[rgba(212,175,55,0.2)] p-8 rounded-2xl max-w-md w-full text-center">
          <h2 className="text-xl font-bold text-[#F5E9D6] mb-3">เข้าสู่ระบบก่อนสั่งซื้อ</h2>
          <p className="text-[#A1866B] mb-6 text-sm">กรุณาเข้าสู่ระบบด้วยบัญชีของคุณเพื่อดำเนินการสั่งซื้อและรับสิทธิ์เข้าถึงเนื้อหา</p>
          <Link href={`/login?redirect=/checkout/${id}`} className="block w-full bg-[#D4AF37] hover:bg-[#F1D17A] text-[#1A140E] font-bold py-3 rounded-xl transition-colors">
            เข้าสู่ระบบ
          </Link>
        </div>
      </div>
    )
  }

  // Fetch package details
  const { data: pkg, error } = await supabase
    .from('packages')
    .select(`
      id,
      name,
      slug,
      current_price,
      original_price,
      positions(name),
      organizations(name, logo_url)
    `)
    .eq('id', id)
    .single()

  if (error || !pkg) return notFound()

  // Prevent duplicate purchase
  const { data: existingOrder } = await supabase
    .from('orders')
    .select('id')
    .eq('user_id', user.id)
    .eq('package_id', id)
    .eq('status', 'completed')
    .maybeSingle()

  if (existingOrder) {
    redirect(`/package/${pkg.slug}`)
  }

  return <CheckoutClient pkg={pkg} userEmail={user.email || ''} />
}
