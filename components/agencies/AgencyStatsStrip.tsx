import { ArrowUpRight } from 'lucide-react'
import styles from '@/app/positions/[slug]/positions.module.css'

interface AgencyStatsStripProps {
  positionsCount: number
  packagesCount: number
  newsCount: number
  articleCount: number
}

interface StatItem {
  value: number
  label: string
  href: string
}

export default function AgencyStatsStrip({
  positionsCount,
  packagesCount,
  newsCount,
  articleCount,
}: AgencyStatsStripProps) {
  const stats: StatItem[] = [
    {
      value: positionsCount,
      label: 'ตำแหน่งที่เกี่ยวข้อง',
      href: '#positions',
    },
    {
      value: packagesCount,
      label: 'แพ็กเกจเตรียมสอบ',
      href: '#packages',
    },
    {
      value: newsCount,
      label: 'ข่าวที่เกี่ยวข้อง',
      href: '#news',
    },
    {
      value: articleCount,
      label: 'บทความที่เกี่ยวข้อง',
      href: '#articles',
    },
  ]

  return (
    <section aria-labelledby="agency-stats-heading" className={styles.statsSection}>
      <h2 id="agency-stats-heading" className={styles.srOnly}>สรุปความเชื่อมโยง</h2>
      <div className={styles.statsGrid}>
        {stats.map((stat) => (
          <a key={stat.label} href={stat.href} className={styles.statCard}>
            <span className={styles.statValue}>{stat.value}</span>
            <span className={styles.statLabel}>{stat.label}</span>
            <ArrowUpRight className={styles.statArrow} size={16} strokeWidth={1.75} aria-hidden="true" />
          </a>
        ))}
      </div>
    </section>
  )
}
