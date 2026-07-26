import fs from 'fs'
import path from 'path'
import { Metadata } from 'next'
import { LEGAL } from '@/lib/legal'
import LegalLayout from '@/components/legal/LegalLayout'
import { createPageMetadata } from '@/lib/seo'

export const metadata: Metadata = createPageMetadata({
  title: `นโยบายคุกกี้ | ${LEGAL.companyName}`,
  description: 'นโยบายการใช้งานคุกกี้ (Cookie Policy)',
  path: '/cookies',
})

export default async function CookiesPage() {
  const filePath = path.join(process.cwd(), 'content', 'legal', 'cookies.md')
  const content = fs.readFileSync(filePath, 'utf8')

  return (
    <LegalLayout 
      title="นโยบายคุกกี้ (Cookie Policy)"
      version={LEGAL.cookiesVersion}
      content={content}
    />
  )
}
