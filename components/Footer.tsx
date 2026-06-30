'use client'

import Link from 'next/link'
import { legalConfig } from '@/lib/legal'

export default function Footer() {
  return (
    <footer className="bg-[#0F0B07] border-t border-[rgba(212,175,55,0.1)] py-12 mt-auto">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex flex-col md:flex-row justify-between items-center gap-6">
          
          <div className="flex flex-col items-center md:items-start">
            <div className="text-xl font-display font-bold text-[#D4AF37] mb-2 tracking-wide">
              {legalConfig.companyName}
            </div>
            <p className="text-[#A1866B] text-sm">
              &copy; {new Date().getFullYear()} {legalConfig.companyName}. สงวนลิขสิทธิ์
            </p>
          </div>

          <div className="flex flex-wrap justify-center gap-x-8 gap-y-4 text-sm font-medium text-[#A1866B]">
            <Link href="/terms" className="hover:text-[#F5E9D6] transition-colors">
              เงื่อนไขการให้บริการ
            </Link>
            <Link href="/privacy" className="hover:text-[#F5E9D6] transition-colors">
              นโยบายความเป็นส่วนตัว
            </Link>
            <Link href="/cookies" className="hover:text-[#F5E9D6] transition-colors">
              นโยบายคุกกี้
            </Link>
            <Link href="/#about" className="hover:text-[#F5E9D6] transition-colors">
              เกี่ยวกับเรา
            </Link>
            <a href={`mailto:${legalConfig.supportEmail}`} className="hover:text-[#F5E9D6] transition-colors">
              ติดต่อเรา
            </a>
          </div>
          
        </div>
      </div>
    </footer>
  )
}
