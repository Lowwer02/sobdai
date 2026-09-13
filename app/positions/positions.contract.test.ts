import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import test from 'node:test'

const detailRoute = readFileSync(fileURLToPath(new URL('./[slug]/page.tsx', import.meta.url)), 'utf8')
const hubRoute = readFileSync(fileURLToPath(new URL('./page.tsx', import.meta.url)), 'utf8')
const sitemapRoute = readFileSync(fileURLToPath(new URL('../sitemap.ts', import.meta.url)), 'utf8')
const positionHero = readFileSync(fileURLToPath(new URL('../../components/positions/PositionHero.tsx', import.meta.url)), 'utf8')
const positionStats = readFileSync(fileURLToPath(new URL('../../components/positions/PositionStatsStrip.tsx', import.meta.url)), 'utf8')
const positionAgencies = readFileSync(fileURLToPath(new URL('../../components/positions/PositionAgenciesSection.tsx', import.meta.url)), 'utf8')
const positionEditorial = readFileSync(fileURLToPath(new URL('../../components/positions/PositionEditorialSection.tsx', import.meta.url)), 'utf8')
const positionNews = readFileSync(fileURLToPath(new URL('../../components/positions/PositionNewsSection.tsx', import.meta.url)), 'utf8')
const positionPackages = readFileSync(fileURLToPath(new URL('../../components/positions/PositionPackagesSection.tsx', import.meta.url)), 'utf8')
const positionArticles = readFileSync(fileURLToPath(new URL('../../components/positions/PositionArticlesSection.tsx', import.meta.url)), 'utf8')
const positionSources = readFileSync(fileURLToPath(new URL('../../components/positions/PositionSourcesSection.tsx', import.meta.url)), 'utf8')
const positionStyles = readFileSync(fileURLToPath(new URL('../positions/[slug]/positions.module.css', import.meta.url)), 'utf8')
const summaryMarkdown = readFileSync(fileURLToPath(new URL('../../components/summary/SummaryMarkdown.tsx', import.meta.url)), 'utf8')
const navbar = readFileSync(fileURLToPath(new URL('../../components/Navbar.tsx', import.meta.url)), 'utf8')
const desktopNav = readFileSync(fileURLToPath(new URL('../../components/DesktopNav.tsx', import.meta.url)), 'utf8')
const mobileNav = readFileSync(fileURLToPath(new URL('../../components/MobileNav.tsx', import.meta.url)), 'utf8')
const footer = readFileSync(fileURLToPath(new URL('../../components/Footer.tsx', import.meta.url)), 'utf8')
const positionRouteStart = sitemapRoute.indexOf('async function getPositionRoutes')
const positionRouteEnd = sitemapRoute.indexOf('/**', positionRouteStart)
const positionRoute = sitemapRoute.slice(positionRouteStart, positionRouteEnd)
const positionUiSource = [
  detailRoute,
  positionHero,
  positionStats,
  positionAgencies,
  positionEditorial,
  positionNews,
  positionPackages,
  positionArticles,
  positionSources,
  positionStyles,
].join('\n')

test('unknown Position detail slugs use notFound and published rows receive explicit metadata', () => {
  assert.match(detailRoute, /if \(!page\) notFound\(\)/)
  assert.match(detailRoute, /export async function generateMetadata/)
  assert.match(detailRoute, /buildPositionSeoContract/)
  assert.match(detailRoute, /createPageMetadata/)
  assert.match(detailRoute, /noindex: seo\.noindex/)
})

