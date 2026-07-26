import type { Metadata, Viewport } from 'next'
import { Sarabun } from 'next/font/google'
import './globals.css'
import Navbar from '@/components/Navbar'
import ToastContainer from '@/components/admin/ToastContainer'
import Footer from '@/components/Footer'
import FloatingSupport from '@/components/FloatingSupport'
import ActivityProvider from '@/components/ActivityProvider'
import { getHomepageSettings } from '@/lib/homepageConfig'
import StructuredData from '@/components/StructuredData'
import { DEFAULT_OG_IMAGE, SITE_DESCRIPTION, SITE_NAME, SITE_URL, THEME_COLOR, createPageMetadata } from '@/lib/seo'

const sarabun = Sarabun({
  subsets: ['thai', 'latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-sarabun',
  display: 'swap',
})

export const metadata: Metadata = {
  ...createPageMetadata({
    title: 'สอบได้ — เตรียมสอบข้าราชการออนไลน์',
    description: SITE_DESCRIPTION,
    path: '/',
  }),
  metadataBase: new URL(SITE_URL),
  applicationName: SITE_NAME,
  creator: SITE_NAME,
  publisher: SITE_NAME,
  keywords: ['สอบข้าราชการ', 'ข้อสอบราชการ', 'เตรียมสอบ', 'ก.พ.', 'ข้อสอบออนไลน์'],
  manifest: '/manifest.webmanifest',
  verification: {
    google: process.env.NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION || 'google-site-verification-placeholder',
  },
  icons: {
    icon: [{ url: '/icon.png', type: 'image/png' }],
    apple: [{ url: '/apple-icon.png', type: 'image/png' }],
  },
}

export const viewport: Viewport = {
  themeColor: THEME_COLOR,
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
        <StructuredData
          data={{
            '@context': 'https://schema.org',
            '@type': 'WebSite',
            name: SITE_NAME,
            url: SITE_URL,
            description: SITE_DESCRIPTION,
            inLanguage: 'th-TH',
            image: `${SITE_URL}${DEFAULT_OG_IMAGE}`,
          }}
        />
      </head>
      <body className={`${sarabun.className} min-h-screen flex flex-col`}>
        <ActivityProvider />
        <Navbar />
        <main className="flex-grow">{children}</main>
        <Footer supportConfig={homepageSettings.support} footerConfig={homepageSettings.footer} />
        <FloatingSupport supportConfig={homepageSettings.support} />
        <ToastContainer />
      </body>
    </html>
  )
}
