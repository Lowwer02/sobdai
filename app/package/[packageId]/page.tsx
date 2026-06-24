import { PACKAGES } from '@/lib/mock_data'
import PackageClient from './PackageClient'

interface PageProps {
  params: Promise<{ packageId: string }>
}

export default async function PackagePage({ params }: PageProps) {
  const { packageId } = await params
  
  // In a real app, we'd fetch from Supabase here
  const pkg = PACKAGES.find(p => p.id === packageId)
  
  if (!pkg) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-on-background mb-4">ไม่พบแพ็กเกจข้อสอบ</h1>
          <a href="/" className="text-primary hover:underline">กลับสู่หน้าแรก</a>
        </div>
      </div>
    )
  }
  
  return <PackageClient pkg={pkg} />
}