test('Position hub renders only the shared index-qualified dataset', () => {
  assert.doesNotMatch(hubRoute, /^['"]use client['"]/m)
  assert.match(hubRoute, /getIndexablePositionHubEntries/)
  assert.match(hubRoute, /href=\{`\/positions\/\$\{encodeURIComponent\(page\.entity\.slug\)/)
  assert.match(hubRoute, /<h1[^>]*>\s*ตำแหน่งงานราชการ/)
})

test('Position sitemap uses the same qualification gate and omits synthetic freshness', () => {
  assert.match(sitemapRoute, /getIndexablePositionHubEntries/)
  assert.match(sitemapRoute, /getPositionSitemapSlugs/)
  assert.match(sitemapRoute, /absoluteUrl\('\/positions'\)/)
  assert.match(sitemapRoute, /absoluteUrl\(`\/positions\/\$\{encodeURIComponent\(slug\)\}`\)/)
  assert.doesNotMatch(positionRoute, /lastModified/)
})

test('Position Detail V2 keeps the complete structural surface in one server-rendered route', () => {
  assert.match(detailRoute, /export default async function PositionDetailPage/)
  assert.match(detailRoute, /<PositionHero\b/)
  assert.match(detailRoute, /<PositionStatsStrip\b/)
  assert.match(detailRoute, /<PositionAgenciesSection\b/)
  assert.match(detailRoute, /<PositionEditorialSection\b/)
  assert.match(detailRoute, /<PositionNewsSection\b/)
  assert.match(detailRoute, /<PositionPackagesSection\b/)
  assert.match(detailRoute, /<PositionArticlesSection\b/)
  assert.match(detailRoute, /<PositionSourcesSection\b/)
  assert.match(detailRoute, /href="\/positions"/)
  assert.equal((positionHero.match(/<h1\b/g) || []).length, 1)
  assert.doesNotMatch(detailRoute, /<h1\b/)
  assert.match(positionHero, /<header\b/)
  assert.match(positionStats, /aria-labelledby="position-stats-heading"/)
  assert.match(positionAgencies, /id="agencies"/)
  assert.match(positionEditorial, /id="overview"/)
  assert.match(positionNews, /id="news"/)
  assert.match(positionPackages, /id="packages"/)
  assert.match(positionArticles, /id="articles"/)
  assert.match(positionSources, /id="sources"/)
})

test('Position Detail V2 locks editorial anchors and the opt-in Markdown heading mode', () => {
  assert.match(positionEditorial, /extractEditorialHeadings/)
  assert.match(positionEditorial, /headings\.map\(\(heading, index\)/)
  assert.match(positionEditorial, /href=\{`#\$\{heading\.id\}`\}/)
  assert.match(positionEditorial, /<ol\b/)
  assert.match(positionEditorial, /<SummaryMarkdown content=\{content\} headingMode="positionEditorial" \/>/)
  assert.match(summaryMarkdown, /headingMode\?: 'default' \| 'positionEditorial'/)
  assert.match(summaryMarkdown, /headingMode = 'default'/)
  assert.match(summaryMarkdown, /headingMode !== 'positionEditorial'/)
})

test('Position Detail V2 keeps package logos data-driven with a same-size neutral fallback', () => {
  assert.match(positionPackages, /item\.logo_url/)
  assert.match(positionPackages, /<Image\b/)
  assert.match(positionPackages, /unoptimized/)
  assert.match(positionPackages, /logoUrl \? styles\.packageLogoFrame : ''/)
  assert.match(positionPackages, /<BookOpen[\s\S]*?aria-hidden="true"/)
  assert.match(positionPackages, /styles\.packageIconWrap/)
  assert.match(positionStyles, /\.packageIconWrap\s*\{[\s\S]*?width:\s*3\.25rem;[\s\S]*?height:\s*3\.25rem;/)
  assert.match(positionStyles, /\.packageLogo\s*\{[\s\S]*?object-fit:\s*contain;/)
})

test('Position Detail V2 related links, source semantics, and content boundaries remain explicit', () => {
  assert.match(positionNews, /href=\{`\/news\/\$\{encodeURIComponent\(item\.slug\)/)
  assert.match(positionNews, /อ่านข่าว/)
  assert.match(positionPackages, /href=\{`\/package\/\$\{encodeURIComponent\(item\.slug\)/)
  assert.match(positionPackages, /ดูรายละเอียด/)
  assert.match(positionArticles, /href=\{`\/articles\/\$\{encodeURIComponent\(item\.slug\)/)
  assert.match(positionArticles, /อ่านบทความ/)
  assert.match(positionSources, /target="_blank"/)
  assert.match(positionSources, /rel="noreferrer"/)
  assert.match(positionSources, /source\.label \|\| source\.url/)
  assert.match(positionSources, /ExternalLink[\s\S]*aria-hidden="true"/)
  assert.doesNotMatch(positionUiSource, /(?:หมวดหมู่ตำแหน่ง|ประเภทตำแหน่ง|position category)/i)
  assert.doesNotMatch(positionUiSource, /(?:กำลังเปิดรับสมัคร|เปิดรับสมัครอยู่|สถานะเปิดรับสมัคร|สมัครได้แล้ว)/)
  assert.doesNotMatch(positionUiSource, /(?:affiliate|โฆษณา|sponsored)/i)
  assert.doesNotMatch(positionUiSource, /^['"]use client['"]/m)
})

test('Position Detail V2 remains keyboard- and screen-reader-friendly without nav/footer scope creep', () => {
  assert.match(positionUiSource, /aria-hidden="true"/)
  assert.match(positionUiSource, /:focus-visible/)
  assert.doesNotMatch(positionUiSource, /<(?:a|Link)[^>]*>\s*<\/(?:a|Link)>/)

  const ids = [...positionUiSource.matchAll(/\bid="([^"]+)"/g)].map((match) => match[1])
  assert.equal(new Set(ids).size, ids.length, 'Position Detail source IDs must be unique')

  assert.doesNotMatch(navbar, /\/positions/)
  assert.doesNotMatch(desktopNav, /href:\s*['"]\/positions['"]|href="\/positions"/)
  assert.doesNotMatch(mobileNav, /href:\s*['"]\/positions['"]|href="\/positions"/)
  assert.doesNotMatch(footer, /href="\/positions"|href:\s*['"]\/positions['"]|ตำแหน่งงานราชการ/)
})
