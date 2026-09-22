import Link from 'next/link'
import Image from 'next/image'
import { ArrowUpRight, BookOpen } from 'lucide-react'
import type { PublicAgencyPackage } from '@/lib/agencies-public'
import styles from '@/app/positions/[slug]/positions.module.css'

interface AgencyPackagesSectionProps {
  items: readonly PublicAgencyPackage[]
}

function isFinitePrice(value: number | null): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

function formatPrice(value: number | null): string {
  if (!isFinitePrice(value)) return 'ยังไม่ระบุราคา'
  if (value === 0) return 'ฟรี'
  return `฿${value.toLocaleString('th-TH')}`
}

function packageLogoUrl(item: PublicAgencyPackage): string | null {
  const value = item.logo_url?.trim()
  return value || null
}

export default function AgencyPackagesSection({ items }: AgencyPackagesSectionProps) {
  if (items.length === 0) return null

  return (
    <section
      id="packages"
      aria-labelledby="agency-packages-heading"
      className={`${styles.relatedSection} ${styles.packagesSection} ${styles.anchorSection}`}
    >
      <header className={styles.relatedSectionHeader}>
        <p className={styles.sectionEyebrow}>EXAM PREPARATION</p>
        <h2 id="agency-packages-heading" className={styles.relatedSectionHeading}>
          เตรียมสอบเข้าหน่วยงานนี้
        </h2>
        <p className={styles.relatedSectionDescription}>
          แพ็กเกจข้อสอบสำหรับการสอบเข้าทำงานในหน่วยงานนี้
        </p>
      </header>

      <ul className={styles.packageGrid}>
        {items.map((item) => {
          const logoUrl = packageLogoUrl(item)
          const showOriginalPrice = (
            isFinitePrice(item.current_price) &&
            isFinitePrice(item.original_price) &&
            item.original_price > item.current_price
          )

          return (
            <li key={item.id} className={styles.packageCardItem}>
              <Link href={`/package/${encodeURIComponent(item.slug)}`} className={styles.packageCard}>
                <span className={styles.packageCardTop}>
                  <span className={`${styles.packageIconWrap} ${logoUrl ? styles.packageLogoFrame : ''}`}>
                    {logoUrl ? (
                      <Image
                        src={logoUrl}
                        alt={`โลโก้แพ็กเกจ ${item.name}`}
                        width={56}
                        height={56}
                        className={styles.packageLogo}
                        unoptimized
                      />
                    ) : (
                      <BookOpen className={styles.packageIcon} size={20} strokeWidth={1.5} aria-hidden="true" />
                    )}
                  </span>
                  {item.exam_year && <span className={styles.packageYear}>ปีสอบ {item.exam_year}</span>}
                </span>
                <span className={styles.packageName}>{item.name}</span>
                {item.description && <span className={styles.packageDescription}>{item.description}</span>}
                <span className={styles.packageCardFooter}>
                  <span className={styles.packagePriceGroup}>
                    <span className={styles.packagePriceLabel}>ราคาแพ็กเกจ</span>
                    <span className={styles.packagePrice}>{formatPrice(item.current_price)}</span>
                    {showOriginalPrice && (
                      <span className={styles.packageOriginalPrice}>
                        {formatPrice(item.original_price)}
                      </span>
                    )}
                  </span>
                  <span className={styles.packageCta}>
                    ดูรายละเอียด
                    <ArrowUpRight size={15} aria-hidden="true" />
                  </span>
                </span>
              </Link>
            </li>
          )
        })}
      </ul>
    </section>
  )
}
