import Link from 'next/link'

export type PackagePhase = 'all' | 'phak-k' | 'phak-khor'

interface PackagePhaseTabsProps {
  activePhase?: PackagePhase
  showAllTab?: boolean
  className?: string
}

export default function PackagePhaseTabs({
  activePhase,
  showAllTab = false,
  className = '',
}: PackagePhaseTabsProps) {
  const tabs = [
    ...(showAllTab
      ? [
          {
            key: 'all' as const,
            label: 'ภาพรวม',
            href: '/packages',
            ariaLabel: 'ดูภาพรวมแพ็กเกจข้อสอบทั้งหมด',
          },
        ]
      : []),
    {
      key: 'phak-k' as const,
      label: 'ภาค ก',
      href: '/packages/phak-k',
      badge: 'ก.พ.',
      ariaLabel: 'แนวข้อสอบภาค ก ก.พ.',
    },
    {
      key: 'phak-khor' as const,
      label: 'ภาค ข',
      href: '/packages/phak-khor',
      badge: 'เฉพาะตำแหน่ง',
      ariaLabel: 'แนวข้อสอบภาค ข ตามตำแหน่งและหน่วยงาน',
    },
  ]

  return (
    <nav
      aria-label="เลือกหมวดหมู่การสอบ ภาค ก / ภาค ข"
      className={`inline-flex items-center p-1.5 rounded-2xl bg-[rgba(255,255,255,0.03)] border border-[rgba(212,175,55,0.18)] backdrop-blur-sm shadow-[0_4px_20px_rgba(0,0,0,0.2)] ${className}`}
    >
      <div className="flex items-center gap-1 sm:gap-2">
        {tabs.map((tab) => {
          const isActive = activePhase === tab.key
          return (
            <Link
              key={tab.key}
              href={tab.href}
              aria-current={isActive ? 'page' : undefined}
              aria-label={tab.ariaLabel}
              className={`relative px-5 py-2.5 sm:px-6 sm:py-2.5 rounded-xl text-sm sm:text-base font-semibold transition-all duration-200 flex items-center gap-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#D4AF37] ${
                isActive
                  ? 'bg-gradient-to-r from-[#D4AF37]/20 to-[#B38F24]/20 text-[#F5E9D6] border border-[#D4AF37]/40 shadow-[0_2px_12px_rgba(212,175,55,0.15)] font-bold'
                  : 'text-[#A1866B] hover:text-[#F5E9D6] hover:bg-[rgba(255,255,255,0.04)] border border-transparent'
              }`}
            >
              <span>{tab.label}</span>
              {tab.badge && (
                <span
                  className={`hidden sm:inline-block text-[11px] px-2 py-0.5 rounded-full font-medium ${
                    isActive
                      ? 'bg-[#D4AF37]/25 text-[#F5E9D6]'
                      : 'bg-[rgba(255,255,255,0.05)] text-[#A1866B]'
                  }`}
                >
                  {tab.badge}
                </span>
              )}
            </Link>
          )
        })}
      </div>
    </nav>
  )
}
