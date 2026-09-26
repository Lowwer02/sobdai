import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import test from 'node:test'

const detailRoute = readFileSync(fileURLToPath(new URL('./[slug]/page.tsx', import.meta.url)), 'utf8')
const hubRoute = readFileSync(fileURLToPath(new URL('./page.tsx', import.meta.url)), 'utf8')
const sitemapRoute = readFileSync(fileURLToPath(new URL('../sitemap.ts', import.meta.url)), 'utf8')
const agencyHero = readFileSync(fileURLToPath(new URL('../../components/agencies/AgencyHero.tsx', import.meta.url)), 'utf8')
const agencyStats = readFileSync(fileURLToPath(new URL('../../components/agencies/AgencyStatsStrip.tsx', import.meta.url)), 'utf8')
const agencyPositions = readFileSync(fileURLToPath(new URL('../../components/agencies/AgencyPositionsSection.tsx', import.meta.url)), 'utf8')
const agencyEditorial = readFileSync(fileURLToPath(new URL('../../components/agencies/AgencyEditorialSection.tsx', import.meta.url)), 'utf8')
const agencyNews = readFileSync(fileURLToPath(new URL('../../components/agencies/AgencyNewsSection.tsx', import.meta.url)), 'utf8')
const agencyPackages = readFileSync(fileURLToPath(new URL('../../components/agencies/AgencyPackagesSection.tsx', import.meta.url)), 'utf8')
const agencyArticles = readFileSync(fileURLToPath(new URL('../../components/agencies/AgencyArticlesSection.tsx', import.meta.url)), 'utf8')
const agencySources = readFileSync(fileURLToPath(new URL('../../components/agencies/AgencySourcesSection.tsx', import.meta.url)), 'utf8')
const agenciesLoader = readFileSync(fileURLToPath(new URL('../../lib/agencies-public.ts', import.meta.url)), 'utf8')
const agencyUiSource = [
  detailRoute,
  hubRoute,
  agencyHero,
  agencyStats,
  agencyPositions,
  agencyEditorial,
  agencyNews,
  agencyPackages,
  agencyArticles,
  agencySources,
].join('\n')

test('unknown Agency detail slugs use notFound and published rows receive explicit metadata', () => {
  assert.match(detailRoute, /if \(!page\) notFound\(\)/)
  assert.match(detailRoute, /export async function generateMetadata/)
  assert.match(detailRoute, /buildAgencySeoContract/)
  assert.match(detailRoute, /createPageMetadata/)
  assert.match(detailRoute, /noindex: seo\.noindex/)
})

test('Agency detail emits WebPage + GovernmentOrganization structured data only when index-ready', () => {
  assert.match(detailRoute, /'@type': 'WebPage'/)
  assert.match(detailRoute, /'@type': 'GovernmentOrganization'/)
  assert.match(detailRoute, /page\.indexReady && page\.profile\.overview_markdown/)
  assert.match(detailRoute, /alternateName/)
  assert.match(detailRoute, /sameAs/)
})

test('Agency detail keeps the canonical breadcrumb trail and shared stylesheet', () => {
  assert.match(detailRoute, /buildBreadcrumbJsonLd/)
  assert.match(detailRoute, /name: 'หน่วยงานราชการ', path: '\/agencies'/)
  assert.match(detailRoute, /href="\/agencies"/)
  assert.match(detailRoute, /positions\.module\.css/)
})

