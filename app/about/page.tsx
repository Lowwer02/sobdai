import fs from 'fs'
import path from 'path'
import { Metadata } from 'next'
import { LEGAL } from '@/lib/legal'
import LegalLayout from '@/components/legal/LegalLayout'
import { createPageMetadata } from '@/lib/seo'

export const metadata: Metadata = createPageMetadata({
  title: `เกี่ยวกับ Sobdai | ${LEGAL.companyName}`,
  description: 'เรียนรู้เพิ่มเติมเกี่ยวกับ Sobdai วิสัยทัศน์ พันธกิจ และบริการของเรา',
  path: '/about',
})

export default async function AboutPage() {
  const filePath = path.join(process.cwd(), 'content', 'legal', 'about.md')
  const content = fs.readFileSync(filePath, 'utf8')

  return (
    <LegalLayout 
      title="เกี่ยวกับ Sobdai"
      version={LEGAL.aboutVersion}
      content={content}
    />
  )
}
