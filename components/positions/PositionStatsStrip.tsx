import styles from '@/app/positions/[slug]/positions.module.css'

interface PositionStatsStripProps {
  organizationsCount: number
  packagesCount: number
  newsCount: number
}

interface StatItem {
  value: number | null
  label: string
  href: string
  actionLabel?: string
}

export default function PositionStatsStrip({
  organizationsCount,
  packagesCount,
  newsCount,
}: PositionStatsStripProps) {
  const stats: StatItem[] = [
    {
      value: organizationsCount,
      label: 'หน่วยงานที่เกี่ยวข้อง',
      href: '#agencies',
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
      value: null,
      label: 'บทความแนะนำ',
      href: '#articles',
      actionLabel: 'ดูเนื้อหา',
    },
  ]

  return (
    <section aria-labelledby="position-stats-heading" className={styles.statsSection}>
      <h2 id="position-stats-heading" className={styles.srOnly}>สรุปความเชื่อมโยง</h2>
      <div className={styles.statsGrid}>
        {stats.map((stat) => (
          <a key={stat.label} href={stat.href} className={styles.statCard}>
            {stat.value !== null ? (
              <span className={styles.statValue}>{stat.value}</span>
            ) : (
              <span className={styles.statAction}>{stat.actionLabel}</span>
            )}
            <span className={styles.statLabel}>{stat.label}</span>
            <span className={styles.statArrow} aria-hidden="true">↗</span>
          </a>
        ))}
      </div>
    </section>
  )
}