test('Agency hub renders only the shared index-qualified dataset', () => {
  assert.doesNotMatch(hubRoute, /^['"]use client['"]/m)
  assert.match(hubRoute, /getIndexableAgencyHubEntries/)
  assert.match(hubRoute, /href=\{`\/agencies\/\$\{encodeURIComponent\(page\.profile\.slug\)\}`/)
  assert.match(hubRoute, /<h1[^>]*>\s*หน่วยงานราชการ/)
  assert.equal((hubRoute.match(/<h1\b/g) || []).length, 1)
})

test('Agency hub keeps loader-backed summary rows and a neutral zero-entity state', () => {
  assert.match(hubRoute, /\{pages\.length\} หน่วยงานพร้อมสำรวจ/)
  assert.match(hubRoute, /pages\.flatMap\(\(page\) => page\.operationalPositions\.map\(\(position\) => position\.id\)\)/)
  assert.match(hubRoute, /pages\.flatMap\(\(page\) => page\.packages\.map\(\(item\) => item\.id\)\)/)
  assert.match(hubRoute, /buildAgencySeoDescription/)
  assert.match(hubRoute, /ขณะนี้ยังไม่มีหน่วยงานที่ผ่านเกณฑ์เผยแพร่สู่ดัชนีสาธารณะ/)
  assert.match(hubRoute, /AGENCY_EXPLANATIONS/)
})

test('Agency hub metadata is noindex until an index-ready agency exists', () => {
  assert.match(hubRoute, /noindex: pages\.length === 0/)
})

test('sitemap integration reuses the agency index-readiness gate', () => {
  assert.match(sitemapRoute, /getIndexableAgencyHubEntries/)
  assert.match(sitemapRoute, /getAgencySitemapSlugs/)
  assert.match(sitemapRoute, /absoluteUrl\('\/agencies'\)/)
  assert.match(sitemapRoute, /absoluteUrl\(`\/agencies\/\$\{encodeURIComponent\(slug\)\}`\)/)
})

test('agency UI never renders an unsafe source link', () => {
  assert.match(agencySources, /target="_blank"/)
  assert.match(agencySources, /rel="noreferrer"/)
  assert.doesNotMatch(agencyUiSource, /dangerouslySetInnerHTML/)
})

test('agency sections degrade silently when a dataset is empty', () => {
  assert.match(agencyPositions, /if \(cards\.length === 0\) return null/)
  for (const source of [agencyNews, agencyPackages, agencyArticles, agencySources]) {
    assert.match(source, /if \([a-zA-Z]+\.length === 0\) return null/)
  }
})

// ─── Agency V2: presentation fixes from the first real Production profile ──

test('V2: no OPEN POSITIONS eyebrow and no open-recruitment wording anywhere', () => {
  assert.doesNotMatch(agencyUiSource, /OPEN POSITIONS/)
  assert.doesNotMatch(agencyUiSource, /ตำแหน่งที่เปิดรับ/)
  assert.doesNotMatch(agencyUiSource, /Open Positions/i)
})

test('V2: related-positions terminology is used consistently on hub and detail', () => {
  assert.match(agencyPositions, /ตำแหน่งที่เกี่ยวข้อง/)
  assert.match(agencyStats, /label: 'ตำแหน่งที่เกี่ยวข้อง'/)
  assert.match(hubRoute, /ตำแหน่งที่เกี่ยวข้อง/)
  assert.match(hubRoute, /\{page\.operationalPositions\.length\} ตำแหน่งที่เกี่ยวข้อง/)
  // The section subtitle must not imply a complete staffing listing.
  assert.match(agencyPositions, /ตำแหน่งที่ Sobdai มีข้อมูลหรือชุดเตรียมสอบที่เกี่ยวข้องกับหน่วยงานนี้/)
})

test('V2: the position section renders the shared meaningful dataset with per-card CTAs', () => {
  assert.match(agencyPositions, /resolveAgencyPositionCards\(positions\)/)
  assert.match(agencyPositions, /cards\.map\(\(card\) =>/)
  assert.doesNotMatch(agencyPositions, /canonicalPositions/, 'the section must not render only mapped entities')
  // Informational-only cards still render (no fake CTA), linked cards use the
  // resolved href — never a fabricated /positions URL for an unmapped row.
  assert.match(agencyPositions, /if \(!card\.cta\)/)
  assert.match(agencyPositions, /href=\{card\.cta\.href\}/)
  assert.doesNotMatch(agencyPositions, /href=\{`\/positions\/\$\{encodeURIComponent\(position\.slug\)\}`/)
})

test('V2: the position stat and the card list come from one dataset', () => {
  assert.match(detailRoute, /positionsCount=\{page\.operationalPositions\.length\}/)
  assert.match(detailRoute, /positions=\{page\.operationalPositions\}/)
  assert.match(agencyStats, /value: positionsCount/)
})

test('V2: the article stat is numeric from the derived count', () => {
  assert.match(agencyStats, /articleCount: number/)
  assert.match(agencyStats, /label: 'บทความที่เกี่ยวข้อง'/)
  assert.match(detailRoute, /articleCount=\{page\.articleCount\}/)
  assert.doesNotMatch(agencyStats, /statAction/)
  assert.doesNotMatch(agencyStats, /ดูเนื้อหา/)
})

test('V2: the loader keeps placeholder/GEN positions out of the shared dataset', () => {
  assert.match(agenciesLoader, /isOperationalPositionPlaceholder/)
  assert.match(agenciesLoader, /const meaningfulPositions = orgPositions\.filter\(/)
})
