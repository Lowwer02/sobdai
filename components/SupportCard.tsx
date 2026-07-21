'use client'

/**
 * Support Sobdai Card — secondary action below Purchase CTA on Package Detail.
 *
 * v1.1: forwards all SupportConfig fields to SupportModal. Visual weight
 * stays subdued so the card never competes with the Purchase CTA above it.
 */

import React, { useState } from 'react'
import { Heart } from 'lucide-react'
import SupportModal from './SupportModal'
import type { SupportConfig } from '@/lib/homepageConfig'

type SupportCardProps = Omit<SupportConfig, 'enabled'>

export default function SupportCard({
  title,
  description,
  button_label,
  qr_image_url,
  promptpay_name,
  bank_name,
  account_number,
  footer_message,
}: SupportCardProps) {
  const [isModalOpen, setIsModalOpen] = useState(false)

  return (
    <>
      <div
        id="support-card"
        className="rounded-[20px] p-5 flex flex-col gap-4 mt-4 transition-colors duration-200 hover:border-[#D4AF37]/20"
        style={{
          backgroundColor: '#1A140E',
          border: '1px solid rgba(255,255,255,0.06)',
        }}
      >
        {/* Header row */}
        <div className="flex items-center gap-2.5">
          <div
            className="w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0"
            style={{
              background: 'rgba(212,175,55,0.08)',
              border: '1px solid rgba(212,175,55,0.15)',
            }}
          >
            <Heart size={15} className="text-[#D4AF37]/70" />
          </div>
          <span className="text-[#F5E9D6] text-[13px] font-semibold">{title}</span>
        </div>

        {/* Description */}
        <p className="text-[#A1866B] text-[12px] leading-relaxed">{description}</p>

        {/* Ghost CTA button */}
        <button
          id="support-card-button"
          type="button"
          onClick={() => setIsModalOpen(true)}
          className="w-full py-2.5 rounded-xl text-[13px] font-semibold text-[#D4AF37] transition-all duration-200"
          style={{
            background: 'rgba(212,175,55,0.07)',
            border: '1px solid rgba(212,175,55,0.2)',
          }}
          onMouseEnter={e => {
            ;(e.currentTarget as HTMLButtonElement).style.background = 'rgba(212,175,55,0.12)'
            ;(e.currentTarget as HTMLButtonElement).style.borderColor = 'rgba(212,175,55,0.35)'
          }}
          onMouseLeave={e => {
            ;(e.currentTarget as HTMLButtonElement).style.background = 'rgba(212,175,55,0.07)'
            ;(e.currentTarget as HTMLButtonElement).style.borderColor = 'rgba(212,175,55,0.2)'
          }}
        >
          {button_label}
        </button>
      </div>

      <SupportModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title={title}
        description={description}
        qr_image_url={qr_image_url}
        promptpay_name={promptpay_name}
        bank_name={bank_name}
        account_number={account_number}
        footer_message={footer_message}
      />
    </>
  )
}
