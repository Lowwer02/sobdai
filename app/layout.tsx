import type { Metadata } from 'next'
import { Sarabun } from 'next/font/google'
import './globals.css'
import Navbar from '@/components/Navbar'
import ToastContainer from '@/components/admin/ToastContainer'
import Footer from '@/components/Footer'
import { getHomepageSettings } from '@/lib/homepageConfig'

const sarabun = Sarabun({
  subsets: ['thai', 'latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-sarabun',
  display: 'swap',
})

export const metadata: Metadata = {
  title: 'สอบได้ — เตรียมสอบข้าราชการออนไลน์',
  description: 'ระบบข้อสอบออนไลน์เตรียมสอบข้าราชการ ฝึกทำข้อสอบทีละข้อ มีคำใบ้และเฉลยละเอียด ครบทุกกรมทุกตำแหน่ง',
  keywords: ['สอบข้าราชการ', 'ข้อสอบราชการ', 'เตรียมสอบ', 'ก.พ.', 'ข้อสอบออนไลน์'],
  openGraph: {
    title: 'สอบได้ — เตรียมสอบข้าราชการออนไลน์',
    description: 'ฝึกทำข้อสอบทีละข้อ มีคำใบ้และเฉลยละเอียด',
    locale: 'th_TH',
    type: 'website',
  },
}

export const viewport = {
  themeColor: '#0f0b08',
  width: 'device-width',
  initialScale: 1,
}

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const homepageSettings = await getHomepageSettings()

  return (
    <html lang="th" className={sarabun.variable}>
      <head>
        <link rel="preload" href="/fonts/supermarket.woff2" as="font" type="font/woff2" crossOrigin="anonymous" />
      </head>
      <body className={`${sarabun.className} min-h-screen flex flex-col`}>
        <Navbar />
        <main className="flex-grow">{children}</main>
        <Footer supportConfig={homepageSettings.support} />
        <ToastContainer />
      </body>
    </html>
  )
}

