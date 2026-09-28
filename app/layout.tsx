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
import { DEFAULT_OG_IMAGE, SITE_DESCRIPTION, SITE_NAME, SITE_URL, createPageMetadata } from '@/lib/seo'
import { ConsentProvider } from '@/components/consent/ConsentProvider'
import { ConsentManager } from '@/components/consent/ConsentManager'
import { ConsentAnalyticsLoader } from '@/components/consent/ConsentAnalyticsLoader'
import ThemeProvider from '@/components/theme/ThemeProvider'
import { THEME_BOOT_SCRIPT, THEME_COLOR_DARK, THEME_COLOR_LIGHT } from '@/lib/theme'

const sarabun = Sarabun({
  subsets: ['thai', 'latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-sarabun',
  display: 'swap',
  preload: false,
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
}

// Dark + Light media pair: the browser picks the right browser-chrome color
// before JS runs and follows the OS for System users. lib/theme.ts rewrites
// these metas when the user forces a theme different from their OS.
export const viewport: Viewport = {
  themeColor: [
    { media: '(prefers-color-scheme: dark)', color: THEME_COLOR_DARK },
    { media: '(prefers-color-scheme: light)', color: THEME_COLOR_LIGHT },
  ],
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
}

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const homepageSettings = await getHomepageSettings()

  return (
    // Dark is the SSR baseline; suppressHydrationWarning covers the one
    // intentional pre-paint correction (lib/theme.ts THEME_BOOT_SCRIPT) that
    // flips data-theme to light before first paint.
    <html lang="th" data-theme="dark" suppressHydrationWarning className={sarabun.variable}>
      <head>
        {/* Apply a persisted non-dark theme BEFORE first paint (no flash).
            Pattern from the Next.js "preventing flash before hydration" guide. */}
        <script dangerouslySetInnerHTML={{ __html: THEME_BOOT_SCRIPT }} />
        <StructuredData
          data={{
            '@context': 'https://schema.org',
            '@type': 'WebSite',
            '@id': `${SITE_URL}/#website`,
            name: SITE_NAME,
            url: SITE_URL,
            description: SITE_DESCRIPTION,
            inLanguage: 'th-TH',
            image: `${SITE_URL}${DEFAULT_OG_IMAGE}`,
            publisher: {
              '@id': `${SITE_URL}/#organization`,
            },
          }}
        />
      </head>
      <body className={`${sarabun.className} min-h-screen flex flex-col`}>
        <ThemeProvider>
          <ConsentProvider>
            <ConsentAnalyticsLoader gtmId={process.env.NEXT_PUBLIC_GTM_ID} />
            <ConsentManager />
            <ActivityProvider />
            <Navbar supportConfig={homepageSettings.support} />
            <main className="flex-grow">{children}</main>
            <Footer supportConfig={homepageSettings.support} footerConfig={homepageSettings.footer} />
            <FloatingSupport supportConfig={homepageSettings.support} />
            <ToastContainer />
          </ConsentProvider>
        </ThemeProvider>
      </body>
    </html>
  )
}
