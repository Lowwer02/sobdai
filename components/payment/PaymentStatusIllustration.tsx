'use client'

import Image from 'next/image'
import type { ReactNode } from 'react'
import {
  getCustomerPaymentStateConfig,
  type CustomerPaymentState,
} from '@/lib/payment/customer'

export default function PaymentStatusIllustration({
  state,
  compact = false,
  showCopy = true,
  title,
  description,
  children,
  className = '',
}: {
  state: CustomerPaymentState
  compact?: boolean
  showCopy?: boolean
  title?: string
  description?: string
  children?: ReactNode
  className?: string
}) {
  const config = getCustomerPaymentStateConfig(state)

  return (
    <div
      className={`flex ${compact ? 'flex-row items-center gap-4 text-left' : 'flex-col items-center text-center'} ${className}`}
      role={showCopy ? 'status' : undefined}
      aria-live={showCopy ? 'polite' : undefined}
    >
      <div className={`relative shrink-0 ${compact ? 'h-24 w-24 sm:h-28 sm:w-28' : 'h-40 w-40 sm:h-48 sm:w-48'}`}>
        <Image
          src={config.asset}
          alt={config.alt}
          width={1254}
          height={1254}
          sizes={compact ? '(max-width: 640px) 96px, 112px' : '(max-width: 640px) 160px, 192px'}
          className="h-full w-full object-contain"
        />
      </div>

      {showCopy && (
        <div className={compact ? 'min-w-0' : 'mt-4 max-w-xl'}>
          <h2 className="text-xl font-bold tracking-tight text-foreground sm:text-2xl">{title || config.title}</h2>
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{description || config.description}</p>
          {children}
        </div>
      )}
    </div>
  )
}
