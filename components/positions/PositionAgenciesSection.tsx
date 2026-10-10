import Image from 'next/image'
import Link from 'next/link'
import type {
  PublicPositionOrganization,
  PublicPositionPackage,
} from '@/lib/positions-public'
import styles from '@/app/positions/[slug]/positions.module.css'

interface PositionAgenciesSectionProps {
  organizations: PublicPositionOrganization[]
  packages: PublicPositionPackage[]
  /**
   * Entity Discovery V1: canonical Agency link per organization id, present
   * only for organizations with a published Agency Profile + stable slug.
   * Absent keys keep the plain-text card — never hidden, never fabricated.
   */
  agencyLinksByOrganization?: Record<string, { slug: string; name: string }>
}

// This route-local mapping is intentionally explicit for the one agency whose
// current package data does not include a logo URL.
const localOrganizationLogoUrls: Readonly<Record<string, string>> = {
  กรมการแพทย์: '/images/positions/department-of-medical-services-logo.webp',
}

function BuildingIcon() {
  return (
    <svg viewBox="0 0 24 24" className={styles.agencyIcon} aria-hidden="true">
      <path d="M4 20h16M6.5 20V8.5L12 5l5.5 3.5V20M9 11h1M14 11h1M9 14.5h1M14 14.5h1M10 20v-2.5h4V20" />
    </svg>
  )
}

function hasPublishedPackage(
  organization: PublicPositionOrganization,
  packages: readonly PublicPositionPackage[],
): boolean {
  return packages.some((pkg) => (
    pkg.organization_id === organization.id || pkg.organization?.id === organization.id
  ))
}

function organizationLogoUrl(
  organization: PublicPositionOrganization,
  packages: readonly PublicPositionPackage[],
): string | null {
  const packageWithLogo = packages.find((pkg) => (
    (pkg.organization_id === organization.id || pkg.organization?.id === organization.id) &&
    Boolean(pkg.logo_url?.trim())
  ))
  return packageWithLogo?.logo_url?.trim()
    || localOrganizationLogoUrls[organization.name.trim()]
    || null
}

export default function PositionAgenciesSection({
  organizations,
  packages,
  agencyLinksByOrganization = {},
}: PositionAgenciesSectionProps) {
  if (organizations.length === 0) return null

  return (
    <section
      id="agencies"
      aria-labelledby="position-agencies-heading"
      className={`${styles.agenciesSection} ${styles.anchorSection}`}
    >
      <div className={styles.sectionHeader}>
        <div>
          <p className={styles.sectionEyebrow}>RELATIONSHIP MAP</p>
          <h2 id="position-agencies-heading" className={styles.sectionHeading}>
            สนามสอบและหน่วยงานที่เกี่ยวข้อง
          </h2>
          <p className={styles.sectionDescription}>
            หน่วยงานที่มีตำแหน่งนี้ในระบบ Sobdai
          </p>
        </div>
      </div>

      <ul className={styles.agencyGrid}>
        {organizations.map((organization) => {
          const packageAvailable = hasPublishedPackage(organization, packages)
          const logoUrl = organizationLogoUrl(organization, packages)
          const agencyLink = agencyLinksByOrganization[organization.id]

          return (
            <li key={organization.id} className={styles.agencyCard}>
              <div className={styles.agencyCardTop}>
                <span className={styles.agencyIconWrap}>
                  {logoUrl ? (
                    <Image
                      src={logoUrl}
                      alt={`โลโก้${organization.name}`}
                      width={48}
                      height={48}
                      className={styles.agencyLogo}
                      unoptimized
                    />
                  ) : (
                    <BuildingIcon />
                  )}
                </span>
                {packageAvailable && (
                  <span className={styles.packageBadge}>มีแพ็กเกจเตรียมสอบ</span>
                )}
              </div>
              <h3 className={styles.agencyName}>
                {agencyLink ? (
                  <Link
                    href={`/agencies/${encodeURIComponent(agencyLink.slug)}`}
                    className={styles.agencyNameLink}
                  >
                    {organization.name}
                  </Link>
                ) : (
                  organization.name
                )}
              </h3>
              {organization.short_name && (
                <p className={styles.agencyShortName}>{organization.short_name}</p>
              )}
            </li>
          )
        })}
      </ul>
    </section>
  )
}
