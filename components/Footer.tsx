'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Heart } from 'lucide-react'
import { legalConfig, socialLinks, type SocialLink } from '@/lib/legal'
import { CookieSettingsButton } from '@/components/consent/CookieSettingsButton'
import SupportModal from '@/components/SupportModal'
import type { FooterSettings, SupportConfig } from '@/lib/homepageConfig'

interface FooterProps {
  supportConfig?: SupportConfig
  footerConfig?: FooterSettings
}

/** Minimal outline social icons (lucide-react has no brand icons). */
function SocialIcon({ name, size = 20 }: { name: SocialLink['key']; size?: number }) {
  const common = {
    width: size,
    height: size,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.8,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
  }
  if (name === 'facebook') {
    return (
      <svg {...common}>
        <path d="M18 2h-3a5 5 0 0 0-5 5v3H7v4h3v8h4v-8h3l1-4h-4V7a1 1 0 0 1 1-1h3z" />
      </svg>
    )
  }
  if (name === 'line') {
    return (
      <svg {...common}>
        <path d="M12 3C6.5 3 2 6.6 2 11c0 4 3.5 7.3 8.2 7.9.3.1.7.2.8.4.1.2 0 .8 0 1.1l-.1 1.2c0 .2-.1.5.4.2 2.7-1.5 4.7-3.4 6.1-5.2C19.3 14.7 22 13.1 22 11c0-4.4-4.5-8-10-8z" />
      </svg>
    )
  }
  // tiktok
  return (
    <svg {...common}>
      <path d="M9 12a4 4 0 1 0 4 4V4c1 2 2.5 3.5 5 4" />
    </svg>
  )
}

export default function Footer({ supportConfig, footerConfig }: FooterProps) {
  const [isModalOpen, setIsModalOpen] = useState(false)
  const renderedSocialLinks = footerConfig?.social_links || socialLinks

  return (
    <footer className="bg-[#0F0B07] border-t border-[rgba(212,175,55,0.1)] pt-12 pb-24 lg:pb-12 mt-auto">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-2 gap-8 md:gap-10 lg:grid-cols-4">

          {/* 1. BRAND */}
          <div className="col-span-2 lg:col-span-1 flex flex-col items-start">
            <div className="text-xl font-display font-bold text-[#D4AF37] tracking-wide mb-2">
              {legalConfig.companyName}
            </div>
            <p className="text-[#A1866B] text-xs leading-relaxed mb-3">
              &copy; {new Date().getFullYear()} {legalConfig.companyName}. สงวนลิขสิทธิ์
            </p>

            {/* Footer Donate — secondary outline action */}
            {supportConfig?.enabled && (
              <div className="pt-1">
                <button
                  id="footer-support-button"
                  type="button"
                  aria-haspopup="dialog"
                  aria-expanded={isModalOpen}
                  onClick={() => setIsModalOpen(true)}
                  className="inline-flex items-center gap-1.5 text-xs text-[#A1866B] hover:text-[#D4AF37] border border-[rgba(212,175,55,0.2)] hover:border-[rgba(212,175,55,0.4)] bg-transparent hover:bg-[rgba(212,175,55,0.05)] px-3 py-1.5 rounded-lg transition-colors focus:outline-none focus-visible:ring-1 focus-visible:ring-[#D4AF37]/50"
                >
                  <Heart size={13} className="text-[#A1866B]" />
                  <span>{supportConfig.button_label || 'สนับสนุน Sobdai'}</span>
                </button>
              </div>
            )}
          </div>

          {/* 2. HELP / PRODUCT */}
          <div className="col-span-1 flex flex-col">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-[#D4AF37] mb-3">
              ช่วยเหลือ
            </h3>
            <nav aria-label="ช่วยเหลือและบริการ" className="flex flex-col space-y-2.5 text-sm text-[#A1866B]">
              <Link href="/help" className="hover:text-[#F5E9D6] transition-colors">
                วิธีใช้งาน
              </Link>
              <Link href="/faq" className="hover:text-[#F5E9D6] transition-colors">
                คำถามที่พบบ่อย
              </Link>
              <Link href="/contact" className="hover:text-[#F5E9D6] transition-colors">
                ติดต่อเรา
              </Link>
              <Link href="/about" className="hover:text-[#F5E9D6] transition-colors">
                เกี่ยวกับเรา
              </Link>
            </nav>
          </div>

          {/* 3. LEGAL / SETTINGS */}
          <div className="col-span-1 flex flex-col">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-[#D4AF37] mb-3">
              ข้อกำหนดและนโยบาย
            </h3>
            <nav aria-label="กฎหมายและการตั้งค่า" className="flex flex-col space-y-2.5 text-sm text-[#A1866B]">
              <Link href="/terms" className="hover:text-[#F5E9D6] transition-colors">
                เงื่อนไขการให้บริการ
              </Link>
              <Link href="/privacy" className="hover:text-[#F5E9D6] transition-colors">
                นโยบายความเป็นส่วนตัว
              </Link>
              <Link href="/cookies" className="hover:text-[#F5E9D6] transition-colors">
                นโยบายคุกกี้
              </Link>
              <div className="text-left">
                <CookieSettingsButton />
              </div>
            </nav>
          </div>

          {/* 4. CONNECT */}
          <div className="col-span-2 lg:col-span-1 flex flex-col pt-2 lg:pt-0">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-[#D4AF37] mb-3">
              ติดตามเรา
            </h3>
            <div className="flex flex-wrap items-center gap-x-6 gap-y-2.5 lg:flex-col lg:items-start lg:space-y-2.5 lg:gap-0">
              {renderedSocialLinks.map((social) => {
                if (!social.active) {
                  return (
                    <span
                      key={social.key}
                      aria-disabled="true"
                      className="inline-flex items-center gap-2 text-sm text-[#5a4a3a] cursor-not-allowed"
                    >
                      <SocialIcon name={social.key} size={16} />
                      <span>{social.label}</span>
                    </span>
                  )
                }
                return (
                  <a
                    key={social.key}
                    href={social.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label={`ติดตาม Sobdai บน ${social.label}`}
                    className="inline-flex items-center gap-2 text-sm text-[#A1866B] hover:text-[#F5E9D6] transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[#D4AF37]"
                  >
                    <SocialIcon name={social.key} size={16} />
                    <span>{social.label}</span>
                  </a>
                )
              })}
            </div>
          </div>

        </div>
      </div>

      {/* Reusable SupportModal instance for Footer */}
      {supportConfig?.enabled && (
        <SupportModal
          isOpen={isModalOpen}
          onClose={() => setIsModalOpen(false)}
          title={supportConfig.title}
          description={supportConfig.description}
          qr_image_url={supportConfig.qr_image_url}
          promptpay_name={supportConfig.promptpay_name}
          bank_name={supportConfig.bank_name}
          account_number={supportConfig.account_number}
          footer_message={supportConfig.footer_message}
        />
      )}
    </footer>
  )
}
