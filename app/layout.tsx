import type { Metadata } from 'next'
import { Sarabun } from 'next/font/google'
import './globals.css'
import Navbar from '@/components/Navbar'
import ToastContainer from '@/components/admin/ToastContainer'
import Footer from '@/components/Footer'

const sarabun = Sarabun({
  subsets: ['thai', 'latin'],
  // Only ship the weights actually used in the UI. Audited usage:
  // font-normal(400), font-medium(500), font-semibold(600), font-bold(700).
  // '300' (font-light) was loaded but never referenced — dropped to cut
  // the Thai-subset font payload (~20% smaller).
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

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="th" className={sarabun.variable}>
      <head>
        {/* Preload the Supermarket display font (used on headings/hero) so it
            doesn't block first meaningful paint. next/font handles Sarabun
            automatically, but Supermarket is loaded via @font-face in CSS. */}
        <link rel="preload" href="/fonts/supermarket.woff2" as="font" type="font/woff2" crossOrigin="anonymous" />
      </head>
      <body className={`${sarabun.className} min-h-screen flex flex-col`}>
        <Navbar />
        <main className="flex-grow">{children}</main>
        <Footer />
        <ToastContainer />
      </body>
    </html>
  )
}
